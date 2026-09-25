# Publishing Service

Rule management microservice for the POC-Dynamic-Rules engine. This service handles CRUD operations for business rules, converts them to Drools Rule Language (DRL), validates compiled rules via Drools, stores them in MongoDB, and publishes updates to the Evaluation Service via Kafka.

## Overview

The Publishing Service is responsible for:
- Creating, updating, deleting, and querying business rules
- Enforcing tenant-level data isolation via JWT `appName` ownership
- Providing paginated rule retrieval with optional summary projections (`condition` & `action` omitted)
- Protecting the authentication endpoint against brute force and CPU exhaustion with in-memory token-bucket rate limiting
- Converting JSON rule conditions to DRL syntax
- Validating generated DRL against the Drools compiler with bounded Caffeine caching to avoid redundant recompilation
- Storing rule definitions in the MongoDB `rules` collection and compiled DRL in `rules_drl`
- Emitting Kafka events to notify the Evaluation Service of rule publications and unpublications

## Tech Stack

- **Java**: 25 (`maven.compiler.release: 25`)
- **Framework**: Quarkus 3.30.6
- **Rules Engine**: Drools 10.1.0
- **Rate Limiting**: Bucket4j 8.10.1 & Caffeine 3.1.8
- **Storage**: MongoDB (database: `belajar` or `drools`)
- **Messaging**: Apache Kafka
- **Security**: Stateless HMAC256 JWT, BCrypt client hashing
- **Build Tool**: Maven Wrapper (`mvnw`)
- **Other**: Lombok, Micrometer

## Prerequisites

- Java 25+ (e.g. `sdk use java 25.0.1-sapmchn` or `export JAVA_HOME=~/.sdkman/candidates/java/25.0.1-sapmchn`)
- Maven 3.9+ (or use `./mvnw`)
- MongoDB running on `localhost:27017`
- Kafka running on `localhost:9092`

## Configuration

Key properties in `application.properties`:

| Property                                      | Description                                              | Default                     |
|-----------------------------------------------|----------------------------------------------------------|-----------------------------|
| `quarkus.http.port`                           | HTTP server port                                         | `8080`                      |
| `quarkus.mongodb.connection-string`           | MongoDB connection string                                | `mongodb://localhost:27017` |
| `quarkus.mongodb.database`                    | MongoDB database name                                    | `belajar`                   |
| `drools.app.name`                             | Default tenant / application identifier                  | `drools-promotion`          |
| `my.kafka.topic`                              | Kafka topic for rule update notifications                | `rule-published`            |
| `messaging.kafka.enabled`                     | Enable Kafka publishing (`false` = Mongo-direct mode)    | `true`                      |
| `drools.token.expiration.time`                | Access token expiration time in seconds                  | `3600`                      |
| `drools.auth.rate-limit.capacity`             | Token bucket capacity for `/auth/token` per client IP   | `10`                        |
| `drools.auth.rate-limit.refill-tokens`        | Tokens refilled per refill duration                      | `10`                        |
| `drools.auth.rate-limit.refill-duration`      | Refill window duration                                   | `PT1M` (1 minute)           |
| `drools.cache.validated-drl.max-size`         | Max entries in Caffeine DRL validation cache             | `5000`                      |
| `drools.cache.validated-drl.expire-after-write`| Expiration window for cached validated DRL               | `PT24H`                     |

## AWS Secrets Manager as Config Source

This service loads runtime secrets (such as JWT signing secret, MongoDB credentials, and client seeds) from AWS Secrets Manager using Quarkus Secrets Manager extension.

Enable it with:
```properties
secretsmanager.flat.enabled=true
secretsmanager.flat.secret-name=qa/drools/publishing-service
secretsmanager.flat.region=ap-southeast-1
```

For local testing with LocalStack:
```properties
%dev.secretsmanager.flat.endpoint-override=http://localhost:4566
```

## Build & Run

### Development Mode
```bash
./mvnw quarkus:dev
```

### Package
```bash
./mvnw package
```

### Build Uber JAR
```bash
./mvnw package -Dquarkus.package.jar.type=uber-jar
```

