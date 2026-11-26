// Security Rules Verification Specification for Obras 132 kV
// Maps each of the 12 "Dirty Dozen" attack vectors to the expected PERMISSION_DENIED invariant.

export interface SecurityTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated create on hitos',
    collectionPath: '/workspaces/obra-132kv-principal/hitos/HT-1',
    operation: 'create',
    auth: null,
    payload: { id: 'HT-1', codigo: 'A1' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified admin email spoofing',
    collectionPath: '/workspaces/obra-132kv-principal',
    operation: 'get',
    auth: { uid: 'spoof-uid', email: 'hernannunez27@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Ghost field injection on Hito create',
    collectionPath: '/workspaces/obra-132kv-principal/hitos/HT-99',
    operation: 'create',
    auth: { uid: 'u1', email: 'eng@example.com', email_verified: true },
    payload: { id: 'HT-99', ghostField: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity spoofing ownerId != auth.uid on create',
    collectionPath: '/workspaces/obra-132kv-principal/hitos/HT-100',
    operation: 'create',
    auth: { uid: 'attacker', email: 'attacker@example.com', email_verified: true },
    payload: { id: 'HT-100', ownerId: 'victim' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Oversized / invalid characters document ID',
    collectionPath: `/workspaces/obra-132kv-principal/planos/${'X'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'u1', email: 'eng@example.com', email_verified: true },
    payload: { id: 'X'.repeat(200) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client-forged updatedAt timestamp != request.time',
    collectionPath: '/workspaces/obra-132kv-principal/hitos/HT-1',
    operation: 'update',
    auth: { uid: 'u1', email: 'eng@example.com', email_verified: true },
    payload: { updatedAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Non-admin privilege escalation on members/{uid}',
    collectionPath: '/workspaces/obra-132kv-principal/members/u1',
    operation: 'update',
    auth: { uid: 'u1', email: 'eng@example.com', email_verified: true },
    payload: { role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Terminal state bypass on accepted invite',
    collectionPath: '/workspaces/obra-132kv-principal/invites/inv-1',
    operation: 'update',
    auth: { uid: 'u2', email: 'other@example.com', email_verified: true },
    payload: { status: 'accepted', acceptedByUid: 'u2' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Oversized Minuta contenidoTexto > 150000 chars',
    collectionPath: '/workspaces/obra-132kv-principal/minutas/MIN-1',
    operation: 'create',
    auth: { uid: 'u1', email: 'eng@example.com', email_verified: true },
    payload: { id: 'MIN-1', contenidoTexto: 'A'.repeat(160000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Unbounded memberUids array > 25 items',
    collectionPath: '/workspaces/obra-132kv-principal/interferencias/INT-1',
    operation: 'create',
    auth: { uid: 'u1', email: 'eng@example.com', email_verified: true },
    payload: { id: 'INT-1', memberUids: Array.from({ length: 30 }, (_, i) => `u${i}`) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Cross-user PII read on private profile',
    collectionPath: '/users/victim-uid/private/profile',
    operation: 'get',
    auth: { uid: 'attacker-uid', email: 'attacker@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unscoped list query by non-member',
    collectionPath: '/workspaces/obra-132kv-principal/hitos',
    operation: 'list',
    auth: { uid: 'outsider-uid', email: 'outsider@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 13,
    name: 'Non-master workspace user attempting to enable paid AI models or tamper per-user USD limits in config/ia_control',
    collectionPath: '/workspaces/obra-132kv-principal/config/ia_control',
    operation: 'update',
    auth: { uid: 'eng-uid', email: 'engineer@example.com', email_verified: true },
    payload: {
      modelosPagosHabilitados: true,
      usuariosPagosAutorizados: ['engineer@example.com'],
      limitesPorUsuarioUsd: { 'engineer@example.com': 999 },
    },
    expected: 'PERMISSION_DENIED',
  },
];
