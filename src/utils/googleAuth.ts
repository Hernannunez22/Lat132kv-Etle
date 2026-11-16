import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const DEFAULT_DRIVE_ROOT_FOLDER_ID = '1hRZXHfqmcFdhiHj2Fbx1IV9gCCVX7edw';
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

// Almacenamiento estricto SOLO EN MEMORIA para el access token OAuth (nunca en localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function getFirebaseAuthInstance(): Auth {
  if (!firebaseApp) {
    firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!firebaseAuth) {
    firebaseAuth = getAuth(firebaseApp);
  }
  return firebaseAuth;
}

export interface GoogleDriveAuthState {
  isSignedIn: boolean;
  hasDriveToken: boolean;
  email: string | null;
  displayName: string | null;
}

export function getGoogleDriveAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  if (Date.now() >= tokenExpiresAt) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    return null;
  }
  return cachedAccessToken;
}

export function clearGoogleDriveAccessToken() {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

export async function signInWithGoogleDrive(): Promise<{
  user: User;
  accessToken: string;
}> {
  const auth = getFirebaseAuthInstance();
  const provider = new GoogleAuthProvider();
  provider.addScope(DRIVE_READONLY_SCOPE);
  provider.setCustomParameters({
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  if (!accessToken) {
    throw new Error(
      'No se recibió el permiso de lectura de Google Drive. Vuelve a iniciar sesión y acepta el acceso a Google Drive.'
    );
  }

  cachedAccessToken = accessToken;
  tokenExpiresAt = Date.now() + 50 * 60 * 1000; // ~50 minutos de vigencia segura en memoria

  return {
    user: result.user,
    accessToken,
  };
}

export async function ensureGoogleDriveAccessToken(): Promise<string> {
  const current = getGoogleDriveAccessToken();
  if (current) return current;
  const res = await signInWithGoogleDrive();
  return res.accessToken;
}

export async function signOutGoogleDrive(): Promise<void> {
  clearGoogleDriveAccessToken();
  try {
    const auth = getFirebaseAuthInstance();
    await signOut(auth);
  } catch {
    // Ignorar error si aún no había sesión activa
  }
}

export function subscribeGoogleAuthState(
  callback: (state: GoogleDriveAuthState) => void
): () => void {
  try {
    const auth = getFirebaseAuthInstance();
    return onAuthStateChanged(auth, user => {
      callback({
        isSignedIn: Boolean(user),
        hasDriveToken: Boolean(getGoogleDriveAccessToken()),
        email: user?.email || null,
        displayName: user?.displayName || null,
      });
    });
  } catch {
    callback({
      isSignedIn: false,
      hasDriveToken: false,
      email: null,
      displayName: null,
    });
    return () => {};
  }
}

export function extraerDriveFolderId(rawInput?: string): string {
  const s = (rawInput || '').trim();
  if (!s) return DEFAULT_DRIVE_ROOT_FOLDER_ID;
  const urlMatch = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  const idParamMatch = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return s.replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_DRIVE_ROOT_FOLDER_ID;
}
