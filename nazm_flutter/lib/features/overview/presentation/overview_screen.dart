import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/providers.dart';
import '../../../app/theme/nazm_theme.dart';
import '../../../domain/entities/inventory_aggregate.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../inventory/presentation/formatting.dart';

/// The Overview reads the kept aggregate — never the records.
final overviewProvider = FutureProvider<InventoryAggregate?>((ref) {
  ref.watch(inventoryRevisionProvider);
  return ref.read(itemRepositoryProvider).inventoryAggregate();
});

class OverviewScreen extends ConsumerWidget {
  const OverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final overview = ref.watch(overviewProvider);
    final taxonomy = ref.watch(taxonomyProvider).value;
    return Scaffold(
      appBar: AppBar(title: Text(l.navOverview)),
      body: overview.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(l.overviewUnavailableTitle)),
        data: (a) {
          if (a == null) return Center(child: Text(l.overviewUnavailableTitle));
          if (a.live == 0) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(l.overviewEmptyTitle, style: Theme.of(context).textTheme.titleMedium),
                  Text(l.overviewEmptySub),
                ],
              ),
            );
          }
          final currencies = a.currency.entries.toList()..sort((x, y) => y.value.count.compareTo(x.value.count));
          final mains = a.byMain.entries.toList()..sort((x, y) => y.value.compareTo(x.value));
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _Kpi(label: l.overviewRecords, value: formatNumber(context, a.live)),
                  _Kpi(label: l.overviewTotalQuantity, value: formatNumber(context, a.quantity)),
                  for (final c in currencies)
                    _Kpi(
                      label: l.overviewValuationIn(c.key),
                      value: '${formatNumber(context, c.value.total.round())} ${c.key}',
                    ),
                ],
              ),
              if (currencies.length > 1) ...[
                const SizedBox(height: 8),
                Text(l.overviewCurrencyNote, style: TextStyle(color: context.nazm.textSecondary)),
              ],
              const SizedBox(height: 24),
              Text(l.overviewByMainCategory, style: Theme.of(context).textTheme.titleMedium),
              for (final m in mains)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(m.key == noneBucket ? l.commonNone : (taxonomy?.node(m.key)?.label(language) ?? m.key)),
                  trailing: Text(formatNumber(context, m.value)),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 160,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: context.nazm.surfaceCard, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(color: context.nazm.textSecondary)),
        ],
      ),
    );
  }
}
