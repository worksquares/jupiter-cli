# Security Policy

## Our Commitment to Security

Security is a top priority for Jupiter CLI. We are committed to protecting our users and their data by implementing industry-standard security practices and responding promptly to security concerns.

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          | End of Support |
| ------- | ------------------ | -------------- |
| 0.1.x   | ✅ Yes             | TBD            |
| < 0.1.0 | ❌ No              | 2025-01-06     |

**Recommendation**: Always use the latest version of Jupiter CLI to ensure you have the most recent security patches.

## Security Features

Jupiter CLI includes several built-in security features:

### 🔒 Input Sanitization
- All user inputs are sanitized to prevent injection attacks
- XSS (Cross-Site Scripting) protection
- Path traversal prevention
- Command injection prevention

### 🛡️ Secure Credential Management
- API keys stored in environment variables
- No credentials logged or transmitted insecurely
- Secure configuration file permissions
- Support for encrypted credential storage

### 🐳 Sandbox Execution
- Optional isolated execution environment
- Docker/Podman containerization support
- Resource limits and access controls
- Network isolation options

### 📝 Privacy Protection
- No telemetry or usage tracking
- No data collection without explicit consent
- Local-first architecture
- Transparent data handling

### 🔐 API Security
- Secure HTTPS connections to all providers
- Certificate validation
- Rate limiting to prevent abuse
- Timeout handling

## Reporting a Vulnerability

We take all security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### Where to Report

**Email**: security@jupiter.digisquares.com

**PGP Key**: Available upon request

### What to Include

Please provide the following information in your report:

1. **Description**: Clear description of the vulnerability
2. **Impact**: Potential impact and severity
3. **Reproduction Steps**: Detailed steps to reproduce the issue
4. **Proof of Concept**: If applicable, proof of concept code
5. **Affected Versions**: Which versions are affected
6. **Suggested Fix**: If you have ideas for fixing the issue
7. **Your Contact Info**: So we can follow up with you

### Example Report

```markdown
**Vulnerability Type**: [e.g., Command Injection, XSS, etc.]

**Severity**: [Critical/High/Medium/Low]

**Description**:
A clear and concise description of the vulnerability.

**Steps to Reproduce**:
1. Step one
2. Step two
3. Step three

**Expected Behavior**:
What should happen.

**Actual Behavior**:
What actually happens (the vulnerability).

**Proof of Concept**:
[Code or commands demonstrating the vulnerability]

**Impact**:
What an attacker could do with this vulnerability.

**Affected Versions**:
Which versions of Jupiter CLI are vulnerable.

**Suggested Mitigation**:
Any ideas you have for fixing the issue.
```

## Response Timeline

We are committed to responding to security reports promptly:

| Stage | Timeline |
|-------|----------|
| **Initial Response** | Within 24 hours |
| **Confirmation** | Within 72 hours |
| **Status Update** | Weekly |
| **Fix Development** | Based on severity |
| **Security Patch** | As soon as possible |
| **Public Disclosure** | After fix is released |

### Severity Levels

**Critical** (Fix within 24-48 hours)
- Remote code execution
- Authentication bypass
- Data breach potential
- Complete system compromise

**High** (Fix within 1 week)
- Privilege escalation
- Significant data exposure
- Denial of service
- Security feature bypass

**Medium** (Fix within 2-4 weeks)
- Information disclosure
- Limited scope vulnerabilities
- Security configuration issues

**Low** (Fix in next release)
- Minor information leaks
- Security improvements
- Best practice violations

## Security Update Process

When we release security updates:

1. **Patch Development**: We develop and test the fix
2. **Version Release**: New version published to npm
3. **Security Advisory**: Published on GitHub
4. **CHANGELOG Update**: Security fix documented
5. **User Notification**: Announcement via GitHub and website
6. **CVE Assignment**: If applicable, CVE ID assigned

## Disclosure Policy

We follow responsible disclosure practices:

### Private Disclosure

1. Security researcher reports vulnerability privately
2. We confirm and develop a fix
3. Coordinated disclosure timeline agreed upon (typically 90 days)
4. Fix is released before public disclosure

### Public Disclosure

After a fix is released, we publish:

