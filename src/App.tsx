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
  Compass,
  Search,
  Users,
  Check,
  Clock,
  Zap,
  UserMinus,
  Eye,
  History,
  Copy,
  FileCode2,
  GitBranch,
  Paperclip,
  Image as ImageIcon,
} from 'lucide-react';
import {
  WorkspaceData,
  StudentAccount,
  ProjectItem,
  ProjectInvitation,
  FolderItem,
  DocumentItem,
  TaskItem,
  NoticeItem,
  ChatMessageItem,
  ActivityLogItem,
  ActivityActionKind,
  InAppNotificationItem,
  TeacherShowcaseData,
  TaskStatus,
  NoticePriority,
  MAX_ACTIVE_PROJECTS,
  MAX_PROJECT_STORAGE_BYTES,
  MAX_SINGLE_FILE_BYTES,
} from './types';
import {
  auth,
  initAuth,
  signInWithGoogleAccount,
  googleSignIn,
  logoutGoogle,
  cleanUsername,
  getMyUserProfileFromFirestore,
  syncUserProfileToFirestore,
  subscribeToDirectoryUsers,
  subscribeToClassProjects,
  syncProjectToFirestore,
  updateProjectGithubUrlInFirestore,
  joinProjectInFirestore,
  removeMemberFromProjectInFirestore,
  deleteProjectFromFirestore,
  syncProjectWorkspaceStateToFirestore,
  subscribeToProjectWorkspaceState,
  sendProjectChatMessageInFirestore,
  subscribeToProjectChat,
  createProjectInvitationInFirestore,
  respondToInvitationInFirestore,
  subscribeToUserInvitations,
  syncProjectShowcaseToFirestore,
  getPublicProjectShowcaseFromFirestore,
  createInAppNotificationInFirestore,
  markInAppNotificationReadInFirestore,
  subscribeToInAppNotifications,
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
import { UserInvitePicker } from './components/UserInvitePicker';
import { ActivityLogDrawer } from './components/ActivityLogDrawer';
import { ProjectStatsTab } from './components/ProjectStatsTab';
import {
  CodeMarkdownViewerModal,
  canOpenInBuiltInViewer,
  isZipArchiveFile,
} from './components/CodeMarkdownViewerModal';
import { GitHubRepoWidget } from './components/GitHubRepoWidget';
import { NotificationsBellPanel } from './components/NotificationsBellPanel';
import { TeacherModeView } from './components/TeacherModeView';
import { AiRichMessage, AiAttachmentPreview } from './components/AiRichMessage';

type BentoSectionTab =
  | 'overview'
  | 'files'
  | 'tasks'
  | 'notices'
  | 'assistant'
  | 'stats'
  | 'projects'
  | 'explore';

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

// Helper to read text content from code/markdown/text files for built-in viewer & AI context
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
    'jsx',
    'ts',
    'tsx',
    'html',
    'css',
    'yaml',
    'yml',
  ]);
  if (!textExts.has(ext) || file.size > 300 * 1024) {
    return Promise.resolve(
      `Archivo .${ext.toUpperCase()} (${formatBytes(file.size)}) subido al proyecto.`
    );
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').slice(0, 12000));
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
const LOCAL_SELECTED_PROJECT_KEY = 'chikihub_selected_project_v4';
const LOCAL_UNLOCKED_PROJECTS_KEY = 'chikihub_unlocked_projects_v4';

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
  invitations: [],
};

function normalizeWorkspaceData(raw: Partial<WorkspaceData> | null | undefined): WorkspaceData {
  return {
    users: Array.isArray(raw?.users) ? raw!.users : [],
    projects: Array.isArray(raw?.projects) ? raw!.projects : [],
    folders: Array.isArray(raw?.folders) ? raw!.folders : [],
    documents: Array.isArray(raw?.documents) ? raw!.documents : [],
    tasks: Array.isArray(raw?.tasks) ? raw!.tasks : [],
    notices: Array.isArray(raw?.notices) ? raw!.notices : [],
    snippets: Array.isArray(raw?.snippets) ? raw!.snippets : [],
    messages: Array.isArray(raw?.messages) ? raw!.messages : [],
    activities: Array.isArray(raw?.activities) ? raw!.activities : [],
    invitations: Array.isArray(raw?.invitations) ? raw!.invitations : [],
  };
}

