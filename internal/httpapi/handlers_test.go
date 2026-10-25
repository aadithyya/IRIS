package httpapi

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/klauspost/compress/zstd"
)

func createMultipartPayload(fieldName, fileName string, content []byte) (*bytes.Buffer, string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile(fieldName, fileName)
	if err != nil {
		return nil, "", err
	}
	if _, err := part.Write(content); err != nil {
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return body, writer.FormDataContentType(), nil
}

func TestCompressHandler_Success(t *testing.T) {
	server := NewServer(Config{MaxUploadSize: 10 << 20, MaxConcurrency: 2})
	payload := []byte("Hello IRIS! Lossless compression test content with some repeated patterns 1234567890 1234567890.")

	body, contentType, err := createMultipartPayload("file", "sample_test.txt", payload)
	if err != nil {
		t.Fatalf("create multipart payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/compress", body)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify headers
	if ct := rec.Header().Get("Content-Type"); ct != "application/zstd" {
		t.Errorf("expected Content-Type application/zstd, got %s", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, "sample_test.txt.zst") {
		t.Errorf("expected Content-Disposition containing sample_test.txt.zst, got %s", cd)
	}

	origSizeStr := rec.Header().Get("X-Original-Size")
	if origSizeStr != strconv.Itoa(len(payload)) {
		t.Errorf("expected X-Original-Size %d, got %s", len(payload), origSizeStr)
	}

	// Decompress and verify lossless roundtrip
	dec, err := zstd.NewReader(rec.Body)
	if err != nil {
		t.Fatalf("init zstd decoder: %v", err)
	}
	defer dec.Close()

	decompressed, err := io.ReadAll(dec)
	if err != nil {
		t.Fatalf("decompress response: %v", err)
	}

	if !bytes.Equal(decompressed, payload) {
		t.Errorf("decompressed response does not match uploaded payload")
	}
}

func TestCompressHandler_MethodNotAllowed(t *testing.T) {
	server := NewServer(Config{})
	req := httptest.NewRequest(http.MethodGet, "/compress", nil)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", rec.Code)
	}
}

func TestCompressHandler_MissingFile(t *testing.T) {
	server := NewServer(Config{})
	body, contentType, err := createMultipartPayload("not_file", "test.txt", []byte("data"))
	if err != nil {
		t.Fatalf("create payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/compress", body)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for missing file field, got %d", rec.Code)
	}
}

func TestCompressHandler_UploadLimitExceeded(t *testing.T) {
	// 50 bytes max limit
	server := NewServer(Config{MaxUploadSize: 50})
	largePayload := make([]byte, 1024)

	body, contentType, err := createMultipartPayload("file", "large.bin", largePayload)
	if err != nil {
		t.Fatalf("create payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/compress", body)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected status 413, got %d", rec.Code)
	}
}

func TestSafeOutputFilename(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"document.pdf", "document.pdf.zst"},
		{"dir/subdir/report.txt", "report.txt.zst"},
		{"../../etc/passwd", "passwd.zst"},
		{"", "download.zst"},
		{".", "download.zst"},
		{"spaced name.tar", "spaced name.tar.zst"},
	}

	for _, tc := range tests {
		got := SafeOutputFilename(tc.input)
		if got != tc.expected {
			t.Errorf("SafeOutputFilename(%q) = %q; want %q", tc.input, got, tc.expected)
		}
	}
}
