package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/astoriel/trackboard/apps/guard/internal/config"
	"github.com/astoriel/trackboard/apps/guard/internal/store"
)

func TestTrackEndpointValidatesAgainstLoadedContract(t *testing.T) {
	contractPath := writeServerContract(t)
	storePath := dbPath(t)
	srv := New(config.Config{HTTPAddr: ":0", ContractFile: contractPath, StoreFile: storePath, Destination: "segment", Mode: "block"})
	defer shutdownServer(t, srv)
	req := httptest.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{
		"event":"signup_completed",
		"userId":"usr_123",
		"messageId":"msg_1",
		"properties":{"user_id":"usr_123","signup_method":"twitter"}
	}`))
	recorder := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "enum_violation") {
		t.Fatalf("expected enum violation, body = %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"forward":false`) {
		t.Fatalf("expected block decision, body = %s", recorder.Body.String())
	}
	assertDepths(t, storePath, 0, 1)
}

func TestTrackEndpointQueuesValidEventsInOutbox(t *testing.T) {
	contractPath := writeServerContract(t)
	storePath := dbPath(t)
	srv := New(config.Config{HTTPAddr: ":0", ContractFile: contractPath, StoreFile: storePath, Destination: "segment", Mode: "block"})
	defer shutdownServer(t, srv)
	req := httptest.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{
		"event":"signup_completed",
		"userId":"usr_123",
		"messageId":"msg_valid",
		"properties":{"user_id":"usr_123","signup_method":"google"}
	}`))
	recorder := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	assertDepths(t, storePath, 1, 0)
}

func TestTrackEndpointForwardsValidEventsToDestination(t *testing.T) {
	contractPath := writeServerContract(t)
	storePath := dbPath(t)
	var received atomic.Int32
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/track" {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		received.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer destination.Close()
	srv := New(config.Config{HTTPAddr: ":0", ContractFile: contractPath, StoreFile: storePath, Destination: destination.URL + "/track", Mode: "block", WorkerCount: 1})
	defer shutdownServer(t, srv)
	req := httptest.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{
		"event":"signup_completed",
		"userId":"usr_123",
		"messageId":"msg_forwarded",
		"properties":{"user_id":"usr_123","signup_method":"google"}
	}`))

	srv.httpServer.Handler.ServeHTTP(httptest.NewRecorder(), req)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if received.Load() == 1 {
			assertDepths(t, storePath, 0, 0)
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("destination received %d events", received.Load())
}

func TestMetricsEndpointReportsAcceptedAndBlockedEvents(t *testing.T) {
	contractPath := writeServerContract(t)
	srv := New(config.Config{HTTPAddr: ":0", ContractFile: contractPath, StoreFile: dbPath(t), Destination: "segment", Mode: "block"})
	defer shutdownServer(t, srv)
	trackReq := httptest.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{
		"event":"signup_completed",
		"userId":"usr_123",
		"messageId":"msg_1",
		"properties":{"user_id":"usr_123","signup_method":"twitter"}
	}`))
	srv.httpServer.Handler.ServeHTTP(httptest.NewRecorder(), trackReq)
	metricsRecorder := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(metricsRecorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	body := metricsRecorder.Body.String()
	if !strings.Contains(body, "trackboard_guard_events_accepted_total 1") {
		t.Fatalf("missing accepted metric: %s", body)
	}
	if !strings.Contains(body, "trackboard_guard_events_blocked_total 1") {
		t.Fatalf("missing blocked metric: %s", body)
	}
}

func TestTrackEndpointReturnsUnavailableWithoutContract(t *testing.T) {
	srv := New(config.Config{HTTPAddr: ":0", StoreFile: dbPath(t), Mode: "block"})
	defer shutdownServer(t, srv)
	req := httptest.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{"event":"signup_completed"}`))
	recorder := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", recorder.Code)
	}
}

func dbPath(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "guard.db")
}

func assertDepths(t *testing.T, storePath string, outbox int, dlq int) {
	t.Helper()
	db, err := store.Open(context.Background(), storePath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	actualOutbox, err := db.QueueDepth(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	actualDLQ, err := db.DLQDepth(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if actualOutbox != outbox || actualDLQ != dlq {
		t.Fatalf("depths outbox=%d dlq=%d", actualOutbox, actualDLQ)
	}
}

func shutdownServer(t *testing.T, srv *Server) {
	t.Helper()
	if err := srv.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func writeServerContract(t *testing.T) string {
	t.Helper()
	body := `{
		"format_version":"trackboard.contract.v1",
		"version_number":1,
		"hash":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"global_properties":[{"name":"user_id","type":"string","required":true,"constraints":{},"examples":[]}],
		"events":[
			{
				"event_name":"signup_completed",
				"status":"active",
				"properties":[{"name":"signup_method","type":"string","required":true,"constraints":{"enum_values":["email","google"]},"examples":[]}],
				"global_properties":["user_id"]
			}
		]
	}`
	path := filepath.Join(t.TempDir(), "contract.json")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
