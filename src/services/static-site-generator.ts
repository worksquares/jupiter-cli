/**
 * Static Site Generator Service
 * Handles generation and deployment of static websites from code
 */

import { Logger } from '../utils/logger';
import { BlobServiceClient } from '@azure/storage-blob';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';

export interface StaticSiteConfig {
  projectId: string;
  framework: 'react' | 'vue' | 'angular' | 'nextjs' | 'vanilla' | 'python' | 'dotnet' | 'java';
  sourceDir: string;
  buildCommand?: string;
  outputDir?: string;
  environment?: Record<string, string>;
}

export interface DeploymentResult {
  success: boolean;
  url?: string;
  cdnUrl?: string;
  storageUrl?: string;
  error?: string;
  buildTime?: number;
  deploymentId?: string;
}

export class StaticSiteGenerator {
  private logger: Logger;
  private workDir: string;
  private storageClient?: BlobServiceClient;

  constructor() {
    this.logger = new Logger('StaticSiteGenerator');
    this.workDir = process.env.WORK_DIR || '/tmp/static-sites';
    
    // Initialize Azure Storage if configured
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (connectionString) {
      this.storageClient = BlobServiceClient.fromConnectionString(connectionString);
    }
  }

  /**
   * Generate static site from source code
   */
  async generate(config: StaticSiteConfig): Promise<DeploymentResult> {
    const startTime = Date.now();
    const deploymentId = uuidv4();
    
    try {
      this.logger.info(`Generating static site for project ${config.projectId}`);
      
      // Ensure work directory exists
      const projectDir = path.join(this.workDir, config.projectId);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      // Determine build command based on framework
      const buildCommand = config.buildCommand || this.getBuildCommand(config.framework);
      const outputDir = config.outputDir || this.getOutputDir(config.framework);

      // Set environment variables
      if (config.environment) {
        Object.entries(config.environment).forEach(([key, value]) => {
          process.env[key] = value;
        });
      }

      // Run build inside container context
      this.logger.info(`Running build command: ${buildCommand}`);
      
      try {
        execSync(buildCommand, {
          cwd: config.sourceDir,
          stdio: 'inherit',
          env: { ...process.env, NODE_ENV: 'production' }
        });
      } catch (buildError) {
        this.logger.error('Build failed:', buildError);
        return {
          success: false,
          error: `Build failed: ${buildError}`,
          deploymentId
        };
      }

      // Verify build output exists
      const buildOutputPath = path.join(config.sourceDir, outputDir);
      if (!fs.existsSync(buildOutputPath)) {
        return {
          success: false,
          error: `Build output not found at ${buildOutputPath}`,
          deploymentId
        };
      }

      // Create deployment package
      const packagePath = await this.createDeploymentPackage(
        buildOutputPath,
        deploymentId
      );

      // Deploy to Azure Static Web Apps
      const deploymentResult = await this.deployToAzure(
        packagePath,
        config.projectId,
        deploymentId
      );

      const buildTime = Date.now() - startTime;
      
      return {
        ...deploymentResult,
        buildTime,
        deploymentId
      };

    } catch (error) {
      this.logger.error('Static site generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        deploymentId
      };
    }
  }

  /**
   * Get build command for framework
   */
  private getBuildCommand(framework: string): string {
    const commands: Record<string, string> = {
      react: 'npm run build',
      vue: 'npm run build',
      angular: 'ng build --prod',
      nextjs: 'npm run build && npm run export',
      vanilla: 'echo "No build required"'
    };
    
    return commands[framework] || 'npm run build';
  }

  /**
   * Get output directory for framework
   */
  private getOutputDir(framework: string): string {
    const directories: Record<string, string> = {
      react: 'build',
      vue: 'dist',
      angular: 'dist',
      nextjs: 'out',
      vanilla: '.'
    };
    
    return directories[framework] || 'dist';
  }

  /**
   * Create deployment package
   */
  private async createDeploymentPackage(
    sourceDir: string,
    deploymentId: string
  ): Promise<string> {
    const packagePath = path.join(this.workDir, `${deploymentId}.zip`);
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(packagePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        this.logger.info(`Package created: ${archive.pointer()} bytes`);
        resolve(packagePath);
      });

      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * Deploy to Azure Static Web Apps
   */
  private async deployToAzure(
    packagePath: string,
    projectId: string,
    deploymentId: string
  ): Promise<DeploymentResult> {
    try {
      if (!this.storageClient) {
        // If no Azure Storage, serve from local static server
        return this.deployToLocalStatic(packagePath, projectId, deploymentId);
      }

      // Upload to Azure Blob Storage
      const containerName = 'static-sites';
      const containerClient = this.storageClient.getContainerClient(containerName);
      
      // Ensure container exists
      await containerClient.createIfNotExists({
        access: 'blob'
      });

      // Upload package
      const blobName = `${projectId}/${deploymentId}/site.zip`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      const uploadResponse = await blockBlobClient.uploadFile(packagePath, {
        blobHTTPHeaders: {
          blobContentType: 'application/zip'
        }
      });

      if (uploadResponse._response.status !== 201) {
        throw new Error('Failed to upload to Azure Storage');
      }

      // Extract and serve files
      const siteUrl = await this.extractAndServe(
        containerClient,
        projectId,
        deploymentId,
        packagePath
      );

      return {
        success: true,
        url: siteUrl,
        cdnUrl: `https://${projectId}.azurewebsites.net`,
        storageUrl: blockBlobClient.url,
        deploymentId
      };

    } catch (error) {
      this.logger.error('Azure deployment failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deployment failed',
        deploymentId
      };
    }
  }

  /**
   * Extract and serve static files
   */
  private async extractAndServe(
    containerClient: any,
    projectId: string,
    deploymentId: string,
    packagePath: string
  ): Promise<string> {
    // Extract package to serve individual files
    const extractDir = path.join(this.workDir, deploymentId);
    
    // Use unzip command or Node.js library to extract
    execSync(`unzip -o ${packagePath} -d ${extractDir}`, {
      stdio: 'inherit'
    });

    // Upload individual files for direct serving
    const files = this.getAllFiles(extractDir);
    
    for (const file of files) {
      const relativePath = path.relative(extractDir, file);
      const blobName = `${projectId}/live/${relativePath}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      const contentType = this.getContentType(file);
      await blockBlobClient.uploadFile(file, {
        blobHTTPHeaders: {
          blobContentType: contentType
        }
      });
    }

    // Return the static site URL
    const accountName = this.storageClient?.accountName;
    return `https://${accountName}.blob.core.windows.net/${containerClient.containerName}/${projectId}/live/index.html`;
  }

  /**
   * Deploy to local static server (fallback)
   */
  private async deployToLocalStatic(
    packagePath: string,
    projectId: string,
    deploymentId: string
  ): Promise<DeploymentResult> {
    const staticDir = path.join(this.workDir, 'static', projectId);
    
    // Extract package
    if (!fs.existsSync(staticDir)) {
      fs.mkdirSync(staticDir, { recursive: true });
    }

    execSync(`unzip -o ${packagePath} -d ${staticDir}`, {
      stdio: 'inherit'
    });

    // Return local URL
    const port = process.env.STATIC_PORT || '8080';
    return {
      success: true,
      url: `http://localhost:${port}/${projectId}`,
      deploymentId
    };
  }

  /**
   * Get all files recursively
   */
  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Get content type for file
   */
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }
}