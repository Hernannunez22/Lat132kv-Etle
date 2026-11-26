import type express from 'express';
import type { FirebaseVerifiedUser } from '../authMiddleware';
import {
  MASTER_ADMIN_EMAIL,
  isEmailAutorizadoParaPagos,
  runWithAiRequestContext,
  syncIAControlDesdeFirestoreRest,
} from '../geminiClient';

export function getVerifiedUser(req: express.Request): FirebaseVerifiedUser | undefined {
  return (req as express.Request & { firebaseUser?: FirebaseVerifiedUser }).firebaseUser;
}

export function esUsuarioMaestroRequest(req: express.Request): boolean {
  const user = getVerifiedUser(req);
  return Boolean(
    user?.emailVerified &&
      typeof user.email === 'string' &&
      user.email.toLowerCase().trim() === MASTER_ADMIN_EMAIL
  );
}

export function getUserPrecisionOpts(req: express.Request) {
  const user = getVerifiedUser(req);
  return {
    esMaestro: esUsuarioMaestroRequest(req),
    userEmail: user?.email || null,
    emailVerified: Boolean(user?.emailVerified),
  };
}

export function attachAiRequestContext(
  req: express.Request,
  _res: express.Response,
  next: express.NextFunction
) {
  const tokenHeader = req.headers['x-firebase-id-token'];
  const token = typeof tokenHeader === 'string' ? tokenHeader.trim() : '';
  const user = getVerifiedUser(req);
  const esMaestro = esUsuarioMaestroRequest(req);
  const email = user?.emailVerified && user.email ? user.email.toLowerCase().trim() : undefined;

  const proceed = () => {
    const allowPagos = isEmailAutorizadoParaPagos(email, Boolean(user?.emailVerified));
    runWithAiRequestContext({ allowPagos, userEmail: email, esMaestro }, () => next());
  };

  if (token && user?.emailVerified) {
    void syncIAControlDesdeFirestoreRest(token).finally(proceed);
  } else {
    proceed();
  }
}
