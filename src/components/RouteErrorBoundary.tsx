import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Keeps a crash inside one page from taking the app down.
 *
 * `strictNullChecks` is off in this project, so a component reading a field the
 * database has not filled in yet type-checks fine and throws at render. React
 * unmounts the whole tree on an unhandled render error — the desk goes blank,
 * navigation included, with nothing on screen to say why. On a desk somebody is
 * working live deals on, that is the difference between "this section is broken"
 * and "the tool is gone".
 */
interface State {
  error: Error | null;
}

export default class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="max-w-2xl space-y-4 p-6">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          <h1 className="text-sm font-semibold uppercase tracking-wider">This page failed to load</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          The rest of the desk still works — use the navigation to carry on.
        </p>
        <pre className="overflow-x-auto rounded border border-border bg-card p-3 text-[11px] text-muted-foreground">
          {this.state.error.message}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="rounded border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent"
        >
          Try again
        </button>
      </div>
    );
  }
}
