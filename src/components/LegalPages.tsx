import React from 'react';
import { ArrowLeft, ShieldCheck, FileText, Lock, HardDrive, Mail } from 'lucide-react';

interface LegalPageProps {
  page: 'privacy' | 'terms';
  onNavigate: (path: string) => void;
}

export const LegalPages: React.FC<LegalPageProps> = ({ page, onNavigate }) => {
  const isPrivacy = page === 'privacy';

  return (
    <div className="min-h-screen bento-grid-bg text-[#F4F4F6] flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-6 px-6 py-4 border-b border-[#22222A] bg-[#09090B]/95">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/');
          }}
          className="flex items-center gap-3 whitespace-nowrap shrink-0"
        >
          <span className="font-display font-bold text-base tracking-tight text-white">
            Proyectos Nebrija App
          </span>
          <span className="hidden sm:inline font-mono text-[11px] text-[#60A5FA] border border-[#2A2A35] bg-[#121218] px-2 py-0.5">
            CHIKIHUB
          </span>
        </a>

        <nav className="flex items-center gap-4 text-xs font-medium text-[#8E8E9E]">
          <a
            href="/privacidad"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/privacidad');
            }}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              isPrivacy ? 'text-white font-semibold border-b-2 border-white py-1' : 'hover:text-white'
            }`}
          >
            Política de Privacidad
          </a>
          <a
            href="/terminos"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/terminos');
            }}
            className={`whitespace-nowrap shrink-0 transition-colors ${
              !isPrivacy ? 'text-white font-semibold border-b-2 border-white py-1' : 'hover:text-white'
            }`}
          >
            Términos de Servicio
          </a>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="px-3.5 py-2 bg-white hover:bg-zinc-200 text-[#09090B] font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Inicio</span>
          </button>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-8 py-10">
        {isPrivacy ? (
          <article className="border border-[#22222A] bg-[#0E0E12] divide-y divide-[#22222A]">
            {/* Header */}
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-2 font-mono text-xs text-[#60A5FA] mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span>DOCUMENTO LEGAL OFICIAL · ÚLTIMA ACTUALIZACIÓN: NOVIEMBRE 2026</span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
                Política de Privacidad de Proyectos Nebrija App
              </h1>
              <p className="text-sm text-[#9E9EAE] leading-relaxed">
                Esta Política de Privacidad describe cómo <strong className="text-white">Proyectos Nebrija App</strong>{' '}
                (también conocida como <strong className="text-white">ChikiHub</strong>, accesible en{' '}
                <code className="text-white font-mono">https://nebrija-proyectos-bien.vercel.app</code>) recopila, utiliza,
                almacena y protege la información de los usuarios cuando utilizan nuestra plataforma colaborativa de gestión
                de proyectos académicos de informática y sus integraciones con los servicios de Google.
              </p>
            </div>

            {/* Section 1 */}
            <section className="p-6 sm:p-8 space-y-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-[#60A5FA]">01.</span>
                <span>Responsable del Tratamiento y Contacto</span>
              </h2>
              <p className="text-sm text-[#B4B4C2] leading-relaxed">
                El titular y desarrollador responsable de <strong className="text-white">Proyectos Nebrija App</strong> es
                Adrián Belvis. Para cualquier consulta relacionada con la privacidad, solicitud de acceso, rectificación o
                eliminación de datos, puedes escribir directamente al correo electrónico de soporte:
              </p>
              <div className="p-3.5 border border-[#2A2A35] bg-[#09090B] inline-flex items-center gap-2.5 text-xs font-mono text-white">
                <Mail className="w-4 h-4 text-[#60A5FA]" />
                <span>adrianbelvis14@gmail.com</span>
              </div>
            </section>

            {/* Section 2 */}
            <section className="p-6 sm:p-8 space-y-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-[#60A5FA]">02.</span>
                <span>Qué Datos Recopilamos</span>
              </h2>
              <p className="text-sm text-[#B4B4C2] leading-relaxed">
                Recopilamos exclusivamente los datos estrictamente necesarios para ofrecer la colaboración en proyectos
                escolares de informática:
              </p>
              <ul className="space-y-2.5 text-sm text-[#A1A1B2] list-disc list-inside leading-relaxed">
                <li>
                  <strong className="text-white">Cuenta local del grupo:</strong> nombre de usuario elegido por el estudiante,
                  apodo o nombre visible y especialidad/rol académico dentro del equipo.
                </li>
                <li>
                  <strong className="text-white">Información de cuenta de Google (OAuth 2.0):</strong> cuando decides conectar
                  tu cuenta de Google de forma voluntaria, recibimos tu dirección de correo electrónico y nombre de perfil
                  básico para autenticar tu sesión con Firebase Authentication y Google Drive.
                </li>
                <li>
                  <strong className="text-white">Archivos y carpetas de Google Drive (alcance limitado):</strong> únicamente
                  los archivos y carpetas creados, subidos o vinculados explícitamente por el usuario dentro de{' '}
                  <strong className="text-white">Proyectos Nebrija App</strong> para permitir su edición colaborativa en
                  Google Docs, Google Sheets y Google Slides, así como su exportación en formato <code>.ZIP</code>. No leemos,
                  indexamos ni modificamos otros archivos personales de tu Google Drive ajenos a la aplicación.
                </li>
                <li>
                  <strong className="text-white">Contenido del proyecto:</strong> carpetas, tareas asignadas, fechas de entrega,
                  anuncios del tablón y mensajes de chat del grupo creados voluntariamente en la aplicación.
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="p-6 sm:p-8 space-y-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-[#60A5FA]">03.</span>
                <span>Cómo Utilizamos tus Datos</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#22222A] border border-[#22222A]">
                <div className="bg-[#09090B] p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-mono text-[#60A5FA] font-bold">
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>SINCRONIZACIÓN CON GOOGLE DRIVE</span>
                  </div>
                  <p className="text-xs text-[#9E9EAE] leading-relaxed">
                    Crear la jerarquía de carpetas del proyecto, abrir archivos Office (.DOCX, .XLSX, .PPTX) en Google Docs,
                    Sheets o Slides, y exportar copias actualizadas para su entrega.
                  </p>
                </div>
                <div className="bg-[#09090B] p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-bold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>SEGURIDAD Y CONTROL DE ACCESO</span>
                  </div>
                  <p className="text-xs text-[#9E9EAE] leading-relaxed">
                    Restringir el acceso de cada proyecto únicamente a los compañeros autorizados y proteger los trabajos
                    académicos del grupo mediante permisos y contraseñas de proyecto.
                  </p>
                </div>
              </div>
              <p className="text-sm text-[#B4B4C2] leading-relaxed pt-2">
                <strong className="text-white">Nunca vendemos, alquilamos ni compartimos tus datos personales</strong> con
                terceros con fines publicitarios, comerciales o de perfilado. Los datos procedentes de Google Workspace jamás
                se utilizan para mostrar anuncios ni para entrenar modelos de inteligencia artificial o aprendizaje automático
                generalistas.
              </p>
            </section>

            {/* Section 4: Google API Limited Use Policy */}
            <section className="p-6 sm:p-8 space-y-3 bg-[#111116]">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-emerald-400">04.</span>
                <span>Cumplimiento de la Política de Datos de Usuario de Google API (Uso Limitado)</span>
              </h2>
              <p className="text-sm text-[#D4D4DC] leading-relaxed">
                El uso y la transferencia por parte de <strong className="text-white">Proyectos Nebrija App</strong> de la
                información recibida de las API de Google a cualquier otra aplicación cumplirá estrictamente con la{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#60A5FA] underline font-semibold"
                >
                  Política de datos de usuario de los servicios API de Google (Google API Services User Data Policy)
                </a>
                , incluidos los requisitos de <strong className="text-white">Uso limitado (Limited Use requirements)</strong>.
              </p>
              <p className="text-xs text-[#9E9EAE] leading-relaxed">
                Los tokens de acceso de OAuth se gestionan exclusivamente en la sesión del navegador del usuario para ejecutar
                las acciones solicitadas explícitamente por el usuario (subir, abrir o exportar documentos) y no se almacenan
                en servidores externos no autorizados.
              </p>
            </section>

            {/* Section 5 */}
            <section className="p-6 sm:p-8 space-y-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-[#60A5FA]">05.</span>
                <span>Almacenamiento, Retención y Eliminación de Datos</span>
              </h2>
              <p className="text-sm text-[#B4B4C2] leading-relaxed">
                Los datos estructurales de los proyectos (carpetas, tareas, avisos y referencias a documentos) se almacenan en
                Firebase Cloud Firestore bajo reglas estrictas de seguridad por usuario autenticado y en el almacenamiento
                local del navegador para respuesta inmediata.
              </p>
              <p className="text-sm text-[#B4B4C2] leading-relaxed">
                Puedes eliminar cualquier archivo, carpeta o proyecto completo directamente desde la aplicación en cualquier
                momento. Además, puedes revocar el acceso de <strong className="text-white">Proyectos Nebrija App</strong> a
                tu cuenta de Google en cualquier momento desde{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#60A5FA] underline"
                >
                  https://myaccount.google.com/permissions
                </a>{' '}
                o solicitar el borrado completo escribiendo a{' '}
                <code className="text-white font-mono">adrianbelvis14@gmail.com</code>.
              </p>
            </section>
          </article>
        ) : (
          <article className="border border-[#22222A] bg-[#0E0E12] divide-y divide-[#22222A]">
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-2 font-mono text-xs text-[#60A5FA] mb-2">
                <FileText className="w-4 h-4" />
                <span>CONDICIONES DE USO · ÚLTIMA ACTUALIZACIÓN: NOVIEMBRE 2026</span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
                Términos de Servicio de Proyectos Nebrija App
              </h1>
              <p className="text-sm text-[#9E9EAE] leading-relaxed">
                Al acceder y utilizar <strong className="text-white">Proyectos Nebrija App</strong> (
                <code className="text-white font-mono">https://nebrija-proyectos-bien.vercel.app</code>), aceptas los
                siguientes términos diseñados para el uso educativo y colaborativo de proyectos de informática.
              </p>
            </div>

            <section className="p-6 sm:p-8 space-y-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-[#60A5FA]">01.</span>
                <span>Objeto de la Plataforma</span>
              </h2>
              <p className="text-sm text-[#B4B4C2] leading-relaxed">
                <strong className="text-white">Proyectos Nebrija App</strong> es una herramienta gratuita orientada a grupos
                de estudiantes de informática para organizar proyectos en equipo, gestionar tareas y fechas de entrega,
                vincular y editar documentos en Google Docs, Sheets y Slides, y descargar carpetas completas en formato{' '}
                <code>.ZIP</code>.
              </p>
            </section>

            <section className="p-6 sm:p-8 space-y-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-[#60A5FA]">02.</span>
                <span>Uso Responsable y Propiedad de los Contenidos</span>
              </h2>
              <ul className="space-y-2 text-sm text-[#A1A1B2] list-disc list-inside leading-relaxed">
                <li>
                  Todos los documentos, archivos, topologías y códigos subidos por los estudiantes siguen siendo propiedad
                  exclusiva de sus autores.
                </li>
                <li>
                  Los usuarios se comprometen a no subir contenido ilícito, malware o archivos que infrinjan derechos de
                  terceros.
                </li>
                <li>
                  Para garantizar la sostenibilidad 100% gratuita de la plataforma, cada espacio dispone de límites técnicos
                  razonables (hasta 5 proyectos activos y 50 MB por proyecto).
                </li>
              </ul>
            </section>

            <section className="p-6 sm:p-8 space-y-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-[#60A5FA]">03.</span>
                <span>Servicios de Terceros (Google Workspace y Firebase)</span>
              </h2>
              <p className="text-sm text-[#B4B4C2] leading-relaxed">
                La plataforma se integra opcionalmente con Google Drive, Google Docs, Google Sheets y Google Slides mediante
                autorización explícita del usuario. El uso de dichas herramientas queda también sujeto a los Términos de
                Servicio de Google.
              </p>
            </section>

            <section className="p-6 sm:p-8 space-y-3">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <span className="font-mono text-xs text-[#60A5FA]">04.</span>
                <span>Contacto</span>
              </h2>
              <p className="text-sm text-[#B4B4C2] leading-relaxed">
                Si tienes dudas sobre estos Términos de Servicio o necesitas soporte técnico, escríbenos a{' '}
                <strong className="text-white font-mono">adrianbelvis14@gmail.com</strong>.
              </p>
            </section>
          </article>
        )}
      </main>

      <footer className="border-t border-[#22222A] bg-[#09090B] px-6 py-5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7E7E8E]">
          <span>© 2026 Proyectos Nebrija App (ChikiHub) · adrianbelvis14@gmail.com</span>
          <div className="flex items-center gap-4">
            <a
              href="/privacidad"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/privacidad');
              }}
              className="hover:text-white transition-colors"
            >
              Política de Privacidad
            </a>
            <a
              href="/terminos"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/terminos');
              }}
              className="hover:text-white transition-colors"
            >
              Términos de Servicio
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
