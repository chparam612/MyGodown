/**
 * ============================================================================
 * File: backend/jest.config.js
 * Purpose: Jest test runner configuration for ES Modules.
 * ============================================================================
 */

export default {
  testEnvironment: 'node',
  transform: {},
  verbose: true,
  testTimeout: 30000,
  testMatch: ['**/tests/**/*.test.js'],
};
