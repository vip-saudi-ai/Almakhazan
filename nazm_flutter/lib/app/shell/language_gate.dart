import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/generated/app_localizations.dart';
import '../providers.dart';
import '../theme/nazm_theme.dart';

/// The first frame of a first launch: choose Arabic or English, nothing of the
/// app underneath (the reference's language gate). Each option is written in
/// its own language, so either reader can make the choice.
class LanguageGate extends ConsumerWidget {
  const LanguageGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ar = lookupAppLocalizations(const Locale('ar'));
    final en = lookupAppLocalizations(const Locale('en'));
    Widget option(Locale locale, String label, TextDirection direction) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: SizedBox(
        width: double.infinity,
        height: 56,
        child: FilledButton(
          onPressed: () => ref.read(localeProvider.notifier).choose(locale),
          child: Text(label, textDirection: direction, style: const TextStyle(fontSize: 18)),
        ),
      ),
    );
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      ar.languageGateBrand,
                      style: Theme.of(context).textTheme.displaySmall?.copyWith(color: NazmPalette.blue),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    ar.languageGateTitle,
                    textDirection: TextDirection.rtl,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    en.languageGateTitle,
                    textDirection: TextDirection.ltr,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 24),
                  option(const Locale('ar'), ar.languageGateArabic, TextDirection.rtl),
                  option(const Locale('en'), en.languageGateEnglish, TextDirection.ltr),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
