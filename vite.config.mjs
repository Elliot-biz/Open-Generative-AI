import { defineConfig } from 'vite';
import { workflowDesktopCompatibility } from './src/lib/workflow-desktop/vite.mjs';

export default defineConfig({
    base: './',
    plugins: [workflowDesktopCompatibility()],
    esbuild: { jsx: 'automatic' },
    server: {
        proxy: {
            '/api': {
                target: 'https://api.muapi.ai',
                changeOrigin: true,
                secure: false
            }
        }
    }
});
