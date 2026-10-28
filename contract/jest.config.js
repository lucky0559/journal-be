module.exports = {
  rootDir: '..',
  testRegex: 'contract/.*\\.contract\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: false }] },
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: { '^@/data/mediaStore$': '<rootDir>/contract/fakeMediaStore.ts' },
};
