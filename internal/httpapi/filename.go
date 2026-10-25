package httpapi

import (
	"path/filepath"
	"strings"
	"unicode"
)

// SafeOutputFilename cleans an untrusted input filename and appends .zst.
func SafeOutputFilename(original string) string {
	base := filepath.Base(filepath.Clean(original))

	// Clean out control characters or null bytes
	var sb strings.Builder
	for _, r := range base {
		if unicode.IsControl(r) || r == '/' || r == '\\' {
			continue
		}
		sb.WriteRune(r)
	}
	clean := strings.TrimSpace(sb.String())

	if clean == "" || clean == "." || clean == "/" || clean == "\\" {
		clean = "download"
	}

	return clean + ".zst"
}
