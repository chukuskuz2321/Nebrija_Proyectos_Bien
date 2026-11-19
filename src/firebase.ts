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
} from './types';

// Initialize Firebase App, Firestore, and Auth
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Required Google Workspace OAuth scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'consent' });

// In-memory access token cache (never stored in localStorage/sessionStorage)
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

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthSuccess) onAuthSuccess(user, null);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    const token = credential.accessToken;
    cachedAccessToken = token;
    return { user: result.user, accessToken: token };
  } catch (error) {
    console.error('Sign in error:', error);
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

const cleanUsername = (raw: string): string => {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_.-]/g, '');
  return cleaned.length >= 2 ? cleaned.slice(0, 40) : `user_${cleaned || '01'}`;
};

// ==================== 1. USER PROFILE DIRECTORY (NO PII) ====================

export async function syncUserProfileToFirestore(account: StudentAccount) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const userRef = doc(db, 'users', uid);
  try {
    const existingSnap = await getDoc(userRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    await setDoc(userRef, {
      uid,
      username: cleanUsername(account.username),
      displayName: (account.displayName || account.username || 'Estudiante').slice(0, 80),
      role: (account.role || 'Estudiante de Informática').slice(0, 80),
      searchable: true,
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore user profile sync skipped:', error);
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
      console.warn('Firestore users subscription error:', error);
    }
  );
}

// ==================== 2. PROJECTS & EXPLORAR PROYECTOS ====================

export async function syncProjectToFirestore(project: ProjectItem, _isNew?: boolean) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(project.id);
  const projectRef = doc(db, 'projects', projectId);
  try {
    const existingSnap = await getDoc(projectRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    const existingMemberUids: string[] = Array.isArray(existingData?.memberUids)
      ? existingData.memberUids.filter((x: unknown) => typeof x === 'string')
      : [];
    const incomingMemberUids: string[] = Array.isArray(project.memberUids)
      ? project.memberUids.filter((x) => typeof x === 'string' && x.length > 0)
      : [];
    const mergedMemberUids = Array.from(
      new Set([existingData?.ownerId || uid, uid, ...existingMemberUids, ...incomingMemberUids])
    ).slice(0, 50);

    const existingAuthUsers: string[] = Array.isArray(existingData?.authorizedUsernames)
      ? existingData.authorizedUsernames.filter((x: unknown) => typeof x === 'string')
      : [];
    const incomingAuthUsers: string[] = Array.isArray(project.authorizedUsernames)
      ? project.authorizedUsernames.map((u) => cleanUsername(u))
      : [];
    const ownerUname = cleanUsername(existingData?.ownerUsername || project.ownerUsername || 'chiki');
    const mergedAuthUsers = Array.from(
      new Set([ownerUname, ...existingAuthUsers, ...incomingAuthUsers])
    ).slice(0, 50);

    await setDoc(projectRef, {
      id: projectId,
      name: (project.name || 'Proyecto').slice(0, 120),
      subject: (project.subject || 'Informática').slice(0, 80),
      description: (project.description || '').slice(0, 1000),
      ownerId: existingData?.ownerId || uid,
      ownerUsername: ownerUname,
      hasPassword: Boolean(project.hasPassword),
      passwordHash: (project.passwordHash || '').slice(0, 128),
      visibility: project.visibility === 'private' ? 'private' : 'class',
      authorizedUsernames: mergedAuthUsers,
      memberUids: mergedMemberUids,
      dueDate: (project.dueDate || '').slice(0, 40),
      driveFolderId: (project.driveFolderId || '').slice(0, 128),
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore project sync skipped:', error);
  }
}

export async function joinProjectInFirestore(project: ProjectItem, joiningUsername: string) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(project.id);
  const projectRef = doc(db, 'projects', projectId);
  try {
    const snap = await getDoc(projectRef);
    if (!snap.exists()) return;
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
  } catch (error) {
    console.warn('Firestore project join skipped:', error);
  }
}

export async function deleteProjectFromFirestore(projectId: string) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const pId = sanitizeId(projectId);
  try {
    await deleteDoc(doc(db, 'projects', pId, 'state', 'main')).catch(() => {});
    await deleteDoc(doc(db, 'projects', pId));
  } catch (error) {
    console.warn('Firestore project delete skipped:', error);
  }
}

export function subscribeToClassProjects(
  onProjects: (projects: ProjectItem[]) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return () => {};
  const q = query(collection(db, 'projects'), where('visibility', '==', 'class'));
  return onSnapshot(
    q,
    (snap) => {
      const list: ProjectItem[] = snap.docs.map((d) => {
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
          createdAt: toIsoString(data.createdAt),
          updatedAt: toIsoString(data.updatedAt),
        };
      });
      onProjects(list);
    },
    (error) => {
      console.warn('Firestore projects subscription error:', error);
    }
  );
}

