// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Configuración de ESLint (formato plano).
 *
 * Además de las reglas de TypeScript y React, exige TSDoc en toda
 * declaración de nivel superior (funciones, clases, métodos, interfaces,
 * tipos, enums y constantes, exportadas o no), como pide la sección 12
 * de `docs/ESPECIFICACION.md`.
 */
export default tseslint.config(
  { ignores: ['node_modules/', 'out/', 'dist/', 'release/', 'coverage/', 'eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: globals.browser,
    },
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/data/**/*.ts', 'tests/**/*.ts', '*.ts'],
    languageOptions: { globals: globals.node },
  },
  jsdoc.configs['flat/recommended-typescript-error'],
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: false,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          contexts: [
            'Program > VariableDeclaration',
            'ExportNamedDeclaration[declaration.type="VariableDeclaration"]',
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'TSEnumDeclaration',
          ],
        },
      ],
      'jsdoc/require-returns': ['error', { checkGetters: false }],
      // Las props desestructuradas se documentan en su interfaz, no como `props.x`.
      'jsdoc/require-param': ['error', { checkDestructured: false }],
      'jsdoc/check-param-names': ['error', { checkDestructured: false }],
      'jsdoc/tag-lines': 'off',
      'jsdoc/check-tag-names': ['error', { definedTags: ['vitest-environment'] }],
    },
  },
  prettier,
);
