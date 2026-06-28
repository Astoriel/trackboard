# End-to-End Demo

This demo proves the full runtime path:

1. Guard loads a published Trackboard contract.
2. A valid Segment-compatible event is accepted into the outbox.
3. The Guard worker forwards the valid event to a fake analytics destination.
4. An invalid event is blocked and recorded in Guard metrics.

## Local Smoke Test

```powershell
.\scripts\demo-guard-e2e.ps1
```

Expected output:

```text
Guard E2E demo passed: valid event forwarded, invalid event blocked
```

The script starts:

- `examples/fake-destination/server.js` on `localhost:9000`
- `apps/guard` on `localhost:8080`

It stops both processes when the check completes.

## Docker Compose

```bash
docker compose up --build guard fake-destination
```

Then send a valid event:

```bash
curl -X POST http://localhost:8080/v1/track \
  -H "Content-Type: application/json" \
  -d @examples/events/signup.valid.json
```

Check that the fake destination received it:

```bash
curl http://localhost:9000/events
```

Send an invalid event:

```bash
curl -X POST http://localhost:8080/v1/track \
  -H "Content-Type: application/json" \
  -d @examples/events/signup.invalid.json
```

Check Guard metrics:

```bash
curl http://localhost:8080/metrics
```
