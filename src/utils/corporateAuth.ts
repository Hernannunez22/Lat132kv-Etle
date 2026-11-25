import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from 'firebase/auth';
import { auth } from '../firebase';

export function traducirErrorFirebaseAuth(err: unknown): string {
  const code = String((err as { code?: string } | null)?.code || '');
  const rawMsg = String((err as { message?: string } | null)?.message || err || '');

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'El inicio de sesión con Correo y Contraseña aún no está activado en Firebase Console. El administrador debe habilitar «Correo electrónico/contraseña» en Authentication → Sign-in method.';
    case 'auth/email-already-in-use':
      return 'Ese correo corporativo ya tiene una cuenta creada. Usa «Iniciar sesión» o «Olvidé mi clave» si no recuerdas la contraseña.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos. Si es tu primera vez entrando con correo corporativo, selecciona «Crear cuenta».';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'Ingresa un correo electrónico corporativo válido.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos seguidos. Espera unos minutos e intenta nuevamente.';
    case 'auth/user-disabled':
      return 'Esta cuenta fue deshabilitada en Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Error de red al conectar con Firebase. Verifica tu conexión a internet.';
    default:
      if (rawMsg.includes('operation-not-allowed')) {
        return 'El inicio de sesión con Correo y Contraseña aún no está activado en Firebase Console (Authentication → Sign-in method).';
      }
      return rawMsg || 'No se pudo autenticar el correo corporativo.';
  }
}

export async function registrarConCorreoCorporativo(params: {
  email: string;
  password: string;
  nombre?: string;
}): Promise<{ user: User; verificationSent: boolean }> {
  const emailClean = params.email.trim().toLowerCase();
  if (!emailClean || !emailClean.includes('@')) {
    throw new Error('Ingresa un correo electrónico corporativo válido.');
  }
  if (!params.password || params.password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, emailClean, params.password);
    const nombreLimpio = (params.nombre || '').trim();
    if (nombreLimpio) {
      try {
        await updateProfile(cred.user, { displayName: nombreLimpio.slice(0, 120) });
      } catch {
        // Opcional
      }
    }
    await sendEmailVerification(cred.user);
    return { user: cred.user, verificationSent: true };
  } catch (err) {
    throw new Error(traducirErrorFirebaseAuth(err));
  }
}

export async function iniciarSesionCorreoCorporativo(params: {
  email: string;
  password: string;
}): Promise<{ user: User; emailVerified: boolean }> {
  const emailClean = params.email.trim().toLowerCase();
  if (!emailClean || !emailClean.includes('@')) {
    throw new Error('Ingresa un correo electrónico corporativo válido.');
  }
  if (!params.password) {
    throw new Error('Ingresa tu contraseña.');
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, emailClean, params.password);
    return {
      user: cred.user,
      emailVerified: Boolean(cred.user.emailVerified),
    };
  } catch (err) {
    throw new Error(traducirErrorFirebaseAuth(err));
  }
}

export async function reenviarVerificacionCorreo(): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Primero inicia sesión con tu correo corporativo para reenviar la verificación.');
  }
  try {
    await sendEmailVerification(user);
  } catch (err) {
    throw new Error(traducirErrorFirebaseAuth(err));
  }
}

export async function verificarEstadoEmailActual(): Promise<{
  user: User;
  emailVerified: boolean;
} | null> {
  const user = auth.currentUser;
  if (!user) return null;
  await reload(user);
  await user.getIdToken(true);
  return {
    user,
    emailVerified: Boolean(user.emailVerified),
  };
}

export async function restablecerClaveCorreo(email: string): Promise<void> {
  const emailClean = email.trim().toLowerCase();
  if (!emailClean || !emailClean.includes('@')) {
    throw new Error('Ingresa tu correo corporativo para enviar el enlace de recuperación.');
  }
  try {
    await sendPasswordResetEmail(auth, emailClean);
  } catch (err) {
    throw new Error(traducirErrorFirebaseAuth(err));
  }
}
