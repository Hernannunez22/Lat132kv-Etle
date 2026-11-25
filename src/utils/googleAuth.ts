import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth } from '../firebase';

export const DEFAULT_DRIVE_ROOT_FOLDER_ID = '1hRZXHfqmcFdhiHj2Fbx1IV9gCCVX7edw';
export const DEFAULT_ELENCOS_FOLDER_ID = '1Dmg0tKE6glZR0EYrjujzD_iJCZJnljrj';
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

// Almacenamiento estricto SOLO EN MEMORIA para el access token OAuth (nunca en localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;
let cachedAccountEmail: string | null = null;
let cachedAccountName: string | null = null;
let needsExplicitConsent = false;

const driveTokenListeners = new Set<(token: string | null) => void>();

function notifyDriveTokenListeners(token: string | null) {
  for (const cb of driveTokenListeners) {
    try {
      cb(token);
    } catch {}
  }
}

export function subscribeDriveToken(cb: (token: string | null) => void): () => void {
  driveTokenListeners.add(cb);
  return () => {
    driveTokenListeners.delete(cb);
  };
}

export interface GoogleDriveAuthState {
  isSignedIn: boolean;
  hasDriveToken: boolean;
  uid: string | null;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

export interface GoogleDriveTokenInfo {
  hasToken: boolean;
  expiresAt: number;
  remainingMinutes: number;
  accountEmail: string | null;
  accountName: string | null;
  needsExplicitConsent: boolean;
}

export function getGoogleDriveAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  if (Date.now() >= tokenExpiresAt) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    notifyDriveTokenListeners(null);
    return null;
  }
  return cachedAccessToken;
}

export function getGoogleDriveTokenInfo(): GoogleDriveTokenInfo {
  const token = getGoogleDriveAccessToken();
  const remainingMs = token ? Math.max(0, tokenExpiresAt - Date.now()) : 0;
  return {
    hasToken: Boolean(token),
    expiresAt: token ? tokenExpiresAt : 0,
    remainingMinutes: token ? Math.max(1, Math.round(remainingMs / 60000)) : 0,
    accountEmail: token ? cachedAccountEmail || auth.currentUser?.email || null : null,
    accountName: token ? cachedAccountName || auth.currentUser?.displayName || null : null,
    needsExplicitConsent,
  };
}

export function markDriveConsentNeeded(flag = true) {
  needsExplicitConsent = flag;
}

export function clearGoogleDriveAccessToken() {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  cachedAccountEmail = null;
  cachedAccountName = null;
  notifyDriveTokenListeners(null);
}

export function esErrorPopupBloqueado(err: unknown): boolean {
  const code = String((err as any)?.code || '').toLowerCase();
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    code === 'auth/popup-blocked' ||
    msg.includes('popup-blocked') ||
    msg.includes('popup blocked') ||
    msg.includes('ventana emergente')
  );
}

function esErrorPermisoOAuthDrive(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid credentials') ||
    msg.includes('invalid_token') ||
    msg.includes('expir') ||
    msg.includes('autenticación') ||
    msg.includes('insufficient') ||
    msg.includes('permiso') ||
    msg.includes('scope') ||
    (msg.includes('403') && msg.includes('drive'))
  );
}

function normalizarErrorAuthGoogle(err: any): Error {
  const code = String(err?.code || '').toLowerCase();
  const rawMsg = String(err?.message || '');

  if (esErrorPopupBloqueado(err)) {
    const out = new Error(
      'El navegador o el visor embebido bloqueó la ventana emergente de Google (auth/popup-blocked). ' +
        'Permite las ventanas emergentes en la barra de direcciones o abre la app en una pestaña independiente y vuelve a intentarlo.'
    ) as Error & { code?: string };
    out.code = 'auth/popup-blocked';
    return out;
  }

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    const out = new Error(
      'Se cerró la ventana de Google antes de completar el inicio de sesión.'
    ) as Error & { code?: string };
    out.code = code;
    return out;
  }

  if (code === 'auth/unauthorized-domain') {
    const out = new Error(
      `Este dominio (${typeof window !== 'undefined' ? window.location.hostname : ''}) no está autorizado en Firebase Authentication -> Authorized domains.`
    ) as Error & { code?: string };
    out.code = code;
    return out;
  }

  if (err instanceof Error) return err;
  return new Error(rawMsg || 'Error autenticando con Google.');
}

