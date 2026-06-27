package replay

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/astoriel/trackboard/apps/guard/internal/contract"
	"github.com/astoriel/trackboard/apps/guard/internal/ingest"
	"github.com/astoriel/trackboard/apps/guard/internal/store"
	"github.com/astoriel/trackboard/apps/guard/internal/validator"
)

type Summary struct {
	Scanned  int
	Queued   int
	Retained int
}

func Run(ctx context.Context, db *store.Store, c contract.Contract, destination string, limit int) (Summary, error) {
	if limit <= 0 {
		limit = 100
	}
	events, err := db.PendingDLQ(ctx, limit)
	if err != nil {
		return Summary{}, err
	}
	summary := Summary{Scanned: len(events)}
	for _, dlqEvent := range events {
		var payload ingest.TrackEvent
		if err := json.Unmarshal([]byte(dlqEvent.PayloadJSON), &payload); err != nil {
			return summary, err
		}
		violations := validator.Validate(c, payload)
		if len(violations) > 0 {
			reasons, err := json.Marshal(reasonCodes(violations))
			if err != nil {
				return summary, err
			}
			if err := db.UpdateDLQReasons(ctx, dlqEvent.ID, string(reasons)); err != nil {
				return summary, err
			}
			summary.Retained++
			continue
		}
		if err := db.EnqueueOutbox(ctx, store.OutboxEvent{
			ID:             fmt.Sprintf("%s:replay", dlqEvent.IdempotencyKey),
			IdempotencyKey: fmt.Sprintf("%s:replay", dlqEvent.IdempotencyKey),
			Destination:    destination,
			PayloadJSON:    dlqEvent.PayloadJSON,
		}); err != nil {
			return summary, err
		}
		if err := db.MarkDLQReplayed(ctx, dlqEvent.ID); err != nil {
			return summary, err
		}
		summary.Queued++
	}
	return summary, nil
}

func reasonCodes(violations []validator.Violation) []string {
	codes := make([]string, 0, len(violations))
	for _, violation := range violations {
		codes = append(codes, violation.Code)
	}
	return codes
}
