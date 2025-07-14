"use client";

import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">Something went wrong</p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <p className="mt-1 font-mono text-xs text-red-500">{this.state.error.message}</p>
            )}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-secondary flex items-center gap-1.5 text-xs"
          >
            <RotateCcw size={12} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