- **Security Advisory**: Details on GitHub
- **CVE**: If applicable
- **CHANGELOG Entry**: Description of the fix
- **Blog Post**: For critical issues
- **Credit**: Recognition for the reporter (if desired)

## Security Best Practices for Users

### API Key Management

```bash
# ✅ Good - Use environment variables
export DIGISQUARES_API_KEY=DS_your_key_here
export OPENAI_API_KEY=sk_your_key_here

# ❌ Bad - Never hardcode keys
# const apiKey = "sk_hardcoded_key_here"
```

### Configuration Security

```bash
# Set proper file permissions
chmod 600 ~/.jupiter/.keys
chmod 700 ~/.jupiter/

# Use the included security script
./scripts/fix-permissions.sh
```

### Network Security

```bash
# Always use HTTPS endpoints
export AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com

# Enable certificate validation
export NODE_TLS_REJECT_UNAUTHORIZED=1
```

### Sandbox Mode

```bash
# Use sandbox for untrusted code execution
jupiter --sandbox

# Specify sandbox backend
export JUPITER_SANDBOX=docker

# Limit sandbox resources
export SANDBOX_MEMORY_LIMIT=512m
export SANDBOX_CPU_LIMIT=1.0
```

## Known Security Considerations

### AI-Generated Code

Jupiter CLI generates code using AI. Be aware that:

- AI-generated code should be reviewed before execution
- Generated code may contain vulnerabilities
- Use YOLO mode only in trusted environments
- Always validate external inputs in generated code

### Provider Security

When using different AI providers:

- Each provider has its own security policies
- API keys grant access to your provider accounts
- Review provider terms of service
- Monitor API usage for unauthorized access
- Rotate API keys regularly

### Local File Access

Jupiter CLI can read and write local files:

- File operations are restricted to current directory by default
- Path traversal protection is implemented
- Review file operations before confirming (unless in YOLO mode)
- Use `.gitignore` to exclude sensitive files from context

## Security Scanning

Jupiter CLI undergoes regular security scanning:

### Automated Scanning
- ✅ npm audit (dependency scanning)
- ✅ Dependabot security alerts
- ✅ CodeQL static analysis
- ✅ SAST (Static Application Security Testing)

### Manual Review
- Code reviews for security issues
- Penetration testing (planned)
- Third-party security audits (planned for v1.0)

## Compliance

Jupiter CLI is designed with compliance in mind:

- **GDPR**: No personal data collection without consent
- **SOC 2**: Security controls implemented
- **OWASP**: Following OWASP top 10 guidelines
- **CIS**: Following CIS benchmarks where applicable

## Security Resources

### Documentation
- [Input Sanitization Guide](docs/SECURITY_INPUT_SANITIZATION.md)
- [Sandbox Security](docs/SECURITY_SANDBOX.md)
- [Secure Configuration](docs/SECURITY_CONFIGURATION.md)

### External Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## Security Hall of Fame

We recognize security researchers who help improve Jupiter CLI:

<!-- Security researchers will be listed here after their first report -->

*Be the first to help improve Jupiter CLI security!*

## Contact

For security inquiries:

- **Security Issues**: security@jupiter.digisquares.com
- **General Support**: support@jupiter.digisquares.com
- **GitHub Security**: https://github.com/worksquares/jupiter-cli/security

## Bug Bounty Program

Currently, we do not offer a formal bug bounty program. However, we deeply appreciate security research and will:

- Publicly acknowledge your contribution (if desired)
- Provide swag and merchandise for significant findings
- Fast-track feature requests from security contributors
- Offer priority support

*A formal bug bounty program is planned for the future.*

## Legal Safe Harbor

We support responsible disclosure and will not pursue legal action against security researchers who:

- Make a good faith effort to avoid privacy violations and data destruction
- Report vulnerabilities privately before public disclosure
- Avoid exploiting vulnerabilities beyond what's necessary to demonstrate the issue
- Follow the disclosure timeline we agree upon
- Comply with all applicable laws and regulations

## Acknowledgments

We thank:

- The security research community
- All reporters who have helped improve Jupiter CLI
- The open source security community
- Users who practice secure coding

---

**Last Updated**: 2025-01-18
**Version**: 1.0

Thank you for helping keep Jupiter CLI and our users safe! 🔒

*Security is everyone's responsibility. If you see something, say something.*
