import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import {
  Folder,
  FolderPlus,
  FilePlus2,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileArchive,
  CheckSquare,
  Bell,
  MessageSquare,
  Sparkles,
  Lock,
  Unlock,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Plus,
  Trash2,
  Archive,
  ArchiveRestore,
  Calendar,
  LogOut,
  Send,
  CheckCircle2,
  CircleDot,
  Circle,
  X,
  KeyRound,
  UserPlus,
  LogIn,
  Upload,
  FolderUp,
  Download,
  HardDrive,
  Link2,
  ArrowRight,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import {
  WorkspaceData,
  StudentAccount,
  ProjectItem,
  FolderItem,
  DocumentItem,
  TaskItem,
  NoticeItem,
  TaskStatus,
  NoticePriority,
  MAX_ACTIVE_PROJECTS,
  MAX_PROJECT_STORAGE_BYTES,
  MAX_SINGLE_FILE_BYTES,
} from './types';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  syncProjectToFirestore,
  syncFolderToFirestore,
  syncDocumentToFirestore,
  syncTaskToFirestore,
  syncNoticeToFirestore,
  syncMessageToFirestore,
  deleteFromFirestoreSubcollection,
} from './firebase';
import {
  createDriveFolder,
  deleteDriveItem,
  uploadFileToGoogleDrive,
  exportGoogleWorkspaceFileBlob,
  parseGoogleDocId,
  getFileExtension,
  getGoogleEditorKind,
  getGoogleEditorLabel,
  formatBytes,
} from './services/googleWorkspace';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ChikiOnboardingModal } from './components/ChikiOnboardingModal';
import { LegalPages } from './components/LegalPages';

type BentoSectionTab = 'overview' | 'files' | 'tasks' | 'notices' | 'assistant' | 'projects';

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  isDanger?: boolean;
  onConfirm: () => Promise<void> | void;
}

// Helper to read a File as Data URL (base64) so it can be downloaded/extracted later
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// Helper to read text preview from text-compatible files for AI context
function readFileTextSnippet(file: File, ext: string): Promise<string> {
  const textExts = new Set([
    'txt',
    'md',
    'csv',
    'json',
    'sql',
    'py',
    'sh',
    'js',
    'ts',
    'html',
    'css',
    'yaml',
    'yml',
  ]);
  if (!textExts.has(ext) || file.size > 150 * 1024) {
    return Promise.resolve(
      `Archivo .${ext.toUpperCase()} (${formatBytes(file.size)}) subido al proyecto.`
    );
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').slice(0, 4000));
    reader.onerror = () => resolve(`Archivo .${ext.toUpperCase()}`);
    reader.readAsText(file);
  });
}

// Converts a base64 Data URL back to a Blob for downloading or zipping
function dataUrlToBlob(
  dataUrl: string,
  fallbackText = '',
  mimeType = 'application/octet-stream'
): Blob {
  if (dataUrl && dataUrl.startsWith('data:')) {
    const parts = dataUrl.split(',');
    const meta = parts[0] || '';
    const base64 = parts[1] || '';
    const mimeMatch = meta.match(/data:([^;]+);/);
    const detectedMime = mimeMatch ? mimeMatch[1] : mimeType;
    try {
      const binary = window.atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      return new Blob([array], { type: detectedMime });
    } catch {
      return new Blob([fallbackText], { type: 'text/plain;charset=utf-8' });
    }
  }
  return new Blob([fallbackText || ''], { type: mimeType });
}

const LOCAL_WORKSPACE_STORAGE_KEY = 'chikihub_workspace_prod_v4';

const DEFAULT_WORKSPACE_FALLBACK: WorkspaceData = {
  users: [],
  projects: [],
  folders: [],
  documents: [],
  tasks: [],
  notices: [],
  snippets: [],
  messages: [],
  activities: [],
};

