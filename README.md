# ⚡ Dynamic Rules — Publishing Console Frontend

Frontend admin console untuk **Dynamic-Rules**, dibangun dengan Next.js 14, Tailwind CSS, dan shadcn/ui. Terhubung ke **Publishing Service** (port 8080) dan **Evaluation Service** (port 8081) yang ditenagai Quarkus + Drools.

---

## 📋 Daftar Isi

- [Tech Stack](#-tech-stack)
- [Fitur](#-fitur)
- [Struktur Proyek](#-struktur-proyek)
- [Prasyarat](#-prasyarat)
- [Instalasi & Menjalankan](#-instalasi--menjalankan)
- [Konfigurasi](#-konfigurasi)
- [Penggunaan](#-penggunaan)
- [API Reference](#-api-reference)
- [Object & Attribute Config](#-object--attribute-config)

---

## 🛠 Tech Stack

| Teknologi | Versi | Keterangan |
|---|---|---|
| Next.js | 14 | App Router, Client Components |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Utility-first styling |
| shadcn/ui | latest | Komponen UI |
| Zustand | latest | State management (auth) |
| Axios | latest | HTTP client |
| @dnd-kit | latest | Drag & drop visual builder |
| next-themes | latest | Dark/light mode |
| Sonner | latest | Toast notifications |

---

## ✨ Fitur

### 📊 Dashboard
- Ringkasan statistik rules (total, published, draft, pending changes)
- Rasio published dalam bentuk progress bar
- Breakdown rules per App dan per Operator
- Tabel 5 rule terbaru

### 📋 Manajemen Rules
- Daftar rules dengan tabel fixed-column layout
- **Filter** berdasarkan appName, object, salesOps, status published, dan pending changes
- **Pencarian** real-time
- **Pagination** client-side (10 data per halaman)
- **Bulk publish/unpublish** dengan checkbox multi-select
- **Publish / Unpublish** per rule
- **Hapus** rule dengan konfirmasi dialog
- **View** detail rule (read-only)
- **Edit** rule yang sudah ada

### 🔧 Rule Builder
Tersedia 3 mode dalam satu halaman:

#### Mode Builder (Manual)
- Visual condition tree editor dengan node AND/OR yang bisa di-nest
- Operator dikelompokkan: Equality, Comparison, Collection, String, Null/Empty, Validation
- Section **Action (THEN)** dengan form key-value atau JSON manual
- Switch antara mode Form dan JSON
- Section **Periode Berlaku** (startDate, endDate)

#### Mode Visual (Drag & Drop)
- **Object Library** dan **Action Library** dalam panel dropdown collapsible di kiri
- Drag attribute dari library ke canvas kondisi
- Canvas kondisi mendukung sub-group AND/OR
- Canvas action dengan drop zone dan tambah manual
- Value action bisa dikonfigurasi sesuai tipe (string, number, boolean)

#### Mode Preview JSON
- Preview payload JSON yang akan dikirim ke backend secara real-time

### ⚡ Test Evaluasi
- **Form Builder**: date picker + dynamic fact attributes (object + key-value)
- **JSON Manual**: input payload langsung
- Hasil evaluasi menampilkan match/no-match dan daftar actions
- **Save & Load Preset** ke localStorage untuk reuse test case

### 🎨 Tampilan
- Dark mode / Light mode toggle di sidebar
- Responsive layout
- Toast notification untuk semua aksi (publish, unpublish, hapus, simpan, evaluasi)

---

## 📁 Struktur Proyek

```
dynamic-rules-fe/
├── app/
│   ├── layout.tsx              # Root layout + AuthProvider + ThemeProvider
│   ├── page.tsx                # Redirect ke dashboard / login
│   ├── globals.css             # Global styles + Tailwind v4
│   ├── dashboard/
│   │   └── page.tsx            # Halaman dashboard
│   ├── login/
│   │   └── page.tsx            # Halaman login
│   ├── rules/
│   │   ├── page.tsx            # Daftar rules
│   │   └── builder/
│   │       └── page.tsx        # Rule builder (create & edit)
│   └── evaluate/
│       └── page.tsx            # Test evaluasi
├── components/
│   ├── AuthProvider.tsx        # Client-side auth init dari localStorage
│   ├── Sidebar.tsx             # Navigasi sidebar + dark mode toggle
│   ├── RuleConditionNode.tsx   # Recursive condition tree component
│   └── VisualRuleBuilder.tsx   # Drag & drop visual rule builder
├── lib/
│   ├── api.ts                  # Semua fungsi API (publishing + evaluation)
│   ├── store.ts                # Zustand auth store (SSR-safe)
│   └── objects.ts              # Konfigurasi object & attribute definitions
└── public/
```

---

## ✅ Prasyarat

- Node.js >= 18
- npm atau yarn
- Backend services berjalan:
  - Publishing Service → `http://localhost:8080`
  - Evaluation Service → `http://localhost:8081`

---

## 🚀 Instalasi & Menjalankan

### 1. Clone repository

```bash
git clone https://github.com/USERNAME/dynamic-rules-fe.git
cd dynamic-rules-fe
```

### 2. Install dependencies

```bash
npm install
```

### 3. Jalankan development server

```bash
npm run dev
```

Akses di browser: [http://localhost:3000](http://localhost:3000)

### 4. Build untuk production

```bash
npm run build
npm start
```

---

## ⚙️ Konfigurasi

URL backend dikonfigurasi di `lib/api.ts`:

```typescript
// Publishing Service
const publishingApi = axios.create({
  baseURL: "http://localhost:8080",
});

// Evaluation Service
const evaluationApi = axios.create({
  baseURL: "http://localhost:8081",
});
```

Ubah `baseURL` sesuai environment yang digunakan.

---

## 📖 Penggunaan

### Login
Gunakan **Client Credentials** dari backend:
- **Client ID**: sesuai konfigurasi backend
- **Client Secret**: sesuai konfigurasi backend

Token JWT akan disimpan di `localStorage` dan otomatis dikirim di setiap request sebagai `Bearer token`.

### Membuat Rule Baru

**Via Builder Manual:**
1. Klik **"➕ Buat Rule"** di sidebar
2. Beri nama rule
3. Tambahkan kondisi (IF) dengan klik **"+ Kondisi"** atau **"+ Group"**
4. Pilih object, attribute, operator, dan value
5. Isi Action (THEN) via form key-value atau JSON
6. Set periode berlaku (opsional)
7. Klik **"Simpan Rule"**

**Via Visual Builder:**
1. Klik tab **"🎨 Visual"**
2. Buka **Object Library** di panel kiri
3. Drag attribute ke canvas kondisi
4. Buka **Action Library**, drag action ke canvas action
5. Isi value kondisi dan action
6. Klik **"Simpan Rule"**

### Publish / Unpublish Rule
- Klik tombol **"Publish"** / **"Unpublish"** di kolom Aksi pada tabel rules
- Untuk multiple rules: centang checkbox → klik **"✅ Publish"** atau **"⏸ Unpublish"** di bulk action bar

### Test Evaluasi
1. Buka menu **"⚡ Test Evaluasi"**
2. Pilih tab **Form Builder** atau **JSON Manual**
3. Isi tanggal dan fact attributes
4. Klik **"Evaluasi"**
5. Simpan sebagai preset untuk dipakai kembali

---

## 🔌 API Reference

### Publishing Service (`:8080`)

| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/auth/token` | Login (form-urlencoded) |
| GET | `/rules` | List rules (support filter params) |
| GET | `/rules/:id` | Get rule by ID |
| POST | `/rules` | Create rules (array) |
| PUT | `/rules` | Update rules (array dengan id) |
| DELETE | `/rules/:id` | Hapus rule |
| POST | `/rules/publish` | Publish rules → body: `[{ id }]` |
| POST | `/rules/unpublish` | Unpublish rules → body: `[{ id }]` |

**Filter params GET /rules:**
```
?appName=&object=&salesOps=&published=true|false&hasPendingChanges=true|false
```

### Evaluation Service (`:8081`)

| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/rules/check` | Evaluasi fact terhadap rules aktif |

**Request body `/rules/check`:**
```json
{
  "date": "dd-MM-yyyy HH:mm:ss",
  "factAttributes": [
    {
      "object": "Customer",
      "attributes": {
        "membershipLevel": "GOLD",
        "status": "ACTIVE"
      }
    }
  ]
}
```

---

## 🧩 Object & Attribute Config

Daftar object dan attribute yang tersedia di Visual Builder dikonfigurasi di `lib/objects.ts`:

| Object | Attributes | Tipe |
|---|---|---|
| **Customer** | membershipLevel, status, region | string |
| **Customer** | age | number |
| **Customer** | email | string |
| **Cart** | total, itemCount | number |
| **Cart** | coupon | string |
| **Branch** | name, region, code | string |

Untuk menambah object atau attribute baru, edit array `OBJECT_DEFINITIONS` di `lib/objects.ts`.

---

## 📝 Catatan

- Rules yang sudah di-publish tetap bisa diedit dan di-publish ulang
- Pagination dilakukan di frontend (backend belum support)
- Preset evaluasi disimpan di `localStorage` browser
- Dark mode preference disimpan oleh `next-themes` secara otomatis