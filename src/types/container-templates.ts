/**
 * Container Template Definitions
 * Pre-built images available in digisquarescontainers registry
 */

export interface ContainerTemplate {
  name: string;
  displayName: string;
  image: string;
  description: string;
  defaultCpu: number;
  defaultMemory: number;
  languages: string[];
  frameworks: string[];
  tools: string[];
}

export const CONTAINER_TEMPLATES: Record<string, ContainerTemplate> = {
  'node': {
    name: 'node',
    displayName: 'Node.js Development',
    image: 'mcr.microsoft.com/vscode/devcontainers/javascript-node:18-bullseye',
    description: 'Node.js 18 with TypeScript, npm, and popular frameworks pre-installed',
    defaultCpu: 1,
    defaultMemory: 2,
    languages: ['JavaScript', 'TypeScript'],
    frameworks: ['Express', 'React', 'Angular', 'Vue', 'Next.js'],
    tools: ['git', 'npm', 'yarn', 'typescript', 'eslint', 'prettier', 'jest']
  },
  'python': {
    name: 'python',
    displayName: 'Python Development',
    image: 'mcr.microsoft.com/vscode/devcontainers/python:3.11-bullseye',
    description: 'Python 3.11 with popular frameworks and data science tools',
    defaultCpu: 1,
    defaultMemory: 2,
    languages: ['Python'],
    frameworks: ['Django', 'Flask', 'FastAPI', 'Pandas', 'NumPy'],
    tools: ['git', 'pip', 'poetry', 'pytest', 'black', 'jupyter']
  },
  'dotnet': {
    name: 'dotnet',
    displayName: '.NET Development',
    image: 'mcr.microsoft.com/dotnet/sdk:8.0',
    description: '.NET 8.0 SDK with ASP.NET Core and Entity Framework',
    defaultCpu: 1,
    defaultMemory: 2,
    languages: ['C#', 'F#', 'VB.NET'],
    frameworks: ['ASP.NET Core', 'Blazor', 'Entity Framework'],
    tools: ['git', 'dotnet CLI', 'NuGet', 'Entity Framework CLI']
  },
  'java': {
    name: 'java',
    displayName: 'Java Development',
    image: 'mcr.microsoft.com/openjdk/jdk:17-ubuntu',
    description: 'Java 17 with Maven, Gradle, and Spring Boot support',
    defaultCpu: 1,
    defaultMemory: 2,
    languages: ['Java', 'Kotlin'],
    frameworks: ['Spring Boot', 'Spring Framework', 'Micronaut'],
    tools: ['git', 'maven', 'gradle', 'npm']
  },
  'go': {
    name: 'go',
    displayName: 'Go Development',
    image: 'mcr.microsoft.com/vscode/devcontainers/go:1.21-bullseye',
    description: 'Go 1.21 with common tools and web frameworks',
    defaultCpu: 0.5,
    defaultMemory: 1,
    languages: ['Go'],
    frameworks: ['Gin', 'Fiber', 'Echo'],
    tools: ['git', 'go modules', 'air', 'golangci-lint', 'delve']
  }
};

export interface CreateContainerFromTemplateParams {
  template: keyof typeof CONTAINER_TEMPLATES;
  gitRepo?: string;
  gitToken?: string;
  environmentVariables?: Record<string, string>;
  cpu?: number;
  memory?: number;
}