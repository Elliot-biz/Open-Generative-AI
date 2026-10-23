import { useSyncExternalStore } from 'react';
import { agentNavigation } from './routes.mjs';

export function useParams() {
  return useSyncExternalStore(agentNavigation.subscribe, agentNavigation.getSnapshot).params;
}
export function useRouter() { return agentNavigation; }
