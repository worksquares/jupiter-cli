# Jupiter AI

A revolutionary single Intelligent Agent with dynamic capabilities for advanced code generation and assistance. Jupiter AI consolidates the power of multiple specialized agents into one unified, intelligent system.

## Features

- **Dynamic Capability Loading**: Load capabilities on demand based on task requirements
- **Unified Memory System**: Six integrated memory types working in harmony
- **Advanced Tool Orchestration**: 14 built-in tools with intelligent selection and execution
- **Learning Engine**: Continuous improvement through pattern recognition and reinforcement learning
- **Task Analysis & Planning**: Sophisticated task analysis and execution planning
- **Performance Optimization**: Built-in caching, batching, and prefetching
- **Security**: Comprehensive security validation and sandboxing options
- **REST API**: Full-featured API for integration
- **Azure Integration**: Deploy containers and static web apps with automatic DNS management
- **Domain Management**: Automatic subdomain provisioning with SSL support

## Installation

```bash
npm install
```

## Quick Start

### As a Library

```typescript
import { createAgent } from 'jupiter-ai';

// Create and initialize agent
const agent = await createAgent({
  name: 'My Agent',
  capabilities: ['general-purpose'],
  learning: { enabled: true }
});

// Process a task
const task = {
  id: 'task-1',
  type: 'code_generation',
  description: 'Create a React component for user authentication',
  context: {
    language: 'typescript',
    framework: 'react'
  },
  priority: 'high'
};

const result = await agent.processTask(task);
console.log(result);
```

### As an API Server

```bash
# Start the API server
npm start

# Or with environment variables
PORT=8080 LOG_LEVEL=debug npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### Task Management
```
POST /tasks - Create a new task
GET /tasks/:id - Get task status
GET /tasks - List all tasks
```

### Tool Execution
```
POST /tools/:name/execute - Execute a specific tool
GET /tools - List available tools
```

### Memory Operations
```
POST /memory - Store a memory
GET /memory - Retrieve memories
```

### Learning & Optimization
```
POST /learn - Process learning event
POST /optimize - Trigger optimization
```

## Architecture

### Core Components

1. **IntelligentAgent**: Main agent class that orchestrates all operations
2. **TaskAnalyzer**: Analyzes tasks to determine requirements and approach
3. **TaskPlanner**: Creates execution plans for tasks
4. **TaskExecutor**: Executes plans and manages task execution
5. **UnifiedMemorySystem**: Manages all memory types
6. **LearningEngine**: Handles learning and pattern recognition
7. **PromptBuilder**: Dynamic prompt generation system

### Memory Types

- **Working Memory**: Active task information
- **Short-term Memory**: Recent operations and results
- **Long-term Memory**: Persistent knowledge
- **Episodic Memory**: Past experiences
- **Semantic Memory**: Facts and concepts
- **Procedural Memory**: How-to knowledge and patterns

### Available Tools

1. **read** - Read files from the filesystem
2. **write** - Write files to the filesystem
3. **edit** - Edit specific parts of files
4. **multiEdit** - Multiple edits in one operation
5. **grep** - Powerful search using ripgrep
6. **glob** - File pattern matching
7. **bash** - Execute shell commands
8. **ls** - List directory contents
9. **task** - Launch sub-agents for complex tasks
10. **webSearch** - Search the web
11. **webFetch** - Fetch and process web content
12. **todoWrite** - Manage task lists
13. **exitPlanMode** - Exit planning mode
14. **notebookRead** - Read Jupyter notebooks
15. **notebookEdit** - Edit Jupyter notebooks

## Configuration

```typescript
const config = {
  name: 'My Agent',
  capabilities: ['general-purpose'],
  tools: ['read', 'write', 'grep'],
  memory: {
    maxMemories: 10000,
    consolidationInterval: 3600000,
    importanceThreshold: 0.3,
    retentionPolicy: {
      type: 'hybrid',
      duration: 7 * 24 * 60 * 60 * 1000,
      maxCount: 5000,
      importanceThreshold: 0.5
    }
  },
  learning: {
    enabled: true,
    learningRate: 0.1,
    minConfidence: 0.6,
    maxPatterns: 1000,
    evaluationInterval: 300000
  },
  performance: {
    maxConcurrentTasks: 10,
    taskTimeout: 300000,
    cacheSize: 1000,
    batchSize: 10,
    prefetchEnabled: true
  },
  security: {
    sandboxed: false,
    allowedTools: [],
    deniedTools: [],
    maxFileSize: 10485760,
    allowedFileTypes: []
  }
};
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Azure Deployment & DNS Management

### Quick Container Deployment with Custom Domain

```bash
# Deploy a container with automatic DNS
npm run deploy:azure-dns-in
```

This will:
1. Create an Azure Container Instance
2. Automatically assign a subdomain (e.g., `myapp.digisquares.in`)
3. Configure DNS records in Azure DNS
4. Provide HTTPS support (optional)

### Setting Up DNS

```bash
# Initial DNS setup for your domain
npm run setup:azure-dns-in

# This provides:
# - Azure DNS zone creation
# - Nameserver configuration
# - Automatic subdomain management
```

### Programmatic Deployment

```typescript
import { AzureDNSIntegration } from './src/dns/azure-dns-integration';

// Deploy container with automatic DNS
const deployment = await dnsIntegration.createContainerWithDNS(
  { userId: 'user1', projectId: 'webapp' },
  { image: 'nginx:latest', cpu: 0.5, memoryGB: 1 }
);

// Access at: http://user1-webapp.digisquares.in
```

See [DNS & Domain Management Documentation](docs/DNS_DOMAIN_MANAGEMENT.md) for detailed guide.

## Advanced Usage

### Custom Capabilities

```typescript
import { Capability } from 'intelligent-agent-system';

const customCapability: Capability = {
  name: 'custom-capability',
  description: 'My custom capability',
  version: '1.0.0',
  tools: ['read', 'write'],
  patterns: [...],
  async initialize() {
    // Initialization logic
  },
  async execute(task, agent) {
    // Execution logic
    return result;
  }
};

agent.loadCapability(customCapability);
```

### Custom Tools

```typescript
import { BaseToolAdapter } from 'intelligent-agent-system';

class CustomTool extends BaseToolAdapter {
  name = 'customTool';
  description = 'My custom tool';
  parameters = {
    param1: { type: 'string', required: true }
  };

  async execute(params) {
    // Tool logic
    return this.success(result);
  }
}

agent.registerTool(new CustomTool());
```

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Support

For issues and feature requests, please use the GitHub issue tracker.