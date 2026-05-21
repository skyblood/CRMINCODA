import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      const e = this.state.error as Error;
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#fff1f2', minHeight: '100vh' }}>
          <h1 style={{ color: '#b91c1c', fontSize: 20 }}>Runtime Error</h1>
          <pre style={{ color: '#7f1d1d', whiteSpace: 'pre-wrap', marginTop: 16 }}>
            {e.message}{'\n\n'}{e.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Register service worker for PWA offline support (skip in dev to avoid stale cache)
if ('serviceWorker' in navigator) {
  if ((import.meta as any).env?.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {/* silent */});
    });

    // When a new SW takes over (e.g. after a deploy), reload so the page
    // gets the fresh index.html instead of going blank due to stale chunk hashes.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  } else {
    // Dev mode: unregister any existing SW so stale cache doesn't interfere
    navigator.serviceWorker.getRegistrations().then(regs =>
      regs.forEach(r => r.unregister())
    );
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element');

ReactDOM.createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);