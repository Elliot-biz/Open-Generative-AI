// Local route state for the upstream inline Agent Studio. It never changes the
// Electron document URL or persists route data outside this renderer session.
export function parseAgentRoute(path) {
  if (path === '/agents' || path === '/agents/') {
    return Object.freeze({ path: '/agents', params: Object.freeze({ tab: Object.freeze(['agents']) }) });
  }
  const match = /^\/agents\/([a-zA-Z0-9_.-]+)(?:\/([a-zA-Z0-9_.-]+))?$/.exec(path);
  if (!match || match[1] === '.' || match[1] === '..' || match[2] === '.' || match[2] === '..') {
    throw new Error('Unsupported desktop agent route');
  }
  const tab = Object.freeze(['agents', match[1], ...(match[2] ? [match[2]] : [])]);
  return Object.freeze({ path: `/agents/${tab.slice(1).join('/')}`, params: Object.freeze({ tab }) });
}

export function createAgentNavigation() {
  let entries = [parseAgentRoute('/agents')], index = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());
  return {
    getSnapshot: () => entries[index],
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    push(path) {
      const next = parseAgentRoute(path);
      if (next.path === entries[index].path) return;
      entries = [...entries.slice(0, index + 1), next]; index++; notify();
    },
    replace(path) { entries[index] = parseAgentRoute(path); notify(); },
    back() { if (index > 0) { index--; notify(); } },
  };
}

export const agentNavigation = createAgentNavigation();
