/**
 * Git Command Library
 * Ready-made Git commands and workflows for common operations
 */

export interface GitCommandOptions {
  workDir?: string;
  verbose?: boolean;
}

export class GitCommands {
  /**
   * Repository initialization and setup
   */
  static init = {
    // Initialize new repository
    new: (bare: boolean = false) => bare ? 'git init --bare' : 'git init',
    
    // Clone repository
    clone: (url: string, directory?: string, branch?: string) => {
      let cmd = `git clone ${url}`;
      if (directory) cmd += ` ${directory}`;
      if (branch) cmd += ` -b ${branch}`;
      return cmd;
    },
    
    // Clone with specific depth
    cloneShallow: (url: string, depth: number = 1) => 
      `git clone --depth ${depth} ${url}`,
    
    // Add remote
    addRemote: (name: string, url: string) => 
      `git remote add ${name} ${url}`,
    
    // Set remote URL
    setRemoteUrl: (name: string, url: string) => 
      `git remote set-url ${name} ${url}`,
    
    // Initial commit
    initialCommit: () => [
      'git add .',
      'git commit -m "Initial commit"'
    ]
  };

  /**
   * Branch operations
   */
  static branch = {
    // Create new branch
    create: (name: string) => `git branch ${name}`,
    
    // Create and checkout
    createAndCheckout: (name: string) => `git checkout -b ${name}`,
    
    // List branches
    list: (all: boolean = false) => all ? 'git branch -a' : 'git branch',
    
    // Delete branch
    delete: (name: string, force: boolean = false) => 
      force ? `git branch -D ${name}` : `git branch -d ${name}`,
    
    // Rename branch
    rename: (oldName: string, newName: string) => 
      `git branch -m ${oldName} ${newName}`,
    
    // Set upstream
    setUpstream: (remote: string, branch: string) => 
      `git branch --set-upstream-to=${remote}/${branch}`,
    
    // Get current branch
    current: () => 'git branch --show-current'
  };

  /**
   * Commit operations
   */
  static commit = {
    // Stage all changes
    stageAll: () => 'git add .',
    
    // Stage specific files
    stage: (files: string[]) => `git add ${files.join(' ')}`,
    
    // Unstage files
    unstage: (files: string[]) => `git reset HEAD ${files.join(' ')}`,
    
    // Commit with message
    create: (message: string) => `git commit -m "${message}"`,
    
    // Commit with detailed message
    createDetailed: (title: string, body: string) => 
      `git commit -m "${title}" -m "${body}"`,
    
    // Amend last commit
    amend: (message?: string) => 
      message ? `git commit --amend -m "${message}"` : 'git commit --amend',
    
    // Interactive rebase
    rebaseInteractive: (count: number) => `git rebase -i HEAD~${count}`
  };

  /**
   * Remote operations
   */
  static remote = {
    // Push to remote
    push: (remote: string = 'origin', branch?: string, force: boolean = false) => {
      let cmd = `git push ${remote}`;
      if (branch) cmd += ` ${branch}`;
      if (force) cmd += ' --force';
      return cmd;
    },
    
    // Push with upstream
    pushSetUpstream: (remote: string = 'origin', branch: string) => 
      `git push -u ${remote} ${branch}`,
    
    // Pull from remote
    pull: (remote: string = 'origin', branch?: string, rebase: boolean = false) => {
      let cmd = `git pull ${remote}`;
      if (branch) cmd += ` ${branch}`;
      if (rebase) cmd += ' --rebase';
      return cmd;
    },
    
    // Fetch from remote
    fetch: (remote: string = 'origin', prune: boolean = false) => 
      prune ? `git fetch ${remote} --prune` : `git fetch ${remote}`,
    
    // List remotes
    list: (verbose: boolean = false) => 
      verbose ? 'git remote -v' : 'git remote'
  };

