// An in-memory index over a set of catalog entities: by id, by parent and
// type, by ancestor, by domain and type, with folded keys built once — so a
// keystroke never walks every model of every brand. Ported from the
// reference (src/catalog/catalog-index.js); scores are identical.

import 'catalog_entity.dart';

/// How a result matched, strongest first. Recency and frequency only break ties.
abstract final class MatchStrength {
  static const exact = 100;
  static const exactAlias = 95;
  static const exactCode = 92;
  static const prefix = 80;
  static const codePrefix = 75;
  static const aliasPrefix = 70;
  static const contains = 60;
  static const aliasContains = 50;
  static const codeContains = 45;
}

/// A level of the catalog to draw candidates from.
class CatalogLevel {
  const CatalogLevel({required this.domain, this.entityType, this.types, this.parentId, this.ancestorId});
  final String domain;
  final String? entityType;
  final List<String>? types;
  final String? parentId;
  final String? ancestorId;

  List<String> get wantedTypes => types ?? [if (entityType != null) entityType!];

  CatalogLevel withoutAncestor() =>
      CatalogLevel(domain: domain, entityType: entityType, types: types, parentId: parentId);
}

class CatalogIndex {
  final Map<String, CatalogEntity> _byId = {};
  final Map<String, List<CatalogEntity>> _byParentType = {};
  final Map<String, List<CatalogEntity>> _byAncestorType = {};
  final Map<String, List<CatalogEntity>> _byDomainType = {};
  final Map<String, EntityKeys> _keys = {};

  int get length => _byId.length;

  void add(CatalogEntity e) {
    if (_byId.containsKey(e.id)) return;
    _byId[e.id] = e;
    _keys[e.id] = EntityKeys(e);
    void push(Map<String, List<CatalogEntity>> map, String key) => (map[key] ??= []).add(e);
    push(_byParentType, '${e.parentId ?? ''}|${e.entityType}');
    for (final d in e.domains) {
      push(_byDomainType, '$d|${e.entityType}');
    }
    // Every ancestor: a reference is found under its brand as well as under
    // its collection, so a customer who skipped a level is not stuck.
    var parent = e.parentId == null ? null : _byId[e.parentId];
    final seen = <String>{};
    while (parent != null && seen.add(parent.id)) {
      push(_byAncestorType, '${parent.id}|${e.entityType}');
      parent = parent.parentId == null ? null : _byId[parent.parentId];
    }
  }

  /// Adds entities parents-first, so ancestor links resolve.
  void addAll(Iterable<CatalogEntity> entities) {
    final pending = entities.toList();
    final pendingIds = {for (final e in pending) e.id};
    bool known(CatalogEntity e) =>
        e.parentId == null || _byId.containsKey(e.parentId) || !pendingIds.contains(e.parentId);
    var guard = pending.length + 1;
    while (pending.isNotEmpty && guard-- > 0) {
      for (var i = 0; i < pending.length;) {
        if (known(pending[i])) {
          final e = pending.removeAt(i);
          pendingIds.remove(e.id);
          add(e);
        } else {
          i += 1;
        }
      }
    }
    pending.forEach(add);
  }

  CatalogEntity? get(String id) => _byId[id];

  List<CatalogEntity> pool(CatalogLevel level) {
    final out = <CatalogEntity>[];
    for (final type in level.wantedTypes) {
      final List<CatalogEntity>? list;
      if (level.parentId != null) {
        list = _byParentType['${level.parentId}|$type'];
      } else if (level.ancestorId != null) {
        list = _byAncestorType['${level.ancestorId}|$type'];
      } else {
        list = _byDomainType['${level.domain}|$type'];
      }
      if (list != null) out.addAll(list);
    }
    return out.where((e) => e.domains.contains(level.domain)).toList();
  }

  /// The strength of a match, or 0.
  int score(CatalogEntity entity, String query, String compact) {
    final k = _keys[entity.id];
    if (k == null) return 0;
    var best = 0;
    int max(int a, int b) => a > b ? a : b;
    for (final name in k.names) {
      if (name == query) return MatchStrength.exact;
      if (name.startsWith(query)) {
        best = max(best, MatchStrength.prefix);
      } else if (query.length >= 3 && name.contains(query)) {
        best = max(best, MatchStrength.contains);
      }
    }
    for (final alias in k.aliases) {
      if (alias == query) {
        best = max(best, MatchStrength.exactAlias);
      } else if (alias.startsWith(query)) {
        best = max(best, MatchStrength.aliasPrefix);
      } else if (query.length >= 3 && alias.contains(query)) {
        best = max(best, MatchStrength.aliasContains);
      }
    }
    if (compact.length >= 2) {
      for (final code in k.codes) {
        if (code == compact) {
          best = max(best, MatchStrength.exactCode);
        } else if (code.startsWith(compact)) {
          best = max(best, MatchStrength.codePrefix);
        } else if (compact.length >= 3 && code.contains(compact)) {
          best = max(best, MatchStrength.codeContains);
        }
      }
    }
    return best;
  }
}

/// Recent (0 = most recent) and frequent use of one entity, on this device.
class CatalogUse {
  const CatalogUse({this.recent, this.count = 0});
  final int? recent;
  final int count;
}

class RankedEntity {
  const RankedEntity(this.entity, this.score);
  final CatalogEntity entity;
  final int score;
}

/// Ranks entities against [query]: match strength, then recent use, then
/// frequent use, then name order; the original order breaks what is left
/// (the reference's sort is stable).
List<RankedEntity> rank(
  int Function(CatalogEntity entity, String folded, String compact) scoreOf,
  List<CatalogEntity> entities,
  String query, {
  Map<String, CatalogUse> usage = const {},
}) {
  final q = searchKey(query);
  final compact = compactKey(query);
  final scored = <(RankedEntity, int)>[];
  for (var i = 0; i < entities.length; i++) {
    final score = q.isNotEmpty ? scoreOf(entities[i], q, compact) : 1;
    if (score > 0) scored.add((RankedEntity(entities[i], score), i));
  }
  scored.sort((x, y) {
    final (a, ia) = x;
    final (b, ib) = y;
    if (b.score != a.score) return b.score - a.score;
    final ua = usage[a.entity.id];
    final ub = usage[b.entity.id];
    final ra = ua?.recent ?? 1 << 30;
    final rb = ub?.recent ?? 1 << 30;
    if (ra != rb) return ra - rb;
    final ca = ua?.count ?? 0;
    final cb = ub?.count ?? 0;
    if (ca != cb) return cb - ca;
    // Name order only between two entries that both have one (the
    // customer's); anything else keeps its place, as in the reference.
    final ka = a.entity.sortKey;
    final kb = b.entity.sortKey;
    if (ka != null && kb != null) {
      final byName = ka.compareTo(kb);
      if (byName != 0) return byName;
    }
    return ia - ib;
  });
  return [for (final (r, _) in scored) r];
}