// ==================== 3. SHARED PROJECT WORKSPACE STATE ====================

export interface ProjectStateSnapshot {
  folders: FolderItem[];
  documents: DocumentItem[];
  tasks: TaskItem[];
  notices: NoticeItem[];
  messages: ChatMessageItem[];
}

export async function syncProjectWorkspaceStateToFirestore(
  projectId: string,
  state: ProjectStateSnapshot
) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const pId = sanitizeId(projectId);
  const stateRef = doc(db, 'projects', pId, 'state', 'main');

  // Keep Firestore document well below 1MB by omitting large raw base64 blobs
  // (Google Drive links, metadata, and text previews remain 100% preserved)
  const sanitizedDocs = state.documents.slice(0, 200).map((d) => ({
    ...d,
    fileDataUrl: d.fileDataUrl && d.fileDataUrl.length <= 40000 ? d.fileDataUrl : '',
    content: (d.content || '').slice(0, 8000),
  }));

  try {
    await setDoc(stateRef, {
      projectId: pId,
      updatedBy: uid,
      folders: state.folders.slice(0, 200),
      documents: sanitizedDocs,
      tasks: state.tasks.slice(0, 200),
      notices: state.notices.slice(0, 200),
      messages: state.messages.slice(-300),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore workspace state sync skipped:', error);
  }
}

export function subscribeToProjectWorkspaceState(
  projectId: string,
  onState: (state: ProjectStateSnapshot) => void
): () => void {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !projectId) return () => {};
  const pId = sanitizeId(projectId);
  const stateRef = doc(db, 'projects', pId, 'state', 'main');
  return onSnapshot(
    stateRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onState({
        folders: Array.isArray(data.folders) ? (data.folders as FolderItem[]) : [],
        documents: Array.isArray(data.documents) ? (data.documents as DocumentItem[]) : [],
        tasks: Array.isArray(data.tasks) ? (data.tasks as TaskItem[]) : [],
        notices: Array.isArray(data.notices) ? (data.notices as NoticeItem[]) : [],
        messages: Array.isArray(data.messages) ? (data.messages as ChatMessageItem[]) : [],
      });
    },
    (error) => {
      console.warn('Firestore project state subscription skipped:', error);
    }
  );
}

// ==================== 4. REAL-TIME PROJECT INVITATIONS ====================

export async function createProjectInvitationInFirestore(invitation: ProjectInvitation) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const invId = sanitizeId(invitation.id);
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
  } catch (error) {
    console.warn('Firestore invitation creation skipped:', error);
  }
}

export async function respondToInvitationInFirestore(
  invitationId: string,
  status: 'accepted' | 'declined'
) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const invId = sanitizeId(invitationId);
  const invRef = doc(db, 'invitations', invId);
  try {
    const snap = await getDoc(invRef);
    if (!snap.exists()) return;
    await updateDoc(invRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore invitation response skipped:', error);
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
    (error) => console.warn('Incoming invitations listener warning:', error)
  );

  const unsubOut = onSnapshot(
    query(collection(db, 'invitations'), where('fromUid', '==', uid)),
    (snap) => {
      outgoingMap.clear();
      snap.docs.forEach((d) => outgoingMap.set(d.id, mapDoc(d)));
      emitMerged();
    },
    (error) => console.warn('Outgoing invitations listener warning:', error)
  );

  return () => {
    unsubIn();
    unsubOut();
  };
}

// ==================== 5. INDIVIDUAL SUBCOLLECTION MIRRORS ====================

