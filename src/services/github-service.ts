/**
 * GitHub Service
 * Manages GitHub repository operations
 */

import { Octokit } from '@octokit/rest';
import { Logger } from '../utils/logger';

export interface GitHubConfig {
  token: string;
  org?: string;
  defaultBranch?: string;
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
}

export interface CreateBranchOptions {
  owner: string;
  repo: string;
  branch: string;
  fromBranch?: string;
}

export interface RepoInfo {
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  private: boolean;
}

export class GitHubService {
  private octokit: Octokit;
  private logger: Logger;
  private org?: string;

  constructor(private config: GitHubConfig) {
    this.logger = new Logger('GitHubService');
    this.octokit = new Octokit({
      auth: config.token,
    });
    this.org = config.org;
  }

  /**
   * Create a new repository
   */
  async createRepository(options: CreateRepoOptions): Promise<RepoInfo> {
    try {
      this.logger.info('Creating repository', { name: options.name });

      const createOptions: any = {
        name: options.name,
        description: options.description,
        private: options.private ?? true,
        auto_init: options.autoInit ?? true,
        gitignore_template: options.gitignoreTemplate,
        license_template: options.licenseTemplate,
      };

      let response;
      if (this.org) {
        // Create in organization
        response = await this.octokit.repos.createInOrg({
          org: this.org,
          ...createOptions,
        });
      } else {
        // Create in user account
        response = await this.octokit.repos.createForAuthenticatedUser(createOptions);
      }

      const repo = response.data;
      return {
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        defaultBranch: repo.default_branch || 'main',
        private: repo.private,
      };
    } catch (error: any) {
      this.logger.error('Failed to create repository', error);
      throw new Error(`Failed to create repository: ${error.message}`);
    }
  }

  /**
   * Check if repository exists
   */
  async repositoryExists(owner: string, repo: string): Promise<boolean> {
    try {
      await this.octokit.repos.get({ owner, repo });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get repository information
   */
  async getRepository(owner: string, repo: string): Promise<RepoInfo> {
    try {
      const response = await this.octokit.repos.get({ owner, repo });
      const repoData = response.data;

      return {
        owner: repoData.owner.login,
        name: repoData.name,
        fullName: repoData.full_name,
        cloneUrl: repoData.clone_url,
        sshUrl: repoData.ssh_url,
        defaultBranch: repoData.default_branch || 'main',
        private: repoData.private,
      };
    } catch (error: any) {
      this.logger.error('Failed to get repository', error);
      throw new Error(`Failed to get repository: ${error.message}`);
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(options: CreateBranchOptions): Promise<string> {
    try {
      const { owner, repo, branch, fromBranch = 'main' } = options;
      
      this.logger.info('Creating branch', { owner, repo, branch, fromBranch });

      // Get the SHA of the source branch
      const { data: refData } = await this.octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${fromBranch}`,
      });

      // Create the new branch
      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: refData.object.sha,
      });

      this.logger.info('Branch created successfully', { branch });
      return branch;
    } catch (error: any) {
      if (error.status === 422) {
        this.logger.warn('Branch already exists', { branch: options.branch });
        return options.branch;
      }
      this.logger.error('Failed to create branch', error);
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  /**
   * Check if branch exists
   */
  async branchExists(owner: string, repo: string, branch: string): Promise<boolean> {
    try {
      await this.octokit.repos.getBranch({ owner, repo, branch });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Add collaborator to repository
   */
  async addCollaborator(
    owner: string,
    repo: string,
    username: string,
    permission: 'pull' | 'push' | 'admin' = 'push'
  ): Promise<void> {
    try {
      await this.octokit.repos.addCollaborator({
        owner,
        repo,
        username,
        permission,
      });
      this.logger.info('Collaborator added', { owner, repo, username, permission });
    } catch (error: any) {
      this.logger.error('Failed to add collaborator', error);
      throw new Error(`Failed to add collaborator: ${error.message}`);
    }
  }

  /**
   * Create or update file in repository
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string
  ): Promise<void> {
    try {
      // Check if file exists
      let sha: string | undefined;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
        });
        if ('sha' in data) {
          sha = data.sha;
        }
      } catch (error: any) {
        if (error.status !== 404) {
          throw error;
        }
      }

      // Create or update file
      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha,
      });

      this.logger.info('File created/updated', { owner, repo, path, branch });
    } catch (error: any) {
      this.logger.error('Failed to create/update file', error);
      throw new Error(`Failed to create/update file: ${error.message}`);
    }
  }

  /**
   * Create pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string = 'main'
  ): Promise<string> {
    try {
      const { data } = await this.octokit.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
      });

      this.logger.info('Pull request created', { 
        owner, 
        repo, 
        number: data.number,
        url: data.html_url 
      });

      return data.html_url;
    } catch (error: any) {
      this.logger.error('Failed to create pull request', error);
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  /**
   * Generate a unique branch name for a task
   */
  generateBranchName(taskId: string, taskType: string): string {
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const sanitizedType = taskType.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `task/${sanitizedType}-${taskId.slice(0, 8)}-${timestamp}`;
  }

  /**
   * Parse GitHub URL to extract owner and repo
   */
  parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2],
      };
    }
    return null;
  }
}