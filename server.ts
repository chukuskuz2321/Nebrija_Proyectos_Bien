import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On Vercel Serverless, /var/task is read-only; /tmp is writable
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? path.join(os.tmpdir(), 'chikihub-data') : path.resolve(__dirname, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'chikihub-workspace.json');
const SEED_DATA_FILE = path.resolve(__dirname, 'data', 'chikihub-workspace.json');
const DOCS_MD_FILE = path.resolve(__dirname, 'DOCUMENTACION_Y_VERCEL.md');

// Initialize shared Server-Side Gemini Client with required User-Agent header
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Falta GEMINI_API_KEY en el servidor. Configúrala en Environment Variables (Vercel) o en Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

export const INITIAL_WORKSPACE = {
  users: [
    {
      id: 'usr_chiki',
      username: 'chiki',
      displayName: 'Chiki (Creador)',
      passwordHash: '1234',
      role: 'Coordinador del Grupo',
      createdAt: '2026-11-10T09:00:00.000Z',
    },
  ],
  projects: [],
  folders: [],
  documents: [],
  tasks: [],
  notices: [],
  snippets: [],
  messages: [],
  activities: [],
};

// In-memory fallback store in case filesystem is read-only
let memoryWorkspaceStore: any = null;

function normalizeWorkspaceDocuments(store: any) {
  if (!store || !Array.isArray(store.documents)) return store;
  store.documents = store.documents.map((doc: any) => {
    let title: string = doc.title || 'Archivo.docx';
    let ext: string = doc.extension || '';
    if (!ext) {
      const dotIdx = title.lastIndexOf('.');
      if (dotIdx > 0 && dotIdx < title.length - 1) {
        ext = title.slice(dotIdx + 1).toLowerCase();
      } else {
        ext = 'docx';
        title = `${title.replace(/\s+/g, '_')}.docx`;
      }
    }
    const sizeBytes =
      typeof doc.sizeBytes === 'number' && doc.sizeBytes > 0
        ? doc.sizeBytes
        : Math.max(12400, (doc.content?.length || 120) * 64);

    return {
      ...doc,
      title,
      extension: ext,
      sizeBytes,
    };
  });
  return store;
}

function readWorkspaceStore() {
  if (memoryWorkspaceStore) {
    return memoryWorkspaceStore;
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = normalizeWorkspaceDocuments(JSON.parse(raw));
      memoryWorkspaceStore = parsed;
      return parsed;
    }
    if (fs.existsSync(SEED_DATA_FILE)) {
      const raw = fs.readFileSync(SEED_DATA_FILE, 'utf-8');
      const parsed = normalizeWorkspaceDocuments(JSON.parse(raw));
      memoryWorkspaceStore = parsed;
      return parsed;
    }
    writeWorkspaceStore(INITIAL_WORKSPACE);
    return INITIAL_WORKSPACE;
  } catch (err) {
    console.warn('Using in-memory workspace fallback:', err);
    memoryWorkspaceStore = INITIAL_WORKSPACE;
    return INITIAL_WORKSPACE;
  }
}

function writeWorkspaceStore(data: unknown) {
  memoryWorkspaceStore = data;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Filesystem write skipped (kept in memory):', err);
  }
}

export const app = express();
app.use(express.json({ limit: '50mb' }));

// GET /api/workspace — Returns the synchronized workspace state
app.get('/api/workspace', (_req, res) => {
  const store = readWorkspaceStore();
  res.json(store);
});

