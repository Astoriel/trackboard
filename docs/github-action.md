# GitHub Action

`actions/contract-check` wraps the CLI diff command for pull requests.

```yaml
- uses: Astoriel/trackboard/actions/contract-check@v1
  with:
    base-contract: tracking/contract.main.json
    head-contract: tracking/contract.pr.json
    fail-on-breaking: "true"
```

The action writes a Markdown summary and exposes:

- `breaking`
- `breaking-count`
- `summary-json`

Use it when a repository stores exported Trackboard contracts alongside product or analytics code.
