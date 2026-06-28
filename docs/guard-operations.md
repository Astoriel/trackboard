# Guard Operations

Guard is intentionally small. The operational model is a local service with a contract file, a SQLite queue, and one HTTP destination.

The SQLite outbox/DLQ is a deliberate v1 tradeoff: it gives Guard a durable, easy-to-run queue without operating another service. It is not a horizontally distributed queue. For local, edge, and small-to-medium ingestion it is a good fit; for very high-throughput or multi-replica ingestion, Guard should use a future Postgres, Redis Streams, NATS JetStream, or Kafka-backed queue adapter.

## Config

```yaml
http_addr: ":8080"
contract_file: "../../examples/contracts/web-analytics.v1.json"
store_file: "../../examples/guard/guard.db"
destination: "http://localhost:9000/track"
ready: true
mode: "block"
```

## Metrics

`GET /metrics` returns plain counters for:

- accepted events
- blocked events
- warned events
- forwarded events
- retried events
- failed events

## DLQ Replay Procedure

1. Export or update the contract that should now accept the previously rejected event.
2. Restart Guard with the updated contract file.
3. Run `trackboard-guard replay`.
4. Watch the queued/retained counts.
5. Retained events need either data repair or another contract update.

## Failure Boundaries

- If the destination is down, accepted events remain in the outbox and are retried.
- If an event violates the contract in `block` mode, it is written to DLQ.
- If replay still fails validation, the event remains in DLQ.
- Concurrent Guard workers lease SQLite rows with a short transaction. This is safe for a local queue, but at very high write/read concurrency workers can contend on SQLite locks.
- Guard does not yet provide vendor-specific batching or authentication adapters.
