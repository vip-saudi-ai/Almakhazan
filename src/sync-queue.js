// The offline mutation queue — prepared, and dormant in 1.0.
//
// When the cloud becomes authoritative, the device stays usable offline: a
// write is applied to the local cache at once and recorded here as a
// mutation, and a sync worker later sends the queue to the server in order.
// This module is that queue's data model and storage. It has no timer, no
// listener and no network code: nothing here runs unless a caller enqueues,
// and `enqueueMutation` refuses while sync is not an available feature — so in
// the device-only release the `mutations` store stays empty and no background
// work exists.
//
// A mutation is plain serializable data, never a closure:
//
//   { mutationId, entityType, entityId, op, payload, baseVersion,
//     createdAt, status, attempts, lastError, conflict }
//
//   op           'create' | 'update' | 'trash' | 'restore' | 'delete'
//   payload      the fields written (for update: only the changed ones)
//   baseVersion  the record's `version` this change was made on top of — what
//                the server compares to detect a conflicting edit
//
// Conflict rule (detectConflict): the server holds version V. A mutation with
// baseVersion === V applies. Otherwise the record changed elsewhere since this
// device read it: the mutation is marked `conflict` with both sides kept, and
// a person resolves it — nothing is silently overwritten, the same rule the
// device already applies to concurrent edits (ConflictError, repository.js).

import * as local from './local-store.js';
import { Feature, isFeatureAvailable } from './features.js';
import { AppError } from './utils.js';

export const MutationStatus = Object.freeze({
  PENDING: 'pending',
  SENDING: 'sending',
  SENT: 'sent',
  CONFLICT: 'conflict',
  FAILED: 'failed',
});

export const MUTATION_OPS = Object.freeze(['create', 'update', 'trash', 'restore', 'delete']);
const ENTITY_TYPES = new Set(['item', 'folder', 'category', 'location', 'fieldDefinition']);

/**
 * How an entity stands against the server, for the day records carry it.
 * In 1.0 every record is `local` and the field is not written.
 */
export const SyncState = Object.freeze({
  LOCAL: 'local',       // exists only on this device (device-only workspace)
  PENDING: 'pending',   // changed here; a mutation is queued
  SYNCED: 'synced',     // matches the server's version
  CONFLICT: 'conflict', // changed here and on the server; waiting for a person
});

/** Whether the queue may be written to at all. False in the device-only release. */
export function syncQueueActive() {
  return isFeatureAvailable(Feature.SYNC);
}

function newMutationId() {
  const random = crypto.getRandomValues(new Uint32Array(3));
  return `mut_${Date.now().toString(36)}_${[...random].map((n) => n.toString(36)).join('')}`;
}

/**
 * A mutation record, validated. Pure: nothing is stored.
 */
export function createMutation({ entityType, entityId, op, payload = null, baseVersion = null, now = Date.now() }) {
  if (!ENTITY_TYPES.has(entityType)) throw new AppError('sync.invalid', { code: 'sync/invalid', detail: 'entityType' });
  if (typeof entityId !== 'string' || !entityId) throw new AppError('sync.invalid', { code: 'sync/invalid', detail: 'entityId' });
  if (!MUTATION_OPS.includes(op)) throw new AppError('sync.invalid', { code: 'sync/invalid', detail: 'op' });
  if (baseVersion != null && !Number.isInteger(baseVersion)) throw new AppError('sync.invalid', { code: 'sync/invalid', detail: 'baseVersion' });
  // Serializable or refused: a function or a cycle here would be lost on the
  // way to storage and to the server.
  const data = payload == null ? null : JSON.parse(JSON.stringify(payload));
  return {
    mutationId: newMutationId(),
    entityType,
    entityId,
    op,
    payload: data,
    baseVersion,
    createdAt: now,
    status: MutationStatus.PENDING,
    attempts: 0,
    lastError: null,
    conflict: null,
  };
}

/**
 * Records a mutation for later sending. Returns null — and stores nothing —
 * while sync is not available.
 */
export async function enqueueMutation(input) {
  if (!syncQueueActive()) return null;
  const mutation = createMutation(input);
  await local.put('mutations', mutation);
  return mutation;
}

/** The oldest pending mutations, in the order they must be sent. */
export async function pendingMutations({ limit = 100 } = {}) {
  const { rows } = await local.page('mutations', {
    index: 'status', range: IDBKeyRange.only(MutationStatus.PENDING), limit,
  });
  return rows.sort((a, b) => a.createdAt - b.createdAt || (a.mutationId < b.mutationId ? -1 : 1));
}

/** How many mutations wait, by status — for a sync indicator. */
export async function queueCounts() {
  const out = {};
  for (const status of Object.values(MutationStatus)) {
    out[status] = await local.countRange('mutations', 'status', IDBKeyRange.only(status));
  }
  return out;
}

/**
 * What the server's answer means for a mutation.
 *
 * @param {object} mutation
 * @param {{exists: boolean, version?: number, deletedAt?: number}} server
 * @returns {{kind: 'none'|'stale-base'|'deleted-remotely'|'already-exists'}}
 */
export function detectConflict(mutation, server) {
  if (mutation.op === 'create') return server.exists ? { kind: 'already-exists' } : { kind: 'none' };
  if (!server.exists) return { kind: 'deleted-remotely' };
  if (mutation.baseVersion != null && server.version !== mutation.baseVersion) return { kind: 'stale-base' };
  return { kind: 'none' };
}

/** Moves a mutation to a new status, keeping what the server said. */
export async function settleMutation(mutationId, status, { error = null, conflict = null } = {}) {
  if (!Object.values(MutationStatus).includes(status)) throw new AppError('sync.invalid', { code: 'sync/invalid', detail: 'status' });
  const current = await local.get('mutations', mutationId);
  if (!current) return null;
  const next = {
    ...current,
    status,
    attempts: current.attempts + (status === MutationStatus.FAILED ? 1 : 0),
    lastError: error ? String(error.code || error.message || error).slice(0, 200) : null,
    conflict,
  };
  await local.put('mutations', next);
  return next;
}
