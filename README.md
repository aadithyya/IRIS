# IRIS — Lossless File Compressor

IRIS is a reliable, high-performance web-based lossless file compressor powered by Go and Zstandard level 3.

---

## Features

- **Lossless Zstandard Compression:** Uses standard Zstandard level 3 (`github.com/klauspost/compress/zstd`) preserving byte-for-byte fidelity.
- **Streaming I/O:** Compresses directly from the incoming multipart stream without buffering entire files in RAM.
- **Embedded Static Assets:** Single binary with all HTML, CSS, and JS embedded via Go's `embed` package—no Node.js or external dev servers needed.
- **Accurate Progress Tracking:** Real upload percentage via `XMLHttpRequest` upload progress, animated circular gauge, upload success checkmark, and compression spinner.
- **Precise Metrics:** Reports exact original size, compressed size, and space reduction percentage calculated directly from backend headers.
- **Resource Protection:** Concurrency limiter, upload size cap (default 500 MB), and guaranteed temporary file cleanup on every request.

---

## Getting Started

### Prerequisites

- Go 1.22+ (tested on Go 1.27)

### Build & Run

1. Clone or open the repository:
   ```bash
   cd /path/to/IRIS
   ```

2. Run directly with Go:
   ```bash
   go run ./cmd/iris
   ```
   Or build a standalone binary:
   ```bash
   go build -o bin/iris ./cmd/iris
   ./bin/iris -port 8080
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

### Optional Command Flags

| Flag | Default | Description |
|---|---|---|
| `-port` | `8080` | HTTP port to listen on |
| `-max-upload-mb` | `500` | Maximum allowed file upload size in MB |

---

## Clerk authentication

IRIS uses Clerk's browser-based JavaScript SDK for its sign-in and sign-up pages. React and a Node.js server are not required.

### Configure the existing Clerk application

The Go server reads only `CLERK_PUBLISHABLE_KEY` and exposes it through `GET /api/clerk-config`. This is a frontend publishable key (`pk_test_...` or `pk_live_...`), not a secret key.

1. In the Clerk Dashboard, open the existing IRIS application and copy its **Publishable Key**.
2. Set it in the same terminal session used to run IRIS:
   ```bash
   export CLERK_PUBLISHABLE_KEY="pk_test_YOUR_PUBLISHABLE_KEY"
   go run ./cmd/iris
   ```
   Replace the example value with the real publishable key. Do not paste keys into GitHub issues, source code, or chat.
3. Visit `http://localhost:8080/login.html` or `http://localhost:8080/signup.html`.

If you need to link the Clerk CLI to the existing dashboard application, authenticate first, then use the selected application ID:

```bash
npx -y clerk@latest auth login
npx -y clerk@latest link --app app_3LETPkHj6vOkD2BvEfHQC0z9ZC4
```

Only run the link command if this checkout isn't already linked to that application. Do not run `clerk init` for this existing Go project because the Clerk UI is already integrated and the goal is to preserve the current application. If development keys are missing, restore them from the same application through the Clerk CLI or copy the publishable key from its Dashboard. A key written to an env file is not automatically loaded by Go; the process still needs `CLERK_PUBLISHABLE_KEY` in its environment.

### Current authentication boundary

Clerk manages sign-in, sign-up, and browser sessions. The Go `POST /compress` endpoint is **not yet protected by server-side session-token verification**, so adding a Clerk account does not currently make compression an authenticated-only feature. Do not treat the UI alone as an access-control boundary.

## Architecture

```
IRIS/
├── cmd/
│   └── iris/
│       └── main.go              # Entry point, flag parsing, graceful shutdown
├── internal/
│   ├── compressor/
│   │   ├── zstd.go              # Reusable streaming Zstandard level 3 engine
│   │   └── zstd_test.go         # Lossless roundtrip tests
│   ├── httpapi/
│   │   ├── server.go            # Route registration, concurrency semaphore, limits
│   │   ├── handlers.go          # Streaming multipart handler, temp storage, cleanup
│   │   ├── filename.go          # Path traversal sanitizer & .zst naming
│   │   └── handlers_test.go     # HTTP endpoint & boundary unit tests
│   └── web/
│       ├── assets.go            # go:embed static asset file system handler
│       └── static/
│           ├── index.html       # Semantic HTML layout
│           ├── styles.css       # Layout, animations, and dark glassmorphic styling
│           └── app.js           # Drag-and-drop, upload tracking, stat computation
├── AGENTS.md                    # Project invariants and agent rules
├── IMPLEMENTATION_PLAN.md       # Status ledger
└── README.md
```

### HTTP Endpoints

- `GET /` — Serves the embedded web application.
- `POST /compress` — Accepts `multipart/form-data` with field `file`, streams compression to a temporary `.zst` file, and returns the downloadable file with metadata headers:
  - `Content-Disposition: attachment; filename="<original_name>.zst"`
  - `Content-Type: application/zstd`
  - `X-Original-Size: <bytes>`
  - `X-Compressed-Size: <bytes>`

---

## Testing

Run all automated unit and integration tests:

```bash
go test -v ./...
```

To decompress a `.zst` file produced by IRIS using the standard `zstd` CLI tool:

```bash
zstd -d file.ext.zst -o file.ext
```

---

## Known Limitations

- **Compression Only:** In accordance with the project specification, IRIS strictly compresses files; decompression is intentionally handled by standard third-party tools (e.g. `zstd -d`, 7-Zip, PeaZip).
- **Single File Upload:** The application compresses one file per request.
