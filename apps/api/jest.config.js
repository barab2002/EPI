/**
 * openid-client v6 (and its deps oauth4webapi/jose) ship ESM only. Node 22 loads them from our
 * CommonJS build natively (require(esm)); Jest's module runtime cannot, so tests transpile just
 * those packages with ts-jest.
 */
const ESM_DEPS = ['openid-client', 'oauth4webapi', 'jose'];

/** @type {import('jest').Config} */
const base = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    '^.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs' }, isolatedModules: true },
    ],
  },
  transformIgnorePatterns: [`node_modules/(?!(\\.pnpm/)?(${ESM_DEPS.join('|')})[@/])`],
};
module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.int.spec.ts'],
      testTimeout: 60000,
    },
  ],
};
