# Documentación Completa de ChikiHub y Guía de Despliegue 100% Gratis en Vercel

> **Creado por Chiki** — Plataforma colaborativa de proyectos de informática con sincronización con **Google Docs, Sheets, Slides y Google Drive**, subida y extracción de carpetas completas en `.ZIP`, gestión de tareas, tablón de anuncios e **IA exclusiva por proyecto**.

---

## IDENTIFICACIÓN DE TU PROYECTO EN FIREBASE (SEGÚN TU CAPTURA)

En tu panel de [Firebase Console](https://console.firebase.google.com/), tienes 3 proyectos:
1. `lucid-truth-hs7sz` *(Otro proyecto antiguo)*
2. **`My First Project` (`nice-champion-472412-v5`)** ⬅️ **ESTE ES EL PROYECTO DE CHIKIHUB**
3. `talleres-calypo` *(Tu web del colegio Calypo)*

### Cómo cambiarle el nombre «My First Project» por «ChikiHub Informática» para no confundirlo nunca:
1. Haz clic directamente en **`My First Project` (`nice-champion-472412-v5`)** o abre este enlace directo:
   - [Abrir Configuración de ChikiHub en Firebase (`nice-champion-472412-v5`)](https://console.firebase.google.com/project/nice-champion-472412-v5/settings/general)
2. En la pestaña **General** (arriba del todo, donde pone **Nombre del proyecto**: `My First Project`), haz clic en el icono del lápiz para editarlo.
3. Escribe **`ChikiHub Proyectos Informática`** y dale a **Guardar**.
4. ¡Listo! A partir de ese momento en tu lista de Firebase aparecerá como **ChikiHub Proyectos Informática** (`nice-champion-472412-v5`).

**Datos técnicos exactos de este proyecto:**
- **ID del Proyecto (Project ID)**: `nice-champion-472412-v5`
- **ID de la Base de Datos Firestore**: `ai-studio-9b3c9650-a1bc-4d40-8dab-5dff7d20cec2`
- **Dominio de Auth**: `nice-champion-472412-v5.firebaseapp.com`

---

## Parte 1: Manual de Uso de la Web (Paso a Paso)

### 1. Cartas de Bienvenida («Creado por Chiki») e Inicio de Sesión Obligatorio
- La primera vez que cualquier compañero abre la web en su portátil o móvil, aparecen las **3 cartas animadas de bienvenida de Chiki**.
- Al mantener pulsado el botón circular verde de la última carta, la web lleva **obligatoriamente** a la pantalla de **Iniciar Sesión / Crear Cuenta**.
- Nadie puede entrar a ver ni tocar los proyectos sin haber iniciado sesión antes con su `nombre de usuario` y `contraseña`.

### 2. Protección de Proyectos y Usuarios Autorizados (Anti-Copia)
- En la barra lateral izquierda puedes tener hasta **5 proyectos activos gratis** (`Proyectos: X/5`).
- Cada proyecto tiene:
  - **Lista de Usuarios Autorizados** (ej. `chiki, alex, lucia, marcos`): entran directamente al proyecto sin tener que escribir la contraseña.
  - **Contraseña del Proyecto**: si alguien que no está en la lista intenta entrar al proyecto, se le bloquea el paso pidiéndole la contraseña.

### 3. Subir y Extraer Archivos y Carpetas + Apertura en Google Docs / Sheets / Slides
- **Subir Archivos y Subir Carpeta**: Puedes subir cualquier archivo suelto o una carpeta entera de tu ordenador (respetando todas sus subcarpetas y archivos internos).
- **Extensión visible y compatibilidad con el Paquete Office**:
  - Cada archivo muestra su etiqueta de extensión (`.DOCX`, `.XLSX`, `.PPTX`, `.ODT`, `.ODS`, `.CSV`, `.PKT`, `.PDF`, `.ZIP`).
  - Si el archivo pertenece al **Paquete Office / OpenDocument / Texto** (Word, Excel, PowerPoint, CSV, TXT), aparece el botón **«Abrir en Google Docs / Google Sheets / Google Slides»** para editarlo todos a la vez en tiempo real.
  - Si el archivo tiene una extensión que **no se abre con ningún editor de Google** (como `.PKT` de Packet Tracer, `.ZIP`, `.ISO`, `.PDF`), la web indica que no tiene editor de Google y permite extraerlo directamente.
- **Extraer Archivos y Carpetas (`.ZIP`)**:
  - Pulsa **«Extraer»** en cualquier archivo para descargarlo con su extensión original (o con los últimos cambios hechos en Google Docs/Sheets/Slides).
  - Pulsa **`.ZIP`** en cualquier carpeta o **«Extraer Carpeta Actual (.ZIP)»** arriba para descargar toda la carpeta con sus subcarpetas comprimida en un archivo `.zip`.

### 4. Cuota de Almacenamiento 100% Gratis
- La barra lateral izquierda incluye el medidor **Cuota Gratis Proyecto (`Máx. 50 MB / proy.`)**.
- Con un máximo de 5 proyectos activos (`250 MB` en total), la web se mantiene siempre muy por debajo del límite gratuito de **1 GB de Firebase Firestore** y **15 GB de Google Drive** para que sea **100% gratis siempre**.

### 5. Tareas del Grupo, Tablón de Anuncios e IA Exclusiva del Proyecto
- **Cabecera con Fecha de Entrega y Progreso**: Arriba del todo se muestra en grande la **FECHA DE ENTREGA** (con cuenta atrás en días) y el **ESTADO DE TAREAS** completadas.
- **Tareas**: Filtra por estado (`Pendientes`, `En Progreso`, `Completadas`) o por compañero responsable.
- **Tablón de Anuncios**: Publica avisos con prioridad (*Normal*, *Importante*, *Urgente*), fecha de publicación y opción de **Archivar** anuncios antiguos.
- **IA del Proyecto y Chat**: La IA conoce las carpetas, archivos, tareas y avisos del proyecto activo, y rechaza preguntas ajenas al trabajo (como recetas de cocina).

---

## Parte 2: Cómo Subir la Web a `vercel.app` y Base de Datos 100% GRATIS

### Paso 1: Dejar la web limpia antes de subir (Opcional)
- Cuando hayas terminado de probar los datos de ejemplo y quieras subirla vacía a Vercel, escribe en el chat de AI Studio **`limpio para subir`** para borrar todos los proyectos y usuarios de prueba.

### Paso 2: Subir el código a GitHub (Gratis)
1. Crea un repositorio en [github.com](https://github.com) llamado **`chikihub-proyectos-informatica`**.
2. Descarga o exporta el código de AI Studio y súbelo a ese repositorio.

### Paso 3: Autorizar tu dominio de Vercel en Firebase (`nice-champion-472412-v5`)
1. Entra en tu proyecto de Firebase **`My First Project` (`nice-champion-472412-v5`)**:
   - [Abrir Authentication > Settings > Authorized domains](https://console.firebase.google.com/project/nice-champion-472412-v5/authentication/settings)
2. En **Dominios autorizados (Authorized domains)**, pulsa **Añadir dominio** y escribe el dominio que te dé Vercel (por ejemplo `chikihub-proyectos-informatica.vercel.app`).
3. Para que cualquier compañero del grupo pueda conectar su cuenta Gmail sin que le salga el aviso `Error 403: access_denied`, abre:
   - [Google Cloud Console > OAuth Consent Screen (Audience) de `nice-champion-472412-v5`](https://console.cloud.google.com/apis/credentials/consent?project=nice-champion-472412-v5)
   - Pulsa **«PUBLICAR APLICACIÓN» (Publish App)** (es 100% gratis) o añade los correos Gmail de tus compañeros en **«Usuarios de prueba» (Test users)**.

### Paso 4: Desplegar en Vercel (`vercel.app`) en 2 minutos
1. Entra en [vercel.com](https://vercel.com) con tu cuenta de GitHub y pulsa **Add New... ➔ Project**.
2. Importa tu repositorio **`chikihub-proyectos-informatica`**.
3. En **Environment Variables** (Variables de entorno), añade:
   - Nombre: `GEMINI_API_KEY`
   - Valor: Tu clave gratuita de [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. Pulsa **Deploy**. El archivo `vercel.json` incluido configurará automáticamente el frontend de Vite y las rutas `/api/*`.
