import React, { useState, useMemo } from 'react';
import {
  Folder,
  FileText,
  FileCode2,
  CheckSquare,
  BarChart3,
  Layers,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  Download,
  Maximize2,
  X,
  ChevronRight,
  Clock,
  Circle,
  CircleDot,
  Image as ImageIcon,
  Table as TableIcon,
} from 'lucide-react';

// ============================================================================
// TYPES FOR INLINE AI VISUAL WIDGETS
// ============================================================================
type AccentColor = 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'cyan';

interface StatsWidgetItem {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: AccentColor;
}

interface BarChartWidgetItem {
  label: string;
  value: number;
  max?: number;
  suffix?: string;
  color?: AccentColor;
}

interface ProgressWidgetItem {
  label: string;
  percent: number;
  detail?: string;
  color?: AccentColor;
}

interface TreeWidgetNode {
  name: string;
  type: 'folder' | 'file';
  meta?: string;
  children?: TreeWidgetNode[];
}

interface TimelineWidgetItem {
  title: string;
  date?: string;
  owner?: string;
  status?: 'done' | 'active' | 'pending';
  detail?: string;
}

type AiWidgetPayload =
  | {
      type: 'stats';
      title?: string;
      items: StatsWidgetItem[];
    }
  | {
      type: 'bar_chart';
      title?: string;
      subtitle?: string;
      items: BarChartWidgetItem[];
    }
  | {
      type: 'progress_list';
      title?: string;
      items: ProgressWidgetItem[];
    }
  | {
      type: 'tree';
      title?: string;
      nodes: TreeWidgetNode[];
    }
  | {
      type: 'timeline';
      title?: string;
      items: TimelineWidgetItem[];
    };

export interface AiAttachmentPreview {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
}

// ============================================================================
// COLOR HELPERS (DARK CARBON MATTE BENTO PALETTE)
// ============================================================================
const COLOR_TEXT_MAP: Record<string, string> = {
  azul: 'text-[#60A5FA] font-medium',
  blue: 'text-[#60A5FA] font-medium',
  verde: 'text-emerald-400 font-medium',
  green: 'text-emerald-400 font-medium',
  emerald: 'text-emerald-400 font-medium',
  ambar: 'text-amber-400 font-medium',
  'ámbar': 'text-amber-400 font-medium',
  amarillo: 'text-amber-400 font-medium',
  amber: 'text-amber-400 font-medium',
  naranja: 'text-orange-400 font-medium',
  orange: 'text-orange-400 font-medium',
  rojo: 'text-rose-400 font-medium',
  red: 'text-rose-400 font-medium',
  rosa: 'text-pink-400 font-medium',
  pink: 'text-pink-400 font-medium',
  morado: 'text-violet-400 font-medium',
  violeta: 'text-violet-400 font-medium',
  purpura: 'text-violet-400 font-medium',
  'púrpura': 'text-violet-400 font-medium',
  purple: 'text-violet-400 font-medium',
  cian: 'text-cyan-400 font-medium',
  cyan: 'text-cyan-400 font-medium',
  gris: 'text-[#A1A1B2] font-medium',
  gray: 'text-[#A1A1B2] font-medium',
};

const ACCENT_STYLES: Record<
  AccentColor,
  { text: string; bar: string; border: string; bg: string }
> = {
  blue: {
    text: 'text-[#60A5FA]',
    bar: 'bg-[#3B82F6]',
    border: 'border-[#3B82F6]/40',
    bg: 'bg-[#3B82F6]/10',
  },
  emerald: {
    text: 'text-emerald-400',
    bar: 'bg-emerald-500',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
  },
  amber: {
    text: 'text-amber-400',
    bar: 'bg-amber-500',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
  },
  red: {
    text: 'text-rose-400',
    bar: 'bg-rose-500',
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/10',
  },
  purple: {
    text: 'text-violet-400',
    bar: 'bg-violet-500',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
  },
  cyan: {
    text: 'text-cyan-400',
    bar: 'bg-cyan-500',
    border: 'border-cyan-500/40',
    bg: 'bg-cyan-500/10',
  },
};

