import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';

const local = name => normalizePath(fileURLToPath(new URL(name, import.meta.url)));
const builderRoot = local('../../../packages/Vibe-Workflow/packages/workflow-builder/src/');
const studioRoot = local('../../../packages/studio/src/components/');

export function workflowDesktopCompatibility() {
  return {
    name: 'desktop-upstream-workflow-compatibility',
    enforce: 'pre',
    resolveId(source, importer = '') {
      importer = normalizePath(importer);
      const studio = importer.startsWith(studioRoot) && /\/Workflow(?:Studio|UI)\.jsx$/.test(importer);
      const builder = importer.startsWith(builderRoot);
      if (!studio && !builder) return;
      if (source === 'workflow-builder') return `${builderRoot}index.js`;
      if (builder && source === 'axios') return local('transport.mjs');
      const aliases = { 'next/navigation': 'navigation.jsx', 'next/link': 'link.jsx', 'next/image': 'image.jsx', 'next/dynamic': 'dynamic.jsx' };
      if (aliases[source]) return local(aliases[source]);
    },
    transform(code, id) {
      if (normalizePath(id) !== `${builderRoot}components/NodeFlow.jsx`) return;
      // The duplicate action is the builder's sole hard location assignment.
      // Redirect that one action at build time, without changing the submodule.
      const assignment = 'window.location.href = `/workflow/${response.data.workflow_id}`;';
      if (code.split(assignment).length !== 2) throw new Error('Upstream workflow duplicate navigation changed; review desktop adapter');
      return { code: `import { workflowNavigation as desktopWorkflowNavigation } from ${JSON.stringify(local('routes.mjs'))};\n${code.replace(assignment, 'desktopWorkflowNavigation.push(`/workflow/${response.data.workflow_id}`);')}`, map: null };
    },
  };
}
