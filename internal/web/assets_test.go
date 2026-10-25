package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStaticAssets(t *testing.T) {
	handler := Handler()

	tests := []struct {
		path         string
		expectedCode int
	}{
		{"/", http.StatusOK},
		{"/index.html", http.StatusMovedPermanently}, // Go FileServer canonical redirect to ./
		{"/about.html", http.StatusOK},
		{"/features.html", http.StatusOK},
		{"/team.html", http.StatusOK},
		{"/login.html", http.StatusOK},
		{"/css/styles.css", http.StatusOK},
		{"/js/site.js", http.StatusOK},
		{"/js/globe.js", http.StatusOK},
	}

	for _, tc := range tests {
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != tc.expectedCode {
			t.Errorf("Path %s returned status %d, expected %d", tc.path, rec.Code, tc.expectedCode)
		}
	}
}
