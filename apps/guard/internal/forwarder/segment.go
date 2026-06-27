package forwarder

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Result string

const (
	Delivered       Result = "delivered"
	RetryableFailed Result = "retryable_failed"
	TerminalFailed  Result = "terminal_failed"
)

type SegmentForwarder struct {
	Endpoint string
	Client   *http.Client
}

func NewSegment(endpoint string) SegmentForwarder {
	return SegmentForwarder{
		Endpoint: endpoint,
		Client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (f SegmentForwarder) Send(ctx context.Context, payload []byte) (Result, string) {
	client := f.Client
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, f.Endpoint, bytes.NewReader(payload))
	if err != nil {
		return TerminalFailed, err.Error()
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return RetryableFailed, err.Error()
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return Delivered, ""
	}
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
		return RetryableFailed, fmt.Sprintf("destination status %d", resp.StatusCode)
	}
	return TerminalFailed, fmt.Sprintf("destination status %d", resp.StatusCode)
}
