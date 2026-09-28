// The catalog service: one place every picker, the import and the detail
// screen ask. Ported from the reference (src/catalog/service.js).
//
// Providers: the bundled catalog (asset groups loaded lazily, per domain),
// the customer's own entries (workspace data), and — later — a cloud catalog
// behind the same questions. Nothing here reads a file directly: assets come
// through an injected loader, so tests and the app share the code.

import 'dart:convert';

import 'catalog_entity.dart';
import 'catalog_index.dart';

typedef AssetLoader = Future<String> Function(String path);

const defaultCatalogPage = 30;
const maxCatalogPage = 100;

class CatalogPage {
  const CatalogPage({required this.items, required this.nextCursor, required this.total});
  final List<RankedEntity> items;
  final String? nextCursor;
  final int total;
}

class Duplicates {
  const Duplicates({this.exact, this.retired, this.similar = const []});

  /// An active entry with this identity at this level (built-in preferred).
  final CatalogEntity? exact;

  /// A retired customer entry with this identity.
  final CatalogEntity? retired;

  /// Similar names, suggested only.
  final List<CatalogEntity> similar;
}

enum Resolution { unique, ambiguous, none }

class Resolved {
  const Resolved(this.status, {this.entity, this.candidates = const []});
  final Resolution status;
  final CatalogEntity? entity;
  final List<CatalogEntity> candidates;
}

/// The bundled catalog behind one index, loaded group by group.
class BuiltinCatalog {
  BuiltinCatalog(this._load);

  final AssetLoader _load;
  final CatalogIndex index = CatalogIndex();
  final Set<String> _loaded = {};
  Map<String, Object?>? _manifest;

  Future<Map<String, Object?>> manifest() async =>
      _manifest ??= jsonDecode(await _load('assets/catalog/index.json')) as Map<String, Object?>;

  String? get dataVersion => _manifest?['catalogDataVersion'] as String?;

  Future<void> loadGroup(String group) async {
    if (_loaded.contains(group)) return;
    final m = await manifest();
    final file = ((m['groups']! as Map)[group] as Map?)?['file'] as String?;
    if (file == null) return;
    _loaded.add(group);
    final rows = jsonDecode(await _load(file)) as List;
    index.addAll([for (final r in rows) ?CatalogEntity.fromJson(Map<String, Object?>.from(r as Map))]);
  }

  Future<void> ensure(String domain, {bool deep = false}) async {
    final plan = ((await manifest())['domainGroups']! as Map)[domain] as Map?;
    if (plan == null) return;
    for (final g in (plan['first'] as List?) ?? const []) {
      await loadGroup('$g');
    }
    if (deep) {
      for (final g in (plan['deep'] as List?) ?? const []) {
        await loadGroup('$g');
      }
    }
  }

  static String? _groupForId(String id) {
    if (id.startsWith('watch_brand_')) return 'watchBrands';
    if (id.startsWith('watch_')) return 'watchDetails';
    if (id.startsWith('vehicle_')) return 'vehicles';
    if (id.startsWith('mfr_')) return 'industrial';
    if (id.startsWith('electronics_')) return 'electronics';
    if (id.startsWith('lab_')) return 'lab';
    for (final p in ['jewel_', 'gem_', 'gemlab_', 'artist_', 'furniture_', 'fashion_']) {
      if (id.startsWith(p)) return 'collectibles';
    }
    return null;
  }

  /// An entity by id, loading only the group its prefix belongs to.
  Future<CatalogEntity?> get(String id) async {
    final hit = index.get(id);
    if (hit != null) return hit;
    final group = _groupForId(id);
    if (group == null || _loaded.contains(group)) return null;
    if (group == 'watchDetails') await loadGroup('watchBrands');
    await loadGroup(group);
    return index.get(id);
  }
}

class CatalogService {
  CatalogService(AssetLoader loader) : builtin = BuiltinCatalog(loader);

  final BuiltinCatalog builtin;
  CatalogIndex _user = CatalogIndex();

  /// The customer's own entries (workspace data), replaced whenever they change.
  void setCustomEntities(Iterable<CatalogEntity> entities) {
    _user = CatalogIndex()..addAll(entities.where((e) => e.custom));
  }

  Future<CatalogEntity?> getEntity(String id) async {
    if (!isCatalogId(id)) return null;
    return _user.get(id) ?? await builtin.get(id);
  }

