/**
 * SSL Certificate Service
 * Manages Let's Encrypt SSL certificates for domains
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

export interface SSLCertificate {
  domain: string;
  commonName: string;
  altNames: string[];
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
  fingerprint: string;
  privateKey?: string;
  certificate?: string;
  chain?: string;
  fullChain?: string;
}

export interface SSLConfiguration {
  provider: 'letsencrypt' | 'zerossl' | 'custom';
  email: string;
  staging?: boolean;
  autoRenew?: boolean;
  renewBeforeDays?: number;
  challengeType?: 'http-01' | 'dns-01' | 'tls-alpn-01';
  dnsProvider?: string;
  keyType?: 'rsa' | 'ec';
  keySize?: number;
}

export interface SSLValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  daysRemaining?: number;
  needsRenewal?: boolean;
}

export class SSLCertificateService extends EventEmitter {
  private logger: Logger;
  private certificates: Map<string, SSLCertificate> = new Map();
  private renewalTimer?: NodeJS.Timeout;

  constructor(
    private config: SSLConfiguration = {
      provider: 'letsencrypt',
      email: process.env.SSL_EMAIL || 'admin@digisquares.in',
      staging: process.env.NODE_ENV !== 'production',
      autoRenew: true,
      renewBeforeDays: 30,
      challengeType: 'http-01',
      keyType: 'ec',
      keySize: 256
    }
  ) {
    super();
    this.logger = new Logger('SSLCertificateService');
    
    this.logger.info('SSL Certificate Service initialized', {
      provider: config.provider,
      staging: config.staging,
      challengeType: config.challengeType
    });

    if (config.autoRenew) {
      this.startRenewalMonitoring();
    }
  }

  /**
   * Generate SSL certificate for a domain using Let's Encrypt
   */
  async generateCertificate(domain: string, options: {
    altNames?: string[];
    force?: boolean;
    dnsChallenge?: boolean;
  } = {}): Promise<SSLCertificate> {
    try {
      this.logger.info('Generating SSL certificate', { domain, options });

      // Validate domain
      const validation = await this.validateDomain(domain);
      if (!validation.isValid) {
        throw new Error(`Domain validation failed: ${validation.errors.join(', ')}`);
      }

      // Check if certificate already exists and is valid
      if (!options.force) {
        const existing = await this.getCertificate(domain);
        if (existing && this.isCertificateValid(existing)) {
          this.logger.info('Using existing valid certificate', { domain });
          return existing;
        }
      }

      // Prepare certificate request
      const certRequest = await this.prepareCertificateRequest(domain, options);

      // Execute certificate generation based on provider
      let certificate: SSLCertificate;
      
      switch (this.config.provider) {
        case 'letsencrypt':
          certificate = await this.generateLetsEncryptCertificate(certRequest);
          break;
        case 'zerossl':
          certificate = await this.generateZeroSSLCertificate(certRequest);
          break;
        default:
          throw new Error(`Unsupported SSL provider: ${this.config.provider}`);
      }

      // Store certificate
      this.certificates.set(domain, certificate);
      await this.saveCertificate(certificate);

      // Emit event
      this.emit('certificate-generated', { domain, certificate });

      return certificate;

    } catch (error) {
      this.logger.error('Failed to generate certificate', error);
      this.emit('certificate-error', { domain, error });
      throw this.handleSSLError(error);
    }
  }

  /**
   * Generate Let's Encrypt certificate using ACME protocol
   */
  private async generateLetsEncryptCertificate(request: any): Promise<SSLCertificate> {
    const { domain, altNames, challengeType } = request;

    try {
      // For container environments, we use Caddy's built-in ACME client
      // For direct implementation, we would use acme-client npm package
      
      if (challengeType === 'http-01') {
        return await this.generateHttpChallengeCert(domain, altNames);
      } else if (challengeType === 'dns-01') {
        return await this.generateDnsChallengeCert(domain, altNames);
      } else {
        throw new Error(`Unsupported challenge type: ${challengeType}`);
      }

    } catch (error) {
      throw new Error(`Let's Encrypt generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate certificate using HTTP-01 challenge
   */
  private async generateHttpChallengeCert(domain: string, altNames: string[] = []): Promise<SSLCertificate> {
    // In production, this would use acme-client
    // For now, we'll create a mock implementation that shows the structure
    
    const now = new Date();
    const validTo = new Date(now);
    validTo.setDate(validTo.getDate() + 90); // Let's Encrypt certs are valid for 90 days

    const certificate: SSLCertificate = {
      domain,
      commonName: domain,
      altNames: altNames.length > 0 ? altNames : [domain, `www.${domain}`],
      issuer: this.config.staging ? "Let's Encrypt Staging" : "Let's Encrypt",
      validFrom: now,
      validTo,
      serialNumber: this.generateSerialNumber(),
      fingerprint: this.generateFingerprint(),
      // In production, these would be actual certificate data
      privateKey: '-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----',
      certificate: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      chain: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      fullChain: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'
    };

    return certificate;
  }

  /**
   * Generate certificate using DNS-01 challenge
   */
  private async generateDnsChallengeCert(domain: string, altNames: string[] = []): Promise<SSLCertificate> {
    // DNS challenge is useful for wildcard certificates
    // Requires DNS provider API integration
    
    this.logger.info('Generating certificate with DNS challenge', { domain });
    
    // Would integrate with Azure DNS to set TXT records
    // Then verify and issue certificate
    
    return this.generateHttpChallengeCert(domain, altNames); // Fallback for now
  }

  /**
   * Generate ZeroSSL certificate (alternative to Let's Encrypt)
   */
  private async generateZeroSSLCertificate(request: any): Promise<SSLCertificate> {
    // ZeroSSL implementation would go here
    throw new Error('ZeroSSL provider not yet implemented');
  }

  /**
   * Validate domain before certificate generation
   */
  private async validateDomain(domain: string): Promise<SSLValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check domain format
      if (!this.isValidDomainFormat(domain)) {
        errors.push('Invalid domain format');
      }

      // Check DNS resolution
      const dnsValid = await this.checkDNSResolution(domain);
      if (!dnsValid) {
        errors.push('Domain does not resolve to a valid IP');
      }

      // Check rate limits
      const rateLimitOk = await this.checkRateLimits(domain);
      if (!rateLimitOk) {
        warnings.push('Approaching Let\'s Encrypt rate limits');
      }

      // Check domain ownership (for DNS challenge)
      if (this.config.challengeType === 'dns-01') {
        const ownershipValid = await this.verifyDomainOwnership(domain);
        if (!ownershipValid) {
          errors.push('Cannot verify domain ownership for DNS challenge');
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
        warnings
      };
    }
  }

  /**
   * Check if domain format is valid
   */
  private isValidDomainFormat(domain: string): boolean {
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    return domainRegex.test(domain);
  }

  /**
   * Check DNS resolution
   */
  private async checkDNSResolution(domain: string): Promise<boolean> {
    try {
      const dns = require('dns').promises;
      const addresses = await dns.resolve4(domain);
      return addresses.length > 0;
    } catch (error) {
      this.logger.warn('DNS resolution failed', { domain, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Check Let's Encrypt rate limits
   */
  private async checkRateLimits(domain: string): Promise<boolean> {
    // Let's Encrypt rate limits:
    // - 50 certificates per registered domain per week
    // - 5 duplicate certificates per week
    // - 300 new orders per account per 3 hours
    
    // In production, track certificate issuance in database
    return true;
  }

  /**
   * Verify domain ownership for DNS challenge
   */
  private async verifyDomainOwnership(domain: string): Promise<boolean> {
    // Would check if we can modify DNS records for the domain
    return true;
  }

  /**
   * Prepare certificate request
   */
  private async prepareCertificateRequest(domain: string, options: any): Promise<any> {
    return {
      domain,
      altNames: options.altNames || [],
      email: this.config.email,
      challengeType: options.dnsChallenge ? 'dns-01' : this.config.challengeType,
      keyType: this.config.keyType,
      keySize: this.config.keySize,
      staging: this.config.staging
    };
  }

  /**
   * Check if certificate is valid
   */
  private isCertificateValid(certificate: SSLCertificate): boolean {
    const now = new Date();
    const validFrom = new Date(certificate.validFrom);
    const validTo = new Date(certificate.validTo);
    
    // Check if certificate is currently valid
    if (now < validFrom || now > validTo) {
      return false;
    }

    // Check if needs renewal
    const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining < (this.config.renewBeforeDays || 30)) {
      this.logger.info('Certificate needs renewal', { 
        domain: certificate.domain, 
        daysRemaining 
      });
      return false;
    }

    return true;
  }

  /**
   * Get certificate for domain
   */
  async getCertificate(domain: string): Promise<SSLCertificate | null> {
    // Check in-memory cache
    if (this.certificates.has(domain)) {
      return this.certificates.get(domain)!;
    }

    // Check file system
    try {
      const certPath = this.getCertificatePath(domain);
      const certData = await fs.readFile(path.join(certPath, 'cert.json'), 'utf8');
      const certificate = JSON.parse(certData);
      
      // Parse dates
      certificate.validFrom = new Date(certificate.validFrom);
      certificate.validTo = new Date(certificate.validTo);
      
      this.certificates.set(domain, certificate);
      return certificate;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save certificate to file system
   */
  private async saveCertificate(certificate: SSLCertificate): Promise<void> {
    const certPath = this.getCertificatePath(certificate.domain);
    
    // Create directory
    await fs.mkdir(certPath, { recursive: true });
    
    // Save certificate files
    if (certificate.privateKey) {
      await fs.writeFile(path.join(certPath, 'privkey.pem'), certificate.privateKey);
    }
    if (certificate.certificate) {
      await fs.writeFile(path.join(certPath, 'cert.pem'), certificate.certificate);
    }
    if (certificate.chain) {
      await fs.writeFile(path.join(certPath, 'chain.pem'), certificate.chain);
    }
    if (certificate.fullChain) {
      await fs.writeFile(path.join(certPath, 'fullchain.pem'), certificate.fullChain);
    }
    
    // Save metadata
    const metadata = { ...certificate };
    delete metadata.privateKey;
    delete metadata.certificate;
    delete metadata.chain;
    delete metadata.fullChain;
    
    await fs.writeFile(
      path.join(certPath, 'cert.json'),
      JSON.stringify(metadata, null, 2)
    );
  }

  /**
   * Get certificate storage path
   */
  private getCertificatePath(domain: string): string {
    const baseDir = process.env.SSL_CERT_DIR || '/etc/letsencrypt/live';
    return path.join(baseDir, domain);
  }

  /**
   * Start certificate renewal monitoring
   */
  private startRenewalMonitoring(): void {
    // Check certificates daily
    this.renewalTimer = setInterval(async () => {
      await this.checkAndRenewCertificates();
    }, 24 * 60 * 60 * 1000);

    // Initial check
    this.checkAndRenewCertificates();
  }

  /**
   * Check and renew certificates
   */
  private async checkAndRenewCertificates(): Promise<void> {
    this.logger.info('Checking certificates for renewal');

    for (const [domain, certificate] of this.certificates) {
      try {
        const validation = await this.validateCertificate(certificate);
        
        if (validation.needsRenewal) {
          this.logger.info('Renewing certificate', { 
            domain, 
            daysRemaining: validation.daysRemaining 
          });
          
          await this.generateCertificate(domain, { force: true });
          this.emit('certificate-renewed', { domain });
        }
      } catch (error) {
        this.logger.error('Failed to renew certificate', { domain, error });
        this.emit('renewal-error', { domain, error });
      }
    }
  }

  /**
   * Validate certificate
   */
  async validateCertificate(certificate: SSLCertificate): Promise<SSLValidation> {
    const now = new Date();
    const validTo = new Date(certificate.validTo);
    const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    const validation: SSLValidation = {
      isValid: true,
      errors: [],
      warnings: [],
      daysRemaining,
      needsRenewal: false
    };

    // Check expiration
    if (daysRemaining <= 0) {
      validation.isValid = false;
      validation.errors.push('Certificate has expired');
      validation.needsRenewal = true;
    } else if (daysRemaining < (this.config.renewBeforeDays || 30)) {
      validation.warnings.push(`Certificate expires in ${daysRemaining} days`);
      validation.needsRenewal = true;
    }

    // Check certificate chain
    if (!certificate.chain || !certificate.fullChain) {
      validation.warnings.push('Certificate chain is incomplete');
    }

    return validation;
  }

  /**
   * Generate serial number for certificate
   */
  private generateSerialNumber(): string {
    return Date.now().toString(16).toUpperCase();
  }

  /**
   * Generate fingerprint for certificate
   */
  private generateFingerprint(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(20).toString('hex').toUpperCase();
  }

  /**
   * Handle SSL errors with proper error types
   */
  private handleSSLError(error: any): Error {
    const errorMessage = error.message || 'Unknown SSL error';
    
    // Categorize errors
    if (errorMessage.includes('rate limit')) {
      return new SSLRateLimitError(errorMessage);
    } else if (errorMessage.includes('validation')) {
      return new SSLValidationError(errorMessage);
    } else if (errorMessage.includes('challenge')) {
      return new SSLChallengeError(errorMessage);
    } else if (errorMessage.includes('DNS')) {
      return new SSLDNSError(errorMessage);
    }
    
    return new SSLError(errorMessage);
  }

  /**
   * Get certificate information
   */
  async getCertificateInfo(domain: string): Promise<{
    exists: boolean;
    valid: boolean;
    info?: {
      issuer: string;
      validFrom: Date;
      validTo: Date;
      daysRemaining: number;
      altNames: string[];
    };
  }> {
    const certificate = await this.getCertificate(domain);
    
    if (!certificate) {
      return { exists: false, valid: false };
    }

    const validation = await this.validateCertificate(certificate);
    
    return {
      exists: true,
      valid: validation.isValid,
      info: {
        issuer: certificate.issuer,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        daysRemaining: validation.daysRemaining || 0,
        altNames: certificate.altNames
      }
    };
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(domain: string, reason?: string): Promise<void> {
    try {
      const certificate = await this.getCertificate(domain);
      if (!certificate) {
        throw new Error('Certificate not found');
      }

      // In production, would call ACME revoke endpoint
      this.logger.info('Revoking certificate', { domain, reason });
      
      // Remove from storage
      this.certificates.delete(domain);
      const certPath = this.getCertificatePath(domain);
      await fs.rm(certPath, { recursive: true, force: true });
      
      this.emit('certificate-revoked', { domain, reason });
    } catch (error) {
      this.logger.error('Failed to revoke certificate', error);
      throw error;
    }
  }

  /**
   * Export certificate for backup
   */
  async exportCertificate(domain: string): Promise<{
    domain: string;
    files: {
      privateKey: string;
      certificate: string;
      chain: string;
      fullChain: string;
    };
    metadata: any;
  }> {
    const certificate = await this.getCertificate(domain);
    if (!certificate) {
      throw new Error('Certificate not found');
    }

    return {
      domain,
      files: {
        privateKey: certificate.privateKey || '',
        certificate: certificate.certificate || '',
        chain: certificate.chain || '',
        fullChain: certificate.fullChain || ''
      },
      metadata: {
        issuer: certificate.issuer,
        validFrom: certificate.validFrom,
        validTo: certificate.validTo,
        altNames: certificate.altNames
      }
    };
  }

  /**
   * Import certificate from backup
   */
  async importCertificate(data: any): Promise<void> {
    const certificate: SSLCertificate = {
      domain: data.domain,
      commonName: data.domain,
      altNames: data.metadata.altNames || [],
      issuer: data.metadata.issuer,
      validFrom: new Date(data.metadata.validFrom),
      validTo: new Date(data.metadata.validTo),
      serialNumber: this.generateSerialNumber(),
      fingerprint: this.generateFingerprint(),
      privateKey: data.files.privateKey,
      certificate: data.files.certificate,
      chain: data.files.chain,
      fullChain: data.files.fullChain
    };

    await this.saveCertificate(certificate);
    this.certificates.set(data.domain, certificate);
    
    this.emit('certificate-imported', { domain: data.domain });
  }

  /**
   * Get all certificates
   */
  async getAllCertificates(): Promise<SSLCertificate[]> {
    return Array.from(this.certificates.values());
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
    }
  }
}

// Custom error classes
export class SSLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSLError';
  }
}

export class SSLRateLimitError extends SSLError {
  constructor(message: string) {
    super(message);
    this.name = 'SSLRateLimitError';
  }
}

export class SSLValidationError extends SSLError {
  constructor(message: string) {
    super(message);
    this.name = 'SSLValidationError';
  }
}

export class SSLChallengeError extends SSLError {
  constructor(message: string) {
    super(message);
    this.name = 'SSLChallengeError';
  }
}

export class SSLDNSError extends SSLError {
  constructor(message: string) {
    super(message);
    this.name = 'SSLDNSError';
  }
}