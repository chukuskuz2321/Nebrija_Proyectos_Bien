import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingDown, Users, HardDrive, CheckCircle2, FileText } from 'lucide-react';
import {
  DocumentItem,
  TaskItem,
  MAX_PROJECT_STORAGE_BYTES,
} from '../types';
import { formatBytes } from '../services/googleWorkspace';

interface ProjectStatsTabProps {
  projectName: string;
  authorizedUsernames: string[];
  tasks: TaskItem[];
  documents: DocumentItem[];
  sectionPrefix?: string;
}

interface BurndownDayPoint {
  dateKey: string;
  label: string;
  fullDate: string;
  remaining: number;
  completedOnOrBefore: number;
  totalCreatedByDay: number;
}

interface MemberContribution {
  username: string;
  completedTasks: number;
  uploadedFiles: number;
  totalScore: number;
}

export const ProjectStatsTab: React.FC<ProjectStatsTabProps> = ({
  projectName,
  authorizedUsernames,
  tasks,
  documents,
  sectionPrefix = '06',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // 1. Burndown curve over the last 7 days (client-side computation from createdAt & completedAt)
  const burndownPoints = useMemo<BurndownDayPoint[]>(() => {
    const today = new Date();
    const days: BurndownDayPoint[] = [];

    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
      const endOfDayMs = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        23,
        59,
        59,
        999
      ).getTime();

      let totalCreated = 0;
      let completedByDay = 0;

      for (const t of tasks) {
        const createdMs = new Date(t.createdAt).getTime();
        // Treat tasks with invalid/missing createdAt as already existing
        const existed = Number.isNaN(createdMs) ? true : createdMs <= endOfDayMs;
        if (!existed) continue;
        totalCreated += 1;

        if (t.status === 'completed') {
          const completedIso = t.completedAt || t.updatedAt || t.createdAt;
          const completedMs = new Date(completedIso).getTime();
          if (!Number.isNaN(completedMs) && completedMs <= endOfDayMs) {
            completedByDay += 1;
          }
        }
      }

      const remaining = Math.max(0, totalCreated - completedByDay);
      const label = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit' });
      const fullDate = d.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
      });

      days.push({
        dateKey: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
        label: label.replace('.', ''),
        fullDate,
        remaining,
        completedOnOrBefore: completedByDay,
        totalCreatedByDay: totalCreated,
      });
    }

    return days;
  }, [tasks]);

  // Build smooth SVG cubic Bezier path for Burndown Area Chart
  const chartGeometry = useMemo(() => {
    const width = 640;
    const height = 220;
    const padLeft = 38;
    const padRight = 22;
    const padTop = 20;
    const padBottom = 34;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const maxVal = Math.max(4, ...burndownPoints.map((p) => p.remaining));
    const stepX = burndownPoints.length > 1 ? plotW / (burndownPoints.length - 1) : 0;

    const coords = burndownPoints.map((p, idx) => ({
      ...p,
      x: padLeft + idx * stepX,
      y: padTop + plotH - (p.remaining / maxVal) * plotH,
    }));

    let linePath = '';
    if (coords.length > 0) {
      linePath = `M ${coords[0].x} ${coords[0].y}`;
      for (let i = 0; i < coords.length - 1; i++) {
        const curr = coords[i];
        const next = coords[i + 1];
        const cpX = (curr.x + next.x) / 2;
        linePath += ` C ${cpX} ${curr.y}, ${cpX} ${next.y}, ${next.x} ${next.y}`;
      }
    }

    const baseY = padTop + plotH;
    const areaPath =
      coords.length > 0
        ? `${linePath} L ${coords[coords.length - 1].x} ${baseY} L ${coords[0].x} ${baseY} Z`
        : '';

    const yTicks = [0, Math.round(maxVal / 2), maxVal];

    return { width, height, padLeft, padTop, plotH, baseY, maxVal, coords, linePath, areaPath, yTicks };
  }, [burndownPoints]);

  // 2. Contribution per member (completed tasks + uploaded files)
  const contributions = useMemo<MemberContribution[]>(() => {
    const map = new Map<string, MemberContribution>();
    const ensure = (rawName: string) => {
      const clean = (rawName || 'equipo').toLowerCase().trim();
      if (!map.has(clean)) {
        map.set(clean, {
          username: clean,
          completedTasks: 0,
          uploadedFiles: 0,
          totalScore: 0,
        });
      }
      return map.get(clean)!;
    };

    authorizedUsernames.forEach((u) => ensure(u));

    tasks.forEach((t) => {
      if (t.status === 'completed') {
        const entry = ensure(t.assigneeUsername);
        entry.completedTasks += 1;
        entry.totalScore += 1;
      }
    });

    documents.forEach((d) => {
      const uploader = d.lastModifiedBy || d.assigneeUsername || 'equipo';
      const entry = ensure(uploader);
      entry.uploadedFiles += 1;
      entry.totalScore += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.totalScore - a.totalScore);
  }, [authorizedUsernames, tasks, documents]);

  const maxMemberScore = useMemo(
    () => Math.max(1, ...contributions.map((c) => c.totalScore)),
    [contributions]
  );

  // 3. Storage usage against 50 MB limit
  const usedBytes = useMemo(
    () => documents.reduce((acc, doc) => acc + (doc.sizeBytes || 0), 0),
    [documents]
  );
  const usedPct = Math.min(100, Math.round((usedBytes / MAX_PROJECT_STORAGE_BYTES) * 100));
  const exactPct = Math.min(100, (usedBytes / MAX_PROJECT_STORAGE_BYTES) * 100);
  const remainingBytes = Math.max(0, MAX_PROJECT_STORAGE_BYTES - usedBytes);

  const storageTone =
    usedPct >= 90
      ? { stroke: '#EF4444', text: 'text-rose-400', label: 'CRÍTICO', bar: 'bg-rose-500' }
      : usedPct >= 75
        ? { stroke: '#F59E0B', text: 'text-amber-400', label: 'ATENCIÓN', bar: 'bg-amber-400' }
        : { stroke: '#3B82F6', text: 'text-[#60A5FA]', label: 'ÓPTIMO', bar: 'bg-[#3B82F6]' };

  const completedTasksTotal = tasks.filter((t) => t.status === 'completed').length;
  const pendingTasksNow = tasks.length - completedTasksTotal;
  const activePoint = hoveredIdx !== null ? chartGeometry.coords[hoveredIdx] : chartGeometry.coords[chartGeometry.coords.length - 1];

  // Gauge SVG math
  const gaugeRadius = 56;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeDashOffset = gaugeCircumference * (1 - exactPct / 100);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="border border-[#22222A] bg-[#0E0E12] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#60A5FA] block mb-1">
            {sectionPrefix} · ANALÍTICA Y RITMO DEL EQUIPO
          </span>
          <h2 className="font-display text-2xl font-bold text-white">
            Estadísticas y Curva de Ritmo de «{projectName}»
          </h2>
          <p className="text-xs sm:text-sm text-[#8E8E9E] mt-1">
            Evolución real de tareas pendientes durante los últimos 7 días, aportación individual y
            consumo sobre la cuota de 50 MB.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px bg-[#22222A] border border-[#22222A] shrink-0">
          <div className="bg-[#111116] px-4 py-2.5">
            <span className="font-mono text-[10px] text-[#8E8E9E] block">PENDIENTES</span>
            <span className="font-display font-bold text-lg text-white tabular-nums">
              {pendingTasksNow}
            </span>
          </div>
          <div className="bg-[#111116] px-4 py-2.5">
            <span className="font-mono text-[10px] text-emerald-400 block">COMPLETADAS</span>
            <span className="font-display font-bold text-lg text-white tabular-nums">
              {completedTasksTotal}
            </span>
          </div>
          <div className="bg-[#111116] px-4 py-2.5">
            <span className="font-mono text-[10px] text-[#60A5FA] block">ARCHIVOS</span>
            <span className="font-display font-bold text-lg text-white tabular-nums">
              {documents.length}
            </span>
          </div>
        </div>
      </div>

      {/* Row 1: Burndown Smooth Area Chart (Full-Width Focus Panel) */}
      <div className="border border-[#22222A] bg-[#0E0E12] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#22222A]">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 border border-[#3B82F6]/40 bg-[#3B82F6]/10 flex items-center justify-center text-[#60A5FA] shrink-0">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-white">
                Curva de Ritmo (Burndown · Últimos 7 días)
              </h3>
              <p className="text-xs text-[#8E8E9E]">
                Tareas que quedaban pendientes al final de cada jornada (calculado con fechas de creación y completado).
              </p>
            </div>
          </div>

          {activePoint && (
            <div className="border border-[#2A2A35] bg-[#111116] px-3.5 py-2 font-mono text-xs shrink-0 self-start sm:self-auto">
              <span className="text-[#8E8E9E] uppercase block text-[10px]">
                {activePoint.fullDate}
              </span>
              <span className="text-white font-bold tabular-nums">
                {activePoint.remaining} pendiente{activePoint.remaining === 1 ? '' : 's'}
              </span>
              <span className="text-[#7E7E8E] ml-2 tabular-nums">
                ({activePoint.completedOnOrBefore} hechas)
              </span>
            </div>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
            className="w-full min-w-[420px] h-auto select-none"
            role="img"
            aria-label="Gráfica de área suave de tareas pendientes en los últimos 7 días"
          >
            <defs>
              <linearGradient id="burndownAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines & Y axis labels */}
            {chartGeometry.yTicks.map((tick) => {
              const y =
                chartGeometry.padTop +
                chartGeometry.plotH -
                (tick / chartGeometry.maxVal) * chartGeometry.plotH;
              return (
                <g key={tick}>
                  <line
                    x1={chartGeometry.padLeft}
                    x2={chartGeometry.width - 22}
                    y1={y}
                    y2={y}
                    stroke="#1E1E28"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={chartGeometry.padLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-[#7E7E8E] font-mono text-[10px]"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Animated Smooth Area Fill */}
            {chartGeometry.areaPath && (
              <motion.path
                d={chartGeometry.areaPath}
                fill="url(#burndownAreaGrad)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            )}

            {/* Animated Smooth Line */}
            {chartGeometry.linePath && (
              <motion.path
                d={chartGeometry.linePath}
                fill="none"
                stroke="#60A5FA"
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            )}

            {/* Interactive Data Points + X-Axis Labels */}
            {chartGeometry.coords.map((pt, idx) => {
              const isSelected = hoveredIdx === idx || (hoveredIdx === null && idx === chartGeometry.coords.length - 1);
              return (
                <g
                  key={pt.dateKey}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => setHoveredIdx(idx)}
                >
                  {isSelected && (
                    <line
                      x1={pt.x}
                      x2={pt.x}
                      y1={chartGeometry.padTop}
                      y2={chartGeometry.baseY}
                      stroke="#3B82F6"
                      strokeOpacity="0.35"
                      strokeDasharray="2 3"
                    />
                  )}
                  <motion.circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 5.5 : 3.8}
                    fill={isSelected ? '#FFFFFF' : '#0E0E12'}
                    stroke="#60A5FA"
                    strokeWidth={isSelected ? 2.5 : 2}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1 + idx * 0.05, duration: 0.25 }}
                  />
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    textAnchor="middle"
                    className={`font-mono text-[10px] ${
                      isSelected ? 'fill-white font-bold' : 'fill-[#8E8E9E]'
                    }`}
                  >
                    {pt.remaining}
                  </text>
                  <text
                    x={pt.x}
                    y={chartGeometry.height - 10}
                    textAnchor="middle"
                    className={`font-mono text-[10px] uppercase ${
                      isSelected ? 'fill-[#60A5FA] font-semibold' : 'fill-[#7E7E8E]'
                    }`}
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Row 2: Member Contributions (7 cols) + Storage 50 MB Gauge (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#22222A] border border-[#22222A]">
        {/* Left 7 Cols: Member Participation Bar Chart */}
        <div className="lg:col-span-7 bg-[#0E0E12] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#22222A]">
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-[#60A5FA]" />
              <h3 className="font-display font-bold text-base text-white">
                Aportación por Miembro
              </h3>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 bg-emerald-400 inline-block" />
                Tareas completadas
              </span>
              <span className="inline-flex items-center gap-1.5 text-[#60A5FA]">
                <span className="w-2.5 h-2.5 bg-[#3B82F6] inline-block" />
                Archivos subidos
              </span>
            </div>
          </div>

          {contributions.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8E8E9E] space-y-2">
              <BarChart3 className="w-7 h-7 text-[#555566] mx-auto" />
              <p>Aún no hay aportaciones registradas para este proyecto.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {contributions.map((member, index) => {
                const tasksPct = (member.completedTasks / maxMemberScore) * 100;
                const filesPct = (member.uploadedFiles / maxMemberScore) * 100;
                return (
                  <div key={member.username} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold text-white truncate">
                        @{member.username}
                      </span>
                      <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums shrink-0">
                        <span className="text-emerald-400 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {member.completedTasks}
                        </span>
                        <span className="text-[#60A5FA] inline-flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {member.uploadedFiles}
                        </span>
                        <span className="text-[#8E8E9E] border-l border-[#22222A] pl-2.5 font-bold text-white">
                          {member.totalScore} total
                        </span>
                      </div>
                    </div>

                    <div className="h-3 w-full bg-[#16161F] border border-[#22222A] flex overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${tasksPct}%` }}
                        transition={{ duration: 0.65, delay: index * 0.06, ease: 'easeOut' }}
                        className="h-full bg-emerald-400"
                        title={`${member.completedTasks} tarea(s) completada(s)`}
                      />
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${filesPct}%` }}
                        transition={{ duration: 0.65, delay: 0.1 + index * 0.06, ease: 'easeOut' }}
                        className="h-full bg-[#3B82F6]"
                        title={`${member.uploadedFiles} archivo(s) subido(s)`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 Cols: Visual 50 MB Storage Gauge */}
        <div className="lg:col-span-5 bg-[#0E0E12] p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="flex items-center justify-between pb-4 border-b border-[#22222A]">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-[#60A5FA]" />
              <h3 className="font-display font-bold text-base text-white">
                Espacio Ocupado (50 MB)
              </h3>
            </div>
            <span className={`font-mono text-[10px] font-bold uppercase ${storageTone.text}`}>
              {storageTone.label}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-6 py-2">
            {/* Animated Circular Ring Gauge */}
            <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                <circle
                  cx="70"
                  cy="70"
                  r={gaugeRadius}
                  fill="none"
                  stroke="#1B1B24"
                  strokeWidth="12"
                />
                <motion.circle
                  cx="70"
                  cy="70"
                  r={gaugeRadius}
                  fill="none"
                  stroke={storageTone.stroke}
                  strokeWidth="12"
                  strokeLinecap="butt"
                  strokeDasharray={gaugeCircumference}
                  initial={{ strokeDashoffset: gaugeCircumference }}
                  animate={{ strokeDashoffset: gaugeDashOffset }}
                  transition={{ duration: 0.85, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display font-bold text-2xl text-white tabular-nums">
                  {usedPct}%
                </span>
                <span className="font-mono text-[10px] text-[#8E8E9E] uppercase">OCUPADO</span>
              </div>
            </div>

            {/* Numeric Breakdown */}
            <div className="flex-1 w-full space-y-3">
              <div className="border border-[#22222A] bg-[#111116] p-3">
                <span className="font-mono text-[10px] text-[#8E8E9E] uppercase block">
                  EN USO ACTUALMENTE
                </span>
                <span className="font-display font-bold text-lg text-white tabular-nums">
                  {formatBytes(usedBytes)}
                </span>
              </div>
              <div className="border border-[#22222A] bg-[#111116] p-3">
                <span className="font-mono text-[10px] text-[#8E8E9E] uppercase block">
                  DISPONIBLE DEL LÍMITE
                </span>
                <span className="font-mono font-semibold text-sm text-emerald-400 tabular-nums">
                  {formatBytes(remainingBytes)} libres de 50 MB
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-[#22222A]">
            <div className="h-2 w-full bg-[#1B1B24] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(exactPct, usedBytes > 0 ? 1.5 : 0)}%` }}
                transition={{ duration: 0.75, ease: 'easeOut' }}
                className={`h-full ${storageTone.bar}`}
              />
            </div>
            <p className="font-mono text-[11px] text-[#7E7E8E] tabular-nums">
              {documents.length} archivo(s) contabilizado(s) sobre cuota gratuita de 50 MB.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
