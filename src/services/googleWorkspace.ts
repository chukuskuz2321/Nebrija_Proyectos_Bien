import { GoogleEditorKind } from '../types';

export interface CreatedGoogleDocResult {
  googleDocId: string;
  googleDocUrl: string;
}

// Complete Microsoft Office + OpenDocument + Google Workspace compatible extensions
const GOOGLE_DOCS_EXTENSIONS = new Set([
  'doc',
  'docx',
  'docm',
  'dot',
  'dotx',
  'dotm',
  'odt',
  'ott',
  'rtf',
  'txt',
  'md',
  'html',
  'htm',
  'gdoc',
]);

const GOOGLE_SHEETS_EXTENSIONS = new Set([
  'xls',
  'xlsx',
  'xlsm',
  'xlsb',
  'xlt',
  'xltx',
  'xltm',
  'ods',
  'ots',
  'csv',
  'tsv',
  'tab',
  'gsheet',
]);

const GOOGLE_SLIDES_EXTENSIONS = new Set([
  'ppt',
  'pptx',
  'pptm',
  'pps',
  'ppsx',
  'ppsm',
  'pot',
  'potx',
  'potm',
  'odp',
  'otp',
  'gslides',
]);

/**
 * Returns the standard Office/OpenDocument MIME type for a file extension.
 */
export function getOfficeMimeType(ext: string): string {
  const clean = ext.toLowerCase().replace(/^\./, '');
  const map: Record<string, string> = {
    // Word / Docs
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    docm: 'application/vnd.ms-word.document.macroEnabled.12',
    doc: 'application/msword',
    dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
    dotm: 'application/vnd.ms-word.template.macroEnabled.12',
    dot: 'application/msword',
    odt: 'application/vnd.oasis.opendocument.text',
    ott: 'application/vnd.oasis.opendocument.text-template',
    rtf: 'application/rtf',
    txt: 'text/plain',
    md: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    // Excel / Sheets
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    xls: 'application/vnd.ms-excel',
    xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
    xltm: 'application/vnd.ms-excel.template.macroEnabled.12',
    xlt: 'application/vnd.ms-excel',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    ots: 'application/vnd.oasis.opendocument.spreadsheet-template',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    tab: 'text/tab-separated-values',
    // PowerPoint / Slides
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
    ppt: 'application/vnd.ms-powerpoint',
    ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
    pps: 'application/vnd.ms-powerpoint',
    potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
    potm: 'application/vnd.ms-powerpoint.template.macroEnabled.12',
    pot: 'application/vnd.ms-powerpoint',
    odp: 'application/vnd.oasis.opendocument.presentation',
    otp: 'application/vnd.oasis.opendocument.presentation-template',
  };
  return map[clean] || 'application/octet-stream';
}

/**
 * Extracts the lowercase file extension without the dot.
 */
export function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return '';
  return trimmed.slice(lastDot + 1).toLowerCase();
}

/**
 * Determines if a file extension belongs to the Office / OpenDocument / Text suite
 * and can be opened and edited in Google Workspace Editors (Docs, Sheets, Slides).
 */
export function getGoogleEditorKind(extensionOrFileName: string): GoogleEditorKind {
  const ext = extensionOrFileName.includes('.')
    ? getFileExtension(extensionOrFileName)
    : extensionOrFileName.toLowerCase().replace(/^\./, '');

  if (!ext) return null;
  if (GOOGLE_DOCS_EXTENSIONS.has(ext)) return 'docs';
  if (GOOGLE_SHEETS_EXTENSIONS.has(ext)) return 'sheets';
  if (GOOGLE_SLIDES_EXTENSIONS.has(ext)) return 'slides';
  return null;
}

/**
 * Human-readable label for the corresponding Google Editor.
 */
export function getGoogleEditorLabel(kind: GoogleEditorKind): string {
  if (kind === 'docs') return 'Google Docs';
  if (kind === 'sheets') return 'Google Sheets';
  if (kind === 'slides') return 'Google Slides';
  return 'No compatible con editor de Google';
}

/**
 * Formats byte size into KB or MB.
 */
export function formatBytes(bytes = 0): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Creates a folder in Google Drive inside an optional parent Drive folder.
 */
