package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/astoriel/trackboard/apps/guard/internal/store"
)

func TestDLQExportCommandWritesNDJSON(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	storePath := filepath.Join(dir, "guard.db")
	configPath := filepath.Join(dir, "guard.yaml")

	db, err := store.Open(ctx, storePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.EnqueueDLQ(ctx, store.DLQEvent{
		ID:              "msg_1:dlq",
		IdempotencyKey:  "msg_1",
		EventName:       "signup_completed",
		Severity:        "blocked",
		ReasonCodesJSON: `["enum_violation"]`,
		PayloadJSON:     `{"event":"signup_completed","properties":{"method":"twitter"}}`,
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(configPath, []byte(fmt.Sprintf("store_file: %q\n", storePath)), 0o600); err != nil {
		t.Fatal(err)
	}

	var out bytes.Buffer
	if err := dlqExportCommand([]string{"--config", configPath, "--format", "ndjson", "--limit", "10"}, &out); err != nil {
		t.Fatal(err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("lines = %#v", lines)
	}
	var record dlqExportRecord
	if err := json.Unmarshal([]byte(lines[0]), &record); err != nil {
		t.Fatal(err)
	}
	if record.SchemaVersion != "trackboard.guard.dlq.export.v1" {
		t.Fatalf("schema version = %q", record.SchemaVersion)
	}
	if record.GuardDLQID != "msg_1:dlq" || record.IdempotencyKey != "msg_1" {
		t.Fatalf("record ids = %#v", record)
	}
	if len(record.ReasonCodes) != 1 || record.ReasonCodes[0] != "enum_violation" {
		t.Fatalf("reason codes = %#v", record.ReasonCodes)
	}
	if record.Payload["event"] != "signup_completed" {
		t.Fatalf("payload = %#v", record.Payload)
	}
	if record.CreatedAt.IsZero() {
		t.Fatal("created_at was not exported")
	}
}
