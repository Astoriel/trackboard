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

Endpoints:

- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `POST /v1/track`
