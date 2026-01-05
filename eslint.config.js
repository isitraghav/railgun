import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: ['**/dist/**', 'node_modules/**']
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021
            }
        },
        rules: {
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ],
            'no-console': 'off',
            'no-debugger': 'warn'
        }
    }
];
