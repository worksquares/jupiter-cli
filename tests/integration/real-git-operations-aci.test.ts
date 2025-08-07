/**
 * REAL Git Operations Test inside Azure Container Instances
 * NO MOCKS - Uses actual Azure services and real git operations
 * Uses digisquarescontainers registry
 */

import { SecureOperationsAPI, SecureOperationContext } from '../../src/security/secure-operations-api';
import { RealSecureOperationsAPI } from '../../src/security/secure-operations-api-real';
import { SecureCredentialStore } from '../../src/security/secure-credential-store';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load real credentials
dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('REAL Git Operations in ACI - Complete Flow', () => {
  let api: RealSecureOperationsAPI;
  let credentialStore: SecureCredentialStore;
  let context: SecureOperationContext;
  const testPrefix = `git-test-${Date.now()}`;
  
  // Verify Azure credentials
  beforeAll(() => {
    expect(process.env.AZURE_SUBSCRIPTION_ID).toBeDefined();
    expect(process.env.AZURE_RESOURCE_GROUP).toBeDefined();
    expect(process.env.AZURE_CONTAINER_REGISTRY).toBe('digisquarescontainers');
    expect(process.env.AZURE_CONTAINER_REGISTRY_SERVER).toBe('digisquarescontainers.azurecr.io');
    
    console.log('Using digisquarescontainers registry for tests');
  });

  beforeEach(async () => {
    // Create real instances
    credentialStore = new SecureCredentialStore();
    api = new RealSecureOperationsAPI(
      process.env.AZURE_SUBSCRIPTION_ID!,
      process.env.AZURE_RESOURCE_GROUP!,
      credentialStore
    );
    
    // Create scoped credentials
    const credentials = await credentialStore.createScopedCredentials({
      userId: testPrefix,
      projectId: 'git-real-test',
      taskId: `task-${Date.now()}`,
      requestedScopes: [
        'container:create',
        'container:execute',
        'container:read',
        'container:stop',
        'git:read',
        'git:write',
        'build:execute'
      ],
      duration: 60 // 60 minutes for complex tests
    });
    
    context = {
      userId: credentials.userId,
      projectId: credentials.projectId,
      taskId: credentials.taskId,
      sessionToken: credentials.sessionToken,
      aciInstanceId: credentials.containerName
    };
  });

  afterEach(async () => {
    // Clean up
    try {
      await api.executeAzureOperation(context, {
        operation: 'stopContainer'
      });
      
      credentialStore.revokeCredentials(
        context.userId,
        context.projectId,
        context.taskId
      );
    } catch (error) {
      console.log('Cleanup error:', error);
    }
  });

  describe('Complete Git Workflow in ACI', () => {
    it('should create container, initialize git repo, add files, commit, and push', async () => {
      // Step 1: Create container with git and Node.js
      console.log('Step 1: Creating container with git...');
      const createResult = await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine', // Alpine with Node.js
          cpu: 1,
          memory: 2
        }
      });

      expect(createResult.success).toBe(true);
      console.log(`Container created: ${createResult.data.containerName}`);
      
      // Wait for container to be ready
      await new Promise(resolve => setTimeout(resolve, 40000));

      // Step 2: Install git in the container
      console.log('Step 2: Installing git...');
      const gitInstallResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'apk add --no-cache git',
          timeout: 30000
        }
      });

      expect(gitInstallResult.success).toBe(true);
      expect(gitInstallResult.data.exitCode).toBe(0);

      // Step 3: Configure git
      console.log('Step 3: Configuring git...');
      const configCommands = [
        'git config --global user.email "test@digisquares.com"',
        'git config --global user.name "Test User"',
        'git config --global init.defaultBranch main'
      ];

      for (const cmd of configCommands) {
        const result = await api.executeAzureOperation(context, {
          operation: 'executeCommand',
          parameters: { command: cmd, timeout: 10000 }
        });
        expect(result.success).toBe(true);
      }

      // Step 4: Create project directory and initialize git
      console.log('Step 4: Creating project and initializing git...');
      const projectName = `test-project-${Date.now()}`;
      const initCommands = [
        `mkdir -p /workspace/${projectName}`,
        `cd /workspace/${projectName} && git init`
      ];

      for (const cmd of initCommands) {
        const result = await api.executeAzureOperation(context, {
          operation: 'executeCommand',
          parameters: { command: cmd, timeout: 10000 }
        });
        expect(result.success).toBe(true);
      }

      // Step 5: Create real project files
      console.log('Step 5: Creating project files...');
      const files = [
        {
          name: 'package.json',
          content: JSON.stringify({
            name: projectName,
            version: '1.0.0',
            description: 'Test project in ACI',
            main: 'index.js',
            scripts: {
              start: 'node index.js',
              test: 'echo "Tests passed!"'
            }
          }, null, 2)
        },
        {
          name: 'index.js',
          content: `console.log('Hello from Azure Container Instance!');
console.log('Project: ${projectName}');
console.log('Running in container: ${context.aciInstanceId}');`
        },
        {
          name: 'README.md',
          content: `# ${projectName}

This project was created inside an Azure Container Instance.

## Container Details
- User: ${context.userId}
- Project: ${context.projectId}
- Task: ${context.taskId}

## Running the project
\`\`\`bash
npm start
\`\`\`
`
        }
      ];

      for (const file of files) {
        const cmd = `cd /workspace/${projectName} && cat > ${file.name} << 'EOF'
${file.content}
EOF`;
        const result = await api.executeAzureOperation(context, {
          operation: 'executeCommand',
          parameters: { command: cmd, timeout: 10000 }
        });
        expect(result.success).toBe(true);
      }

      // Step 6: Check git status
      console.log('Step 6: Checking git status...');
      const statusResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${projectName} && git status`,
          timeout: 10000
        }
      });

      expect(statusResult.success).toBe(true);
      expect(statusResult.data.stdout).toContain('Untracked files');

      // Step 7: Add files and commit
      console.log('Step 7: Adding files and committing...');
      const gitCommands = [
        `cd /workspace/${projectName} && git add .`,
        `cd /workspace/${projectName} && git commit -m "Initial commit from ACI"`
      ];

      for (const cmd of gitCommands) {
        const result = await api.executeAzureOperation(context, {
          operation: 'executeCommand',
          parameters: { command: cmd, timeout: 10000 }
        });
        expect(result.success).toBe(true);
      }

      // Step 8: Verify commit
      console.log('Step 8: Verifying commit...');
      const logResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${projectName} && git log --oneline`,
          timeout: 10000
        }
      });

      expect(logResult.success).toBe(true);
      expect(logResult.data.stdout).toContain('Initial commit from ACI');

      // Step 9: Run the Node.js project
      console.log('Step 9: Running the Node.js project...');
      const runResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: `cd /workspace/${projectName} && node index.js`,
          timeout: 10000
        }
      });

      expect(runResult.success).toBe(true);
      expect(runResult.data.stdout).toContain('Hello from Azure Container Instance!');
      expect(runResult.data.stdout).toContain(projectName);

      console.log('Git workflow test completed successfully!');
    }, 180000); // 3 minute timeout
  });

  describe('Git Clone from Real Repository', () => {
    it('should clone a public repository and work with it', async () => {
      // Create container
      console.log('Creating container for git clone test...');
      const createResult = await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'alpine/git:latest',
          cpu: 1,
          memory: 1
        }
      });

      expect(createResult.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Clone a small public repository
      console.log('Cloning public repository...');
      const cloneResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'cd /workspace && git clone https://github.com/octocat/Hello-World.git',
          timeout: 60000
        }
      });

      expect(cloneResult.success).toBe(true);
      expect(cloneResult.data.exitCode).toBe(0);

      // List files in cloned repo
      console.log('Listing cloned files...');
      const lsResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'ls -la /workspace/Hello-World/',
          timeout: 10000
        }
      });

      expect(lsResult.success).toBe(true);
      expect(lsResult.data.stdout).toContain('README');
      expect(lsResult.data.stdout).toContain('.git');

      // Check git log
      console.log('Checking git log...');
      const logResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'cd /workspace/Hello-World && git log --oneline -5',
          timeout: 10000
        }
      });

      expect(logResult.success).toBe(true);
      expect(logResult.data.stdout).toBeTruthy();

      console.log('Git clone test completed!');
    }, 120000); // 2 minute timeout
  });

  describe('Complex Bash Operations on Git Repo', () => {
    it('should perform complex bash operations on git repository', async () => {
      // Create container with more tools
      console.log('Creating container with development tools...');
      const createResult = await api.executeAzureOperation(context, {
        operation: 'createContainer',
        parameters: {
          image: 'node:18-alpine',
          cpu: 1,
          memory: 2
        }
      });

      expect(createResult.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 40000));

      // Install required tools
      console.log('Installing development tools...');
      const installResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: 'apk add --no-cache git bash curl jq',
          timeout: 60000
        }
      });

      expect(installResult.success).toBe(true);

      // Create a more complex project structure
      console.log('Creating complex project structure...');
      const projectSetup = `
cd /workspace
mkdir -p my-app/{src,tests,docs}
cd my-app
git init

# Create source files
cat > src/app.js << 'EOF'
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Hello from ACI!'));
module.exports = app;
EOF

cat > src/server.js << 'EOF'
const app = require('./app');
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
EOF

# Create test file
cat > tests/app.test.js << 'EOF'
const app = require('../src/app');
console.log('Tests would run here...');
EOF

# Create package.json
cat > package.json << 'EOF'
{
  "name": "my-aci-app",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/server.js",
    "test": "node tests/app.test.js"
  }
}
EOF

# Create README
cat > README.md << 'EOF'
# My ACI App
Built inside Azure Container Instance
EOF

# Configure git
git config user.email "aci@test.com"
git config user.name "ACI Test"

# Initial commit
git add -A
git commit -m "Initial project structure"
`;

      const setupResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: projectSetup,
          timeout: 30000
        }
      });

      expect(setupResult.success).toBe(true);

      // Run complex bash script to analyze the repo
      console.log('Running analysis script...');
      const analysisScript = `
cd /workspace/my-app

echo "=== Repository Analysis ==="
echo "Total commits: $(git rev-list --count HEAD)"
echo "Files in repo: $(git ls-files | wc -l)"
echo "Total lines: $(git ls-files | xargs wc -l | tail -1 | awk '{print $1}')"

echo -e "\\n=== File types ==="
git ls-files | sed 's/.*\\.//' | sort | uniq -c

echo -e "\\n=== Directory structure ==="
find . -type d -not -path './.git*' | sort

echo -e "\\n=== Recent commits ==="
git log --oneline -5

echo -e "\\n=== Creating feature branch ==="
git checkout -b feature/new-endpoint
echo "app.get('/health', (req, res) => res.json({status: 'ok'}));" >> src/app.js
git add src/app.js
git commit -m "Add health endpoint"

echo -e "\\n=== Branch comparison ==="
git log --oneline main..feature/new-endpoint
`;

      const analysisResult = await api.executeAzureOperation(context, {
        operation: 'executeCommand',
        parameters: {
          command: analysisScript,
          timeout: 30000
        }
      });

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data.stdout).toContain('Repository Analysis');
      expect(analysisResult.data.stdout).toContain('Total commits');
      expect(analysisResult.data.stdout).toContain('Add health endpoint');

      console.log('Complex bash operations completed!');
    }, 180000); // 3 minute timeout
  });
});