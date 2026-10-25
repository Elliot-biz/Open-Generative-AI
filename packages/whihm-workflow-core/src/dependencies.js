import { validateWorkflow } from './validate.js';

// The validator owns dependency discovery (edges, explicit and embedded refs).
// Reuse its interpretation of workflow-input defaults at each bound target.
export function workflowDependencyMap(workflow, validation = validateWorkflow(workflow)) {
  const deps = new Map(workflow.nodes.map(n => [n.id, new Set()]));
  for (const dependency of validation.dependencies) {
    if (dependency.targetNodeId !== null) deps.get(dependency.targetNodeId).add(dependency.sourceNodeId);
    else {
      const inputIndex = Number(dependency.path.split('/')[2]);
      for (const target of workflow.inputs[inputIndex]?.targets || []) deps.get(target.nodeId).add(dependency.sourceNodeId);
    }
  }
  return deps;
}

export function dependencyScope(deps, nodeId) {
  const scope = new Set();
  const visit = id => { if (scope.has(id)) return; scope.add(id); deps.get(id).forEach(visit); };
  visit(nodeId); return scope;
}

export function assetIds(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach(v => assetIds(v, found));
  else if (value && typeof value === 'object') {
    if (typeof value.$asset === 'string') found.add(value.$asset);
    Object.values(value).forEach(v => assetIds(v, found));
  }
  return found;
}
