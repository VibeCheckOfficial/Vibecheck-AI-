module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // project: './tsconfig.json', // Commented out to avoid TSConfig inclusion issues
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'no-console': 'off',
    'prefer-const': 'warn',
    'no-var': 'error',
    'no-empty': 'warn',
    '@typescript-eslint/no-var-requires': 'off',
  },
  overrides: [
    {
      files: ['src/extension.ts', 'src/features/*.ts', 'src/vibecheck-*.ts'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules',
    'dist',
    '*.js',
    'src/test/**/*',
    'shared/**/*',
    '../shared/**/*',
    '../bin/**/*',
    '../tests/**/*'
  ],
};
