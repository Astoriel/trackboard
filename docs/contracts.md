# Contract Format

Trackboard exports published plans as canonical JSON contracts. The current format id is `trackboard.contract.v1`.

Contracts are meant to be:

- stable enough for CI checks,
- readable enough for review,
- portable enough for runtime validation outside the Trackboard API.

## Minimal Shape

```json
{
  "format_version": "trackboard.contract.v1",
  "plan_id": "plan_1",
  "version_id": "version_1",
  "version_number": 1,
  "name": "Web Analytics",
  "global_properties": [],
  "events": []
}
```

Each event has:

- `event_name`
- optional `status`, `description`, and `category`
- local `properties`
- references to `global_properties`
- optional `implementation_guidance` for agent-aware implementation notes

Each property has:

- `name`
- `type`
- `required`
- optional `constraints`
- optional `description`
- optional `examples`

Supported primitive types are `string`, `integer`, `float`, `boolean`, `array`, and `object`.

## Agent-Aware Implementation Guidance

`implementation_guidance` is an optional event field. It is meant to help developers and AI IDE assistants place instrumentation correctly, while leaving validation and enforcement to deterministic Trackboard systems.

Example:

```json
{
  "event_name": "CheckoutCompleted",
  "description": "User successfully completed a purchase.",
  "implementation_guidance": {
    "trigger_when": [
      "Payment provider checkout completion webhook succeeds"
    ],
    "do_not_trigger_when": [
      "Pay button is clicked",
      "Payment modal opens"
    ],
    "preferred_location": "server",
    "required_source": "payment_webhook",
    "lifecycle_stage": "conversion",
    "idempotency_key": "checkout_session_id",
    "privacy_notes": [
      "Do not include raw card, billing address, or secret token values."
    ],
    "code_examples": [
      {
        "language": "typescript",
        "framework": "node",
        "snippet": "trackCheckoutCompleted({ user_id, order_id, total, currency })"
      }
    ]
  },
  "properties": []
}
```

Supported fields:

- `trigger_when: string[]`
- `do_not_trigger_when: string[]`
- `preferred_location: "client" | "server" | "edge" | "mobile" | "backend_job" | "unknown"`
- `required_source: string | null`
- `lifecycle_stage: string | null`
- `idempotency_key: string | null`
- `privacy_notes: string[]`
- `code_examples: { language: string; framework?: string; snippet: string }[]`

Guidance is part of the contract review surface, not a runtime decision engine. MCP and docs present it as quoted product-authored context, not as instructions that can override system, developer, repository, or security rules. Trackboard Guard parses guidance-bearing contracts but ignores guidance when validating runtime payloads.

## Constraints

The first supported constraint is `enum_values`:

```json
{
  "name": "signup_method",
  "type": "string",
  "required": true,
  "constraints": {
    "enum_values": ["email", "google", "github"]
  }
}
```

## Examples

- [web-analytics.v1.json](../examples/contracts/web-analytics.v1.json)
- [web-analytics.breaking.json](../examples/contracts/web-analytics.breaking.json)
