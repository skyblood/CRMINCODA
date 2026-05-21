/**
 * Toast notification system.
 *
 * Usage from anywhere (including non-React code):
 *   import { toast } from '../components/Toast';
 *   toast.error('Something went wrong');
 *   toast.success('Saved');
 *   toast.warn('Conflict detected — data refreshed');
 *   toast.info('Syncing offline changes...');
 *
 * Mount <ToastContainer /> once in App.tsx (inside the Router, outside routes).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warn' | 'info';

interface ToastItem {
    id: number;
    message: string;
    variant: ToastVariant;
}

// ── Event bus (framework-agnostic, safe for firebaseService.ts) ───────────────

type ToastHandler = (item: Omit<ToastItem, 'id'>) => void;

let _handler: ToastHandler | null = null;

const emit = (variant: ToastVariant, message: string) => {
    if (_handler) {
        _handler({ variant, message });
    } else {
        // Fallback when component not yet mounted (e.g. very early boot errors)
        console.warn(`[Toast/${variant}]`, message);
    }
};

/** Call these from anywhere — including firebaseService.ts */
export const toast = {
    success: (msg: string) => emit('success', msg),
    error:   (msg: string) => emit('error',   msg),
    warn:    (msg: string) => emit('warn',     msg),
    info:    (msg: string) => emit('info',     msg),
};

// ── Individual toast item ─────────────────────────────────────────────────────

const ICON: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle   size={18} className="shrink-0 text-green-400" />,
    error:   <XCircle       size={18} className="shrink-0 text-red-400"   />,
    warn:    <AlertTriangle size={18} className="shrink-0 text-yellow-400" />,
    info:    <Info          size={18} className="shrink-0 text-blue-400"  />,
};

const BG: Record<ToastVariant, string> = {
    success: 'bg-green-900/80  border-green-700',
    error:   'bg-red-900/80    border-red-700',
    warn:    'bg-yellow-900/80 border-yellow-700',
    info:    'bg-blue-900/80   border-blue-700',
};

const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
    success: 3000,
    info:    4000,
    warn:    6000,
    error:   8000,
};

const ToastRow: React.FC<{ item: ToastItem; onDismiss: (id: number) => void }> = ({ item, onDismiss }) => {
    useEffect(() => {
        const t = setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS[item.variant]);
        return () => clearTimeout(t);
    }, [item.id, item.variant, onDismiss]);

    return (
        <div
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm text-white shadow-lg backdrop-blur-sm max-w-sm w-full ${BG[item.variant]}`}
            role="alert"
        >
            {ICON[item.variant]}
            <span className="flex-1 leading-snug">{item.message}</span>
            <button
                onClick={() => onDismiss(item.id)}
                className="shrink-0 text-white/50 hover:text-white transition-colors"
                aria-label="Dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
};

// ── Container (mount once in App.tsx) ─────────────────────────────────────────

let _seq = 0;

export const ToastContainer: React.FC = () => {
    const [items, setItems] = useState<ToastItem[]>([]);

    const dismiss = useCallback((id: number) => {
        setItems(prev => prev.filter(t => t.id !== id));
    }, []);

    useEffect(() => {
        _handler = (item) => {
            setItems(prev => [...prev.slice(-4), { ...item, id: ++_seq }]);
        };
        return () => { _handler = null; };
    }, []);

    if (items.length === 0) return null;

    return (
        <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
            {items.map(item => (
                <div key={item.id} className="pointer-events-auto">
                    <ToastRow item={item} onDismiss={dismiss} />
                </div>
            ))}
        </div>
    );
};
