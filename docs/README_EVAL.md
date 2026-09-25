# Evaluation Service

Rule execution microservice for the POC-Dynamic-Rules engine. This service evaluates facts against business rules using the Drools rule engine at runtime.

## Overview

The Evaluation Service is responsible for:
- Loading DRL content from the MongoDB `rules_drl` collection lazily per tenant (`appName`)
- Listening for rule updates via Kafka (`DroolsKafkaConsumer`) or MongoDB change polling (`RuleFileWatcher`) and hot-reloading rules
- Executing atomic per-tenant pointer swaps of the `KieContainer` to ensure sub-millisecond, non-blocking rule evaluations
- Evaluating incoming facts against loaded rules
- Returning matched rule actions in a standardized `ApiResponse` envelope

## Tech Stack

- **Java**: 25 (`maven.compiler.release: 25`)
- **Framework**: Quarkus 3.30.6
- **Rules Engine**: Drools 10.1.0
- **Rate Limiting**: Bucket4j 8.10.1 & Caffeine 3.1.8
- **Storage**: MongoDB
- **Messaging**: Apache Kafka
- **Security**: Stateless HMAC256 JWT, BCrypt client hashing
- **Build Tool**: Maven Wrapper (`mvnw`)
- **Other**: Lombok, Micrometer

## Prerequisites

- Java 25+ (e.g. `sdk use java 25.0.1-sapmchn` or `export JAVA_HOME=~/.sdkman/candidates/java/25.0.1-sapmchn`)
- Maven 3.9+ (or use `./mvnw`)
- Kafka running on `localhost:9092`
- MongoDB running on `localhost:27017`

## Configuration

Key properties in `application.properties`:

| Property                                      | Description                                              | Default                     |
|-----------------------------------------------|----------------------------------------------------------|-----------------------------|
| `quarkus.http.port`                           | HTTP server port                                         | `8081`                      |
| `quarkus.mongodb.database`                    | MongoDB database (DRL rules)                             | `belajar`                   |
| `drools.app.name`                             | Default application/tenant identifier                    | `drools-promotion`          |
| `my.kafka.topic`                              | Kafka topic for rule updates                             | `rule-published`            |
| `messaging.kafka.enabled`                     | Enable Kafka consumer (`false` = Mongo-direct mode)      | `true`                      |
| `drools.rules.poll.interval-ms`               | Polling interval for Mongo-direct watcher                | `5000`                      |
| `drools.auth.rate-limit.capacity`             | Token bucket capacity for `/auth/token` per client IP   | `10`                        |
| `drools.auth.rate-limit.refill-tokens`        | Tokens refilled per refill duration                      | `10`                        |
| `drools.auth.rate-limit.refill-duration`      | Refill window duration                                   | `PT1M` (1 minute)           |

## AWS Secrets Manager as Config Source

This service loads runtime configuration from AWS Secrets Manager using the `io.quarkiverse.amazonservices:quarkus-amazon-secretsmanager` extension's config source.

A custom `ConfigSourceFactory` fetches the secret directly via `SecretsManagerClient` and exposes JSON keys **as-is**, with no prefix. See `AwsSecretsManagerFlatConfigSourceFactory`.

Enable it with:
```properties
secretsmanager.flat.enabled=true
secretsmanager.flat.secret-name=qa/drools/evaluation-service
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

### Run Tests
```bash
./mvnw test
```

## API Endpoints

### Endpoint Summary

| Method   | Path                 | Auth Required | Description                                                    |
|----------|----------------------|---------------|----------------------------------------------------------------|
| `POST`   | `/auth/token`        | No            | Obtain stateless JWT access token (or `/eval/auth/token`)      |
| `POST`   | `/rules/check`       | Bearer Token  | Evaluate facts against loaded rules (or `/eval/rules/check`)   |
| `POST`   | `/rules/reload`      | Bearer Token  | Manually reload DRL from MongoDB `rules_drl`                   |

> **Note on Root Path:** In the local profile (`application-local.properties`), `quarkus.http.root-path=/eval`, so endpoints are prefixed with `/eval` (e.g. `http://localhost:8081/eval/rules/check`). Without the prefix, they are served at root `/`.

---

### Authentication

All rule evaluation and reload endpoints require a Bearer token in the `Authorization` header:
```http
Authorization: Bearer <token>
```

#### Get Access Token
```http
POST /auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=drools-promotion-client&client_secret=secret123
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

**Rate Limited (`429 Too Many Requests`):**
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

**Authentication Error Response (`401 Unauthorized` on protected endpoints):**
```json
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

### Rule Evaluation (`POST /rules/check`)

Evaluates facts against business rules loaded for the authenticated tenant (`appName`).

> **Format Requirements:**
> - `date`: Must be in format `dd-MM-yyyy HH:mm:ss` (e.g. `"15-06-2024 10:30:00"`).
> - `factAttributes`: List of fact items. Each item must specify `object` (alphanumeric name matching rule object) and `attributes` map.

