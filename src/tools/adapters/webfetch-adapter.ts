/**
 * Enhanced WebFetch Tool Adapter
 * Fetches web content with domain validation, caching, and safety checks
 */

import { BaseToolAdapter } from '../base-adapter';
import axios, { AxiosResponse } from 'axios';
import TurndownService from 'turndown';
import { z } from 'zod';
import { createHash } from 'crypto';
import { URL } from 'url';
import { Logger } from '../../utils/logger';

// Input schema
const WebFetchInputSchema = z.object({
  url: z.string().url().describe('The URL to fetch content from'),
  prompt: z.string().describe('The prompt to run on the fetched content')
});

// Result schema
const WebFetchResultSchema = z.object({
  bytes: z.number().describe('Size of the fetched content in bytes'),
  code: z.number().describe('HTTP response code'),
  codeText: z.string().describe('HTTP response code text'),
  result: z.string().describe('Processed result from applying the prompt to the content'),
  durationMs: z.number().describe('Time taken to fetch and process the content'),
  url: z.string().describe('The URL that was fetched'),
  cached: z.boolean().describe('Whether the result was from cache')
});

type WebFetchInput = z.infer<typeof WebFetchInputSchema>;
type WebFetchResult = z.infer<typeof WebFetchResultSchema>;

// Cache entry
interface CacheEntry {
  content: string;
  bytes: number;
  code: number;
  codeText: string;
  timestamp: number;
}

// Domain check result
interface DomainCheckResult {
  status: 'allowed' | 'blocked' | 'check_failed';
  error?: Error;
}

export class WebFetchAdapter extends BaseToolAdapter<WebFetchInput, WebFetchResult> {
  name = 'webFetch';
  description = 'Fetches content from URLs and processes it with a prompt';
  
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_PROCESSED_LENGTH = 100000; // 100k characters
  private readonly MAX_URL_LENGTH = 2000;
  private readonly turndownService: TurndownService;
  protected logger: Logger;
  
  // Blocked domains for security
  private readonly BLOCKED_DOMAINS = new Set([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    'internal',
    'private'
  ]);
  
  // Allowed protocols
  private readonly ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

  parameters = {
    url: {
      type: 'string' as const,
      description: 'The URL to fetch content from',
      required: true
    },
    prompt: {
      type: 'string' as const,
      description: 'The prompt to apply to the fetched content',
      required: true
    }
  };

