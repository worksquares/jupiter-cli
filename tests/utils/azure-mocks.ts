/**
 * Azure Service Mocks
 * Mock implementations of Azure services for testing
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export class MockAzureContainerManager {
  private containers: Map<string, any> = new Map();
  
  async createOrGetContainer(params: any): Promise<any> {
    const containerId = params.projectId || uuidv4();
    const container = {
      id: containerId,
      name: params.containerName || `aci-${containerId}`,
      url: `https://aci-${containerId}.eastus.azurecontainer.io`,
      status: 'Running',
      ipAddress: '10.0.0.1',
      ports: [{ port: 3000, protocol: 'TCP' }],
      gitRepo: params.gitRepo
    };
    
    this.containers.set(containerId, container);
    return container;
  }

  async executeCommand(containerId: string, command: string): Promise<any> {
    const container = this.containers.get(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    // Simulate command execution
    return {
      success: true,
      output: `Executed: ${command}`,
      exitCode: 0
    };
  }

  async deleteContainer(containerId: string): Promise<void> {
    this.containers.delete(containerId);
  }

  getContainer(containerId: string): any {
    return this.containers.get(containerId);
  }
}

export class MockStaticWebAppManager {
  private apps: Map<string, any> = new Map();
  
  async createStaticWebApp(options: any): Promise<any> {
    const appId = uuidv4();
    const deploymentId = uuidv4();
    
    const app = {
      staticWebAppId: appId,
      deploymentId,
      name: options.name,
      defaultHostname: `${options.name}.azurestaticapps.net`,
      customDomain: options.customDomain,
      repositoryUrl: options.repositoryUrl,
      branch: options.branch,
      status: 'Ready',
      deploymentToken: `deployment-token-${appId}`
    };
    
    this.apps.set(appId, app);
    return app;
  }

  async deployToStaticWebApp(appId: string, deploymentId: string): Promise<any> {
    const app = this.apps.get(appId);
    if (!app) {
      throw new Error(`Static Web App ${appId} not found`);
    }

    return {
      success: true,
      deploymentId,
      url: `https://${app.defaultHostname}`,
      status: 'Deployed',
      timestamp: new Date().toISOString()
    };
  }

  async deleteStaticWebApp(appId: string): Promise<void> {
    this.apps.delete(appId);
  }

  getApp(appId: string): any {
    return this.apps.get(appId);
  }
}

export class MockGitHubService {
  private repos: Map<string, any> = new Map();
  
  async createRepository(name: string, description?: string): Promise<any> {
    const repo = {
      id: uuidv4(),
      name,
      full_name: `test-org/${name}`,
      url: `https://github.com/test-org/${name}`,
      clone_url: `https://github.com/test-org/${name}.git`,
      description,
      private: false,
      default_branch: 'main'
    };
    
    this.repos.set(name, repo);
    return repo;
  }

  async createBranch(repo: string, branch: string, baseBranch: string = 'main'): Promise<void> {
    const repository = this.repos.get(repo);
    if (!repository) {
      throw new Error(`Repository ${repo} not found`);
    }
    
    // Simulate branch creation
  }

  async getRepository(name: string): Promise<any> {
    return this.repos.get(name);
  }
}

export class MockJupiterDBClient {
  private data: Map<string, any[]> = new Map();
  
  async execute(query: string, params?: any[]): Promise<any> {
    // Simulate database operations
    if (query.includes('INSERT')) {
      return { insertId: Math.floor(Math.random() * 1000), affectedRows: 1 };
    }
    if (query.includes('UPDATE')) {
      return { affectedRows: 1 };
    }
    if (query.includes('SELECT')) {
      return [];
    }
    return { affectedRows: 0 };
  }

  async query(sql: string, params?: any[]): Promise<any[]> {
    return [];
  }

  async insert(table: string, data: any): Promise<number> {
    return Math.floor(Math.random() * 1000);
  }

  async update(table: string, data: any, where: any): Promise<number> {
    return 1;
  }
}

export class MockProjectManager {
  private projects: Map<string, any> = new Map();
  private tasks: Map<string, any> = new Map();
  
  async getOrCreateProject(userId: string, name: string, description?: string): Promise<any> {
    const projectId = uuidv4();
    const project = {
      project: {
        id: projectId,
        name,
        description,
        userId,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      githubRepo: {
        id: uuidv4(),
        name,
        url: `https://github.com/test-org/${name}.git`
      }
    };
    
    this.projects.set(projectId, project);
    return project;
  }

  async createTask(projectId: string, taskData: any): Promise<any> {
    const taskId = uuidv4();
    const branch = `task/${taskId}`;
    
    const task = {
      task: {
        id: taskId,
        projectId,
        ...taskData,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      branch,
      aciInstance: {
        id: `aci-${projectId}`,
        url: `https://aci-${projectId}.eastus.azurecontainer.io`
      }
    };
    
    this.tasks.set(taskId, task);
    return task;
  }

  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.task.status = status;
      task.task.updatedAt = new Date();
    }
  }
}

export class MockAgent {
  async processTask(task: any): Promise<any> {
    // Simulate successful code generation
    return {
      success: true,
      data: {
        files: [
          'package.json',
          'tsconfig.json',
          'tailwind.config.js',
          'postcss.config.js',
          'src/index.tsx',
          'src/App.tsx',
          'src/index.css',
          'src/components/Header.tsx',
          'src/pages/HomePage.tsx',
          'src/pages/AboutPage.tsx',
          'public/index.html'
        ],
        output: 'React application generated successfully with Tailwind CSS'
      }
    };
  }

  tools = new Map([
    ['aciBash', {
      execute: async (params: any) => ({
        success: true,
        output: 'Command executed successfully',
        exitCode: 0
      })
    }],
    ['aciGit', {
      execute: async (params: any) => ({
        success: true
      })
    }]
  ]);
}