function getInitialLocalWorkspace(): WorkspaceData {
  try {
    const raw = localStorage.getItem(LOCAL_WORKSPACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return normalizeWorkspaceData(parsed);
      }
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_WORKSPACE_FALLBACK;
}

// Guaranteed localStorage persistence with automatic oversized-blob fallback so
// accounts, projects, links, folders, tasks, notices and invitations NEVER fail to save.
function persistWorkspaceLocally(ws: WorkspaceData) {
  try {
    localStorage.setItem(LOCAL_WORKSPACE_STORAGE_KEY, JSON.stringify(ws));
  } catch {
    try {
      const compactWs: WorkspaceData = {
        ...ws,
        documents: ws.documents.map((d) => ({
          ...d,
          fileDataUrl: d.fileDataUrl && d.fileDataUrl.length <= 200000 ? d.fileDataUrl : '',
        })),
      };
      localStorage.setItem(LOCAL_WORKSPACE_STORAGE_KEY, JSON.stringify(compactWs));
    } catch {
      // ignore if browser blocks storage completely
    }
  }
}

function mergeById<T extends { id: string }>(localArr: T[], incomingArr: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of localArr) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incomingArr) {
    if (item?.id) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function mergeUsersByUsername(
  localUsers: StudentAccount[],
  incomingUsers: StudentAccount[]
): StudentAccount[] {
  const map = new Map<string, StudentAccount>();
  for (const u of localUsers) {
    const key = u.username.toLowerCase().trim();
    if (key) map.set(key, u);
  }
  for (const u of incomingUsers) {
    const key = u.username.toLowerCase().trim();
    if (!key) continue;
    const prev = map.get(key);
    if (prev) {
      map.set(key, {
        ...prev,
        displayName: u.displayName || prev.displayName,
        role: u.role || prev.role,
        firebaseUid: u.firebaseUid || prev.firebaseUid,
        // Keep local passwordHash if incoming cloud profile omits PII/password
        passwordHash: prev.passwordHash || u.passwordHash,
      });
    } else {
      map.set(key, u);
    }
  }
  return Array.from(map.values());
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
      const params = new URLSearchParams(window.location.search);
      setIsTeacherMode(params.get('modo') === 'profesor');
      setTeacherUrlProjectId(params.get('proyecto') || '');
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
  const [firebaseAuthChecked, setFirebaseAuthChecked] = useState<boolean>(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState<boolean>(false);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  // Google Workspace OAuth & Firebase Auth State
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isGoogleLoggingIn, setIsGoogleLoggingIn] = useState<boolean>(false);
  const [syncBannerMessage, setSyncBannerMessage] = useState<string | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);
  const [isExtractingZip, setIsExtractingZip] = useState<boolean>(false);
  const activeProjectIdRef = useRef<string>('');
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

  // Active Project & Access Control (persisted in localStorage)
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    try {
      return localStorage.getItem(LOCAL_SELECTED_PROJECT_KEY) || '';
    } catch {
      return '';
    }
  });
  const [unlockedProjectIds, setUnlockedProjectIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_UNLOCKED_PROJECTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [passwordPromptProject, setPasswordPromptProject] = useState<ProjectItem | null>(null);
  const [projectPasswordInput, setProjectPasswordInput] = useState<string>('');
  const [projectPasswordError, setProjectPasswordError] = useState<string>('');

  // Notifications Center & Real-Time On-Screen Invitation Toast
  const [showNotificationsPanel, setShowNotificationsPanel] = useState<boolean>(false);
  const [liveInviteToast, setLiveInviteToast] = useState<ProjectInvitation | null>(null);
  const seenInviteIdsRef = useRef<Set<string>>(new Set());
  const [cloudNotifications, setCloudNotifications] = useState<InAppNotificationItem[]>([]);
  const [readDeadlineIds, setReadDeadlineIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('chikihub_read_deadlines_v1');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Modular Enhancement States: Teacher Mode (?modo=profesor), Activity Drawer, Code/MD Viewer
  const [isTeacherMode, setIsTeacherMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('modo') === 'profesor';
  });
  const [teacherUrlProjectId, setTeacherUrlProjectId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('proyecto') || '';
  });
  const [publicShowcase, setPublicShowcase] = useState<TeacherShowcaseData | null>(null);
  const [isLoadingPublicShowcase, setIsLoadingPublicShowcase] = useState<boolean>(false);
  const [publicShowcaseNotFound, setPublicShowcaseNotFound] = useState<boolean>(false);
  const [copiedTeacherLink, setCopiedTeacherLink] = useState<boolean>(false);
  const [showActivityDrawer, setShowActivityDrawer] = useState<boolean>(false);
  const [viewerDocItem, setViewerDocItem] = useState<DocumentItem | null>(null);

  // Explore Projects Search & Filter
  const [exploreSearchQuery, setExploreSearchQuery] = useState<string>('');
  const [exploreFilter, setExploreFilter] = useState<'all' | 'open' | 'protected' | 'others'>(
    'all'
  );

  // Spacious Multi-Section Navigation (8 Dedicated Bento Tabs)
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
  const [projDueDate, setProjDueDate] = useState<string>('2026-12-15');
  const [projGithubUrl, setProjGithubUrl] = useState<string>('');
  const [projHasPassword, setProjHasPassword] = useState<boolean>(true);
  const [projPassword, setProjPassword] = useState<string>('');
  const [selectedInviteUsers, setSelectedInviteUsers] = useState<StudentAccount[]>([]);

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

  // AI & Real-Time Chat state
  const [commMode, setCommMode] = useState<'ai' | 'chat'>('ai');
  const [chatInput, setChatInput] = useState<string>('');
  const [liveChatByProject, setLiveChatByProject] = useState<Record<string, ChatMessageItem[]>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const lastViewedProjectRef = useRef<{ id: string; name: string } | null>(null);
  const [aiMessages, setAiMessages] = useState<
    {
      id: string;
      role: 'user' | 'assistant';
      text: string;
      timestamp: string;
      attachments?: AiAttachmentPreview[];
    }[]
  >([
    {
      id: 'welcome_ai',
      role: 'assistant',
      text: '## Asistente Técnico del Proyecto\nSoy la IA exclusiva de este espacio de trabajo. Conozco vuestras **{azul:carpetas}**, **{cian:archivos}**, **{verde:tareas}** y **{ambar:avisos}**.\n\n- Pídeme **estadísticas visuales**, tablas comparativas o el árbol limpio de carpetas.\n- Sube **imágenes, PDFs, Word (.docx), código o .ZIP** usando el botón de adjuntar.\n- Activa **Gráfico / Imagen** para generar diagramas e ilustraciones descargables en **PNG y SVG**.',
      timestamp: 'Ahora',
    },
  ]);
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [aiAttachments, setAiAttachments] = useState<
    (AiAttachmentPreview & { dataBase64?: string; textContent?: string })[]
  >([]);
  const [aiVisualMode, setAiVisualMode] = useState<boolean>(false);
  const [isDraggingAiFile, setIsDraggingAiFile] = useState<boolean>(false);
  const aiFileInputRef = useRef<HTMLInputElement | null>(null);
  const aiEndRef = useRef<HTMLDivElement | null>(null);

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

  // Persist selectedProjectId and unlockedProjectIds across refreshes
  useEffect(() => {
    try {
      if (selectedProjectId) {
        localStorage.setItem(LOCAL_SELECTED_PROJECT_KEY, selectedProjectId);
      }
    } catch {
      // ignore
    }
  }, [selectedProjectId]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_UNLOCKED_PROJECTS_KEY, JSON.stringify(unlockedProjectIds));
    } catch {
      // ignore
    }
  }, [unlockedProjectIds]);

  // Load initial local cache quickly (real-time cloud sync takes over as soon as Google Auth resolves)
  useEffect(() => {
    const localData = getInitialLocalWorkspace();
    setWorkspace(localData);
    const savedProjId = localStorage.getItem(LOCAL_SELECTED_PROJECT_KEY);
    if (savedProjId) {
      setSelectedProjectId(savedProjId);
    }
    setIsLoadingWorkspace(false);
  }, []);

  const hydratingUidRef = useRef<string | null>(null);

  // Shared immediate session hydrator: transitions straight into workspace OR first-time @username setup (zero refresh!)
  const hydrateGoogleSession = useCallback(
    async (
      user: { uid: string; email?: string | null; displayName?: string | null },
      token: string | null
    ) => {
      if (!user?.uid) return;
      setFirebaseUid(user.uid);
      setGoogleUserEmail(user.email || 'Conectado con Google');
      if (token) setGoogleAccessToken(token);

      // Avoid parallel duplicate fetches for the same UID
      if (hydratingUidRef.current === user.uid) return;
      hydratingUidRef.current = user.uid;

      try {
        const cloudProfile = await getMyUserProfileFromFirestore(user.uid);
        // Make sure auth user hasn't signed out while awaiting
        if (auth.currentUser?.uid !== user.uid) return;

        if (cloudProfile) {
          setCurrentUser(cloudProfile);
          setNeedsProfileSetup(false);
          setAuthError('');
          localStorage.setItem('chikihub_logged_user', cloudProfile.username);
        } else {
          // First time signing in with this Google account: immediately reveal @username setup form
          const emailPrefix = (user.email || 'estudiante').split('@')[0];
          setAuthUsername(cleanUsername(emailPrefix));
          setAuthDisplayName(user.displayName || emailPrefix);
          setAuthRole('Estudiante de Informática');
          setAuthError('');
          setCurrentUser(null);
          setNeedsProfileSetup(true);
          window.setTimeout(() => {
            document.getElementById('acceso-grupo')?.scrollIntoView({ behavior: 'smooth' });
          }, 80);
        }
      } finally {
        hydratingUidRef.current = null;
        setFirebaseAuthChecked(true);
      }
    },
    []
  );

  // Initialize Firebase Google Auth listener (individual personal accounts across ALL browsers & devices)
  useEffect(() => {
    let active = true;
    const unsubscribe = initAuth(
      async (user, token) => {
        if (!active) return;
        await hydrateGoogleSession(user, token);
      },
      () => {
        if (!active) return;
        hydratingUidRef.current = null;
        setFirebaseUid(null);
        setGoogleUserEmail(null);
        setGoogleAccessToken(null);
        setCurrentUser(null);
        setNeedsProfileSetup(false);
        setLiveInviteToast(null);
        setShowNotificationsPanel(false);
        seenInviteIdsRef.current.clear();
        setFirebaseAuthChecked(true);
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [hydrateGoogleSession]);

  // Real-time Firestore subscriptions (Authoritative Cloud Source of Truth — instant sync across browsers)
  useEffect(() => {
    if (!firebaseUid) return;

    const unsubUsers = subscribeToDirectoryUsers((cloudUsers) => {
      setWorkspace((prev) => {
        const next: WorkspaceData = {
          ...prev,
          users: cloudUsers,
        };
        persistWorkspaceLocally(next);
        return next;
      });
    });

    const unsubProjects = subscribeToClassProjects(firebaseUid, (cloudProjects) => {
      setWorkspace((prev) => {
        const next: WorkspaceData = {
          ...prev,
          projects: cloudProjects,
        };
        persistWorkspaceLocally(next);
        return next;
      });
    });

    const unsubInvites = subscribeToUserInvitations(firebaseUid, (cloudInvites) => {
      setWorkspace((prev) => {
        const next: WorkspaceData = {
          ...prev,
          invitations: cloudInvites,
        };
        persistWorkspaceLocally(next);
        return next;
      });
    });

    const unsubNotifs = subscribeToInAppNotifications(firebaseUid, (items) => {
      setCloudNotifications(items);
    });

    return () => {
      unsubUsers();
      unsubProjects();
      unsubInvites();
      unsubNotifs();
    };
  }, [firebaseUid]);

  // Helper to prepend an event into the bounded 30-event project audit log
  const appendProjectActivity = useCallback(
    (
      ws: WorkspaceData,
      projectId: string,
      action: string,
      targetName: string,
      kind: ActivityActionKind
    ): ActivityLogItem[] => {
      const actor = currentUser?.displayName || currentUser?.username || 'Equipo';
      const entry: ActivityLogItem = {
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        projectId,
        actorUsername: actor,
        action,
        targetName,
        kind,
        createdAt: new Date().toISOString(),
      };
      const projectActs = [entry, ...ws.activities.filter((a) => a.projectId === projectId)].slice(
        0,
        30
      );
      const otherActs = ws.activities.filter((a) => a.projectId !== projectId);
      return [...projectActs, ...otherActs];
    },
    [currentUser]
  );

  // Persist workspace helper (LocalStorage + Instant Firestore Project State & Public Showcase Sync)
  const saveWorkspace = useCallback(
    async (
      updated: WorkspaceData,
      syncedProjectId?: string,
      skipCloudStateSync = false
    ) => {
      const normalized = normalizeWorkspaceData(updated);
      setWorkspace(normalized);
      persistWorkspaceLocally(normalized);

      if (!skipCloudStateSync) {
        const targetProjId = syncedProjectId || activeProjectIdRef.current || selectedProjectId;
        if (auth.currentUser?.emailVerified && targetProjId) {
          const targetProject = normalized.projects.find((p) => p.id === targetProjId);
          if (targetProject) {
            const pFolders = normalized.folders.filter((f) => f.projectId === targetProjId);
            const pDocs = normalized.documents.filter((d) => d.projectId === targetProjId);
            const pTasks = normalized.tasks.filter((t) => t.projectId === targetProjId);
            const pNotices = normalized.notices.filter((n) => n.projectId === targetProjId);
            const pMessages = normalized.messages.filter((m) => m.projectId === targetProjId);
            const pActivities = normalized.activities
              .filter((a) => a.projectId === targetProjId)
              .slice(0, 30);

            await syncProjectWorkspaceStateToFirestore(targetProjId, {
              folders: pFolders,
              documents: pDocs,
              tasks: pTasks,
              notices: pNotices,
              messages: pMessages,
              activities: pActivities,
            });
            // Keep public ?modo=profesor showcase silently up to date (zero PII, zero notices/chat)
            syncProjectShowcaseToFirestore(targetProject, pFolders, pDocs, pTasks).catch(() => {});
          }
        }
      }
    },
    [selectedProjectId]
  );

  // Check if user is the creator/owner of a project
  const isProjectOwner = useCallback(
    (project: ProjectItem | null): boolean => {
      if (!project || !currentUser) return false;
      if (firebaseUid && project.ownerId) {
        return project.ownerId === firebaseUid;
      }
      return project.ownerUsername.toLowerCase().trim() === currentUser.username.toLowerCase().trim();
    },
    [firebaseUid, currentUser]
  );

  // Check if user is an authorized member of a project
  // CRITICAL: When connected to Firebase, NEVER let stale local unlockedProjectIds override creator removal!
  const isUserMemberOfProject = useCallback(
    (project: ProjectItem | null, user: StudentAccount | null): boolean => {
      if (!project || !user) return false;
      if (firebaseUid && project.ownerId === firebaseUid) return true;
      if (firebaseUid && project.memberUids?.includes(firebaseUid)) return true;
      const uname = user.username.toLowerCase().trim();
      if (project.ownerUsername.toLowerCase().trim() === uname) return true;
      if (project.authorizedUsernames.some((u) => u.toLowerCase().trim() === uname)) return true;
      if (!firebaseUid && unlockedProjectIds.includes(project.id)) return true;
      return false;
    },
    [unlockedProjectIds, firebaseUid]
  );

  const isUserAuthorizedOnProject = useCallback(
    (project: ProjectItem | null, user: StudentAccount | null): boolean => {
      if (!project) return false;
      if (!project.hasPassword) return true;
      return isUserMemberOfProject(project, user);
    },
    [isUserMemberOfProject]
  );

  // Projects the current user belongs to ("Mis Proyectos")
  const myProjects = useMemo(() => {
    if (!workspace || !currentUser) return [];
    return workspace.projects.filter((p) => isUserMemberOfProject(p, currentUser));
  }, [workspace, currentUser, isUserMemberOfProject]);

  // Current selected project (from user's projects or unlocked project)
  const activeProject = useMemo(() => {
    if (!workspace || workspace.projects.length === 0) return null;
    const direct = workspace.projects.find((p) => p.id === selectedProjectId);
    if (direct && isUserMemberOfProject(direct, currentUser)) return direct;
    return myProjects[0] || null;
  }, [workspace, selectedProjectId, myProjects, currentUser, isUserMemberOfProject]);

  // Confirmed Firestore membership gate (ensures listeners attach/re-attach cleanly once memberUids is synced)
  const isConfirmedCloudMember = useMemo(() => {
    if (!firebaseUid || !activeProject) return false;
    return (
      activeProject.ownerId === firebaseUid ||
      (Array.isArray(activeProject.memberUids) && activeProject.memberUids.includes(firebaseUid))
    );
  }, [firebaseUid, activeProject]);

  // Real-time Kick Detection: if creator removes this user from the currently open project, revoke immediately
  useEffect(() => {
    if (!currentUser || !firebaseUid) return;
    if (activeProject) {
      lastViewedProjectRef.current = { id: activeProject.id, name: activeProject.name };
      return;
    }
    const prevViewed = lastViewedProjectRef.current;
    if (prevViewed) {
      const stillExists = workspace.projects.find((p) => p.id === prevViewed.id);
      if (stillExists && !isUserMemberOfProject(stillExists, currentUser)) {
        lastViewedProjectRef.current = null;
        setUnlockedProjectIds((prev) => prev.filter((id) => id !== stillExists.id));
        if (selectedProjectId === stillExists.id) {
          setSelectedProjectId('');
        }
        showToast(`Has sido eliminado del proyecto «${stillExists.name}» por su creador.`);
      }
    }
  }, [activeProject, workspace.projects, currentUser, firebaseUid, isUserMemberOfProject, selectedProjectId, showToast]);

  // Keep activeProjectIdRef always synchronized for instant Firestore writes
  useEffect(() => {
    activeProjectIdRef.current = activeProject?.id || '';
  }, [activeProject?.id]);

  // Subscribe to real-time shared Firestore state of activeProject (folders, files, tasks, notices)
  // CRITICAL: Replace arrays authoritatively so DELETIONS by teammates vanish in milliseconds!
  useEffect(() => {
    if (!firebaseUid || !activeProject?.id || !isConfirmedCloudMember) return;
    const pId = activeProject.id;
    const unsubState = subscribeToProjectWorkspaceState(pId, (cloudState) => {
      setWorkspace((prev) => {
        // Preserve large local binary dataUrls ONLY for documents that still exist in cloudState
        const localBlobById = new Map<string, string>();
        prev.documents
          .filter((d) => d.projectId === pId && d.fileDataUrl)
          .forEach((d) => localBlobById.set(d.id, d.fileDataUrl || ''));

        const syncedDocs: DocumentItem[] = cloudState.documents.map((docItem) => {
          const cachedBlob = localBlobById.get(docItem.id);
          if (!docItem.fileDataUrl && cachedBlob) {
            return { ...docItem, fileDataUrl: cachedBlob };
          }
          return docItem;
        });

        const next: WorkspaceData = {
          ...prev,
          folders: [...prev.folders.filter((f) => f.projectId !== pId), ...cloudState.folders],
          documents: [...prev.documents.filter((d) => d.projectId !== pId), ...syncedDocs],
          tasks: [...prev.tasks.filter((t) => t.projectId !== pId), ...cloudState.tasks],
          notices: [...prev.notices.filter((n) => n.projectId !== pId), ...cloudState.notices],
          messages: [...prev.messages.filter((m) => m.projectId !== pId), ...cloudState.messages],
          activities: [
            ...prev.activities.filter((a) => a.projectId !== pId),
            ...(Array.isArray(cloudState.activities) ? cloudState.activities.slice(0, 30) : []),
          ],
        };
        persistWorkspaceLocally(next);
        return next;
      });
    });

    // Dedicated real-time chat stream (/projects/{pId}/state/chat) — atomic & instant!
    const unsubChat = subscribeToProjectChat(pId, (cloudMessages) => {
      setLiveChatByProject((prev) => ({
        ...prev,
        [pId]: cloudMessages,
      }));
    });

    return () => {
      unsubState();
      unsubChat();
    };
  }, [firebaseUid, activeProject?.id, isConfirmedCloudMember]);

  // Pending & All Invitations for current logged-in user
  const myIncomingInvitations = useMemo(() => {
    if (!currentUser || !workspace?.invitations) return [];
    const uname = currentUser.username.toLowerCase().trim();
    return workspace.invitations
      .filter(
        (inv) =>
          inv.toUsername.toLowerCase().trim() === uname ||
          (firebaseUid && inv.toUid === firebaseUid)
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [workspace?.invitations, currentUser, firebaseUid]);

  const pendingInvitations = useMemo(
    () => myIncomingInvitations.filter((inv) => inv.status === 'pending'),
    [myIncomingInvitations]
  );

  // Trigger instant on-screen notification card whenever a new pending invitation arrives!
  useEffect(() => {
    if (!currentUser || pendingInvitations.length === 0) return;
    const nextUnseen = pendingInvitations.find((inv) => !seenInviteIdsRef.current.has(inv.id));
    if (nextUnseen) {
      seenInviteIdsRef.current.add(nextUnseen.id);
      setLiveInviteToast(nextUnseen);
    }
  }, [currentUser, pendingInvitations]);

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

  const projectActivities = useMemo(
    () =>
      workspace && activeProject
        ? workspace.activities
            .filter((a) => a.projectId === activeProject.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 30)
        : [],
    [workspace, activeProject]
  );

  // Automatic client-side notifications when < 48 hours remain for a project or assigned task deadline
  const deadlineNotifications = useMemo<InAppNotificationItem[]>(() => {
    if (!currentUser || !workspace) return [];
    const nowMs = Date.now();
    const limitMs = 48 * 60 * 60 * 1000;
    const alerts: InAppNotificationItem[] = [];
    const unameLower = currentUser.username.toLowerCase().trim();

    for (const proj of myProjects) {
      if (proj.dueDate) {
        const dueMs = new Date(proj.dueDate).getTime();
        const diffMs = dueMs - nowMs;
        if (!Number.isNaN(dueMs) && diffMs > 0 && diffMs <= limitMs) {
          const hoursLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
          const id = `dl_proj_${proj.id}_${proj.dueDate.slice(0, 10)}`;
          alerts.push({
            id,
            toUid: firebaseUid || currentUser.id,
            toUsername: currentUser.username,
            fromUid: 'system',
            fromUsername: 'sistema',
            projectId: proj.id,
            projectName: proj.name,
            kind: 'deadline_48h',
            title: `Entrega próxima (quedan ${hoursLeft}h)`,
            message: `La entrega de «${proj.name}» vence en menos de 48 horas.`,
            targetSection: 'overview',
            read: readDeadlineIds.includes(id),
            createdAt: new Date(nowMs).toISOString(),
          });
        }
      }
    }

    for (const task of workspace.tasks) {
      if (task.status === 'completed' || !task.dueDate) continue;
      if (task.assigneeUsername.toLowerCase().trim() !== unameLower) continue;
      const proj = myProjects.find((p) => p.id === task.projectId);
      if (!proj) continue;
      const dueMs = new Date(task.dueDate).getTime();
      const diffMs = dueMs - nowMs;
      if (!Number.isNaN(dueMs) && diffMs > 0 && diffMs <= limitMs) {
        const hoursLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
        const id = `dl_task_${task.id}_${task.dueDate.slice(0, 10)}`;
        alerts.push({
          id,
          toUid: firebaseUid || currentUser.id,
          toUsername: currentUser.username,
          fromUid: 'system',
          fromUsername: 'sistema',
          projectId: proj.id,
          projectName: proj.name,
          kind: 'deadline_48h',
          title: `Tarea vence en ${hoursLeft}h`,
          message: `Tu tarea «${task.title}» vence en menos de 48 horas.`,
          targetSection: 'tasks',
          read: readDeadlineIds.includes(id),
          createdAt: new Date(nowMs).toISOString(),
        });
      }
    }

    return alerts;
  }, [currentUser, workspace, myProjects, firebaseUid, readDeadlineIds]);

  const allActivityNotifications = useMemo<InAppNotificationItem[]>(() => {
    const map = new Map<string, InAppNotificationItem>();
    for (const n of deadlineNotifications) map.set(n.id, n);
    for (const n of cloudNotifications) map.set(n.id, n);
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [cloudNotifications, deadlineNotifications]);

  const totalUnreadNotificationsCount = useMemo(() => {
    const unreadActivity = allActivityNotifications.filter((n) => !n.read).length;
    return pendingInvitations.length + unreadActivity;
  }, [pendingInvitations.length, allActivityNotifications]);

  // Fetch public read-only Teacher Showcase when opening ?modo=profesor&proyecto=<id> without login
  useEffect(() => {
    if (!isTeacherMode || !teacherUrlProjectId) return;
    let cancelled = false;
    setIsLoadingPublicShowcase(true);
    setPublicShowcaseNotFound(false);

    getPublicProjectShowcaseFromFirestore(teacherUrlProjectId)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setPublicShowcase(data);
          setPublicShowcaseNotFound(false);
        } else {
          setPublicShowcase(null);
          setPublicShowcaseNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPublicShowcase(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isTeacherMode, teacherUrlProjectId]);

  const handleEnterTeacherMode = useCallback(async () => {
    if (!activeProject) return;
    // Ensure public showcase is freshly synced before switching
    if (firebaseUid) {
      syncProjectShowcaseToFirestore(
        activeProject,
        projectFolders,
        projectDocuments,
        projectTasks
      ).catch(() => {});
    }
    setTeacherUrlProjectId(activeProject.id);
    setIsTeacherMode(true);
    if (typeof window !== 'undefined') {
      const nextUrl = `${window.location.pathname}?modo=profesor&proyecto=${encodeURIComponent(
        activeProject.id
      )}`;
      window.history.pushState({}, '', nextUrl);
    }
  }, [activeProject, firebaseUid, projectFolders, projectDocuments, projectTasks]);

  const handleExitTeacherMode = useCallback(() => {
    setIsTeacherMode(false);
    setTeacherUrlProjectId('');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', window.location.pathname || '/');
    }
  }, []);

  const handleCopyTeacherLink = useCallback(async () => {
    const targetId = activeProject?.id || teacherUrlProjectId;
    if (!targetId) return;
    if (activeProject && firebaseUid) {
      await syncProjectShowcaseToFirestore(
        activeProject,
        projectFolders,
        projectDocuments,
        projectTasks
      );
    }
    const shareUrl = `${window.location.origin}/?modo=profesor&proyecto=${encodeURIComponent(
      targetId
    )}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedTeacherLink(true);
    showToast('Enlace directo ?modo=profesor copiado al portapapeles.');
    window.setTimeout(() => setCopiedTeacherLink(false), 2600);
  }, [
    activeProject,
    teacherUrlProjectId,
    firebaseUid,
    projectFolders,
    projectDocuments,
    projectTasks,
    showToast,
  ]);

  const handleUpdateProjectGithubUrl = useCallback(
    async (nextUrl: string) => {
      if (!activeProject || !workspace) return;
      const cleaned = nextUrl.trim();
      const updatedProj: ProjectItem = {
        ...activeProject,
        githubUrl: cleaned,
        updatedAt: new Date().toISOString(),
      };
      if (firebaseUid) {
        await updateProjectGithubUrlInFirestore(activeProject.id, cleaned);
        syncProjectShowcaseToFirestore(
          updatedProj,
          projectFolders,
          projectDocuments,
          projectTasks
        ).catch(() => {});
      }
      const nextWs: WorkspaceData = {
        ...workspace,
        projects: workspace.projects.map((p) => (p.id === activeProject.id ? updatedProj : p)),
      };
      await saveWorkspace(nextWs, undefined, true);
      showToast(
        cleaned
          ? 'Repositorio público de GitHub vinculado al proyecto.'
          : 'Enlace de GitHub eliminado del proyecto.'
      );
    },
    [
      activeProject,
      workspace,
      firebaseUid,
      projectFolders,
      projectDocuments,
      projectTasks,
      saveWorkspace,
      showToast,
    ]
  );

  const handleClickActivityNotification = useCallback(
    async (item: InAppNotificationItem) => {
      if (!item.read) {
        if (item.kind === 'deadline_48h') {
          setReadDeadlineIds((prev) => {
            const next = prev.includes(item.id) ? prev : [...prev, item.id];
            try {
              localStorage.setItem('chikihub_read_deadlines_v1', JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        } else if (firebaseUid) {
          setCloudNotifications((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
          );
          markInAppNotificationReadInFirestore(item.id).catch(() => {});
        }
      }
      if (item.projectId) {
        setSelectedProjectId(item.projectId);
      }
      setActiveSection(item.targetSection);
    },
    [firebaseUid]
  );

  const handleMarkAllNotificationsRead = useCallback(async () => {
    const dlIds = deadlineNotifications.map((n) => n.id);
    if (dlIds.length > 0) {
      setReadDeadlineIds((prev) => {
        const next = Array.from(new Set([...prev, ...dlIds]));
        try {
          localStorage.setItem('chikihub_read_deadlines_v1', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
    const unreadCloud = cloudNotifications.filter((n) => !n.read);
    if (unreadCloud.length > 0 && firebaseUid) {
      setCloudNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      await Promise.all(unreadCloud.map((n) => markInAppNotificationReadInFirestore(n.id)));
    }
    showToast('Todas las notificaciones marcadas como leídas.');
  }, [deadlineNotifications, cloudNotifications, firebaseUid, showToast]);

  // Merge live real-time chat doc messages + any legacy messages from state/main, sorted chronologically
  const projectMessages = useMemo(() => {
    if (!activeProject) return [];
    const byId = new Map<string, ChatMessageItem>();
    const legacy = workspace ? workspace.messages.filter((m) => m.projectId === activeProject.id) : [];
    const live = liveChatByProject[activeProject.id] || [];
    for (const m of legacy) byId.set(m.id, m);
    for (const m of live) byId.set(m.id, m);
    return Array.from(byId.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [workspace, activeProject, liveChatByProject]);

  // Auto-scroll chat to bottom whenever new messages arrive live
  useEffect(() => {
    if (activeSection === 'assistant' && commMode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [projectMessages.length, activeSection, commMode]);

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
      activities: appendProjectActivity(
        workspace,
        activeProject.id,
        'enlazó Google Docs',
        newDoc.title,
        'google_link'
      ),
    };

    await saveWorkspace(updatedWorkspace);
    await syncDocumentToFirestore(newDoc);
    setShowCreateGoogleFileModal(false);
    showToast(`Archivo "${newDoc.title}" creado y vinculado a ${chosen.label}.`);
  };

  // Primary Personal Account Sign-In with Google (Social-Network Style, Instant Transition, Zero Refresh)
  const handleGoogleAccountSignIn = async () => {
    setIsGoogleLoggingIn(true);
    setAuthError('');
    try {
      const { user } = await signInWithGoogleAccount();
      // Immediately hydrate profile & transition to workspace OR first-time @username setup
      await hydrateGoogleSession(user, null);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
        setAuthError('Has cerrado la ventana de Google antes de completar el inicio de sesión.');
      } else if (code.includes('popup-blocked')) {
        setAuthError(
          'Tu navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.'
        );
      } else if (code.includes('unauthorized-domain')) {
        setAuthError(
          'Este dominio todavía no está autorizado en Firebase Auth. Añádelo en Authentication > Settings > Authorized domains.'
        );
      } else if (code.includes('network-request-failed')) {
        setAuthError('Error de red al conectar con Google. Comprueba tu conexión a internet.');
      } else {
        setAuthError(
          'No se pudo iniciar sesión con Google. Inténtalo de nuevo o comprueba los permisos del navegador.'
        );
      }
    } finally {
      setIsGoogleLoggingIn(false);
    }
  };

  // First-Time Profile Completion (Saves unique @username + DisplayName + Role into Firestore /users/{uid})
  const handleCompleteCloudProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUid) return;
    setAuthError('');

    const sanitizedUsername = authUsername.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '');
    if (sanitizedUsername.length < 2) {
      setAuthError('El nombre de usuario debe tener al menos 2 letras o números.');
      return;
    }

    const takenByOther = workspace.users.some(
      (u) =>
        u.username.toLowerCase() === sanitizedUsername &&
        u.firebaseUid !== firebaseUid
    );
    if (takenByOther) {
      setAuthError(`El usuario @${sanitizedUsername} ya está en uso por otro compañero. Elige otro.`);
      return;
    }

    setIsSavingProfile(true);
    try {
      const newProfile: StudentAccount = {
        id: `fb_${firebaseUid}`,
        firebaseUid,
        username: sanitizedUsername,
        displayName: authDisplayName.trim() || sanitizedUsername,
        passwordHash: '',
        role: authRole.trim() || 'Estudiante de Informática',
        createdAt: new Date().toISOString(),
      };

      const saved = await syncUserProfileToFirestore(newProfile);
      if (!saved) {
        setAuthError('No se pudo guardar tu perfil en la nube. Inténtalo de nuevo.');
        return;
      }

      setCurrentUser(newProfile);
      setNeedsProfileSetup(false);
      localStorage.setItem('chikihub_logged_user', newProfile.username);
      setWorkspace((prev) => {
        const next = { ...prev, users: mergeUsersByUsername(prev.users, [newProfile]) };
        persistWorkspaceLocally(next);
        return next;
      });
      showToast(`¡Bienvenido @${newProfile.username}! Tu cuenta ya está sincronizada en tiempo real.`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogoutStudent = async () => {
    localStorage.removeItem('chikihub_logged_user');
    setCurrentUser(null);
    setNeedsProfileSetup(false);
    setLiveInviteToast(null);
    setShowNotificationsPanel(false);
    seenInviteIdsRef.current.clear();
    try {
      await logoutGoogle();
    } catch {
      // ignore
    }
  };

  // Join a project permanently in Firestore (NEVER overwrites project state/main!)
  const addCurrentUserToProject = async (project: ProjectItem) => {
    if (!currentUser || !workspace) return;
    if (firebaseUid) {
      const ok = await joinProjectInFirestore(project, currentUser.username);
      if (!ok) {
        showToast('No se pudo unir al proyecto en la nube. Inténtalo de nuevo.');
        return;
      }
    }
    const uname = currentUser.username.toLowerCase().trim();
    const updatedAuthUsers = Array.from(
      new Set([...project.authorizedUsernames.map((u) => u.toLowerCase().trim()), uname])
    );
    const updatedMemberUids = Array.from(
      new Set([...(project.memberUids || []), ...(firebaseUid ? [firebaseUid] : [])])
    );
    const updatedProj: ProjectItem = {
      ...project,
      authorizedUsernames: updatedAuthUsers,
      memberUids: updatedMemberUids,
      updatedAt: new Date().toISOString(),
    };
    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      projects: workspace.projects.map((p) => (p.id === project.id ? updatedProj : p)),
    };
    // skipCloudStateSync = true so we NEVER overwrite existing files/folders/tasks with empty arrays!
    await saveWorkspace(updatedWorkspace, undefined, true);
    setUnlockedProjectIds((prev) => (prev.includes(project.id) ? prev : [...prev, project.id]));
    setSelectedProjectId(project.id);
    setCurrentFolderId('root');
    setActiveSection('overview');
  };

  // Select a project or join from Explorar Proyectos
  const handleSelectProject = async (project: ProjectItem) => {
    if (isUserMemberOfProject(project, currentUser)) {
      setSelectedProjectId(project.id);
      setCurrentFolderId('root');
      setActiveSection('overview');
    } else if (!project.hasPassword) {
      await addCurrentUserToProject(project);
      showToast(`Te has unido al proyecto abierto «${project.name}».`);
    } else {
      setPasswordPromptProject(project);
      setProjectPasswordInput('');
      setProjectPasswordError('');
    }
  };

  const handleUnlockProjectWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPromptProject) return;
    if (projectPasswordInput.trim() === passwordPromptProject.passwordHash) {
      const target = passwordPromptProject;
      setPasswordPromptProject(null);
      await addCurrentUserToProject(target);
      showToast(`Te has unido a «${target.name}» con contraseña.`);
    } else {
      setProjectPasswordError('Contraseña del proyecto incorrecta.');
    }
  };

  // Accept or Decline a Project Invitation Notification (Real-Time Firestore)
  const handleRespondInvitation = async (
    invitation: ProjectInvitation,
    decision: 'accepted' | 'declined'
  ) => {
    if (!workspace || !currentUser) return;
    const targetProject = workspace.projects.find((p) => p.id === invitation.projectId);

    if (firebaseUid) {
      await respondToInvitationInFirestore(invitation.id, decision);
      if (decision === 'accepted' && targetProject) {
        await joinProjectInFirestore(targetProject, currentUser.username);
      }
    }

    const nowIso = new Date().toISOString();
    const updatedInvitations = workspace.invitations.map((inv) =>
      inv.id === invitation.id ? { ...inv, status: decision, updatedAt: nowIso } : inv
    );

    let updatedProjects = workspace.projects;
    if (decision === 'accepted' && targetProject) {
      const uname = currentUser.username.toLowerCase().trim();
      const updatedProj: ProjectItem = {
        ...targetProject,
        authorizedUsernames: Array.from(
          new Set([...targetProject.authorizedUsernames.map((u) => u.toLowerCase()), uname])
        ),
        memberUids: Array.from(
          new Set([...(targetProject.memberUids || []), ...(firebaseUid ? [firebaseUid] : [])])
        ),
        updatedAt: nowIso,
      };
      updatedProjects = workspace.projects.map((p) =>
        p.id === targetProject.id ? updatedProj : p
      );
      setUnlockedProjectIds((prev) =>
        prev.includes(targetProject.id) ? prev : [...prev, targetProject.id]
      );
      setSelectedProjectId(targetProject.id);
      setCurrentFolderId('root');
      setActiveSection('overview');
    }

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      projects: updatedProjects,
      invitations: updatedInvitations,
    };

    // skipCloudStateSync = true so accepting an invite NEVER wipes project files in Firestore!
    await saveWorkspace(updatedWorkspace, undefined, true);
    setLiveInviteToast((prev) => (prev?.id === invitation.id ? null : prev));
    if (decision === 'accepted') {
      showToast(`¡Invitación aceptada! Ya formas parte de «${invitation.projectName}».`);
    } else {
      showToast(`Has rechazado la invitación a «${invitation.projectName}».`);
    }
  };

  // Create or Update Project (Enforcing MAX_ACTIVE_PROJECTS = 5 for user's owned projects)
  const openCreateProjectModal = () => {
    const ownedCount = currentUser
      ? workspace.projects.filter(
          (p) => p.ownerUsername.toLowerCase() === currentUser.username.toLowerCase()
        ).length
      : workspace.projects.length;

    if (ownedCount >= MAX_ACTIVE_PROJECTS) {
      showToast(
        `Límite gratuito alcanzado (${MAX_ACTIVE_PROJECTS}/${MAX_ACTIVE_PROJECTS} proyectos propios). Elimina uno antiguo para crear otro.`
      );
      return;
    }
    setEditingProject(null);
    setProjName('');
    setProjSubject('');
    setProjDesc('');
    setProjDueDate('2026-12-15');
    setProjGithubUrl('');
    setProjHasPassword(true);
    setProjPassword('1234');
    setSelectedInviteUsers([]);
    setShowProjectModal(true);
  };

  const openEditProjectModal = () => {
    if (!activeProject) return;
    setEditingProject(activeProject);
    setProjName(activeProject.name);
    setProjSubject(activeProject.subject);
    setProjDesc(activeProject.description);
    setProjDueDate(activeProject.dueDate.slice(0, 10));
    setProjGithubUrl(activeProject.githubUrl || '');
    setProjHasPassword(activeProject.hasPassword);
    setProjPassword(activeProject.passwordHash);
    setSelectedInviteUsers([]);
    setShowProjectModal(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !projName.trim() || !currentUser) return;

    const nowIso = new Date().toISOString();
    let savedProject: ProjectItem;
    let nextProjects: ProjectItem[];

    if (editingProject) {
      savedProject = {
        ...editingProject,
        name: projName.trim(),
        subject: projSubject.trim() || 'Informática',
        description: projDesc.trim(),
        hasPassword: projHasPassword,
        passwordHash: projHasPassword ? projPassword.trim() || '1234' : '',
        visibility: editingProject.visibility || 'class',
        dueDate: new Date(projDueDate || '2026-12-15').toISOString(),
        githubUrl: projGithubUrl.trim(),
        updatedAt: nowIso,
      };
      nextProjects = workspace.projects.map((p) => (p.id === editingProject.id ? savedProject : p));
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

      savedProject = {
        id: `proj_${Date.now()}`,
        name: projName.trim(),
        subject: projSubject.trim() || 'Informática',
        description: projDesc.trim(),
        ownerId: firebaseUid || currentUser.id,
        ownerUsername: currentUser.username,
        hasPassword: projHasPassword,
        passwordHash: projHasPassword ? projPassword.trim() || '1234' : '',
        authorizedUsernames: [currentUser.username.toLowerCase()],
        memberUids: firebaseUid ? [firebaseUid] : [],
        visibility: 'class',
        dueDate: new Date(projDueDate || '2026-12-15').toISOString(),
        driveFolderId,
        githubUrl: projGithubUrl.trim(),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      nextProjects = [savedProject, ...workspace.projects];
    }

    // Build real ProjectInvitation notifications for every selected registered classmate
    const createdInvitations: ProjectInvitation[] = [];
    for (const invitedUser of selectedInviteUsers) {
      const targetUname = invitedUser.username.toLowerCase().trim();
      const alreadyPending = workspace.invitations.some(
        (inv) =>
          inv.projectId === savedProject.id &&
          inv.toUsername.toLowerCase() === targetUname &&
          inv.status === 'pending'
      );
      if (alreadyPending) continue;
      createdInvitations.push({
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        projectId: savedProject.id,
        projectName: savedProject.name,
        projectSubject: savedProject.subject,
        fromUid: firebaseUid || currentUser.id,
        fromUsername: currentUser.username,
        toUid: invitedUser.firebaseUid || invitedUser.id,
        toUsername: targetUname,
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // 1. FIRST sync project doc to Firestore so rules allow state/main + invitations!
    const projectSynced = await syncProjectToFirestore(savedProject, !editingProject);
    if (firebaseUid && !projectSynced) {
      showToast('Error al guardar el proyecto en la nube. Inténtalo de nuevo.');
      return;
    }

    // 2. If brand-new project, initialize its real-time shared state + public showcase immediately
    if (!editingProject && firebaseUid) {
      await syncProjectWorkspaceStateToFirestore(savedProject.id, {
        folders: [],
        documents: [],
        tasks: [],
        notices: [],
        messages: [],
        activities: [],
      });
      syncProjectShowcaseToFirestore(savedProject, [], [], []).catch(() => {});
    } else if (editingProject && firebaseUid) {
      syncProjectShowcaseToFirestore(
        savedProject,
        workspace.folders.filter((f) => f.projectId === savedProject.id),
        workspace.documents.filter((d) => d.projectId === savedProject.id),
        workspace.tasks.filter((t) => t.projectId === savedProject.id)
      ).catch(() => {});
    }

    // 3. Send invitations to Firestore AFTER project doc exists in Firestore
    for (const inv of createdInvitations) {
      await createProjectInvitationInFirestore(inv);
    }

    // 4. Update local state immediately (skip overwriting state/main)
    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      projects: nextProjects,
      invitations: [...createdInvitations, ...workspace.invitations],
    };
    await saveWorkspace(updatedWorkspace, undefined, true);

    if (!editingProject) {
      setSelectedProjectId(savedProject.id);
      setCurrentFolderId('root');
    }

    if (createdInvitations.length > 0) {
      const names = createdInvitations.map((i) => `@${i.toUsername}`).join(', ');
      showToast(
        `${editingProject ? 'Proyecto guardado' : `Proyecto «${savedProject.name}» creado`} · Invitación enviada en tiempo real a ${names}.`
      );
    } else {
      showToast(
        editingProject
          ? `Proyecto «${savedProject.name}» actualizado y sincronizado.`
          : `Proyecto «${savedProject.name}» creado y publicado en tiempo real.`
      );
    }
    setSelectedInviteUsers([]);
    setShowProjectModal(false);
  };

  const handleRemoveProjectMember = (project: ProjectItem, targetUsername: string) => {
    if (!workspace || !isProjectOwner(project)) return;
    const targetLower = targetUsername.toLowerCase().trim();
    if (targetLower === project.ownerUsername.toLowerCase().trim()) return;

    setConfirmDialog({
      isOpen: true,
      title: `¿Expulsar a @${targetUsername} de «${project.name}»?`,
      description:
        'Perderá acceso de inmediato a las carpetas, archivos, tareas, avisos y chat en tiempo real de este proyecto.',
      confirmLabel: 'Expulsar del proyecto',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        const matchedAccount = workspace.users.find(
          (u) => u.username.toLowerCase().trim() === targetLower
        );
        const removed = await removeMemberFromProjectInFirestore(
          project,
          targetUsername,
          matchedAccount?.firebaseUid
        );
        if (firebaseUid && !removed) {
          showToast(`No se pudo expulsar a @${targetUsername} en la nube.`);
          return;
        }

        const nextUsernames = project.authorizedUsernames.filter(
          (u) =>
            u.toLowerCase().trim() !== targetLower ||
            u.toLowerCase().trim() === project.ownerUsername.toLowerCase().trim()
        );
        const nextMemberUids = (project.memberUids || []).filter(
          (uid) =>
            uid === project.ownerId ||
            (matchedAccount?.firebaseUid ? uid !== matchedAccount.firebaseUid : true)
        );
        const updatedProj: ProjectItem = {
          ...project,
          authorizedUsernames: nextUsernames,
          memberUids: nextMemberUids,
          updatedAt: new Date().toISOString(),
        };
        const updatedWorkspace: WorkspaceData = {
          ...workspace,
          projects: workspace.projects.map((p) => (p.id === project.id ? updatedProj : p)),
        };
        setEditingProject((prev) => (prev?.id === project.id ? updatedProj : prev));
        await saveWorkspace(updatedWorkspace, undefined, true);
        showToast(`@${targetUsername} ha sido eliminado de «${project.name}» al instante.`);
      },
    });
  };

  const handleDeleteProject = (proj: ProjectItem) => {
    if (!workspace) return;
    setConfirmDialog({
      isOpen: true,
      title: `¿Eliminar el proyecto "${proj.name}"?`,
      description:
        'Se eliminarán sus carpetas, archivos y tareas en tiempo real para todo el equipo, liberando un hueco de los 5 proyectos activos gratuitos.',
      confirmLabel: 'Eliminar proyecto',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        await deleteProjectFromFirestore(proj.id);
        const remainingProjects = workspace.projects.filter((p) => p.id !== proj.id);
        const updatedWorkspace: WorkspaceData = {
          ...workspace,
          projects: remainingProjects,
          folders: workspace.folders.filter((f) => f.projectId !== proj.id),
          documents: workspace.documents.filter((d) => d.projectId !== proj.id),
          tasks: workspace.tasks.filter((t) => t.projectId !== proj.id),
          notices: workspace.notices.filter((n) => n.projectId !== proj.id),
          messages: workspace.messages.filter((m) => m.projectId !== proj.id),
          invitations: workspace.invitations.filter((inv) => inv.projectId !== proj.id),
        };
        await saveWorkspace(updatedWorkspace, undefined, true);
        if (selectedProjectId === proj.id) {
          const nextOwned = remainingProjects.find((p) => isUserMemberOfProject(p, currentUser));
          setSelectedProjectId(nextOwned?.id || '');
          setCurrentFolderId('root');
        }
        showToast(`Proyecto "${proj.name}" eliminado en tiempo real.`);
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

      const uploadedTargetLabel =
        newDocuments.length === 1
          ? newDocuments[0].title
          : `${newDocuments[0]?.title || 'archivos'} (+${newDocuments.length - 1})`;

      const updatedWorkspace: WorkspaceData = {
        ...workspace,
        folders: updatedFolders,
        documents: [...newDocuments, ...workspace.documents],
        activities: appendProjectActivity(
          workspace,
          activeProject.id,
          'subió',
          uploadedTargetLabel,
          'file_upload'
        ),
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
      activities: appendProjectActivity(
        workspace,
        updatedDoc.projectId,
        'enlazó Google Docs',
        updatedDoc.title,
        'google_link'
      ),
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
          activities: appendProjectActivity(
            workspace,
            docItem.projectId,
            'borró',
            docItem.title,
            'file_delete'
          ),
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
    const assignee = newTaskAssignee || currentUser?.username || 'chiki';
    const task: TaskItem = {
      id: `tsk_${Date.now()}`,
      projectId: activeProject.id,
      ownerId: currentUser?.id || 'usr_chiki',
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      assigneeUsername: assignee,
      dueDate: newTaskDueDate,
      status: newTaskStatus,
      completedAt: newTaskStatus === 'completed' ? nowIso : '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      tasks: [task, ...workspace.tasks],
      activities: appendProjectActivity(
        workspace,
        activeProject.id,
        'creó la tarea',
        task.title,
        'task_create'
      ),
    };

    await saveWorkspace(updatedWorkspace);
    await syncTaskToFirestore(task);

    // Real-time in-app notification when assigning a task to a teammate
    if (
      firebaseUid &&
      currentUser &&
      assignee.toLowerCase().trim() !== currentUser.username.toLowerCase().trim()
    ) {
      const targetUser = workspace.users.find(
        (u) => u.username.toLowerCase().trim() === assignee.toLowerCase().trim()
      );
      if (targetUser?.firebaseUid) {
        createInAppNotificationInFirestore({
          id: `ntf_tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          toUid: targetUser.firebaseUid,
          toUsername: targetUser.username,
          fromUid: firebaseUid,
          fromUsername: currentUser.username,
          projectId: activeProject.id,
          projectName: activeProject.name,
          kind: 'task_assigned',
          title: `Nueva tarea asignada por @${currentUser.username}`,
          message: `Te han asignado la tarea «${task.title}» (entrega ${task.dueDate}).`,
          targetSection: 'tasks',
        }).catch(() => {});
      }
    }

    setNewTaskTitle('');
    setNewTaskDesc('');
    setShowTaskModal(false);
    showToast(`Tarea asignada a @${task.assigneeUsername}.`);
  };

  const handleUpdateTaskStatus = async (task: TaskItem, nextStatus: TaskStatus) => {
    if (!workspace || !activeProject) return;
    const nowIso = new Date().toISOString();
    const updatedTask: TaskItem = {
      ...task,
      status: nextStatus,
      completedAt: nextStatus === 'completed' ? nowIso : '',
      updatedAt: nowIso,
    };
    const nextActivities =
      nextStatus === 'completed' && task.status !== 'completed'
        ? appendProjectActivity(
            workspace,
            activeProject.id,
            'completó la tarea',
            task.title,
            'task_complete'
          )
        : workspace.activities;

    const updatedWorkspace: WorkspaceData = {
      ...workspace,
      tasks: workspace.tasks.map((t) => (t.id === task.id ? updatedTask : t)),
      activities: nextActivities,
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
          activities: appendProjectActivity(
            workspace,
            task.projectId,
            'eliminó la tarea',
            task.title,
            'task_delete'
          ),
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
      activities: appendProjectActivity(
        workspace,
        activeProject.id,
        'publicó en el tablón',
        notice.title,
        'notice_create'
      ),
    };

    await saveWorkspace(updatedWorkspace);
    await syncNoticeToFirestore(notice);

    // Detect @username mentions in title or message and send real-time in-app notifications
    if (firebaseUid && currentUser) {
      const combinedText = `${notice.title} ${notice.message}`;
      const mentionMatches = Array.from(combinedText.matchAll(/@([a-zA-Z0-9_.-]{2,40})/g)).map(
        (m) => m[1].toLowerCase().trim()
      );
      const uniqueMentions = Array.from(new Set(mentionMatches));
      for (const mentionedUname of uniqueMentions) {
        if (mentionedUname === currentUser.username.toLowerCase().trim()) continue;
        const targetUser = workspace.users.find(
          (u) => u.username.toLowerCase().trim() === mentionedUname
        );
        if (targetUser?.firebaseUid) {
          createInAppNotificationInFirestore({
            id: `ntf_mnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            toUid: targetUser.firebaseUid,
            toUsername: targetUser.username,
            fromUid: firebaseUid,
            fromUsername: currentUser.username,
            projectId: activeProject.id,
            projectName: activeProject.name,
            kind: 'mention',
            title: `@${currentUser.username} te mencionó en el tablón`,
            message: `${notice.title}: ${notice.message.slice(0, 140)}`,
            targetSection: 'notices',
          }).catch(() => {});
        }
      }
    }

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
    const pId = activeProject.id;
    const msg: ChatMessageItem = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      projectId: pId,
      ownerId: firebaseUid || currentUser?.id || 'usr_member',
      senderUsername: currentUser?.username || 'estudiante',
      text: chatInput.trim(),
      createdAt: nowIso,
    };

    setChatInput('');
    // 1. Optimistic local render (0ms latency)
    setLiveChatByProject((prev) => ({
      ...prev,
      [pId]: [...(prev[pId] || []), msg],
    }));

    // 2. Atomic Firestore append to /projects/{pId}/state/chat (instant live delivery to all teammates)
    const sent = await sendProjectChatMessageInFirestore(pId, msg);
    if (firebaseUid && !sent) {
      showToast('No se pudo enviar el mensaje en tiempo real. Comprueba tu conexión.');
    }
    syncMessageToFirestore(msg);
  };

  // Auto-scroll AI conversation on new response
  useEffect(() => {
    if (commMode === 'ai' && activeSection === 'assistant') {
      aiEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [aiMessages.length, isAiThinking, commMode, activeSection]);

  // Process local files attached to the AI Assistant (Images, PDF, DOCX, ZIP, Code/Text)
  const handleProcessAiFiles = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const MAX_AI_FILES = 4;
    const MAX_AI_FILE_SIZE = 6 * 1024 * 1024; // 6 MB per file

    const remainingSlots = MAX_AI_FILES - aiAttachments.length;
    if (remainingSlots <= 0) {
      showToast('Máximo 4 archivos adjuntos por consulta a la IA.');
      return;
    }

    const toProcess = incoming.slice(0, remainingSlots);
    const prepared: (AiAttachmentPreview & { dataBase64?: string; textContent?: string })[] = [];

    const readAsDataUrl = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });

    for (const file of toProcess) {
      if (file.size > MAX_AI_FILE_SIZE) {
        showToast(`"${file.name}" supera el límite de 6 MB para adjuntar a la IA.`);
        continue;
      }

      const ext = getFileExtension(file.name).toLowerCase();
      const mime = file.type || '';
      const id = `ai_att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      try {
        // 1. Images -> Multimodal inlineData + live thumbnail preview
        if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
          const dataUrl = await readAsDataUrl(file);
          const resolvedMime = mime || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
          prepared.push({
            id,
            name: file.name,
            mimeType: resolvedMime,
            sizeBytes: file.size,
            previewUrl: dataUrl,
            dataBase64: base64,
          });
          continue;
        }

        // 2. PDF -> Multimodal inlineData (Gemini reads PDF pages directly)
        if (mime === 'application/pdf' || ext === 'pdf') {
          const dataUrl = await readAsDataUrl(file);
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
          prepared.push({
            id,
            name: file.name,
            mimeType: 'application/pdf',
            sizeBytes: file.size,
            dataBase64: base64,
          });
          continue;
        }

        // 3. Word (.docx) -> Extract plain text from word/document.xml using JSZip
        if (ext === 'docx') {
          const zip = await JSZip.loadAsync(file);
          const xmlEntry = zip.file('word/document.xml');
          let extracted = '';
          if (xmlEntry) {
            const rawXml = await xmlEntry.async('string');
            extracted = rawXml
              .replace(/<\/w:p>/g, '\n')
              .replace(/<[^>]+>/g, ' ')
              .replace(/[ \t]{2,}/g, ' ')
              .replace(/\n{3,}/g, '\n\n')
              .trim();
          }
          prepared.push({
            id,
            name: file.name,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            sizeBytes: file.size,
            textContent: extracted || '(Documento Word sin texto extraíble)',
          });
          continue;
        }

        // 4. ZIP archive -> Extract tree + text/code snippets using JSZip
        if (ext === 'zip') {
          const zip = await JSZip.loadAsync(file);
          const entries = Object.values(zip.files).filter((e) => !e.dir);
          const lines: string[] = [
            `Contenido del archivo ZIP (${entries.length} archivos):`,
            ...entries.slice(0, 60).map((e) => `- ${e.name}`),
          ];
          const textExts = new Set([
            'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css',
            'sql', 'java', 'c', 'cpp', 'h', 'csv', 'xml', 'yml', 'yaml', 'sh',
          ]);
          let snippetBudget = 12000;
          for (const entry of entries.slice(0, 12)) {
            const entryExt = getFileExtension(entry.name).toLowerCase();
            if (textExts.has(entryExt) && snippetBudget > 400) {
              const txt = await entry.async('string');
              const slice = txt.slice(0, Math.min(2500, snippetBudget));
              lines.push(`\n--- Archivo interno: ${entry.name} ---\n${slice}`);
              snippetBudget -= slice.length;
            }
          }
          prepared.push({
            id,
            name: file.name,
            mimeType: 'application/zip',
            sizeBytes: file.size,
            textContent: lines.join('\n'),
          });
          continue;
        }

        // 5. Text / Code / CSV / JSON / Markdown / SQL
        const textContent = await file.text();
        prepared.push({
          id,
          name: file.name,
          mimeType: mime || 'text/plain',
          sizeBytes: file.size,
          textContent: textContent.slice(0, 24000),
        });
      } catch {
        showToast(`No se pudo procesar el archivo "${file.name}".`);
      }
    }

    if (prepared.length > 0) {
      setAiAttachments((prev) => [...prev, ...prepared].slice(0, MAX_AI_FILES));
    }
  };

  // Strictly Scoped Multimodal Project AI Assistant Handler
  const handleAskProjectAi = async (customPrompt?: string, forceVisualMode?: boolean) => {
    const questionText = (customPrompt ?? aiQuestion).trim();
    const pendingFiles = customPrompt ? [] : aiAttachments;
    const useVisualMode = forceVisualMode !== undefined ? forceVisualMode : aiVisualMode;

    if ((!questionText && pendingFiles.length === 0) || !activeProject || isAiThinking) return;

    const displayQuestion =
      questionText ||
      `Analiza ${pendingFiles.length === 1 ? 'el archivo adjuntado' : 'los archivos adjuntados'} y dame un resumen estructurado.`;

    const userMsg = {
      id: `ai_u_${Date.now()}`,
      role: 'user' as const,
      text: displayQuestion,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      attachments: pendingFiles.map(({ id, name, mimeType, sizeBytes, previewUrl }) => ({
        id,
        name,
        mimeType,
        sizeBytes,
        previewUrl,
      })),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) {
      setAiQuestion('');
      setAiAttachments([]);
      setAiVisualMode(false);
    }
    setIsAiThinking(true);

    try {
      const folderMap = new Map<string, string>(projectFolders.map((f) => [f.id, f.name]));
      const foldersSummary = projectFolders
        .map((f) => {
          const parentName =
            f.parentId && f.parentId !== 'root' ? folderMap.get(f.parentId) || 'Raíz' : 'Raíz';
          return `- Carpeta: "${f.name}" (Ubicación: ${parentName})`;
        })
        .join('\n');

      const documentsSummary = projectDocuments
        .map((d) => {
          const folderName =
            d.folderId && d.folderId !== 'root' ? folderMap.get(d.folderId) || 'Raíz' : 'Raíz';
          return `- Archivo: "${d.title}" (.${(
            d.extension ||
            getFileExtension(d.title) ||
            'bin'
          ).toUpperCase()}, Carpeta: ${folderName}, Tamaño: ${formatBytes(
            d.sizeBytes || 0
          )}, Responsable: @${d.assigneeUsername})\n  Resumen: ${d.content.slice(0, 260)}`;
        })
        .join('\n\n');

      const tasksSummary = projectTasks
        .map((t) => `- [${t.status}] ${t.title} (Responsable: @${t.assigneeUsername})`)
        .join('\n');

      const noticesSummary = projectNotices
        .filter((n) => !n.archived)
        .map((n) => `- [${n.priority.toUpperCase()}] ${n.title}: ${n.message}`)
        .join('\n');

      // Real-time project metrics for inline AI charts & KPI widgets
      const doneCount = projectTasks.filter((t) => t.status === 'completed').length;
      const inProgressCount = projectTasks.filter((t) => t.status === 'in_progress').length;
      const todoCount = projectTasks.filter((t) => t.status === 'pending').length;
      const totalTasksCount = projectTasks.length;
      const pctDone = totalTasksCount > 0 ? Math.round((doneCount / totalTasksCount) * 100) : 0;
      const usedBytes = projectDocuments.reduce((acc, d) => acc + (d.sizeBytes || 0), 0);
      const storagePct = Math.min(100, Math.round((usedBytes / MAX_PROJECT_STORAGE_BYTES) * 100));

      const memberStats = activeProject.authorizedUsernames
        .map((uname) => {
          const uLow = uname.toLowerCase();
          const uDone = projectTasks.filter(
            (t) => t.assigneeUsername.toLowerCase() === uLow && t.status === 'completed'
          ).length;
          const uTotalTasks = projectTasks.filter(
            (t) => t.assigneeUsername.toLowerCase() === uLow
          ).length;
          const uFiles = projectDocuments.filter(
            (d) => d.assigneeUsername.toLowerCase() === uLow
          ).length;
          return `  * @${uname}: ${uDone}/${uTotalTasks} tareas completadas, ${uFiles} archivos subidos`;
        })
        .join('\n');

      const statsSummary = [
        `- Progreso general de tareas: ${pctDone}% (${doneCount} completadas, ${inProgressCount} en progreso, ${todoCount} pendientes de ${totalTasksCount} totales)`,
        `- Total de carpetas: ${projectFolders.length} | Total de archivos: ${projectDocuments.length}`,
        `- Espacio ocupado: ${formatBytes(usedBytes)} / 50 MB (${storagePct}%)`,
        `- Aportación por miembro:\n${memberStats || '  * Sin datos por miembro'}`,
      ].join('\n');

      const res = await fetch('/api/ai/project-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: displayQuestion,
          visualMode: useVisualMode,
          attachments: pendingFiles.map(({ name, mimeType, dataBase64, textContent, sizeBytes }) => ({
            name,
            mimeType,
            dataBase64,
            textContent,
            sizeBytes,
          })),
          history: aiMessages.map((m) => ({ role: m.role, text: m.text })),
          projectContext: {
            name: activeProject.name,
            subject: activeProject.subject,
            description: activeProject.description,
            authorizedUsernames: activeProject.authorizedUsernames,
            dueDate: activeProject.dueDate.slice(0, 10),
            statsSummary,
            foldersSummary,
            documentsSummary,
            tasksSummary,
            noticesSummary,
          },
        }),
      });

      const rawText = await res.text();
      let data: { answer?: string; error?: string } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      const replyText =
        res.ok && data.answer
          ? data.answer
          : data.error ||
            `No se pudo obtener respuesta de la IA (HTTP ${res.status}). Verifica que GEMINI_API_KEY esté configurada en Vercel -> Settings -> Environment Variables y que hayas hecho Redeploy.`;

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
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      setAiMessages((prev) => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          role: 'assistant',
          text: `Error de conexión con la IA del proyecto${detail}. Comprueba tu conexión o revisa GEMINI_API_KEY en el servidor.`,
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
    const now = Date.now();
    return Math.max(0, Math.ceil((due - now) / (1000 * 60 * 60 * 24)));
  }, [activeProject]);

  // Filtered list for Tab 08 · Explorar Proyectos (must stay before early returns)
  const exploredProjects = useMemo(() => {
    const q = exploreSearchQuery.trim().toLowerCase();
    return (workspace?.projects || []).filter((proj) => {
      const isMember = isUserMemberOfProject(proj, currentUser);
      if (exploreFilter === 'open' && proj.hasPassword) return false;
      if (exploreFilter === 'protected' && !proj.hasPassword) return false;
      if (exploreFilter === 'others' && isMember) return false;
      if (!q) return true;
      return (
        proj.name.toLowerCase().includes(q) ||
        proj.subject.toLowerCase().includes(q) ||
        proj.description.toLowerCase().includes(q) ||
        proj.ownerUsername.toLowerCase().includes(q)
      );
    });
  }, [workspace?.projects, exploreSearchQuery, exploreFilter, isUserMemberOfProject, currentUser]);

  // PUBLIC LEGAL ROUTES (/privacidad, /privacy, /terminos, /terms) — Always accessible without login
  if (currentPath === '/privacidad' || currentPath === '/privacy') {
    return <LegalPages page="privacy" onNavigate={navigateTo} />;
  }
  if (currentPath === '/terminos' || currentPath === '/terms') {
    return <LegalPages page="terms" onNavigate={navigateTo} />;
  }

  // PUBLIC / AUTHENTICATED TEACHER PRESENTATION MODE (?modo=profesor&proyecto=<id>) — Direct Read-Only Access Without Login
  if (isTeacherMode) {
    const liveMatchingProject =
      activeProject && (!teacherUrlProjectId || activeProject.id === teacherUrlProjectId)
        ? activeProject
        : workspace.projects.find((p) => p.id === teacherUrlProjectId) || null;

    const liveShowcase: TeacherShowcaseData | null =
      currentUser && liveMatchingProject && isUserMemberOfProject(liveMatchingProject, currentUser)
        ? {
            projectId: liveMatchingProject.id,
            name: liveMatchingProject.name,
            subject: liveMatchingProject.subject,
            description: liveMatchingProject.description,
            ownerUsername: liveMatchingProject.ownerUsername,
            authorizedUsernames: liveMatchingProject.authorizedUsernames,
            dueDate: liveMatchingProject.dueDate,
            githubUrl: liveMatchingProject.githubUrl || '',
            folders: workspace.folders.filter((f) => f.projectId === liveMatchingProject.id),
            documents: workspace.documents.filter((d) => d.projectId === liveMatchingProject.id),
            tasks: workspace.tasks.filter((t) => t.projectId === liveMatchingProject.id),
            updatedAt: liveMatchingProject.updatedAt,
          }
        : null;

    const resolvedShowcase = liveShowcase || publicShowcase;

    if (resolvedShowcase) {
      return (
        <TeacherModeView
          showcase={resolvedShowcase}
          isAuthenticated={Boolean(currentUser)}
          onExitTeacherMode={handleExitTeacherMode}
          onCopyShareLink={handleCopyTeacherLink}
          copiedLink={copiedTeacherLink}
        />
      );
    }

    if (isLoadingPublicShowcase) {
      return (
        <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex items-center justify-center p-6">
          <div className="border border-[#24242E] bg-[#0E0E12] px-6 py-5 flex items-center gap-3">
            <RefreshCw className="w-4 h-4 text-[#3B82F6] animate-spin" />
            <span className="font-mono text-xs tracking-wider uppercase text-[#A1A1B2]">
              Cargando Modo Vista Profesor (Solo lectura)...
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-[#24242E] bg-[#0E0E12] p-8 text-center space-y-4">
          <Eye className="w-9 h-9 text-[#60A5FA] mx-auto" />
          <h1 className="font-display text-xl font-bold text-white">
            {publicShowcaseNotFound
              ? 'Presentación no encontrada'
              : 'Enlace de Vista Profesor incompleto'}
          </h1>
          <p className="text-xs text-[#9E9EAE] leading-relaxed">
            No se encontró un proyecto público para este enlace. Pide a un integrante del equipo que
            copie de nuevo el enlace directo desde el botón «Copiar enlace (?modo=profesor)».
          </p>
          <button
            type="button"
            onClick={handleExitTeacherMode}
            className="h-10 px-5 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider cursor-pointer"
          >
            Ir a Proyectos Nebrija App
          </button>
        </div>
      </div>
    );
  }

  if (isLoadingWorkspace || !firebaseAuthChecked) {
    return (
      <div className="min-h-screen bg-[#09090B] text-[#F4F4F6] flex items-center justify-center p-6">
        <div className="border border-[#24242E] bg-[#0E0E12] px-6 py-5 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-[#3B82F6] animate-spin" />
          <span className="font-mono text-xs tracking-wider uppercase text-[#A1A1B2]">
            Conectando con Proyectos Nebrija App en tiempo real...
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
                if (needsProfileSetup) {
                  document.getElementById('acceso-grupo')?.scrollIntoView({ behavior: 'smooth' });
                } else {
                  handleGoogleAccountSignIn();
                }
              }}
              className="px-4 py-2 text-xs font-semibold bg-white hover:bg-zinc-200 text-[#09090B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {needsProfileSetup ? 'Completar Perfil' : 'Entrar con Google'}
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

            {/* Right Bento Column (5 cols): Real Personal Account Sign-In + First-Time Profile Setup */}
            <div
              id="acceso-grupo"
              className="lg:col-span-5 bg-[#0B0B0F] p-6 sm:p-8 flex flex-col justify-between"
            >
              {!needsProfileSetup ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-[#22222A]">
                    <div>
                      <h2 className="font-display font-bold text-lg text-white">
                        Tu Cuenta Personal
                      </h2>
                      <p className="text-xs text-[#8E8E9E]">
                        Sincronización instantánea en la nube para todos los compañeros
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-[#60A5FA] tabular-nums">
                      01 / ACCESO
                    </span>
                  </div>

                  <div className="space-y-3 border border-[#22222A] bg-[#0E0E12] p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 border border-[#3B82F6]/40 bg-[#3B82F6]/10 flex items-center justify-center text-[#60A5FA] shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-white">
                          Cada alumno usa su propia cuenta
                        </p>
                        <p className="text-[11px] text-[#8E8E9E] leading-relaxed">
                          Entra con tu cuenta de Google personal y elige tu <code className="text-white">@usuario</code>. Así podrás explorar proyectos de clase, recibir invitaciones en directo y colaborar desde cualquier navegador o móvil.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 pt-2 border-t border-[#1D1D25]">
                      <div className="w-8 h-8 border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-white">
                          Cambios al instante sin refrescar
                        </p>
                        <p className="text-[11px] text-[#8E8E9E] leading-relaxed">
                          Si un compañero crea, edita o elimina un archivo, carpeta, tarea o invitación, se actualiza en tu pantalla en milisegundos.
                        </p>
                      </div>
                    </div>
                  </div>

                  {authError && (
                    <div className="p-3 border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300">
                      {authError}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isGoogleLoggingIn}
                    onClick={handleGoogleAccountSignIn}
                    className="w-full h-12 bg-white hover:bg-zinc-200 disabled:opacity-60 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-3 transition-colors cursor-pointer"
                  >
                    {isGoogleLoggingIn ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Conectando con Google...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fill="#4285F4"
                            d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                          />
                          <path
                            fill="#34A853"
                            d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                          />
                        </svg>
                        <span>Continuar con Google</span>
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-[#7E7E8E] leading-relaxed text-center">
                    Si ya creaste tu perfil en otro ordenador o móvil, al entrar con tu Google recuperarás automáticamente todos tus proyectos, archivos e invitaciones.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-[#22222A]">
                    <div>
                      <h2 className="font-display font-bold text-lg text-white">
                        Completa tu Perfil
                      </h2>
                      <p className="text-xs text-[#8E8E9E]">
                        Elige tu @usuario para que tus compañeros puedan invitarte
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-emerald-400 tabular-nums">
                      PASO FINAL
                    </span>
                  </div>

                  <div className="px-3.5 py-2.5 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-2 text-xs">
                    <span className="text-emerald-300 truncate">
                      Google conectado: <strong className="text-white">{googleUserEmail}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleLogoutStudent}
                      className="text-[11px] text-[#A1A1B2] hover:text-white underline shrink-0 cursor-pointer"
                    >
                      Cambiar cuenta
                    </button>
                  </div>

                  <form onSubmit={handleCompleteCloudProfile} className="space-y-4">
                    <div>
                      <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1.5">
                        Tu @usuario (único en la plataforma)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-[#60A5FA]">
                          @
                        </span>
                        <input
                          type="text"
                          required
                          value={authUsername}
                          onChange={(e) => setAuthUsername(e.target.value)}
                          placeholder="ej. adrian, lucia_dev..."
                          className="w-full h-11 pl-8 pr-3.5 bg-[#09090B] border border-[#2A2A35] text-sm text-white focus:outline-none focus:border-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1.5">
                        Nombre o Apodo visible
                      </label>
                      <input
                        type="text"
                        required
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

                    {authError && (
                      <div className="p-3 border border-rose-500/40 bg-rose-500/10 text-xs text-rose-300">
                        {authError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="w-full h-11 bg-white hover:bg-zinc-200 disabled:opacity-60 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {isSavingProfile ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Creando perfil en la nube...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Crear Mi Perfil y Entrar</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

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

    if (canOpenInBuiltInViewer(docItem.title, docItem.extension) && !isZipArchiveFile(docItem.title, docItem.extension)) {
      iconColor = 'text-[#60A5FA] border-[#3B82F6]/40 bg-[#3B82F6]/10';
      IconComponent = FileCode2;
    } else if (editorKind === 'docs') {
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

  // Navigation Tabs Config (Folio / ArtCraft numbered section tabs including 06 · Estadísticas & 08 · Explorar)
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
    { id: 'stats', num: '06', label: 'Estadísticas' },
    {
      id: 'projects',
      num: '07',
      label: 'Mis Proyectos',
      count: `${myProjects.length}/${MAX_ACTIVE_PROJECTS}`,
    },
    {
      id: 'explore',
      num: '08',
      label: 'Explorar',
      count: `${workspace?.projects.length || 0}`,
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

      {/* Instant On-Screen Floating Invitation Alert Card */}
      {liveInviteToast && (
        <div className="fixed top-20 right-5 z-50 w-[calc(100%-2.5rem)] max-w-sm border border-[#3B82F6] bg-[#0E0E14] shadow-2xl">
          <div className="h-1 w-full bg-[#3B82F6]" />
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 border border-[#3B82F6]/50 bg-[#3B82F6]/15 flex items-center justify-center text-[#60A5FA] shrink-0">
                  <Bell className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-mono text-[10px] uppercase text-[#60A5FA] font-bold block">
                    NUEVA INVITACIÓN DE PROYECTO
                  </span>
                  <p className="text-xs font-semibold text-white">
                    @{liveInviteToast.fromUsername} te ha invitado
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLiveInviteToast(null)}
                className="text-[#8E8E9E] hover:text-white cursor-pointer"
                aria-label="Cerrar notificación"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#C4C4D0] leading-relaxed">
              Te han invitado a colaborar en{' '}
              <strong className="text-white">«{liveInviteToast.projectName}»</strong>
              {liveInviteToast.projectSubject ? ` (${liveInviteToast.projectSubject})` : ''}.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleRespondInvitation(liveInviteToast, 'accepted')}
                className="h-9 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aceptar</span>
              </button>
              <button
                type="button"
                onClick={() => handleRespondInvitation(liveInviteToast, 'declined')}
                className="h-9 border border-[#2E2E3A] bg-[#14141A] hover:border-rose-400 text-[#D4D4DC] hover:text-rose-300 font-semibold text-xs uppercase tracking-wider cursor-pointer"
              >
                Rechazar
              </button>
            </div>
          </div>
        </div>
      )}

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
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-4 border-b border-[#22222A] bg-[#09090B]/95">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('overview');
          }}
          className="font-display text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Proyectos Nebrija App
        </a>

        {/* Zone 2: Concise single-line text navigation links */}
        <nav className="hidden xl:flex items-center gap-5 text-xs font-medium text-[#8E8E9E]">
          {navSections.slice(0, 6).map((sec) => (
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

        {/* Zone 3: Activity Log Drawer Toggle + Unified Notifications Bell + Primary Action */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 relative">
          {/* Compact Activity Log Slide-Over Button (accessible from any tab) */}
          {activeProject && (
            <button
              type="button"
              onClick={() => setShowActivityDrawer(true)}
              title="Historial de actividad del proyecto"
              className="h-9 px-2.5 sm:px-3 border border-[#2A2A35] bg-[#121218] hover:border-white text-[#C4C4D0] hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <History className="w-4 h-4 text-[#60A5FA]" />
              <span className="hidden md:inline text-xs font-medium">Actividad</span>
              {projectActivities.length > 0 && (
                <span className="font-mono text-[10px] text-[#8E8E9E] tabular-nums">
                  ({projectActivities.length})
                </span>
              )}
            </button>
          )}

          {/* Unified Notifications Bell Icon Button */}
          <button
            type="button"
            onClick={() => setShowNotificationsPanel((prev) => !prev)}
            title="Centro de notificaciones e invitaciones"
            className={`relative h-9 w-9 border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              showNotificationsPanel
                ? 'border-white bg-white text-[#09090B]'
                : totalUnreadNotificationsCount > 0
                  ? 'border-[#3B82F6] bg-[#3B82F6]/15 text-[#60A5FA] hover:border-white'
                  : 'border-[#2A2A35] bg-[#121218] text-[#C4C4D0] hover:border-white hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4" />
            {totalUnreadNotificationsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-[#3B82F6] text-white font-mono text-[10px] font-bold flex items-center justify-center border border-[#09090B] tabular-nums">
                {totalUnreadNotificationsCount > 99 ? '99+' : totalUnreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Unified Notifications Dropdown Panel (Todas | Invitaciones | Actividad) */}
          <NotificationsBellPanel
            isOpen={showNotificationsPanel}
            onClose={() => setShowNotificationsPanel(false)}
            invitations={myIncomingInvitations}
            activityNotifications={allActivityNotifications}
            onRespondInvitation={handleRespondInvitation}
            onClickActivityNotification={handleClickActivityNotification}
            onMarkAllRead={handleMarkAllNotificationsRead}
          />

          <button
            type="button"
            onClick={() => setActiveSection('explore')}
            className={`hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'explore'
                ? 'border-[#3B82F6] bg-[#3B82F6]/20 text-white'
                : 'border-[#2E2E3A] bg-[#14141A] hover:border-white text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>Explorar</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('projects')}
            className={`px-3.5 sm:px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'projects'
                ? 'bg-[#3B82F6] text-white'
                : 'bg-white hover:bg-zinc-200 text-[#09090B]'
            }`}
          >
            Mis Proyectos ({myProjects.length}/{MAX_ACTIVE_PROJECTS})
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
          <div className="flex items-center gap-2 shrink-0 pl-2">
            <span className="px-2.5 sm:px-3 py-1.5 border border-[#2A2A35] bg-[#121218] font-mono text-[11px] sm:text-xs text-white whitespace-nowrap">
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
                  CONEXIÓN GOOGLE RECOMENDADA (SINCRONIZACIÓN EN LA NUBE)
                </p>
                <p className="text-xs text-[#C4C4D0]">
                  Inicia sesión con Google para sincronizar tus proyectos, invitaciones y archivos
                  en tiempo real con tus compañeros y Google Drive.
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

        {!activeProject && activeSection !== 'projects' && activeSection !== 'explore' ? (
          <div className="border border-[#22222A] bg-[#0E0E12] p-10 sm:p-12 text-center space-y-5">
            <Folder className="w-10 h-10 text-[#60A5FA] mx-auto" />
            <div>
              <h2 className="font-display text-xl font-bold text-white mb-2">
                Todavía no formas parte de ningún proyecto
              </h2>
              <p className="text-sm text-[#8E8E9E] max-w-md mx-auto">
                Crea tu primer proyecto de informática (máximo {MAX_ACTIVE_PROJECTS} proyectos
                gratis) o explora proyectos creados por tus compañeros para unirte.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={openCreateProjectModal}
                className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider cursor-pointer"
              >
                + Crear Primer Proyecto
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('explore')}
                className="px-5 py-2.5 border border-[#3B82F6] bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
              >
                <Compass className="w-4 h-4" />
                <span>Explorar Proyectos ({workspace?.projects.length || 0})</span>
              </button>
            </div>
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
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleEnterTeacherMode}
                            title="Presentación de solo lectura para evaluación del profesor"
                            className="px-3 py-1.5 border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Vista Profesor</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyTeacherLink}
                            title="Copiar enlace directo ?modo=profesor (solo lectura sin iniciar sesión)"
                            className="px-3 py-1.5 border border-[#2A2A35] bg-[#14141A] hover:border-white text-xs text-[#D4D4DC] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            {copiedTeacherLink ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-[#60A5FA]" />
                                <span>Enlace Profesor</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={openEditProjectModal}
                            className="px-3 py-1.5 border border-[#3B82F6]/50 bg-[#3B82F6]/10 hover:bg-[#3B82F6]/20 text-xs text-[#60A5FA] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Invitar Compañeros</span>
                          </button>
                          {isProjectOwner(activeProject) && (
                            <button
                              type="button"
                              onClick={openEditProjectModal}
                              className="px-3 py-1.5 border border-[#2A2A35] bg-[#14141A] hover:border-white text-xs text-[#D4D4DC] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-[#60A5FA]" />
                              <span>Configurar</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
                        {activeProject.name}
                      </h1>
                      <p className="text-sm sm:text-base text-[#9E9EAE] leading-relaxed mb-6">
                        {activeProject.description}
                      </p>
                    </div>

                    <div className="pt-5 border-t border-[#22222A] space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] uppercase text-[#8E8E9E]">
                            EQUIPO DEL PROYECTO ({activeProject.authorizedUsernames.length})
                          </span>
                          {isProjectOwner(activeProject) &&
                            activeProject.authorizedUsernames.length > 1 && (
                              <span className="font-mono text-[10px] text-[#7E7E8E]">
                                Como creador puedes expulsar miembros con ×
                              </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {activeProject.authorizedUsernames.map((uname) => {
                            const isCreatorChip =
                              uname.toLowerCase().trim() ===
                              activeProject.ownerUsername.toLowerCase().trim();
                            return (
                              <span
                                key={uname}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-[#2A2A35] bg-[#14141A] font-mono text-xs text-white"
                              >
                                <span>@{uname}</span>
                                {isCreatorChip && (
                                  <span className="text-[9px] uppercase text-[#60A5FA]">
                                    creador
                                  </span>
                                )}
                                {isProjectOwner(activeProject) && !isCreatorChip && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveProjectMember(activeProject, uname)}
                                    title={`Expulsar a @${uname} del proyecto`}
                                    aria-label={`Expulsar a @${uname} del proyecto`}
                                    className="ml-0.5 p-0.5 text-[#8E8E9E] hover:text-rose-400 transition-colors cursor-pointer"
                                  >
                                    <UserMinus className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
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

                {/* GitHub Public Repository Widget (Read-Only, Zero OAuth) */}
                <GitHubRepoWidget
                  githubUrl={activeProject.githubUrl}
                  onSaveUrl={handleUpdateProjectGithubUrl}
                />

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
                {/* Top Header & Action Bar — 2-row architectural Bento layout so title never squeezes */}
                <div className="border border-[#22222A] bg-[#0E0E12] p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 max-w-3xl">
                      <span className="font-mono text-[11px] text-[#60A5FA] uppercase tracking-wider block mb-1.5">
                        02 · EXPLORADOR DE PROYECTO
                      </span>
                      <h2 className="font-display text-xl sm:text-2xl font-bold text-white leading-tight break-words">
                        Archivos y Carpetas de «{activeProject.name}»
                      </h2>
                      <p className="text-xs sm:text-sm text-[#8E8E9E] mt-2 leading-relaxed">
                        Los archivos del paquete Office (<code className="text-white">.DOCX</code>,{' '}
                        <code className="text-white">.XLSX</code>,{' '}
                        <code className="text-white">.PPTX</code>,{' '}
                        <code className="text-white">.ODS</code>,{' '}
                        <code className="text-white">.CSV</code>) se abren directo en Google Docs /
                        Sheets / Slides. También puedes enlazar documentos creados en Google o extraer
                        cualquier carpeta en <code className="text-white">.ZIP</code>.
                      </p>
                    </div>

                    <div className="border border-[#22222A] bg-[#121218] px-3.5 py-2 shrink-0 self-start">
                      <span className="font-mono text-[10px] text-[#7E7E8E] uppercase block">
                        CUOTA DEL PROYECTO
                      </span>
                      <span className="font-mono text-xs font-semibold text-white">
                        {formatBytes(projectStorageBytes)}{' '}
                        <span className="text-[#7E7E8E]">/ 50 MB</span>
                      </span>
                    </div>
                  </div>

                  {/* Dedicated Rectangular Action Toolbar */}
                  <div className="pt-4 border-t border-[#1D1D25] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={openCreateGoogleFileModal}
                        className="h-10 px-4 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <FilePlus2 className="w-4 h-4 shrink-0" />
                        <span>Crear Archivo (Google)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTriggerUpload('files')}
                        disabled={isSyncingDrive}
                        className="h-10 px-4 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <Upload className="w-4 h-4 text-[#60A5FA] shrink-0" />
                        <span>Subir Archivos</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTriggerUpload('folder')}
                        disabled={isSyncingDrive}
                        className="h-10 px-4 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-white font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <FolderUp className="w-4 h-4 text-[#60A5FA] shrink-0" />
                        <span>Subir Carpeta</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowFolderModal(true)}
                        className="h-10 px-4 border border-[#2E2E3A] bg-[#14141A] hover:border-white text-[#D4D4DC] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <FolderPlus className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Nueva Carpeta</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isExtractingZip}
                      onClick={() => {
                        const currentLabel =
                          folderBreadcrumbs[folderBreadcrumbs.length - 1]?.name ||
                          activeProject.name;
                        handleExtractFolderAsZip(currentFolderId, currentLabel);
                      }}
                      className="h-10 px-4 border border-[#3B82F6] bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors self-start xl:self-auto"
                    >
                      <Download className="w-4 h-4 shrink-0" />
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

                              {/* File Icon & Title (Clickable for Code, Markdown & .ZIP Viewer) */}
                              <div className="flex items-start gap-4 mb-4">
                                {renderTechnicalFileIcon(docItem)}
                                <div className="min-w-0 flex-1">
                                  {canOpenInBuiltInViewer(docItem.title, docItem.extension) ? (
                                    <button
                                      type="button"
                                      onClick={() => setViewerDocItem(docItem)}
                                      className="text-left group cursor-pointer"
                                    >
                                      <h4 className="font-display font-bold text-base sm:text-lg text-white group-hover:text-[#60A5FA] transition-colors break-words">
                                        {docItem.title}
                                      </h4>
                                    </button>
                                  ) : (
                                    <h4 className="font-display font-bold text-base sm:text-lg text-white break-words">
                                      {docItem.title}
                                    </h4>
                                  )}
                                  <p className="text-xs text-[#8E8E9E] mt-1">
                                    {canOpenInBuiltInViewer(docItem.title, docItem.extension) ? (
                                      <span className="text-[#60A5FA]">
                                        {isZipArchiveFile(docItem.title, docItem.extension)
                                          ? 'Explorable en visor integrado (.ZIP) sin descargar'
                                          : 'Compatible con Visor de Código / Markdown integrado'}
                                      </span>
                                    ) : editorKind ? (
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
                            <div className="flex flex-wrap items-center gap-2">
                              {canOpenInBuiltInViewer(docItem.title, docItem.extension) && (
                                <button
                                  type="button"
                                  onClick={() => setViewerDocItem(docItem)}
                                  className="flex-1 h-10 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>
                                    {isZipArchiveFile(docItem.title, docItem.extension)
                                      ? 'Explorar .ZIP'
                                      : ext === 'md'
                                        ? 'Ver Markdown'
                                        : 'Ver Código'}
                                  </span>
                                </button>
                              )}

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
                                  editorKind || canOpenInBuiltInViewer(docItem.title, docItem.extension)
                                    ? 'px-4'
                                    : 'flex-1'
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
                          CONSULTAS VISUALES RÁPIDAS:
                        </p>
                        {[
                          {
                            label: 'Hazme unas estadísticas visuales del proyecto (KPIs y gráficas)',
                            visual: false,
                          },
                          {
                            label: 'Muéstrame todas las carpetas y archivos en un árbol visual y una tabla limpia',
                            visual: false,
                          },
                          {
                            label: 'Genera un diagrama visual descargable de la arquitectura o flujo de nuestro proyecto',
                            visual: true,
                          },
                          {
                            label: 'Haz una hoja de ruta visual con las tareas pendientes por compañero',
                            visual: false,
                          },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => handleAskProjectAi(item.label, item.visual)}
                            className="w-full p-3 text-left border border-[#2A2A35] bg-[#111116] hover:border-white text-xs text-[#D4D4DC] transition-colors cursor-pointer flex items-start gap-2"
                          >
                            {item.visual ? (
                              <ImageIcon className="w-3.5 h-3.5 text-[#60A5FA] mt-0.5 shrink-0" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-[#60A5FA] mt-0.5 shrink-0" />
                            )}
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 border border-[#22222A] bg-[#111116] text-xs text-[#8E8E9E] space-y-1.5">
                    <p className="font-mono text-white">CONTEXTO MULTIMODAL ACTIVO:</p>
                    <p className="tabular-nums">
                      {projectFolders.length} carpetas · {projectDocuments.length} archivos ·{' '}
                      {projectTasks.length} tareas
                    </p>
                    <p className="text-[11px] text-[#7E7E90]">
                      Admite adjuntar imágenes, PDF, Word (.docx), código y .ZIP.
                    </p>
                  </div>
                </div>

                {/* Right 8 Cols: Conversation Viewport */}
                <div
                  className={`lg:col-span-8 bg-[#09090B] flex flex-col justify-between min-h-[580px] relative transition-colors ${
                    isDraggingAiFile && commMode === 'ai' ? 'ring-2 ring-[#3B82F6] ring-inset' : ''
                  }`}
                  onDragOver={(e) => {
                    if (commMode !== 'ai') return;
                    e.preventDefault();
                    setIsDraggingAiFile(true);
                  }}
                  onDragLeave={(e) => {
                    if (commMode !== 'ai') return;
                    e.preventDefault();
                    setIsDraggingAiFile(false);
                  }}
                  onDrop={(e) => {
                    if (commMode !== 'ai') return;
                    e.preventDefault();
                    setIsDraggingAiFile(false);
                    if (e.dataTransfer.files?.length) {
                      handleProcessAiFiles(e.dataTransfer.files);
                    }
                  }}
                >
                  {commMode === 'ai' ? (
                    <>
                      {isDraggingAiFile && (
                        <div className="absolute inset-0 z-20 bg-[#09090B]/90 border-2 border-dashed border-[#3B82F6] flex flex-col items-center justify-center gap-2 pointer-events-none p-6 text-center">
                          <Upload className="w-8 h-8 text-[#60A5FA]" />
                          <p className="font-display text-sm font-semibold text-white">
                            Suelta aquí tus archivos para analizarlos con la IA
                          </p>
                          <p className="text-xs text-[#8E8E9E]">
                            Imágenes, PDF, Word (.docx), código fuente o archivos .ZIP (máx. 6 MB)
                          </p>
                        </div>
                      )}

                      <div className="p-4 sm:p-6 space-y-5 h-[500px] overflow-y-auto">
                        {aiMessages.map((m) => (
                          <div
                            key={m.id}
                            className={`flex flex-col ${
                              m.role === 'user' ? 'items-end' : 'items-start'
                            }`}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-wider text-[#7E7E8E] mb-1.5">
                              {m.role === 'user'
                                ? `@${currentUser.username} · ${m.timestamp}`
                                : `Asistente IA · ${m.timestamp}`}
                            </span>

                            {m.role === 'user' ? (
                              <div className="max-w-2xl px-4 py-3 text-xs sm:text-sm bg-white text-[#09090B] border border-white font-medium space-y-2.5">
                                {m.attachments && m.attachments.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {m.attachments.map((att) => (
                                      <div
                                        key={att.id}
                                        className="flex items-center gap-2 border border-zinc-300 bg-zinc-100 px-2.5 py-1.5 text-[11px] text-zinc-900"
                                      >
                                        {att.previewUrl ? (
                                          <img
                                            src={att.previewUrl}
                                            alt={att.name}
                                            className="w-8 h-8 object-cover border border-zinc-300 shrink-0"
                                          />
                                        ) : (
                                          <FileText className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
                                        )}
                                        <span className="truncate max-w-[150px] font-mono">
                                          {att.name}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                              </div>
                            ) : (
                              <div className="w-full max-w-3xl px-4 sm:px-5 py-4 bg-[#111117] border border-[#262634]">
                                <AiRichMessage text={m.text} />
                              </div>
                            )}
                          </div>
                        ))}
                        {isAiThinking && (
                          <div className="flex items-center gap-2.5 border border-[#242432] bg-[#101017] px-4 py-3 max-w-md">
                            <RefreshCw className="w-3.5 h-3.5 text-[#60A5FA] animate-spin shrink-0" />
                            <span className="font-mono text-xs text-[#93C5FD]">
                              Analizando contexto, archivos y diseñando respuesta visual...
                            </span>
                          </div>
                        )}
                        <div ref={aiEndRef} />
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAskProjectAi();
                        }}
                        className="p-3 sm:p-4 border-t border-[#22222A] bg-[#0E0E12] space-y-2.5"
                      >
                        {/* Pending File Attachment Chips */}
                        {aiAttachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {aiAttachments.map((att) => (
                              <div
                                key={att.id}
                                className="flex items-center gap-2 border border-[#2E2E3D] bg-[#15151E] px-2.5 py-1.5 text-xs text-[#E4E4EE]"
                              >
                                {att.previewUrl ? (
                                  <img
                                    src={att.previewUrl}
                                    alt={att.name}
                                    className="w-7 h-7 object-cover border border-[#323244] shrink-0"
                                  />
                                ) : (
                                  <FileText className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <p className="font-mono text-[11px] text-white truncate max-w-[160px]">
                                    {att.name}
                                  </p>
                                  <p className="font-mono text-[9px] text-[#8E8E9E]">
                                    {formatBytes(att.sizeBytes)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAiAttachments((prev) => prev.filter((a) => a.id !== att.id))
                                  }
                                  title="Quitar archivo"
                                  className="text-[#8E8E9E] hover:text-white p-0.5 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <input
                          ref={aiFileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.pdf,.docx,.zip,.txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.css,.sql,.java,.c,.cpp,.xml,.yaml,.yml"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.length) {
                              handleProcessAiFiles(e.target.files);
                            }
                            e.target.value = '';
                          }}
                        />

                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                          {/* Upload File Button */}
                          <button
                            type="button"
                            onClick={() => aiFileInputRef.current?.click()}
                            disabled={isAiThinking}
                            title="Adjuntar imagen, PDF, Word (.docx), código o .ZIP"
                            className="h-11 px-3 border border-[#2A2A35] bg-[#121219] hover:border-white text-[#C4C4D4] hover:text-white inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0"
                          >
                            <Paperclip className="w-4 h-4 text-[#60A5FA]" />
                            <span className="hidden sm:inline">Adjuntar</span>
                          </button>

                          {/* Visual Diagram / Downloadable Graphic Mode Toggle */}
                          <button
                            type="button"
                            onClick={() => setAiVisualMode((prev) => !prev)}
                            disabled={isAiThinking}
                            title="Activar modo gráfico/imagen descargable (PNG/SVG)"
                            className={`h-11 px-3 border inline-flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                              aiVisualMode
                                ? 'border-[#3B82F6] bg-[#3B82F6]/20 text-[#93C5FD]'
                                : 'border-[#2A2A35] bg-[#121219] hover:border-white text-[#C4C4D4] hover:text-white'
                            }`}
                          >
                            <ImageIcon className="w-4 h-4" />
                            <span className="hidden md:inline">
                              {aiVisualMode ? 'Gráfico: ON' : 'Gráfico'}
                            </span>
                          </button>

                          <input
                            type="text"
                            value={aiQuestion}
                            onChange={(e) => setAiQuestion(e.target.value)}
                            placeholder={
                              aiVisualMode
                                ? 'Describe el diagrama, esquema o gráfico visual que quieres generar...'
                                : `Pregunta, pide estadísticas visuales o sube un archivo sobre "${activeProject.name}"...`
                            }
                            className="flex-1 min-w-[180px] h-11 px-4 bg-[#09090B] border border-[#2A2A35] text-sm text-white focus:outline-none focus:border-white"
                          />

                          <button
                            type="submit"
                            disabled={isAiThinking || (!aiQuestion.trim() && aiAttachments.length === 0)}
                            className="h-11 px-5 bg-white hover:bg-zinc-200 disabled:opacity-50 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer shrink-0"
                          >
                            <Send className="w-4 h-4" />
                            <span>Preguntar</span>
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <>
                      <div className="px-6 py-3 border-b border-[#1D1D25] bg-[#0C0C10] flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] uppercase text-[#A1A1B2]">
                          CHAT DEL EQUIPO · {activeProject.name}
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase text-emerald-400">
                          <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse" />
                          EN DIRECTO
                        </span>
                      </div>

                      <div className="p-6 space-y-4 h-[410px] overflow-y-auto">
                        {projectMessages.length === 0 ? (
                          <p className="text-xs text-[#6E6E7E] text-center py-12">
                            Todavía no hay mensajes en el chat del grupo. Escribe el primero y tus compañeros lo verán al instante.
                          </p>
                        ) : (
                          projectMessages.map((m) => {
                            const isMe =
                              m.senderUsername.toLowerCase() === currentUser.username.toLowerCase();
                            const timeStr = new Date(m.createdAt).toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                            return (
                              <div
                                key={m.id}
                                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                              >
                                <span className="font-mono text-[11px] text-[#7E7E8E] mb-1">
                                  @{m.senderUsername} · {timeStr}
                                </span>
                                <div
                                  className={`max-w-lg px-4 py-2.5 text-xs sm:text-sm border break-words ${
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
                        <div ref={chatEndRef} />
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
                PESTAÑA 06 · ESTADÍSTICAS Y CURVA DE RITMO (BURNDOWN + APORTACIÓN + CUOTA 50 MB)
               ===================================================================================== */}
            {activeSection === 'stats' && activeProject && (
              <ProjectStatsTab
                projectName={activeProject.name}
                authorizedUsernames={activeProject.authorizedUsernames}
                tasks={projectTasks}
                documents={projectDocuments}
                sectionPrefix="06"
              />
            )}

            {/* =====================================================================================
                PESTAÑA 07 · MIS PROYECTOS, GOOGLE DRIVE Y CUOTA GRATUITA (BENTO LAUNCHER)
               ===================================================================================== */}
            {activeSection === 'projects' && (
              <div className="space-y-8">
                {/* Top Header */}
                <div className="border border-[#22222A] bg-[#0E0E12] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="font-mono text-xs text-[#60A5FA] uppercase block mb-1">
                      07 · MIS PROYECTOS Y CONEXIÓN GOOGLE DRIVE
                    </span>
                    <h2 className="font-display text-2xl font-bold text-white">
                      Mis Proyectos ({myProjects.length} / {MAX_ACTIVE_PROJECTS} Gratis)
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setActiveSection('explore')}
                      className="h-10 px-4 border border-[#3B82F6] bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Compass className="w-4 h-4" />
                      <span>Explorar Proyectos</span>
                    </button>
                    <button
                      type="button"
                      onClick={openCreateProjectModal}
                      className="h-10 px-5 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Crear Nuevo Proyecto</span>
                    </button>
                  </div>
                </div>

                {/* Projects Bento Grid (ArtCraft Launcher Style) */}
                {myProjects.length === 0 ? (
                  <div className="border border-[#22222A] bg-[#0E0E12] p-10 text-center space-y-4">
                    <Folder className="w-9 h-9 text-[#60A5FA] mx-auto" />
                    <p className="text-sm text-[#A1A1B2]">
                      Aún no tienes proyectos en tu lista. Crea uno nuevo o únete a uno desde{' '}
                      <strong className="text-white">08 · Explorar</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#22222A] border border-[#22222A]">
                    {myProjects.map((proj, index) => {
                      const isSelected = activeProject?.id === proj.id;
                      const isOwner =
                        proj.ownerUsername.toLowerCase() === currentUser.username.toLowerCase();
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
                                  {proj.subject} · {proj.authorizedUsernames.length} integrante(s)
                                </p>
                              </div>
                              {proj.hasPassword ? (
                                <Unlock className="w-4 h-4 text-emerald-400 shrink-0" />
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

                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => handleDeleteProject(proj)}
                                title="Eliminar proyecto"
                                className="h-10 w-10 border border-[#2A2A35] bg-[#14141A] hover:border-rose-500 text-[#7E7E8E] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

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

            {/* =====================================================================================
                PESTAÑA 08 · EXPLORAR PROYECTOS (DIRECTORIO DE PROYECTOS DE LA CLASE + UNIRSE)
               ===================================================================================== */}
            {activeSection === 'explore' && (
              <div className="space-y-6">
                {/* Explore Header & Search Controls */}
                <div className="border border-[#22222A] bg-[#0E0E12] p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <span className="font-mono text-[11px] text-[#60A5FA] uppercase tracking-wider block mb-1.5">
                        08 · DIRECTORIO COLABORATIVO DE LA CLASE
                      </span>
                      <h2 className="font-display text-2xl font-bold text-white">
                        Explorar Proyectos
                      </h2>
                      <p className="text-xs sm:text-sm text-[#8E8E9E] mt-1.5 leading-relaxed">
                        Descubre proyectos creados por otros estudiantes y únete directamente. Si un
                        proyecto está protegido con contraseña, el sistema te la pedirá antes de
                        darte acceso.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={openCreateProjectModal}
                      className="h-10 px-5 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs uppercase tracking-wider inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer self-start"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Crear Proyecto</span>
                    </button>
                  </div>

                  <div className="pt-4 border-t border-[#1D1D25] flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-4 h-4 text-[#7E7E8E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={exploreSearchQuery}
                        onChange={(e) => setExploreSearchQuery(e.target.value)}
                        placeholder="Buscar por nombre, asignatura o @creador..."
                        className="w-full h-10 pl-10 pr-4 bg-[#09090B] border border-[#2A2A35] text-xs text-white focus:outline-none focus:border-white"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'all', label: 'Todos' },
                          { id: 'open', label: 'Abiertos' },
                          { id: 'protected', label: 'Con Contraseña' },
                          { id: 'others', label: 'De otros grupos' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setExploreFilter(f.id)}
                          className={`h-9 px-3.5 text-xs font-mono uppercase transition-colors cursor-pointer ${
                            exploreFilter === f.id
                              ? 'bg-white text-[#09090B] font-semibold'
                              : 'border border-[#2A2A35] bg-[#14141A] text-[#A1A1B2] hover:text-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Explored Projects Bento Grid */}
                {exploredProjects.length === 0 ? (
                  <div className="border border-[#22222A] bg-[#0E0E12] p-12 text-center space-y-3">
                    <Compass className="w-9 h-9 text-[#555566] mx-auto" />
                    <p className="text-sm font-medium text-white">
                      No se encontraron proyectos con este filtro
                    </p>
                    <p className="text-xs text-[#8E8E9E] max-w-md mx-auto">
                      {!googleUserEmail
                        ? 'Inicia sesión con Google arriba para ver en tiempo real los proyectos creados por tus compañeros desde otros ordenadores.'
                        : 'Prueba otra búsqueda o crea un nuevo proyecto para que aparezca aquí.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#22222A] border border-[#22222A]">
                    {exploredProjects.map((proj) => {
                      const isMember = isUserMemberOfProject(proj, currentUser);
                      const isSelected = activeProject?.id === proj.id;
                      return (
                        <div
                          key={proj.id}
                          className="bg-[#0E0E12] p-6 flex flex-col justify-between gap-5"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-[#22222A] font-mono text-[11px]">
                              <span className="text-[#60A5FA] truncate">
                                @{proj.ownerUsername}
                              </span>
                              {proj.hasPassword ? (
                                <span className="inline-flex items-center gap-1 text-amber-400 shrink-0">
                                  <Lock className="w-3 h-3" />
                                  CON CONTRASEÑA
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-400 shrink-0">
                                  <Unlock className="w-3 h-3" />
                                  ABIERTO
                                </span>
                              )}
                            </div>

                            <h3 className="font-display font-bold text-lg text-white leading-snug mb-1">
                              {proj.name}
                            </h3>
                            <p className="font-mono text-xs text-[#8E8E9E] mb-3">{proj.subject}</p>
                            <p className="text-xs text-[#9E9EAE] leading-relaxed line-clamp-3">
                              {proj.description || 'Proyecto colaborativo de informática.'}
                            </p>
                          </div>

                          <div className="space-y-3 pt-2 border-t border-[#1D1D25]">
                            <div className="flex items-center justify-between text-[11px] font-mono text-[#7E7E8E]">
                              <span className="inline-flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-[#60A5FA]" />
                                {proj.authorizedUsernames.length} miembro(s)
                              </span>
                              <span>
                                Entrega: {new Date(proj.dueDate).toLocaleDateString('es-ES')}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSelectProject(proj)}
                              className={`w-full h-10 font-semibold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                                isMember
                                  ? isSelected
                                    ? 'bg-[#3B82F6] text-white'
                                    : 'border border-[#3B82F6] bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 text-[#60A5FA]'
                                  : 'bg-white hover:bg-zinc-200 text-[#09090B]'
                              }`}
                            >
                              {isMember ? (
                                <>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                  <span>{isSelected ? 'Proyecto Activo' : 'Abrir Proyecto'}</span>
                                </>
                              ) : proj.hasPassword ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Unirse con Contraseña</span>
                                </>
                              ) : (
                                <>
                                  <UserPlus className="w-3.5 h-3.5" />
                                  <span>Unirse al Proyecto</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
              Conecta tu cuenta de Google en la pestaña <strong>07 Mis Proyectos y Drive</strong> para
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
              <UserInvitePicker
                allUsers={workspace?.users || []}
                currentUsername={currentUser.username}
                ownerUsername={editingProject ? editingProject.ownerUsername : currentUser.username}
                existingMemberUsernames={
                  editingProject ? editingProject.authorizedUsernames : [currentUser.username]
                }
                pendingInviteUsernames={
                  editingProject
                    ? (workspace?.invitations || [])
                        .filter(
                          (inv) => inv.projectId === editingProject.id && inv.status === 'pending'
                        )
                        .map((inv) => inv.toUsername)
                    : []
                }
                selectedUsers={selectedInviteUsers}
                canKickMembers={editingProject ? isProjectOwner(editingProject) : false}
                onKickMember={(uname) => {
                  if (editingProject) {
                    handleRemoveProjectMember(editingProject, uname);
                  }
                }}
                onAddUser={(u) =>
                  setSelectedInviteUsers((prev) =>
                    prev.some((x) => x.username.toLowerCase() === u.username.toLowerCase())
                      ? prev
                      : [...prev, u]
                  )
                }
                onRemoveUser={(uname) =>
                  setSelectedInviteUsers((prev) =>
                    prev.filter((x) => x.username.toLowerCase() !== uname.toLowerCase())
                  )
                }
              />
              <div>
                <label className="block font-mono text-[11px] uppercase text-[#A1A1B2] mb-1 inline-flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>Repositorio público de GitHub (opcional)</span>
                </label>
                <input
                  type="url"
                  value={projGithubUrl}
                  onChange={(e) => setProjGithubUrl(e.target.value)}
                  placeholder="https://github.com/usuario/repositorio"
                  className="w-full h-10 px-3 bg-[#09090B] border border-[#2A2A35] font-mono text-xs text-white"
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
                placeholder="Mensaje para el grupo... Usa @usuario para notificar a un compañero"
                className="w-full p-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white"
              />
              {activeProject.authorizedUsernames.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] uppercase text-[#7E7E8E]">Mencionar:</span>
                  {activeProject.authorizedUsernames.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() =>
                        setNewNoticeMessage((prev) =>
                          prev.trim().length > 0 ? `${prev.trimEnd()} @${u} ` : `@${u} `
                        )
                      }
                      className="px-2 py-0.5 border border-[#2A2A35] bg-[#14141A] hover:border-[#60A5FA] font-mono text-[10px] text-[#60A5FA] cursor-pointer"
                    >
                      @{u}
                    </button>
                  ))}
                </div>
              )}
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

      {/* ==================== SLIDE-OVER AUDIT LOG DRAWER ==================== */}
      <ActivityLogDrawer
        isOpen={showActivityDrawer}
        onClose={() => setShowActivityDrawer(false)}
        projectName={activeProject?.name || 'Proyecto'}
        activities={projectActivities}
      />

      {/* ==================== BUILT-IN CODE / MARKDOWN / .ZIP VIEWER MODAL ==================== */}
      <CodeMarkdownViewerModal
        docItem={viewerDocItem}
        onClose={() => setViewerDocItem(null)}
      />

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
