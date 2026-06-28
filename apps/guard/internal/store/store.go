package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

type OutboxEvent struct {
	ID             string
	IdempotencyKey string
	Destination    string
	PayloadJSON    string
	Status         string
	Attempts       int
	NextAttemptAt  time.Time
}

type DLQEvent struct {
	ID              string
	IdempotencyKey  string
	EventName       string
	Severity        string
	ReasonCodesJSON string
	PayloadJSON     string
	ReplayStatus    string
	CreatedAt       time.Time
}

func Open(ctx context.Context, path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// Guard's SQLite store is a local single-node queue. One open connection keeps
	// leasing predictable under SQLite's writer locking model; high-throughput
	// multi-node deployments should use a stronger queue backend.
	db.SetMaxOpenConns(1)
	store := &Store{db: db}
	if err := store.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) EnqueueOutbox(ctx context.Context, event OutboxEvent) error {
	now := time.Now().UTC()
	if event.Status == "" {
		event.Status = "pending"
	}
	if event.NextAttemptAt.IsZero() {
		event.NextAttemptAt = now
	}
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO outbox_events (
			id, idempotency_key, destination, payload_json, status, attempts, next_attempt_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		event.ID,
		event.IdempotencyKey,
		event.Destination,
		event.PayloadJSON,
		event.Status,
		event.Attempts,
		formatTime(event.NextAttemptAt),
		formatTime(now),
		formatTime(now),
	)
	return err
}

func (s *Store) EnqueueDLQ(ctx context.Context, event DLQEvent) error {
	now := time.Now().UTC()
	if event.ReplayStatus == "" {
		event.ReplayStatus = "pending"
	}
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO dlq_events (
			id, idempotency_key, event_name, severity, reason_codes_json, payload_json, replay_status, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		event.ID,
		event.IdempotencyKey,
		event.EventName,
		event.Severity,
		event.ReasonCodesJSON,
		event.PayloadJSON,
		event.ReplayStatus,
		formatTime(now),
	)
	return err
}

func (s *Store) LeaseDue(ctx context.Context, limit int, leaseFor time.Duration) ([]OutboxEvent, error) {
	now := time.Now().UTC()
	leaseUntil := now.Add(leaseFor)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	rows, err := tx.QueryContext(
		ctx,
		`SELECT id, idempotency_key, destination, payload_json, status, attempts, next_attempt_at
		 FROM outbox_events
		 WHERE status = 'pending' AND next_attempt_at <= ? AND (leased_until IS NULL OR leased_until <= ?)
		 ORDER BY created_at ASC
		 LIMIT ?`,
		formatTime(now),
		formatTime(now),
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []OutboxEvent{}
	for rows.Next() {
		var event OutboxEvent
		var nextAttempt string
		if scanErr := rows.Scan(&event.ID, &event.IdempotencyKey, &event.Destination, &event.PayloadJSON, &event.Status, &event.Attempts, &nextAttempt); scanErr != nil {
			err = scanErr
			return nil, err
		}
		event.NextAttemptAt, err = parseTime(nextAttempt)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	for _, event := range events {
		if _, err = tx.ExecContext(ctx, `UPDATE outbox_events SET leased_until = ?, updated_at = ? WHERE id = ?`, formatTime(leaseUntil), formatTime(now), event.ID); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return events, nil
}

func (s *Store) MarkDelivered(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE outbox_events SET status = 'delivered', leased_until = NULL, updated_at = ? WHERE id = ?`, formatTime(time.Now().UTC()), id)
	if err != nil {
		return err
	}
	return requireAffected(result)
}

func (s *Store) MarkRetry(ctx context.Context, id string, nextAttemptAt time.Time, lastError string) error {
	result, err := s.db.ExecContext(
		ctx,
		`UPDATE outbox_events
		 SET attempts = attempts + 1, next_attempt_at = ?, leased_until = NULL, last_error = ?, updated_at = ?
		 WHERE id = ?`,
		formatTime(nextAttemptAt.UTC()),
		lastError,
		formatTime(time.Now().UTC()),
		id,
	)
	if err != nil {
		return err
	}
	return requireAffected(result)
}

func (s *Store) QueueDepth(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM outbox_events WHERE status = 'pending'`).Scan(&count)
	return count, err
}

func (s *Store) DLQDepth(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dlq_events WHERE replay_status = 'pending'`).Scan(&count)
	return count, err
}

func (s *Store) PendingDLQ(ctx context.Context, limit int) ([]DLQEvent, error) {
	rows, err := s.db.QueryContext(
		ctx,
		`SELECT id, idempotency_key, event_name, severity, reason_codes_json, payload_json, replay_status, created_at
		 FROM dlq_events
		 WHERE replay_status = 'pending'
		 ORDER BY created_at ASC
		 LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []DLQEvent{}
	for rows.Next() {
		var event DLQEvent
		var createdAt string
		if err := rows.Scan(&event.ID, &event.IdempotencyKey, &event.EventName, &event.Severity, &event.ReasonCodesJSON, &event.PayloadJSON, &event.ReplayStatus, &createdAt); err != nil {
			return nil, err
		}
		parsedCreatedAt, err := parseTime(createdAt)
		if err != nil {
			return nil, err
		}
		event.CreatedAt = parsedCreatedAt
		events = append(events, event)
	}
	return events, rows.Err()
}

func (s *Store) MarkDLQReplayed(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE dlq_events SET replay_status = 'replayed' WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return requireAffected(result)
}

func (s *Store) UpdateDLQReasons(ctx context.Context, id string, reasonCodesJSON string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE dlq_events SET reason_codes_json = ? WHERE id = ?`, reasonCodesJSON, id)
	if err != nil {
		return err
	}
	return requireAffected(result)
}

func requireAffected(result sql.Result) error {
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return errors.New("event not found")
	}
	return nil
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func parseTime(value string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, value)
}