### Run Tests
```bash
./mvnw test
```

## API Endpoints

### Endpoint Summary

| Method   | Path               | Auth Required | Description                                                    |
|----------|--------------------|---------------|----------------------------------------------------------------|
| `POST`   | `/auth/token`      | No            | Obtain stateless JWT access token (OAuth2 Client Credentials)  |
| `GET`    | `/rules`           | Bearer Token  | List rules with filters, pagination, and summary projection    |
| `POST`   | `/rules`           | Bearer Token  | Create a new rule                                              |
| `PUT`    | `/rules`           | Bearer Token  | Update existing rules (batch)                                  |
| `GET`    | `/rules/{id}`      | Bearer Token  | Get single rule by ID                                          |
| `DELETE` | `/rules/{id}`      | Bearer Token  | Delete rule by ID                                              |
| `POST`   | `/rules/publish`   | Bearer Token  | Publish rules (DRL generation, compilation, Kafka event)       |
| `POST`   | `/rules/unpublish` | Bearer Token  | Unpublish rules (removes DRL from MongoDB, Kafka event)        |

---

### Authentication & Authorization

All `/rules*` endpoints require a Bearer token in the `Authorization` header:
```http
Authorization: Bearer <access_token>
```

#### Multi-Tenant Ownership & Scoping
- Access tokens are issued per OAuth2 client. Each client is bound to a single tenant (`appName`) in MongoDB's `oauth_clients` collection.
- The JWT contains an `appName` claim.
- **Strict Tenant Isolation:** Every rule read, creation, modification, deletion, publication, or unpublication is strictly scoped to the authenticated token's `appName`.
- Cross-tenant queries return `404 Not Found` (`Rule not found`) — identical to non-existent IDs — ensuring the existence of another tenant's rules is never leaked.
- `POST /rules/publish` and `POST /rules/unpublish` are all-or-nothing: if any ID in the request belongs to another tenant or does not exist, the entire request is rejected with `404 Not Found``.

#### Rate Limiting on `/auth/token`
The `/auth/token` endpoint is guarded by an in-memory token-bucket filter (Bucket4j + Caffeine) keyed by client IP to prevent brute force attacks and BCrypt CPU exhaustion.
Every response from `/auth/token` includes rate-limit headers:
- `X-RateLimit-Limit`: Maximum bucket capacity
- `X-RateLimit-Remaining`: Remaining request tokens in the current window

---

### Request & Response Examples

#### 1. Get Access Token

Obtain a stateless JWT access token via OAuth2 Client Credentials.

**Request:**
```http
POST /auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=drools-promotion-client&client_secret=secret123
```

**cURL:**
```bash
curl -X POST http://localhost:8080/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=drools-promotion-client" \
  -d "client_secret=secret123"
```

**Success Response (`200 OK`):**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9

{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Error: Rate Limit Exceeded (`429 Too Many Requests`):**
```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 60
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0

{
  "error": "too_many_requests",
  "message": "Rate limit exceeded. Please retry after 60 seconds."
}
```

**Error: Invalid Client Credentials (`401 Unauthorized`):**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "invalid_client"
}
```

**Error: Unsupported Grant Type (`400 Bad Request`):**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "unsupported_grant_type"
}
```

**Error: Missing / Invalid Bearer Token on Protected Endpoints (`401 Unauthorized`):**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "errors": [
    {
      "type": "InvalidTokenError",
      "message": "Invalid or missing access token"
    }
  ]
}
```

---

#### 2. Get Rules (List with Pagination, Projection & Filters)

Lists rules belonging to the authenticated tenant. Supports pagination parameters and summary projection.

