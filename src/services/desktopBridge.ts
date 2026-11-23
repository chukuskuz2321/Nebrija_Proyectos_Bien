import {
  DesktopNotificationPrefs,
  DesktopPreferencesState,
  DesktopWidgetConfig,
  DesktopWidgetModule,
  DesktopWidgetSize,
} from '../types';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

export const PRODUCTION_WEB_URL = 'https://nebrija-proyectos-bien.vercel.app';
export const WINDOWS_APP_ID = 'com.nebrija.proyectos.app';
export const WINDOWS_APP_VERSION = '1.0.0';

export const DEFAULT_DESKTOP_NOTIFICATION_PREFS: DesktopNotificationPrefs = {
  enabled: true,
  chat: true,
  notices: true,
  tasks: true,
  mentions: true,
  deadlines: true,
  invitations: true,
};

export const DEFAULT_DESKTOP_WIDGETS: DesktopWidgetConfig[] = [
  {
    id: 'widget-deadlines',
    module: 'deadlines',
    size: '4x2',
    projectId: 'all',
    opacity: 0.92,
    locked: true,
    enabled: true,
  },
  {
    id: 'widget-tasks',
    module: 'tasks',
    size: '2x2',
    projectId: 'all',
    opacity: 0.9,
    locked: true,
    enabled: false,
  },
];

export const DEFAULT_DESKTOP_PREFS: DesktopPreferencesState = {
  widgets: DEFAULT_DESKTOP_WIDGETS,
  notifications: DEFAULT_DESKTOP_NOTIFICATION_PREFS,
};

export const WIDGET_MODULE_META: Record<
  DesktopWidgetModule,
  { label: string; shortLabel: string; description: string; defaultSize: DesktopWidgetSize }
> = {
  deadlines: {
    label: 'Proximas entregas',
    shortLabel: 'Entregas',
    description: 'Cuenta atras en vivo de entregas de proyectos y tareas urgentes.',
    defaultSize: '4x2',
  },
  tasks: {
    label: 'Tareas pendientes',
    shortLabel: 'Tareas',
    description: 'Lista interactiva para completar tus tareas directo desde el escritorio.',
    defaultSize: '2x2',
  },
  chat: {
    label: 'Chat del equipo',
    shortLabel: 'Chat',
    description: 'Ultimos mensajes del equipo sincronizados al segundo en tiempo real.',
    defaultSize: '4x2',
  },
  notices: {
    label: 'Tablon de avisos',
    shortLabel: 'Avisos',
    description: 'Anuncios importantes y alertas urgentes fijadas por el equipo.',
    defaultSize: '2x2',
  },
  calendar: {
    label: 'Calendario semanal',
    shortLabel: 'Calendario',
    description: 'Vista semanal con dias de entrega marcados y progreso global.',
    defaultSize: '4x4',
  },
};

export const WIDGET_SIZE_META: Record<
  DesktopWidgetSize,
  { width: number; height: number; label: string; badge: string }
> = {
  '2x2': { width: 296, height: 296, label: 'Compacto', badge: '2x2' },
  '4x2': { width: 480, height: 268, label: 'Panoramico', badge: '4x2' },
  '4x4': { width: 480, height: 488, label: 'Panel completo', badge: '4x4' },
};

export function isTauriDesktopApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.__TAURI_INTERNALS__?.invoke === 'function'
  );
}

export async function invokeDesktopCommand<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  if (!isTauriDesktopApp()) return null;
  try {
    return await window.__TAURI_INTERNALS__!.invoke<T>(cmd, args);
  } catch (err) {
    console.warn(`[DesktopBridge] Command "${cmd}" failed:`, err);
    return null;
  }
}

export const WINDOWS_INSTALLER_FILENAME = 'Proyectos-Nebrija-Setup-Windows.exe';
export const LOCAL_WINDOWS_INSTALLER_PATH = `/downloads/${WINDOWS_INSTALLER_FILENAME}`;

