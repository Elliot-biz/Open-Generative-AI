import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import DesktopWorkflowStudio from '../lib/workflow-desktop/DesktopWorkflowStudio.jsx';

export function WorkflowStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full min-h-0 min-w-0';
    createRoot(container).render(createElement(DesktopWorkflowStudio));
    return container;
}
