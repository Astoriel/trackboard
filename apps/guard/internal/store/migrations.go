package store

import "context"

func (s *Store) migrate(ctx context.Context) error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS outbox_events (
			id TEXT PRIMARY KEY,
			idempotency_key TEXT NOT NULL UNIQUE,
			destination TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			status TEXT NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0,
			next_attempt_at TEXT NOT NULL,
			leased_until TEXT,
			last_error TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_outbox_due ON outbox_events(status, next_attempt_at, leased_until)`,
		`CREATE TABLE IF NOT EXISTS dlq_events (
			id TEXT PRIMARY KEY,
			idempotency_key TEXT NOT NULL,
			event_name TEXT NOT NULL,
			severity TEXT NOT NULL,
			reason_codes_json TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			replay_status TEXT NOT NULL,
			created_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_dlq_replay ON dlq_events(replay_status, created_at)`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}
