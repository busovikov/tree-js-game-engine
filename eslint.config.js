import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // dist/ and node_modules are build/vendor output; public/ holds vendored
    // third-party bundles (e.g. the DRACO decoder) that must not be linted.
    ignores: ['**/dist/**', '**/node_modules/**', '**/public/**'],
  },
  {
    // Underscore-prefixed identifiers are an intentional "unused" convention.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Node scripts run outside the browser; declare the Node globals they use.
    files: ['scripts/**', '.agents/**/*.mjs', '**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // CommonJS config files (e.g. .dependency-cruiser.cjs).
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        exports: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    // Import declarations must precede any other statement. Guards against the
    // mid-file `import` regression called out in the architecture audit (§8).
    files: ['packages/core/**/*.ts', 'packages/engine/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      'import/first': 'error',
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'three', message: '@haku/core must not import three' },
            { name: 'react', message: '@haku/core must not import react' },
            { name: 'react-dom', message: '@haku/core must not import react-dom' },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@haku/editor', message: '@haku/engine must not import editor' },
            { name: 'react', message: '@haku/engine must not import react' },
            { name: 'react-dom', message: '@haku/engine must not import react-dom' },
          ],
        },
      ],
    },
  },
)