```http
GET /rules?page=0&size=20&summary=false
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter           | Type                | Default | Description                                                                |
|---------------------|---------------------|---------|----------------------------------------------------------------------------|
| `page`              | integer             | `0`     | Zero-based page index                                                      |
| `size`              | integer             | `20`    | Number of rules per page (max `100`)                                       |
| `summary`           | boolean             | `false` | When `true`, excludes heavy `condition` and `action` fields for fast listing|
| `object`            | string (repeatable) | -       | Filter rules by fact object name (e.g. `?object=Customer&object=Cart`)    |
| `published`         | boolean             | -       | Filter by published status (`true`/`false`)                                |
| `hasPendingChanges` | boolean             | -       | Filter by pending changes status (`true`/`false`)                          |

> **Note:** `appName` is **never** accepted as a query parameter. It is automatically derived from the authenticated JWT token.

**Pagination Response Headers:**

All `GET /rules` responses include metadata headers:
- `X-Total-Count`: Total number of rules matching the query
- `X-Total-Pages`: Total number of pages available
- `X-Page-Number`: Current page index (0-based)
- `X-Page-Size`: Effective page size

**Success Response - Full View (`summary=false`):**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Total-Count: 42
X-Total-Pages: 3
X-Page-Number: 0
X-Page-Size: 20

{
  "message": "success",
  "data": [
    {
      "id": 100001,
      "condition": {
        "object": "Customer",
        "attribute": "membershipLevel",
        "operator": "IN",
        "value": ["GOLD", "PLATINUM"]
      },
      "action": {
        "discount": 15,
        "message": "Premium member discount"
      },
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-12-31T23:59:59Z",
      "objects": ["Customer"],
      "appName": "drools-promotion",
      "published": true,
      "hasPendingChanges": false
    }
  ]
}
```

**Success Response - Summary View (`summary=true`):**
Returns lightweight metadata without loading large condition and action JSON structures:
```http
GET /rules?summary=true&page=0&size=20
Authorization: Bearer <token>
```
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Total-Count: 42
X-Total-Pages: 3
X-Page-Number: 0
X-Page-Size: 20

{
  "message": "success",
  "data": [
    {
      "id": 100001,
      "startDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-12-31T23:59:59Z",
      "objects": ["Customer"],
      "appName": "drools-promotion",
      "published": true,
      "hasPendingChanges": false
    }
  ]
}
```

---

#### 3. Get Rule by ID

Retrieves a single rule by its unique ID. Returns `404` if not found or if the rule belongs to another tenant.

**Request:**
```http
GET /rules/100001
Authorization: Bearer <token>
```

**Success Response (`200 OK`):**
```json
{
  "message": "success",
  "data": {
    "id": 100001,
    "condition": {
      "object": "Customer",
      "attribute": "age",
      "operator": "MORE_THAN_OR_EQUAL",
      "value": 18
    },
    "action": {
      "eligible": true,
      "message": "Adult customer eligible"
    },
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-12-31T23:59:59Z",
    "objects": ["Customer"],
    "appName": "drools-promotion",
    "published": false,
    "hasPendingChanges": false
  }
}
```

**Error: Rule Not Found / Unauthorized App (`404 Not Found`):**
```json
{\n  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"Rule not found\"
    }
  ]
}
```

**Error: Invalid ID (`400 Bad Request`):**
```json
{\n  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"Invalid rule ID\"
    }
  ]
}
```

---

#### 4. Create Rule

Creates a new business rule. The rule ID is automatically generated from the MongoDB `counters` collection sequence.

> **Important:** `startDate` and `endDate` must be formatted as **ISO-8601 UTC** strings (e.g. `2024-01-01T00:00:00Z`).

**Request:**
```http
POST /rules
Authorization: Bearer <token>
Content-Type: application/json

{
  \"condition\": {
    \"object\": \"Customer\",
    \"attribute\": \"membershipLevel\",
    \"operator\": \"IN\",
    \"value\": [\"GOLD\", \"PLATINUM\"]
  },
  \"action\": {
    \"discount\": 10,
    \"message\": \"Special tier discount\"
  },
  \"startDate\": \"2024-01-01T00:00:00Z\",
  \"endDate\": \"2024-12-31T23:59:59Z\"
}
```

**Success Response (`201 Created`):**
```json
{
  \"message\": \"success\",
  \"data\": 100002
}
```

**Error: Validation Failed (`400 Bad Request`):**
```json
{
  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"Condition is required\"
    }
  ]
}
```

---

#### 5. Update Rules (Batch)

Updates one or more existing rules. Accepts a JSON array. Each element **must** include a valid `id`.
If an updated rule was previously published, updating it automatically sets `hasPendingChanges: true`.

**Request:**
```http
PUT /rules
Authorization: Bearer <token>
Content-Type: application/json

