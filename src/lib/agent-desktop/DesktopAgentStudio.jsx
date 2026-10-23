import React, { useEffect, useState } from 'react';
import AgentStudio from '../../../packages/studio/src/components/AgentStudio.jsx';
import { AuthModal } from '../../components/AuthModal.js';
import { getDesktopApiKey } from '../workflow-desktop/transport.mjs';
import './agent.css';

export default function DesktopAgentStudio() {
  const [apiKey, setApiKey] = useState(getDesktopApiKey);
  useEffect(() => {
    const refresh = () => setApiKey(getDesktopApiKey());
    window.addEventListener('desktop:auth-changed', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('desktop:auth-changed', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return <div className="desktop-agent-studio h-full w-full min-w-0 min-h-0 overflow-hidden">
    {apiKey ? <AgentStudio apiKey={apiKey} /> :
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center text-white">
        <h1 className="text-3xl font-bold">Agents</h1>
        <p>Add your MuAPI key to load your agents.</p>
        <button className="rounded-lg bg-primary px-6 py-3 font-bold text-black" onClick={() => AuthModal(() => setApiKey(getDesktopApiKey()))}>Connect MuAPI</button>
      </div>}
  </div>;
}