export function getWindowsInstallerDownloadUrl(): string {
  const envUrl =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_WINDOWS_INSTALLER_URL || '';
  const trimmed = envUrl.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  return '';
}

function startBrowserFileDownload(url: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function triggerWindowsInstallerDownload(): Promise<'downloaded' | 'not_published'> {
  const configuredUrl = getWindowsInstallerDownloadUrl();
  if (configuredUrl) {
    startBrowserFileDownload(configuredUrl, WINDOWS_INSTALLER_FILENAME);
    return 'downloaded';
  }

  // Fallback: check if the .exe was placed directly in public/downloads/ (must not be SPA HTML)
  try {
    const res = await fetch(LOCAL_WINDOWS_INSTALLER_PATH, { method: 'HEAD' });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (res.ok && !contentType.includes('text/html')) {
      startBrowserFileDownload(LOCAL_WINDOWS_INSTALLER_PATH, WINDOWS_INSTALLER_FILENAME);
      return 'downloaded';
    }
  } catch {
    // Ignore network probe error and report not published
  }

  return 'not_published';
}

function getLocalPrefsKey(uid?: string): string {
  return `nebrija_desktop_prefs_v1_${uid || 'guest'}`;
}

export function normalizeDesktopPrefs(raw: unknown): DesktopPreferencesState {
  if (!raw || typeof raw !== 'object') {
    return {
      widgets: DEFAULT_DESKTOP_WIDGETS.map((w) => ({ ...w })),
      notifications: { ...DEFAULT_DESKTOP_NOTIFICATION_PREFS },
    };
  }
  const obj = raw as Partial<DesktopPreferencesState>;
  const validModules: DesktopWidgetModule[] = [
    'deadlines',
    'tasks',
    'chat',
    'notices',
    'calendar',
  ];
  const validSizes: DesktopWidgetSize[] = ['2x2', '4x2', '4x4'];

  const widgets: DesktopWidgetConfig[] = Array.isArray(obj.widgets)
    ? obj.widgets
        .filter((w): w is DesktopWidgetConfig => Boolean(w && typeof w === 'object' && typeof w.id === 'string'))
        .slice(0, 8)
        .map((w) => ({
          id: w.id.slice(0, 48),
          module: validModules.includes(w.module) ? w.module : 'deadlines',
          size: validSizes.includes(w.size) ? w.size : '4x2',
          projectId: typeof w.projectId === 'string' && w.projectId.trim() ? w.projectId : 'all',
          opacity:
            typeof w.opacity === 'number' && Number.isFinite(w.opacity)
              ? Math.min(1, Math.max(0.65, w.opacity))
              : 0.92,
          locked: Boolean(w.locked),
          enabled: Boolean(w.enabled),
          ...(typeof w.x === 'number' && Number.isFinite(w.x) ? { x: Math.round(w.x) } : {}),
          ...(typeof w.y === 'number' && Number.isFinite(w.y) ? { y: Math.round(w.y) } : {}),
        }))
    : DEFAULT_DESKTOP_WIDGETS.map((w) => ({ ...w }));

  const n = obj.notifications || ({} as Partial<DesktopNotificationPrefs>);
  const notifications: DesktopNotificationPrefs = {
    enabled: typeof n.enabled === 'boolean' ? n.enabled : true,
    chat: typeof n.chat === 'boolean' ? n.chat : true,
    notices: typeof n.notices === 'boolean' ? n.notices : true,
    tasks: typeof n.tasks === 'boolean' ? n.tasks : true,
    mentions: typeof n.mentions === 'boolean' ? n.mentions : true,
    deadlines: typeof n.deadlines === 'boolean' ? n.deadlines : true,
    invitations: typeof n.invitations === 'boolean' ? n.invitations : true,
  };

  return {
    widgets,
    notifications,
    ...(typeof obj.updatedAt === 'string' ? { updatedAt: obj.updatedAt } : {}),
  };
}

export function loadLocalDesktopPrefs(uid?: string): DesktopPreferencesState {
  if (typeof window === 'undefined') return normalizeDesktopPrefs(null);
  try {
    const raw = window.localStorage.getItem(getLocalPrefsKey(uid));
    if (!raw) return normalizeDesktopPrefs(null);
    return normalizeDesktopPrefs(JSON.parse(raw));
  } catch {
    return normalizeDesktopPrefs(null);
  }
}

export function saveLocalDesktopPrefs(prefs: DesktopPreferencesState, uid?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getLocalPrefsKey(uid), JSON.stringify(prefs));
  } catch {
    // Ignore storage quota issues
  }
}

