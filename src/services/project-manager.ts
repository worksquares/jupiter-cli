/**
 * Project Manager Service
 * Orchestrates project creation, GitHub repos, tasks, and ACI instances
 */

import { Logger } from '../utils/logger';
import { JupiterDBClient } from '../database/jupiter-db-client';
import { GitHubService } from './github-service';
import { AzureContainerManager } from '../azure/aci-manager';
import { AzureAPIClient } from '../clients/azure-api-client';
import { azureAPIConfig } from '../config/azure-api-config';
import { 
  Project, 
  ProjectStatus,
  CreateProjectInput,
  projectFromRow,
  projectToRow 
} from '../database/models/project';
import { 
  Task, 
  TaskStatus,
  TaskType,
  CreateTaskInput,
  taskFromRow,
  taskToRow 
} from '../database/models/task';
import { SegregationContext } from '../core/segregation-types';
import { v4 as uuidv4 } from 'uuid';

export interface ProjectManagerConfig {
  db: JupiterDBClient;
  github: GitHubService;
  aci: AzureContainerManager;
  githubOrg?: string;
  defaultGitignoreTemplate?: string;
}

export interface CreateProjectResult {
  project: Project;
  githubRepo: {
    url: string;
    sshUrl: string;
    branch: string;
  };
}

export interface CreateTaskResult {
  task: Task;
  branch: string;
  aciInstance: {
    id: string;
    url: string;
  };
}

export class ProjectManager {
  private logger: Logger;
  private db: JupiterDBClient;
  private github: GitHubService;
  private aci: AzureContainerManager;
  private azureClient: AzureAPIClient;
  private config: ProjectManagerConfig;

  constructor(config: ProjectManagerConfig) {
    this.logger = new Logger('ProjectManager');
    this.config = config;
    this.db = config.db;
    this.github = config.github;
    this.aci = config.aci;
    this.azureClient = new AzureAPIClient(azureAPIConfig);
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string): Promise<Project | null> {
    const row = await this.db.queryOne(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    );
    
    return row ? projectFromRow(row) : null;
  }

  /**
   * Get or create project
   */
  async getOrCreateProject(
    userId: string,
    projectName: string,
    description?: string
  ): Promise<CreateProjectResult> {
    // Check if project exists
    const existing = await this.db.queryOne<any>(
      'SELECT * FROM projects WHERE user_id = ? AND name = ? AND status = ?',
      [userId, projectName, ProjectStatus.ACTIVE]
    );

    if (existing) {
      const project = projectFromRow(existing);
      this.logger.info('Using existing project', { projectId: project.id });
      
      return {
        project,
        githubRepo: {
          url: project.githubRepo!,
          sshUrl: project.githubRepo!.replace('https://github.com/', 'git@github.com:') + '.git',
          branch: project.defaultBranch
        }
      };
    }

    // Create new project
    return this.createProject({
      name: projectName,
      userId,
      description,
      status: ProjectStatus.ACTIVE,
      defaultBranch: 'main'
    });
  }

  /**
   * Create a new project with GitHub repo
   */
  async createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
    const projectId = uuidv4();
    