  /**
   * Status and information
   */
  static info = {
    // Git status
    status: (short: boolean = false) => short ? 'git status -s' : 'git status',
    
    // Show commit log
    log: (options?: {
      oneline?: boolean;
      graph?: boolean;
      limit?: number;
      author?: string;
    }) => {
      let cmd = 'git log';
      if (options?.oneline) cmd += ' --oneline';
      if (options?.graph) cmd += ' --graph';
      if (options?.limit) cmd += ` -${options.limit}`;
      if (options?.author) cmd += ` --author="${options.author}"`;
      return cmd;
    },
    
    // Show diff
    diff: (staged: boolean = false, files?: string[]) => {
      let cmd = 'git diff';
      if (staged) cmd += ' --staged';
      if (files) cmd += ` ${files.join(' ')}`;
      return cmd;
    },
    
    // Show file history
    fileHistory: (file: string, limit?: number) => {
      let cmd = `git log --follow`;
      if (limit) cmd += ` -${limit}`;
      cmd += ` -- ${file}`;
      return cmd;
    }
  };

  /**
   * Stash operations
   */
  static stash = {
    // Create stash
    save: (message?: string) => 
      message ? `git stash save "${message}"` : 'git stash',
    
    // List stashes
    list: () => 'git stash list',
    
    // Apply stash
    apply: (index: number = 0) => `git stash apply stash@{${index}}`,
    
    // Pop stash
    pop: (index: number = 0) => `git stash pop stash@{${index}}`,
    
    // Drop stash
    drop: (index: number = 0) => `git stash drop stash@{${index}}`,
    
    // Clear all stashes
    clear: () => 'git stash clear'
  };

  /**
   * Tag operations
   */
  static tag = {
    // Create tag
    create: (name: string, message?: string) => 
      message ? `git tag -a ${name} -m "${message}"` : `git tag ${name}`,
    
    // List tags
    list: (pattern?: string) => 
      pattern ? `git tag -l "${pattern}"` : 'git tag',
    
    // Delete tag
    delete: (name: string) => `git tag -d ${name}`,
    
    // Push tags
    push: (remote: string = 'origin', all: boolean = false) => 
      all ? `git push ${remote} --tags` : `git push ${remote} --follow-tags`
  };

  /**
   * GitHub CLI operations
   */
  static github = {
    // Repository operations
    repo: {
      create: (name: string, options?: {
        private?: boolean;
        description?: string;
        homepage?: string;
      }) => {
        let cmd = `gh repo create ${name}`;
        if (options?.private) cmd += ' --private';
        if (options?.description) cmd += ` --description "${options.description}"`;
        if (options?.homepage) cmd += ` --homepage "${options.homepage}"`;
        return cmd;
      },
      
      clone: (repo: string) => `gh repo clone ${repo}`,
      
      fork: (repo: string, clone: boolean = true) => 
        clone ? `gh repo fork ${repo} --clone` : `gh repo fork ${repo}`,
      
      view: (web: boolean = false) => 
        web ? 'gh repo view --web' : 'gh repo view'
    },
    
    // Pull request operations
    pr: {
      create: (title: string, body?: string, draft: boolean = false) => {
        let cmd = `gh pr create --title "${title}"`;
        if (body) cmd += ` --body "${body}"`;
        if (draft) cmd += ' --draft';
        return cmd;
      },
      
      list: (state?: 'open' | 'closed' | 'merged' | 'all') => {
        let cmd = 'gh pr list';
        if (state) cmd += ` --state ${state}`;
        return cmd;
      },
      
      checkout: (number: number) => `gh pr checkout ${number}`,
      
      merge: (number: number, method: 'merge' | 'squash' | 'rebase' = 'merge') => 
        `gh pr merge ${number} --${method}`,
      
      close: (number: number) => `gh pr close ${number}`
    },
    
    // Issue operations
    issue: {
      create: (title: string, body?: string, labels?: string[]) => {
        let cmd = `gh issue create --title "${title}"`;
        if (body) cmd += ` --body "${body}"`;
        if (labels) cmd += ` --label ${labels.join(',')}`;
        return cmd;
      },
      
      list: (state?: 'open' | 'closed' | 'all', labels?: string[]) => {
        let cmd = 'gh issue list';
        if (state) cmd += ` --state ${state}`;
        if (labels) cmd += ` --label ${labels.join(',')}`;
        return cmd;
      },
      
      close: (number: number) => `gh issue close ${number}`
    }
  };

