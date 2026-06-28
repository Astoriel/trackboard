# Project Status

**Status:** Active product prototype  
**Snapshot date:** 2026-06-28  
**Primary audience:** product analytics, data, and growth teams that need self-hosted tracking plan governance.

Trackboard is a full-stack tracking plan manager with a FastAPI backend, Next.js frontend, contract export, CLI checks, GitHub Action, generated TypeScript helpers, and a Go runtime validator called Trackboard Guard.

The AI-native roadmap extends that same contract artifact to coding agents. The intended model is: humans author tracking plans and implementation guidance, AI tools read that context, and deterministic Trackboard systems enforce correctness.

## Current Confidence

- Working: local Docker/dev setup, API models, auth flow, tracking plan CRUD, validation engine, version snapshots, merge requests, frontend dashboard pages.
- Working: canonical `trackboard.contract.v1` export from published plans.
- Working: CLI validation, contract diff, breaking-change detection, and TypeScript code generation.
- Working: GitHub Action wrapper that reports breaking/safe/informational changes in PR summaries.
- Working: Guard runtime validation for Segment-compatible `/v1/track` events, HTTP forwarding, single-node SQLite outbox, DLQ, retry worker, metrics, and DLQ replay.
- Working: optional `implementation_guidance` in exported contract events for agent-aware instrumentation context.
- Working: local-file read-only MCP server for local/dev AI IDE workflows over exported contracts.
- Planned: UI/API persistence for editing implementation guidance inside Trackboard.
- Planned: API-backed MCP mode with scoped read tokens.
- Planned: advisory GitHub coverage suggestions for missing instrumentation; these should not block merges.
- Planned: hosted demo, wider destination catalog, more SDK targets, a pluggable queue backend for high-throughput Guard deployments, and hardened multi-tenant production operations.
- Not claimed: Segment Protocols parity, Avo feature parity, enterprise SSO, high-scale SLA, or a hosted commercial service.
- Not claimed: runtime AI validation, AI-generated contract publishing, write-capable MCP tools, remote hosted MCP, or AI guarantees that instrumentation is correct.

## Release Boundary

The v1 bar is a useful OSS workflow:

1. Define or import a tracking plan.
2. Publish a canonical contract.
3. Check contract changes in CI.
4. Generate typed tracking helpers.
5. Validate runtime events with Guard.
6. Inspect and replay rejected events when contracts are fixed.

That is the product. Larger governance features are intentionally kept out of the current claim until they exist as tested code.

Agent-aware contracts fit into that boundary only when they preserve the split: AI can help find and explain the right event, while CLI checks, generated types, API validation, GitHub Action checks, and Guard remain the source of enforcement.
