/**
 * Dependency Checker - Validates system dependencies
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from './logger';

const execAsync = promisify(exec);
const logger = new Logger('DependencyChecker');

export interface DependencyStatus {
  name: string;
  required: boolean;
  installed: boolean;
  version?: string;
  error?: string;
}

export interface SystemCheck {
  allRequired: boolean;
  dependencies: DependencyStatus[];
  warnings: string[];
  errors: string[];
}

/**
 * Check if a command exists in the system
 */
async function commandExists(command: string): Promise<{ exists: boolean; version?: string }> {
  try {
    const { stdout } = await execAsync(`${command} --version`);
    return { exists: true, version: stdout.trim().split('\n')[0] };
  } catch {
    try {
      // Some commands use -v instead of --version
      const { stdout } = await execAsync(`${command} -v`);
      return { exists: true, version: stdout.trim().split('\n')[0] };
    } catch {
      try {
        // Some commands just need to be checked for existence
        await execAsync(`where ${command} 2>nul || which ${command} 2>/dev/null`);
        return { exists: true };
      } catch {
        return { exists: false };
      }
    }
  }
}

/**
 * Check Node.js modules
 */
async function checkNodeModule(moduleName: string): Promise<{ exists: boolean; version?: string }> {
  try {
    const modulePath = require.resolve(moduleName);
    const packagePath = path.join(path.dirname(modulePath), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8'));
    return { exists: true, version: packageJson.version };
  } catch {
    return { exists: false };
  }
}

/**
 * Check all system dependencies
 */
export async function checkSystemDependencies(): Promise<SystemCheck> {
  const dependencies: DependencyStatus[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check Git
  const git = await commandExists('git');
  dependencies.push({
    name: 'git',
    required: true,
    installed: git.exists,
    version: git.version
  });
  if (!git.exists) {
    errors.push('Git is required for version control operations');
  }

  // Check Node.js
  const node = await commandExists('node');
  dependencies.push({
    name: 'node',
    required: true,
    installed: node.exists,
    version: node.version
  });
  if (!node.exists) {
    errors.push('Node.js is required to run the system');
  }

  // Check npm
  const npm = await commandExists('npm');
  dependencies.push({
    name: 'npm',
    required: true,
    installed: npm.exists,
    version: npm.version
  });
  if (!npm.exists) {
    errors.push('npm is required for package management');
  }

  // Check Azure CLI (optional)
  const az = await commandExists('az');
  dependencies.push({
    name: 'azure-cli',
    required: false,
    installed: az.exists,
    version: az.version
  });
  if (!az.exists) {
    warnings.push('Azure CLI not found - some Azure operations may be limited');
  }

  // Check Docker (optional)
  const docker = await commandExists('docker');
  dependencies.push({
    name: 'docker',
    required: false,
    installed: docker.exists,
    version: docker.version
  });
  if (!docker.exists) {
    warnings.push('Docker not found - local container testing will be unavailable');
  }

  // Check Python (optional)
  const python = await commandExists('python');
  dependencies.push({
    name: 'python',
    required: false,
    installed: python.exists,
    version: python.version
  });
  if (!python.exists) {
    warnings.push('Python not found - Python code generation testing will be limited');
  }

  // Check required Node modules
  const requiredModules = [
    '@azure/arm-containerinstance',
    '@azure/identity',
    'express',
    'socket.io',
    'axios'
  ];

  for (const moduleName of requiredModules) {
    const module = await checkNodeModule(moduleName);
    dependencies.push({
      name: `npm:${moduleName}`,
      required: true,
      installed: module.exists,
      version: module.version
    });
    if (!module.exists) {
      errors.push(`Required npm module '${moduleName}' is not installed`);
    }
  }

  // Check if all required dependencies are installed
  const allRequired = dependencies
    .filter(d => d.required)
    .every(d => d.installed);

  return {
    allRequired,
    dependencies,
    warnings,
    errors
  };
}

/**
 * Install missing npm dependencies
 */
export async function installMissingDependencies(): Promise<void> {
  logger.info('Checking for missing npm dependencies...');
  
  try {
    const { stdout, stderr } = await execAsync('npm install', {
      cwd: process.cwd()
    });
    
    if (stdout) {
      logger.info('npm install output:', stdout);
    }
    if (stderr) {
      logger.warn('npm install warnings:', stderr);
    }
    
    logger.info('Dependencies installed successfully');
  } catch (error) {
    logger.error('Failed to install dependencies:', error);
    throw error;
  }
}

/**
 * Get dependency report as string
 */
export function getDependencyReport(check: SystemCheck): string {
  const lines: string[] = [];
  
  lines.push('=== System Dependency Check ===\n');
  
  if (check.allRequired) {
    lines.push('✅ All required dependencies are installed\n');
  } else {
    lines.push('❌ Some required dependencies are missing\n');
  }
  
  lines.push('\nDependencies:');
  for (const dep of check.dependencies) {
    const status = dep.installed ? '✅' : (dep.required ? '❌' : '⚠️');
    const version = dep.version ? ` (${dep.version})` : '';
    lines.push(`  ${status} ${dep.name}${version}`);
  }
  
  if (check.errors.length > 0) {
    lines.push('\n❌ Errors:');
    check.errors.forEach(err => lines.push(`  - ${err}`));
  }
  
  if (check.warnings.length > 0) {
    lines.push('\n⚠️  Warnings:');
    check.warnings.forEach(warn => lines.push(`  - ${warn}`));
  }
  
  lines.push('\n===============================');
  
  return lines.join('\n');
}