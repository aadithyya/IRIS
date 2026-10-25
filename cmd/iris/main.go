package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"iris/internal/httpapi"
	"iris/internal/web"
)

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	maxMB := flag.Int64("max-upload-mb", 500, "Maximum upload size in MB")
	flag.Parse()

	addr := fmt.Sprintf(":%d", *port)
	srv := httpapi.NewServer(httpapi.Config{
		Addr:                addr,
		MaxUploadSize:       *maxMB << 20,
		StaticFS:            web.Handler(),
		ClerkPublishableKey: os.Getenv("CLERK_PUBLISHABLE_KEY"),
	})

	httpServer := srv.HTTPServer()

	// Graceful shutdown handling
	idleConnsClosed := make(chan struct{})
	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)
		<-sigint

		log.Println("Shutting down IRIS server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("HTTP server shutdown error: %v", err)
		}
		close(idleConnsClosed)
	}()

	log.Printf("IRIS server listening on http://localhost:%d (upload limit: %d MB)", *port, *maxMB)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("IRIS server failure: %v", err)
	}

	<-idleConnsClosed
	log.Println("IRIS server stopped.")
}
