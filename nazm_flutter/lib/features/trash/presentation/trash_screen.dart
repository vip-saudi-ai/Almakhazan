import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../core/errors/app_error.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../inventory/presentation/formatting.dart';
import '../../inventory/presentation/inventory_controller.dart';

/// Deleted records: restore (its SKU must still be free) or delete for good.
class TrashScreen extends ConsumerWidget {
  const TrashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final trash = ref.watch(trashProvider);
    final repo = ref.read(itemRepositoryProvider);
    void say(String text) => ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
    return Scaffold(
      appBar: AppBar(title: Text(l.trashTitle)),
      body: trash.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(l.trashReadFailed)),
        data: (items) => items.isEmpty
            ? Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.delete_outline, size: 48),
                      const SizedBox(height: 12),
                      Text(l.trashEmptyTitle, style: Theme.of(context).textTheme.titleMedium),
                      Text(l.trashEmptySub, textAlign: TextAlign.center),
                    ],
                  ),
                ),
              )
            : ListView.builder(
                itemCount: items.length,
                itemBuilder: (context, i) {
                  final item = items[i];
                  return ListTile(
                    title: Text(item.name),
                    subtitle: Text(l.trashDeletedOn(formatDate(context, item.deletedAt ?? item.updatedAt))),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          tooltip: l.trashRestore,
                          icon: const Icon(Icons.restore),
                          onPressed: () async {
                            try {
                              await inventoryWrite(ref, () => repo.restoreItem(item.id));
                              say(l.trashRestored);
                            } on AppError {
                              say(l.trashRestoreFailed);
                            }
                          },
                        ),
                        IconButton(
                          tooltip: l.trashPurge,
                          icon: const Icon(Icons.delete_forever_outlined),
                          onPressed: () async {
                            final ok = await showDialog<bool>(
                              context: context,
                              builder: (c) => AlertDialog(
                                title: Text(l.trashPurgeTitle(item.name)),
                                actions: [
                                  TextButton(onPressed: () => Navigator.pop(c, false), child: Text(l.commonCancel)),
                                  FilledButton(
                                    onPressed: () => Navigator.pop(c, true),
                                    child: Text(l.trashPurgeConfirm),
                                  ),
                                ],
                              ),
                            );
                            if (ok != true) return;
                            await inventoryWrite(ref, () => repo.purgeItem(item.id));
                            say(l.trashPurged);
                          },
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