function resolveAccent(color?: string): {
  text: string;
  bar: string;
  border: string;
  bg: string;
} {
  const key = (color || 'blue').toLowerCase();
  if (key === 'green' || key === 'verde' || key === 'emerald') return ACCENT_STYLES.emerald;
  if (
    key === 'yellow' ||
    key === 'amarillo' ||
    key === 'ambar' ||
    key === 'ámbar' ||
    key === 'amber' ||
    key === 'naranja' ||
    key === 'orange'
  ) {
    return ACCENT_STYLES.amber;
  }
  if (key === 'rojo' || key === 'red' || key === 'rose' || key === 'rosa') return ACCENT_STYLES.red;
  if (
    key === 'morado' ||
    key === 'violeta' ||
    key === 'purple' ||
    key === 'violet' ||
    key === 'purpura' ||
    key === 'púrpura'
  ) {
    return ACCENT_STYLES.purple;
  }
  if (key === 'cian' || key === 'cyan') return ACCENT_STYLES.cyan;
  return ACCENT_STYLES.blue;
}

// Strip stray emojis & raw {color:...} wrappers in plain widget text so raw tags never leak
function stripEmojis(text: string): string {
  return text
    .replace(
      /\{(azul|blue|verde|green|emerald|ambar|ámbar|amarillo|amber|naranja|orange|rojo|red|rosa|pink|morado|violeta|purpura|púrpura|purple|cian|cyan|gris|gray):\s*([^}]+)\}/gi,
      '$2'
    )
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ============================================================================
// SAFE SVG DATA URL ENCODER & PNG EXPORTER (100% XSS-SAFE VIA <img src>)
// ============================================================================
function sanitizeSvgSource(raw: string): string | null {
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let svg = match[0];
  // Strip any active content defensively (browsers also block scripts inside <img src="data:image/svg+xml">)
  svg = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/javascript:/gi, '');

  if (!/xmlns\s*=/i.test(svg)) {
    svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

function svgToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

// ============================================================================
// INLINE MARKDOWN + COLOR TAG RENDERER (RECURSIVE, PURE REACT JSX, ZERO RAW HTML)
// ============================================================================
function renderInlineStyled(
  text: string,
  keyPrefix: string,
  depth = 0
): React.ReactNode[] {
  const cleaned = text.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,
    ''
  );

  if (depth > 4) {
    return [cleaned];
  }

  // Tokenize: {color:text}, **bold**, `code`, *italic*, @mention
  const tokenRegex =
    /(\{(azul|blue|verde|green|emerald|ambar|ámbar|amarillo|amber|naranja|orange|rojo|red|rosa|pink|morado|violeta|purpura|púrpura|purple|cian|cyan|gris|gray):\s*([^}]+)\}|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*|(@[a-zA-Z0-9_.-]+))/gi;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRegex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(cleaned.slice(lastIndex, match.index));
    }

    const colorKey = match[2];
    const colorText = match[3];
    const boldText = match[4];
    const codeText = match[5];
    const italicText = match[6];
    const mentionText = match[7];

    if (colorKey && colorText !== undefined) {
      const cls = COLOR_TEXT_MAP[colorKey.toLowerCase()] || 'text-[#60A5FA] font-medium';
      const subKey = `${keyPrefix}_c_${idx++}`;
      nodes.push(
        <span key={subKey} className={cls}>
          {renderInlineStyled(colorText, subKey, depth + 1)}
        </span>
      );
    } else if (boldText !== undefined) {
      const subKey = `${keyPrefix}_b_${idx++}`;
      nodes.push(
        <strong key={subKey} className="font-semibold text-white">
          {renderInlineStyled(boldText, subKey, depth + 1)}
        </strong>
      );
    } else if (codeText !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}_k_${idx++}`}
          className="font-mono text-[12px] bg-[#181822] border border-[#2C2C3A] text-[#93C5FD] px-1.5 py-0.5 mx-0.5 break-all"
        >
          {stripEmojis(codeText)}
        </code>
      );
    } else if (italicText !== undefined) {
      const subKey = `${keyPrefix}_i_${idx++}`;
      nodes.push(
        <em key={subKey} className="italic text-[#B4B4C6]">
          {renderInlineStyled(italicText, subKey, depth + 1)}
        </em>
      );
    } else if (mentionText !== undefined) {
      nodes.push(
        <span
          key={`${keyPrefix}_m_${idx++}`}
          className="font-mono text-[12px] text-[#60A5FA] bg-[#3B82F6]/10 border border-[#3B82F6]/30 px-1 py-0.5"
        >
          {mentionText}
        </span>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < cleaned.length) {
    nodes.push(cleaned.slice(lastIndex));
  }

  return nodes;
}

// Pick a clean SVG icon for section headings based on content
function getHeadingIcon(title: string): React.ReactNode {
  const lower = title.toLowerCase();
  if (lower.includes('carpeta') || lower.includes('directorio') || lower.includes('estructura')) {
    return <Folder className="w-4 h-4 text-[#60A5FA] shrink-0" />;
  }
  if (lower.includes('archivo') || lower.includes('documento') || lower.includes('fichero')) {
    return <FileText className="w-4 h-4 text-cyan-400 shrink-0" />;
  }
  if (lower.includes('código') || lower.includes('codigo') || lower.includes('script')) {
    return <FileCode2 className="w-4 h-4 text-violet-400 shrink-0" />;
  }
  if (lower.includes('tarea') || lower.includes('pendiente') || lower.includes('entrega')) {
    return <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />;
  }
  if (
    lower.includes('estadística') ||
    lower.includes('estadistica') ||
    lower.includes('métrica') ||
    lower.includes('progreso') ||
    lower.includes('resumen')
  ) {
    return <BarChart3 className="w-4 h-4 text-[#60A5FA] shrink-0" />;
  }
  if (lower.includes('aviso') || lower.includes('alerta') || lower.includes('riesgo') || lower.includes('error')) {
    return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  return <Layers className="w-4 h-4 text-[#60A5FA] shrink-0" />;
}

// ============================================================================
// SUB-COMPONENTS: CODE BLOCK, SVG VISUAL CARD, INTERACTIVE WIDGETS
// ============================================================================
function CodeBlockCard({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="my-3 border border-[#262634] bg-[#0B0B10] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#22222E] bg-[#12121A]">
        <div className="flex items-center gap-1.5">
          <FileCode2 className="w-3.5 h-3.5 text-[#60A5FA]" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#9E9EB0]">
            {lang || 'código'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-[#A1A1B2] hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-xs font-mono leading-relaxed text-[#E2E2EE]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function SvgVisualCard({ rawSvg, title }: { rawSvg: string; title?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);

  const safeSvg = useMemo(() => sanitizeSvgSource(rawSvg), [rawSvg]);
  const dataUrl = useMemo(() => (safeSvg ? svgToDataUrl(safeSvg) : null), [safeSvg]);

  if (!safeSvg || !dataUrl) return null;

  const handleDownloadSvg = () => {
    const blob = new Blob([safeSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grafico-ia-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPng = () => {
    setDownloadingPng(true);
    const img = new window.Image();
    img.onload = () => {
      try {
        const w = Math.max(img.naturalWidth || 960, 960);
        const h = Math.max(img.naturalHeight || 540, 540);
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#09090B';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `imagen-ia-${Date.now()}.png`;
          a.click();
        }
      } finally {
        setDownloadingPng(false);
      }
    };
    img.onerror = () => setDownloadingPng(false);
    img.src = dataUrl;
  };

  return (
    <>
      <div className="my-3 border border-[#2B2B38] bg-[#0B0B10] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 border-b border-[#22222E] bg-[#12121A]">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-white truncate">
              {title || 'Gráfico Visual Generado por IA'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={downloadingPng}
              className="h-7 px-2.5 border border-[#3B82F6]/50 bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#93C5FD] font-mono text-[10px] uppercase inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>{downloadingPng ? 'Generando...' : 'PNG'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="h-7 px-2.5 border border-[#2A2A35] bg-[#16161F] hover:border-white text-[#C4C4D4] hover:text-white font-mono text-[10px] uppercase inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>SVG</span>
            </button>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Ampliar gráfico"
              className="h-7 w-7 border border-[#2A2A35] bg-[#16161F] hover:border-white text-[#C4C4D4] hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="p-3 bg-[#09090B] flex items-center justify-center">
          <img
            src={dataUrl}
            alt={title || 'Gráfico generado por IA'}
            className="w-full max-h-[380px] object-contain"
          />
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="w-full max-w-5xl border border-[#2D2D3B] bg-[#0B0B10] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#22222E] bg-[#12121A]">
              <span className="font-mono text-xs uppercase text-white">
                {title || 'Vista ampliada del gráfico'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  className="h-8 px-3 bg-white hover:bg-zinc-200 text-[#09090B] font-mono text-[11px] font-semibold uppercase inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="h-8 w-8 border border-[#2A2A35] text-[#A1A1B2] hover:text-white inline-flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-6 bg-[#09090B] flex items-center justify-center max-h-[80vh] overflow-auto">
              <img
                src={dataUrl}
                alt={title || 'Gráfico ampliado'}
                className="w-full h-auto max-h-[72vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TreeNodeView({ node, depth = 0 }: { node: TreeWidgetNode; depth?: number }) {
  const isFolder = node.type === 'folder';
  return (
    <div>
      <div
        className="flex items-center justify-between gap-2 py-1.5 px-2 hover:bg-[#161620] transition-colors border-l border-[#262634]"
        style={{ marginLeft: depth * 14 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isFolder ? (
            <Folder className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-[#A1A1B2] shrink-0" />
          )}
          <span
            className={`text-xs truncate ${
              isFolder ? 'font-semibold text-white' : 'font-mono text-[#D4D4E2]'
            }`}
          >
            {stripEmojis(node.name)}
          </span>
        </div>
        {node.meta && (
          <span className="font-mono text-[10px] text-[#8E8E9E] shrink-0">
            {stripEmojis(node.meta)}
          </span>
        )}
      </div>
      {Array.isArray(node.children) && node.children.length > 0 && (
        <div className="space-y-0.5">
          {node.children.map((child, idx) => (
            <TreeNodeView key={`${child.name}_${idx}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function InlineWidgetCard({ rawJson }: { rawJson: string }) {
  const widget = useMemo<AiWidgetPayload | null>(() => {
    try {
      const parsed = JSON.parse(rawJson.trim());
      if (!parsed || typeof parsed !== 'object' || !parsed.type) return null;
      return parsed as AiWidgetPayload;
    } catch {
      return null;
    }
  }, [rawJson]);

  if (!widget) return null;

  if (widget.type === 'stats' && Array.isArray(widget.items) && widget.items.length > 0) {
    return (
      <div className="my-3 border border-[#262634] bg-[#0B0B10] overflow-hidden">
        {widget.title && (
          <div className="px-3.5 py-2 border-b border-[#22222E] bg-[#12121A] flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-white">
              {stripEmojis(widget.title)}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#22222E]">
          {widget.items.slice(0, 8).map((item, idx) => {
            const accent = resolveAccent(item.color);
            return (
              <div key={idx} className="bg-[#0D0D13] p-3.5 flex flex-col justify-between gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8E8E9E] leading-tight">
                  {stripEmojis(item.label)}
                </span>
                <span className={`font-display text-xl sm:text-2xl font-bold tabular-nums ${accent.text}`}>
                  {stripEmojis(String(item.value))}
                </span>
                {item.sublabel && (
                  <span className="text-[11px] text-[#9E9EB0] leading-snug">
                    {stripEmojis(item.sublabel)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (widget.type === 'bar_chart' && Array.isArray(widget.items) && widget.items.length > 0) {
    const maxVal = Math.max(
      1,
      ...widget.items.map((i) => Math.max(Number(i.value) || 0, Number(i.max) || 0))
    );
    return (
      <div className="my-3 border border-[#262634] bg-[#0B0B10] overflow-hidden">
        <div className="px-3.5 py-2 border-b border-[#22222E] bg-[#12121A] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-white">
              {stripEmojis(widget.title || 'Comparativa Visual')}
            </span>
          </div>
          {widget.subtitle && (
            <span className="font-mono text-[10px] text-[#8E8E9E]">
              {stripEmojis(widget.subtitle)}
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          {widget.items.slice(0, 12).map((item, idx) => {
            const num = Math.max(0, Number(item.value) || 0);
            const denom = item.max && item.max > 0 ? item.max : maxVal;
            const pct = Math.min(100, Math.max(2, Math.round((num / denom) * 100)));
            const accent = resolveAccent(item.color);
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#E2E2EE] font-medium truncate">
                    {stripEmojis(item.label)}
                  </span>
                  <span className={`font-mono text-[11px] tabular-nums shrink-0 ${accent.text}`}>
                    {num}
                    {item.suffix ? ` ${stripEmojis(item.suffix)}` : ''}
                  </span>
                </div>
                <div className="h-2.5 w-full bg-[#171721] border border-[#242432] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${accent.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (widget.type === 'progress_list' && Array.isArray(widget.items) && widget.items.length > 0) {
    return (
      <div className="my-3 border border-[#262634] bg-[#0B0B10] overflow-hidden">
        {widget.title && (
          <div className="px-3.5 py-2 border-b border-[#22222E] bg-[#12121A] flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-white">
              {stripEmojis(widget.title)}
            </span>
          </div>
        )}
        <div className="divide-y divide-[#1E1E28]">
          {widget.items.slice(0, 10).map((item, idx) => {
            const pct = Math.min(100, Math.max(0, Math.round(Number(item.percent) || 0)));
            const autoColor: AccentColor =
              item.color || (pct >= 80 ? 'emerald' : pct >= 40 ? 'blue' : 'amber');
            const accent = resolveAccent(autoColor);
            return (
              <div key={idx} className="p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-white">
                    {stripEmojis(item.label)}
                  </span>
                  <span className={`font-mono text-xs font-semibold tabular-nums ${accent.text}`}>
                    {pct}%
                  </span>
                </div>
                <div className="h-2 w-full bg-[#171721] overflow-hidden">
                  <div className={`h-full ${accent.bar}`} style={{ width: `${pct}%` }} />
                </div>
                {item.detail && (
                  <p className="text-[11px] text-[#9E9EB0]">{stripEmojis(item.detail)}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (widget.type === 'tree' && Array.isArray(widget.nodes) && widget.nodes.length > 0) {
    return (
      <div className="my-3 border border-[#262634] bg-[#0B0B10] overflow-hidden">
        <div className="px-3.5 py-2 border-b border-[#22222E] bg-[#12121A] flex items-center gap-2">
          <Folder className="w-3.5 h-3.5 text-[#60A5FA]" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-white">
            {stripEmojis(widget.title || 'Estructura de Carpetas y Archivos')}
          </span>
        </div>
        <div className="p-3 space-y-0.5">
          {widget.nodes.map((node, idx) => (
            <TreeNodeView key={`${node.name}_${idx}`} node={node} />
          ))}
        </div>
      </div>
    );
  }

  if (widget.type === 'timeline' && Array.isArray(widget.items) && widget.items.length > 0) {
    return (
      <div className="my-3 border border-[#262634] bg-[#0B0B10] overflow-hidden">
        <div className="px-3.5 py-2 border-b border-[#22222E] bg-[#12121A] flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-[#60A5FA]" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-white">
            {stripEmojis(widget.title || 'Hoja de Ruta del Proyecto')}
          </span>
        </div>
        <div className="p-4 space-y-3">
          {widget.items.slice(0, 10).map((item, idx) => {
            const st = item.status || 'pending';
            return (
              <div key={idx} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {st === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : st === 'active' ? (
                    <CircleDot className="w-4 h-4 text-[#60A5FA]" />
                  ) : (
                    <Circle className="w-4 h-4 text-[#6E6E7E]" />
                  )}
                </div>
                <div className="flex-1 min-w-0 border-b border-[#1D1D27] pb-2.5 last:border-b-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`text-xs font-semibold ${
                        st === 'done' ? 'text-emerald-300' : 'text-white'
                      }`}
                    >
                      {stripEmojis(item.title)}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      {item.owner && <span className="text-[#60A5FA]">{stripEmojis(item.owner)}</span>}
                      {item.date && <span className="text-[#8E8E9E]">{stripEmojis(item.date)}</span>}
                    </div>
                  </div>
                  {item.detail && (
                    <p className="text-[11px] text-[#A1A1B2] mt-0.5 leading-relaxed">
                      {stripEmojis(item.detail)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================================
// MAIN RICH BLOCK PARSER (HEADINGS, TABLES, LISTS, CALLOUTS, CODE, WIDGETS, SVG)
// ============================================================================
type ParsedBlock =
  | { kind: 'widget'; raw: string }
  | { kind: 'svg'; raw: string; title?: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'callout'; tone: 'info' | 'warn' | 'success' | 'danger'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'hr' }
  | { kind: 'paragraph'; text: string };

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
  return cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function parseRichBlocks(source: string): ParsedBlock[] {
  const normalized = source.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks: ParsedBlock[] = [];
  const lines = normalized.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced blocks: ```widget, ```svg-visual / ```svg, or ```lang
    if (trimmed.startsWith('```')) {
      const fenceInfo = trimmed.slice(3).trim();
      const fenceLower = fenceInfo.toLowerCase();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing ```

      const inner = buf.join('\n').trim();
      if (fenceLower === 'widget' || fenceLower === 'json-widget') {
        blocks.push({ kind: 'widget', raw: inner });
      } else if (fenceLower.startsWith('svg-visual') || fenceLower === 'svg') {
        const titleMatch = fenceInfo.match(/title="([^"]+)"/i);
        blocks.push({ kind: 'svg', raw: inner, title: titleMatch?.[1] });
      } else if (inner.startsWith('<svg') && inner.endsWith('</svg>')) {
        blocks.push({ kind: 'svg', raw: inner });
      } else {
        blocks.push({ kind: 'code', lang: fenceInfo, code: inner });
      }
      continue;
    }

    // Raw inline <svg ...>...</svg> outside code fences
    if (trimmed.startsWith('<svg')) {
      const buf: string[] = [line];
      while (i < lines.length && !lines[i].includes('</svg>')) {
        i++;
        if (i < lines.length) buf.push(lines[i]);
      }
      i++;
      blocks.push({ kind: 'svg', raw: buf.join('\n') });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Headings (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Markdown pipe tables
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      const headers = splitTableRow(lines[i]);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine || !rowLine.includes('|')) break;
        rows.push(splitTableRow(rowLine));
        i++;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    // Blockquote / Callout (> ...)
    if (trimmed.startsWith('>')) {
      const qLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        qLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const joinedLower = qLines.join(' ').toLowerCase();
      const tone =
        joinedLower.includes('error') || joinedLower.includes('peligro') || joinedLower.includes('urgente')
          ? 'danger'
          : joinedLower.includes('aviso') || joinedLower.includes('cuidado') || joinedLower.includes('atención')
          ? 'warn'
          : joinedLower.includes('éxito') || joinedLower.includes('listo') || joinedLower.includes('completado')
          ? 'success'
          : 'info';
      blocks.push({ kind: 'callout', tone, lines: qLines });
      continue;
    }

    // Unordered list (*, -, •)
    if (/^(\*|-|•)\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^(\*|-|•)\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^(\*|-|•)\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // Ordered list (1., 2., ...)
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // Regular paragraph (group contiguous plain lines)
    const pLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        cur.startsWith('```') ||
        cur.startsWith('<svg') ||
        /^(#{1,4})\s+/.test(cur) ||
        /^(\*|-|•)\s+/.test(cur) ||
        /^\d+[.)]\s+/.test(cur) ||
        cur.startsWith('>') ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(cur) ||
        (cur.includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      pLines.push(cur);
      i++;
    }
    if (pLines.length > 0) {
      blocks.push({ kind: 'paragraph', text: pLines.join(' ') });
    } else {
      i++;
    }
  }

  return blocks;
}

// ============================================================================
// EXPORTED COMPONENT
// ============================================================================
export const AiRichMessage: React.FC<{ text: string }> = ({ text }) => {
  const blocks = useMemo(() => parseRichBlocks(text), [text]);

  return (
    <div className="space-y-3 text-xs sm:text-[13.5px] leading-relaxed text-[#E4E4EE]">
      {blocks.map((block, bIdx) => {
        switch (block.kind) {
          case 'widget':
            return <InlineWidgetCard key={`w_${bIdx}`} rawJson={block.raw} />;

          case 'svg':
            return <SvgVisualCard key={`svg_${bIdx}`} rawSvg={block.raw} title={block.title} />;

          case 'code':
            return <CodeBlockCard key={`code_${bIdx}`} lang={block.lang} code={block.code} />;

          case 'hr':
            return <hr key={`hr_${bIdx}`} className="border-[#242430] my-3" />;

          case 'heading': {
            const plainTitle = stripEmojis(block.text.replace(/\*\*/g, ''));
            const styledTitle = block.text.replace(/\*\*/g, '').trim();
            if (block.level === 1) {
              return (
                <div
                  key={`h_${bIdx}`}
                  className="pt-1 pb-2 border-b border-[#252533] flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-[#60A5FA] shrink-0" />
                  <h3 className="font-display text-base sm:text-lg font-bold text-white tracking-tight">
                    {renderInlineStyled(styledTitle, `h1_${bIdx}`)}
                  </h3>
                </div>
              );
            }
            if (block.level === 2) {
              return (
                <div
                  key={`h_${bIdx}`}
                  className="pt-2 pb-1 flex items-center gap-2 border-b border-[#1E1E29]"
                >
                  {getHeadingIcon(plainTitle)}
                  <h4 className="font-display text-sm sm:text-[15px] font-bold text-white tracking-tight">
                    {renderInlineStyled(styledTitle, `h2_${bIdx}`)}
                  </h4>
                </div>
              );
            }
            return (
              <div key={`h_${bIdx}`} className="pt-1.5 flex items-center gap-2">
                {getHeadingIcon(plainTitle)}
                <h5 className="font-display text-xs sm:text-sm font-semibold uppercase tracking-wide text-[#93C5FD]">
                  {renderInlineStyled(styledTitle, `h3_${bIdx}`)}
                </h5>
              </div>
            );
          }

          case 'table':
            return (
              <div
                key={`tbl_${bIdx}`}
                className="my-3 border border-[#262634] bg-[#0B0B10] overflow-hidden"
              >
                <div className="px-3 py-1.5 border-b border-[#22222E] bg-[#12121A] flex items-center gap-1.5">
                  <TableIcon className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#9E9EB0]">
                    Tabla comparativa · {block.rows.length}{' '}
                    {block.rows.length === 1 ? 'fila' : 'filas'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#15151F] border-b border-[#262634]">
                        {block.headers.map((h, hIdx) => (
                          <th
                            key={hIdx}
                            className="px-3.5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#93C5FD] whitespace-nowrap"
                          >
                            {renderInlineStyled(h, `th_${bIdx}_${hIdx}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E1E29]">
                      {block.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-[#14141D] transition-colors odd:bg-[#0B0B10] even:bg-[#0F0F16]"
                        >
                          {block.headers.map((_, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3.5 py-2.5 text-[#D8D8E6] align-top leading-snug"
                            >
                              {renderInlineStyled(row[cIdx] || '—', `td_${bIdx}_${rIdx}_${cIdx}`)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );

          case 'callout': {
            const toneStyles =
              block.tone === 'danger'
                ? 'border-l-rose-500 bg-rose-500/10 border-rose-500/25'
                : block.tone === 'warn'
                ? 'border-l-amber-400 bg-amber-500/10 border-amber-500/25'
                : block.tone === 'success'
                ? 'border-l-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                : 'border-l-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/25';
            const ToneIcon =
              block.tone === 'danger' || block.tone === 'warn'
                ? AlertTriangle
                : block.tone === 'success'
                ? CheckCircle2
                : Info;
            const iconColor =
              block.tone === 'danger'
                ? 'text-rose-400'
                : block.tone === 'warn'
                ? 'text-amber-400'
                : block.tone === 'success'
                ? 'text-emerald-400'
                : 'text-[#60A5FA]';

            return (
              <div
                key={`q_${bIdx}`}
                className={`border border-l-2 p-3 flex items-start gap-2.5 ${toneStyles}`}
              >
                <ToneIcon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                <div className="space-y-1 text-xs text-[#E4E4EE]">
                  {block.lines.map((ql, qIdx) => (
                    <p key={qIdx}>{renderInlineStyled(ql, `ql_${bIdx}_${qIdx}`)}</p>
                  ))}
                </div>
              </div>
            );
          }

          case 'ul':
            return (
              <ul key={`ul_${bIdx}`} className="space-y-1.5 pl-1">
                {block.items.map((item, liIdx) => (
                  <li key={liIdx} className="flex items-start gap-2">
                    <ChevronRight className="w-3.5 h-3.5 text-[#3B82F6] mt-1 shrink-0" />
                    <span className="flex-1 text-[#DCDCE8]">
                      {renderInlineStyled(item, `ul_${bIdx}_${liIdx}`)}
                    </span>
                  </li>
                ))}
              </ul>
            );

          case 'ol':
            return (
              <ol key={`ol_${bIdx}`} className="space-y-2 pl-0.5">
                {block.items.map((item, liIdx) => (
                  <li key={liIdx} className="flex items-start gap-2.5">
                    <span className="font-mono text-[10px] font-semibold text-[#93C5FD] bg-[#3B82F6]/15 border border-[#3B82F6]/35 px-1.5 py-0.5 mt-0.5 shrink-0 tabular-nums">
                      {String(liIdx + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 text-[#DCDCE8]">
                      {renderInlineStyled(item, `ol_${bIdx}_${liIdx}`)}
                    </span>
                  </li>
                ))}
              </ol>
            );

          case 'paragraph':
          default:
            return (
              <p key={`p_${bIdx}`} className="text-[#DCDCE8] leading-relaxed">
                {renderInlineStyled(block.text, `p_${bIdx}`)}
              </p>
            );
        }
      })}
    </div>
  );
};
