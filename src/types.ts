export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type DocumentStatus = 'draft' | 'in_review' | 'completed';
export type NoticePriority = 'normal' | 'important' | 'urgent';

// Free-Tier Hard Limits to guarantee 100% Free Database & Hosting ($0 cost)
export const MAX_ACTIVE_PROJECTS = 5;
export const MAX_PROJECT_STORAGE_BYTES = 50 * 1024 * 1024; // 50 MB per project (250 MB max across 5 projects < 1 GB free limit)
export const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per single file upload

export type GoogleEditorKind = 'docs' | 'sheets' | 'slides' | null;

export interface StudentAccount {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: string;
  createdAt: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  subject: string;
  description: string;
  ownerId: string;
  ownerUsername: string;
  hasPassword: boolean;
  passwordHash: string;
  authorizedUsernames: string[];
  dueDate: string;
  driveFolderId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderItem {
  id: string;
  projectId: string;
  ownerId: string;
  parentId: string; // 'root' or parent folder ID
  name: string;
  driveFolderId: string;
  createdBy: string;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  projectId: string;
  ownerId: string;
  folderId: string; // 'root' or folder ID
  title: string; // Full file name including extension (e.g., "Memoria_Tecnica.docx")
  extension?: string; // Lowercase extension without dot (e.g., "docx", "pdf", "pkt", "xlsx")
  mimeType?: string;
  sizeBytes?: number;
  fileDataUrl?: string; // Base64 Data URL for downloading/extracting the exact file
  content: string; // Optional plain-text summary/content for AI context or text files
  googleDocId: string;
  googleDocUrl: string;
  assigneeUsername: string;
  assignedUsernames?: string[];
  status: DocumentStatus;
  lastModifiedBy: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  projectId: string;
  ownerId: string;
  title: string;
  description: string;
  assigneeUsername: string;
  dueDate: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NoticeItem {
  id: string;
  projectId: string;
  ownerId: string;
  title: string;
  message: string;
  priority: NoticePriority;
  authorUsername: string;
  targetUsername: string; // 'all' or specific username
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CodeSnippetItem {
  id: string;
  projectId: string;
  ownerId: string;
  folderId: string;
  title: string;
  language: 'python' | 'javascript' | 'html' | 'sql' | 'bash' | 'cpp' | 'java';
  code: string;
  authorUsername: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageItem {
  id: string;
  projectId: string;
  ownerId: string;
  senderUsername: string;
  text: string;
  createdAt: string;
}

export interface ActivityLogItem {
  id: string;
  projectId: string;
  actorUsername: string;
  action: string;
  targetName: string;
  createdAt: string;
}

export interface WorkspaceData {
  users: StudentAccount[];
  projects: ProjectItem[];
  folders: FolderItem[];
  documents: DocumentItem[];
  tasks: TaskItem[];
  notices: NoticeItem[];
  snippets: CodeSnippetItem[];
  messages: ChatMessageItem[];
  activities: ActivityLogItem[];
}
