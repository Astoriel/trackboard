package server

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/astoriel/trackboard/apps/guard/internal/config"
)

func TestTrackEndpointValidatesAgainstLoadedContract(t *testing.T) {
	contractPath := writeServerContract(t)
	srv := New(config.Config{HTTPAddr: ":0", ContractFile: contractPath, Mode: "block"})
	req := httptest.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{
		"event":"signup_completed",
		"userId":"usr_123",
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
}

func TestTrackEndpointReturnsUnavailableWithoutContract(t *testing.T) {
	srv := New(config.Config{HTTPAddr: ":0", Mode: "block"})
	req := httptest.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{"event":"signup_completed"}`))
	recorder := httptest.NewRecorder()

	srv.httpServer.Handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", recorder.Code)
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