    try {
      // Create GitHub repository
      const repoName = this.sanitizeRepoName(input.name);
      const repo = await this.github.createRepository({
        name: repoName,
        description: input.description,
        private: true,
        autoInit: true,
        gitignoreTemplate: this.config.defaultGitignoreTemplate || 'Node'
      });

      // Create project record
      const project: Project = {
        id: projectId,
        name: input.name,
        userId: input.userId,
        githubRepo: repo.cloneUrl,
        defaultBranch: repo.defaultBranch,
        description: input.description,
        status: input.status || ProjectStatus.ACTIVE,
        metadata: input.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert into database
      const row = projectToRow(project);
      await this.db.execute(
        `INSERT INTO projects 
         (id, name, user_id, github_repo, default_branch, description, status, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.name,
          row.user_id,
          row.github_repo,
          row.default_branch,
          row.description,
          row.status,
          row.metadata,
          row.created_at,
          row.updated_at
        ]
      );

      this.logger.info('Project created', { 
        projectId, 
        name: input.name, 
        repo: repo.fullName 
      });

      return {
        project,
        githubRepo: {
          url: repo.cloneUrl,
          sshUrl: repo.sshUrl,
          branch: repo.defaultBranch
        }
      };
    } catch (error) {
      this.logger.error('Failed to create project', error);
      throw error;
    }
  }

  /**
   * Create a task within a project
   */
  async createTask(
    projectId: string,
    input: {
      type: TaskType;
      title: string;
      description: string;
      metadata?: Record<string, any>;
    }
  ): Promise<CreateTaskResult> {
    const taskId = uuidv4();
    
    try {
      // Get project
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      // Parse GitHub repo info
      const repoInfo = this.github.parseGitHubUrl(project.githubRepo!);
      if (!repoInfo) {
        throw new Error('Invalid GitHub repository URL');
      }

      // Generate branch name
      const branchName = this.github.generateBranchName(taskId, input.type);
      
      // Create branch
      await this.github.createBranch({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        branch: branchName,
        fromBranch: project.defaultBranch
      });

      // Create segregation context
      const context: SegregationContext = {
        userId: project.userId,
        projectId: project.id,
        taskId: taskId,
        sessionId: `session-${Date.now()}`
      };

      // Create ACI with repo cloned
      const dockerConfig = {
        image: 'node:18',
        memoryGB: 2,
        exposedPorts: [3000],
        environment: {
          GIT_REPO: project.githubRepo!,
          GIT_BRANCH: branchName,
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || ''
        }
      };

      const container = await this.aci.getOrCreateContainer(
        context,
        dockerConfig
      );

      const aciInstanceId = container.name!;
      const aciUrl = `http://${container.ipAddress?.fqdn || container.ipAddress?.ip}`;

      // Create task record
      const task: Task = {
        id: taskId,
        projectId,
        type: input.type,
        title: input.title,
        description: input.description,
        branchName,
        aciInstanceId,
        status: TaskStatus.PENDING,
        metadata: input.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert into database
      const row = taskToRow(task);
      await this.db.execute(
        `INSERT INTO tasks 
         (id, project_id, type, title, description, branch_name, aci_instance_id, 
          status, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.project_id,
          row.type,
          row.title,
          row.description,
          row.branch_name,
          row.aci_instance_id,
          row.status,
          row.metadata,
          row.created_at,
          row.updated_at
        ]
      );

      // Update ACI status in database
      await this.updateACIStatus(aciInstanceId, 'Running', taskId);

      this.logger.info('Task created', { 
        taskId, 
        projectId, 
        branch: branchName,
        aciInstance: aciInstanceId
      });

      return {
        task,
        branch: branchName,
        aciInstance: {
          id: aciInstanceId,
          url: aciUrl
        }
      };
    } catch (error) {
      this.logger.error('Failed to create task', error);
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: any,
    error?: string
  ): Promise<void> {
    const updates: any = {
      status,
      updated_at: new Date()
    };

    if (result !== undefined) {
      updates.result = JSON.stringify(result);
    }

    if (error !== undefined) {
      updates.error = error;
    }

    if (status === TaskStatus.RUNNING) {
      updates.started_at = new Date();
    } else if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      updates.completed_at = new Date();
    }

    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(taskId);

    await this.db.execute(
      `UPDATE tasks SET ${setClause} WHERE id = ?`,
      values
    );

    // Schedule ACI cleanup if task is completed
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      await this.scheduleACICleanup(taskId);
    }
  }

  /**
   * Update ACI status in database
   */
  private async updateACIStatus(
    instanceId: string,
    state: 'Running' | 'Paused' | 'Terminated',
    taskId?: string
  ): Promise<void> {
    const now = new Date();
    
    // Check if ACI status record exists
    const existing = await this.db.queryOne(
      'SELECT * FROM aci_instances WHERE instance_id = ?',
      [instanceId]
    );

    if (existing) {
      const updates: any = {
        state,
        last_activity_at: now,
        updated_at: now
      };

      if (state === 'Paused') {
        updates.paused_at = now;
        // Schedule termination after 4 hours
        updates.scheduled_termination_at = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      } else if (state === 'Running') {
        updates.paused_at = null;
        updates.scheduled_termination_at = null;
      }

      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(instanceId);

      await this.db.execute(
        `UPDATE aci_instances SET ${setClause} WHERE instance_id = ?`,
        values
      );
    } else {
      // Insert new record
      await this.db.execute(
        `INSERT INTO aci_instances 
         (instance_id, task_id, state, last_activity_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [instanceId, taskId, state, now, now, now]
      );
    }
  }

  /**
   * Schedule ACI cleanup after task completion
   */
  private async scheduleACICleanup(taskId: string): Promise<void> {
    // Get task details
    const task = await this.db.queryOne<any>(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );

    if (!task || !task.aci_instance_id) {
      return;
    }

    // Wait 5 minutes then pause the ACI
    setTimeout(async () => {
      try {
        await this.pauseACI(task.aci_instance_id);
      } catch (error) {
        this.logger.error('Failed to pause ACI', { taskId, error });
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Pause an ACI instance
   */
  private async pauseACI(instanceId: string): Promise<void> {
    // In Azure, we can't truly "pause" a container, so we'll stop it
    // The container state will be tracked in our database
    
    try {
      // Note: Stop operation might not be available via API
      this.logger.info('Pausing ACI (marking as paused)', { instanceId });
      await this.updateACIStatus(instanceId, 'Paused');
      
      this.logger.info('ACI paused', { instanceId });
    } catch (error) {
      this.logger.error('Failed to pause ACI', { instanceId, error });
    }
  }

  /**
   * Clean up terminated ACIs
   */
  async cleanupTerminatedACIs(): Promise<void> {
    try {
      // Find ACIs scheduled for termination
      const instances = await this.db.query(
        `SELECT * FROM aci_instances 
         WHERE state = 'Paused' 
         AND scheduled_termination_at <= NOW()`,
        []
      );

      for (const instance of instances) {
        try {
          await this.azureClient.deleteContainer(
            instance.instance_id
          );
          
          await this.updateACIStatus(instance.instance_id, 'Terminated');
          
          this.logger.info('ACI terminated', { instanceId: instance.instance_id });
        } catch (error) {
          this.logger.error('Failed to terminate ACI', { 
            instanceId: instance.instance_id, 
            error 
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup ACIs', error);
    }
  }

  /**
   * Sanitize project name for GitHub repo
   */
  private sanitizeRepoName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}