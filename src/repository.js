// Data access layer.
//
// Two interchangeable backends sit behind one facade: Firestore (per-document
// writes, server timestamps, realtime listeners) and IndexedDB (single-device
// fallback). Nothing in the UI knows which one is active.
//
// Rules that hold for both backends:
//  - writes target one document, never the whole database;
//  - an update carries the version it was based on, and a mismatch is a
//    conflict rather than a silent overwrite;
//  - deletes are soft by default (Trash), purge is a separate deliberate step;
//  - every meaningful change appends an activity-log entry.

import { ACTIONS, DEFAULT_CATEGORIES, DEFAULT_LOCATIONS, ROLES, UNCATEGORIZED_ID, roleAtLeast } from './config.js';
import { firebaseContext } from './firebase.js';
import * as local from './local-store.js';
import { AppError, toMillis, uid } from './utils.js';
import {
  normalizeCategory, normalizeFolder, normalizeItem, normalizeLocation,
} from './validation.js';

export const SyncState = {
  LOADING: 'loading',
  SYNCED: 'synced',
  SAVING: 'saving',
  OFFLINE: 'offline',
  LOCAL: 'local',
  ERROR: 'error',
  CONFLICT: 'conflict',
};

export const SYNC_LABELS = {
  loading: 'جارٍ التحميل…',
  synced: 'محفوظ ☁',
  saving: 'جارٍ الحفظ…',
  offline: 'غير متصل — محفوظ محلياً',
  local: 'محلي على هذا الجهاز',
  error: 'فشل المزامنة',
  conflict: 'تعارض في التعديل',
};

export class ConflictError extends AppError {
  constructor(current) {
    super('عُدّلت هذه القطعة على جهاز آخر', { code: 'repo/conflict' });
    this.name = 'ConflictError';
    this.current = current;
  }
}

const COLLECTIONS = ['items', 'folders', 'categories', 'locations'];

// ── Firestore backend ──────────────────────────────────────────────────────
class FirestoreBackend {
  constructor(workspaceId) {
    this.workspaceId = workspaceId;
    const { db, sdk } = firebaseContext();
    this.db = db;
    this.fs = sdk.firestore;
  }

  col(name) {
    return this.fs.collection(this.db, 'workspaces', this.workspaceId, name);
  }

  ref(name, id) {
    return this.fs.doc(this.db, 'workspaces', this.workspaceId, name, id);
  }

  get serverTime() {
    return this.fs.serverTimestamp();
  }

  /** Realtime listeners keep other devices' edits flowing in without a refresh. */
  watch(name, onData, onError) {
    return this.fs.onSnapshot(
      this.col(name),
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data({ serverTimestamps: 'estimate' }),
        }));
        onData(rows, { fromCache: snapshot.metadata.fromCache, pending: snapshot.metadata.hasPendingWrites });
      },
      (error) => onError(error),
    );
  }

  watchActivity(onData, onError) {
    const q = this.fs.query(this.col('activityLogs'), this.fs.orderBy('timestamp', 'desc'), this.fs.limit(60));
    return this.fs.onSnapshot(
      q,
      (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
      (error) => onError(error),
    );
  }

  async create(name, record) {
    const { id, ...rest } = record;
    await this.fs.setDoc(this.ref(name, id), {
      ...rest,
      createdAt: this.serverTime,
      updatedAt: this.serverTime,
      version: 1,
    });
  }

  /**
   * Optimistic concurrency: the transaction re-reads the document and refuses
   * the write when its version moved since the caller read it.
   */
  async update(name, id, patch, expectedVersion) {
    const ref = this.ref(name, id);
    await this.fs.runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new AppError('السجل لم يعد موجوداً', { code: 'repo/missing' });
      const current = snap.data();
      if (expectedVersion != null && (current.version ?? 1) !== expectedVersion) {
        throw new ConflictError({ id, ...current });
      }
      tx.update(ref, {
        ...patch,
        updatedAt: this.serverTime,
        version: (current.version ?? 1) + 1,
      });
    });
  }

  async purge(name, id) {
    await this.fs.deleteDoc(this.ref(name, id));
  }

  async appendLog(entry) {
    const ref = this.fs.doc(this.col('activityLogs'));
    await this.fs.setDoc(ref, { ...entry, timestamp: this.serverTime });
  }

  async runBatch(operations) {
    // Firestore caps a batch at 500 writes.
    for (let i = 0; i < operations.length; i += 450) {
      const batch = this.fs.writeBatch(this.db);
      for (const op of operations.slice(i, i + 450)) {
        const ref = this.ref(op.collection, op.id);
        if (op.type === 'set') {
          batch.set(ref, { ...op.data, updatedAt: this.serverTime }, { merge: op.merge !== false });
        } else if (op.type === 'delete') {
          batch.delete(ref);
        }
      }
      await batch.commit();
    }
  }
}

