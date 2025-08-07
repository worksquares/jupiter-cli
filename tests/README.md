# Intelligent Agent System - Comprehensive Testing Suite

This directory contains comprehensive tests for the React framework code generation, building, and deployment workflow using Azure Container Instances and Azure Static Web Apps.

## Test Structure

```
tests/
├── utils/              # Test utilities and mocks
│   ├── test-helpers.ts # Common test utilities
│   └── azure-mocks.ts  # Mock implementations of Azure services
├── frontend-workflow/  # React code generation tests
│   └── react-generation.test.ts
├── integration/        # Azure integration tests
│   └── azure-deployment.test.ts
├── e2e/               # End-to-end workflow tests
│   ├── react-workflow-e2e.test.ts
│   └── performance.test.ts
└── setup.ts           # Jest global setup

```

## Running Tests

### All Tests
```bash
npm test                    # Run all tests
npm run test:all-suites    # Run all tests with coverage and verbose output
npm run test:coverage      # Run all tests with coverage report
```

### Specific Test Suites
```bash
npm run test:unit          # Run unit tests only
npm run test:integration   # Run integration tests only
npm run test:e2e          # Run end-to-end tests only
npm run test:frontend     # Run frontend workflow tests only
```

### Individual Test Files
```bash
npm run test:react        # Test React code generation
npm run test:deployment   # Test Azure deployment
npm run test:workflow     # Test complete workflow
npm run test:performance  # Run performance tests
```

### Watch Mode
```bash
npm run test:watch        # Run tests in watch mode
```

## Test Categories

### 1. React Code Generation Tests (`frontend-workflow/react-generation.test.ts`)
Tests the generation of React applications in Azure Container Instances:
- Template-based React generation
- AI-based React generation with custom features
- Build process in ACI
- Project structure validation
- Error handling for various failure scenarios

### 2. Azure Deployment Tests (`integration/azure-deployment.test.ts`)
Tests the deployment to Azure Static Web Apps:
- Static Web App creation with correct configuration
- Deployment process and verification
- Git integration and commit workflow
- Resource cleanup on failure
- Deployment status tracking

### 3. End-to-End Workflow Tests (`e2e/react-workflow-e2e.test.ts`)
Tests the complete workflow from request to deployment:
- Full workflow execution
- Concurrent workflow handling
- State tracking through events
- Error recovery and rollback
- Template vs AI generation
- Azure service integration

### 4. Performance Tests (`e2e/performance.test.ts`)
Tests system performance under load:
- Concurrent workflow performance (10+ workflows)
- Resource utilization efficiency
- Error recovery performance
- Memory usage and cleanup
- Scalability limits

## Test Utilities

### Mock Services
All Azure services are mocked to enable fast, reliable testing without actual Azure resources:
- `MockAzureContainerManager`: Simulates ACI operations
- `MockStaticWebAppManager`: Simulates Static Web App operations
- `MockGitHubService`: Simulates GitHub repository operations
- `MockJupiterDBClient`: Simulates database operations
- `MockProjectManager`: Simulates project management
- `MockAgent`: Simulates AI agent operations

### Test Helpers
- `createMockFrontendRequest()`: Creates test request objects
- `TestEventCollector`: Collects and analyzes workflow events
- `expectWorkflowStatus()`: Verifies workflow status events
- `validateReactProjectStructure()`: Validates generated project structure

## Writing New Tests

### Example Test Structure
```typescript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { FrontendWorkflowManager } from '../../src/services/frontend-workflow-manager';
import { createMockFrontendRequest, TestEventCollector } from '../utils/test-helpers';

describe('Your Test Suite', () => {
  let workflowManager: FrontendWorkflowManager;
  let eventCollector: TestEventCollector;

  beforeEach(() => {
    // Setup mocks and workflow manager
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should test specific functionality', async () => {
    const request = createMockFrontendRequest({
      // Custom request parameters
    });

    const result = await workflowManager.executeFrontendWorkflow(request);
    
    expect(result).toBeDefined();
    // Add your assertions
  });
});
```

## Coverage Reports

After running tests with coverage, view the detailed HTML report:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## Debugging Tests

### Run Single Test
```bash
npx jest tests/frontend-workflow/react-generation.test.ts -t "should use React template"
```

### Debug Mode
Add `--inspect` flag to debug tests:
```bash
node --inspect-brk ./node_modules/.bin/jest tests/e2e/react-workflow-e2e.test.ts
```

## CI/CD Integration

These tests are designed to run in CI/CD pipelines. Add to your workflow:

```yaml
- name: Run Tests
  run: |
    npm install
    npm run test:all-suites
```

## Performance Benchmarks

Expected performance metrics (in mock environment):
- Single workflow completion: < 1 second
- Concurrent workflows (10): < 5 seconds total
- Memory usage per workflow: < 2.5 MB
- Throughput: > 10 workflows/second

## Troubleshooting

### Common Issues

1. **Tests timing out**: Increase timeout in jest.config.js or specific test
2. **Memory issues**: Run performance tests with `--runInBand` flag
3. **Mock conflicts**: Ensure `jest.clearAllMocks()` in afterEach

### Environment Variables

Tests use these environment variables (set in setup.ts):
- `NODE_ENV=test`
- `AI_PROVIDER=cosmos`
- `AI_BASE_URL=https://cosmosapi.digisquares.com`

## Future Improvements

- [ ] Add real Azure integration tests (with test resources)
- [ ] Add visual regression tests for generated UI
- [ ] Add load testing with K6 or Artillery
- [ ] Add mutation testing
- [ ] Add contract testing for API integrations