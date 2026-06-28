# Trackboard Guard

Trackboard Guard is the runtime data plane. It validates Segment-compatible `/v1/track` events against a published Trackboard contract.

## Responsibilities

- Load a local `trackboard.contract.v1` file.
- Accept Segment-style track payloads.
- Apply contract validation.
- Forward accepted events to an HTTP destination.
- Store accepted events in a durable single-node SQLite outbox before forwarding.
- Store rejected events in a single-node SQLite DLQ.
- Retry failed forwarding attempts.
- Expose health and metrics endpoints.
- Replay fixed DLQ events after the contract is updated.

## Run

```bash
cd apps/guard
go test ./...
go run ./cmd/trackboard-guard --config ../../examples/guard/guard.local.yaml
```

Endpoints:

- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `POST /v1/track`

## Replay

```bash
go run ./cmd/trackboard-guard replay --config ../../examples/guard/guard.local.yaml --limit 100
```

Replay scans pending DLQ rows, validates each payload against the current contract, queues valid events back into the outbox, and keeps still-invalid events in the DLQ with refreshed reason codes.

## Scale Boundary

The v1 storage path is intentionally local-first. SQLite keeps setup simple and durable, but it is not the right queue for multi-node or extreme-throughput ingestion. The intended upgrade path is a pluggable queue store backed by Postgres, Redis Streams, NATS JetStream, or Kafka while keeping the same validation/policy/forwarding interfaces.
