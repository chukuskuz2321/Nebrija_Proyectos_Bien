/**
 * Phase 0: Payload-First Security TDD Test Suite for Firestore Rules
 * Verifies that all "Dirty Dozen" adversarial payloads defined in security_spec.md
 * are rejected with PERMISSION_DENIED.
 */

export interface SimulatedAuthContext {
  uid: string;
  email: string;
  email_verified: boolean;
}

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: SimulatedAuthContext | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unverified Email Spoof',
    collectionPath: '/users/user1',
    operation: 'create',
    auth: { uid: 'user1', email: 'adrianbelvis14@gmail.com', email_verified: false },
    payload: { uid: 'user1', username: 'chiki', displayName: 'Chiki' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Project Create',
    collectionPath: '/projects/proj1',
    operation: 'create',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { id: 'proj1', ownerId: 'other_user_uid', name: 'Proyecto Redes' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Project Update',
    collectionPath: '/projects/proj1',
    operation: 'update',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { name: 'Proyecto Redes', isVerifiedAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Path ID Poisoning',
    collectionPath: '/projects/invalid id with spaces!',
    operation: 'create',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { id: 'invalid id with spaces!', ownerId: 'user1' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned Subcollection Write',
    collectionPath: '/projects/non_existent_project/tasks/task1',
    operation: 'create',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { id: 'task1', projectId: 'non_existent_project', ownerId: 'user1' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Cross-Project Path Mismatch',
    collectionPath: '/projects/proj1/folders/f1',
    operation: 'create',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { id: 'f1', projectId: 'proj2', ownerId: 'user1' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Timestamp Forgery',
    collectionPath: '/projects/proj1',
    operation: 'create',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { id: 'proj1', ownerId: 'user1', createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immortal Field Mutation',
    collectionPath: '/projects/proj1',
    operation: 'update',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { ownerId: 'hacker_uid' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Terminal State Bypass',
    collectionPath: '/projects/proj1/tasks/completed_task',
    operation: 'update',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { title: 'Modified after completion', status: 'pending' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Denial-of-Wallet Oversized String',
    collectionPath: '/projects/proj1/documents/doc1',
    operation: 'create',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { id: 'doc1', content: 'A'.repeat(60000) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning on Update',
    collectionPath: '/projects/proj1/tasks/task1',
    operation: 'update',
    auth: { uid: 'user1', email: 'student@school.edu', email_verified: true },
    payload: { status: 'hacked_status' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Blanket List Scraping Without Owner Filter',
    collectionPath: '/projects',
    operation: 'list',
    auth: { uid: 'attacker_uid', email: 'attacker@school.edu', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