[
  {
    \"id\": 100001,
    \"condition\": {
      \"object\": \"Customer\",
      \"attribute\": \"age\",
      \"operator\": \"MORE_THAN_OR_EQUAL\",
      \"value\": 21
    },
    \"action\": {
      \"eligible\": true,
      \"message\": \"Adult 21+ customer eligible\"
    },
    \"startDate\": \"2024-01-01T00:00:00Z\",
    \"endDate\": \"2024-12-31T23:59:59Z\"
  }
]
```

**Success Response (`200 OK`):**
```json
{
  \"message\": \"success\"
}
```

**Error: Missing Rule ID (`400 Bad Request`):**
```json
{
  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"Rule ID is required for update. Missing at index: [0]\"
    }
  ]
}
```

**Error: Rule Not Found / Owned by Other App (`404 Not Found`):**
```json
{
  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"Rule not found with id: 100001\"
    }
  ]
}
```

---

#### 6. Delete Rule

Deletes a rule by ID. If the rule was published, its compiled DRL is also removed from `rules_drl`, its cache entry is invalidated, and a Kafka notification is emitted.

**Request:**
```http
DELETE /rules/100001
Authorization: Bearer <token>
```

**Success Response (`200 OK`):**
```json
{
  \"message\": \"success\"
}
```

**Error: Not Found / Owned by Other App (`404 Not Found`):**
```json
{
  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"Rule not found\"
    }
  ]
}
```

---

#### 7. Publish Rules

Compiles JSON conditions to DRL, validates them using the Drools compiler (cached in Caffeine), stores the generated DRL in the MongoDB `rules_drl` collection, sets `published: true` and `hasPendingChanges: false`, and notifies the Evaluation Service via Kafka.

> **Atomic / All-or-Nothing:** If any ID does not exist or belongs to another tenant, nothing is published and `404 Not Found` is returned.

**Request:**
```http
POST /rules/publish
Authorization: Bearer <token>
Content-Type: application/json

[
  { \"id\": 100001 },
  { \"id\": 100002 }
]
```

**Success Response (`200 OK`):**
```json
{
  \"message\": \"success\"
}
```

**Error: Missing / Foreign Rule IDs (`404 Not Found`):**
```json
{
  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"Rule not found with id(s): [999999]\"
    }
  ]
}
```

**Error: DRL Compilation Failure (`400 Bad Request`):**
```json
{
  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"DRL validation failed: [ERR 102] Line 12: mismatched input...\"
    }
  ]
}
```

---

#### 8. Unpublish Rules

Removes compiled DRL entries from MongoDB's `rules_drl` collection, evicts validation cache entries, marks rules as `published: false`, and sends a Kafka notification so the Evaluation Service hot-unloads them.

**Request:**
```http
POST /rules/unpublish
Authorization: Bearer <token>
Content-Type: application/json