export async function createDriveFolder(
  folderName: string,
  parentDriveFolderId: string | null,
  accessToken: string
): Promise<string> {
  const metadata: Record<string, unknown> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentDriveFolderId) {
    metadata.parents = [parentDriveFolderId];
  }

  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al crear carpeta en Google Drive: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return data.id as string;
}

/**
 * Renames or moves a file/folder in Google Drive to mirror the web folder tree.
 */
export async function updateDriveItemLocationAndName(
  driveFileId: string,
  newName: string,
  newParentDriveFolderId: string | null,
  accessToken: string
): Promise<void> {
  let removeParentsParam = '';
  let addParentsParam = '';

  if (newParentDriveFolderId) {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=parents`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const currentParents: string[] = meta.parents || [];
      if (!currentParents.includes(newParentDriveFolderId)) {
        addParentsParam = `&addParents=${encodeURIComponent(newParentDriveFolderId)}`;
        if (currentParents.length > 0) {
          removeParentsParam = `&removeParents=${encodeURIComponent(currentParents.join(','))}`;
        }
      }
    }
  }

  const patchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,parents${addParentsParam}${removeParentsParam}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    }
  );

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    throw new Error(`No se pudo actualizar ubicación en Drive: ${patchRes.status} ${errText}`);
  }
}

/**
 * Deletes a file or folder from Google Drive.
 */
export async function deleteDriveItem(driveFileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Error al eliminar archivo de Google Drive: ${res.status} ${errText}`);
  }
}

function buildGoogleEditorUrl(id: string, editorKind: GoogleEditorKind, webViewLink?: string): string {
  if (editorKind === 'docs') return `https://docs.google.com/document/d/${id}/edit`;
  if (editorKind === 'sheets') return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  if (editorKind === 'slides') return `https://docs.google.com/presentation/d/${id}/edit`;
  return webViewLink || `https://drive.google.com/file/d/${id}/view`;
}

/**
 * Uploads any Office / OpenDocument / project file to Google Drive inside parentDriveFolderId.
 * Automatically handles:
 * 1. Converting binary Office files (.docx, .xlsx, .pptx, .ods, .odt, .csv, etc.) into Google Docs/Sheets/Slides
 * 2. Fallback to native Google Workspace file creation or direct Office Mode upload if the file has no binary payload
 *    or uses macro/template Office formats (.xlsm, .xlsb, .pptm, .docm).
 */
