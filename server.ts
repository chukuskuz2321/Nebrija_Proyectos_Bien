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

// POST /api/ai/project-chat — Strictly scoped Multimodal Gemini Project Assistant
app.post('/api/ai/project-chat', async (req, res) => {
  try {
    const { question, projectContext, history, attachments, visualMode } = req.body as {
      question?: string;
      projectContext?: Record<string, any>;
      history?: Array<{ role: string; text: string }>;
      attachments?: Array<{
        name: string;
        mimeType: string;
        dataBase64?: string;
        textContent?: string;
        sizeBytes?: number;
      }>;
      visualMode?: boolean;
    };

    const cleanQuestion = typeof question === 'string' ? question.trim() : '';
    const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 4) : [];

    if (!cleanQuestion && safeAttachments.length === 0) {
      res
        .status(400)
        .json({ error: 'Debes escribir una pregunta o adjuntar un archivo para el asistente del proyecto.' });
      return;
    }

    const ai = getGeminiClient();

    const systemInstruction = `Eres el Asistente IA Oficial de Proyectos Nebrija App (ChikiHub) asignado EXCLUSIVAMENTE al siguiente proyecto de informática:

=== CONTEXTO DEL PROYECTO ACTIVO ===
- Nombre del Proyecto: ${projectContext?.name || 'Proyecto de Informática'}
- Asignatura / Módulo: ${projectContext?.subject || 'Informática'}
- Descripción: ${projectContext?.description || 'Sin descripción'}
- Usuarios autorizados del grupo: ${(projectContext?.authorizedUsernames || []).join(', ') || 'Sin integrantes'}
- Fecha de entrega: ${projectContext?.dueDate || 'Pendiente'}

- Métricas y Estadísticas Reales del Proyecto:
${projectContext?.statsSummary || 'Sin estadísticas calculadas'}

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
1. SOLO puedes responder preguntas relacionadas con ESTE proyecto de informática, sus archivos, sus archivos adjuntados por el estudiante, sus carpetas, sus tareas, sus estadísticas, sus anuncios o conceptos técnicos / diagramas / gráficos que ayuden directamente a completar este trabajo.
2. Si el usuario te pregunta por recetas de cocina (como lentejas, tortilla, etc.), deportes, chistes, videojuegos o temas totalmente ajenos al proyecto "${projectContext?.name || 'actual'}", rechaza educadamente en 1 o 2 frases diciendo que eres la IA exclusiva del proyecto "${projectContext?.name || 'actual'}".
3. Responde siempre en español claro, directo, visualmente impecable y útil para estudiantes universitarios.

GUÍA DE DISEÑO VISUAL Y ESTILO DE RESPUESTA (MUY IMPORTANTE):
1. PROHIBIDO USAR EMOJIS de ningún tipo (la interfaz añade sus propios iconos SVG automáticamente).
2. Usa títulos limpios con Markdown (## y ###), negritas (**texto**), listas ordenadas o con viñetas, citas (> Nota: ...) y tablas Markdown reales (| Col 1 | Col 2 |) siempre que compares archivos, tareas, roles o datos.
3. Usa etiquetas de color para dar claridad visual a estados, cifras y conceptos clave:
   - {verde:texto} para completado, correcto o positivo
   - {azul:texto} para datos clave, títulos o secciones
   - {ambar:texto} para en progreso, avisos o atención
   - {rojo:texto} para urgente, bloqueado o errores
   - {cian:texto} para valores técnicos, extensiones o métricas
   - {morado:texto} para conceptos teóricos o destacados
4. WIDGETS VISUALES INTERACTIVOS EN LA RESPUESTA:
   Cuando el usuario pida estadísticas, resúmenes visuales, progreso, estructura de carpetas/archivos, comparativas o planificación (o cuando mejore mucho la respuesta), incluye uno o más bloques \`\`\`widget con JSON válido estricto (sin comentarios ni comas sobrantes):
   - Tarjetas KPI:
     \`\`\`widget
     {"type":"stats","title":"Resumen del Proyecto","items":[{"label":"Progreso","value":"75%","sublabel":"6 de 8 tareas","color":"emerald"},{"label":"Archivos","value":12,"sublabel":"4.2 MB usados","color":"blue"}]}
     \`\`\`
   - Gráfica de barras:
     \`\`\`widget
     {"type":"bar_chart","title":"Aportación por Compañero","subtitle":"Tareas + Archivos","items":[{"label":"@usuario1","value":7,"color":"blue"},{"label":"@usuario2","value":5,"color":"cyan"}]}
     \`\`\`
   - Barras de progreso:
     \`\`\`widget
     {"type":"progress_list","title":"Estado por Bloque","items":[{"label":"Documentación","percent":80,"detail":"4 de 5 archivos listos","color":"emerald"}]}
     \`\`\`
   - Árbol visual de carpetas y archivos:
     \`\`\`widget
     {"type":"tree","title":"Estructura del Proyecto","nodes":[{"name":"01_Documentos","type":"folder","children":[{"name":"Memoria.docx","type":"file","meta":"@usuario"}]}]}
     \`\`\`
   - Hoja de ruta / Timeline:
     \`\`\`widget
     {"type":"timeline","title":"Plan de Entrega","items":[{"title":"Entrega borrador","date":"25 Nov","owner":"@usuario","status":"done","detail":"Subido a la carpeta 01"}]}
     \`\`\`
5. GENERACIÓN DE IMÁGENES / GRÁFICOS / DIAGRAMAS VECTORIALES DESCARGABLES (PNG y SVG):
   Si el usuario pide crear una imagen, ilustración, diagrama, esquema visual, arquitectura, mapa conceptual, portada, wireframe o logotipo (o si el modo visual está activado), genera un SVG autocontenido, estético y muy bien maquetado dentro de un bloque:
   \`\`\`svg-visual title="Título descriptivo del gráfico"
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 500" width="880" height="500">
     ...
   </svg>
   \`\`\`
   Reglas para el SVG:
   - Fondo oscuro elegante (#0B0B11) con paneles (#13131D) y bordes (#2B2B3A), paleta moderna (#3B82F6, #60A5FA, #34D399, #FBBF24, #C084FC, #22D3EE, #F4F4F6).
   - Tipografía legible usando font-family="system-ui, -apple-system, sans-serif", tamaños >= 13px y texto sin solapamientos ni cortes fuera del viewBox.
   - Usa gradientes sutiles, flechas bien alineadas, formas geométricas nítidas y composición profesional. No incluyas <script> ni imágenes externas.`;

    const conversationText = Array.isArray(history)
      ? history
          .slice(-6)
          .map(
            (m: { role: string; text: string }) =>
              `${m.role === 'user' ? 'Estudiante' : 'IA'}: ${m.text.slice(0, 1200)}`
          )
          .join('\n')
      : '';

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    const effectiveQuestion =
      cleanQuestion ||
      'Analiza los archivos adjuntados en detalle, resume los puntos clave con formato visual y relaciónalos con nuestro proyecto.';

    const visualHint = visualMode
      ? '\n\n[MODO GRÁFICO VISUAL ACTIVADO: Genera obligatoriamente un gráfico/diagrama visual descargable en un bloque ```svg-visual title="..."``` además de una breve explicación estilizada.]'
      : '';

    const promptBody = conversationText
      ? `Historial reciente:\n${conversationText}\n\nNueva consulta del estudiante: ${effectiveQuestion}${visualHint}`
      : `${effectiveQuestion}${visualHint}`;

    parts.push({ text: promptBody });

    // Attach uploaded images/PDFs as multimodal inlineData and text/code files as text parts
    for (const att of safeAttachments) {
      if (!att || !att.name) continue;
      if (att.dataBase64 && att.mimeType) {
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.dataBase64,
          },
        });
        parts.push({
          text: `[Archivo adjunto multimedia: ${att.name} (${att.mimeType})]`,
        });
      } else if (att.textContent) {
        parts.push({
          text: `=== CONTENIDO DEL ARCHIVO ADJUNTADO: ${att.name} ===\n${att.textContent.slice(0, 24000)}\n=== FIN DE ${att.name} ===`,
        });
      }
    }

    const candidateModels = [
      { name: 'gemini-4-hydrogen', useLowThinking: true },
      { name: 'gemini-3.1-flash-lite', useLowThinking: false },
    ];

    let answer = '';
    let lastError: unknown = null;

    for (const candidate of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.name,
          contents: { parts },
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
        await new Promise((r) => setTimeout(r, 400));
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
