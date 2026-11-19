import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  StudentAccount,
  ProjectItem,
  ProjectInvitation,
  FolderItem,
  DocumentItem,
  TaskItem,
  NoticeItem,
  CodeSnippetItem,
  ChatMessageItem,
  ActivityLogItem,
  InAppNotificationItem,
  TeacherShowcaseData,
} from './types';

// Initialize Firebase App, Firestore, and Auth
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Required Google Workspace OAuth scopes (only requested when connecting Drive)
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
];

// 1) Clean Google Sign-In provider (basic profile/email only — instant personal account login)
const accountProvider = new GoogleAuthProvider();
accountProvider.setCustomParameters({ prompt: 'select_account' });

// 2) Google Drive Workspace provider (only requested when user explicitly links Drive API)
const driveProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => driveProvider.addScope(scope));
driveProvider.setCustomParameters({ prompt: 'consent' });

// In-memory Drive access token cache (never stored in localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Mandatory startup connection check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Structured Firestore Error Handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(
          (p: { providerId?: string | null; email?: string | null }) => ({
            providerId: p.providerId,
            email: p.email,
          })
        ) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function logFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  try {
    handleFirestoreError(error, operationType, path);
  } catch {
    // Already logged structured FirestoreErrorInfo
  }
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Primary Social-Network Account Sign-In with Google (NO Drive scopes, instant 1-click)
export const signInWithGoogleAccount = async (): Promise<{ user: User }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, accountProvider);
    return { user: result.user };
  } catch (error) {
    console.error('Google account sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Optional Google Drive OAuth connection (requests drive.file + documents scopes)
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, driveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    const token = credential.accessToken;
    cachedAccessToken = token;
    return { user: result.user, accessToken: token };
  } catch (error) {
    console.error('Google Drive sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Helpers
export const sanitizeId = (rawId: string): string =>
  rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'item_1';

const toIsoString = (val: unknown): string => {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string' && val.length > 0) return val;
  return new Date().toISOString();
};

export const cleanUsername = (raw: string): string => {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.-]/g, '');
  return cleaned.length >= 2 ? cleaned.slice(0, 40) : `user_${cleaned || '01'}`;
};

// ==================== 1. USER PROFILE DIRECTORY (NO PII) ====================

export async function getMyUserProfileFromFirestore(uid: string): Promise<StudentAccount | null> {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !uid) return null;
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: `fb_${snap.id}`,
      firebaseUid: String(data.uid || snap.id),
      username: String(data.username || 'usuario'),
      displayName: String(data.displayName || data.username || 'Estudiante'),
      passwordHash: '',
      role: String(data.role || 'Estudiante de Informática'),
      createdAt: toIsoString(data.createdAt),
    };
  } catch (error) {
    logFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function syncUserProfileToFirestore(account: StudentAccount): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const uid = auth.currentUser.uid;
  const path = `users/${uid}`;
  const userRef = doc(db, 'users', uid);
  const payloadBase = {
    username: cleanUsername(account.username),
    displayName: (account.displayName || account.username || 'Estudiante').slice(0, 80),
    role: (account.role || 'Estudiante de Informática').slice(0, 80),
    searchable: true,
    updatedAt: serverTimestamp(),
  };

  try {
    const existingSnap = await getDoc(userRef);
    if (existingSnap.exists()) {
      await updateDoc(userRef, payloadBase);
    } else {
      await setDoc(userRef, {
        uid,
        ...payloadBase,
        createdAt: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

export function subscribeToDirectoryUsers(
  onUsers: (users: StudentAccount[]) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return () => {};
  const q = query(collection(db, 'users'), where('searchable', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      const list: StudentAccount[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: `fb_${d.id}`,
          firebaseUid: String(data.uid || d.id),
          username: String(data.username || 'usuario'),
          displayName: String(data.displayName || data.username || 'Estudiante'),
          passwordHash: '',
          role: String(data.role || 'Estudiante de Informática'),
          createdAt: toIsoString(data.createdAt),
        };
      });
      onUsers(list);
    },
    (error) => {
      logFirestoreError(error, OperationType.LIST, 'users');
    }
  );
}

// ==================== 2. PROJECTS & EXPLORAR PROYECTOS ====================

const mapProjectDoc = (d: any): ProjectItem => {
  const data = d.data();
  return {
    id: String(data.id || d.id),
    name: String(data.name || 'Proyecto'),
    subject: String(data.subject || 'Informática'),
    description: String(data.description || ''),
    ownerId: String(data.ownerId || ''),
    ownerUsername: String(data.ownerUsername || 'usuario'),
    hasPassword: Boolean(data.hasPassword),
    passwordHash: String(data.passwordHash || ''),
    visibility: data.visibility === 'private' ? 'private' : 'class',
    authorizedUsernames: Array.isArray(data.authorizedUsernames)
      ? data.authorizedUsernames.map(String)
      : [String(data.ownerUsername || 'usuario')],
    memberUids: Array.isArray(data.memberUids)
      ? data.memberUids.map(String)
      : [String(data.ownerId || '')].filter(Boolean),
    dueDate: String(data.dueDate || new Date().toISOString()),
    driveFolderId: String(data.driveFolderId || ''),
    githubUrl: typeof data.githubUrl === 'string' ? data.githubUrl : '',
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
};

export async function syncProjectToFirestore(
  project: ProjectItem,
  isNew = false
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(project.id);
  const path = `projects/${projectId}`;
  const projectRef = doc(db, 'projects', projectId);

  const ownerUname = cleanUsername(project.ownerUsername || 'estudiante');
  const incomingAuthUsers = Array.isArray(project.authorizedUsernames)
    ? project.authorizedUsernames.map((u) => cleanUsername(u))
    : [];
  const mergedAuthUsers = Array.from(new Set([ownerUname, ...incomingAuthUsers])).slice(0, 50);

  const incomingMemberUids = Array.isArray(project.memberUids)
    ? project.memberUids.filter((x) => typeof x === 'string' && x.length > 0)
    : [];
  const mergedMemberUids = Array.from(
    new Set([project.ownerId && !project.ownerId.startsWith('usr_') ? project.ownerId : uid, uid, ...incomingMemberUids])
  ).slice(0, 50);

  const updateFields = {
    name: (project.name || 'Proyecto').slice(0, 120),
    subject: (project.subject || 'Informática').slice(0, 80),
    description: (project.description || '').slice(0, 1000),
    hasPassword: Boolean(project.hasPassword),
    passwordHash: (project.passwordHash || '').slice(0, 128),
    visibility: project.visibility === 'private' ? 'private' : 'class',
    authorizedUsernames: mergedAuthUsers,
    memberUids: mergedMemberUids,
    dueDate: (project.dueDate || '').slice(0, 40),
    driveFolderId: (project.driveFolderId || '').slice(0, 128),
    githubUrl: (project.githubUrl || '').trim().slice(0, 300),
    updatedAt: serverTimestamp(),
  };

  if (isNew) {
    try {
      await setDoc(projectRef, {
        id: projectId,
        ownerId: uid,
        ownerUsername: ownerUname,
        ...updateFields,
        createdAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      logFirestoreError(error, OperationType.CREATE, path);
      return false;
    }
  }

  // Existing project update — try updateDoc first (avoids getDoc on missing doc); if not-found, create it
  try {
    await updateDoc(projectRef, updateFields);
    return true;
  } catch (updateErr: any) {
    const msg = String(updateErr?.code || updateErr?.message || '');
    if (msg.includes('not-found') || msg.includes('No document to update')) {
      try {
        await setDoc(projectRef, {
          id: projectId,
          ownerId: uid,
          ownerUsername: ownerUname,
          ...updateFields,
          createdAt: serverTimestamp(),
        });
        return true;
      } catch (createErr) {
        logFirestoreError(createErr, OperationType.CREATE, path);
        return false;
      }
    }
    logFirestoreError(updateErr, OperationType.UPDATE, path);
    return false;
  }
}

export async function joinProjectInFirestore(
  project: ProjectItem,
  joiningUsername: string
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(project.id);
  const path = `projects/${projectId}`;
  const projectRef = doc(db, 'projects', projectId);
  try {
    const snap = await getDoc(projectRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    const currentUids: string[] = Array.isArray(data.memberUids) ? data.memberUids : [data.ownerId];
    const currentUsernames: string[] = Array.isArray(data.authorizedUsernames)
      ? data.authorizedUsernames
      : [data.ownerUsername];

    const updatedUids = Array.from(new Set([...currentUids, uid])).slice(0, 50);
    const updatedUsernames = Array.from(
      new Set([...currentUsernames, cleanUsername(joiningUsername)])
    ).slice(0, 50);

    await updateDoc(projectRef, {
      memberUids: updatedUids,
      authorizedUsernames: updatedUsernames,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
}

export async function removeMemberFromProjectInFirestore(
  project: ProjectItem,
  targetUsername: string,
  targetUid?: string
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(project.id);
  const path = `projects/${projectId}`;
  const projectRef = doc(db, 'projects', projectId);

  try {
    const snap = await getDoc(projectRef);
    if (!snap.exists()) return false;
    const data = snap.data();

    // Only the project creator can remove members, and the creator cannot remove themselves
    if (data.ownerId !== uid) return false;
    const ownerUname = String(data.ownerUsername || '').toLowerCase().trim();
    const targetLower = targetUsername.toLowerCase().trim();
    if (!targetLower || targetLower === ownerUname) return false;

    const currentUsernames: string[] = Array.isArray(data.authorizedUsernames)
      ? data.authorizedUsernames.map(String)
      : [ownerUname];
    const nextUsernames = currentUsernames.filter(
      (u) => u.toLowerCase().trim() !== targetLower || u.toLowerCase().trim() === ownerUname
    );
    if (nextUsernames.length === 0) nextUsernames.push(ownerUname);

    const currentUids: string[] = Array.isArray(data.memberUids)
      ? data.memberUids.map(String)
      : [uid];
    const nextUids = currentUids.filter(
      (id) => id === data.ownerId || (targetUid ? id !== targetUid : true)
    );
    if (!nextUids.includes(data.ownerId)) nextUids.unshift(data.ownerId);

    await updateDoc(projectRef, {
      authorizedUsernames: nextUsernames.slice(0, 50),
      memberUids: nextUids.slice(0, 50),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
}

export async function updateProjectGithubUrlInFirestore(
  projectId: string,
  githubUrl: string
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !projectId) return false;
  const pId = sanitizeId(projectId);
  const path = `projects/${pId}`;
  try {
    await updateDoc(doc(db, 'projects', pId), {
      githubUrl: githubUrl.trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
}

export async function deleteProjectFromFirestore(projectId: string): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const pId = sanitizeId(projectId);
  try {
    await deleteDoc(doc(db, 'projects', pId, 'state', 'main')).catch(() => {});
    await deleteDoc(doc(db, 'projects', pId, 'state', 'chat')).catch(() => {});
    await deleteDoc(doc(db, 'projects', pId, 'showcase', 'public')).catch(() => {});
    await deleteDoc(doc(db, 'projects', pId));
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.DELETE, `projects/${pId}`);
    return false;
  }
}

export function subscribeToClassProjects(
  uid: string,
  onProjects: (projects: ProjectItem[]) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !uid) return () => {};
  const classMap = new Map<string, ProjectItem>();
  const memberMap = new Map<string, ProjectItem>();

  const emitCombined = () => {
    const combined = new Map<string, ProjectItem>();
    classMap.forEach((v, k) => combined.set(k, v));
    memberMap.forEach((v, k) => combined.set(k, v));
    const list = Array.from(combined.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    onProjects(list);
  };

  const unsubClass = onSnapshot(
    query(collection(db, 'projects'), where('visibility', '==', 'class')),
    (snap) => {
      classMap.clear();
      snap.docs.forEach((d) => classMap.set(d.id, mapProjectDoc(d)));
      emitCombined();
    },
    (error) => logFirestoreError(error, OperationType.LIST, 'projects(class)')
  );

  const unsubMember = onSnapshot(
    query(collection(db, 'projects'), where('memberUids', 'array-contains', uid)),
    (snap) => {
      memberMap.clear();
      snap.docs.forEach((d) => memberMap.set(d.id, mapProjectDoc(d)));
      emitCombined();
    },
    (error) => logFirestoreError(error, OperationType.LIST, 'projects(member)')
  );

  return () => {
    unsubClass();
    unsubMember();
  };
}

// ==================== 3. SHARED PROJECT WORKSPACE STATE ====================

export interface ProjectStateSnapshot {
  folders: FolderItem[];
  documents: DocumentItem[];
  tasks: TaskItem[];
  notices: NoticeItem[];
  messages: ChatMessageItem[];
  activities?: ActivityLogItem[];
}

export async function syncProjectWorkspaceStateToFirestore(
  projectId: string,
  state: ProjectStateSnapshot
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !projectId) return false;
  const uid = auth.currentUser.uid;
  const pId = sanitizeId(projectId);
  const path = `projects/${pId}/state/main`;
  const stateRef = doc(db, 'projects', pId, 'state', 'main');

  // Keep Firestore document well below 1MB by preserving text code/markdown/small zips while omitting oversized blobs
  const sanitizedDocs = state.documents.slice(0, 200).map((d) => ({
    ...d,
    fileDataUrl: d.fileDataUrl && d.fileDataUrl.length <= 120000 ? d.fileDataUrl : '',
    content: (d.content || '').slice(0, 12000),
  }));

  // Bounded audit log: strictly keep only the 30 most recent events inside state/main (zero extra reads/writes!)
  const boundedActivities = (Array.isArray(state.activities) ? state.activities : []).slice(0, 30);

  try {
    await setDoc(stateRef, {
      projectId: pId,
      updatedBy: uid,
      folders: state.folders.slice(0, 200),
      documents: sanitizedDocs,
      tasks: state.tasks.slice(0, 200),
      notices: state.notices.slice(0, 200),
      messages: state.messages.slice(-300),
      activities: boundedActivities,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

export function subscribeToProjectWorkspaceState(
  projectId: string,
  onState: (state: ProjectStateSnapshot) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !projectId) return () => {};
  const pId = sanitizeId(projectId);
  const path = `projects/${pId}/state/main`;
  const stateRef = doc(db, 'projects', pId, 'state', 'main');

  let active = true;
  let currentUnsub: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;

  const attach = () => {
    if (!active) return;
    currentUnsub = onSnapshot(
      stateRef,
      (snap) => {
        retries = 0;
        if (!snap.exists()) return;
        const data = snap.data();
        onState({
          folders: Array.isArray(data.folders) ? (data.folders as FolderItem[]) : [],
          documents: Array.isArray(data.documents) ? (data.documents as DocumentItem[]) : [],
          tasks: Array.isArray(data.tasks) ? (data.tasks as TaskItem[]) : [],
          notices: Array.isArray(data.notices) ? (data.notices as NoticeItem[]) : [],
          messages: Array.isArray(data.messages) ? (data.messages as ChatMessageItem[]) : [],
          activities: Array.isArray(data.activities)
            ? (data.activities as ActivityLogItem[]).slice(0, 30)
            : [],
        });
      },
      (error) => {
        if (!active) return;
        if (retries < 4) {
          retries += 1;
          retryTimer = setTimeout(attach, 900 * retries);
        } else {
          logFirestoreError(error, OperationType.GET, path);
        }
      }
    );
  };

  attach();

  return () => {
    active = false;
    if (retryTimer) clearTimeout(retryTimer);
    if (currentUnsub) currentUnsub();
  };
}

// ==================== 3B. DEDICATED REAL-TIME PROJECT CHAT (ATOMIC arrayUnion) ====================

export async function sendProjectChatMessageInFirestore(
  projectId: string,
  message: ChatMessageItem
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !projectId) return false;
  const uid = auth.currentUser.uid;
  const pId = sanitizeId(projectId);
  const path = `projects/${pId}/state/chat`;
  const chatRef = doc(db, 'projects', pId, 'state', 'chat');

  const cleanMsg: ChatMessageItem = {
    id: sanitizeId(message.id),
    projectId: pId,
    ownerId: uid,
    senderUsername: cleanUsername(message.senderUsername || 'estudiante'),
    text: (message.text || '').slice(0, 1000),
    createdAt: message.createdAt || new Date().toISOString(),
  };

  try {
    // Fast atomic append — multiple teammates chatting simultaneously NEVER overwrite each other!
    await updateDoc(chatRef, {
      updatedBy: uid,
      messages: arrayUnion(cleanMsg),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (updateErr: any) {
    const code = String(updateErr?.code || updateErr?.message || '');
    if (code.includes('not-found') || code.includes('No document to update')) {
      try {
        await setDoc(chatRef, {
          projectId: pId,
          updatedBy: uid,
          folders: [],
          documents: [],
          tasks: [],
          notices: [],
          messages: [cleanMsg],
          updatedAt: serverTimestamp(),
        });
        return true;
      } catch (createErr) {
        logFirestoreError(createErr, OperationType.CREATE, path);
        return false;
      }
    }

    // If list hit the 300-message cap, trim oldest 50 messages and append cleanly
    try {
      const snap = await getDoc(chatRef);
      if (snap.exists()) {
        const existingMsgs: ChatMessageItem[] = Array.isArray(snap.data().messages)
          ? (snap.data().messages as ChatMessageItem[])
          : [];
        if (existingMsgs.length >= 295) {
          const trimmed = [...existingMsgs.slice(-240), cleanMsg];
          await updateDoc(chatRef, {
            updatedBy: uid,
            messages: trimmed,
            updatedAt: serverTimestamp(),
          });
          return true;
        }
      }
    } catch {
      // fall through to structured log
    }

    logFirestoreError(updateErr, OperationType.UPDATE, path);
    return false;
  }
}

export function subscribeToProjectChat(
  projectId: string,
  onMessages: (messages: ChatMessageItem[]) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !projectId) return () => {};
  const pId = sanitizeId(projectId);
  const path = `projects/${pId}/state/chat`;
  const chatRef = doc(db, 'projects', pId, 'state', 'chat');

  let active = true;
  let currentUnsub: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;

  const attach = () => {
    if (!active) return;
    currentUnsub = onSnapshot(
      chatRef,
      (snap) => {
        retries = 0;
        if (!snap.exists()) {
          onMessages([]);
          return;
        }
        const data = snap.data();
        const msgs = Array.isArray(data.messages) ? (data.messages as ChatMessageItem[]) : [];
        onMessages(msgs);
      },
      (error) => {
        if (!active) return;
        if (retries < 4) {
          retries += 1;
          retryTimer = setTimeout(attach, 900 * retries);
        } else {
          logFirestoreError(error, OperationType.GET, path);
        }
      }
    );
  };

  attach();

  return () => {
    active = false;
    if (retryTimer) clearTimeout(retryTimer);
    if (currentUnsub) currentUnsub();
  };
}

// ==================== 4. REAL-TIME PROJECT INVITATIONS ====================

export async function createProjectInvitationInFirestore(
  invitation: ProjectInvitation
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const uid = auth.currentUser.uid;
  const invId = sanitizeId(invitation.id);
  const path = `invitations/${invId}`;
  const invRef = doc(db, 'invitations', invId);
  try {
    await setDoc(invRef, {
      id: invId,
      projectId: sanitizeId(invitation.projectId),
      projectName: (invitation.projectName || 'Proyecto').slice(0, 120),
      projectSubject: (invitation.projectSubject || 'Informática').slice(0, 80),
      fromUid: uid,
      fromUsername: cleanUsername(invitation.fromUsername),
      toUid: sanitizeId(invitation.toUid || invitation.toUsername),
      toUsername: cleanUsername(invitation.toUsername),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.CREATE, path);
    return false;
  }
}

export async function respondToInvitationInFirestore(
  invitationId: string,
  status: 'accepted' | 'declined'
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const invId = sanitizeId(invitationId);
  const path = `invitations/${invId}`;
  const invRef = doc(db, 'invitations', invId);
  try {
    await updateDoc(invRef, {
      status,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
}

export function subscribeToUserInvitations(
  uid: string,
  onInvitations: (invitations: ProjectInvitation[]) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !uid) return () => {};
  const incomingMap = new Map<string, ProjectInvitation>();
  const outgoingMap = new Map<string, ProjectInvitation>();

  const emitMerged = () => {
    const combined = new Map<string, ProjectInvitation>();
    outgoingMap.forEach((v, k) => combined.set(k, v));
    incomingMap.forEach((v, k) => combined.set(k, v));
    onInvitations(
      Array.from(combined.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
  };

  const mapDoc = (d: any): ProjectInvitation => {
    const data = d.data();
    return {
      id: String(data.id || d.id),
      projectId: String(data.projectId || ''),
      projectName: String(data.projectName || 'Proyecto'),
      projectSubject: String(data.projectSubject || ''),
      fromUid: String(data.fromUid || ''),
      fromUsername: String(data.fromUsername || 'usuario'),
      toUid: String(data.toUid || ''),
      toUsername: String(data.toUsername || 'usuario'),
      status:
        data.status === 'accepted' || data.status === 'declined' ? data.status : 'pending',
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  };

  const unsubIn = onSnapshot(
    query(collection(db, 'invitations'), where('toUid', '==', uid)),
    (snap) => {
      incomingMap.clear();
      snap.docs.forEach((d) => incomingMap.set(d.id, mapDoc(d)));
      emitMerged();
    },
    (error) => logFirestoreError(error, OperationType.LIST, 'invitations(incoming)')
  );

  const unsubOut = onSnapshot(
    query(collection(db, 'invitations'), where('fromUid', '==', uid)),
    (snap) => {
      outgoingMap.clear();
      snap.docs.forEach((d) => outgoingMap.set(d.id, mapDoc(d)));
      emitMerged();
    },
    (error) => logFirestoreError(error, OperationType.LIST, 'invitations(outgoing)')
  );

  return () => {
    unsubIn();
    unsubOut();
  };
}

// ==================== 4B. PUBLIC TEACHER SHOWCASE (?modo=profesor — ZERO PII) ====================

export async function syncProjectShowcaseToFirestore(
  project: ProjectItem,
  folders: FolderItem[],
  documents: DocumentItem[],
  tasks: TaskItem[]
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !project?.id) return false;
  const pId = sanitizeId(project.id);
  const path = `projects/${pId}/showcase/public`;
  const showcaseRef = doc(db, 'projects', pId, 'showcase', 'public');

  const sanitizedDocs = documents.slice(0, 200).map((d) => ({
    ...d,
    fileDataUrl: d.fileDataUrl && d.fileDataUrl.length <= 120000 ? d.fileDataUrl : '',
    content: (d.content || '').slice(0, 12000),
  }));

  const ownerUname = cleanUsername(project.ownerUsername || 'estudiante');
  const members = Array.from(
    new Set([
      ownerUname,
      ...(Array.isArray(project.authorizedUsernames)
        ? project.authorizedUsernames.map((u) => cleanUsername(u))
        : []),
    ])
  ).slice(0, 50);

  try {
    await setDoc(showcaseRef, {
      projectId: pId,
      name: (project.name || 'Proyecto').slice(0, 120),
      subject: (project.subject || 'Informática').slice(0, 80),
      description: (project.description || '').slice(0, 1000),
      ownerUsername: ownerUname,
      authorizedUsernames: members,
      dueDate: (project.dueDate || '').slice(0, 40),
      githubUrl: (project.githubUrl || '').trim().slice(0, 300),
      folders: folders.slice(0, 200),
      documents: sanitizedDocs,
      tasks: tasks.slice(0, 200),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

// Public direct-get read for teachers opening ?modo=profesor&proyecto=<id> WITHOUT logging in
export async function getPublicProjectShowcaseFromFirestore(
  projectId: string
): Promise<TeacherShowcaseData | null> {
  if (!projectId) return null;
  const pId = sanitizeId(projectId);
  const path = `projects/${pId}/showcase/public`;
  try {
    const snap = await getDoc(doc(db, 'projects', pId, 'showcase', 'public'));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      projectId: String(data.projectId || pId),
      name: String(data.name || 'Proyecto'),
      subject: String(data.subject || 'Informática'),
      description: String(data.description || ''),
      ownerUsername: String(data.ownerUsername || 'estudiante'),
      authorizedUsernames: Array.isArray(data.authorizedUsernames)
        ? data.authorizedUsernames.map(String)
        : [],
      dueDate: String(data.dueDate || new Date().toISOString()),
      githubUrl: typeof data.githubUrl === 'string' ? data.githubUrl : '',
      folders: Array.isArray(data.folders) ? (data.folders as FolderItem[]) : [],
      documents: Array.isArray(data.documents) ? (data.documents as DocumentItem[]) : [],
      tasks: Array.isArray(data.tasks) ? (data.tasks as TaskItem[]) : [],
      updatedAt: toIsoString(data.updatedAt),
    };
  } catch (error) {
    logFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

// ==================== 4C. REAL-TIME IN-APP ACTIVITY NOTIFICATIONS ====================

export async function createInAppNotificationInFirestore(
  notification: Omit<InAppNotificationItem, 'createdAt' | 'read'>
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return false;
  const uid = auth.currentUser.uid;
  const notifId = sanitizeId(notification.id);
  const path = `notifications/${notifId}`;
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      toUid: sanitizeId(notification.toUid),
      toUsername: cleanUsername(notification.toUsername),
      fromUid: uid,
      fromUsername: cleanUsername(notification.fromUsername),
      projectId: sanitizeId(notification.projectId),
      projectName: (notification.projectName || 'Proyecto').slice(0, 120),
      kind: notification.kind,
      title: (notification.title || 'Notificación').slice(0, 140),
      message: (notification.message || '').slice(0, 400),
      targetSection: notification.targetSection,
      read: false,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.CREATE, path);
    return false;
  }
}

export async function markInAppNotificationReadInFirestore(
  notificationId: string
): Promise<boolean> {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !notificationId) return false;
  const notifId = sanitizeId(notificationId);
  const path = `notifications/${notifId}`;
  try {
    await updateDoc(doc(db, 'notifications', notifId), {
      read: true,
    });
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.UPDATE, path);
    return false;
  }
}

export function subscribeToInAppNotifications(
  uid: string,
  onNotifications: (items: InAppNotificationItem[]) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !uid) return () => {};
  const q = query(collection(db, 'notifications'), where('toUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: InAppNotificationItem[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            toUid: String(data.toUid || ''),
            toUsername: String(data.toUsername || ''),
            fromUid: String(data.fromUid || ''),
            fromUsername: String(data.fromUsername || 'compañero'),
            projectId: String(data.projectId || ''),
            projectName: String(data.projectName || 'Proyecto'),
            kind:
              data.kind === 'mention' || data.kind === 'deadline_48h'
                ? data.kind
                : 'task_assigned',
            title: String(data.title || 'Notificación'),
            message: String(data.message || ''),
            targetSection:
              data.targetSection === 'files' ||
              data.targetSection === 'tasks' ||
              data.targetSection === 'notices' ||
              data.targetSection === 'stats'
                ? data.targetSection
                : 'overview',
            read: Boolean(data.read),
            createdAt: toIsoString(data.createdAt),
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onNotifications(list);
    },
    (error) => {
      logFirestoreError(error, OperationType.LIST, 'notifications');
    }
  );
}

// ==================== 5. INDIVIDUAL SUBCOLLECTION MIRRORS ====================

export async function syncFolderToFirestore(folder: FolderItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(folder.projectId);
  const folderId = sanitizeId(folder.id);
  const folderRef = doc(db, 'projects', projectId, 'folders', folderId);
  try {
    await setDoc(folderRef, {
      id: folderId,
      projectId,
      ownerId: uid,
      parentId: sanitizeId(folder.parentId || 'root'),
      name: (folder.name || 'Carpeta').slice(0, 100),
      driveFolderId: (folder.driveFolderId || '').slice(0, 128),
      createdBy: cleanUsername(folder.createdBy || 'estudiante'),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Primary sync is handled via state/main
  }
}

export async function syncDocumentToFirestore(docItem: DocumentItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(docItem.projectId);
  const documentId = sanitizeId(docItem.id);
  const docRef = doc(db, 'projects', projectId, 'documents', documentId);
  try {
    await setDoc(docRef, {
      id: documentId,
      projectId,
      ownerId: uid,
      folderId: sanitizeId(docItem.folderId || 'root'),
      title: (docItem.title || 'Archivo').slice(0, 150),
      content: (docItem.content || '').slice(0, 50000),
      googleDocId: (docItem.googleDocId || '').slice(0, 128),
      googleDocUrl: (docItem.googleDocUrl || '').slice(0, 500),
      assigneeUsername: (docItem.assigneeUsername || 'estudiante').slice(0, 40),
      status: docItem.status || 'draft',
      lastModifiedBy: (docItem.lastModifiedBy || 'estudiante').slice(0, 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Primary sync is handled via state/main
  }
}

export async function syncTaskToFirestore(task: TaskItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(task.projectId);
  const taskId = sanitizeId(task.id);
  const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
  try {
    await setDoc(taskRef, {
      id: taskId,
      projectId,
      ownerId: uid,
      title: (task.title || 'Tarea').slice(0, 200),
      description: (task.description || '').slice(0, 1000),
      assigneeUsername: (task.assigneeUsername || 'estudiante').slice(0, 40),
      dueDate: (task.dueDate || '').slice(0, 40),
      status: task.status || 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Primary sync is handled via state/main
  }
}

export async function syncNoticeToFirestore(notice: NoticeItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(notice.projectId);
  const noticeId = sanitizeId(notice.id);
  const noticeRef = doc(db, 'projects', projectId, 'notices', noticeId);
  try {
    await setDoc(noticeRef, {
      id: noticeId,
      projectId,
      ownerId: uid,
      title: (notice.title || 'Aviso').slice(0, 120),
      message: (notice.message || '').slice(0, 1000),
      priority: notice.priority || 'normal',
      authorUsername: cleanUsername(notice.authorUsername || 'estudiante'),
      targetUsername: cleanUsername(notice.targetUsername || 'all'),
      archived: Boolean(notice.archived),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Primary sync is handled via state/main
  }
}

export async function syncSnippetToFirestore(snippet: CodeSnippetItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(snippet.projectId);
  const snippetId = sanitizeId(snippet.id);
  const snippetRef = doc(db, 'projects', projectId, 'snippets', snippetId);
  try {
    await setDoc(snippetRef, {
      id: snippetId,
      projectId,
      ownerId: uid,
      folderId: sanitizeId(snippet.folderId || 'root'),
      title: (snippet.title || 'Snippet').slice(0, 120),
      language: (snippet.language || 'bash').slice(0, 30),
      code: (snippet.code || '').slice(0, 20000),
      authorUsername: cleanUsername(snippet.authorUsername || 'estudiante'),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Primary sync is handled via state/main
  }
}

export async function syncMessageToFirestore(message: ChatMessageItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(message.projectId);
  const messageId = sanitizeId(message.id);
  const msgRef = doc(db, 'projects', projectId, 'messages', messageId);
  try {
    await setDoc(msgRef, {
      id: messageId,
      projectId,
      ownerId: uid,
      senderUsername: cleanUsername(message.senderUsername || 'estudiante'),
      text: (message.text || '').slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Primary sync is handled via state/main
  }
}

export async function deleteFromFirestoreSubcollection(
  projectId: string,
  subcollectionName: string,
  itemId: string
) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const pId = sanitizeId(projectId);
  const iId = sanitizeId(itemId);
  try {
    await deleteDoc(doc(db, 'projects', pId, subcollectionName, iId));
  } catch {
    // Primary sync is handled via state/main
  }
}
