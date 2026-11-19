import React, { useEffect, useState, useMemo } from 'react';
import JSZip from 'jszip';
import {
  X,
  Copy,
  Check,
  Code2,
  Eye,
  FileCode2,
  FileText,
  FileArchive,
  FolderOpen,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { DocumentItem } from '../types';
import { getFileExtension, formatBytes } from '../services/googleWorkspace';

export const CODE_VIEWER_EXTS = new Set([
  'py',
  'js',
  'ts',
  'jsx',
  'html',
  'css',
  'sql',
  'json',
  'md',
]);

export function isPreviewableCodeOrMarkdown(filename: string, explicitExt?: string): boolean {
  const ext = (explicitExt || getFileExtension(filename) || '').toLowerCase();
  return CODE_VIEWER_EXTS.has(ext);
}

export function isZipArchiveFile(filename: string, explicitExt?: string): boolean {
  const ext = (explicitExt || getFileExtension(filename) || '').toLowerCase();
  return ext === 'zip';
}

export function canOpenInBuiltInViewer(filename: string, explicitExt?: string): boolean {
  return (
    isPreviewableCodeOrMarkdown(filename, explicitExt) ||
    isZipArchiveFile(filename, explicitExt)
  );
}

// Decode a Data URL to Uint8Array or UTF-8 string
function dataUrlToUint8Array(dataUrl: string): Uint8Array | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const base64 = dataUrl.slice(commaIdx + 1);
  try {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeTextFromDocument(docItem: DocumentItem): string {
  if (docItem.fileDataUrl && docItem.fileDataUrl.startsWith('data:')) {
    const bytes = dataUrlToUint8Array(docItem.fileDataUrl);
    if (bytes) {
      try {
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        // fall through to docItem.content
      }
    }
  }
  return docItem.content || '';
}

// ==================== LIGHTWEIGHT CLIENT-SIDE SYNTAX HIGHLIGHTER ====================

type TokenKind = 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'tag' | 'property';

interface HighlightToken {
  kind: TokenKind;
  text: string;
}

const KEYWORD_SETS: Record<string, Set<string>> = {
  py: new Set([
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as',
    'try', 'except', 'finally', 'with', 'pass', 'break', 'continue', 'lambda', 'yield',
    'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'async', 'await', 'raise', 'print',
  ]),
  js: new Set([
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case',
    'break', 'continue', 'import', 'export', 'default', 'from', 'class', 'extends', 'new', 'this',
    'try', 'catch', 'finally', 'throw', 'async', 'await', 'true', 'false', 'null', 'undefined',
    'typeof', 'interface', 'type', 'enum', 'implements', 'public', 'private', 'readonly',
  ]),
  sql: new Set([
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE',
    'TABLE', 'DROP', 'ALTER', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY',
    'ORDER', 'ASC', 'DESC', 'LIMIT', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'PRIMARY', 'KEY',
    'FOREIGN', 'REFERENCES', 'INDEX', 'VIEW', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'HAVING',
  ]),
  css: new Set([
    'display', 'flex', 'grid', 'position', 'color', 'background', 'border', 'margin', 'padding',
    'width', 'height', 'font-size', 'font-weight', 'align-items', 'justify-content', 'gap',
    'transition', 'transform', 'opacity', 'z-index', 'overflow', 'cursor',
  ]),
};

function tokenizeCodeLine(line: string, ext: string): HighlightToken[] {
  const normalized = ext === 'ts' || ext === 'jsx' ? 'js' : ext;
  if (!line) return [{ kind: 'plain', text: '' }];

  // JSON highlighting
  if (normalized === 'json') {
    const tokens: HighlightToken[] = [];
    const regex = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ kind: 'plain', text: line.slice(lastIndex, match.index) });
      }
      if (match[1] && match[2]) {
        tokens.push({ kind: 'property', text: match[1] });
        tokens.push({ kind: 'plain', text: match[2] });
      } else if (match[1]) {
        tokens.push({ kind: 'string', text: match[1] });
      } else if (match[3]) {
        tokens.push({ kind: 'keyword', text: match[3] });
      } else {
        tokens.push({ kind: 'number', text: match[0] });
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      tokens.push({ kind: 'plain', text: line.slice(lastIndex) });
    }
    return tokens;
  }

  // HTML highlighting
  if (normalized === 'html') {
    const tokens: HighlightToken[] = [];
    const regex = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9-]+)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\/?>)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ kind: 'plain', text: line.slice(lastIndex, match.index) });
      }
      if (match[1]) tokens.push({ kind: 'comment', text: match[1] });
      else if (match[2] || match[4]) tokens.push({ kind: 'tag', text: match[0] });
      else if (match[3]) tokens.push({ kind: 'string', text: match[3] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      tokens.push({ kind: 'plain', text: line.slice(lastIndex) });
    }
    return tokens;
  }

  // General code highlighter (Python, JS/TS/JSX, SQL, CSS, Markdown source)
  const kwSet = KEYWORD_SETS[normalized] || KEYWORD_SETS.js;
  const commentPattern =
    normalized === 'py'
      ? '#.*$'
      : normalized === 'sql'
        ? '--.*$'
        : '\\/\\/.*$|\\/\\*[\\s\\S]*?\\*\\/';

  const regex = new RegExp(
    `(${commentPattern})|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|(\\b[a-zA-Z_][a-zA-Z0-9_-]*\\b)`,
    'g'
  );

  const tokens: HighlightToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'plain', text: line.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      tokens.push({ kind: 'comment', text: match[1] });
    } else if (match[2]) {
      tokens.push({ kind: 'string', text: match[2] });
    } else if (match[3]) {
      tokens.push({ kind: 'number', text: match[3] });
    } else if (match[4]) {
      const word = match[4];
      const isKw =
        normalized === 'sql'
          ? kwSet.has(word.toUpperCase())
          : kwSet.has(word);
      tokens.push({ kind: isKw ? 'keyword' : 'plain', text: word });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    tokens.push({ kind: 'plain', text: line.slice(lastIndex) });
  }
  return tokens;
}

