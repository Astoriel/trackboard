package runtime

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/astoriel/trackboard/apps/guard/internal/forwarder"
	"github.com/astoriel/trackboard/apps/guard/internal/store"
)

type fakeSender struct {
	result forwarder.Result
}

func (f fakeSender) Send(context.Context, []byte) (forwarder.Result, string) {
	return f.result, "fake"
}

func TestWorkerPoolMarksDeliveredEvents(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	db := openRuntimeStore(t)
	defer db.Close()
	if err := db.EnqueueOutbox(ctx, store.OutboxEvent{ID: "evt_1", IdempotencyKey: "key_1", Destination: "segment", PayloadJSON: `{}`}); err != nil {
		t.Fatal(err)
	}
	pool := WorkerPool{Store: db, Sender: fakeSender{result: forwarder.Delivered}, PollInterval: 10 * time.Millisecond}

	done := make(chan struct{})
	go func() {
		pool.Run(ctx)
		close(done)
	}()
	waitForDepth(t, db, 0)
	cancel()
	<-done
}

func TestWorkerPoolRetriesRetryableFailures(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	db := openRuntimeStore(t)
	defer db.Close()
	if err := db.EnqueueOutbox(ctx, store.OutboxEvent{ID: "evt_1", IdempotencyKey: "key_1", Destination: "segment", PayloadJSON: `{}`}); err != nil {
		t.Fatal(err)
	}
	pool := WorkerPool{Store: db, Sender: fakeSender{result: forwarder.RetryableFailed}, PollInterval: 10 * time.Millisecond}

	done := make(chan struct{})
	go func() {
		pool.Run(ctx)
		close(done)
	}()
	time.Sleep(100 * time.Millisecond)
	cancel()
	<-done
	depth, err := db.QueueDepth(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if depth != 1 {
		t.Fatalf("depth = %d", depth)
	}
}

func waitForDepth(t *testing.T, db *store.Store, expected int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		depth, err := db.QueueDepth(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if depth == expected {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("queue depth did not become %d", expected)
}

func openRuntimeStore(t *testing.T) *store.Store {
	t.Helper()
	db, err := store.Open(context.Background(), filepath.Join(t.TempDir(), "guard.db"))
	if err != nil {
		t.Fatal(err)
	}
	return db
}