// ── IndexedDB backend ──────────────────────────────────────────────────────
class LocalBackend {
  constructor() {
    this.watchers = new Map();
  }

  get serverTime() {
    return Date.now();
  }

  async _notify(name) {
    const watcher = this.watchers.get(name);
    if (!watcher) return;
    const rows = await local.getAll(name);
    watcher(rows, { fromCache: true, pending: false });
  }

  watch(name, onData, onError) {
    this.watchers.set(name, onData);
    local.getAll(name)
      .then((rows) => onData(rows, { fromCache: true, pending: false }))
      .catch(onError);
    return () => this.watchers.delete(name);
  }

  watchActivity(onData, onError) {
    this.watchers.set('activity', (rows) => {
      onData([...rows].sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp)).slice(0, 60));
    });
    local.getAll('activity')
      .then((rows) => onData([...rows].sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp)).slice(0, 60)))
      .catch(onError);
    return () => this.watchers.delete('activity');
  }

  async create(name, record) {
    await local.put(name, { ...record, createdAt: record.createdAt || Date.now(), updatedAt: Date.now(), version: 1 });
    await this._notify(name);
  }

  async update(name, id, patch, expectedVersion) {
    const rows = await local.getAll(name);
    const current = rows.find((r) => r.id === id);
    if (!current) throw new AppError('السجل لم يعد موجوداً', { code: 'repo/missing' });
    if (expectedVersion != null && (current.version ?? 1) !== expectedVersion) {
      throw new ConflictError(current);
    }
    await local.put(name, { ...current, ...patch, updatedAt: Date.now(), version: (current.version ?? 1) + 1 });
    await this._notify(name);
  }

  async purge(name, id) {
    await local.remove(name, id);
    await this._notify(name);
  }

  async appendLog(entry) {
    await local.put('activity', { id: uid('log'), ...entry, timestamp: Date.now() });
    const watcher = this.watchers.get('activity');
    if (watcher) watcher(await local.getAll('activity'));
  }

  async runBatch(operations) {
    const touched = new Set();
    for (const op of operations) {
      if (op.type === 'set') {
        const rows = await local.getAll(op.collection);
        const existing = rows.find((r) => r.id === op.id);
        await local.put(op.collection, { ...(op.merge !== false ? existing : null), ...op.data, id: op.id, updatedAt: Date.now() });
      } else if (op.type === 'delete') {
        await local.remove(op.collection, op.id);
      }
      touched.add(op.collection);
    }
    for (const name of touched) await this._notify(name);
  }
}