**Request:**
```http
POST /rules/check
Authorization: Bearer <token>
Content-Type: application/json

{
  "date": "15-06-2024 10:30:00",
  "factAttributes": [
    {
      "object": "Customer",
      "attributes": {
        "age": 25,
        "membershipLevel": "GOLD",
        "totalPurchases": 5000
      }
    },
    {
      "object": "Transaction",
      "attributes": {
        "amount": 150000,
        "category": "Electronics"
      }
    }
  ]
}
```

**Response (with matching rules):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "success",
  "data": {
    "actions": [
      {
        "discount": 10,
        "message": "Gold member discount applied"
      },
      {
        "bonusPoints": 500,
        "message": "Electronics purchase bonus"
      }
    ]
  }
}
```

**Response (no matching rules):**
```json
{
  "message": "success",
  "data": {
    "actions": []
  }
}
```

---

### Manual Rule Reload (`POST /rules/reload`)

Manually forces recompilation and reloading of DRL content from MongoDB `rules_drl` for the tenant specified in the token.

**Request:**
```http
POST /rules/reload
Authorization: Bearer <token>
```

**Response (`200 OK`):**
```json
{
  "message": "Rules reloaded successfully"
}
```

---

## Data Models

### RequestObject
```json
{
  "date": "15-06-2024 10:30:00",
  "factAttributes": [
    {
      "object": "Customer",
      "attributes": {
        "key1": "value1",
        "key2": 123
      }
    }
  ]
}
```

### FactAttribute
```json
{
  "object": "Customer",
  "attributes": {
    "age": 25,
    "membershipLevel": "GOLD",
    "email": "user@example.com"
  }
}
```

The `object` field matches the `object` field defined in rule conditions. The `attributes` map contains key-value pairs evaluated against rule conditions.

---

## Evaluation Examples with List Attributes

### 1. `IN` Operator Match
For a rule with `membershipLevel IN ["GOLD", "PLATINUM", "DIAMOND"]`:

```json
{
  "date": "15-06-2024 10:30:00",
  "factAttributes": [
    {
      "object": "Customer",
      "attributes": {
        "membershipLevel": "GOLD"
      }
    }
  ]
}
```

### 2. Flat List Attribute with ALL Match (`emails[]`)
For a rule checking `Customer.emails[]` with `VALID_EMAIL` operator:

```json
{
  "date": "15-06-2024 10:30:00",
  "factAttributes": [
    {
      "object": "Customer",
      "attributes": {
        "emails": [
          "user1@example.com",
          "user2@example.com",
          "user3@example.com"
        ]
      }
    }
  ]
}
```

### 3. List of Objects with ALL Match (`items[].price`)
For a rule checking `Cart.items[].price` with `MORE_THAN` operator and value `0`:

```json
{
  "date": "15-06-2024 10:30:00",
  "factAttributes": [
    {
      "object": "Cart",
      "attributes": {
        "items": [
          { "name": "Laptop", "price": 15000000, "category": "Electronics" },
          { "name": "T-Shirt", "price": 250000, "category": "Fashion" }
        ]
      }
    }
  ]
}
```

### 4. ANY Match (`addresses[?].city`)
When rules use `[?]` notation, the condition succeeds if **at least one item** matches:

```json
{
  "date": "15-06-2024 10:30:00",
  "factAttributes": [
    {
      "object": "Customer",
      "attributes": {
        "name": "John Doe",
        "addresses": [
          { "city": "Surabaya", "type": "home" },
          { "city": "Jakarta", "type": "office" }
        ]
      }
    }
  ]
}
```

---

## Multi-Object Evaluation

When sending multiple facts with the same `object` type, they are automatically grouped into an array internally:

```json
{
  "date": "15-06-2024 10:00:00",
  "factAttributes": [
    { "object": "product", "attributes": { "price": 100, "category": "Fashion" } },
    { "object": "product", "attributes": { "price": 200, "category": "Electronics" } },
    { "object": "customer", "attributes": { "membershipLevel": "GOLD" } }
  ]
}
```

Internal representation:
```json
{
  "product": [
    { "price": 100, "category": "Fashion" },
    { "price": 200, "category": "Electronics" }
  ],
  "customer": { "membershipLevel": "GOLD" }
}
```

You can also use the `[]` suffix explicitly: `{ "object": "product[]", "attributes": { "price": 100 } }`.

---

## Health & Metrics

- **Health Check**: `GET /q/health`
- **Liveness**: `GET /q/health/live`
- **Readiness**: `GET /q/health/ready`
- **Metrics**: `GET /q/metrics`
  - `drools_rules_loaded`: Gauge tracking loaded rules per tenant (tagged with `appName`)
  - `drools_evaluation_total`: Counter for evaluated requests
  - `drools_evaluation_duration_seconds`: Timer for evaluation duration

---

## Related Services

- [Publishing Service](../publishing-service/README.md) — Manages and publishes rules
