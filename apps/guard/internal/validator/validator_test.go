package validator

import (
	"testing"

	"github.com/astoriel/trackboard/apps/guard/internal/contract"
	"github.com/astoriel/trackboard/apps/guard/internal/ingest"
)

func TestValidateReportsEnumUnknownAndIdentityViolations(t *testing.T) {
	c := mustLoadContract(t)
	event := ingest.TrackEvent{
		Event:      "signup_completed",
		Properties: map[string]any{"user_id": "usr_123", "signup_method": "twitter", "extra": true},
	}

	violations := Validate(c, event)
	codes := map[string]bool{}
	for _, violation := range violations {
		codes[violation.Code] = true
	}

	if !codes["enum_violation"] {
		t.Fatal("expected enum_violation")
	}
	if !codes["unknown_property"] {
		t.Fatal("expected unknown_property")
	}
}

func TestValidateReportsUnknownEvent(t *testing.T) {
	violations := Validate(mustLoadContract(t), ingest.TrackEvent{Event: "missing", Properties: map[string]any{}})
	if len(violations) != 1 || violations[0].Code != "unknown_event" {
		t.Fatalf("violations = %#v", violations)
	}
}

func mustLoadContract(t *testing.T) contract.Contract {
	t.Helper()
	path := contractTestFile(t)
	loaded, err := contract.NewLoader(path).Load()
	if err != nil {
		t.Fatal(err)
	}
	return loaded
}
