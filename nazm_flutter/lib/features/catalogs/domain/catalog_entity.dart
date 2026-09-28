// A catalog entity — a brand, manufacturer, collection, model, reference,
// artist, laboratory… — built-in (bundled asset) or the customer's own.
// Ported from the reference (src/catalog/model.js).

import '../../../core/text/arabic.dart';

final RegExp _catalogId = RegExp(r'^[a-z0-9][a-z0-9_.-]{0,127}$');
final RegExp _codeSeparators = RegExp(r'[\s./\-_–]+');
const customPrefix = 'cust_';

bool isCatalogId(Object? id) => id is String && _catalogId.hasMatch(id);
bool isCustomCatalogId(Object? id) => isCatalogId(id) && (id! as String).startsWith(customPrefix);

/// The key a label or alias is searched by; the label itself never changes.
String searchKey(String? text) => normalizeArabic(text ?? '');

/// Codes compared without spaces, dots, slashes or dashes:
/// «126500 LN» = «126500LN», «5711/1A» = «57111a».
String compactKey(String? text) => searchKey(text).replaceAll(_codeSeparators, '');

enum CatalogStatus { active, deprecated, retired }

class CatalogEntity {
  const CatalogEntity({
    required this.id,
    required this.domains,
    required this.entityType,
    this.parentId,
    this.nameAr = '',
    this.nameEn = '',
    this.aliasesAr = const [],
    this.aliasesEn = const [],
    this.code,
    this.metadata = const {},
    this.custom = false,
    this.status = CatalogStatus.active,
    this.redirectTo,
    this.sortKey,
    this.createdAt,
    this.updatedAt,
    this.retiredAt,
  });

  final String id;
  final List<String> domains;
  final String entityType;
  final String? parentId;
  final String nameAr;
  final String nameEn;
  final List<String> aliasesAr;
  final List<String> aliasesEn;
  final String? code;
  final Map<String, Object?> metadata;

  /// The customer's own entry (`source: custom`), never part of the bundle.
  final bool custom;
  final CatalogStatus status;
  final String? redirectTo;

  /// Name order for the customer's entries only. Built-in entries carry none,
  /// as in the reference: among equally good matches they keep the curated
  /// order of the catalog data (Rolex, Tudor, Patek Philippe…), not A–Z.
  final String? sortKey;
  final int? createdAt;
  final int? updatedAt;
  final int? retiredAt;

  bool get isActive => status == CatalogStatus.active;

  /// The label in a language, the other language as fallback. Official Latin
  /// spellings are shown as they are.
  String label(String language) =>
      language == 'ar' ? (nameAr.isNotEmpty ? nameAr : nameEn) : (nameEn.isNotEmpty ? nameEn : nameAr);

  /// Reads a normalised entity (the reference's shape, as in the assets and
  /// in backups); null when it is not one.
  static CatalogEntity? fromJson(Map<String, Object?> j) {
    if (!isCatalogId(j['id'])) return null;
    List<String> strings(Object? v) => [for (final s in (v as List?) ?? const []) '$s'];
    final nameEn = (j['nameEn'] as String?) ?? '';
    final nameAr = (j['nameAr'] as String?) ?? '';
    if (nameEn.isEmpty && nameAr.isEmpty) return null;
    int? n(Object? v) => v is num ? v.toInt() : null;
    return CatalogEntity(
      id: j['id']! as String,
      domains: strings(j['domains']),
      entityType: j['entityType']! as String,
      parentId: isCatalogId(j['parentId']) ? j['parentId']! as String : null,
      nameAr: nameAr,
      nameEn: nameEn,
      aliasesAr: strings(j['aliasesAr']),
      aliasesEn: strings(j['aliasesEn']),
      code: j['code'] as String?,
      metadata: Map<String, Object?>.from((j['metadata'] as Map?) ?? const {}),
      custom: j['source'] == 'custom',
      status: CatalogStatus.values.firstWhere((s) => s.name == j['status'], orElse: () => CatalogStatus.active),
      redirectTo: isCatalogId(j['redirectTo']) ? j['redirectTo']! as String : null,
      sortKey: j['source'] == 'custom'
          ? (j['sortKey'] as String?) ?? nameSortKey(nameEn.isNotEmpty ? nameEn : nameAr)
          : null,
      createdAt: n(j['createdAt']),
      updatedAt: n(j['updatedAt']),
      retiredAt: n(j['retiredAt']),
    );
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'domains': domains,
    'entityType': entityType,
    'parentId': parentId,
    'nameAr': nameAr,
    'nameEn': nameEn,
    'aliasesAr': aliasesAr,
    'aliasesEn': aliasesEn,
    'code': code,
    'metadata': metadata,
    'source': custom ? 'custom' : 'catalog',
    'status': status.name,
    'redirectTo': redirectTo,
    'sortKey': sortKey ?? nameSortKey(nameEn.isNotEmpty ? nameEn : nameAr),
    if (custom) 'createdAt': createdAt,
    if (custom) 'updatedAt': updatedAt,
    if (retiredAt != null) 'retiredAt': retiredAt,
  };
}

/// Every string an entity can be found by, folded once.
class EntityKeys {
  EntityKeys(CatalogEntity e)
    : names = [e.nameEn, e.nameAr].where((s) => s.isNotEmpty).map(searchKey).toList(),
      aliases = [...e.aliasesEn, ...e.aliasesAr].map(searchKey).where((s) => s.isNotEmpty).toList(),
      codes = [e.code ?? '', e.nameEn].where((s) => s.isNotEmpty).map(compactKey).where((k) => k.length >= 2).toList();

  final List<String> names;
  final List<String> aliases;
  final List<String> codes;
}
