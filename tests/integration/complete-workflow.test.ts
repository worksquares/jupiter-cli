/**
 * Complete Workflow Integration Test
 * Tests the entire pipeline from user request to Static Web App deployment
 * 
 * IMPORTANT: This is a REAL integration test - NO MOCKS
 * It will create real Azure resources and must be run with valid credentials
 */

import { DeploymentWorkflowOrchestrator } from '../../src/orchestration/deployment-workflow-orchestrator';
import { getEnvConfig } from '../../src/config/environment';
import { CleanupManager } from '../../src/utils/cleanup-manager';
import { Logger } from '../../src/utils/logger';

// Set test timeout to 30 minutes for complete workflow
jest.setTimeout(30 * 60 * 1000);

describe('Complete Deployment Workflow Integration Test', () => {
  let orchestrator: DeploymentWorkflowOrchestrator;
  let logger: Logger;
  let testUserId: string;
  let testProjectName: string;
  
  beforeAll(async () => {
    // Initialize environment
    const envConfig = getEnvConfig();
    logger = Logger.getInstance().child({ component: 'CompleteWorkflowTest' });
    
    // Verify all required environment variables
    expect(envConfig.azureSubscriptionId).toBeDefined();
    expect(envConfig.azureResourceGroup).toBeDefined();
    expect(envConfig.azureContainerRegistry).toBeDefined();
    expect(envConfig.githubToken).toBeDefined();
    expect(envConfig.cosmosApiKey).toBeDefined();
    
    // Create orchestrator
    orchestrator = new DeploymentWorkflowOrchestrator(
      envConfig.azureSubscriptionId,
      envConfig.azureResourceGroup
    );
    
    // Generate unique test identifiers
    const timestamp = Date.now();
    testUserId = `test-user-${timestamp}`;
    testProjectName = `test-project-${timestamp}`;
    
    logger.info('Test setup complete', { testUserId, testProjectName });
  });
  
  afterAll(async () => {
    // Execute all cleanup tasks
    logger.info('Starting test cleanup');
    await CleanupManager.getInstance().cleanup();
  });
  
  test('Complete deployment workflow - React app to Static Web App', async () => {
    // Step 1: Start deployment workflow
    logger.info('Starting deployment workflow');
    
    const workflow = await orchestrator.startDeployment({
      userId: testUserId,
      projectName: testProjectName,
      template: 'node',
      buildCommand: 'npm run build',
      outputPath: 'build',
      environmentVariables: {
        REACT_APP_TITLE: 'Test App',
        REACT_APP_API_URL: 'https://api.example.com'
      }
    });
    
    expect(workflow).toBeDefined();
    expect(workflow.id).toBeDefined();
    expect(workflow.status).toBe('running');
    
    logger.info('Workflow started', { workflowId: workflow.id });
    
    // Step 2: Monitor workflow progress
    let completed = false;
    let lastStatus = workflow.status;
    const maxWaitTime = 25 * 60 * 1000; // 25 minutes
    const startTime = Date.now();
    
    // Subscribe to workflow events
    orchestrator.on('workflow:step:complete', (data) => {
      logger.info('Step completed', { 
        step: data.step.name,
        duration: data.step.endTime?.getTime() - data.step.startTime?.getTime()
      });
    });
    
    orchestrator.on('workflow:step:failed', (data) => {
      logger.error('Step failed', { 
        step: data.step.name,
        error: data.step.error
      });
    });
    
    // Poll for completion
    while (!completed && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
      
      const currentWorkflow = orchestrator.getWorkflow(workflow.id);
      
      if (currentWorkflow) {
        if (currentWorkflow.status !== lastStatus) {
          logger.info('Workflow status changed', { 
            from: lastStatus,
            to: currentWorkflow.status,
            currentStep: currentWorkflow.currentStep,
            totalSteps: currentWorkflow.steps.length
          });
          lastStatus = currentWorkflow.status;
        }
        
        if (currentWorkflow.status === 'completed' || currentWorkflow.status === 'failed') {
          completed = true;
          workflow.status = currentWorkflow.status;
          workflow.deploymentUrl = currentWorkflow.deploymentUrl;
          workflow.error = currentWorkflow.error;
        }
      }
    }
    
    // Step 3: Verify results
    expect(completed).toBe(true);
    expect(workflow.status).toBe('completed');
    expect(workflow.deploymentUrl).toBeDefined();
    expect(workflow.deploymentUrl).toMatch(/^https:\/\/.*\.azurestaticapps\.net$/);
    
    logger.info('Workflow completed successfully', { 
      deploymentUrl: workflow.deploymentUrl,
      duration: Date.now() - startTime
    });
    
    // Step 4: Verify deployment is accessible
    const axios = require('axios');
    const response = await axios.get(workflow.deploymentUrl!, {
      timeout: 30000,
      validateStatus: (status: number) => status < 500
    });
    
    expect(response.status).toBe(200);
    logger.info('Deployment verified', { status: response.status });
    
    // Step 5: Verify all workflow steps completed
    const finalWorkflow = orchestrator.getWorkflow(workflow.id);
    expect(finalWorkflow).toBeDefined();
    
    const completedSteps = finalWorkflow!.steps.filter(s => 
      s.status === 'completed'
    ).length;
    
    expect(completedSteps).toBe(finalWorkflow!.steps.length - 1); // All except cleanup
    
    // Log final summary
    logger.info('Test completed successfully', {
      workflowId: workflow.id,
      deploymentUrl: workflow.deploymentUrl,
      totalDuration: Date.now() - startTime,
      stepsCompleted: completedSteps,
      totalSteps: finalWorkflow!.steps.length
    });
  });
  
  test('Workflow failure recovery', async () => {
    // Test workflow with intentional failure to verify recovery
    logger.info('Testing failure recovery workflow');
    
    const workflow = await orchestrator.startDeployment({
      userId: testUserId,
      projectName: `${testProjectName}-fail`,
      template: 'node',
      buildCommand: 'npm run build:nonexistent', // Intentional failure
      outputPath: 'build'
    });
    
    expect(workflow).toBeDefined();
    
    // Wait for failure and recovery attempt
    let recovered = false;
    const maxWaitTime = 10 * 60 * 1000; // 10 minutes
    const startTime = Date.now();
    
    orchestrator.on('recovery:attempted', (data) => {
      logger.info('Recovery attempted', { 
        workflowId: data.workflow.id,
        recovery: data.recovery
      });
      recovered = true;
    });
    
    // Poll for completion
    let completed = false;
    while (!completed && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const currentWorkflow = orchestrator.getWorkflow(workflow.id);
      if (currentWorkflow && 
          (currentWorkflow.status === 'completed' || currentWorkflow.status === 'failed')) {
        completed = true;
        workflow.status = currentWorkflow.status;
      }
    }
    
    expect(completed).toBe(true);
    expect(recovered).toBe(true);
    
    logger.info('Recovery test completed', { 
      finalStatus: workflow.status,
      recovered
    });
  });
});

/**
 * Test helper to verify Azure resources
 */
async function verifyAzureResources(
  subscriptionId: string,
  resourceGroup: string,
  containerName: string
): Promise<boolean> {
  try {
    const { ContainerInstanceManagementClient } = await import('@azure/arm-containerinstance');
    const { DefaultAzureCredential } = await import('@azure/identity');
    
    const credential = new DefaultAzureCredential();
    const client = new ContainerInstanceManagementClient(credential, subscriptionId);
    
    const container = await client.containerGroups.get(resourceGroup, containerName);
    return container?.provisioningState === 'Succeeded';
  } catch (error) {
    return false;
  }
}