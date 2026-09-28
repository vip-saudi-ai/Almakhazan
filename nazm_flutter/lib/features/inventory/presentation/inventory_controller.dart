import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../domain/entities/item.dart';
import '../../../domain/query/item_query.dart';

/// What the inventory screen holds: one window of pages, never the inventory.
class InventoryList {
  const InventoryList({required this.items, required this.cursor, required this.total, this.loadingMore = false});
  final List<Item> items;
  final String? cursor;
  final int total;
  final bool loadingMore;
  bool get hasMore => cursor != null;

  InventoryList copyWith({List<Item>? items, String? cursor, bool clearCursor = false, bool? loadingMore}) =>
      InventoryList(
        items: items ?? this.items,
        cursor: clearCursor ? null : (cursor ?? this.cursor),
        total: total,
        loadingMore: loadingMore ?? this.loadingMore,
      );
}

const inventoryPageSize = 50;

/// The live inventory, newest first, or matching a search — a page at a
/// time through the repository's query contract.
class InventoryController extends AsyncNotifier<InventoryList> {
  String _text = '';
  ItemQuery? _query;

  String get searchText => _text;

  @override
  Future<InventoryList> build() async {
    ref.watch(inventoryRevisionProvider);
    return _firstPage();
  }

  ItemQuery _buildQuery() => ItemQuery.validate({
    'text': _text.trim().isEmpty ? null : _text,
    'limit': inventoryPageSize,
    'projection': 'list',
  });

  Future<InventoryList> _firstPage() async {
    final repo = ref.read(itemRepositoryProvider);
    final query = _query = _buildQuery();
    final page = await repo.queryItems(query);
    final total = page.hasMore ? await repo.countItemsMatching(query) : page.items.length;
    return InventoryList(items: page.items, cursor: page.nextCursor, total: total);
  }

  Future<void> search(String text) async {
    if (text == _text) return;
    _text = text;
    state = const AsyncLoading<InventoryList>();
    state = await AsyncValue.guard(_firstPage);
  }

  Future<void> loadMore() async {
    final current = state.value;
    final query = _query;
    if (current == null || query == null || !current.hasMore || current.loadingMore) return;
    state = AsyncData(current.copyWith(loadingMore: true));
    final page = await ref.read(itemRepositoryProvider).queryItems(query.withCursor(current.cursor));
    state = AsyncData(
      current.copyWith(
        items: [...current.items, ...page.items],
        cursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      ),
    );
  }
}

final inventoryProvider = AsyncNotifierProvider<InventoryController, InventoryList>(InventoryController.new);

/// One record, read from the store (never from a list row).
final itemProvider = FutureProvider.family<Item?, String>((ref, id) {
  ref.watch(inventoryRevisionProvider);
  return ref.read(itemRepositoryProvider).getItem(id);
});

/// The Trash, newest deletion first, one page.
final trashProvider = FutureProvider<List<Item>>((ref) async {
  ref.watch(inventoryRevisionProvider);
  final page = await ref
      .read(itemRepositoryProvider)
      .queryItems(
        ItemQuery.validate({
          'filters': {'deleted': true},
          'sort': {'field': 'updatedAt', 'direction': 'desc'},
          'limit': 100,
        }),
      );
  return page.items;
});

/// Runs an inventory write and tells every list to ask again.
Future<T> inventoryWrite<T>(WidgetRef ref, Future<T> Function() write) async {
  final result = await write();
  ref.read(inventoryRevisionProvider.notifier).bump();
  return result;
}
