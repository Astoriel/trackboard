# Trackboard Guard

Trackboard Guard is the runtime data plane for Trackboard. It will accept Segment-compatible analytics events, validate them against a published Trackboard contract, and forward valid events to configured destinations.

Current scaffold:

- `GET /health/live`
- `GET /health/ready`
- config loading from a small local YAML-style file
- graceful shutdown

Run locally:

```bash
go run ./cmd/trackboard-guard --config ../../examples/guard/guard.local.yaml
```