const TOKEN_CLASSES: Record<TokenKind, string> = {
  plain: 'text-[#E4E4EC]',
  comment: 'text-[#6B7280] italic',
  string: 'text-emerald-300',
  keyword: 'text-[#60A5FA] font-semibold',
  number: 'text-amber-300',
  tag: 'text-sky-400 font-medium',
  property: 'text-indigo-300',
};

// ==================== SAFE REACT MARKDOWN RENDERER (NO XSS) ====================

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(
        <code
          key={`ic_${keyIdx++}`}
          className="px-1.5 py-0.5 bg-[#1A1A24] border border-[#2A2A35] font-mono text-[12px] text-[#93C5FD]"
        >
          {match[1].slice(1, -1)}
        </code>
      );
    } else if (match[2]) {
      parts.push(
        <strong key={`b_${keyIdx++}`} className="font-semibold text-white">
          {match[2].slice(2, -2)}
        </strong>
      );
    } else if (match[3]) {
      parts.push(
        <em key={`i_${keyIdx++}`} className="italic text-[#D4D4DC]">
          {match[3].slice(1, -1)}
        </em>
      );
    } else if (match[4]) {
      parts.push(
        <a
          key={`a_${keyIdx++}`}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#60A5FA] underline hover:text-white"
        >
          {match[5]}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

const MarkdownPreview: React.FC<{ source: string }> = ({ source }) => {
  const blocks = useMemo(() => {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const nodes: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim() || 'txt';
        const codeLines: string[] = [];
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i += 1;
        }
        i += 1; // consume closing ```
        nodes.push(
          <div key={`cb_${key++}`} className="my-4 border border-[#24242E] bg-[#09090B] overflow-x-auto">
            <div className="px-3 py-1.5 border-b border-[#1E1E27] font-mono text-[10px] uppercase text-[#7E7E8E]">
              {lang}
            </div>
            <pre className="p-3.5 font-mono text-xs leading-relaxed text-[#E4E4EC]">
              {codeLines.join('\n')}
            </pre>
          </div>
        );
        continue;
      }

      // Headings
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingText = headingMatch[2];
        const cls =
          level === 1
            ? 'font-display text-2xl font-bold text-white border-b border-[#22222A] pb-2 mt-6 mb-3'
            : level === 2
              ? 'font-display text-xl font-bold text-white mt-5 mb-2.5'
              : level === 3
                ? 'font-display text-base font-bold text-white mt-4 mb-2'
                : 'font-display text-sm font-semibold text-[#D4D4DC] mt-3 mb-1.5';
        nodes.push(
          <div key={`h_${key++}`} className={cls}>
            {renderInlineMarkdown(headingText)}
          </div>
        );
        i += 1;
        continue;
      }

      // Horizontal rule
      if (/^(\*\*\*+|---+|___+)\s*$/.test(line.trim())) {
        nodes.push(<hr key={`hr_${key++}`} className="my-5 border-[#22222A]" />);
        i += 1;
        continue;
      }

      // Blockquote
      if (line.trim().startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i += 1;
        }
        nodes.push(
          <blockquote
            key={`bq_${key++}`}
            className="my-3 pl-4 border-l-2 border-[#3B82F6] bg-[#111116] py-2 pr-3 text-sm text-[#B4B4C2]"
          >
            {quoteLines.map((ql, idx) => (
              <p key={idx}>{renderInlineMarkdown(ql)}</p>
            ))}
          </blockquote>
        );
        continue;
      }

      // Unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
          i += 1;
        }
        nodes.push(
          <ul key={`ul_${key++}`} className="my-3 pl-5 list-disc space-y-1.5 text-sm text-[#C4C4D0]">
            {items.map((it, idx) => (
              <li key={idx}>{renderInlineMarkdown(it)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i += 1;
        }
        nodes.push(
          <ol key={`ol_${key++}`} className="my-3 pl-5 list-decimal space-y-1.5 text-sm text-[#C4C4D0]">
            {items.map((it, idx) => (
              <li key={idx}>{renderInlineMarkdown(it)}</li>
            ))}
          </ol>
        );
        continue;
      }

      // Empty line
      if (!line.trim()) {
        i += 1;
        continue;
      }

      // Paragraph
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trim().startsWith('#') &&
        !lines[i].trim().startsWith('```') &&
        !lines[i].trim().startsWith('>') &&
        !/^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i])
      ) {
        paraLines.push(lines[i]);
        i += 1;
      }
      nodes.push(
        <p key={`p_${key++}`} className="my-2.5 text-sm text-[#C4C4D0] leading-relaxed">
          {renderInlineMarkdown(paraLines.join(' '))}
        </p>
      );
    }

    return nodes;
  }, [source]);

  return <div className="max-w-3xl">{blocks}</div>;
};

