import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  ArrowLeft,
  FolderGit2,
  FileSpreadsheet,
  Sparkles,
  Upload,
  FolderArchive,
  Folder,
  FileText,
  Presentation,
  CheckCircle2,
  HardDrive,
  Lock,
} from 'lucide-react';

interface ChikiOnboardingModalProps {
  onComplete: () => void;
}

const TOTAL_CARDS = 6;

export const ChikiOnboardingModal: React.FC<ChikiOnboardingModalProps> = ({ onComplete }) => {
  const [step, setStep] = useState<number>(0);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const holdTimerRef = useRef<number | null>(null);
  const completedRef = useRef<boolean>(false);

  useEffect(() => {
    if (holdProgress >= 100 && !completedRef.current) {
      completedRef.current = true;
      if (holdTimerRef.current) {
        window.clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      onComplete();
    }
  }, [holdProgress, onComplete]);

  const startHold = () => {
    setIsHolding(true);
    if (holdTimerRef.current) window.clearInterval(holdTimerRef.current);
    holdTimerRef.current = window.setInterval(() => {
      setHoldProgress((prev) => {
        if (prev >= 100) return 100;
        return Math.min(100, prev + 8);
      });
    }, 40);
  };

  const stopHold = () => {
    setIsHolding(false);
    if (holdTimerRef.current) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress((prev) => (prev >= 100 ? 100 : 0));
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) window.clearInterval(holdTimerRef.current);
    };
  }, []);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (holdProgress / 100) * circumference;

  const stepLabels = [
    '01. EL FIN DE LOS CORREOS SUELTOS',
    '02. SUBIDA DE ARCHIVOS Y CARPETAS',
    '03. PAQUETE OFFICE Y GOOGLE DOCS',
    '04. EXTRACCIÓN .ZIP ENTRE PORTÁTILES',
    '05. TAREAS, AVISOS, IA Y CUOTA GRATIS',
    '06. DESBLOQUEO DEL PANEL DE PROYECTOS',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bento-grid-bg p-4 overflow-y-auto">
      {/* Subtle Architectural CAD Reticle Lines */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 52, repeat: Infinity, ease: 'linear' }}
          className="w-[440px] h-[440px] sm:w-[680px] sm:h-[680px] rounded-full border border-dashed border-[#272732]"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 72, repeat: Infinity, ease: 'linear' }}
          className="absolute w-[640px] h-[640px] sm:w-[920px] sm:h-[920px] rounded-full border border-[#191922]"
        />
      </div>

      {/* Architectural 1px Bento Frame */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-2xl border border-[#282834] bg-[#0E0E12] flex flex-col justify-between min-h-[580px]"
      >
        {/* Top 1px Hairline Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#22222A] bg-[#121217]">
          <div className="flex items-center gap-3">
            <span className="font-display font-bold text-xs tracking-tight text-white">
              CHIKIHUB
            </span>
            <span className="text-[#3F3F4E]">·</span>
            <span className="font-mono text-[11px] text-[#60A5FA] tabular-nums">
              0{step + 1} / 0{TOTAL_CARDS}
            </span>
            <span className="hidden sm:inline font-mono text-[11px] text-[#8E8E9E]">
              · {stepLabels[step]}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: TOTAL_CARDS }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setStep(idx)}
                aria-label={`Tarjeta ${idx + 1}`}
                className={`h-1.5 transition-all duration-200 cursor-pointer ${
                  step === idx ? 'w-7 bg-white' : 'w-2.5 bg-[#2A2A35] hover:bg-[#454556]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Animated Card Content Area */}
        <div className="relative z-10 my-auto p-6 sm:p-8">
          <AnimatePresence mode="wait">
            {/* ==================== CARD 01 / 06: +100 CORREOS AHORRADOS ==================== */}
            {step === 0 && (
              <motion.div
                key="card-0"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center text-center"
              >
                <div className="mb-7 relative w-40 h-40 flex items-center justify-center">
                  <motion.svg
                    animate={{ rotate: 360 }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                    className="w-36 h-36 text-white"
                    viewBox="0 0 100 100"
                    fill="none"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      stroke="#2E2E3A"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="34"
                      stroke="#3B82F6"
                      strokeOpacity="0.75"
                      strokeWidth="2"
                      strokeDasharray="18 8"
                    />
                  </motion.svg>

                  <motion.div
                    animate={{ scale: [0.95, 1.05, 0.95] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute w-16 h-16 bg-white text-[#09090B] flex flex-col items-center justify-center font-mono font-bold text-xs tracking-wider shadow-xl"
                  >
                    <span>CHIKI</span>
                    <span className="text-[9px] text-[#3B82F6] font-bold">HUB</span>
                  </motion.div>

                  {/* Floating Rectangular Format Blocks */}
                  <motion.span
                    animate={{ y: [-6, 6, -6], x: [-2, 2, -2] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute -top-1 -left-4 px-2 py-0.5 bg-[#14141C] border border-[#3B82F6] text-[#60A5FA] text-[10px] font-mono font-bold"
                  >
                    .DOCX
                  </motion.span>
                  <motion.span
                    animate={{ y: [6, -6, 6], x: [2, -2, 2] }}
                    transition={{ duration: 2.9, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute -bottom-1 -right-4 px-2 py-0.5 bg-[#14141C] border border-emerald-500 text-emerald-400 text-[10px] font-mono font-bold"
                  >
                    .XLSX
                  </motion.span>
                  <motion.span
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute top-2 -right-6 px-2 py-0.5 bg-[#14141C] border border-amber-400 text-amber-300 text-[10px] font-mono font-bold"
                  >
                    .PPTX
                  </motion.span>
                  <motion.span
                    animate={{ y: [4, -4, 4] }}
                    transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute bottom-2 -left-6 px-2 py-0.5 bg-[#14141C] border border-white/50 text-white text-[10px] font-mono font-bold"
                  >
                    .ZIP
                  </motion.span>
                </div>

                <p className="text-xs font-mono text-[#8E8E9E] mb-2">
                  PLATAFORMA CREADA POR <span className="text-white font-semibold">CHIKI</span> PARA AHORRARTE
                </p>

                <motion.h1
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.08, duration: 0.3 }}
                  className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-4"
                >
                  +100 correos
                </motion.h1>

                <p className="text-sm text-[#9E9EAE] max-w-md leading-relaxed">
                  Olvídate de reenviar <code className="text-white font-mono">Memoria_Final_v8_definitiva.docx</code> por correo o WhatsApp. Todo el grupo trabaja sincronizado desde cualquier portátil del instituto o de casa.
                </p>
              </motion.div>
            )}

            {/* ==================== CARD 02 / 06: SUBIDA DE ARCHIVOS Y CARPETAS ANIDADAS ==================== */}
            {step === 1 && (
              <motion.div
                key="card-1"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="text-xs font-mono text-[#60A5FA] mb-1">
                  02 · ESTRUCTURA DE PROYECTO SIN LÍMITE DE FORMATOS
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2">
                  Sube archivos sueltos o carpetas completas
                </h2>
                <p className="text-xs sm:text-sm text-[#8E8E9E] mb-5 leading-relaxed">
                  Arrastra o selecciona cualquier directorio de tu ordenador: ChikiHub recrea automáticamente todas las subcarpetas y conserva la extensión original de cada archivo.
                </p>

                {/* Animated Bento Directory Tree Simulation */}
                <div className="border border-[#24242E] bg-[#09090B] p-4 space-y-2.5">
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#22222A] text-[11px] font-mono text-[#8E8E9E]">
                    <span className="flex items-center gap-2 text-white">
                      <Folder className="w-3.5 h-3.5 text-[#60A5FA]" />
                      <span>PROYECTO_INFORMATICA / RAÍZ</span>
                    </span>
                    <motion.span
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                      className="text-emerald-400"
                    >
                      SINCRONIZADO
                    </motion.span>
                  </div>

                  {[
                    {
                      folder: '01_Memoria_Tecnica',
                      file: 'Memoria_Servidor_Linux.docx',
                      ext: '.DOCX',
                      size: '248 KB',
                      color: 'text-[#60A5FA] border-[#3B82F6]/50',
                    },
                    {
                      folder: '02_Topologia_y_VLANs',
                      file: 'Tabla_Subredes_VLSM.xlsx',
                      ext: '.XLSX',
                      size: '94 KB',
                      color: 'text-emerald-400 border-emerald-500/50',
                    },
                    {
                      folder: '02_Topologia_y_VLANs',
                      file: 'Red_Departamental_Cisco.pkt',
                      ext: '.PKT',
                      size: '612 KB',
                      color: 'text-amber-300 border-amber-400/50',
                    },
                  ].map((item, idx) => (
                    <motion.div
                      key={item.file}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.12, duration: 0.28 }}
                      className="p-3 border border-[#22222A] bg-[#0E0E12] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Upload className="w-4 h-4 text-[#60A5FA] shrink-0" />
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-[#7E7E8E] truncate">
                            /{item.folder}/
                          </p>
                          <p className="text-xs font-semibold text-white truncate">{item.file}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] text-[#8E8E9E] tabular-nums">
                          {item.size}
                        </span>
                        <span
                          className={`px-2 py-0.5 border bg-[#14141C] font-mono text-[10px] font-bold ${item.color}`}
                        >
                          {item.ext}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ==================== CARD 03 / 06: PAQUETE OFFICE & GOOGLE DOCS ==================== */}
            {step === 2 && (
              <motion.div
                key="card-2"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="text-xs font-mono text-[#60A5FA] mb-1">
                  03 · COMPATIBILIDAD TOTAL CON PAQUETE OFFICE
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2">
                  Edición real en Google Docs, Sheets y Slides
                </h2>
                <p className="text-xs sm:text-sm text-[#8E8E9E] mb-5 leading-relaxed">
                  Aquí no editas texto plano: al abrir un archivo de Word, Excel o PowerPoint se convierte y abre directamente en los editores oficiales de Google. Y si subes un binario (<code className="text-white font-mono">.PKT</code>, <code className="text-white font-mono">.ISO</code>), la web evita abrir editores incompatibles.
                </p>

                {/* Animated Office -> Google Workspace Conversion Pipeline */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#24242E] border border-[#24242E]">
                  {[
                    {
                      icon: <FileText className="w-5 h-5 text-[#60A5FA]" />,
                      from: '.DOCX / .ODT',
                      to: 'Google Docs',
                      desc: 'Memorias técnicas, anexos y documentación del grupo.',
                      badge: 'EDITOR DOCS',
                    },
                    {
                      icon: <FileSpreadsheet className="w-5 h-5 text-emerald-400" />,
                      from: '.XLSX / .ODS / .CSV',
                      to: 'Google Sheets',
                      desc: 'Tablas de subredes VLSM, presupuestos e inventarios.',
                      badge: 'EDITOR SHEETS',
                    },
                    {
                      icon: <Presentation className="w-5 h-5 text-amber-400" />,
                      from: '.PPTX / .ODP',
                      to: 'Google Slides',
                      desc: 'Presentaciones para la exposición en clase.',
                      badge: 'EDITOR SLIDES',
                    },
                  ].map((item, idx) => (
                    <motion.div
                      key={item.to}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-[#0E0E12] p-4 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          {item.icon}
                          <motion.span
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, delay: idx * 0.3 }}
                            className="font-mono text-[10px] text-white bg-[#181822] border border-[#2E2E3A] px-1.5 py-0.5"
                          >
                            {item.badge}
                          </motion.span>
                        </div>
                        <p className="font-mono text-xs text-[#60A5FA] font-bold mb-1">
                          {item.from}
                        </p>
                        <h3 className="font-display font-bold text-base text-white mb-2">
                          → {item.to}
                        </h3>
                        <p className="text-xs text-[#8E8E9E] leading-relaxed">{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ==================== CARD 04 / 06: EXTRACCIÓN .ZIP EN 1 CLIC ==================== */}
            {step === 3 && (
              <motion.div
                key="card-3"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="text-xs font-mono text-emerald-400 mb-1">
                  04 · EXTRACCIÓN DIRECTA Y EMPAQUETADO .ZIP
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2">
                  Extrae cualquier archivo o carpeta entera en .ZIP
                </h2>
                <p className="text-xs sm:text-sm text-[#8E8E9E] mb-6 leading-relaxed">
                  ¿Cambias de ordenador en el taller o tienes que entregar el proyecto al profesor? Extrae cualquier archivo suelto con su última versión de Google Drive o descarga una carpeta completa comprimida en <code className="text-white font-mono">.ZIP</code>.
                </p>

                {/* Animated ZIP Compression Visualizer */}
                <div className="border border-[#24242E] bg-[#09090B] p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                    <div className="sm:col-span-7 space-y-2">
                      {[
                        '01_Memoria_Tecnica/Memoria_Principal.docx',
                        '02_Topologia/Tabla_Subredes_VLSM.xlsx',
                        '02_Topologia/Aula_Cisco_PacketTracer.pkt',
                      ].map((pathStr, i) => (
                        <motion.div
                          key={pathStr}
                          animate={{ x: [0, 6, 0] }}
                          transition={{
                            duration: 2.2,
                            repeat: Infinity,
                            delay: i * 0.25,
                            ease: 'easeInOut',
                          }}
                          className="px-3 py-2 border border-[#22222A] bg-[#0E0E12] flex items-center justify-between text-xs font-mono text-[#D4D4DC]"
                        >
                          <span className="truncate">{pathStr}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-2" />
                        </motion.div>
                      ))}
                    </div>

                    <div className="sm:col-span-5 flex flex-col items-center justify-center p-4 border border-[#3B82F6] bg-[#3B82F6]/10 text-center">
                      <motion.div
                        animate={{ scale: [0.94, 1.06, 0.94] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-12 h-12 bg-white text-[#09090B] flex items-center justify-center mb-2.5"
                      >
                        <FolderArchive className="w-6 h-6" />
                      </motion.div>
                      <span className="font-mono text-xs font-bold text-white">
                        PROYECTO_COMPLETO.ZIP
                      </span>
                      <span className="font-mono text-[10px] text-[#60A5FA] mt-1">
                        COMPRESIÓN EN 1 CLIC
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ==================== CARD 05 / 06: 6 PESTAÑAS BENTO, IA Y CUOTA 100% GRATIS ==================== */}
            {step === 4 && (
              <motion.div
                key="card-4"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="text-xs font-mono text-amber-400 mb-1">
                  05 · ORGANIZACIÓN POR PESTAÑAS Y CUOTA 100% GRATUITA
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-4">
                  Tareas, Avisos, IA Técnica y Alojamiento Gratis
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#24242E] border border-[#24242E] text-left">
                  {[
                    {
                      icon: <Sparkles className="w-4 h-4 text-[#60A5FA] shrink-0" />,
                      code: 'IA PROYECTO',
                      title: 'IA Exclusiva del Trabajo',
                      desc: 'Conoce vuestras carpetas, archivos y tareas. Bloquea cualquier pregunta ajena al proyecto.',
                    },
                    {
                      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
                      code: 'TAREAS & AVISOS',
                      title: 'Control de Entregas',
                      desc: 'Asigna responsables (@usuario), filtra tareas pendientes y publica anuncios urgentes en el tablón.',
                    },
                    {
                      icon: <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />,
                      code: '50 MB / PROY',
                      title: 'Cuota Calibrada 100% Gratis',
                      desc: 'Hasta 5 proyectos activos y 50 MB por proyecto para no pagar nunca servidor ni base de datos.',
                    },
                    {
                      icon: <Lock className="w-4 h-4 text-white shrink-0" />,
                      code: 'ACCESO SEGURO',
                      title: 'Permisos por Compañero',
                      desc: 'Cada miembro entra con su cuenta y podéis proteger proyectos con contraseña de equipo.',
                    },
                  ].map((item, idx) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.07 }}
                      className="p-4 bg-[#0E0E12] flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 font-display font-semibold text-sm text-white">
                          {item.icon}
                          <span>{item.title}</span>
                        </div>
                        <span className="font-mono text-[10px] text-[#60A5FA] tabular-nums">
                          {item.code}
                        </span>
                      </div>
                      <p className="text-xs text-[#8E8E9E] leading-relaxed">{item.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ==================== CARD 06 / 06: DESBLOQUEO INTERACTIVO ==================== */}
            {step === 5 && (
              <motion.div
                key="card-5"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-12 h-12 border border-[#2E2E3A] bg-[#14141C] flex items-center justify-center text-white mb-4">
                  <FolderGit2 className="w-6 h-6 text-[#60A5FA]" />
                </div>

                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-2">
                  Quiero tomar el control de nuestros proyectos.
                </h2>
                <p className="text-xs sm:text-sm text-[#8E8E9E] max-w-sm leading-relaxed mb-7">
                  Mantén pulsado el círculo central para desbloquear el panel e iniciar sesión o crear tu cuenta del grupo.
                </p>

                {/* Interactive Press & Hold Circular Mechanism */}
                <div className="relative flex items-center justify-center my-1">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r={radius}
                      stroke="#22222A"
                      strokeWidth="3"
                      fill="none"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r={radius}
                      stroke="#FFFFFF"
                      strokeWidth="4"
                      strokeLinecap="square"
                      fill="none"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      className="transition-all duration-75"
                    />
                  </svg>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onMouseDown={startHold}
                    onMouseUp={stopHold}
                    onMouseLeave={stopHold}
                    onTouchStart={startHold}
                    onTouchEnd={stopHold}
                    onDoubleClick={onComplete}
                    aria-label="Mantener pulsado para ir a iniciar sesión"
                    className={`absolute w-16 h-16 rounded-full flex items-center justify-center cursor-pointer select-none transition-colors ${
                      isHolding
                        ? 'bg-[#3B82F6] text-white'
                        : 'bg-white hover:bg-zinc-200 text-[#09090B]'
                    }`}
                  >
                    <ArrowRight className="w-6 h-6 stroke-[2.5]" />
                  </motion.button>
                </div>

                <span className="mt-3 font-mono text-xs text-[#9E9EAE] tabular-nums">
                  {holdProgress > 0
                    ? `DESBLOQUEANDO PANEL... ${Math.min(100, holdProgress)}%`
                    : 'MANTÉN PULSADO EL CÍRCULO PARA ENTRAR'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom 1px Hairline Action Bar */}
        <div className="p-4 border-t border-[#22222A] bg-[#121217] flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="h-11 px-4 border border-[#2C2C38] bg-[#0E0E12] hover:bg-[#191922] text-[#D4D4DC] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>
          )}

          {step < TOTAL_CARDS - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 h-11 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs tracking-wide uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Siguiente tarjeta ({step + 2}/{TOTAL_CARDS})</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onComplete}
              className="flex-1 h-11 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Entrar directamente a Iniciar Sesión / Crear Cuenta</span>
              <ArrowRight className="w-4 h-4 stroke-[2.2]" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