[
  { \"id\": 100001 }
]
```

**Success Response (`200 OK`):**
```json
{
  \"message\": \"success\"
}
```

**Error: Unowned or Missing Rule ID (`404 Not Found`):**
```json
{
  \"message\": \"error\",
  \"errors\": [
    {
      \"type\": \"validation\",
      \"message\": \"Rule not found with id(s): [100001]\"
    }
  ]
}
```

---

## Data Models

### Rules Entity

```json
{
  \"id\": 100001,
  \"condition\": {
    \"operator\": \"AND\",
    \"children\": [\n      {
        \"object\": \"Customer\",
        \"attribute\": \"age\",
        \"operator\": \"MORE_THAN_OR_EQUAL\",
        \"value\": 18
      }
    ]
  },
  \"action\": {
    \"discount\": 10,
    \"message\": \"Eligible for adult discount\"
  },
  \"startDate\": \"2024-01-01T00:00:00Z\",
  \"endDate\": \"2024-12-31T23:59:59Z\",
  \"objects\": [\"Customer\"],
  \"appName\": \"drools-promotion\",
  \"published\": false,
  \"hasPendingChanges\": false
}
```

### Rules Field Reference

| Field               | Type            | Required | Description                                                         |
|---------------------|-----------------|----------|---------------------------------------------------------------------|
| `id`                | Long            | No (PUT) | Unique rule identifier. Auto-generated on POST; required on PUT.    |
| `condition`         | `RuleCondition` | Yes      | Recursive tree defining the rule's match condition                  |
| `action`            | `JsonNode`      | Yes      | Action payload returned when rule fires (JSON object or array)      |
| `startDate`         | String          | No       | ISO-8601 UTC validity start timestamp (e.g. `2024-01-01T00:00:00Z`)  |
| `endDate`           | String          | No       | ISO-8601 UTC validity end timestamp (e.g. `2024-12-31T23:59:59Z`)    |
| `objects`           | Set\\<String\\>   | Auto     | Object names extracted from conditions (managed automatically)      |
| `appName`           | String          | Auto     | Tenant identifier automatically set from the authenticated JWT token|
| `published`         | Boolean         | Auto     | Current publication status (`true`/`false`)                         |
| `hasPendingChanges` | Boolean         | Auto     | Flag set to `true` when a published rule is updated before re-publish|

### Rule State Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RULE STATE TRANSITIONS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CREATE (v1)          PUBLISH (v1)         UPDATE (v2)        PUBLISH (v2)  │
│      │                    │                    │                    │       │
│      ▼                    ▼                    ▼                    ▼       │
│  ┌────────┐          ┌────────┐          ┌────────┐          ┌────────┐     │
│  │published│   ───►  │published│   ───►  │published│   ───►  │published│     │
│  │ =false │          │ =true  │          │ =true  │          │ =true  │     │
│  │pending │          │pending │          │pending │          │pending │     │
│  │ =false │          │ =false │          │ =true  │          │ =false │     │
│  └────────┘          └────────┘          └────────┘          └────────┘     │
│                                               │                             │
│                                               │  UNPUBLISH                  │
│                                               ▼                             │
│                                          ┌────────┐                         │
│                                          │published│                        │
│                                          │ =false │                         │
│                                          │pending │                         │
│                                          │ =false │                         │
│                                          └────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Supported Operators

| Category                  | Operators                                                                                 |
|---------------------------|-------------------------------------------------------------------------------------------|
| **Logical**               | `AND`, `OR`                                                                               |
| **Equality**              | `EQUAL`, `NOT_EQUAL`, `OBJECT_EQUALS`, `EQUALS_IGNORE_CASE`                               |
| **Comparison**            | `MORE_THAN`, `LESS_THAN`, `MORE_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`                      |
| **Collection**            | `IN`, `NOT_IN`                                                                            |
| **Null & Empty**          | `NULL`, `NOT_NULL`, `EMPTY`, `NOT_EMPTY`                                                  |
| **String (Exact)**        | `CONTAINS`, `NOT_CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `MATCHES`, `NOT_MATCHES`          |
| **String (Ignore Case)**  | `CONTAINS_IGNORE_CASE`, `NOT_CONTAINS_IGNORE_CASE`, `STARTS_WITH_IGNORE_CASE`, `ENDS_WITH_IGNORE_CASE` |
| **Type Check**            | `NUMERIC`, `NOT_NUMERIC`, `TRUE`, `NOT_TRUE`                                              |
| **Validation**            | `VALID_EMAIL`, `NOT_VALID_EMAIL`, `VALID_DATE`, `VALID_DATE_TIME`, `NOT_VALID_DATE_TIME`  |

---

## Condition Patterns & Examples