// ── Repository facade ──────────────────────────────────────────────────────
class Repository {
  constructor() {
    this.state = { items: [], folders: [], categories: [], locations: [], activity: [] };
    this.sync = { status: SyncState.LOADING, message: SYNC_LABELS.loading, error: null };
    this.session = { userId: null, role: ROLES.OWNER, workspaceId: null, mode: 'local' };
    this.listeners = new Set();
    this.unsubscribers = [];
    this.backend = null;
    this.ready = false;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    if (this.ready) listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot() {
    return { ...this.state, sync: this.sync, session: this.session };
  }

  emit() {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  setSync(status, extra = {}) {
    this.sync = { status, message: SYNC_LABELS[status] || status, error: null, ...extra };
    this.emit();
  }

  canWrite() {
    return roleAtLeast(this.session.role, ROLES.EDITOR);
  }

  assertCanWrite() {
    if (!this.canWrite()) {
      throw new AppError('صلاحيتك للعرض فقط', { code: 'repo/forbidden' });
    }
  }

  assertCanAdmin() {
    if (!roleAtLeast(this.session.role, ROLES.ADMIN)) {
      throw new AppError('هذا الإجراء يتطلب صلاحية مدير', { code: 'repo/forbidden' });
    }
  }

  // ── lifecycle ──
  async start({ mode, workspaceId, userId, role }) {
    this.stop();
    this.session = { mode, workspaceId, userId, role: role || ROLES.OWNER };
    this.backend = mode === 'cloud' ? new FirestoreBackend(workspaceId) : new LocalBackend();
    this.setSync(SyncState.LOADING);

    await new Promise((resolve) => {
      const pending = new Set(COLLECTIONS);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        resolve();
      };
      // Listeners normally deliver a first snapshot (from cache if offline)
      // immediately. If one never does, open the app anyway — late snapshots
      // still flow in through the same handler.
      const guard = setTimeout(() => {
        if (done) return;
        console.error('[repo] first snapshot did not arrive for', [...pending]);
        finish();
      }, 10_000);

      const settle = (name) => {
        pending.delete(name);
        if (!pending.size) finish();
      };

      for (const name of COLLECTIONS) {
        const unsubscribe = this.backend.watch(
          name,
          (rows, meta) => {
            this.state[name] = this._normalizeRows(name, rows);
            this.ready = true;
            if (mode === 'local') this.setSync(SyncState.LOCAL);
            else if (meta.pending) this.setSync(SyncState.SAVING);
            else if (meta.fromCache && !navigator.onLine) this.setSync(SyncState.OFFLINE);
            else this.setSync(SyncState.SYNCED);
            settle(name);
          },
          (error) => {
            console.error(`[repo] listener failed for ${name}`, error);
            this.setSync(SyncState.ERROR, { error, message: this._listenerMessage(error) });
            settle(name);
          },
        );
        this.unsubscribers.push(unsubscribe);
      }

      this.unsubscribers.push(this.backend.watchActivity(
        (rows) => { this.state.activity = rows; this.emit(); },
        (error) => console.error('[repo] activity listener failed', error),
      ));
    });

    await this._seedDefaults();
    this.ready = true;
    this.emit();
  }

  _listenerMessage(error) {
    if (error?.code === 'permission-denied') return 'لا تملك صلاحية قراءة هذه البيانات';
    return SYNC_LABELS.error;
  }

  _normalizeRows(name, rows) {
    switch (name) {
      case 'items': return rows.map((r) => normalizeItem(r));
      case 'folders': return rows.map((r) => normalizeFolder(r));
      case 'categories': return rows.map((r) => normalizeCategory(r));
      case 'locations': return rows.map((r) => normalizeLocation(r));
      default: return rows;
    }
  }

  /** First run in an empty workspace gets the default taxonomy, nothing else. */
  async _seedDefaults() {
    if (!this.canWrite()) return;
    if (this.state.categories.length || this.state.locations.length || this.state.items.length) return;
    try {
      await this.backend.runBatch([
        ...DEFAULT_CATEGORIES.map((c) => ({ type: 'set', collection: 'categories', id: c.id, data: normalizeCategory(c) })),
        ...DEFAULT_LOCATIONS.map((l) => ({ type: 'set', collection: 'locations', id: l.id, data: normalizeLocation(l) })),
      ]);
    } catch (error) {
      console.error('[repo] seeding defaults failed', error);
    }
  }

  stop() {
    for (const unsubscribe of this.unsubscribers) {
      try { unsubscribe?.(); } catch (error) { console.error('[repo] unsubscribe failed', error); }
    }
    this.unsubscribers = [];
    this.ready = false;
  }

  // ── lookups ──
  item(id) { return this.state.items.find((i) => i.id === id) || null; }
  folder(id) { return id ? this.state.folders.find((f) => f.id === id) || null : null; }
  category(id) {
    if (!id || id === UNCATEGORIZED_ID) return { id: UNCATEGORIZED_ID, name: 'غير مصنّف', icon: '📦' };
    return this.state.categories.find((c) => c.id === id) || { id, name: 'تصنيف محذوف', icon: '❓' };
  }
  location(id) { return id ? this.state.locations.find((l) => l.id === id) || null : null; }

  liveItems() { return this.state.items.filter((i) => !i.deletedAt); }
  trashedItems() { return this.state.items.filter((i) => i.deletedAt); }

  lookups() {
    return {
      category: (id) => this.category(id),
      folder: (id) => this.folder(id),
      location: (id) => this.location(id),
    };
  }

  // ── SKU ──
  /** Sequential, readable and unique within the workspace: INV-2026-000123 */
  nextSku() {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    let highest = 0;
    for (const item of this.state.items) {
      if (typeof item.sku === 'string' && item.sku.startsWith(prefix)) {
        const n = Number.parseInt(item.sku.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > highest) highest = n;
      }
    }
    return `${prefix}${String(highest + 1).padStart(6, '0')}`;
  }

  skuConflict(sku, exceptId) {
    if (!sku) return null;
    return this.state.items.find((i) => i.sku === sku && i.id !== exceptId && !i.deletedAt) || null;
  }

  barcodeConflict(barcode, exceptId) {
    if (!barcode) return null;
    return this.state.items.find((i) => i.barcode === barcode && i.id !== exceptId && !i.deletedAt) || null;
  }

  // ── activity ──
  async log(action, details = {}) {
    try {
      await this.backend.appendLog({
        action,
        userId: this.session.userId || null,
        userName: this.session.userName || null,
        ...details,
      });
    } catch (error) {
      // A failed audit entry must never roll back the change it describes, but
      // it must be visible.
      console.error('[repo] activity log failed', error);
    }
  }

  /** Records only the fields that actually changed. */
  static diff(before, after, fields) {
    const changes = { before: {}, after: {} };
    for (const field of fields) {
      const a = JSON.stringify(before?.[field] ?? null);
      const b = JSON.stringify(after?.[field] ?? null);
      if (a !== b) {
        changes.before[field] = before?.[field] ?? null;
        changes.after[field] = after?.[field] ?? null;
      }
    }
    return Object.keys(changes.after).length ? changes : null;
  }

  // ── items ──
  async createItem(data) {
    this.assertCanWrite();
    const item = normalizeItem({ ...data, createdBy: this.session.userId, updatedBy: this.session.userId }, {
      userId: this.session.userId,
    });
    this.setSync(SyncState.SAVING);
    await this.backend.create('items', item);
    await this.log(ACTIONS.ITEM_CREATED, { itemId: item.id, itemName: item.name });
    return item;
  }

  async updateItem(id, patch, expectedVersion) {
    this.assertCanWrite();
    const before = this.item(id);
    this.setSync(SyncState.SAVING);
    await this.backend.update('items', id, { ...patch, updatedBy: this.session.userId }, expectedVersion);
    const changes = Repository.diff(before, { ...before, ...patch }, [
      'name', 'sku', 'barcode', 'categoryId', 'folderId', 'locationId',
      'quantity', 'unit', 'condition', 'brand', 'valuation', 'description',
      'images', 'primaryImageId', 'aiData',
    ]);
    await this.log(ACTIONS.ITEM_UPDATED, { itemId: id, itemName: patch.name ?? before?.name, changes });
  }

  async moveItem(id, folderId) {
    this.assertCanWrite();
    const before = this.item(id);
    await this.backend.update('items', id, { folderId: folderId || null, updatedBy: this.session.userId }, before?.version);
    await this.log(ACTIONS.ITEM_MOVED, {
      itemId: id,
      itemName: before?.name,
      changes: { before: { folderId: before?.folderId ?? null }, after: { folderId: folderId || null } },
    });
  }

  /** Soft delete — the record moves to Trash and stays recoverable. */
  async deleteItem(id) {
    this.assertCanWrite();
    const item = this.item(id);
    this.setSync(SyncState.SAVING);
    await this.backend.update('items', id, {
      deletedAt: this.backend.serverTime,
      deletedBy: this.session.userId,
    }, item?.version);
    await this.log(ACTIONS.ITEM_DELETED, { itemId: id, itemName: item?.name });
  }

  async restoreItem(id) {
    this.assertCanWrite();
    const item = this.item(id);
    await this.backend.update('items', id, { deletedAt: null, deletedBy: null }, item?.version);
    await this.log(ACTIONS.ITEM_RESTORED, { itemId: id, itemName: item?.name });
  }

  async purgeItem(id) {
    this.assertCanAdmin();
    const item = this.item(id);
    await this.backend.purge('items', id);
    await this.log(ACTIONS.ITEM_PURGED, { itemId: id, itemName: item?.name });
  }

  /**
   * Duplicates the record, not its history and not its binary images: the copy
   * references the same Storage objects, so no file is uploaded twice.
   */
  async duplicateItem(id) {
    this.assertCanWrite();
    const source = this.item(id);
    if (!source) throw new AppError('القطعة غير موجودة', { code: 'repo/missing' });
    const copy = normalizeItem({
      ...source,
      id: uid('itm'),
      sku: this.nextSku(),
      barcode: '', // barcodes identify a physical object; a copy has none yet
      name: `${source.name} (نسخة)`,
      createdAt: null,
      updatedAt: null,
      createdBy: this.session.userId,
      updatedBy: this.session.userId,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    }, { userId: this.session.userId });

    await this.backend.create('items', copy);
    await this.log(ACTIONS.ITEM_DUPLICATED, { itemId: copy.id, itemName: copy.name, sourceId: id });
    return copy;
  }

  // ── folders ──
  async saveFolder(data) {
    this.assertCanWrite();
    const folder = normalizeFolder(data, { userId: this.session.userId });
    const existing = this.folder(folder.id);
    if (existing) {
      await this.backend.update('folders', folder.id, {
        name: folder.name, description: folder.description, icon: folder.icon, color: folder.color,
      }, existing.version);
      await this.log(ACTIONS.FOLDER_UPDATED, { folderId: folder.id, folderName: folder.name });
    } else {
      await this.backend.create('folders', folder);
      await this.log(ACTIONS.FOLDER_CREATED, { folderId: folder.id, folderName: folder.name });
    }
    return folder;
  }

  /** Items in a deleted folder return to the root inventory; the move is logged. */
  async deleteFolder(id) {
    this.assertCanWrite();
    const folder = this.folder(id);
    const affected = this.state.items.filter((i) => i.folderId === id);
    await this.backend.runBatch([
      ...affected.map((i) => ({ type: 'set', collection: 'items', id: i.id, data: { folderId: null } })),
      { type: 'delete', collection: 'folders', id },
    ]);
    await this.log(ACTIONS.FOLDER_DELETED, {
      folderId: id, folderName: folder?.name, movedToRoot: affected.length,
    });
    return affected.length;
  }

  // ── categories ──
  async saveCategory(data) {
    this.assertCanWrite();
    const category = normalizeCategory(data);
    const existing = this.state.categories.find((c) => c.id === category.id);
    if (existing) {
      await this.backend.update('categories', category.id, { name: category.name, icon: category.icon }, existing.version);
      await this.log(ACTIONS.CATEGORY_UPDATED, { categoryId: category.id, categoryName: category.name });
    } else {
      await this.backend.create('categories', category);
      await this.log(ACTIONS.CATEGORY_CREATED, { categoryId: category.id, categoryName: category.name });
    }
    return category;
  }

  categoryUsage(id) {
    return this.state.items.filter((i) => i.categoryId === id && !i.deletedAt).length;
  }

  /**
   * @param {'reassign'|'uncategorize'} strategy
   * @param {string} [targetId] required when reassigning
   */
  async deleteCategory(id, strategy, targetId) {
    this.assertCanWrite();
    const category = this.state.categories.find((c) => c.id === id);
    const affected = this.state.items.filter((i) => i.categoryId === id);
    if (affected.length && strategy === 'reassign' && !targetId) {
      throw new AppError('اختر التصنيف البديل', { code: 'repo/needs-target' });
    }
    const newCategory = strategy === 'reassign' ? targetId : UNCATEGORIZED_ID;
    await this.backend.runBatch([
      ...affected.map((i) => ({ type: 'set', collection: 'items', id: i.id, data: { categoryId: newCategory } })),
      { type: 'delete', collection: 'categories', id },
    ]);
    await this.log(ACTIONS.CATEGORY_DELETED, {
      categoryId: id, categoryName: category?.name, reassigned: affected.length, newCategoryId: newCategory,
    });
    return affected.length;
  }

  // ── locations ──
  async saveLocation(data) {
    this.assertCanWrite();
    const location = normalizeLocation(data);
    const existing = this.state.locations.find((l) => l.id === location.id);
    if (existing) {
      await this.backend.update('locations', location.id, { name: location.name }, existing.version);
    } else {
      await this.backend.create('locations', location);
      await this.log(ACTIONS.LOCATION_CREATED, { locationId: location.id, locationName: location.name });
    }
    return location;
  }

  async deleteLocation(id) {
    this.assertCanWrite();
    const location = this.state.locations.find((l) => l.id === id);
    const affected = this.state.items.filter((i) => i.locationId === id);
    await this.backend.runBatch([
      ...affected.map((i) => ({ type: 'set', collection: 'items', id: i.id, data: { locationId: null } })),
      { type: 'delete', collection: 'locations', id },
    ]);
    await this.log(ACTIONS.LOCATION_DELETED, {
      locationId: id, locationName: location?.name, clearedFrom: affected.length,
    });
    return affected.length;
  }

  // ── bulk ──
  async bulkWrite(operations) {
    this.assertCanWrite();
    this.setSync(SyncState.SAVING);
    await this.backend.runBatch(operations);
  }

  /** Removes every item and folder. Categories and locations are kept. */
  async clearInventory() {
    this.assertCanAdmin();
    const operations = [
      ...this.state.items.map((i) => ({ type: 'delete', collection: 'items', id: i.id })),
      ...this.state.folders.map((f) => ({ type: 'delete', collection: 'folders', id: f.id })),
    ];
    await this.backend.runBatch(operations);
    await this.log(ACTIONS.WORKSPACE_CLEARED, {
      itemsRemoved: this.state.items.length, foldersRemoved: this.state.folders.length,
    });
  }
}

export const repository = new Repository();
