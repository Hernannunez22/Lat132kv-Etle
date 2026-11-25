# Security Specification & Hardening Audit (Obras 132 kV)

## 1. Data Invariants
1. **Identity & Email Verification**: All workspace reads and writes require Firebase Auth with `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Master Gate**: Every subcollection under `/workspaces/{workspaceId}` verifies parent membership via `get(/databases/$(database)/documents/workspaces/$(workspaceId)/members/$(request.auth.uid))` on single-doc operations, and validates `request.auth.uid in resource.data.memberUids` (or bootstrapped admin) on `list` queries without `get()`/`exists()` inside `list`.
3. **Immutable Ownership & Timestamps**: `ownerId`, `workspaceId`, and `createdAt` cannot be modified after creation; `createdAt == request.time` on create and `updatedAt == request.time` on create and update.
4. **Terminal State Locking**: In `/workspaces/{workspaceId}/invites/{inviteId}`, once `status == 'accepted'`, non-admin clients cannot alter or re-accept the invite.
5. **PII Isolation**: User email addresses are stored exclusively in `/users/{userId}/private/{docId}` (readable only by owner) and `/workspaces/{workspaceId}/invites/{inviteId}` (readable only by workspace admin or the matching verified email recipient).
6. **Strict Keys & Size Boundaries**: Every write passes `isValid[Entity](incoming())` enforcing `hasAll`/`hasOnly`, `isValidId()` regex (`^[a-zA-Z0-9_\-]+$`), string `.size()` bounds, and list `.size()` bounds.
7. **Master AI Control Isolation**: `/workspaces/{workspaceId}/config/ia_control` can be read via `get` only by verified workspace members (`list` disabled), and can be created, updated, or deleted strictly by `isBootstrappedAdmin()` (`hernannunez27@gmail.com` verified).

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Write**: `ownerId: "u1"` written without `request.auth`. -> Expected: `PERMISSION_DENIED`.
2. **Unverified Email Spoofing**: Authenticated token with `email: "hernannunez27@gmail.com"` and `email_verified: false`. -> Expected: `PERMISSION_DENIED`.
3. **Shadow / Ghost Field Injection**: Creating a `Hito` with extra `isAdmin: true` or `ghost: 1`. -> Expected: `PERMISSION_DENIED`.
4. **Identity Spoofing on Create**: Creating a `Hito` or `Workspace` with `ownerId: "victim_uid"` while signed in as `"attacker_uid"`. -> Expected: `PERMISSION_DENIED`.
5. **ID Poisoning**: Document ID `"bad/../../../id"` or a 300-character document ID. -> Expected: `PERMISSION_DENIED`.
6. **Timestamp Spoofing**: Creating or updating a document with client-forged `createdAt` or `updatedAt` != `request.time`. -> Expected: `PERMISSION_DENIED`.
7. **Privilege Escalation on Member Role**: A non-admin member updating `/workspaces/{wid}/members/{uid}` to `role: "admin"`. -> Expected: `PERMISSION_DENIED`.
8. **Invite Hijacking / Terminal State Bypass**: Re-updating an already `'accepted'` invite or accepting an invite intended for a different email. -> Expected: `PERMISSION_DENIED`.
9. **Denial-of-Wallet Oversized String**: Writing a 600KB `contenidoTexto` into `MinutaItem` (limit 150KB) or >128 char `id`. -> Expected: `PERMISSION_DENIED`.
10. **Unbounded Array Attack**: Submitting `memberUids` with >25 elements or `faltantes` with >50 elements or non-string first element. -> Expected: `PERMISSION_DENIED`.
11. **PII Leak Read**: Signed-in non-owner reading `/users/{otherUid}/private/profile`. -> Expected: `PERMISSION_DENIED`.
12. **Unscoped List Scraping**: Querying `/workspaces/{wid}/hitos` as a signed-in user who is NOT in `memberUids` and not bootstrapped admin without a matching `memberUids` filter. -> Expected: `PERMISSION_DENIED`.
13. **Non-Master Paid AI Activation**: A verified workspace member/admin other than `hernannunez27@gmail.com` trying to write `/workspaces/{wid}/config/ia_control` with `modelosPagosHabilitados: true`. -> Expected: `PERMISSION_DENIED`.
