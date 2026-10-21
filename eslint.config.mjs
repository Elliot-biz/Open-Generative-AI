import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '.next/**', 'out/**', 'release/**'] },
  ...compat.extends('next/core-web-vitals'),
];
