import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const FIREBASE_PROJECT_ID = 'gen-lang-client-0070217603';
const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface FirebaseVerifiedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,120}$/;

/**
 * Valida un identificador utilizado en rutas de archivos en disco para prevenir path traversal (`../`, `/`, `\`).
 */
export function sanitizeSafeId(rawId: unknown, label = 'id'): string {
  const value = typeof rawId === 'string' ? rawId.trim() : '';
  if (!value || !SAFE_ID_REGEX.test(value)) {
    const err = new Error(
      `Identificador "${label}" inválido: solo se permiten caracteres alfanuméricos, "_" y "-" (1-120 caracteres).`
    ) as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  return value;
}

let cachedCerts: Record<string, string> = {};
let cachedCertsExpiresAt = 0;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < cachedCertsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }

  const res = await fetch(GOOGLE_SECURETOKEN_CERTS_URL);
  if (!res.ok) {
    if (Object.keys(cachedCerts).length > 0) {
      return cachedCerts;
    }
    throw new Error(`No se pudieron obtener certificados públicos de Firebase (HTTP ${res.status})`);
  }

  const rawCerts = await res.text();
  if (/^\s*</.test(rawCerts)) {
    if (Object.keys(cachedCerts).length > 0) {
      return cachedCerts;
    }
    throw new Error('Respuesta HTML inesperada al obtener certificados públicos de Firebase.');
  }
  const certs = JSON.parse(rawCerts) as Record<string, string>;
  const cc = res.headers.get('cache-control') || '';
  const maxAgeMatch = cc.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.max(60, parseInt(maxAgeMatch[1], 10)) : 3600;

  cachedCerts = certs;
  cachedCertsExpiresAt = now + maxAgeSec * 1000;
  return cachedCerts;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const mod = padded.length % 4;
  const b64 = mod === 0 ? padded : padded + '='.repeat(4 - mod);
  const raw = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(raw) as T;
}

function base64UrlToBuffer(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const mod = padded.length % 4;
  const b64 = mod === 0 ? padded : padded + '='.repeat(4 - mod);
  return Buffer.from(b64, 'base64');
}

export async function verifyFirebaseIdToken(token: string): Promise<FirebaseVerifiedUser> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(p => !p)) {
    throw new Error('Formato JWT inválido');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string; typ?: string }>(headerB64);
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Algoritmo o key id (kid) JWT no válido');
  }

  const certs = await getGooglePublicCerts();
  let certPem = certs[header.kid];
  if (!certPem) {
    // Forzar refresco de certificados si Google rotó claves recientemente
    cachedCertsExpiresAt = 0;
    const freshCerts = await getGooglePublicCerts();
    certPem = freshCerts[header.kid];
  }
  if (!certPem) {
    throw new Error('Certificado de firma JWT desconocido');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValidSig = verifier.verify(certPem, base64UrlToBuffer(sigB64));
  if (!isValidSig) {
    throw new Error('Firma digital del token Firebase inválida');
  }

  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(payloadB64);

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Audience (aud) del token Firebase no coincide');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Issuer (iss) del token Firebase no coincide');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Subject (uid) ausente o inválido en token Firebase');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec - 30) {
    throw new Error('Token Firebase expirado');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Token Firebase emitido en el futuro');
  }
  if (payload.email && payload.email_verified === false) {
    throw new Error('Correo electrónico del usuario no verificado');
  }

  return {
    uid: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name,
  };
}

/**
 * Middleware para rutas `/api/*`:
 * - Si viene encabezado `x-firebase-id-token`, lo valida criptográficamente (devuelve 401 si es inválido/forjado).
 * - Si `REQUIRE_FIREBASE_AUTH=true`, exige el token en todas las rutas excepto diagnóstico/health.
 */
export async function attachVerifiedFirebaseUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const tokenHeader = req.headers['x-firebase-id-token'];
  const token = typeof tokenHeader === 'string' ? tokenHeader.trim() : '';

  if (token) {
    try {
      const user = await verifyFirebaseIdToken(token);
      (req as Request & { firebaseUser?: FirebaseVerifiedUser }).firebaseUser = user;
      return next();
    } catch (err: any) {
      return res.status(401).json({
        exito: false,
        error: `Sesión Firebase inválida o expirada: ${err?.message || 'no autorizada'}`,
      });
    }
  }

  if (
    process.env.REQUIRE_FIREBASE_AUTH === 'true' &&
    req.path !== '/health' &&
    req.path !== '/gemini/diagnostico'
  ) {
    return res.status(401).json({
      exito: false,
      error: 'Autenticación Firebase requerida para operar sobre la API.',
    });
  }

  return next();
}
