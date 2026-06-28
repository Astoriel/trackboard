# Trackboard Guard

Trackboard Guard is the runtime validator for Trackboard contracts.

It accepts Segment-compatible `/v1/track` events, validates them against a published `trackboard.contract.v1` file, forwards accepted events to an HTTP destination, and stores rejected events in a local SQLite DLQ.

Run locally:

```bash
go test ./...
go run ./cmd/trackboard-guard --config ../../examples/guard/guard.local.yaml
```

Replay fixed DLQ events:

```bash
go run ./cmd/trackboard-guard replay --config ../../examples/guard/guard.local.yaml --limit 100
```

Export rejected DLQ events for the Trackboard control plane:

```bash
go run ./cmd/trackboard-guard dlq export --config ../../examples/guard/guard.local.yaml --format ndjson --limit 100 > guard-dlq.ndjson
```

The export is read-only and emits one `trackboard.guard.dlq.export.v1` JSON object per line. It does not replay, delete, or repair local DLQ rows.

Endpoints:

- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `POST /v1/track`
