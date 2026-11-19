import { GoogleGenAI, ThinkingLevel } from '@google/genai';

interface ProjectContextPayload {
  name?: string;
  subject?: string;
  description?: string;
  authorizedUsernames?: string[];
  dueDate?: string;
  foldersSummary?: string;
  documentsSummary?: string;
  tasksSummary?: string;
  noticesSummary?: string;
}

interface HistoryItem {
  role: string;
  text: string;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido. Usa POST.' });
    return;
  }

  try {
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};

    const { question, projectContext, history } = body as {
      question?: string;
      projectContext?: ProjectContextPayload;
      history?: HistoryItem[];
    };

    if (!question || typeof question !== 'string' || !question.trim()) {
      res
        .status(400)
        .json({ error: 'Debes escribir una pregunta para el asistente del proyecto.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({
        error:
          'Falta la variable GEMINI_API_KEY en Vercel. Ve a Vercel ➔ tu proyecto ➔ Settings ➔ Environment Variables, añade GEMINI_API_KEY con tu clave gratuita de aistudio.google.com/apikey y pulsa Redeploy.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const systemInstruction = `Eres el Asistente IA Oficial de Proyectos Nebrija App (ChikiHub) asignado EXCLUSIVAMENTE al siguiente proyecto de informática:

=== CONTEXTO DEL PROYECTO ACTIVO ===
- Nombre del Proyecto: ${projectContext?.name || 'Proyecto de Informática'}
- Asignatura / Módulo: ${projectContext?.subject || 'Informática'}
- Descripción: ${projectContext?.description || 'Sin descripción'}
- Integrantes / Usuarios autorizados del grupo: ${(projectContext?.authorizedUsernames || []).join(', ') || 'Sin integrantes registrados'}
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
1. SOLO puedes responder preguntas relacionadas con ESTE proyecto de informática, sus integrantes, sus archivos, sus carpetas, sus tareas, sus anuncios o conceptos técnicos de informática que ayuden directamente a completar este trabajo.
2. Si el usuario te pregunta por recetas de cocina (como la receta de lentejas, tortilla, etc.), deportes, chistes, videojuegos, famosos o cualquier tema que NO tenga relación con el proyecto "${projectContext?.name || 'actual'}", DEBES RECHAZAR la consulta educadamente en una o dos frases diciendo que eres la IA exclusiva del proyecto "${projectContext?.name || 'actual'}" en Proyectos Nebrija App y solo ayudas con el trabajo del grupo.
3. Responde siempre en español claro, directo, bien estructurado y útil para estudiantes universitarios.`;

    const conversationText = Array.isArray(history)
      ? history
          .slice(-6)
          .map(
            (m) => `${m.role === 'user' ? 'Estudiante' : 'IA'}: ${m.text}`
          )
          .join('\n')
      : '';

    const fullPrompt = conversationText
      ? `Historial reciente:\n${conversationText}\n\nNueva consulta del estudiante: ${question}`
      : question;

    const candidateModels = [
      { name: 'gemini-4-hydrogen', useLowThinking: true },
      { name: 'gemini-3.1-flash-lite', useLowThinking: false },
      { name: 'gemini-2.5-flash', useLowThinking: false },
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
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    if (!answer) {
      const detail =
        lastError instanceof Error ? lastError.message : String(lastError || '');
      if (detail.includes('API_KEY_INVALID') || detail.includes('403') || detail.includes('PERMISSION_DENIED')) {
        res.status(401).json({
          error:
            'Tu GEMINI_API_KEY en Vercel no es válida o no tiene permisos. Genera una nueva clave gratuita en aistudio.google.com/apikey, actualízala en Vercel ➔ Environment Variables y haz Redeploy.',
        });
        return;
      }
      if (detail.includes('429') || detail.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Se ha alcanzado el límite temporal de peticiones gratuitas de Gemini. Espera 30 segundos y vuelve a intentarlo.',
        });
        return;
      }
      throw lastError || new Error('El servicio de IA no devolvió respuesta.');
    }

    res.status(200).json({ answer });
  } catch (error: unknown) {
    console.error('Vercel /api/ai/project-chat error:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: `Error al consultar la IA del proyecto: ${message}`,
    });
  }
}