export async function signInWithGoogleDrive(options?: {
  forceConsent?: boolean;
  includeDriveScope?: boolean;
  loginHint?: string;
}): Promise<{
  user: User;
  accessToken: string | null;
}> {
  const provider = new GoogleAuthProvider();
  const wantDriveScope = options?.includeDriveScope !== false;
  if (wantDriveScope) {
    provider.addScope(DRIVE_READONLY_SCOPE);
  }

  const shouldConsent = Boolean(options?.forceConsent || (wantDriveScope && needsExplicitConsent));
  const customParams: Record<string, string> = {
    prompt: shouldConsent ? 'consent' : 'select_account',
    include_granted_scopes: 'true',
  };
  const hint = (options?.loginHint || (!shouldConsent ? auth.currentUser?.email || '' : '')).trim();
  if (hint) {
    customParams.login_hint = hint;
  }
  provider.setCustomParameters(customParams);

  try {
    // Llamar SIEMPRE de forma directa sin esperas ni reintentos asíncronos previos para no perder el gesto del usuario (UserActivation).
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || null;

    if (accessToken) {
      cachedAccessToken = accessToken;
      tokenExpiresAt = Date.now() + 50 * 60 * 1000;
      cachedAccountEmail = result.user.email || null;
      cachedAccountName = result.user.displayName || null;
      needsExplicitConsent = false;
      notifyDriveTokenListeners(accessToken);
    } else if (wantDriveScope) {
      needsExplicitConsent = true;
    }

    return {
      user: result.user,
      accessToken,
    };
  } catch (err: any) {
    throw normalizarErrorAuthGoogle(err);
  }
}

export async function ensureGoogleDriveAccessToken(forceConsent = false): Promise<string> {
  if (!forceConsent) {
    const current = getGoogleDriveAccessToken();
    if (current) return current;
  }

  // Un único popup directo en la cadena síncrona del clic: encadenar un segundo popup en catch() dispara auth/popup-blocked.
  const res = await signInWithGoogleDrive({
    forceConsent: forceConsent || needsExplicitConsent,
    includeDriveScope: true,
  });
  if (!res.accessToken) {
    needsExplicitConsent = true;
    throw new Error(
      'No se recibió el permiso de lectura de Google Drive. Vuelve a iniciar sesión y acepta la casilla de Google Drive.'
    );
  }
  return res.accessToken;
}

/**
 * Ejecuta una operación contra Google Drive y, si falla por token expirado/HTTP 401 o falta de alcance (403),
 * limpia el token en memoria, solicita uno nuevo y reintenta automáticamente una vez.
 */
export async function runWithDriveToken<T>(
  fn: (token: string) => Promise<T>,
  initialToken?: string
): Promise<T> {
  const firstToken = initialToken || (await ensureGoogleDriveAccessToken(false));
  try {
    return await fn(firstToken);
  } catch (err: any) {
    if (!esErrorPermisoOAuthDrive(err)) {
      throw err;
    }
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('403') || msg.includes('scope') || msg.includes('insufficient') || msg.includes('permiso')) {
      needsExplicitConsent = true;
    }
    clearGoogleDriveAccessToken();
    try {
      const retryRes = await signInWithGoogleDrive({
        forceConsent: true,
        includeDriveScope: true,
      });
      if (!retryRes.accessToken) {
        throw err;
      }
      return await fn(retryRes.accessToken);
    } catch (popupErr: any) {
      if (esErrorPopupBloqueado(popupErr)) {
        const out = new Error(
          'Tu sesión de Google Drive venció o faltan permisos y el navegador bloqueó el popup automático (auth/popup-blocked). Presiona «Conectar / Reautorizar Drive» nuevamente.'
        ) as Error & { code?: string };
        out.code = 'auth/popup-blocked';
        throw out;
      }
      throw popupErr;
    }
  }
}

export async function signOutGoogleDrive(): Promise<void> {
  needsExplicitConsent = false;
  clearGoogleDriveAccessToken();
  try {
    await signOut(auth);
  } catch {
    // Ignorar error si aún no había sesión activa
  }
}

export function subscribeGoogleAuthState(
  callback: (state: GoogleDriveAuthState) => void
): () => void {
  try {
    return onAuthStateChanged(auth, user => {
      callback({
        isSignedIn: Boolean(user),
        hasDriveToken: Boolean(getGoogleDriveAccessToken()),
        uid: user?.uid || null,
        email: user?.email || null,
        emailVerified: Boolean(user?.emailVerified),
        displayName: user?.displayName || null,
      });
    });
  } catch {
    callback({
      isSignedIn: false,
      hasDriveToken: false,
      uid: null,
      email: null,
      emailVerified: false,
      displayName: null,
    });
    return () => {};
  }
}

export function extraerDriveFolderId(
  rawInput?: string,
  fallbackId = DEFAULT_DRIVE_ROOT_FOLDER_ID
): string {
  const s = (rawInput || '').trim();
  if (!s) return fallbackId;
  const urlMatch = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  const idParamMatch = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return s.replace(/[^a-zA-Z0-9_-]/g, '') || fallbackId;
}
