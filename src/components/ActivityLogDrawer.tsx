import React, { useEffect, useState } from 'react';
import {
  X,
  History,
  Upload,
  Trash2,
  Link2,
  CheckCircle2,
  PlusSquare,
  Bell,
  Clock,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ActivityLogItem, ActivityActionKind } from '../types';
import { formatRelativeTimeEs } from '../utils/relativeTime';

interface ActivityLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  activities: ActivityLogItem[];
}

function getActivityMeta(kind?: ActivityActionKind, actionText = '') {
  const lower = actionText.toLowerCase();
  if (kind === 'file_upload' || lower.includes('subi')) {
    return {
      icon: Upload,
      colorClass: 'text-[#60A5FA] border-[#3B82F6]/40 bg-[#3B82F6]/10',
    };
  }
  if (kind === 'file_delete' || kind === 'task_delete' || lower.includes('borr') || lower.includes('elimin')) {
    return {
      icon: Trash2,
      colorClass: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
    };
  }
  if (kind === 'google_link' || lower.includes('google') || lower.includes('enlaz')) {
    return {
      icon: Link2,
      colorClass: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
    };
  }
  if (kind === 'task_complete' || lower.includes('complet')) {
    return {
      icon: CheckCircle2,
      colorClass: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    };
  }
  if (kind === 'task_create' || lower.includes('tarea')) {
    return {
      icon: PlusSquare,
      colorClass: 'text-indigo-400 border-indigo-500/40 bg-indigo-500/10',
    };
  }
  if (kind === 'notice_create' || lower.includes('tablón') || lower.includes('aviso')) {
    return {
      icon: Bell,
      colorClass: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    };
  }
  return {
    icon: Clock,
    colorClass: 'text-[#A1A1B2] border-[#2A2A35] bg-[#14141A]',
  };
}

export const ActivityLogDrawer: React.FC<ActivityLogDrawerProps> = ({
  isOpen,
  onClose,
  projectName,
  activities,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Refresh relative labels every 30s while open
  useEffect(() => {
    if (!isOpen) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  // Escape key closes drawer
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const sorted = [...activities]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70"
            aria-hidden="true"
          />

          {/* Compact Lateral Drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            role="dialog"
            aria-label="Historial de actividad del proyecto"
            className="relative z-10 w-full sm:w-[390px] max-w-full h-full bg-[#0E0E12] border-l border-[#22222A] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#22222A] flex items-center justify-between gap-3 bg-[#09090B]">
              <div className="min-w-0">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#60A5FA] block">
                  HISTORIAL DE ACTIVIDAD · ÚLTIMOS 30 EVENTOS
                </span>
                <h3 className="font-display font-bold text-sm text-white truncate mt-0.5">
                  {projectName}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar historial de actividad"
                className="h-8 w-8 border border-[#2A2A35] bg-[#14141A] hover:border-white text-[#9E9EAE] hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body: Timeline */}
            <div className="flex-1 overflow-y-auto p-5">
              {sorted.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4 space-y-3">
                  <div className="w-11 h-11 border border-[#2A2A35] bg-[#121218] flex items-center justify-center text-[#6E6E7E]">
                    <History className="w-5 h-5" />
                  </div>
                  <p className="font-display text-sm font-semibold text-white">
                    Sin actividad registrada todavía
                  </p>
                  <p className="text-xs text-[#8E8E9E] leading-relaxed max-w-xs">
                    Aquí aparecerá automáticamente la línea de tiempo al subir o borrar archivos,
                    crear o completar tareas, enlazar Google Docs o publicar en el tablón.
                  </p>
                </div>
              ) : (
                <ol className="relative border-l border-[#22222A] ml-3.5 space-y-4">
                  {sorted.map((item) => {
                    const meta = getActivityMeta(item.kind, item.action);
                    const Icon = meta.icon;
                    const rel = formatRelativeTimeEs(item.createdAt, nowMs);
                    return (
                      <li key={item.id} className="pl-5 relative">
                        <span
                          className={`absolute -left-[13px] top-0.5 w-6 h-6 border flex items-center justify-center ${meta.colorClass}`}
                        >
                          <Icon className="w-3 h-3" />
                        </span>
                        <div className="border border-[#1E1E27] bg-[#111116] px-3.5 py-2.5 space-y-1">
                          <p className="text-xs text-[#D4D4DC] leading-relaxed break-words">
                            <span className="font-semibold text-white">{item.actorUsername}</span>{' '}
                            <span className="text-[#A1A1B2]">{item.action}</span>{' '}
                            <span className="font-mono text-[11px] text-[#60A5FA]">
                              {item.targetName}
                            </span>
                            <span className="text-[#6E6E7E]"> · </span>
                            <span className="font-mono text-[11px] text-[#8E8E9E] tabular-nums whitespace-nowrap">
                              {rel}
                            </span>
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#22222A] bg-[#09090B] flex items-center justify-between font-mono text-[10px] text-[#7E7E8E] tabular-nums">
              <span>SINCRONIZADO EN EL PROYECTO</span>
              <span>{sorted.length} / 30 EVENTOS</span>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