  /**
   * Common workflows
   */
  static workflows = {
    // Set up new project
    setupNewProject: (projectName: string, githubRepo: string) => [
      `mkdir ${projectName}`,
      `cd ${projectName}`,
      'git init',
      `git remote add origin ${githubRepo}`,
      'echo "# ' + projectName + '" > README.md',
      'git add README.md',
      'git commit -m "Initial commit"',
      'git branch -M main',
      'git push -u origin main'
    ],
    
    // Create feature branch workflow
    featureBranch: (featureName: string) => [
      'git checkout main',
      'git pull origin main',
      `git checkout -b feature/${featureName}`,
      '# Make your changes...',
      'git add .',
      `git commit -m "feat: ${featureName}"`,
      `git push -u origin feature/${featureName}`
    ],
    
    // Hotfix workflow
    hotfix: (version: string, description: string) => [
      'git checkout main',
      'git pull origin main',
      `git checkout -b hotfix/${version}`,
      '# Make your fixes...',
      'git add .',
      `git commit -m "fix: ${description}"`,
      `git push -u origin hotfix/${version}`,
      '# Create PR to main',
      '# After merge:',
      'git checkout main',
      'git pull origin main',
      `git tag -a v${version} -m "Hotfix version ${version}"`,
      'git push origin --tags'
    ],
    
    // Release workflow
    release: (version: string) => [
      'git checkout main',
      'git pull origin main',
      `git checkout -b release/${version}`,
      '# Update version numbers...',
      'git add .',
      `git commit -m "chore: prepare release ${version}"`,
      `git push -u origin release/${version}`,
      '# After testing and approval:',
      'git checkout main',
      `git merge release/${version}`,
      `git tag -a v${version} -m "Release version ${version}"`,
      'git push origin main',
      'git push origin --tags'
    ],
    
    // Sync fork
    syncFork: () => [
      'git fetch upstream',
      'git checkout main',
      'git merge upstream/main',
      'git push origin main'
    ]
  };

  /**
   * Utility functions
   */
  static utils = {
    // Clean working directory
    clean: (force: boolean = false, directories: boolean = false) => {
      let cmd = 'git clean';
      if (force) cmd += ' -f';
      if (directories) cmd += ' -d';
      return cmd;
    },
    
    // Reset changes
    reset: (mode: 'soft' | 'mixed' | 'hard' = 'mixed', commits: number = 1) => 
      `git reset --${mode} HEAD~${commits}`,
    
    // Cherry-pick
    cherryPick: (commits: string[]) => 
      `git cherry-pick ${commits.join(' ')}`,
    
    // Revert commit
    revert: (commit: string, noCommit: boolean = false) => 
      noCommit ? `git revert ${commit} --no-commit` : `git revert ${commit}`,
    
    // Check ignore
    checkIgnore: (path: string) => `git check-ignore ${path}`,
    
    // Archive repository
    archive: (format: 'zip' | 'tar' = 'zip', output?: string) => {
      let cmd = `git archive --format=${format} HEAD`;
      if (output) cmd += ` --output=${output}`;
      return cmd;
    }
  };

  /**
   * Generate complete Git command
   */
  static generateCommand(commands: string | string[], options?: GitCommandOptions): string {
    const commandArray = Array.isArray(commands) ? commands : [commands];
    
    if (options?.workDir) {
      return `cd ${options.workDir} && ${commandArray.join(' && ')}`;
    }
    
    return commandArray.join(' && ');
  }
}

// Export convenient shortcuts
export const git = GitCommands;