# Security Specification (`security_spec.md`) — ChikiHub

## 1. Data Invariants

1. **Master Gate & Relational Integrity**: Every subcollection document (`members`, `folders`, `documents`, `tasks`, `notices`, `snippets`, `messages`) under `/projects/{projectId}` MUST reference an existing parent `/projects/{projectId}` document (`exists(/databases/$(database)/documents/projects/$(projectId))`), and its `projectId` field MUST strictly match the `{projectId}` path variable.
2. **Identity & Verified Email Enforcement**: All reads and writes require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`). The `ownerId` (or `uid` on `/users/{userId}`) in `incoming()` MUST equal `request.auth.uid`.
3. **Strict Schema Blueprints & Shadow-Update Prevention**: Every `create` and `update` operation MUST pass `isValid[Entity](incoming())` enforcing exact allowed keys (`hasAll` + `hasOnly`), string `.size()` bounds, regex patterns on IDs (`^[a-zA-Z0-9_\-]+$`), and `incoming().diff(existing()).affectedKeys().hasOnly(...)` on updates.
4. **Immutability & Temporal Integrity**: `id`, `projectId`, `ownerId`, and `createdAt` are immortal fields that cannot change after creation. `createdAt` on `create` and `updatedAt` on `update` MUST equal `request.time`.
5. **Terminal State Locking**: Once a `ProjectDocument` or `ProjectTask` reaches `status == 'completed'`, further non-admin updates are rejected.
6. **Zero PII Leak & Secure List Queries**: `/users/{userId}` stores only public profile metadata (no email, phone, or address) and `allow list` rules strictly evaluate `resource.data` against `request.auth.uid` without O(n) `get()` calls.

## 2. The "Dirty Dozen" Payloads

1. **Unverified Email Spoof**: `{ "uid": "user1", "username": "chiki", "displayName": "Chiki" }` sent by an auth token with `email_verified: false`.
2. **Identity Spoofing on Project Create**: `{ "id": "proj1", "ownerId": "other_user_uid", "name": "Proyecto Redes" }` where `ownerId != request.auth.uid`.
3. **Shadow Field Injection on Project Update**: Adding `{ "isVerifiedAdmin": true }` during an update to `/projects/proj1`.
4. **Path ID Poisoning**: Creating `/projects/invalid id with spaces!` or a 2000-character ID string.
5. **Orphaned Subcollection Write**: Creating `/projects/non_existent_project/tasks/task1` where `/projects/non_existent_project` does not exist.
6. **Cross-Project Path Mismatch**: Writing to `/projects/proj1/folders/f1` with payload `{ "projectId": "proj2" }`.
7. **Timestamp Forgery**: Creating a project or document with a client-fabricated past or future `createdAt` instead of `request.time`.
8. **Immortal Field Mutation**: Updating `ownerId` or `createdAt` on an existing `/projects/proj1` document.
9. **Terminal State Bypass**: Updating a `ProjectTask` or `ProjectDocument` whose existing `status` is already `'completed'`.
10. **Denial-of-Wallet Oversized String**: Writing a 100,000-character `content` string to `/projects/proj1/documents/doc1` (exceeding `maxLength: 50000`).
11. **Value Poisoning on Update**: Updating `status` on `/projects/proj1/tasks/task1` to `"hacked_status"` outside the allowed enum `['pending', 'completed']`.
12. **Blanket List Scraping**: Executing an unfiltered collection list query on `/projects` without `where('ownerId', '==', request.auth.uid)`.