### 1. Simple Equality / Comparison
```json
{
  \"condition\": {
    \"object\": \"Customer\",
    \"attribute\": \"age\",
    \"operator\": \"MORE_THAN_OR_EQUAL\",
    \"value\": 18
  },
  \"action\": {
    \"eligible\": true
  },
  \"startDate\": \"2024-01-01T00:00:00Z\",
  \"endDate\": \"2024-12-31T23:59:59Z\"
}
```

### 2. Collection IN / NOT_IN
```json
{
  \"condition\": {
    \"object\": \"Customer\",
    \"attribute\": \"membershipLevel\",
    \"operator\": \"IN\",
    \"value\": [\"GOLD\", \"PLATINUM\", \"DIAMOND\"]
  },
  \"action\": {
    \"discount\": 15
  },
  \"startDate\": \"2024-01-01T00:00:00Z\",
  \"endDate\": \"2024-12-31T23:59:59Z\"
}
```

### 3. Nested Logical Groups (AND / OR)
```json
{
  \"condition\": {
    \"operator\": \"AND\",
    \"children\": [\n      {\n        \"operator\": \"OR\",\n        \"children\": [\n          { \"object\": \"Customer\", \"attribute\": \"membershipLevel\", \"operator\": \"IN\", \"value\": [\"GOLD\", \"PLATINUM\"] },\n          { \"object\": \"Transaction\", \"attribute\": \"totalAmount\", \"operator\": \"MORE_THAN_OR_EQUAL\", \"value\": 1000000 }\n        ]\n      },\n      {\n        \"object\": \"Customer\",\n        \"attribute\": \"status\",\n        \"operator\": \"NOT_IN\",\n        \"value\": [\"SUSPENDED\", \"INACTIVE\"]\n      }\n    ]\n  },\n  \"action\": {\n    \"promoDiscount\": 20\n  },\n  \"startDate\": \"2024-01-01T00:00:00Z\",\n  \"endDate\": \"2024-12-31T23:59:59Z\"\n}\n```\n\n### 4. List Attributes (`[]` = ALL Match, `[?]` = ANY Match)\n- `attribute[]` — Checks that **ALL** elements in a list satisfy the condition.\n- `attribute[?]` — Checks that **AT LEAST ONE** element in a list satisfies the condition.\n\n```json\n{\n  \"condition\": {\n    \"operator\": \"AND\",\n    \"children\": [\n      {\n        \"object\": \"Cart\",\n        \"attribute\": \"items[].price\",\n        \"operator\": \"MORE_THAN\",\n        \"value\": 0\n      },\n      {\n        \"object\": \"Cart\",\n        \"attribute\": \"items[?].category\",\n        \"operator\": \"EQUAL\",\n        \"value\": \"Electronics\"\n      }\n    ]\n  },\n  \"action\": {\n    \"techBonus\": 500\n  },\n  \"startDate\": \"2024-01-01T00:00:00Z\",\n  \"endDate\": \"2024-12-31T23:59:59Z\"\n}\n```\n\n### 5. Multi-Wildcard Nested Path Evaluation\nEvaluates deeply nested collections using `RuleUtils.checkPath`:\n```json\n{\n  \"condition\": {\n    \"object\": \"Order\",\n    \"attribute\": \"products[?].options[?].price\",\n    \"operator\": \"MORE_THAN\",\n    \"value\": 50000\n  },\n  \"action\": {\n    \"premiumOptionPromo\": true\n  },\n  \"startDate\": \"2024-01-01T00:00:00Z\",\n  \"endDate\": \"2024-12-31T23:59:59Z\"\n}\n```\n\n---\n\n## Health & Metrics\n\n- **Health Check**: `GET /q/health`\n- **Liveness**: `GET /q/health/live`\n- **Readiness**: `GET /q/health/ready`\n- **Micrometer Metrics**: `GET /q/metrics`\n  - `drools_publish_total`: Counter for publish operations\n  - `drools_publish_duration_seconds`: Timer for publish duration\n  - `drools_unpublish_total`: Counter for unpublish operations\n  - `drools_unpublish_duration_seconds`: Timer for unpublish duration\n\n---\n\n## Related Services\n\n- [Evaluation Service](../evaluation-service/README.md) — Runtime fact evaluation and Drools execution\n