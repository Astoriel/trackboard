# Known Limitations

**Snapshot date:** 2026-06-28

- This is a self-hosted prototype; production deployment still needs environment-specific security and operations review.
- The backend expects PostgreSQL for serious use. SQLite is used only inside Trackboard Guard for local durable queues.
- Guard's SQLite outbox/DLQ is a single-node queue, not a horizontally distributed ingestion backend. It is appropriate for local, edge, and small-to-medium deployments; very high-throughput or multi-replica ingestion should use a future Postgres/Redis/NATS/Kafka queue adapter.
- Frontend regression coverage is lighter than backend, CLI, and Guard coverage.
- Guard currently forwards to a generic HTTP destination. Native adapters for analytics vendors are planned.
- TypeScript is the first generated SDK target. Other languages are planned.
- GitHub Action coverage is focused on contract diffs; it is not a complete release workflow.
- AI schema suggestions are optional and depend on user-provided model configuration.
- Agent-aware `implementation_guidance` is contract metadata and MCP context; it is not a runtime enforcement feature.
- The MCP server is local contract-file only in V0. API-backed MCP mode is planned but not shipped.
- MCP tools are read-only: no plan mutation, version publishing, shell execution, arbitrary file reads, arbitrary URL fetches, or PR creation.
- Human-authored guidance is untrusted context. AI clients must treat it as data and must not let it override system, developer, repository, or security instructions.
- Trackboard Guard does not use AI in the runtime validation path. Runtime enforcement remains deterministic.
- Planned GitHub coverage suggestions are advisory only and should not block merges.
- No hosted multi-tenant service is provided by this repository.