export async function uploadFileToGoogleDrive(
  fileName: string,
  fileBlob: Blob,
  parentDriveFolderId: string | null,
  accessToken: string,
  convertForGoogleEditor = true,
  hasRealBinaryData = true
): Promise<CreatedGoogleDocResult> {
  const ext = getFileExtension(fileName);
  const editorKind = getGoogleEditorKind(fileName);
  let targetGoogleMimeType: string | undefined;

  if (convertForGoogleEditor && editorKind) {
    if (editorKind === 'docs') targetGoogleMimeType = 'application/vnd.google-apps.document';
    if (editorKind === 'sheets') targetGoogleMimeType = 'application/vnd.google-apps.spreadsheet';
    if (editorKind === 'slides') targetGoogleMimeType = 'application/vnd.google-apps.presentation';
  }

  // Ensure the Blob has the proper Office MIME type so Google Drive's converter recognizes it
  const expectedOfficeMime = getOfficeMimeType(ext);
  let uploadBlob = fileBlob;

  if (!hasRealBinaryData && editorKind) {
    // Seed / text-only placeholder: give Drive a clean text/csv or text/plain payload so conversion never fails
    const textContent = await fileBlob.text();
    if (editorKind === 'sheets') {
      const csvText = textContent.includes(',') || textContent.includes('\n')
        ? textContent
        : `Columna 1,Columna 2\n"${textContent.replace(/"/g, '""')}",`;
      uploadBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
    } else if (editorKind === 'docs') {
      uploadBlob = new Blob([textContent || fileName], { type: 'text/plain;charset=utf-8' });
    }
  } else if (
    hasRealBinaryData &&
    (!fileBlob.type || fileBlob.type === 'application/octet-stream') &&
    expectedOfficeMime !== 'application/octet-stream'
  ) {
    uploadBlob = new Blob([fileBlob], { type: expectedOfficeMime });
  }

  // If it's a text-only seed presentation (.pptx without binary data), create a native Google Slides presentation
  if (!hasRealBinaryData && editorKind === 'slides') {
    const metadata: Record<string, unknown> = {
      name: fileName,
      mimeType: 'application/vnd.google-apps.presentation',
    };
    if (parentDriveFolderId) metadata.parents = [parentDriveFolderId];
    const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });
    if (res.ok) {
      const data = await res.json();
      const id = data.id as string;
      return {
        googleDocId: id,
        googleDocUrl: buildGoogleEditorUrl(id, 'slides', data.webViewLink),
      };
    }
  }

  // Try multipart upload with Google Editor conversion first
  const attemptMultipartUpload = async (mimeToSet?: string, blobToUpload: Blob = uploadBlob) => {
    const metadata: Record<string, unknown> = { name: fileName };
    if (mimeToSet) metadata.mimeType = mimeToSet;
    if (parentDriveFolderId) metadata.parents = [parentDriveFolderId];

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blobToUpload);

    return fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      }
    );
  };

  let res = await attemptMultipartUpload(targetGoogleMimeType, uploadBlob);

  // Fallback 1: If Google Drive rejected converting a specialized Office file (e.g. .xlsm, .xlsb, .docm, .pptm),
  // upload it as a native Office file in Drive — Google Docs/Sheets/Slides opens Office files directly in Office Editing mode!
  if (!res.ok && targetGoogleMimeType) {
    res = await attemptMultipartUpload(undefined, uploadBlob);
  }

  // Fallback 2: Create an empty Google Doc / Sheet / Slide in that folder so the user can always open & edit it
  if (!res.ok && targetGoogleMimeType) {
    const metadata: Record<string, unknown> = {
      name: fileName,
      mimeType: targetGoogleMimeType,
    };
    if (parentDriveFolderId) metadata.parents = [parentDriveFolderId];
    res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`No se pudo subir el archivo a Google Drive (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const id = data.id as string;

  return {
    googleDocId: id,
    googleDocUrl: buildGoogleEditorUrl(id, editorKind, data.webViewLink as string | undefined),
  };
}

/**
 * Exports a Google Workspace document (Docs/Sheets/Slides) as a binary Blob in its original or Office format
 * so when a user extracts a file or folder, they get the latest edits made in Google Docs/Sheets/Slides!
 */
export async function exportGoogleWorkspaceFileBlob(
  googleDocId: string,
  extension: string,
  accessToken: string
): Promise<Blob | null> {
  const ext = extension.toLowerCase();
  const editorKind = getGoogleEditorKind(ext);
  let exportMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (ext === 'txt' || ext === 'md') {
    exportMime = 'text/plain';
  } else if (ext === 'odt') {
    exportMime = 'application/vnd.oasis.opendocument.text';
  } else if (ext === 'rtf') {
    exportMime = 'application/rtf';
  } else if (ext === 'pdf') {
    exportMime = 'application/pdf';
  } else if (ext === 'csv') {
    exportMime = 'text/csv';
  } else if (ext === 'tsv' || ext === 'tab') {
    exportMime = 'text/tab-separated-values';
  } else if (ext === 'ods') {
    exportMime = 'application/vnd.oasis.opendocument.spreadsheet';
  } else if (editorKind === 'sheets') {
    exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (ext === 'odp') {
    exportMime = 'application/vnd.oasis.opendocument.presentation';
  } else if (editorKind === 'slides') {
    exportMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${googleDocId}/export?mimeType=${encodeURIComponent(exportMime)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (res.ok) {
    return await res.blob();
  }

  // If the file in Drive was stored in native Office mode rather than converted, download via alt=media
  const mediaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${googleDocId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (mediaRes.ok) {
    return await mediaRes.blob();
  }

  return null;
}

/**
 * Extracts a Google Doc/Drive ID from a full URL or raw ID.
 */
export function parseGoogleDocId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/(?:document|spreadsheets|presentation|file)\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}
