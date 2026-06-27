package replay

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/astoriel/trackboard/apps/guard/internal/contract"
	"github.com/astoriel/trackboard/apps/guard/internal/store"
)

func TestRunQueuesFixedDLQEvent(t *testing.T) {
	ctx := context.Background()
	db := openReplayStore(t)
	defer db.Close()
	c := replayContract(t)
	err := db.EnqueueDLQ(ctx, store.DLQEvent{
		ID:              "dlq_1",
		IdempotencyKey:  "key_1",
		EventName:       "signup_completed",
		Severity:        "blocked",
		ReasonCodesJSON: `["old"]`,
		PayloadJSON:     `{"event":"signup_completed","userId":"usr_123","properties":{"user_id":"usr_123","signup_method":"google"}}`,
	})
	if err != nil {
		t.Fatal(err)
	}

	summary, err := Run(ctx, db, c, "segment", 100)
	if err != nil {
		t.Fatal(err)
	}

	if summary.Queued != 1 || summary.Retained != 0 {
		t.Fatalf("summary = %#v", summary)
	}
	outbox, err := db.QueueDepth(ctx)
	if err != nil {
		t.Fatal(err)
	}
	dlq, err := db.DLQDepth(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if outbox != 1 || dlq != 0 {
		t.Fatalf("depths outbox=%d dlq=%d", outbox, dlq)
	}
}

func TestRunRetainsStillInvalidDLQEvent(t *testing.T) {
	ctx := context.Background()
	db := openReplayStore(t)
	defer db.Close()
	c := replayContract(t)
	if err := db.EnqueueDLQ(ctx, store.DLQEvent{
		ID:              "dlq_1",
		IdempotencyKey:  "key_1",
		EventName:       "signup_completed",
		Severity:        "blocked",
		ReasonCodesJSON: `["old"]`,
		PayloadJSON:     `{"event":"signup_completed","userId":"usr_123","properties":{"user_id":"usr_123","signup_method":"twitter"}}`,
	}); err != nil {
		t.Fatal(err)
	}

	summary, err := Run(ctx, db, c, "segment", 100)
	if err != nil {
		t.Fatal(err)
	}

	if summary.Queued != 0 || summary.Retained != 1 {
		t.Fatalf("summary = %#v", summary)
	}
}

func openReplayStore(t *testing.T) *store.Store {
	t.Helper()
	db, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "guard.db"))
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func replayContract(t *testing.T) contract.Contract {
	t.Helper()
	body := `{
		"format_version":"trackboard.contract.v1",
		"version_number":1,
		"hash":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"global_properties":[{"name":"user_id","type":"string","required":true,"constraints":{},"examples":[]}],
		"events":[{"event_name":"signup_completed","status":"active","properties":[{"name":"signup_method","type":"string","required":true,"constraints":{"enum_values":["email","google"]},"examples":[]}],"global_properties":["user_id"]}]
	}`
	path := filepath.Join(t.TempDir(), "contract.json")
	if err := osWrite(path, body); err != nil {
		t.Fatal(err)
	}
	loaded, err := contract.NewLoader(path).Load()
	if err != nil {
		t.Fatal(err)
	}
	return loaded
}

func osWrite(path string, body string) error {
	return os.WriteFile(path, []byte(body), 0o600)
}
