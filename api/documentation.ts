import fs from 'fs';
import path from 'path';

export default function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const docsPath = path.resolve(process.cwd(), 'DOCUMENTACION_Y_VERCEL.md');
    if (fs.existsSync(docsPath)) {
      const content = fs.readFileSync(docsPath, 'utf-8');
      res.status(200).json({ content });
      return;
    }
    res.status(200).json({
      content:
        '# Documentación de Proyectos Nebrija App\n\nConsulta el archivo `DOCUMENTACION_Y_VERCEL.md` en tu repositorio de GitHub para ver la guía completa de Vercel y Google OAuth.',
    });
  } catch {
    res.status(200).json({
      content:
        '# Documentación de Proyectos Nebrija App\n\nConsulta el archivo `DOCUMENTACION_Y_VERCEL.md` en tu repositorio de GitHub.',
    });
  }
}
