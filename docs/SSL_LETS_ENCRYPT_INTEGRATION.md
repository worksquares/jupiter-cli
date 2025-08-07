# Let's Encrypt SSL Integration

## Overview

The Enhanced Domain Service includes automatic Let's Encrypt SSL certificate generation and management for all deployments. SSL is enabled by default and provides automatic renewal.

## Architecture

### Container SSL (via Caddy)

For Azure Container Instances, we use Caddy as a reverse proxy with built-in ACME client:

```
┌─────────────────────────────────────┐
│         Azure Container Group       │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────┐  ┌──────────────┐ │
│  │   Caddy     │  │     App      │ │
│  │  (SSL/TLS)  │─▶│  Container   │ │
│  │   Port 443  │  │   Port 8080  │ │
│  └─────────────┘  └──────────────┘ │
│                                     │
└─────────────────────────────────────┘
         ▲                ▲
         │                │
    HTTPS (443)      HTTP (80)
         │                │
    Let's Encrypt    Redirect to
     Certificate        HTTPS
```

### Static Web App SSL

Azure Static Web Apps provide automatic SSL:
- Managed by Azure
- No configuration required
- Automatic renewal
- Global CDN with SSL termination

## Features

### 1. Automatic Certificate Generation
- First HTTPS request triggers certificate generation
- Uses HTTP-01 challenge by default
- DNS-01 challenge available for wildcards
- Staging certificates for development

### 2. Auto-Renewal
- Monitors certificate expiration
- Renews 30 days before expiry
- Zero-downtime renewal
- Email notifications on issues

### 3. Security Headers
Automatically adds:
- Strict-Transport-Security (HSTS)
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Referrer-Policy

### 4. Error Handling
- Retry logic for Let's Encrypt API
- Fallback to HTTP if SSL fails
- Comprehensive error logging
- Health check integration

## Configuration

### Basic SSL Configuration

```typescript
{
  ssl: {
    enabled: true,              // Enable SSL (default: true)
    email: 'admin@domain.com',  // Required for Let's Encrypt
    staging: false              // Use production certificates
  }
}
```

### Advanced Configuration

```typescript
{
  ssl: {
    enabled: true,
    email: 'ssl@digisquares.in',
    staging: process.env.NODE_ENV !== 'production',
    autoRenew: true,
    renewBeforeDays: 30,
    challengeType: 'http-01',  // or 'dns-01' for wildcards
    keyType: 'ec',             // or 'rsa'
    keySize: 256               // 256 for EC, 2048/4096 for RSA
  }
}
```

## Usage Examples

### Deploy with SSL

```typescript
const result = await domainService.deployProjectWithEnhancedDomain(
  'my-project',
  {
    containerConfig: {
      image: 'nginx:alpine',
      cpu: 1,
      memoryGB: 1.5
    }
  },
  {
    service: 'aci',
    environment: 'production',
    ssl: {
      enabled: true,
      email: 'admin@example.com'
    }
  }
);

// Result: https://myproject.digisquares.in
```

### Multi-Environment SSL

```typescript
// Production: Real certificates
await deploy('production', {
  ssl: { staging: false }
});

// Staging: Let's Encrypt staging
await deploy('staging', {
  ssl: { staging: true }
});
```

## Caddy Configuration

The system automatically generates Caddy configuration:

```caddyfile
{
    email admin@digisquares.in
    acme_ca https://acme-v02.api.letsencrypt.org/directory
}

myapp.digisquares.in {
    reverse_proxy app:8080
    
    tls {
        on_demand
    }
    
    encode gzip
    
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
    }
    
    handle_errors {
        respond "{http.error.status_code} {http.error.status_text}"
    }
}
```

## Rate Limits

Let's Encrypt has rate limits to prevent abuse:

| Limit | Value | Period |
|-------|-------|--------|
| Certificates per Registered Domain | 50 | Per week |
| Duplicate Certificates | 5 | Per week |
| Failed Validations | 5 | Per hour |
| Accounts per IP | 10 | Per 3 hours |
| New Orders | 300 | Per 3 hours |

The service tracks these limits and implements:
- Request throttling
- Duplicate detection
- Staging mode for development

## Certificate Storage

Certificates are stored in:
- **Memory**: Active certificates cached
- **File System**: `/etc/letsencrypt/live/domain/`
- **Database**: Metadata and tracking

Structure:
```
/etc/letsencrypt/live/
├── myapp.digisquares.in/
│   ├── cert.pem        # Certificate
│   ├── chain.pem       # Intermediate certificates
│   ├── fullchain.pem   # cert.pem + chain.pem
│   ├── privkey.pem     # Private key
│   └── cert.json       # Metadata
```

## Monitoring

### Certificate Status

```typescript
const certInfo = await sslService.getCertificateInfo('myapp.digisquares.in');

// Returns:
{
  exists: true,
  valid: true,
  info: {
    issuer: "Let's Encrypt",
    validFrom: "2024-01-01T00:00:00Z",
    validTo: "2024-03-31T23:59:59Z",
    daysRemaining: 89,
    altNames: ["myapp.digisquares.in", "www.myapp.digisquares.in"]
  }
}
```

### Events

```typescript
domainService.on('ssl-certificate-generated', (event) => {
  console.log(`Certificate generated for ${event.domain}`);
});

domainService.on('ssl-certificate-renewed', (event) => {
  console.log(`Certificate renewed for ${event.domain}`);
});

domainService.on('ssl-certificate-expiring', (event) => {
  console.log(`Certificate expiring in ${event.daysRemaining} days`);
});
```

## Troubleshooting

### Certificate Not Generating

1. **Check DNS propagation**
   ```bash
   nslookup myapp.digisquares.in
   ```

2. **Verify port 80 is accessible**
   - Required for HTTP-01 challenge
   - Caddy handles the challenge automatically

3. **Check rate limits**
   - Use staging certificates for testing
   - Wait if rate limited

### Certificate Renewal Issues

1. **Manual renewal**
   ```typescript
   await sslService.generateCertificate('myapp.digisquares.in', {
     force: true
   });
   ```

2. **Check logs**
   - Caddy logs: Container logs
   - Service logs: Application logs

### SSL Not Working

1. **Verify HTTPS port (443) is open**
2. **Check certificate validity**
3. **Test with curl**
   ```bash
   curl -v https://myapp.digisquares.in
   ```

## Best Practices

1. **Use production certificates only in production**
   - Staging certificates for dev/test
   - Prevents rate limit issues

2. **Monitor certificate expiration**
   - Set up alerts for < 14 days
   - Enable auto-renewal

3. **Backup certificates**
   - Export before major changes
   - Store securely

4. **Use appropriate key types**
   - EC (ECDSA) for performance
   - RSA for compatibility

5. **Test SSL configuration**
   - Use SSL Labs test
   - Check security headers

## Cost

Let's Encrypt certificates are **FREE**. Costs include:
- Caddy container resources (~$5/month)
- Certificate storage (minimal)
- No per-certificate fees

## Future Enhancements

1. **Wildcard Certificates**
   - DNS-01 challenge implementation
   - `*.app.digisquares.in` support

2. **Custom Certificates**
   - Upload existing certificates
   - Integration with Azure Key Vault

3. **Certificate Transparency**
   - Monitor certificate issuance
   - Detect unauthorized certificates

4. **DANE/TLSA Records**
   - DNS-based certificate pinning
   - Enhanced security