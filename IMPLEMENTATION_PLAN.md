# IRIS Implementation Plan & Status

## Project Status: Completed & Verified

### Phase 1: Environment & Tooling Verification
- [x] Verify Go compiler (`go version go1.27.1 darwin/arm64`).
- [x] Verify dependency fetching (`go get github.com/klauspost/compress/zstd`).
- [x] Establish compact project architecture.

### Phase 2: Core Compressor Component
- [x] Implement `internal/compressor/zstd.go` using streaming I/O with Zstandard level 3 (`zstd.EncoderLevelFromZstd(3)`).
- [x] Return accurate byte counts (`OriginalSize` and `CompressedSize`) via wrapped counting writer.
- [x] Implement unit tests in `internal/compressor/zstd_test.go` verifying lossless byte-for-byte roundtrip, empty inputs, and binary payloads.

### Phase 3: HTTP API & Middleware
- [x] Implement safe filename generator in `internal/httpapi/filename.go` with directory traversal protection.
- [x] Implement HTTP server with concurrency semaphore and request timeout settings in `internal/httpapi/server.go`.
- [x] Implement streaming multipart upload handler in `internal/httpapi/handlers.go` with `http.MaxBytesReader` and temporary file cleanup (`defer os.Remove`).
- [x] Write endpoint unit & integration tests in `internal/httpapi/handlers_test.go` covering success cases, method restrictions (405), missing fields (400), payload limits (413), and decompression verification.

### Phase 4: Embedded Frontend UI
- [x] Embed static directory using Go 1.16+ `//go:embed static/*` in `internal/web/assets.go`.
- [x] Build semantic, accessible `index.html`.
- [x] Build modern CSS (`styles.css`) with dark theme, glassmorphism, responsive grid, circular progress ring, and checkmark animations.
- [x] Build JavaScript client (`app.js`) handling drag-and-drop, real upload progress via `xhr.upload.onprogress`, upload-complete checkmark, compression spinner, byte statistics calculation, and blob download.

### Phase 5: Verification & Packaging
- [x] Implement `cmd/iris/main.go` supporting flags (`-port`, `-max-upload-mb`) and graceful shutdown.
- [x] Pass full test suite (`go test -v ./...`).
- [x] Build standalone binary (`bin/iris`).
- [x] Verify live HTTP upload, compression, headers, and lossless decompression using live test server.
