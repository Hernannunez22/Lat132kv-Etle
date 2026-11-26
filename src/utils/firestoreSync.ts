import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
  Timestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppConfig,
  ChatAdjuntoPdf,
  CompromisoMinuta,
  FotoCampo,
  Hito,
  Interferencia,
  MinutaReunion,
  NotaAudio,
  NotaLibro,
  NotaPedidoIngenieria,
  Plano,
  PliegoReal,
} from '../types';
import { DEFAULT_DRIVE_ROOT_FOLDER_ID } from './googleAuth';

export const DEFAULT_WORKSPACE_ID = 'obra-132kv-principal';
export const BOOTSTRAP_ADMIN_EMAIL = 'hernannunez27@gmail.com';
const CHUNK_CHAR_SIZE = 320000; // < 400KB limit in firestore.rules
const MAX_CHUNKS_PER_PLIEGO = 24; // Hasta ~7.6 MB de texto completo por pliego en Firestore

export function sanitizeFirestoreId(raw: string, prefix = 'doc'): string {
  const cleaned = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 110);
  if (cleaned && /^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

function clampStr(val: unknown, maxLen: number): string {
  const s = typeof val === 'string' ? val : val == null ? '' : String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function clampStringArray(arr: unknown, maxItems: number, maxItemLen = 300): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(item => clampStr(item, maxItemLen).trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function clampMemberUids(uids: string[], fallbackUid: string): string[] {
  const unique = Array.from(new Set([fallbackUid, ...uids.filter(Boolean)])).slice(0, 25);
  return unique.length > 0 ? unique : [fallbackUid];
}

export interface WorkspaceSessionInfo {
  workspaceId: string;
  uid: string;
  email: string;
  role: 'admin' | 'engineer';
  memberUids: string[];
  workspaceExists: boolean;
}

export async function bootstrapWorkspaceForUser(user: User): Promise<WorkspaceSessionInfo | null> {
  if (!user?.uid || !user.emailVerified) return null;

  const uid = user.uid;
  const email = (user.email || '').toLowerCase().trim();
  const displayName = clampStr(user.displayName || email.split('@')[0] || 'Ingeniero', 120);
  const isBootAdmin = email === BOOTSTRAP_ADMIN_EMAIL;

  // 1. Guardar perfil privado (PII aislado por usuario)
  const profilePath = `users/${uid}/private/profile`;
  const profileRef = doc(db, 'users', uid, 'private', 'profile');
  try {
    const profSnap = await getDoc(profileRef);
    const deviceHint = clampStr(
      typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
        ? 'Celular / PWA'
        : 'Notebook / Escritorio',
      120
    );
    if (!profSnap.exists()) {
      await setDoc(profileRef, {
        uid,
        email: clampStr(email, 200),
        displayName,
        lastDevice: deviceHint,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, {
        email: clampStr(email, 200),
        displayName,
        lastDevice: deviceHint,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, profilePath);
  }

  const wsRef = doc(db, 'workspaces', DEFAULT_WORKSPACE_ID);
  const memberRef = doc(db, 'workspaces', DEFAULT_WORKSPACE_ID, 'members', uid);

  // 2. Verificar si usuario colaborador tiene invitación pendiente si aún no es miembro
  if (!isBootAdmin) {
    let isMember = false;
    try {
      const mSnap = await getDoc(memberRef);
      isMember = mSnap.exists();
    } catch {
      isMember = false;
    }

    if (!isMember && email) {
      const invitesPath = `workspaces/${DEFAULT_WORKSPACE_ID}/invites`;
      try {
        const invQ = query(
          collection(db, 'workspaces', DEFAULT_WORKSPACE_ID, 'invites'),
          where('invitedEmail', '==', email),
          where('status', '==', 'pending')
        );
        const invSnap = await getDocs(invQ);
        if (!invSnap.empty) {
          const invDoc = invSnap.docs[0];
          const invData = invDoc.data();
          const batch = writeBatch(db);
          batch.set(memberRef, {
            uid,
            workspaceId: DEFAULT_WORKSPACE_ID,
            role: 'engineer',
            displayName,
            addedBy: clampStr(invData.createdBy || uid, 128),
            inviteId: invDoc.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.update(doc(db, 'workspaces', DEFAULT_WORKSPACE_ID, 'invites', invDoc.id), {
            status: 'accepted',
            acceptedByUid: uid,
            updatedAt: serverTimestamp(),
          });
          batch.update(wsRef, {
            memberUids: arrayUnion(uid),
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } else {
          return null; // Usuario no invitado aún
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, invitesPath);
      }
    }
  }

  // 3. Obtener o inicializar workspace principal
  try {
    const wsSnap = await getDoc(wsRef);
    if (!wsSnap.exists()) {
      await setDoc(wsRef, {
        id: DEFAULT_WORKSPACE_ID,
        name: 'Obras 132 kV - LAT El Bracho - Villa Quinteros',
        ownerId: uid,
        memberUids: [uid],
        defaultDriveFolderId: DEFAULT_DRIVE_ROOT_FOLDER_ID,
        configApiUrl: '',
        configR2AccountId: 'e1d197bd1aa5e242733d883eab2a9322',
        configR2Bucket: 'backup-obra-132kv',
        notasCampo: '',
        ultimoInforme: '',
        megabytesR2: '0 MB',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(memberRef, {
        uid,
        workspaceId: DEFAULT_WORKSPACE_ID,
        role: 'admin',
        displayName,
        addedBy: uid,
        inviteId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        workspaceId: DEFAULT_WORKSPACE_ID,
        uid,
        email,
        role: 'admin',
        memberUids: [uid],
        workspaceExists: false,
      };
    }

    const wsData = wsSnap.data();
    let memberUids = Array.isArray(wsData.memberUids)
      ? wsData.memberUids.map((x: any) => String(x)).filter(Boolean)
      : [];

    if (!memberUids.includes(uid)) {
      memberUids = clampMemberUids(memberUids, uid);
      await updateDoc(wsRef, {
        memberUids,
        updatedAt: serverTimestamp(),
      });
    }

    const mSnap = await getDoc(memberRef);
    let role: 'admin' | 'engineer' = isBootAdmin ? 'admin' : 'engineer';
    if (!mSnap.exists()) {
      await setDoc(memberRef, {
        uid,
        workspaceId: DEFAULT_WORKSPACE_ID,
        role,
        displayName,
        addedBy: clampStr(wsData.ownerId || uid, 128),
        inviteId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      role = mSnap.data()?.role === 'admin' || isBootAdmin ? 'admin' : 'engineer';
    }

    return {
      workspaceId: DEFAULT_WORKSPACE_ID,
      uid,
      email,
      role,
      memberUids,
      workspaceExists: true,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${DEFAULT_WORKSPACE_ID}`);
  }
}

export interface WorkspaceInviteRecord {
  id: string;
  invitedEmail: string;
  role: 'admin' | 'engineer';
  status: 'pending' | 'accepted';
  createdBy: string;
  acceptedByUid: string;
}

export async function invitarColaboradorWorkspace(params: {
  session: WorkspaceSessionInfo;
  emailColaborador: string;
}): Promise<string> {
  const emailClean = params.emailColaborador.trim().toLowerCase();
  if (!emailClean || !emailClean.includes('@') || !emailClean.includes('.')) {
    throw new Error('Ingresa un correo electrónico válido (corporativo o Gmail).');
  }
  const inviteId = sanitizeFirestoreId(`inv_${emailClean}`, 'inv');
  const invPath = `workspaces/${params.session.workspaceId}/invites/${inviteId}`;
  try {
    await setDoc(doc(db, 'workspaces', params.session.workspaceId, 'invites', inviteId), {
      id: inviteId,
      workspaceId: params.session.workspaceId,
      invitedEmail: clampStr(emailClean, 200),
      role: 'engineer',
      status: 'pending',
      createdBy: params.session.uid,
      acceptedByUid: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return inviteId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, invPath);
  }
}

export async function listarInvitacionesWorkspace(
  session: WorkspaceSessionInfo
): Promise<WorkspaceInviteRecord[]> {
  const invPath = `workspaces/${session.workspaceId}/invites`;
  try {
    const colRef = collection(db, 'workspaces', session.workspaceId, 'invites');
    const qRef =
      session.email === BOOTSTRAP_ADMIN_EMAIL
        ? colRef
        : query(colRef, where('createdBy', '==', session.uid));
    const snap = await getDocs(qRef);
    return snap.docs
      .map(d => {
        const data = d.data();
        return {
          id: d.id,
          invitedEmail: String(data.invitedEmail || ''),
          role: data.role === 'admin' ? ('admin' as const) : ('engineer' as const),
          status: data.status === 'accepted' ? ('accepted' as const) : ('pending' as const),
          createdBy: String(data.createdBy || ''),
          acceptedByUid: String(data.acceptedByUid || ''),
        };
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return a.invitedEmail.localeCompare(b.invitedEmail);
      });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, invPath);
  }
}

export async function revocarInvitacionWorkspace(
  session: WorkspaceSessionInfo,
  inviteId: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(inviteId, 'inv');
  const invPath = `workspaces/${session.workspaceId}/invites/${safeId}`;
  try {
    await deleteDoc(doc(db, 'workspaces', session.workspaceId, 'invites', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, invPath);
  }
}

export async function syncWorkspaceSettingsFields(
  session: WorkspaceSessionInfo,
  fields: {
    config?: AppConfig;
    notasCampo?: string;
    ultimoInforme?: string;
    megabytesR2?: string;
    defaultDriveFolderId?: string;
  }
) {
  const wsPath = `workspaces/${session.workspaceId}`;
  const wsRef = doc(db, 'workspaces', session.workspaceId);
  const payload: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (fields.config) {
    payload.configApiUrl = clampStr(fields.config.apiUrl, 500);
    payload.configR2AccountId = clampStr(fields.config.r2AccountId, 128);
    payload.configR2Bucket = clampStr(fields.config.r2Bucket, 128);
  }
  if (fields.notasCampo !== undefined) {
    payload.notasCampo = clampStr(fields.notasCampo, 50000);
  }
  if (fields.ultimoInforme !== undefined) {
    payload.ultimoInforme = clampStr(fields.ultimoInforme, 150000);
  }
  if (fields.megabytesR2 !== undefined) {
    payload.megabytesR2 = clampStr(fields.megabytesR2, 40);
  }
  if (fields.defaultDriveFolderId !== undefined) {
    payload.defaultDriveFolderId = clampStr(fields.defaultDriveFolderId, 200);
  }

  try {
    await updateDoc(wsRef, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, wsPath);
  }
}

async function upsertDocCollection<T extends Record<string, any>>(params: {
  session: WorkspaceSessionInfo;
  subcollection: string;
  docId: string;
  dataFields: T;
  knownCreatedAt?: Map<string, Timestamp>;
}) {
  const { session, subcollection, docId, dataFields, knownCreatedAt } = params;
  const safeId = sanitizeFirestoreId(docId);
  const fullPath = `workspaces/${session.workspaceId}/${subcollection}/${safeId}`;
  const docRef = doc(db, 'workspaces', session.workspaceId, subcollection, safeId);
  const memberUids = clampMemberUids(session.memberUids, session.uid);

  const key = `${subcollection}/${safeId}`;
  const existingCreatedAt = knownCreatedAt?.get(key);

  try {
    if (existingCreatedAt) {
      await updateDoc(docRef, {
        ...dataFields,
        memberUids,
        updatedAt: serverTimestamp(),
      });
    } else {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          ...dataFields,
          memberUids,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          id: safeId,
          workspaceId: session.workspaceId,
          ownerId: session.uid,
          memberUids,
          ...dataFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, fullPath);
  }
}

export async function deleteWorkspaceSubdoc(
  session: WorkspaceSessionInfo,
  subcollection: string,
  docId: string
) {
  const safeId = sanitizeFirestoreId(docId);
  const fullPath = `workspaces/${session.workspaceId}/${subcollection}/${safeId}`;
  try {
    await deleteDoc(doc(db, 'workspaces', session.workspaceId, subcollection, safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, fullPath);
  }
}

function buildHitoFields(h: Hito) {
  return {
    codigo: clampStr(h.codigo || '', 64),
    nombre: clampStr(h.nombre || 'Hito sin título', 300),
    frente: clampStr(h.frente || '', 120),
    fechaObjetivo: clampStr(h.fechaObjetivo || '', 32),
    pesoContractual: clampStr(h.pesoContractual || 'GENERAL', 80),
    responsable: clampStr(h.responsable || '', 160),
    requisitosCriticos: clampStringArray(h.requisitosCriticos, 40, 260),
    planosRequeridos: clampStringArray(h.planosRequeridos, 40, 260),
  };
}

function buildPlanoFields(p: Plano) {
  return {
    codigo: clampStr(p.codigo || 'SIN-COD', 80),
    descripcion: clampStr(p.descripcion || '', 400),
    disciplina: clampStr(p.disciplina || '', 120),
    revision: clampStr(p.revision || '', 32),
    proyecto: clampStr(p.proyecto || '', 120),
    estado: clampStr(p.estado || '', 64),
    selloApc: Boolean(p.selloApc),
    urlDrive: clampStr(p.urlDrive || '', 500),
    urlR2: clampStr(p.urlR2 || '', 500),
    fecha: clampStr(p.fecha || p.fechaDocumento || p.fechaSubida || '', 40),
  };
}

function buildInterferenciaFields(item: Interferencia) {
  return {
    empresa: clampStr(item.empresa || item.carpetaNombre || 'Organismo', 200),
    tipoInterferencia: clampStr(item.tipoInterferencia || '', 300),
    normativa: clampStr(item.normativa || '', 200),
    estadoTramite: clampStr(item.estadoTramite || 'SOLICITUD DETECTADA', 80),
    vanosAfectados: clampStr(item.vanosAfectados || '', 300),
    faltantes: clampStringArray(item.faltantes, 50, 260),
    carpetaNombre: clampStr(item.carpetaNombre || '', 200),
    carpetaDriveId: clampStr(item.carpetaDriveId || '', 128),
    archivoSolicitudNombre: clampStr(item.archivoSolicitudNombre || '', 260),
    archivoSolicitudId: clampStr(item.archivoSolicitudId || '', 128),
    archivoSolicitudUrl: clampStr(item.archivoSolicitudUrl || '', 500),
    fechaDocumento: clampStr(item.fechaDocumento || '', 64),
    resumenSolicitud: clampStr(item.resumenSolicitud || '', 4000),
    origen: clampStr(item.origen || 'drive', 40),
    archivosCarpetaCount: Number(item.archivosCarpetaCount || 0),
    documentosLeidos: clampStringArray(item.documentosLeidos, 20, 200),
  };
}

function buildMinutaFields(m: MinutaReunion) {
  const origenVal =
    m.origen === 'drive' || m.origen === 'archivo' || m.origen === 'texto' || m.origen === 'manual'
      ? m.origen
      : 'texto';
  return {
    codigo: clampStr(m.codigo || '', 80),
    titulo: clampStr(m.titulo || m.codigo || 'Minuta de Reunión', 300),
    fechaReunion: clampStr(m.fechaReunion || '', 32),
    frente: clampStr(m.frente || '', 120),
    participantes: clampStr(m.participantes || '', 600),
    origen: origenVal,
    nombreArchivo: clampStr(m.nombreArchivo || '', 260),
    driveFileId: clampStr(m.driveFileId || '', 128),
    driveUrl: clampStr(m.driveUrl || '', 500),
    driveRuta: clampStr(m.driveRuta || '', 400),
    driveModifiedTime: clampStr(m.driveModifiedTime || '', 64),
    resumen: clampStr(m.resumen || '', 4000),
    contenidoTexto: clampStr(m.contenidoTexto || '', 150000),
    fechaCarga: clampStr(m.fechaCarga || '', 64),
  };
}

function buildCompromisoFields(c: CompromisoMinuta) {
  const estadoVal =
    c.estado === 'PENDIENTE' || c.estado === 'EN_CURSO' || c.estado === 'CUMPLIDO' || c.estado === 'INCUMPLIDO'
      ? c.estado
      : 'PENDIENTE';
  return {
    minutaId: clampStr(c.minutaId || '', 128),
    minutaCodigo: clampStr(c.minutaCodigo || '', 80),
    minutaFecha: clampStr(c.minutaFecha || '', 32),
    numeroItem: clampStr(c.numeroItem || '', 40),
    descripcion: clampStr(c.descripcion || 'Compromiso de obra', 2000),
    responsable: clampStr(c.responsable || '', 160),
    area: clampStr(c.area || '', 120),
    frente: clampStr(c.frente || '', 120),
    fechaLimite: clampStr(c.fechaLimite || '', 32),
    estado: estadoVal,
    observaciones: clampStr(c.observaciones || '', 2000),
    documentosRelacionados: clampStringArray(c.documentosRelacionados, 30, 200),
    notasPedidoIds: clampStringArray(c.notasPedidoIds, 30, 120),
  };
}

function buildNotaPedidoFields(n: NotaPedidoIngenieria) {
  return {
    numeroNota: clampStr(n.numeroNota || 'NP-ING', 80),
    fechaEmision: clampStr(n.fechaEmision || '', 32),
    emisor: clampStr(n.emisor || '', 200),
    destinatario: clampStr(n.destinatario || '', 200),
    frente: clampStr(n.frente || '', 120),
    asunto: clampStr(n.asunto || '', 400),
    plazoDescargoDias: Math.max(1, Number(n.plazoDescargoDias) || 5),
    compromisoIds: clampStringArray(n.compromisoIds, 50, 128),
    minutasReferenciadas: clampStringArray(n.minutasReferenciadas, 30, 128),
    contenidoMarkdown: clampStr(n.contenidoMarkdown || 'Sin contenido', 150000),
    fuenteGeneracion: clampStr(n.fuenteGeneracion || '', 80),
  };
}

function buildNotaLibroFields(n: NotaLibro) {
  const sentidoVal =
    n.sentido === 'pregunta_solicitud' ||
    n.sentido === 'respuesta_devolucion' ||
    n.sentido === 'intimacion_observacion' ||
    n.sentido === 'informativa'
      ? n.sentido
      : 'informativa';

  const estadoVal =
    n.estadoRespuesta === 'CONTESTADA' ||
    n.estadoRespuesta === 'PARCIALMENTE_CONTESTADA' ||
    n.estadoRespuesta === 'SIN_RESPUESTA' ||
    n.estadoRespuesta === 'CON_DISCREPANCIA' ||
    n.estadoRespuesta === 'INFORMATIVA'
      ? n.estadoRespuesta
      : 'SIN_RESPUESTA';

  const origenVal =
    n.origen === 'drive' || n.origen === 'archivo' || n.origen === 'texto' ? n.origen : 'archivo';

  return {
    codigo: clampStr(n.codigo || 'LIB-001', 80),
    tipoNota: clampStr(n.tipoNota || 'Comunicación', 60),
    titulo: clampStr(n.titulo || n.codigo || 'Nota de Libro', 300),
    fecha: clampStr(n.fecha || '', 32),
    actorEmisor: clampStr(n.actorEmisor || 'Otro', 80),
    emisorDetalle: clampStr(n.emisorDetalle || '', 200),
    actorReceptor: clampStr(n.actorReceptor || 'Otro', 80),
    receptorDetalle: clampStr(n.receptorDetalle || '', 200),
    sentido: sentidoVal,
    frente: clampStr(n.frente || '', 120),
    referenciasNotas: clampStringArray(n.referenciasNotas, 40, 80),
    respondeANotas: clampStringArray(n.respondeANotas, 40, 80),
    respondidaPorNotas: clampStringArray(n.respondidaPorNotas, 40, 80),
    estadoRespuesta: estadoVal,
    preguntasOPuntos: clampStringArray(n.preguntasOPuntos, 40, 300),
    respuestasODescargos: clampStringArray(n.respuestasODescargos, 40, 300),
    resumen: clampStr(n.resumen || '', 4000),
    contenidoTexto: clampStr(n.contenidoTexto || '', 150000),
    origen: origenVal,
    nombreArchivo: clampStr(n.nombreArchivo || '', 260),
    driveFileId: clampStr(n.driveFileId || '', 128),
    driveUrl: clampStr(n.driveUrl || '', 500),
    driveRuta: clampStr(n.driveRuta || '', 400),
    driveModifiedTime: clampStr(n.driveModifiedTime || '', 64),
    fechaCarga: clampStr(n.fechaCarga || '', 64),
    manualOverride: Boolean(n.manualOverride),
  };
}

export async function syncHitosCollectionToFirestore(
  session: WorkspaceSessionInfo,
  nuevosHitos: Hito[],
  anterioresHitos: Hito[]
) {
  const newIds = new Set(nuevosHitos.map(h => sanitizeFirestoreId(h.id)));
  for (const h of nuevosHitos) {
    await upsertDocCollection({
      session,
      subcollection: 'hitos',
      docId: h.id,
      dataFields: buildHitoFields(h),
    });
  }
  for (const prev of anterioresHitos) {
    const prevSafeId = sanitizeFirestoreId(prev.id);
    if (!newIds.has(prevSafeId)) {
      await deleteWorkspaceSubdoc(session, 'hitos', prevSafeId);
    }
  }
}

export async function syncPlanosCollectionToFirestore(
  session: WorkspaceSessionInfo,
  planos: Plano[]
) {
  const memberUids = clampMemberUids(session.memberUids, session.uid);
  // Usar chunks de batch (<= 250 ops por batch) para sincronizar catálogo rápido
  const existentesSnap = await getDocs(
    query(
      collection(db, 'workspaces', session.workspaceId, 'planos'),
      where('memberUids', 'array-contains', session.uid)
    )
  ).catch(() => null);
  const existentesIds = new Set<string>(existentesSnap ? existentesSnap.docs.map(d => d.id) : []);

  let batch = writeBatch(db);
  let ops = 0;

  const commitIfNeeded = async () => {
    if (ops >= 200) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  };

  for (const p of planos) {
    const safeId = sanitizeFirestoreId(p.codigo || p.descripcion, 'plano');
    const docRef = doc(db, 'workspaces', session.workspaceId, 'planos', safeId);
    const fields = buildPlanoFields(p);
    if (existentesIds.has(safeId)) {
      batch.update(docRef, {
        ...fields,
        memberUids,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(docRef, {
        id: safeId,
        workspaceId: session.workspaceId,
        ownerId: session.uid,
        memberUids,
        ...fields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    ops++;
    await commitIfNeeded();
  }

  if (ops > 0) {
    await batch.commit();
  }
}

export async function syncInterferenciasCollectionToFirestore(
  session: WorkspaceSessionInfo,
  nuevas: Interferencia[],
  anteriores: Interferencia[]
) {
  const newIds = new Set<string>();
  for (let i = 0; i < nuevas.length; i++) {
    const item = nuevas[i];
    const safeId = sanitizeFirestoreId(item.id || item.carpetaDriveId || item.empresa || `int_${i + 1}`, 'int');
    newIds.add(safeId);
    await upsertDocCollection({
      session,
      subcollection: 'interferencias',
      docId: safeId,
      dataFields: buildInterferenciaFields(item),
    });
  }

  for (const prev of anteriores) {
    const prevId = sanitizeFirestoreId(prev.id || prev.carpetaDriveId || prev.empresa || '', 'int');
    if (prevId && !newIds.has(prevId)) {
      await deleteWorkspaceSubdoc(session, 'interferencias', prevId);
    }
  }
}

export async function syncPliegoToFirestore(session: WorkspaceSessionInfo, pliego: PliegoReal) {
  const safeId = sanitizeFirestoreId(pliego.id, 'pliego');
  const textoCompleto = pliego.contenidoTexto || '';
  const chunks: string[] = [];
  for (let i = 0; i < textoCompleto.length && chunks.length < MAX_CHUNKS_PER_PLIEGO; i += CHUNK_CHAR_SIZE) {
    chunks.push(textoCompleto.slice(i, i + CHUNK_CHAR_SIZE));
  }

  await upsertDocCollection({
    session,
    subcollection: 'pliegos',
    docId: safeId,
    dataFields: {
      nombre: clampStr(pliego.nombre, 260),
      tipoMime: clampStr(pliego.tipoMime || 'application/pdf', 160),
      tamanioBytes: Number(pliego.tamanioBytes || 0),
      tamanioTexto: clampStr(pliego.tamanioTexto || '0 KB', 40),
      fechaSubida: clampStr(pliego.fechaSubida || '', 64),
      resumen: clampStr(pliego.resumen || '', 2000),
      paginas: Number(pliego.paginas || 0),
      caracteresTexto: Number(pliego.caracteresTexto || textoCompleto.length),
      esEscaneado: Boolean(pliego.esEscaneado),
      tiempoProcesoMs: Number(pliego.tiempoProcesoMs || 0),
      contenidoTextoPreview: clampStr(textoCompleto, 150000),
      chunkCount: chunks.length,
    },
  });

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunkId = `${safeId}_c${idx}`;
    await upsertDocCollection({
      session,
      subcollection: 'pliego_chunks',
      docId: chunkId,
      dataFields: {
        pliegoId: safeId,
        chunkIndex: idx,
        contenidoTexto: chunks[idx],
      },
    });
  }
}

export async function deletePliegoFromFirestore(session: WorkspaceSessionInfo, pliegoId: string, chunkCount = 6) {
  const safeId = sanitizeFirestoreId(pliegoId);
  await deleteWorkspaceSubdoc(session, 'pliegos', safeId);
  for (let i = 0; i < Math.max(chunkCount, MAX_CHUNKS_PER_PLIEGO); i++) {
    try {
      await deleteDoc(doc(db, 'workspaces', session.workspaceId, 'pliego_chunks', `${safeId}_c${i}`));
    } catch {
      // Ignorar si chunk no existe
    }
  }
}

export async function syncMinutaToFirestore(session: WorkspaceSessionInfo, m: MinutaReunion) {
  await upsertDocCollection({
    session,
    subcollection: 'minutas',
    docId: m.id,
    dataFields: buildMinutaFields(m),
  });
}

export async function syncCompromisoToFirestore(session: WorkspaceSessionInfo, c: CompromisoMinuta) {
  await upsertDocCollection({
    session,
    subcollection: 'compromisos',
    docId: c.id,
    dataFields: buildCompromisoFields(c),
  });
}

export async function syncNotaPedidoToFirestore(session: WorkspaceSessionInfo, n: NotaPedidoIngenieria) {
  await upsertDocCollection({
    session,
    subcollection: 'notas_pedido',
    docId: n.id,
    dataFields: buildNotaPedidoFields(n),
  });
}

export async function syncFotoCampoToFirestore(session: WorkspaceSessionInfo, f: FotoCampo) {
  // Solo sincronizar fotos <= 440 KB en DataURL para cumplir límite Firestore
  if (!f.dataUrl || f.dataUrl.length > 440000) {
    return;
  }
  await upsertDocCollection({
    session,
    subcollection: 'fotos_campo',
    docId: f.id,
    dataFields: {
      nombre: clampStr(f.nombre || 'Foto campo', 200),
      fecha: clampStr(f.fecha || '', 64),
      dataUrl: f.dataUrl,
      analisisIA: clampStr(f.analisisIA || '', 4000),
      frente: clampStr(f.frente || '', 120),
      interferenciaId: clampStr(f.interferenciaId || '', 128),
    },
  });
}

export async function syncAudioCampoToFirestore(session: WorkspaceSessionInfo, a: NotaAudio) {
  if (!a.dataUrl || a.dataUrl.length > 440000) {
    return;
  }
  await upsertDocCollection({
    session,
    subcollection: 'audios_campo',
    docId: a.id,
    dataFields: {
      fecha: clampStr(a.fecha || '', 64),
      duracion: clampStr(a.duracion || '0:00', 32),
      dataUrl: a.dataUrl,
      transcripcion: clampStr(a.transcripcion || '', 10000),
    },
  });
}

export async function syncChatAdjuntoToFirestore(
  session: WorkspaceSessionInfo,
  adj: ChatAdjuntoPdf
) {
  await upsertDocCollection({
    session,
    subcollection: 'chat_adjuntos',
    docId: adj.id,
    dataFields: {
      nombre: clampStr(adj.nombre || 'Documento PDF', 260),
      tipoMime: clampStr(adj.tipoMime || 'application/pdf', 160),
      tamanioBytes: Number(adj.tamanioBytes || 0),
      tamanioTexto: clampStr(adj.tamanioTexto || '0 KB', 40),
      fechaSubida: clampStr(adj.fechaSubida || '', 64),
      paginas: Number(adj.paginas || 0),
      caracteresTexto: Number(adj.caracteresTexto || 0),
      esEscaneado: Boolean(adj.esEscaneado),
      tiempoProcesoMs: Number(adj.tiempoProcesoMs || 0),
      metricasDetectadas: clampStringArray(adj.metricasDetectadas, 40, 200),
      contenidoTexto: clampStr(adj.contenidoTexto || '', 150000),
    },
  });
}

const BACKFILL_SUBCOLLECTIONS = [
  'hitos',
  'planos',
  'interferencias',
  'pliegos',
  'pliego_chunks',
  'minutas',
  'compromisos',
  'notas_pedido',
  'fotos_campo',
  'audios_campo',
  'chat_adjuntos',
  'notas_libro',
] as const;

export async function backfillWorkspaceMemberUids(
  session: WorkspaceSessionInfo,
  latestMemberUids: string[]
): Promise<number> {
  const targetUids = clampMemberUids(latestMemberUids, session.uid);
  if (targetUids.length <= 1) return 0;

  let actualizados = 0;
  for (const sub of BACKFILL_SUBCOLLECTIONS) {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'workspaces', session.workspaceId, sub),
          where('memberUids', 'array-contains', session.uid)
        )
      );
      if (snap.empty) continue;

      let batch = writeBatch(db);
      let ops = 0;
      for (const d of snap.docs) {
        const currentUids: string[] = Array.isArray(d.data()?.memberUids)
          ? d.data().memberUids.map((x: unknown) => String(x))
          : [];
        const faltante = targetUids.some(u => !currentUids.includes(u));
        if (!faltante) continue;

        const merged = clampMemberUids([...currentUids, ...targetUids], session.uid);
        batch.update(d.ref, {
          memberUids: merged,
          updatedAt: serverTimestamp(),
        });
        ops++;
        actualizados++;
        if (ops >= 200) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      if (ops > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.warn(`[FirestoreSync] Backfill memberUids omitido en ${sub}:`, err);
    }
  }
  return actualizados;
}

export async function syncNotaLibroToFirestore(session: WorkspaceSessionInfo, nota: NotaLibro) {
  await upsertDocCollection({
    session,
    subcollection: 'notas_libro',
    docId: nota.id,
    dataFields: buildNotaLibroFields(nota),
  });
}

export async function syncNotasLibroCollectionToFirestore(
  session: WorkspaceSessionInfo,
  nuevas: NotaLibro[],
  anteriores: NotaLibro[]
) {
  const newIds = new Set<string>();
  for (const item of nuevas) {
    const safeId = sanitizeFirestoreId(item.id, 'nl');
    newIds.add(safeId);
    await upsertDocCollection({
      session,
      subcollection: 'notas_libro',
      docId: safeId,
      dataFields: buildNotaLibroFields(item),
    });
  }
  for (const prev of anteriores) {
    const prevId = sanitizeFirestoreId(prev.id, 'nl');
    if (prevId && !newIds.has(prevId)) {
      await deleteWorkspaceSubdoc(session, 'notas_libro', prevId);
    }
  }
}

export interface WorkspaceSyncCallbacks {
  onWorkspaceFields: (data: {
    config: Partial<AppConfig>;
    notasCampo: string;
    ultimoInforme: string;
    megabytesR2: string;
    defaultDriveFolderId: string;
    memberUids: string[];
  }) => void;
  onHitos: (items: Hito[]) => void;
  onPlanos: (items: Plano[]) => void;
  onInterferencias: (items: Interferencia[]) => void;
  onPliegos: (items: PliegoReal[]) => void;
  onMinutas: (items: MinutaReunion[]) => void;
  onCompromisos: (items: CompromisoMinuta[]) => void;
  onNotasPedido: (items: NotaPedidoIngenieria[]) => void;
  onFotosCampo: (items: FotoCampo[]) => void;
  onAudiosCampo?: (items: NotaAudio[]) => void;
  onChatAdjuntos?: (items: ChatAdjuntoPdf[]) => void;
  onNotasLibro: (items: NotaLibro[]) => void;
}

export function subscribeWorkspaceRealtime(
  session: WorkspaceSessionInfo,
  callbacks: WorkspaceSyncCallbacks
): () => void {
  const { workspaceId, uid } = session;
  const unsubscribers: Array<() => void> = [];

  // Reconstruir pliegos + chunks en tiempo real
  let latestPliegoDocs: any[] = [];
  let latestChunksByPliego = new Map<string, Array<{ idx: number; text: string }>>();

  const emitPliegosCombinados = () => {
    const combinados: PliegoReal[] = latestPliegoDocs.map(p => {
      const chunks = latestChunksByPliego.get(p.id);
      let fullText = p.contenidoTextoPreview || '';
      if (chunks && chunks.length > 0) {
        const ordered = [...chunks].sort((a, b) => a.idx - b.idx);
        fullText = ordered.map(c => c.text).join('');
      }
      return {
        id: p.id,
        nombre: p.nombre,
        tipoMime: p.tipoMime,
        tamanioBytes: p.tamanioBytes,
        tamanioTexto: p.tamanioTexto,
        fechaSubida: p.fechaSubida,
        resumen: p.resumen,
        paginas: p.paginas,
        caracteresTexto: p.caracteresTexto,
        esEscaneado: p.esEscaneado,
        tiempoProcesoMs: p.tiempoProcesoMs,
        contenidoTexto: fullText,
      };
    });
    callbacks.onPliegos(combinados);
  };

  // 1. Documento principal del workspace
  const wsPath = `workspaces/${workspaceId}`;
  unsubscribers.push(
    onSnapshot(
      doc(db, 'workspaces', workspaceId),
      snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        callbacks.onWorkspaceFields({
          config: {
            apiUrl: d.configApiUrl || '',
            r2AccountId: d.configR2AccountId || 'e1d197bd1aa5e242733d883eab2a9322',
            r2Bucket: d.configR2Bucket || 'backup-obra-132kv',
          },
          notasCampo: typeof d.notasCampo === 'string' ? d.notasCampo : '',
          ultimoInforme: typeof d.ultimoInforme === 'string' ? d.ultimoInforme : '',
          megabytesR2: typeof d.megabytesR2 === 'string' ? d.megabytesR2 : '0 MB',
          defaultDriveFolderId: typeof d.defaultDriveFolderId === 'string' ? d.defaultDriveFolderId : '',
          memberUids: Array.isArray(d.memberUids) ? d.memberUids : [uid],
        });
      },
      error => handleFirestoreError(error, OperationType.GET, wsPath)
    )
  );

  // Helper genérico para subcolecciones con query filtrada por memberUids
  const listenSubcollection = (
    sub: string,
    handler: (docs: Array<Record<string, any>>) => void
  ) => {
    const pathStr = `workspaces/${workspaceId}/${sub}`;
    const qRef = query(
      collection(db, 'workspaces', workspaceId, sub),
      where('memberUids', 'array-contains', uid)
    );
    unsubscribers.push(
      onSnapshot(
        qRef,
        snap => {
          handler(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        },
        error => handleFirestoreError(error, OperationType.LIST, pathStr)
      )
    );
  };

  listenSubcollection('hitos', docs => {
    if (docs.length === 0) return;
    const hitos: Hito[] = docs
      .map(d => ({
        id: d.id,
        codigo: d.codigo || '',
        nombre: d.nombre || '',
        frente: d.frente || '',
        fechaObjetivo: d.fechaObjetivo || '',
        pesoContractual: d.pesoContractual || '',
        responsable: d.responsable || '',
        requisitosCriticos: Array.isArray(d.requisitosCriticos) ? d.requisitosCriticos : [],
        planosRequeridos: Array.isArray(d.planosRequeridos) ? d.planosRequeridos : [],
      }))
      .sort((a, b) => (a.fechaObjetivo || '').localeCompare(b.fechaObjetivo || ''));
    callbacks.onHitos(hitos);
  });

  listenSubcollection('planos', docs => {
    if (docs.length === 0) return;
    const planos: Plano[] = docs.map(d => ({
      codigo: d.codigo || d.id,
      descripcion: d.descripcion || '',
      disciplina: d.disciplina || '',
      revision: d.revision || '',
      proyecto: d.proyecto || '',
      estado: d.estado || '',
      selloApc: Boolean(d.selloApc),
      urlDrive: d.urlDrive || '',
      urlR2: d.urlR2 || '',
      fecha: d.fecha || '',
    }));
    callbacks.onPlanos(planos);
  });

  listenSubcollection('interferencias', docs => {
    const lista: Interferencia[] = docs.map(d => ({
      id: d.id,
      empresa: d.empresa || '',
      tipoInterferencia: d.tipoInterferencia || '',
      normativa: d.normativa || '',
      estadoTramite: d.estadoTramite || '',
      vanosAfectados: d.vanosAfectados || '',
      faltantes: Array.isArray(d.faltantes) ? d.faltantes : [],
      carpetaNombre: d.carpetaNombre || '',
      carpetaDriveId: d.carpetaDriveId || '',
      archivoSolicitudNombre: d.archivoSolicitudNombre || '',
      archivoSolicitudId: d.archivoSolicitudId || '',
      archivoSolicitudUrl: d.archivoSolicitudUrl || '',
      fechaDocumento: d.fechaDocumento || '',
      resumenSolicitud: d.resumenSolicitud || '',
      origen: d.origen === 'manual' ? 'manual' : 'drive',
      archivosCarpetaCount: Number(d.archivosCarpetaCount || 0),
      documentosLeidos: Array.isArray(d.documentosLeidos) ? d.documentosLeidos : [],
    }));
    callbacks.onInterferencias(lista);
  });

  listenSubcollection('pliegos', docs => {
    latestPliegoDocs = docs;
    emitPliegosCombinados();
  });

  listenSubcollection('pliego_chunks', docs => {
    const nextMap = new Map<string, Array<{ idx: number; text: string }>>();
    for (const d of docs) {
      const pId = String(d.pliegoId || '');
      if (!pId) continue;
      const arr = nextMap.get(pId) || [];
      arr.push({ idx: Number(d.chunkIndex || 0), text: String(d.contenidoTexto || '') });
      nextMap.set(pId, arr);
    }
    latestChunksByPliego = nextMap;
    emitPliegosCombinados();
  });

  listenSubcollection('minutas', docs => {
    const minutas: MinutaReunion[] = docs
      .map(d => ({
        id: d.id,
        codigo: d.codigo || '',
        titulo: d.titulo || '',
        fechaReunion: d.fechaReunion || '',
        frente: d.frente || '',
        participantes: d.participantes || '',
        origen: d.origen || 'texto',
        nombreArchivo: d.nombreArchivo || '',
        driveFileId: d.driveFileId || '',
        driveUrl: d.driveUrl || '',
        driveRuta: d.driveRuta || '',
        driveModifiedTime: d.driveModifiedTime || '',
        resumen: d.resumen || '',
        contenidoTexto: d.contenidoTexto || '',
        fechaCarga: d.fechaCarga || '',
      }))
      .sort((a, b) => (b.fechaReunion || '').localeCompare(a.fechaReunion || ''));
    callbacks.onMinutas(minutas);
  });

  listenSubcollection('compromisos', docs => {
    const comps: CompromisoMinuta[] = docs.map(d => ({
      id: d.id,
      minutaId: d.minutaId || '',
      minutaCodigo: d.minutaCodigo || '',
      minutaFecha: d.minutaFecha || '',
      numeroItem: d.numeroItem || '',
      descripcion: d.descripcion || '',
      responsable: d.responsable || '',
      area: d.area || '',
      frente: d.frente || '',
      fechaLimite: d.fechaLimite || '',
      estado: d.estado || 'PENDIENTE',
      observaciones: d.observaciones || '',
      documentosRelacionados: Array.isArray(d.documentosRelacionados) ? d.documentosRelacionados : [],
      notasPedidoIds: Array.isArray(d.notasPedidoIds) ? d.notasPedidoIds : [],
    }));
    callbacks.onCompromisos(comps);
  });

  listenSubcollection('notas_pedido', docs => {
    const notas: NotaPedidoIngenieria[] = docs
      .map(d => ({
        id: d.id,
        numeroNota: d.numeroNota || '',
        fechaEmision: d.fechaEmision || '',
        emisor: d.emisor || '',
        destinatario: d.destinatario || '',
        frente: d.frente || '',
        asunto: d.asunto || '',
        plazoDescargoDias: Number(d.plazoDescargoDias || 5),
        compromisoIds: Array.isArray(d.compromisoIds) ? d.compromisoIds : [],
        minutasReferenciadas: Array.isArray(d.minutasReferenciadas) ? d.minutasReferenciadas : [],
        contenidoMarkdown: d.contenidoMarkdown || '',
        fuenteGeneracion: d.fuenteGeneracion || '',
      }))
      .sort((a, b) => (b.fechaEmision || '').localeCompare(a.fechaEmision || ''));
    callbacks.onNotasPedido(notas);
  });

  listenSubcollection('fotos_campo', docs => {
    const fotos: FotoCampo[] = docs.map(d => ({
      id: d.id,
      nombre: d.nombre || '',
      fecha: d.fecha || '',
      dataUrl: d.dataUrl || '',
      analisisIA: d.analisisIA || '',
      frente: d.frente || '',
      interferenciaId: d.interferenciaId || '',
    }));
    callbacks.onFotosCampo(fotos);
  });

  if (callbacks.onAudiosCampo) {
    listenSubcollection('audios_campo', docs => {
      const audios: NotaAudio[] = docs.map(d => ({
        id: d.id,
        fecha: d.fecha || '',
        duracion: d.duracion || '0:00',
        dataUrl: d.dataUrl || '',
        transcripcion: d.transcripcion || '',
      }));
      callbacks.onAudiosCampo?.(audios);
    });
  }

  if (callbacks.onChatAdjuntos) {
    listenSubcollection('chat_adjuntos', docs => {
      const adjuntos: ChatAdjuntoPdf[] = docs.map(d => ({
        id: d.id,
        nombre: d.nombre || '',
        tipoMime: d.tipoMime || 'application/pdf',
        tamanioBytes: Number(d.tamanioBytes || 0),
        tamanioTexto: d.tamanioTexto || '0 KB',
        fechaSubida: d.fechaSubida || '',
        paginas: Number(d.paginas || 0),
        caracteresTexto: Number(d.caracteresTexto || 0),
        esEscaneado: Boolean(d.esEscaneado),
        tiempoProcesoMs: Number(d.tiempoProcesoMs || 0),
        metricasDetectadas: Array.isArray(d.metricasDetectadas) ? d.metricasDetectadas : [],
        contenidoTexto: d.contenidoTexto || '',
      }));
      callbacks.onChatAdjuntos?.(adjuntos);
    });
  }

  listenSubcollection('notas_libro', docs => {
    const notasLibro: NotaLibro[] = docs
      .map(d => ({
        id: d.id,
        codigo: d.codigo || '',
        tipoNota: d.tipoNota || 'Comunicación',
        titulo: d.titulo || '',
        fecha: d.fecha || '',
        actorEmisor: d.actorEmisor || 'Otro',
        emisorDetalle: d.emisorDetalle || '',
        actorReceptor: d.actorReceptor || 'Otro',
        receptorDetalle: d.receptorDetalle || '',
        sentido: d.sentido || 'informativa',
        frente: d.frente || '',
        referenciasNotas: Array.isArray(d.referenciasNotas) ? d.referenciasNotas : [],
        respondeANotas: Array.isArray(d.respondeANotas) ? d.respondeANotas : [],
        respondidaPorNotas: Array.isArray(d.respondidaPorNotas) ? d.respondidaPorNotas : [],
        estadoRespuesta: d.estadoRespuesta || 'SIN_RESPUESTA',
        preguntasOPuntos: Array.isArray(d.preguntasOPuntos) ? d.preguntasOPuntos : [],
        respuestasODescargos: Array.isArray(d.respuestasODescargos) ? d.respuestasODescargos : [],
        resumen: d.resumen || '',
        contenidoTexto: d.contenidoTexto || '',
        origen: d.origen || 'archivo',
        nombreArchivo: d.nombreArchivo || '',
        driveFileId: d.driveFileId || '',
        driveUrl: d.driveUrl || '',
        driveRuta: d.driveRuta || '',
        driveModifiedTime: d.driveModifiedTime || '',
        fechaCarga: d.fechaCarga || '',
        manualOverride: Boolean(d.manualOverride),
      }))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    callbacks.onNotasLibro(notasLibro);
  });

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}

export interface WorkspaceIAControlState {
  modelosPagosHabilitados: boolean;
  usuariosPagosAutorizados: string[];
  limitesPorUsuarioUsd?: Record<string, number>;
}

function normalizeAuthorizedEmailsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().toLowerCase();
    if (!clean || clean.length < 3 || clean.length > 200 || !clean.includes('@') || !clean.includes('.')) {
      continue;
    }
    seen.add(clean);
    if (seen.size >= 50) break;
  }
  return Array.from(seen).sort();
}

function normalizeUserUsdLimitsMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const clean = k.trim().toLowerCase();
    if (!clean || clean.length < 3 || clean.length > 200 || !clean.includes('@') || !clean.includes('.')) {
      continue;
    }
    const num = Number(v);
    if (Number.isFinite(num) && num >= 0) {
      out[clean] = Math.min(1000, Number(num.toFixed(4)));
    }
    if (Object.keys(out).length >= 50) break;
  }
  return out;
}

export function subscribeWorkspaceIAControl(
  workspaceId: string,
  onChange: (state: WorkspaceIAControlState | null) => void
): () => void {
  const safeWsId = sanitizeFirestoreId(workspaceId, 'ws');
  const controlRef = doc(db, 'workspaces', safeWsId, 'config', 'ia_control');
  return onSnapshot(
    controlRef,
    snap => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const data = snap.data();
      onChange({
        modelosPagosHabilitados: Boolean(data?.modelosPagosHabilitados),
        usuariosPagosAutorizados: normalizeAuthorizedEmailsList(data?.usuariosPagosAutorizados),
        limitesPorUsuarioUsd: normalizeUserUsdLimitsMap(data?.limitesPorUsuarioUsd),
      });
    },
    error => {
      console.warn(
        `[FirestoreSync] No se pudo suscribir a workspaces/${safeWsId}/config/ia_control:`,
        error?.message || error
      );
      onChange(null);
    }
  );
}

export async function setWorkspaceIAControl(
  session: WorkspaceSessionInfo,
  state: WorkspaceIAControlState
): Promise<void> {
  const safeWsId = sanitizeFirestoreId(session.workspaceId, 'ws');
  const controlPath = `workspaces/${safeWsId}/config/ia_control`;
  const controlRef = doc(db, 'workspaces', safeWsId, 'config', 'ia_control');
  const cleanUsers = normalizeAuthorizedEmailsList(state.usuariosPagosAutorizados);
  const cleanLimits = normalizeUserUsdLimitsMap(state.limitesPorUsuarioUsd);

  try {
    const snap = await getDoc(controlRef);
    const updatedByEmail = clampStr(session.email || '', 200);
    const updatedByUid = clampStr(session.uid, 128);
    if (!snap.exists()) {
      await setDoc(controlRef, {
        id: 'ia_control',
        workspaceId: safeWsId,
        modelosPagosHabilitados: Boolean(state.modelosPagosHabilitados),
        usuariosPagosAutorizados: cleanUsers,
        limitesPorUsuarioUsd: cleanLimits,
        updatedByEmail,
        updatedByUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(controlRef, {
        modelosPagosHabilitados: Boolean(state.modelosPagosHabilitados),
        usuariosPagosAutorizados: cleanUsers,
        limitesPorUsuarioUsd: cleanLimits,
        updatedByEmail,
        updatedByUid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, controlPath);
  }
}

