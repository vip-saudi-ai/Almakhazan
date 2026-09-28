// Repository contracts. Screens and use cases depend on these only; the
// device implementation is Drift, a future one a cloud source behind the same
// interfaces. No Drift, SQL or Firestore type appears here.

import '../entities/inventory_aggregate.dart';
import '../entities/item.dart';
import '../query/item_query.dart';
import 'capabilities.dart';

/// Count, quantity and valuation per currency over a query's matching records.
class ItemAggregate {
  const ItemAggregate({required this.count, required this.quantity, required this.byCurrency});
  final int count;
  final num quantity;

  /// currency → (count, total). One total per currency; never added together.
  final Map<String, ({int count, double total})> byCurrency;
}

abstract interface class ItemRepository {
  BackendCapabilities get capabilities;

  /// One page of records matching [query] (validated, keyset-paginated).
  Future<ItemPage<Item>> queryItems(ItemQuery query);

  /// How many records match — exact.
  Future<int> countItemsMatching(ItemQuery query);

  /// Count, quantity and per-currency valuation over the matching records.
  Future<ItemAggregate> aggregateItems(ItemQuery query);

  /// Authoritative read by id; null only when the store has no such record.
  Future<Item?> getItem(String id);

  /// The same for a selection, in bounded keyed batches.
  Future<List<Item>> getItems(List<String> ids);

  Future<Item> createItem(Item item);

  /// Refused with `repo/conflict` when [expectedVersion] is stale.
  Future<Item> updateItem(Item item, {int? expectedVersion});

  /// Soft delete: the record moves to the Trash.
  Future<void> trashItem(String id);
  Future<void> restoreItem(String id);

  /// Permanent deletion; releases the record's media references.
  Future<void> purgeItem(String id);

  /// Records that may be duplicates of one another (never the whole
  /// inventory); null when the backend cannot answer.
  Future<List<Item>?> duplicateCandidates({int limit = 5000});

  /// EXPLICIT whole-dataset stream for export, restore safety backups,
  /// migration and maintenance only — a page at a time, never a list of
  /// everything in memory. A backend without `wholeInventoryRead` refuses
  /// any other purpose with `repo/unbounded-read`.
  Stream<List<Item>> scanAll({required WholeDatasetPurpose purpose, int pageSize = 500});
}

abstract interface class AggregateRepository {
  /// The Overview's numbers from the kept aggregate; null when the backend
  /// cannot say. Never computed by loading records.
  Future<InventoryAggregate?> inventoryAggregate();

  /// Rebuilds the aggregate from the records, in bounded batches (maintenance).
  Future<InventoryAggregate> rebuildAggregates();
}

/// Taxonomy, field registry, locations and folders are small workspace
/// collections; their repositories are defined with their features (phase 2).
abstract interface class SettingsRepository {
  Future<Object?> read(String key);
  Future<void> write(String key, Object? value);
}