  /// The entity and its ancestors, root first.
  Future<List<CatalogEntity>> path(String id) async {
    final out = <CatalogEntity>[];
    final seen = <String>{};
    var entity = await getEntity(id);
    while (entity != null && seen.add(entity.id)) {
      out.insert(0, entity);
      entity = entity.parentId == null ? null : await getEntity(entity.parentId!);
    }
    return out;
  }

  /// Whether [id] is [ancestorId] or lies under it.
  Future<bool> isWithin(String id, String? ancestorId) async {
    if (ancestorId == null) return true;
    return (await path(id)).any((e) => e.id == ancestorId);
  }

  int _score(CatalogEntity e, String folded, String compact) =>
      (e.custom ? _user : builtin.index).score(e, folded, compact);

  Future<List<CatalogEntity>> _pool(CatalogLevel level, {String? query, bool includeInactive = false}) async {
    final deep =
        (query != null && query.isNotEmpty) ||
        level.parentId != null ||
        level.ancestorId != null ||
        level.wantedTypes.any((t) => t != 'brand' && t != 'manufacturer');
    await builtin.ensure(level.domain, deep: deep);
    bool keep(CatalogEntity e) => includeInactive || e.isActive;
    final out = [
      for (final e in builtin.index.pool(level))
        if (keep(e)) e,
    ];
    if (level.ancestorId != null && level.parentId == null) {
      // A customer's entry often sits under a built-in parent, which the
      // customer's own index does not hold: its ancestry is walked instead.
      for (final e in _user.pool(level.withoutAncestor())) {
        if (keep(e) && await isWithin(e.id, level.ancestorId)) out.add(e);
      }
    } else {
      out.addAll([
        for (final e in _user.pool(level))
          if (keep(e)) e,
      ]);
    }
    return out;
  }

  /// One ranked page for a picker level; cursors are `o<offset>`.
  Future<CatalogPage> search(
    CatalogLevel level, {
    String query = '',
    int limit = defaultCatalogPage,
    String? cursor,
    Map<String, CatalogUse> usage = const {},
  }) async {
    final size = limit.clamp(1, maxCatalogPage);
    final offset = cursor != null && cursor.startsWith('o') ? int.tryParse(cursor.substring(1)) ?? 0 : 0;
    final ranked = rank(_score, await _pool(level, query: query), query, usage: usage);
    final end = offset + size > ranked.length ? ranked.length : offset + size;
    return CatalogPage(
      items: offset >= ranked.length ? const [] : ranked.sublist(offset, end),
      nextCursor: end < ranked.length ? 'o$end' : null,
      total: ranked.length,
    );
  }

  /// What already exists at this level with this name — the one rule for
  /// creating and for renaming (the entry being renamed is [exceptId]).
  Future<Duplicates> findDuplicates({
    required String domain,
    required String entityType,
    String? parentId,
    required String label,
    String? exceptId,
  }) async {
    final key = searchKey(label);
    if (key.isEmpty) return const Duplicates();
    final compact = compactKey(label);
    final pool = (await _pool(
      CatalogLevel(domain: domain, entityType: entityType, parentId: parentId),
      includeInactive: true,
    )).where((e) => e.parentId == parentId && e.id != exceptId);
    CatalogEntity? exact;
    CatalogEntity? retired;
    final similar = <CatalogEntity>[];
    for (final e in pool) {
      final value = _score(e, key, compact);
      if (value >= MatchStrength.exactCode) {
        if (e.status == CatalogStatus.retired) {
          retired ??= e;
        } else if (exact == null || (exact.custom && !e.custom)) {
          exact = e;
        }
        continue;
      }
      if (value >= MatchStrength.prefix || (key.length >= 4 && value >= MatchStrength.contains)) similar.add(e);
    }
    return Duplicates(exact: exact, retired: retired, similar: similar.take(5).toList());
  }

  /// A spreadsheet's or an older record's text matched to the catalog.
  Future<Resolved> resolveText({
    required String domain,
    required String entityType,
    String? parentId,
    String? ancestorId,
    required String text,
  }) async {
    final key = searchKey(text);
    if (key.isEmpty) return const Resolved(Resolution.none);
    final compact = compactKey(text);
    final pool = await _pool(
      CatalogLevel(domain: domain, entityType: entityType, parentId: parentId, ancestorId: ancestorId),
      query: text,
    );
    final hits = [
      for (final e in pool)
        if (_score(e, key, compact) >= MatchStrength.exactCode) e,
    ];
    if (hits.length == 1) return Resolved(Resolution.unique, entity: hits.single, candidates: hits);
    if (hits.length > 1) return Resolved(Resolution.ambiguous, candidates: hits.take(5).toList());
    return const Resolved(Resolution.none);
  }
}
