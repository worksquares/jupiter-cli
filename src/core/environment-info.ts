/**
 * Environment Information System
 * Provides detailed environment context to the agent
 */

import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface EnvironmentInfo {
  workingDirectory: string;
  isGitRepo: boolean;
  gitRemoteUrl?: string;
  gitHeadSha?: string;
  additionalDirectories: string[];
  platform: string;
  osVersion: string;
  date: string;
  modelInfo?: string;
  knowledgeCutoff?: string;
}

export class EnvironmentInfoProvider {
  private cachedInfo: EnvironmentInfo | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async getEnvironmentInfo(
    modelName: string,
    additionalDirs: string[] = []
  ): Promise<EnvironmentInfo> {
    // Check cache
    if (this.cachedInfo && Date.now() - this.cacheTimestamp < this.CACHE_DURATION) {
      return this.cachedInfo;
    }

    const info: EnvironmentInfo = {
      workingDirectory: process.cwd(),
      isGitRepo: await this.isGitRepo(),
      additionalDirectories: additionalDirs,
      platform: os.platform(),
      osVersion: await this.getOSVersion(),
      date: new Date().toISOString().split('T')[0],
      modelInfo: this.getModelInfo(modelName),
      knowledgeCutoff: this.getKnowledgeCutoff(modelName)
    };

    // Get git info if in repo
    if (info.isGitRepo) {
      try {
        info.gitRemoteUrl = await this.getGitRemoteUrl();
        info.gitHeadSha = await this.getGitHeadSha();
      } catch (error) {
        // Ignore git errors
      }
    }

    this.cachedInfo = info;
    this.cacheTimestamp = Date.now();
    
    return info;
  }

  private async isGitRepo(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir');
      return true;
    } catch {
      return false;
    }
  }

  private async getGitRemoteUrl(): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync('git config --get remote.origin.url');
      return stdout.trim();
    } catch {
      return undefined;
    }
  }

  private async getGitHeadSha(): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD');
      return stdout.trim();
    } catch {
      return undefined;
    }
  }

  private async getOSVersion(): Promise<string> {
    try {
      if (os.platform() === 'win32') {
        const { stdout } = await execAsync('ver');
        return stdout.trim();
      } else {
        const { stdout } = await execAsync('uname -sr');
        return stdout.trim();
      }
    } catch {
      return os.release();
    }
  }

  private getModelInfo(modelName: string): string {
    const modelMappings: Record<string, string> = {
      'claude-3-opus': 'Claude 3 Opus',
      'claude-3-sonnet': 'Claude 3 Sonnet', 
      'claude-3-haiku': 'Claude 3 Haiku',
      'claude-opus-4': 'Opus 4',
      'claude-sonnet-4': 'Sonnet 4',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo'
    };

    for (const [key, displayName] of Object.entries(modelMappings)) {
      if (modelName.includes(key)) {
        return `You are powered by the model named ${displayName}. The exact model ID is ${modelName}.`;
      }
    }

    return `You are powered by the model ${modelName}.`;
  }

  private getKnowledgeCutoff(modelName: string): string | undefined {
    if (modelName.includes('claude-opus-4') || modelName.includes('claude-sonnet-4')) {
      return 'Assistant knowledge cutoff is January 2025.';
    }
    return undefined;
  }

  formatForPrompt(info: EnvironmentInfo): string {
    let envBlock = `Here is useful information about the environment you are running in:
<env>
Working directory: ${info.workingDirectory}
Is directory a git repo: ${info.isGitRepo ? 'Yes' : 'No'}`;

    if (info.gitRemoteUrl) {
      envBlock += `\nGit remote URL: ${info.gitRemoteUrl}`;
    }
    if (info.gitHeadSha) {
      envBlock += `\nGit HEAD SHA: ${info.gitHeadSha}`;
    }
    if (info.additionalDirectories.length > 0) {
      envBlock += `\nAdditional working directories: ${info.additionalDirectories.join(', ')}`;
    }

    envBlock += `\nPlatform: ${info.platform}
OS Version: ${info.osVersion}
Today's date: ${info.date}
</env>`;

    if (info.modelInfo) {
      envBlock += `\n${info.modelInfo}`;
    }
    if (info.knowledgeCutoff) {
      envBlock += `\n\n${info.knowledgeCutoff}`;
    }

    return envBlock;
  }
}