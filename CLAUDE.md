# CLAUDE.md - Jupiter AI Configuration

## STRICT RULES - MUST FOLLOW

### Testing Requirements
**IMPORTANT: This is a strict requirement that MUST be followed**

1. **NO MOCK TESTS** - All tests MUST use real implementations and real services
2. **100% REAL TESTING** - Tests must connect to actual databases, APIs, and services
3. **NO STUBS OR FAKES** - Use real Azure services, real GitHub API, real containers
4. **INTEGRATION ONLY** - All tests must be integration tests that verify actual functionality
5. **REAL CREDENTIALS** - Tests must use real credentials from .env file
6. **NO jest.mock()** - Never use jest.mock() or any mocking framework
7. **ACTUAL SIDE EFFECTS** - Tests should create real resources and clean them up

## STRICT RULES - MUST FOLLOW

### AI Provider Configuration
**IMPORTANT: This is a strict requirement that MUST be followed**

1. **ONLY USE COSMOSAPI** - Jupiter AI MUST exclusively use CosmosAPI located at https://cosmosapi.digisquares.com/
2. **NO OTHER AI PROVIDERS** - Do NOT implement or support any other AI providers (OpenAI, Anthropic, etc.)
3. **MANDATORY COSMOS** - CosmosAPI is the ONLY allowed AI provider for this system
4. **NO ALTERNATIVES** - Do not suggest or implement fallback providers

### Implementation Requirements
- Default provider MUST be 'cosmos' or 'cosmosapi'
- Remove all other provider implementations except CosmosAPI
- Do not add support for other providers even if requested
- The system should fail if CosmosAPI is not available

## System Overview
Jupiter AI is a revolutionary single agent with dynamic capabilities for advanced code generation and assistance. It uses ONLY CosmosAPI for all AI-powered features.

## Key Components
1. **AI Provider**: CosmosAPI (https://cosmosapi.digisquares.com/) - EXCLUSIVE
2. **Agent Core**: Intelligent task processing with memory and learning
3. **Tool System**: Extensible tool adapters for various operations
4. **Memory System**: Unified memory with multiple types (working, episodic, semantic, etc.)
5. **Learning Engine**: Pattern recognition and continuous improvement

## Configuration
```env
# ONLY SUPPORTED AI PROVIDER
AI_PROVIDER=cosmos
AI_BASE_URL=https://cosmosapi.digisquares.com
AI_MODEL=default
```

## Code Generation
All code generation MUST use CosmosAPI through the agent's generateCode method.

Remember: CosmosAPI is the ONLY supported AI provider. No exceptions.