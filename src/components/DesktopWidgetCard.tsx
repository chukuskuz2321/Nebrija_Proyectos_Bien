import React, { useMemo } from 'react';
import {
  Bell,
  Calendar,
  Check,
  CheckSquare,
  Clock,
  ExternalLink,
  Lock,
  MessageSquare,
  Pin,
  Unlock,
  X,
} from 'lucide-react';
import {
  ChatMessageItem,
  DesktopWidgetConfig,
  NoticeItem,
  ProjectItem,
  TaskItem,
} from '../types';
import { WIDGET_MODULE_META } from '../services/desktopBridge';
import { BrandLogo } from './BrandLogo';

interface DesktopWidgetCardProps {
  config: DesktopWidgetConfig;
  projects: ProjectItem[];
  tasks: TaskItem[];
  notices: NoticeItem[];
  messages: ChatMessageItem[];
  currentUsername: string;
  isStandaloneWindow?: boolean;
  onToggleTaskComplete?: (task: TaskItem) => void;
  onToggleLock?: (widgetId: string) => void;
  onCloseWidget?: (widgetId: string) => void;
  onOpenMainApp?: (section?: string, projectId?: string) => void;
}

function parseDateSafe(raw?: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed.length === 10 ? `${trimmed}T23:59:59` : trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCountdown(target: Date): { label: string; urgent: boolean; soon: boolean } {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) {
    return { label: 'Vencida', urgent: true, soon: true };
  }
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (totalHours < 48) {
    return {
      label: days > 0 ? `${days}d ${hours}h` : `${Math.max(1, totalHours)}h`,
      urgent: true,
      soon: true,
    };
  }
  if (days <= 5) {
    return { label: `${days}d ${hours}h`, urgent: false, soon: true };
  }
  return { label: `${days} dias`, urgent: false, soon: false };
}

