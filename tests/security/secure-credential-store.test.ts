/**
 * Tests for Secure Credential Store
 */

import { SecureCredentialStore, CredentialRequest, ScopedCredentials } from '../../src/security/secure-credential-store';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('SecureCredentialStore', () => {
  let store: SecureCredentialStore;
  let validRequest: CredentialRequest;

  beforeEach(() => {
    // Set encryption key for testing
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-encryption-key-32-characters';
    store = new SecureCredentialStore();

    validRequest = {
      userId: 'test-user',
      projectId: 'test-project',
      taskId: 'test-task',
      requestedScopes: ['container:create', 'git:read'],
      duration: 60 // 1 hour
    };
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Credential Creation', () => {
    it('should create scoped credentials with valid request', async () => {
      const credentials = await store.createScopedCredentials(validRequest);

      expect(credentials).toBeDefined();
      expect(credentials.userId).toBe(validRequest.userId);
      expect(credentials.projectId).toBe(validRequest.projectId);
      expect(credentials.taskId).toBe(validRequest.taskId);
      expect(credentials.sessionToken).toHaveLength(64); // 32 bytes hex
      expect(credentials.containerName).toBe('aci-test-user-test-project-test-task');
      expect(credentials.expiresAt).toBeInstanceOf(Date);
      expect(credentials.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should map scopes to allowed operations', async () => {
      const scopes = [
        'container:create',
        'container:execute',
        'git:read',
        'git:write',
        'build:execute'
      ];

      const credentials = await store.createScopedCredentials({
        ...validRequest,
        requestedScopes: scopes
      });

      const allowedOps = credentials.azureContainerAccess?.allowedOperations || [];
      expect(allowedOps).toContain('createContainer');
      expect(allowedOps).toContain('executeCommand');
      expect(allowedOps).toContain('clone');
      expect(allowedOps).toContain('pull');
      expect(allowedOps).toContain('commit');
      expect(allowedOps).toContain('push');
    });

    it('should create GitHub token for git scopes', async () => {
      const credentials = await store.createScopedCredentials({
        ...validRequest,
        requestedScopes: ['git:write']
      });

      expect(credentials.githubToken).toBeDefined();
      expect(credentials.githubToken).toMatch(/^[a-f0-9]+:[a-f0-9]+$/); // Encrypted format
    });

    it('should reject invalid duration', async () => {
      await expect(store.createScopedCredentials({
        ...validRequest,
        duration: 0 // Too short
      })).rejects.toThrow('Invalid duration');

      await expect(store.createScopedCredentials({
        ...validRequest,
        duration: 300 // Too long (5 hours)
      })).rejects.toThrow('Invalid duration');
    });

    it('should reject empty scopes', async () => {
      await expect(store.createScopedCredentials({
        ...validRequest,
        requestedScopes: []
      })).rejects.toThrow('No scopes requested');
    });

    it('should reject invalid scopes', async () => {
      await expect(store.createScopedCredentials({
        ...validRequest,
        requestedScopes: ['admin:full', 'system:root']
      })).rejects.toThrow('Invalid scope');
    });

    it('should reject missing required fields', async () => {
      const invalidRequests = [
        { ...validRequest, userId: '' },
        { ...validRequest, projectId: '' },
        { ...validRequest, taskId: '' },
        { projectId: 'test', taskId: 'test', requestedScopes: ['git:read'], duration: 60 }
      ];

      for (const request of invalidRequests) {
        await expect(store.createScopedCredentials(request as any))
          .rejects.toThrow('Missing required identifiers');
      }
    });
  });

  describe('Credential Validation', () => {
    it('should validate correct credentials', async () => {
      const credentials = await store.createScopedCredentials(validRequest);
      
      const isValid = await store.validateCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId,
        credentials.sessionToken
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid session token', async () => {
      const credentials = await store.createScopedCredentials(validRequest);
      
      const isValid = await store.validateCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId,
        'wrong-token'
      );

      expect(isValid).toBe(false);
    });

    it('should reject non-existent credentials', async () => {
      const isValid = await store.validateCredentials(
        'non-existent',
        'project',
        'task',
        'token'
      );

      expect(isValid).toBe(false);
    });

    it('should reject expired credentials', async () => {
      jest.useFakeTimers();
      
      const credentials = await store.createScopedCredentials({
        ...validRequest,
        duration: 1 // 1 minute
      });

      // Fast forward 2 minutes
      jest.advanceTimersByTime(2 * 60 * 1000);

      const isValid = await store.validateCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId,
        credentials.sessionToken
      );

      expect(isValid).toBe(false);
      
      jest.useRealTimers();
    });
  });

  describe('Allowed Operations', () => {
    it('should return allowed operations for valid credentials', async () => {
      const credentials = await store.createScopedCredentials({
        ...validRequest,
        requestedScopes: ['container:create', 'git:read']
      });

      const operations = store.getAllowedOperations(
        credentials.userId,
        credentials.projectId,
        credentials.taskId
      );

      expect(operations).toContain('createContainer');
      expect(operations).toContain('clone');
      expect(operations).toContain('pull');
      expect(operations).toContain('status');
      expect(operations).not.toContain('commit'); // git:write not requested
    });

    it('should return empty array for non-existent credentials', () => {
      const operations = store.getAllowedOperations(
        'non-existent',
        'project',
        'task'
      );

      expect(operations).toEqual([]);
    });
  });

  describe('Credential Revocation', () => {
    it('should revoke credentials', async () => {
      const credentials = await store.createScopedCredentials(validRequest);
      
      // Verify credentials exist
      let isValid = await store.validateCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId,
        credentials.sessionToken
      );
      expect(isValid).toBe(true);

      // Revoke
      store.revokeCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId
      );

      // Verify credentials no longer exist
      isValid = await store.validateCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId,
        credentials.sessionToken
      );
      expect(isValid).toBe(false);
    });

    it('should handle revoking non-existent credentials', () => {
      // Should not throw
      expect(() => {
        store.revokeCredentials('non-existent', 'project', 'task');
      }).not.toThrow();
    });
  });

  describe('Automatic Expiration', () => {
    it('should automatically revoke expired credentials', async () => {
      jest.useFakeTimers();
      
      const credentials = await store.createScopedCredentials({
        ...validRequest,
        duration: 1 // 1 minute
      });

      // Initially valid
      let isValid = await store.validateCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId,
        credentials.sessionToken
      );
      expect(isValid).toBe(true);

      // Fast forward past expiration
      jest.advanceTimersByTime(2 * 60 * 1000);

      // Should be invalid
      isValid = await store.validateCredentials(
        credentials.userId,
        credentials.projectId,
        credentials.taskId,
        credentials.sessionToken
      );
      expect(isValid).toBe(false);
      
      jest.useRealTimers();
    });
  });

  describe('Statistics', () => {
    it('should track credential statistics', async () => {
      // Create credentials for different users
      await store.createScopedCredentials({
        ...validRequest,
        userId: 'user1'
      });
      await store.createScopedCredentials({
        ...validRequest,
        userId: 'user1',
        projectId: 'project2'
      });
      await store.createScopedCredentials({
        ...validRequest,
        userId: 'user2'
      });

      const stats = store.getStats();

      expect(stats.activeCredentials).toBe(3);
      expect(stats.credentialsByUser.get('user1')).toBe(2);
      expect(stats.credentialsByUser.get('user2')).toBe(1);
      expect(stats.upcomingExpirations).toBeGreaterThanOrEqual(0);
    });

    it('should track upcoming expirations', async () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      // Create credential expiring in 3 minutes
      await store.createScopedCredentials({
        ...validRequest,
        duration: 3
      });

      // Create credential expiring in 10 minutes
      await store.createScopedCredentials({
        ...validRequest,
        projectId: 'project2',
        duration: 10
      });

      const stats = store.getStats();
      expect(stats.upcomingExpirations).toBe(1); // Only the 3-minute one

      jest.useRealTimers();
    });
  });

  describe('Encryption', () => {
    it('should encrypt GitHub tokens', async () => {
      const credentials = await store.createScopedCredentials({
        ...validRequest,
        requestedScopes: ['git:write']
      });

      expect(credentials.githubToken).toBeDefined();
      expect(credentials.githubToken).not.toContain('github-scoped'); // Should be encrypted
      expect(credentials.githubToken).toMatch(/^[a-f0-9]+:[a-f0-9]+$/); // IV:encrypted format
    });
  });
});

describe('SecureCredentialStore Concurrency', () => {
  it('should handle concurrent credential creation', async () => {
    const store = new SecureCredentialStore();
    const promises = [];

    // Create 10 credentials concurrently
    for (let i = 0; i < 10; i++) {
      promises.push(store.createScopedCredentials({
        userId: `user${i}`,
        projectId: `project${i}`,
        taskId: `task${i}`,
        requestedScopes: ['container:create'],
        duration: 60
      }));
    }

    const results = await Promise.all(promises);
    
    expect(results).toHaveLength(10);
    results.forEach((cred, i) => {
      expect(cred.userId).toBe(`user${i}`);
      expect(cred.sessionToken).toBeDefined();
    });

    const stats = store.getStats();
    expect(stats.activeCredentials).toBe(10);
  });
});