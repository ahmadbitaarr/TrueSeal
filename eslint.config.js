import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '.wrangler/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'functions/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: { 'no-undef': 'off' }, // TypeScript checks type/global references.
  },
  {
    files: ['*.config.{ts,js}', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
)
