const { execSync } = require('child_process');

console.log('Starting TypeScript build...');

try {
  execSync('npx tsc', { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed with errors');
  process.exit(1);
}