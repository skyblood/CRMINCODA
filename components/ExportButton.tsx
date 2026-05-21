import React, { useState } from 'react';
import { Download, Loader2, CheckCircle2 } from 'lucide-react';

interface Props {
  endpoint: string;
  params?: Record<string, string>;
  filename: string;
  label?: string;
  className?: string;
}

export function ExportButton({ endpoint, params, filename, label = 'Export CSV', className }: Props) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleExport = async () => {
    if (loading || success) return;
    setLoading(true);
    try {
      let url = endpoint;
      if (params && Object.keys(params).length > 0) {
        const qs = new URLSearchParams(params).toString();
        url = `${endpoint}?${qs}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e: any) {
      alert('Export failed: ' + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const baseClass =
    'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-1.5 text-sm flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={`${baseClass} ${className || ''}`}
      title={label}
    >
      {loading ? (
        <>
          <Loader2 size={15} className="animate-spin" />
          <span>Exporting...</span>
        </>
      ) : success ? (
        <>
          <CheckCircle2 size={15} className="text-green-500" />
          <span className="text-green-600">Exported!</span>
        </>
      ) : (
        <>
          <Download size={15} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
