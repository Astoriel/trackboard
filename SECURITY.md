# Security Notes

**Snapshot date:** 2026-04-15

- Replace all `.env.example` secrets before any public or shared deployment.
- Use HTTPS and a proper secret manager for JWT secrets, API keys, webhook secrets, and AI provider credentials.
- Review webhook destinations and SSRF protections before enabling integrations outside local development.
- Treat API keys created inside Trackboard as credentials; store only hashed values where possible and rotate test keys regularly.
- The repository is self-hosted software, not a hosted security-reviewed service.

