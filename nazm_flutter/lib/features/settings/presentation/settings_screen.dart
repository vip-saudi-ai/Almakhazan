import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/providers.dart';
import '../../../core/versions.dart';
import '../../../l10n/generated/app_localizations.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final current = Localizations.localeOf(context).languageCode;
    return Scaffold(
      appBar: AppBar(title: Text(l.navSettings)),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.language),
            title: Text(l.languageLabel),
            trailing: SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'ar', label: Text(l.languageAr)),
                ButtonSegment(value: 'en', label: Text(l.languageEn)),
              ],
              selected: {current},
              onSelectionChanged: (s) => ref.read(localeProvider.notifier).choose(Locale(s.first)),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.delete_outline),
            title: Text(l.trashTitle),
            subtitle: Text(l.settingsTrashSub),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/trash'),
          ),
          ListTile(
            leading: const Icon(Icons.category_outlined),
            title: Text(l.settingsTaxonomy),
            subtitle: Text(l.settingsTaxonomySub),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/settings/categories'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: Text(l.settingsAbout),
            subtitle: Text(l.settingsVersion(Versions.appVersion)),
          ),
        ],
      ),
    );
  }
}
