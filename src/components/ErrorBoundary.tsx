import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0a0f1a', color: '#e2e8f0', padding: 24, textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', marginBottom: 24, maxWidth: 480 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 28px', background: '#2563eb', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 15, cursor: 'pointer'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
