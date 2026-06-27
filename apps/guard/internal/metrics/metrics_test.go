package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandlerExposesPrometheusCounters(t *testing.T) {
	m := New()
	m.IncAccepted()
	m.IncBlocked()
	recorder := httptest.NewRecorder()

	m.Handler(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	body := recorder.Body.String()
	if !strings.Contains(body, "trackboard_guard_events_accepted_total 1") {
		t.Fatalf("missing accepted counter: %s", body)
	}
	if !strings.Contains(body, "trackboard_guard_events_blocked_total 1") {
		t.Fatalf("missing blocked counter: %s", body)
	}
}