function getInitialLocalWorkspace(): WorkspaceData {
  try {
    const raw = localStorage.getItem(LOCAL_WORKSPACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.projects)) {
        return parsed as WorkspaceData;
      }
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_WORKSPACE_FALLBACK;
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => getInitialLocalWorkspace());
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState<boolean>(true);

  // Public SPA Routing for Google OAuth Brand Verification (/privacidad, /terminos)
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '/'
  );

  const navigateTo = useCallback((path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path.toLowerCase());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname.toLowerCase());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // 6 Animated Bento Onboarding Cards (Never blocks public homepage for Google OAuth Verification)
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);

  // Student Account Session
  const [currentUser, setCurrentUser] = useState<StudentAccount | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() =>
    getInitialLocalWorkspace().users.length === 0 ? 'register' : 'login'
  );
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authDisplayName, setAuthDisplayName] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authRole, setAuthRole] = useState<string>('Estudiante de Informática');
  const [authError, setAuthError] = useState<string>('');

  // Google Workspace OAuth State & Guard Modal
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState<boolean>(false);
  const [syncBannerMessage, setSyncBannerMessage] = useState<string | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
  const [isExtractingZip, setIsExtractingZip] = useState<boolean>(false);
  const [googlePromptModal, setGooglePromptModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    isFirstTime?: boolean;
    onContinueLocal?: () => void;
    continueLocalLabel?: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
  });

  // Hidden file & folder upload inputs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Active Project & Access Control
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [unlockedProjectIds, setUnlockedProjectIds] = useState<string[]>([]);
  const [passwordPromptProject, setPasswordPromptProject] = useState<ProjectItem | null>(null);
  const [projectPasswordInput, setProjectPasswordInput] = useState<string>('');
  const [projectPasswordError, setProjectPasswordError] = useState<string>('');

  // Spacious Multi-Section Navigation (6 Dedicated Bento Tabs)
  const [activeSection, setActiveSection] = useState<BentoSectionTab>('overview');
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');

  // Create File from Google Docs/Sheets/Slides Share Link Modal
  const [showCreateGoogleFileModal, setShowCreateGoogleFileModal] = useState<boolean>(false);
  const [newGoogleFileName, setNewGoogleFileName] = useState<string>('');
  const [newGoogleFileUrl, setNewGoogleFileUrl] = useState<string>('');
  const [newGoogleFileKind, setNewGoogleFileKind] = useState<'docs' | 'sheets' | 'slides'>('docs');
  const [newGoogleFileNotes, setNewGoogleFileNotes] = useState<string>('');
  const [newGoogleFileAssignee, setNewGoogleFileAssignee] = useState<string>('');
  const [newGoogleFileError, setNewGoogleFileError] = useState<string>('');

  // Link Shared Google Doc/Sheet/Slide Modal
  const [linkingDocItem, setLinkingDocItem] = useState<DocumentItem | null>(null);
  const [linkGoogleUrlInput, setLinkGoogleUrlInput] = useState<string>('');

  // Modals for Project, Folder, Task, Notice
  const [showProjectModal, setShowProjectModal] = useState<boolean>(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [projName, setProjName] = useState<string>('');
  const [projSubject, setProjSubject] = useState<string>('');
  const [projDesc, setProjDesc] = useState<string>('');
  const [projDueDate, setProjDueDate] = useState<string>('2026-12-10');
  const [projHasPassword, setProjHasPassword] = useState<boolean>(true);
  const [projPassword, setProjPassword] = useState<string>('');
  const [projAuthUsersInput, setProjAuthUsersInput] = useState<string>('');

  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');

  const [taskStatusFilter, setTaskStatusFilter] = useState<'all' | TaskStatus>('all');
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string>('all');
  const [showTaskModal, setShowTaskModal] = useState<boolean>(false);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskDesc, setNewTaskDesc] = useState<string>('');
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>('2026-11-30');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('pending');

  const [noticeArchiveView, setNoticeArchiveView] = useState<'active' | 'archived'>('active');
  const [showNoticeModal, setShowNoticeModal] = useState<boolean>(false);
  const [newNoticeTitle, setNewNoticeTitle] = useState<string>('');
  const [newNoticeMessage, setNewNoticeMessage] = useState<string>('');
  const [newNoticePriority, setNewNoticePriority] = useState<NoticePriority>('important');
  const [newNoticeTarget, setNewNoticeTarget] = useState<string>('all');

  // AI & Chat state
  const [commMode, setCommMode] = useState<'ai' | 'chat'>('ai');
  const [chatInput, setChatInput] = useState<string>('');
  const [aiMessages, setAiMessages] = useState<
    { id: string; role: 'user' | 'assistant'; text: string; timestamp: string }[]
  >([
    {
      id: 'welcome_ai',
      role: 'assistant',
      text: 'Soy la IA técnica exclusiva de este proyecto. Conozco vuestras carpetas, archivos subidos, tareas y avisos. Pregúntame cualquier duda técnica del trabajo (no respondo temas ajenos al proyecto).',
      timestamp: 'Ahora',
    },
  ]);
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  // Confirmation Dialog
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmLabel: 'Confirmar',
    onConfirm: () => {},
  });

  const showToast = useCallback((msg: string) => {
    setSyncBannerMessage(msg);
    window.setTimeout(() => {
      setSyncBannerMessage((prev) => (prev === msg ? null : prev));
    }, 4200);
  }, []);

  // Load workspace from backend and merge with local cache
  useEffect(() => {
    const localData = getInitialLocalWorkspace();
    fetch('/api/workspace')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((serverData: WorkspaceData) => {
        if (!serverData || !Array.isArray(serverData.users)) {
          throw new Error('Invalid workspace payload');
        }
        const mergedUsers = [...serverData.users];
        for (const lu of localData.users) {
          if (!mergedUsers.some((su) => su.username.toLowerCase() === lu.username.toLowerCase())) {
            mergedUsers.push(lu);
          }
        }
        const mergedWorkspace: WorkspaceData = {
          ...serverData,
          users: mergedUsers,
        };
        setWorkspace(mergedWorkspace);
        try {
          localStorage.setItem(LOCAL_WORKSPACE_STORAGE_KEY, JSON.stringify(mergedWorkspace));
        } catch {
          // ignore quota error
        }
        const savedUsername = localStorage.getItem('chikihub_logged_user');
        if (savedUsername) {
          const foundUser =
            mergedWorkspace.users.find((u) => u.username === savedUsername) || null;
          setCurrentUser(foundUser);
        }
        if (mergedWorkspace.projects.length > 0) {
          setSelectedProjectId(mergedWorkspace.projects[0].id);
        }
      })
      .catch((err) => {
        console.warn('Using local workspace cache:', err);
        setWorkspace(localData);
        const savedUsername = localStorage.getItem('chikihub_logged_user');
        if (savedUsername) {
          const foundUser = localData.users.find((u) => u.username === savedUsername) || null;
          setCurrentUser(foundUser);
        }
        if (localData.projects.length > 0) {
          setSelectedProjectId(localData.projects[0].id);
        }
      })
      .finally(() => setIsLoadingWorkspace(false));
  }, []);

  // Initialize Firebase Google Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUserEmail(user.email || 'Conectado con Google');
        if (token) setGoogleAccessToken(token);
      },
      () => {
        setGoogleUserEmail(null);
        setGoogleAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Persist workspace helper
  const saveWorkspace = useCallback(async (updated: WorkspaceData) => {
    setWorkspace(updated);
    try {
      localStorage.setItem(LOCAL_WORKSPACE_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage quota warning
    }
    try {
      await fetch('/api/workspace/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (err) {
      console.warn('Backend save warning (saved locally):', err);
    }
  }, []);

  // Current selected project
  const activeProject = useMemo(() => {
    if (!workspace || workspace.projects.length === 0) return null;
    return (
      workspace.projects.find((p) => p.id === selectedProjectId) || workspace.projects[0] || null
    );
  }, [workspace, selectedProjectId]);

  const isUserAuthorizedOnProject = useCallback(
    (project: ProjectItem | null, user: StudentAccount | null): boolean => {
      if (!project) return false;
      if (!project.hasPassword) return true;
      if (unlockedProjectIds.includes(project.id)) return true;
      if (!user) return false;
      const uname = user.username.toLowerCase().trim();
      return (
        project.ownerUsername.toLowerCase().trim() === uname ||
        project.authorizedUsernames.some((u) => u.toLowerCase().trim() === uname)
      );
    },
    [unlockedProjectIds]
  );

  // Project-scoped entities
  const projectFolders = useMemo(
    () =>
      workspace && activeProject
        ? workspace.folders.filter((f) => f.projectId === activeProject.id)
        : [],
    [workspace, activeProject]
  );

  const projectDocuments = useMemo(
    () =>
      workspace && activeProject
        ? workspace.documents.filter((d) => d.projectId === activeProject.id)
        : [],
    [workspace, activeProject]
  );

  const projectTasks = useMemo(
    () =>
      workspace && activeProject
        ? workspace.tasks.filter((t) => t.projectId === activeProject.id)
        : [],
    [workspace, activeProject]
  );

  const projectNotices = useMemo(
    () =>
      workspace && activeProject
        ? workspace.notices.filter((n) => n.projectId === activeProject.id)
        : [],
    [workspace, activeProject]
  );

  const projectMessages = useMemo(
    () =>
      workspace && activeProject
        ? workspace.messages.filter((m) => m.projectId === activeProject.id)
        : [],
    [workspace, activeProject]
  );

  // Free Tier Quota Calculation
  const projectStorageBytes = useMemo(() => {
    return projectDocuments.reduce((acc, doc) => acc + (doc.sizeBytes || 0), 0);
  }, [projectDocuments]);

  const projectStoragePct = useMemo(() => {
    return Math.min(100, Math.round((projectStorageBytes / MAX_PROJECT_STORAGE_BYTES) * 100));
  }, [projectStorageBytes]);

  // Breadcrumb trail for currentFolderId
  const folderBreadcrumbs = useMemo(() => {
    const trail: { id: string; name: string }[] = [{ id: 'root', name: 'Raíz del Proyecto' }];
    if (currentFolderId === 'root') return trail;

    const buildPath = (folderId: string): { id: string; name: string }[] => {
      const folder = projectFolders.find((f) => f.id === folderId);
      if (!folder) return [];
      if (folder.parentId && folder.parentId !== 'root') {
        return [...buildPath(folder.parentId), { id: folder.id, name: folder.name }];
      }
      return [{ id: folder.id, name: folder.name }];
    };

    return [...trail, ...buildPath(currentFolderId)];
  }, [currentFolderId, projectFolders]);

  const visibleSubfolders = useMemo(
    () => projectFolders.filter((f) => f.parentId === currentFolderId),
    [projectFolders, currentFolderId]
  );

  const visibleDocuments = useMemo(
    () => projectDocuments.filter((d) => d.folderId === currentFolderId),
    [projectDocuments, currentFolderId]
  );

  // Replicate entire Project Folder Hierarchy in Google Drive
  const ensureProjectDriveHierarchy = useCallback(
    async (
      project: ProjectItem,
      foldersSnapshot?: FolderItem[]
    ): Promise<{ rootDriveId: string; folderMap: Record<string, string> }> => {
      if (!googleAccessToken || !workspace) {
        throw new Error('Conecta primero tu cuenta de Google.');
      }

      let rootDriveId = project.driveFolderId;
      let updatedProjects = [...workspace.projects];
      let updatedFolders = foldersSnapshot ? [...foldersSnapshot] : [...workspace.folders];

      if (!rootDriveId) {
        rootDriveId = await createDriveFolder(
          `[ChikiHub] ${project.name}`,
          null,
          googleAccessToken
        );
        const updatedProj: ProjectItem = {
          ...project,
          driveFolderId: rootDriveId,
          updatedAt: new Date().toISOString(),
        };
        updatedProjects = updatedProjects.map((p) => (p.id === project.id ? updatedProj : p));
        await syncProjectToFirestore(updatedProj, false);
      }

      const folderMap: Record<string, string> = { root: rootDriveId };
      const pFolders = updatedFolders.filter((f) => f.projectId === project.id);

      const ensureFolderDriveId = async (folder: FolderItem): Promise<string> => {
        if (folder.driveFolderId) {
          folderMap[folder.id] = folder.driveFolderId;
          return folder.driveFolderId;
        }
        let parentDriveId = rootDriveId;
        if (folder.parentId !== 'root') {
          const parentFolder = pFolders.find((pf) => pf.id === folder.parentId);
          if (parentFolder) {
            parentDriveId = await ensureFolderDriveId(parentFolder);
          }
        }
        const createdId = await createDriveFolder(folder.name, parentDriveId, googleAccessToken);
        folderMap[folder.id] = createdId;
        updatedFolders = updatedFolders.map((f) =>
          f.id === folder.id ? { ...f, driveFolderId: createdId } : f
        );
        return createdId;
      };

      for (const f of pFolders) {
        await ensureFolderDriveId(f);
      }

      return { rootDriveId, folderMap };
    },
    [googleAccessToken, workspace]
  );

  // Show first-time Google Sign-In prompt modal right after entering workspace
  const maybeShowFirstTimeGooglePrompt = useCallback(
    (username: string) => {
      if (googleUserEmail) return;
      const seenKey = `chikihub_google_welcome_seen_${username}`;
      if (localStorage.getItem(seenKey) !== 'true') {
        localStorage.setItem(seenKey, 'true');
        setGooglePromptModal({
          isOpen: true,
          isFirstTime: true,
          title: 'Conecta tu cuenta de Google para empezar',
          description:
            'Para subir archivos sincronizados con Google Drive, convertir documentos de Office automáticamente a Google Docs/Sheets/Slides y exportar la última versión editada, te recomendamos iniciar sesión con tu cuenta de Google ahora.',
        });
      }
    },
    [googleUserEmail]
  );

  // Connect Google Account handler
  const handleGoogleConnect = async () => {
    setIsGoogleLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUserEmail(result.user.email || 'Conectado');
        setGoogleAccessToken(result.accessToken);
        setGooglePromptModal((prev) => ({ ...prev, isOpen: false }));
        showToast('Google Drive y Google Docs conectados correctamente.');
      }
    } catch {
      showToast('No se pudo completar el inicio de sesión con Google.');
    } finally {
      setIsGoogleLoggingIn(false);
    }
  };

  // Trigger file/folder upload with clear Google Sign-In card if not connected
  const handleTriggerUpload = (mode: 'files' | 'folder') => {
    const openPicker = () => {
      if (mode === 'folder') {
        folderInputRef.current?.click();
      } else {
        fileInputRef.current?.click();
      }
    };

    if (!googleAccessToken) {
      setGooglePromptModal({
        isOpen: true,
        title: 'Inicia sesión con Google para sincronizar con Drive',
        description:
          mode === 'folder'
            ? 'Para subir carpetas completas sincronizadas con Google Drive y abrir sus documentos en Google Docs/Sheets/Slides, primero inicia sesión con Google.'
            : 'Para subir archivos sincronizados con Google Drive y abrir documentos Office en Google Docs/Sheets/Slides, primero inicia sesión con Google.',
        continueLocalLabel:
          mode === 'folder'
            ? 'Subir carpeta solo en local (sin Google Drive)'
            : 'Subir archivos solo en local (sin Google Drive)',
        onContinueLocal: () => {
          setGooglePromptModal((prev) => ({ ...prev, isOpen: false }));
          openPicker();
        },
      });
      return;
    }

    openPicker();
  };

  // Open Create File (Google Link) Modal
  const openCreateGoogleFileModal = () => {
    if (!activeProject) return;
    setNewGoogleFileName('');
    setNewGoogleFileUrl('');
    setNewGoogleFileKind('docs');
    setNewGoogleFileNotes('');
    setNewGoogleFileAssignee(
      currentUser?.username || activeProject.authorizedUsernames[0] || ''
    );
    setNewGoogleFileError('');
    setShowCreateGoogleFileModal(true);
  };

  // Auto-detect Google Docs / Sheets / Slides type when pasting share URL
  const handleGoogleFileUrlChange = (url: string) => {
    setNewGoogleFileUrl(url);
    setNewGoogleFileError('');
    const lower = url.toLowerCase();
    if (lower.includes('/spreadsheets/')) {
      setNewGoogleFileKind('sheets');
    } else if (lower.includes('/presentation/')) {
      setNewGoogleFileKind('slides');
    } else if (lower.includes('/document/')) {
      setNewGoogleFileKind('docs');
    }
  };

  // Create a project file directly linked to a shared Google Docs / Sheets / Slides URL
  const handleCreateGoogleLinkedFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !activeProject) return;
    setNewGoogleFileError('');

    const rawTitle = newGoogleFileName.trim();
    const rawUrl = newGoogleFileUrl.trim();
    if (!rawTitle) {
      setNewGoogleFileError('Escribe un nombre para el archivo.');
      return;
    }
    if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
      setNewGoogleFileError(
        'Pega el enlace completo de compartir de Google Docs, Sheets o Slides (debe empezar por https://).'
      );
      return;
    }

    const extMap = {
      docs: {
        ext: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        label: 'Google Docs',
      },
      sheets: {
        ext: 'xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        label: 'Google Sheets',
      },
      slides: {
        ext: 'pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        label: 'Google Slides',
      },
    } as const;

    const chosen = extMap[newGoogleFileKind];
    const hasKnownExt = /\.(docx|doc|odt|xlsx|xls|ods|csv|pptx|ppt|odp)$/i.test(rawTitle);
    const finalTitle = hasKnownExt ? rawTitle : `${rawTitle}.${chosen.ext}`;
    const parsedId = parseGoogleDocId(rawUrl);
    const nowIso = new Date().toISOString();

    const newDoc: DocumentItem = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: activeProject.id,
      ownerId: currentUser?.id || 'usr_member',
      folderId: currentFolderId,
      title: finalTitle,
      extension: getFileExtension(finalTitle) || chosen.ext,
      mimeType: chosen.mime,
      sizeBytes: 24576,
      content:
        newGoogleFileNotes.trim() ||
        `Documento compartido de ${chosen.label} vinculado al proyecto "${activeProject.name}".`,
      googleDocId: parsedId,
      googleDocUrl: rawUrl,
      assigneeUsername: newGoogleFileAssignee || currentUser?.username || 'grupo',
      assignedUsernames: [newGoogleFileAssignee || currentUser?.username || 'grupo'],
      status: 'draft',
      lastModifiedBy: currentUser?.username || 'grupo',
      lastSyncedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      documents: [newDoc, ...workspace.documents],
    };

    await saveWorkspace(updatedWorkspace);
    await syncDocumentToFirestore(newDoc);
    setShowCreateGoogleFileModal(false);
    showToast(`Archivo "${newDoc.title}" creado y vinculado a ${chosen.label}.`);
  };

  // Student Account Login / Register Handler
  const handleStudentAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentWs = workspace || getInitialLocalWorkspace();
    setAuthError('');

    const cleanUsername = authUsername.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '');
    if (cleanUsername.length < 2) {
      setAuthError('El nombre de usuario debe tener al menos 2 letras o números.');
      return;
    }
    if (!authPassword.trim()) {
      setAuthError('Introduce tu contraseña.');
      return;
    }

    if (authMode === 'login') {
      const existing = currentWs.users.find((u) => u.username.toLowerCase() === cleanUsername);
      if (!existing || existing.passwordHash !== authPassword.trim()) {
        setAuthError(
          currentWs.users.length > 0
            ? 'Usuario o contraseña incorrectos. Si eres nuevo, pulsa en "Crear Cuenta".'
            : 'Todavía no hay usuarios registrados. Pulsa en "Crear Cuenta" para crear la tuya.'
        );
        return;
      }
      setCurrentUser(existing);
      localStorage.setItem('chikihub_logged_user', existing.username);
      if (!selectedProjectId && currentWs.projects.length > 0) {
        setSelectedProjectId(currentWs.projects[0].id);
      }
      setAuthPassword('');
      showToast(`Sesión iniciada como @${existing.username}`);
      maybeShowFirstTimeGooglePrompt(existing.username);
    } else {
      const alreadyExists = currentWs.users.some(
        (u) => u.username.toLowerCase() === cleanUsername
      );
      if (alreadyExists) {
        setAuthError('Ese nombre de usuario ya está registrado. Elige otro o inicia sesión.');
        return;
      }
      const newUser: StudentAccount = {
        id: `usr_${Date.now()}`,
        username: cleanUsername,
        displayName: authDisplayName.trim() || cleanUsername,
        passwordHash: authPassword.trim(),
        role: authRole.trim() || 'Estudiante de Informática',
        createdAt: new Date().toISOString(),
      };
      const updated = {
        ...currentWs,
        users: [...currentWs.users, newUser],
      };
      await saveWorkspace(updated);
      setCurrentUser(newUser);
      localStorage.setItem('chikihub_logged_user', newUser.username);
      if (!selectedProjectId && updated.projects.length > 0) {
        setSelectedProjectId(updated.projects[0].id);
      }
      setAuthPassword('');
      showToast(`Cuenta @${newUser.username} creada correctamente.`);
      maybeShowFirstTimeGooglePrompt(newUser.username);
    }
  };

  const handleLogoutStudent = () => {
    localStorage.removeItem('chikihub_logged_user');
    setCurrentUser(null);
  };

  // Select a project
  const handleSelectProject = (project: ProjectItem) => {
    if (isUserAuthorizedOnProject(project, currentUser)) {
      setSelectedProjectId(project.id);
      setCurrentFolderId('root');
      setActiveSection('overview');
    } else {
      setPasswordPromptProject(project);
      setProjectPasswordInput('');
      setProjectPasswordError('');
    }
  };

  const handleUnlockProjectWithPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPromptProject) return;
    if (projectPasswordInput.trim() === passwordPromptProject.passwordHash) {
      setUnlockedProjectIds((prev) => [...prev, passwordPromptProject.id]);
      setSelectedProjectId(passwordPromptProject.id);
      setCurrentFolderId('root');
      setPasswordPromptProject(null);
      setActiveSection('overview');
      showToast(`Proyecto "${passwordPromptProject.name}" desbloqueado.`);
    } else {
      setProjectPasswordError('Contraseña del proyecto incorrecta.');
    }
  };

  // Create or Update Project (Enforcing MAX_ACTIVE_PROJECTS = 5)
  const openCreateProjectModal = () => {
    if (workspace && workspace.projects.length >= MAX_ACTIVE_PROJECTS) {
      showToast(
        `Límite gratuito alcanzado (${MAX_ACTIVE_PROJECTS}/${MAX_ACTIVE_PROJECTS} proyectos activos). Elimina uno antiguo para crear otro.`
      );
      return;
    }
    setEditingProject(null);
    setProjName('');
    setProjSubject('');
    setProjDesc('');
    setProjDueDate('2026-12-15');
    setProjHasPassword(true);
    setProjPassword('1234');
    setProjAuthUsersInput(currentUser ? currentUser.username : '');
    setShowProjectModal(true);
  };

  const openEditProjectModal = () => {
    if (!activeProject) return;
    setEditingProject(activeProject);
    setProjName(activeProject.name);
    setProjSubject(activeProject.subject);
    setProjDesc(activeProject.description);
    setProjDueDate(activeProject.dueDate.slice(0, 10));
    setProjHasPassword(activeProject.hasPassword);
    setProjPassword(activeProject.passwordHash);
    setProjAuthUsersInput(activeProject.authorizedUsernames.join(', '));
    setShowProjectModal(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !projName.trim()) return;

    if (!editingProject && workspace.projects.length >= MAX_ACTIVE_PROJECTS) {
      showToast(`Máximo ${MAX_ACTIVE_PROJECTS} proyectos activos permitidos en el plan gratuito.`);
      return;
    }

    const authorizedList = Array.from(
      new Set(
        projAuthUsersInput
          .split(',')
          .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
          .filter(Boolean)
      )
    );
    if (currentUser && !authorizedList.includes(currentUser.username.toLowerCase())) {
      authorizedList.unshift(currentUser.username.toLowerCase());
    }

    const nowIso = new Date().toISOString();

    if (editingProject) {
      const updatedProj: ProjectItem = {
        ...editingProject,
        name: projName.trim(),
        subject: projSubject.trim() || 'Informática',
        description: projDesc.trim(),
        hasPassword: projHasPassword,
        passwordHash: projHasPassword ? projPassword.trim() || '1234' : '',
        authorizedUsernames: authorizedList,
        dueDate: new Date(projDueDate || '2026-12-15').toISOString(),
        updatedAt: nowIso,
      };
      const updatedWorkspace: WorkspaceData = {
        ...workspace,
        projects: workspace.projects.map((p) => (p.id === editingProject.id ? updatedProj : p)),
      };
      await saveWorkspace(updatedWorkspace);
      await syncProjectToFirestore(updatedProj, false);
      showToast(`Proyecto "${updatedProj.name}" actualizado.`);
    } else {
      let driveFolderId = '';
      if (googleAccessToken) {
        try {
          driveFolderId = await createDriveFolder(
            `[ChikiHub] ${projName.trim()}`,
            null,
            googleAccessToken
          );
        } catch (err) {
          console.warn('Could not auto-create project Drive folder:', err);
        }
      }

      const newProj: ProjectItem = {
        id: `proj_${Date.now()}`,
        name: projName.trim(),
        subject: projSubject.trim() || 'Informática',
        description: projDesc.trim(),
        ownerId: currentUser?.id || 'usr_chiki',
        ownerUsername: currentUser?.username || 'chiki',
        hasPassword: projHasPassword,
        passwordHash: projHasPassword ? projPassword.trim() || '1234' : '',
        authorizedUsernames: authorizedList,
        dueDate: new Date(projDueDate || '2026-12-15').toISOString(),
        driveFolderId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const updatedWorkspace: WorkspaceData = {
        ...workspace,
        projects: [newProj, ...workspace.projects],
      };
      await saveWorkspace(updatedWorkspace);
      await syncProjectToFirestore(newProj, true);
      setSelectedProjectId(newProj.id);
      setCurrentFolderId('root');
      showToast(
        `Proyecto "${newProj.name}" creado (${updatedWorkspace.projects.length}/${MAX_ACTIVE_PROJECTS}).`
      );
    }
    setShowProjectModal(false);
  };

  const handleDeleteProject = (proj: ProjectItem) => {
    if (!workspace) return;
    setConfirmDialog({
      isOpen: true,
      title: `¿Eliminar el proyecto "${proj.name}"?`,
      description:
        'Se eliminarán sus carpetas, archivos y tareas en la web, liberando un hueco de los 5 proyectos activos gratuitos.',
      confirmLabel: 'Eliminar proyecto',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const remainingProjects = workspace.projects.filter((p) => p.id !== proj.id);
        const updatedWorkspace: WorkspaceData = {
          ...workspace,
          projects: remainingProjects,
          folders: workspace.folders.filter((f) => f.projectId !== proj.id),
          documents: workspace.documents.filter((d) => d.projectId !== proj.id),
          tasks: workspace.tasks.filter((t) => t.projectId !== proj.id),
          notices: workspace.notices.filter((n) => n.projectId !== proj.id),
          messages: workspace.messages.filter((m) => m.projectId !== proj.id),
        };
        await saveWorkspace(updatedWorkspace);
        if (selectedProjectId === proj.id) {
          setSelectedProjectId(remainingProjects[0]?.id || '');
          setCurrentFolderId('root');
        }
        showToast(`Proyecto "${proj.name}" eliminado.`);
      },
    });
  };

  // Create Folder / Subfolder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !activeProject || !newFolderName.trim()) return;

    let createdDriveFolderId = '';
    if (googleAccessToken) {
      try {
        setIsSyncingDrive(true);
        const { folderMap } = await ensureProjectDriveHierarchy(activeProject);
        const parentDriveId = folderMap[currentFolderId] || folderMap.root || null;
        createdDriveFolderId = await createDriveFolder(
          newFolderName.trim(),
          parentDriveId,
          googleAccessToken
        );
      } catch (err) {
        console.warn('Drive folder creation warning:', err);
      } finally {
        setIsSyncingDrive(false);
      }
    }

    const nowIso = new Date().toISOString();
    const newFolder: FolderItem = {
      id: `fld_${Date.now()}`,
      projectId: activeProject.id,
      ownerId: currentUser?.id || 'usr_chiki',
      parentId: currentFolderId,
      name: newFolderName.trim(),
      driveFolderId: createdDriveFolderId,
      createdBy: currentUser?.username || 'chiki',
      createdAt: nowIso,
    };

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      folders: [...workspace.folders, newFolder],
    };

    await saveWorkspace(updatedWorkspace);
    await syncFolderToFirestore(newFolder);
    setNewFolderName('');
    setShowFolderModal(false);
    showToast(`Carpeta "${newFolder.name}" creada.`);
  };

  // Upload ANY Files or Complete Folders (with nested subfolders)
  const processUploadedFileList = async (fileList: FileList | null, isFolderUpload: boolean) => {
    if (!fileList || fileList.length === 0 || !workspace || !activeProject) return;

    const filesArray = Array.from(fileList);
    const incomingTotalBytes = filesArray.reduce((sum, f) => sum + f.size, 0);

    const oversizedFile = filesArray.find((f) => f.size > MAX_SINGLE_FILE_BYTES);
    if (oversizedFile) {
      showToast(
        `El archivo "${oversizedFile.name}" (${formatBytes(oversizedFile.size)}) supera el límite gratuito por archivo de ${formatBytes(MAX_SINGLE_FILE_BYTES)}.`
      );
      return;
    }

    if (projectStorageBytes + incomingTotalBytes > MAX_PROJECT_STORAGE_BYTES) {
      showToast(
        `Espacio insuficiente en la cuota gratuita (${formatBytes(projectStorageBytes)} / ${formatBytes(MAX_PROJECT_STORAGE_BYTES)}). Extrae y elimina archivos antiguos.`
      );
      return;
    }

    setIsSyncingDrive(true);
    try {
      const nowIso = new Date().toISOString();
      const updatedFolders: FolderItem[] = [...workspace.folders];
      const newDocuments: DocumentItem[] = [];

      const pathFolderIdMap: Record<string, string> = { '': currentFolderId };

      const getOrCreateNestedFolderId = (relativeDirPath: string): string => {
        if (!relativeDirPath) return currentFolderId;
        if (pathFolderIdMap[relativeDirPath]) return pathFolderIdMap[relativeDirPath];

        const segments = relativeDirPath.split('/').filter(Boolean);
        let parentId = currentFolderId;
        let accumulatedPath = '';

        for (const seg of segments) {
          accumulatedPath = accumulatedPath ? `${accumulatedPath}/${seg}` : seg;
          if (pathFolderIdMap[accumulatedPath]) {
            parentId = pathFolderIdMap[accumulatedPath];
            continue;
          }

          const existing = updatedFolders.find(
            (f) =>
              f.projectId === activeProject.id &&
              f.parentId === parentId &&
              f.name.toLowerCase() === seg.toLowerCase()
          );

          if (existing) {
            parentId = existing.id;
            pathFolderIdMap[accumulatedPath] = existing.id;
          } else {
            const createdFolder: FolderItem = {
              id: `fld_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              projectId: activeProject.id,
              ownerId: currentUser?.id || 'usr_chiki',
              parentId,
              name: seg,
              driveFolderId: '',
              createdBy: currentUser?.username || 'chiki',
              createdAt: nowIso,
            };
            updatedFolders.push(createdFolder);
            parentId = createdFolder.id;
            pathFolderIdMap[accumulatedPath] = createdFolder.id;
          }
        }
        return parentId;
      };

      if (isFolderUpload) {
        for (const file of filesArray) {
          const relPath = (file as any).webkitRelativePath as string | undefined;
          if (relPath && relPath.includes('/')) {
            const dirPart = relPath.slice(0, relPath.lastIndexOf('/'));
            getOrCreateNestedFolderId(dirPart);
          }
        }
      }

      let driveFolderMap: Record<string, string> = {};
      if (googleAccessToken) {
        try {
          const res = await ensureProjectDriveHierarchy(activeProject, updatedFolders);
          driveFolderMap = res.folderMap;
        } catch (err) {
          console.warn('Could not sync folder hierarchy to Drive during upload:', err);
        }
      }

      for (const file of filesArray) {
        const relPath = (file as any).webkitRelativePath as string | undefined;
        let targetFolderId = currentFolderId;
        if (isFolderUpload && relPath && relPath.includes('/')) {
          const dirPart = relPath.slice(0, relPath.lastIndexOf('/'));
          targetFolderId = getOrCreateNestedFolderId(dirPart);
        }

        const ext = getFileExtension(file.name) || 'bin';
        const dataUrl = file.size <= 3 * 1024 * 1024 ? await readFileAsDataUrl(file) : '';
        const textPreview = await readFileTextSnippet(file, ext);

        let googleDocId = '';
        let googleDocUrl = '';

        if (googleAccessToken) {
          try {
            const parentDriveId = driveFolderMap[targetFolderId] || driveFolderMap.root || null;
            const editorKind = getGoogleEditorKind(ext);
            const uploadedDrive = await uploadFileToGoogleDrive(
              file.name,
              file,
              parentDriveId,
              googleAccessToken,
              Boolean(editorKind),
              true
            );
            googleDocId = uploadedDrive.googleDocId;
            googleDocUrl = uploadedDrive.googleDocUrl;
          } catch (err) {
            console.warn(`Could not upload ${file.name} to Google Drive:`, err);
          }
        }

        const docItem: DocumentItem = {
          id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          projectId: activeProject.id,
          ownerId: currentUser?.id || 'usr_chiki',
          folderId: targetFolderId,
          title: file.name,
          extension: ext,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          fileDataUrl: dataUrl,
          content: textPreview,
          googleDocId,
          googleDocUrl,
          assigneeUsername: currentUser?.username || 'chiki',
          assignedUsernames: [currentUser?.username || 'chiki'],
          status: 'draft',
          lastModifiedBy: currentUser?.username || 'chiki',
          lastSyncedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        newDocuments.push(docItem);
      }

      const updatedWorkspace: WorkspaceData = {
        ...workspace,
        folders: updatedFolders,
        documents: [...newDocuments, ...workspace.documents],
      };

      await saveWorkspace(updatedWorkspace);
      for (const d of newDocuments.slice(0, 10)) {
        await syncDocumentToFirestore(d);
      }

      showToast(
        isFolderUpload
          ? `Carpeta subida con ${newDocuments.length} archivo(s) (${formatBytes(incomingTotalBytes)}).`
          : `${newDocuments.length} archivo(s) subido(s) (${formatBytes(incomingTotalBytes)}).`
      );
    } catch (err: any) {
      showToast(err?.message || 'Error al procesar los archivos subidos.');
    } finally {
      setIsSyncingDrive(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  // Open a compatible file in Google Docs / Sheets / Slides
  const handleOpenInGoogleEditor = async (docItem: DocumentItem) => {
    const ext = docItem.extension || getFileExtension(docItem.title);
    const editorKind = getGoogleEditorKind(ext);

    if (!editorKind) {
      showToast(
        `El archivo "${docItem.title}" (.${ext.toUpperCase()}) no se abre con editores de Google. Puedes extraerlo.`
      );
      return;
    }

    if (docItem.googleDocUrl) {
      window.open(docItem.googleDocUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (googleAccessToken && workspace && activeProject) {
      try {
        setIsSyncingDrive(true);
        showToast(`Abriendo "${docItem.title}" en ${getGoogleEditorLabel(editorKind)}...`);
        const { folderMap } = await ensureProjectDriveHierarchy(activeProject);
        const parentDriveId = folderMap[docItem.folderId] || folderMap.root || null;

        const hasBinary = Boolean(docItem.fileDataUrl && docItem.fileDataUrl.startsWith('data:'));
        const fileBlob = hasBinary
          ? dataUrlToBlob(docItem.fileDataUrl!, docItem.content, docItem.mimeType)
          : new Blob([docItem.content || ''], { type: 'text/plain;charset=utf-8' });

        const created = await uploadFileToGoogleDrive(
          docItem.title,
          fileBlob,
          parentDriveId,
          googleAccessToken,
          true,
          hasBinary
        );

        const updatedDoc: DocumentItem = {
          ...docItem,
          googleDocId: created.googleDocId,
          googleDocUrl: created.googleDocUrl,
          lastSyncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const updatedWorkspace: WorkspaceData = {
          ...workspace,
          documents: workspace.documents.map((d) => (d.id === docItem.id ? updatedDoc : d)),
        };

        await saveWorkspace(updatedWorkspace);
        await syncDocumentToFirestore(updatedDoc);
        window.open(created.googleDocUrl, '_blank', 'noopener,noreferrer');
      } catch (err: any) {
        showToast(err?.message || 'Error al abrir archivo en Google Drive.');
      } finally {
        setIsSyncingDrive(false);
      }
      return;
    }

    setGooglePromptModal({
      isOpen: true,
      title: `Inicia sesión con Google para abrir en ${getGoogleEditorLabel(editorKind)}`,
      description: `Para subir y abrir "${docItem.title}" automáticamente en ${getGoogleEditorLabel(editorKind)}, primero debes iniciar sesión con tu cuenta de Google.`,
      continueLocalLabel: 'O pegar un enlace compartido de Google manualmente',
      onContinueLocal: () => {
        setGooglePromptModal((prev) => ({ ...prev, isOpen: false }));
        setLinkingDocItem(docItem);
        setLinkGoogleUrlInput(docItem.googleDocUrl || '');
      },
    });
  };

  // Save a linked Google Docs/Sheets/Slides URL on a file
  const handleSaveLinkedGoogleUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !linkingDocItem || !linkGoogleUrlInput.trim()) return;

    const ext = linkingDocItem.extension || getFileExtension(linkingDocItem.title);
    const editorKind = getGoogleEditorKind(ext);
    const parsedId = parseGoogleDocId(linkGoogleUrlInput);
    let finalUrl = linkGoogleUrlInput.trim();
    if (!finalUrl.startsWith('http')) {
      if (editorKind === 'sheets') {
        finalUrl = `https://docs.google.com/spreadsheets/d/${parsedId}/edit`;
      } else if (editorKind === 'slides') {
        finalUrl = `https://docs.google.com/presentation/d/${parsedId}/edit`;
      } else {
        finalUrl = `https://docs.google.com/document/d/${parsedId}/edit`;
      }
    }

    const updatedDoc: DocumentItem = {
      ...linkingDocItem,
      googleDocId: parsedId,
      googleDocUrl: finalUrl,
      updatedAt: new Date().toISOString(),
    };

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      documents: workspace.documents.map((d) => (d.id === linkingDocItem.id ? updatedDoc : d)),
    };

    await saveWorkspace(updatedWorkspace);
    await syncDocumentToFirestore(updatedDoc);
    setLinkingDocItem(null);
    setLinkGoogleUrlInput('');
    showToast(`Enlace de Google vinculado a "${updatedDoc.title}".`);
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  };

  // Extract / Download a Single File
  const handleExtractSingleFile = async (docItem: DocumentItem) => {
    try {
      const ext = docItem.extension || getFileExtension(docItem.title) || 'txt';
      let blob: Blob | null = null;

      if (docItem.googleDocId && getGoogleEditorKind(ext) && !googleAccessToken) {
        setGooglePromptModal({
          isOpen: true,
          title: 'Inicia sesión con Google para descargar este documento',
          description: `El archivo "${docItem.title}" está conectado con Google Docs/Sheets/Slides. Debes iniciar sesión con Google para exportar y descargar su última versión en formato .${ext.toUpperCase()}.`,
          continueLocalLabel: docItem.googleDocUrl
            ? 'Abrir el documento en Google en su lugar'
            : undefined,
          onContinueLocal: docItem.googleDocUrl
            ? () => {
                setGooglePromptModal((prev) => ({ ...prev, isOpen: false }));
                window.open(docItem.googleDocUrl, '_blank', 'noopener,noreferrer');
              }
            : undefined,
        });
        return;
      }

      if (docItem.googleDocId && googleAccessToken && getGoogleEditorKind(ext)) {
        showToast(`Extrayendo última versión de "${docItem.title}" desde Google Drive...`);
        blob = await exportGoogleWorkspaceFileBlob(docItem.googleDocId, ext, googleAccessToken);
      }

      if (!blob) {
        blob = dataUrlToBlob(
          docItem.fileDataUrl || '',
          docItem.content || `Archivo ${docItem.title}`,
          docItem.mimeType || 'application/octet-stream'
        );
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = docItem.title.includes('.') ? docItem.title : `${docItem.title}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Archivo "${docItem.title}" extraído.`);
    } catch {
      showToast('Error al extraer el archivo.');
    }
  };

  // Extract / Download an Entire Folder (and nested subfolders) as .ZIP
  const handleExtractFolderAsZip = async (
    targetFolderId: string,
    folderLabel: string,
    allowLocalOnly = false
  ) => {
    if (!activeProject) return;

    const collectDocsInTree = (folderId: string): DocumentItem[] => {
      const direct = projectDocuments.filter((d) => d.folderId === folderId);
      const children = projectFolders.filter((f) => f.parentId === folderId);
      return [...direct, ...children.flatMap((c) => collectDocsInTree(c.id))];
    };

    const treeDocs = collectDocsInTree(targetFolderId);
    const hasGoogleLinkedDocs = treeDocs.some((d) => {
      const ext = d.extension || getFileExtension(d.title) || 'txt';
      return Boolean(d.googleDocId && getGoogleEditorKind(ext));
    });

    if (hasGoogleLinkedDocs && !googleAccessToken && !allowLocalOnly) {
      setGooglePromptModal({
        isOpen: true,
        title: 'Inicia sesión con Google para extraer esta carpeta en .ZIP',
        description: `La carpeta "${folderLabel}" contiene documentos de Google Docs/Sheets/Slides. Inicia sesión con Google para incluir sus versiones actualizadas en el archivo .ZIP.`,
        continueLocalLabel: 'Generar .ZIP solo con archivos locales disponibles',
        onContinueLocal: () => {
          setGooglePromptModal((prev) => ({ ...prev, isOpen: false }));
          handleExtractFolderAsZip(targetFolderId, folderLabel, true);
        },
      });
      return;
    }

    setIsExtractingZip(true);
    try {
      const zip = new JSZip();

      const addFolderContentsToZip = async (folderId: string, zipFolder: JSZip) => {
        const docsInFolder = projectDocuments.filter((d) => d.folderId === folderId);
        for (const docItem of docsInFolder) {
          const ext = docItem.extension || getFileExtension(docItem.title) || 'txt';
          const fileName = docItem.title.includes('.') ? docItem.title : `${docItem.title}.${ext}`;

          let fileBlob: Blob | null = null;
          if (docItem.googleDocId && googleAccessToken && getGoogleEditorKind(ext)) {
            fileBlob = await exportGoogleWorkspaceFileBlob(
              docItem.googleDocId,
              ext,
              googleAccessToken
            );
          }
          if (!fileBlob) {
            fileBlob = dataUrlToBlob(
              docItem.fileDataUrl || '',
              docItem.content || '',
              docItem.mimeType || 'application/octet-stream'
            );
          }
          zipFolder.file(fileName, fileBlob);
        }

        const subFolders = projectFolders.filter((f) => f.parentId === folderId);
        for (const sub of subFolders) {
          const childZip = zipFolder.folder(sub.name);
          if (childZip) {
            await addFolderContentsToZip(sub.id, childZip);
          }
        }
      };

      await addFolderContentsToZip(targetFolderId, zip);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const cleanName = folderLabel.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Carpeta_Proyecto';

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cleanName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Carpeta "${folderLabel}" extraída en formato .ZIP.`);
    } catch {
      showToast('Error al generar el archivo .ZIP de la carpeta.');
    } finally {
      setIsExtractingZip(false);
    }
  };

  // Change assignee of an uploaded file
  const handleChangeFileAssignee = async (docItem: DocumentItem, newAssignee: string) => {
    if (!workspace) return;
    const updatedDoc: DocumentItem = {
      ...docItem,
      assigneeUsername: newAssignee,
      updatedAt: new Date().toISOString(),
    };
    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      documents: workspace.documents.map((d) => (d.id === docItem.id ? updatedDoc : d)),
    };
    await saveWorkspace(updatedWorkspace);
    await syncDocumentToFirestore(updatedDoc);
    showToast(`Archivo "${docItem.title}" asignado a @${newAssignee}.`);
  };

  // Delete File
  const handleDeleteDocument = (docItem: DocumentItem) => {
    if (!workspace) return;
    setConfirmDialog({
      isOpen: true,
      title: `¿Eliminar "${docItem.title}"?`,
      description:
        'Se eliminará el archivo del proyecto y liberará espacio de la cuota gratuita. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar archivo',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        if (docItem.googleDocId && googleAccessToken) {
          try {
            await deleteDriveItem(docItem.googleDocId, googleAccessToken);
          } catch (err) {
            console.warn('Could not delete from Drive:', err);
          }
        }
        const updatedWorkspace: WorkspaceData = {
          ...workspace,
          documents: workspace.documents.filter((d) => d.id !== docItem.id),
        };
        await saveWorkspace(updatedWorkspace);
        await deleteFromFirestoreSubcollection(docItem.projectId, 'documents', docItem.id);
        showToast(`Archivo "${docItem.title}" eliminado.`);
      },
    });
  };

  // Delete Folder
  const handleDeleteFolder = (folder: FolderItem) => {
    if (!workspace) return;
    setConfirmDialog({
      isOpen: true,
      title: `¿Eliminar la carpeta "${folder.name}"?`,
      description:
        'Los archivos dentro de esta carpeta pasarán a la raíz del proyecto para que no se pierda ningún trabajo.',
      confirmLabel: 'Eliminar carpeta',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        if (folder.driveFolderId && googleAccessToken) {
          try {
            await deleteDriveItem(folder.driveFolderId, googleAccessToken);
          } catch (err) {
            console.warn('Could not delete Drive folder:', err);
          }
        }
        const updatedWorkspace: WorkspaceData = {
          ...workspace,
          folders: workspace.folders.filter((f) => f.id !== folder.id),
          documents: workspace.documents.map((d) =>
            d.folderId === folder.id ? { ...d, folderId: 'root' } : d
          ),
        };
        await saveWorkspace(updatedWorkspace);
        await deleteFromFirestoreSubcollection(folder.projectId, 'folders', folder.id);
        if (currentFolderId === folder.id) {
          setCurrentFolderId('root');
        }
        showToast(`Carpeta "${folder.name}" eliminada.`);
      },
    });
  };

  // Tasks Management Handlers
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !activeProject || !newTaskTitle.trim()) return;

    const nowIso = new Date().toISOString();
    const task: TaskItem = {
      id: `tsk_${Date.now()}`,
      projectId: activeProject.id,
      ownerId: currentUser?.id || 'usr_chiki',
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      assigneeUsername: newTaskAssignee || currentUser?.username || 'chiki',
      dueDate: newTaskDueDate,
      status: newTaskStatus,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      tasks: [task, ...workspace.tasks],
    };

    await saveWorkspace(updatedWorkspace);
    await syncTaskToFirestore(task);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setShowTaskModal(false);
    showToast(`Tarea asignada a @${task.assigneeUsername}.`);
  };

  const handleUpdateTaskStatus = async (task: TaskItem, nextStatus: TaskStatus) => {
    if (!workspace || !activeProject) return;
    const updatedTask: TaskItem = {
      ...task,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      tasks: workspace.tasks.map((t) => (t.id === task.id ? updatedTask : t)),
    };
    await saveWorkspace(updatedWorkspace);
    await syncTaskToFirestore(updatedTask);
  };

  const handleDeleteTask = (task: TaskItem) => {
    if (!workspace) return;
    setConfirmDialog({
      isOpen: true,
      title: `¿Eliminar la tarea "${task.title}"?`,
      description: 'Esta tarea se borrará del proyecto.',
      confirmLabel: 'Eliminar tarea',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const updatedWorkspace: WorkspaceData = {
          ...workspace,
          tasks: workspace.tasks.filter((t) => t.id !== task.id),
        };
        await saveWorkspace(updatedWorkspace);
        await deleteFromFirestoreSubcollection(task.projectId, 'tasks', task.id);
        showToast('Tarea eliminada.');
      },
    });
  };

  // Notice Board Handlers
  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !activeProject || !newNoticeTitle.trim() || !newNoticeMessage.trim()) return;

    const nowIso = new Date().toISOString();
    const notice: NoticeItem = {
      id: `not_${Date.now()}`,
      projectId: activeProject.id,
      ownerId: currentUser?.id || 'usr_chiki',
      title: newNoticeTitle.trim(),
      message: newNoticeMessage.trim(),
      priority: newNoticePriority,
      authorUsername: currentUser?.username || 'chiki',
      targetUsername: newNoticeTarget || 'all',
      archived: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      notices: [notice, ...workspace.notices],
    };

    await saveWorkspace(updatedWorkspace);
    await syncNoticeToFirestore(notice);
    setNewNoticeTitle('');
    setNewNoticeMessage('');
    setShowNoticeModal(false);
    showToast('Anuncio publicado en el tablón del proyecto.');
  };

  const handleToggleArchiveNotice = async (notice: NoticeItem) => {
    if (!workspace) return;
    const updatedNotice: NoticeItem = {
      ...notice,
      archived: !notice.archived,
      updatedAt: new Date().toISOString(),
    };
    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      notices: workspace.notices.map((n) => (n.id === notice.id ? updatedNotice : n)),
    };
    await saveWorkspace(updatedWorkspace);
    await syncNoticeToFirestore(updatedNotice);
    showToast(updatedNotice.archived ? 'Anuncio archivado.' : 'Anuncio restaurado.');
  };

  const handleDeleteNotice = (notice: NoticeItem) => {
    if (!workspace) return;
    setConfirmDialog({
      isOpen: true,
      title: `¿Eliminar el anuncio "${notice.title}"?`,
      description: 'Se eliminará permanentemente del tablón del proyecto.',
      confirmLabel: 'Eliminar anuncio',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const updatedWorkspace: WorkspaceData = {
          ...workspace,
          notices: workspace.notices.filter((n) => n.id !== notice.id),
        };
        await saveWorkspace(updatedWorkspace);
        await deleteFromFirestoreSubcollection(notice.projectId, 'notices', notice.id);
        showToast('Anuncio eliminado.');
      },
    });
  };

  // Team Chat Handler
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !activeProject || !chatInput.trim()) return;

    const nowIso = new Date().toISOString();
    const msg = {
      id: `msg_${Date.now()}`,
      projectId: activeProject.id,
      ownerId: currentUser?.id || 'usr_chiki',
      senderUsername: currentUser?.username || 'chiki',
      text: chatInput.trim(),
      createdAt: nowIso,
    };

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      messages: [...workspace.messages, msg],
    };
    setChatInput('');
    await saveWorkspace(updatedWorkspace);
    await syncMessageToFirestore(msg);
  };

  // Strictly Scoped Project AI Assistant Handler
  const handleAskProjectAi = async (customPrompt?: string) => {
    const questionText = (customPrompt ?? aiQuestion).trim();
    if (!questionText || !activeProject || isAiThinking) return;

    const userMsg = {
      id: `ai_u_${Date.now()}`,
      role: 'user' as const,
      text: questionText,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setAiQuestion('');
    setIsAiThinking(true);

    try {
      const foldersSummary = projectFolders.map((f) => `- Carpeta: ${f.name}`).join('\n');
      const documentsSummary = projectDocuments
        .map(
          (d) =>
            `- Archivo: "${d.title}" (.${(d.extension || getFileExtension(d.title) || 'bin').toUpperCase()}, Responsable: @${d.assigneeUsername})\n  Resumen: ${d.content.slice(0, 300)}`
        )
        .join('\n\n');
      const tasksSummary = projectTasks
        .map((t) => `- [${t.status}] ${t.title} (Responsable: @${t.assigneeUsername})`)
        .join('\n');
      const noticesSummary = projectNotices
        .filter((n) => !n.archived)
        .map((n) => `- [${n.priority.toUpperCase()}] ${n.title}: ${n.message}`)
        .join('\n');

      const res = await fetch('/api/ai/project-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          history: aiMessages.map((m) => ({ role: m.role, text: m.text })),
          projectContext: {
            name: activeProject.name,
            subject: activeProject.subject,
            description: activeProject.description,
            authorizedUsernames: activeProject.authorizedUsernames,
            dueDate: activeProject.dueDate.slice(0, 10),
            foldersSummary,
            documentsSummary,
            tasksSummary,
            noticesSummary,
          },
        }),
      });

      const data = await res.json();
      const replyText = res.ok
        ? data.answer
        : data.error || 'No se pudo obtener respuesta de la IA.';

      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai_a_${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          role: 'assistant',
          text: 'Error de red al conectar con la IA del proyecto.',
          timestamp: 'Ahora',
        },
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  // Task Summary Metrics
  const taskMetrics = useMemo(() => {
    const total = projectTasks.length;
    const completed = projectTasks.filter((t) => t.status === 'completed').length;
    const inProgress = projectTasks.filter((t) => t.status === 'in_progress').length;
    const pending = projectTasks.filter((t) => t.status === 'pending').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, pending, pct };
  }, [projectTasks]);

  const filteredTasks = useMemo(() => {
    return projectTasks.filter((t) => {
      if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) return false;
      if (
        taskAssigneeFilter !== 'all' &&
        t.assigneeUsername.toLowerCase() !== taskAssigneeFilter.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }, [projectTasks, taskStatusFilter, taskAssigneeFilter]);

  const visibleNotices = useMemo(() => {
    return projectNotices.filter((n) =>
      noticeArchiveView === 'archived' ? n.archived : !n.archived
    );
  }, [projectNotices, noticeArchiveView]);

  const daysRemaining = useMemo(() => {
    if (!activeProject?.dueDate) return 0;
    const due = new Date(activeProject.dueDate).getTime();
    const now = new Date('2026-11-17T09:00:00Z').getTime();
    return Math.max(0, Math.ceil((due - now) / (1000 * 60 * 60 * 24)));
  }, [activeProject]);

  // PUBLIC LEGAL ROUTES (/privacidad, /privacy, /terminos, /terms) — Always accessible without login
  if (currentPath === '/privacidad' || currentPath === '/privacy') {
    return <LegalPages page="privacy" onNavigate={navigateTo} />;
  }
  if (currentPath === '/terminos' || currentPath === '/terms') {
    return <LegalPages page="terms" onNavigate={navigateTo} />;
  }

  if (isLoadingWorkspace) {
    return (
      <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex items-center justify-center p-6">
        <div className="border border-[#24242E] bg-[#0E0E12] px-6 py-5 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-[#3B82F6] animate-spin" />
          <span className="font-mono text-xs tracking-wider uppercase text-[#A1A1B2]">
            Cargando Proyectos Nebrija App...
          </span>
        </div>
      </div>
    );
  }

  // 1. INTERACTIVE 6-CARD ANIMATED BENTO TOUR (Triggered on click or post-registration)
  if (showOnboarding) {
    return (
      <ChikiOnboardingModal
        onComplete={() => {
          localStorage.setItem('chikihub_onboarding_seen_v3', 'true');
          setShowOnboarding(false);
        }}
      />
    );
  }

  // 2. PUBLIC HOMEPAGE FOR "PROYECTOS NEBRIJA APP" (100% PUBLIC CONTENT + INTEGRATED ACCESS)
  if (!currentUser) {
    return (
      <div className="min-h-screen bento-grid-bg text-[#F4F4F6] flex flex-col justify-between">
        {/* Top Bar Contract (Exact Brand Match: Proyectos Nebrija App) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-6 px-6 py-4 border-b border-[#22222A] bg-[#09090B]/95">
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/');
              }}
              className="font-display font-bold text-base tracking-tight text-white whitespace-nowrap"
            >
              Proyectos Nebrija App
            </a>
            <span className="hidden sm:inline font-mono text-[10px] text-[#60A5FA] border border-[#2A2A35] bg-[#121218] px-2 py-0.5">
              CHIKIHUB
            </span>
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-[#8E8E9E]">
            <a href="#funciones" className="hover:text-white transition-colors whitespace-nowrap">
              Funciones
            </a>
            <a href="#google-workspace" className="hover:text-white transition-colors whitespace-nowrap">
              Google Drive & Docs
            </a>
            <a
              href="/privacidad"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/privacidad');
              }}
              className="hover:text-white transition-colors whitespace-nowrap"
            >
              Política de Privacidad
            </a>
            <a
              href="/terminos"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/terminos');
              }}
              className="hover:text-white transition-colors whitespace-nowrap"
            >
              Términos de Servicio
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowOnboarding(true)}
              className="px-3.5 py-2 text-xs font-mono border border-[#2A2A35] bg-[#121218] hover:border-white text-[#D4D4DC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ver Presentación (6)
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode((m) => (m === 'login' ? 'register' : 'login'));
                document.getElementById('acceso-grupo')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-4 py-2 text-xs font-semibold bg-white hover:bg-zinc-200 text-[#09090B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {authMode === 'login' ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </button>
          </div>
        </header>

        {/* Public Informational Hero + Integrated Bento Access Grid */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-8">
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#22222A] border border-[#22222A]">
            {/* Left Bento Column (7 cols): Full Public App Information (Zero Login Wall) */}
            <div className="lg:col-span-7 bg-[#0E0E12] flex flex-col justify-between">
              <div className="p-6 sm:p-8 border-b border-[#22222A]">
                <p className="font-mono text-xs text-[#60A5FA] mb-2">
                  PROYECTOS NEBRIJA APP · PLATAFORMA COLABORATIVA DE INFORMÁTICA
                </p>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
                  Proyectos Nebrija App
                </h1>
                <p className="text-sm text-[#B4B4C2] leading-relaxed mb-4">
                  Espacio colaborativo gratuito creado para equipos de estudiantes de informática.
                  Centraliza las carpetas del proyecto, vincula y edita documentos en{' '}
                  <strong className="text-white">Google Docs, Google Sheets y Google Slides</strong>,
                  organiza tareas por responsable y extrae cualquier carpeta completa en{' '}
                  <code className="text-white font-mono">.ZIP</code> desde distintos portátiles.
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowOnboarding(true)}
                    className="h-10 px-4 border border-[#3B82F6] bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ver Tour Interactivo (6 Tarjetas)</span>
                  </button>
                  <a
                    href="/privacidad"
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo('/privacidad');
                    }}
                    className="h-10 px-4 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-xs text-[#D4D4DC] font-medium inline-flex items-center gap-2"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Política de Privacidad</span>
                  </a>
                </div>
              </div>

              {/* 2x2 Sub-Bento Capabilities Grid */}
              <div id="funciones" className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#22222A]">
                <div className="p-6 bg-[#0E0E12]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-semibold text-sm text-white">
                      Google Docs, Sheets y Slides
                    </span>
                    <FileSpreadsheet className="w-4 h-4 text-[#60A5FA]" />
                  </div>
                  <p className="text-xs text-[#8E8E9E] leading-relaxed">
                    Crea archivos compartidos pegando enlaces de Google o sube{' '}
                    <code className="text-white">.DOCX</code>,{' '}
                    <code className="text-white">.XLSX</code> y{' '}
                    <code className="text-white">.PPTX</code> para abrirlos directamente en los
                    editores de Google Workspace.
                  </p>
                </div>

                <div className="p-6 bg-[#0E0E12]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-semibold text-sm text-white">
                      Subida y Extracción .ZIP
                    </span>
                    <Download className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-xs text-[#8E8E9E] leading-relaxed">
                    Sube carpetas con subcarpetas anidadas (como prácticas de redes, scripts o
                    memorias) y extrae cualquier directorio comprimido en <code className="text-white">.ZIP</code>.
                  </p>
                </div>

                <div className="p-6 bg-[#0E0E12]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-semibold text-sm text-white">
                      Cuota 100% Gratuita
                    </span>
                    <HardDrive className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-xs text-[#8E8E9E] leading-relaxed tabular-nums">
                    Hasta {MAX_ACTIVE_PROJECTS} proyectos activos y{' '}
                    {formatBytes(MAX_PROJECT_STORAGE_BYTES)} por proyecto con acceso protegido para
                    compañeros autorizados.
                  </p>
                </div>

                <div className="p-6 bg-[#0E0E12]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-display font-semibold text-sm text-white">
                      IA Contextual, Tareas y Avisos
                    </span>
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-xs text-[#8E8E9E] leading-relaxed">
                    Panel de tareas con fecha de entrega, tablón de avisos del equipo y asistente IA
                    exclusivo enfocado en el proyecto activo.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Bento Column (5 cols): Login / Create Account Form */}
            <div
              id="acceso-grupo"
              className="lg:col-span-5 bg-[#0B0B0F] p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#22222A]">
                  <div>
                    <h2 className="font-display font-bold text-lg text-white">
                      {authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta de Grupo'}
                    </h2>
                    <p className="text-xs text-[#8E8E9E]">
                      Identifícate para entrar al espacio del proyecto
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-[#60A5FA] tabular-nums">
                    01 / ACCESO
                  </span>
                </div>

                {/* Rectangular Mode Switch */}
                <div className="grid grid-cols-2 gap-px bg-[#24242E] border border-[#24242E] mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError('');
                    }}
                    className={`py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      authMode === 'login'
                        ? 'bg-white text-[#09090B]'
                        : 'bg-[#0E0E12] text-[#8E8E9E] hover:text-white'
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Iniciar Sesión</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError('');
                    }}
                    className={`py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      authMode === 'register'
                        ? 'bg-white text-[#09090B]'
                        : 'bg-[#0E0E12] text-[#8E8E9E] hover:text-white'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Crear Cuenta</span>
                  </button>
                </div>

                <form onSubmit={handleStudentAuthSubmit} className="space-y-4">
                  <div>
                    <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1.5">
                      Usuario
                    </label>
                    <input
                      type="text"
                      required
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      placeholder="ej. chiki, alex, lucia..."
                      className="w-full h-11 px-3.5 bg-[#09090B] border border-[#2A2A35] text-sm text-white focus:outline-none focus:border-white"
                    />
                  </div>

                  {authMode === 'register' && (
                    <>
                      <div>
                        <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1.5">
                          Nombre o Apodo
                        </label>
                        <input
                          type="text"
                          value={authDisplayName}
                          onChange={(e) => setAuthDisplayName(e.target.value)}
                          placeholder="ej. Adrián (Chiki)"
                          className="w-full h-11 px-3.5 bg-[#09090B] border border-[#2A2A35] text-sm text-white focus:outline-none focus:border-white"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1.5">
                          Rol / Especialidad
                        </label>
                        <input
                          type="text"
                          value={authRole}
                          onChange={(e) => setAuthRole(e.target.value)}
                          placeholder="ej. Redes, Sistemas, Base de Datos..."
                          className="w-full h-11 px-3.5 bg-[#09090B] border border-[#2A2A35] text-sm text-white focus:outline-none focus:border-white"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1.5">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Introduce tu contraseña"
                      className="w-full h-11 px-3.5 bg-[#09090B] border border-[#2A2A35] text-sm text-white focus:outline-none focus:border-white"
                    />
                  </div>

                  {authError && (
                    <div className="p-3 border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300">
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full h-11 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    {authMode === 'login' ? 'Entrar a ChikiHub' : 'Registrar Cuenta y Entrar'}
                  </button>
                </form>
              </div>

              <div className="pt-6 mt-6 border-t border-[#22222A] flex items-center justify-between text-[11px] text-[#7E7E8E]">
                <span>100% Gratis · Edición en Google Docs</span>
                <span className="font-mono tabular-nums">MAX {MAX_ACTIVE_PROJECTS} PROYECTOS</span>
              </div>
            </div>
          </div>

          {/* Public Google Workspace & Data Transparency Bento Section (Required for OAuth Verification) */}
          <section
            id="google-workspace"
            className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#22222A] border border-[#22222A]"
          >
            <div className="bg-[#0E0E12] p-6 space-y-2">
              <span className="font-mono text-[11px] text-[#60A5FA] uppercase font-bold">
                01 · USO DE GOOGLE DRIVE & DOCS
              </span>
              <h2 className="font-display font-bold text-base text-white">
                Por qué solicitamos conexión con Google
              </h2>
              <p className="text-xs text-[#9E9EAE] leading-relaxed">
                Proyectos Nebrija App conecta con tu cuenta de Google únicamente cuando tú lo
                autorizas para crear carpetas del proyecto en Google Drive, abrir archivos Word,
                Excel y PowerPoint en Google Docs/Sheets/Slides y descargar la última versión en{' '}
                <code className="text-white">.ZIP</code>.
              </p>
            </div>

            <div className="bg-[#0E0E12] p-6 space-y-2">
              <span className="font-mono text-[11px] text-emerald-400 uppercase font-bold">
                02 · PRIVACIDAD Y USO LIMITADO
              </span>
              <h2 className="font-display font-bold text-base text-white">
                Tus archivos personales siguen privados
              </h2>
              <p className="text-xs text-[#9E9EAE] leading-relaxed">
                La aplicación cumple con la Política de Datos de Usuario de las API de Google
                (Limited Use). Solo accede a los documentos creados o vinculados dentro del proyecto,
                nunca vende datos y permite revocar permisos en cualquier momento.
              </p>
            </div>

            <div className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-4">
              <div className="space-y-2">
                <span className="font-mono text-[11px] text-amber-400 uppercase font-bold">
                  03 · DOCUMENTACIÓN LEGAL Y SOPORTE
                </span>
                <h2 className="font-display font-bold text-base text-white">
                  Transparencia verificable
                </h2>
                <p className="text-xs text-[#9E9EAE] leading-relaxed">
                  Consulta nuestra Política de Privacidad completa, los Términos de Servicio o
                  contacta con el administrador en{' '}
                  <span className="text-white font-mono">adrianbelvis14@gmail.com</span>.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/privacidad"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo('/privacidad');
                  }}
                  className="px-3.5 py-2 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs"
                >
                  Leer Política de Privacidad
                </a>
                <a
                  href="/terminos"
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo('/terminos');
                  }}
                  className="px-3.5 py-2 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-xs text-white"
                >
                  Términos de Servicio
                </a>
              </div>
            </div>
          </section>
        </main>

        {/* Public Footer with Exact App Name & Legal Links */}
        <footer className="border-t border-[#22222A] bg-[#09090B] px-6 py-5">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#8E8E9E]">
            <span>
              © 2026 <strong className="text-white">Proyectos Nebrija App</strong> (ChikiHub) ·
              Contacto: adrianbelvis14@gmail.com
            </span>
            <div className="flex items-center gap-5">
              <a
                href="/privacidad"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('/privacidad');
                }}
                className="hover:text-white underline transition-colors"
              >
                Política de Privacidad
              </a>
              <a
                href="/terminos"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('/terminos');
                }}
                className="hover:text-white underline transition-colors"
              >
                Términos de Servicio
              </a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // Helper to render clean technical file extension icon
  const renderTechnicalFileIcon = (docItem: DocumentItem) => {
    const ext = (docItem.extension || getFileExtension(docItem.title) || 'bin').toLowerCase();
    const editorKind = getGoogleEditorKind(ext);

    let iconColor = 'text-[#A1A1B2] border-[#2A2A35] bg-[#121218]';
    let IconComponent = FileArchive;

    if (editorKind === 'docs') {
      iconColor = 'text-[#60A5FA] border-[#3B82F6]/40 bg-[#3B82F6]/10';
      IconComponent = FileText;
    } else if (editorKind === 'sheets') {
      iconColor = 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
      IconComponent = FileSpreadsheet;
    } else if (editorKind === 'slides') {
      iconColor = 'text-amber-400 border-amber-500/40 bg-amber-500/10';
      IconComponent = Presentation;
    } else if (ext === 'pdf') {
      iconColor = 'text-rose-400 border-rose-500/40 bg-rose-500/10';
      IconComponent = FileText;
    }

    return (
      <div className={`w-11 h-11 border flex items-center justify-center shrink-0 ${iconColor}`}>
        <IconComponent className="w-5 h-5" />
      </div>
    );
  };

  // Navigation Tabs Config (Folio / ArtCraft numbered section tabs)
  const navSections: { id: BentoSectionTab; num: string; label: string; count?: string }[] = [
    { id: 'overview', num: '01', label: 'Resumen' },
    {
      id: 'files',
      num: '02',
      label: 'Archivos y Carpetas',
      count: `${projectDocuments.length}`,
    },
    {
      id: 'tasks',
      num: '03',
      label: 'Tareas',
      count: `${taskMetrics.completed}/${taskMetrics.total}`,
    },
    {
      id: 'notices',
      num: '04',
      label: 'Avisos',
      count: `${projectNotices.filter((n) => !n.archived).length}`,
    },
    { id: 'assistant', num: '05', label: 'IA y Chat' },
    {
      id: 'projects',
      num: '06',
      label: 'Proyectos y Drive',
      count: `${workspace?.projects.length || 0}/${MAX_ACTIVE_PROJECTS}`,
    },
  ];

  // 3. MAIN SPACIOUS MULTI-TAB BENTO WORKSPACE
  return (
    <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex flex-col">
      {/* Hidden File & Folder Upload Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => processUploadedFileList(e.target.files, false)}
        className="hidden"
      />
      <input
        ref={(el) => {
          folderInputRef.current = el;
          if (el) {
            el.setAttribute('webkitdirectory', '');
            el.setAttribute('directory', '');
          }
        }}
        type="file"
        multiple
        onChange={(e) => processUploadedFileList(e.target.files, true)}
        className="hidden"
      />

      {/* Toast Notification */}
      {syncBannerMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm border border-white bg-[#0E0E12] px-4 py-3 shadow-2xl flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-white">{syncBannerMessage}</p>
          <button
            type="button"
            onClick={() => setSyncBannerMessage(null)}
            className="text-[#8E8E9E] hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ==================== TOP BAR CONTRACT (3 ZONES, 1 ROW, 1PX BORDER) ==================== */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-4 border-b border-[#22222A] bg-[#09090B]/95">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('overview');
          }}
          className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Proyectos Nebrija App
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden lg:flex items-center gap-7 text-xs font-medium text-[#8E8E9E]">
          {navSections.slice(0, 5).map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveSection(sec.id)}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                activeSection === sec.id
                  ? 'text-white border-b-2 border-white font-semibold'
                  : 'hover:text-white'
              }`}
            >
              {sec.num}. {sec.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSection('projects')}
            className={`px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'projects'
                ? 'bg-[#3B82F6] text-white'
                : 'bg-white hover:bg-zinc-200 text-[#09090B]'
            }`}
          >
            Proyectos y Cuenta ({workspace?.projects.length || 0}/{MAX_ACTIVE_PROJECTS})
          </button>
        </div>
      </header>

      {/* ==================== SECTION TABS BAR (NUMBERED TABS WITH SPACIOUS BREATHING ROOM) ==================== */}
      <div className="border-b border-[#22222A] bg-[#0E0E12]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center divide-x divide-[#22222A] border-x border-[#22222A] overflow-x-auto no-scrollbar min-w-0">
            {navSections.map((sec) => {
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSection(sec.id)}
                  className={`px-3.5 sm:px-4 py-3.5 text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#09090B] font-semibold'
                      : 'bg-[#0E0E12] text-[#9E9EAE] hover:bg-[#15151C] hover:text-white'
                  }`}
                >
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      isActive ? 'text-[#09090B]/70' : 'text-[#60A5FA]'
                    }`}
                  >
                    {sec.num}
                  </span>
                  <span>{sec.label}</span>
                  {sec.count !== undefined && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isActive ? 'text-[#09090B]/70' : 'text-[#6E6E7E]'
                      }`}
                    >
                      ({sec.count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Non-clipping User & Logout Badge on the right */}
          <div className="hidden md:flex items-center gap-2 shrink-0 pl-2">
            <span className="px-3 py-1.5 border border-[#2A2A35] bg-[#121218] font-mono text-xs text-white whitespace-nowrap">
              @{currentUser.username}
            </span>
            <button
              type="button"
              onClick={handleLogoutStudent}
              title="Cerrar sesión"
              className="p-1.5 border border-[#2A2A35] bg-[#121218] text-[#8E8E9E] hover:text-rose-400 cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ==================== MAIN SPACIOUS CONTAINER ==================== */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Persistent Google Sign-In Reminder Strip when Google is not yet connected */}
        {!googleUserEmail && (
          <div className="mb-6 border border-[#3B82F6]/40 bg-[#0E0E12] px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-8 h-8 border border-[#3B82F6]/50 bg-[#3B82F6]/10 flex items-center justify-center text-[#60A5FA] shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div>
                <p className="font-mono text-[11px] text-[#60A5FA] uppercase font-bold">
                  CONEXIÓN GOOGLE RECOMENDADA
                </p>
                <p className="text-xs text-[#C4C4D0]">
                  Inicia sesión con tu cuenta de Google para sincronizar archivos con Google Drive,
                  abrir documentos Office en Google Docs y exportar versiones actualizadas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGoogleConnect}
              disabled={isGoogleLoggingIn}
              className="h-9 px-4 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-auto"
            >
              {isGoogleLoggingIn ? 'Conectando...' : 'Iniciar Sesión con Google'}
            </button>
          </div>
        )}

        {!activeProject && activeSection !== 'projects' ? (
          <div className="border border-[#22222A] bg-[#0E0E12] p-12 text-center">
            <Folder className="w-10 h-10 text-[#60A5FA] mx-auto mb-3" />
            <h2 className="font-display text-xl font-bold text-white mb-2">
              No hay ningún proyecto activo
            </h2>
            <p className="text-sm text-[#8E8E9E] mb-6 max-w-md mx-auto">
              Crea el primer proyecto de informática del grupo (máximo {MAX_ACTIVE_PROJECTS}{' '}
              proyectos activos 100% gratis).
            </p>
            <button
              type="button"
              onClick={openCreateProjectModal}
              className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider cursor-pointer"
            >
              + Crear Primer Proyecto
            </button>
          </div>
        ) : (
          <>
            {/* =====================================================================================
                PESTAÑA 01 · RESUMEN (VISTA GENERAL BENTO ESPACIOSA Y LIMPIA)
               ===================================================================================== */}
            {activeSection === 'overview' && activeProject && (
              <div className="space-y-8">
                {/* Row 1: Hero Project Card (7 cols) + 2x2 Key Metrics Bento Grid (5 cols) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#22222A] border border-[#22222A]">
                  {/* Left 7 Cols: Project Identity */}
                  <div className="lg:col-span-7 bg-[#0E0E12] p-6 sm:p-8 flex flex-col justify-between">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                        <span className="font-mono text-xs uppercase text-[#60A5FA]">
                          01 · PROYECTO ACTIVO · {activeProject.subject}
                        </span>
                        <button
                          type="button"
                          onClick={openEditProjectModal}
                          className="px-3 py-1.5 border border-[#2A2A35] bg-[#14141A] hover:border-white text-xs text-[#D4D4DC] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-[#60A5FA]" />
                          <span>Configurar Proyecto</span>
                        </button>
                      </div>

                      <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
                        {activeProject.name}
                      </h1>
                      <p className="text-sm sm:text-base text-[#9E9EAE] leading-relaxed mb-6">
                        {activeProject.description}
                      </p>
                    </div>

                    <div className="pt-5 border-t border-[#22222A] flex flex-wrap items-center justify-between gap-4">
                      <div className="text-xs text-[#8E8E9E]">
                        <span>Miembros con acceso directo: </span>
                        <strong className="text-white font-mono">
                          {activeProject.authorizedUsernames.map((u) => `@${u}`).join(' · ')}
                        </strong>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveSection('files')}
                          className="px-4 py-2.5 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Folder className="w-3.5 h-3.5" />
                          <span>Abrir Archivos y Carpetas</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right 5 Cols: 2x2 Key Metrics Bento Grid */}
                  <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#22222A]">
                    {/* Cell 1: Fecha de Entrega */}
                    <div className="p-6 bg-[#111116] flex flex-col justify-between">
                      <div className="flex items-center justify-between text-xs font-mono text-[#8E8E9E] mb-3">
                        <span>FECHA DE ENTREGA</span>
                        <Calendar className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="font-display text-2xl font-bold text-white tabular-nums mb-1">
                          {new Date(activeProject.dueDate).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p
                          className={`font-mono text-xs font-semibold tabular-nums ${
                            daysRemaining <= 5 ? 'text-rose-400' : 'text-amber-300'
                          }`}
                        >
                          Quedan {daysRemaining} días
                        </p>
                      </div>
                    </div>

                    {/* Cell 2: Tareas */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('tasks')}
                      className="p-6 bg-[#111116] hover:bg-[#16161E] transition-colors text-left flex flex-col justify-between cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs font-mono text-[#8E8E9E] mb-3">
                        <span>ESTADO DE TAREAS</span>
                        <span className="text-[#60A5FA] tabular-nums">{taskMetrics.pct}%</span>
                      </div>
                      <div>
                        <p className="font-display text-2xl font-bold text-white tabular-nums mb-2">
                          {taskMetrics.completed} / {taskMetrics.total}
                        </p>
                        <div className="h-1.5 w-full bg-[#22222A] overflow-hidden">
                          <div
                            className="h-full bg-[#3B82F6] transition-all"
                            style={{ width: `${taskMetrics.pct}%` }}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Cell 3: Archivos y Carpetas */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('files')}
                      className="p-6 bg-[#111116] hover:bg-[#16161E] transition-colors text-left flex flex-col justify-between cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs font-mono text-[#8E8E9E] mb-3">
                        <span>REPOSITORIO</span>
                        <Folder className="w-4 h-4 text-[#60A5FA]" />
                      </div>
                      <div>
                        <p className="font-display text-2xl font-bold text-white tabular-nums mb-1">
                          {projectDocuments.length} archivos
                        </p>
                        <p className="font-mono text-xs text-[#8E8E9E] tabular-nums">
                          en {projectFolders.length} carpeta(s)
                        </p>
                      </div>
                    </button>

                    {/* Cell 4: Cuota Gratuita */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('projects')}
                      className="p-6 bg-[#111116] hover:bg-[#16161E] transition-colors text-left flex flex-col justify-between cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs font-mono text-[#8E8E9E] mb-3">
                        <span>CUOTA GRATIS</span>
                        <span className="text-emerald-400 tabular-nums">{projectStoragePct}%</span>
                      </div>
                      <div>
                        <p className="font-display text-xl font-bold text-white tabular-nums mb-2">
                          {formatBytes(projectStorageBytes)} / 50 MB
                        </p>
                        <div className="h-1.5 w-full bg-[#22222A] overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              projectStoragePct > 85 ? 'bg-rose-500' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${projectStoragePct}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Row 2: 3 Spacious Bento Cards (Quick Launchers to Sections) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#22222A] border border-[#22222A]">
                  {/* Bento Card 1: Recent Files */}
                  <div className="bg-[#0E0E12] p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#22222A]">
                        <span className="font-mono text-xs uppercase text-[#8E8E9E]">
                          02 · ÚLTIMOS ARCHIVOS SUBIDOS
                        </span>
                        <FileSpreadsheet className="w-4 h-4 text-[#60A5FA]" />
                      </div>

                      {projectDocuments.length === 0 ? (
                        <p className="text-xs text-[#7E7E8E] py-4">
                          Todavía no hay archivos subidos en este proyecto.
                        </p>
                      ) : (
                        <div className="space-y-3 mb-6">
                          {projectDocuments.slice(0, 3).map((doc) => {
                            const ext = (
                              doc.extension ||
                              getFileExtension(doc.title) ||
                              'bin'
                            ).toUpperCase();
                            return (
                              <div
                                key={doc.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span className="text-white font-medium truncate">{doc.title}</span>
                                <span className="font-mono text-[11px] text-[#60A5FA] shrink-0">
                                  .{ext}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSection('files')}
                      className="w-full h-10 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Ir al Explorador de Archivos</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Bento Card 2: Priority Notice */}
                  <div className="bg-[#0E0E12] p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#22222A]">
                        <span className="font-mono text-xs uppercase text-[#8E8E9E]">
                          04 · ÚLTIMO AVISO DEL GRUPO
                        </span>
                        <Bell className="w-4 h-4 text-amber-400" />
                      </div>

                      {projectNotices.filter((n) => !n.archived).length === 0 ? (
                        <p className="text-xs text-[#7E7E8E] py-4">
                          No hay avisos activos publicados en el tablón.
                        </p>
                      ) : (
                        <div className="mb-6">
                          {projectNotices
                            .filter((n) => !n.archived)
                            .slice(0, 1)
                            .map((n) => (
                              <div key={n.id} className="space-y-1.5">
                                <span className="font-mono text-[11px] text-amber-400 uppercase font-semibold">
                                  {n.priority === 'urgent' ? 'URGENTE' : 'AVISO'} · @{n.authorUsername}
                                </span>
                                <h3 className="font-display font-bold text-base text-white">
                                  {n.title}
                                </h3>
                                <p className="text-xs text-[#9E9EAE] leading-relaxed line-clamp-3">
                                  {n.message}
                                </p>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSection('notices')}
                      className="w-full h-10 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Abrir Tablón de Avisos</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Bento Card 3: AI & Google Drive Status */}
                  <div className="bg-[#0E0E12] p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#22222A]">
                        <span className="font-mono text-xs uppercase text-[#8E8E9E]">
                          05 · ASISTENTE IA & GOOGLE DRIVE
                        </span>
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>

                      <p className="text-xs text-[#9E9EAE] leading-relaxed mb-4">
                        Consulta cualquier duda sobre las carpetas, archivos y tareas del proyecto a
                        la IA técnica o habla con el grupo en el chat.
                      </p>

                      <div className="p-3 border border-[#22222A] bg-[#111116] mb-6 text-xs flex items-center justify-between">
                        <span className="text-[#8E8E9E]">Estado Google Drive:</span>
                        <span
                          className={`font-mono font-semibold ${
                            googleUserEmail ? 'text-emerald-400' : 'text-amber-300'
                          }`}
                        >
                          {googleUserEmail ? 'Conectado' : 'Sin conectar'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSection('assistant')}
                      className="w-full h-10 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Abrir IA y Chat del Proyecto</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* =====================================================================================
                PESTAÑA 02 · ARCHIVOS Y CARPETAS (EXPLORADOR BENTO AMPLIO + PAQUETE OFFICE + .ZIP)
               ===================================================================================== */}
            {activeSection === 'files' && activeProject && (
              <div className="space-y-8">
                {/* Top Header & Action Bar */}
                <div className="border border-[#22222A] bg-[#0E0E12] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div>
                    <span className="font-mono text-xs text-[#60A5FA] uppercase block mb-1">
                      02 · EXPLORADOR DE PROYECTO · CUOTA {formatBytes(projectStorageBytes)} / 50 MB
                    </span>
                    <h2 className="font-display text-2xl font-bold text-white">
                      Archivos y Carpetas de «{activeProject.name}»
                    </h2>
                    <p className="text-xs sm:text-sm text-[#8E8E9E] mt-1">
                      Los archivos del paquete Office (<code className="text-white">.DOCX</code>,{' '}
                      <code className="text-white">.XLSX</code>,{' '}
                      <code className="text-white">.PPTX</code>,{' '}
                      <code className="text-white">.ODS</code>,{' '}
                      <code className="text-white">.CSV</code>) se abren directo en Google Docs /
                      Sheets / Slides. Cualquier carpeta o archivo se puede extraer.
                    </p>
                  </div>

                  {/* Rectangular Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={openCreateGoogleFileModal}
                      className="h-10 px-4 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FilePlus2 className="w-4 h-4" />
                      <span>Crear Archivo (Google)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTriggerUpload('files')}
                      disabled={isSyncingDrive}
                      className="h-10 px-4 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-[#60A5FA]" />
                      <span>Subir Archivos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTriggerUpload('folder')}
                      disabled={isSyncingDrive}
                      className="h-10 px-4 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FolderUp className="w-4 h-4 text-[#60A5FA]" />
                      <span>Subir Carpeta</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFolderModal(true)}
                      className="h-10 px-4 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-[#D4D4DC] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4 text-emerald-400" />
                      <span>Nueva Carpeta</span>
                    </button>

                    <button
                      type="button"
                      disabled={isExtractingZip}
                      onClick={() => {
                        const currentLabel =
                          folderBreadcrumbs[folderBreadcrumbs.length - 1]?.name ||
                          activeProject.name;
                        handleExtractFolderAsZip(currentFolderId, currentLabel);
                      }}
                      className="h-10 px-4 border border-[#3B82F6] bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {isExtractingZip ? 'Comprimiendo...' : 'Extraer Carpeta Actual (.ZIP)'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Breadcrumb Navigation Bar */}
                <div className="border border-[#22222A] bg-[#111116] px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs text-[#7E7E8E] mr-2">RUTA:</span>
                    {folderBreadcrumbs.map((crumb, idx) => (
                      <React.Fragment key={crumb.id}>
                        {idx > 0 && <ChevronRight className="w-4 h-4 text-[#555566]" />}
                        <button
                          type="button"
                          onClick={() => setCurrentFolderId(crumb.id)}
                          className={`px-3 py-1 text-xs font-mono transition-colors cursor-pointer ${
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
                    {visibleSubfolders.length} carpeta(s) · {visibleDocuments.length} archivo(s)
                  </span>
                </div>

                {/* Subfolders Bento Grid (ArtCraft-style cards) */}
                {visibleSubfolders.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-mono text-xs uppercase tracking-wider text-[#8E8E9E]">
                      CARPETAS EN ESTE DIRECTORIO ({visibleSubfolders.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#22222A] border border-[#22222A]">
                      {visibleSubfolders.map((folder) => {
                        const filesInside = projectDocuments.filter(
                          (d) => d.folderId === folder.id
                        ).length;
                        const subfoldersInside = projectFolders.filter(
                          (f) => f.parentId === folder.id
                        ).length;
                        return (
                          <div
                            key={folder.id}
                            className="bg-[#0E0E12] p-5 flex flex-col justify-between gap-5"
                          >
                            <div>
                              <div className="flex items-center justify-between text-[11px] font-mono text-[#7E7E8E] pb-3 mb-4 border-b border-[#22222A]">
                                <span>DIRECTORIO</span>
                                <span>@{folder.createdBy}</span>
                              </div>

                              <div className="flex items-start gap-3.5">
                                <div className="w-11 h-11 border border-[#2E2E3A] bg-[#14141C] flex items-center justify-center text-[#60A5FA] shrink-0">
                                  <Folder className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-display font-bold text-base text-white truncate">
                                    {folder.name}
                                  </h4>
                                  <p className="font-mono text-xs text-[#8E8E9E] mt-1 tabular-nums">
                                    {filesInside} archivo(s)
                                    {subfoldersInside > 0
                                      ? ` · ${subfoldersInside} subcarpeta(s)`
                                      : ''}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => setCurrentFolderId(folder.id)}
                                className="flex-1 h-9 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider cursor-pointer"
                              >
                                Abrir Carpeta
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExtractFolderAsZip(folder.id, folder.name)}
                                title="Extraer carpeta en .ZIP"
                                className="h-9 px-3 border border-[#2A2A35] bg-[#14141A] hover:border-white text-white font-mono text-xs inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-[#60A5FA]" />
                                <span>.ZIP</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFolder(folder)}
                                title="Eliminar carpeta"
                                className="h-9 w-9 border border-[#2A2A35] bg-[#14141A] hover:border-rose-500 text-[#7E7E8E] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Uploaded Files Bento Grid */}
                <div className="space-y-3">
                  <h3 className="font-mono text-xs uppercase tracking-wider text-[#8E8E9E]">
                    ARCHIVOS EN ESTE DIRECTORIO ({visibleDocuments.length})
                  </h3>

                  {visibleDocuments.length === 0 ? (
                    <div className="border border-[#22222A] bg-[#0E0E12] p-12 text-center">
                      <Upload className="w-9 h-9 text-[#555566] mx-auto mb-3" />
                      <p className="font-display text-base font-semibold text-white mb-1">
                        Esta carpeta aún no tiene archivos
                      </p>
                      <p className="text-xs sm:text-sm text-[#8E8E9E] mb-6 max-w-md mx-auto">
                        Crea un documento pegando el enlace compartido de Google Docs/Sheets/Slides
                        o sube cualquier archivo o carpeta completa desde tu ordenador.
                      </p>
                      <div className="flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          onClick={openCreateGoogleFileModal}
                          className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                        >
                          <FilePlus2 className="w-4 h-4" />
                          <span>Crear Archivo (Google)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTriggerUpload('files')}
                          className="px-5 py-2.5 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Upload className="w-4 h-4 text-[#60A5FA]" />
                          <span>Subir Archivos</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTriggerUpload('folder')}
                          className="px-5 py-2.5 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                        >
                          <FolderUp className="w-4 h-4 text-[#60A5FA]" />
                          <span>Subir Carpeta</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#22222A] border border-[#22222A]">
                      {visibleDocuments.map((docItem) => {
                        const ext = (
                          docItem.extension ||
                          getFileExtension(docItem.title) ||
                          'bin'
                        ).toLowerCase();
                        const editorKind = getGoogleEditorKind(ext);
                        const editorLabel = getGoogleEditorLabel(editorKind);

                        return (
                          <div
                            key={docItem.id}
                            className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-6"
                          >
                            <div>
                              {/* Top Metadata Header Bar (ArtCraft Style) */}
                              <div className="flex items-center justify-between text-xs font-mono pb-3 mb-4 border-b border-[#22222A]">
                                <span className="text-white font-bold uppercase">
                                  EXTENSIÓN: .{ext.toUpperCase()}
                                </span>
                                <span className="text-[#8E8E9E] tabular-nums">
                                  {formatBytes(docItem.sizeBytes || 45000)}
                                </span>
                              </div>

                              {/* File Icon & Title */}
                              <div className="flex items-start gap-4 mb-4">
                                {renderTechnicalFileIcon(docItem)}
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-display font-bold text-base sm:text-lg text-white break-words">
                                    {docItem.title}
                                  </h4>
                                  <p className="text-xs text-[#8E8E9E] mt-1">
                                    {editorKind ? (
                                      <span className="text-[#60A5FA]">
                                        Compatible con {editorLabel}
                                      </span>
                                    ) : (
                                      <span>
                                        Sin editor en Google · Solo descarga / extracción
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              {/* Responsible Selector */}
                              <div className="flex items-center justify-between p-3 border border-[#22222A] bg-[#111116] text-xs">
                                <span className="font-mono text-[#8E8E9E]">RESPONSABLE:</span>
                                <select
                                  value={docItem.assigneeUsername}
                                  onChange={(e) =>
                                    handleChangeFileAssignee(docItem, e.target.value)
                                  }
                                  className="bg-transparent font-mono font-semibold text-white focus:outline-none cursor-pointer"
                                >
                                  {activeProject.authorizedUsernames.map((u) => (
                                    <option key={u} value={u} className="bg-[#0E0E12] text-white">
                                      @{u}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* Bottom Rectangular Action Bar */}
                            <div className="flex items-center gap-2">
                              {editorKind ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenInGoogleEditor(docItem)}
                                    className="flex-1 h-10 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span>Abrir en {editorLabel}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLinkingDocItem(docItem);
                                      setLinkGoogleUrlInput(docItem.googleDocUrl || '');
                                    }}
                                    title="Vincular URL compartida de Google Docs/Sheets/Slides"
                                    className="h-10 w-10 border border-[#2A2A35] bg-[#14141A] hover:border-white text-[#60A5FA] flex items-center justify-center cursor-pointer"
                                  >
                                    <Link2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => handleExtractSingleFile(docItem)}
                                className={`${
                                  editorKind ? 'px-4' : 'flex-1'
                                } h-10 border border-[#2A2A35] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer`}
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Extraer (.{ext.toUpperCase()})</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteDocument(docItem)}
                                title="Eliminar archivo"
                                className="h-10 w-10 border border-[#2A2A35] bg-[#14141A] hover:border-rose-500 text-[#7E7E8E] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =====================================================================================
                PESTAÑA 03 · TAREAS DEL GRUPO (CUADRÍCULA BENTO AMPLIA)
               ===================================================================================== */}
            {activeSection === 'tasks' && activeProject && (
              <div className="space-y-8">
                {/* Top KPI Strip + Create Task Button */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-px bg-[#22222A] border border-[#22222A]">
                  <div className="bg-[#0E0E12] p-6">
                    <span className="font-mono text-xs text-[#8E8E9E] block mb-1">
                      TOTAL TAREAS
                    </span>
                    <span className="font-display text-3xl font-bold text-white tabular-nums">
                      {taskMetrics.total}
                    </span>
                  </div>
                  <div className="bg-[#0E0E12] p-6">
                    <span className="font-mono text-xs text-amber-400 block mb-1">PENDIENTES</span>
                    <span className="font-display text-3xl font-bold text-white tabular-nums">
                      {taskMetrics.pending}
                    </span>
                  </div>
                  <div className="bg-[#0E0E12] p-6">
                    <span className="font-mono text-xs text-[#60A5FA] block mb-1">EN CURSO</span>
                    <span className="font-display text-3xl font-bold text-white tabular-nums">
                      {taskMetrics.inProgress}
                    </span>
                  </div>
                  <div className="bg-[#0E0E12] p-6 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-emerald-400">
                        COMPLETADAS ({taskMetrics.pct}%)
                      </span>
                      <span className="font-display text-xl font-bold text-white tabular-nums">
                        {taskMetrics.completed}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNewTaskAssignee(
                          currentUser?.username || activeProject.authorizedUsernames[0] || 'chiki'
                        );
                        setShowTaskModal(true);
                      }}
                      className="mt-3 w-full h-9 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nueva Tarea</span>
                    </button>
                  </div>
                </div>

                {/* Filter Bar */}
                <div className="border border-[#22222A] bg-[#0E0E12] px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: `Todas (${taskMetrics.total})` },
                        { id: 'pending', label: `Pendientes (${taskMetrics.pending})` },
                        { id: 'in_progress', label: `En curso (${taskMetrics.inProgress})` },
                        { id: 'completed', label: `Hechas (${taskMetrics.completed})` },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setTaskStatusFilter(st.id)}
                        className={`px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          taskStatusFilter === st.id
                            ? 'bg-white text-[#09090B] font-semibold'
                            : 'bg-[#14141A] border border-[#2A2A35] text-[#9E9EAE] hover:text-white'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#8E8E9E]">RESPONSABLE:</span>
                    <select
                      value={taskAssigneeFilter}
                      onChange={(e) => setTaskAssigneeFilter(e.target.value)}
                      className="h-9 px-3 bg-[#09090B] border border-[#2A2A35] font-mono text-xs text-white"
                    >
                      <option value="all">Todos los miembros</option>
                      {activeProject.authorizedUsernames.map((u) => (
                        <option key={u} value={u}>
                          @{u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Spacious Tasks Bento Grid */}
                {filteredTasks.length === 0 ? (
                  <div className="border border-[#22222A] bg-[#0E0E12] p-12 text-center text-sm text-[#8E8E9E]">
                    No hay tareas que coincidan con el filtro seleccionado.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#22222A] border border-[#22222A]">
                    {filteredTasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-6"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-mono pb-3 mb-4 border-b border-[#22222A]">
                            <span className="text-[#60A5FA] font-bold">
                              RESPONSABLE: @{task.assigneeUsername}
                            </span>
                            <span className="text-[#8E8E9E] tabular-nums">
                              ENTREGA: {task.dueDate}
                            </span>
                          </div>

                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateTaskStatus(
                                  task,
                                  task.status === 'completed' ? 'pending' : 'completed'
                                )
                              }
                              className="mt-0.5 cursor-pointer shrink-0"
                            >
                              {task.status === 'completed' ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                              ) : task.status === 'in_progress' ? (
                                <CircleDot className="w-5 h-5 text-[#60A5FA]" />
                              ) : (
                                <Circle className="w-5 h-5 text-[#6E6E7E]" />
                              )}
                            </button>
                            <div>
                              <h3
                                className={`font-display font-bold text-base ${
                                  task.status === 'completed'
                                    ? 'line-through text-[#6E6E7E]'
                                    : 'text-white'
                                }`}
                              >
                                {task.title}
                              </h3>
                              {task.description && (
                                <p className="text-xs sm:text-sm text-[#9E9EAE] mt-2 leading-relaxed">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-3 border-t border-[#22222A]">
                          <select
                            value={task.status}
                            onChange={(e) =>
                              handleUpdateTaskStatus(task, e.target.value as TaskStatus)
                            }
                            className="flex-1 h-9 px-3 bg-[#09090B] border border-[#2A2A35] text-xs font-medium text-white"
                          >
                            <option value="pending">Estado: Pendiente</option>
                            <option value="in_progress">Estado: En curso</option>
                            <option value="completed">Estado: Completada</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task)}
                            title="Eliminar tarea"
                            className="h-9 w-9 border border-[#2A2A35] bg-[#14141A] hover:border-rose-500 text-[#7E7E8E] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* =====================================================================================
                PESTAÑA 04 · TABLÓN DE AVISOS DEL EQUIPO
               ===================================================================================== */}
            {activeSection === 'notices' && activeProject && (
              <div className="space-y-8">
                <div className="border border-[#22222A] bg-[#0E0E12] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="font-mono text-xs text-amber-400 uppercase block mb-1">
                      04 · COMUNICACIONES OFICIALES DEL GRUPO
                    </span>
                    <h2 className="font-display text-2xl font-bold text-white">
                      Tablón de Avisos de «{activeProject.name}»
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setNoticeArchiveView((v) => (v === 'active' ? 'archived' : 'active'))
                      }
                      className="h-10 px-4 border border-[#2A2A35] bg-[#14141A] hover:border-white text-xs font-semibold text-white cursor-pointer"
                    >
                      {noticeArchiveView === 'active' ? 'Ver Archivados' : 'Ver Activos'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNoticeModal(true)}
                      className="h-10 px-4 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Publicar Aviso</span>
                    </button>
                  </div>
                </div>

                {visibleNotices.length === 0 ? (
                  <div className="border border-[#22222A] bg-[#0E0E12] p-12 text-center text-sm text-[#8E8E9E]">
                    No hay anuncios {noticeArchiveView === 'archived' ? 'archivados' : 'activos'} en
                    este momento.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#22222A] border border-[#22222A]">
                    {visibleNotices.map((notice) => (
                      <div
                        key={notice.id}
                        className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-6"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-mono pb-3 mb-4 border-b border-[#22222A]">
                            <span
                              className={
                                notice.priority === 'urgent'
                                  ? 'text-rose-400 font-bold'
                                  : notice.priority === 'important'
                                  ? 'text-amber-400 font-bold'
                                  : 'text-[#60A5FA]'
                              }
                            >
                              PRIORIDAD:{' '}
                              {notice.priority === 'urgent'
                                ? 'URGENTE'
                                : notice.priority === 'important'
                                ? 'IMPORTANTE'
                                : 'NORMAL'}
                            </span>
                            <span className="text-[#8E8E9E] tabular-nums">
                              @{notice.authorUsername} ·{' '}
                              {new Date(notice.createdAt).toLocaleDateString('es-ES')}
                            </span>
                          </div>

                          <h3 className="font-display font-bold text-lg text-white mb-2">
                            {notice.title}
                          </h3>
                          <p className="text-sm text-[#A1A1B2] leading-relaxed">{notice.message}</p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#22222A]">
                          <button
                            type="button"
                            onClick={() => handleToggleArchiveNotice(notice)}
                            className="h-9 px-3.5 border border-[#2A2A35] bg-[#14141A] hover:border-white text-xs text-white inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {notice.archived ? (
                              <>
                                <ArchiveRestore className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Restaurar</span>
                              </>
                            ) : (
                              <>
                                <Archive className="w-3.5 h-3.5 text-amber-400" />
                                <span>Archivar</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNotice(notice)}
                            className="h-9 w-9 border border-[#2A2A35] bg-[#14141A] hover:border-rose-500 text-[#7E7E8E] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* =====================================================================================
                PESTAÑA 05 · IA DEL PROYECTO Y CHAT DEL GRUPO (CONSOLA BENTO DE 2 COLUMNAS)
               ===================================================================================== */}
            {activeSection === 'assistant' && activeProject && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#22222A] border border-[#22222A]">
                {/* Left 4 Cols: Mode Selector & Quick Context Prompts */}
                <div className="lg:col-span-4 bg-[#0E0E12] p-6 flex flex-col justify-between space-y-6">
                  <div className="space-y-6">
                    <div>
                      <span className="font-mono text-xs text-[#60A5FA] uppercase block mb-1">
                        05 · ASISTENCIA & EQUIPO
                      </span>
                      <h2 className="font-display text-xl font-bold text-white">
                        IA del Proyecto y Chat
                      </h2>
                    </div>

                    {/* Mode Switcher */}
                    <div className="grid grid-cols-2 gap-px bg-[#24242E] border border-[#24242E]">
                      <button
                        type="button"
                        onClick={() => setCommMode('ai')}
                        className={`py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                          commMode === 'ai'
                            ? 'bg-white text-[#09090B]'
                            : 'bg-[#0E0E12] text-[#8E8E9E] hover:text-white'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>IA Proyecto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommMode('chat')}
                        className={`py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                          commMode === 'chat'
                            ? 'bg-white text-[#09090B]'
                            : 'bg-[#0E0E12] text-[#8E8E9E] hover:text-white'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Chat ({projectMessages.length})</span>
                      </button>
                    </div>

                    {commMode === 'ai' && (
                      <div className="space-y-2.5">
                        <p className="font-mono text-[11px] uppercase text-[#8E8E9E]">
                          CONSULTAS RÁPIDAS DEL PROYECTO:
                        </p>
                        {[
                          '¿Qué archivos y carpetas tenemos subidos y qué falta para la entrega?',
                          'Haz un resumen de las tareas pendientes por compañero',
                          'Dame la receta de lentejas (Prueba de bloqueo ajeno al proyecto)',
                        ].map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => handleAskProjectAi(q)}
                            className="w-full p-3 text-left border border-[#2A2A35] bg-[#111116] hover:border-white text-xs text-[#D4D4DC] transition-colors cursor-pointer"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 border border-[#22222A] bg-[#111116] text-xs text-[#8E8E9E] space-y-1">
                    <p className="font-mono text-white">CONTEXTO SINCRONIZADO:</p>
                    <p className="tabular-nums">
                      {projectFolders.length} carpetas · {projectDocuments.length} archivos ·{' '}
                      {projectTasks.length} tareas
                    </p>
                  </div>
                </div>

                {/* Right 8 Cols: Conversation Viewport */}
                <div className="lg:col-span-8 bg-[#09090B] flex flex-col justify-between min-h-[520px]">
                  {commMode === 'ai' ? (
                    <>
                      <div className="p-6 space-y-4 h-[440px] overflow-y-auto">
                        {aiMessages.map((m) => (
                          <div
                            key={m.id}
                            className={`flex ${
                              m.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <div
                              className={`max-w-2xl px-4 py-3 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed border ${
                                m.role === 'user'
                                  ? 'bg-white text-[#09090B] border-white font-medium'
                                  : 'bg-[#121218] text-[#E4E4EC] border-[#262632]'
                              }`}
                            >
                              {m.text}
                            </div>
                          </div>
                        ))}
                        {isAiThinking && (
                          <div className="font-mono text-xs text-[#60A5FA]">
                            Analizando carpetas, archivos y tareas del proyecto...
                          </div>
                        )}
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAskProjectAi();
                        }}
                        className="p-4 border-t border-[#22222A] bg-[#0E0E12] flex gap-2"
                      >
                        <input
                          type="text"
                          value={aiQuestion}
                          onChange={(e) => setAiQuestion(e.target.value)}
                          placeholder={`Pregunta cualquier duda técnica sobre "${activeProject.name}"...`}
                          className="flex-1 h-11 px-4 bg-[#09090B] border border-[#2A2A35] text-sm text-white focus:outline-none focus:border-white"
                        />
                        <button
                          type="submit"
                          disabled={isAiThinking}
                          className="h-11 px-6 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Send className="w-4 h-4" />
                          <span>Preguntar</span>
                        </button>
                      </form>
                    </>
                  ) : (
                    <>
                      <div className="p-6 space-y-4 h-[440px] overflow-y-auto">
                        {projectMessages.length === 0 ? (
                          <p className="text-xs text-[#6E6E7E] text-center py-12">
                            Todavía no hay mensajes en el chat del grupo.
                          </p>
                        ) : (
                          projectMessages.map((m) => {
                            const isMe = m.senderUsername === currentUser.username;
                            return (
                              <div
                                key={m.id}
                                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                              >
                                <span className="font-mono text-[11px] text-[#7E7E8E] mb-1">
                                  @{m.senderUsername}
                                </span>
                                <div
                                  className={`max-w-lg px-4 py-2.5 text-xs sm:text-sm border ${
                                    isMe
                                      ? 'bg-white text-[#09090B] border-white font-medium'
                                      : 'bg-[#121218] text-[#E4E4EC] border-[#262632]'
                                  }`}
                                >
                                  {m.text}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <form
                        onSubmit={handleSendChatMessage}
                        className="p-4 border-t border-[#22222A] bg-[#0E0E12] flex gap-2"
                      >
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="Escribe un mensaje para el equipo..."
                          className="flex-1 h-11 px-4 bg-[#09090B] border border-[#2A2A35] text-sm text-white focus:outline-none focus:border-white"
                        />
                        <button
                          type="submit"
                          className="h-11 px-6 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Send className="w-4 h-4" />
                          <span>Enviar</span>
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* =====================================================================================
                PESTAÑA 06 · PROYECTOS, GOOGLE DRIVE Y CUOTA GRATUITA (BENTO LAUNCHER)
               ===================================================================================== */}
            {activeSection === 'projects' && (
              <div className="space-y-8">
                {/* Top Header */}
                <div className="border border-[#22222A] bg-[#0E0E12] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="font-mono text-xs text-[#60A5FA] uppercase block mb-1">
                      06 · LANZADOR DE PROYECTOS Y CONEXIÓN GOOGLE DRIVE
                    </span>
                    <h2 className="font-display text-2xl font-bold text-white">
                      Proyectos Activos ({workspace?.projects.length || 0} / {MAX_ACTIVE_PROJECTS}{' '}
                      Gratis)
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={openCreateProjectModal}
                    disabled={(workspace?.projects.length || 0) >= MAX_ACTIVE_PROJECTS}
                    className="h-10 px-5 bg-white hover:bg-zinc-200 disabled:opacity-40 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Nuevo Proyecto</span>
                  </button>
                </div>

                {/* Projects Bento Grid (ArtCraft Launcher Style) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#22222A] border border-[#22222A]">
                  {workspace?.projects.map((proj, index) => {
                    const isSelected = activeProject?.id === proj.id;
                    const isAuthorized = isUserAuthorizedOnProject(proj, currentUser);
                    return (
                      <div
                        key={proj.id}
                        className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-6"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-mono pb-3 mb-4 border-b border-[#22222A]">
                            <span className="text-[#60A5FA]">
                              PROYECTO 0{index + 1} · @{proj.ownerUsername}
                            </span>
                            <span className="text-[#8E8E9E] tabular-nums">
                              {new Date(proj.dueDate).toLocaleDateString('es-ES')}
                            </span>
                          </div>

                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <h3 className="font-display font-bold text-lg text-white">
                                {proj.name}
                              </h3>
                              <p className="font-mono text-xs text-[#8E8E9E] mt-0.5">
                                {proj.subject}
                              </p>
                            </div>
                            {proj.hasPassword ? (
                              isAuthorized ? (
                                <Unlock className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                              )
                            ) : null}
                          </div>

                          <p className="text-xs text-[#9E9EAE] leading-relaxed line-clamp-3">
                            {proj.description}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => handleSelectProject(proj)}
                            className={`flex-1 h-10 font-semibold text-xs uppercase tracking-wider cursor-pointer ${
                              isSelected
                                ? 'bg-[#3B82F6] text-white'
                                : 'bg-white hover:bg-zinc-200 text-[#09090B]'
                            }`}
                          >
                            {isSelected ? 'Proyecto Activo (Abrir)' : 'Seleccionar Proyecto'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteProject(proj)}
                            title="Eliminar proyecto"
                            className="h-10 w-10 border border-[#2A2A35] bg-[#14141A] hover:border-rose-500 text-[#7E7E8E] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Row: Google Drive Integration + Free Storage Quota + Student Session */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#22222A] border border-[#22222A]">
                  {/* Cell 1: Google Drive & Docs Connection */}
                  <div className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#22222A]">
                        <span className="font-mono text-xs uppercase text-[#8E8E9E]">
                          GOOGLE DRIVE & DOCS
                        </span>
                        <span className="font-mono text-xs text-[#60A5FA]">SINCRONIZACIÓN</span>
                      </div>
                      <p className="text-xs text-[#9E9EAE] leading-relaxed mb-4">
                        Conecta tu cuenta de Google para subir y abrir automáticamente documentos
                        Word, Excel y PowerPoint en Google Docs, Sheets y Slides.
                      </p>
                    </div>

                    {googleUserEmail ? (
                      <div className="space-y-2">
                        <div className="p-2.5 border border-emerald-500/40 bg-emerald-500/10 font-mono text-xs text-emerald-300 truncate">
                          {googleUserEmail}
                        </div>
                        <button
                          type="button"
                          onClick={() => logoutGoogle()}
                          className="w-full h-9 border border-[#2A2A35] bg-[#14141A] hover:border-white text-xs text-white cursor-pointer"
                        >
                          Desconectar Google
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <GoogleSignInButton
                          onClick={handleGoogleConnect}
                          isLoading={isGoogleLoggingIn}
                          label="Conectar Google Drive"
                        />
                      </div>
                    )}
                  </div>

                  {/* Cell 2: Free Tier Storage Quota */}
                  <div className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#22222A]">
                        <span className="font-mono text-xs uppercase text-[#8E8E9E]">
                          LÍMITES 100% GRATUITOS
                        </span>
                        <span className="font-mono text-xs text-emerald-400">PLAN GRATIS</span>
                      </div>
                      <p className="font-display text-2xl font-bold text-white tabular-nums mb-2">
                        {formatBytes(projectStorageBytes)} / {formatBytes(MAX_PROJECT_STORAGE_BYTES)}
                      </p>
                      <div className="h-2 w-full bg-[#22222A] overflow-hidden mb-3">
                        <div
                          className={`h-full transition-all ${
                            projectStoragePct > 85 ? 'bg-rose-500' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${projectStoragePct}%` }}
                        />
                      </div>
                      <p className="text-xs text-[#8E8E9E] leading-relaxed">
                        Límite calibrado a 50 MB por proyecto y máximo {MAX_ACTIVE_PROJECTS}{' '}
                        proyectos activos para mantener la base de datos y el alojamiento 100%
                        gratis.
                      </p>
                    </div>
                  </div>

                  {/* Cell 3: Active Student Account */}
                  <div className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#22222A]">
                        <span className="font-mono text-xs uppercase text-[#8E8E9E]">
                          SESIÓN DEL ALUMNO
                        </span>
                        <Layers className="w-4 h-4 text-[#60A5FA]" />
                      </div>
                      <p className="font-display text-xl font-bold text-white">
                        @{currentUser.username}
                      </p>
                      <p className="text-xs text-[#8E8E9E] mt-1">{currentUser.displayName}</p>
                      <p className="font-mono text-xs text-[#60A5FA] mt-2">{currentUser.role}</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleLogoutStudent}
                      className="w-full h-10 border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ==================== MODAL: AVISO INICIO DE SESIÓN CON GOOGLE REQUERIDO ==================== */}
      {googlePromptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md border border-[#3B82F6]/60 bg-[#0E0E12] p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#22222A]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 border border-[#3B82F6]/50 bg-[#3B82F6]/15 flex items-center justify-center text-[#60A5FA] shrink-0">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-[#60A5FA] uppercase block">
                    {googlePromptModal.isFirstTime
                      ? 'PRIMER ACCESO · GOOGLE DRIVE & DOCS'
                      : 'ACCIÓN REQUIERE CUENTA DE GOOGLE'}
                  </span>
                  <h3 className="font-display font-bold text-sm text-white">
                    {googlePromptModal.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGooglePromptModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 text-[#8E8E9E] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#B4B4C2] leading-relaxed">
              {googlePromptModal.description}
            </p>

            <div className="space-y-2.5 pt-1">
              <GoogleSignInButton
                onClick={handleGoogleConnect}
                isLoading={isGoogleLoggingIn}
                label="Iniciar sesión con Google ahora"
              />

              {googlePromptModal.onContinueLocal && googlePromptModal.continueLocalLabel && (
                <button
                  type="button"
                  onClick={() => googlePromptModal.onContinueLocal?.()}
                  className="w-full h-10 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-xs text-[#D4D4DC] font-medium transition-colors cursor-pointer"
                >
                  {googlePromptModal.continueLocalLabel}
                </button>
              )}

              <button
                type="button"
                onClick={() => setGooglePromptModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-full h-9 text-xs text-[#8E8E9E] hover:text-white transition-colors cursor-pointer"
              >
                {googlePromptModal.isFirstTime ? 'Más tarde' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CREAR ARCHIVO CON ENLACE COMPARTIDO DE GOOGLE ==================== */}
      {showCreateGoogleFileModal && activeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="w-full max-w-lg border border-[#2E2E3A] bg-[#0E0E12] p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#22222A]">
              <div>
                <span className="font-mono text-[10px] text-[#60A5FA] uppercase block">
                  NUEVO ARCHIVO COMPARTIDO DEL PROYECTO
                </span>
                <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                  Crear Archivo con Enlace de Google Docs / Sheets / Slides
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateGoogleFileModal(false)}
                className="p-1 text-[#8E8E9E] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#9E9EAE] leading-relaxed">
              Pega el <strong>enlace para compartir</strong> que te da Google Docs, Sheets o Slides.
              Cuando cualquier compañero del grupo abra este archivo desde ChikiHub, se abrirá
              directamente ese documento compartido para editar juntos.
            </p>

            <form onSubmit={handleCreateGoogleLinkedFile} className="space-y-3.5">
              <div>
                <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                  Enlace de compartir de Google (obligatorio)
                </label>
                <input
                  type="url"
                  required
                  value={newGoogleFileUrl}
                  onChange={(e) => handleGoogleFileUrlChange(e.target.value)}
                  placeholder="https://docs.google.com/document/d/.../edit?usp=sharing"
                  className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                    Nombre del archivo
                  </label>
                  <input
                    type="text"
                    required
                    value={newGoogleFileName}
                    onChange={(e) => setNewGoogleFileName(e.target.value)}
                    placeholder="ej. Memoria_Servidor_Linux"
                    className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white focus:outline-none focus:border-white"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                    Tipo de documento
                  </label>
                  <select
                    value={newGoogleFileKind}
                    onChange={(e) =>
                      setNewGoogleFileKind(e.target.value as 'docs' | 'sheets' | 'slides')
                    }
                    className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white focus:outline-none focus:border-white"
                  >
                    <option value="docs">Google Docs (.docx)</option>
                    <option value="sheets">Google Sheets (.xlsx)</option>
                    <option value="slides">Google Slides (.pptx)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                  Responsable inicial
                </label>
                <select
                  value={newGoogleFileAssignee}
                  onChange={(e) => setNewGoogleFileAssignee(e.target.value)}
                  className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white focus:outline-none focus:border-white"
                >
                  {activeProject.authorizedUsernames.map((u) => (
                    <option key={u} value={u}>
                      @{u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                  Notas / descripción breve para la IA del proyecto (opcional)
                </label>
                <textarea
                  rows={2}
                  value={newGoogleFileNotes}
                  onChange={(e) => setNewGoogleFileNotes(e.target.value)}
                  placeholder="ej. Memoria principal con los apartados de instalación, VLANs y capturas."
                  className="w-full p-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white focus:outline-none focus:border-white"
                />
              </div>

              {newGoogleFileError && (
                <div className="p-2.5 border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300">
                  {newGoogleFileError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGoogleFileModal(false)}
                  className="px-4 py-2 border border-[#2A2A35] bg-[#14141A] text-xs text-[#C4C4D0] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Crear Archivo Vinculado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: VINCULAR ENLACE GOOGLE DOCS A ARCHIVO ==================== */}
      {linkingDocItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md border border-[#2E2E3A] bg-[#0E0E12] p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#22222A]">
              <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                Abrir «{linkingDocItem.title}» en Google
              </h3>
              <button
                type="button"
                onClick={() => setLinkingDocItem(null)}
                className="p-1 text-[#8E8E9E] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#A1A1B2] leading-relaxed">
              Conecta tu cuenta de Google en la pestaña <strong>06 Proyectos y Drive</strong> para
              subir y convertir este archivo automáticamente, o pega aquí el enlace compartido de
              Google Docs / Sheets / Slides:
            </p>

            <form onSubmit={handleSaveLinkedGoogleUrl} className="space-y-3">
              <input
                type="text"
                required
                value={linkGoogleUrlInput}
                onChange={(e) => setLinkGoogleUrlInput(e.target.value)}
                placeholder="https://docs.google.com/document/d/.../edit"
                className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white focus:outline-none focus:border-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLinkingDocItem(null)}
                  className="px-4 py-2 border border-[#2A2A35] bg-[#14141A] text-xs text-[#C4C4D0] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs cursor-pointer"
                >
                  Guardar y Abrir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: DESBLOQUEAR PROYECTO CON CONTRASEÑA ==================== */}
      {passwordPromptProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm border border-[#2E2E3A] bg-[#0E0E12] p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#22222A]">
              <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                Proyecto Protegido
              </h3>
              <button
                type="button"
                onClick={() => setPasswordPromptProject(null)}
                className="p-1 text-[#8E8E9E] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#A1A1B2]">
              Introduce la contraseña de <strong>{passwordPromptProject.name}</strong> para
              desbloquearlo:
            </p>
            <form onSubmit={handleUnlockProjectWithPassword} className="space-y-3">
              <input
                type="password"
                required
                value={projectPasswordInput}
                onChange={(e) => setProjectPasswordInput(e.target.value)}
                placeholder="Contraseña del proyecto"
                className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
              />
              {projectPasswordError && (
                <p className="text-xs text-rose-400">{projectPasswordError}</p>
              )}
              <button
                type="submit"
                className="w-full h-10 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs cursor-pointer"
              >
                Desbloquear Proyecto
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CREAR / EDITAR PROYECTO ==================== */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="w-full max-w-md border border-[#2E2E3A] bg-[#0E0E12] p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#22222A]">
              <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white">
                {editingProject ? 'Configurar Proyecto' : 'Nuevo Proyecto (Máx. 5 Gratis)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowProjectModal(false)}
                className="p-1 text-[#8E8E9E] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="space-y-3.5">
              <div>
                <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                  Nombre del proyecto
                </label>
                <input
                  type="text"
                  required
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                    Asignatura
                  </label>
                  <input
                    type="text"
                    value={projSubject}
                    onChange={(e) => setProjSubject(e.target.value)}
                    className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                    Fecha de entrega
                  </label>
                  <input
                    type="date"
                    value={projDueDate}
                    onChange={(e) => setProjDueDate(e.target.value)}
                    className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  className="w-full p-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
                />
              </div>
              <div>
                <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1">
                  Usuarios autorizados (separados por comas)
                </label>
                <input
                  type="text"
                  value={projAuthUsersInput}
                  onChange={(e) => setProjAuthUsersInput(e.target.value)}
                  placeholder="chiki, alex, lucia, marcos"
                  className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="text-xs text-[#C4C4D0] flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={projHasPassword}
                    onChange={(e) => setProjHasPassword(e.target.checked)}
                  />
                  <span>Proteger con contraseña para no autorizados</span>
                </label>
              </div>
              {projHasPassword && (
                <input
                  type="text"
                  value={projPassword}
                  onChange={(e) => setProjPassword(e.target.value)}
                  placeholder="Contraseña del proyecto"
                  className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
                />
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2 border border-[#2A2A35] bg-[#14141A] text-xs text-[#C4C4D0] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs cursor-pointer"
                >
                  Guardar Proyecto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: NUEVA CARPETA ==================== */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm border border-[#2E2E3A] bg-[#0E0E12] p-6 space-y-4">
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white pb-2 border-b border-[#22222A]">
              Crear Nueva Carpeta
            </h3>
            <form onSubmit={handleCreateFolder} className="space-y-3">
              <input
                type="text"
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nombre de la carpeta"
                className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 border border-[#2A2A35] bg-[#14141A] text-xs text-[#C4C4D0] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs cursor-pointer"
                >
                  Crear Carpeta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: NUEVA TAREA ==================== */}
      {showTaskModal && activeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md border border-[#2E2E3A] bg-[#0E0E12] p-6 space-y-4">
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white pb-2 border-b border-[#22222A]">
              Asignar Nueva Tarea
            </h3>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <input
                type="text"
                required
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Título de la tarea"
                className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
              />
              <textarea
                rows={2}
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="Descripción o detalles técnicos"
                className="w-full p-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newTaskAssignee}
                  onChange={(e) => setNewTaskAssignee(e.target.value)}
                  className="h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
                >
                  {activeProject.authorizedUsernames.map((u) => (
                    <option key={u} value={u}>
                      @{u}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 border border-[#2A2A35] bg-[#14141A] text-xs text-[#C4C4D0] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs cursor-pointer"
                >
                  Guardar Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: NUEVO ANUNCIO ==================== */}
      {showNoticeModal && activeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md border border-[#2E2E3A] bg-[#0E0E12] p-6 space-y-4">
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white pb-2 border-b border-[#22222A]">
              Publicar Anuncio en el Tablón
            </h3>
            <form onSubmit={handleCreateNotice} className="space-y-3">
              <input
                type="text"
                required
                value={newNoticeTitle}
                onChange={(e) => setNewNoticeTitle(e.target.value)}
                placeholder="Título del aviso"
                className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
              />
              <textarea
                rows={3}
                required
                value={newNoticeMessage}
                onChange={(e) => setNewNoticeMessage(e.target.value)}
                placeholder="Mensaje para el grupo..."
                className="w-full p-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
              />
              <select
                value={newNoticePriority}
                onChange={(e) => setNewNoticePriority(e.target.value as NoticePriority)}
                className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
              >
                <option value="normal">Prioridad Normal</option>
                <option value="important">Importante</option>
                <option value="urgent">Urgente</option>
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNoticeModal(false)}
                  className="px-4 py-2 border border-[#2A2A35] bg-[#14141A] text-xs text-[#C4C4D0] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs cursor-pointer"
                >
                  Publicar Aviso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== CONFIRMATION DIALOG ==================== */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm border border-[#2E2E3A] bg-[#0E0E12] p-6 space-y-4">
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white pb-2 border-b border-[#22222A]">
              {confirmDialog.title}
            </h3>
            <p className="text-xs text-[#A1A1B2] leading-relaxed">{confirmDialog.description}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 border border-[#2A2A35] bg-[#14141A] text-xs text-[#C4C4D0] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmDialog.onConfirm()}
                className={`px-4 py-2 font-semibold text-xs cursor-pointer ${
                  confirmDialog.isDanger
                    ? 'bg-rose-500 text-white'
                    : 'bg-white text-[#09090B]'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
