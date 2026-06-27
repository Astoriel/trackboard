package runtime

import (
	"context"
	"sync"
	"time"

	"github.com/astoriel/trackboard/apps/guard/internal/forwarder"
	"github.com/astoriel/trackboard/apps/guard/internal/store"
)

type Sender interface {
	Send(ctx context.Context, payload []byte) (forwarder.Result, string)
}

type WorkerPool struct {
	Store         *store.Store
	Sender        Sender
	WorkerCount   int
	PollInterval  time.Duration
	LeaseDuration time.Duration
}

func (p WorkerPool) Run(ctx context.Context) {
	workerCount := p.WorkerCount
	if workerCount <= 0 {
		workerCount = 1
	}
	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.runWorker(ctx)
		}()
	}
	wg.Wait()
}

func (p WorkerPool) runWorker(ctx context.Context) {
	pollInterval := p.PollInterval
	if pollInterval <= 0 {
		pollInterval = 250 * time.Millisecond
	}
	leaseDuration := p.LeaseDuration
	if leaseDuration <= 0 {
		leaseDuration = 30 * time.Second
	}
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		events, err := p.Store.LeaseDue(ctx, 1, leaseDuration)
		if err == nil {
			for _, event := range events {
				p.process(ctx, event)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (p WorkerPool) process(ctx context.Context, event store.OutboxEvent) {
	result, message := p.Sender.Send(ctx, []byte(event.PayloadJSON))
	switch result {
	case forwarder.Delivered:
		_ = p.Store.MarkDelivered(ctx, event.ID)
	case forwarder.TerminalFailed:
		_ = p.Store.MarkRetry(ctx, event.ID, time.Now().UTC().Add(24*time.Hour), message)
	default:
		_ = p.Store.MarkRetry(ctx, event.ID, nextBackoff(event.Attempts), message)
	}
}

func nextBackoff(attempts int) time.Time {
	delay := time.Second * time.Duration(1<<min(attempts, 6))
	return time.Now().UTC().Add(delay)
}
