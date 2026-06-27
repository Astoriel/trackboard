package store

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestStoreEnqueueLeaseDeliverAndQueueDepth(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()

	err := store.EnqueueOutbox(ctx, OutboxEvent{
		ID:             "evt_1",
		IdempotencyKey: "key_1",
		Destination:    "segment",
		PayloadJSON:    `{"event":"signup_completed"}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	depth, err := store.QueueDepth(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if depth != 1 {
		t.Fatalf("depth = %d", depth)
	}

	leased, err := store.LeaseDue(ctx, 10, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(leased) != 1 || leased[0].ID != "evt_1" {
		t.Fatalf("leased = %#v", leased)
	}
	if err := store.MarkDelivered(ctx, "evt_1"); err != nil {
		t.Fatal(err)
	}
	depth, err = store.QueueDepth(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if depth != 0 {
		t.Fatalf("depth = %d", depth)
	}
}

func TestStoreRejectsDuplicateIdempotencyKey(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()
	event := OutboxEvent{
		ID:             "evt_1",
		IdempotencyKey: "key_1",
		Destination:    "segment",
		PayloadJSON:    `{}`,
	}
	if err := store.EnqueueOutbox(ctx, event); err != nil {
		t.Fatal(err)
	}
	event.ID = "evt_2"
	if err := store.EnqueueOutbox(ctx, event); err == nil {
		t.Fatal("expected duplicate idempotency error")
	}
}

func TestStoreRetryReleasesLease(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()
	if err := store.EnqueueOutbox(ctx, OutboxEvent{ID: "evt_1", IdempotencyKey: "key_1", Destination: "segment", PayloadJSON: `{}`}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.LeaseDue(ctx, 1, time.Minute); err != nil {
		t.Fatal(err)
	}
	if err := store.MarkRetry(ctx, "evt_1", time.Now().Add(-time.Second), "temporary failure"); err != nil {
		t.Fatal(err)
	}
	leased, err := store.LeaseDue(ctx, 1, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(leased) != 1 || leased[0].Attempts != 1 {
		t.Fatalf("leased = %#v", leased)
	}
}

func TestStoreEnqueueDLQ(t *testing.T) {
	ctx := context.Background()
	store := openTestStore(t)
	defer store.Close()
	err := store.EnqueueDLQ(ctx, DLQEvent{
		ID:              "dlq_1",
		IdempotencyKey:  "key_1",
		EventName:       "signup_completed",
		Severity:        "blocked",
		ReasonCodesJSON: `["enum_violation"]`,
		PayloadJSON:     `{}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	depth, err := store.DLQDepth(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if depth != 1 {
		t.Fatalf("dlq depth = %d", depth)
	}
	pending, err := store.PendingDLQ(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || pending[0].ID != "dlq_1" {
		t.Fatalf("pending = %#v", pending)
	}
	if err := store.UpdateDLQReasons(ctx, "dlq_1", `["missing_required_property"]`); err != nil {
		t.Fatal(err)
	}
	if err := store.MarkDLQReplayed(ctx, "dlq_1"); err != nil {
		t.Fatal(err)
	}
	depth, err = store.DLQDepth(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if depth != 0 {
		t.Fatalf("dlq depth = %d", depth)
	}
}

func openTestStore(t *testing.T) *Store {
	t.Helper()
	store, err := Open(context.Background(), filepath.Join(t.TempDir(), "guard.db"))
	if err != nil {
		t.Fatal(err)
	}
	return store
}
