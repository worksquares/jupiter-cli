# SSL/TLS Implementation Guide

## Overview

This guide covers SSL/TLS implementation for both Azure Container Instances and Static Web Apps in the Intelligent Agent System.

## Current Implementation

### Azure Static Web Apps
- **Status**: ✅ Fully Implemented
- **Method**: Automatic Azure-managed certificates
- **Configuration**: No additional configuration required
- **Renewal**: Automatic

### Azure Container Instances
- **Status**: 🟡 Partially Implemented
- **Method**: Caddy reverse proxy sidecar
- **Configuration**: Manual setup required
- **Renewal**: Automatic via Caddy

## Container SSL Implementation

### Using Caddy (Current Approach)

The Unified Domain Manager automatically adds a Caddy sidecar container when SSL is requested:

```typescript
const deployment = await domainManager.deployContainerWithDomain(
  'my-api',
  { image: 'my-app:latest' },
  { ssl: true } // This adds Caddy sidecar
);
```

This creates:
1. Main application container (port 8080)
2. Caddy container (ports 80, 443)
3. Automatic Let's Encrypt certificates

### Caddy Configuration

```dockerfile
# Caddyfile for automatic HTTPS
{
    email admin@digisquares.in
}

:443 {
    reverse_proxy localhost:8080
    encode gzip
    
    tls {
        on_demand
    }
}

:80 {
    redir https://{host}{uri} permanent
}
```

## Let's Encrypt Integration Options

### Option 1: Caddy (Recommended)
**Pros:**
- Automatic certificate management
- Zero-downtime renewal
- Built-in ACME client
- Minimal configuration

**Implementation:** Already included in Unified Domain Manager

### Option 2: Certbot Sidecar
```yaml
containers:
  - name: app
    image: my-app
    ports: [8080]
  
  - name: certbot
    image: certbot/certbot
    command: certonly --webroot
    volumes:
      - letsencrypt:/etc/letsencrypt
  
  - name: nginx
    image: nginx
    ports: [80, 443]
    volumes:
      - letsencrypt:/etc/letsencrypt:ro
```

### Option 3: Azure Application Gateway
- Centralized SSL termination
- WAF capabilities
- Higher cost (~$200/month)

## Implementation Roadmap

### Phase 1: Basic SSL (Completed)
- [x] Caddy sidecar for containers
- [x] Automatic HTTPS redirect
- [x] Azure-managed SSL for Static Web Apps

### Phase 2: Advanced Features (Pending)
- [ ] Custom certificate support
- [ ] Wildcard certificates
- [ ] Certificate monitoring
- [ ] Multi-domain certificates

### Phase 3: Enterprise Features
- [ ] HSM integration
- [ ] Client certificate authentication
- [ ] Certificate transparency logging

## SSL Monitoring

### Health Checks
```typescript
interface SSLHealth {
  domain: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  daysRemaining: number;
  isValid: boolean;
}

async function checkSSLHealth(domain: string): Promise<SSLHealth> {
  // Implementation in progress
}
```

### Alerts
- Certificate expiry < 30 days
- Certificate validation failures
- SSL handshake errors

## Best Practices

1. **Always use HTTPS in production**
   ```typescript
   { ssl: true, environment: 'production' }
   ```

2. **HTTP Strict Transport Security (HSTS)**
   ```nginx
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
   ```

3. **Strong cipher suites**
   - TLS 1.2 minimum
   - Disable weak ciphers
   - Regular security updates

4. **Certificate pinning** (mobile apps)
   ```typescript
   const pins = [
     'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
   ];
   ```

## Troubleshooting

### Common Issues

1. **Certificate not issued**
   - Check DNS propagation
   - Verify domain ownership
   - Check rate limits

2. **Mixed content warnings**
   - Ensure all resources use HTTPS
   - Update hardcoded HTTP URLs

3. **Certificate renewal failures**
   - Check ACME challenge accessibility
   - Verify DNS records
   - Check container logs

### Debug Commands
```bash
# Check certificate
openssl s_client -connect domain.com:443 -servername domain.com

# Test SSL configuration
nmap --script ssl-enum-ciphers -p 443 domain.com

# Check certificate expiry
echo | openssl s_client -connect domain.com:443 2>/dev/null | openssl x509 -noout -dates
```

## Cost Considerations

| Solution | Monthly Cost | Notes |
|----------|-------------|-------|
| Let's Encrypt (Caddy) | $0 | Free certificates |
| Azure App Service Certificate | $70 | Managed by Azure |
| Azure Application Gateway | $200+ | Enterprise features |
| Custom Certificate | Varies | Manual management |

## Next Steps

1. **Implement certificate monitoring dashboard**
2. **Add support for custom certificates**
3. **Create automated SSL testing**
4. **Document wildcard certificate setup**

## References

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Caddy Documentation](https://caddyserver.com/docs/)
- [Azure SSL Documentation](https://docs.microsoft.com/azure/app-service/configure-ssl)
- [SSL Labs Best Practices](https://github.com/ssllabs/research/wiki/SSL-and-TLS-Deployment-Best-Practices)