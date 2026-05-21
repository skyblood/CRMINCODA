import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: React.ReactNode;
    /** Optional custom fallback — overrides the default error UI */
    fallback?: React.ReactNode;
    /** Label shown in the error card (e.g. "CRM Pipeline") */
    moduleName?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * ErrorBoundary — wraps each lazy-loaded module route.
 *
 * Catches render errors that would otherwise unmount the entire app.
 * Provides a "Retry" button that resets the boundary and re-mounts the child.
 */
export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[CRM] Module error${this.props.moduleName ? ` in ${this.props.moduleName}` : ''}:`, error, info);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;
        if (this.props.fallback) return this.props.fallback;

        return (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                <div className="bg-white rounded-xl border border-red-100 shadow-sm p-8 max-w-sm w-full">
                    <div className="flex justify-center mb-4">
                        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                            <AlertTriangle size={28} className="text-red-400" />
                        </div>
                    </div>
                    <h3 className="text-gray-800 font-semibold text-base mb-1">
                        {this.props.moduleName
                            ? `${this.props.moduleName} unavailable`
                            : 'Module unavailable'}
                    </h3>
                    <p className="text-gray-400 text-sm mb-5 leading-relaxed">
                        {this.state.error?.message || 'Something went wrong loading this module.'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                        style={{ background: 'linear-gradient(135deg, #410074 0%, #25024C 100%)' }}
                    >
                        <RefreshCw size={14} />
                        Retry
                    </button>
                </div>
            </div>
        );
    }
}