  constructor() {
    super();
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });
    this.logger = new Logger('WebFetch');
    
    // Start cache cleanup interval
    setInterval(() => this.cleanupCache(), 60000); // Clean every minute
  }

  async execute(params: WebFetchInput): Promise<WebFetchResult> {
    const startTime = Date.now();
    
    // Validate input
    const validated = WebFetchInputSchema.parse(params);
    
    // Validate URL
    await this.validateUrl(validated.url);
    
    // Check cache
    const cacheKey = this.getCacheKey(validated.url);
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      // Process cached content with the prompt
      const result = await this.processContent(cached.content, validated.prompt);
      
      return this.success({
        bytes: cached.bytes,
        code: cached.code,
        codeText: cached.codeText,
        result,
        durationMs: Date.now() - startTime,
        url: validated.url,
        cached: true
      });
    }
    
    // Fetch fresh content
    const response = await this.fetchContent(validated.url);
    
    // Handle redirects
    if (this.isRedirect(response)) {
      return this.handleRedirect(response, validated);
    }
    
    // Extract and process content
    const content = await this.extractContent(response);
    
    // Cache the raw content
    this.cacheContent(cacheKey, {
      content,
      bytes: Buffer.byteLength(content, 'utf-8'),
      code: response.status,
      codeText: response.statusText,
      timestamp: Date.now()
    });
    
    // Process with prompt
    const result = await this.processContent(content, validated.prompt);
    
    return this.success({
      bytes: Buffer.byteLength(content, 'utf-8'),
      code: response.status,
      codeText: response.statusText,
      result,
      durationMs: Date.now() - startTime,
      url: validated.url,
      cached: false
    });
  }

  /**
   * Validate URL for security
   */
  private async validateUrl(url: string): Promise<void> {
    // Check URL length
    if (url.length > this.MAX_URL_LENGTH) {
      this.error('URL is too long', 'INVALID_URL');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      this.error('Invalid URL format', 'INVALID_URL');
    }

    // Check protocol
    if (!this.ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
      this.error(`Protocol ${parsedUrl.protocol} is not allowed`, 'INVALID_PROTOCOL');
    }

    // Check for authentication in URL
    if (parsedUrl.username || parsedUrl.password) {
      this.error('URLs with authentication are not allowed', 'INVALID_URL');
    }

    // Check hostname
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Check for blocked domains
    if (this.BLOCKED_DOMAINS.has(hostname)) {
      this.error(`Domain ${hostname} is blocked`, 'DOMAIN_BLOCKED');
    }

    // Check for private IP ranges
    if (this.isPrivateIP(hostname)) {
      this.error('Private IP addresses are not allowed', 'DOMAIN_BLOCKED');
    }

    // Perform domain safety check
    const domainCheck = await this.checkDomainSafety(hostname);
    if (domainCheck.status === 'blocked') {
      this.error(`Domain ${hostname} is not allowed`, 'DOMAIN_BLOCKED');
    } else if (domainCheck.status === 'check_failed') {
      this.logger.warn(`Domain check failed for ${hostname}: ${domainCheck.error?.message}`);
      // Allow with warning for now
    }
  }

  /**
   * Check if IP is private
   */
  private isPrivateIP(hostname: string): boolean {
    // Simple check for common private IP patterns
    const privatePatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^fe80:/i,
      /^fc00:/i,
      /^fd00:/i
    ];

    return privatePatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * Check domain safety (simplified version)
   */
  private async checkDomainSafety(domain: string): Promise<DomainCheckResult> {
    // In a real implementation, this would check against a safety API
    // For now, we'll use a simple allowlist/blocklist approach
    
    const knownSafeDomains = [
      'github.com',
      'stackoverflow.com',
      'wikipedia.org',
      'arxiv.org',
      'medium.com',
      'dev.to'
    ];

    const knownUnsafeDomains = [
      'malware.com',
      'phishing.net'
    ];

    if (knownUnsafeDomains.some(unsafe => domain.includes(unsafe))) {
      return { status: 'blocked' };
    }

    if (knownSafeDomains.some(safe => domain.includes(safe))) {
      return { status: 'allowed' };
    }

    // Default to allowed with caution
    return { status: 'allowed' };
  }

  /**
   * Fetch content from URL
   */
  private async fetchContent(url: string): Promise<AxiosResponse> {
    try {
      // Convert HTTP to HTTPS
      const secureUrl = url.replace(/^http:/, 'https:');
      
      const response = await axios.get(secureUrl, {
        timeout: 30000, // 30 second timeout
        maxContentLength: this.MAX_CONTENT_SIZE,
        maxRedirects: 0, // Handle redirects manually
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Jupiter-WebFetch/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      return response;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Return error response for redirect handling
        return error.response;
      }
      
      this.error(
        `Failed to fetch URL: ${error instanceof Error ? error.message : String(error)}`,
        'FETCH_FAILED'
      );
    }
  }

  /**
   * Check if response is a redirect
   */
  private isRedirect(response: AxiosResponse): boolean {
    return [301, 302, 307, 308].includes(response.status);
  }

  /**
   * Handle redirect response
   */
  private handleRedirect(response: AxiosResponse, params: WebFetchInput): WebFetchResult {
    const location = response.headers.location;
    if (!location) {
      this.error('Redirect missing Location header', 'REDIRECT_ERROR');
    }

    const redirectUrl = new URL(location, params.url).toString();
    const originalHost = new URL(params.url).hostname;
    const redirectHost = new URL(redirectUrl).hostname;

    const statusText = {
      301: 'Moved Permanently',
      302: 'Found',
      307: 'Temporary Redirect',
      308: 'Permanent Redirect'
    }[response.status] || response.statusText;

    const message = `REDIRECT DETECTED: The URL redirects to a different ${
      originalHost !== redirectHost ? 'host' : 'location'
    }.

Original URL: ${params.url}
Redirect URL: ${redirectUrl}
Status: ${response.status} ${statusText}

To complete your request, I need to fetch content from the redirected URL. Please use WebFetch again with:
- url: "${redirectUrl}"
- prompt: "${params.prompt}"`;

    return {
      bytes: Buffer.byteLength(message),
      code: response.status,
      codeText: statusText,
      result: message,
      durationMs: 0,
      url: params.url,
      cached: false
    };
  }

  /**
   * Extract content from response
   */
  private async extractContent(response: AxiosResponse): Promise<string> {
    const contentType = response.headers['content-type'] || '';
    const buffer = Buffer.from(response.data);
    let content = buffer.toString('utf-8');

    // Convert HTML to markdown
    if (contentType.includes('text/html')) {
      content = this.turndownService.turndown(content);
    }

    // Truncate if too long
    if (content.length > this.MAX_PROCESSED_LENGTH) {
      content = content.substring(0, this.MAX_PROCESSED_LENGTH) + '\n\n[Content truncated...]';
    }

    return content;
  }

  /**
   * Process content with prompt
   */
  private async processContent(content: string, prompt: string): Promise<string> {
    // In a real implementation, this would use the AI provider
    // For now, we'll return a simple combination
    return `Applied prompt "${prompt}" to fetched content:\n\n${content}`;
  }

  /**
   * Get cache key for URL
   */
  private getCacheKey(url: string): string {
    return createHash('sha256').update(url).digest('hex');
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.CACHE_DURATION) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Cache content
   */
  private cacheContent(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_DURATION) {
        this.cache.delete(key);
      }
    }
  }

  validate(params: any): boolean {
    try {
      WebFetchInputSchema.parse(params);
      return true;
    } catch {
      return false;
    }
  }
}