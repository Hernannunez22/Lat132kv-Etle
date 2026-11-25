import { auth } from '../firebase';

/**
 * Envuelve fetch añadiendo el ID Token de Firebase Authentication en 'x-firebase-id-token'
 * cuando hay una sesión activa, permitiendo validar identidad en las rutas /api/*.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const buildHeaders = async (forceRefresh = false) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('x-firebase-id-token') || forceRefresh) {
      try {
        const user = auth.currentUser;
        if (user && user.emailVerified) {
          const idToken = await user.getIdToken(forceRefresh);
          if (idToken) {
            headers.set('x-firebase-id-token', idToken);
          }
        }
      } catch {
        // No bloquear llamadas locales si Firebase aún no emitió token
      }
    }
    return headers;
  };

  const firstRes = await fetch(input, {
    ...init,
    headers: await buildHeaders(false),
  });

  if (firstRes.status === 401 && auth.currentUser?.emailVerified) {
    return fetch(input, {
      ...init,
      headers: await buildHeaders(true),
    });
  }

  return firstRes;
}

/**
 * Lee una respuesta HTTP esperando JSON sin lanzar SyntaxError crudo ("Unexpected token '<', <!doctype...")
 * cuando un proxy, redirección de sesión o servidor devuelve HTML en lugar de JSON.
 */
export async function readJsonResponse<T = any>(
  res: Response,
  contextLabel = 'Error en respuesta del servidor'
): Promise<T> {
  const rawText = await res.text();
  const trimmed = rawText.trim();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  if (!trimmed) {
    if (!res.ok) {
      throw new Error(`${contextLabel} (HTTP ${res.status})`);
    }
    return {} as T;
  }

  const looksLikeHtml =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!') ||
    /^<(html|head|body|title|pre)\b/i.test(trimmed);

  if (looksLikeHtml) {
    if (res.status === 413) {
      throw new Error(
        'El archivo o carga supera el límite permitido por el servidor (HTTP 413). Usa un archivo más liviano.'
      );
    }
    if (
      res.status === 401 ||
      res.status === 403 ||
      /accounts\.google\.com|ServiceLogin|iniciar\s*sesi/i.test(trimmed)
    ) {
      throw new Error(
        'La sesión del navegador o el acceso al servidor expiró (se recibió una página HTML de autenticación). Recarga la página e inicia sesión nuevamente.'
      );
    }
    throw new Error(
      `${contextLabel}: el servidor respondió HTML en lugar de JSON (HTTP ${res.status}). Si usas la app instalada o compartida, recarga la página para renovar la conexión.`
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    if (!res.ok) {
      throw new Error(`${contextLabel} (HTTP ${res.status})`);
    }
    throw new Error(`${contextLabel}: respuesta no válida del servidor (HTTP ${res.status}).`);
  }
}

export async function tryReadJsonResponse<T = any>(res: Response): Promise<Partial<T>> {
  try {
    return await readJsonResponse<T>(res);
  } catch {
    return {};
  }
}

