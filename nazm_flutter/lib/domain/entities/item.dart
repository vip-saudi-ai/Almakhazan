// The inventory record.
//
// Field for field the reference's normalised item (src/validation.js
// normalizeItem). `toJson` produces the record as the reference stores and
// backs it up; `fromJson` reads that shape. Validation and normalisation of
// untrusted input live in the item normaliser (phase 2), not here.

import 'package:decimal/decimal.dart';

import '../../core/serialization/json_number.dart';

/// A valuation: a range in one currency. Never summed across currencies.
class Valuation {
  const Valuation({
    required this.min,
    required this.max,
    required this.currency,
    this.source,
    this.valuationType,
    this.valuationDate,
  });

  final Decimal min;
  final Decimal max;
  final String currency;

  /// manual | ai | import … (the reference's VALUATION_SOURCES).
  final String? source;

  /// estimate | … (the reference's VALUATION_TYPES).
  final String? valuationType;

  /// UTC milliseconds.
  final int? valuationDate;

  /// The order/range key (the reference's `valuationMidpoint`), computed in
  /// double arithmetic exactly as the reference does, so kept totals agree.
  double get midpoint => (min.toDouble() + max.toDouble()) / 2;

  static Valuation? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final min = _decimal(raw['min']);
    final max = _decimal(raw['max']);
    if (min == null && max == null) return null;
    final currency = raw['currency'];
    if (currency is! String || currency.isEmpty) return null;
    return Valuation(
      min: min ?? max!,
      max: max ?? min!,
      currency: currency,
      source: raw['source'] is String ? raw['source'] as String : null,
      valuationType: raw['valuationType'] is String ? raw['valuationType'] as String : null,
      valuationDate: raw['valuationDate'] is num ? (raw['valuationDate'] as num).toInt() : null,
    );
  }

  /// Numbers are written as JSON numbers, exactly as parsed: `1500.5` stays
  /// `1500.5`, `2000` stays `2000`.
  Map<String, Object?> toJson() => {
    'min': _jsonNumber(min),
    'max': _jsonNumber(max),
    'currency': currency,
    if (source != null) 'source': source,
    if (valuationType != null) 'valuationType': valuationType,
    if (valuationDate != null) 'valuationDate': valuationDate,
  };

  static Decimal? _decimal(Object? v) {
    if (v is int) return Decimal.fromInt(v);
    if (v is double) return v.isFinite ? Decimal.parse(v.toString()) : null;
    if (v is String) return Decimal.tryParse(v.trim());
    return null;
  }

  static num _jsonNumber(Decimal d) => d.isInteger ? d.toBigInt().toInt() : double.parse(d.toString());

  @override
  bool operator ==(Object other) =>
      other is Valuation &&
      other.min == min &&
      other.max == max &&
      other.currency == currency &&
      other.source == source &&
      other.valuationType == valuationType &&
      other.valuationDate == valuationDate;

  @override
  int get hashCode => Object.hash(min, max, currency, source, valuationType, valuationDate);
}

/// An image reference on a record. The bytes are the media store's; this is
/// the record's pointer (`mediaId`) and what it knows about the image.
class ItemImage {
  const ItemImage(this.raw);

  /// The reference image descriptor, kept whole so nothing is lost on a
  /// round trip (storagePath, thumbnailPath, hash, dimensions…).
  final Map<String, Object?> raw;

  String get id => raw['id'] as String;
  String? get mediaId => raw['mediaId'] as String?;

  Map<String, Object?> toJson() => raw;
}

class Item {
  const Item({
    required this.id,
    required this.name,
    this.sku = '',
    this.barcode = '',
    this.serialNumber = '',
    this.modelNumber = '',
    this.referenceNumber = '',
    this.mainCategoryId,
    required this.categoryId,
    this.subcategoryId,
    this.legacyCategoryId,
    this.customFields = const {},
    this.customFieldDefs = const [],
    this.folderId,
    this.locationId,
    this.quantity = 1,
    required this.unit,
    this.condition = '',
    this.brand = '',
    this.valuation,
    this.description = '',
    this.images = const [],
    this.primaryImageId,
    this.aiData,
    this.importJobId,
    this.sourceLine,
    required this.createdAt,
    this.createdBy,
    required this.updatedAt,
    this.updatedBy,
    this.deletedAt,
    this.deletedBy,
    this.version = 1,
  });

  final String id;
  final String name;
  final String sku;
  final String barcode;
  final String serialNumber;
  final String modelNumber;
  final String referenceNumber;
  final String? mainCategoryId;
  final String categoryId;
  final String? subcategoryId;
  final String? legacyCategoryId;

