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

Each property has:

- `name`
- `type`
- `required`
- optional `constraints`
- optional `description`
- optional `examples`

Supported primitive types are `string`, `integer`, `float`, `boolean`, `array`, and `object`.

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
