package contract

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoaderLoadsContractAndBuildsLookups(t *testing.T) {
	path := writeContract(t, validContractJSON())

	loaded, err := NewLoader(path).Load()
	if err != nil {
		t.Fatal(err)
	}

	event, ok := loaded.Event("signup_completed")
	if !ok {
		t.Fatal("expected signup_completed event")
	}
	if _, ok := event.Property("user_id"); !ok {
		t.Fatal("expected merged global user_id property")
	}
	if loaded.VersionNumber != 1 {
		t.Fatalf("version = %d", loaded.VersionNumber)
	}
}

func TestLoaderRejectsUnknownFormat(t *testing.T) {
	path := writeContract(t, `{"format_version":"wrong","events":[]}`)

	_, err := NewLoader(path).Load()
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestLoaderRejectsUnknownGlobalReference(t *testing.T) {
	path := writeContract(t, `{
		"format_version":"trackboard.contract.v1",
		"events":[{"event_name":"signup_completed","properties":[],"global_properties":["missing"]}]
	}`)

	_, err := NewLoader(path).Load()
	if err == nil {
		t.Fatal("expected error")
	}
}

func writeContract(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "contract.json")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func validContractJSON() string {
	return `{
		"format_version":"trackboard.contract.v1",
		"plan_id":"plan_1",
		"version_id":"version_1",
		"version_number":1,
		"name":"Web Analytics",
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
}
