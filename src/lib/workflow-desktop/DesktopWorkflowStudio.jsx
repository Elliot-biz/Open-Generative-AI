import React, { useEffect, useState } from 'react';
import WorkflowStudio from '../../../packages/studio/src/components/WorkflowStudio.jsx';
import { AuthModal } from '../../components/AuthModal.js';
import { getDesktopApiKey } from './transport.mjs';
import './desktop.css';

export default function DesktopWorkflowStudio() {
  const [apiKey, setApiKey] = useState(getDesktopApiKey);
  const [headerVisible, setHeaderVisible] = useState(true);
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
  return <div className="desktop-workflow-studio">
    {apiKey ? <WorkflowStudio desktop apiKey={apiKey} isHeaderVisible={headerVisible} onToggleHeader={setHeaderVisible} /> :
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center text-white">
        <h1 className="text-3xl font-bold">Workflows</h1>
        <p>Add your MuAPI key to load your workflows.</p>
        <button className="rounded-lg bg-primary px-6 py-3 font-bold text-black" onClick={() => AuthModal(() => setApiKey(getDesktopApiKey()))}>Connect MuAPI</button>
      </div>}
  </div>;
}
