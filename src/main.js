import { connectWhihmHost } from './lib/whihmHostRuntime.mjs';
connectWhihmHost(); // Nonvisual; no-op outside Electron. Never starts execution.
import './style.css';
import { Header } from './components/Header.js';
import { ImageStudio } from './components/ImageStudio.js';

const app = document.querySelector('#app');
let contentArea;

// Keep all mounted page nodes so async generation survives tab switches
const mountedPages = {};

// Router — show/hide instead of destroy
function navigate(page) {
  if (!contentArea) return;

  // Hide all existing pages
  Object.entries(mountedPages).forEach(([name, node]) => {
    if (name === 'workflows') {
      // React Flow's async fit/resize needs nonzero dimensions while inactive.
      node.style.visibility = 'hidden';
      node.inert = true;
    } else node.style.display = 'none';
  });

  if (mountedPages[page]) {
    // Already mounted — just show it again
    mountedPages[page].style.display = '';
    if (page === 'workflows') {
      mountedPages[page].style.visibility = '';
      mountedPages[page].inert = false;
    }
  } else {
    // First visit — create a wrapper and mount the studio into it
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;';
    if (page === 'workflows') {
      wrapper.style.position = 'absolute';
      wrapper.style.inset = '0';
    }
    contentArea.appendChild(wrapper);
    mountedPages[page] = wrapper;

    if (page === 'image') {
      wrapper.appendChild(ImageStudio());
    } else if (page === 'video') {
      import('./components/VideoStudio.js').then(({ VideoStudio }) => {
        wrapper.appendChild(VideoStudio());
      });
    } else if (page === 'cinema') {
      import('./components/CinemaStudio.js').then(({ CinemaStudio }) => {
        wrapper.appendChild(CinemaStudio());
      });
    } else if (page === 'lipsync') {
      import('./components/LipSyncStudio.js').then(({ LipSyncStudio }) => {
        wrapper.appendChild(LipSyncStudio());
      });
    } else if (page === 'workflows') {
      import('./components/WorkflowStudio.js').then(({ WorkflowStudio }) => {
        wrapper.appendChild(WorkflowStudio());
      });
    } else if (page === 'agents') {
      import('./components/AgentStudio.js').then(({ AgentStudio }) => {
        wrapper.appendChild(AgentStudio());
      });
    } else if (page === 'mcp-cli') {
      import('./components/McpCliStudio.js').then(({ McpCliStudio }) => {
        wrapper.appendChild(McpCliStudio());
      });
    }
  }
}

app.innerHTML = '';
// Pass navigate to Header so links work
app.appendChild(Header(navigate));

contentArea = document.createElement('main');
contentArea.id = 'content-area';
contentArea.className = 'flex-1 relative w-full overflow-hidden flex flex-col bg-app-bg';
app.appendChild(contentArea);

// Initial Route
navigate('image');

// Event Listener for Navigation
window.addEventListener('navigate', (e) => {
  if (e.detail.page === 'settings') {
    import('./components/SettingsModal.js').then(({ SettingsModal }) => {
      document.body.appendChild(SettingsModal());
    });
  } else {
    navigate(e.detail.page);
  }
});
