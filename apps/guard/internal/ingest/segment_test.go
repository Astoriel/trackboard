package ingest

import (
	"net/http"
	"strings"
	"testing"
)

func TestDecodeTrackAcceptsSegmentShape(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{
		"event":"signup_completed",
		"userId":"usr_123",
		"messageId":"msg_123",
		"properties":{"signup_method":"google"}
	}`))
	if err != nil {
		t.Fatal(err)
	}

	event, err := DecodeTrack(req)
	if err != nil {
		t.Fatal(err)
	}

	if event.Event != "signup_completed" {
		t.Fatalf("event = %q", event.Event)
	}
	if event.Properties["signup_method"] != "google" {
		t.Fatalf("unexpected properties: %#v", event.Properties)
	}
}

func TestDecodeTrackRejectsMissingEvent(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "/v1/track", strings.NewReader(`{"properties":{}}`))
	if err != nil {
		t.Fatal(err)
	}

	if _, err := DecodeTrack(req); err == nil {
		t.Fatal("expected error")
	}
}