// POST /api/workspace/save — Persists updated workspace state across laptops
app.post('/api/workspace/save', (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    res.status(400).json({ error: 'Datos de workspace inválidos' });
    return;
  }
  writeWorkspaceStore(incoming);
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

// POST /api/workspace/clean — Leaves the database clean for production ("limpio para subir")
app.post('/api/workspace/clean', (_req, res) => {
  const cleanState = {
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
  writeWorkspaceStore(cleanState);
  res.json({ ok: true, workspace: cleanState });
});

// GET /api/documentation — Returns the markdown content of DOCUMENTACION_Y_VERCEL.md
app.get('/api/documentation', (_req, res) => {
  try {
    if (fs.existsSync(DOCS_MD_FILE)) {
      const content = fs.readFileSync(DOCS_MD_FILE, 'utf-8');
      res.json({ content });
    } else {
      res.json({ content: '# Documentación no encontrada' });
    }
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer DOCUMENTACION_Y_VERCEL.md' });
  }
});

// POST /api/ai/project-chat — Strictly scoped Gemini Project Assistant
app.post('/api/ai/project-chat', async (req, res) => {
  try {
    const { question, projectContext, history } = req.body;

    if (!question || typeof question !== 'string') {
      res
        .status(400)
        .json({ error: 'Debes escribir una pregunta para el asistente del proyecto.' });
      return;
    }

    const ai = getGeminiClient();

    const systemInstruction = `Eres el Asistente IA Oficial de ChikiHub asignado EXCLUSIVAMENTE al siguiente proyecto de informática de instituto:

=== CONTEXTO DEL PROYECTO ACTIVO ===
- Nombre del Proyecto: ${projectContext?.name || 'Proyecto de Informática'}
- Asignatura / Módulo: ${projectContext?.subject || 'Informática'}
- Descripción: ${projectContext?.description || ''}
- Usuarios autorizados del grupo: ${(projectContext?.authorizedUsernames || []).join(', ')}
- Fecha de entrega: ${projectContext?.dueDate || 'Pendiente'}

- Estructura de Carpetas del Proyecto:
${projectContext?.foldersSummary || 'Sin carpetas'}

- Archivos Subidos al Proyecto (con sus extensiones):
${projectContext?.documentsSummary || 'Sin archivos'}

- Tareas del Grupo (Pendientes, En Progreso y Completadas):
${projectContext?.tasksSummary || 'Sin tareas'}

- Tablón de Anuncios Activos:
${projectContext?.noticesSummary || 'Sin anuncios'}
====================================

REGLA ESTRICTA E INQUEBRANTABLE DE ALCANCE:
1. SOLO puedes responder preguntas relacionadas con ESTE proyecto de informática, sus archivos, sus carpetas, sus tareas, sus anuncios o conceptos técnicos de informática que ayuden directamente a completar este trabajo.
2. Si el usuario te pregunta por recetas de cocina (como la receta de lentejas, tortilla, etc.), deportes, chistes, videojuegos, famosos o cualquier tema que NO tenga relación con el proyecto "${projectContext?.name || 'actual'}", DEBES RECHAZAR la consulta educadamente en una o dos frases diciendo que eres la IA exclusiva del proyecto "${projectContext?.name || 'actual'}" en ChikiHub y solo ayudas con el trabajo de informática del grupo.
3. Responde siempre en español claro, directo, bien estructurado y útil para estudiantes de informática.`;

    const conversationText = Array.isArray(history)
      ? history
          .slice(-6)
          .map(
            (m: { role: string; text: string }) =>
              `${m.role === 'user' ? 'Estudiante' : 'IA'}: ${m.text}`
          )
          .join('\n')
      : '';

    const fullPrompt = conversationText
      ? `Historial reciente:\n${conversationText}\n\nNueva consulta del estudiante: ${question}`
      : question;

    const candidateModels = [
      { name: 'gemini-3.1-flash-lite', useLowThinking: false },
      { name: 'gemini-4-hydrogen', useLowThinking: true },
      { name: 'gemini-3.1-flash-lite', useLowThinking: false },
    ];

    let answer = '';
    let lastError: unknown = null;

    for (const candidate of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.name,
          contents: fullPrompt,
          config: candidate.useLowThinking
            ? {
                systemInstruction,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              }
            : {
                systemInstruction,
              },
        });
        if (response.text) {
          answer = response.text;
          break;
        }
      } catch (err) {
        lastError = err;
        await new Promise((r) => setTimeout(r, 450));
      }
    }

    if (!answer) {
      throw lastError || new Error('El servicio de IA está ocupado en este instante.');
    }

    res.json({ answer });
  } catch (error: any) {
    console.error('Gemini API error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: `Error al consultar la IA del proyecto: ${message}`,
    });
  }
});

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ChikiHub server running on http://0.0.0.0:${PORT}`);
  });
}

// Start the server only when not running inside Vercel Serverless
if (!process.env.VERCEL) {
  startServer();
}

export default app;
