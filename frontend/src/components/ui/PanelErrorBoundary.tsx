/**
 * PanelErrorBoundary — isolates heavy panel failures.
 *
 * Wraps a single panel. If the panel throws during render or a lifecycle,
 * this boundary catches it and renders a contained "Panel unavailable" fallback
 * instead of taking down the whole war room.
 *
 * Usage:
 *   <PanelErrorBoundary label="Storm Stream">
 *     <RawStreamPanel />
 *   </PanelErrorBoundary>
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  label: string
  children: ReactNode
  /** Optional className for the fallback container */
  className?: string
}

interface State {
  hasError: boolean
  errorMessage: string
}

export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? 'Unknown error' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PanelErrorBoundary] Panel "${this.props.label}" crashed:`, error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div
        className={`flex flex-col h-full bg-bg-surface rounded-card border border-border overflow-hidden ${this.props.className ?? ''}`}
      >
        {/* Mimic the normal panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <span className="text-ui font-semibold text-text-secondary font-sans">{this.props.label}</span>
          <span className="text-[10px] font-mono text-severity-warning border border-severity-warning/30 bg-severity-warning/10 px-2 py-0.5 rounded">
            unavailable
          </span>
        </div>

        {/* Error body */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center select-none">
          <svg
            className="w-8 h-8 text-text-muted"
            fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-text-secondary font-sans font-semibold">
              Panel unavailable
            </span>
            <span className="text-[11px] text-text-muted font-mono max-w-[260px] leading-relaxed">
              {this.state.errorMessage}
            </span>
          </div>
          <button
            onClick={this.handleReset}
            className="mt-1 px-3 py-1.5 rounded border border-border bg-bg-elevated hover:bg-bg-hover text-[11px] font-mono text-text-secondary hover:text-text-primary transition-colors"
          >
            ↺ Reload panel
          </button>
        </div>
      </div>
    )
  }
}
