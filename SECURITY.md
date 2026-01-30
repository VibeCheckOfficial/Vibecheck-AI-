# Security Policy

## Our Commitment

The security of VibeCheck and our users is our top priority. We take all security vulnerabilities seriously and appreciate the security research community's efforts in responsibly disclosing issues.

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
|---------|--------------------|
| 1.x.x   | ✅ Active support   |
| < 1.0   | ❌ No longer supported |

We recommend always running the latest version to ensure you have all security patches.

## Reporting a Vulnerability

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, report vulnerabilities through one of these channels:

1. **Email**: [security@vibecheckai.dev](mailto:security@vibecheckai.dev)
2. **GitHub Security Advisory**: [Report a vulnerability](https://github.com/vibecheckai/vibecheck/security/advisories/new)

### What to Include

Please include as much of the following information as possible:

- **Type of vulnerability** (e.g., XSS, injection, privilege escalation)
- **Affected components** (e.g., @vibecheck/core, CLI, VS Code extension)
- **Step-by-step reproduction instructions**
- **Proof-of-concept or exploit code** (if possible)
- **Impact assessment** — what an attacker could achieve
- **Any suggested fixes** (optional but appreciated)

### Example Report

```
Subject: [SECURITY] Path traversal in truthpack scanner

Type: Path Traversal
Affected: @vibecheck/core v1.2.3
Severity: High

Description:
The RouteScanner does not properly sanitize file paths when scanning
for route definitions, allowing an attacker to...

Reproduction:
1. Create a file at `../../etc/passwd` relative to project root
2. Run `vibecheck scan`
3. Observe that the scanner reads outside the project directory

Impact:
An attacker with write access to the project could read arbitrary
files on the system by crafting malicious symlinks or path references.

Suggested Fix:
Implement path canonicalization and ensure all scanned paths are
within the project root.
```

## Response Timeline

We are committed to responding quickly to security reports:

| Stage | Target Time |
|-------|-------------|
| Initial acknowledgment | Within 24 hours |
| Preliminary assessment | Within 72 hours |
| Status update (if complex) | Weekly |
| Fix development | Varies by severity |
| Public disclosure | After fix is available |

### Severity Levels

| Severity | Description | Target Fix Time |
|----------|-------------|-----------------|
| **Critical** | Remote code execution, data breach | 24-48 hours |
| **High** | Privilege escalation, significant data exposure | 7 days |
| **Medium** | Limited data exposure, DoS | 30 days |
| **Low** | Minor issues, hardening | 90 days |

## Disclosure Policy

We follow **coordinated disclosure**:

1. You report the vulnerability to us privately
2. We work together to understand and fix the issue
3. We prepare a fix and security advisory
4. We release the fix and publish the advisory
5. After 90 days (or earlier if mutually agreed), full details may be published

### Credit

We believe in giving credit where it's due. If you report a valid security vulnerability:

- You will be credited in our security advisory (unless you prefer anonymity)
- You will be listed in our [Security Hall of Fame](https://vibecheckai.dev/security/hall-of-fame)
- For significant findings, we may offer recognition or rewards

## Security Best Practices for Users

### CLI Usage

```bash
# Always verify the package before installing
npm view @vibecheck/cli

# Use exact versions in production
npm install @vibecheck/cli@1.0.0 --save-exact

# Verify installation integrity
npm audit
```

### Configuration

```json
{
  "firewall": {
    "strictMode": true,        // Recommended for production
    "mode": "enforce",         // Don't use "observe" in production
    "enableAuditLog": true     // Keep audit trail
  }
}
```

### Environment Variables

- Never commit `.env` files with secrets
- Use `.env.example` for documentation
- VibeCheck never transmits environment variable values, only names

### MCP Server Security

When running the MCP server:

```bash
# Bind to localhost only (default)
vibecheck-mcp --host 127.0.0.1

# Don't expose to network unless necessary
# If you must, use authentication and TLS
```

## Security Measures in VibeCheck

### What We Don't Do

- ❌ **No telemetry** — We don't collect usage data
- ❌ **No network calls** — Core scanning is fully offline
- ❌ **No secret storage** — We never store your secrets
- ❌ **No code execution** — We analyze code, never run it

### What We Do

- ✅ **Input validation** — All user input is validated with Zod schemas
- ✅ **Path sanitization** — File operations are restricted to project root
- ✅ **Audit logging** — All firewall decisions are logged locally
- ✅ **Dependency scanning** — We regularly audit our dependencies
- ✅ **Signed releases** — NPM packages are published with provenance

### Dependency Security

We use:
- **Dependabot** for automated dependency updates
- **npm audit** in CI/CD pipelines
- **Socket.dev** for supply chain security (planned)

## Security Updates

Subscribe to security updates:

1. **Watch this repository** — Enable "Security alerts"
2. **Follow @vibecheckai** — Security announcements on Twitter
3. **Join Discord** — #security-announcements channel

## Scope

### In Scope

- **@vibecheck/core** — Core library
- **@vibecheck/cli** — Command-line interface
- **@vibecheck/mcp-server** — MCP server
- **vibecheck-extension** — VS Code extension
- **vibecheckai.dev** — Our website

### Out of Scope

- Third-party dependencies (report to the respective maintainers)
- Self-hosted instances with custom modifications
- Social engineering attacks
- Physical security
- Denial of service attacks without significant impact

## Legal Safe Harbor

We consider security research and vulnerability disclosure conducted in accordance with this policy to be:

- **Authorized** under the Computer Fraud and Abuse Act (CFAA)
- **Authorized** under similar laws in other jurisdictions
- **Exempt** from DMCA anti-circumvention provisions

We will not pursue civil or criminal action against researchers who:

- Act in good faith
- Make a reasonable effort to avoid privacy violations, data destruction, or service interruption
- Follow this disclosure policy
- Do not exploit the vulnerability beyond what is necessary to demonstrate it

## Contact

- **Security Team**: [security@vibecheckai.dev](mailto:security@vibecheckai.dev)
- **PGP Key**: [keys.openpgp.org/vks/v1/by-fingerprint/...](https://keys.openpgp.org)
- **General Support**: [support@vibecheckai.dev](mailto:support@vibecheckai.dev)

---

Thank you for helping keep VibeCheck and our community safe! 🛡️
