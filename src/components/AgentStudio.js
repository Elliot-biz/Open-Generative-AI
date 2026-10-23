import React from 'react';
import { createRoot } from 'react-dom/client';
import DesktopAgentStudio from '../lib/agent-desktop/DesktopAgentStudio.jsx';

export function AgentStudio() {
    const container = document.createElement('div');
    container.className = 'h-full w-full';
    createRoot(container).render(React.createElement(DesktopAgentStudio));
    return container;
}
