import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/labels/value_labels.dart';
import '../../../app/providers.dart';
import '../../../app/theme/nazm_theme.dart';
import '../../../domain/entities/item.dart';
import '../../../l10n/generated/app_localizations.dart';
import 'formatting.dart';
import 'inventory_controller.dart';

class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () => ref.read(inventoryProvider.notifier).search(text));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final state = ref.watch(inventoryProvider);
    final searching = _search.text.trim().isNotEmpty;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.navInventory),
        actions: [
          IconButton(
            tooltip: l.trashTitle,
            icon: const Icon(Icons.delete_outline),
            onPressed: () => context.push('/settings/trash'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/inventory/new'),
        icon: const Icon(Icons.add),
        label: Text(l.formAddTitle),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: _onSearch,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: l.searchPlaceholder,
                prefixIcon: const Icon(Icons.search),
                suffixIcon: searching
                    ? IconButton(
                        tooltip: l.commonClose,
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _search.clear();
                          _onSearch('');
                          setState(() {});
                        },
                      )
                    : null,
              ),
            ),
          ),
          Expanded(
            child: state.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => _Message(icon: Icons.error_outline, title: l.commonUnknownError),
              data: (list) {
                if (list.items.isEmpty) {
                  return searching
                      ? _Message(icon: Icons.search_off, title: l.homeEmptySearchTitle, sub: l.homeEmptySearchSub)
                      : _Message(icon: Icons.inventory_2_outlined, title: l.homeEmptyTitle, sub: l.homeEmptySub);
                }
                return NotificationListener<ScrollNotification>(
                  onNotification: (n) {
                    if (n.metrics.extentAfter < 600) ref.read(inventoryProvider.notifier).loadMore();
                    return false;
                  },
                  child: ListView.builder(
                    padding: const EdgeInsets.only(bottom: 96),
                    itemCount: list.items.length + (list.hasMore ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index >= list.items.length) {
                        return const Padding(
                          padding: EdgeInsets.all(16),
                          child: Center(child: CircularProgressIndicator()),
                        );
                      }
                      return _ItemRow(item: list.items[index]);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemRow extends ConsumerWidget {
  const _ItemRow({required this.item});
  final Item item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final taxonomy = ref.watch(taxonomyProvider).value;
    final category = taxonomy?.node(item.categoryId)?.label(language);
    final quantity = '${formatNumber(context, item.quantity)} ${unitLabel(l, item.unit)}';
    final subtitle = [?category, quantity].join(' · ');
    return ListTile(
      minTileHeight: NazmTheme.minTarget + 12,
      leading: CircleAvatar(
        backgroundColor: context.nazm.brandSoft,
        // The web preview bundles no emoji font (it would add ~10 MB), so it
        // shows a plain icon where the phones show the category's emoji.
        child: kIsWeb
            ? Icon(Icons.inventory_2_outlined, size: 20, color: Theme.of(context).colorScheme.primary)
            : Text((taxonomy?.node(item.mainCategoryId)?.icon) ?? '📦', style: const TextStyle(fontSize: 18)),
      ),
      title: Text(
        item.name.isEmpty ? '—' : item.name,
        textDirection: null,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: item.valuation == null ? null : Text(formatValuation(context, item.valuation!)),
      onTap: () => context.push('/inventory/item/${item.id}'),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.title, this.sub});
  final IconData icon;
  final String title;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: context.nazm.textTertiary),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
            if (sub != null) ...[
              const SizedBox(height: 6),
              Text(
                sub!,
                style: TextStyle(color: context.nazm.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
