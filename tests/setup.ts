/**
 * Jest test setup
 */

// Load environment variables
require('dotenv').config();

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for integration tests
if (process.env.TEST_TYPE === 'integration') {
  jest.setTimeout(30 * 60 * 1000); // 30 minutes
}
