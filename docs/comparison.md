# Product Comparison

Trackboard is best understood as an open-source, self-hosted tracking plan workflow.

## Compared With Hosted Tracking Plan Tools

Hosted tools such as Avo validate that the market exists: teams already pay to manage analytics events, tracking plans, and generated event code.

Trackboard chooses a different tradeoff:

- self-hosted by default,
- contracts stored as portable JSON,
- CI checks available without a SaaS account,
- runtime validation available as a small Go service,
- narrower feature surface for a solo-maintainable OSS project.

## Compared With Spreadsheets

Spreadsheets are flexible but weak at review, versioning, CI, and runtime enforcement. Trackboard turns the plan into an artifact that can be checked before merge and enforced after deploy.

## Compared With Warehouse-Only Validation

Warehouse validation finds problems after data has already arrived. Guard catches contract violations before forwarding, while DLQ replay keeps a recovery path for events that were blocked by a contract mismatch.
