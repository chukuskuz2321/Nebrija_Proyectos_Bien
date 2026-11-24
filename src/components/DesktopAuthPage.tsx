import React, { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { signInWithGoogleForDesktopRelay } from '../firebase';

export const DesktopAuthPage: React.FC = () => {
  const params = useMemo(() => {
    if (typeof window === 'undefined') {
      return { port: 0, state: '', mode: 'account' as 'account' | 'drive', valid: false };
    }
    const sp = new URLSearchParams(window.location.search);
    const portNum = Number(sp.get('port') || '0');
    const state = (sp.get('state') || '').trim();
    const mode = sp.get('mode') === 'drive' ? 'drive' : 'account';
    const valid =
      Number.isInteger(portNum) &&
      portNum >= 1024 &&
      portNum <= 65535 &&
      /^[a-zA-Z0-9_-]{8,128}$/.test(state);

    return { port: portNum, state, mode: mode as 'account' | 'drive', valid };
  }, []);

  const [status, setStatus] = useState<'idle' | 'signing_in' | 'relaying' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleContinueWithGoogle = async () => {
    if (!params.valid) return;
    setStatus('signing_in');
    setErrorMsg('');

    try {
      const { idToken, accessToken } = await signInWithGoogleForDesktopRelay(params.mode);
      if (!idToken && !accessToken) {
        throw new Error('No se recibieron credenciales de Google. Intentalo de nuevo.');
      }

      setStatus('relaying');

      // Submit via top-level form POST to strictly localhost 127.0.0.1 callback:
      // avoids CORS / Chrome Private Network Access blocks and keeps tokens out of URL history.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `http://127.0.0.1:${params.port}/auth-callback`;
      form.style.display = 'none';

      const fields: Record<string, string> = {
        state: params.state,
        idToken: idToken || '',
        accessToken: accessToken || '',
      };

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
        setErrorMsg('Has cerrado la ventana de Google antes de terminar. Pulsa el boton para reintentar.');
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'No se pudo completar el inicio de sesion con Google.'
        );
      }
      setStatus('error');
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#09090B] p-4 text-[#F4F4F6]">
      <div className="w-full max-w-md rounded-2xl border border-[#22222A] bg-[#0E0E12] p-7 shadow-2xl">
        <div className="flex items-center gap-3">
          <BrandLogo size={38} />
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">
              Proyectos Nebrija App
            </h1>
            <p className="text-xs text-[#8E8E9E]">
              Autenticacion segura para la App de Windows
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-[#1E1E26] pt-6">
          {!params.valid ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold text-white">
                Enlace de acceso incompleto o caducado
              </p>
              <p className="text-xs leading-relaxed text-[#9C9CAF]">
                Vuelve a pulsar «Continuar con Google» desde la aplicacion de Windows para generar
                una nueva solicitud segura.
              </p>
              <a
                href="/"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#2A2A35] bg-[#14141A] px-4 py-2 text-xs font-semibold text-white hover:border-white"
              >
                Ir a la version web
              </a>
            </div>
          ) : status === 'relaying' ? (
            <div className="space-y-3 py-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
              <p className="text-sm font-semibold text-white">
                Enviando sesion a tu App de Windows...
              </p>
              <p className="text-xs text-[#9C9CAF]">
                En un segundo la aplicacion de escritorio se abrira automaticamente con tu cuenta.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {params.mode === 'drive'
                    ? 'Conectar Google Drive con tu App'
                    : 'Inicia sesion desde tu navegador'}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[#9C9CAF]">
                  Pulsa el boton para verificar tu cuenta de Google aqui en tu navegador habitual y
                  volver automaticamente a la aplicacion de escritorio.
                </p>
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                disabled={status === 'signing_in'}
                onClick={() => void handleContinueWithGoogle()}
                className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#09090B] transition-colors hover:bg-zinc-200 disabled:opacity-60 cursor-pointer"
              >
                {status === 'signing_in' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Conectando con Google...</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4" />
                    <span>Continuar con Google</span>
                  </>
                )}
              </button>

              <div className="flex items-start gap-2 rounded-xl border border-[#1E1E26] bg-[#121218] p-3 text-[11px] text-[#8A8A9C]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#3B82F6]" />
                <span>
                  La credencial se transmite localmente a tu PC (127.0.0.1) mediante un token de un
                  solo uso y se cierra al instante.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