export async function syncFolderToFirestore(folder: FolderItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(folder.projectId);
  const folderId = sanitizeId(folder.id);
  const folderRef = doc(db, 'projects', projectId, 'folders', folderId);
  try {
    const existingSnap = await getDoc(folderRef);
    if (existingSnap.exists()) return;
    await setDoc(folderRef, {
      id: folderId,
      projectId,
      ownerId: uid,
      parentId: sanitizeId(folder.parentId || 'root'),
      name: (folder.name || 'Carpeta').slice(0, 100),
      driveFolderId: (folder.driveFolderId || '').slice(0, 128),
      createdBy: cleanUsername(folder.createdBy || 'chiki'),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore folder sync skipped:', error);
  }
}

export async function syncDocumentToFirestore(docItem: DocumentItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(docItem.projectId);
  const documentId = sanitizeId(docItem.id);
  const docRef = doc(db, 'projects', projectId, 'documents', documentId);
  try {
    const existingSnap = await getDoc(docRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    await setDoc(docRef, {
      id: documentId,
      projectId,
      ownerId: existingData?.ownerId || uid,
      folderId: sanitizeId(docItem.folderId || 'root'),
      title: (docItem.title || 'Archivo').slice(0, 150),
      content: (docItem.content || '').slice(0, 50000),
      googleDocId: (docItem.googleDocId || '').slice(0, 128),
      googleDocUrl: (docItem.googleDocUrl || '').slice(0, 500),
      assigneeUsername: (docItem.assigneeUsername || 'chiki').slice(0, 40),
      status: docItem.status || 'draft',
      lastModifiedBy: (docItem.lastModifiedBy || 'chiki').slice(0, 40),
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore document sync skipped:', error);
  }
}

export async function syncTaskToFirestore(task: TaskItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(task.projectId);
  const taskId = sanitizeId(task.id);
  const taskRef = doc(db, 'projects', projectId, 'tasks', taskId);
  try {
    const existingSnap = await getDoc(taskRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    await setDoc(taskRef, {
      id: taskId,
      projectId,
      ownerId: existingData?.ownerId || uid,
      title: (task.title || 'Tarea').slice(0, 200),
      description: (task.description || '').slice(0, 1000),
      assigneeUsername: (task.assigneeUsername || 'chiki').slice(0, 40),
      dueDate: (task.dueDate || '').slice(0, 40),
      status: task.status || 'pending',
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore task sync skipped:', error);
  }
}

export async function syncNoticeToFirestore(notice: NoticeItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(notice.projectId);
  const noticeId = sanitizeId(notice.id);
  const noticeRef = doc(db, 'projects', projectId, 'notices', noticeId);
  try {
    const existingSnap = await getDoc(noticeRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    await setDoc(noticeRef, {
      id: noticeId,
      projectId,
      ownerId: existingData?.ownerId || uid,
      title: (notice.title || 'Aviso').slice(0, 120),
      message: (notice.message || '').slice(0, 1000),
      priority: notice.priority || 'normal',
      authorUsername: cleanUsername(existingData?.authorUsername || notice.authorUsername || 'chiki'),
      targetUsername: cleanUsername(existingData?.targetUsername || notice.targetUsername || 'all'),
      archived: Boolean(notice.archived),
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore notice sync skipped:', error);
  }
}

export async function syncSnippetToFirestore(snippet: CodeSnippetItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(snippet.projectId);
  const snippetId = sanitizeId(snippet.id);
  const snippetRef = doc(db, 'projects', projectId, 'snippets', snippetId);
  try {
    const existingSnap = await getDoc(snippetRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    await setDoc(snippetRef, {
      id: snippetId,
      projectId,
      ownerId: existingData?.ownerId || uid,
      folderId: sanitizeId(snippet.folderId || 'root'),
      title: (snippet.title || 'Snippet').slice(0, 120),
      language: (snippet.language || 'bash').slice(0, 30),
      code: (snippet.code || '').slice(0, 20000),
      authorUsername: cleanUsername(existingData?.authorUsername || snippet.authorUsername || 'chiki'),
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore snippet sync skipped:', error);
  }
}

export async function syncMessageToFirestore(message: ChatMessageItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(message.projectId);
  const messageId = sanitizeId(message.id);
  const msgRef = doc(db, 'projects', projectId, 'messages', messageId);
  try {
    const existingSnap = await getDoc(msgRef);
    if (existingSnap.exists()) return;
    await setDoc(msgRef, {
      id: messageId,
      projectId,
      ownerId: uid,
      senderUsername: cleanUsername(message.senderUsername || 'chiki'),
      text: (message.text || '').slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore message sync skipped:', error);
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
  } catch (error) {
    console.warn('Firestore delete skipped:', error);
  }
}
