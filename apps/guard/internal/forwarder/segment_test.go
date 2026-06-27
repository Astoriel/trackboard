package forwarder

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSegmentForwarderMarks2xxDelivered(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	result, message := NewSegment(server.URL).Send(context.Background(), []byte(`{"event":"signup_completed"}`))

	if result != Delivered || message != "" {
		t.Fatalf("result = %s, message = %q", result, message)
	}
}

func TestSegmentForwarderRetries5xx(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	result, _ := NewSegment(server.URL).Send(context.Background(), []byte(`{}`))

	if result != RetryableFailed {
		t.Fatalf("result = %s", result)
	}
}

func TestSegmentForwarderTreats4xxAsTerminal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	result, _ := NewSegment(server.URL).Send(context.Background(), []byte(`{}`))

	if result != TerminalFailed {
		t.Fatalf("result = %s", result)
	}
}
