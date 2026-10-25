package httpapi

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strconv"
	"time"

	"iris/internal/compressor"
)

func (s *Server) handleCompress(w http.ResponseWriter, r *http.Request) {
	// Concurrency limiting
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	case <-r.Context().Done():
		http.Error(w, "Request cancelled", http.StatusRequestTimeout)
		return
	case <-time.After(30 * time.Second):
		http.Error(w, "Server busy, please retry later", http.StatusServiceUnavailable)
		return
	}

	// Limit body size
	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadSize)

	mr, err := r.MultipartReader()
	if err != nil {
		http.Error(w, "Invalid multipart request: "+err.Error(), http.StatusBadRequest)
		return
	}

	var filePart *multipart.Part
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(err, &maxBytesErr) {
				http.Error(w, "File exceeds maximum upload size limit", http.StatusRequestEntityTooLarge)
				return
			}
			http.Error(w, "Failed reading multipart stream: "+err.Error(), http.StatusBadRequest)
			return
		}
		if part.FormName() == "file" {
			filePart = part
			break
		}
		_ = part.Close()
	}

	if filePart == nil {
		http.Error(w, "Missing 'file' field in multipart form", http.StatusBadRequest)
		return
	}
	defer filePart.Close()

	// Temporary output file for compressed stream
	tmpOut, err := os.CreateTemp("", "iris-compressed-*.zst")
	if err != nil {
		http.Error(w, "Failed to allocate temporary storage", http.StatusInternalServerError)
		return
	}
	defer func() {
		_ = tmpOut.Close()
		_ = os.Remove(tmpOut.Name())
	}()

	res, err := compressor.Compress(tmpOut, filePart)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			http.Error(w, "File exceeds maximum upload size limit", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Compression failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if _, err := tmpOut.Seek(0, io.SeekStart); err != nil {
		http.Error(w, "Failed to read compressed output", http.StatusInternalServerError)
		return
	}

	outFilename := SafeOutputFilename(filePart.FileName())
	w.Header().Set("Content-Type", "application/zstd")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", outFilename))
	w.Header().Set("X-Original-Size", strconv.FormatInt(res.OriginalSize, 10))
	w.Header().Set("X-Compressed-Size", strconv.FormatInt(res.CompressedSize, 10))
	w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition, X-Original-Size, X-Compressed-Size")
	w.Header().Set("Content-Length", strconv.FormatInt(res.CompressedSize, 10))
	w.WriteHeader(http.StatusOK)

	_, _ = io.Copy(w, tmpOut)
}
