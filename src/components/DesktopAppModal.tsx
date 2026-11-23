import React, { useEffect, useState } from 'react';
import {
  Bell,
  Calendar,
  Check,
  CheckSquare,
  Clock,
  Download,
  ExternalLink,
  LayoutGrid,
  Lock,
  MessageSquare,
  Monitor,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  ChatMessageItem,
  DesktopNotificationPrefs,
  DesktopPreferencesState,
  DesktopWidgetConfig,
  DesktopWidgetModule,
  DesktopWidgetSize,
  NoticeItem,
  ProjectItem,
  TaskItem,
} from '../types';
import {
  WIDGET_MODULE_META,
  WIDGET_SIZE_META,
  closeDesktopWidgetWindow,
  getDesktopAutostart,
  getWindowsInstallerDownloadUrl,
  isTauriDesktopApp,
  openDesktopWidgetWindow,
  resizeDesktopWidgetWindow,
  sendDesktopNotification,
  setDesktopAutostart,
  setDesktopWidgetPinned,
} from '../services/desktopBridge';
import { BrandLogo } from './BrandLogo';
import { DesktopWidgetCard } from './DesktopWidgetCard';
import { WindowsInstallerPreview } from './WindowsInstallerPreview';

interface DesktopAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefs: DesktopPreferencesState;
  onUpdatePrefs: (next: DesktopPreferencesState) => void;
  projects: ProjectItem[];
  tasks: TaskItem[];
  notices: NoticeItem[];
  messages: ChatMessageItem[];
  currentUsername: string;
  onToggleTaskComplete: (task: TaskItem) => void;
  onJumpToSection?: (section: string, projectId?: string) => void;
}

type ModalTab = 'download' | 'widgets' | 'notifications';

const MODULE_ORDER: DesktopWidgetModule[] = [
  'deadlines',
  'tasks',
  'chat',
  'notices',
  'calendar',
];

const SIZE_ORDER: DesktopWidgetSize[] = ['2x2', '4x2', '4x4'];

