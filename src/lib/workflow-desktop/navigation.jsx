import { useSyncExternalStore } from 'react';
import { workflowNavigation } from './routes.mjs';

export function useParams() {
  return useSyncExternalStore(workflowNavigation.subscribe, workflowNavigation.getSnapshot).params;
}
export function useRouter() { return workflowNavigation; }
