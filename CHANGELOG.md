# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of VibeCheck hallucination prevention system
- Truthpack generation with scanners for:
  - Next.js App Router and Pages Router
  - Express.js routes
  - Fastify routes
  - Hono routes
  - Environment variables (.env and process.env)
  - Authentication middleware and roles
  - API contracts (OpenAPI, Zod schemas)
- Agent Firewall with:
  - Claim extraction (imports, API endpoints, env vars, types)
  - Evidence resolution against truthpack
  - Policy engine with ghost-* rules
  - Unblock planner with actionable fix suggestions
  - Audit logging
- MCP Server integration:
  - `truthpack_generate` tool
  - `truthpack_query` tool
  - `firewall_evaluate` tool
  - `register_route` tool
  - `register_env` tool
- CLI commands:
  - `vibecheck init`
  - `vibecheck scan`
  - `vibecheck check`
  - `vibecheck validate`
  - `vibecheck watch`
  - `vibecheck firewall status`
- VS Code Extension:
  - Real-time validation on save
  - Truthpack explorer sidebar
  - Inline diagnostics
  - Status bar indicator
- Context management with freshness scoring
- Hallucination detector with multi-source verification

### Security
- All processing happens locally — no code transmitted
- Environment variable values never stored, only names
- Audit trail for all firewall decisions

---

## Version History

### Versioning Scheme

We use [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward compatible

### Pre-release Tags

- `alpha`: Early testing, unstable API
- `beta`: Feature complete, may have bugs
- `rc`: Release candidate, final testing

Example: `1.0.0-beta.1`

---

## Release Process

1. Update version in `package.json` files
2. Update this CHANGELOG
3. Create git tag: `git tag v1.0.0`
4. Push: `git push origin main --tags`
5. GitHub Actions publishes to npm

---

## Links

- [Releases](https://github.com/vibecheckai/vibecheck/releases)
- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)

[Unreleased]: https://github.com/vibecheckai/vibecheck/compare/v1.0.0...HEAD
