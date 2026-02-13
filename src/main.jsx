import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled app error', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
            color: '#0f172a',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          }}
        >
          <div style={{ maxWidth: 480, padding: 24, textAlign: 'center' }}>
            <h1 style={{ marginBottom: 8, fontSize: 20 }}>Something went wrong</h1>
            <p style={{ marginBottom: 16, fontSize: 14 }}>
              The app hit an unexpected runtime error.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                border: 0,
                borderRadius: 8,
                padding: '10px 14px',
                background: '#2563eb',
                color: '#ffffff',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
