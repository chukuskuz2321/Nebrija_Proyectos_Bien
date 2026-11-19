import React, { useMemo, useState } from 'react';
import {
  Eye,
  ArrowLeft,
  Calendar,
  Folder,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileArchive,
  FileCode2,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Users,
  BarChart3,
  BookOpen,
} from 'lucide-react';
import { DocumentItem, TeacherShowcaseData } from '../types';
import {
  formatBytes,
  getFileExtension,
  getGoogleEditorKind,
  getGoogleEditorLabel,
} from '../services/googleWorkspace';
import { ProjectStatsTab } from './ProjectStatsTab';
import { GitHubRepoWidget } from './GitHubRepoWidget';
import {
  CodeMarkdownViewerModal,
  canOpenInBuiltInViewer,
  isZipArchiveFile,
} from './CodeMarkdownViewerModal';

interface TeacherModeViewProps {
  showcase: TeacherShowcaseData;
  isAuthenticated: boolean;
  onExitTeacherMode?: () => void;
  onCopyShareLink: () => void;
  copiedLink?: boolean;
}

type TeacherSectionTab = 'summary' | 'files' | 'stats';

export const TeacherModeView: React.FC<TeacherModeViewProps> = ({
  showcase,
  isAuthenticated,
  onExitTeacherMode,
  onCopyShareLink,
  copiedLink = false,
}) => {
  const [activeTab, setActiveTab] = useState<TeacherSectionTab>('summary');
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [viewerDoc, setViewerDoc] = useState<DocumentItem | null>(null);

  const taskStats = useMemo(() => {
    const total = showcase.tasks.length;
    const completed = showcase.tasks.filter((t) => t.status === 'completed').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pct };
  }, [showcase.tasks]);

  const storageBytes = useMemo(
    () => showcase.documents.reduce((acc, d) => acc + (d.sizeBytes || 0), 0),
    [showcase.documents]
  );

  const folderBreadcrumbs = useMemo(() => {
    const trail: { id: string; name: string }[] = [{ id: 'root', name: 'Raíz del Proyecto' }];
    if (currentFolderId === 'root') return trail;
    const buildPath = (folderId: string): { id: string; name: string }[] => {
      const folder = showcase.folders.find((f) => f.id === folderId);
      if (!folder) return [];
      if (folder.parentId && folder.parentId !== 'root') {
        return [...buildPath(folder.parentId), { id: folder.id, name: folder.name }];
      }
      return [{ id: folder.id, name: folder.name }];
    };
    return [...trail, ...buildPath(currentFolderId)];
  }, [currentFolderId, showcase.folders]);

  const visibleFolders = useMemo(
    () => showcase.folders.filter((f) => f.parentId === currentFolderId),
    [showcase.folders, currentFolderId]
  );

  const visibleDocs = useMemo(
    () => showcase.documents.filter((d) => d.folderId === currentFolderId),
    [showcase.documents, currentFolderId]
  );

  const renderFileIcon = (docItem: DocumentItem) => {
    const ext = (docItem.extension || getFileExtension(docItem.title) || 'bin').toLowerCase();
    const editorKind = getGoogleEditorKind(ext);
    if (canOpenInBuiltInViewer(docItem.title, docItem.extension) && !isZipArchiveFile(docItem.title, docItem.extension)) {
      return (
        <div className="w-10 h-10 border border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#60A5FA] flex items-center justify-center shrink-0">
          <FileCode2 className="w-5 h-5" />
        </div>
      );
    }
    if (editorKind === 'docs') {
      return (
        <div className="w-10 h-10 border border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#60A5FA] flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
      );
    }
    if (editorKind === 'sheets') {
      return (
        <div className="w-10 h-10 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
      );
    }
    if (editorKind === 'slides') {
      return (
        <div className="w-10 h-10 border border-amber-500/40 bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
          <Presentation className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 border border-[#2A2A35] bg-[#121218] text-[#A1A1B2] flex items-center justify-center shrink-0">
        <FileArchive className="w-5 h-5" />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex flex-col">
      {/* Discrete Top Read-Only Banner */}
      <div className="sticky top-0 z-40 border-b border-[#3B82F6]/40 bg-[#0D1322] px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-6 h-6 border border-[#3B82F6]/60 bg-[#3B82F6]/20 flex items-center justify-center text-[#60A5FA] shrink-0">
              <Eye className="w-3.5 h-3.5" />
            </span>
            <span className="font-mono text-xs text-white font-semibold truncate">
              Modo Vista Profesor (Solo lectura)
            </span>
            <span className="hidden md:inline font-mono text-[11px] text-[#93C5FD]">
              · Presentación de entrega · {showcase.subject}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCopyShareLink}
              className="h-8 px-3 border border-[#3B82F6]/50 bg-[#09090B]/70 hover:border-white text-xs font-mono text-[#D4D4DC] hover:text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Enlace copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>Copiar enlace</span>
                </>
              )}
            </button>

            {isAuthenticated && onExitTeacherMode && (
              <button
                type="button"
                onClick={onExitTeacherMode}
                className="h-8 px-3.5 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver al modo edición</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Presentation Navigation Bar */}
      <header className="border-b border-[#22222A] bg-[#0E0E12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="py-3 sm:py-0 flex items-center gap-3 min-w-0">
            <span className="font-display font-bold text-sm sm:text-base text-white truncate">
              {showcase.name}
            </span>
            <span className="font-mono text-[10px] uppercase px-2 py-0.5 border border-[#2A2A35] bg-[#14141A] text-[#60A5FA] shrink-0">
              {showcase.subject}
            </span>
          </div>

          <nav className="flex items-center divide-x divide-[#22222A] border-t sm:border-t-0 sm:border-x border-[#22222A] overflow-x-auto">
            {(
              [
                { id: 'summary', num: '01', label: 'Resumen', icon: BookOpen },
                {
                  id: 'files',
                  num: '02',
                  label: `Archivos Finales (${showcase.documents.length})`,
                  icon: Folder,
                },
                { id: 'stats', num: '03', label: 'Estadísticas y Ritmo', icon: BarChart3 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`px-4 py-3.5 text-xs font-medium flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-white text-[#09090B] font-semibold'
                      : 'bg-[#0E0E12] text-[#9E9EAE] hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {activeTab === 'summary' && (
          <div className="space-y-8">
            {/* Project Hero + KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#22222A] border border-[#22222A]">
              <div className="lg:col-span-7 bg-[#0E0E12] p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div>
                  <span className="font-mono text-xs uppercase text-[#60A5FA] block mb-2">
                    PRESENTACIÓN DEL PROYECTO · {showcase.subject}
                  </span>
                  <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
                    {showcase.name}
                  </h1>
                  <p className="text-sm sm:text-base text-[#A1A1B2] leading-relaxed">
                    {showcase.description || 'Sin descripción añadida.'}
                  </p>
                </div>

                <div className="pt-5 border-t border-[#22222A] space-y-2.5">
                  <span className="font-mono text-[11px] uppercase text-[#8E8E9E] inline-flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#60A5FA]" />
                    EQUIPO PARTICIPANTE ({showcase.authorizedUsernames.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {showcase.authorizedUsernames.map((uname) => (
                      <span
                        key={uname}
                        className="px-2.5 py-1 border border-[#2A2A35] bg-[#14141A] font-mono text-xs text-white"
                      >
                        @{uname}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#22222A]">
                <div className="p-6 bg-[#111116] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-mono text-[#8E8E9E] mb-3">
                    <span>ENTREGA</span>
                    <Calendar className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="font-display text-2xl font-bold text-white tabular-nums">
                    {new Date(showcase.dueDate).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                <div className="p-6 bg-[#111116] flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-mono text-[#8E8E9E] mb-3">
                    <span>PROGRESO TAREAS</span>
                    <span className="text-[#60A5FA] tabular-nums">{taskStats.pct}%</span>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold text-white tabular-nums mb-2">
                      {taskStats.completed} / {taskStats.total}
                    </p>
                    <div className="h-1.5 w-full bg-[#22222A]">
                      <div className="h-full bg-[#3B82F6]" style={{ width: `${taskStats.pct}%` }} />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('files')}
                  className="p-6 bg-[#111116] hover:bg-[#16161E] text-left flex flex-col justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between text-xs font-mono text-[#8E8E9E] mb-3">
                    <span>ARCHIVOS FINALES</span>
                    <Folder className="w-4 h-4 text-[#60A5FA]" />
                  </div>
                  <p className="font-display text-2xl font-bold text-white tabular-nums">
                    {showcase.documents.length} archivo(s)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('stats')}
                  className="p-6 bg-[#111116] hover:bg-[#16161E] text-left flex flex-col justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between text-xs font-mono text-[#8E8E9E] mb-3">
                    <span>PESO TOTAL</span>
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="font-display text-2xl font-bold text-white tabular-nums">
                    {formatBytes(storageBytes)}
                  </p>
                </button>
              </div>
            </div>

            {/* GitHub Widget (visible in Teacher Mode if configured) */}
            <GitHubRepoWidget githubUrl={showcase.githubUrl} readOnly />

            {/* Compact Stats & Burndown Preview directly accessible */}
            <ProjectStatsTab
              projectName={showcase.name}
              authorizedUsernames={showcase.authorizedUsernames}
              tasks={showcase.tasks}
              documents={showcase.documents}
              sectionPrefix="03"
            />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-6">
            {/* Breadcrumb Bar */}
            <div className="border border-[#22222A] bg-[#111116] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-xs text-[#7E7E8E] mr-2">RUTA:</span>
                {folderBreadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id}>
                    {idx > 0 && <ChevronRight className="w-4 h-4 text-[#555566]" />}
                    <button
                      type="button"
                      onClick={() => setCurrentFolderId(crumb.id)}
                      className={`px-3 py-1 text-xs font-mono cursor-pointer ${
                        currentFolderId === crumb.id
                          ? 'bg-white text-[#09090B] font-bold'
                          : 'bg-[#09090B] border border-[#2A2A35] text-[#C4C4D0] hover:border-white'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <span className="font-mono text-xs text-[#8E8E9E] tabular-nums">
                {visibleFolders.length} carpeta(s) · {visibleDocs.length} archivo(s)
              </span>
            </div>

            {/* Read-only Folders */}
            {visibleFolders.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#22222A] border border-[#22222A]">
                {visibleFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="bg-[#0E0E12] hover:bg-[#14141C] p-5 text-left flex items-center gap-3.5 cursor-pointer transition-colors"
                  >
                    <div className="w-10 h-10 border border-[#2E2E3A] bg-[#14141C] flex items-center justify-center text-[#60A5FA] shrink-0">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-sm text-white truncate">
                        {folder.name}
                      </h4>
                      <span className="font-mono text-[11px] text-[#8E8E9E]">
                        Abrir carpeta · @{folder.createdBy}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Read-only Final Files */}
            {visibleDocs.length === 0 ? (
              <div className="border border-[#22222A] bg-[#0E0E12] p-12 text-center text-sm text-[#8E8E9E]">
                No hay archivos en esta carpeta.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#22222A] border border-[#22222A]">
                {visibleDocs.map((docItem) => {
                  const ext = (
                    docItem.extension ||
                    getFileExtension(docItem.title) ||
                    'bin'
                  ).toLowerCase();
                  const editorKind = getGoogleEditorKind(ext);
                  const previewable = canOpenInBuiltInViewer(docItem.title, docItem.extension);
                  const isZip = isZipArchiveFile(docItem.title, docItem.extension);

                  return (
                    <div
                      key={docItem.id}
                      className="bg-[#0E0E12] p-5 flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5">
                        {renderFileIcon(docItem)}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-display font-bold text-base text-white break-words">
                            {docItem.title}
                          </h4>
                          <p className="font-mono text-[11px] text-[#8E8E9E] mt-1 tabular-nums">
                            .{ext.toUpperCase()} · {formatBytes(docItem.sizeBytes || 0)} · @
                            {docItem.assigneeUsername}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1E1E27]">
                        {previewable && (
                          <button
                            type="button"
                            onClick={() => setViewerDoc(docItem)}
                            className="flex-1 h-9 px-3 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isZip ? 'Explorar .ZIP' : 'Ver código / vista previa'}</span>
                          </button>
                        )}
                        {docItem.googleDocUrl && (
                          <a
                            href={docItem.googleDocUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 h-9 px-3 border border-[#3B82F6]/50 bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir en {getGoogleEditorLabel(editorKind) || 'Google'}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'stats' && (
          <ProjectStatsTab
            projectName={showcase.name}
            authorizedUsernames={showcase.authorizedUsernames}
            tasks={showcase.tasks}
            documents={showcase.documents}
            sectionPrefix="03"
          />
        )}
      </main>

      {/* Built-in Code / Markdown / ZIP Viewer Modal */}
      <CodeMarkdownViewerModal docItem={viewerDoc} onClose={() => setViewerDoc(null)} />
    </div>
  );
};
