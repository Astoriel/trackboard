# Product Comparison

Trackboard is best understood as an open-source, self-hosted tracking plan workflow.

## Compared With Hosted Tracking Plan Tools

Hosted tools such as Avo validate that the market exists: teams already pay to manage analytics events, tracking plans, and generated event code.

Trackboard chooses a different tradeoff:

- self-hosted by default,
- contracts stored as portable JSON,
- CI checks available without a SaaS account,
- runtime validation available as a small Go service,
- planned agent-aware implementation guidance that can be read by AI IDEs without giving them write access,
- narrower feature surface for a solo-maintainable OSS project.

## Compared With Spreadsheets

Spreadsheets are flexible but weak at review, versioning, CI, and runtime enforcement. Trackboard turns the plan into an artifact that can be checked before merge and enforced after deploy.

## Compared With Warehouse-Only Validation

Warehouse validation finds problems after data has already arrived. Guard catches contract violations before forwarding, while DLQ replay keeps a recovery path for events that were blocked by a contract mismatch.

## Compared With AI-Only Instrumentation

AI coding agents can help developers find where instrumentation belongs, but they should not become the tracking plan source of truth. Trackboard's planned AI-native workflow keeps human-authored contracts and implementation guidance in the contract artifact, exposes that context through read-only MCP, and leaves correctness to deterministic checks.

That means:

- AI can search events, read guidance, and suggest code.
- Humans still approve tracking plan changes.
- CLI, GitHub Action, generated types, API validation, and Guard still enforce the contract.
- Guard does not call a model while accepting or rejecting production events.

Planned GitHub coverage suggestions should remain advisory. They can point out that a PR may be missing an event, but they should not block a merge on model output alone.

## Semantic Consistency And DLQ Triage

Trackboard's consistency and triage direction follows the same split:

- deterministic scoring identifies similar events and explains evidence,
- optional AI can summarize why the deterministic candidates matter,
- deterministic fingerprints group DLQ failures,
- optional AI can turn a grouped failure into a readable incident note,
- humans still decide whether to reuse an event, fix instrumentation, or update a contract.

This is intentionally different from an AI-only governance layer. AI output is explanatory and suggestive; it is not the source of truth for contract acceptance, runtime validation, replay, or publishing.