  /// Values keyed by field id. A catalog value is `{ref, label}`.
  final Map<String, Object?> customFields;
  final List<Map<String, Object?>> customFieldDefs;
  final String? folderId;
  final String? locationId;
  final num quantity;
  final String unit;

  /// The stored condition value, exactly as the reference stores it.
  final String condition;
  final String brand;
  final Valuation? valuation;
  final String description;
  final List<ItemImage> images;
  final String? primaryImageId;
  final Map<String, Object?>? aiData;
  final String? importJobId;
  final int? sourceLine;

  /// UTC milliseconds since the epoch.
  final int createdAt;
  final String? createdBy;
  final int updatedAt;
  final String? updatedBy;
  final int? deletedAt;
  final String? deletedBy;
  final int version;

  bool get isDeleted => deletedAt != null;
  bool get hasImages => images.isNotEmpty;
  List<String> get customFieldIds => customFields.keys.toList();

  static String _s(Object? v) => v is String ? v : '';
  static String? _n(Object? v) => v is String && v.isNotEmpty ? v : null;
  static int? _i(Object? v) => v is int ? v : (v is double && v.isFinite ? v.toInt() : null);

  /// Reads the reference's stored/backed-up record shape. Assumes a record
  /// that has already been normalised (a backup's or the database's).
  factory Item.fromJson(Map<String, Object?> json) => Item(
    id: json['id'] as String,
    name: _s(json['name']),
    sku: _s(json['sku']),
    barcode: _s(json['barcode']),
    serialNumber: _s(json['serialNumber']),
    modelNumber: _s(json['modelNumber']),
    referenceNumber: _s(json['referenceNumber']),
    mainCategoryId: _n(json['mainCategoryId']),
    categoryId: _s(json['categoryId']),
    subcategoryId: _n(json['subcategoryId']),
    legacyCategoryId: _n(json['legacyCategoryId']),
    customFields: Map<String, Object?>.from((json['customFields'] as Map?) ?? const {}),
    customFieldDefs: [
      for (final d in (json['customFieldDefs'] as List?) ?? const []) Map<String, Object?>.from(d as Map),
    ],
    folderId: _n(json['folderId']),
    locationId: _n(json['locationId']),
    quantity: (json['quantity'] as num?) ?? 1,
    unit: _s(json['unit']),
    condition: _s(json['condition']),
    brand: _s(json['brand']),
    valuation: Valuation.fromJson(json['valuation']),
    description: _s(json['description']),
    images: [for (final i in (json['images'] as List?) ?? const []) ItemImage(Map<String, Object?>.from(i as Map))],
    primaryImageId: _n(json['primaryImageId']),
    aiData: json['aiData'] is Map ? Map<String, Object?>.from(json['aiData'] as Map) : null,
    importJobId: _n(json['importJobId']),
    sourceLine: _i(json['sourceLine']),
    createdAt: _i(json['createdAt']) ?? 0,
    createdBy: _n(json['createdBy']),
    updatedAt: _i(json['updatedAt']) ?? 0,
    updatedBy: _n(json['updatedBy']),
    deletedAt: _i(json['deletedAt']),
    deletedBy: _n(json['deletedBy']),
    version: _i(json['version']) ?? 1,
  );

  /// The record in the reference's shape (what a backup chunk line holds,
  /// without the derived index fields).
  Map<String, Object?> toJson() => {
    'id': id,
    'name': name,
    'sku': sku,
    'barcode': barcode,
    'serialNumber': serialNumber,
    'modelNumber': modelNumber,
    'referenceNumber': referenceNumber,
    'mainCategoryId': mainCategoryId,
    'categoryId': categoryId,
    'subcategoryId': subcategoryId,
    'legacyCategoryId': legacyCategoryId,
    'customFields': customFields,
    'customFieldIds': customFieldIds,
    'customFieldDefs': customFieldDefs,
    'folderId': folderId,
    'locationId': locationId,
    'quantity': jsNumber(quantity),
    'unit': unit,
    'condition': condition,
    'brand': brand,
    'valuation': valuation?.toJson(),
    'description': description,
    'images': [for (final i in images) i.toJson()],
    'primaryImageId': primaryImageId,
    'aiData': aiData,
    'importJobId': importJobId,
    'sourceLine': sourceLine,
    'createdAt': createdAt,
    'createdBy': createdBy,
    'updatedAt': updatedAt,
    'updatedBy': updatedBy,
    'deletedAt': deletedAt,
    'deletedBy': deletedBy,
    'version': version,
  };
}
