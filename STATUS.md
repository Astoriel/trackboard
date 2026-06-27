# Project Status

**Status:** Active product prototype  
**Snapshot date:** 2026-06-27  
**Primary audience:** product analytics, data, and growth teams that need self-hosted tracking plan governance.

Trackboard is a full-stack tracking plan manager with a FastAPI backend, Next.js frontend, contract export, CLI checks, GitHub Action, generated TypeScript helpers, and a Go runtime validator called Trackboard Guard.

## Current Confidence

- Working: local Docker/dev setup, API models, auth flow, tracking plan CRUD, validation engine, version snapshots, merge requests, frontend dashboard pages.
- Working: canonical `trackboard.contract.v1` export from published plans.
- Working: CLI validation, contract diff, breaking-change detection, and TypeScript code generation.
- Working: GitHub Action wrapper that reports breaking/safe/informational changes in PR summaries.
- Working: Guard runtime validation for Segment-compatible `/v1/track` events, HTTP forwarding, SQLite outbox, DLQ, retry worker, metrics, and DLQ replay.
- Planned: hosted demo, wider destination catalog, more SDK targets, and hardened multi-tenant production operations.
- Not claimed: Segment Protocols parity, Avo feature parity, enterprise SSO, high-scale SLA, or a hosted commercial service.

## Release Boundary

The v1 bar is a useful OSS workflow:

1. Define or import a tracking plan.
2. Publish a canonical contract.
3. Check contract changes in CI.
4. Generate typed tracking helpers.
5. Validate runtime events with Guard.
6. Inspect and replay rejected events when contracts are fixed.

That is the product. Larger governance features are intentionally kept out of the current claim until they exist as tested code.
