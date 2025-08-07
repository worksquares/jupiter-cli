import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  framework: string;
  language: string;
  features: string[];
  buildCommand: string;
  startCommand: string;
  outputDirectory: string;
}

export interface TemplateMetadata {
  templates: TemplateInfo[];
}

export class TemplateManager {
  private templatesPath: string;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('TemplateManager');
    this.templatesPath = path.join(process.cwd(), 'templates');
  }

  async getAvailableTemplates(): Promise<TemplateInfo[]> {
    try {
      const metadataPath = path.join(this.templatesPath, 'templates.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata: TemplateMetadata = JSON.parse(metadataContent);
      return metadata.templates;
    } catch (error) {
      this.logger.error('Failed to load template metadata', error);
      return [];
    }
  }

  async getTemplate(templateId: string): Promise<TemplateInfo | null> {
    const templates = await this.getAvailableTemplates();
    return templates.find(t => t.id === templateId) || null;
  }

  async copyTemplate(templateId: string, targetPath: string): Promise<void> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    const sourcePath = path.join(this.templatesPath, templateId);
    await this.copyDirectory(sourcePath, targetPath);
    this.logger.info(`Template '${templateId}' copied to ${targetPath}`);
  }

  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  async initializeProject(
    templateId: string,
    projectPath: string,
    projectName: string
  ): Promise<void> {
    // Copy template files
    await this.copyTemplate(templateId, projectPath);
    
    // Update package.json with project name
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      packageJson.name = projectName;
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    } catch (error) {
      this.logger.warn('Failed to update package.json', error);
    }
    
    // Update HTML title for applicable frameworks
    await this.updateProjectTitle(templateId, projectPath, projectName);
    
    this.logger.info(`Project '${projectName}' initialized with template '${templateId}'`);
  }

  private async updateProjectTitle(
    templateId: string,
    projectPath: string,
    projectName: string
  ): Promise<void> {
    const titleMap: Record<string, string> = {
      react: path.join(projectPath, 'public', 'index.html'),
      vue: path.join(projectPath, 'public', 'index.html'),
      angular: path.join(projectPath, 'src', 'index.html')
    };
    
    const htmlPath = titleMap[templateId];
    if (!htmlPath) return;
    
    try {
      let htmlContent = await fs.readFile(htmlPath, 'utf-8');
      htmlContent = htmlContent.replace(
        /<title>.*?<\/title>/,
        `<title>${projectName}</title>`
      );
      await fs.writeFile(htmlPath, htmlContent);
    } catch (error) {
      this.logger.warn('Failed to update HTML title', error);
    }
  }
}