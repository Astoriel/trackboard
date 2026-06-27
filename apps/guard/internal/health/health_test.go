package health

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestReadyReturnsUnavailableUntilReady(t *testing.T) {
	handler := New(false)
	recorder := httptest.NewRecorder()

	handler.Ready(recorder, httptest.NewRequest(http.MethodGet, "/health/ready", nil))

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", recorder.Code)
	}
}

func TestLiveAlwaysReturnsOK(t *testing.T) {
	handler := New(false)
	recorder := httptest.NewRecorder()

	handler.Live(recorder, httptest.NewRequest(http.MethodGet, "/health/live", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d", recorder.Code)
	}
}
