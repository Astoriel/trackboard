package validator

import (
	"os"
	"path/filepath"
	"testing"
)

func contractTestFile(t *testing.T) string {
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
