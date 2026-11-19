import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Download, BookOpen, Server, Database, Globe } from 'lucide-react';

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({ isOpen, onClose }) => {
  const [markdown, setMarkdown] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/documentation')
      .then((r) => r.json())
      .then((data) => {
        if (data.content) setMarkdown(data.content);
      })
      .catch(() => {
        setMarkdown('# Error cargando DOCUMENTACION_Y_VERCEL.md');
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DOCUMENTACION_Y_VERCEL.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-3xl border border-white/10 bg-[#0C1018] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-white">
                Documentación Completa y Despliegue Gratis (Vercel + Firebase)
              </h2>
              <p className="text-xs text-slate-400">
                Archivo guardado en el proyecto como DOCUMENTACION_Y_VERCEL.md
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? 'Copiado' : 'Copiar MD'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Descargar .md</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar documentación"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-5 py-3.5 bg-white/[0.02] border-b border-white/10 text-xs">
          <div className="flex items-center gap-2.5 text-slate-300">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Hosting Web:</strong> Vercel Hobby (0 €/mes en vercel.app)
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <Database className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              <strong>Base de Datos:</strong> Firebase Firestore Spark (0 €/mes)
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <Server className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Google Docs + IA:</strong> OAuth Drive/Docs + Gemini Gratis
            </span>
          </div>
        </div>

        {/* Markdown Content Viewer */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed bg-[#080B11] p-5 rounded-2xl border border-white/10">
            {markdown || 'Cargando documentación...'}
          </pre>
        </div>
      </div>
    </div>
  );
};
