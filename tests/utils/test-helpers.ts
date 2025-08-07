/**
 * Test Utilities and Helpers
 * Common utilities for testing the frontend workflow
 */

import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { FrontendProjectRequest, FrontendWorkflowResult } from '../../src/services/frontend-workflow-manager';
import { AgentTask, AgentTaskResult } from '../../src/core/types';

export class TestEventCollector extends EventEmitter {
  public events: Array<{ event: string; data: any; timestamp: number }> = [];

  constructor() {
    super();
    this.onAny((event: string, data: any) => {
      this.events.push({
        event,
        data,
        timestamp: Date.now()
      });
    });
  }

  getEvents(eventName?: string): Array<{ event: string; data: any; timestamp: number }> {
    if (eventName) {
      return this.events.filter(e => e.event === eventName);
    }
    return this.events;
  }

  clear(): void {
    this.events = [];
  }
}

export function createMockFrontendRequest(overrides: Partial<FrontendProjectRequest> = {}): FrontendProjectRequest {
  return {
    userId: 'test-user-123',
    projectName: `test-react-project-${Date.now()}`,
    framework: 'react',
    description: 'Test React application',
    features: ['routing', 'state-management', 'testing'],
    template: 'react',
    metadata: {
      testRun: true,
      timestamp: Date.now()
    },
    ...overrides
  };
}

export function createMockWorkflowResult(projectName: string): FrontendWorkflowResult {
  const projectId = uuidv4();
  const taskId = uuidv4();
  const deploymentId = uuidv4();
  const staticWebAppId = uuidv4();

  return {
    project: {
      id: projectId,
      name: projectName,
      githubRepo: `https://github.com/test-org/${projectName}.git`
    },
    task: {
      id: taskId,
      branch: `task/${taskId}`
    },
    deployment: {
      id: deploymentId,
      url: `https://${projectName}.azurestaticapps.net`,
      customDomain: `${projectName}.example.com`,
      staticWebAppId
    },
    aci: {
      instanceId: `aci-${projectId}`,
      url: `https://aci-${projectId}.eastus.azurecontainer.io`
    }
  };
}

export function createMockAgentTaskResult(success: boolean = true): AgentTaskResult {
  return {
    success,
    data: success ? {
      files: [
        'src/App.tsx',
        'src/index.tsx',
        'src/components/Header.tsx',
        'package.json',
        'tsconfig.json'
      ],
      output: 'Successfully generated React application'
    } : undefined,
    error: success ? undefined : {
      code: 'GENERATION_FAILED',
      message: 'Failed to generate React application'
    }
  };
}

export async function waitForEvent(
  emitter: EventEmitter,
  eventName: string,
  timeout: number = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeout);

    emitter.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

export function expectWorkflowStatus(
  events: Array<{ event: string; data: any }>,
  step: string,
  status: string
): void {
  const statusEvent = events.find(e => 
    e.event === 'status' && 
    e.data.step === step && 
    e.data.status === status
  );
  
  if (!statusEvent) {
    throw new Error(`Expected workflow status '${status}' for step '${step}' not found`);
  }
}

export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function validateReactProjectStructure(files: string[]): boolean {
  const requiredFiles = [
    'package.json',
    'tsconfig.json',
    'src/App.tsx',
    'src/index.tsx',
    'public/index.html'
  ];

  return requiredFiles.every(file => 
    files.some(f => f.includes(file))
  );
}

export function generateTestProjectName(): string {
  return `test-react-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}