export async function sendDesktopNotification(title: string, body: string): Promise<boolean> {
  const safeTitle = (title || 'Proyectos Nebrija App').slice(0, 120);
  const safeBody = (body || '').slice(0, 260);

  if (isTauriDesktopApp()) {
    const res = await invokeDesktopCommand<boolean>('send_desktop_notification', {
      title: safeTitle,
      body: safeBody,
    });
    if (res !== null) return Boolean(res);
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        new Notification(safeTitle, {
          body: safeBody,
          icon: '/logo.svg',
          badge: '/logo.svg',
        });
        return true;
      }
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(safeTitle, {
            body: safeBody,
            icon: '/logo.svg',
            badge: '/logo.svg',
          });
          return true;
        }
      }
    } catch {
      return false;
    }
  }

  return false;
}

export async function openDesktopWidgetWindow(widget: DesktopWidgetConfig): Promise<boolean> {
  if (!isTauriDesktopApp()) return false;
  const dims = WIDGET_SIZE_META[widget.size] || WIDGET_SIZE_META['4x2'];
  const res = await invokeDesktopCommand<boolean>('open_widget_window', {
    id: widget.id,
    urlPath: `/widget?id=${encodeURIComponent(widget.id)}`,
    width: dims.width,
    height: dims.height,
    locked: widget.locked,
    x: typeof widget.x === 'number' ? widget.x : null,
    y: typeof widget.y === 'number' ? widget.y : null,
  });
  return Boolean(res);
}

export async function closeDesktopWidgetWindow(widgetId: string): Promise<boolean> {
  if (!isTauriDesktopApp()) return false;
  const res = await invokeDesktopCommand<boolean>('close_widget_window', {
    id: widgetId,
  });
  return Boolean(res);
}

export async function setDesktopWidgetPinned(widgetId: string, locked: boolean): Promise<boolean> {
  if (!isTauriDesktopApp()) return false;
  const res = await invokeDesktopCommand<boolean>('set_widget_pinned', {
    id: widgetId,
    locked,
  });
  return Boolean(res);
}

export async function resizeDesktopWidgetWindow(
  widgetId: string,
  size: DesktopWidgetSize
): Promise<boolean> {
  if (!isTauriDesktopApp()) return false;
  const dims = WIDGET_SIZE_META[size] || WIDGET_SIZE_META['4x2'];
  const res = await invokeDesktopCommand<boolean>('resize_widget_window', {
    id: widgetId,
    width: dims.width,
    height: dims.height,
  });
  return Boolean(res);
}

export async function focusMainDesktopWindow(
  section?: string,
  projectId?: string
): Promise<boolean> {
  if (!isTauriDesktopApp()) return false;
  const res = await invokeDesktopCommand<boolean>('focus_main_window', {
    section: section || null,
    projectId: projectId || null,
  });
  return Boolean(res);
}

export async function getDesktopAutostart(): Promise<boolean> {
  if (!isTauriDesktopApp()) return false;
  const res = await invokeDesktopCommand<boolean>('is_autostart_enabled');
  return Boolean(res);
}

export async function setDesktopAutostart(enabled: boolean): Promise<boolean> {
  if (!isTauriDesktopApp()) return false;
  const res = await invokeDesktopCommand<boolean>('set_autostart_enabled', { enabled });
  return Boolean(res);
}