export const DesktopAppModal: React.FC<DesktopAppModalProps> = ({
  isOpen,
  onClose,
  prefs,
  onUpdatePrefs,
  projects,
  tasks,
  notices,
  messages,
  currentUsername,
  onToggleTaskComplete,
  onJumpToSection,
}) => {
  const isDesktop = isTauriDesktopApp();
  const downloadUrl = getWindowsInstallerDownloadUrl();

  const [activeTab, setActiveTab] = useState<ModalTab>(isDesktop ? 'widgets' : 'download');
  const [selectedWidgetId, setSelectedWidgetId] = useState<string>(
    prefs.widgets[0]?.id || ''
  );
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [testAlertStatus, setTestAlertStatus] = useState<'idle' | 'sent' | 'blocked'>('idle');

  useEffect(() => {
    if (!isOpen) return;
    if (
      prefs.widgets.length > 0 &&
      !prefs.widgets.some((w) => w.id === selectedWidgetId)
    ) {
      setSelectedWidgetId(prefs.widgets[0].id);
    }
  }, [isOpen, prefs.widgets, selectedWidgetId]);

  useEffect(() => {
    if (!isOpen || !isDesktop) return;
    let active = true;
    getDesktopAutostart().then((val) => {
      if (active) setAutostartEnabled(val);
    });
    return () => {
      active = false;
    };
  }, [isOpen, isDesktop]);

  if (!isOpen) return null;

  const selectedWidget =
    prefs.widgets.find((w) => w.id === selectedWidgetId) || prefs.widgets[0] || null;

  const updateWidget = (widgetId: string, patch: Partial<DesktopWidgetConfig>) => {
    const nextWidgets = prefs.widgets.map((w) =>
      w.id === widgetId ? { ...w, ...patch } : w
    );
    const updated = nextWidgets.find((w) => w.id === widgetId);
    onUpdatePrefs({ ...prefs, widgets: nextWidgets });

    if (isDesktop && updated) {
      if (patch.enabled === true) {
        void openDesktopWidgetWindow(updated);
      } else if (patch.enabled === false) {
        void closeDesktopWidgetWindow(updated.id);
      }
      if (typeof patch.locked === 'boolean' && updated.enabled) {
        void setDesktopWidgetPinned(updated.id, patch.locked);
      }
      if (patch.size && updated.enabled) {
        void resizeDesktopWidgetWindow(updated.id, patch.size);
      }
    }
  };

  const handleAddWidget = () => {
    if (prefs.widgets.length >= 6) return;
    const usedModules = new Set(prefs.widgets.map((w) => w.module));
    const nextModule =
      MODULE_ORDER.find((m) => !usedModules.has(m)) || 'tasks';
    const newWidget: DesktopWidgetConfig = {
      id: `widget-${Date.now().toString(36)}`,
      module: nextModule,
      size: WIDGET_MODULE_META[nextModule].defaultSize,
      projectId: 'all',
      opacity: 0.92,
      locked: true,
      enabled: isDesktop,
    };
    const nextWidgets = [...prefs.widgets, newWidget];
    onUpdatePrefs({ ...prefs, widgets: nextWidgets });
    setSelectedWidgetId(newWidget.id);
    if (isDesktop) {
      void openDesktopWidgetWindow(newWidget);
    }
  };

  const handleDeleteWidget = (widgetId: string) => {
    const nextWidgets = prefs.widgets.filter((w) => w.id !== widgetId);
    onUpdatePrefs({ ...prefs, widgets: nextWidgets });
    if (isDesktop) {
      void closeDesktopWidgetWindow(widgetId);
    }
    if (selectedWidgetId === widgetId) {
      setSelectedWidgetId(nextWidgets[0]?.id || '');
    }
  };

  const updateNotificationPref = (
    key: keyof DesktopNotificationPrefs,
    value: boolean
  ) => {
    onUpdatePrefs({
      ...prefs,
      notifications: {
        ...prefs.notifications,
        [key]: value,
      },
    });
  };

  const handleTestNotification = async () => {
    const ok = await sendDesktopNotification(
      'Proyectos Nebrija App',
      'Notificacion de prueba activa. Recibiras avisos en tiempo real en tu escritorio.'
    );
    setTestAlertStatus(ok ? 'sent' : 'blocked');
    window.setTimeout(() => setTestAlertStatus('idle'), 3500);
  };

  const handleToggleAutostart = async () => {
    const next = !autostartEnabled;
    const ok = await setDesktopAutostart(next);
    if (ok) setAutostartEnabled(next);
  };

  const getModuleIcon = (module: DesktopWidgetModule) => {
    switch (module) {
      case 'deadlines':
        return Clock;
      case 'tasks':
        return CheckSquare;
      case 'chat':
        return MessageSquare;
      case 'notices':
        return Bell;
      case 'calendar':
        return Calendar;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#22222A] bg-[#09090B] text-[#F4F4F6] shadow-2xl">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E1E26] bg-[#0E0E12] px-5 py-4">
          <div className="flex items-center gap-3">
            <BrandLogo size={34} />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold tracking-tight text-white">
                  App de Windows y Widgets
                </h2>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8A8A9C]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isDesktop ? 'bg-emerald-400' : 'bg-[#3B82F6]'
                    }`}
                  />
                  {isDesktop ? 'Modo App Windows activo' : 'Modo Web'}
                </span>
              </div>
              <p className="text-xs text-[#8E8E9E]">
                Tu misma web sincronizada en vivo con widgets estilo iOS y avisos de escritorio.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#22222A] p-2 text-[#9A9AAE] transition-colors hover:bg-[#17171E] hover:text-white"
            aria-label="Cerrar ventana"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Tab Bar */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#1E1E26] bg-[#0B0B0F] px-5">
          {[
            { id: 'download' as ModalTab, label: 'Descargar App Windows', icon: Download },
            { id: 'widgets' as ModalTab, label: 'Widgets estilo iOS', icon: LayoutGrid },
            { id: 'notifications' as ModalTab, label: 'Notificaciones PC', icon: Bell },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-xs font-semibold transition-colors ${
                  active ? 'text-white' : 'text-[#848496] hover:text-[#D4D4E0]'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${active ? 'text-[#3B82F6]' : ''}`} />
                {tab.label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 bg-[#3B82F6]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {/* TAB 1: DOWNLOAD & INSTALLER */}
          {activeTab === 'download' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="rounded-2xl border border-[#22222A] bg-[#0E0E12] p-5 lg:col-span-7">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3B82F6]">
                    <Monitor className="h-3.5 w-3.5" />
                    <span>Tauri v2 · ~15 MB · Windows 10 y 11</span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-white">
                    Literalmente tu web, en modo aplicacion de escritorio
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#9C9CAF]">
                    La app de Windows abre directamente tu espacio oficial de Vercel en una
                    ventana nativa ultrarrapida. El chat, las tareas, los archivos y las mejoras
                    se actualizan al instante sin tener que reinstalar ni cerrar nada.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {downloadUrl ? (
                      <a
                        href={downloadUrl}
                        download
                        className="inline-flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#2563EB]"
                      >
                        <Download className="h-4 w-4" />
                        Descargar instalador Windows (.exe)
                      </a>
                    ) : (
                      <div className="w-full rounded-xl border border-[#22222A] bg-[#121218] p-3.5">
                        <div className="flex items-start gap-2.5">
                          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#60A5FA]" />
                          <div className="text-xs leading-relaxed text-[#B4B4C6]">
                            <p className="font-semibold text-white">
                              Compilacion 100% gratuita lista en tu repositorio GitHub
                            </p>
                            <p className="mt-1">
                              Al subir este proyecto a GitHub y ejecutar el workflow{' '}
                              <span className="font-mono text-[#60A5FA]">
                                Build Windows Desktop App
                              </span>{' '}
                              en la pestana Actions, se genera automaticamente{' '}
                              <span className="font-mono text-white">
                                Proyectos-Nebrija-Setup-Windows.exe
                              </span>
                              . Despues pega el enlace de tu Release en{' '}
                              <span className="font-mono text-[#60A5FA]">
                                VITE_WINDOWS_INSTALLER_URL
                              </span>{' '}
                              en Vercel para activar la descarga directa con un clic.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setActiveTab('widgets')}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#262630] bg-[#14141A] px-4 py-2.5 text-xs font-semibold text-[#E4E4EE] transition-colors hover:border-[#3A3A48] hover:text-white"
                    >
                      <LayoutGrid className="h-3.5 w-3.5 text-[#3B82F6]" />
                      Personalizar mis widgets
                    </button>
                  </div>

                  {isDesktop && (
                    <div className="mt-4 flex items-center justify-between rounded-xl border border-[#22222A] bg-[#121218] px-4 py-3">
                      <div>
                        <p className="text-xs font-semibold text-white">
                          Iniciar automaticamente con Windows
                        </p>
                        <p className="text-[11px] text-[#8A8A9C]">
                          Mantiene tus widgets fijados y notificaciones listas al encender el PC.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleAutostart}
                        className={`relative h-6 w-11 rounded-full transition-colors ${
                          autostartEnabled ? 'bg-[#3B82F6]' : 'bg-[#262630]'
                        }`}
                      >
                        <span
                          className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                            autostartEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  )}
                </div>

                {/* SmartScreen 2-step honest guide */}
                <div className="flex flex-col justify-between rounded-2xl border border-[#22222A] bg-[#0E0E12] p-5 lg:col-span-5">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Aviso de primera ejecucion (gratis)</span>
                    </div>
                    <h4 className="mt-2 text-sm font-semibold text-white">
                      Si Windows SmartScreen muestra un aviso azul
                    </h4>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#9C9CAF]">
                      Para mantener la app 100% gratuita no usa certificado comercial de pago
                      (~300€/ano). La primera vez que abras el instalador solo haz estos 2 pasos:
                    </p>
                    <ol className="mt-3 space-y-2 text-xs text-[#D4D4E0]">
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[#2A2A36] bg-[#15151C] font-mono text-[11px] font-bold text-[#60A5FA]">
                          1
                        </span>
                        <span>
                          Pulsa en <strong className="text-white">Mas informacion</strong> en la
                          ventana azul de Windows Defender.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[#2A2A36] bg-[#15151C] font-mono text-[11px] font-bold text-[#60A5FA]">
                          2
                        </span>
                        <span>
                          Pulsa <strong className="text-white">Ejecutar de todas formas</strong>{' '}
                          para abrir el instalador animado.
                        </span>
                      </li>
                    </ol>
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-[#1E1E26] pt-3 text-[11px] text-[#848496]">
                    <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Solo pasa una vez; despues se abre directo sin avisos.</span>
                  </div>
                </div>
              </div>

              {/* Interactive Custom Installer Preview */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      Vista previa interactiva del instalador personalizado
                    </h4>
                    <p className="text-xs text-[#8E8E9E]">
                      Prueba aqui mismo los 4 pasos animados exactos del ejecutable .exe de Windows.
                    </p>
                  </div>
                </div>
                <WindowsInstallerPreview
                  downloadUrl={downloadUrl}
                  onLaunchApp={onClose}
                />
              </div>
            </div>
          )}

          {/* TAB 2: iOS-STYLE WIDGET STUDIO */}
          {activeTab === 'widgets' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left: Widget list & controls */}
              <div className="space-y-4 lg:col-span-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Tus widgets de escritorio ({prefs.widgets.length}/6)
                    </h3>
                    <p className="text-[11px] text-[#8A8A9C]">
                      Se guardan en tu cuenta y aparecen fijados en Windows.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={prefs.widgets.length >= 6}
                    onClick={handleAddWidget}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#3B82F6] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#2563EB] disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" /> Nuevo
                  </button>
                </div>

                {/* Widget items */}
                <div className="space-y-2">
                  {prefs.widgets.map((widget) => {
                    const meta = WIDGET_MODULE_META[widget.module];
                    const Icon = getModuleIcon(widget.module);
                    const isSelected = selectedWidget?.id === widget.id;
                    return (
                      <div
                        key={widget.id}
                        onClick={() => setSelectedWidgetId(widget.id)}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 transition-colors ${
                          isSelected
                            ? 'border-[#3B82F6] bg-[#3B82F6]/10'
                            : 'border-[#22222A] bg-[#0E0E12] hover:border-[#32323E]'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0 text-[#60A5FA]" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">
                              {meta.label}
                            </p>
                            <p className="font-mono text-[10px] text-[#848496]">
                              {widget.size} · {widget.locked ? 'Fijado' : 'Libre'}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateWidget(widget.id, { enabled: !widget.enabled });
                            }}
                            title={
                              widget.enabled
                                ? 'Activo en escritorio'
                                : 'Mostrar en escritorio'
                            }
                            className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                              widget.enabled
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-[#1A1A22] text-[#8E8E9E] hover:text-white'
                            }`}
                          >
                            {widget.enabled ? 'Activo' : 'Oculto'}
                          </button>
                          {prefs.widgets.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteWidget(widget.id);
                              }}
                              title="Eliminar widget"
                              className="rounded-md p-1 text-[#7E7E90] hover:bg-red-500/15 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected widget inspector */}
                {selectedWidget && (
                  <div className="space-y-4 rounded-2xl border border-[#22222A] bg-[#0E0E12] p-4">
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A8A9C]">
                        Modulo del widget
                      </label>
                      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {MODULE_ORDER.map((mod) => {
                          const Icon = getModuleIcon(mod);
                          const active = selectedWidget.module === mod;
                          return (
                            <button
                              key={mod}
                              type="button"
                              onClick={() => updateWidget(selectedWidget.id, { module: mod })}
                              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                                active
                                  ? 'border-[#3B82F6] bg-[#3B82F6]/15 text-white'
                                  : 'border-[#22222A] bg-[#121218] text-[#9A9AAE] hover:text-white'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">
                                {WIDGET_MODULE_META[mod].shortLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A8A9C]">
                        Tamano estilo iOS
                      </label>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {SIZE_ORDER.map((sz) => {
                          const meta = WIDGET_SIZE_META[sz];
                          const active = selectedWidget.size === sz;
                          return (
                            <button
                              key={sz}
                              type="button"
                              onClick={() => updateWidget(selectedWidget.id, { size: sz })}
                              className={`rounded-lg border px-2.5 py-2 text-center transition-colors ${
                                active
                                  ? 'border-[#3B82F6] bg-[#3B82F6]/15 text-white'
                                  : 'border-[#22222A] bg-[#121218] text-[#9A9AAE] hover:text-white'
                              }`}
                            >
                              <span className="block font-mono text-xs font-bold">{meta.badge}</span>
                              <span className="block text-[10px] opacity-80">{meta.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="widget-project-select"
                        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A8A9C]"
                      >
                        Proyecto vinculado
                      </label>
                      <select
                        id="widget-project-select"
                        value={selectedWidget.projectId}
                        onChange={(e) =>
                          updateWidget(selectedWidget.id, { projectId: e.target.value })
                        }
                        className="mt-1.5 w-full rounded-lg border border-[#262630] bg-[#121218] px-3 py-2 text-xs text-white focus:border-[#3B82F6] focus:outline-none"
                      >
                        <option value="all">Todos mis proyectos</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.subject})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold uppercase tracking-[0.12em] text-[#8A8A9C]">
                          Opacidad cristal
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-[#60A5FA]">
                          {Math.round(selectedWidget.opacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={65}
                        max={100}
                        value={Math.round(selectedWidget.opacity * 100)}
                        onChange={(e) =>
                          updateWidget(selectedWidget.id, {
                            opacity: Number(e.target.value) / 100,
                          })
                        }
                        className="mt-2 w-full accent-[#3B82F6]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1E1E26] pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          updateWidget(selectedWidget.id, {
                            locked: !selectedWidget.locked,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#262630] bg-[#14141A] px-3 py-1.5 text-xs font-medium text-[#D4D4E0] hover:text-white"
                      >
                        {selectedWidget.locked ? (
                          <Lock className="h-3.5 w-3.5 text-[#3B82F6]" />
                        ) : (
                          <Unlock className="h-3.5 w-3.5 text-[#8E8E9E]" />
                        )}
                        {selectedWidget.locked ? 'Fijado al escritorio' : 'Posicion libre'}
                      </button>

                      {isDesktop ? (
                        <button
                          type="button"
                          onClick={() =>
                            updateWidget(selectedWidget.id, {
                              enabled: !selectedWidget.enabled,
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#3B82F6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2563EB]"
                        >
                          {selectedWidget.enabled ? 'Ocultar del escritorio' : 'Fijar en escritorio'}
                        </button>
                      ) : (
                        <a
                          href={`/widget?id=${encodeURIComponent(selectedWidget.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#3B82F6]/40 bg-[#3B82F6]/10 px-3 py-1.5 text-xs font-semibold text-[#60A5FA] hover:bg-[#3B82F6]/20"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Vista aislada /widget
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Live Windows Desktop Preview */}
              <div className="flex flex-col lg:col-span-7">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#D4D4E0]">
                    Vista previa en tiempo real sobre escritorio
                  </span>
                  <span className="text-[11px] text-[#7E7E90]">
                    Puedes marcar tareas aqui mismo
                  </span>
                </div>
                <div
                  className="relative flex min-h-[460px] flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[#22222A] p-6"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.18), transparent 45%), radial-gradient(circle at 80% 80%, rgba(30,58,138,0.22), transparent 50%), linear-gradient(135deg, #07070A 0%, #0D1018 55%, #09090D 100%)',
                  }}
                >
                  {/* Subtle desktop grid */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-20"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
                      backgroundSize: '36px 36px',
                    }}
                  />

                  <div className="relative z-10 flex w-full items-center justify-center">
                    {selectedWidget ? (
                      <DesktopWidgetCard
                        config={selectedWidget}
                        projects={projects}
                        tasks={tasks}
                        notices={notices}
                        messages={messages}
                        currentUsername={currentUsername}
                        onToggleTaskComplete={onToggleTaskComplete}
                        onToggleLock={(id) =>
                          updateWidget(id, { locked: !selectedWidget.locked })
                        }
                        onOpenMainApp={(section, projectId) => {
                          if (section) onJumpToSection?.(section, projectId);
                          onClose();
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PC NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="mx-auto max-w-2xl space-y-5">
              <div className="rounded-2xl border border-[#22222A] bg-[#0E0E12] p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Notificaciones nativas en Windows (PC)
                    </h3>
                    <p className="mt-1 text-xs text-[#8E8E9E]">
                      Saltan en el Centro de Acciones de Windows en tiempo real cuando ocurren
                      cambios en tus proyectos. Solo para escritorio PC.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateNotificationPref('enabled', !prefs.notifications.enabled)
                    }
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      prefs.notifications.enabled ? 'bg-[#3B82F6]' : 'bg-[#262630]'
                    }`}
                  >
                    <span
                      className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                        prefs.notifications.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-5 divide-y divide-[#1C1C24] border-t border-[#1C1C24]">
                  {(
                    [
                      {
                        key: 'chat',
                        title: 'Mensajes del chat en vivo',
                        desc: 'Avisa al instante cuando un companero escribe en el chat de un proyecto.',
                      },
                      {
                        key: 'notices',
                        title: 'Nuevos avisos del tablon',
                        desc: 'Te notifica al publicarse anuncios normales, importantes o urgentes.',
                      },
                      {
                        key: 'tasks',
                        title: 'Tareas asignadas a ti',
                        desc: 'Alerta cuando alguien te asigna una nueva tarea en cualquier proyecto.',
                      },
                      {
                        key: 'mentions',
                        title: 'Menciones directas (@usuario)',
                        desc: 'Te avisa cuando te etiquetan en un mensaje o aviso.',
                      },
                      {
                        key: 'deadlines',
                        title: 'Recordatorios de entrega (< 48h)',
                        desc: 'Aviso automatico cuando una entrega o tarea vence en menos de 48 horas.',
                      },
                      {
                        key: 'invitations',
                        title: 'Invitaciones a proyectos',
                        desc: 'Te avisa cuando te invitan a unirte a un nuevo grupo de trabajo.',
                      },
                    ] as const
                  ).map((item) => {
                    const checked =
                      prefs.notifications.enabled && prefs.notifications[item.key];
                    return (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-4 py-3.5"
                      >
                        <div>
                          <p className="text-xs font-semibold text-[#EFEFF5]">{item.title}</p>
                          <p className="mt-0.5 text-[11px] text-[#848496]">{item.desc}</p>
                        </div>
                        <button
                          type="button"
                          disabled={!prefs.notifications.enabled}
                          onClick={() =>
                            updateNotificationPref(item.key, !prefs.notifications[item.key])
                          }
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-40 ${
                            checked
                              ? 'border-[#3B82F6] bg-[#3B82F6] text-white'
                              : 'border-[#343442] bg-[#121218] text-transparent'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#1E1E26] pt-4">
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2563EB]"
                  >
                    <Bell className="h-3.5 w-3.5" /> Probar notificacion ahora
                  </button>

                  {testAlertStatus === 'sent' && (
                    <span className="text-xs font-medium text-emerald-400">
                      Notificacion enviada al escritorio.
                    </span>
                  )}
                  {testAlertStatus === 'blocked' && (
                    <span className="text-xs text-amber-400">
                      Permite las notificaciones en tu navegador o abre la App de Windows.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
