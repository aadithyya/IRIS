package httpapi

import (
	"encoding/json"
	"net/http"
	"runtime"
	"time"
)

// Config holds configuration parameters for the HTTP server.
type Config struct {
	Addr           string
	MaxUploadSize  int64
	MaxConcurrency int
	StaticFS       http.Handler

	// ClerkPublishableKey is the frontend-safe Clerk key (pk_test_… or pk_live_…).
	// When empty the /api/clerk-config endpoint returns 204 and the frontend
	// falls back to the visual-prototype login dialog.
	ClerkPublishableKey string
}

// Server encapsulates the HTTP API and background limiters.
type Server struct {
	cfg Config
	sem chan struct{}
	mux *http.ServeMux
}

// NewServer creates a configured Server instance.
func NewServer(cfg Config) *Server {
	if cfg.MaxUploadSize <= 0 {
		cfg.MaxUploadSize = 500 << 20 // default 500MB
	}
	if cfg.MaxConcurrency <= 0 {
		cfg.MaxConcurrency = runtime.NumCPU() * 2
		if cfg.MaxConcurrency < 4 {
			cfg.MaxConcurrency = 4
		}
	}

	s := &Server{
		cfg: cfg,
		sem: make(chan struct{}, cfg.MaxConcurrency),
		mux: http.NewServeMux(),
	}
	s.routes()
	return s
}

// Handler returns the root HTTP handler.
func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() {
	if s.cfg.StaticFS != nil {
		s.mux.Handle("/", s.cfg.StaticFS)
	}

	s.mux.HandleFunc("/compress", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		s.handleCompress(w, r)
	})

	s.mux.HandleFunc("/api/clerk-config", s.handleClerkConfig)
}

// handleClerkConfig returns the Clerk publishable key as JSON.
// No secret material is exposed. Returns 204 when Clerk is not configured.
func (s *Server) handleClerkConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.cfg.ClerkPublishableKey == "" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	json.NewEncoder(w).Encode(map[string]string{
		"publishableKey": s.cfg.ClerkPublishableKey,
	})
}

// HTTPServer returns a standard http.Server with configured timeouts.
func (s *Server) HTTPServer() *http.Server {
	return &http.Server{
		Addr:              s.cfg.Addr,
		Handler:           s.mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}
