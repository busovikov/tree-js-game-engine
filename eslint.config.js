import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
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
