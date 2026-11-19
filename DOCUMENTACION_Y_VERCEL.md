# Documentación Completa de Proyectos Nebrija App (ChikiHub) y Guía de Despliegue 100% Gratis en Vercel

> **Proyectos Nebrija App (ChikiHub)** — Plataforma colaborativa de proyectos universitarios de informática con enlace directo a **Google Docs, Sheets, Slides y Google Drive**, subida y extracción de carpetas completas en `.ZIP`, gestión de tareas, tablón de anuncios e **IA exclusiva por proyecto**.

---

## DATOS TÉCNICOS EXACTOS DE TU DESPLIEGUE

- **URL de producción en Vercel**: `https://nebrija-proyectos-bien.vercel.app`
- **Política de Privacidad pública**: `https://nebrija-proyectos-bien.vercel.app/privacidad`
- **Términos de Servicio públicos**: `https://nebrija-proyectos-bien.vercel.app/terminos`
- **Nombre de la App en Google Cloud (OAuth)**: `Proyectos Nebrija App`
- **ID del Proyecto Firebase / Google Cloud**: `nice-champion-472412-v5`
- **ID de la Base de Datos Firestore**: `ai-studio-9b3c9650-a1bc-4d40-8dab-5dff7d20cec2`
- **Dominio de Auth**: `nice-champion-472412-v5.firebaseapp.com`

---

## Parte 1: Manual de Uso de la Web (Resumen Rápido)

### 1. Página Principal Pública, Tour Interactivo (6 Tarjetas) y Registro Propio
- La portada principal (`/`) es 100% pública (requisito obligatorio de Google OAuth), presenta las funciones de **Proyectos Nebrija App**, el uso transparente de Google Drive y enlaces directos a `/privacidad` y `/terminos`.
- Incluye acceso al **Tour Interactivo de 6 Tarjetas** desde la barra superior y desde la portada.
- **Sin cuentas de prueba**: cada alumno debe crear su propia cuenta (`nombre de usuario` + `contraseña`) y después vincular su cuenta de Google para abrir o subir documentos con Google Drive.

### 2. Protección de Proyectos y Usuarios Autorizados (Anti-Copia)
- Hasta **5 proyectos activos gratis** (`Máx. 50 MB / proyecto`) para mantenerse siempre en el plan gratuito de Firebase Firestore.
- Cada proyecto tiene su **Lista de Usuarios Autorizados** y una **Contraseña del Proyecto** para bloquear el acceso a personas ajenas al grupo.

### 3. Archivos, Carpetas `.ZIP` y Creación de Documentos mediante Enlace de Google Docs
- **Crear Archivo (Google)**: dentro de la pestaña `02 · Archivos y Carpetas`, puedes crear un archivo pegando el **enlace de compartir** de Google Docs, Sheets o Slides (`docs.google.com/...`). Al hacer clic, cualquier compañero abre directamente ese documento compartido.
- **Subir Archivos / Subir Carpeta y Extraer `.ZIP`**: admite archivos sueltos y carpetas completas con subcarpetas, respetando su estructura al extraer en `.ZIP`.
- **Aviso automático de Google Sign-In**: la primera vez que entra un usuario (o si intenta una acción que requiere Google Drive sin haber vinculado Google), aparece una tarjeta guiándole para conectar su cuenta de Google en un clic.

---

## Parte 2: Despliegue en Vercel y Sincronización con GitHub

### Paso 1: Sincronización AI Studio ➔ GitHub ➔ Vercel
1. Cuando haces cambios en AI Studio, pulsa **Guardar / Sync en GitHub** (icono de GitHub en AI Studio) para subir el commit a tu repositorio conectado.
2. En cuanto GitHub recibe el commit, **Vercel detecta el cambio automáticamente y hace el redeploy solo** en ~40 segundos (no hace falta crear un proyecto nuevo ni reconfigurar nada).

