import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/labels/value_labels.dart';
import '../../../app/providers.dart';
import '../../../l10n/generated/app_localizations.dart';
import 'formatting.dart';
import 'inventory_controller.dart';

/// One record. Only filled fields are shown, as in the reference.
class ItemDetailScreen extends ConsumerWidget {
  const ItemDetailScreen({super.key, required this.itemId});
  final String itemId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final item = ref.watch(itemProvider(itemId));
    final taxonomy = ref.watch(taxonomyProvider).value;
    return item.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(child: Text(l.commonUnknownError)),
      ),
      data: (item) {
        if (item == null) {
          return Scaffold(
            appBar: AppBar(),
            body: Center(child: Text(l.errorRepoMissing)),
          );
        }
        final rows = <(String, String)>[
          if (taxonomy?.node(item.mainCategoryId) != null)
            (l.fieldMainCategory, taxonomy!.node(item.mainCategoryId)!.label(language)),
          if (taxonomy?.node(item.categoryId) != null && item.categoryId != taxonomy!.uncategorizedId)
            (l.fieldCategory, taxonomy.node(item.categoryId)!.label(language)),
          (l.fieldQuantity, '${formatNumber(context, item.quantity)} ${unitLabel(l, item.unit)}'),
          if (item.condition.isNotEmpty) (l.fieldCondition, conditionLabel(l, item.condition)),
          if (item.brand.isNotEmpty) (l.fieldBrand, item.brand),
          if (item.valuation != null) (l.fieldValuation, formatValuation(context, item.valuation!)),
          if (item.sku.isNotEmpty) (l.fieldSku, item.sku),
          if (item.barcode.isNotEmpty) (l.fieldBarcode, item.barcode),
          if (item.serialNumber.isNotEmpty) (l.fieldSerialNumber, item.serialNumber),
          if (item.modelNumber.isNotEmpty) (l.fieldModelNumber, item.modelNumber),
          if (item.referenceNumber.isNotEmpty) (l.fieldReferenceNumber, item.referenceNumber),
          if (item.description.isNotEmpty) (l.fieldDescription, item.description),
        ];
        return Scaffold(
          appBar: AppBar(
            title: Text(l.detailTitle),
            actions: [
              if (!item.isDeleted)
                IconButton(
                  tooltip: l.commonEdit,
                  icon: const Icon(Icons.edit_outlined),
                  onPressed: () => context.push('/inventory/item/${item.id}/edit'),
                ),
              if (!item.isDeleted)
                IconButton(
                  tooltip: l.commonDelete,
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (c) => AlertDialog(
                        title: Text(l.detailTrashTitle(item.name)),
                        content: Text(l.detailTrashMessage),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(l.commonCancel)),
                          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(l.commonDelete)),
                        ],
                      ),
                    );
                    if (ok != true || !context.mounted) return;
                    await inventoryWrite(ref, () => ref.read(itemRepositoryProvider).trashItem(item.id));
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context)
                      ..hideCurrentSnackBar()
                      ..showSnackBar(SnackBar(content: Text(l.detailTrashed)));
                    context.pop();
                  },
                ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(item.name, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 16),
              for (final (label, value) in rows)
                ListTile(contentPadding: EdgeInsets.zero, title: Text(label), subtitle: SelectableText(value)),
              const Divider(),
              Text(l.detailAdded(formatDate(context, item.createdAt)), style: Theme.of(context).textTheme.bodySmall),
              Text(l.detailUpdated(formatDate(context, item.updatedAt)), style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        );
      },
    );
  }
}
