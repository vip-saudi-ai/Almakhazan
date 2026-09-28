// In-page helpers for the Full Backup suites: imported by the page under test
// (`await import('/tests/browser/backup-helpers.mjs')`), never bundled.

import * as fb from '/src/full-backup.js';
import * as local from '/src/local-store.js';
import { repository } from '/src/repository.js';
import { Zip64Writer } from '/src/zip64.js';

export const enc = new TextEncoder();

export async function sha(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A sink that keeps the archive in the page. */
export function memorySink() {
  const parts = [];
  return {
    parts,
    open: async () => {},
    write: async (bytes) => { parts.push(bytes.slice()); },
    close: async () => {},
    abort: async () => { parts.length = 0; },
    file(name = 'b.nazmbackup') { return new File(parts, name); },
  };
}

/** A Full Backup of this device, kept in the page. */
export async function backupToFile(options = {}) {
  const sink = memorySink();
  const summary = await fb.createFullBackup({ sink, ...options });
  return { file: sink.file(), summary };
}

/** Every entry of an archive, in order, as [name, bytes]. */
export async function entriesOf(file) {
  const { names, read } = await fb.__readArchiveForTest(file);
  const out = [];
  for (const name of names) out.push([name, await read(name)]);
  return out;
}

/**
 * The same archive re-written with changes: `replace` maps a name to new
 * bytes (or a function of the old bytes), `add` appends entries (duplicates
 * allowed), `drop` removes names. The manifest is left as it was, so any
 * checksum it records no longer matches what was changed.
 */
export async function rebuild(file, { replace = {}, add = [], drop = [], before = null } = {}) {
  const parts = [];
  const zip = new Zip64Writer({ write: async (bytes) => { parts.push(bytes.slice()); } });
  for (const [name, bytes] of await entriesOf(file)) {
    if (drop.includes(name)) continue;
    if (before && name === before) for (const [n, b] of add) await zip.add(n, b);
    const change = replace[name];
    await zip.add(name, change == null ? bytes : typeof change === 'function' ? change(bytes) : change);
  }
  if (!before) for (const [n, b] of add) await zip.add(n, b);
  await zip.finish();
  return new File(parts, 'changed.nazmbackup');
}

/** An archive written from scratch — e.g. a version 1 backup, or a forged one. */
export async function archiveOf(entries) {
  const parts = [];
  const zip = new Zip64Writer({ write: async (bytes) => { parts.push(bytes.slice()); } });
  for (const [name, bytes] of entries) await zip.add(name, typeof bytes === 'string' ? enc.encode(bytes) : bytes);
  await zip.finish();
  return new File(parts, 'forged.nazmbackup');
}

/** Stores an image and its asset row directly, as an upload would. */
export async function putImage(id, original, thumbnail = original, type = 'image/jpeg') {
  await local.put('images', {
    id, itemId: null, original: new Uint8Array(original).buffer, originalType: type,
    thumbnail: new Uint8Array(thumbnail).buffer, thumbnailType: 'image/jpeg', meta: {},
  });
  await local.put('mediaAssets', {
    id, storagePath: `local:${id}`, thumbnailPath: `local:${id}`, mimeType: type,
    fileSize: original.length, refCount: 0, orphanedAt: Date.now(), createdAt: Date.now(), originalFilename: `${id}.jpg`,
  });
}

export const imageRef = (id) => ({ id, mediaId: id, storagePath: `local:${id}`, thumbnailPath: `local:${id}`, mimeType: 'image/jpeg' });

/** Opens, verifies and restores; returns the result or the error's code. */
export async function restoreFile(file, options = {}) {
  const archive = await fb.openFullBackup(file);
  await fb.verifyFullBackup(archive);
  return fb.restoreFullBackup(archive, options);
}

export async function codeOf(promise) {
  try { await promise; return 'ok'; } catch (error) { return error?.code || String(error); }
}

/** Records without the page's window: straight from the store, a page at a time. */
export async function allIds(store) {
  const ids = [];
  let after;
  for (;;) {
    const keys = await local.keysPage(store, { after, limit: 1000 });
    ids.push(...keys);
    if (keys.length < 1000) return ids;
    after = keys[keys.length - 1];
  }
}

/** Counts every unbounded getAll() on the items store, and every completeItems(). */
export function watchMaterialisation() {
  const seen = { itemsGetAll: 0, completeItems: 0 };
  const wrap = (proto) => {
    const original = proto.getAll;
    proto.getAll = function getAll(query, count) {
      const store = this.objectStore ? this.objectStore.name : this.name;
      if (store === 'items' && count === undefined) seen.itemsGetAll += 1;
      return original.call(this, query, count);
    };
  };
  wrap(IDBObjectStore.prototype);
  wrap(IDBIndex.prototype);
  const complete = repository.completeItems.bind(repository);
  repository.completeItems = async (...args) => { seen.completeItems += 1; return complete(...args); };
  return seen;
}

/** A file as Base64 — how the tests carry a backup from one "device" to another. */
export async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function base64ToFile(base64, name = 'carried.nazmbackup') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name);
}

/**
 * Rewrites the manifest with `mutate(manifest)` and re-computes nothing else —
 * or, with `recount`, re-computes the descriptors of item chunks from their
 * current bytes, so a forged chunk passes its checksum and the check that
 * must catch it is the one under test.
 */
export async function withManifest(file, mutate, { replace = {}, recount = false } = {}) {
  const entries = await entriesOf(file);
  const map = new Map(entries);
  for (const [name, bytes] of Object.entries(replace)) map.set(name, bytes);
  const manifest = JSON.parse(new TextDecoder().decode(map.get('manifest.json')));
  if (recount) {
    for (const chunk of manifest.itemChunks) {
      const bytes = map.get(chunk.path);
      chunk.size = bytes.length;
      chunk.sha256 = await sha(bytes);
      chunk.count = new TextDecoder().decode(bytes).split('\n').filter(Boolean).length;
    }
    manifest.counts.items = manifest.itemChunks.reduce((sum, c) => sum + c.count, 0);
  }
  mutate(manifest);
  map.set('manifest.json', enc.encode(JSON.stringify(manifest)));
  return archiveOf(entries.map(([name]) => [name, map.get(name)]));
}
