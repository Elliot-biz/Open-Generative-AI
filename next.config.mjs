import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
};

export default nextConfig;
