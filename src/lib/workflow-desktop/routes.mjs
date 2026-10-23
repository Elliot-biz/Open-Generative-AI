// Desktop-local workflow navigation. No file:// navigation or canonical data changes.
export function parseWorkflowRoute(path) {
  if (['/workflow', '/workflows', '/studio/workflows'].includes(path)) {
    return Object.freeze({ path: '/studio/workflows', params: Object.freeze({}) });
  }
  const match = /^\/workflow\/([a-zA-Z0-9_-]+)(?:\/(builder|playground))?$/.exec(path);
  if (!match) throw new Error('Unsupported desktop workflow route');
  const tab = match[2] || 'builder';
  return Object.freeze({ path: `/workflow/${match[1]}/${tab}`, params: Object.freeze({ id: match[1], tab }) });
}

export function createWorkflowNavigation() {
  let entries = [parseWorkflowRoute('/studio/workflows')], index = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());
  return {
    getSnapshot: () => entries[index],
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    push(path) {
      const next = parseWorkflowRoute(path);
      if (next.path === entries[index].path) return;
      entries = [...entries.slice(0, index + 1), next]; index++; notify();
    },
    replace(path) { entries[index] = parseWorkflowRoute(path); notify(); },
    back() { if (index > 0) { index--; notify(); } },
  };
}

export const workflowNavigation = createWorkflowNavigation();
