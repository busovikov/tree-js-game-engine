import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ViewportErrorBoundaryProps {
  children: ReactNode
  resetKey: string
}

interface ViewportErrorBoundaryState {
  error: Error | null
}

export class ViewportErrorBoundary extends Component<
  ViewportErrorBoundaryProps,
  ViewportErrorBoundaryState
> {
  state: ViewportErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ViewportErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Viewport rendering failed', error, info.componentStack)
  }

  componentDidUpdate(previousProps: ViewportErrorBoundaryProps): void {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="haku-viewport-error" role="alert">
        <strong>Viewport unavailable</strong>
        <span>{this.state.error.message || 'The current scene could not be rendered.'}</span>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Retry
        </button>
      </div>
    )
  }
}
