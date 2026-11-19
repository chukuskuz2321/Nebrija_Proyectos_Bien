import React, { useState } from 'react';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  CheckSquare,
  AtSign,
  Clock,
  UserPlus,
  ArrowRight,
} from 'lucide-react';
import {
  ProjectInvitation,
  InAppNotificationItem,
} from '../types';
import { formatRelativeTimeEs } from '../utils/relativeTime';

interface NotificationsBellPanelProps {
  isOpen: boolean;
  onClose: () => void;
  invitations: ProjectInvitation[];
  activityNotifications: InAppNotificationItem[];
  onRespondInvitation: (invitation: ProjectInvitation, decision: 'accepted' | 'declined') => void;
  onClickActivityNotification: (item: InAppNotificationItem) => void;
  onMarkAllRead: () => void;
}

type NotificationTab = 'all' | 'invitations' | 'activity';

export const NotificationsBellPanel: React.FC<NotificationsBellPanelProps> = ({
  isOpen,
  onClose,
  invitations,
  activityNotifications,
  onRespondInvitation,
  onClickActivityNotification,
  onMarkAllRead,
}) => {
  const [tab, setTab] = useState<NotificationTab>('all');

  if (!isOpen) return null;

  const pendingInvCount = invitations.filter((i) => i.status === 'pending').length;
  const unreadActivityCount = activityNotifications.filter((n) => !n.read).length;
  const totalUnread = pendingInvCount + unreadActivityCount;

  const renderActivityIcon = (kind: InAppNotificationItem['kind']) => {
    if (kind === 'task_assigned') {
      return (
        <div className="w-7 h-7 border border-[#3B82F6]/40 bg-[#3B82F6]/10 flex items-center justify-center text-[#60A5FA] shrink-0">
          <CheckSquare className="w-3.5 h-3.5" />
        </div>
      );
    }
    if (kind === 'mention') {
      return (
        <div className="w-7 h-7 border border-indigo-500/40 bg-indigo-500/10 flex items-center justify-center text-indigo-300 shrink-0">
          <AtSign className="w-3.5 h-3.5" />
        </div>
      );
    }
    return (
      <div className="w-7 h-7 border border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-amber-300 shrink-0">
        <Clock className="w-3.5 h-3.5" />
      </div>
    );
  };

  const showInvitations = tab === 'all' || tab === 'invitations';
  const showActivity = tab === 'all' || tab === 'activity';

  const hasVisibleItems =
    (showInvitations && invitations.length > 0) ||
    (showActivity && activityNotifications.length > 0);

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-[calc(100vw-2rem)] sm:w-[400px] max-w-[420px] border border-[#2E2E3A] bg-[#0E0E12] shadow-2xl">
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-[#22222A] bg-[#09090B] flex items-center justify-between gap-2">
        <div>
          <span className="font-mono text-[10px] text-[#60A5FA] uppercase block">
            CENTRO DE NOTIFICACIONES
          </span>
          <h3 className="font-display font-bold text-xs text-white tabular-nums">
            {totalUnread > 0 ? `${totalUnread} sin leer` : 'Todo al día'}
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          {unreadActivityCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="h-7 px-2.5 border border-[#2A2A35] bg-[#14141A] hover:border-white text-[10px] font-mono uppercase text-[#D4D4DC] inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <CheckCheck className="w-3 h-3 text-emerald-400" />
              <span>Marcar leídas</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar notificaciones"
            className="p-1 text-[#8E8E9E] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Unified Tabs */}
      <div className="grid grid-cols-3 divide-x divide-[#22222A] border-b border-[#22222A] bg-[#111116]">
        {(
          [
            { id: 'all', label: 'Todas', count: totalUnread },
            { id: 'invitations', label: 'Invitaciones', count: pendingInvCount },
            { id: 'activity', label: 'Actividad', count: unreadActivityCount },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`py-2.5 px-2 font-mono text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                active
                  ? 'bg-white text-[#09090B] font-bold'
                  : 'text-[#9E9EAE] hover:text-white'
              }`}
            >
              <span>{t.label}</span>
              {t.count > 0 && (
                <span
                  className={`px-1 text-[9px] tabular-nums ${
                    active ? 'bg-[#09090B] text-white' : 'bg-[#3B82F6]/20 text-[#60A5FA]'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Scrollable Feed */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-[#1D1D25]">
        {!hasVisibleItems ? (
          <div className="p-7 text-center space-y-2">
            <Bell className="w-6 h-6 text-[#555566] mx-auto" />
            <p className="text-xs font-medium text-[#A1A1B2]">
              No hay notificaciones en esta pestaña
            </p>
            <p className="text-[11px] text-[#7E7E8E] leading-relaxed">
              Te avisaremos aquí cuando te inviten a un proyecto, te asignen una tarea, te mencionen
              con <code className="text-white">@usuario</code> en el tablón o queden menos de 48h para una entrega.
            </p>
          </div>
        ) : (
          <>
            {/* Invitations Block */}
            {showInvitations &&
              invitations.map((inv) => (
                <div key={`inv_${inv.id}`} className="p-4 space-y-2.5 bg-[#0E0E12]">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                      <UserPlus className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white leading-snug">
                        <strong className="font-mono text-[#60A5FA]">@{inv.fromUsername}</strong>{' '}
                        te ha invitado a <strong className="text-white">«{inv.projectName}»</strong>
                      </p>
                      <p className="font-mono text-[10px] text-[#7E7E8E] mt-0.5 tabular-nums">
                        {inv.projectSubject || 'Informática'} · {formatRelativeTimeEs(inv.createdAt)}
                      </p>
                    </div>
                    {inv.status !== 'pending' && (
                      <span
                        className={`px-2 py-0.5 font-mono text-[10px] uppercase border shrink-0 ${
                          inv.status === 'accepted'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : 'border-[#2E2E3A] bg-[#14141A] text-[#8E8E9E]'
                        }`}
                      >
                        {inv.status === 'accepted' ? 'Aceptada' : 'Rechazada'}
                      </span>
                    )}
                  </div>

                  {inv.status === 'pending' && (
                    <div className="flex items-center gap-2 pl-9">
                      <button
                        type="button"
                        onClick={() => {
                          onRespondInvitation(inv, 'accepted');
                          onClose();
                        }}
                        className="flex-1 h-8 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-[11px] uppercase tracking-wider inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Aceptar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRespondInvitation(inv, 'declined')}
                        className="h-8 px-3 border border-[#2E2E3A] bg-[#14141A] hover:border-rose-400 text-[#C4C4D0] hover:text-rose-300 text-[11px] uppercase cursor-pointer"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              ))}

            {/* Activity Notifications Block */}
            {showActivity &&
              activityNotifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onClickActivityNotification(item);
                    onClose();
                  }}
                  className={`w-full text-left p-4 flex items-start gap-2.5 transition-colors cursor-pointer ${
                    item.read
                      ? 'bg-[#0E0E12] hover:bg-[#14141C]'
                      : 'bg-[#121520] hover:bg-[#171B2A]'
                  }`}
                >
                  {renderActivityIcon(item.kind)}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {item.title}
                      </span>
                      {!item.read && (
                        <span className="w-2 h-2 bg-[#3B82F6] shrink-0" aria-label="Sin leer" />
                      )}
                    </div>
                    <p className="text-[11px] text-[#B4B4C2] leading-snug line-clamp-2">
                      {item.message}
                    </p>
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-[#7E7E8E] pt-0.5 tabular-nums">
                      <span className="truncate text-[#60A5FA]">{item.projectName}</span>
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <span>{formatRelativeTimeEs(item.createdAt)}</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
          </>
        )}
      </div>
    </div>
  );
};
