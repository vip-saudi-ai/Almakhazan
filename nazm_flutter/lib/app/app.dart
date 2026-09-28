import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../l10n/generated/app_localizations.dart';
import 'providers.dart';
import 'router/app_router.dart';
import 'shell/language_gate.dart';
import 'theme/nazm_theme.dart';

class NazmApp extends ConsumerStatefulWidget {
  const NazmApp({super.key});

  @override
  ConsumerState<NazmApp> createState() => _NazmAppState();
}

class _NazmAppState extends ConsumerState<NazmApp> {
  late final GoRouter _router = buildRouter();

  @override
  Widget build(BuildContext context) {
    final locale = ref.watch(localeProvider);
    final themeMode = ref.watch(themeModeProvider).value ?? ThemeMode.system;
    final chosen = locale.value;

    // Arabic is the default language, as in the reference; Directionality
    // follows the locale (RTL for Arabic) through the localisation delegates.
    const fallback = Locale('ar');
    final common = (
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
    );

    if (locale.isLoading || chosen == null) {
      // The first frame of a first launch is the language choice, with
      // nothing of the app under it.
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        locale: fallback,
        theme: NazmTheme.light(),
        darkTheme: NazmTheme.dark(),
        themeMode: themeMode,
        localizationsDelegates: common.localizationsDelegates,
        supportedLocales: common.supportedLocales,
        home: locale.isLoading ? const SizedBox.shrink() : const LanguageGate(),
      );
    }

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
      locale: chosen,
      theme: NazmTheme.light(),
      darkTheme: NazmTheme.dark(),
      themeMode: themeMode,
      localizationsDelegates: common.localizationsDelegates,
      supportedLocales: common.supportedLocales,
      onGenerateTitle: (context) => AppLocalizations.of(context).languageGateBrand,
    );
  }
}
