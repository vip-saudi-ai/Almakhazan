// NAZM's design tokens and themes, from the reference (styles/tokens.css).
// Screens use these tokens (via Theme and NazmColors), never literal colours.

import 'package:flutter/material.dart';

/// Brand palette.
abstract final class NazmPalette {
  static const navy = Color(0xFF0B1F4B);
  static const blue = Color(0xFF2563FF);
  static const indigo = Color(0xFF6366F1);
  static const sky = Color(0xFF93C5FD);
  static const mist = Color(0xFFE2E8F0);
  static const cloud = Color(0xFFF8FAFC);
  static const viewer = Color(0xFF08090C);
}

/// The semantic tokens a screen needs beyond Material's colour scheme.
@immutable
class NazmColors extends ThemeExtension<NazmColors> {
  const NazmColors({
    required this.textSecondary,
    required this.textTertiary,
    required this.brandSoft,
    required this.intelligence,
    required this.intelligenceSoft,
    required this.success,
    required this.warning,
    required this.danger,
    required this.divider,
    required this.surfaceSheet,
    required this.surfaceCard,
    required this.surfaceSunken,
    required this.track,
    required this.scrim,
  });

  final Color textSecondary;
  final Color textTertiary;
  final Color brandSoft;
  final Color intelligence;
  final Color intelligenceSoft;
  final Color success;
  final Color warning;
  final Color danger;
  final Color divider;
  final Color surfaceSheet;
  final Color surfaceCard;
  final Color surfaceSunken;
  final Color track;
  final Color scrim;

  /// Image inspection wants a neutral dark ground in both themes.
  Color get surfaceViewer => NazmPalette.viewer;

  static const light = NazmColors(
    textSecondary: Color(0x8C0B1F4B),
    textTertiary: Color(0x520B1F4B),
    brandSoft: Color(0x1A2563FF),
    intelligence: NazmPalette.indigo,
    intelligenceSoft: Color(0x1A6366F1),
    success: Color(0xFF16A34A),
    warning: Color(0xFFD97706),
    danger: Color(0xFFDC2626),
    divider: Color(0x140B1F4B),
    surfaceSheet: Color(0xFFF2F2F7),
    surfaceCard: Color(0xBFFFFFFF),
    surfaceSunken: NazmPalette.mist,
    track: Color(0x170B1F4B),
    scrim: Color(0x730B1F4B),
  );

  static const dark = NazmColors(
    textSecondary: Color(0x99FFFFFF),
    textTertiary: Color(0x5CFFFFFF),
    brandSoft: Color(0x295B8CFF),
    intelligence: Color(0xFF8B8DF7),
    intelligenceSoft: Color(0x298B8DF7),
    success: Color(0xFF4ADE80),
    warning: Color(0xFFFBBF24),
    danger: Color(0xFFF87171),
    divider: Color(0x1AFFFFFF),
    surfaceSheet: Color(0xFF0E1A33),
    surfaceCard: Color(0xB8132040),
    surfaceSunken: Color(0xFF0B1730),
    track: Color(0x24FFFFFF),
    scrim: Color(0x9E000000),
  );

  @override
  NazmColors copyWith() => this;

  @override
  NazmColors lerp(ThemeExtension<NazmColors>? other, double t) {
    if (other is! NazmColors) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return NazmColors(
      textSecondary: l(textSecondary, other.textSecondary),
      textTertiary: l(textTertiary, other.textTertiary),
      brandSoft: l(brandSoft, other.brandSoft),
      intelligence: l(intelligence, other.intelligence),
      intelligenceSoft: l(intelligenceSoft, other.intelligenceSoft),
      success: l(success, other.success),
      warning: l(warning, other.warning),
      danger: l(danger, other.danger),
      divider: l(divider, other.divider),
      surfaceSheet: l(surfaceSheet, other.surfaceSheet),
      surfaceCard: l(surfaceCard, other.surfaceCard),
      surfaceSunken: l(surfaceSunken, other.surfaceSunken),
      track: l(track, other.track),
      scrim: l(scrim, other.scrim),
    );
  }
}

extension NazmThemeContext on BuildContext {
  NazmColors get nazm => Theme.of(this).extension<NazmColors>()!;
}

abstract final class NazmTheme {
  /// Touch targets are at least 44 points, as in the reference.
  static const minTarget = 44.0;

  static ThemeData light() => _build(
    brightness: Brightness.light,
    brand: NazmPalette.blue,
    surface: NazmPalette.cloud,
    onSurface: NazmPalette.navy,
    tokens: NazmColors.light,
  );

  static ThemeData dark() => _build(
    brightness: Brightness.dark,
    brand: const Color(0xFF5B8CFF),
    surface: const Color(0xFF060E22),
    onSurface: const Color(0xEBFFFFFF),
    tokens: NazmColors.dark,
  );

  static ThemeData _build({
    required Brightness brightness,
    required Color brand,
    required Color surface,
    required Color onSurface,
    required NazmColors tokens,
  }) {
    final scheme = ColorScheme.fromSeed(seedColor: brand, brightness: brightness).copyWith(
      primary: brand,
      onPrimary: Colors.white,
      surface: surface,
      onSurface: onSurface,
      error: tokens.danger,
      secondary: tokens.intelligence,
    );
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: surface,
      dividerColor: tokens.divider,
      extensions: [tokens],
      materialTapTargetSize: MaterialTapTargetSize.padded,
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: tokens.surfaceSheet,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      ),
      navigationBarTheme: NavigationBarThemeData(indicatorColor: tokens.brandSoft),
    );
  }
}
