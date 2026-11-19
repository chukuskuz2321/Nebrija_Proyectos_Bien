import React, { useEffect, useState, useCallback } from 'react';
import {
  GitBranch,
  GitCommitHorizontal,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Link2,
  Check,
  X,
  User,
} from 'lucide-react';
import { formatRelativeTimeEs } from '../utils/relativeTime';

interface GitHubCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

interface GitHubRepoData {
  owner: string;
  repo: string;
  commits: GitHubCommitInfo[];
  branches: string[];
  fetchedAt: number;
}

interface GitHubRepoWidgetProps {
  githubUrl?: string;
  readOnly?: boolean;
  onSaveUrl?: (nextUrl: string) => Promise<void> | void;
}

const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
const githubCache = new Map<string, GitHubRepoData>();

export function parseGitHubRepoUrl(rawUrl: string): { owner: string; repo: string } | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') return null;
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, '');
    if (!owner || !repo || !/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

export const GitHubRepoWidget: React.FC<GitHubRepoWidgetProps> = ({
  githubUrl = '',
  readOnly = false,
  onSaveUrl,
}) => {
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(githubUrl);
  const [isSaving, setIsSaving] = useState(false);

  const [data, setData] = useState<GitHubRepoData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setUrlDraft(githubUrl);
  }, [githubUrl]);

  const loadRepoData = useCallback(async (rawUrl: string, forceRefresh = false) => {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) {
      setData(null);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    const parsed = parseGitHubRepoUrl(trimmed);
    if (!parsed) {
      setData(null);
      setIsLoading(false);
      setErrorMessage(
        'URL de GitHub no válida. Usa el formato https://github.com/usuario/repositorio.'
      );
      return;
    }

    const cacheKey = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    if (!forceRefresh) {
      const cached = githubCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < SESSION_CACHE_TTL_MS) {
        setData(cached);
        setErrorMessage(null);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const headers: HeadersInit = {
        Accept: 'application/vnd.github+json',
      };
      const [commitsRes, branchesRes] = await Promise.all([
        fetch(
          `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(
            parsed.repo
          )}/commits?per_page=5`,
          { headers }
        ),
        fetch(
          `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(
            parsed.repo
          )}/branches?per_page=10`,
          { headers }
        ),
      ]);

      if (commitsRes.status === 404 || branchesRes.status === 404) {
        setData(null);
        setErrorMessage(
          `No se encontró «${parsed.owner}/${parsed.repo}» o el repositorio es privado. Solo se admiten repositorios públicos de GitHub.`
        );
        return;
      }

      if (commitsRes.status === 403 || branchesRes.status === 403) {
        setData(null);
        setErrorMessage(
          'Límite horario de la API pública de GitHub alcanzado (60 peticiones/h). Vuelve a intentarlo en unos minutos.'
        );
        return;
      }

      if (commitsRes.status === 409) {
        // Empty repository with 0 commits
        const emptyData: GitHubRepoData = {
          owner: parsed.owner,
          repo: parsed.repo,
          commits: [],
          branches: [],
          fetchedAt: Date.now(),
        };
        githubCache.set(cacheKey, emptyData);
        setData(emptyData);
        return;
      }

      if (!commitsRes.ok) {
        setData(null);
        setErrorMessage(`Error al consultar GitHub (HTTP ${commitsRes.status}).`);
        return;
      }

      const commitsJson = await commitsRes.json();
      const branchesJson = branchesRes.ok ? await branchesRes.json() : [];

      const commits: GitHubCommitInfo[] = Array.isArray(commitsJson)
        ? commitsJson.slice(0, 5).map((c: any) => ({
            sha: String(c?.sha || ''),
            shortSha: String(c?.sha || '').slice(0, 7),
            message: String(c?.commit?.message || 'Sin mensaje').split('\n')[0],
            author: String(
              c?.author?.login || c?.commit?.author?.name || c?.commit?.committer?.name || 'autor'
            ),
            date: String(
              c?.commit?.author?.date || c?.commit?.committer?.date || new Date().toISOString()
            ),
            htmlUrl: String(c?.html_url || `https://github.com/${parsed.owner}/${parsed.repo}`),
          }))
        : [];

      const branches: string[] = Array.isArray(branchesJson)
        ? branchesJson.map((b: any) => String(b?.name || '')).filter(Boolean)
        : [];

      const result: GitHubRepoData = {
        owner: parsed.owner,
        repo: parsed.repo,
        commits,
        branches,
        fetchedAt: Date.now(),
      };
      githubCache.set(cacheKey, result);
      setData(result);
    } catch {
      setData(null);
      setErrorMessage(
        'No se pudo conectar con la API pública de GitHub. Revisa tu conexión a internet.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepoData(githubUrl, false);
  }, [githubUrl, loadRepoData]);

  const handleSubmitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveUrl) return;
    setIsSaving(true);
    try {
      await onSaveUrl(urlDraft.trim());
      setIsEditingUrl(false);
    } finally {
      setIsSaving(false);
    }
  };

  // In read-only Teacher Mode, if no URL is configured, keep presentation ultra-clean
  if (readOnly && !githubUrl.trim()) {
    return null;
  }

  const latestCommit = data?.commits[0] || null;
  const parsedForLink = parseGitHubRepoUrl(githubUrl);

  return (
    <div className="border border-[#22222A] bg-[#0E0E12]">
      {/* Header Strip */}
      <div className="px-5 sm:px-6 py-4 border-b border-[#22222A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#60A5FA] shrink-0" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#60A5FA]">
              REPOSITORIO GITHUB (SOLO LECTURA)
            </span>
          </div>
          {parsedForLink ? (
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <a
                href={`https://github.com/${parsedForLink.owner}/${parsedForLink.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-bold text-base text-white hover:text-[#60A5FA] transition-colors inline-flex items-center gap-1.5 break-all"
              >
                <span>
                  {parsedForLink.owner}/{parsedForLink.repo}
                </span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
              {latestCommit && (
                <span className="font-mono text-[11px] text-[#8E8E9E] inline-flex items-center gap-1">
                  <User className="w-3 h-3 text-emerald-400" />
                  <span>
                    Último cambio: <strong className="text-white">{latestCommit.author}</strong> ·{' '}
                    {formatRelativeTimeEs(latestCommit.date)}
                  </span>
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#8E8E9E] mt-1">
              Vincula la URL de un repositorio público de GitHub para mostrar commits y ramas sin OAuth.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {githubUrl.trim() && (
            <button
              type="button"
              onClick={() => loadRepoData(githubUrl, true)}
              disabled={isLoading}
              title="Actualizar commits y ramas desde GitHub"
              className="h-8 px-3 border border-[#2A2A35] bg-[#14141A] hover:border-white text-xs text-[#D4D4DC] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#60A5FA]' : ''}`} />
              <span>Actualizar</span>
            </button>
          )}
          {!readOnly && onSaveUrl && !isEditingUrl && (
            <button
              type="button"
              onClick={() => setIsEditingUrl(true)}
              className="h-8 px-3 border border-[#2A2A35] bg-[#14141A] hover:border-white text-xs text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Link2 className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span>{githubUrl.trim() ? 'Cambiar Repo' : 'Vincular GitHub'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline URL Form (when editing) */}
      {!readOnly && isEditingUrl && (
        <form
          onSubmit={handleSubmitUrl}
          className="px-5 sm:px-6 py-4 border-b border-[#22222A] bg-[#111116] flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://github.com/usuario/mi-repositorio-publico"
            className="flex-1 h-9 px-3 bg-[#09090B] border border-[#2A2A35] font-mono text-xs text-white focus:outline-none focus:border-white"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="h-9 px-4 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlDraft(githubUrl);
                setIsEditingUrl(false);
              }}
              className="h-9 px-3 border border-[#2A2A35] bg-[#14141A] text-xs text-[#A1A1B2] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      )}

      {/* Body States */}
      <div className="p-5 sm:p-6">
        {!githubUrl.trim() ? (
          <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#8E8E9E]">
            <p>
              No hay ningún repositorio de GitHub vinculado todavía. Pega la URL pública del repo
              para que el equipo y el profesor vean los últimos 5 commits y ramas activas.
            </p>
            {!readOnly && onSaveUrl && !isEditingUrl && (
              <button
                type="button"
                onClick={() => setIsEditingUrl(true)}
                className="h-9 px-4 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
              >
                + Pegar URL de GitHub
              </button>
            )}
          </div>
        ) : isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-11 bg-[#14141C] border border-[#1E1E27] animate-pulse"
              />
            ))}
          </div>
        ) : errorMessage ? (
          <div className="border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="font-mono text-[11px] uppercase text-amber-300 font-bold">
                AVISO DE CONEXIÓN CON GITHUB
              </p>
              <p className="text-xs text-[#E4E4EC] leading-relaxed">{errorMessage}</p>
            </div>
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 8 Cols: Last 5 Commits */}
            <div className="lg:col-span-8 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase text-[#8E8E9E]">
                  ÚLTIMOS {data.commits.length} COMMITS
                </span>
                <span className="font-mono text-[10px] text-[#6E6E7E]">API PÚBLICA GITHUB</span>
              </div>

              {data.commits.length === 0 ? (
                <p className="text-xs text-[#8E8E9E] py-3">
                  El repositorio todavía no tiene commits publicados.
                </p>
              ) : (
                <div className="divide-y divide-[#1E1E27] border border-[#22222A] bg-[#111116]">
                  {data.commits.map((commit) => (
                    <a
                      key={commit.sha}
                      href={commit.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-[#171720] transition-colors group"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <GitCommitHorizontal className="w-4 h-4 text-[#60A5FA] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white group-hover:text-[#60A5FA] transition-colors truncate">
                            {commit.message}
                          </p>
                          <p className="font-mono text-[11px] text-[#8E8E9E] mt-0.5 tabular-nums">
                            <span className="text-[#C4C4D0]">{commit.author}</span> ·{' '}
                            {formatRelativeTimeEs(commit.date)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] text-[#7E7E8E] group-hover:text-white">
                        <span>{commit.shortSha}</span>
                        <ExternalLink className="w-3 h-3" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Right 4 Cols: Active Branches + Last Push Summary */}
            <div className="lg:col-span-4 space-y-4">
              <div className="space-y-2">
                <span className="font-mono text-[11px] uppercase text-[#8E8E9E] block">
                  RAMAS ACTIVAS ({data.branches.length})
                </span>
                {data.branches.length === 0 ? (
                  <p className="text-xs text-[#7E7E8E]">Sin ramas visibles.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.branches.map((branch) => (
                      <span
                        key={branch}
                        className="px-2.5 py-1 border border-[#2A2A35] bg-[#14141A] font-mono text-[11px] text-[#D4D4DC] inline-flex items-center gap-1.5"
                      >
                        <GitBranch className="w-3 h-3 text-emerald-400" />
                        <span>{branch}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {latestCommit && (
                <div className="border border-[#22222A] bg-[#111116] p-3.5 space-y-1">
                  <span className="font-mono text-[10px] uppercase text-[#8E8E9E] block">
                    ÚLTIMA PERSONA EN SUBIR CAMBIOS
                  </span>
                  <p className="font-display font-bold text-sm text-white">{latestCommit.author}</p>
                  <p className="font-mono text-[11px] text-[#60A5FA] tabular-nums">
                    {formatRelativeTimeEs(latestCommit.date)} · {latestCommit.shortSha}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
