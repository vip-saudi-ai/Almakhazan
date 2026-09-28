// The built-in classification library (Main Category → Category), read from
// the asset generated from the reference (src/locales/taxonomy-catalog.js).
// Stored node settings (hidden, renamed, custom nodes) layer on top in the
// taxonomy repository (phase 2, pending); this is the read-only base.

import 'dart:convert';

import '../../../core/text/arabic.dart';

class TaxonomyNode {
  const TaxonomyNode({
    required this.id,
    required this.ar,
    required this.en,
    this.icon,
    this.template,
    this.parentId,
    this.aliases = const [],
    this.children = const [],
  });

  final String id;
  final String ar;
  final String en;
  final String? icon;
  final String? template;
  final String? parentId;
  final List<String> aliases;
  final List<TaxonomyNode> children;

  String label(String language) => language == 'ar' ? ar : en;

  /// Found by its names or aliases in either language, folded.
  bool matches(String folded) =>
      folded.isEmpty ||
      normalizeArabic(ar).contains(folded) ||
      normalizeArabic(en).contains(folded) ||
      aliases.any((a) => normalizeArabic(a).contains(folded));
}

class BuiltinTaxonomy {
  BuiltinTaxonomy._(this.mains, this.conditions, this.uncategorizedId, this.fieldTemplates)
    : _byId = {
        for (final m in mains) ...{m.id: m, for (final c in m.children) c.id: c},
      };

  final List<TaxonomyNode> mains;
  final List<String> conditions;
  final String uncategorizedId;
  final Map<String, List<String>> fieldTemplates;
  final Map<String, TaxonomyNode> _byId;

  TaxonomyNode? node(String? id) => id == null ? null : _byId[id];

  static List<String> _aliases(Object? raw) {
    if (raw is! Map) return const [];
    return [
      for (final list in raw.values)
        for (final a in (list as List? ?? const [])) '$a',
    ];
  }

  factory BuiltinTaxonomy.fromJson(String source) {
    final j = jsonDecode(source) as Map<String, Object?>;
    final mains = <TaxonomyNode>[];
    for (final m in (j['mainCategories']! as List).cast<Map<String, Object?>>()) {
      final id = m['id']! as String;
      mains.add(
        TaxonomyNode(
          id: id,
          ar: m['ar']! as String,
          en: m['en']! as String,
          icon: m['icon'] as String?,
          template: m['template'] as String?,
          aliases: _aliases(m['aliases']),
          children: [
            for (final c in ((m['categories'] as List?) ?? const []).cast<Map<String, Object?>>())
              TaxonomyNode(
                id: c['id']! as String,
                ar: c['ar']! as String,
                en: c['en']! as String,
                template: c['template'] as String?,
                parentId: id,
                aliases: _aliases(c['aliases']),
              ),
          ],
        ),
      );
    }
    final templates = <String, List<String>>{
      for (final e in ((j['fieldTemplates'] as Map?) ?? const {}).entries)
        '${e.key}': [for (final f in e.value as List) '$f'],
    };
    return BuiltinTaxonomy._(
      mains,
      [for (final c in j['conditions']! as List) '$c'],
      j['uncategorizedId']! as String,
      templates,
    );
  }
}
