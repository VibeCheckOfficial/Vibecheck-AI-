# VibeCheck Documentation

Welcome to the VibeCheck documentation. This directory contains all technical documentation organized by category.

## Quick Links

| Category | Description |
|----------|-------------|
| [Architecture](./architecture/) | System design and component diagrams |
| [Security](./security/) | Security policies, audits, and hardening guides |
| [Operations](./operations/) | Runbooks, disaster recovery, and operational procedures |
| [Releases](./releases/) | Migration guides, release notes, and upgrade procedures |
| [Specs](./specs/) | Technical specifications and feature designs |
| [Guides](./guides/) | Developer guides and best practices |

---

## Architecture

High-level system design and architectural decisions.

- [Architecture Overview](./architecture/ARCHITECTURE.md) - System architecture and component design
- [Scanner Architecture](./architecture/SCANNER_ARCH.md) - Code scanner implementation details

---

## Security

Security documentation, policies, and audit findings.

### Policies & Controls
- [Security Policy](../SECURITY.md) - Security vulnerability reporting (root)
- [Threat Model](./security/THREAT_MODEL.md) - Security threat analysis
- [Guardrail Policy](./security/GUARDRAIL_POLICY.md) - Safety guardrails and policies
- [Abuse Controls](./security/ABUSE_CONTROLS.md) - Anti-abuse mechanisms
- [Abuse Controls Implementation](./security/ABUSE_CONTROLS_IMPLEMENTATION.md) - Implementation details

### Hardening
- [Hardening Summary](./security/HARDENING_SUMMARY.md) - Overview of hardening measures
- [Security Hardening Summary](./security/SECURITY_HARDENING_SUMMARY.md) - Detailed hardening documentation
- [API Hardening](./security/API_HARDENING.md) - API security measures
- [Extension Hardening](./security/EXTENSION_HARDENING.md) - VS Code extension security
- [Webhook Security](./security/WEBHOOK_SECURITY.md) - Webhook security implementation
- [Autofix Safety](./security/AUTOFIX_SAFETY.md) - Autofix feature safety measures

### Secrets & Credentials
- [Secrets Management](./security/SECRETS.md) - Secrets handling guide
- [Secret Management Summary](./security/SECRET_MANAGEMENT_SUMMARY.md) - Secrets overview

### Audits & Reviews
- [Security Audit Summary](./security/SECURITY_AUDIT_SUMMARY.md) - Audit findings overview
- [Security Review Findings](./security/SECURITY_REVIEW_FINDINGS.md) - Detailed review findings
- [Security Performance Review](./security/SECURITY_PERF_REVIEW.md) - Performance impact analysis
- [Security Fixes](./security/SECURITY_FIXES.md) - Security fix changelog
- [Security Regression Checklist](./security/SECURITY_REGRESSION_CHECKLIST.md) - Regression testing checklist

---

## Operations

Operational procedures, runbooks, and incident response.

### Disaster Recovery
- [Disaster Recovery](./operations/DISASTER_RECOVERY.md) - DR procedures
- [Disaster Recovery README](./operations/DISASTER_RECOVERY_README.md) - DR quick reference

### Runbooks
- [Reality Mode Runbook](./operations/REALITY_MODE_RUNBOOK.md) - Reality mode operations
- [Rotation Playbook](./operations/ROTATION_PLAYBOOK.md) - Key rotation procedures
- [Game Day Checklist](./operations/GAME_DAY_CHECKLIST.md) - Incident simulation checklist

---

## Releases

Release management, migration guides, and upgrade procedures.

### Migration Guides
- [Migration Notes](./releases/MIGRATION_NOTES.md) - General migration documentation
- [Migration Notes - Reality Mode](./releases/MIGRATION_NOTES_REALITY_MODE.md) - Reality mode migration
- [Migration Rollback](./releases/MIGRATION_ROLLBACK.md) - Rollback procedures

### Merge Documentation
- [Merge Map](./releases/MERGE_MAP.md) - Feature merge tracking
- [Merge Map - Extension](./releases/MERGE_MAP_EXTENSION.md) - Extension merge details
- [Merge Map - Reality Mode](./releases/MERGE_MAP_REALITY_MODE.md) - Reality mode merge details

### Release Planning
- [Production Readiness Map](./releases/PRODUCTION_READINESS_MAP.md) - Production checklist
- [Release Gate Notes](./releases/RELEASE_GATE_NOTES.md) - Release gate criteria
- [QA Checklist - Extension Merge](./releases/QA_CHECKLIST_EXTENSION_MERGE.md) - QA verification

### Upgrade Guides
- [Update Compatibility](./releases/UPDATE_COMPATIBILITY.md) - Version compatibility
- [Update Compatibility Summary](./releases/UPDATE_COMPATIBILITY_SUMMARY.md) - Compatibility overview
- [Upgrade Copy Pack](./releases/UPGRADE_COPY_PACK.md) - Upgrade messaging
- [Upgrade UX Spec](./releases/UPGRADE_UX_SPEC.md) - Upgrade user experience

### Release Reports
- [Launch Report](./releases/LAUNCH_REPORT.md) - Launch status report
- [Implementation Complete](./releases/IMPLEMENTATION_COMPLETE.md) - Implementation summary

---

## Specs

Technical specifications and feature designs.

### Core Features
- [Reality Mode Spec](./specs/REALITY_MODE_SPEC.md) - Reality mode feature specification
- [Agent Firewall](./specs/agent-firewall.md) - Agent firewall design
- [Agent Firewall Hooks](./specs/agent-firewall-hooks.md) - Firewall hook system
- [Truthpack Spec](./specs/truthpack-spec.md) - Truthpack format specification

### Configuration & CLI
- [Configuration](./specs/CONFIG.md) - Configuration options
- [CLI Performance](./specs/CLI_PERF.md) - CLI performance specifications

### Extension
- [Extension Onboarding Spec](./specs/EXT_ONBOARDING_SPEC.md) - Onboarding flow design
- [File Lock Spec](./specs/FILE_LOCK_SPEC.md) - File locking mechanism

---

## Guides

Developer guides and best practices.

- [Hallucination Reduction](./guides/HALLUCINATION-REDUCTION.md) - Techniques for reducing AI hallucinations

---

## Root-Level Documentation

Standard project documentation files in the repository root:

| File | Description |
|------|-------------|
| [README.md](../README.md) | Project overview and quick start |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Community code of conduct |
| [CHANGELOG.md](../CHANGELOG.md) | Version history and changes |
| [SECURITY.md](../SECURITY.md) | Security policy and reporting |
| [LICENSE](../LICENSE) | Project license |
| [PRIVACY.md](../PRIVACY.md) | Privacy policy |
| [TERMS.md](../TERMS.md) | Terms of service |
| [SUPPORT.md](../SUPPORT.md) | Support resources |

---

## Contributing to Documentation

When adding new documentation:

1. **Choose the right category** - Place docs in the appropriate subfolder
2. **Follow naming conventions** - Use `SCREAMING_SNAKE_CASE.md` for formal docs
3. **Update this index** - Add links to new documents in this README
4. **Cross-reference** - Link related documents to each other
