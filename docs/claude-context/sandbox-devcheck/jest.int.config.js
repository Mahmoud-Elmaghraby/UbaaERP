const base = require('../jest.config.js');
const integ = base.projects.find((p) => p.displayName === 'integration');
module.exports = {
  ...integ,
  rootDir: require('path').resolve(__dirname, '..'),
  globalSetup: '<rootDir>/.devcheck/global-setup.ts',
  globalTeardown: undefined,
  moduleNameMapper: { '^@prisma/client$': '<rootDir>/.devcheck/prisma-stub.js' },
};
