# Known Limitations

**Snapshot date:** 2026-06-27

- This is a self-hosted prototype; production deployment still needs environment-specific security and operations review.
- The backend expects PostgreSQL for serious use. SQLite is used only inside Trackboard Guard for local durable queues.
- Guard's SQLite outbox/DLQ is a single-node queue, not a horizontally distributed ingestion backend. It is appropriate for local, edge, and small-to-medium deployments; very high-throughput or multi-replica ingestion should use a future Postgres/Redis/NATS/Kafka queue adapter.
- Frontend regression coverage is lighter than backend, CLI, and Guard coverage.
- Guard currently forwards to a generic HTTP destination. Native adapters for analytics vendors are planned.
- TypeScript is the first generated SDK target. Other languages are planned.
- GitHub Action coverage is focused on contract diffs; it is not a complete release workflow.
- AI schema suggestions are optional and depend on user-provided model configuration.
- No hosted multi-tenant service is provided by this repository.
