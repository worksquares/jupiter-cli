# Secure Architecture Design for AI Agent System

## Overview

This document describes the secure, function-based architecture that provides controlled access to Git and Azure operations without exposing full credentials to AI agents.

## Architecture Principles

### 1. **Principle of Least Privilege**
- AI agents never have direct access to credentials
- Operations are scoped to specific user/project/task contexts
- Temporary, limited-duration tokens for each workflow

### 2. **Defense in Depth**
- Multiple validation layers
- Command whitelisting and sanitization
- Resource isolation per container
- Automatic cleanup and revocation

### 3. **Separation of Concerns**
- Secure Operations API: Validated, limited operations only
- Credential Store: Isolated credential management
- Recovery Agent: Specialized failure handling
- Workflow Orchestrator: Coordinates secure execution

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Request                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Secure Workflow Orchestrator                        │
│  - Validates requests                                           │
│  - Creates scoped credentials                                   │
│  - Coordinates workflow steps                                   │
└────────────┬──────────────────────────────┬────────────────────┘
             │                              │
             ▼                              ▼
┌────────────────────────────┐  ┌────────────────────────────────┐
│   Secure Operations API     │  │    Secure Credential Store      │
│  - Validated operations     │  │  - Scoped credentials          │
│  - Command sanitization     │  │  - Temporary tokens            │
│  - Resource limits          │  │  - Automatic expiration        │
└────────────┬───────────────┘  └────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────┐
│                    Azure Container Instance                      │
│  - Isolated execution environment                               │
│  - No direct credential access                                  │
│  - Resource constraints                                         │
└────────────────────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────────┐
│               Failure Recovery AI Agent                          │
│  - Monitors for failures                                        │
│  - Executes recovery strategies                                 │
│  - Limited recovery operations only                             │
└────────────────────────────────────────────────────────────────┘
```

## Security Features

### 1. **Secure Operations API**

```typescript
// Limited operations with validation
const allowedGitOperations = ['clone', 'pull', 'commit', 'push', 'branch', 'status'];
const allowedAzureOperations = ['createContainer', 'executeCommand', 'getStatus', 'getLogs', 'stopContainer'];

// Command validation and sanitization
const allowedCommands = [
  'git', 'npm', 'node', 'ls', 'cat', 'echo', 'pwd', 'cd', 'mkdir', 'cp', 'mv'
];

// Blocked patterns
const blockedPatterns = [
  /rm\s+-rf/, /sudo/, /chmod/, /chown/, /apt-get/, /yum/, 
  /wget/, /curl.*http/, /ssh/, /telnet/
];
```

### 2. **Credential Isolation**

```typescript
interface ScopedCredentials {
  userId: string;
  projectId: string;
  taskId: string;
  containerName: string;
  sessionToken: string;
  expiresAt: Date;
  allowedOperations: string[];
}
```

- Credentials are scoped to specific user/project/task
- Automatic expiration (max 4 hours)
- No direct access to GitHub tokens or Azure credentials
- Operations validated against allowed list

### 3. **Container Isolation**

Each project runs in an isolated Azure Container Instance with:
- Unique container name: `aci-{userId}-{projectId}-{taskId}`
- Resource limits (CPU: 1-2 cores, Memory: 2-4GB)
- Network isolation
- No persistent storage between sessions
- Automatic cleanup on completion

### 4. **Failure Recovery Agent**

Specialized agent that only activates on failures:
- Analyzes failure patterns
- Executes predefined recovery strategies
- Limited to recovery operations only
- Cannot access credentials directly

Recovery strategies include:
- Container restart
- Workspace cleanup
- NPM cache clearing
- Resource increase
- Connectivity checks

## Security Benefits

### 1. **No Direct Credential Exposure**
- AI agents never see actual GitHub tokens or Azure credentials
- All operations go through validated API layer
- Credentials stored encrypted and isolated

### 2. **Scoped Access**
- Each workflow has its own temporary credentials
- Access limited to specific project/task
- Automatic revocation after use

### 3. **Command Injection Prevention**
- All commands sanitized and validated
- Whitelist-based approach
- Parameter validation with Zod schemas

### 4. **Audit Trail**
- All operations logged with context
- Operation history maintained
- Failed attempts recorded

### 5. **Automatic Cleanup**
- Credentials expire automatically
- Containers stopped after use
- Resources cleaned up on failure

## Usage Example

```typescript
// 1. User requests a new React project
const request: WorkflowRequest = {
  userId: 'user123',
  projectId: 'proj456',
  projectName: 'my-react-app',
  framework: 'react',
  template: 'typescript',
  features: ['routing', 'tailwind']
};

// 2. Orchestrator creates scoped credentials
const credentials = await credentialStore.createScopedCredentials({
  userId: request.userId,
  projectId: request.projectId,
  taskId: 'task789',
  requestedScopes: ['container:create', 'git:write', 'build:execute'],
  duration: 120 // 2 hours
});

// 3. Operations executed through secure API
const result = await secureOps.executeGitOperation(context, {
  operation: 'clone',
  parameters: { repository: 'approved-repo-url' }
});

// 4. On failure, recovery agent activates
if (!result.success) {
  await recoveryAgent.handleFailure({
    context,
    failure: { type: 'git', error: result.error }
  });
}

// 5. Automatic cleanup
credentialStore.revokeCredentials(userId, projectId, taskId);
```

## Configuration

### Environment Variables

```env
# Credential encryption
CREDENTIAL_ENCRYPTION_KEY=your-secure-encryption-key

# Azure settings (used by secure operations, not exposed to agents)
AZURE_SUBSCRIPTION_ID=xxx
AZURE_RESOURCE_GROUP=jupiter-agents
AZURE_CLIENT_ID=xxx
AZURE_CLIENT_SECRET=xxx

# GitHub settings (used for creating scoped tokens)
GITHUB_APP_ID=xxx
GITHUB_APP_PRIVATE_KEY=xxx
```

### Security Policies

```typescript
const securityPolicies = {
  maxWorkflowDuration: 240, // 4 hours
  maxConcurrentWorkflows: 10,
  maxContainerResources: { cpu: 2, memory: 4 },
  allowedRepositoryOrgs: ['worksquares'],
  commandTimeout: 300000, // 5 minutes
  maxOutputSize: 1048576 // 1MB
};
```

## Monitoring and Alerts

The system provides monitoring for:
- Failed authentication attempts
- Unusual command patterns
- Resource limit violations
- Expired credential usage
- Recovery agent activations

## Future Enhancements

1. **GitHub Apps Integration**
   - Create installation tokens instead of using PATs
   - Repository-specific access tokens

2. **Azure Managed Identity**
   - Use managed identities for containers
   - Eliminate service principal credentials

3. **Advanced Recovery Strategies**
   - Machine learning-based failure prediction
   - Proactive resource allocation

4. **Enhanced Monitoring**
   - Real-time security dashboards
   - Anomaly detection

## Conclusion

This architecture provides a secure, scalable way to enable AI agents to perform Git and Azure operations without exposing credentials. The multi-layered security approach ensures that even if one layer is compromised, the system remains secure.