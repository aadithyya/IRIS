package compressor

import (
	"bytes"
	"crypto/rand"
	"io"
	"testing"

	"github.com/klauspost/compress/zstd"
)

func decompressBytes(t *testing.T, compressed []byte) []byte {
	t.Helper()
	dec, err := zstd.NewReader(bytes.NewReader(compressed))
	if err != nil {
		t.Fatalf("create zstd decoder: %v", err)
	}
	defer dec.Close()

	out, err := io.ReadAll(dec)
	if err != nil {
		t.Fatalf("decompress payload: %v", err)
	}
	return out
}

func TestCompress_Roundtrip(t *testing.T) {
	original := []byte("The quick brown fox jumps over the lazy dog. Repetition repetition repetition repetition.")
	var compressed bytes.Buffer

	res, err := Compress(&compressed, bytes.NewReader(original))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.OriginalSize != int64(len(original)) {
		t.Errorf("expected original size %d, got %d", len(original), res.OriginalSize)
	}
	if res.CompressedSize != int64(compressed.Len()) {
		t.Errorf("expected compressed size %d, got %d", compressed.Len(), res.CompressedSize)
	}

	decompressed := decompressBytes(t, compressed.Bytes())
	if !bytes.Equal(decompressed, original) {
		t.Errorf("lossless integrity failure: decompressed content does not match original")
	}
}

func TestCompress_EmptyInput(t *testing.T) {
	var compressed bytes.Buffer
	res, err := Compress(&compressed, bytes.NewReader([]byte{}))
	if err != nil {
		t.Fatalf("unexpected error on empty input: %v", err)
	}
	if res.OriginalSize != 0 {
		t.Errorf("expected original size 0, got %d", res.OriginalSize)
	}

	decompressed := decompressBytes(t, compressed.Bytes())
	if len(decompressed) != 0 {
		t.Errorf("expected empty decompressed output, got %d bytes", len(decompressed))
	}
}

func TestCompress_BinaryData(t *testing.T) {
	data := make([]byte, 64*1024)
	if _, err := rand.Read(data); err != nil {
		t.Fatalf("failed to generate random data: %v", err)
	}

	var compressed bytes.Buffer
	res, err := Compress(&compressed, bytes.NewReader(data))
	if err != nil {
		t.Fatalf("compress binary data: %v", err)
	}

	if res.OriginalSize != int64(len(data)) {
		t.Errorf("expected %d original bytes, got %d", len(data), res.OriginalSize)
	}

	decompressed := decompressBytes(t, compressed.Bytes())
	if !bytes.Equal(decompressed, data) {
		t.Errorf("binary data corrupted during roundtrip")
	}
}