// ==================== MAIN MODAL COMPONENT (CODE, MARKDOWN & .ZIP EXPLORER) ====================

interface ZipEntryPreview {
  path: string;
  name: string;
  ext: string;
  isPreviewable: boolean;
  readText: () => Promise<string>;
}

interface CodeMarkdownViewerModalProps {
  docItem: DocumentItem | null;
  onClose: () => void;
}

export const CodeMarkdownViewerModal: React.FC<CodeMarkdownViewerModalProps> = ({
  docItem,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [mdMode, setMdMode] = useState<'rendered' | 'source'>('rendered');

  // ZIP inspection state
  const [zipEntries, setZipEntries] = useState<ZipEntryPreview[]>([]);
  const [selectedZipPath, setSelectedZipPath] = useState<string>('');
  const [zipActiveText, setZipActiveText] = useState<string>('');
  const [zipLoading, setZipLoading] = useState<boolean>(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const rootExt = docItem
    ? (docItem.extension || getFileExtension(docItem.title) || '').toLowerCase()
    : '';
  const isZipMode = rootExt === 'zip';

  // Escape key closes modal
  useEffect(() => {
    if (!docItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [docItem, onClose]);

  // Parse ZIP entries when opening a .ZIP file
  useEffect(() => {
    if (!docItem || !isZipMode) {
      setZipEntries([]);
      setSelectedZipPath('');
      setZipActiveText('');
      setZipError(null);
      setZipLoading(false);
      return;
    }

    let cancelled = false;
    const parseZip = async () => {
      setZipLoading(true);
      setZipError(null);
      setZipEntries([]);
      setSelectedZipPath('');
      setZipActiveText('');

      const bytes = dataUrlToUint8Array(docItem.fileDataUrl || '');
      if (!bytes) {
        if (!cancelled) {
          setZipError(
            'El contenido binario de este .ZIP supera el límite de caché en la nube para vista previa online. Descárgalo con el botón Extraer para verlo completo.'
          );
          setZipLoading(false);
        }
        return;
      }

      try {
        const zip = await JSZip.loadAsync(bytes);
        const entries: ZipEntryPreview[] = [];

        zip.forEach((relativePath, zipObj) => {
          if (zipObj.dir) return;
          if (relativePath.startsWith('__MACOSX/') || relativePath.endsWith('.DS_Store')) return;
          const parts = relativePath.split('/');
          const name = parts[parts.length - 1] || relativePath;
          const ext = (getFileExtension(name) || '').toLowerCase();
          entries.push({
            path: relativePath,
            name,
            ext,
            isPreviewable: CODE_VIEWER_EXTS.has(ext),
            readText: () => zipObj.async('string'),
          });
        });

        entries.sort((a, b) => {
          if (a.isPreviewable !== b.isPreviewable) return a.isPreviewable ? -1 : 1;
          return a.path.localeCompare(b.path);
        });

        if (cancelled) return;
        setZipEntries(entries);

        const firstPreviewable = entries.find((e) => e.isPreviewable);
        if (firstPreviewable) {
          setSelectedZipPath(firstPreviewable.path);
          const content = await firstPreviewable.readText();
          if (!cancelled) {
            setZipActiveText(content);
            setMdMode(firstPreviewable.ext === 'md' ? 'rendered' : 'source');
          }
        }
      } catch {
        if (!cancelled) {
          setZipError('No se pudo leer el archivo .ZIP. Comprueba que el comprimido no esté dañado.');
        }
      } finally {
        if (!cancelled) setZipLoading(false);
      }
    };

    parseZip();
    return () => {
      cancelled = true;
    };
  }, [docItem, isZipMode]);

  // Reset Markdown view mode when switching normal files
  useEffect(() => {
    if (!docItem || isZipMode) return;
    setMdMode(rootExt === 'md' ? 'rendered' : 'source');
    setCopied(false);
  }, [docItem, isZipMode, rootExt]);

  const handleSelectZipEntry = async (entry: ZipEntryPreview) => {
    setSelectedZipPath(entry.path);
    setCopied(false);
    if (!entry.isPreviewable) {
      setZipActiveText('');
      return;
    }
    try {
      const txt = await entry.readText();
      setZipActiveText(txt);
      setMdMode(entry.ext === 'md' ? 'rendered' : 'source');
    } catch {
      setZipActiveText('No se pudo leer este archivo del comprimido.');
    }
  };

  if (!docItem) return null;

  const activeZipEntry = isZipMode
    ? zipEntries.find((e) => e.path === selectedZipPath) || null
    : null;

  const displayTitle = isZipMode && activeZipEntry ? activeZipEntry.path : docItem.title;
  const displayExt = isZipMode ? activeZipEntry?.ext || 'zip' : rootExt;
  const displayText = isZipMode ? zipActiveText : decodeTextFromDocument(docItem);
  const isMarkdown = displayExt === 'md';
  const lines = displayText.replace(/\r\n/g, '\n').split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = displayText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6">
      <div
        role="dialog"
        aria-label={`Visor de archivo ${docItem.title}`}
        className="w-full max-w-6xl h-[88vh] border border-[#2E2E3A] bg-[#0E0E12] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-[#22222A] bg-[#09090B] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 border border-[#3B82F6]/40 bg-[#3B82F6]/10 flex items-center justify-center text-[#60A5FA] shrink-0">
              {isZipMode ? (
                <FileArchive className="w-4 h-4" />
              ) : isMarkdown ? (
                <FileText className="w-4 h-4" />
              ) : (
                <FileCode2 className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <span className="font-mono text-[10px] uppercase text-[#60A5FA] block">
                {isZipMode ? `EXPLORADOR INTERNO .ZIP · ${docItem.title}` : `VISOR INTEGRADO · .${displayExt.toUpperCase()}`}
              </span>
              <h3 className="font-display font-bold text-sm text-white truncate">
                {displayTitle}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Markdown Toggle */}
            {isMarkdown && (!isZipMode || activeZipEntry?.isPreviewable) && (
              <div className="grid grid-cols-2 border border-[#2A2A35] bg-[#121218]">
                <button
                  type="button"
                  onClick={() => setMdMode('rendered')}
                  className={`h-8 px-3 text-[11px] font-mono uppercase inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    mdMode === 'rendered'
                      ? 'bg-white text-[#09090B] font-semibold'
                      : 'text-[#9E9EAE] hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Renderizado</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMdMode('source')}
                  className={`h-8 px-3 text-[11px] font-mono uppercase inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    mdMode === 'source'
                      ? 'bg-white text-[#09090B] font-semibold'
                      : 'text-[#9E9EAE] hover:text-white'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Código fuente</span>
                </button>
              </div>
            )}

            {/* Copy Button */}
            {(!isZipMode || activeZipEntry?.isPreviewable) && displayText.length > 0 && (
              <button
                type="button"
                onClick={handleCopy}
                className={`h-8 px-3 border font-mono text-[11px] uppercase inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  copied
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                    : 'border-[#2A2A35] bg-[#14141A] hover:border-white text-white'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar visor"
              className="h-8 w-8 border border-[#2A2A35] bg-[#14141A] hover:border-white text-[#9E9EAE] hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Viewport */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Optional Sidebar for .ZIP Archive Tree */}
          {isZipMode && (
            <aside className="w-full md:w-72 border-b md:border-b-0 md:border-r border-[#22222A] bg-[#0B0B0F] flex flex-col max-h-48 md:max-h-none overflow-y-auto shrink-0">
              <div className="px-4 py-2.5 border-b border-[#1E1E27] font-mono text-[10px] uppercase text-[#8E8E9E] flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-[#60A5FA]" />
                  CONTENIDO DEL .ZIP
                </span>
                <span className="tabular-nums">{zipEntries.length}</span>
              </div>

              {zipLoading ? (
                <div className="p-6 flex items-center justify-center gap-2 text-xs text-[#8E8E9E]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#60A5FA]" />
                  <span>Leyendo .ZIP...</span>
                </div>
              ) : zipEntries.length === 0 ? (
                <div className="p-4 text-xs text-[#7E7E8E]">Sin archivos legibles dentro del .ZIP.</div>
              ) : (
                <div className="divide-y divide-[#181820]">
                  {zipEntries.map((entry) => {
                    const isSelected = selectedZipPath === entry.path;
                    return (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => handleSelectZipEntry(entry)}
                        className={`w-full px-3.5 py-2.5 text-left transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-[#1A1A26] text-white border-l-2 border-[#3B82F6]'
                            : 'hover:bg-[#13131A] text-[#A1A1B2]'
                        }`}
                      >
                        <span className="font-mono text-[11px] truncate">{entry.path}</span>
                        <span
                          className={`font-mono text-[9px] uppercase px-1.5 py-0.5 border shrink-0 ${
                            entry.isPreviewable
                              ? 'border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#60A5FA]'
                              : 'border-[#24242E] bg-[#121218] text-[#6E6E7E]'
                          }`}
                        >
                          .{entry.ext || 'bin'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>
          )}

          {/* Code / Markdown Reader Area */}
          <div className="flex-1 overflow-auto bg-[#09090B]">
            {isZipMode && zipLoading ? (
              <div className="h-full flex items-center justify-center gap-2.5 text-xs font-mono text-[#8E8E9E]">
                <Loader2 className="w-4 h-4 animate-spin text-[#60A5FA]" />
                <span>Descomprimiendo en memoria del navegador...</span>
              </div>
            ) : isZipMode && zipError ? (
              <div className="p-8 max-w-lg mx-auto text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-sm font-semibold text-white">Vista previa no disponible</p>
                <p className="text-xs text-[#9E9EAE] leading-relaxed">{zipError}</p>
              </div>
            ) : isZipMode && activeZipEntry && !activeZipEntry.isPreviewable ? (
              <div className="p-8 max-w-lg mx-auto text-center space-y-2">
                <FileArchive className="w-8 h-8 text-[#6E6E7E] mx-auto" />
                <p className="text-sm font-semibold text-white">{activeZipEntry.name}</p>
                <p className="text-xs text-[#8E8E9E] leading-relaxed">
                  El visor integrado admite archivos{' '}
                  <code className="text-white">.py, .js, .ts, .jsx, .html, .css, .sql, .json, .md</code>.
                  Selecciona un archivo de código o Markdown en la barra izquierda.
                </p>
              </div>
            ) : isZipMode && !activeZipEntry ? (
              <div className="p-8 text-center text-xs text-[#8E8E9E]">
                Selecciona un archivo de la lista para visualizar su contenido.
              </div>
            ) : isMarkdown && mdMode === 'rendered' ? (
              <div className="p-6 sm:p-8">
                <MarkdownPreview source={displayText} />
              </div>
            ) : (
              <div className="p-4 sm:p-5 font-mono text-xs leading-6 overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-[#12121A]">
                        <td className="select-none pr-4 text-right text-[#555566] tabular-nums align-top w-10 border-r border-[#1A1A22]">
                          {idx + 1}
                        </td>
                        <td className="pl-4 whitespace-pre align-top">
                          {tokenizeCodeLine(line, displayExt).map((tok, tIdx) => (
                            <span key={tIdx} className={TOKEN_CLASSES[tok.kind]}>
                              {tok.text}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info Bar */}
        <div className="px-4 sm:px-6 py-2.5 border-t border-[#22222A] bg-[#09090B] flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-[#7E7E8E] tabular-nums shrink-0">
          <span>
            {lines.length} línea(s) · {formatBytes(docItem.sizeBytes || displayText.length)}
          </span>
          <span>SOLO LECTURA · SIN DESCARGA NECESARIA</span>
        </div>
      </div>
    </div>
  );
};
