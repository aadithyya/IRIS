package compressor

import (
	"fmt"
	"io"

	"github.com/klauspost/compress/zstd"
)

// Result records size statistics for a completed compression operation.
type Result struct {
	OriginalSize   int64
	CompressedSize int64
}

type countWriter struct {
	io.Writer
	count int64
}

func (cw *countWriter) Write(p []byte) (int, error) {
	n, err := cw.Writer.Write(p)
	cw.count += int64(n)
	return n, err
}

// Compress streams bytes from src to dst using Zstandard level 3.
func Compress(dst io.Writer, src io.Reader) (Result, error) {
	cw := &countWriter{Writer: dst}
	enc, err := zstd.NewWriter(cw, zstd.WithEncoderLevel(zstd.EncoderLevelFromZstd(3)))
	if err != nil {
		return Result{}, fmt.Errorf("create zstd encoder: %w", err)
	}

	written, err := io.Copy(enc, src)
	if err != nil {
		_ = enc.Close()
		return Result{}, fmt.Errorf("compress data: %w", err)
	}

	if err := enc.Close(); err != nil {
		return Result{}, fmt.Errorf("finalize zstd encoder: %w", err)
	}

	return Result{
		OriginalSize:   written,
		CompressedSize: cw.count,
	}, nil
}
