import { GoogleGenAI, ThinkingLevel } from '@google/genai';

interface ProjectContextPayload {
  name?: string;
  subject?: string;
  description?: string;
  authorizedUsernames?: string[];
  dueDate?: string;
  statsSummary?: string;
  foldersSummary?: string;
  documentsSummary?: string;
  tasksSummary?: string;
  noticesSummary?: string;
}

interface HistoryItem {
  role: string;
  text: string;
}

interface AttachmentPayload {
  name: string;
  mimeType: string;
  dataBase64?: string;
  textContent?: string;
  sizeBytes?: number;
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

    const { question, projectContext, history, attachments, visualMode } = body as {
      question?: string;
      projectContext?: ProjectContextPayload;
      history?: HistoryItem[];
      attachments?: AttachmentPayload[];
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

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({
        error:
          'Falta la variable GEMINI_API_KEY en Vercel. Ve a Vercel -> tu proyecto -> Settings -> Environment Variables, añade GEMINI_API_KEY con tu clave y pulsa Redeploy.',
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
1. SOLO puedes responder preguntas relacionadas con ESTE proyecto de informática, sus integrantes, sus archivos, sus archivos adjuntados por el estudiante, sus carpetas, sus tareas, sus estadísticas, sus anuncios o conceptos técnicos / diagramas / gráficos que ayuden directamente a completar este trabajo.
2. Si el usuario te pregunta por recetas de cocina (como la receta de lentejas, tortilla, etc.), deportes, chistes, videojuegos o temas totalmente ajenos al proyecto "${projectContext?.name || 'actual'}", rechaza educadamente en 1 o 2 frases diciendo que eres la IA exclusiva del proyecto "${projectContext?.name || 'actual'}" en Proyectos Nebrija App.
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
          .map((m) => `${m.role === 'user' ? 'Estudiante' : 'IA'}: ${m.text.slice(0, 1200)}`)
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
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    if (!answer) {
      const detail =
        lastError instanceof Error ? lastError.message : String(lastError || '');
      if (detail.includes('API_KEY_INVALID') || detail.includes('403') || detail.includes('PERMISSION_DENIED')) {
        res.status(401).json({
          error:
            'Tu GEMINI_API_KEY no es válida o no tiene permisos. Revisa la configuración en Settings > Secrets o en Vercel Environment Variables.',
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