### Paso 2: Variables de Entorno en Vercel
En tu proyecto de [vercel.com](https://vercel.com) ➔ **Settings** ➔ **Environment Variables**, asegúrate de tener:
- `GEMINI_API_KEY`: tu clave gratuita de [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

### Paso 3: Autorizar tu dominio de Vercel en Firebase (`nice-champion-472412-v5`)
1. Abre [Firebase Console ➔ Authentication ➔ Settings ➔ Authorized domains](https://console.firebase.google.com/project/nice-champion-472412-v5/authentication/settings).
2. En **Dominios autorizados**, comprueba que esté añadido exactamente:
   - `nebrija-proyectos-bien.vercel.app`

---

## Parte 3 (NUEVO): Paso a Paso para que Google apruebe la Verificación de Marca (OAuth)

Si Google Cloud te mostró la pantalla **«Problemas con la verificación de la marca»** con los 4 avisos sobre `https://nebrija-proyectos-bien.vercel.app`, aquí tienes exactamente qué se ha corregido ya en el código de la web y qué pasos debes hacer tú en Google Search Console y Google Cloud para que te la aprueben.

### ¿Qué hemos corregido YA automáticamente en el código de la web?
De los 4 errores que te marcó Google en la captura, **3 ya están arreglados en la web** en cuanto sincronices con GitHub y Vercel termine el deploy:

- ✅ **Error 2 («La página de tu política de privacidad no tiene suficiente contenido»)**:
  Se ha creado una página dedicada y completa en **`https://nebrija-proyectos-bien.vercel.app/privacidad`** (y Términos en **`/terminos`**) accesible sin iniciar sesión, detallando datos recopilados, uso de Google Drive/Docs, cumplimiento de la *Google API Services User Data Policy (Limited Use)*, revocación de permisos y contacto.
- ✅ **Error 3 («Tu página principal está protegida por una página de acceso»)**:
  La raíz **`https://nebrija-proyectos-bien.vercel.app`** ya NO bloquea la entrada con un muro de login ni un modal a pantalla completa. Ahora es una portada pública con toda la información de **Proyectos Nebrija App**, sus funciones y transparencia de datos de Google, con el formulario de acceso integrado sin bloquear el contenido.
- ✅ **Error 4 («El nombre de la app "Proyectos Nebrija App" no coincide con la página principal»)**:
  Se ha unificado el nombre exacto **`Proyectos Nebrija App`** en el `<title>` de `index.html`, el encabezado principal, el titular `<h1>`, el pie de página y la Política de Privacidad.

---

### ⚡ OPCIÓN RÁPIDA (30 segundos) para poder iniciar sesión HOY MISMO sin esperar a Google

Mientras Google revisa y aprueba la verificación oficial (que tarda varios días), **tú y tus compañeros de clase podéis iniciar sesión hoy mismo** usando el modo de pruebas:

1. Entra en [Google Cloud Console ➔ Google Auth Platform ➔ Público (Audience)](https://console.cloud.google.com/auth/audience?project=nice-champion-472412-v5).
2. Si el estado de publicación está en **En producción**, haz clic en **Volver a la fase de pruebas** (*Back to testing*).
3. En la sección **Usuarios de prueba (Test users)**, pulsa **+ Añadir usuarios (+ Add users)** y pega los correos Gmail de tus compañeros de clase (puedes añadir hasta **100 correos Gmail** gratis).
4. Pulsa **Guardar**.
5. Listo: todos esos correos podrán iniciar sesión con Google en `https://nebrija-proyectos-bien.vercel.app` al instante (si aparece una pantalla de aviso de app en prueba, solo tienen que pulsar **Continuar**).

---

### 🏆 GUÍA OFICIAL PASO A PASO: Cómo conseguir la Verificación Definitiva de Google (para que entre cualquier correo Gmail del mundo)

Sigue estos **5 pasos en orden exacto** para resolver el **Error 1** y enviar la nueva verificación a Google:

#### Paso A: Sincroniza los cambios nuevos a GitHub y comprueba las URLs en Vercel
1. Desde AI Studio, guarda/sube los cambios actuales a tu repositorio de GitHub.
2. Espera ~1 minuto a que Vercel termine el despliegue automático.
3. Abre en una ventana de incógnito (sin sesión iniciada) estas 3 direcciones y comprueba que cargan bien:
   - `https://nebrija-proyectos-bien.vercel.app` ➔ Debe verse la portada pública con el título **Proyectos Nebrija App**.
   - `https://nebrija-proyectos-bien.vercel.app/privacidad` ➔ Debe verse la Política de Privacidad completa.
   - `https://nebrija-proyectos-bien.vercel.app/terminos` ➔ Deben verse los Términos de Servicio.

#### Paso B: Verifica la propiedad de `https://nebrija-proyectos-bien.vercel.app` en Google Search Console (Soluciona el Error 1)
> **IMPORTANTE**: Debes hacer este paso con la **MISMA cuenta de Google** (`adrianbelvis14@gmail.com`) con la que administras tu proyecto de Google Cloud `nice-champion-472412-v5`.

1. Abre [Google Search Console](https://search.google.com/search-console/welcome).
2. Selecciona la tarjeta de la derecha: **Prefijo de la URL (URL prefix)** (NO uses "Dominio", porque `vercel.app` requiere "Prefijo de la URL").
3. Escribe exactamente:
   ```text
   https://nebrija-proyectos-bien.vercel.app
   ```
   y pulsa **Continuar**.
4. En la ventana de métodos de verificación, despliega **Etiqueta HTML (HTML tag)**.
5. Copia la línea `<meta name="google-site-verification" content="..." />` que te da Google.
6. **Pega esa etiqueta en `/index.html`** justo donde está el comentario `GOOGLE SEARCH CONSOLE VERIFICATION` (puedes pegármela aquí en el chat de AI Studio y yo la inserto al instante).
7. Sube ese cambio a GitHub y espera ~1 minuto a que Vercel despliegue.
8. Vuelve a Google Search Console y pulsa **Verificar**. Te saldrá un mensaje verde: **«Propiedad verificada»**.

#### Paso C: Actualiza las URLs de la Marca en Google Cloud Console
1. Abre [Google Cloud Console ➔ Google Auth Platform ➔ Desarrollo de la marca (Branding)](https://console.cloud.google.com/auth/branding?project=nice-champion-472412-v5).
2. Rellena los campos con estos valores exactos (sin espacios extra):
   - **Nombre de la aplicación**: `Proyectos Nebrija App`
   - **Correo electrónico de asistencia al usuario**: `adrianbelvis14@gmail.com`
   - **Página principal de la aplicación**:
     ```text
     https://nebrija-proyectos-bien.vercel.app
     ```
   - **Vínculo a la política de privacidad de la aplicación**:
     ```text
     https://nebrija-proyectos-bien.vercel.app/privacidad
     ```
   - **Vínculo a las condiciones del servicio de la aplicación**:
     ```text
     https://nebrija-proyectos-bien.vercel.app/terminos
     ```
3. En **Dominios autorizados (Authorized domains)**, asegúrate de tener añadido:
   ```text
   vercel.app
   ```
4. En **Información de contacto del desarrollador**, añade tu correo `adrianbelvis14@gmail.com`.
5. Pulsa **Guardar**.

#### Paso D: Espera 24 horas (Requisito obligatorio de Google)
- Como indica el propio aviso de Google en tu captura, después de verificar la propiedad en **Google Search Console** debes **esperar 24 horas** para que los sistemas de Google Cloud sincronicen que `https://nebrija-proyectos-bien.vercel.app` te pertenece. Si lo envías antes de 24 horas, el sistema automático puede volver a rechazar el punto 1.

#### Paso E: Envía la nueva verificación en Google Cloud
1. Pasadas las 24 horas, vuelve a [Google Cloud Console ➔ Google Auth Platform ➔ Centro de verificación (Verification Center)](https://console.cloud.google.com/auth/verification?project=nice-champion-472412-v5).
2. Abre el aviso de **Problemas con la verificación de la marca**.
3. Marca la opción:
   - 🔘 **Corregí los problemas** *(Solicita la nueva verificación de tu marca)*
4. Pulsa **Continuar** y confirma el envío.
5. Google revisará automáticamente las 4 condiciones (propiedad en Search Console, política en `/privacidad`, portada pública en `/` y nombre coincidente `Proyectos Nebrija App`) y te enviará la confirmación por correo a `adrianbelvis14@gmail.com`.

> **Nota sobre permisos (Scopes) de Google Drive**: Si además de iniciar sesión con Google (nombre y correo) solicitas el permiso de `Google Drive (drive.file)`, Google puede pedir en una segunda fase un breve vídeo de demostración de 1-2 minutos en YouTube (en modo *Oculto/Unlisted*) enseñando cómo el usuario pulsa "Conectar Google" y abre/guarda un archivo. Si quieres evitar la revisión de permisos sensibles de Drive mientras tanto, usar la **Opción Rápida (Usuarios de prueba)** funciona al 100% con Drive incluido para hasta 100 compañeros.

### ¿Por qué aparece `nice-champion-472412-v5.firebaseapp.com` en vez de `Proyectos Nebrija App` al iniciar sesión?
1. **Regla de seguridad de Google OAuth (motivo principal):** Mientras la app está **en fase de pruebas** o **sin la verificación de marca aprobada**, Google oculta a propósito el nombre personalizado (`Proyectos Nebrija App`) y muestra el dominio técnico de Firebase (`nice-champion-472412-v5.firebaseapp.com`) para evitar suplantaciones. **En cuanto Google apruebe la Verificación de Marca (Paso E)**, Google sustituirá automáticamente `nice-champion-472412-v5.firebaseapp.com` por **`Proyectos Nebrija App`** (y tu logotipo si subes uno en *Desarrollo de la marca*).
2. **Nombre visible al público en Firebase (recomendado también):**
   - Entra en [Firebase Console ➔ Configuración del proyecto ➔ General](https://console.firebase.google.com/project/nice-champion-472412-v5/settings/general).
   - Busca el campo **Nombre visible al público (Public-facing name)**, haz clic en el lápiz, escribe **`Proyectos Nebrija App`** y guarda.

