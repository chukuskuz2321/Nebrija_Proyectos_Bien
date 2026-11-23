import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Download,
  LayoutGrid,
  Monitor,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { WINDOWS_APP_VERSION } from '../services/desktopBridge';

interface WindowsInstallerPreviewProps {
  downloadUrl?: string;
  onLaunchApp?: () => void;
}

const INSTALL_STAGES = [
  { pct: 16, text: 'Verificando entorno WebView2 de Windows...' },
  { pct: 38, text: 'Instalando ejecutable en %LOCALAPPDATA%\\ProyectosNebrija...' },
  { pct: 64, text: 'Registrando AppUserModelID para Centro de Acciones...' },
  { pct: 86, text: 'Creando accesos directos y motor de widgets de escritorio...' },
  { pct: 100, text: 'Proyectos Nebrija App instalada correctamente.' },
];

export const WindowsInstallerPreview: React.FC<WindowsInstallerPreviewProps> = ({
  downloadUrl,
  onLaunchApp,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [autostart, setAutostart] = useState(true);
  const [desktopShortcut, setDesktopShortcut] = useState(true);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (step !== 4) {
      setStageIndex(0);
      return;
    }
    if (stageIndex >= INSTALL_STAGES.length - 1) return;
    const timer = window.setTimeout(() => {
      setStageIndex((prev) => Math.min(INSTALL_STAGES.length - 1, prev + 1));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [step, stageIndex]);

  const currentStage = INSTALL_STAGES[stageIndex];
  const isInstallDone = step === 4 && stageIndex === INSTALL_STAGES.length - 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#22222A] bg-[#09090B] shadow-2xl">
      {/* Custom Frameless Installer Title Bar */}
      <div className="flex items-center justify-between border-b border-[#1E1E26] bg-[#0E0E12] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <BrandLogo size={20} />
          <span className="text-xs font-semibold tracking-wide text-[#E6E6EE]">
            Instalador · Proyectos Nebrija App
          </span>
          <span className="font-mono text-[10px] text-[#7A7A8C]">v{WINDOWS_APP_VERSION}</span>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((num) => (
            <span
              key={num}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step === num
                  ? 'w-5 bg-[#3B82F6]'
                  : step > num
                    ? 'w-2 bg-emerald-400'
                    : 'w-2 bg-[#262630]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Animated Wizard Canvas */}
      <div className="relative min-h-[370px] px-5 py-6 sm:px-8">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24 }}
              className="flex min-h-[322px] flex-col items-center justify-center text-center"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35 }}
                className="relative mb-5"
              >
                <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-[#3B82F6]/15 blur-xl" />
                <BrandLogo size={72} className="relative" />
              </motion.div>

              <h4 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                Proyectos Nebrija App para Windows
              </h4>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-[#9C9CAF] sm:text-sm">
                Tu espacio web de proyectos en formato aplicacion nativa ligera (~15 MB), siempre
                sincronizado en tiempo real y con widgets personalizables en tu escritorio.
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-[11px] text-[#7E7E90]">
                <span className="flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5 text-[#3B82F6]" /> Windows 10 / 11
                </span>
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-emerald-400" /> Actualizacion automatica
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#60A5FA]" /> 100% gratuito
                </span>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[#3B82F6] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#2563EB]"
              >
                Comenzar instalacion
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.24 }}
              className="flex min-h-[322px] flex-col justify-between"
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3B82F6]">
                  Paso 2 de 4 · Que incluye
                </p>
                <h4 className="mt-1 text-lg font-semibold text-white">
                  Literalmente tu web, potenciada en escritorio
                </h4>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-[#22222A] bg-[#0E0E12] p-4">
                    <RefreshCw className="h-5 w-5 text-[#3B82F6]" />
                    <h5 className="mt-3 text-xs font-semibold text-white">
                      Web en tiempo real
                    </h5>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[#9494A6]">
                      Carga directamente tu portal de Vercel. Chat, archivos y tareas cambian al
                      instante sin recargar ni reinstalar nada.
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#22222A] bg-[#0E0E12] p-4">
                    <LayoutGrid className="h-5 w-5 text-[#60A5FA]" />
                    <h5 className="mt-3 text-xs font-semibold text-white">
                      Widgets estilo iOS
                    </h5>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[#9494A6]">
                      Fija entregas, tareas marcables, chat o avisos en el escritorio en formato
                      2x2, 4x2 o 4x4 con opacidad ajustable.
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#22222A] bg-[#0E0E12] p-4">
                    <Bell className="h-5 w-5 text-emerald-400" />
                    <h5 className="mt-3 text-xs font-semibold text-white">
                      Avisos nativos en PC
                    </h5>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[#9494A6]">
                      Notificaciones del Centro de Acciones de Windows cuando te mencionan, llega
                      un mensaje o vence una entrega.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-[#1E1E26] pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#262630] px-3.5 py-2 text-xs font-medium text-[#B4B4C4] transition-colors hover:bg-[#14141A] hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Atras
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2563EB]"
                >
                  Continuar <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.24 }}
              className="flex min-h-[322px] flex-col justify-between"
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3B82F6]">
                  Paso 3 de 4 · Terminos y preferencias
                </p>
                <h4 className="mt-1 text-lg font-semibold text-white">
                  Condiciones de uso y opciones de instalacion
                </h4>

                <div className="mt-3 max-h-[120px] overflow-y-auto rounded-xl border border-[#22222A] bg-[#0E0E12] p-3.5 text-[11px] leading-relaxed text-[#A4A4B6]">
                  <p className="font-semibold text-[#E4E4EE]">
                    Licencia de uso — Proyectos Nebrija App (Edicion Windows)
                  </p>
                  <p className="mt-1.5">
                    1. Esta aplicacion de escritorio se conecta de forma segura mediante HTTPS a tu
                    entorno oficial en nebrija-proyectos-bien.vercel.app y Firebase Authentication.
                  </p>
                  <p className="mt-1">
                    2. La instalacion se realiza exclusivamente en la carpeta local del usuario
                    (%LOCALAPPDATA%\ProyectosNebrija) sin modificar archivos del sistema ni
                    requerir permisos de administrador.
                  </p>
                  <p className="mt-1">
                    3. Puedes desinstalarla en cualquier momento desde Aplicaciones instaladas de
                    Windows y desactivar los widgets o avisos desde tu cuenta.
                  </p>
                </div>

                <label className="mt-3.5 flex cursor-pointer items-center gap-2.5 text-xs text-[#E4E4EE]">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="h-4 w-4 rounded border-[#333340] bg-[#121218] accent-[#3B82F6]"
                  />
                  <span>Acepto los terminos y condiciones de Proyectos Nebrija App</span>
                </label>

                <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setAutostart((v) => !v)}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                      autostart
                        ? 'border-[#3B82F6]/50 bg-[#3B82F6]/10'
                        : 'border-[#22222A] bg-[#0E0E12]'
                    }`}
                  >
                    <span className="text-xs font-medium text-[#E4E4EE]">
                      Iniciar con Windows
                    </span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded ${
                        autostart ? 'bg-[#3B82F6] text-white' : 'border border-[#3A3A48]'
                      }`}
                    >
                      {autostart && <Check className="h-3 w-3" />}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDesktopShortcut((v) => !v)}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                      desktopShortcut
                        ? 'border-[#3B82F6]/50 bg-[#3B82F6]/10'
                        : 'border-[#22222A] bg-[#0E0E12]'
                    }`}
                  >
                    <span className="text-xs font-medium text-[#E4E4EE]">
                      Acceso directo en escritorio
                    </span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded ${
                        desktopShortcut ? 'bg-[#3B82F6] text-white' : 'border border-[#3A3A48]'
                      }`}
                    >
                      {desktopShortcut && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-[#1E1E26] pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#262630] px-3.5 py-2 text-xs font-medium text-[#B4B4C4] transition-colors hover:bg-[#14141A] hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Atras
                </button>
                <button
                  type="button"
                  disabled={!acceptedTerms}
                  onClick={() => setStep(4)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Instalar ahora
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="flex min-h-[322px] flex-col items-center justify-center text-center"
            >
              {isInstallDone ? (
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                >
                  <CheckCircle2 className="h-7 w-7" />
                </motion.div>
              ) : (
                <div className="mb-4">
                  <BrandLogo size={54} />
                </div>
              )}

              <h4 className="text-lg font-semibold text-white">
                {isInstallDone ? 'Instalacion completada' : 'Instalando Proyectos Nebrija App...'}
              </h4>
              <p className="mt-1.5 font-mono text-xs text-[#9C9CAF]">{currentStage.text}</p>

              <div className="mt-5 w-full max-w-md">
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-[#7E7E90]">Progreso</span>
                  <span className="font-mono font-semibold tabular-nums text-[#60A5FA]">
                    {currentStage.pct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#1C1C24]">
                  <motion.div
                    className={`h-full ${isInstallDone ? 'bg-emerald-400' : 'bg-[#3B82F6]'}`}
                    animate={{ width: `${currentStage.pct}%` }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
              </div>

              {isInstallDone && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                  {downloadUrl ? (
                    <a
                      href={downloadUrl}
                      download
                      className="inline-flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2563EB]"
                    >
                      <Download className="h-3.5 w-3.5" /> Descargar instalador .exe real
                    </a>
                  ) : (
                    onLaunchApp && (
                      <button
                        type="button"
                        onClick={onLaunchApp}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2563EB]"
                      >
                        Abrir espacio de trabajo
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAcceptedTerms(false);
                      setStep(1);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#262630] px-3.5 py-2 text-xs font-medium text-[#B4B4C4] transition-colors hover:bg-[#14141A] hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Repetir demo
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
