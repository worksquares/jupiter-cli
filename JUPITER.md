# JUPITER.md

This file provides guidance to Jupiter Intelligent Agent System when working with code in this repository.

## Commands

### Build and Development
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Development mode with hot reload
npm run dev

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run comprehensive test suite
npm run test:comprehensive

# Run interactive tests
npm run test:interactive
```

### Code Quality
```bash
# Run ESLint
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Type checking
npm run typecheck
```

### API Server
```bash
# Start the API server
npm start

# Development server with auto-reload
npm run dev
```

## High-Level Architecture

### Core System Design
The Jupiter Intelligent Agent System follows a modular, event-driven architecture with these key components:

1. **Agent Core** (`src/core/`)
   - `Agent`: Main orchestrator that coordinates all subsystems
   - `AgentWithHooks`: Extended agent with event hook support
   - `Analyzer`: Analyzes requests and determines appropriate actions
   - `Planner`: Creates execution plans based on analysis
   - `Executor`: Executes plans using available tools

2. **Tool System** (`src/tools/`)
   - Extensible adapter pattern for integrating external capabilities
   - Hook-aware adapters for lifecycle events
   - Permission-aware adapters for access control
   - MCP tool adapters for external server integration

3. **Memory System** (`src/memory/`)
   - Unified memory architecture supporting multiple memory types
   - Working, episodic, semantic, and procedural memory
   - Automatic consolidation and importance-based retention

4. **Learning Engine** (`src/learning/`)
   - Pattern recognition and continuous improvement
   - Feedback integration and performance optimization
   - Success/failure pattern analysis

### Advanced Features

1. **MCP (Model Context Protocol) System** (`src/mcp/`)
   - Supports STDIO, HTTP, and SSE transports
   - Dynamic tool discovery and integration
   - Authentication management for secure connections
   - Auto-reconnection with exponential backoff

2. **Conversation Management** (`src/conversation/`)
   - Full conversation history tracking
   - Resume capability for interrupted sessions
   - Bookmarking and search functionality
   - Export/import for backup and analysis

3. **Security & Permissions** (`src/security/`)
   - Fine-grained permission rules (Allow/Deny/Workspace)
   - Pattern matching for commands and file paths
   - Workspace restrictions for file operations
   - Real-time permission checking

4. **Hook System** (`src/hooks/`)
   - Event-driven automation (PreToolUse, PostToolUse, etc.)
   - Security validation for hook commands
   - User consent for risky operations
   - Parallel execution with timeout handling

5. **Rate Limiting** (`src/rate-limiting/`)
   - Multiple strategies: Fixed window, Sliding window, Token bucket
   - Provider-specific configurations
   - Global state aggregation
   - Automatic fallback handling

## Development Workflow

### Adding New Tools
1. Create adapter in `src/tools/adapters/`
2. Extend `BaseToolAdapter` class
3. Implement `execute()` and `validate()` methods
4. Register in tool registry

### Creating Commands
1. Implement `Command` interface in `src/commands/`
2. Add to `CommandRegistry`
3. Commands should be concise and focused

### Extending Memory Types
1. Add new memory type in `src/memory/types.ts`
2. Implement storage and retrieval logic
3. Configure retention policies

### MCP Server Integration
1. Define server config with transport type
2. Add to MCP manager
3. Tools are automatically discovered and integrated

## Key Design Patterns

- **Adapter Pattern**: For tool integration and extensibility
- **Event-Driven Architecture**: For loose coupling between components
- **Strategy Pattern**: For different rate limiting and memory strategies
- **Factory Pattern**: For creating appropriate clients and adapters
- **Singleton Pattern**: For global managers (rate limiting, settings)

## Performance Considerations

- Tool execution is batched when possible
- Memory consolidation runs on intervals
- Caching is used for permissions and rate limits
- Background shells for long-running operations
- Lazy loading for conversation history

## Security Best Practices

- All file operations respect workspace boundaries
- Hook commands are validated for dangerous patterns
- Permission system prevents unauthorized tool usage
- Rate limiting protects against API abuse
- Authentication tokens are securely managed

## Testing Strategy

- Unit tests for individual components
- Integration tests for subsystem interactions
- Comprehensive test suite for full system validation
- Interactive tests for user-facing features
- Mock implementations for external dependencies