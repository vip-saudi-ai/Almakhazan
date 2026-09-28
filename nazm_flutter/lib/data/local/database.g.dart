// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'database.dart';

// ignore_for_file: type=lint
class $ItemsTable extends Items with TableInfo<$ItemsTable, ItemRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ItemsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('local'),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _nameSortKeyMeta = const VerificationMeta('nameSortKey');
  @override
  late final GeneratedColumn<String> nameSortKey = GeneratedColumn<String>(
    'name_sort_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _skuMeta = const VerificationMeta('sku');
  @override
  late final GeneratedColumn<String> sku = GeneratedColumn<String>(
    'sku',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _barcodeMeta = const VerificationMeta('barcode');
  @override
  late final GeneratedColumn<String> barcode = GeneratedColumn<String>(
    'barcode',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _serialNumberMeta = const VerificationMeta('serialNumber');
  @override
  late final GeneratedColumn<String> serialNumber = GeneratedColumn<String>(
    'serial_number',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _modelNumberMeta = const VerificationMeta('modelNumber');
  @override
  late final GeneratedColumn<String> modelNumber = GeneratedColumn<String>(
    'model_number',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _referenceNumberMeta = const VerificationMeta('referenceNumber');
  @override
  late final GeneratedColumn<String> referenceNumber = GeneratedColumn<String>(
    'reference_number',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _brandMeta = const VerificationMeta('brand');
  @override
  late final GeneratedColumn<String> brand = GeneratedColumn<String>(
    'brand',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _mainCategoryIdMeta = const VerificationMeta('mainCategoryId');
  @override
  late final GeneratedColumn<String> mainCategoryId = GeneratedColumn<String>(
    'main_category_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _categoryIdMeta = const VerificationMeta('categoryId');
  @override
  late final GeneratedColumn<String> categoryId = GeneratedColumn<String>(
    'category_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _subcategoryIdMeta = const VerificationMeta('subcategoryId');
  @override
  late final GeneratedColumn<String> subcategoryId = GeneratedColumn<String>(
    'subcategory_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _legacyCategoryIdMeta = const VerificationMeta('legacyCategoryId');
  @override
  late final GeneratedColumn<String> legacyCategoryId = GeneratedColumn<String>(
    'legacy_category_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _folderIdMeta = const VerificationMeta('folderId');
  @override
  late final GeneratedColumn<String> folderId = GeneratedColumn<String>(
    'folder_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _locationIdMeta = const VerificationMeta('locationId');
  @override
  late final GeneratedColumn<String> locationId = GeneratedColumn<String>(
    'location_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _quantityMeta = const VerificationMeta('quantity');
  @override
  late final GeneratedColumn<double> quantity = GeneratedColumn<double>(
    'quantity',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(1),
  );
  static const VerificationMeta _unitMeta = const VerificationMeta('unit');
  @override
  late final GeneratedColumn<String> unit = GeneratedColumn<String>(
    'unit',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _conditionMeta = const VerificationMeta('condition');
  @override
  late final GeneratedColumn<String> condition = GeneratedColumn<String>(
    'condition',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _valuationMinMeta = const VerificationMeta('valuationMin');
  @override
  late final GeneratedColumn<String> valuationMin = GeneratedColumn<String>(
    'valuation_min',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _valuationMaxMeta = const VerificationMeta('valuationMax');
  @override
  late final GeneratedColumn<String> valuationMax = GeneratedColumn<String>(
    'valuation_max',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _valuationCurrencyMeta = const VerificationMeta('valuationCurrency');
  @override
  late final GeneratedColumn<String> valuationCurrency = GeneratedColumn<String>(
    'valuation_currency',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _valuationMidpointMeta = const VerificationMeta('valuationMidpoint');
  @override
  late final GeneratedColumn<double> valuationMidpoint = GeneratedColumn<double>(
    'valuation_midpoint',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _valuationSourceMeta = const VerificationMeta('valuationSource');
  @override
  late final GeneratedColumn<String> valuationSource = GeneratedColumn<String>(
    'valuation_source',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _valuationTypeMeta = const VerificationMeta('valuationType');
  @override
  late final GeneratedColumn<String> valuationType = GeneratedColumn<String>(
    'valuation_type',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _valuationDateMeta = const VerificationMeta('valuationDate');
  @override
  late final GeneratedColumn<int> valuationDate = GeneratedColumn<int>(
    'valuation_date',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _descriptionMeta = const VerificationMeta('description');
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
    'description',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _imagesJsonMeta = const VerificationMeta('imagesJson');
  @override
  late final GeneratedColumn<String> imagesJson = GeneratedColumn<String>(
    'images_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _primaryImageIdMeta = const VerificationMeta('primaryImageId');
  @override
  late final GeneratedColumn<String> primaryImageId = GeneratedColumn<String>(
    'primary_image_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _hasImagesMeta = const VerificationMeta('hasImages');
  @override
  late final GeneratedColumn<bool> hasImages = GeneratedColumn<bool>(
    'has_images',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways('CHECK ("has_images" IN (0, 1))'),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _customFieldsJsonMeta = const VerificationMeta('customFieldsJson');
  @override
  late final GeneratedColumn<String> customFieldsJson = GeneratedColumn<String>(
    'custom_fields_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('{}'),
  );
  static const VerificationMeta _customFieldDefsJsonMeta = const VerificationMeta('customFieldDefsJson');
  @override
  late final GeneratedColumn<String> customFieldDefsJson = GeneratedColumn<String>(
    'custom_field_defs_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _aiDataJsonMeta = const VerificationMeta('aiDataJson');
  @override
  late final GeneratedColumn<String> aiDataJson = GeneratedColumn<String>(
    'ai_data_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _importJobIdMeta = const VerificationMeta('importJobId');
  @override
  late final GeneratedColumn<String> importJobId = GeneratedColumn<String>(
    'import_job_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _sourceLineMeta = const VerificationMeta('sourceLine');
  @override
  late final GeneratedColumn<int> sourceLine = GeneratedColumn<int>(
    'source_line',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdByMeta = const VerificationMeta('createdBy');
  @override
  late final GeneratedColumn<String> createdBy = GeneratedColumn<String>(
    'created_by',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedByMeta = const VerificationMeta('updatedBy');
  @override
  late final GeneratedColumn<String> updatedBy = GeneratedColumn<String>(
    'updated_by',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _deletedAtMeta = const VerificationMeta('deletedAt');
  @override
  late final GeneratedColumn<int> deletedAt = GeneratedColumn<int>(
    'deleted_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _deletedByMeta = const VerificationMeta('deletedBy');
  @override
  late final GeneratedColumn<String> deletedBy = GeneratedColumn<String>(
    'deleted_by',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _versionMeta = const VerificationMeta('version');
  @override
  late final GeneratedColumn<int> version = GeneratedColumn<int>(
    'version',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(1),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    workspaceId,
    name,
    nameSortKey,
    sku,
    barcode,
    serialNumber,
    modelNumber,
    referenceNumber,
    brand,
    mainCategoryId,
    categoryId,
    subcategoryId,
    legacyCategoryId,
    folderId,
    locationId,
    quantity,
    unit,
    condition,
    valuationMin,
    valuationMax,
    valuationCurrency,
    valuationMidpoint,
    valuationSource,
    valuationType,
    valuationDate,
    description,
    imagesJson,
    primaryImageId,
    hasImages,
    customFieldsJson,
    customFieldDefsJson,
    aiDataJson,
    importJobId,
    sourceLine,
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    deletedAt,
    deletedBy,
    version,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'items';
  @override
  VerificationContext validateIntegrity(Insertable<ItemRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    }
    if (data.containsKey('name')) {
      context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    }
    if (data.containsKey('name_sort_key')) {
      context.handle(_nameSortKeyMeta, nameSortKey.isAcceptableOrUnknown(data['name_sort_key']!, _nameSortKeyMeta));
    }
    if (data.containsKey('sku')) {
      context.handle(_skuMeta, sku.isAcceptableOrUnknown(data['sku']!, _skuMeta));
    }
    if (data.containsKey('barcode')) {
      context.handle(_barcodeMeta, barcode.isAcceptableOrUnknown(data['barcode']!, _barcodeMeta));
    }
    if (data.containsKey('serial_number')) {
      context.handle(_serialNumberMeta, serialNumber.isAcceptableOrUnknown(data['serial_number']!, _serialNumberMeta));
    }
    if (data.containsKey('model_number')) {
      context.handle(_modelNumberMeta, modelNumber.isAcceptableOrUnknown(data['model_number']!, _modelNumberMeta));
    }
    if (data.containsKey('reference_number')) {
      context.handle(
        _referenceNumberMeta,
        referenceNumber.isAcceptableOrUnknown(data['reference_number']!, _referenceNumberMeta),
      );
    }
    if (data.containsKey('brand')) {
      context.handle(_brandMeta, brand.isAcceptableOrUnknown(data['brand']!, _brandMeta));
    }
    if (data.containsKey('main_category_id')) {
      context.handle(
        _mainCategoryIdMeta,
        mainCategoryId.isAcceptableOrUnknown(data['main_category_id']!, _mainCategoryIdMeta),
      );
    }
    if (data.containsKey('category_id')) {
      context.handle(_categoryIdMeta, categoryId.isAcceptableOrUnknown(data['category_id']!, _categoryIdMeta));
    } else if (isInserting) {
      context.missing(_categoryIdMeta);
    }
    if (data.containsKey('subcategory_id')) {
      context.handle(
        _subcategoryIdMeta,
        subcategoryId.isAcceptableOrUnknown(data['subcategory_id']!, _subcategoryIdMeta),
      );
    }
    if (data.containsKey('legacy_category_id')) {
      context.handle(
        _legacyCategoryIdMeta,
        legacyCategoryId.isAcceptableOrUnknown(data['legacy_category_id']!, _legacyCategoryIdMeta),
      );
    }
    if (data.containsKey('folder_id')) {
      context.handle(_folderIdMeta, folderId.isAcceptableOrUnknown(data['folder_id']!, _folderIdMeta));
    }
    if (data.containsKey('location_id')) {
      context.handle(_locationIdMeta, locationId.isAcceptableOrUnknown(data['location_id']!, _locationIdMeta));
    }
    if (data.containsKey('quantity')) {
      context.handle(_quantityMeta, quantity.isAcceptableOrUnknown(data['quantity']!, _quantityMeta));
    }
    if (data.containsKey('unit')) {
      context.handle(_unitMeta, unit.isAcceptableOrUnknown(data['unit']!, _unitMeta));
    } else if (isInserting) {
      context.missing(_unitMeta);
    }
    if (data.containsKey('condition')) {
      context.handle(_conditionMeta, condition.isAcceptableOrUnknown(data['condition']!, _conditionMeta));
    }
    if (data.containsKey('valuation_min')) {
      context.handle(_valuationMinMeta, valuationMin.isAcceptableOrUnknown(data['valuation_min']!, _valuationMinMeta));
    }
    if (data.containsKey('valuation_max')) {
      context.handle(_valuationMaxMeta, valuationMax.isAcceptableOrUnknown(data['valuation_max']!, _valuationMaxMeta));
    }
    if (data.containsKey('valuation_currency')) {
      context.handle(
        _valuationCurrencyMeta,
        valuationCurrency.isAcceptableOrUnknown(data['valuation_currency']!, _valuationCurrencyMeta),
      );
    }
    if (data.containsKey('valuation_midpoint')) {
      context.handle(
        _valuationMidpointMeta,
        valuationMidpoint.isAcceptableOrUnknown(data['valuation_midpoint']!, _valuationMidpointMeta),
      );
    }
    if (data.containsKey('valuation_source')) {
      context.handle(
        _valuationSourceMeta,
        valuationSource.isAcceptableOrUnknown(data['valuation_source']!, _valuationSourceMeta),
      );
    }
    if (data.containsKey('valuation_type')) {
      context.handle(
        _valuationTypeMeta,
        valuationType.isAcceptableOrUnknown(data['valuation_type']!, _valuationTypeMeta),
      );
    }
    if (data.containsKey('valuation_date')) {
      context.handle(
        _valuationDateMeta,
        valuationDate.isAcceptableOrUnknown(data['valuation_date']!, _valuationDateMeta),
      );
    }
    if (data.containsKey('description')) {
      context.handle(_descriptionMeta, description.isAcceptableOrUnknown(data['description']!, _descriptionMeta));
    }
    if (data.containsKey('images_json')) {
      context.handle(_imagesJsonMeta, imagesJson.isAcceptableOrUnknown(data['images_json']!, _imagesJsonMeta));
    }
    if (data.containsKey('primary_image_id')) {
      context.handle(
        _primaryImageIdMeta,
        primaryImageId.isAcceptableOrUnknown(data['primary_image_id']!, _primaryImageIdMeta),
      );
    }
    if (data.containsKey('has_images')) {
      context.handle(_hasImagesMeta, hasImages.isAcceptableOrUnknown(data['has_images']!, _hasImagesMeta));
    }
    if (data.containsKey('custom_fields_json')) {
      context.handle(
        _customFieldsJsonMeta,
        customFieldsJson.isAcceptableOrUnknown(data['custom_fields_json']!, _customFieldsJsonMeta),
      );
    }
    if (data.containsKey('custom_field_defs_json')) {
      context.handle(
        _customFieldDefsJsonMeta,
        customFieldDefsJson.isAcceptableOrUnknown(data['custom_field_defs_json']!, _customFieldDefsJsonMeta),
      );
    }
    if (data.containsKey('ai_data_json')) {
      context.handle(_aiDataJsonMeta, aiDataJson.isAcceptableOrUnknown(data['ai_data_json']!, _aiDataJsonMeta));
    }
    if (data.containsKey('import_job_id')) {
      context.handle(_importJobIdMeta, importJobId.isAcceptableOrUnknown(data['import_job_id']!, _importJobIdMeta));
    }
    if (data.containsKey('source_line')) {
      context.handle(_sourceLineMeta, sourceLine.isAcceptableOrUnknown(data['source_line']!, _sourceLineMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('created_by')) {
      context.handle(_createdByMeta, createdBy.isAcceptableOrUnknown(data['created_by']!, _createdByMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('updated_by')) {
      context.handle(_updatedByMeta, updatedBy.isAcceptableOrUnknown(data['updated_by']!, _updatedByMeta));
    }
    if (data.containsKey('deleted_at')) {
      context.handle(_deletedAtMeta, deletedAt.isAcceptableOrUnknown(data['deleted_at']!, _deletedAtMeta));
    }
    if (data.containsKey('deleted_by')) {
      context.handle(_deletedByMeta, deletedBy.isAcceptableOrUnknown(data['deleted_by']!, _deletedByMeta));
    }
    if (data.containsKey('version')) {
      context.handle(_versionMeta, version.isAcceptableOrUnknown(data['version']!, _versionMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ItemRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ItemRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      nameSortKey: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name_sort_key'])!,
      sku: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}sku']),
      barcode: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}barcode']),
      serialNumber: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}serial_number']),
      modelNumber: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}model_number']),
      referenceNumber: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}reference_number'],
      ),
      brand: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}brand']),
      mainCategoryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}main_category_id'],
      ),
      categoryId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}category_id'])!,
      subcategoryId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}subcategory_id']),
      legacyCategoryId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}legacy_category_id'],
      ),
      folderId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}folder_id']),
      locationId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}location_id']),
      quantity: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}quantity'])!,
      unit: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}unit'])!,
      condition: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}condition'])!,
      valuationMin: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}valuation_min']),
      valuationMax: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}valuation_max']),
      valuationCurrency: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}valuation_currency'],
      ),
      valuationMidpoint: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}valuation_midpoint'],
      ),
      valuationSource: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}valuation_source'],
      ),
      valuationType: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}valuation_type']),
      valuationDate: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}valuation_date']),
      description: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}description'])!,
      imagesJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}images_json'])!,
      primaryImageId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}primary_image_id'],
      ),
      hasImages: attachedDatabase.typeMapping.read(DriftSqlType.bool, data['${effectivePrefix}has_images'])!,
      customFieldsJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}custom_fields_json'],
      )!,
      customFieldDefsJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}custom_field_defs_json'],
      )!,
      aiDataJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}ai_data_json']),
      importJobId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}import_job_id']),
      sourceLine: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}source_line']),
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
      createdBy: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}created_by']),
      updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
      updatedBy: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}updated_by']),
      deletedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}deleted_at']),
      deletedBy: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}deleted_by']),
      version: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}version'])!,
    );
  }

  @override
  $ItemsTable createAlias(String alias) {
    return $ItemsTable(attachedDatabase, alias);
  }
}

class ItemRow extends DataClass implements Insertable<ItemRow> {
  final String id;
  final String workspaceId;
  final String name;
  final String nameSortKey;
  final String? sku;
  final String? barcode;
  final String? serialNumber;
  final String? modelNumber;
  final String? referenceNumber;
  final String? brand;
  final String? mainCategoryId;
  final String categoryId;
  final String? subcategoryId;
  final String? legacyCategoryId;
  final String? folderId;
  final String? locationId;

  /// The reference allows fractional quantities for measured units.
  final double quantity;
  final String unit;

  /// The stored condition value, exactly as the reference stores it.
  final String condition;

  /// Exact decimal text; never summed across currencies.
  final String? valuationMin;
  final String? valuationMax;
  final String? valuationCurrency;

  /// Order/range key only (the reference's `valuationMidpoint`).
  final double? valuationMidpoint;
  final String? valuationSource;
  final String? valuationType;
  final int? valuationDate;
  final String description;
  final String imagesJson;
  final String? primaryImageId;
  final bool hasImages;
  final String customFieldsJson;
  final String customFieldDefsJson;
  final String? aiDataJson;
  final String? importJobId;
  final int? sourceLine;
  final int createdAt;
  final String? createdBy;
  final int updatedAt;
  final String? updatedBy;
  final int? deletedAt;
  final String? deletedBy;
  final int version;
  const ItemRow({
    required this.id,
    required this.workspaceId,
    required this.name,
    required this.nameSortKey,
    this.sku,
    this.barcode,
    this.serialNumber,
    this.modelNumber,
    this.referenceNumber,
    this.brand,
    this.mainCategoryId,
    required this.categoryId,
    this.subcategoryId,
    this.legacyCategoryId,
    this.folderId,
    this.locationId,
    required this.quantity,
    required this.unit,
    required this.condition,
    this.valuationMin,
    this.valuationMax,
    this.valuationCurrency,
    this.valuationMidpoint,
    this.valuationSource,
    this.valuationType,
    this.valuationDate,
    required this.description,
    required this.imagesJson,
    this.primaryImageId,
    required this.hasImages,
    required this.customFieldsJson,
    required this.customFieldDefsJson,
    this.aiDataJson,
    this.importJobId,
    this.sourceLine,
    required this.createdAt,
    this.createdBy,
    required this.updatedAt,
    this.updatedBy,
    this.deletedAt,
    this.deletedBy,
    required this.version,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_id'] = Variable<String>(workspaceId);
    map['name'] = Variable<String>(name);
    map['name_sort_key'] = Variable<String>(nameSortKey);
    if (!nullToAbsent || sku != null) {
      map['sku'] = Variable<String>(sku);
    }
    if (!nullToAbsent || barcode != null) {
      map['barcode'] = Variable<String>(barcode);
    }
    if (!nullToAbsent || serialNumber != null) {
      map['serial_number'] = Variable<String>(serialNumber);
    }
    if (!nullToAbsent || modelNumber != null) {
      map['model_number'] = Variable<String>(modelNumber);
    }
    if (!nullToAbsent || referenceNumber != null) {
      map['reference_number'] = Variable<String>(referenceNumber);
    }
    if (!nullToAbsent || brand != null) {
      map['brand'] = Variable<String>(brand);
    }
    if (!nullToAbsent || mainCategoryId != null) {
      map['main_category_id'] = Variable<String>(mainCategoryId);
    }
    map['category_id'] = Variable<String>(categoryId);
    if (!nullToAbsent || subcategoryId != null) {
      map['subcategory_id'] = Variable<String>(subcategoryId);
    }
    if (!nullToAbsent || legacyCategoryId != null) {
      map['legacy_category_id'] = Variable<String>(legacyCategoryId);
    }
    if (!nullToAbsent || folderId != null) {
      map['folder_id'] = Variable<String>(folderId);
    }
    if (!nullToAbsent || locationId != null) {
      map['location_id'] = Variable<String>(locationId);
    }
    map['quantity'] = Variable<double>(quantity);
    map['unit'] = Variable<String>(unit);
    map['condition'] = Variable<String>(condition);
    if (!nullToAbsent || valuationMin != null) {
      map['valuation_min'] = Variable<String>(valuationMin);
    }
    if (!nullToAbsent || valuationMax != null) {
      map['valuation_max'] = Variable<String>(valuationMax);
    }
    if (!nullToAbsent || valuationCurrency != null) {
      map['valuation_currency'] = Variable<String>(valuationCurrency);
    }
    if (!nullToAbsent || valuationMidpoint != null) {
      map['valuation_midpoint'] = Variable<double>(valuationMidpoint);
    }
    if (!nullToAbsent || valuationSource != null) {
      map['valuation_source'] = Variable<String>(valuationSource);
    }
    if (!nullToAbsent || valuationType != null) {
      map['valuation_type'] = Variable<String>(valuationType);
    }
    if (!nullToAbsent || valuationDate != null) {
      map['valuation_date'] = Variable<int>(valuationDate);
    }
    map['description'] = Variable<String>(description);
    map['images_json'] = Variable<String>(imagesJson);
    if (!nullToAbsent || primaryImageId != null) {
      map['primary_image_id'] = Variable<String>(primaryImageId);
    }
    map['has_images'] = Variable<bool>(hasImages);
    map['custom_fields_json'] = Variable<String>(customFieldsJson);
    map['custom_field_defs_json'] = Variable<String>(customFieldDefsJson);
    if (!nullToAbsent || aiDataJson != null) {
      map['ai_data_json'] = Variable<String>(aiDataJson);
    }
    if (!nullToAbsent || importJobId != null) {
      map['import_job_id'] = Variable<String>(importJobId);
    }
    if (!nullToAbsent || sourceLine != null) {
      map['source_line'] = Variable<int>(sourceLine);
    }
    map['created_at'] = Variable<int>(createdAt);
    if (!nullToAbsent || createdBy != null) {
      map['created_by'] = Variable<String>(createdBy);
    }
    map['updated_at'] = Variable<int>(updatedAt);
    if (!nullToAbsent || updatedBy != null) {
      map['updated_by'] = Variable<String>(updatedBy);
    }
    if (!nullToAbsent || deletedAt != null) {
      map['deleted_at'] = Variable<int>(deletedAt);
    }
    if (!nullToAbsent || deletedBy != null) {
      map['deleted_by'] = Variable<String>(deletedBy);
    }
    map['version'] = Variable<int>(version);
    return map;
  }

  ItemsCompanion toCompanion(bool nullToAbsent) {
    return ItemsCompanion(
      id: Value(id),
      workspaceId: Value(workspaceId),
      name: Value(name),
      nameSortKey: Value(nameSortKey),
      sku: sku == null && nullToAbsent ? const Value.absent() : Value(sku),
      barcode: barcode == null && nullToAbsent ? const Value.absent() : Value(barcode),
      serialNumber: serialNumber == null && nullToAbsent ? const Value.absent() : Value(serialNumber),
      modelNumber: modelNumber == null && nullToAbsent ? const Value.absent() : Value(modelNumber),
      referenceNumber: referenceNumber == null && nullToAbsent ? const Value.absent() : Value(referenceNumber),
      brand: brand == null && nullToAbsent ? const Value.absent() : Value(brand),
      mainCategoryId: mainCategoryId == null && nullToAbsent ? const Value.absent() : Value(mainCategoryId),
      categoryId: Value(categoryId),
      subcategoryId: subcategoryId == null && nullToAbsent ? const Value.absent() : Value(subcategoryId),
      legacyCategoryId: legacyCategoryId == null && nullToAbsent ? const Value.absent() : Value(legacyCategoryId),
      folderId: folderId == null && nullToAbsent ? const Value.absent() : Value(folderId),
      locationId: locationId == null && nullToAbsent ? const Value.absent() : Value(locationId),
      quantity: Value(quantity),
      unit: Value(unit),
      condition: Value(condition),
      valuationMin: valuationMin == null && nullToAbsent ? const Value.absent() : Value(valuationMin),
      valuationMax: valuationMax == null && nullToAbsent ? const Value.absent() : Value(valuationMax),
      valuationCurrency: valuationCurrency == null && nullToAbsent ? const Value.absent() : Value(valuationCurrency),
      valuationMidpoint: valuationMidpoint == null && nullToAbsent ? const Value.absent() : Value(valuationMidpoint),
      valuationSource: valuationSource == null && nullToAbsent ? const Value.absent() : Value(valuationSource),
      valuationType: valuationType == null && nullToAbsent ? const Value.absent() : Value(valuationType),
      valuationDate: valuationDate == null && nullToAbsent ? const Value.absent() : Value(valuationDate),
      description: Value(description),
      imagesJson: Value(imagesJson),
      primaryImageId: primaryImageId == null && nullToAbsent ? const Value.absent() : Value(primaryImageId),
      hasImages: Value(hasImages),
      customFieldsJson: Value(customFieldsJson),
      customFieldDefsJson: Value(customFieldDefsJson),
      aiDataJson: aiDataJson == null && nullToAbsent ? const Value.absent() : Value(aiDataJson),
      importJobId: importJobId == null && nullToAbsent ? const Value.absent() : Value(importJobId),
      sourceLine: sourceLine == null && nullToAbsent ? const Value.absent() : Value(sourceLine),
      createdAt: Value(createdAt),
      createdBy: createdBy == null && nullToAbsent ? const Value.absent() : Value(createdBy),
      updatedAt: Value(updatedAt),
      updatedBy: updatedBy == null && nullToAbsent ? const Value.absent() : Value(updatedBy),
      deletedAt: deletedAt == null && nullToAbsent ? const Value.absent() : Value(deletedAt),
      deletedBy: deletedBy == null && nullToAbsent ? const Value.absent() : Value(deletedBy),
      version: Value(version),
    );
  }

  factory ItemRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ItemRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      name: serializer.fromJson<String>(json['name']),
      nameSortKey: serializer.fromJson<String>(json['nameSortKey']),
      sku: serializer.fromJson<String?>(json['sku']),
      barcode: serializer.fromJson<String?>(json['barcode']),
      serialNumber: serializer.fromJson<String?>(json['serialNumber']),
      modelNumber: serializer.fromJson<String?>(json['modelNumber']),
      referenceNumber: serializer.fromJson<String?>(json['referenceNumber']),
      brand: serializer.fromJson<String?>(json['brand']),
      mainCategoryId: serializer.fromJson<String?>(json['mainCategoryId']),
      categoryId: serializer.fromJson<String>(json['categoryId']),
      subcategoryId: serializer.fromJson<String?>(json['subcategoryId']),
      legacyCategoryId: serializer.fromJson<String?>(json['legacyCategoryId']),
      folderId: serializer.fromJson<String?>(json['folderId']),
      locationId: serializer.fromJson<String?>(json['locationId']),
      quantity: serializer.fromJson<double>(json['quantity']),
      unit: serializer.fromJson<String>(json['unit']),
      condition: serializer.fromJson<String>(json['condition']),
      valuationMin: serializer.fromJson<String?>(json['valuationMin']),
      valuationMax: serializer.fromJson<String?>(json['valuationMax']),
      valuationCurrency: serializer.fromJson<String?>(json['valuationCurrency']),
      valuationMidpoint: serializer.fromJson<double?>(json['valuationMidpoint']),
      valuationSource: serializer.fromJson<String?>(json['valuationSource']),
      valuationType: serializer.fromJson<String?>(json['valuationType']),
      valuationDate: serializer.fromJson<int?>(json['valuationDate']),
      description: serializer.fromJson<String>(json['description']),
      imagesJson: serializer.fromJson<String>(json['imagesJson']),
      primaryImageId: serializer.fromJson<String?>(json['primaryImageId']),
      hasImages: serializer.fromJson<bool>(json['hasImages']),
      customFieldsJson: serializer.fromJson<String>(json['customFieldsJson']),
      customFieldDefsJson: serializer.fromJson<String>(json['customFieldDefsJson']),
      aiDataJson: serializer.fromJson<String?>(json['aiDataJson']),
      importJobId: serializer.fromJson<String?>(json['importJobId']),
      sourceLine: serializer.fromJson<int?>(json['sourceLine']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      createdBy: serializer.fromJson<String?>(json['createdBy']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
      updatedBy: serializer.fromJson<String?>(json['updatedBy']),
      deletedAt: serializer.fromJson<int?>(json['deletedAt']),
      deletedBy: serializer.fromJson<String?>(json['deletedBy']),
      version: serializer.fromJson<int>(json['version']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'name': serializer.toJson<String>(name),
      'nameSortKey': serializer.toJson<String>(nameSortKey),
      'sku': serializer.toJson<String?>(sku),
      'barcode': serializer.toJson<String?>(barcode),
      'serialNumber': serializer.toJson<String?>(serialNumber),
      'modelNumber': serializer.toJson<String?>(modelNumber),
      'referenceNumber': serializer.toJson<String?>(referenceNumber),
      'brand': serializer.toJson<String?>(brand),
      'mainCategoryId': serializer.toJson<String?>(mainCategoryId),
      'categoryId': serializer.toJson<String>(categoryId),
      'subcategoryId': serializer.toJson<String?>(subcategoryId),
      'legacyCategoryId': serializer.toJson<String?>(legacyCategoryId),
      'folderId': serializer.toJson<String?>(folderId),
      'locationId': serializer.toJson<String?>(locationId),
      'quantity': serializer.toJson<double>(quantity),
      'unit': serializer.toJson<String>(unit),
      'condition': serializer.toJson<String>(condition),
      'valuationMin': serializer.toJson<String?>(valuationMin),
      'valuationMax': serializer.toJson<String?>(valuationMax),
      'valuationCurrency': serializer.toJson<String?>(valuationCurrency),
      'valuationMidpoint': serializer.toJson<double?>(valuationMidpoint),
      'valuationSource': serializer.toJson<String?>(valuationSource),
      'valuationType': serializer.toJson<String?>(valuationType),
      'valuationDate': serializer.toJson<int?>(valuationDate),
      'description': serializer.toJson<String>(description),
      'imagesJson': serializer.toJson<String>(imagesJson),
      'primaryImageId': serializer.toJson<String?>(primaryImageId),
      'hasImages': serializer.toJson<bool>(hasImages),
      'customFieldsJson': serializer.toJson<String>(customFieldsJson),
      'customFieldDefsJson': serializer.toJson<String>(customFieldDefsJson),
      'aiDataJson': serializer.toJson<String?>(aiDataJson),
      'importJobId': serializer.toJson<String?>(importJobId),
      'sourceLine': serializer.toJson<int?>(sourceLine),
      'createdAt': serializer.toJson<int>(createdAt),
      'createdBy': serializer.toJson<String?>(createdBy),
      'updatedAt': serializer.toJson<int>(updatedAt),
      'updatedBy': serializer.toJson<String?>(updatedBy),
      'deletedAt': serializer.toJson<int?>(deletedAt),
      'deletedBy': serializer.toJson<String?>(deletedBy),
      'version': serializer.toJson<int>(version),
    };
  }

  ItemRow copyWith({
    String? id,
    String? workspaceId,
    String? name,
    String? nameSortKey,
    Value<String?> sku = const Value.absent(),
    Value<String?> barcode = const Value.absent(),
    Value<String?> serialNumber = const Value.absent(),
    Value<String?> modelNumber = const Value.absent(),
    Value<String?> referenceNumber = const Value.absent(),
    Value<String?> brand = const Value.absent(),
    Value<String?> mainCategoryId = const Value.absent(),
    String? categoryId,
    Value<String?> subcategoryId = const Value.absent(),
    Value<String?> legacyCategoryId = const Value.absent(),
    Value<String?> folderId = const Value.absent(),
    Value<String?> locationId = const Value.absent(),
    double? quantity,
    String? unit,
    String? condition,
    Value<String?> valuationMin = const Value.absent(),
    Value<String?> valuationMax = const Value.absent(),
    Value<String?> valuationCurrency = const Value.absent(),
    Value<double?> valuationMidpoint = const Value.absent(),
    Value<String?> valuationSource = const Value.absent(),
    Value<String?> valuationType = const Value.absent(),
    Value<int?> valuationDate = const Value.absent(),
    String? description,
    String? imagesJson,
    Value<String?> primaryImageId = const Value.absent(),
    bool? hasImages,
    String? customFieldsJson,
    String? customFieldDefsJson,
    Value<String?> aiDataJson = const Value.absent(),
    Value<String?> importJobId = const Value.absent(),
    Value<int?> sourceLine = const Value.absent(),
    int? createdAt,
    Value<String?> createdBy = const Value.absent(),
    int? updatedAt,
    Value<String?> updatedBy = const Value.absent(),
    Value<int?> deletedAt = const Value.absent(),
    Value<String?> deletedBy = const Value.absent(),
    int? version,
  }) => ItemRow(
    id: id ?? this.id,
    workspaceId: workspaceId ?? this.workspaceId,
    name: name ?? this.name,
    nameSortKey: nameSortKey ?? this.nameSortKey,
    sku: sku.present ? sku.value : this.sku,
    barcode: barcode.present ? barcode.value : this.barcode,
    serialNumber: serialNumber.present ? serialNumber.value : this.serialNumber,
    modelNumber: modelNumber.present ? modelNumber.value : this.modelNumber,
    referenceNumber: referenceNumber.present ? referenceNumber.value : this.referenceNumber,
    brand: brand.present ? brand.value : this.brand,
    mainCategoryId: mainCategoryId.present ? mainCategoryId.value : this.mainCategoryId,
    categoryId: categoryId ?? this.categoryId,
    subcategoryId: subcategoryId.present ? subcategoryId.value : this.subcategoryId,
    legacyCategoryId: legacyCategoryId.present ? legacyCategoryId.value : this.legacyCategoryId,
    folderId: folderId.present ? folderId.value : this.folderId,
    locationId: locationId.present ? locationId.value : this.locationId,
    quantity: quantity ?? this.quantity,
    unit: unit ?? this.unit,
    condition: condition ?? this.condition,
    valuationMin: valuationMin.present ? valuationMin.value : this.valuationMin,
    valuationMax: valuationMax.present ? valuationMax.value : this.valuationMax,
    valuationCurrency: valuationCurrency.present ? valuationCurrency.value : this.valuationCurrency,
    valuationMidpoint: valuationMidpoint.present ? valuationMidpoint.value : this.valuationMidpoint,
    valuationSource: valuationSource.present ? valuationSource.value : this.valuationSource,
    valuationType: valuationType.present ? valuationType.value : this.valuationType,
    valuationDate: valuationDate.present ? valuationDate.value : this.valuationDate,
    description: description ?? this.description,
    imagesJson: imagesJson ?? this.imagesJson,
    primaryImageId: primaryImageId.present ? primaryImageId.value : this.primaryImageId,
    hasImages: hasImages ?? this.hasImages,
    customFieldsJson: customFieldsJson ?? this.customFieldsJson,
    customFieldDefsJson: customFieldDefsJson ?? this.customFieldDefsJson,
    aiDataJson: aiDataJson.present ? aiDataJson.value : this.aiDataJson,
    importJobId: importJobId.present ? importJobId.value : this.importJobId,
    sourceLine: sourceLine.present ? sourceLine.value : this.sourceLine,
    createdAt: createdAt ?? this.createdAt,
    createdBy: createdBy.present ? createdBy.value : this.createdBy,
    updatedAt: updatedAt ?? this.updatedAt,
    updatedBy: updatedBy.present ? updatedBy.value : this.updatedBy,
    deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
    deletedBy: deletedBy.present ? deletedBy.value : this.deletedBy,
    version: version ?? this.version,
  );
  ItemRow copyWithCompanion(ItemsCompanion data) {
    return ItemRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      name: data.name.present ? data.name.value : this.name,
      nameSortKey: data.nameSortKey.present ? data.nameSortKey.value : this.nameSortKey,
      sku: data.sku.present ? data.sku.value : this.sku,
      barcode: data.barcode.present ? data.barcode.value : this.barcode,
      serialNumber: data.serialNumber.present ? data.serialNumber.value : this.serialNumber,
      modelNumber: data.modelNumber.present ? data.modelNumber.value : this.modelNumber,
      referenceNumber: data.referenceNumber.present ? data.referenceNumber.value : this.referenceNumber,
      brand: data.brand.present ? data.brand.value : this.brand,
      mainCategoryId: data.mainCategoryId.present ? data.mainCategoryId.value : this.mainCategoryId,
      categoryId: data.categoryId.present ? data.categoryId.value : this.categoryId,
      subcategoryId: data.subcategoryId.present ? data.subcategoryId.value : this.subcategoryId,
      legacyCategoryId: data.legacyCategoryId.present ? data.legacyCategoryId.value : this.legacyCategoryId,
      folderId: data.folderId.present ? data.folderId.value : this.folderId,
      locationId: data.locationId.present ? data.locationId.value : this.locationId,
      quantity: data.quantity.present ? data.quantity.value : this.quantity,
      unit: data.unit.present ? data.unit.value : this.unit,
      condition: data.condition.present ? data.condition.value : this.condition,
      valuationMin: data.valuationMin.present ? data.valuationMin.value : this.valuationMin,
      valuationMax: data.valuationMax.present ? data.valuationMax.value : this.valuationMax,
      valuationCurrency: data.valuationCurrency.present ? data.valuationCurrency.value : this.valuationCurrency,
      valuationMidpoint: data.valuationMidpoint.present ? data.valuationMidpoint.value : this.valuationMidpoint,
      valuationSource: data.valuationSource.present ? data.valuationSource.value : this.valuationSource,
      valuationType: data.valuationType.present ? data.valuationType.value : this.valuationType,
      valuationDate: data.valuationDate.present ? data.valuationDate.value : this.valuationDate,
      description: data.description.present ? data.description.value : this.description,
      imagesJson: data.imagesJson.present ? data.imagesJson.value : this.imagesJson,
      primaryImageId: data.primaryImageId.present ? data.primaryImageId.value : this.primaryImageId,
      hasImages: data.hasImages.present ? data.hasImages.value : this.hasImages,
      customFieldsJson: data.customFieldsJson.present ? data.customFieldsJson.value : this.customFieldsJson,
      customFieldDefsJson: data.customFieldDefsJson.present ? data.customFieldDefsJson.value : this.customFieldDefsJson,
      aiDataJson: data.aiDataJson.present ? data.aiDataJson.value : this.aiDataJson,
      importJobId: data.importJobId.present ? data.importJobId.value : this.importJobId,
      sourceLine: data.sourceLine.present ? data.sourceLine.value : this.sourceLine,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      createdBy: data.createdBy.present ? data.createdBy.value : this.createdBy,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      updatedBy: data.updatedBy.present ? data.updatedBy.value : this.updatedBy,
      deletedAt: data.deletedAt.present ? data.deletedAt.value : this.deletedAt,
      deletedBy: data.deletedBy.present ? data.deletedBy.value : this.deletedBy,
      version: data.version.present ? data.version.value : this.version,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ItemRow(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('name: $name, ')
          ..write('nameSortKey: $nameSortKey, ')
          ..write('sku: $sku, ')
          ..write('barcode: $barcode, ')
          ..write('serialNumber: $serialNumber, ')
          ..write('modelNumber: $modelNumber, ')
          ..write('referenceNumber: $referenceNumber, ')
          ..write('brand: $brand, ')
          ..write('mainCategoryId: $mainCategoryId, ')
          ..write('categoryId: $categoryId, ')
          ..write('subcategoryId: $subcategoryId, ')
          ..write('legacyCategoryId: $legacyCategoryId, ')
          ..write('folderId: $folderId, ')
          ..write('locationId: $locationId, ')
          ..write('quantity: $quantity, ')
          ..write('unit: $unit, ')
          ..write('condition: $condition, ')
          ..write('valuationMin: $valuationMin, ')
          ..write('valuationMax: $valuationMax, ')
          ..write('valuationCurrency: $valuationCurrency, ')
          ..write('valuationMidpoint: $valuationMidpoint, ')
          ..write('valuationSource: $valuationSource, ')
          ..write('valuationType: $valuationType, ')
          ..write('valuationDate: $valuationDate, ')
          ..write('description: $description, ')
          ..write('imagesJson: $imagesJson, ')
          ..write('primaryImageId: $primaryImageId, ')
          ..write('hasImages: $hasImages, ')
          ..write('customFieldsJson: $customFieldsJson, ')
          ..write('customFieldDefsJson: $customFieldDefsJson, ')
          ..write('aiDataJson: $aiDataJson, ')
          ..write('importJobId: $importJobId, ')
          ..write('sourceLine: $sourceLine, ')
          ..write('createdAt: $createdAt, ')
          ..write('createdBy: $createdBy, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('updatedBy: $updatedBy, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('deletedBy: $deletedBy, ')
          ..write('version: $version')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hashAll([
    id,
    workspaceId,
    name,
    nameSortKey,
    sku,
    barcode,
    serialNumber,
    modelNumber,
    referenceNumber,
    brand,
    mainCategoryId,
    categoryId,
    subcategoryId,
    legacyCategoryId,
    folderId,
    locationId,
    quantity,
    unit,
    condition,
    valuationMin,
    valuationMax,
    valuationCurrency,
    valuationMidpoint,
    valuationSource,
    valuationType,
    valuationDate,
    description,
    imagesJson,
    primaryImageId,
    hasImages,
    customFieldsJson,
    customFieldDefsJson,
    aiDataJson,
    importJobId,
    sourceLine,
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    deletedAt,
    deletedBy,
    version,
  ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ItemRow &&
          other.id == this.id &&
          other.workspaceId == this.workspaceId &&
          other.name == this.name &&
          other.nameSortKey == this.nameSortKey &&
          other.sku == this.sku &&
          other.barcode == this.barcode &&
          other.serialNumber == this.serialNumber &&
          other.modelNumber == this.modelNumber &&
          other.referenceNumber == this.referenceNumber &&
          other.brand == this.brand &&
          other.mainCategoryId == this.mainCategoryId &&
          other.categoryId == this.categoryId &&
          other.subcategoryId == this.subcategoryId &&
          other.legacyCategoryId == this.legacyCategoryId &&
          other.folderId == this.folderId &&
          other.locationId == this.locationId &&
          other.quantity == this.quantity &&
          other.unit == this.unit &&
          other.condition == this.condition &&
          other.valuationMin == this.valuationMin &&
          other.valuationMax == this.valuationMax &&
          other.valuationCurrency == this.valuationCurrency &&
          other.valuationMidpoint == this.valuationMidpoint &&
          other.valuationSource == this.valuationSource &&
          other.valuationType == this.valuationType &&
          other.valuationDate == this.valuationDate &&
          other.description == this.description &&
          other.imagesJson == this.imagesJson &&
          other.primaryImageId == this.primaryImageId &&
          other.hasImages == this.hasImages &&
          other.customFieldsJson == this.customFieldsJson &&
          other.customFieldDefsJson == this.customFieldDefsJson &&
          other.aiDataJson == this.aiDataJson &&
          other.importJobId == this.importJobId &&
          other.sourceLine == this.sourceLine &&
          other.createdAt == this.createdAt &&
          other.createdBy == this.createdBy &&
          other.updatedAt == this.updatedAt &&
          other.updatedBy == this.updatedBy &&
          other.deletedAt == this.deletedAt &&
          other.deletedBy == this.deletedBy &&
          other.version == this.version);
}

class ItemsCompanion extends UpdateCompanion<ItemRow> {
  final Value<String> id;
  final Value<String> workspaceId;
  final Value<String> name;
  final Value<String> nameSortKey;
  final Value<String?> sku;
  final Value<String?> barcode;
  final Value<String?> serialNumber;
  final Value<String?> modelNumber;
  final Value<String?> referenceNumber;
  final Value<String?> brand;
  final Value<String?> mainCategoryId;
  final Value<String> categoryId;
  final Value<String?> subcategoryId;
  final Value<String?> legacyCategoryId;
  final Value<String?> folderId;
  final Value<String?> locationId;
  final Value<double> quantity;
  final Value<String> unit;
  final Value<String> condition;
  final Value<String?> valuationMin;
  final Value<String?> valuationMax;
  final Value<String?> valuationCurrency;
  final Value<double?> valuationMidpoint;
  final Value<String?> valuationSource;
  final Value<String?> valuationType;
  final Value<int?> valuationDate;
  final Value<String> description;
  final Value<String> imagesJson;
  final Value<String?> primaryImageId;
  final Value<bool> hasImages;
  final Value<String> customFieldsJson;
  final Value<String> customFieldDefsJson;
  final Value<String?> aiDataJson;
  final Value<String?> importJobId;
  final Value<int?> sourceLine;
  final Value<int> createdAt;
  final Value<String?> createdBy;
  final Value<int> updatedAt;
  final Value<String?> updatedBy;
  final Value<int?> deletedAt;
  final Value<String?> deletedBy;
  final Value<int> version;
  final Value<int> rowid;
  const ItemsCompanion({
    this.id = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.name = const Value.absent(),
    this.nameSortKey = const Value.absent(),
    this.sku = const Value.absent(),
    this.barcode = const Value.absent(),
    this.serialNumber = const Value.absent(),
    this.modelNumber = const Value.absent(),
    this.referenceNumber = const Value.absent(),
    this.brand = const Value.absent(),
    this.mainCategoryId = const Value.absent(),
    this.categoryId = const Value.absent(),
    this.subcategoryId = const Value.absent(),
    this.legacyCategoryId = const Value.absent(),
    this.folderId = const Value.absent(),
    this.locationId = const Value.absent(),
    this.quantity = const Value.absent(),
    this.unit = const Value.absent(),
    this.condition = const Value.absent(),
    this.valuationMin = const Value.absent(),
    this.valuationMax = const Value.absent(),
    this.valuationCurrency = const Value.absent(),
    this.valuationMidpoint = const Value.absent(),
    this.valuationSource = const Value.absent(),
    this.valuationType = const Value.absent(),
    this.valuationDate = const Value.absent(),
    this.description = const Value.absent(),
    this.imagesJson = const Value.absent(),
    this.primaryImageId = const Value.absent(),
    this.hasImages = const Value.absent(),
    this.customFieldsJson = const Value.absent(),
    this.customFieldDefsJson = const Value.absent(),
    this.aiDataJson = const Value.absent(),
    this.importJobId = const Value.absent(),
    this.sourceLine = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.createdBy = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.updatedBy = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.deletedBy = const Value.absent(),
    this.version = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ItemsCompanion.insert({
    required String id,
    this.workspaceId = const Value.absent(),
    this.name = const Value.absent(),
    this.nameSortKey = const Value.absent(),
    this.sku = const Value.absent(),
    this.barcode = const Value.absent(),
    this.serialNumber = const Value.absent(),
    this.modelNumber = const Value.absent(),
    this.referenceNumber = const Value.absent(),
    this.brand = const Value.absent(),
    this.mainCategoryId = const Value.absent(),
    required String categoryId,
    this.subcategoryId = const Value.absent(),
    this.legacyCategoryId = const Value.absent(),
    this.folderId = const Value.absent(),
    this.locationId = const Value.absent(),
    this.quantity = const Value.absent(),
    required String unit,
    this.condition = const Value.absent(),
    this.valuationMin = const Value.absent(),
    this.valuationMax = const Value.absent(),
    this.valuationCurrency = const Value.absent(),
    this.valuationMidpoint = const Value.absent(),
    this.valuationSource = const Value.absent(),
    this.valuationType = const Value.absent(),
    this.valuationDate = const Value.absent(),
    this.description = const Value.absent(),
    this.imagesJson = const Value.absent(),
    this.primaryImageId = const Value.absent(),
    this.hasImages = const Value.absent(),
    this.customFieldsJson = const Value.absent(),
    this.customFieldDefsJson = const Value.absent(),
    this.aiDataJson = const Value.absent(),
    this.importJobId = const Value.absent(),
    this.sourceLine = const Value.absent(),
    required int createdAt,
    this.createdBy = const Value.absent(),
    required int updatedAt,
    this.updatedBy = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.deletedBy = const Value.absent(),
    this.version = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       categoryId = Value(categoryId),
       unit = Value(unit),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<ItemRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceId,
    Expression<String>? name,
    Expression<String>? nameSortKey,
    Expression<String>? sku,
    Expression<String>? barcode,
    Expression<String>? serialNumber,
    Expression<String>? modelNumber,
    Expression<String>? referenceNumber,
    Expression<String>? brand,
    Expression<String>? mainCategoryId,
    Expression<String>? categoryId,
    Expression<String>? subcategoryId,
    Expression<String>? legacyCategoryId,
    Expression<String>? folderId,
    Expression<String>? locationId,
    Expression<double>? quantity,
    Expression<String>? unit,
    Expression<String>? condition,
    Expression<String>? valuationMin,
    Expression<String>? valuationMax,
    Expression<String>? valuationCurrency,
    Expression<double>? valuationMidpoint,
    Expression<String>? valuationSource,
    Expression<String>? valuationType,
    Expression<int>? valuationDate,
    Expression<String>? description,
    Expression<String>? imagesJson,
    Expression<String>? primaryImageId,
    Expression<bool>? hasImages,
    Expression<String>? customFieldsJson,
    Expression<String>? customFieldDefsJson,
    Expression<String>? aiDataJson,
    Expression<String>? importJobId,
    Expression<int>? sourceLine,
    Expression<int>? createdAt,
    Expression<String>? createdBy,
    Expression<int>? updatedAt,
    Expression<String>? updatedBy,
    Expression<int>? deletedAt,
    Expression<String>? deletedBy,
    Expression<int>? version,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (name != null) 'name': name,
      if (nameSortKey != null) 'name_sort_key': nameSortKey,
      if (sku != null) 'sku': sku,
      if (barcode != null) 'barcode': barcode,
      if (serialNumber != null) 'serial_number': serialNumber,
      if (modelNumber != null) 'model_number': modelNumber,
      if (referenceNumber != null) 'reference_number': referenceNumber,
      if (brand != null) 'brand': brand,
      if (mainCategoryId != null) 'main_category_id': mainCategoryId,
      if (categoryId != null) 'category_id': categoryId,
      if (subcategoryId != null) 'subcategory_id': subcategoryId,
      if (legacyCategoryId != null) 'legacy_category_id': legacyCategoryId,
      if (folderId != null) 'folder_id': folderId,
      if (locationId != null) 'location_id': locationId,
      if (quantity != null) 'quantity': quantity,
      if (unit != null) 'unit': unit,
      if (condition != null) 'condition': condition,
      if (valuationMin != null) 'valuation_min': valuationMin,
      if (valuationMax != null) 'valuation_max': valuationMax,
      if (valuationCurrency != null) 'valuation_currency': valuationCurrency,
      if (valuationMidpoint != null) 'valuation_midpoint': valuationMidpoint,
      if (valuationSource != null) 'valuation_source': valuationSource,
      if (valuationType != null) 'valuation_type': valuationType,
      if (valuationDate != null) 'valuation_date': valuationDate,
      if (description != null) 'description': description,
      if (imagesJson != null) 'images_json': imagesJson,
      if (primaryImageId != null) 'primary_image_id': primaryImageId,
      if (hasImages != null) 'has_images': hasImages,
      if (customFieldsJson != null) 'custom_fields_json': customFieldsJson,
      if (customFieldDefsJson != null) 'custom_field_defs_json': customFieldDefsJson,
      if (aiDataJson != null) 'ai_data_json': aiDataJson,
      if (importJobId != null) 'import_job_id': importJobId,
      if (sourceLine != null) 'source_line': sourceLine,
      if (createdAt != null) 'created_at': createdAt,
      if (createdBy != null) 'created_by': createdBy,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (updatedBy != null) 'updated_by': updatedBy,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (deletedBy != null) 'deleted_by': deletedBy,
      if (version != null) 'version': version,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ItemsCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceId,
    Value<String>? name,
    Value<String>? nameSortKey,
    Value<String?>? sku,
    Value<String?>? barcode,
    Value<String?>? serialNumber,
    Value<String?>? modelNumber,
    Value<String?>? referenceNumber,
    Value<String?>? brand,
    Value<String?>? mainCategoryId,
    Value<String>? categoryId,
    Value<String?>? subcategoryId,
    Value<String?>? legacyCategoryId,
    Value<String?>? folderId,
    Value<String?>? locationId,
    Value<double>? quantity,
    Value<String>? unit,
    Value<String>? condition,
    Value<String?>? valuationMin,
    Value<String?>? valuationMax,
    Value<String?>? valuationCurrency,
    Value<double?>? valuationMidpoint,
    Value<String?>? valuationSource,
    Value<String?>? valuationType,
    Value<int?>? valuationDate,
    Value<String>? description,
    Value<String>? imagesJson,
    Value<String?>? primaryImageId,
    Value<bool>? hasImages,
    Value<String>? customFieldsJson,
    Value<String>? customFieldDefsJson,
    Value<String?>? aiDataJson,
    Value<String?>? importJobId,
    Value<int?>? sourceLine,
    Value<int>? createdAt,
    Value<String?>? createdBy,
    Value<int>? updatedAt,
    Value<String?>? updatedBy,
    Value<int?>? deletedAt,
    Value<String?>? deletedBy,
    Value<int>? version,
    Value<int>? rowid,
  }) {
    return ItemsCompanion(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      name: name ?? this.name,
      nameSortKey: nameSortKey ?? this.nameSortKey,
      sku: sku ?? this.sku,
      barcode: barcode ?? this.barcode,
      serialNumber: serialNumber ?? this.serialNumber,
      modelNumber: modelNumber ?? this.modelNumber,
      referenceNumber: referenceNumber ?? this.referenceNumber,
      brand: brand ?? this.brand,
      mainCategoryId: mainCategoryId ?? this.mainCategoryId,
      categoryId: categoryId ?? this.categoryId,
      subcategoryId: subcategoryId ?? this.subcategoryId,
      legacyCategoryId: legacyCategoryId ?? this.legacyCategoryId,
      folderId: folderId ?? this.folderId,
      locationId: locationId ?? this.locationId,
      quantity: quantity ?? this.quantity,
      unit: unit ?? this.unit,
      condition: condition ?? this.condition,
      valuationMin: valuationMin ?? this.valuationMin,
      valuationMax: valuationMax ?? this.valuationMax,
      valuationCurrency: valuationCurrency ?? this.valuationCurrency,
      valuationMidpoint: valuationMidpoint ?? this.valuationMidpoint,
      valuationSource: valuationSource ?? this.valuationSource,
      valuationType: valuationType ?? this.valuationType,
      valuationDate: valuationDate ?? this.valuationDate,
      description: description ?? this.description,
      imagesJson: imagesJson ?? this.imagesJson,
      primaryImageId: primaryImageId ?? this.primaryImageId,
      hasImages: hasImages ?? this.hasImages,
      customFieldsJson: customFieldsJson ?? this.customFieldsJson,
      customFieldDefsJson: customFieldDefsJson ?? this.customFieldDefsJson,
      aiDataJson: aiDataJson ?? this.aiDataJson,
      importJobId: importJobId ?? this.importJobId,
      sourceLine: sourceLine ?? this.sourceLine,
      createdAt: createdAt ?? this.createdAt,
      createdBy: createdBy ?? this.createdBy,
      updatedAt: updatedAt ?? this.updatedAt,
      updatedBy: updatedBy ?? this.updatedBy,
      deletedAt: deletedAt ?? this.deletedAt,
      deletedBy: deletedBy ?? this.deletedBy,
      version: version ?? this.version,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (nameSortKey.present) {
      map['name_sort_key'] = Variable<String>(nameSortKey.value);
    }
    if (sku.present) {
      map['sku'] = Variable<String>(sku.value);
    }
    if (barcode.present) {
      map['barcode'] = Variable<String>(barcode.value);
    }
    if (serialNumber.present) {
      map['serial_number'] = Variable<String>(serialNumber.value);
    }
    if (modelNumber.present) {
      map['model_number'] = Variable<String>(modelNumber.value);
    }
    if (referenceNumber.present) {
      map['reference_number'] = Variable<String>(referenceNumber.value);
    }
    if (brand.present) {
      map['brand'] = Variable<String>(brand.value);
    }
    if (mainCategoryId.present) {
      map['main_category_id'] = Variable<String>(mainCategoryId.value);
    }
    if (categoryId.present) {
      map['category_id'] = Variable<String>(categoryId.value);
    }
    if (subcategoryId.present) {
      map['subcategory_id'] = Variable<String>(subcategoryId.value);
    }
    if (legacyCategoryId.present) {
      map['legacy_category_id'] = Variable<String>(legacyCategoryId.value);
    }
    if (folderId.present) {
      map['folder_id'] = Variable<String>(folderId.value);
    }
    if (locationId.present) {
      map['location_id'] = Variable<String>(locationId.value);
    }
    if (quantity.present) {
      map['quantity'] = Variable<double>(quantity.value);
    }
    if (unit.present) {
      map['unit'] = Variable<String>(unit.value);
    }
    if (condition.present) {
      map['condition'] = Variable<String>(condition.value);
    }
    if (valuationMin.present) {
      map['valuation_min'] = Variable<String>(valuationMin.value);
    }
    if (valuationMax.present) {
      map['valuation_max'] = Variable<String>(valuationMax.value);
    }
    if (valuationCurrency.present) {
      map['valuation_currency'] = Variable<String>(valuationCurrency.value);
    }
    if (valuationMidpoint.present) {
      map['valuation_midpoint'] = Variable<double>(valuationMidpoint.value);
    }
    if (valuationSource.present) {
      map['valuation_source'] = Variable<String>(valuationSource.value);
    }
    if (valuationType.present) {
      map['valuation_type'] = Variable<String>(valuationType.value);
    }
    if (valuationDate.present) {
      map['valuation_date'] = Variable<int>(valuationDate.value);
    }
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (imagesJson.present) {
      map['images_json'] = Variable<String>(imagesJson.value);
    }
    if (primaryImageId.present) {
      map['primary_image_id'] = Variable<String>(primaryImageId.value);
    }
    if (hasImages.present) {
      map['has_images'] = Variable<bool>(hasImages.value);
    }
    if (customFieldsJson.present) {
      map['custom_fields_json'] = Variable<String>(customFieldsJson.value);
    }
    if (customFieldDefsJson.present) {
      map['custom_field_defs_json'] = Variable<String>(customFieldDefsJson.value);
    }
    if (aiDataJson.present) {
      map['ai_data_json'] = Variable<String>(aiDataJson.value);
    }
    if (importJobId.present) {
      map['import_job_id'] = Variable<String>(importJobId.value);
    }
    if (sourceLine.present) {
      map['source_line'] = Variable<int>(sourceLine.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (createdBy.present) {
      map['created_by'] = Variable<String>(createdBy.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (updatedBy.present) {
      map['updated_by'] = Variable<String>(updatedBy.value);
    }
    if (deletedAt.present) {
      map['deleted_at'] = Variable<int>(deletedAt.value);
    }
    if (deletedBy.present) {
      map['deleted_by'] = Variable<String>(deletedBy.value);
    }
    if (version.present) {
      map['version'] = Variable<int>(version.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ItemsCompanion(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('name: $name, ')
          ..write('nameSortKey: $nameSortKey, ')
          ..write('sku: $sku, ')
          ..write('barcode: $barcode, ')
          ..write('serialNumber: $serialNumber, ')
          ..write('modelNumber: $modelNumber, ')
          ..write('referenceNumber: $referenceNumber, ')
          ..write('brand: $brand, ')
          ..write('mainCategoryId: $mainCategoryId, ')
          ..write('categoryId: $categoryId, ')
          ..write('subcategoryId: $subcategoryId, ')
          ..write('legacyCategoryId: $legacyCategoryId, ')
          ..write('folderId: $folderId, ')
          ..write('locationId: $locationId, ')
          ..write('quantity: $quantity, ')
          ..write('unit: $unit, ')
          ..write('condition: $condition, ')
          ..write('valuationMin: $valuationMin, ')
          ..write('valuationMax: $valuationMax, ')
          ..write('valuationCurrency: $valuationCurrency, ')
          ..write('valuationMidpoint: $valuationMidpoint, ')
          ..write('valuationSource: $valuationSource, ')
          ..write('valuationType: $valuationType, ')
          ..write('valuationDate: $valuationDate, ')
          ..write('description: $description, ')
          ..write('imagesJson: $imagesJson, ')
          ..write('primaryImageId: $primaryImageId, ')
          ..write('hasImages: $hasImages, ')
          ..write('customFieldsJson: $customFieldsJson, ')
          ..write('customFieldDefsJson: $customFieldDefsJson, ')
          ..write('aiDataJson: $aiDataJson, ')
          ..write('importJobId: $importJobId, ')
          ..write('sourceLine: $sourceLine, ')
          ..write('createdAt: $createdAt, ')
          ..write('createdBy: $createdBy, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('updatedBy: $updatedBy, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('deletedBy: $deletedBy, ')
          ..write('version: $version, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ItemTokensTable extends ItemTokens with TableInfo<$ItemTokensTable, ItemTokenRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ItemTokensTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _tokenMeta = const VerificationMeta('token');
  @override
  late final GeneratedColumn<String> token = GeneratedColumn<String>(
    'token',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _itemIdMeta = const VerificationMeta('itemId');
  @override
  late final GeneratedColumn<String> itemId = GeneratedColumn<String>(
    'item_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [token, itemId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'item_tokens';
  @override
  VerificationContext validateIntegrity(Insertable<ItemTokenRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('token')) {
      context.handle(_tokenMeta, token.isAcceptableOrUnknown(data['token']!, _tokenMeta));
    } else if (isInserting) {
      context.missing(_tokenMeta);
    }
    if (data.containsKey('item_id')) {
      context.handle(_itemIdMeta, itemId.isAcceptableOrUnknown(data['item_id']!, _itemIdMeta));
    } else if (isInserting) {
      context.missing(_itemIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {token, itemId};
  @override
  ItemTokenRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ItemTokenRow(
      token: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}token'])!,
      itemId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}item_id'])!,
    );
  }

  @override
  $ItemTokensTable createAlias(String alias) {
    return $ItemTokensTable(attachedDatabase, alias);
  }

  @override
  bool get withoutRowId => true;
}

class ItemTokenRow extends DataClass implements Insertable<ItemTokenRow> {
  final String token;
  final String itemId;
  const ItemTokenRow({required this.token, required this.itemId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['token'] = Variable<String>(token);
    map['item_id'] = Variable<String>(itemId);
    return map;
  }

  ItemTokensCompanion toCompanion(bool nullToAbsent) {
    return ItemTokensCompanion(token: Value(token), itemId: Value(itemId));
  }

  factory ItemTokenRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ItemTokenRow(
      token: serializer.fromJson<String>(json['token']),
      itemId: serializer.fromJson<String>(json['itemId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{'token': serializer.toJson<String>(token), 'itemId': serializer.toJson<String>(itemId)};
  }

  ItemTokenRow copyWith({String? token, String? itemId}) =>
      ItemTokenRow(token: token ?? this.token, itemId: itemId ?? this.itemId);
  ItemTokenRow copyWithCompanion(ItemTokensCompanion data) {
    return ItemTokenRow(
      token: data.token.present ? data.token.value : this.token,
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ItemTokenRow(')
          ..write('token: $token, ')
          ..write('itemId: $itemId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(token, itemId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is ItemTokenRow && other.token == this.token && other.itemId == this.itemId);
}

class ItemTokensCompanion extends UpdateCompanion<ItemTokenRow> {
  final Value<String> token;
  final Value<String> itemId;
  const ItemTokensCompanion({this.token = const Value.absent(), this.itemId = const Value.absent()});
  ItemTokensCompanion.insert({required String token, required String itemId})
    : token = Value(token),
      itemId = Value(itemId);
  static Insertable<ItemTokenRow> custom({Expression<String>? token, Expression<String>? itemId}) {
    return RawValuesInsertable({if (token != null) 'token': token, if (itemId != null) 'item_id': itemId});
  }

  ItemTokensCompanion copyWith({Value<String>? token, Value<String>? itemId}) {
    return ItemTokensCompanion(token: token ?? this.token, itemId: itemId ?? this.itemId);
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (token.present) {
      map['token'] = Variable<String>(token.value);
    }
    if (itemId.present) {
      map['item_id'] = Variable<String>(itemId.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ItemTokensCompanion(')
          ..write('token: $token, ')
          ..write('itemId: $itemId')
          ..write(')'))
        .toString();
  }
}

class $ItemCatalogRefsTable extends ItemCatalogRefs with TableInfo<$ItemCatalogRefsTable, ItemCatalogRefRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ItemCatalogRefsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _refMeta = const VerificationMeta('ref');
  @override
  late final GeneratedColumn<String> ref = GeneratedColumn<String>(
    'ref',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _itemIdMeta = const VerificationMeta('itemId');
  @override
  late final GeneratedColumn<String> itemId = GeneratedColumn<String>(
    'item_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [ref, itemId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'item_catalog_refs';
  @override
  VerificationContext validateIntegrity(Insertable<ItemCatalogRefRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('ref')) {
      context.handle(_refMeta, ref.isAcceptableOrUnknown(data['ref']!, _refMeta));
    } else if (isInserting) {
      context.missing(_refMeta);
    }
    if (data.containsKey('item_id')) {
      context.handle(_itemIdMeta, itemId.isAcceptableOrUnknown(data['item_id']!, _itemIdMeta));
    } else if (isInserting) {
      context.missing(_itemIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {ref, itemId};
  @override
  ItemCatalogRefRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ItemCatalogRefRow(
      ref: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}ref'])!,
      itemId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}item_id'])!,
    );
  }

  @override
  $ItemCatalogRefsTable createAlias(String alias) {
    return $ItemCatalogRefsTable(attachedDatabase, alias);
  }

  @override
  bool get withoutRowId => true;
}

class ItemCatalogRefRow extends DataClass implements Insertable<ItemCatalogRefRow> {
  final String ref;
  final String itemId;
  const ItemCatalogRefRow({required this.ref, required this.itemId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['ref'] = Variable<String>(ref);
    map['item_id'] = Variable<String>(itemId);
    return map;
  }

  ItemCatalogRefsCompanion toCompanion(bool nullToAbsent) {
    return ItemCatalogRefsCompanion(ref: Value(ref), itemId: Value(itemId));
  }

  factory ItemCatalogRefRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ItemCatalogRefRow(
      ref: serializer.fromJson<String>(json['ref']),
      itemId: serializer.fromJson<String>(json['itemId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{'ref': serializer.toJson<String>(ref), 'itemId': serializer.toJson<String>(itemId)};
  }

  ItemCatalogRefRow copyWith({String? ref, String? itemId}) =>
      ItemCatalogRefRow(ref: ref ?? this.ref, itemId: itemId ?? this.itemId);
  ItemCatalogRefRow copyWithCompanion(ItemCatalogRefsCompanion data) {
    return ItemCatalogRefRow(
      ref: data.ref.present ? data.ref.value : this.ref,
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ItemCatalogRefRow(')
          ..write('ref: $ref, ')
          ..write('itemId: $itemId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(ref, itemId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is ItemCatalogRefRow && other.ref == this.ref && other.itemId == this.itemId);
}

class ItemCatalogRefsCompanion extends UpdateCompanion<ItemCatalogRefRow> {
  final Value<String> ref;
  final Value<String> itemId;
  const ItemCatalogRefsCompanion({this.ref = const Value.absent(), this.itemId = const Value.absent()});
  ItemCatalogRefsCompanion.insert({required String ref, required String itemId})
    : ref = Value(ref),
      itemId = Value(itemId);
  static Insertable<ItemCatalogRefRow> custom({Expression<String>? ref, Expression<String>? itemId}) {
    return RawValuesInsertable({if (ref != null) 'ref': ref, if (itemId != null) 'item_id': itemId});
  }

  ItemCatalogRefsCompanion copyWith({Value<String>? ref, Value<String>? itemId}) {
    return ItemCatalogRefsCompanion(ref: ref ?? this.ref, itemId: itemId ?? this.itemId);
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (ref.present) {
      map['ref'] = Variable<String>(ref.value);
    }
    if (itemId.present) {
      map['item_id'] = Variable<String>(itemId.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ItemCatalogRefsCompanion(')
          ..write('ref: $ref, ')
          ..write('itemId: $itemId')
          ..write(')'))
        .toString();
  }
}

class $ItemFieldIdsTable extends ItemFieldIds with TableInfo<$ItemFieldIdsTable, ItemFieldIdRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ItemFieldIdsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _fieldIdMeta = const VerificationMeta('fieldId');
  @override
  late final GeneratedColumn<String> fieldId = GeneratedColumn<String>(
    'field_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _itemIdMeta = const VerificationMeta('itemId');
  @override
  late final GeneratedColumn<String> itemId = GeneratedColumn<String>(
    'item_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [fieldId, itemId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'item_field_ids';
  @override
  VerificationContext validateIntegrity(Insertable<ItemFieldIdRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('field_id')) {
      context.handle(_fieldIdMeta, fieldId.isAcceptableOrUnknown(data['field_id']!, _fieldIdMeta));
    } else if (isInserting) {
      context.missing(_fieldIdMeta);
    }
    if (data.containsKey('item_id')) {
      context.handle(_itemIdMeta, itemId.isAcceptableOrUnknown(data['item_id']!, _itemIdMeta));
    } else if (isInserting) {
      context.missing(_itemIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {fieldId, itemId};
  @override
  ItemFieldIdRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ItemFieldIdRow(
      fieldId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}field_id'])!,
      itemId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}item_id'])!,
    );
  }

  @override
  $ItemFieldIdsTable createAlias(String alias) {
    return $ItemFieldIdsTable(attachedDatabase, alias);
  }

  @override
  bool get withoutRowId => true;
}

class ItemFieldIdRow extends DataClass implements Insertable<ItemFieldIdRow> {
  final String fieldId;
  final String itemId;
  const ItemFieldIdRow({required this.fieldId, required this.itemId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['field_id'] = Variable<String>(fieldId);
    map['item_id'] = Variable<String>(itemId);
    return map;
  }

  ItemFieldIdsCompanion toCompanion(bool nullToAbsent) {
    return ItemFieldIdsCompanion(fieldId: Value(fieldId), itemId: Value(itemId));
  }

  factory ItemFieldIdRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ItemFieldIdRow(
      fieldId: serializer.fromJson<String>(json['fieldId']),
      itemId: serializer.fromJson<String>(json['itemId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'fieldId': serializer.toJson<String>(fieldId),
      'itemId': serializer.toJson<String>(itemId),
    };
  }

  ItemFieldIdRow copyWith({String? fieldId, String? itemId}) =>
      ItemFieldIdRow(fieldId: fieldId ?? this.fieldId, itemId: itemId ?? this.itemId);
  ItemFieldIdRow copyWithCompanion(ItemFieldIdsCompanion data) {
    return ItemFieldIdRow(
      fieldId: data.fieldId.present ? data.fieldId.value : this.fieldId,
      itemId: data.itemId.present ? data.itemId.value : this.itemId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ItemFieldIdRow(')
          ..write('fieldId: $fieldId, ')
          ..write('itemId: $itemId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(fieldId, itemId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ItemFieldIdRow && other.fieldId == this.fieldId && other.itemId == this.itemId);
}

class ItemFieldIdsCompanion extends UpdateCompanion<ItemFieldIdRow> {
  final Value<String> fieldId;
  final Value<String> itemId;
  const ItemFieldIdsCompanion({this.fieldId = const Value.absent(), this.itemId = const Value.absent()});
  ItemFieldIdsCompanion.insert({required String fieldId, required String itemId})
    : fieldId = Value(fieldId),
      itemId = Value(itemId);
  static Insertable<ItemFieldIdRow> custom({Expression<String>? fieldId, Expression<String>? itemId}) {
    return RawValuesInsertable({if (fieldId != null) 'field_id': fieldId, if (itemId != null) 'item_id': itemId});
  }

  ItemFieldIdsCompanion copyWith({Value<String>? fieldId, Value<String>? itemId}) {
    return ItemFieldIdsCompanion(fieldId: fieldId ?? this.fieldId, itemId: itemId ?? this.itemId);
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (fieldId.present) {
      map['field_id'] = Variable<String>(fieldId.value);
    }
    if (itemId.present) {
      map['item_id'] = Variable<String>(itemId.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ItemFieldIdsCompanion(')
          ..write('fieldId: $fieldId, ')
          ..write('itemId: $itemId')
          ..write(')'))
        .toString();
  }
}

class $TaxonomyNodesTable extends TaxonomyNodes with TableInfo<$TaxonomyNodesTable, TaxonomyNodeRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $TaxonomyNodesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('local'),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _iconMeta = const VerificationMeta('icon');
  @override
  late final GeneratedColumn<String> icon = GeneratedColumn<String>(
    'icon',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('📦'),
  );
  static const VerificationMeta _levelMeta = const VerificationMeta('level');
  @override
  late final GeneratedColumn<String> level = GeneratedColumn<String>(
    'level',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _sourceMeta = const VerificationMeta('source');
  @override
  late final GeneratedColumn<String> source = GeneratedColumn<String>(
    'source',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _parentIdMeta = const VerificationMeta('parentId');
  @override
  late final GeneratedColumn<String> parentId = GeneratedColumn<String>(
    'parent_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _hiddenMeta = const VerificationMeta('hidden');
  @override
  late final GeneratedColumn<bool> hidden = GeneratedColumn<bool>(
    'hidden',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways('CHECK ("hidden" IN (0, 1))'),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _pinnedMeta = const VerificationMeta('pinned');
  @override
  late final GeneratedColumn<bool> pinned = GeneratedColumn<bool>(
    'pinned',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways('CHECK ("pinned" IN (0, 1))'),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _sortOrderMeta = const VerificationMeta('sortOrder');
  @override
  late final GeneratedColumn<double> sortOrder = GeneratedColumn<double>(
    'sort_order',
    aliasedName,
    true,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _mergedIntoMeta = const VerificationMeta('mergedInto');
  @override
  late final GeneratedColumn<String> mergedInto = GeneratedColumn<String>(
    'merged_into',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _templateMeta = const VerificationMeta('template');
  @override
  late final GeneratedColumn<String> template = GeneratedColumn<String>(
    'template',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _fieldsJsonMeta = const VerificationMeta('fieldsJson');
  @override
  late final GeneratedColumn<String> fieldsJson = GeneratedColumn<String>(
    'fields_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _taxonomyVersionMeta = const VerificationMeta('taxonomyVersion');
  @override
  late final GeneratedColumn<int> taxonomyVersion = GeneratedColumn<int>(
    'taxonomy_version',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    workspaceId,
    name,
    icon,
    level,
    source,
    parentId,
    hidden,
    pinned,
    sortOrder,
    mergedInto,
    template,
    fieldsJson,
    taxonomyVersion,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'taxonomy_nodes';
  @override
  VerificationContext validateIntegrity(Insertable<TaxonomyNodeRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    }
    if (data.containsKey('name')) {
      context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    }
    if (data.containsKey('icon')) {
      context.handle(_iconMeta, icon.isAcceptableOrUnknown(data['icon']!, _iconMeta));
    }
    if (data.containsKey('level')) {
      context.handle(_levelMeta, level.isAcceptableOrUnknown(data['level']!, _levelMeta));
    }
    if (data.containsKey('source')) {
      context.handle(_sourceMeta, source.isAcceptableOrUnknown(data['source']!, _sourceMeta));
    }
    if (data.containsKey('parent_id')) {
      context.handle(_parentIdMeta, parentId.isAcceptableOrUnknown(data['parent_id']!, _parentIdMeta));
    }
    if (data.containsKey('hidden')) {
      context.handle(_hiddenMeta, hidden.isAcceptableOrUnknown(data['hidden']!, _hiddenMeta));
    }
    if (data.containsKey('pinned')) {
      context.handle(_pinnedMeta, pinned.isAcceptableOrUnknown(data['pinned']!, _pinnedMeta));
    }
    if (data.containsKey('sort_order')) {
      context.handle(_sortOrderMeta, sortOrder.isAcceptableOrUnknown(data['sort_order']!, _sortOrderMeta));
    }
    if (data.containsKey('merged_into')) {
      context.handle(_mergedIntoMeta, mergedInto.isAcceptableOrUnknown(data['merged_into']!, _mergedIntoMeta));
    }
    if (data.containsKey('template')) {
      context.handle(_templateMeta, template.isAcceptableOrUnknown(data['template']!, _templateMeta));
    }
    if (data.containsKey('fields_json')) {
      context.handle(_fieldsJsonMeta, fieldsJson.isAcceptableOrUnknown(data['fields_json']!, _fieldsJsonMeta));
    }
    if (data.containsKey('taxonomy_version')) {
      context.handle(
        _taxonomyVersionMeta,
        taxonomyVersion.isAcceptableOrUnknown(data['taxonomy_version']!, _taxonomyVersionMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  TaxonomyNodeRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return TaxonomyNodeRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      icon: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}icon'])!,
      level: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}level']),
      source: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}source']),
      parentId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}parent_id']),
      hidden: attachedDatabase.typeMapping.read(DriftSqlType.bool, data['${effectivePrefix}hidden'])!,
      pinned: attachedDatabase.typeMapping.read(DriftSqlType.bool, data['${effectivePrefix}pinned'])!,
      sortOrder: attachedDatabase.typeMapping.read(DriftSqlType.double, data['${effectivePrefix}sort_order']),
      mergedInto: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}merged_into']),
      template: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}template']),
      fieldsJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}fields_json'])!,
      taxonomyVersion: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}taxonomy_version']),
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $TaxonomyNodesTable createAlias(String alias) {
    return $TaxonomyNodesTable(attachedDatabase, alias);
  }
}

class TaxonomyNodeRow extends DataClass implements Insertable<TaxonomyNodeRow> {
  final String id;
  final String workspaceId;
  final String name;
  final String icon;
  final String? level;
  final String? source;
  final String? parentId;
  final bool hidden;
  final bool pinned;
  final double? sortOrder;
  final String? mergedInto;
  final String? template;
  final String fieldsJson;
  final int? taxonomyVersion;
  final int createdAt;
  const TaxonomyNodeRow({
    required this.id,
    required this.workspaceId,
    required this.name,
    required this.icon,
    this.level,
    this.source,
    this.parentId,
    required this.hidden,
    required this.pinned,
    this.sortOrder,
    this.mergedInto,
    this.template,
    required this.fieldsJson,
    this.taxonomyVersion,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_id'] = Variable<String>(workspaceId);
    map['name'] = Variable<String>(name);
    map['icon'] = Variable<String>(icon);
    if (!nullToAbsent || level != null) {
      map['level'] = Variable<String>(level);
    }
    if (!nullToAbsent || source != null) {
      map['source'] = Variable<String>(source);
    }
    if (!nullToAbsent || parentId != null) {
      map['parent_id'] = Variable<String>(parentId);
    }
    map['hidden'] = Variable<bool>(hidden);
    map['pinned'] = Variable<bool>(pinned);
    if (!nullToAbsent || sortOrder != null) {
      map['sort_order'] = Variable<double>(sortOrder);
    }
    if (!nullToAbsent || mergedInto != null) {
      map['merged_into'] = Variable<String>(mergedInto);
    }
    if (!nullToAbsent || template != null) {
      map['template'] = Variable<String>(template);
    }
    map['fields_json'] = Variable<String>(fieldsJson);
    if (!nullToAbsent || taxonomyVersion != null) {
      map['taxonomy_version'] = Variable<int>(taxonomyVersion);
    }
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  TaxonomyNodesCompanion toCompanion(bool nullToAbsent) {
    return TaxonomyNodesCompanion(
      id: Value(id),
      workspaceId: Value(workspaceId),
      name: Value(name),
      icon: Value(icon),
      level: level == null && nullToAbsent ? const Value.absent() : Value(level),
      source: source == null && nullToAbsent ? const Value.absent() : Value(source),
      parentId: parentId == null && nullToAbsent ? const Value.absent() : Value(parentId),
      hidden: Value(hidden),
      pinned: Value(pinned),
      sortOrder: sortOrder == null && nullToAbsent ? const Value.absent() : Value(sortOrder),
      mergedInto: mergedInto == null && nullToAbsent ? const Value.absent() : Value(mergedInto),
      template: template == null && nullToAbsent ? const Value.absent() : Value(template),
      fieldsJson: Value(fieldsJson),
      taxonomyVersion: taxonomyVersion == null && nullToAbsent ? const Value.absent() : Value(taxonomyVersion),
      createdAt: Value(createdAt),
    );
  }

  factory TaxonomyNodeRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return TaxonomyNodeRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      name: serializer.fromJson<String>(json['name']),
      icon: serializer.fromJson<String>(json['icon']),
      level: serializer.fromJson<String?>(json['level']),
      source: serializer.fromJson<String?>(json['source']),
      parentId: serializer.fromJson<String?>(json['parentId']),
      hidden: serializer.fromJson<bool>(json['hidden']),
      pinned: serializer.fromJson<bool>(json['pinned']),
      sortOrder: serializer.fromJson<double?>(json['sortOrder']),
      mergedInto: serializer.fromJson<String?>(json['mergedInto']),
      template: serializer.fromJson<String?>(json['template']),
      fieldsJson: serializer.fromJson<String>(json['fieldsJson']),
      taxonomyVersion: serializer.fromJson<int?>(json['taxonomyVersion']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'name': serializer.toJson<String>(name),
      'icon': serializer.toJson<String>(icon),
      'level': serializer.toJson<String?>(level),
      'source': serializer.toJson<String?>(source),
      'parentId': serializer.toJson<String?>(parentId),
      'hidden': serializer.toJson<bool>(hidden),
      'pinned': serializer.toJson<bool>(pinned),
      'sortOrder': serializer.toJson<double?>(sortOrder),
      'mergedInto': serializer.toJson<String?>(mergedInto),
      'template': serializer.toJson<String?>(template),
      'fieldsJson': serializer.toJson<String>(fieldsJson),
      'taxonomyVersion': serializer.toJson<int?>(taxonomyVersion),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  TaxonomyNodeRow copyWith({
    String? id,
    String? workspaceId,
    String? name,
    String? icon,
    Value<String?> level = const Value.absent(),
    Value<String?> source = const Value.absent(),
    Value<String?> parentId = const Value.absent(),
    bool? hidden,
    bool? pinned,
    Value<double?> sortOrder = const Value.absent(),
    Value<String?> mergedInto = const Value.absent(),
    Value<String?> template = const Value.absent(),
    String? fieldsJson,
    Value<int?> taxonomyVersion = const Value.absent(),
    int? createdAt,
  }) => TaxonomyNodeRow(
    id: id ?? this.id,
    workspaceId: workspaceId ?? this.workspaceId,
    name: name ?? this.name,
    icon: icon ?? this.icon,
    level: level.present ? level.value : this.level,
    source: source.present ? source.value : this.source,
    parentId: parentId.present ? parentId.value : this.parentId,
    hidden: hidden ?? this.hidden,
    pinned: pinned ?? this.pinned,
    sortOrder: sortOrder.present ? sortOrder.value : this.sortOrder,
    mergedInto: mergedInto.present ? mergedInto.value : this.mergedInto,
    template: template.present ? template.value : this.template,
    fieldsJson: fieldsJson ?? this.fieldsJson,
    taxonomyVersion: taxonomyVersion.present ? taxonomyVersion.value : this.taxonomyVersion,
    createdAt: createdAt ?? this.createdAt,
  );
  TaxonomyNodeRow copyWithCompanion(TaxonomyNodesCompanion data) {
    return TaxonomyNodeRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      name: data.name.present ? data.name.value : this.name,
      icon: data.icon.present ? data.icon.value : this.icon,
      level: data.level.present ? data.level.value : this.level,
      source: data.source.present ? data.source.value : this.source,
      parentId: data.parentId.present ? data.parentId.value : this.parentId,
      hidden: data.hidden.present ? data.hidden.value : this.hidden,
      pinned: data.pinned.present ? data.pinned.value : this.pinned,
      sortOrder: data.sortOrder.present ? data.sortOrder.value : this.sortOrder,
      mergedInto: data.mergedInto.present ? data.mergedInto.value : this.mergedInto,
      template: data.template.present ? data.template.value : this.template,
      fieldsJson: data.fieldsJson.present ? data.fieldsJson.value : this.fieldsJson,
      taxonomyVersion: data.taxonomyVersion.present ? data.taxonomyVersion.value : this.taxonomyVersion,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('TaxonomyNodeRow(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('name: $name, ')
          ..write('icon: $icon, ')
          ..write('level: $level, ')
          ..write('source: $source, ')
          ..write('parentId: $parentId, ')
          ..write('hidden: $hidden, ')
          ..write('pinned: $pinned, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('mergedInto: $mergedInto, ')
          ..write('template: $template, ')
          ..write('fieldsJson: $fieldsJson, ')
          ..write('taxonomyVersion: $taxonomyVersion, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    workspaceId,
    name,
    icon,
    level,
    source,
    parentId,
    hidden,
    pinned,
    sortOrder,
    mergedInto,
    template,
    fieldsJson,
    taxonomyVersion,
    createdAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TaxonomyNodeRow &&
          other.id == this.id &&
          other.workspaceId == this.workspaceId &&
          other.name == this.name &&
          other.icon == this.icon &&
          other.level == this.level &&
          other.source == this.source &&
          other.parentId == this.parentId &&
          other.hidden == this.hidden &&
          other.pinned == this.pinned &&
          other.sortOrder == this.sortOrder &&
          other.mergedInto == this.mergedInto &&
          other.template == this.template &&
          other.fieldsJson == this.fieldsJson &&
          other.taxonomyVersion == this.taxonomyVersion &&
          other.createdAt == this.createdAt);
}

class TaxonomyNodesCompanion extends UpdateCompanion<TaxonomyNodeRow> {
  final Value<String> id;
  final Value<String> workspaceId;
  final Value<String> name;
  final Value<String> icon;
  final Value<String?> level;
  final Value<String?> source;
  final Value<String?> parentId;
  final Value<bool> hidden;
  final Value<bool> pinned;
  final Value<double?> sortOrder;
  final Value<String?> mergedInto;
  final Value<String?> template;
  final Value<String> fieldsJson;
  final Value<int?> taxonomyVersion;
  final Value<int> createdAt;
  final Value<int> rowid;
  const TaxonomyNodesCompanion({
    this.id = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.name = const Value.absent(),
    this.icon = const Value.absent(),
    this.level = const Value.absent(),
    this.source = const Value.absent(),
    this.parentId = const Value.absent(),
    this.hidden = const Value.absent(),
    this.pinned = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.mergedInto = const Value.absent(),
    this.template = const Value.absent(),
    this.fieldsJson = const Value.absent(),
    this.taxonomyVersion = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  TaxonomyNodesCompanion.insert({
    required String id,
    this.workspaceId = const Value.absent(),
    this.name = const Value.absent(),
    this.icon = const Value.absent(),
    this.level = const Value.absent(),
    this.source = const Value.absent(),
    this.parentId = const Value.absent(),
    this.hidden = const Value.absent(),
    this.pinned = const Value.absent(),
    this.sortOrder = const Value.absent(),
    this.mergedInto = const Value.absent(),
    this.template = const Value.absent(),
    this.fieldsJson = const Value.absent(),
    this.taxonomyVersion = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       createdAt = Value(createdAt);
  static Insertable<TaxonomyNodeRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceId,
    Expression<String>? name,
    Expression<String>? icon,
    Expression<String>? level,
    Expression<String>? source,
    Expression<String>? parentId,
    Expression<bool>? hidden,
    Expression<bool>? pinned,
    Expression<double>? sortOrder,
    Expression<String>? mergedInto,
    Expression<String>? template,
    Expression<String>? fieldsJson,
    Expression<int>? taxonomyVersion,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (name != null) 'name': name,
      if (icon != null) 'icon': icon,
      if (level != null) 'level': level,
      if (source != null) 'source': source,
      if (parentId != null) 'parent_id': parentId,
      if (hidden != null) 'hidden': hidden,
      if (pinned != null) 'pinned': pinned,
      if (sortOrder != null) 'sort_order': sortOrder,
      if (mergedInto != null) 'merged_into': mergedInto,
      if (template != null) 'template': template,
      if (fieldsJson != null) 'fields_json': fieldsJson,
      if (taxonomyVersion != null) 'taxonomy_version': taxonomyVersion,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  TaxonomyNodesCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceId,
    Value<String>? name,
    Value<String>? icon,
    Value<String?>? level,
    Value<String?>? source,
    Value<String?>? parentId,
    Value<bool>? hidden,
    Value<bool>? pinned,
    Value<double?>? sortOrder,
    Value<String?>? mergedInto,
    Value<String?>? template,
    Value<String>? fieldsJson,
    Value<int?>? taxonomyVersion,
    Value<int>? createdAt,
    Value<int>? rowid,
  }) {
    return TaxonomyNodesCompanion(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      name: name ?? this.name,
      icon: icon ?? this.icon,
      level: level ?? this.level,
      source: source ?? this.source,
      parentId: parentId ?? this.parentId,
      hidden: hidden ?? this.hidden,
      pinned: pinned ?? this.pinned,
      sortOrder: sortOrder ?? this.sortOrder,
      mergedInto: mergedInto ?? this.mergedInto,
      template: template ?? this.template,
      fieldsJson: fieldsJson ?? this.fieldsJson,
      taxonomyVersion: taxonomyVersion ?? this.taxonomyVersion,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (icon.present) {
      map['icon'] = Variable<String>(icon.value);
    }
    if (level.present) {
      map['level'] = Variable<String>(level.value);
    }
    if (source.present) {
      map['source'] = Variable<String>(source.value);
    }
    if (parentId.present) {
      map['parent_id'] = Variable<String>(parentId.value);
    }
    if (hidden.present) {
      map['hidden'] = Variable<bool>(hidden.value);
    }
    if (pinned.present) {
      map['pinned'] = Variable<bool>(pinned.value);
    }
    if (sortOrder.present) {
      map['sort_order'] = Variable<double>(sortOrder.value);
    }
    if (mergedInto.present) {
      map['merged_into'] = Variable<String>(mergedInto.value);
    }
    if (template.present) {
      map['template'] = Variable<String>(template.value);
    }
    if (fieldsJson.present) {
      map['fields_json'] = Variable<String>(fieldsJson.value);
    }
    if (taxonomyVersion.present) {
      map['taxonomy_version'] = Variable<int>(taxonomyVersion.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('TaxonomyNodesCompanion(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('name: $name, ')
          ..write('icon: $icon, ')
          ..write('level: $level, ')
          ..write('source: $source, ')
          ..write('parentId: $parentId, ')
          ..write('hidden: $hidden, ')
          ..write('pinned: $pinned, ')
          ..write('sortOrder: $sortOrder, ')
          ..write('mergedInto: $mergedInto, ')
          ..write('template: $template, ')
          ..write('fieldsJson: $fieldsJson, ')
          ..write('taxonomyVersion: $taxonomyVersion, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $FieldDefinitionsTable extends FieldDefinitions with TableInfo<$FieldDefinitionsTable, FieldDefinitionRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FieldDefinitionsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('local'),
  );
  static const VerificationMeta _typeMeta = const VerificationMeta('type');
  @override
  late final GeneratedColumn<String> type = GeneratedColumn<String>(
    'type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _labelMeta = const VerificationMeta('label');
  @override
  late final GeneratedColumn<String> label = GeneratedColumn<String>(
    'label',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _definitionJsonMeta = const VerificationMeta('definitionJson');
  @override
  late final GeneratedColumn<String> definitionJson = GeneratedColumn<String>(
    'definition_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _retiredMeta = const VerificationMeta('retired');
  @override
  late final GeneratedColumn<bool> retired = GeneratedColumn<bool>(
    'retired',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways('CHECK ("retired" IN (0, 1))'),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _retiredAtMeta = const VerificationMeta('retiredAt');
  @override
  late final GeneratedColumn<int> retiredAt = GeneratedColumn<int>(
    'retired_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _recoveredMeta = const VerificationMeta('recovered');
  @override
  late final GeneratedColumn<bool> recovered = GeneratedColumn<bool>(
    'recovered',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways('CHECK ("recovered" IN (0, 1))'),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _originalTaxonomyNodeIdMeta = const VerificationMeta('originalTaxonomyNodeId');
  @override
  late final GeneratedColumn<String> originalTaxonomyNodeId = GeneratedColumn<String>(
    'original_taxonomy_node_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    workspaceId,
    type,
    label,
    definitionJson,
    retired,
    retiredAt,
    recovered,
    originalTaxonomyNodeId,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'field_definitions';
  @override
  VerificationContext validateIntegrity(Insertable<FieldDefinitionRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    }
    if (data.containsKey('type')) {
      context.handle(_typeMeta, type.isAcceptableOrUnknown(data['type']!, _typeMeta));
    } else if (isInserting) {
      context.missing(_typeMeta);
    }
    if (data.containsKey('label')) {
      context.handle(_labelMeta, label.isAcceptableOrUnknown(data['label']!, _labelMeta));
    } else if (isInserting) {
      context.missing(_labelMeta);
    }
    if (data.containsKey('definition_json')) {
      context.handle(
        _definitionJsonMeta,
        definitionJson.isAcceptableOrUnknown(data['definition_json']!, _definitionJsonMeta),
      );
    } else if (isInserting) {
      context.missing(_definitionJsonMeta);
    }
    if (data.containsKey('retired')) {
      context.handle(_retiredMeta, retired.isAcceptableOrUnknown(data['retired']!, _retiredMeta));
    }
    if (data.containsKey('retired_at')) {
      context.handle(_retiredAtMeta, retiredAt.isAcceptableOrUnknown(data['retired_at']!, _retiredAtMeta));
    }
    if (data.containsKey('recovered')) {
      context.handle(_recoveredMeta, recovered.isAcceptableOrUnknown(data['recovered']!, _recoveredMeta));
    }
    if (data.containsKey('original_taxonomy_node_id')) {
      context.handle(
        _originalTaxonomyNodeIdMeta,
        originalTaxonomyNodeId.isAcceptableOrUnknown(data['original_taxonomy_node_id']!, _originalTaxonomyNodeIdMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  FieldDefinitionRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FieldDefinitionRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      type: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}type'])!,
      label: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}label'])!,
      definitionJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}definition_json'],
      )!,
      retired: attachedDatabase.typeMapping.read(DriftSqlType.bool, data['${effectivePrefix}retired'])!,
      retiredAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}retired_at']),
      recovered: attachedDatabase.typeMapping.read(DriftSqlType.bool, data['${effectivePrefix}recovered'])!,
      originalTaxonomyNodeId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}original_taxonomy_node_id'],
      ),
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $FieldDefinitionsTable createAlias(String alias) {
    return $FieldDefinitionsTable(attachedDatabase, alias);
  }
}

class FieldDefinitionRow extends DataClass implements Insertable<FieldDefinitionRow> {
  final String id;
  final String workspaceId;
  final String type;
  final String label;

  /// The full normalised definition (options, unit, validation, catalog…).
  final String definitionJson;
  final bool retired;
  final int? retiredAt;
  final bool recovered;
  final String? originalTaxonomyNodeId;
  final int createdAt;
  const FieldDefinitionRow({
    required this.id,
    required this.workspaceId,
    required this.type,
    required this.label,
    required this.definitionJson,
    required this.retired,
    this.retiredAt,
    required this.recovered,
    this.originalTaxonomyNodeId,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_id'] = Variable<String>(workspaceId);
    map['type'] = Variable<String>(type);
    map['label'] = Variable<String>(label);
    map['definition_json'] = Variable<String>(definitionJson);
    map['retired'] = Variable<bool>(retired);
    if (!nullToAbsent || retiredAt != null) {
      map['retired_at'] = Variable<int>(retiredAt);
    }
    map['recovered'] = Variable<bool>(recovered);
    if (!nullToAbsent || originalTaxonomyNodeId != null) {
      map['original_taxonomy_node_id'] = Variable<String>(originalTaxonomyNodeId);
    }
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  FieldDefinitionsCompanion toCompanion(bool nullToAbsent) {
    return FieldDefinitionsCompanion(
      id: Value(id),
      workspaceId: Value(workspaceId),
      type: Value(type),
      label: Value(label),
      definitionJson: Value(definitionJson),
      retired: Value(retired),
      retiredAt: retiredAt == null && nullToAbsent ? const Value.absent() : Value(retiredAt),
      recovered: Value(recovered),
      originalTaxonomyNodeId: originalTaxonomyNodeId == null && nullToAbsent
          ? const Value.absent()
          : Value(originalTaxonomyNodeId),
      createdAt: Value(createdAt),
    );
  }

  factory FieldDefinitionRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FieldDefinitionRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      type: serializer.fromJson<String>(json['type']),
      label: serializer.fromJson<String>(json['label']),
      definitionJson: serializer.fromJson<String>(json['definitionJson']),
      retired: serializer.fromJson<bool>(json['retired']),
      retiredAt: serializer.fromJson<int?>(json['retiredAt']),
      recovered: serializer.fromJson<bool>(json['recovered']),
      originalTaxonomyNodeId: serializer.fromJson<String?>(json['originalTaxonomyNodeId']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'type': serializer.toJson<String>(type),
      'label': serializer.toJson<String>(label),
      'definitionJson': serializer.toJson<String>(definitionJson),
      'retired': serializer.toJson<bool>(retired),
      'retiredAt': serializer.toJson<int?>(retiredAt),
      'recovered': serializer.toJson<bool>(recovered),
      'originalTaxonomyNodeId': serializer.toJson<String?>(originalTaxonomyNodeId),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  FieldDefinitionRow copyWith({
    String? id,
    String? workspaceId,
    String? type,
    String? label,
    String? definitionJson,
    bool? retired,
    Value<int?> retiredAt = const Value.absent(),
    bool? recovered,
    Value<String?> originalTaxonomyNodeId = const Value.absent(),
    int? createdAt,
  }) => FieldDefinitionRow(
    id: id ?? this.id,
    workspaceId: workspaceId ?? this.workspaceId,
    type: type ?? this.type,
    label: label ?? this.label,
    definitionJson: definitionJson ?? this.definitionJson,
    retired: retired ?? this.retired,
    retiredAt: retiredAt.present ? retiredAt.value : this.retiredAt,
    recovered: recovered ?? this.recovered,
    originalTaxonomyNodeId: originalTaxonomyNodeId.present ? originalTaxonomyNodeId.value : this.originalTaxonomyNodeId,
    createdAt: createdAt ?? this.createdAt,
  );
  FieldDefinitionRow copyWithCompanion(FieldDefinitionsCompanion data) {
    return FieldDefinitionRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      type: data.type.present ? data.type.value : this.type,
      label: data.label.present ? data.label.value : this.label,
      definitionJson: data.definitionJson.present ? data.definitionJson.value : this.definitionJson,
      retired: data.retired.present ? data.retired.value : this.retired,
      retiredAt: data.retiredAt.present ? data.retiredAt.value : this.retiredAt,
      recovered: data.recovered.present ? data.recovered.value : this.recovered,
      originalTaxonomyNodeId: data.originalTaxonomyNodeId.present
          ? data.originalTaxonomyNodeId.value
          : this.originalTaxonomyNodeId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FieldDefinitionRow(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('type: $type, ')
          ..write('label: $label, ')
          ..write('definitionJson: $definitionJson, ')
          ..write('retired: $retired, ')
          ..write('retiredAt: $retiredAt, ')
          ..write('recovered: $recovered, ')
          ..write('originalTaxonomyNodeId: $originalTaxonomyNodeId, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    workspaceId,
    type,
    label,
    definitionJson,
    retired,
    retiredAt,
    recovered,
    originalTaxonomyNodeId,
    createdAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FieldDefinitionRow &&
          other.id == this.id &&
          other.workspaceId == this.workspaceId &&
          other.type == this.type &&
          other.label == this.label &&
          other.definitionJson == this.definitionJson &&
          other.retired == this.retired &&
          other.retiredAt == this.retiredAt &&
          other.recovered == this.recovered &&
          other.originalTaxonomyNodeId == this.originalTaxonomyNodeId &&
          other.createdAt == this.createdAt);
}

class FieldDefinitionsCompanion extends UpdateCompanion<FieldDefinitionRow> {
  final Value<String> id;
  final Value<String> workspaceId;
  final Value<String> type;
  final Value<String> label;
  final Value<String> definitionJson;
  final Value<bool> retired;
  final Value<int?> retiredAt;
  final Value<bool> recovered;
  final Value<String?> originalTaxonomyNodeId;
  final Value<int> createdAt;
  final Value<int> rowid;
  const FieldDefinitionsCompanion({
    this.id = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.type = const Value.absent(),
    this.label = const Value.absent(),
    this.definitionJson = const Value.absent(),
    this.retired = const Value.absent(),
    this.retiredAt = const Value.absent(),
    this.recovered = const Value.absent(),
    this.originalTaxonomyNodeId = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  FieldDefinitionsCompanion.insert({
    required String id,
    this.workspaceId = const Value.absent(),
    required String type,
    required String label,
    required String definitionJson,
    this.retired = const Value.absent(),
    this.retiredAt = const Value.absent(),
    this.recovered = const Value.absent(),
    this.originalTaxonomyNodeId = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       type = Value(type),
       label = Value(label),
       definitionJson = Value(definitionJson),
       createdAt = Value(createdAt);
  static Insertable<FieldDefinitionRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceId,
    Expression<String>? type,
    Expression<String>? label,
    Expression<String>? definitionJson,
    Expression<bool>? retired,
    Expression<int>? retiredAt,
    Expression<bool>? recovered,
    Expression<String>? originalTaxonomyNodeId,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (type != null) 'type': type,
      if (label != null) 'label': label,
      if (definitionJson != null) 'definition_json': definitionJson,
      if (retired != null) 'retired': retired,
      if (retiredAt != null) 'retired_at': retiredAt,
      if (recovered != null) 'recovered': recovered,
      if (originalTaxonomyNodeId != null) 'original_taxonomy_node_id': originalTaxonomyNodeId,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  FieldDefinitionsCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceId,
    Value<String>? type,
    Value<String>? label,
    Value<String>? definitionJson,
    Value<bool>? retired,
    Value<int?>? retiredAt,
    Value<bool>? recovered,
    Value<String?>? originalTaxonomyNodeId,
    Value<int>? createdAt,
    Value<int>? rowid,
  }) {
    return FieldDefinitionsCompanion(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      type: type ?? this.type,
      label: label ?? this.label,
      definitionJson: definitionJson ?? this.definitionJson,
      retired: retired ?? this.retired,
      retiredAt: retiredAt ?? this.retiredAt,
      recovered: recovered ?? this.recovered,
      originalTaxonomyNodeId: originalTaxonomyNodeId ?? this.originalTaxonomyNodeId,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (type.present) {
      map['type'] = Variable<String>(type.value);
    }
    if (label.present) {
      map['label'] = Variable<String>(label.value);
    }
    if (definitionJson.present) {
      map['definition_json'] = Variable<String>(definitionJson.value);
    }
    if (retired.present) {
      map['retired'] = Variable<bool>(retired.value);
    }
    if (retiredAt.present) {
      map['retired_at'] = Variable<int>(retiredAt.value);
    }
    if (recovered.present) {
      map['recovered'] = Variable<bool>(recovered.value);
    }
    if (originalTaxonomyNodeId.present) {
      map['original_taxonomy_node_id'] = Variable<String>(originalTaxonomyNodeId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FieldDefinitionsCompanion(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('type: $type, ')
          ..write('label: $label, ')
          ..write('definitionJson: $definitionJson, ')
          ..write('retired: $retired, ')
          ..write('retiredAt: $retiredAt, ')
          ..write('recovered: $recovered, ')
          ..write('originalTaxonomyNodeId: $originalTaxonomyNodeId, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CustomCatalogEntitiesTable extends CustomCatalogEntities
    with TableInfo<$CustomCatalogEntitiesTable, CustomCatalogEntityRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CustomCatalogEntitiesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('local'),
  );
  static const VerificationMeta _domainsJsonMeta = const VerificationMeta('domainsJson');
  @override
  late final GeneratedColumn<String> domainsJson = GeneratedColumn<String>(
    'domains_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityTypeMeta = const VerificationMeta('entityType');
  @override
  late final GeneratedColumn<String> entityType = GeneratedColumn<String>(
    'entity_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _parentIdMeta = const VerificationMeta('parentId');
  @override
  late final GeneratedColumn<String> parentId = GeneratedColumn<String>(
    'parent_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _nameArMeta = const VerificationMeta('nameAr');
  @override
  late final GeneratedColumn<String> nameAr = GeneratedColumn<String>(
    'name_ar',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _nameEnMeta = const VerificationMeta('nameEn');
  @override
  late final GeneratedColumn<String> nameEn = GeneratedColumn<String>(
    'name_en',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _aliasesArJsonMeta = const VerificationMeta('aliasesArJson');
  @override
  late final GeneratedColumn<String> aliasesArJson = GeneratedColumn<String>(
    'aliases_ar_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _aliasesEnJsonMeta = const VerificationMeta('aliasesEnJson');
  @override
  late final GeneratedColumn<String> aliasesEnJson = GeneratedColumn<String>(
    'aliases_en_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _codeMeta = const VerificationMeta('code');
  @override
  late final GeneratedColumn<String> code = GeneratedColumn<String>(
    'code',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _metadataJsonMeta = const VerificationMeta('metadataJson');
  @override
  late final GeneratedColumn<String> metadataJson = GeneratedColumn<String>(
    'metadata_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('{}'),
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('active'),
  );
  static const VerificationMeta _redirectToMeta = const VerificationMeta('redirectTo');
  @override
  late final GeneratedColumn<String> redirectTo = GeneratedColumn<String>(
    'redirect_to',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _sortKeyMeta = const VerificationMeta('sortKey');
  @override
  late final GeneratedColumn<String> sortKey = GeneratedColumn<String>(
    'sort_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _retiredAtMeta = const VerificationMeta('retiredAt');
  @override
  late final GeneratedColumn<int> retiredAt = GeneratedColumn<int>(
    'retired_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    workspaceId,
    domainsJson,
    entityType,
    parentId,
    nameAr,
    nameEn,
    aliasesArJson,
    aliasesEnJson,
    code,
    metadataJson,
    status,
    redirectTo,
    sortKey,
    createdAt,
    updatedAt,
    retiredAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'custom_catalog_entities';
  @override
  VerificationContext validateIntegrity(Insertable<CustomCatalogEntityRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    }
    if (data.containsKey('domains_json')) {
      context.handle(_domainsJsonMeta, domainsJson.isAcceptableOrUnknown(data['domains_json']!, _domainsJsonMeta));
    } else if (isInserting) {
      context.missing(_domainsJsonMeta);
    }
    if (data.containsKey('entity_type')) {
      context.handle(_entityTypeMeta, entityType.isAcceptableOrUnknown(data['entity_type']!, _entityTypeMeta));
    } else if (isInserting) {
      context.missing(_entityTypeMeta);
    }
    if (data.containsKey('parent_id')) {
      context.handle(_parentIdMeta, parentId.isAcceptableOrUnknown(data['parent_id']!, _parentIdMeta));
    }
    if (data.containsKey('name_ar')) {
      context.handle(_nameArMeta, nameAr.isAcceptableOrUnknown(data['name_ar']!, _nameArMeta));
    }
    if (data.containsKey('name_en')) {
      context.handle(_nameEnMeta, nameEn.isAcceptableOrUnknown(data['name_en']!, _nameEnMeta));
    }
    if (data.containsKey('aliases_ar_json')) {
      context.handle(
        _aliasesArJsonMeta,
        aliasesArJson.isAcceptableOrUnknown(data['aliases_ar_json']!, _aliasesArJsonMeta),
      );
    }
    if (data.containsKey('aliases_en_json')) {
      context.handle(
        _aliasesEnJsonMeta,
        aliasesEnJson.isAcceptableOrUnknown(data['aliases_en_json']!, _aliasesEnJsonMeta),
      );
    }
    if (data.containsKey('code')) {
      context.handle(_codeMeta, code.isAcceptableOrUnknown(data['code']!, _codeMeta));
    }
    if (data.containsKey('metadata_json')) {
      context.handle(_metadataJsonMeta, metadataJson.isAcceptableOrUnknown(data['metadata_json']!, _metadataJsonMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    }
    if (data.containsKey('redirect_to')) {
      context.handle(_redirectToMeta, redirectTo.isAcceptableOrUnknown(data['redirect_to']!, _redirectToMeta));
    }
    if (data.containsKey('sort_key')) {
      context.handle(_sortKeyMeta, sortKey.isAcceptableOrUnknown(data['sort_key']!, _sortKeyMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    }
    if (data.containsKey('retired_at')) {
      context.handle(_retiredAtMeta, retiredAt.isAcceptableOrUnknown(data['retired_at']!, _retiredAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CustomCatalogEntityRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CustomCatalogEntityRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      domainsJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}domains_json'])!,
      entityType: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}entity_type'])!,
      parentId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}parent_id']),
      nameAr: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name_ar'])!,
      nameEn: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name_en'])!,
      aliasesArJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}aliases_ar_json'])!,
      aliasesEnJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}aliases_en_json'])!,
      code: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}code']),
      metadataJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}metadata_json'])!,
      status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      redirectTo: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}redirect_to']),
      sortKey: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}sort_key'])!,
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at']),
      updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}updated_at']),
      retiredAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}retired_at']),
    );
  }

  @override
  $CustomCatalogEntitiesTable createAlias(String alias) {
    return $CustomCatalogEntitiesTable(attachedDatabase, alias);
  }
}

class CustomCatalogEntityRow extends DataClass implements Insertable<CustomCatalogEntityRow> {
  final String id;
  final String workspaceId;
  final String domainsJson;
  final String entityType;
  final String? parentId;
  final String nameAr;
  final String nameEn;
  final String aliasesArJson;
  final String aliasesEnJson;
  final String? code;
  final String metadataJson;
  final String status;
  final String? redirectTo;
  final String sortKey;
  final int? createdAt;
  final int? updatedAt;
  final int? retiredAt;
  const CustomCatalogEntityRow({
    required this.id,
    required this.workspaceId,
    required this.domainsJson,
    required this.entityType,
    this.parentId,
    required this.nameAr,
    required this.nameEn,
    required this.aliasesArJson,
    required this.aliasesEnJson,
    this.code,
    required this.metadataJson,
    required this.status,
    this.redirectTo,
    required this.sortKey,
    this.createdAt,
    this.updatedAt,
    this.retiredAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_id'] = Variable<String>(workspaceId);
    map['domains_json'] = Variable<String>(domainsJson);
    map['entity_type'] = Variable<String>(entityType);
    if (!nullToAbsent || parentId != null) {
      map['parent_id'] = Variable<String>(parentId);
    }
    map['name_ar'] = Variable<String>(nameAr);
    map['name_en'] = Variable<String>(nameEn);
    map['aliases_ar_json'] = Variable<String>(aliasesArJson);
    map['aliases_en_json'] = Variable<String>(aliasesEnJson);
    if (!nullToAbsent || code != null) {
      map['code'] = Variable<String>(code);
    }
    map['metadata_json'] = Variable<String>(metadataJson);
    map['status'] = Variable<String>(status);
    if (!nullToAbsent || redirectTo != null) {
      map['redirect_to'] = Variable<String>(redirectTo);
    }
    map['sort_key'] = Variable<String>(sortKey);
    if (!nullToAbsent || createdAt != null) {
      map['created_at'] = Variable<int>(createdAt);
    }
    if (!nullToAbsent || updatedAt != null) {
      map['updated_at'] = Variable<int>(updatedAt);
    }
    if (!nullToAbsent || retiredAt != null) {
      map['retired_at'] = Variable<int>(retiredAt);
    }
    return map;
  }

  CustomCatalogEntitiesCompanion toCompanion(bool nullToAbsent) {
    return CustomCatalogEntitiesCompanion(
      id: Value(id),
      workspaceId: Value(workspaceId),
      domainsJson: Value(domainsJson),
      entityType: Value(entityType),
      parentId: parentId == null && nullToAbsent ? const Value.absent() : Value(parentId),
      nameAr: Value(nameAr),
      nameEn: Value(nameEn),
      aliasesArJson: Value(aliasesArJson),
      aliasesEnJson: Value(aliasesEnJson),
      code: code == null && nullToAbsent ? const Value.absent() : Value(code),
      metadataJson: Value(metadataJson),
      status: Value(status),
      redirectTo: redirectTo == null && nullToAbsent ? const Value.absent() : Value(redirectTo),
      sortKey: Value(sortKey),
      createdAt: createdAt == null && nullToAbsent ? const Value.absent() : Value(createdAt),
      updatedAt: updatedAt == null && nullToAbsent ? const Value.absent() : Value(updatedAt),
      retiredAt: retiredAt == null && nullToAbsent ? const Value.absent() : Value(retiredAt),
    );
  }

  factory CustomCatalogEntityRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CustomCatalogEntityRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      domainsJson: serializer.fromJson<String>(json['domainsJson']),
      entityType: serializer.fromJson<String>(json['entityType']),
      parentId: serializer.fromJson<String?>(json['parentId']),
      nameAr: serializer.fromJson<String>(json['nameAr']),
      nameEn: serializer.fromJson<String>(json['nameEn']),
      aliasesArJson: serializer.fromJson<String>(json['aliasesArJson']),
      aliasesEnJson: serializer.fromJson<String>(json['aliasesEnJson']),
      code: serializer.fromJson<String?>(json['code']),
      metadataJson: serializer.fromJson<String>(json['metadataJson']),
      status: serializer.fromJson<String>(json['status']),
      redirectTo: serializer.fromJson<String?>(json['redirectTo']),
      sortKey: serializer.fromJson<String>(json['sortKey']),
      createdAt: serializer.fromJson<int?>(json['createdAt']),
      updatedAt: serializer.fromJson<int?>(json['updatedAt']),
      retiredAt: serializer.fromJson<int?>(json['retiredAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'domainsJson': serializer.toJson<String>(domainsJson),
      'entityType': serializer.toJson<String>(entityType),
      'parentId': serializer.toJson<String?>(parentId),
      'nameAr': serializer.toJson<String>(nameAr),
      'nameEn': serializer.toJson<String>(nameEn),
      'aliasesArJson': serializer.toJson<String>(aliasesArJson),
      'aliasesEnJson': serializer.toJson<String>(aliasesEnJson),
      'code': serializer.toJson<String?>(code),
      'metadataJson': serializer.toJson<String>(metadataJson),
      'status': serializer.toJson<String>(status),
      'redirectTo': serializer.toJson<String?>(redirectTo),
      'sortKey': serializer.toJson<String>(sortKey),
      'createdAt': serializer.toJson<int?>(createdAt),
      'updatedAt': serializer.toJson<int?>(updatedAt),
      'retiredAt': serializer.toJson<int?>(retiredAt),
    };
  }

  CustomCatalogEntityRow copyWith({
    String? id,
    String? workspaceId,
    String? domainsJson,
    String? entityType,
    Value<String?> parentId = const Value.absent(),
    String? nameAr,
    String? nameEn,
    String? aliasesArJson,
    String? aliasesEnJson,
    Value<String?> code = const Value.absent(),
    String? metadataJson,
    String? status,
    Value<String?> redirectTo = const Value.absent(),
    String? sortKey,
    Value<int?> createdAt = const Value.absent(),
    Value<int?> updatedAt = const Value.absent(),
    Value<int?> retiredAt = const Value.absent(),
  }) => CustomCatalogEntityRow(
    id: id ?? this.id,
    workspaceId: workspaceId ?? this.workspaceId,
    domainsJson: domainsJson ?? this.domainsJson,
    entityType: entityType ?? this.entityType,
    parentId: parentId.present ? parentId.value : this.parentId,
    nameAr: nameAr ?? this.nameAr,
    nameEn: nameEn ?? this.nameEn,
    aliasesArJson: aliasesArJson ?? this.aliasesArJson,
    aliasesEnJson: aliasesEnJson ?? this.aliasesEnJson,
    code: code.present ? code.value : this.code,
    metadataJson: metadataJson ?? this.metadataJson,
    status: status ?? this.status,
    redirectTo: redirectTo.present ? redirectTo.value : this.redirectTo,
    sortKey: sortKey ?? this.sortKey,
    createdAt: createdAt.present ? createdAt.value : this.createdAt,
    updatedAt: updatedAt.present ? updatedAt.value : this.updatedAt,
    retiredAt: retiredAt.present ? retiredAt.value : this.retiredAt,
  );
  CustomCatalogEntityRow copyWithCompanion(CustomCatalogEntitiesCompanion data) {
    return CustomCatalogEntityRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      domainsJson: data.domainsJson.present ? data.domainsJson.value : this.domainsJson,
      entityType: data.entityType.present ? data.entityType.value : this.entityType,
      parentId: data.parentId.present ? data.parentId.value : this.parentId,
      nameAr: data.nameAr.present ? data.nameAr.value : this.nameAr,
      nameEn: data.nameEn.present ? data.nameEn.value : this.nameEn,
      aliasesArJson: data.aliasesArJson.present ? data.aliasesArJson.value : this.aliasesArJson,
      aliasesEnJson: data.aliasesEnJson.present ? data.aliasesEnJson.value : this.aliasesEnJson,
      code: data.code.present ? data.code.value : this.code,
      metadataJson: data.metadataJson.present ? data.metadataJson.value : this.metadataJson,
      status: data.status.present ? data.status.value : this.status,
      redirectTo: data.redirectTo.present ? data.redirectTo.value : this.redirectTo,
      sortKey: data.sortKey.present ? data.sortKey.value : this.sortKey,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      retiredAt: data.retiredAt.present ? data.retiredAt.value : this.retiredAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CustomCatalogEntityRow(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('domainsJson: $domainsJson, ')
          ..write('entityType: $entityType, ')
          ..write('parentId: $parentId, ')
          ..write('nameAr: $nameAr, ')
          ..write('nameEn: $nameEn, ')
          ..write('aliasesArJson: $aliasesArJson, ')
          ..write('aliasesEnJson: $aliasesEnJson, ')
          ..write('code: $code, ')
          ..write('metadataJson: $metadataJson, ')
          ..write('status: $status, ')
          ..write('redirectTo: $redirectTo, ')
          ..write('sortKey: $sortKey, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('retiredAt: $retiredAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    workspaceId,
    domainsJson,
    entityType,
    parentId,
    nameAr,
    nameEn,
    aliasesArJson,
    aliasesEnJson,
    code,
    metadataJson,
    status,
    redirectTo,
    sortKey,
    createdAt,
    updatedAt,
    retiredAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CustomCatalogEntityRow &&
          other.id == this.id &&
          other.workspaceId == this.workspaceId &&
          other.domainsJson == this.domainsJson &&
          other.entityType == this.entityType &&
          other.parentId == this.parentId &&
          other.nameAr == this.nameAr &&
          other.nameEn == this.nameEn &&
          other.aliasesArJson == this.aliasesArJson &&
          other.aliasesEnJson == this.aliasesEnJson &&
          other.code == this.code &&
          other.metadataJson == this.metadataJson &&
          other.status == this.status &&
          other.redirectTo == this.redirectTo &&
          other.sortKey == this.sortKey &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt &&
          other.retiredAt == this.retiredAt);
}

class CustomCatalogEntitiesCompanion extends UpdateCompanion<CustomCatalogEntityRow> {
  final Value<String> id;
  final Value<String> workspaceId;
  final Value<String> domainsJson;
  final Value<String> entityType;
  final Value<String?> parentId;
  final Value<String> nameAr;
  final Value<String> nameEn;
  final Value<String> aliasesArJson;
  final Value<String> aliasesEnJson;
  final Value<String?> code;
  final Value<String> metadataJson;
  final Value<String> status;
  final Value<String?> redirectTo;
  final Value<String> sortKey;
  final Value<int?> createdAt;
  final Value<int?> updatedAt;
  final Value<int?> retiredAt;
  final Value<int> rowid;
  const CustomCatalogEntitiesCompanion({
    this.id = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.domainsJson = const Value.absent(),
    this.entityType = const Value.absent(),
    this.parentId = const Value.absent(),
    this.nameAr = const Value.absent(),
    this.nameEn = const Value.absent(),
    this.aliasesArJson = const Value.absent(),
    this.aliasesEnJson = const Value.absent(),
    this.code = const Value.absent(),
    this.metadataJson = const Value.absent(),
    this.status = const Value.absent(),
    this.redirectTo = const Value.absent(),
    this.sortKey = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.retiredAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CustomCatalogEntitiesCompanion.insert({
    required String id,
    this.workspaceId = const Value.absent(),
    required String domainsJson,
    required String entityType,
    this.parentId = const Value.absent(),
    this.nameAr = const Value.absent(),
    this.nameEn = const Value.absent(),
    this.aliasesArJson = const Value.absent(),
    this.aliasesEnJson = const Value.absent(),
    this.code = const Value.absent(),
    this.metadataJson = const Value.absent(),
    this.status = const Value.absent(),
    this.redirectTo = const Value.absent(),
    this.sortKey = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.retiredAt = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       domainsJson = Value(domainsJson),
       entityType = Value(entityType);
  static Insertable<CustomCatalogEntityRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceId,
    Expression<String>? domainsJson,
    Expression<String>? entityType,
    Expression<String>? parentId,
    Expression<String>? nameAr,
    Expression<String>? nameEn,
    Expression<String>? aliasesArJson,
    Expression<String>? aliasesEnJson,
    Expression<String>? code,
    Expression<String>? metadataJson,
    Expression<String>? status,
    Expression<String>? redirectTo,
    Expression<String>? sortKey,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? retiredAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (domainsJson != null) 'domains_json': domainsJson,
      if (entityType != null) 'entity_type': entityType,
      if (parentId != null) 'parent_id': parentId,
      if (nameAr != null) 'name_ar': nameAr,
      if (nameEn != null) 'name_en': nameEn,
      if (aliasesArJson != null) 'aliases_ar_json': aliasesArJson,
      if (aliasesEnJson != null) 'aliases_en_json': aliasesEnJson,
      if (code != null) 'code': code,
      if (metadataJson != null) 'metadata_json': metadataJson,
      if (status != null) 'status': status,
      if (redirectTo != null) 'redirect_to': redirectTo,
      if (sortKey != null) 'sort_key': sortKey,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (retiredAt != null) 'retired_at': retiredAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CustomCatalogEntitiesCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceId,
    Value<String>? domainsJson,
    Value<String>? entityType,
    Value<String?>? parentId,
    Value<String>? nameAr,
    Value<String>? nameEn,
    Value<String>? aliasesArJson,
    Value<String>? aliasesEnJson,
    Value<String?>? code,
    Value<String>? metadataJson,
    Value<String>? status,
    Value<String?>? redirectTo,
    Value<String>? sortKey,
    Value<int?>? createdAt,
    Value<int?>? updatedAt,
    Value<int?>? retiredAt,
    Value<int>? rowid,
  }) {
    return CustomCatalogEntitiesCompanion(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      domainsJson: domainsJson ?? this.domainsJson,
      entityType: entityType ?? this.entityType,
      parentId: parentId ?? this.parentId,
      nameAr: nameAr ?? this.nameAr,
      nameEn: nameEn ?? this.nameEn,
      aliasesArJson: aliasesArJson ?? this.aliasesArJson,
      aliasesEnJson: aliasesEnJson ?? this.aliasesEnJson,
      code: code ?? this.code,
      metadataJson: metadataJson ?? this.metadataJson,
      status: status ?? this.status,
      redirectTo: redirectTo ?? this.redirectTo,
      sortKey: sortKey ?? this.sortKey,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      retiredAt: retiredAt ?? this.retiredAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (domainsJson.present) {
      map['domains_json'] = Variable<String>(domainsJson.value);
    }
    if (entityType.present) {
      map['entity_type'] = Variable<String>(entityType.value);
    }
    if (parentId.present) {
      map['parent_id'] = Variable<String>(parentId.value);
    }
    if (nameAr.present) {
      map['name_ar'] = Variable<String>(nameAr.value);
    }
    if (nameEn.present) {
      map['name_en'] = Variable<String>(nameEn.value);
    }
    if (aliasesArJson.present) {
      map['aliases_ar_json'] = Variable<String>(aliasesArJson.value);
    }
    if (aliasesEnJson.present) {
      map['aliases_en_json'] = Variable<String>(aliasesEnJson.value);
    }
    if (code.present) {
      map['code'] = Variable<String>(code.value);
    }
    if (metadataJson.present) {
      map['metadata_json'] = Variable<String>(metadataJson.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (redirectTo.present) {
      map['redirect_to'] = Variable<String>(redirectTo.value);
    }
    if (sortKey.present) {
      map['sort_key'] = Variable<String>(sortKey.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (retiredAt.present) {
      map['retired_at'] = Variable<int>(retiredAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CustomCatalogEntitiesCompanion(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('domainsJson: $domainsJson, ')
          ..write('entityType: $entityType, ')
          ..write('parentId: $parentId, ')
          ..write('nameAr: $nameAr, ')
          ..write('nameEn: $nameEn, ')
          ..write('aliasesArJson: $aliasesArJson, ')
          ..write('aliasesEnJson: $aliasesEnJson, ')
          ..write('code: $code, ')
          ..write('metadataJson: $metadataJson, ')
          ..write('status: $status, ')
          ..write('redirectTo: $redirectTo, ')
          ..write('sortKey: $sortKey, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('retiredAt: $retiredAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $LocationsTable extends Locations with TableInfo<$LocationsTable, LocationRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LocationsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('local'),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, workspaceId, name, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'locations';
  @override
  VerificationContext validateIntegrity(Insertable<LocationRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    }
    if (data.containsKey('name')) {
      context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocationRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocationRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $LocationsTable createAlias(String alias) {
    return $LocationsTable(attachedDatabase, alias);
  }
}

class LocationRow extends DataClass implements Insertable<LocationRow> {
  final String id;
  final String workspaceId;
  final String name;
  final int createdAt;
  const LocationRow({required this.id, required this.workspaceId, required this.name, required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_id'] = Variable<String>(workspaceId);
    map['name'] = Variable<String>(name);
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  LocationsCompanion toCompanion(bool nullToAbsent) {
    return LocationsCompanion(
      id: Value(id),
      workspaceId: Value(workspaceId),
      name: Value(name),
      createdAt: Value(createdAt),
    );
  }

  factory LocationRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocationRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      name: serializer.fromJson<String>(json['name']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'name': serializer.toJson<String>(name),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  LocationRow copyWith({String? id, String? workspaceId, String? name, int? createdAt}) => LocationRow(
    id: id ?? this.id,
    workspaceId: workspaceId ?? this.workspaceId,
    name: name ?? this.name,
    createdAt: createdAt ?? this.createdAt,
  );
  LocationRow copyWithCompanion(LocationsCompanion data) {
    return LocationRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      name: data.name.present ? data.name.value : this.name,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocationRow(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('name: $name, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, workspaceId, name, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocationRow &&
          other.id == this.id &&
          other.workspaceId == this.workspaceId &&
          other.name == this.name &&
          other.createdAt == this.createdAt);
}

class LocationsCompanion extends UpdateCompanion<LocationRow> {
  final Value<String> id;
  final Value<String> workspaceId;
  final Value<String> name;
  final Value<int> createdAt;
  final Value<int> rowid;
  const LocationsCompanion({
    this.id = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.name = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LocationsCompanion.insert({
    required String id,
    this.workspaceId = const Value.absent(),
    required String name,
    required int createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       createdAt = Value(createdAt);
  static Insertable<LocationRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceId,
    Expression<String>? name,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (name != null) 'name': name,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LocationsCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceId,
    Value<String>? name,
    Value<int>? createdAt,
    Value<int>? rowid,
  }) {
    return LocationsCompanion(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      name: name ?? this.name,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LocationsCompanion(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('name: $name, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $FoldersTable extends Folders with TableInfo<$FoldersTable, FolderRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $FoldersTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('local'),
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _descriptionMeta = const VerificationMeta('description');
  @override
  late final GeneratedColumn<String> description = GeneratedColumn<String>(
    'description',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _iconMeta = const VerificationMeta('icon');
  @override
  late final GeneratedColumn<String> icon = GeneratedColumn<String>(
    'icon',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('🗂'),
  );
  static const VerificationMeta _colorMeta = const VerificationMeta('color');
  @override
  late final GeneratedColumn<String> color = GeneratedColumn<String>(
    'color',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('#007AFF'),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdByMeta = const VerificationMeta('createdBy');
  @override
  late final GeneratedColumn<String> createdBy = GeneratedColumn<String>(
    'created_by',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    workspaceId,
    name,
    description,
    icon,
    color,
    createdAt,
    createdBy,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'folders';
  @override
  VerificationContext validateIntegrity(Insertable<FolderRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    }
    if (data.containsKey('name')) {
      context.handle(_nameMeta, name.isAcceptableOrUnknown(data['name']!, _nameMeta));
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('description')) {
      context.handle(_descriptionMeta, description.isAcceptableOrUnknown(data['description']!, _descriptionMeta));
    }
    if (data.containsKey('icon')) {
      context.handle(_iconMeta, icon.isAcceptableOrUnknown(data['icon']!, _iconMeta));
    }
    if (data.containsKey('color')) {
      context.handle(_colorMeta, color.isAcceptableOrUnknown(data['color']!, _colorMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('created_by')) {
      context.handle(_createdByMeta, createdBy.isAcceptableOrUnknown(data['created_by']!, _createdByMeta));
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  FolderRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return FolderRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      name: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}name'])!,
      description: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}description'])!,
      icon: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}icon'])!,
      color: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}color'])!,
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
      createdBy: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}created_by']),
      updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $FoldersTable createAlias(String alias) {
    return $FoldersTable(attachedDatabase, alias);
  }
}

class FolderRow extends DataClass implements Insertable<FolderRow> {
  final String id;
  final String workspaceId;
  final String name;
  final String description;
  final String icon;
  final String color;
  final int createdAt;
  final String? createdBy;
  final int updatedAt;
  const FolderRow({
    required this.id,
    required this.workspaceId,
    required this.name,
    required this.description,
    required this.icon,
    required this.color,
    required this.createdAt,
    this.createdBy,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_id'] = Variable<String>(workspaceId);
    map['name'] = Variable<String>(name);
    map['description'] = Variable<String>(description);
    map['icon'] = Variable<String>(icon);
    map['color'] = Variable<String>(color);
    map['created_at'] = Variable<int>(createdAt);
    if (!nullToAbsent || createdBy != null) {
      map['created_by'] = Variable<String>(createdBy);
    }
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  FoldersCompanion toCompanion(bool nullToAbsent) {
    return FoldersCompanion(
      id: Value(id),
      workspaceId: Value(workspaceId),
      name: Value(name),
      description: Value(description),
      icon: Value(icon),
      color: Value(color),
      createdAt: Value(createdAt),
      createdBy: createdBy == null && nullToAbsent ? const Value.absent() : Value(createdBy),
      updatedAt: Value(updatedAt),
    );
  }

  factory FolderRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return FolderRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      name: serializer.fromJson<String>(json['name']),
      description: serializer.fromJson<String>(json['description']),
      icon: serializer.fromJson<String>(json['icon']),
      color: serializer.fromJson<String>(json['color']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      createdBy: serializer.fromJson<String?>(json['createdBy']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'name': serializer.toJson<String>(name),
      'description': serializer.toJson<String>(description),
      'icon': serializer.toJson<String>(icon),
      'color': serializer.toJson<String>(color),
      'createdAt': serializer.toJson<int>(createdAt),
      'createdBy': serializer.toJson<String?>(createdBy),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  FolderRow copyWith({
    String? id,
    String? workspaceId,
    String? name,
    String? description,
    String? icon,
    String? color,
    int? createdAt,
    Value<String?> createdBy = const Value.absent(),
    int? updatedAt,
  }) => FolderRow(
    id: id ?? this.id,
    workspaceId: workspaceId ?? this.workspaceId,
    name: name ?? this.name,
    description: description ?? this.description,
    icon: icon ?? this.icon,
    color: color ?? this.color,
    createdAt: createdAt ?? this.createdAt,
    createdBy: createdBy.present ? createdBy.value : this.createdBy,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  FolderRow copyWithCompanion(FoldersCompanion data) {
    return FolderRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      name: data.name.present ? data.name.value : this.name,
      description: data.description.present ? data.description.value : this.description,
      icon: data.icon.present ? data.icon.value : this.icon,
      color: data.color.present ? data.color.value : this.color,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      createdBy: data.createdBy.present ? data.createdBy.value : this.createdBy,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('FolderRow(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('name: $name, ')
          ..write('description: $description, ')
          ..write('icon: $icon, ')
          ..write('color: $color, ')
          ..write('createdAt: $createdAt, ')
          ..write('createdBy: $createdBy, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, workspaceId, name, description, icon, color, createdAt, createdBy, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is FolderRow &&
          other.id == this.id &&
          other.workspaceId == this.workspaceId &&
          other.name == this.name &&
          other.description == this.description &&
          other.icon == this.icon &&
          other.color == this.color &&
          other.createdAt == this.createdAt &&
          other.createdBy == this.createdBy &&
          other.updatedAt == this.updatedAt);
}

class FoldersCompanion extends UpdateCompanion<FolderRow> {
  final Value<String> id;
  final Value<String> workspaceId;
  final Value<String> name;
  final Value<String> description;
  final Value<String> icon;
  final Value<String> color;
  final Value<int> createdAt;
  final Value<String?> createdBy;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const FoldersCompanion({
    this.id = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.name = const Value.absent(),
    this.description = const Value.absent(),
    this.icon = const Value.absent(),
    this.color = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.createdBy = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  FoldersCompanion.insert({
    required String id,
    this.workspaceId = const Value.absent(),
    required String name,
    this.description = const Value.absent(),
    this.icon = const Value.absent(),
    this.color = const Value.absent(),
    required int createdAt,
    this.createdBy = const Value.absent(),
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<FolderRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceId,
    Expression<String>? name,
    Expression<String>? description,
    Expression<String>? icon,
    Expression<String>? color,
    Expression<int>? createdAt,
    Expression<String>? createdBy,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (icon != null) 'icon': icon,
      if (color != null) 'color': color,
      if (createdAt != null) 'created_at': createdAt,
      if (createdBy != null) 'created_by': createdBy,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  FoldersCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceId,
    Value<String>? name,
    Value<String>? description,
    Value<String>? icon,
    Value<String>? color,
    Value<int>? createdAt,
    Value<String?>? createdBy,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return FoldersCompanion(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      name: name ?? this.name,
      description: description ?? this.description,
      icon: icon ?? this.icon,
      color: color ?? this.color,
      createdAt: createdAt ?? this.createdAt,
      createdBy: createdBy ?? this.createdBy,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (description.present) {
      map['description'] = Variable<String>(description.value);
    }
    if (icon.present) {
      map['icon'] = Variable<String>(icon.value);
    }
    if (color.present) {
      map['color'] = Variable<String>(color.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (createdBy.present) {
      map['created_by'] = Variable<String>(createdBy.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('FoldersCompanion(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('name: $name, ')
          ..write('description: $description, ')
          ..write('icon: $icon, ')
          ..write('color: $color, ')
          ..write('createdAt: $createdAt, ')
          ..write('createdBy: $createdBy, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $MediaAssetsTable extends MediaAssets with TableInfo<$MediaAssetsTable, MediaAssetRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $MediaAssetsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('local'),
  );
  static const VerificationMeta _relativePathMeta = const VerificationMeta('relativePath');
  @override
  late final GeneratedColumn<String> relativePath = GeneratedColumn<String>(
    'relative_path',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _thumbnailPathMeta = const VerificationMeta('thumbnailPath');
  @override
  late final GeneratedColumn<String> thumbnailPath = GeneratedColumn<String>(
    'thumbnail_path',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _mimeTypeMeta = const VerificationMeta('mimeType');
  @override
  late final GeneratedColumn<String> mimeType = GeneratedColumn<String>(
    'mime_type',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _fileSizeMeta = const VerificationMeta('fileSize');
  @override
  late final GeneratedColumn<int> fileSize = GeneratedColumn<int>(
    'file_size',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _widthMeta = const VerificationMeta('width');
  @override
  late final GeneratedColumn<int> width = GeneratedColumn<int>(
    'width',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _heightMeta = const VerificationMeta('height');
  @override
  late final GeneratedColumn<int> height = GeneratedColumn<int>(
    'height',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _sha256Meta = const VerificationMeta('sha256');
  @override
  late final GeneratedColumn<String> sha256 = GeneratedColumn<String>(
    'sha256',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _originalFilenameMeta = const VerificationMeta('originalFilename');
  @override
  late final GeneratedColumn<String> originalFilename = GeneratedColumn<String>(
    'original_filename',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _refCountMeta = const VerificationMeta('refCount');
  @override
  late final GeneratedColumn<int> refCount = GeneratedColumn<int>(
    'ref_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _orphanedAtMeta = const VerificationMeta('orphanedAt');
  @override
  late final GeneratedColumn<int> orphanedAt = GeneratedColumn<int>(
    'orphaned_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    workspaceId,
    relativePath,
    thumbnailPath,
    mimeType,
    fileSize,
    width,
    height,
    sha256,
    originalFilename,
    refCount,
    orphanedAt,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'media_assets';
  @override
  VerificationContext validateIntegrity(Insertable<MediaAssetRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    }
    if (data.containsKey('relative_path')) {
      context.handle(_relativePathMeta, relativePath.isAcceptableOrUnknown(data['relative_path']!, _relativePathMeta));
    }
    if (data.containsKey('thumbnail_path')) {
      context.handle(
        _thumbnailPathMeta,
        thumbnailPath.isAcceptableOrUnknown(data['thumbnail_path']!, _thumbnailPathMeta),
      );
    }
    if (data.containsKey('mime_type')) {
      context.handle(_mimeTypeMeta, mimeType.isAcceptableOrUnknown(data['mime_type']!, _mimeTypeMeta));
    }
    if (data.containsKey('file_size')) {
      context.handle(_fileSizeMeta, fileSize.isAcceptableOrUnknown(data['file_size']!, _fileSizeMeta));
    }
    if (data.containsKey('width')) {
      context.handle(_widthMeta, width.isAcceptableOrUnknown(data['width']!, _widthMeta));
    }
    if (data.containsKey('height')) {
      context.handle(_heightMeta, height.isAcceptableOrUnknown(data['height']!, _heightMeta));
    }
    if (data.containsKey('sha256')) {
      context.handle(_sha256Meta, sha256.isAcceptableOrUnknown(data['sha256']!, _sha256Meta));
    }
    if (data.containsKey('original_filename')) {
      context.handle(
        _originalFilenameMeta,
        originalFilename.isAcceptableOrUnknown(data['original_filename']!, _originalFilenameMeta),
      );
    }
    if (data.containsKey('ref_count')) {
      context.handle(_refCountMeta, refCount.isAcceptableOrUnknown(data['ref_count']!, _refCountMeta));
    }
    if (data.containsKey('orphaned_at')) {
      context.handle(_orphanedAtMeta, orphanedAt.isAcceptableOrUnknown(data['orphaned_at']!, _orphanedAtMeta));
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  MediaAssetRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return MediaAssetRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      relativePath: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}relative_path']),
      thumbnailPath: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}thumbnail_path']),
      mimeType: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}mime_type']),
      fileSize: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}file_size']),
      width: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}width']),
      height: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}height']),
      sha256: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}sha256']),
      originalFilename: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}original_filename'],
      ),
      refCount: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}ref_count'])!,
      orphanedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}orphaned_at']),
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $MediaAssetsTable createAlias(String alias) {
    return $MediaAssetsTable(attachedDatabase, alias);
  }
}

class MediaAssetRow extends DataClass implements Insertable<MediaAssetRow> {
  final String id;
  final String workspaceId;
  final String? relativePath;
  final String? thumbnailPath;
  final String? mimeType;
  final int? fileSize;
  final int? width;
  final int? height;
  final String? sha256;
  final String? originalFilename;
  final int refCount;
  final int? orphanedAt;
  final int createdAt;
  const MediaAssetRow({
    required this.id,
    required this.workspaceId,
    this.relativePath,
    this.thumbnailPath,
    this.mimeType,
    this.fileSize,
    this.width,
    this.height,
    this.sha256,
    this.originalFilename,
    required this.refCount,
    this.orphanedAt,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_id'] = Variable<String>(workspaceId);
    if (!nullToAbsent || relativePath != null) {
      map['relative_path'] = Variable<String>(relativePath);
    }
    if (!nullToAbsent || thumbnailPath != null) {
      map['thumbnail_path'] = Variable<String>(thumbnailPath);
    }
    if (!nullToAbsent || mimeType != null) {
      map['mime_type'] = Variable<String>(mimeType);
    }
    if (!nullToAbsent || fileSize != null) {
      map['file_size'] = Variable<int>(fileSize);
    }
    if (!nullToAbsent || width != null) {
      map['width'] = Variable<int>(width);
    }
    if (!nullToAbsent || height != null) {
      map['height'] = Variable<int>(height);
    }
    if (!nullToAbsent || sha256 != null) {
      map['sha256'] = Variable<String>(sha256);
    }
    if (!nullToAbsent || originalFilename != null) {
      map['original_filename'] = Variable<String>(originalFilename);
    }
    map['ref_count'] = Variable<int>(refCount);
    if (!nullToAbsent || orphanedAt != null) {
      map['orphaned_at'] = Variable<int>(orphanedAt);
    }
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  MediaAssetsCompanion toCompanion(bool nullToAbsent) {
    return MediaAssetsCompanion(
      id: Value(id),
      workspaceId: Value(workspaceId),
      relativePath: relativePath == null && nullToAbsent ? const Value.absent() : Value(relativePath),
      thumbnailPath: thumbnailPath == null && nullToAbsent ? const Value.absent() : Value(thumbnailPath),
      mimeType: mimeType == null && nullToAbsent ? const Value.absent() : Value(mimeType),
      fileSize: fileSize == null && nullToAbsent ? const Value.absent() : Value(fileSize),
      width: width == null && nullToAbsent ? const Value.absent() : Value(width),
      height: height == null && nullToAbsent ? const Value.absent() : Value(height),
      sha256: sha256 == null && nullToAbsent ? const Value.absent() : Value(sha256),
      originalFilename: originalFilename == null && nullToAbsent ? const Value.absent() : Value(originalFilename),
      refCount: Value(refCount),
      orphanedAt: orphanedAt == null && nullToAbsent ? const Value.absent() : Value(orphanedAt),
      createdAt: Value(createdAt),
    );
  }

  factory MediaAssetRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return MediaAssetRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      relativePath: serializer.fromJson<String?>(json['relativePath']),
      thumbnailPath: serializer.fromJson<String?>(json['thumbnailPath']),
      mimeType: serializer.fromJson<String?>(json['mimeType']),
      fileSize: serializer.fromJson<int?>(json['fileSize']),
      width: serializer.fromJson<int?>(json['width']),
      height: serializer.fromJson<int?>(json['height']),
      sha256: serializer.fromJson<String?>(json['sha256']),
      originalFilename: serializer.fromJson<String?>(json['originalFilename']),
      refCount: serializer.fromJson<int>(json['refCount']),
      orphanedAt: serializer.fromJson<int?>(json['orphanedAt']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'relativePath': serializer.toJson<String?>(relativePath),
      'thumbnailPath': serializer.toJson<String?>(thumbnailPath),
      'mimeType': serializer.toJson<String?>(mimeType),
      'fileSize': serializer.toJson<int?>(fileSize),
      'width': serializer.toJson<int?>(width),
      'height': serializer.toJson<int?>(height),
      'sha256': serializer.toJson<String?>(sha256),
      'originalFilename': serializer.toJson<String?>(originalFilename),
      'refCount': serializer.toJson<int>(refCount),
      'orphanedAt': serializer.toJson<int?>(orphanedAt),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  MediaAssetRow copyWith({
    String? id,
    String? workspaceId,
    Value<String?> relativePath = const Value.absent(),
    Value<String?> thumbnailPath = const Value.absent(),
    Value<String?> mimeType = const Value.absent(),
    Value<int?> fileSize = const Value.absent(),
    Value<int?> width = const Value.absent(),
    Value<int?> height = const Value.absent(),
    Value<String?> sha256 = const Value.absent(),
    Value<String?> originalFilename = const Value.absent(),
    int? refCount,
    Value<int?> orphanedAt = const Value.absent(),
    int? createdAt,
  }) => MediaAssetRow(
    id: id ?? this.id,
    workspaceId: workspaceId ?? this.workspaceId,
    relativePath: relativePath.present ? relativePath.value : this.relativePath,
    thumbnailPath: thumbnailPath.present ? thumbnailPath.value : this.thumbnailPath,
    mimeType: mimeType.present ? mimeType.value : this.mimeType,
    fileSize: fileSize.present ? fileSize.value : this.fileSize,
    width: width.present ? width.value : this.width,
    height: height.present ? height.value : this.height,
    sha256: sha256.present ? sha256.value : this.sha256,
    originalFilename: originalFilename.present ? originalFilename.value : this.originalFilename,
    refCount: refCount ?? this.refCount,
    orphanedAt: orphanedAt.present ? orphanedAt.value : this.orphanedAt,
    createdAt: createdAt ?? this.createdAt,
  );
  MediaAssetRow copyWithCompanion(MediaAssetsCompanion data) {
    return MediaAssetRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      relativePath: data.relativePath.present ? data.relativePath.value : this.relativePath,
      thumbnailPath: data.thumbnailPath.present ? data.thumbnailPath.value : this.thumbnailPath,
      mimeType: data.mimeType.present ? data.mimeType.value : this.mimeType,
      fileSize: data.fileSize.present ? data.fileSize.value : this.fileSize,
      width: data.width.present ? data.width.value : this.width,
      height: data.height.present ? data.height.value : this.height,
      sha256: data.sha256.present ? data.sha256.value : this.sha256,
      originalFilename: data.originalFilename.present ? data.originalFilename.value : this.originalFilename,
      refCount: data.refCount.present ? data.refCount.value : this.refCount,
      orphanedAt: data.orphanedAt.present ? data.orphanedAt.value : this.orphanedAt,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('MediaAssetRow(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('relativePath: $relativePath, ')
          ..write('thumbnailPath: $thumbnailPath, ')
          ..write('mimeType: $mimeType, ')
          ..write('fileSize: $fileSize, ')
          ..write('width: $width, ')
          ..write('height: $height, ')
          ..write('sha256: $sha256, ')
          ..write('originalFilename: $originalFilename, ')
          ..write('refCount: $refCount, ')
          ..write('orphanedAt: $orphanedAt, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    workspaceId,
    relativePath,
    thumbnailPath,
    mimeType,
    fileSize,
    width,
    height,
    sha256,
    originalFilename,
    refCount,
    orphanedAt,
    createdAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MediaAssetRow &&
          other.id == this.id &&
          other.workspaceId == this.workspaceId &&
          other.relativePath == this.relativePath &&
          other.thumbnailPath == this.thumbnailPath &&
          other.mimeType == this.mimeType &&
          other.fileSize == this.fileSize &&
          other.width == this.width &&
          other.height == this.height &&
          other.sha256 == this.sha256 &&
          other.originalFilename == this.originalFilename &&
          other.refCount == this.refCount &&
          other.orphanedAt == this.orphanedAt &&
          other.createdAt == this.createdAt);
}

class MediaAssetsCompanion extends UpdateCompanion<MediaAssetRow> {
  final Value<String> id;
  final Value<String> workspaceId;
  final Value<String?> relativePath;
  final Value<String?> thumbnailPath;
  final Value<String?> mimeType;
  final Value<int?> fileSize;
  final Value<int?> width;
  final Value<int?> height;
  final Value<String?> sha256;
  final Value<String?> originalFilename;
  final Value<int> refCount;
  final Value<int?> orphanedAt;
  final Value<int> createdAt;
  final Value<int> rowid;
  const MediaAssetsCompanion({
    this.id = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.relativePath = const Value.absent(),
    this.thumbnailPath = const Value.absent(),
    this.mimeType = const Value.absent(),
    this.fileSize = const Value.absent(),
    this.width = const Value.absent(),
    this.height = const Value.absent(),
    this.sha256 = const Value.absent(),
    this.originalFilename = const Value.absent(),
    this.refCount = const Value.absent(),
    this.orphanedAt = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  MediaAssetsCompanion.insert({
    required String id,
    this.workspaceId = const Value.absent(),
    this.relativePath = const Value.absent(),
    this.thumbnailPath = const Value.absent(),
    this.mimeType = const Value.absent(),
    this.fileSize = const Value.absent(),
    this.width = const Value.absent(),
    this.height = const Value.absent(),
    this.sha256 = const Value.absent(),
    this.originalFilename = const Value.absent(),
    this.refCount = const Value.absent(),
    this.orphanedAt = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       createdAt = Value(createdAt);
  static Insertable<MediaAssetRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceId,
    Expression<String>? relativePath,
    Expression<String>? thumbnailPath,
    Expression<String>? mimeType,
    Expression<int>? fileSize,
    Expression<int>? width,
    Expression<int>? height,
    Expression<String>? sha256,
    Expression<String>? originalFilename,
    Expression<int>? refCount,
    Expression<int>? orphanedAt,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (relativePath != null) 'relative_path': relativePath,
      if (thumbnailPath != null) 'thumbnail_path': thumbnailPath,
      if (mimeType != null) 'mime_type': mimeType,
      if (fileSize != null) 'file_size': fileSize,
      if (width != null) 'width': width,
      if (height != null) 'height': height,
      if (sha256 != null) 'sha256': sha256,
      if (originalFilename != null) 'original_filename': originalFilename,
      if (refCount != null) 'ref_count': refCount,
      if (orphanedAt != null) 'orphaned_at': orphanedAt,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  MediaAssetsCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceId,
    Value<String?>? relativePath,
    Value<String?>? thumbnailPath,
    Value<String?>? mimeType,
    Value<int?>? fileSize,
    Value<int?>? width,
    Value<int?>? height,
    Value<String?>? sha256,
    Value<String?>? originalFilename,
    Value<int>? refCount,
    Value<int?>? orphanedAt,
    Value<int>? createdAt,
    Value<int>? rowid,
  }) {
    return MediaAssetsCompanion(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      relativePath: relativePath ?? this.relativePath,
      thumbnailPath: thumbnailPath ?? this.thumbnailPath,
      mimeType: mimeType ?? this.mimeType,
      fileSize: fileSize ?? this.fileSize,
      width: width ?? this.width,
      height: height ?? this.height,
      sha256: sha256 ?? this.sha256,
      originalFilename: originalFilename ?? this.originalFilename,
      refCount: refCount ?? this.refCount,
      orphanedAt: orphanedAt ?? this.orphanedAt,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (relativePath.present) {
      map['relative_path'] = Variable<String>(relativePath.value);
    }
    if (thumbnailPath.present) {
      map['thumbnail_path'] = Variable<String>(thumbnailPath.value);
    }
    if (mimeType.present) {
      map['mime_type'] = Variable<String>(mimeType.value);
    }
    if (fileSize.present) {
      map['file_size'] = Variable<int>(fileSize.value);
    }
    if (width.present) {
      map['width'] = Variable<int>(width.value);
    }
    if (height.present) {
      map['height'] = Variable<int>(height.value);
    }
    if (sha256.present) {
      map['sha256'] = Variable<String>(sha256.value);
    }
    if (originalFilename.present) {
      map['original_filename'] = Variable<String>(originalFilename.value);
    }
    if (refCount.present) {
      map['ref_count'] = Variable<int>(refCount.value);
    }
    if (orphanedAt.present) {
      map['orphaned_at'] = Variable<int>(orphanedAt.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('MediaAssetsCompanion(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('relativePath: $relativePath, ')
          ..write('thumbnailPath: $thumbnailPath, ')
          ..write('mimeType: $mimeType, ')
          ..write('fileSize: $fileSize, ')
          ..write('width: $width, ')
          ..write('height: $height, ')
          ..write('sha256: $sha256, ')
          ..write('originalFilename: $originalFilename, ')
          ..write('refCount: $refCount, ')
          ..write('orphanedAt: $orphanedAt, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ActivityTable extends Activity with TableInfo<$ActivityTable, ActivityRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ActivityTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('local'),
  );
  static const VerificationMeta _timestampMeta = const VerificationMeta('timestamp');
  @override
  late final GeneratedColumn<int> timestamp = GeneratedColumn<int>(
    'timestamp',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dataJsonMeta = const VerificationMeta('dataJson');
  @override
  late final GeneratedColumn<String> dataJson = GeneratedColumn<String>(
    'data_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('{}'),
  );
  @override
  List<GeneratedColumn> get $columns => [id, workspaceId, timestamp, kind, dataJson];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'activity';
  @override
  VerificationContext validateIntegrity(Insertable<ActivityRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    }
    if (data.containsKey('timestamp')) {
      context.handle(_timestampMeta, timestamp.isAcceptableOrUnknown(data['timestamp']!, _timestampMeta));
    } else if (isInserting) {
      context.missing(_timestampMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(_kindMeta, kind.isAcceptableOrUnknown(data['kind']!, _kindMeta));
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('data_json')) {
      context.handle(_dataJsonMeta, dataJson.isAcceptableOrUnknown(data['data_json']!, _dataJsonMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ActivityRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ActivityRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      timestamp: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}timestamp'])!,
      kind: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}kind'])!,
      dataJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}data_json'])!,
    );
  }

  @override
  $ActivityTable createAlias(String alias) {
    return $ActivityTable(attachedDatabase, alias);
  }
}

class ActivityRow extends DataClass implements Insertable<ActivityRow> {
  final String id;
  final String workspaceId;
  final int timestamp;
  final String kind;
  final String dataJson;
  const ActivityRow({
    required this.id,
    required this.workspaceId,
    required this.timestamp,
    required this.kind,
    required this.dataJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_id'] = Variable<String>(workspaceId);
    map['timestamp'] = Variable<int>(timestamp);
    map['kind'] = Variable<String>(kind);
    map['data_json'] = Variable<String>(dataJson);
    return map;
  }

  ActivityCompanion toCompanion(bool nullToAbsent) {
    return ActivityCompanion(
      id: Value(id),
      workspaceId: Value(workspaceId),
      timestamp: Value(timestamp),
      kind: Value(kind),
      dataJson: Value(dataJson),
    );
  }

  factory ActivityRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ActivityRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      timestamp: serializer.fromJson<int>(json['timestamp']),
      kind: serializer.fromJson<String>(json['kind']),
      dataJson: serializer.fromJson<String>(json['dataJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'timestamp': serializer.toJson<int>(timestamp),
      'kind': serializer.toJson<String>(kind),
      'dataJson': serializer.toJson<String>(dataJson),
    };
  }

  ActivityRow copyWith({String? id, String? workspaceId, int? timestamp, String? kind, String? dataJson}) =>
      ActivityRow(
        id: id ?? this.id,
        workspaceId: workspaceId ?? this.workspaceId,
        timestamp: timestamp ?? this.timestamp,
        kind: kind ?? this.kind,
        dataJson: dataJson ?? this.dataJson,
      );
  ActivityRow copyWithCompanion(ActivityCompanion data) {
    return ActivityRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      timestamp: data.timestamp.present ? data.timestamp.value : this.timestamp,
      kind: data.kind.present ? data.kind.value : this.kind,
      dataJson: data.dataJson.present ? data.dataJson.value : this.dataJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ActivityRow(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('timestamp: $timestamp, ')
          ..write('kind: $kind, ')
          ..write('dataJson: $dataJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, workspaceId, timestamp, kind, dataJson);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ActivityRow &&
          other.id == this.id &&
          other.workspaceId == this.workspaceId &&
          other.timestamp == this.timestamp &&
          other.kind == this.kind &&
          other.dataJson == this.dataJson);
}

class ActivityCompanion extends UpdateCompanion<ActivityRow> {
  final Value<String> id;
  final Value<String> workspaceId;
  final Value<int> timestamp;
  final Value<String> kind;
  final Value<String> dataJson;
  final Value<int> rowid;
  const ActivityCompanion({
    this.id = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.timestamp = const Value.absent(),
    this.kind = const Value.absent(),
    this.dataJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ActivityCompanion.insert({
    required String id,
    this.workspaceId = const Value.absent(),
    required int timestamp,
    required String kind,
    this.dataJson = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       timestamp = Value(timestamp),
       kind = Value(kind);
  static Insertable<ActivityRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceId,
    Expression<int>? timestamp,
    Expression<String>? kind,
    Expression<String>? dataJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (timestamp != null) 'timestamp': timestamp,
      if (kind != null) 'kind': kind,
      if (dataJson != null) 'data_json': dataJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ActivityCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceId,
    Value<int>? timestamp,
    Value<String>? kind,
    Value<String>? dataJson,
    Value<int>? rowid,
  }) {
    return ActivityCompanion(
      id: id ?? this.id,
      workspaceId: workspaceId ?? this.workspaceId,
      timestamp: timestamp ?? this.timestamp,
      kind: kind ?? this.kind,
      dataJson: dataJson ?? this.dataJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (timestamp.present) {
      map['timestamp'] = Variable<int>(timestamp.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (dataJson.present) {
      map['data_json'] = Variable<String>(dataJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ActivityCompanion(')
          ..write('id: $id, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('timestamp: $timestamp, ')
          ..write('kind: $kind, ')
          ..write('dataJson: $dataJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SettingsTable extends Settings with TableInfo<$SettingsTable, SettingRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SettingsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueJsonMeta = const VerificationMeta('valueJson');
  @override
  late final GeneratedColumn<String> valueJson = GeneratedColumn<String>(
    'value_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [key, valueJson];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'settings';
  @override
  VerificationContext validateIntegrity(Insertable<SettingRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(_keyMeta, key.isAcceptableOrUnknown(data['key']!, _keyMeta));
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('value_json')) {
      context.handle(_valueJsonMeta, valueJson.isAcceptableOrUnknown(data['value_json']!, _valueJsonMeta));
    } else if (isInserting) {
      context.missing(_valueJsonMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  SettingRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SettingRow(
      key: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}key'])!,
      valueJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}value_json'])!,
    );
  }

  @override
  $SettingsTable createAlias(String alias) {
    return $SettingsTable(attachedDatabase, alias);
  }
}

class SettingRow extends DataClass implements Insertable<SettingRow> {
  final String key;
  final String valueJson;
  const SettingRow({required this.key, required this.valueJson});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['value_json'] = Variable<String>(valueJson);
    return map;
  }

  SettingsCompanion toCompanion(bool nullToAbsent) {
    return SettingsCompanion(key: Value(key), valueJson: Value(valueJson));
  }

  factory SettingRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SettingRow(
      key: serializer.fromJson<String>(json['key']),
      valueJson: serializer.fromJson<String>(json['valueJson']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{'key': serializer.toJson<String>(key), 'valueJson': serializer.toJson<String>(valueJson)};
  }

  SettingRow copyWith({String? key, String? valueJson}) =>
      SettingRow(key: key ?? this.key, valueJson: valueJson ?? this.valueJson);
  SettingRow copyWithCompanion(SettingsCompanion data) {
    return SettingRow(
      key: data.key.present ? data.key.value : this.key,
      valueJson: data.valueJson.present ? data.valueJson.value : this.valueJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SettingRow(')
          ..write('key: $key, ')
          ..write('valueJson: $valueJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, valueJson);
  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is SettingRow && other.key == this.key && other.valueJson == this.valueJson);
}

class SettingsCompanion extends UpdateCompanion<SettingRow> {
  final Value<String> key;
  final Value<String> valueJson;
  final Value<int> rowid;
  const SettingsCompanion({
    this.key = const Value.absent(),
    this.valueJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SettingsCompanion.insert({required String key, required String valueJson, this.rowid = const Value.absent()})
    : key = Value(key),
      valueJson = Value(valueJson);
  static Insertable<SettingRow> custom({
    Expression<String>? key,
    Expression<String>? valueJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (valueJson != null) 'value_json': valueJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SettingsCompanion copyWith({Value<String>? key, Value<String>? valueJson, Value<int>? rowid}) {
    return SettingsCompanion(key: key ?? this.key, valueJson: valueJson ?? this.valueJson, rowid: rowid ?? this.rowid);
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (valueJson.present) {
      map['value_json'] = Variable<String>(valueJson.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SettingsCompanion(')
          ..write('key: $key, ')
          ..write('valueJson: $valueJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $AggregatesTable extends Aggregates with TableInfo<$AggregatesTable, AggregateRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $AggregatesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _keyMeta = const VerificationMeta('key');
  @override
  late final GeneratedColumn<String> key = GeneratedColumn<String>(
    'key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _schemaMeta = const VerificationMeta('schema');
  @override
  late final GeneratedColumn<int> schema = GeneratedColumn<int>(
    'schema',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dataJsonMeta = const VerificationMeta('dataJson');
  @override
  late final GeneratedColumn<String> dataJson = GeneratedColumn<String>(
    'data_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _builtAtMeta = const VerificationMeta('builtAt');
  @override
  late final GeneratedColumn<int> builtAt = GeneratedColumn<int>(
    'built_at',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [key, schema, dataJson, builtAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'aggregates';
  @override
  VerificationContext validateIntegrity(Insertable<AggregateRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('key')) {
      context.handle(_keyMeta, key.isAcceptableOrUnknown(data['key']!, _keyMeta));
    } else if (isInserting) {
      context.missing(_keyMeta);
    }
    if (data.containsKey('schema')) {
      context.handle(_schemaMeta, schema.isAcceptableOrUnknown(data['schema']!, _schemaMeta));
    } else if (isInserting) {
      context.missing(_schemaMeta);
    }
    if (data.containsKey('data_json')) {
      context.handle(_dataJsonMeta, dataJson.isAcceptableOrUnknown(data['data_json']!, _dataJsonMeta));
    } else if (isInserting) {
      context.missing(_dataJsonMeta);
    }
    if (data.containsKey('built_at')) {
      context.handle(_builtAtMeta, builtAt.isAcceptableOrUnknown(data['built_at']!, _builtAtMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {key};
  @override
  AggregateRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return AggregateRow(
      key: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}key'])!,
      schema: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}schema'])!,
      dataJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}data_json'])!,
      builtAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}built_at']),
    );
  }

  @override
  $AggregatesTable createAlias(String alias) {
    return $AggregatesTable(attachedDatabase, alias);
  }
}

class AggregateRow extends DataClass implements Insertable<AggregateRow> {
  final String key;
  final int schema;
  final String dataJson;
  final int? builtAt;
  const AggregateRow({required this.key, required this.schema, required this.dataJson, this.builtAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['key'] = Variable<String>(key);
    map['schema'] = Variable<int>(schema);
    map['data_json'] = Variable<String>(dataJson);
    if (!nullToAbsent || builtAt != null) {
      map['built_at'] = Variable<int>(builtAt);
    }
    return map;
  }

  AggregatesCompanion toCompanion(bool nullToAbsent) {
    return AggregatesCompanion(
      key: Value(key),
      schema: Value(schema),
      dataJson: Value(dataJson),
      builtAt: builtAt == null && nullToAbsent ? const Value.absent() : Value(builtAt),
    );
  }

  factory AggregateRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return AggregateRow(
      key: serializer.fromJson<String>(json['key']),
      schema: serializer.fromJson<int>(json['schema']),
      dataJson: serializer.fromJson<String>(json['dataJson']),
      builtAt: serializer.fromJson<int?>(json['builtAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'key': serializer.toJson<String>(key),
      'schema': serializer.toJson<int>(schema),
      'dataJson': serializer.toJson<String>(dataJson),
      'builtAt': serializer.toJson<int?>(builtAt),
    };
  }

  AggregateRow copyWith({String? key, int? schema, String? dataJson, Value<int?> builtAt = const Value.absent()}) =>
      AggregateRow(
        key: key ?? this.key,
        schema: schema ?? this.schema,
        dataJson: dataJson ?? this.dataJson,
        builtAt: builtAt.present ? builtAt.value : this.builtAt,
      );
  AggregateRow copyWithCompanion(AggregatesCompanion data) {
    return AggregateRow(
      key: data.key.present ? data.key.value : this.key,
      schema: data.schema.present ? data.schema.value : this.schema,
      dataJson: data.dataJson.present ? data.dataJson.value : this.dataJson,
      builtAt: data.builtAt.present ? data.builtAt.value : this.builtAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('AggregateRow(')
          ..write('key: $key, ')
          ..write('schema: $schema, ')
          ..write('dataJson: $dataJson, ')
          ..write('builtAt: $builtAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(key, schema, dataJson, builtAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is AggregateRow &&
          other.key == this.key &&
          other.schema == this.schema &&
          other.dataJson == this.dataJson &&
          other.builtAt == this.builtAt);
}

class AggregatesCompanion extends UpdateCompanion<AggregateRow> {
  final Value<String> key;
  final Value<int> schema;
  final Value<String> dataJson;
  final Value<int?> builtAt;
  final Value<int> rowid;
  const AggregatesCompanion({
    this.key = const Value.absent(),
    this.schema = const Value.absent(),
    this.dataJson = const Value.absent(),
    this.builtAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  AggregatesCompanion.insert({
    required String key,
    required int schema,
    required String dataJson,
    this.builtAt = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : key = Value(key),
       schema = Value(schema),
       dataJson = Value(dataJson);
  static Insertable<AggregateRow> custom({
    Expression<String>? key,
    Expression<int>? schema,
    Expression<String>? dataJson,
    Expression<int>? builtAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (key != null) 'key': key,
      if (schema != null) 'schema': schema,
      if (dataJson != null) 'data_json': dataJson,
      if (builtAt != null) 'built_at': builtAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  AggregatesCompanion copyWith({
    Value<String>? key,
    Value<int>? schema,
    Value<String>? dataJson,
    Value<int?>? builtAt,
    Value<int>? rowid,
  }) {
    return AggregatesCompanion(
      key: key ?? this.key,
      schema: schema ?? this.schema,
      dataJson: dataJson ?? this.dataJson,
      builtAt: builtAt ?? this.builtAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (key.present) {
      map['key'] = Variable<String>(key.value);
    }
    if (schema.present) {
      map['schema'] = Variable<int>(schema.value);
    }
    if (dataJson.present) {
      map['data_json'] = Variable<String>(dataJson.value);
    }
    if (builtAt.present) {
      map['built_at'] = Variable<int>(builtAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('AggregatesCompanion(')
          ..write('key: $key, ')
          ..write('schema: $schema, ')
          ..write('dataJson: $dataJson, ')
          ..write('builtAt: $builtAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $PendingMutationsTable extends PendingMutations with TableInfo<$PendingMutationsTable, PendingMutationRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $PendingMutationsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _mutationIdMeta = const VerificationMeta('mutationId');
  @override
  late final GeneratedColumn<String> mutationId = GeneratedColumn<String>(
    'mutation_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceIdMeta = const VerificationMeta('workspaceId');
  @override
  late final GeneratedColumn<String> workspaceId = GeneratedColumn<String>(
    'workspace_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityTypeMeta = const VerificationMeta('entityType');
  @override
  late final GeneratedColumn<String> entityType = GeneratedColumn<String>(
    'entity_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityIdMeta = const VerificationMeta('entityId');
  @override
  late final GeneratedColumn<String> entityId = GeneratedColumn<String>(
    'entity_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _operationMeta = const VerificationMeta('operation');
  @override
  late final GeneratedColumn<String> operation = GeneratedColumn<String>(
    'operation',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _baseVersionMeta = const VerificationMeta('baseVersion');
  @override
  late final GeneratedColumn<int> baseVersion = GeneratedColumn<int>(
    'base_version',
    aliasedName,
    true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _payloadJsonMeta = const VerificationMeta('payloadJson');
  @override
  late final GeneratedColumn<String> payloadJson = GeneratedColumn<String>(
    'payload_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _attemptCountMeta = const VerificationMeta('attemptCount');
  @override
  late final GeneratedColumn<int> attemptCount = GeneratedColumn<int>(
    'attempt_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _lastErrorMeta = const VerificationMeta('lastError');
  @override
  late final GeneratedColumn<String> lastError = GeneratedColumn<String>(
    'last_error',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    mutationId,
    workspaceId,
    entityType,
    entityId,
    operation,
    baseVersion,
    payloadJson,
    createdAt,
    attemptCount,
    lastError,
    status,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'pending_mutations';
  @override
  VerificationContext validateIntegrity(Insertable<PendingMutationRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('mutation_id')) {
      context.handle(_mutationIdMeta, mutationId.isAcceptableOrUnknown(data['mutation_id']!, _mutationIdMeta));
    } else if (isInserting) {
      context.missing(_mutationIdMeta);
    }
    if (data.containsKey('workspace_id')) {
      context.handle(_workspaceIdMeta, workspaceId.isAcceptableOrUnknown(data['workspace_id']!, _workspaceIdMeta));
    } else if (isInserting) {
      context.missing(_workspaceIdMeta);
    }
    if (data.containsKey('entity_type')) {
      context.handle(_entityTypeMeta, entityType.isAcceptableOrUnknown(data['entity_type']!, _entityTypeMeta));
    } else if (isInserting) {
      context.missing(_entityTypeMeta);
    }
    if (data.containsKey('entity_id')) {
      context.handle(_entityIdMeta, entityId.isAcceptableOrUnknown(data['entity_id']!, _entityIdMeta));
    } else if (isInserting) {
      context.missing(_entityIdMeta);
    }
    if (data.containsKey('operation')) {
      context.handle(_operationMeta, operation.isAcceptableOrUnknown(data['operation']!, _operationMeta));
    } else if (isInserting) {
      context.missing(_operationMeta);
    }
    if (data.containsKey('base_version')) {
      context.handle(_baseVersionMeta, baseVersion.isAcceptableOrUnknown(data['base_version']!, _baseVersionMeta));
    }
    if (data.containsKey('payload_json')) {
      context.handle(_payloadJsonMeta, payloadJson.isAcceptableOrUnknown(data['payload_json']!, _payloadJsonMeta));
    } else if (isInserting) {
      context.missing(_payloadJsonMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('attempt_count')) {
      context.handle(_attemptCountMeta, attemptCount.isAcceptableOrUnknown(data['attempt_count']!, _attemptCountMeta));
    }
    if (data.containsKey('last_error')) {
      context.handle(_lastErrorMeta, lastError.isAcceptableOrUnknown(data['last_error']!, _lastErrorMeta));
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {mutationId};
  @override
  PendingMutationRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return PendingMutationRow(
      mutationId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}mutation_id'])!,
      workspaceId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}workspace_id'])!,
      entityType: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}entity_type'])!,
      entityId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}entity_id'])!,
      operation: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}operation'])!,
      baseVersion: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}base_version']),
      payloadJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}payload_json'])!,
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
      attemptCount: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}attempt_count'])!,
      lastError: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}last_error']),
      status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status'])!,
    );
  }

  @override
  $PendingMutationsTable createAlias(String alias) {
    return $PendingMutationsTable(attachedDatabase, alias);
  }
}

class PendingMutationRow extends DataClass implements Insertable<PendingMutationRow> {
  final String mutationId;
  final String workspaceId;
  final String entityType;
  final String entityId;
  final String operation;
  final int? baseVersion;
  final String payloadJson;
  final int createdAt;
  final int attemptCount;
  final String? lastError;
  final String status;
  const PendingMutationRow({
    required this.mutationId,
    required this.workspaceId,
    required this.entityType,
    required this.entityId,
    required this.operation,
    this.baseVersion,
    required this.payloadJson,
    required this.createdAt,
    required this.attemptCount,
    this.lastError,
    required this.status,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['mutation_id'] = Variable<String>(mutationId);
    map['workspace_id'] = Variable<String>(workspaceId);
    map['entity_type'] = Variable<String>(entityType);
    map['entity_id'] = Variable<String>(entityId);
    map['operation'] = Variable<String>(operation);
    if (!nullToAbsent || baseVersion != null) {
      map['base_version'] = Variable<int>(baseVersion);
    }
    map['payload_json'] = Variable<String>(payloadJson);
    map['created_at'] = Variable<int>(createdAt);
    map['attempt_count'] = Variable<int>(attemptCount);
    if (!nullToAbsent || lastError != null) {
      map['last_error'] = Variable<String>(lastError);
    }
    map['status'] = Variable<String>(status);
    return map;
  }

  PendingMutationsCompanion toCompanion(bool nullToAbsent) {
    return PendingMutationsCompanion(
      mutationId: Value(mutationId),
      workspaceId: Value(workspaceId),
      entityType: Value(entityType),
      entityId: Value(entityId),
      operation: Value(operation),
      baseVersion: baseVersion == null && nullToAbsent ? const Value.absent() : Value(baseVersion),
      payloadJson: Value(payloadJson),
      createdAt: Value(createdAt),
      attemptCount: Value(attemptCount),
      lastError: lastError == null && nullToAbsent ? const Value.absent() : Value(lastError),
      status: Value(status),
    );
  }

  factory PendingMutationRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return PendingMutationRow(
      mutationId: serializer.fromJson<String>(json['mutationId']),
      workspaceId: serializer.fromJson<String>(json['workspaceId']),
      entityType: serializer.fromJson<String>(json['entityType']),
      entityId: serializer.fromJson<String>(json['entityId']),
      operation: serializer.fromJson<String>(json['operation']),
      baseVersion: serializer.fromJson<int?>(json['baseVersion']),
      payloadJson: serializer.fromJson<String>(json['payloadJson']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      attemptCount: serializer.fromJson<int>(json['attemptCount']),
      lastError: serializer.fromJson<String?>(json['lastError']),
      status: serializer.fromJson<String>(json['status']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'mutationId': serializer.toJson<String>(mutationId),
      'workspaceId': serializer.toJson<String>(workspaceId),
      'entityType': serializer.toJson<String>(entityType),
      'entityId': serializer.toJson<String>(entityId),
      'operation': serializer.toJson<String>(operation),
      'baseVersion': serializer.toJson<int?>(baseVersion),
      'payloadJson': serializer.toJson<String>(payloadJson),
      'createdAt': serializer.toJson<int>(createdAt),
      'attemptCount': serializer.toJson<int>(attemptCount),
      'lastError': serializer.toJson<String?>(lastError),
      'status': serializer.toJson<String>(status),
    };
  }

  PendingMutationRow copyWith({
    String? mutationId,
    String? workspaceId,
    String? entityType,
    String? entityId,
    String? operation,
    Value<int?> baseVersion = const Value.absent(),
    String? payloadJson,
    int? createdAt,
    int? attemptCount,
    Value<String?> lastError = const Value.absent(),
    String? status,
  }) => PendingMutationRow(
    mutationId: mutationId ?? this.mutationId,
    workspaceId: workspaceId ?? this.workspaceId,
    entityType: entityType ?? this.entityType,
    entityId: entityId ?? this.entityId,
    operation: operation ?? this.operation,
    baseVersion: baseVersion.present ? baseVersion.value : this.baseVersion,
    payloadJson: payloadJson ?? this.payloadJson,
    createdAt: createdAt ?? this.createdAt,
    attemptCount: attemptCount ?? this.attemptCount,
    lastError: lastError.present ? lastError.value : this.lastError,
    status: status ?? this.status,
  );
  PendingMutationRow copyWithCompanion(PendingMutationsCompanion data) {
    return PendingMutationRow(
      mutationId: data.mutationId.present ? data.mutationId.value : this.mutationId,
      workspaceId: data.workspaceId.present ? data.workspaceId.value : this.workspaceId,
      entityType: data.entityType.present ? data.entityType.value : this.entityType,
      entityId: data.entityId.present ? data.entityId.value : this.entityId,
      operation: data.operation.present ? data.operation.value : this.operation,
      baseVersion: data.baseVersion.present ? data.baseVersion.value : this.baseVersion,
      payloadJson: data.payloadJson.present ? data.payloadJson.value : this.payloadJson,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      attemptCount: data.attemptCount.present ? data.attemptCount.value : this.attemptCount,
      lastError: data.lastError.present ? data.lastError.value : this.lastError,
      status: data.status.present ? data.status.value : this.status,
    );
  }

  @override
  String toString() {
    return (StringBuffer('PendingMutationRow(')
          ..write('mutationId: $mutationId, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('entityType: $entityType, ')
          ..write('entityId: $entityId, ')
          ..write('operation: $operation, ')
          ..write('baseVersion: $baseVersion, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('attemptCount: $attemptCount, ')
          ..write('lastError: $lastError, ')
          ..write('status: $status')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    mutationId,
    workspaceId,
    entityType,
    entityId,
    operation,
    baseVersion,
    payloadJson,
    createdAt,
    attemptCount,
    lastError,
    status,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PendingMutationRow &&
          other.mutationId == this.mutationId &&
          other.workspaceId == this.workspaceId &&
          other.entityType == this.entityType &&
          other.entityId == this.entityId &&
          other.operation == this.operation &&
          other.baseVersion == this.baseVersion &&
          other.payloadJson == this.payloadJson &&
          other.createdAt == this.createdAt &&
          other.attemptCount == this.attemptCount &&
          other.lastError == this.lastError &&
          other.status == this.status);
}

class PendingMutationsCompanion extends UpdateCompanion<PendingMutationRow> {
  final Value<String> mutationId;
  final Value<String> workspaceId;
  final Value<String> entityType;
  final Value<String> entityId;
  final Value<String> operation;
  final Value<int?> baseVersion;
  final Value<String> payloadJson;
  final Value<int> createdAt;
  final Value<int> attemptCount;
  final Value<String?> lastError;
  final Value<String> status;
  final Value<int> rowid;
  const PendingMutationsCompanion({
    this.mutationId = const Value.absent(),
    this.workspaceId = const Value.absent(),
    this.entityType = const Value.absent(),
    this.entityId = const Value.absent(),
    this.operation = const Value.absent(),
    this.baseVersion = const Value.absent(),
    this.payloadJson = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.attemptCount = const Value.absent(),
    this.lastError = const Value.absent(),
    this.status = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  PendingMutationsCompanion.insert({
    required String mutationId,
    required String workspaceId,
    required String entityType,
    required String entityId,
    required String operation,
    this.baseVersion = const Value.absent(),
    required String payloadJson,
    required int createdAt,
    this.attemptCount = const Value.absent(),
    this.lastError = const Value.absent(),
    required String status,
    this.rowid = const Value.absent(),
  }) : mutationId = Value(mutationId),
       workspaceId = Value(workspaceId),
       entityType = Value(entityType),
       entityId = Value(entityId),
       operation = Value(operation),
       payloadJson = Value(payloadJson),
       createdAt = Value(createdAt),
       status = Value(status);
  static Insertable<PendingMutationRow> custom({
    Expression<String>? mutationId,
    Expression<String>? workspaceId,
    Expression<String>? entityType,
    Expression<String>? entityId,
    Expression<String>? operation,
    Expression<int>? baseVersion,
    Expression<String>? payloadJson,
    Expression<int>? createdAt,
    Expression<int>? attemptCount,
    Expression<String>? lastError,
    Expression<String>? status,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (mutationId != null) 'mutation_id': mutationId,
      if (workspaceId != null) 'workspace_id': workspaceId,
      if (entityType != null) 'entity_type': entityType,
      if (entityId != null) 'entity_id': entityId,
      if (operation != null) 'operation': operation,
      if (baseVersion != null) 'base_version': baseVersion,
      if (payloadJson != null) 'payload_json': payloadJson,
      if (createdAt != null) 'created_at': createdAt,
      if (attemptCount != null) 'attempt_count': attemptCount,
      if (lastError != null) 'last_error': lastError,
      if (status != null) 'status': status,
      if (rowid != null) 'rowid': rowid,
    });
  }

  PendingMutationsCompanion copyWith({
    Value<String>? mutationId,
    Value<String>? workspaceId,
    Value<String>? entityType,
    Value<String>? entityId,
    Value<String>? operation,
    Value<int?>? baseVersion,
    Value<String>? payloadJson,
    Value<int>? createdAt,
    Value<int>? attemptCount,
    Value<String?>? lastError,
    Value<String>? status,
    Value<int>? rowid,
  }) {
    return PendingMutationsCompanion(
      mutationId: mutationId ?? this.mutationId,
      workspaceId: workspaceId ?? this.workspaceId,
      entityType: entityType ?? this.entityType,
      entityId: entityId ?? this.entityId,
      operation: operation ?? this.operation,
      baseVersion: baseVersion ?? this.baseVersion,
      payloadJson: payloadJson ?? this.payloadJson,
      createdAt: createdAt ?? this.createdAt,
      attemptCount: attemptCount ?? this.attemptCount,
      lastError: lastError ?? this.lastError,
      status: status ?? this.status,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (mutationId.present) {
      map['mutation_id'] = Variable<String>(mutationId.value);
    }
    if (workspaceId.present) {
      map['workspace_id'] = Variable<String>(workspaceId.value);
    }
    if (entityType.present) {
      map['entity_type'] = Variable<String>(entityType.value);
    }
    if (entityId.present) {
      map['entity_id'] = Variable<String>(entityId.value);
    }
    if (operation.present) {
      map['operation'] = Variable<String>(operation.value);
    }
    if (baseVersion.present) {
      map['base_version'] = Variable<int>(baseVersion.value);
    }
    if (payloadJson.present) {
      map['payload_json'] = Variable<String>(payloadJson.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (attemptCount.present) {
      map['attempt_count'] = Variable<int>(attemptCount.value);
    }
    if (lastError.present) {
      map['last_error'] = Variable<String>(lastError.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('PendingMutationsCompanion(')
          ..write('mutationId: $mutationId, ')
          ..write('workspaceId: $workspaceId, ')
          ..write('entityType: $entityType, ')
          ..write('entityId: $entityId, ')
          ..write('operation: $operation, ')
          ..write('baseVersion: $baseVersion, ')
          ..write('payloadJson: $payloadJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('attemptCount: $attemptCount, ')
          ..write('lastError: $lastError, ')
          ..write('status: $status, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RestoreJobsTable extends RestoreJobs with TableInfo<$RestoreJobsTable, RestoreJobRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RestoreJobsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _restoreKeyMeta = const VerificationMeta('restoreKey');
  @override
  late final GeneratedColumn<String> restoreKey = GeneratedColumn<String>(
    'restore_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _stateJsonMeta = const VerificationMeta('stateJson');
  @override
  late final GeneratedColumn<String> stateJson = GeneratedColumn<String>(
    'state_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _startedAtMeta = const VerificationMeta('startedAt');
  @override
  late final GeneratedColumn<int> startedAt = GeneratedColumn<int>(
    'started_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, restoreKey, status, stateJson, startedAt, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'restore_jobs';
  @override
  VerificationContext validateIntegrity(Insertable<RestoreJobRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('restore_key')) {
      context.handle(_restoreKeyMeta, restoreKey.isAcceptableOrUnknown(data['restore_key']!, _restoreKeyMeta));
    } else if (isInserting) {
      context.missing(_restoreKeyMeta);
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('state_json')) {
      context.handle(_stateJsonMeta, stateJson.isAcceptableOrUnknown(data['state_json']!, _stateJsonMeta));
    } else if (isInserting) {
      context.missing(_stateJsonMeta);
    }
    if (data.containsKey('started_at')) {
      context.handle(_startedAtMeta, startedAt.isAcceptableOrUnknown(data['started_at']!, _startedAtMeta));
    } else if (isInserting) {
      context.missing(_startedAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  RestoreJobRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RestoreJobRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      restoreKey: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}restore_key'])!,
      status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      stateJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}state_json'])!,
      startedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}started_at'])!,
      updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $RestoreJobsTable createAlias(String alias) {
    return $RestoreJobsTable(attachedDatabase, alias);
  }
}

class RestoreJobRow extends DataClass implements Insertable<RestoreJobRow> {
  final String id;
  final String restoreKey;
  final String status;
  final String stateJson;
  final int startedAt;
  final int updatedAt;
  const RestoreJobRow({
    required this.id,
    required this.restoreKey,
    required this.status,
    required this.stateJson,
    required this.startedAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['restore_key'] = Variable<String>(restoreKey);
    map['status'] = Variable<String>(status);
    map['state_json'] = Variable<String>(stateJson);
    map['started_at'] = Variable<int>(startedAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  RestoreJobsCompanion toCompanion(bool nullToAbsent) {
    return RestoreJobsCompanion(
      id: Value(id),
      restoreKey: Value(restoreKey),
      status: Value(status),
      stateJson: Value(stateJson),
      startedAt: Value(startedAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory RestoreJobRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RestoreJobRow(
      id: serializer.fromJson<String>(json['id']),
      restoreKey: serializer.fromJson<String>(json['restoreKey']),
      status: serializer.fromJson<String>(json['status']),
      stateJson: serializer.fromJson<String>(json['stateJson']),
      startedAt: serializer.fromJson<int>(json['startedAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'restoreKey': serializer.toJson<String>(restoreKey),
      'status': serializer.toJson<String>(status),
      'stateJson': serializer.toJson<String>(stateJson),
      'startedAt': serializer.toJson<int>(startedAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  RestoreJobRow copyWith({
    String? id,
    String? restoreKey,
    String? status,
    String? stateJson,
    int? startedAt,
    int? updatedAt,
  }) => RestoreJobRow(
    id: id ?? this.id,
    restoreKey: restoreKey ?? this.restoreKey,
    status: status ?? this.status,
    stateJson: stateJson ?? this.stateJson,
    startedAt: startedAt ?? this.startedAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  RestoreJobRow copyWithCompanion(RestoreJobsCompanion data) {
    return RestoreJobRow(
      id: data.id.present ? data.id.value : this.id,
      restoreKey: data.restoreKey.present ? data.restoreKey.value : this.restoreKey,
      status: data.status.present ? data.status.value : this.status,
      stateJson: data.stateJson.present ? data.stateJson.value : this.stateJson,
      startedAt: data.startedAt.present ? data.startedAt.value : this.startedAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RestoreJobRow(')
          ..write('id: $id, ')
          ..write('restoreKey: $restoreKey, ')
          ..write('status: $status, ')
          ..write('stateJson: $stateJson, ')
          ..write('startedAt: $startedAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, restoreKey, status, stateJson, startedAt, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RestoreJobRow &&
          other.id == this.id &&
          other.restoreKey == this.restoreKey &&
          other.status == this.status &&
          other.stateJson == this.stateJson &&
          other.startedAt == this.startedAt &&
          other.updatedAt == this.updatedAt);
}

class RestoreJobsCompanion extends UpdateCompanion<RestoreJobRow> {
  final Value<String> id;
  final Value<String> restoreKey;
  final Value<String> status;
  final Value<String> stateJson;
  final Value<int> startedAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const RestoreJobsCompanion({
    this.id = const Value.absent(),
    this.restoreKey = const Value.absent(),
    this.status = const Value.absent(),
    this.stateJson = const Value.absent(),
    this.startedAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  RestoreJobsCompanion.insert({
    required String id,
    required String restoreKey,
    required String status,
    required String stateJson,
    required int startedAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       restoreKey = Value(restoreKey),
       status = Value(status),
       stateJson = Value(stateJson),
       startedAt = Value(startedAt),
       updatedAt = Value(updatedAt);
  static Insertable<RestoreJobRow> custom({
    Expression<String>? id,
    Expression<String>? restoreKey,
    Expression<String>? status,
    Expression<String>? stateJson,
    Expression<int>? startedAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (restoreKey != null) 'restore_key': restoreKey,
      if (status != null) 'status': status,
      if (stateJson != null) 'state_json': stateJson,
      if (startedAt != null) 'started_at': startedAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  RestoreJobsCompanion copyWith({
    Value<String>? id,
    Value<String>? restoreKey,
    Value<String>? status,
    Value<String>? stateJson,
    Value<int>? startedAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return RestoreJobsCompanion(
      id: id ?? this.id,
      restoreKey: restoreKey ?? this.restoreKey,
      status: status ?? this.status,
      stateJson: stateJson ?? this.stateJson,
      startedAt: startedAt ?? this.startedAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (restoreKey.present) {
      map['restore_key'] = Variable<String>(restoreKey.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (stateJson.present) {
      map['state_json'] = Variable<String>(stateJson.value);
    }
    if (startedAt.present) {
      map['started_at'] = Variable<int>(startedAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RestoreJobsCompanion(')
          ..write('id: $id, ')
          ..write('restoreKey: $restoreKey, ')
          ..write('status: $status, ')
          ..write('stateJson: $stateJson, ')
          ..write('startedAt: $startedAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $RestoreIndexTable extends RestoreIndex with TableInfo<$RestoreIndexTable, RestoreIndexRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $RestoreIndexTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _jobMeta = const VerificationMeta('job');
  @override
  late final GeneratedColumn<String> job = GeneratedColumn<String>(
    'job',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _collectionMeta = const VerificationMeta('collection');
  @override
  late final GeneratedColumn<String> collection = GeneratedColumn<String>(
    'collection',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entryIdMeta = const VerificationMeta('entryId');
  @override
  late final GeneratedColumn<String> entryId = GeneratedColumn<String>(
    'entry_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [job, collection, entryId];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'restore_index';
  @override
  VerificationContext validateIntegrity(Insertable<RestoreIndexRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('job')) {
      context.handle(_jobMeta, job.isAcceptableOrUnknown(data['job']!, _jobMeta));
    } else if (isInserting) {
      context.missing(_jobMeta);
    }
    if (data.containsKey('collection')) {
      context.handle(_collectionMeta, collection.isAcceptableOrUnknown(data['collection']!, _collectionMeta));
    } else if (isInserting) {
      context.missing(_collectionMeta);
    }
    if (data.containsKey('entry_id')) {
      context.handle(_entryIdMeta, entryId.isAcceptableOrUnknown(data['entry_id']!, _entryIdMeta));
    } else if (isInserting) {
      context.missing(_entryIdMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {job, collection, entryId};
  @override
  RestoreIndexRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return RestoreIndexRow(
      job: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}job'])!,
      collection: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}collection'])!,
      entryId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}entry_id'])!,
    );
  }

  @override
  $RestoreIndexTable createAlias(String alias) {
    return $RestoreIndexTable(attachedDatabase, alias);
  }

  @override
  bool get withoutRowId => true;
}

class RestoreIndexRow extends DataClass implements Insertable<RestoreIndexRow> {
  final String job;
  final String collection;
  final String entryId;
  const RestoreIndexRow({required this.job, required this.collection, required this.entryId});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['job'] = Variable<String>(job);
    map['collection'] = Variable<String>(collection);
    map['entry_id'] = Variable<String>(entryId);
    return map;
  }

  RestoreIndexCompanion toCompanion(bool nullToAbsent) {
    return RestoreIndexCompanion(job: Value(job), collection: Value(collection), entryId: Value(entryId));
  }

  factory RestoreIndexRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return RestoreIndexRow(
      job: serializer.fromJson<String>(json['job']),
      collection: serializer.fromJson<String>(json['collection']),
      entryId: serializer.fromJson<String>(json['entryId']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'job': serializer.toJson<String>(job),
      'collection': serializer.toJson<String>(collection),
      'entryId': serializer.toJson<String>(entryId),
    };
  }

  RestoreIndexRow copyWith({String? job, String? collection, String? entryId}) => RestoreIndexRow(
    job: job ?? this.job,
    collection: collection ?? this.collection,
    entryId: entryId ?? this.entryId,
  );
  RestoreIndexRow copyWithCompanion(RestoreIndexCompanion data) {
    return RestoreIndexRow(
      job: data.job.present ? data.job.value : this.job,
      collection: data.collection.present ? data.collection.value : this.collection,
      entryId: data.entryId.present ? data.entryId.value : this.entryId,
    );
  }

  @override
  String toString() {
    return (StringBuffer('RestoreIndexRow(')
          ..write('job: $job, ')
          ..write('collection: $collection, ')
          ..write('entryId: $entryId')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(job, collection, entryId);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RestoreIndexRow &&
          other.job == this.job &&
          other.collection == this.collection &&
          other.entryId == this.entryId);
}

class RestoreIndexCompanion extends UpdateCompanion<RestoreIndexRow> {
  final Value<String> job;
  final Value<String> collection;
  final Value<String> entryId;
  const RestoreIndexCompanion({
    this.job = const Value.absent(),
    this.collection = const Value.absent(),
    this.entryId = const Value.absent(),
  });
  RestoreIndexCompanion.insert({required String job, required String collection, required String entryId})
    : job = Value(job),
      collection = Value(collection),
      entryId = Value(entryId);
  static Insertable<RestoreIndexRow> custom({
    Expression<String>? job,
    Expression<String>? collection,
    Expression<String>? entryId,
  }) {
    return RawValuesInsertable({
      if (job != null) 'job': job,
      if (collection != null) 'collection': collection,
      if (entryId != null) 'entry_id': entryId,
    });
  }

  RestoreIndexCompanion copyWith({Value<String>? job, Value<String>? collection, Value<String>? entryId}) {
    return RestoreIndexCompanion(
      job: job ?? this.job,
      collection: collection ?? this.collection,
      entryId: entryId ?? this.entryId,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (job.present) {
      map['job'] = Variable<String>(job.value);
    }
    if (collection.present) {
      map['collection'] = Variable<String>(collection.value);
    }
    if (entryId.present) {
      map['entry_id'] = Variable<String>(entryId.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('RestoreIndexCompanion(')
          ..write('job: $job, ')
          ..write('collection: $collection, ')
          ..write('entryId: $entryId')
          ..write(')'))
        .toString();
  }
}

class $WorkIndexTable extends WorkIndex with TableInfo<$WorkIndexTable, WorkIndexRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $WorkIndexTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _runMeta = const VerificationMeta('run');
  @override
  late final GeneratedColumn<String> run = GeneratedColumn<String>(
    'run',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entryIdMeta = const VerificationMeta('entryId');
  @override
  late final GeneratedColumn<String> entryId = GeneratedColumn<String>(
    'entry_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _valueMeta = const VerificationMeta('value');
  @override
  late final GeneratedColumn<int> value = GeneratedColumn<int>(
    'value',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  @override
  List<GeneratedColumn> get $columns => [run, kind, entryId, value];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'work_index';
  @override
  VerificationContext validateIntegrity(Insertable<WorkIndexRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('run')) {
      context.handle(_runMeta, run.isAcceptableOrUnknown(data['run']!, _runMeta));
    } else if (isInserting) {
      context.missing(_runMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(_kindMeta, kind.isAcceptableOrUnknown(data['kind']!, _kindMeta));
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('entry_id')) {
      context.handle(_entryIdMeta, entryId.isAcceptableOrUnknown(data['entry_id']!, _entryIdMeta));
    } else if (isInserting) {
      context.missing(_entryIdMeta);
    }
    if (data.containsKey('value')) {
      context.handle(_valueMeta, value.isAcceptableOrUnknown(data['value']!, _valueMeta));
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {run, kind, entryId};
  @override
  WorkIndexRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return WorkIndexRow(
      run: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}run'])!,
      kind: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}kind'])!,
      entryId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}entry_id'])!,
      value: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}value'])!,
    );
  }

  @override
  $WorkIndexTable createAlias(String alias) {
    return $WorkIndexTable(attachedDatabase, alias);
  }

  @override
  bool get withoutRowId => true;
}

class WorkIndexRow extends DataClass implements Insertable<WorkIndexRow> {
  final String run;
  final String kind;
  final String entryId;
  final int value;
  const WorkIndexRow({required this.run, required this.kind, required this.entryId, required this.value});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['run'] = Variable<String>(run);
    map['kind'] = Variable<String>(kind);
    map['entry_id'] = Variable<String>(entryId);
    map['value'] = Variable<int>(value);
    return map;
  }

  WorkIndexCompanion toCompanion(bool nullToAbsent) {
    return WorkIndexCompanion(run: Value(run), kind: Value(kind), entryId: Value(entryId), value: Value(value));
  }

  factory WorkIndexRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return WorkIndexRow(
      run: serializer.fromJson<String>(json['run']),
      kind: serializer.fromJson<String>(json['kind']),
      entryId: serializer.fromJson<String>(json['entryId']),
      value: serializer.fromJson<int>(json['value']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'run': serializer.toJson<String>(run),
      'kind': serializer.toJson<String>(kind),
      'entryId': serializer.toJson<String>(entryId),
      'value': serializer.toJson<int>(value),
    };
  }

  WorkIndexRow copyWith({String? run, String? kind, String? entryId, int? value}) => WorkIndexRow(
    run: run ?? this.run,
    kind: kind ?? this.kind,
    entryId: entryId ?? this.entryId,
    value: value ?? this.value,
  );
  WorkIndexRow copyWithCompanion(WorkIndexCompanion data) {
    return WorkIndexRow(
      run: data.run.present ? data.run.value : this.run,
      kind: data.kind.present ? data.kind.value : this.kind,
      entryId: data.entryId.present ? data.entryId.value : this.entryId,
      value: data.value.present ? data.value.value : this.value,
    );
  }

  @override
  String toString() {
    return (StringBuffer('WorkIndexRow(')
          ..write('run: $run, ')
          ..write('kind: $kind, ')
          ..write('entryId: $entryId, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(run, kind, entryId, value);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is WorkIndexRow &&
          other.run == this.run &&
          other.kind == this.kind &&
          other.entryId == this.entryId &&
          other.value == this.value);
}

class WorkIndexCompanion extends UpdateCompanion<WorkIndexRow> {
  final Value<String> run;
  final Value<String> kind;
  final Value<String> entryId;
  final Value<int> value;
  const WorkIndexCompanion({
    this.run = const Value.absent(),
    this.kind = const Value.absent(),
    this.entryId = const Value.absent(),
    this.value = const Value.absent(),
  });
  WorkIndexCompanion.insert({
    required String run,
    required String kind,
    required String entryId,
    this.value = const Value.absent(),
  }) : run = Value(run),
       kind = Value(kind),
       entryId = Value(entryId);
  static Insertable<WorkIndexRow> custom({
    Expression<String>? run,
    Expression<String>? kind,
    Expression<String>? entryId,
    Expression<int>? value,
  }) {
    return RawValuesInsertable({
      if (run != null) 'run': run,
      if (kind != null) 'kind': kind,
      if (entryId != null) 'entry_id': entryId,
      if (value != null) 'value': value,
    });
  }

  WorkIndexCompanion copyWith({Value<String>? run, Value<String>? kind, Value<String>? entryId, Value<int>? value}) {
    return WorkIndexCompanion(
      run: run ?? this.run,
      kind: kind ?? this.kind,
      entryId: entryId ?? this.entryId,
      value: value ?? this.value,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (run.present) {
      map['run'] = Variable<String>(run.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (entryId.present) {
      map['entry_id'] = Variable<String>(entryId.value);
    }
    if (value.present) {
      map['value'] = Variable<int>(value.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('WorkIndexCompanion(')
          ..write('run: $run, ')
          ..write('kind: $kind, ')
          ..write('entryId: $entryId, ')
          ..write('value: $value')
          ..write(')'))
        .toString();
  }
}

class $ImportJobsTable extends ImportJobs with TableInfo<$ImportJobsTable, ImportJobRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ImportJobsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fileFingerprintMeta = const VerificationMeta('fileFingerprint');
  @override
  late final GeneratedColumn<String> fileFingerprint = GeneratedColumn<String>(
    'file_fingerprint',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _stateJsonMeta = const VerificationMeta('stateJson');
  @override
  late final GeneratedColumn<String> stateJson = GeneratedColumn<String>(
    'state_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _startedAtMeta = const VerificationMeta('startedAt');
  @override
  late final GeneratedColumn<int> startedAt = GeneratedColumn<int>(
    'started_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta('updatedAt');
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, fileFingerprint, status, stateJson, startedAt, updatedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'import_jobs';
  @override
  VerificationContext validateIntegrity(Insertable<ImportJobRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('file_fingerprint')) {
      context.handle(
        _fileFingerprintMeta,
        fileFingerprint.isAcceptableOrUnknown(data['file_fingerprint']!, _fileFingerprintMeta),
      );
    } else if (isInserting) {
      context.missing(_fileFingerprintMeta);
    }
    if (data.containsKey('status')) {
      context.handle(_statusMeta, status.isAcceptableOrUnknown(data['status']!, _statusMeta));
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('state_json')) {
      context.handle(_stateJsonMeta, stateJson.isAcceptableOrUnknown(data['state_json']!, _stateJsonMeta));
    } else if (isInserting) {
      context.missing(_stateJsonMeta);
    }
    if (data.containsKey('started_at')) {
      context.handle(_startedAtMeta, startedAt.isAcceptableOrUnknown(data['started_at']!, _startedAtMeta));
    } else if (isInserting) {
      context.missing(_startedAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(_updatedAtMeta, updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta));
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ImportJobRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ImportJobRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      fileFingerprint: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}file_fingerprint'],
      )!,
      status: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}status'])!,
      stateJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}state_json'])!,
      startedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}started_at'])!,
      updatedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}updated_at'])!,
    );
  }

  @override
  $ImportJobsTable createAlias(String alias) {
    return $ImportJobsTable(attachedDatabase, alias);
  }
}

class ImportJobRow extends DataClass implements Insertable<ImportJobRow> {
  final String id;
  final String fileFingerprint;
  final String status;
  final String stateJson;
  final int startedAt;
  final int updatedAt;
  const ImportJobRow({
    required this.id,
    required this.fileFingerprint,
    required this.status,
    required this.stateJson,
    required this.startedAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['file_fingerprint'] = Variable<String>(fileFingerprint);
    map['status'] = Variable<String>(status);
    map['state_json'] = Variable<String>(stateJson);
    map['started_at'] = Variable<int>(startedAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  ImportJobsCompanion toCompanion(bool nullToAbsent) {
    return ImportJobsCompanion(
      id: Value(id),
      fileFingerprint: Value(fileFingerprint),
      status: Value(status),
      stateJson: Value(stateJson),
      startedAt: Value(startedAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory ImportJobRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ImportJobRow(
      id: serializer.fromJson<String>(json['id']),
      fileFingerprint: serializer.fromJson<String>(json['fileFingerprint']),
      status: serializer.fromJson<String>(json['status']),
      stateJson: serializer.fromJson<String>(json['stateJson']),
      startedAt: serializer.fromJson<int>(json['startedAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'fileFingerprint': serializer.toJson<String>(fileFingerprint),
      'status': serializer.toJson<String>(status),
      'stateJson': serializer.toJson<String>(stateJson),
      'startedAt': serializer.toJson<int>(startedAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  ImportJobRow copyWith({
    String? id,
    String? fileFingerprint,
    String? status,
    String? stateJson,
    int? startedAt,
    int? updatedAt,
  }) => ImportJobRow(
    id: id ?? this.id,
    fileFingerprint: fileFingerprint ?? this.fileFingerprint,
    status: status ?? this.status,
    stateJson: stateJson ?? this.stateJson,
    startedAt: startedAt ?? this.startedAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  ImportJobRow copyWithCompanion(ImportJobsCompanion data) {
    return ImportJobRow(
      id: data.id.present ? data.id.value : this.id,
      fileFingerprint: data.fileFingerprint.present ? data.fileFingerprint.value : this.fileFingerprint,
      status: data.status.present ? data.status.value : this.status,
      stateJson: data.stateJson.present ? data.stateJson.value : this.stateJson,
      startedAt: data.startedAt.present ? data.startedAt.value : this.startedAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ImportJobRow(')
          ..write('id: $id, ')
          ..write('fileFingerprint: $fileFingerprint, ')
          ..write('status: $status, ')
          ..write('stateJson: $stateJson, ')
          ..write('startedAt: $startedAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, fileFingerprint, status, stateJson, startedAt, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ImportJobRow &&
          other.id == this.id &&
          other.fileFingerprint == this.fileFingerprint &&
          other.status == this.status &&
          other.stateJson == this.stateJson &&
          other.startedAt == this.startedAt &&
          other.updatedAt == this.updatedAt);
}

class ImportJobsCompanion extends UpdateCompanion<ImportJobRow> {
  final Value<String> id;
  final Value<String> fileFingerprint;
  final Value<String> status;
  final Value<String> stateJson;
  final Value<int> startedAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const ImportJobsCompanion({
    this.id = const Value.absent(),
    this.fileFingerprint = const Value.absent(),
    this.status = const Value.absent(),
    this.stateJson = const Value.absent(),
    this.startedAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ImportJobsCompanion.insert({
    required String id,
    required String fileFingerprint,
    required String status,
    required String stateJson,
    required int startedAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       fileFingerprint = Value(fileFingerprint),
       status = Value(status),
       stateJson = Value(stateJson),
       startedAt = Value(startedAt),
       updatedAt = Value(updatedAt);
  static Insertable<ImportJobRow> custom({
    Expression<String>? id,
    Expression<String>? fileFingerprint,
    Expression<String>? status,
    Expression<String>? stateJson,
    Expression<int>? startedAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (fileFingerprint != null) 'file_fingerprint': fileFingerprint,
      if (status != null) 'status': status,
      if (stateJson != null) 'state_json': stateJson,
      if (startedAt != null) 'started_at': startedAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ImportJobsCompanion copyWith({
    Value<String>? id,
    Value<String>? fileFingerprint,
    Value<String>? status,
    Value<String>? stateJson,
    Value<int>? startedAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return ImportJobsCompanion(
      id: id ?? this.id,
      fileFingerprint: fileFingerprint ?? this.fileFingerprint,
      status: status ?? this.status,
      stateJson: stateJson ?? this.stateJson,
      startedAt: startedAt ?? this.startedAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (fileFingerprint.present) {
      map['file_fingerprint'] = Variable<String>(fileFingerprint.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (stateJson.present) {
      map['state_json'] = Variable<String>(stateJson.value);
    }
    if (startedAt.present) {
      map['started_at'] = Variable<int>(startedAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ImportJobsCompanion(')
          ..write('id: $id, ')
          ..write('fileFingerprint: $fileFingerprint, ')
          ..write('status: $status, ')
          ..write('stateJson: $stateJson, ')
          ..write('startedAt: $startedAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $BackupMetadataTable extends BackupMetadata with TableInfo<$BackupMetadataTable, BackupMetadataRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $BackupMetadataTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _dataJsonMeta = const VerificationMeta('dataJson');
  @override
  late final GeneratedColumn<String> dataJson = GeneratedColumn<String>(
    'data_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta('createdAt');
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, kind, dataJson, createdAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'backup_metadata';
  @override
  VerificationContext validateIntegrity(Insertable<BackupMetadataRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(_kindMeta, kind.isAcceptableOrUnknown(data['kind']!, _kindMeta));
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('data_json')) {
      context.handle(_dataJsonMeta, dataJson.isAcceptableOrUnknown(data['data_json']!, _dataJsonMeta));
    } else if (isInserting) {
      context.missing(_dataJsonMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(_createdAtMeta, createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta));
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  BackupMetadataRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return BackupMetadataRow(
      id: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}id'])!,
      kind: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}kind'])!,
      dataJson: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}data_json'])!,
      createdAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}created_at'])!,
    );
  }

  @override
  $BackupMetadataTable createAlias(String alias) {
    return $BackupMetadataTable(attachedDatabase, alias);
  }
}

class BackupMetadataRow extends DataClass implements Insertable<BackupMetadataRow> {
  final String id;
  final String kind;
  final String dataJson;
  final int createdAt;
  const BackupMetadataRow({required this.id, required this.kind, required this.dataJson, required this.createdAt});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['kind'] = Variable<String>(kind);
    map['data_json'] = Variable<String>(dataJson);
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  BackupMetadataCompanion toCompanion(bool nullToAbsent) {
    return BackupMetadataCompanion(
      id: Value(id),
      kind: Value(kind),
      dataJson: Value(dataJson),
      createdAt: Value(createdAt),
    );
  }

  factory BackupMetadataRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return BackupMetadataRow(
      id: serializer.fromJson<String>(json['id']),
      kind: serializer.fromJson<String>(json['kind']),
      dataJson: serializer.fromJson<String>(json['dataJson']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'kind': serializer.toJson<String>(kind),
      'dataJson': serializer.toJson<String>(dataJson),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  BackupMetadataRow copyWith({String? id, String? kind, String? dataJson, int? createdAt}) => BackupMetadataRow(
    id: id ?? this.id,
    kind: kind ?? this.kind,
    dataJson: dataJson ?? this.dataJson,
    createdAt: createdAt ?? this.createdAt,
  );
  BackupMetadataRow copyWithCompanion(BackupMetadataCompanion data) {
    return BackupMetadataRow(
      id: data.id.present ? data.id.value : this.id,
      kind: data.kind.present ? data.kind.value : this.kind,
      dataJson: data.dataJson.present ? data.dataJson.value : this.dataJson,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('BackupMetadataRow(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('dataJson: $dataJson, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, kind, dataJson, createdAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is BackupMetadataRow &&
          other.id == this.id &&
          other.kind == this.kind &&
          other.dataJson == this.dataJson &&
          other.createdAt == this.createdAt);
}

class BackupMetadataCompanion extends UpdateCompanion<BackupMetadataRow> {
  final Value<String> id;
  final Value<String> kind;
  final Value<String> dataJson;
  final Value<int> createdAt;
  final Value<int> rowid;
  const BackupMetadataCompanion({
    this.id = const Value.absent(),
    this.kind = const Value.absent(),
    this.dataJson = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  BackupMetadataCompanion.insert({
    required String id,
    required String kind,
    required String dataJson,
    required int createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       kind = Value(kind),
       dataJson = Value(dataJson),
       createdAt = Value(createdAt);
  static Insertable<BackupMetadataRow> custom({
    Expression<String>? id,
    Expression<String>? kind,
    Expression<String>? dataJson,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (kind != null) 'kind': kind,
      if (dataJson != null) 'data_json': dataJson,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  BackupMetadataCompanion copyWith({
    Value<String>? id,
    Value<String>? kind,
    Value<String>? dataJson,
    Value<int>? createdAt,
    Value<int>? rowid,
  }) {
    return BackupMetadataCompanion(
      id: id ?? this.id,
      kind: kind ?? this.kind,
      dataJson: dataJson ?? this.dataJson,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (dataJson.present) {
      map['data_json'] = Variable<String>(dataJson.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('BackupMetadataCompanion(')
          ..write('id: $id, ')
          ..write('kind: $kind, ')
          ..write('dataJson: $dataJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CatalogUsageTable extends CatalogUsage with TableInfo<$CatalogUsageTable, CatalogUsageRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CatalogUsageTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _levelMeta = const VerificationMeta('level');
  @override
  late final GeneratedColumn<String> level = GeneratedColumn<String>(
    'level',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _entityIdMeta = const VerificationMeta('entityId');
  @override
  late final GeneratedColumn<String> entityId = GeneratedColumn<String>(
    'entity_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _useCountMeta = const VerificationMeta('useCount');
  @override
  late final GeneratedColumn<int> useCount = GeneratedColumn<int>(
    'use_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _lastUsedAtMeta = const VerificationMeta('lastUsedAt');
  @override
  late final GeneratedColumn<int> lastUsedAt = GeneratedColumn<int>(
    'last_used_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [level, entityId, useCount, lastUsedAt];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'catalog_usage';
  @override
  VerificationContext validateIntegrity(Insertable<CatalogUsageRow> instance, {bool isInserting = false}) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('level')) {
      context.handle(_levelMeta, level.isAcceptableOrUnknown(data['level']!, _levelMeta));
    } else if (isInserting) {
      context.missing(_levelMeta);
    }
    if (data.containsKey('entity_id')) {
      context.handle(_entityIdMeta, entityId.isAcceptableOrUnknown(data['entity_id']!, _entityIdMeta));
    } else if (isInserting) {
      context.missing(_entityIdMeta);
    }
    if (data.containsKey('use_count')) {
      context.handle(_useCountMeta, useCount.isAcceptableOrUnknown(data['use_count']!, _useCountMeta));
    }
    if (data.containsKey('last_used_at')) {
      context.handle(_lastUsedAtMeta, lastUsedAt.isAcceptableOrUnknown(data['last_used_at']!, _lastUsedAtMeta));
    } else if (isInserting) {
      context.missing(_lastUsedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {level, entityId};
  @override
  CatalogUsageRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CatalogUsageRow(
      level: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}level'])!,
      entityId: attachedDatabase.typeMapping.read(DriftSqlType.string, data['${effectivePrefix}entity_id'])!,
      useCount: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}use_count'])!,
      lastUsedAt: attachedDatabase.typeMapping.read(DriftSqlType.int, data['${effectivePrefix}last_used_at'])!,
    );
  }

  @override
  $CatalogUsageTable createAlias(String alias) {
    return $CatalogUsageTable(attachedDatabase, alias);
  }

  @override
  bool get withoutRowId => true;
}

class CatalogUsageRow extends DataClass implements Insertable<CatalogUsageRow> {
  final String level;
  final String entityId;
  final int useCount;
  final int lastUsedAt;
  const CatalogUsageRow({
    required this.level,
    required this.entityId,
    required this.useCount,
    required this.lastUsedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['level'] = Variable<String>(level);
    map['entity_id'] = Variable<String>(entityId);
    map['use_count'] = Variable<int>(useCount);
    map['last_used_at'] = Variable<int>(lastUsedAt);
    return map;
  }

  CatalogUsageCompanion toCompanion(bool nullToAbsent) {
    return CatalogUsageCompanion(
      level: Value(level),
      entityId: Value(entityId),
      useCount: Value(useCount),
      lastUsedAt: Value(lastUsedAt),
    );
  }

  factory CatalogUsageRow.fromJson(Map<String, dynamic> json, {ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CatalogUsageRow(
      level: serializer.fromJson<String>(json['level']),
      entityId: serializer.fromJson<String>(json['entityId']),
      useCount: serializer.fromJson<int>(json['useCount']),
      lastUsedAt: serializer.fromJson<int>(json['lastUsedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'level': serializer.toJson<String>(level),
      'entityId': serializer.toJson<String>(entityId),
      'useCount': serializer.toJson<int>(useCount),
      'lastUsedAt': serializer.toJson<int>(lastUsedAt),
    };
  }

  CatalogUsageRow copyWith({String? level, String? entityId, int? useCount, int? lastUsedAt}) => CatalogUsageRow(
    level: level ?? this.level,
    entityId: entityId ?? this.entityId,
    useCount: useCount ?? this.useCount,
    lastUsedAt: lastUsedAt ?? this.lastUsedAt,
  );
  CatalogUsageRow copyWithCompanion(CatalogUsageCompanion data) {
    return CatalogUsageRow(
      level: data.level.present ? data.level.value : this.level,
      entityId: data.entityId.present ? data.entityId.value : this.entityId,
      useCount: data.useCount.present ? data.useCount.value : this.useCount,
      lastUsedAt: data.lastUsedAt.present ? data.lastUsedAt.value : this.lastUsedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CatalogUsageRow(')
          ..write('level: $level, ')
          ..write('entityId: $entityId, ')
          ..write('useCount: $useCount, ')
          ..write('lastUsedAt: $lastUsedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(level, entityId, useCount, lastUsedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CatalogUsageRow &&
          other.level == this.level &&
          other.entityId == this.entityId &&
          other.useCount == this.useCount &&
          other.lastUsedAt == this.lastUsedAt);
}

class CatalogUsageCompanion extends UpdateCompanion<CatalogUsageRow> {
  final Value<String> level;
  final Value<String> entityId;
  final Value<int> useCount;
  final Value<int> lastUsedAt;
  const CatalogUsageCompanion({
    this.level = const Value.absent(),
    this.entityId = const Value.absent(),
    this.useCount = const Value.absent(),
    this.lastUsedAt = const Value.absent(),
  });
  CatalogUsageCompanion.insert({
    required String level,
    required String entityId,
    this.useCount = const Value.absent(),
    required int lastUsedAt,
  }) : level = Value(level),
       entityId = Value(entityId),
       lastUsedAt = Value(lastUsedAt);
  static Insertable<CatalogUsageRow> custom({
    Expression<String>? level,
    Expression<String>? entityId,
    Expression<int>? useCount,
    Expression<int>? lastUsedAt,
  }) {
    return RawValuesInsertable({
      if (level != null) 'level': level,
      if (entityId != null) 'entity_id': entityId,
      if (useCount != null) 'use_count': useCount,
      if (lastUsedAt != null) 'last_used_at': lastUsedAt,
    });
  }

  CatalogUsageCompanion copyWith({
    Value<String>? level,
    Value<String>? entityId,
    Value<int>? useCount,
    Value<int>? lastUsedAt,
  }) {
    return CatalogUsageCompanion(
      level: level ?? this.level,
      entityId: entityId ?? this.entityId,
      useCount: useCount ?? this.useCount,
      lastUsedAt: lastUsedAt ?? this.lastUsedAt,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (level.present) {
      map['level'] = Variable<String>(level.value);
    }
    if (entityId.present) {
      map['entity_id'] = Variable<String>(entityId.value);
    }
    if (useCount.present) {
      map['use_count'] = Variable<int>(useCount.value);
    }
    if (lastUsedAt.present) {
      map['last_used_at'] = Variable<int>(lastUsedAt.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CatalogUsageCompanion(')
          ..write('level: $level, ')
          ..write('entityId: $entityId, ')
          ..write('useCount: $useCount, ')
          ..write('lastUsedAt: $lastUsedAt')
          ..write(')'))
        .toString();
  }
}

abstract class _$NazmDatabase extends GeneratedDatabase {
  _$NazmDatabase(QueryExecutor e) : super(e);
  $NazmDatabaseManager get managers => $NazmDatabaseManager(this);
  late final $ItemsTable items = $ItemsTable(this);
  late final $ItemTokensTable itemTokens = $ItemTokensTable(this);
  late final $ItemCatalogRefsTable itemCatalogRefs = $ItemCatalogRefsTable(this);
  late final $ItemFieldIdsTable itemFieldIds = $ItemFieldIdsTable(this);
  late final $TaxonomyNodesTable taxonomyNodes = $TaxonomyNodesTable(this);
  late final $FieldDefinitionsTable fieldDefinitions = $FieldDefinitionsTable(this);
  late final $CustomCatalogEntitiesTable customCatalogEntities = $CustomCatalogEntitiesTable(this);
  late final $LocationsTable locations = $LocationsTable(this);
  late final $FoldersTable folders = $FoldersTable(this);
  late final $MediaAssetsTable mediaAssets = $MediaAssetsTable(this);
  late final $ActivityTable activity = $ActivityTable(this);
  late final $SettingsTable settings = $SettingsTable(this);
  late final $AggregatesTable aggregates = $AggregatesTable(this);
  late final $PendingMutationsTable pendingMutations = $PendingMutationsTable(this);
  late final $RestoreJobsTable restoreJobs = $RestoreJobsTable(this);
  late final $RestoreIndexTable restoreIndex = $RestoreIndexTable(this);
  late final $WorkIndexTable workIndex = $WorkIndexTable(this);
  late final $ImportJobsTable importJobs = $ImportJobsTable(this);
  late final $BackupMetadataTable backupMetadata = $BackupMetadataTable(this);
  late final $CatalogUsageTable catalogUsage = $CatalogUsageTable(this);
  late final Index itemsLiveCreated = Index(
    'items_live_created',
    'CREATE INDEX items_live_created ON items (deleted_at, created_at, id)',
  );
  late final Index itemsLiveUpdated = Index(
    'items_live_updated',
    'CREATE INDEX items_live_updated ON items (deleted_at, updated_at, id)',
  );
  late final Index itemsLiveName = Index(
    'items_live_name',
    'CREATE INDEX items_live_name ON items (deleted_at, name_sort_key, id)',
  );
  late final Index itemsLiveFolder = Index(
    'items_live_folder',
    'CREATE INDEX items_live_folder ON items (deleted_at, folder_id, created_at)',
  );
  late final Index itemsLiveCategory = Index(
    'items_live_category',
    'CREATE INDEX items_live_category ON items (deleted_at, category_id, created_at)',
  );
  late final Index itemsLiveMain = Index(
    'items_live_main',
    'CREATE INDEX items_live_main ON items (deleted_at, main_category_id, created_at)',
  );
  late final Index itemsLiveSub = Index(
    'items_live_sub',
    'CREATE INDEX items_live_sub ON items (deleted_at, subcategory_id, created_at)',
  );
  late final Index itemsLiveLocation = Index(
    'items_live_location',
    'CREATE INDEX items_live_location ON items (deleted_at, location_id, created_at)',
  );
  late final Index itemsLiveCondition = Index(
    'items_live_condition',
    'CREATE INDEX items_live_condition ON items (deleted_at, condition)',
  );
  late final Index itemsLiveValue = Index(
    'items_live_value',
    'CREATE INDEX items_live_value ON items (deleted_at, valuation_currency, valuation_midpoint, id)',
  );
  late final Index itemsLiveImages = Index(
    'items_live_images',
    'CREATE INDEX items_live_images ON items (deleted_at, has_images)',
  );
  late final Index itemsSku = Index('items_sku', 'CREATE INDEX items_sku ON items (sku)');
  late final Index itemsBarcode = Index('items_barcode', 'CREATE INDEX items_barcode ON items (barcode)');
  late final Index itemsSerial = Index('items_serial', 'CREATE INDEX items_serial ON items (serial_number)');
  late final Index itemsImportJob = Index('items_import_job', 'CREATE INDEX items_import_job ON items (import_job_id)');
  late final Index itemTokensItem = Index('item_tokens_item', 'CREATE INDEX item_tokens_item ON item_tokens (item_id)');
  late final Index itemCatalogRefsItem = Index(
    'item_catalog_refs_item',
    'CREATE INDEX item_catalog_refs_item ON item_catalog_refs (item_id)',
  );
  late final Index itemFieldIdsItem = Index(
    'item_field_ids_item',
    'CREATE INDEX item_field_ids_item ON item_field_ids (item_id)',
  );
  late final Index taxonomyParent = Index(
    'taxonomy_parent',
    'CREATE INDEX taxonomy_parent ON taxonomy_nodes (parent_id)',
  );
  late final Index catalogCustomLevel = Index(
    'catalog_custom_level',
    'CREATE INDEX catalog_custom_level ON custom_catalog_entities (entity_type, parent_id)',
  );
  late final Index mediaOrphaned = Index(
    'media_orphaned',
    'CREATE INDEX media_orphaned ON media_assets (ref_count, orphaned_at)',
  );
  late final Index activityTime = Index('activity_time', 'CREATE INDEX activity_time ON activity (timestamp)');
  late final Index mutationsStatus = Index(
    'mutations_status',
    'CREATE INDEX mutations_status ON pending_mutations (status, created_at)',
  );
  late final Index mutationsEntity = Index(
    'mutations_entity',
    'CREATE INDEX mutations_entity ON pending_mutations (entity_type, entity_id)',
  );
  late final Index importJobsFingerprint = Index(
    'import_jobs_fingerprint',
    'CREATE INDEX import_jobs_fingerprint ON import_jobs (file_fingerprint)',
  );
  late final Index importJobsStatus = Index(
    'import_jobs_status',
    'CREATE INDEX import_jobs_status ON import_jobs (status, started_at)',
  );
  late final Index catalogUsageLevel = Index(
    'catalog_usage_level',
    'CREATE INDEX catalog_usage_level ON catalog_usage (level, last_used_at)',
  );
  @override
  Iterable<TableInfo<Table, Object?>> get allTables => allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    items,
    itemTokens,
    itemCatalogRefs,
    itemFieldIds,
    taxonomyNodes,
    fieldDefinitions,
    customCatalogEntities,
    locations,
    folders,
    mediaAssets,
    activity,
    settings,
    aggregates,
    pendingMutations,
    restoreJobs,
    restoreIndex,
    workIndex,
    importJobs,
    backupMetadata,
    catalogUsage,
    itemsLiveCreated,
    itemsLiveUpdated,
    itemsLiveName,
    itemsLiveFolder,
    itemsLiveCategory,
    itemsLiveMain,
    itemsLiveSub,
    itemsLiveLocation,
    itemsLiveCondition,
    itemsLiveValue,
    itemsLiveImages,
    itemsSku,
    itemsBarcode,
    itemsSerial,
    itemsImportJob,
    itemTokensItem,
    itemCatalogRefsItem,
    itemFieldIdsItem,
    taxonomyParent,
    catalogCustomLevel,
    mediaOrphaned,
    activityTime,
    mutationsStatus,
    mutationsEntity,
    importJobsFingerprint,
    importJobsStatus,
    catalogUsageLevel,
  ];
}

typedef $$ItemsTableCreateCompanionBuilder = ItemsCompanion Function({
  required String id,
  Value<String> workspaceId,
  Value<String> name,
  Value<String> nameSortKey,
  Value<String?> sku,
  Value<String?> barcode,
  Value<String?> serialNumber,
  Value<String?> modelNumber,
  Value<String?> referenceNumber,
  Value<String?> brand,
  Value<String?> mainCategoryId,
  required String categoryId,
  Value<String?> subcategoryId,
  Value<String?> legacyCategoryId,
  Value<String?> folderId,
  Value<String?> locationId,
  Value<double> quantity,
  required String unit,
  Value<String> condition,
  Value<String?> valuationMin,
  Value<String?> valuationMax,
  Value<String?> valuationCurrency,
  Value<double?> valuationMidpoint,
  Value<String?> valuationSource,
  Value<String?> valuationType,
  Value<int?> valuationDate,
  Value<String> description,
  Value<String> imagesJson,
  Value<String?> primaryImageId,
  Value<bool> hasImages,
  Value<String> customFieldsJson,
  Value<String> customFieldDefsJson,
  Value<String?> aiDataJson,
  Value<String?> importJobId,
  Value<int?> sourceLine,
  required int createdAt,
  Value<String?> createdBy,
  required int updatedAt,
  Value<String?> updatedBy,
  Value<int?> deletedAt,
  Value<String?> deletedBy,
  Value<int> version,
  Value<int> rowid,
});
typedef $$ItemsTableUpdateCompanionBuilder = ItemsCompanion Function({
  Value<String> id,
  Value<String> workspaceId,
  Value<String> name,
  Value<String> nameSortKey,
  Value<String?> sku,
  Value<String?> barcode,
  Value<String?> serialNumber,
  Value<String?> modelNumber,
  Value<String?> referenceNumber,
  Value<String?> brand,
  Value<String?> mainCategoryId,
  Value<String> categoryId,
  Value<String?> subcategoryId,
  Value<String?> legacyCategoryId,
  Value<String?> folderId,
  Value<String?> locationId,
  Value<double> quantity,
  Value<String> unit,
  Value<String> condition,
  Value<String?> valuationMin,
  Value<String?> valuationMax,
  Value<String?> valuationCurrency,
  Value<double?> valuationMidpoint,
  Value<String?> valuationSource,
  Value<String?> valuationType,
  Value<int?> valuationDate,
  Value<String> description,
  Value<String> imagesJson,
  Value<String?> primaryImageId,
  Value<bool> hasImages,
  Value<String> customFieldsJson,
  Value<String> customFieldDefsJson,
  Value<String?> aiDataJson,
  Value<String?> importJobId,
  Value<int?> sourceLine,
  Value<int> createdAt,
  Value<String?> createdBy,
  Value<int> updatedAt,
  Value<String?> updatedBy,
  Value<int?> deletedAt,
  Value<String?> deletedBy,
  Value<int> version,
  Value<int> rowid,
});

class $$ItemsTableFilterComposer extends Composer<_$NazmDatabase, $ItemsTable> {
  $$ItemsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get nameSortKey =>
      $composableBuilder(column: $table.nameSortKey, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sku => $composableBuilder(column: $table.sku, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get barcode =>
      $composableBuilder(column: $table.barcode, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get serialNumber =>
      $composableBuilder(column: $table.serialNumber, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get modelNumber =>
      $composableBuilder(column: $table.modelNumber, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get referenceNumber =>
      $composableBuilder(column: $table.referenceNumber, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get brand =>
      $composableBuilder(column: $table.brand, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get mainCategoryId =>
      $composableBuilder(column: $table.mainCategoryId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get categoryId =>
      $composableBuilder(column: $table.categoryId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get subcategoryId =>
      $composableBuilder(column: $table.subcategoryId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get legacyCategoryId =>
      $composableBuilder(column: $table.legacyCategoryId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get folderId =>
      $composableBuilder(column: $table.folderId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get locationId =>
      $composableBuilder(column: $table.locationId, builder: (column) => ColumnFilters(column));

  ColumnFilters<double> get quantity =>
      $composableBuilder(column: $table.quantity, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get unit => $composableBuilder(column: $table.unit, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get condition =>
      $composableBuilder(column: $table.condition, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get valuationMin =>
      $composableBuilder(column: $table.valuationMin, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get valuationMax =>
      $composableBuilder(column: $table.valuationMax, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get valuationCurrency =>
      $composableBuilder(column: $table.valuationCurrency, builder: (column) => ColumnFilters(column));

  ColumnFilters<double> get valuationMidpoint =>
      $composableBuilder(column: $table.valuationMidpoint, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get valuationSource =>
      $composableBuilder(column: $table.valuationSource, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get valuationType =>
      $composableBuilder(column: $table.valuationType, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get valuationDate =>
      $composableBuilder(column: $table.valuationDate, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get description =>
      $composableBuilder(column: $table.description, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get imagesJson =>
      $composableBuilder(column: $table.imagesJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get primaryImageId =>
      $composableBuilder(column: $table.primaryImageId, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get hasImages =>
      $composableBuilder(column: $table.hasImages, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get customFieldsJson =>
      $composableBuilder(column: $table.customFieldsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get customFieldDefsJson =>
      $composableBuilder(column: $table.customFieldDefsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get aiDataJson =>
      $composableBuilder(column: $table.aiDataJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get importJobId =>
      $composableBuilder(column: $table.importJobId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get sourceLine =>
      $composableBuilder(column: $table.sourceLine, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get createdBy =>
      $composableBuilder(column: $table.createdBy, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get updatedBy =>
      $composableBuilder(column: $table.updatedBy, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get deletedAt =>
      $composableBuilder(column: $table.deletedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get deletedBy =>
      $composableBuilder(column: $table.deletedBy, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get version =>
      $composableBuilder(column: $table.version, builder: (column) => ColumnFilters(column));
}

class $$ItemsTableOrderingComposer extends Composer<_$NazmDatabase, $ItemsTable> {
  $$ItemsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get nameSortKey =>
      $composableBuilder(column: $table.nameSortKey, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sku =>
      $composableBuilder(column: $table.sku, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get barcode =>
      $composableBuilder(column: $table.barcode, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get serialNumber =>
      $composableBuilder(column: $table.serialNumber, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get modelNumber =>
      $composableBuilder(column: $table.modelNumber, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get referenceNumber =>
      $composableBuilder(column: $table.referenceNumber, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get brand =>
      $composableBuilder(column: $table.brand, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get mainCategoryId =>
      $composableBuilder(column: $table.mainCategoryId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get categoryId =>
      $composableBuilder(column: $table.categoryId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get subcategoryId =>
      $composableBuilder(column: $table.subcategoryId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get legacyCategoryId =>
      $composableBuilder(column: $table.legacyCategoryId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get folderId =>
      $composableBuilder(column: $table.folderId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get locationId =>
      $composableBuilder(column: $table.locationId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<double> get quantity =>
      $composableBuilder(column: $table.quantity, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get unit =>
      $composableBuilder(column: $table.unit, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get condition =>
      $composableBuilder(column: $table.condition, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get valuationMin =>
      $composableBuilder(column: $table.valuationMin, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get valuationMax =>
      $composableBuilder(column: $table.valuationMax, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get valuationCurrency =>
      $composableBuilder(column: $table.valuationCurrency, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<double> get valuationMidpoint =>
      $composableBuilder(column: $table.valuationMidpoint, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get valuationSource =>
      $composableBuilder(column: $table.valuationSource, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get valuationType =>
      $composableBuilder(column: $table.valuationType, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get valuationDate =>
      $composableBuilder(column: $table.valuationDate, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get description =>
      $composableBuilder(column: $table.description, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get imagesJson =>
      $composableBuilder(column: $table.imagesJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get primaryImageId =>
      $composableBuilder(column: $table.primaryImageId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get hasImages =>
      $composableBuilder(column: $table.hasImages, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get customFieldsJson =>
      $composableBuilder(column: $table.customFieldsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get customFieldDefsJson =>
      $composableBuilder(column: $table.customFieldDefsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get aiDataJson =>
      $composableBuilder(column: $table.aiDataJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get importJobId =>
      $composableBuilder(column: $table.importJobId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get sourceLine =>
      $composableBuilder(column: $table.sourceLine, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get createdBy =>
      $composableBuilder(column: $table.createdBy, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get updatedBy =>
      $composableBuilder(column: $table.updatedBy, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get deletedAt =>
      $composableBuilder(column: $table.deletedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get deletedBy =>
      $composableBuilder(column: $table.deletedBy, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get version =>
      $composableBuilder(column: $table.version, builder: (column) => ColumnOrderings(column));
}

class $$ItemsTableAnnotationComposer extends Composer<_$NazmDatabase, $ItemsTable> {
  $$ItemsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<String> get name => $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get nameSortKey =>
      $composableBuilder(column: $table.nameSortKey, builder: (column) => column);

  GeneratedColumn<String> get sku => $composableBuilder(column: $table.sku, builder: (column) => column);

  GeneratedColumn<String> get barcode => $composableBuilder(column: $table.barcode, builder: (column) => column);

  GeneratedColumn<String> get serialNumber =>
      $composableBuilder(column: $table.serialNumber, builder: (column) => column);

  GeneratedColumn<String> get modelNumber =>
      $composableBuilder(column: $table.modelNumber, builder: (column) => column);

  GeneratedColumn<String> get referenceNumber =>
      $composableBuilder(column: $table.referenceNumber, builder: (column) => column);

  GeneratedColumn<String> get brand => $composableBuilder(column: $table.brand, builder: (column) => column);

  GeneratedColumn<String> get mainCategoryId =>
      $composableBuilder(column: $table.mainCategoryId, builder: (column) => column);

  GeneratedColumn<String> get categoryId => $composableBuilder(column: $table.categoryId, builder: (column) => column);

  GeneratedColumn<String> get subcategoryId =>
      $composableBuilder(column: $table.subcategoryId, builder: (column) => column);

  GeneratedColumn<String> get legacyCategoryId =>
      $composableBuilder(column: $table.legacyCategoryId, builder: (column) => column);

  GeneratedColumn<String> get folderId => $composableBuilder(column: $table.folderId, builder: (column) => column);

  GeneratedColumn<String> get locationId => $composableBuilder(column: $table.locationId, builder: (column) => column);

  GeneratedColumn<double> get quantity => $composableBuilder(column: $table.quantity, builder: (column) => column);

  GeneratedColumn<String> get unit => $composableBuilder(column: $table.unit, builder: (column) => column);

  GeneratedColumn<String> get condition => $composableBuilder(column: $table.condition, builder: (column) => column);

  GeneratedColumn<String> get valuationMin =>
      $composableBuilder(column: $table.valuationMin, builder: (column) => column);

  GeneratedColumn<String> get valuationMax =>
      $composableBuilder(column: $table.valuationMax, builder: (column) => column);

  GeneratedColumn<String> get valuationCurrency =>
      $composableBuilder(column: $table.valuationCurrency, builder: (column) => column);

  GeneratedColumn<double> get valuationMidpoint =>
      $composableBuilder(column: $table.valuationMidpoint, builder: (column) => column);

  GeneratedColumn<String> get valuationSource =>
      $composableBuilder(column: $table.valuationSource, builder: (column) => column);

  GeneratedColumn<String> get valuationType =>
      $composableBuilder(column: $table.valuationType, builder: (column) => column);

  GeneratedColumn<int> get valuationDate =>
      $composableBuilder(column: $table.valuationDate, builder: (column) => column);

  GeneratedColumn<String> get description =>
      $composableBuilder(column: $table.description, builder: (column) => column);

  GeneratedColumn<String> get imagesJson => $composableBuilder(column: $table.imagesJson, builder: (column) => column);

  GeneratedColumn<String> get primaryImageId =>
      $composableBuilder(column: $table.primaryImageId, builder: (column) => column);

  GeneratedColumn<bool> get hasImages => $composableBuilder(column: $table.hasImages, builder: (column) => column);

  GeneratedColumn<String> get customFieldsJson =>
      $composableBuilder(column: $table.customFieldsJson, builder: (column) => column);

  GeneratedColumn<String> get customFieldDefsJson =>
      $composableBuilder(column: $table.customFieldDefsJson, builder: (column) => column);

  GeneratedColumn<String> get aiDataJson => $composableBuilder(column: $table.aiDataJson, builder: (column) => column);

  GeneratedColumn<String> get importJobId =>
      $composableBuilder(column: $table.importJobId, builder: (column) => column);

  GeneratedColumn<int> get sourceLine => $composableBuilder(column: $table.sourceLine, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<String> get createdBy => $composableBuilder(column: $table.createdBy, builder: (column) => column);

  GeneratedColumn<int> get updatedAt => $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<String> get updatedBy => $composableBuilder(column: $table.updatedBy, builder: (column) => column);

  GeneratedColumn<int> get deletedAt => $composableBuilder(column: $table.deletedAt, builder: (column) => column);

  GeneratedColumn<String> get deletedBy => $composableBuilder(column: $table.deletedBy, builder: (column) => column);

  GeneratedColumn<int> get version => $composableBuilder(column: $table.version, builder: (column) => column);
}

class $$ItemsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $ItemsTable,
          ItemRow,
          $$ItemsTableFilterComposer,
          $$ItemsTableOrderingComposer,
          $$ItemsTableAnnotationComposer,
          $$ItemsTableCreateCompanionBuilder,
          $$ItemsTableUpdateCompanionBuilder,
          (ItemRow, BaseReferences<_$NazmDatabase, $ItemsTable, ItemRow>),
          ItemRow,
          PrefetchHooks Function()
        > {
  $$ItemsTableTableManager(_$NazmDatabase db, $ItemsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$ItemsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$ItemsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$ItemsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> workspaceId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> nameSortKey = const Value.absent(),
                Value<String?> sku = const Value.absent(),
                Value<String?> barcode = const Value.absent(),
                Value<String?> serialNumber = const Value.absent(),
                Value<String?> modelNumber = const Value.absent(),
                Value<String?> referenceNumber = const Value.absent(),
                Value<String?> brand = const Value.absent(),
                Value<String?> mainCategoryId = const Value.absent(),
                Value<String> categoryId = const Value.absent(),
                Value<String?> subcategoryId = const Value.absent(),
                Value<String?> legacyCategoryId = const Value.absent(),
                Value<String?> folderId = const Value.absent(),
                Value<String?> locationId = const Value.absent(),
                Value<double> quantity = const Value.absent(),
                Value<String> unit = const Value.absent(),
                Value<String> condition = const Value.absent(),
                Value<String?> valuationMin = const Value.absent(),
                Value<String?> valuationMax = const Value.absent(),
                Value<String?> valuationCurrency = const Value.absent(),
                Value<double?> valuationMidpoint = const Value.absent(),
                Value<String?> valuationSource = const Value.absent(),
                Value<String?> valuationType = const Value.absent(),
                Value<int?> valuationDate = const Value.absent(),
                Value<String> description = const Value.absent(),
                Value<String> imagesJson = const Value.absent(),
                Value<String?> primaryImageId = const Value.absent(),
                Value<bool> hasImages = const Value.absent(),
                Value<String> customFieldsJson = const Value.absent(),
                Value<String> customFieldDefsJson = const Value.absent(),
                Value<String?> aiDataJson = const Value.absent(),
                Value<String?> importJobId = const Value.absent(),
                Value<int?> sourceLine = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<String?> createdBy = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<String?> updatedBy = const Value.absent(),
                Value<int?> deletedAt = const Value.absent(),
                Value<String?> deletedBy = const Value.absent(),
                Value<int> version = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ItemsCompanion(
                id: id,
                workspaceId: workspaceId,
                name: name,
                nameSortKey: nameSortKey,
                sku: sku,
                barcode: barcode,
                serialNumber: serialNumber,
                modelNumber: modelNumber,
                referenceNumber: referenceNumber,
                brand: brand,
                mainCategoryId: mainCategoryId,
                categoryId: categoryId,
                subcategoryId: subcategoryId,
                legacyCategoryId: legacyCategoryId,
                folderId: folderId,
                locationId: locationId,
                quantity: quantity,
                unit: unit,
                condition: condition,
                valuationMin: valuationMin,
                valuationMax: valuationMax,
                valuationCurrency: valuationCurrency,
                valuationMidpoint: valuationMidpoint,
                valuationSource: valuationSource,
                valuationType: valuationType,
                valuationDate: valuationDate,
                description: description,
                imagesJson: imagesJson,
                primaryImageId: primaryImageId,
                hasImages: hasImages,
                customFieldsJson: customFieldsJson,
                customFieldDefsJson: customFieldDefsJson,
                aiDataJson: aiDataJson,
                importJobId: importJobId,
                sourceLine: sourceLine,
                createdAt: createdAt,
                createdBy: createdBy,
                updatedAt: updatedAt,
                updatedBy: updatedBy,
                deletedAt: deletedAt,
                deletedBy: deletedBy,
                version: version,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> nameSortKey = const Value.absent(),
                Value<String?> sku = const Value.absent(),
                Value<String?> barcode = const Value.absent(),
                Value<String?> serialNumber = const Value.absent(),
                Value<String?> modelNumber = const Value.absent(),
                Value<String?> referenceNumber = const Value.absent(),
                Value<String?> brand = const Value.absent(),
                Value<String?> mainCategoryId = const Value.absent(),
                required String categoryId,
                Value<String?> subcategoryId = const Value.absent(),
                Value<String?> legacyCategoryId = const Value.absent(),
                Value<String?> folderId = const Value.absent(),
                Value<String?> locationId = const Value.absent(),
                Value<double> quantity = const Value.absent(),
                required String unit,
                Value<String> condition = const Value.absent(),
                Value<String?> valuationMin = const Value.absent(),
                Value<String?> valuationMax = const Value.absent(),
                Value<String?> valuationCurrency = const Value.absent(),
                Value<double?> valuationMidpoint = const Value.absent(),
                Value<String?> valuationSource = const Value.absent(),
                Value<String?> valuationType = const Value.absent(),
                Value<int?> valuationDate = const Value.absent(),
                Value<String> description = const Value.absent(),
                Value<String> imagesJson = const Value.absent(),
                Value<String?> primaryImageId = const Value.absent(),
                Value<bool> hasImages = const Value.absent(),
                Value<String> customFieldsJson = const Value.absent(),
                Value<String> customFieldDefsJson = const Value.absent(),
                Value<String?> aiDataJson = const Value.absent(),
                Value<String?> importJobId = const Value.absent(),
                Value<int?> sourceLine = const Value.absent(),
                required int createdAt,
                Value<String?> createdBy = const Value.absent(),
                required int updatedAt,
                Value<String?> updatedBy = const Value.absent(),
                Value<int?> deletedAt = const Value.absent(),
                Value<String?> deletedBy = const Value.absent(),
                Value<int> version = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ItemsCompanion.insert(
                id: id,
                workspaceId: workspaceId,
                name: name,
                nameSortKey: nameSortKey,
                sku: sku,
                barcode: barcode,
                serialNumber: serialNumber,
                modelNumber: modelNumber,
                referenceNumber: referenceNumber,
                brand: brand,
                mainCategoryId: mainCategoryId,
                categoryId: categoryId,
                subcategoryId: subcategoryId,
                legacyCategoryId: legacyCategoryId,
                folderId: folderId,
                locationId: locationId,
                quantity: quantity,
                unit: unit,
                condition: condition,
                valuationMin: valuationMin,
                valuationMax: valuationMax,
                valuationCurrency: valuationCurrency,
                valuationMidpoint: valuationMidpoint,
                valuationSource: valuationSource,
                valuationType: valuationType,
                valuationDate: valuationDate,
                description: description,
                imagesJson: imagesJson,
                primaryImageId: primaryImageId,
                hasImages: hasImages,
                customFieldsJson: customFieldsJson,
                customFieldDefsJson: customFieldDefsJson,
                aiDataJson: aiDataJson,
                importJobId: importJobId,
                sourceLine: sourceLine,
                createdAt: createdAt,
                createdBy: createdBy,
                updatedAt: updatedAt,
                updatedBy: updatedBy,
                deletedAt: deletedAt,
                deletedBy: deletedBy,
                version: version,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ItemsTable, ItemRow>(table),
                  BaseReferences<_$NazmDatabase, $ItemsTable, ItemRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ItemsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $ItemsTable,
      ItemRow,
      $$ItemsTableFilterComposer,
      $$ItemsTableOrderingComposer,
      $$ItemsTableAnnotationComposer,
      $$ItemsTableCreateCompanionBuilder,
      $$ItemsTableUpdateCompanionBuilder,
      (ItemRow, BaseReferences<_$NazmDatabase, $ItemsTable, ItemRow>),
      ItemRow,
      PrefetchHooks Function()
    >;
typedef $$ItemTokensTableCreateCompanionBuilder = ItemTokensCompanion Function({
  required String token,
  required String itemId,
});
typedef $$ItemTokensTableUpdateCompanionBuilder = ItemTokensCompanion Function({
  Value<String> token,
  Value<String> itemId,
});

class $$ItemTokensTableFilterComposer extends Composer<_$NazmDatabase, $ItemTokensTable> {
  $$ItemTokensTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get token =>
      $composableBuilder(column: $table.token, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get itemId =>
      $composableBuilder(column: $table.itemId, builder: (column) => ColumnFilters(column));
}

class $$ItemTokensTableOrderingComposer extends Composer<_$NazmDatabase, $ItemTokensTable> {
  $$ItemTokensTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get token =>
      $composableBuilder(column: $table.token, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get itemId =>
      $composableBuilder(column: $table.itemId, builder: (column) => ColumnOrderings(column));
}

class $$ItemTokensTableAnnotationComposer extends Composer<_$NazmDatabase, $ItemTokensTable> {
  $$ItemTokensTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get token => $composableBuilder(column: $table.token, builder: (column) => column);

  GeneratedColumn<String> get itemId => $composableBuilder(column: $table.itemId, builder: (column) => column);
}

class $$ItemTokensTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $ItemTokensTable,
          ItemTokenRow,
          $$ItemTokensTableFilterComposer,
          $$ItemTokensTableOrderingComposer,
          $$ItemTokensTableAnnotationComposer,
          $$ItemTokensTableCreateCompanionBuilder,
          $$ItemTokensTableUpdateCompanionBuilder,
          (ItemTokenRow, BaseReferences<_$NazmDatabase, $ItemTokensTable, ItemTokenRow>),
          ItemTokenRow,
          PrefetchHooks Function()
        > {
  $$ItemTokensTableTableManager(_$NazmDatabase db, $ItemTokensTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$ItemTokensTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$ItemTokensTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$ItemTokensTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> token = const Value.absent(),
            Value<String> itemId = const Value.absent(),
          }) => ItemTokensCompanion(token: token, itemId: itemId),
          createCompanionCallback: ({required String token, required String itemId}) =>
              ItemTokensCompanion.insert(token: token, itemId: itemId),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ItemTokensTable, ItemTokenRow>(table),
                  BaseReferences<_$NazmDatabase, $ItemTokensTable, ItemTokenRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ItemTokensTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $ItemTokensTable,
      ItemTokenRow,
      $$ItemTokensTableFilterComposer,
      $$ItemTokensTableOrderingComposer,
      $$ItemTokensTableAnnotationComposer,
      $$ItemTokensTableCreateCompanionBuilder,
      $$ItemTokensTableUpdateCompanionBuilder,
      (ItemTokenRow, BaseReferences<_$NazmDatabase, $ItemTokensTable, ItemTokenRow>),
      ItemTokenRow,
      PrefetchHooks Function()
    >;
typedef $$ItemCatalogRefsTableCreateCompanionBuilder = ItemCatalogRefsCompanion Function({
  required String ref,
  required String itemId,
});
typedef $$ItemCatalogRefsTableUpdateCompanionBuilder = ItemCatalogRefsCompanion Function({
  Value<String> ref,
  Value<String> itemId,
});

class $$ItemCatalogRefsTableFilterComposer extends Composer<_$NazmDatabase, $ItemCatalogRefsTable> {
  $$ItemCatalogRefsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get ref => $composableBuilder(column: $table.ref, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get itemId =>
      $composableBuilder(column: $table.itemId, builder: (column) => ColumnFilters(column));
}

class $$ItemCatalogRefsTableOrderingComposer extends Composer<_$NazmDatabase, $ItemCatalogRefsTable> {
  $$ItemCatalogRefsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get ref =>
      $composableBuilder(column: $table.ref, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get itemId =>
      $composableBuilder(column: $table.itemId, builder: (column) => ColumnOrderings(column));
}

class $$ItemCatalogRefsTableAnnotationComposer extends Composer<_$NazmDatabase, $ItemCatalogRefsTable> {
  $$ItemCatalogRefsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get ref => $composableBuilder(column: $table.ref, builder: (column) => column);

  GeneratedColumn<String> get itemId => $composableBuilder(column: $table.itemId, builder: (column) => column);
}

class $$ItemCatalogRefsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $ItemCatalogRefsTable,
          ItemCatalogRefRow,
          $$ItemCatalogRefsTableFilterComposer,
          $$ItemCatalogRefsTableOrderingComposer,
          $$ItemCatalogRefsTableAnnotationComposer,
          $$ItemCatalogRefsTableCreateCompanionBuilder,
          $$ItemCatalogRefsTableUpdateCompanionBuilder,
          (ItemCatalogRefRow, BaseReferences<_$NazmDatabase, $ItemCatalogRefsTable, ItemCatalogRefRow>),
          ItemCatalogRefRow,
          PrefetchHooks Function()
        > {
  $$ItemCatalogRefsTableTableManager(_$NazmDatabase db, $ItemCatalogRefsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$ItemCatalogRefsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$ItemCatalogRefsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$ItemCatalogRefsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> ref = const Value.absent(),
            Value<String> itemId = const Value.absent(),
          }) => ItemCatalogRefsCompanion(ref: ref, itemId: itemId),
          createCompanionCallback: ({required String ref, required String itemId}) =>
              ItemCatalogRefsCompanion.insert(ref: ref, itemId: itemId),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ItemCatalogRefsTable, ItemCatalogRefRow>(table),
                  BaseReferences<_$NazmDatabase, $ItemCatalogRefsTable, ItemCatalogRefRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ItemCatalogRefsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $ItemCatalogRefsTable,
      ItemCatalogRefRow,
      $$ItemCatalogRefsTableFilterComposer,
      $$ItemCatalogRefsTableOrderingComposer,
      $$ItemCatalogRefsTableAnnotationComposer,
      $$ItemCatalogRefsTableCreateCompanionBuilder,
      $$ItemCatalogRefsTableUpdateCompanionBuilder,
      (ItemCatalogRefRow, BaseReferences<_$NazmDatabase, $ItemCatalogRefsTable, ItemCatalogRefRow>),
      ItemCatalogRefRow,
      PrefetchHooks Function()
    >;
typedef $$ItemFieldIdsTableCreateCompanionBuilder = ItemFieldIdsCompanion Function({
  required String fieldId,
  required String itemId,
});
typedef $$ItemFieldIdsTableUpdateCompanionBuilder = ItemFieldIdsCompanion Function({
  Value<String> fieldId,
  Value<String> itemId,
});

class $$ItemFieldIdsTableFilterComposer extends Composer<_$NazmDatabase, $ItemFieldIdsTable> {
  $$ItemFieldIdsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get fieldId =>
      $composableBuilder(column: $table.fieldId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get itemId =>
      $composableBuilder(column: $table.itemId, builder: (column) => ColumnFilters(column));
}

class $$ItemFieldIdsTableOrderingComposer extends Composer<_$NazmDatabase, $ItemFieldIdsTable> {
  $$ItemFieldIdsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get fieldId =>
      $composableBuilder(column: $table.fieldId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get itemId =>
      $composableBuilder(column: $table.itemId, builder: (column) => ColumnOrderings(column));
}

class $$ItemFieldIdsTableAnnotationComposer extends Composer<_$NazmDatabase, $ItemFieldIdsTable> {
  $$ItemFieldIdsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get fieldId => $composableBuilder(column: $table.fieldId, builder: (column) => column);

  GeneratedColumn<String> get itemId => $composableBuilder(column: $table.itemId, builder: (column) => column);
}

class $$ItemFieldIdsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $ItemFieldIdsTable,
          ItemFieldIdRow,
          $$ItemFieldIdsTableFilterComposer,
          $$ItemFieldIdsTableOrderingComposer,
          $$ItemFieldIdsTableAnnotationComposer,
          $$ItemFieldIdsTableCreateCompanionBuilder,
          $$ItemFieldIdsTableUpdateCompanionBuilder,
          (ItemFieldIdRow, BaseReferences<_$NazmDatabase, $ItemFieldIdsTable, ItemFieldIdRow>),
          ItemFieldIdRow,
          PrefetchHooks Function()
        > {
  $$ItemFieldIdsTableTableManager(_$NazmDatabase db, $ItemFieldIdsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$ItemFieldIdsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$ItemFieldIdsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$ItemFieldIdsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> fieldId = const Value.absent(),
            Value<String> itemId = const Value.absent(),
          }) => ItemFieldIdsCompanion(fieldId: fieldId, itemId: itemId),
          createCompanionCallback: ({required String fieldId, required String itemId}) =>
              ItemFieldIdsCompanion.insert(fieldId: fieldId, itemId: itemId),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ItemFieldIdsTable, ItemFieldIdRow>(table),
                  BaseReferences<_$NazmDatabase, $ItemFieldIdsTable, ItemFieldIdRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ItemFieldIdsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $ItemFieldIdsTable,
      ItemFieldIdRow,
      $$ItemFieldIdsTableFilterComposer,
      $$ItemFieldIdsTableOrderingComposer,
      $$ItemFieldIdsTableAnnotationComposer,
      $$ItemFieldIdsTableCreateCompanionBuilder,
      $$ItemFieldIdsTableUpdateCompanionBuilder,
      (ItemFieldIdRow, BaseReferences<_$NazmDatabase, $ItemFieldIdsTable, ItemFieldIdRow>),
      ItemFieldIdRow,
      PrefetchHooks Function()
    >;
typedef $$TaxonomyNodesTableCreateCompanionBuilder = TaxonomyNodesCompanion Function({
  required String id,
  Value<String> workspaceId,
  Value<String> name,
  Value<String> icon,
  Value<String?> level,
  Value<String?> source,
  Value<String?> parentId,
  Value<bool> hidden,
  Value<bool> pinned,
  Value<double?> sortOrder,
  Value<String?> mergedInto,
  Value<String?> template,
  Value<String> fieldsJson,
  Value<int?> taxonomyVersion,
  required int createdAt,
  Value<int> rowid,
});
typedef $$TaxonomyNodesTableUpdateCompanionBuilder = TaxonomyNodesCompanion Function({
  Value<String> id,
  Value<String> workspaceId,
  Value<String> name,
  Value<String> icon,
  Value<String?> level,
  Value<String?> source,
  Value<String?> parentId,
  Value<bool> hidden,
  Value<bool> pinned,
  Value<double?> sortOrder,
  Value<String?> mergedInto,
  Value<String?> template,
  Value<String> fieldsJson,
  Value<int?> taxonomyVersion,
  Value<int> createdAt,
  Value<int> rowid,
});

class $$TaxonomyNodesTableFilterComposer extends Composer<_$NazmDatabase, $TaxonomyNodesTable> {
  $$TaxonomyNodesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get icon => $composableBuilder(column: $table.icon, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get level =>
      $composableBuilder(column: $table.level, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get parentId =>
      $composableBuilder(column: $table.parentId, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get hidden =>
      $composableBuilder(column: $table.hidden, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get pinned =>
      $composableBuilder(column: $table.pinned, builder: (column) => ColumnFilters(column));

  ColumnFilters<double> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get mergedInto =>
      $composableBuilder(column: $table.mergedInto, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get template =>
      $composableBuilder(column: $table.template, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get fieldsJson =>
      $composableBuilder(column: $table.fieldsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get taxonomyVersion =>
      $composableBuilder(column: $table.taxonomyVersion, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$TaxonomyNodesTableOrderingComposer extends Composer<_$NazmDatabase, $TaxonomyNodesTable> {
  $$TaxonomyNodesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get icon =>
      $composableBuilder(column: $table.icon, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get level =>
      $composableBuilder(column: $table.level, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get source =>
      $composableBuilder(column: $table.source, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get parentId =>
      $composableBuilder(column: $table.parentId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get hidden =>
      $composableBuilder(column: $table.hidden, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get pinned =>
      $composableBuilder(column: $table.pinned, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<double> get sortOrder =>
      $composableBuilder(column: $table.sortOrder, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get mergedInto =>
      $composableBuilder(column: $table.mergedInto, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get template =>
      $composableBuilder(column: $table.template, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get fieldsJson =>
      $composableBuilder(column: $table.fieldsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get taxonomyVersion =>
      $composableBuilder(column: $table.taxonomyVersion, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$TaxonomyNodesTableAnnotationComposer extends Composer<_$NazmDatabase, $TaxonomyNodesTable> {
  $$TaxonomyNodesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<String> get name => $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get icon => $composableBuilder(column: $table.icon, builder: (column) => column);

  GeneratedColumn<String> get level => $composableBuilder(column: $table.level, builder: (column) => column);

  GeneratedColumn<String> get source => $composableBuilder(column: $table.source, builder: (column) => column);

  GeneratedColumn<String> get parentId => $composableBuilder(column: $table.parentId, builder: (column) => column);

  GeneratedColumn<bool> get hidden => $composableBuilder(column: $table.hidden, builder: (column) => column);

  GeneratedColumn<bool> get pinned => $composableBuilder(column: $table.pinned, builder: (column) => column);

  GeneratedColumn<double> get sortOrder => $composableBuilder(column: $table.sortOrder, builder: (column) => column);

  GeneratedColumn<String> get mergedInto => $composableBuilder(column: $table.mergedInto, builder: (column) => column);

  GeneratedColumn<String> get template => $composableBuilder(column: $table.template, builder: (column) => column);

  GeneratedColumn<String> get fieldsJson => $composableBuilder(column: $table.fieldsJson, builder: (column) => column);

  GeneratedColumn<int> get taxonomyVersion =>
      $composableBuilder(column: $table.taxonomyVersion, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$TaxonomyNodesTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $TaxonomyNodesTable,
          TaxonomyNodeRow,
          $$TaxonomyNodesTableFilterComposer,
          $$TaxonomyNodesTableOrderingComposer,
          $$TaxonomyNodesTableAnnotationComposer,
          $$TaxonomyNodesTableCreateCompanionBuilder,
          $$TaxonomyNodesTableUpdateCompanionBuilder,
          (TaxonomyNodeRow, BaseReferences<_$NazmDatabase, $TaxonomyNodesTable, TaxonomyNodeRow>),
          TaxonomyNodeRow,
          PrefetchHooks Function()
        > {
  $$TaxonomyNodesTableTableManager(_$NazmDatabase db, $TaxonomyNodesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$TaxonomyNodesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$TaxonomyNodesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$TaxonomyNodesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> workspaceId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> icon = const Value.absent(),
                Value<String?> level = const Value.absent(),
                Value<String?> source = const Value.absent(),
                Value<String?> parentId = const Value.absent(),
                Value<bool> hidden = const Value.absent(),
                Value<bool> pinned = const Value.absent(),
                Value<double?> sortOrder = const Value.absent(),
                Value<String?> mergedInto = const Value.absent(),
                Value<String?> template = const Value.absent(),
                Value<String> fieldsJson = const Value.absent(),
                Value<int?> taxonomyVersion = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => TaxonomyNodesCompanion(
                id: id,
                workspaceId: workspaceId,
                name: name,
                icon: icon,
                level: level,
                source: source,
                parentId: parentId,
                hidden: hidden,
                pinned: pinned,
                sortOrder: sortOrder,
                mergedInto: mergedInto,
                template: template,
                fieldsJson: fieldsJson,
                taxonomyVersion: taxonomyVersion,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> icon = const Value.absent(),
                Value<String?> level = const Value.absent(),
                Value<String?> source = const Value.absent(),
                Value<String?> parentId = const Value.absent(),
                Value<bool> hidden = const Value.absent(),
                Value<bool> pinned = const Value.absent(),
                Value<double?> sortOrder = const Value.absent(),
                Value<String?> mergedInto = const Value.absent(),
                Value<String?> template = const Value.absent(),
                Value<String> fieldsJson = const Value.absent(),
                Value<int?> taxonomyVersion = const Value.absent(),
                required int createdAt,
                Value<int> rowid = const Value.absent(),
              }) => TaxonomyNodesCompanion.insert(
                id: id,
                workspaceId: workspaceId,
                name: name,
                icon: icon,
                level: level,
                source: source,
                parentId: parentId,
                hidden: hidden,
                pinned: pinned,
                sortOrder: sortOrder,
                mergedInto: mergedInto,
                template: template,
                fieldsJson: fieldsJson,
                taxonomyVersion: taxonomyVersion,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$TaxonomyNodesTable, TaxonomyNodeRow>(table),
                  BaseReferences<_$NazmDatabase, $TaxonomyNodesTable, TaxonomyNodeRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$TaxonomyNodesTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $TaxonomyNodesTable,
      TaxonomyNodeRow,
      $$TaxonomyNodesTableFilterComposer,
      $$TaxonomyNodesTableOrderingComposer,
      $$TaxonomyNodesTableAnnotationComposer,
      $$TaxonomyNodesTableCreateCompanionBuilder,
      $$TaxonomyNodesTableUpdateCompanionBuilder,
      (TaxonomyNodeRow, BaseReferences<_$NazmDatabase, $TaxonomyNodesTable, TaxonomyNodeRow>),
      TaxonomyNodeRow,
      PrefetchHooks Function()
    >;
typedef $$FieldDefinitionsTableCreateCompanionBuilder = FieldDefinitionsCompanion Function({
  required String id,
  Value<String> workspaceId,
  required String type,
  required String label,
  required String definitionJson,
  Value<bool> retired,
  Value<int?> retiredAt,
  Value<bool> recovered,
  Value<String?> originalTaxonomyNodeId,
  required int createdAt,
  Value<int> rowid,
});
typedef $$FieldDefinitionsTableUpdateCompanionBuilder = FieldDefinitionsCompanion Function({
  Value<String> id,
  Value<String> workspaceId,
  Value<String> type,
  Value<String> label,
  Value<String> definitionJson,
  Value<bool> retired,
  Value<int?> retiredAt,
  Value<bool> recovered,
  Value<String?> originalTaxonomyNodeId,
  Value<int> createdAt,
  Value<int> rowid,
});

class $$FieldDefinitionsTableFilterComposer extends Composer<_$NazmDatabase, $FieldDefinitionsTable> {
  $$FieldDefinitionsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get type => $composableBuilder(column: $table.type, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get label =>
      $composableBuilder(column: $table.label, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get definitionJson =>
      $composableBuilder(column: $table.definitionJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get retired =>
      $composableBuilder(column: $table.retired, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get retiredAt =>
      $composableBuilder(column: $table.retiredAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<bool> get recovered =>
      $composableBuilder(column: $table.recovered, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get originalTaxonomyNodeId =>
      $composableBuilder(column: $table.originalTaxonomyNodeId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$FieldDefinitionsTableOrderingComposer extends Composer<_$NazmDatabase, $FieldDefinitionsTable> {
  $$FieldDefinitionsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get type =>
      $composableBuilder(column: $table.type, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get label =>
      $composableBuilder(column: $table.label, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get definitionJson =>
      $composableBuilder(column: $table.definitionJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get retired =>
      $composableBuilder(column: $table.retired, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get retiredAt =>
      $composableBuilder(column: $table.retiredAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<bool> get recovered =>
      $composableBuilder(column: $table.recovered, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get originalTaxonomyNodeId =>
      $composableBuilder(column: $table.originalTaxonomyNodeId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$FieldDefinitionsTableAnnotationComposer extends Composer<_$NazmDatabase, $FieldDefinitionsTable> {
  $$FieldDefinitionsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<String> get type => $composableBuilder(column: $table.type, builder: (column) => column);

  GeneratedColumn<String> get label => $composableBuilder(column: $table.label, builder: (column) => column);

  GeneratedColumn<String> get definitionJson =>
      $composableBuilder(column: $table.definitionJson, builder: (column) => column);

  GeneratedColumn<bool> get retired => $composableBuilder(column: $table.retired, builder: (column) => column);

  GeneratedColumn<int> get retiredAt => $composableBuilder(column: $table.retiredAt, builder: (column) => column);

  GeneratedColumn<bool> get recovered => $composableBuilder(column: $table.recovered, builder: (column) => column);

  GeneratedColumn<String> get originalTaxonomyNodeId =>
      $composableBuilder(column: $table.originalTaxonomyNodeId, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$FieldDefinitionsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $FieldDefinitionsTable,
          FieldDefinitionRow,
          $$FieldDefinitionsTableFilterComposer,
          $$FieldDefinitionsTableOrderingComposer,
          $$FieldDefinitionsTableAnnotationComposer,
          $$FieldDefinitionsTableCreateCompanionBuilder,
          $$FieldDefinitionsTableUpdateCompanionBuilder,
          (FieldDefinitionRow, BaseReferences<_$NazmDatabase, $FieldDefinitionsTable, FieldDefinitionRow>),
          FieldDefinitionRow,
          PrefetchHooks Function()
        > {
  $$FieldDefinitionsTableTableManager(_$NazmDatabase db, $FieldDefinitionsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$FieldDefinitionsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$FieldDefinitionsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$FieldDefinitionsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> workspaceId = const Value.absent(),
                Value<String> type = const Value.absent(),
                Value<String> label = const Value.absent(),
                Value<String> definitionJson = const Value.absent(),
                Value<bool> retired = const Value.absent(),
                Value<int?> retiredAt = const Value.absent(),
                Value<bool> recovered = const Value.absent(),
                Value<String?> originalTaxonomyNodeId = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FieldDefinitionsCompanion(
                id: id,
                workspaceId: workspaceId,
                type: type,
                label: label,
                definitionJson: definitionJson,
                retired: retired,
                retiredAt: retiredAt,
                recovered: recovered,
                originalTaxonomyNodeId: originalTaxonomyNodeId,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceId = const Value.absent(),
                required String type,
                required String label,
                required String definitionJson,
                Value<bool> retired = const Value.absent(),
                Value<int?> retiredAt = const Value.absent(),
                Value<bool> recovered = const Value.absent(),
                Value<String?> originalTaxonomyNodeId = const Value.absent(),
                required int createdAt,
                Value<int> rowid = const Value.absent(),
              }) => FieldDefinitionsCompanion.insert(
                id: id,
                workspaceId: workspaceId,
                type: type,
                label: label,
                definitionJson: definitionJson,
                retired: retired,
                retiredAt: retiredAt,
                recovered: recovered,
                originalTaxonomyNodeId: originalTaxonomyNodeId,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$FieldDefinitionsTable, FieldDefinitionRow>(table),
                  BaseReferences<_$NazmDatabase, $FieldDefinitionsTable, FieldDefinitionRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$FieldDefinitionsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $FieldDefinitionsTable,
      FieldDefinitionRow,
      $$FieldDefinitionsTableFilterComposer,
      $$FieldDefinitionsTableOrderingComposer,
      $$FieldDefinitionsTableAnnotationComposer,
      $$FieldDefinitionsTableCreateCompanionBuilder,
      $$FieldDefinitionsTableUpdateCompanionBuilder,
      (FieldDefinitionRow, BaseReferences<_$NazmDatabase, $FieldDefinitionsTable, FieldDefinitionRow>),
      FieldDefinitionRow,
      PrefetchHooks Function()
    >;
typedef $$CustomCatalogEntitiesTableCreateCompanionBuilder = CustomCatalogEntitiesCompanion Function({
  required String id,
  Value<String> workspaceId,
  required String domainsJson,
  required String entityType,
  Value<String?> parentId,
  Value<String> nameAr,
  Value<String> nameEn,
  Value<String> aliasesArJson,
  Value<String> aliasesEnJson,
  Value<String?> code,
  Value<String> metadataJson,
  Value<String> status,
  Value<String?> redirectTo,
  Value<String> sortKey,
  Value<int?> createdAt,
  Value<int?> updatedAt,
  Value<int?> retiredAt,
  Value<int> rowid,
});
typedef $$CustomCatalogEntitiesTableUpdateCompanionBuilder = CustomCatalogEntitiesCompanion Function({
  Value<String> id,
  Value<String> workspaceId,
  Value<String> domainsJson,
  Value<String> entityType,
  Value<String?> parentId,
  Value<String> nameAr,
  Value<String> nameEn,
  Value<String> aliasesArJson,
  Value<String> aliasesEnJson,
  Value<String?> code,
  Value<String> metadataJson,
  Value<String> status,
  Value<String?> redirectTo,
  Value<String> sortKey,
  Value<int?> createdAt,
  Value<int?> updatedAt,
  Value<int?> retiredAt,
  Value<int> rowid,
});

class $$CustomCatalogEntitiesTableFilterComposer extends Composer<_$NazmDatabase, $CustomCatalogEntitiesTable> {
  $$CustomCatalogEntitiesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get domainsJson =>
      $composableBuilder(column: $table.domainsJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get entityType =>
      $composableBuilder(column: $table.entityType, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get parentId =>
      $composableBuilder(column: $table.parentId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get nameAr =>
      $composableBuilder(column: $table.nameAr, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get nameEn =>
      $composableBuilder(column: $table.nameEn, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get aliasesArJson =>
      $composableBuilder(column: $table.aliasesArJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get aliasesEnJson =>
      $composableBuilder(column: $table.aliasesEnJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get code => $composableBuilder(column: $table.code, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get metadataJson =>
      $composableBuilder(column: $table.metadataJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get redirectTo =>
      $composableBuilder(column: $table.redirectTo, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sortKey =>
      $composableBuilder(column: $table.sortKey, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get retiredAt =>
      $composableBuilder(column: $table.retiredAt, builder: (column) => ColumnFilters(column));
}

class $$CustomCatalogEntitiesTableOrderingComposer extends Composer<_$NazmDatabase, $CustomCatalogEntitiesTable> {
  $$CustomCatalogEntitiesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get domainsJson =>
      $composableBuilder(column: $table.domainsJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get entityType =>
      $composableBuilder(column: $table.entityType, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get parentId =>
      $composableBuilder(column: $table.parentId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get nameAr =>
      $composableBuilder(column: $table.nameAr, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get nameEn =>
      $composableBuilder(column: $table.nameEn, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get aliasesArJson =>
      $composableBuilder(column: $table.aliasesArJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get aliasesEnJson =>
      $composableBuilder(column: $table.aliasesEnJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get code =>
      $composableBuilder(column: $table.code, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get metadataJson =>
      $composableBuilder(column: $table.metadataJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get redirectTo =>
      $composableBuilder(column: $table.redirectTo, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sortKey =>
      $composableBuilder(column: $table.sortKey, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get retiredAt =>
      $composableBuilder(column: $table.retiredAt, builder: (column) => ColumnOrderings(column));
}

class $$CustomCatalogEntitiesTableAnnotationComposer extends Composer<_$NazmDatabase, $CustomCatalogEntitiesTable> {
  $$CustomCatalogEntitiesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<String> get domainsJson =>
      $composableBuilder(column: $table.domainsJson, builder: (column) => column);

  GeneratedColumn<String> get entityType => $composableBuilder(column: $table.entityType, builder: (column) => column);

  GeneratedColumn<String> get parentId => $composableBuilder(column: $table.parentId, builder: (column) => column);

  GeneratedColumn<String> get nameAr => $composableBuilder(column: $table.nameAr, builder: (column) => column);

  GeneratedColumn<String> get nameEn => $composableBuilder(column: $table.nameEn, builder: (column) => column);

  GeneratedColumn<String> get aliasesArJson =>
      $composableBuilder(column: $table.aliasesArJson, builder: (column) => column);

  GeneratedColumn<String> get aliasesEnJson =>
      $composableBuilder(column: $table.aliasesEnJson, builder: (column) => column);

  GeneratedColumn<String> get code => $composableBuilder(column: $table.code, builder: (column) => column);

  GeneratedColumn<String> get metadataJson =>
      $composableBuilder(column: $table.metadataJson, builder: (column) => column);

  GeneratedColumn<String> get status => $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get redirectTo => $composableBuilder(column: $table.redirectTo, builder: (column) => column);

  GeneratedColumn<String> get sortKey => $composableBuilder(column: $table.sortKey, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt => $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<int> get retiredAt => $composableBuilder(column: $table.retiredAt, builder: (column) => column);
}

class $$CustomCatalogEntitiesTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $CustomCatalogEntitiesTable,
          CustomCatalogEntityRow,
          $$CustomCatalogEntitiesTableFilterComposer,
          $$CustomCatalogEntitiesTableOrderingComposer,
          $$CustomCatalogEntitiesTableAnnotationComposer,
          $$CustomCatalogEntitiesTableCreateCompanionBuilder,
          $$CustomCatalogEntitiesTableUpdateCompanionBuilder,
          (CustomCatalogEntityRow, BaseReferences<_$NazmDatabase, $CustomCatalogEntitiesTable, CustomCatalogEntityRow>),
          CustomCatalogEntityRow,
          PrefetchHooks Function()
        > {
  $$CustomCatalogEntitiesTableTableManager(_$NazmDatabase db, $CustomCatalogEntitiesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$CustomCatalogEntitiesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$CustomCatalogEntitiesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$CustomCatalogEntitiesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> workspaceId = const Value.absent(),
                Value<String> domainsJson = const Value.absent(),
                Value<String> entityType = const Value.absent(),
                Value<String?> parentId = const Value.absent(),
                Value<String> nameAr = const Value.absent(),
                Value<String> nameEn = const Value.absent(),
                Value<String> aliasesArJson = const Value.absent(),
                Value<String> aliasesEnJson = const Value.absent(),
                Value<String?> code = const Value.absent(),
                Value<String> metadataJson = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> redirectTo = const Value.absent(),
                Value<String> sortKey = const Value.absent(),
                Value<int?> createdAt = const Value.absent(),
                Value<int?> updatedAt = const Value.absent(),
                Value<int?> retiredAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CustomCatalogEntitiesCompanion(
                id: id,
                workspaceId: workspaceId,
                domainsJson: domainsJson,
                entityType: entityType,
                parentId: parentId,
                nameAr: nameAr,
                nameEn: nameEn,
                aliasesArJson: aliasesArJson,
                aliasesEnJson: aliasesEnJson,
                code: code,
                metadataJson: metadataJson,
                status: status,
                redirectTo: redirectTo,
                sortKey: sortKey,
                createdAt: createdAt,
                updatedAt: updatedAt,
                retiredAt: retiredAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceId = const Value.absent(),
                required String domainsJson,
                required String entityType,
                Value<String?> parentId = const Value.absent(),
                Value<String> nameAr = const Value.absent(),
                Value<String> nameEn = const Value.absent(),
                Value<String> aliasesArJson = const Value.absent(),
                Value<String> aliasesEnJson = const Value.absent(),
                Value<String?> code = const Value.absent(),
                Value<String> metadataJson = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String?> redirectTo = const Value.absent(),
                Value<String> sortKey = const Value.absent(),
                Value<int?> createdAt = const Value.absent(),
                Value<int?> updatedAt = const Value.absent(),
                Value<int?> retiredAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CustomCatalogEntitiesCompanion.insert(
                id: id,
                workspaceId: workspaceId,
                domainsJson: domainsJson,
                entityType: entityType,
                parentId: parentId,
                nameAr: nameAr,
                nameEn: nameEn,
                aliasesArJson: aliasesArJson,
                aliasesEnJson: aliasesEnJson,
                code: code,
                metadataJson: metadataJson,
                status: status,
                redirectTo: redirectTo,
                sortKey: sortKey,
                createdAt: createdAt,
                updatedAt: updatedAt,
                retiredAt: retiredAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CustomCatalogEntitiesTable, CustomCatalogEntityRow>(table),
                  BaseReferences<_$NazmDatabase, $CustomCatalogEntitiesTable, CustomCatalogEntityRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CustomCatalogEntitiesTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $CustomCatalogEntitiesTable,
      CustomCatalogEntityRow,
      $$CustomCatalogEntitiesTableFilterComposer,
      $$CustomCatalogEntitiesTableOrderingComposer,
      $$CustomCatalogEntitiesTableAnnotationComposer,
      $$CustomCatalogEntitiesTableCreateCompanionBuilder,
      $$CustomCatalogEntitiesTableUpdateCompanionBuilder,
      (CustomCatalogEntityRow, BaseReferences<_$NazmDatabase, $CustomCatalogEntitiesTable, CustomCatalogEntityRow>),
      CustomCatalogEntityRow,
      PrefetchHooks Function()
    >;
typedef $$LocationsTableCreateCompanionBuilder = LocationsCompanion Function({
  required String id,
  Value<String> workspaceId,
  required String name,
  required int createdAt,
  Value<int> rowid,
});
typedef $$LocationsTableUpdateCompanionBuilder = LocationsCompanion Function({
  Value<String> id,
  Value<String> workspaceId,
  Value<String> name,
  Value<int> createdAt,
  Value<int> rowid,
});

class $$LocationsTableFilterComposer extends Composer<_$NazmDatabase, $LocationsTable> {
  $$LocationsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$LocationsTableOrderingComposer extends Composer<_$NazmDatabase, $LocationsTable> {
  $$LocationsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$LocationsTableAnnotationComposer extends Composer<_$NazmDatabase, $LocationsTable> {
  $$LocationsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<String> get name => $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$LocationsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $LocationsTable,
          LocationRow,
          $$LocationsTableFilterComposer,
          $$LocationsTableOrderingComposer,
          $$LocationsTableAnnotationComposer,
          $$LocationsTableCreateCompanionBuilder,
          $$LocationsTableUpdateCompanionBuilder,
          (LocationRow, BaseReferences<_$NazmDatabase, $LocationsTable, LocationRow>),
          LocationRow,
          PrefetchHooks Function()
        > {
  $$LocationsTableTableManager(_$NazmDatabase db, $LocationsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$LocationsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$LocationsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$LocationsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> workspaceId = const Value.absent(),
            Value<String> name = const Value.absent(),
            Value<int> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => LocationsCompanion(id: id, workspaceId: workspaceId, name: name, createdAt: createdAt, rowid: rowid),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceId = const Value.absent(),
                required String name,
                required int createdAt,
                Value<int> rowid = const Value.absent(),
              }) => LocationsCompanion.insert(
                id: id,
                workspaceId: workspaceId,
                name: name,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$LocationsTable, LocationRow>(table),
                  BaseReferences<_$NazmDatabase, $LocationsTable, LocationRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LocationsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $LocationsTable,
      LocationRow,
      $$LocationsTableFilterComposer,
      $$LocationsTableOrderingComposer,
      $$LocationsTableAnnotationComposer,
      $$LocationsTableCreateCompanionBuilder,
      $$LocationsTableUpdateCompanionBuilder,
      (LocationRow, BaseReferences<_$NazmDatabase, $LocationsTable, LocationRow>),
      LocationRow,
      PrefetchHooks Function()
    >;
typedef $$FoldersTableCreateCompanionBuilder = FoldersCompanion Function({
  required String id,
  Value<String> workspaceId,
  required String name,
  Value<String> description,
  Value<String> icon,
  Value<String> color,
  required int createdAt,
  Value<String?> createdBy,
  required int updatedAt,
  Value<int> rowid,
});
typedef $$FoldersTableUpdateCompanionBuilder = FoldersCompanion Function({
  Value<String> id,
  Value<String> workspaceId,
  Value<String> name,
  Value<String> description,
  Value<String> icon,
  Value<String> color,
  Value<int> createdAt,
  Value<String?> createdBy,
  Value<int> updatedAt,
  Value<int> rowid,
});

class $$FoldersTableFilterComposer extends Composer<_$NazmDatabase, $FoldersTable> {
  $$FoldersTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get name => $composableBuilder(column: $table.name, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get description =>
      $composableBuilder(column: $table.description, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get icon => $composableBuilder(column: $table.icon, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get color =>
      $composableBuilder(column: $table.color, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get createdBy =>
      $composableBuilder(column: $table.createdBy, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$FoldersTableOrderingComposer extends Composer<_$NazmDatabase, $FoldersTable> {
  $$FoldersTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get description =>
      $composableBuilder(column: $table.description, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get icon =>
      $composableBuilder(column: $table.icon, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get color =>
      $composableBuilder(column: $table.color, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get createdBy =>
      $composableBuilder(column: $table.createdBy, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$FoldersTableAnnotationComposer extends Composer<_$NazmDatabase, $FoldersTable> {
  $$FoldersTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<String> get name => $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get description =>
      $composableBuilder(column: $table.description, builder: (column) => column);

  GeneratedColumn<String> get icon => $composableBuilder(column: $table.icon, builder: (column) => column);

  GeneratedColumn<String> get color => $composableBuilder(column: $table.color, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<String> get createdBy => $composableBuilder(column: $table.createdBy, builder: (column) => column);

  GeneratedColumn<int> get updatedAt => $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$FoldersTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $FoldersTable,
          FolderRow,
          $$FoldersTableFilterComposer,
          $$FoldersTableOrderingComposer,
          $$FoldersTableAnnotationComposer,
          $$FoldersTableCreateCompanionBuilder,
          $$FoldersTableUpdateCompanionBuilder,
          (FolderRow, BaseReferences<_$NazmDatabase, $FoldersTable, FolderRow>),
          FolderRow,
          PrefetchHooks Function()
        > {
  $$FoldersTableTableManager(_$NazmDatabase db, $FoldersTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$FoldersTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$FoldersTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$FoldersTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> workspaceId = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> description = const Value.absent(),
                Value<String> icon = const Value.absent(),
                Value<String> color = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<String?> createdBy = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => FoldersCompanion(
                id: id,
                workspaceId: workspaceId,
                name: name,
                description: description,
                icon: icon,
                color: color,
                createdAt: createdAt,
                createdBy: createdBy,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceId = const Value.absent(),
                required String name,
                Value<String> description = const Value.absent(),
                Value<String> icon = const Value.absent(),
                Value<String> color = const Value.absent(),
                required int createdAt,
                Value<String?> createdBy = const Value.absent(),
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => FoldersCompanion.insert(
                id: id,
                workspaceId: workspaceId,
                name: name,
                description: description,
                icon: icon,
                color: color,
                createdAt: createdAt,
                createdBy: createdBy,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$FoldersTable, FolderRow>(table),
                  BaseReferences<_$NazmDatabase, $FoldersTable, FolderRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$FoldersTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $FoldersTable,
      FolderRow,
      $$FoldersTableFilterComposer,
      $$FoldersTableOrderingComposer,
      $$FoldersTableAnnotationComposer,
      $$FoldersTableCreateCompanionBuilder,
      $$FoldersTableUpdateCompanionBuilder,
      (FolderRow, BaseReferences<_$NazmDatabase, $FoldersTable, FolderRow>),
      FolderRow,
      PrefetchHooks Function()
    >;
typedef $$MediaAssetsTableCreateCompanionBuilder = MediaAssetsCompanion Function({
  required String id,
  Value<String> workspaceId,
  Value<String?> relativePath,
  Value<String?> thumbnailPath,
  Value<String?> mimeType,
  Value<int?> fileSize,
  Value<int?> width,
  Value<int?> height,
  Value<String?> sha256,
  Value<String?> originalFilename,
  Value<int> refCount,
  Value<int?> orphanedAt,
  required int createdAt,
  Value<int> rowid,
});
typedef $$MediaAssetsTableUpdateCompanionBuilder = MediaAssetsCompanion Function({
  Value<String> id,
  Value<String> workspaceId,
  Value<String?> relativePath,
  Value<String?> thumbnailPath,
  Value<String?> mimeType,
  Value<int?> fileSize,
  Value<int?> width,
  Value<int?> height,
  Value<String?> sha256,
  Value<String?> originalFilename,
  Value<int> refCount,
  Value<int?> orphanedAt,
  Value<int> createdAt,
  Value<int> rowid,
});

class $$MediaAssetsTableFilterComposer extends Composer<_$NazmDatabase, $MediaAssetsTable> {
  $$MediaAssetsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get relativePath =>
      $composableBuilder(column: $table.relativePath, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get thumbnailPath =>
      $composableBuilder(column: $table.thumbnailPath, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get mimeType =>
      $composableBuilder(column: $table.mimeType, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get fileSize =>
      $composableBuilder(column: $table.fileSize, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get width => $composableBuilder(column: $table.width, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get height =>
      $composableBuilder(column: $table.height, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get originalFilename =>
      $composableBuilder(column: $table.originalFilename, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get refCount =>
      $composableBuilder(column: $table.refCount, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get orphanedAt =>
      $composableBuilder(column: $table.orphanedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$MediaAssetsTableOrderingComposer extends Composer<_$NazmDatabase, $MediaAssetsTable> {
  $$MediaAssetsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get relativePath =>
      $composableBuilder(column: $table.relativePath, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get thumbnailPath =>
      $composableBuilder(column: $table.thumbnailPath, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get mimeType =>
      $composableBuilder(column: $table.mimeType, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get fileSize =>
      $composableBuilder(column: $table.fileSize, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get width =>
      $composableBuilder(column: $table.width, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get height =>
      $composableBuilder(column: $table.height, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get sha256 =>
      $composableBuilder(column: $table.sha256, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get originalFilename =>
      $composableBuilder(column: $table.originalFilename, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get refCount =>
      $composableBuilder(column: $table.refCount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get orphanedAt =>
      $composableBuilder(column: $table.orphanedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$MediaAssetsTableAnnotationComposer extends Composer<_$NazmDatabase, $MediaAssetsTable> {
  $$MediaAssetsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<String> get relativePath =>
      $composableBuilder(column: $table.relativePath, builder: (column) => column);

  GeneratedColumn<String> get thumbnailPath =>
      $composableBuilder(column: $table.thumbnailPath, builder: (column) => column);

  GeneratedColumn<String> get mimeType => $composableBuilder(column: $table.mimeType, builder: (column) => column);

  GeneratedColumn<int> get fileSize => $composableBuilder(column: $table.fileSize, builder: (column) => column);

  GeneratedColumn<int> get width => $composableBuilder(column: $table.width, builder: (column) => column);

  GeneratedColumn<int> get height => $composableBuilder(column: $table.height, builder: (column) => column);

  GeneratedColumn<String> get sha256 => $composableBuilder(column: $table.sha256, builder: (column) => column);

  GeneratedColumn<String> get originalFilename =>
      $composableBuilder(column: $table.originalFilename, builder: (column) => column);

  GeneratedColumn<int> get refCount => $composableBuilder(column: $table.refCount, builder: (column) => column);

  GeneratedColumn<int> get orphanedAt => $composableBuilder(column: $table.orphanedAt, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$MediaAssetsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $MediaAssetsTable,
          MediaAssetRow,
          $$MediaAssetsTableFilterComposer,
          $$MediaAssetsTableOrderingComposer,
          $$MediaAssetsTableAnnotationComposer,
          $$MediaAssetsTableCreateCompanionBuilder,
          $$MediaAssetsTableUpdateCompanionBuilder,
          (MediaAssetRow, BaseReferences<_$NazmDatabase, $MediaAssetsTable, MediaAssetRow>),
          MediaAssetRow,
          PrefetchHooks Function()
        > {
  $$MediaAssetsTableTableManager(_$NazmDatabase db, $MediaAssetsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$MediaAssetsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$MediaAssetsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$MediaAssetsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> workspaceId = const Value.absent(),
                Value<String?> relativePath = const Value.absent(),
                Value<String?> thumbnailPath = const Value.absent(),
                Value<String?> mimeType = const Value.absent(),
                Value<int?> fileSize = const Value.absent(),
                Value<int?> width = const Value.absent(),
                Value<int?> height = const Value.absent(),
                Value<String?> sha256 = const Value.absent(),
                Value<String?> originalFilename = const Value.absent(),
                Value<int> refCount = const Value.absent(),
                Value<int?> orphanedAt = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => MediaAssetsCompanion(
                id: id,
                workspaceId: workspaceId,
                relativePath: relativePath,
                thumbnailPath: thumbnailPath,
                mimeType: mimeType,
                fileSize: fileSize,
                width: width,
                height: height,
                sha256: sha256,
                originalFilename: originalFilename,
                refCount: refCount,
                orphanedAt: orphanedAt,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceId = const Value.absent(),
                Value<String?> relativePath = const Value.absent(),
                Value<String?> thumbnailPath = const Value.absent(),
                Value<String?> mimeType = const Value.absent(),
                Value<int?> fileSize = const Value.absent(),
                Value<int?> width = const Value.absent(),
                Value<int?> height = const Value.absent(),
                Value<String?> sha256 = const Value.absent(),
                Value<String?> originalFilename = const Value.absent(),
                Value<int> refCount = const Value.absent(),
                Value<int?> orphanedAt = const Value.absent(),
                required int createdAt,
                Value<int> rowid = const Value.absent(),
              }) => MediaAssetsCompanion.insert(
                id: id,
                workspaceId: workspaceId,
                relativePath: relativePath,
                thumbnailPath: thumbnailPath,
                mimeType: mimeType,
                fileSize: fileSize,
                width: width,
                height: height,
                sha256: sha256,
                originalFilename: originalFilename,
                refCount: refCount,
                orphanedAt: orphanedAt,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$MediaAssetsTable, MediaAssetRow>(table),
                  BaseReferences<_$NazmDatabase, $MediaAssetsTable, MediaAssetRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$MediaAssetsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $MediaAssetsTable,
      MediaAssetRow,
      $$MediaAssetsTableFilterComposer,
      $$MediaAssetsTableOrderingComposer,
      $$MediaAssetsTableAnnotationComposer,
      $$MediaAssetsTableCreateCompanionBuilder,
      $$MediaAssetsTableUpdateCompanionBuilder,
      (MediaAssetRow, BaseReferences<_$NazmDatabase, $MediaAssetsTable, MediaAssetRow>),
      MediaAssetRow,
      PrefetchHooks Function()
    >;
typedef $$ActivityTableCreateCompanionBuilder = ActivityCompanion Function({
  required String id,
  Value<String> workspaceId,
  required int timestamp,
  required String kind,
  Value<String> dataJson,
  Value<int> rowid,
});
typedef $$ActivityTableUpdateCompanionBuilder = ActivityCompanion Function({
  Value<String> id,
  Value<String> workspaceId,
  Value<int> timestamp,
  Value<String> kind,
  Value<String> dataJson,
  Value<int> rowid,
});

class $$ActivityTableFilterComposer extends Composer<_$NazmDatabase, $ActivityTable> {
  $$ActivityTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get timestamp =>
      $composableBuilder(column: $table.timestamp, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kind => $composableBuilder(column: $table.kind, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get dataJson =>
      $composableBuilder(column: $table.dataJson, builder: (column) => ColumnFilters(column));
}

class $$ActivityTableOrderingComposer extends Composer<_$NazmDatabase, $ActivityTable> {
  $$ActivityTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get timestamp =>
      $composableBuilder(column: $table.timestamp, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get dataJson =>
      $composableBuilder(column: $table.dataJson, builder: (column) => ColumnOrderings(column));
}

class $$ActivityTableAnnotationComposer extends Composer<_$NazmDatabase, $ActivityTable> {
  $$ActivityTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<int> get timestamp => $composableBuilder(column: $table.timestamp, builder: (column) => column);

  GeneratedColumn<String> get kind => $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get dataJson => $composableBuilder(column: $table.dataJson, builder: (column) => column);
}

class $$ActivityTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $ActivityTable,
          ActivityRow,
          $$ActivityTableFilterComposer,
          $$ActivityTableOrderingComposer,
          $$ActivityTableAnnotationComposer,
          $$ActivityTableCreateCompanionBuilder,
          $$ActivityTableUpdateCompanionBuilder,
          (ActivityRow, BaseReferences<_$NazmDatabase, $ActivityTable, ActivityRow>),
          ActivityRow,
          PrefetchHooks Function()
        > {
  $$ActivityTableTableManager(_$NazmDatabase db, $ActivityTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$ActivityTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$ActivityTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$ActivityTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> workspaceId = const Value.absent(),
                Value<int> timestamp = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> dataJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ActivityCompanion(
                id: id,
                workspaceId: workspaceId,
                timestamp: timestamp,
                kind: kind,
                dataJson: dataJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceId = const Value.absent(),
                required int timestamp,
                required String kind,
                Value<String> dataJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ActivityCompanion.insert(
                id: id,
                workspaceId: workspaceId,
                timestamp: timestamp,
                kind: kind,
                dataJson: dataJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ActivityTable, ActivityRow>(table),
                  BaseReferences<_$NazmDatabase, $ActivityTable, ActivityRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ActivityTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $ActivityTable,
      ActivityRow,
      $$ActivityTableFilterComposer,
      $$ActivityTableOrderingComposer,
      $$ActivityTableAnnotationComposer,
      $$ActivityTableCreateCompanionBuilder,
      $$ActivityTableUpdateCompanionBuilder,
      (ActivityRow, BaseReferences<_$NazmDatabase, $ActivityTable, ActivityRow>),
      ActivityRow,
      PrefetchHooks Function()
    >;
typedef $$SettingsTableCreateCompanionBuilder = SettingsCompanion Function({
  required String key,
  required String valueJson,
  Value<int> rowid,
});
typedef $$SettingsTableUpdateCompanionBuilder = SettingsCompanion Function({
  Value<String> key,
  Value<String> valueJson,
  Value<int> rowid,
});

class $$SettingsTableFilterComposer extends Composer<_$NazmDatabase, $SettingsTable> {
  $$SettingsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(column: $table.key, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get valueJson =>
      $composableBuilder(column: $table.valueJson, builder: (column) => ColumnFilters(column));
}

class $$SettingsTableOrderingComposer extends Composer<_$NazmDatabase, $SettingsTable> {
  $$SettingsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get valueJson =>
      $composableBuilder(column: $table.valueJson, builder: (column) => ColumnOrderings(column));
}

class $$SettingsTableAnnotationComposer extends Composer<_$NazmDatabase, $SettingsTable> {
  $$SettingsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key => $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<String> get valueJson => $composableBuilder(column: $table.valueJson, builder: (column) => column);
}

class $$SettingsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $SettingsTable,
          SettingRow,
          $$SettingsTableFilterComposer,
          $$SettingsTableOrderingComposer,
          $$SettingsTableAnnotationComposer,
          $$SettingsTableCreateCompanionBuilder,
          $$SettingsTableUpdateCompanionBuilder,
          (SettingRow, BaseReferences<_$NazmDatabase, $SettingsTable, SettingRow>),
          SettingRow,
          PrefetchHooks Function()
        > {
  $$SettingsTableTableManager(_$NazmDatabase db, $SettingsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$SettingsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$SettingsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$SettingsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<String> valueJson = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => SettingsCompanion(key: key, valueJson: valueJson, rowid: rowid),
          createCompanionCallback: ({
            required String key,
            required String valueJson,
            Value<int> rowid = const Value.absent(),
          }) => SettingsCompanion.insert(key: key, valueJson: valueJson, rowid: rowid),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$SettingsTable, SettingRow>(table),
                  BaseReferences<_$NazmDatabase, $SettingsTable, SettingRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SettingsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $SettingsTable,
      SettingRow,
      $$SettingsTableFilterComposer,
      $$SettingsTableOrderingComposer,
      $$SettingsTableAnnotationComposer,
      $$SettingsTableCreateCompanionBuilder,
      $$SettingsTableUpdateCompanionBuilder,
      (SettingRow, BaseReferences<_$NazmDatabase, $SettingsTable, SettingRow>),
      SettingRow,
      PrefetchHooks Function()
    >;
typedef $$AggregatesTableCreateCompanionBuilder = AggregatesCompanion Function({
  required String key,
  required int schema,
  required String dataJson,
  Value<int?> builtAt,
  Value<int> rowid,
});
typedef $$AggregatesTableUpdateCompanionBuilder = AggregatesCompanion Function({
  Value<String> key,
  Value<int> schema,
  Value<String> dataJson,
  Value<int?> builtAt,
  Value<int> rowid,
});

class $$AggregatesTableFilterComposer extends Composer<_$NazmDatabase, $AggregatesTable> {
  $$AggregatesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get key => $composableBuilder(column: $table.key, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get schema =>
      $composableBuilder(column: $table.schema, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get dataJson =>
      $composableBuilder(column: $table.dataJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get builtAt =>
      $composableBuilder(column: $table.builtAt, builder: (column) => ColumnFilters(column));
}

class $$AggregatesTableOrderingComposer extends Composer<_$NazmDatabase, $AggregatesTable> {
  $$AggregatesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get key =>
      $composableBuilder(column: $table.key, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get schema =>
      $composableBuilder(column: $table.schema, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get dataJson =>
      $composableBuilder(column: $table.dataJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get builtAt =>
      $composableBuilder(column: $table.builtAt, builder: (column) => ColumnOrderings(column));
}

class $$AggregatesTableAnnotationComposer extends Composer<_$NazmDatabase, $AggregatesTable> {
  $$AggregatesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get key => $composableBuilder(column: $table.key, builder: (column) => column);

  GeneratedColumn<int> get schema => $composableBuilder(column: $table.schema, builder: (column) => column);

  GeneratedColumn<String> get dataJson => $composableBuilder(column: $table.dataJson, builder: (column) => column);

  GeneratedColumn<int> get builtAt => $composableBuilder(column: $table.builtAt, builder: (column) => column);
}

class $$AggregatesTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $AggregatesTable,
          AggregateRow,
          $$AggregatesTableFilterComposer,
          $$AggregatesTableOrderingComposer,
          $$AggregatesTableAnnotationComposer,
          $$AggregatesTableCreateCompanionBuilder,
          $$AggregatesTableUpdateCompanionBuilder,
          (AggregateRow, BaseReferences<_$NazmDatabase, $AggregatesTable, AggregateRow>),
          AggregateRow,
          PrefetchHooks Function()
        > {
  $$AggregatesTableTableManager(_$NazmDatabase db, $AggregatesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$AggregatesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$AggregatesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$AggregatesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> key = const Value.absent(),
            Value<int> schema = const Value.absent(),
            Value<String> dataJson = const Value.absent(),
            Value<int?> builtAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => AggregatesCompanion(key: key, schema: schema, dataJson: dataJson, builtAt: builtAt, rowid: rowid),
          createCompanionCallback:
              ({
                required String key,
                required int schema,
                required String dataJson,
                Value<int?> builtAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => AggregatesCompanion.insert(
                key: key,
                schema: schema,
                dataJson: dataJson,
                builtAt: builtAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$AggregatesTable, AggregateRow>(table),
                  BaseReferences<_$NazmDatabase, $AggregatesTable, AggregateRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$AggregatesTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $AggregatesTable,
      AggregateRow,
      $$AggregatesTableFilterComposer,
      $$AggregatesTableOrderingComposer,
      $$AggregatesTableAnnotationComposer,
      $$AggregatesTableCreateCompanionBuilder,
      $$AggregatesTableUpdateCompanionBuilder,
      (AggregateRow, BaseReferences<_$NazmDatabase, $AggregatesTable, AggregateRow>),
      AggregateRow,
      PrefetchHooks Function()
    >;
typedef $$PendingMutationsTableCreateCompanionBuilder = PendingMutationsCompanion Function({
  required String mutationId,
  required String workspaceId,
  required String entityType,
  required String entityId,
  required String operation,
  Value<int?> baseVersion,
  required String payloadJson,
  required int createdAt,
  Value<int> attemptCount,
  Value<String?> lastError,
  required String status,
  Value<int> rowid,
});
typedef $$PendingMutationsTableUpdateCompanionBuilder = PendingMutationsCompanion Function({
  Value<String> mutationId,
  Value<String> workspaceId,
  Value<String> entityType,
  Value<String> entityId,
  Value<String> operation,
  Value<int?> baseVersion,
  Value<String> payloadJson,
  Value<int> createdAt,
  Value<int> attemptCount,
  Value<String?> lastError,
  Value<String> status,
  Value<int> rowid,
});

class $$PendingMutationsTableFilterComposer extends Composer<_$NazmDatabase, $PendingMutationsTable> {
  $$PendingMutationsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get mutationId =>
      $composableBuilder(column: $table.mutationId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get entityType =>
      $composableBuilder(column: $table.entityType, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get operation =>
      $composableBuilder(column: $table.operation, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get baseVersion =>
      $composableBuilder(column: $table.baseVersion, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get payloadJson =>
      $composableBuilder(column: $table.payloadJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get attemptCount =>
      $composableBuilder(column: $table.attemptCount, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => ColumnFilters(column));
}

class $$PendingMutationsTableOrderingComposer extends Composer<_$NazmDatabase, $PendingMutationsTable> {
  $$PendingMutationsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get mutationId =>
      $composableBuilder(column: $table.mutationId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get entityType =>
      $composableBuilder(column: $table.entityType, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get operation =>
      $composableBuilder(column: $table.operation, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get baseVersion =>
      $composableBuilder(column: $table.baseVersion, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get payloadJson =>
      $composableBuilder(column: $table.payloadJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get attemptCount =>
      $composableBuilder(column: $table.attemptCount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get lastError =>
      $composableBuilder(column: $table.lastError, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => ColumnOrderings(column));
}

class $$PendingMutationsTableAnnotationComposer extends Composer<_$NazmDatabase, $PendingMutationsTable> {
  $$PendingMutationsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get mutationId => $composableBuilder(column: $table.mutationId, builder: (column) => column);

  GeneratedColumn<String> get workspaceId =>
      $composableBuilder(column: $table.workspaceId, builder: (column) => column);

  GeneratedColumn<String> get entityType => $composableBuilder(column: $table.entityType, builder: (column) => column);

  GeneratedColumn<String> get entityId => $composableBuilder(column: $table.entityId, builder: (column) => column);

  GeneratedColumn<String> get operation => $composableBuilder(column: $table.operation, builder: (column) => column);

  GeneratedColumn<int> get baseVersion => $composableBuilder(column: $table.baseVersion, builder: (column) => column);

  GeneratedColumn<String> get payloadJson =>
      $composableBuilder(column: $table.payloadJson, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get attemptCount => $composableBuilder(column: $table.attemptCount, builder: (column) => column);

  GeneratedColumn<String> get lastError => $composableBuilder(column: $table.lastError, builder: (column) => column);

  GeneratedColumn<String> get status => $composableBuilder(column: $table.status, builder: (column) => column);
}

class $$PendingMutationsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $PendingMutationsTable,
          PendingMutationRow,
          $$PendingMutationsTableFilterComposer,
          $$PendingMutationsTableOrderingComposer,
          $$PendingMutationsTableAnnotationComposer,
          $$PendingMutationsTableCreateCompanionBuilder,
          $$PendingMutationsTableUpdateCompanionBuilder,
          (PendingMutationRow, BaseReferences<_$NazmDatabase, $PendingMutationsTable, PendingMutationRow>),
          PendingMutationRow,
          PrefetchHooks Function()
        > {
  $$PendingMutationsTableTableManager(_$NazmDatabase db, $PendingMutationsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$PendingMutationsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$PendingMutationsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$PendingMutationsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> mutationId = const Value.absent(),
                Value<String> workspaceId = const Value.absent(),
                Value<String> entityType = const Value.absent(),
                Value<String> entityId = const Value.absent(),
                Value<String> operation = const Value.absent(),
                Value<int?> baseVersion = const Value.absent(),
                Value<String> payloadJson = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> attemptCount = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => PendingMutationsCompanion(
                mutationId: mutationId,
                workspaceId: workspaceId,
                entityType: entityType,
                entityId: entityId,
                operation: operation,
                baseVersion: baseVersion,
                payloadJson: payloadJson,
                createdAt: createdAt,
                attemptCount: attemptCount,
                lastError: lastError,
                status: status,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String mutationId,
                required String workspaceId,
                required String entityType,
                required String entityId,
                required String operation,
                Value<int?> baseVersion = const Value.absent(),
                required String payloadJson,
                required int createdAt,
                Value<int> attemptCount = const Value.absent(),
                Value<String?> lastError = const Value.absent(),
                required String status,
                Value<int> rowid = const Value.absent(),
              }) => PendingMutationsCompanion.insert(
                mutationId: mutationId,
                workspaceId: workspaceId,
                entityType: entityType,
                entityId: entityId,
                operation: operation,
                baseVersion: baseVersion,
                payloadJson: payloadJson,
                createdAt: createdAt,
                attemptCount: attemptCount,
                lastError: lastError,
                status: status,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$PendingMutationsTable, PendingMutationRow>(table),
                  BaseReferences<_$NazmDatabase, $PendingMutationsTable, PendingMutationRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$PendingMutationsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $PendingMutationsTable,
      PendingMutationRow,
      $$PendingMutationsTableFilterComposer,
      $$PendingMutationsTableOrderingComposer,
      $$PendingMutationsTableAnnotationComposer,
      $$PendingMutationsTableCreateCompanionBuilder,
      $$PendingMutationsTableUpdateCompanionBuilder,
      (PendingMutationRow, BaseReferences<_$NazmDatabase, $PendingMutationsTable, PendingMutationRow>),
      PendingMutationRow,
      PrefetchHooks Function()
    >;
typedef $$RestoreJobsTableCreateCompanionBuilder = RestoreJobsCompanion Function({
  required String id,
  required String restoreKey,
  required String status,
  required String stateJson,
  required int startedAt,
  required int updatedAt,
  Value<int> rowid,
});
typedef $$RestoreJobsTableUpdateCompanionBuilder = RestoreJobsCompanion Function({
  Value<String> id,
  Value<String> restoreKey,
  Value<String> status,
  Value<String> stateJson,
  Value<int> startedAt,
  Value<int> updatedAt,
  Value<int> rowid,
});

class $$RestoreJobsTableFilterComposer extends Composer<_$NazmDatabase, $RestoreJobsTable> {
  $$RestoreJobsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get restoreKey =>
      $composableBuilder(column: $table.restoreKey, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get stateJson =>
      $composableBuilder(column: $table.stateJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get startedAt =>
      $composableBuilder(column: $table.startedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$RestoreJobsTableOrderingComposer extends Composer<_$NazmDatabase, $RestoreJobsTable> {
  $$RestoreJobsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get restoreKey =>
      $composableBuilder(column: $table.restoreKey, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get stateJson =>
      $composableBuilder(column: $table.stateJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get startedAt =>
      $composableBuilder(column: $table.startedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$RestoreJobsTableAnnotationComposer extends Composer<_$NazmDatabase, $RestoreJobsTable> {
  $$RestoreJobsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get restoreKey => $composableBuilder(column: $table.restoreKey, builder: (column) => column);

  GeneratedColumn<String> get status => $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get stateJson => $composableBuilder(column: $table.stateJson, builder: (column) => column);

  GeneratedColumn<int> get startedAt => $composableBuilder(column: $table.startedAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt => $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$RestoreJobsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $RestoreJobsTable,
          RestoreJobRow,
          $$RestoreJobsTableFilterComposer,
          $$RestoreJobsTableOrderingComposer,
          $$RestoreJobsTableAnnotationComposer,
          $$RestoreJobsTableCreateCompanionBuilder,
          $$RestoreJobsTableUpdateCompanionBuilder,
          (RestoreJobRow, BaseReferences<_$NazmDatabase, $RestoreJobsTable, RestoreJobRow>),
          RestoreJobRow,
          PrefetchHooks Function()
        > {
  $$RestoreJobsTableTableManager(_$NazmDatabase db, $RestoreJobsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$RestoreJobsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$RestoreJobsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$RestoreJobsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> restoreKey = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String> stateJson = const Value.absent(),
                Value<int> startedAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => RestoreJobsCompanion(
                id: id,
                restoreKey: restoreKey,
                status: status,
                stateJson: stateJson,
                startedAt: startedAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String restoreKey,
                required String status,
                required String stateJson,
                required int startedAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => RestoreJobsCompanion.insert(
                id: id,
                restoreKey: restoreKey,
                status: status,
                stateJson: stateJson,
                startedAt: startedAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$RestoreJobsTable, RestoreJobRow>(table),
                  BaseReferences<_$NazmDatabase, $RestoreJobsTable, RestoreJobRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$RestoreJobsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $RestoreJobsTable,
      RestoreJobRow,
      $$RestoreJobsTableFilterComposer,
      $$RestoreJobsTableOrderingComposer,
      $$RestoreJobsTableAnnotationComposer,
      $$RestoreJobsTableCreateCompanionBuilder,
      $$RestoreJobsTableUpdateCompanionBuilder,
      (RestoreJobRow, BaseReferences<_$NazmDatabase, $RestoreJobsTable, RestoreJobRow>),
      RestoreJobRow,
      PrefetchHooks Function()
    >;
typedef $$RestoreIndexTableCreateCompanionBuilder = RestoreIndexCompanion Function({
  required String job,
  required String collection,
  required String entryId,
});
typedef $$RestoreIndexTableUpdateCompanionBuilder = RestoreIndexCompanion Function({
  Value<String> job,
  Value<String> collection,
  Value<String> entryId,
});

class $$RestoreIndexTableFilterComposer extends Composer<_$NazmDatabase, $RestoreIndexTable> {
  $$RestoreIndexTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get job => $composableBuilder(column: $table.job, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get collection =>
      $composableBuilder(column: $table.collection, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get entryId =>
      $composableBuilder(column: $table.entryId, builder: (column) => ColumnFilters(column));
}

class $$RestoreIndexTableOrderingComposer extends Composer<_$NazmDatabase, $RestoreIndexTable> {
  $$RestoreIndexTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get job =>
      $composableBuilder(column: $table.job, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get collection =>
      $composableBuilder(column: $table.collection, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get entryId =>
      $composableBuilder(column: $table.entryId, builder: (column) => ColumnOrderings(column));
}

class $$RestoreIndexTableAnnotationComposer extends Composer<_$NazmDatabase, $RestoreIndexTable> {
  $$RestoreIndexTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get job => $composableBuilder(column: $table.job, builder: (column) => column);

  GeneratedColumn<String> get collection => $composableBuilder(column: $table.collection, builder: (column) => column);

  GeneratedColumn<String> get entryId => $composableBuilder(column: $table.entryId, builder: (column) => column);
}

class $$RestoreIndexTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $RestoreIndexTable,
          RestoreIndexRow,
          $$RestoreIndexTableFilterComposer,
          $$RestoreIndexTableOrderingComposer,
          $$RestoreIndexTableAnnotationComposer,
          $$RestoreIndexTableCreateCompanionBuilder,
          $$RestoreIndexTableUpdateCompanionBuilder,
          (RestoreIndexRow, BaseReferences<_$NazmDatabase, $RestoreIndexTable, RestoreIndexRow>),
          RestoreIndexRow,
          PrefetchHooks Function()
        > {
  $$RestoreIndexTableTableManager(_$NazmDatabase db, $RestoreIndexTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$RestoreIndexTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$RestoreIndexTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$RestoreIndexTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> job = const Value.absent(),
            Value<String> collection = const Value.absent(),
            Value<String> entryId = const Value.absent(),
          }) => RestoreIndexCompanion(job: job, collection: collection, entryId: entryId),
          createCompanionCallback: ({required String job, required String collection, required String entryId}) =>
              RestoreIndexCompanion.insert(job: job, collection: collection, entryId: entryId),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$RestoreIndexTable, RestoreIndexRow>(table),
                  BaseReferences<_$NazmDatabase, $RestoreIndexTable, RestoreIndexRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$RestoreIndexTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $RestoreIndexTable,
      RestoreIndexRow,
      $$RestoreIndexTableFilterComposer,
      $$RestoreIndexTableOrderingComposer,
      $$RestoreIndexTableAnnotationComposer,
      $$RestoreIndexTableCreateCompanionBuilder,
      $$RestoreIndexTableUpdateCompanionBuilder,
      (RestoreIndexRow, BaseReferences<_$NazmDatabase, $RestoreIndexTable, RestoreIndexRow>),
      RestoreIndexRow,
      PrefetchHooks Function()
    >;
typedef $$WorkIndexTableCreateCompanionBuilder = WorkIndexCompanion Function({
  required String run,
  required String kind,
  required String entryId,
  Value<int> value,
});
typedef $$WorkIndexTableUpdateCompanionBuilder = WorkIndexCompanion Function({
  Value<String> run,
  Value<String> kind,
  Value<String> entryId,
  Value<int> value,
});

class $$WorkIndexTableFilterComposer extends Composer<_$NazmDatabase, $WorkIndexTable> {
  $$WorkIndexTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get run => $composableBuilder(column: $table.run, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kind => $composableBuilder(column: $table.kind, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get entryId =>
      $composableBuilder(column: $table.entryId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get value => $composableBuilder(column: $table.value, builder: (column) => ColumnFilters(column));
}

class $$WorkIndexTableOrderingComposer extends Composer<_$NazmDatabase, $WorkIndexTable> {
  $$WorkIndexTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get run =>
      $composableBuilder(column: $table.run, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get entryId =>
      $composableBuilder(column: $table.entryId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get value =>
      $composableBuilder(column: $table.value, builder: (column) => ColumnOrderings(column));
}

class $$WorkIndexTableAnnotationComposer extends Composer<_$NazmDatabase, $WorkIndexTable> {
  $$WorkIndexTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get run => $composableBuilder(column: $table.run, builder: (column) => column);

  GeneratedColumn<String> get kind => $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get entryId => $composableBuilder(column: $table.entryId, builder: (column) => column);

  GeneratedColumn<int> get value => $composableBuilder(column: $table.value, builder: (column) => column);
}

class $$WorkIndexTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $WorkIndexTable,
          WorkIndexRow,
          $$WorkIndexTableFilterComposer,
          $$WorkIndexTableOrderingComposer,
          $$WorkIndexTableAnnotationComposer,
          $$WorkIndexTableCreateCompanionBuilder,
          $$WorkIndexTableUpdateCompanionBuilder,
          (WorkIndexRow, BaseReferences<_$NazmDatabase, $WorkIndexTable, WorkIndexRow>),
          WorkIndexRow,
          PrefetchHooks Function()
        > {
  $$WorkIndexTableTableManager(_$NazmDatabase db, $WorkIndexTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$WorkIndexTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$WorkIndexTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$WorkIndexTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> run = const Value.absent(),
            Value<String> kind = const Value.absent(),
            Value<String> entryId = const Value.absent(),
            Value<int> value = const Value.absent(),
          }) => WorkIndexCompanion(run: run, kind: kind, entryId: entryId, value: value),
          createCompanionCallback: ({
            required String run,
            required String kind,
            required String entryId,
            Value<int> value = const Value.absent(),
          }) => WorkIndexCompanion.insert(run: run, kind: kind, entryId: entryId, value: value),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$WorkIndexTable, WorkIndexRow>(table),
                  BaseReferences<_$NazmDatabase, $WorkIndexTable, WorkIndexRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$WorkIndexTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $WorkIndexTable,
      WorkIndexRow,
      $$WorkIndexTableFilterComposer,
      $$WorkIndexTableOrderingComposer,
      $$WorkIndexTableAnnotationComposer,
      $$WorkIndexTableCreateCompanionBuilder,
      $$WorkIndexTableUpdateCompanionBuilder,
      (WorkIndexRow, BaseReferences<_$NazmDatabase, $WorkIndexTable, WorkIndexRow>),
      WorkIndexRow,
      PrefetchHooks Function()
    >;
typedef $$ImportJobsTableCreateCompanionBuilder = ImportJobsCompanion Function({
  required String id,
  required String fileFingerprint,
  required String status,
  required String stateJson,
  required int startedAt,
  required int updatedAt,
  Value<int> rowid,
});
typedef $$ImportJobsTableUpdateCompanionBuilder = ImportJobsCompanion Function({
  Value<String> id,
  Value<String> fileFingerprint,
  Value<String> status,
  Value<String> stateJson,
  Value<int> startedAt,
  Value<int> updatedAt,
  Value<int> rowid,
});

class $$ImportJobsTableFilterComposer extends Composer<_$NazmDatabase, $ImportJobsTable> {
  $$ImportJobsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get fileFingerprint =>
      $composableBuilder(column: $table.fileFingerprint, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get stateJson =>
      $composableBuilder(column: $table.stateJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get startedAt =>
      $composableBuilder(column: $table.startedAt, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnFilters(column));
}

class $$ImportJobsTableOrderingComposer extends Composer<_$NazmDatabase, $ImportJobsTable> {
  $$ImportJobsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get fileFingerprint =>
      $composableBuilder(column: $table.fileFingerprint, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get stateJson =>
      $composableBuilder(column: $table.stateJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get startedAt =>
      $composableBuilder(column: $table.startedAt, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => ColumnOrderings(column));
}

class $$ImportJobsTableAnnotationComposer extends Composer<_$NazmDatabase, $ImportJobsTable> {
  $$ImportJobsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get fileFingerprint =>
      $composableBuilder(column: $table.fileFingerprint, builder: (column) => column);

  GeneratedColumn<String> get status => $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get stateJson => $composableBuilder(column: $table.stateJson, builder: (column) => column);

  GeneratedColumn<int> get startedAt => $composableBuilder(column: $table.startedAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt => $composableBuilder(column: $table.updatedAt, builder: (column) => column);
}

class $$ImportJobsTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $ImportJobsTable,
          ImportJobRow,
          $$ImportJobsTableFilterComposer,
          $$ImportJobsTableOrderingComposer,
          $$ImportJobsTableAnnotationComposer,
          $$ImportJobsTableCreateCompanionBuilder,
          $$ImportJobsTableUpdateCompanionBuilder,
          (ImportJobRow, BaseReferences<_$NazmDatabase, $ImportJobsTable, ImportJobRow>),
          ImportJobRow,
          PrefetchHooks Function()
        > {
  $$ImportJobsTableTableManager(_$NazmDatabase db, $ImportJobsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$ImportJobsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$ImportJobsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$ImportJobsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> fileFingerprint = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String> stateJson = const Value.absent(),
                Value<int> startedAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ImportJobsCompanion(
                id: id,
                fileFingerprint: fileFingerprint,
                status: status,
                stateJson: stateJson,
                startedAt: startedAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String fileFingerprint,
                required String status,
                required String stateJson,
                required int startedAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => ImportJobsCompanion.insert(
                id: id,
                fileFingerprint: fileFingerprint,
                status: status,
                stateJson: stateJson,
                startedAt: startedAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$ImportJobsTable, ImportJobRow>(table),
                  BaseReferences<_$NazmDatabase, $ImportJobsTable, ImportJobRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ImportJobsTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $ImportJobsTable,
      ImportJobRow,
      $$ImportJobsTableFilterComposer,
      $$ImportJobsTableOrderingComposer,
      $$ImportJobsTableAnnotationComposer,
      $$ImportJobsTableCreateCompanionBuilder,
      $$ImportJobsTableUpdateCompanionBuilder,
      (ImportJobRow, BaseReferences<_$NazmDatabase, $ImportJobsTable, ImportJobRow>),
      ImportJobRow,
      PrefetchHooks Function()
    >;
typedef $$BackupMetadataTableCreateCompanionBuilder = BackupMetadataCompanion Function({
  required String id,
  required String kind,
  required String dataJson,
  required int createdAt,
  Value<int> rowid,
});
typedef $$BackupMetadataTableUpdateCompanionBuilder = BackupMetadataCompanion Function({
  Value<String> id,
  Value<String> kind,
  Value<String> dataJson,
  Value<int> createdAt,
  Value<int> rowid,
});

class $$BackupMetadataTableFilterComposer extends Composer<_$NazmDatabase, $BackupMetadataTable> {
  $$BackupMetadataTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get kind => $composableBuilder(column: $table.kind, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get dataJson =>
      $composableBuilder(column: $table.dataJson, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnFilters(column));
}

class $$BackupMetadataTableOrderingComposer extends Composer<_$NazmDatabase, $BackupMetadataTable> {
  $$BackupMetadataTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(column: $table.id, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get dataJson =>
      $composableBuilder(column: $table.dataJson, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => ColumnOrderings(column));
}

class $$BackupMetadataTableAnnotationComposer extends Composer<_$NazmDatabase, $BackupMetadataTable> {
  $$BackupMetadataTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id => $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get kind => $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get dataJson => $composableBuilder(column: $table.dataJson, builder: (column) => column);

  GeneratedColumn<int> get createdAt => $composableBuilder(column: $table.createdAt, builder: (column) => column);
}

class $$BackupMetadataTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $BackupMetadataTable,
          BackupMetadataRow,
          $$BackupMetadataTableFilterComposer,
          $$BackupMetadataTableOrderingComposer,
          $$BackupMetadataTableAnnotationComposer,
          $$BackupMetadataTableCreateCompanionBuilder,
          $$BackupMetadataTableUpdateCompanionBuilder,
          (BackupMetadataRow, BaseReferences<_$NazmDatabase, $BackupMetadataTable, BackupMetadataRow>),
          BackupMetadataRow,
          PrefetchHooks Function()
        > {
  $$BackupMetadataTableTableManager(_$NazmDatabase db, $BackupMetadataTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$BackupMetadataTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$BackupMetadataTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$BackupMetadataTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> id = const Value.absent(),
            Value<String> kind = const Value.absent(),
            Value<String> dataJson = const Value.absent(),
            Value<int> createdAt = const Value.absent(),
            Value<int> rowid = const Value.absent(),
          }) => BackupMetadataCompanion(id: id, kind: kind, dataJson: dataJson, createdAt: createdAt, rowid: rowid),
          createCompanionCallback:
              ({
                required String id,
                required String kind,
                required String dataJson,
                required int createdAt,
                Value<int> rowid = const Value.absent(),
              }) => BackupMetadataCompanion.insert(
                id: id,
                kind: kind,
                dataJson: dataJson,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$BackupMetadataTable, BackupMetadataRow>(table),
                  BaseReferences<_$NazmDatabase, $BackupMetadataTable, BackupMetadataRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$BackupMetadataTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $BackupMetadataTable,
      BackupMetadataRow,
      $$BackupMetadataTableFilterComposer,
      $$BackupMetadataTableOrderingComposer,
      $$BackupMetadataTableAnnotationComposer,
      $$BackupMetadataTableCreateCompanionBuilder,
      $$BackupMetadataTableUpdateCompanionBuilder,
      (BackupMetadataRow, BaseReferences<_$NazmDatabase, $BackupMetadataTable, BackupMetadataRow>),
      BackupMetadataRow,
      PrefetchHooks Function()
    >;
typedef $$CatalogUsageTableCreateCompanionBuilder = CatalogUsageCompanion Function({
  required String level,
  required String entityId,
  Value<int> useCount,
  required int lastUsedAt,
});
typedef $$CatalogUsageTableUpdateCompanionBuilder = CatalogUsageCompanion Function({
  Value<String> level,
  Value<String> entityId,
  Value<int> useCount,
  Value<int> lastUsedAt,
});

class $$CatalogUsageTableFilterComposer extends Composer<_$NazmDatabase, $CatalogUsageTable> {
  $$CatalogUsageTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get level =>
      $composableBuilder(column: $table.level, builder: (column) => ColumnFilters(column));

  ColumnFilters<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get useCount =>
      $composableBuilder(column: $table.useCount, builder: (column) => ColumnFilters(column));

  ColumnFilters<int> get lastUsedAt =>
      $composableBuilder(column: $table.lastUsedAt, builder: (column) => ColumnFilters(column));
}

class $$CatalogUsageTableOrderingComposer extends Composer<_$NazmDatabase, $CatalogUsageTable> {
  $$CatalogUsageTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get level =>
      $composableBuilder(column: $table.level, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<String> get entityId =>
      $composableBuilder(column: $table.entityId, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get useCount =>
      $composableBuilder(column: $table.useCount, builder: (column) => ColumnOrderings(column));

  ColumnOrderings<int> get lastUsedAt =>
      $composableBuilder(column: $table.lastUsedAt, builder: (column) => ColumnOrderings(column));
}

class $$CatalogUsageTableAnnotationComposer extends Composer<_$NazmDatabase, $CatalogUsageTable> {
  $$CatalogUsageTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get level => $composableBuilder(column: $table.level, builder: (column) => column);

  GeneratedColumn<String> get entityId => $composableBuilder(column: $table.entityId, builder: (column) => column);

  GeneratedColumn<int> get useCount => $composableBuilder(column: $table.useCount, builder: (column) => column);

  GeneratedColumn<int> get lastUsedAt => $composableBuilder(column: $table.lastUsedAt, builder: (column) => column);
}

class $$CatalogUsageTableTableManager
    extends
        RootTableManager<
          _$NazmDatabase,
          $CatalogUsageTable,
          CatalogUsageRow,
          $$CatalogUsageTableFilterComposer,
          $$CatalogUsageTableOrderingComposer,
          $$CatalogUsageTableAnnotationComposer,
          $$CatalogUsageTableCreateCompanionBuilder,
          $$CatalogUsageTableUpdateCompanionBuilder,
          (CatalogUsageRow, BaseReferences<_$NazmDatabase, $CatalogUsageTable, CatalogUsageRow>),
          CatalogUsageRow,
          PrefetchHooks Function()
        > {
  $$CatalogUsageTableTableManager(_$NazmDatabase db, $CatalogUsageTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () => $$CatalogUsageTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () => $$CatalogUsageTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () => $$CatalogUsageTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback: ({
            Value<String> level = const Value.absent(),
            Value<String> entityId = const Value.absent(),
            Value<int> useCount = const Value.absent(),
            Value<int> lastUsedAt = const Value.absent(),
          }) => CatalogUsageCompanion(level: level, entityId: entityId, useCount: useCount, lastUsedAt: lastUsedAt),
          createCompanionCallback:
              ({
                required String level,
                required String entityId,
                Value<int> useCount = const Value.absent(),
                required int lastUsedAt,
              }) => CatalogUsageCompanion.insert(
                level: level,
                entityId: entityId,
                useCount: useCount,
                lastUsedAt: lastUsedAt,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable<$CatalogUsageTable, CatalogUsageRow>(table),
                  BaseReferences<_$NazmDatabase, $CatalogUsageTable, CatalogUsageRow>(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CatalogUsageTableProcessedTableManager =
    ProcessedTableManager<
      _$NazmDatabase,
      $CatalogUsageTable,
      CatalogUsageRow,
      $$CatalogUsageTableFilterComposer,
      $$CatalogUsageTableOrderingComposer,
      $$CatalogUsageTableAnnotationComposer,
      $$CatalogUsageTableCreateCompanionBuilder,
      $$CatalogUsageTableUpdateCompanionBuilder,
      (CatalogUsageRow, BaseReferences<_$NazmDatabase, $CatalogUsageTable, CatalogUsageRow>),
      CatalogUsageRow,
      PrefetchHooks Function()
    >;

class $NazmDatabaseManager {
  final _$NazmDatabase _db;
  $NazmDatabaseManager(this._db);
  $$ItemsTableTableManager get items => $$ItemsTableTableManager(_db, _db.items);
  $$ItemTokensTableTableManager get itemTokens => $$ItemTokensTableTableManager(_db, _db.itemTokens);
  $$ItemCatalogRefsTableTableManager get itemCatalogRefs =>
      $$ItemCatalogRefsTableTableManager(_db, _db.itemCatalogRefs);
  $$ItemFieldIdsTableTableManager get itemFieldIds => $$ItemFieldIdsTableTableManager(_db, _db.itemFieldIds);
  $$TaxonomyNodesTableTableManager get taxonomyNodes => $$TaxonomyNodesTableTableManager(_db, _db.taxonomyNodes);
  $$FieldDefinitionsTableTableManager get fieldDefinitions =>
      $$FieldDefinitionsTableTableManager(_db, _db.fieldDefinitions);
  $$CustomCatalogEntitiesTableTableManager get customCatalogEntities =>
      $$CustomCatalogEntitiesTableTableManager(_db, _db.customCatalogEntities);
  $$LocationsTableTableManager get locations => $$LocationsTableTableManager(_db, _db.locations);
  $$FoldersTableTableManager get folders => $$FoldersTableTableManager(_db, _db.folders);
  $$MediaAssetsTableTableManager get mediaAssets => $$MediaAssetsTableTableManager(_db, _db.mediaAssets);
  $$ActivityTableTableManager get activity => $$ActivityTableTableManager(_db, _db.activity);
  $$SettingsTableTableManager get settings => $$SettingsTableTableManager(_db, _db.settings);
  $$AggregatesTableTableManager get aggregates => $$AggregatesTableTableManager(_db, _db.aggregates);
  $$PendingMutationsTableTableManager get pendingMutations =>
      $$PendingMutationsTableTableManager(_db, _db.pendingMutations);
  $$RestoreJobsTableTableManager get restoreJobs => $$RestoreJobsTableTableManager(_db, _db.restoreJobs);
  $$RestoreIndexTableTableManager get restoreIndex => $$RestoreIndexTableTableManager(_db, _db.restoreIndex);
  $$WorkIndexTableTableManager get workIndex => $$WorkIndexTableTableManager(_db, _db.workIndex);
  $$ImportJobsTableTableManager get importJobs => $$ImportJobsTableTableManager(_db, _db.importJobs);
  $$BackupMetadataTableTableManager get backupMetadata => $$BackupMetadataTableTableManager(_db, _db.backupMetadata);
  $$CatalogUsageTableTableManager get catalogUsage => $$CatalogUsageTableTableManager(_db, _db.catalogUsage);
}
