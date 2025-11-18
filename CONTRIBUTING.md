# Contributing to Jupiter CLI

Thank you for your interest in contributing to Jupiter CLI! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Guidelines](#coding-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Git
- A code editor (VS Code recommended)

### Development Setup

1. **Fork the repository**
   ```bash
   # Visit https://github.com/worksquares/jupiter-cli and click "Fork"
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/jupiter-cli.git
   cd jupiter-cli
   ```

3. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/worksquares/jupiter-cli.git
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

6. **Run tests**
   ```bash
   npm test
   ```

## How to Contribute

### Types of Contributions

We welcome various types of contributions:

- 🐛 **Bug fixes** - Fix issues in existing code
- ✨ **New features** - Add new functionality
- 📝 **Documentation** - Improve docs, add examples
- 🎨 **UI/UX improvements** - Enhance themes, interface
- 🔒 **Security** - Report vulnerabilities, improve security
- ⚡ **Performance** - Optimize code, reduce resource usage
- 🧪 **Tests** - Add or improve test coverage
- 🌐 **Translations** - Help internationalize Jupiter

### Before You Start

1. **Check existing issues** - Look for existing issues or discussions
2. **Create an issue** - For significant changes, create an issue first
3. **Get feedback** - Discuss your approach before implementing
4. **Keep scope small** - Smaller PRs are easier to review

## Coding Guidelines

### TypeScript Style

- Use TypeScript for all new code
- Enable strict mode
- Provide proper type definitions
- Avoid `any` types when possible

### Code Style

```typescript
// ✅ Good
export interface ProviderConfig {
  apiKey: string;
  model: string;
  maxTokens?: number;
}

async function fetchCompletion(config: ProviderConfig): Promise<string> {
  // Implementation
}

// ❌ Bad
export interface provider_config {
  apikey: string;
  Model: string;
}

function fetch_completion(config: any) {
  // Implementation
}
```

### Best Practices

1. **Error Handling**
   ```typescript
   try {
     await riskyOperation();
   } catch (error) {
     logger.error('Operation failed', { error });
     throw new JupiterError('Failed to complete operation', error);
   }
   ```

2. **Async/Await**
   - Use async/await instead of callbacks
   - Handle promise rejections properly
   - Use Promise.all() for parallel operations

3. **Security**
   - Never log API keys or sensitive data
   - Sanitize all user inputs
   - Validate all external data

4. **Testing**
   - Write unit tests for new features
   - Update tests when fixing bugs
   - Aim for >80% code coverage

## Commit Guidelines

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
# Good commit messages
feat(providers): add support for Google Gemini 2.0
fix(ui): correct theme color inconsistency on Windows
docs(readme): update installation instructions
refactor(security): improve input sanitization logic

# Bad commit messages
update stuff
fixed bug
changes
WIP
```

## Pull Request Process

### Before Submitting

1. **Update your fork**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow coding guidelines
   - Write tests
   - Update documentation

4. **Test thoroughly**
   ```bash
   npm run build
   npm test
   npm run lint
   npm run typecheck
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

### Submitting the PR

1. Go to https://github.com/worksquares/jupiter-cli
2. Click "New Pull Request"
3. Select your fork and branch
4. Fill out the PR template:
   - **Title**: Clear, descriptive title
   - **Description**: What and why
   - **Related Issues**: Link to issues
   - **Testing**: How you tested
   - **Screenshots**: If UI changes

### PR Review Process

1. **Automated checks** - Must pass all CI checks
2. **Code review** - At least one maintainer approval
3. **Testing** - Verify functionality works
4. **Documentation** - Ensure docs are updated
5. **Merge** - Maintainer will merge when approved

### After Your PR is Merged

1. Delete your feature branch
2. Update your local main branch
3. Thank the reviewers!

## Reporting Bugs

### Before Reporting

1. **Check existing issues** - Search for similar reports
2. **Try latest version** - Update to latest Jupiter CLI
3. **Gather information** - Collect error messages, logs

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Run command '...'
2. Enter input '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment:**
- OS: [e.g., Windows 11, macOS 14, Ubuntu 22.04]
- Node.js version: [e.g., 18.17.0]
- Jupiter CLI version: [e.g., 0.1.0]
- Provider: [e.g., OpenAI, DigiSquares]

**Additional context**
Any other relevant information.

**Debug output**
```
DEBUG=jupiter:* output here
```
```

## Suggesting Features

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Other approaches you've thought about.

**Use cases**
When and how would you use this feature?

**Additional context**
Mockups, examples, references.
```

## Development Workflow

### Project Structure

```
jupiter-cli/
├── docs/              # Documentation files
├── CHANGELOG.md       # Version history
├── CONTRIBUTING.md    # This file
├── CODE_OF_CONDUCT.md # Code of conduct
├── LICENSE            # License information
├── NOTICE             # Attribution notices
├── README.md          # Main documentation
└── SECURITY.md        # Security policy
```

### Branch Strategy

- `main` - Stable, production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Release Process

1. Version bump in package.json
2. Update CHANGELOG.md
3. Create release tag
4. Publish to npm
5. Create GitHub release

## Community

### Getting Help

- **Documentation**: https://jupiter.digisquares.com/docs
- **GitHub Issues**: https://github.com/worksquares/jupiter-cli/issues
- **GitHub Discussions**: https://github.com/worksquares/jupiter-cli/discussions
- **Email**: support@jupiter.digisquares.com

### Recognition

Contributors are recognized in:
- CHANGELOG.md
- GitHub contributors page
- Release notes
- Project README

## License

By contributing, you agree that your contributions will be licensed under the same license as the project. See [LICENSE](LICENSE) for details.

## Questions?

If you have questions about contributing, please:

1. Check this guide thoroughly
2. Search existing issues and discussions
3. Create a new discussion if needed
4. Contact maintainers: support@jupiter.digisquares.com

Thank you for contributing to Jupiter CLI! 🚀

---

**Happy Coding!** ❤️

*Last updated: 2025-01-18*
