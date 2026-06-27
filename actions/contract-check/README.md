# Trackboard Contract Check Action

Use this action to fail a pull request when a proposed tracking contract introduces breaking changes.

```yaml
- uses: Astoriel/trackboard/actions/contract-check@v1
  with:
    base-contract: tracking/contract.main.json
    head-contract: tracking/contract.pr.json
    fail-on-breaking: "true"
```

The action writes a Markdown summary with breaking, safe, and informational changes. It also exposes:

- `breaking`
- `breaking-count`
- `summary-json`
