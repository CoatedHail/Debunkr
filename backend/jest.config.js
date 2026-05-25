/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
    '^.+\\.[cm]?js$': ['ts-jest', { useESM: true, diagnostics: false }]
  },
  transformIgnorePatterns: [],
  testMatch: ['<rootDir>/tests/**/*.test.ts']
};
