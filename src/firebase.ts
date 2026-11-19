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
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  ProjectItem,
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

// Defensive helpers to mirror mutations to Firestore while preserving createdAt on updates
const sanitizeId = (rawId: string): string =>
  rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'item_1';

export async function syncProjectToFirestore(project: ProjectItem, _isNew?: boolean) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(project.id);
  const projectRef = doc(db, 'projects', projectId);
  try {
    const existingSnap = await getDoc(projectRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    await setDoc(projectRef, {
      id: projectId,
      name: (project.name || 'Proyecto').slice(0, 120),
      subject: (project.subject || 'Informática').slice(0, 80),
      description: (project.description || '').slice(0, 1000),
      ownerId: existingData?.ownerId || uid,
      ownerUsername: (existingData?.ownerUsername || project.ownerUsername || 'chiki').slice(0, 40),
      hasPassword: Boolean(project.hasPassword),
      passwordHash: (project.passwordHash || '').slice(0, 128),
      dueDate: (project.dueDate || '').slice(0, 40),
      driveFolderId: (project.driveFolderId || '').slice(0, 128),
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore project sync skipped:', error);
  }
}

export async function syncFolderToFirestore(folder: FolderItem) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = auth.currentUser.uid;
  const projectId = sanitizeId(folder.projectId);
  const folderId = sanitizeId(folder.id);
  const folderRef = doc(db, 'projects', projectId, 'folders', folderId);
  try {
    const existingSnap = await getDoc(folderRef);
    if (existingSnap.exists()) return; // Folders are immutable in firestore.rules
    await setDoc(folderRef, {
      id: folderId,
      projectId,
      ownerId: uid,
      parentId: sanitizeId(folder.parentId || 'root'),
      name: (folder.name || 'Carpeta').slice(0, 100),
      driveFolderId: (folder.driveFolderId || '').slice(0, 128),
      createdBy: (folder.createdBy || 'chiki').slice(0, 40),
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
      authorUsername: (existingData?.authorUsername || notice.authorUsername || 'chiki').slice(0, 40),
      targetUsername: (existingData?.targetUsername || notice.targetUsername || 'all').slice(0, 40),
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
      authorUsername: (existingData?.authorUsername || snippet.authorUsername || 'chiki').slice(0, 40),
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
      senderUsername: (message.senderUsername || 'chiki').slice(0, 40),
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