function formatShortTime(raw?: string): string {
  const d = parseDateSafe(raw);
  if (!d) return '';
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export const DesktopWidgetCard: React.FC<DesktopWidgetCardProps> = ({
  config,
  projects,
  tasks,
  notices,
  messages,
  currentUsername,
  isStandaloneWindow = false,
  onToggleTaskComplete,
  onToggleLock,
  onCloseWidget,
  onOpenMainApp,
}) => {
  const moduleMeta = WIDGET_MODULE_META[config.module];
  const projectMap = useMemo(() => {
    const map = new Map<string, ProjectItem>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const selectedProject =
    config.projectId !== 'all' ? projectMap.get(config.projectId) || null : null;

  const filteredTasks = useMemo(() => {
    const base =
      config.projectId === 'all'
        ? tasks
        : tasks.filter((t) => t.projectId === config.projectId);
    const pending = base.filter((t) => t.status !== 'completed');
    const cleanMe = currentUsername.trim().toLowerCase();
    return pending.sort((a, b) => {
      const aMine = (a.assigneeUsername || '').toLowerCase() === cleanMe ? 0 : 1;
      const bMine = (b.assigneeUsername || '').toLowerCase() === cleanMe ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      const da = parseDateSafe(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseDateSafe(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [tasks, config.projectId, currentUsername]);

  const upcomingDeadlines = useMemo(() => {
    type DeadlineEntry = {
      id: string;
      title: string;
      subtitle: string;
      date: Date;
      kind: 'project' | 'task';
      projectId: string;
      progress?: number;
    };
    const list: DeadlineEntry[] = [];
    const targetProjects =
      config.projectId === 'all'
        ? projects
        : projects.filter((p) => p.id === config.projectId);

    targetProjects.forEach((p) => {
      const d = parseDateSafe(p.dueDate);
      if (d) {
        const pTasks = tasks.filter((t) => t.projectId === p.id);
        const done = pTasks.filter((t) => t.status === 'completed').length;
        const progress = pTasks.length > 0 ? Math.round((done / pTasks.length) * 100) : 0;
        list.push({
          id: `proj-${p.id}`,
          title: p.name,
          subtitle: p.subject || 'Entrega de proyecto',
          date: d,
          kind: 'project',
          projectId: p.id,
          progress,
        });
      }
    });

    filteredTasks.forEach((t) => {
      const d = parseDateSafe(t.dueDate);
      if (d) {
        const proj = projectMap.get(t.projectId);
        list.push({
          id: `task-${t.id}`,
          title: t.title,
          subtitle: proj ? proj.name : 'Tarea pendiente',
          date: d,
          kind: 'task',
          projectId: t.projectId,
        });
      }
    });

    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [projects, tasks, filteredTasks, config.projectId, projectMap]);

  const filteredNotices = useMemo(() => {
    const base = notices.filter(
      (n) => !n.archived && (config.projectId === 'all' || n.projectId === config.projectId)
    );
    const rank: Record<string, number> = { urgent: 0, important: 1, normal: 2 };
    return base.sort((a, b) => {
      const rDiff = (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
      if (rDiff !== 0) return rDiff;
      return (
        (parseDateSafe(b.createdAt)?.getTime() ?? 0) -
        (parseDateSafe(a.createdAt)?.getTime() ?? 0)
      );
    });
  }, [notices, config.projectId]);

  const filteredMessages = useMemo(() => {
    const base =
      config.projectId === 'all'
        ? messages
        : messages.filter((m) => m.projectId === config.projectId);
    return [...base]
      .sort(
        (a, b) =>
          (parseDateSafe(b.createdAt)?.getTime() ?? 0) -
          (parseDateSafe(a.createdAt)?.getTime() ?? 0)
      )
      .slice(0, config.size === '4x4' ? 8 : config.size === '4x2' ? 4 : 3);
  }, [messages, config.projectId, config.size]);

  const weekCalendar = useMemo(() => {
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek);
    monday.setHours(0, 0, 0, 0);

    const deadlineKeys = new Set<string>();
    upcomingDeadlines.forEach((d) => {
      deadlineKeys.add(
        `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}-${String(
          d.date.getDate()
        ).padStart(2, '0')}`
      );
    });

    const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
      ).padStart(2, '0')}`;
      const isToday =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
      return {
        label: dayNames[i],
        dayNum: date.getDate(),
        key,
        isToday,
        hasDeadline: deadlineKeys.has(key),
      };
    });

    const scopeTasks =
      config.projectId === 'all'
        ? tasks
        : tasks.filter((t) => t.projectId === config.projectId);
    const total = scopeTasks.length;
    const done = scopeTasks.filter((t) => t.status === 'completed').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    return { days, total, done, percent };
  }, [upcomingDeadlines, tasks, config.projectId]);

  const sizeClass = isStandaloneWindow
    ? 'w-full h-full'
    : config.size === '2x2'
      ? 'w-full max-w-[296px] h-[296px]'
      : config.size === '4x2'
        ? 'w-full max-w-[480px] h-[268px]'
        : 'w-full max-w-[480px] h-[440px]';

  const maxRows = config.size === '4x4' ? 6 : config.size === '4x2' ? 3 : 3;

  const ModuleIcon =
    config.module === 'deadlines'
      ? Clock
      : config.module === 'tasks'
        ? CheckSquare
        : config.module === 'chat'
          ? MessageSquare
          : config.module === 'notices'
            ? Bell
            : Calendar;

  return (
    <div
      className={`${sizeClass} relative flex flex-col overflow-hidden rounded-2xl border border-white/15 text-[#F4F4F6] shadow-[0_18px_48px_rgba(0,0,0,0.55)] select-none`}
      style={{
        backgroundColor: `rgba(14, 14, 18, ${config.opacity})`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Top highlight hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      {/* Drag Header */}
      <div
        data-tauri-drag-region
        className={`flex items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5 ${
          config.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2" data-tauri-drag-region>
          <BrandLogo size={18} />
          <ModuleIcon className="h-3.5 w-3.5 shrink-0 text-[#3B82F6]" />
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E4E4EA]">
            {moduleMeta.shortLabel}
          </span>
          {selectedProject && (
            <span className="truncate text-[10px] text-[#7E7E8F]">
              / {selectedProject.name}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span
            title="Sincronizado en vivo con Firebase"
            className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-400"
          />
          {onToggleLock && (
            <button
              type="button"
              onClick={() => onToggleLock(config.id)}
              title={config.locked ? 'Fijado en el escritorio (clic para mover)' : 'Desbloqueado (clic para fijar)'}
              className={`rounded-md p-1 transition-colors ${
                config.locked
                  ? 'text-[#3B82F6] hover:bg-white/10'
                  : 'text-[#8E8E9E] hover:bg-white/10 hover:text-white'
              }`}
            >
              {config.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </button>
          )}
          {onOpenMainApp && (
            <button
              type="button"
              onClick={() =>
                onOpenMainApp(
                  config.module === 'tasks'
                    ? 'tasks'
                    : config.module === 'notices'
                      ? 'notices'
                      : config.module === 'chat'
                        ? 'overview'
                        : 'overview',
                  selectedProject?.id
                )
              }
              title="Abrir en Proyectos Nebrija App"
              className="rounded-md p-1 text-[#8E8E9E] transition-colors hover:bg-white/10 hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          {isStandaloneWindow && onCloseWidget && (
            <button
              type="button"
              onClick={() => onCloseWidget(config.id)}
              title="Cerrar widget"
              className="rounded-md p-1 text-[#8E8E9E] transition-colors hover:bg-red-500/20 hover:text-red-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Widget Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3">
        {config.module === 'deadlines' && (
          <div className="flex h-full flex-col justify-between gap-2.5">
            {upcomingDeadlines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <Clock className="mb-2 h-5 w-5 text-[#5E5E70]" />
                <p className="text-xs font-medium text-[#A0A0B2]">Sin entregas proximas</p>
                <p className="mt-0.5 text-[11px] text-[#6E6E80]">
                  Asigna una fecha limite a tus proyectos o tareas.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingDeadlines.slice(0, maxRows).map((item, idx) => {
                  const cd = formatCountdown(item.date);
                  const dateText = item.date.toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                  });
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        onOpenMainApp?.(item.kind === 'task' ? 'tasks' : 'overview', item.projectId)
                      }
                      className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                        idx === 0
                          ? 'border-white/15 bg-white/[0.06] hover:bg-white/[0.09]'
                          : 'border-white/8 bg-white/[0.025] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white">{item.title}</p>
                          <p className="truncate text-[10px] text-[#8A8A9C]">
                            {item.subtitle} · {dateText}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 font-mono text-xs font-bold tabular-nums ${
                            cd.urgent
                              ? 'text-red-400'
                              : cd.soon
                                ? 'text-amber-400'
                                : 'text-[#60A5FA]'
                          }`}
                        >
                          {cd.label}
                        </span>
                      </div>
                      {typeof item.progress === 'number' && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full bg-[#3B82F6] transition-all"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] tabular-nums text-[#8E8E9E]">
                            {item.progress}%
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {config.module === 'tasks' && (
          <div className="space-y-1.5">
            {filteredTasks.length === 0 ? (
              <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center">
                <Check className="mb-2 h-5 w-5 text-emerald-400" />
                <p className="text-xs font-medium text-[#D4D4DF]">Todo al dia</p>
                <p className="mt-0.5 text-[11px] text-[#6E6E80]">
                  No tienes tareas pendientes en este espacio.
                </p>
              </div>
            ) : (
              filteredTasks.slice(0, maxRows + 1).map((task) => {
                const proj = projectMap.get(task.projectId);
                const isMine =
                  (task.assigneeUsername || '').toLowerCase() ===
                  currentUsername.trim().toLowerCase();
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2 transition-colors hover:border-white/15 hover:bg-white/[0.06]"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTaskComplete?.(task)}
                      title="Marcar como completada (se sincroniza en vivo)"
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/30 text-transparent transition-colors hover:border-[#3B82F6] hover:bg-[#3B82F6]/20 hover:text-[#60A5FA]"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-[#F2F2F7]">{task.title}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#8A8A9C]">
                        <span className={isMine ? 'font-semibold text-[#60A5FA]' : ''}>
                          @{task.assigneeUsername}
                        </span>
                        {config.projectId === 'all' && proj && (
                          <span className="truncate">· {proj.name}</span>
                        )}
                        {task.dueDate && (
                          <span className="ml-auto font-mono tabular-nums text-[#A0A0B2]">
                            {task.dueDate.slice(5)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {config.module === 'chat' && (
          <div className="space-y-2">
            {filteredMessages.length === 0 ? (
              <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center">
                <MessageSquare className="mb-2 h-5 w-5 text-[#5E5E70]" />
                <p className="text-xs font-medium text-[#A0A0B2]">Sin mensajes recientes</p>
                <p className="mt-0.5 text-[11px] text-[#6E6E80]">
                  Los mensajes del equipo apareceran aqui al instante.
                </p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const proj = projectMap.get(msg.projectId);
                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => onOpenMainApp?.('overview', msg.projectId)}
                    className="w-full rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-white/15 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold text-[#60A5FA]">
                        @{msg.senderUsername}
                        {config.projectId === 'all' && proj ? (
                          <span className="font-normal text-[#7E7E8F]"> · {proj.name}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#7A7A8C]">
                        {formatShortTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#D8D8E4]">
                      {msg.text}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        )}

        {config.module === 'notices' && (
          <div className="space-y-2">
            {filteredNotices.length === 0 ? (
              <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center">
                <Bell className="mb-2 h-5 w-5 text-[#5E5E70]" />
                <p className="text-xs font-medium text-[#A0A0B2]">Tablon limpio</p>
                <p className="mt-0.5 text-[11px] text-[#6E6E80]">
                  No hay avisos activos en este proyecto.
                </p>
              </div>
            ) : (
              filteredNotices.slice(0, maxRows).map((notice) => {
                const dotColor =
                  notice.priority === 'urgent'
                    ? 'bg-red-500'
                    : notice.priority === 'important'
                      ? 'bg-amber-400'
                      : 'bg-[#3B82F6]';
                return (
                  <button
                    key={notice.id}
                    type="button"
                    onClick={() => onOpenMainApp?.('notices', notice.projectId)}
                    className="w-full rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-white/15 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                      <p className="truncate text-xs font-semibold text-white">{notice.title}</p>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#A8A8BA]">
                      {notice.message}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        )}

        {config.module === 'calendar' && (
          <div className="flex h-full flex-col justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9A9AAE]">
                  Semana actual
                </span>
                <span className="font-mono text-[11px] tabular-nums text-[#60A5FA]">
                  {weekCalendar.done}/{weekCalendar.total} tareas ({weekCalendar.percent}%)
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {weekCalendar.days.map((d) => (
                  <div
                    key={d.key}
                    className={`flex flex-col items-center rounded-xl border py-2 ${
                      d.isToday
                        ? 'border-[#3B82F6] bg-[#3B82F6]/20 text-white'
                        : 'border-white/8 bg-white/[0.03] text-[#A8A8BA]'
                    }`}
                  >
                    <span className="text-[10px] font-medium opacity-75">{d.label}</span>
                    <span className="mt-0.5 font-mono text-xs font-bold tabular-nums">
                      {d.dayNum}
                    </span>
                    <span
                      className={`mt-1 h-1 w-1 rounded-full ${
                        d.hasDeadline ? 'bg-amber-400' : 'bg-transparent'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="text-[#8E8E9E]">Progreso general</span>
                <span className="font-mono font-semibold tabular-nums text-white">
                  {weekCalendar.percent}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#3B82F6] transition-all"
                  style={{ width: `${weekCalendar.percent}%` }}
                />
              </div>
            </div>

            {upcomingDeadlines.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7E7E90]">
                  Proximos hitos
                </p>
                {upcomingDeadlines.slice(0, config.size === '4x4' ? 4 : 2).map((item) => {
                  const cd = formatCountdown(item.date);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenMainApp?.('overview', item.projectId)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-1.5 text-left hover:bg-white/[0.06]"
                    >
                      <span className="truncate text-xs text-[#E4E4EE]">{item.title}</span>
                      <span
                        className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums ${
                          cd.urgent ? 'text-red-400' : 'text-[#60A5FA]'
                        }`}
                      >
                        {cd.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subtle footer status */}
      <div className="flex items-center justify-between border-t border-white/8 px-3.5 py-1.5 text-[10px] text-[#7E7E90]">
        <span className="flex items-center gap-1">
          <Pin className="h-2.5 w-2.5" />
          {config.locked ? 'Fijado al escritorio' : 'Arrastrable'}
        </span>
        <span className="font-mono tabular-nums">{config.size}</span>
      </div>
    </div>
  );
};
