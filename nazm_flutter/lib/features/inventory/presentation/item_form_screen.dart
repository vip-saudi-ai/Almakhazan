// Add / edit an item. The name is the only required field ("minimum required,
// maximum available"): classification, quantity, condition, identifiers and
// valuation are optional. Save & Add Next keeps the classification and never
// carries an identifier (SKU, barcode, serial) to the next record.

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/labels/value_labels.dart';
import '../../../app/providers.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/ids/ids.dart';
import '../../../core/text/arabic.dart';
import '../../../domain/entities/item.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../taxonomy/domain/builtin_taxonomy.dart';
import 'formatting.dart';
import 'inventory_controller.dart';

class ItemFormScreen extends ConsumerStatefulWidget {
  const ItemFormScreen({super.key, this.itemId});

  /// Null for a new record.
  final String? itemId;

  @override
  ConsumerState<ItemFormScreen> createState() => _ItemFormScreenState();
}

class _ItemFormScreenState extends ConsumerState<ItemFormScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _nameFocus = FocusNode();
  final _quantity = TextEditingController(text: '1');
  final _brand = TextEditingController();
  final _sku = TextEditingController();
  final _barcode = TextEditingController();
  final _serial = TextEditingController();
  final _valuation = TextEditingController();
  final _description = TextEditingController();
  String? _mainId;
  String? _categoryId;
  String _unit = 'قطعة';
  String _condition = '';
  String _currency = 'SAR';
  Item? _original;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _valuation.addListener(() => setState(() {}));
    _load();
  }

  Future<void> _load() async {
    final id = widget.itemId;
    if (id != null) {
      final item = await ref.read(itemRepositoryProvider).getItem(id);
      if (item != null) {
        _original = item;
        _name.text = item.name;
        _quantity.text = '${item.quantity}';
        _brand.text = item.brand;
        _sku.text = item.sku;
        _barcode.text = item.barcode;
        _serial.text = item.serialNumber;
        _description.text = item.description;
        _mainId = item.mainCategoryId;
        _categoryId = item.categoryId;
        _unit = item.unit;
        _condition = item.condition;
        final v = item.valuation;
        if (v != null) {
          _currency = v.currency;
          _valuation.text = v.min == v.max ? '${v.min}' : '${v.min}-${v.max}';
        }
      }
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    for (final c in [_name, _quantity, _brand, _sku, _barcode, _serial, _valuation, _description]) {
      c.dispose();
    }
    _nameFocus.dispose();
    super.dispose();
  }

  Item _build(BuiltinTaxonomy taxonomy) {
    final now = DateTime.now().toUtc().millisecondsSinceEpoch;
    final parsed = parseValuationText(_valuation.text);
    final base = _original;
    final valuation = parsed == null
        ? null
        : Valuation(
            min: parsed.min,
            max: parsed.max,
            currency: _currency,
            source: base?.valuation?.source ?? 'manual',
            valuationType: base?.valuation?.valuationType ?? 'estimate',
            valuationDate: now,
          );
    return Item.fromJson({
      ...?base?.toJson(),
      'id': base?.id ?? newId('itm'),
      'name': _name.text.trim(),
      'brand': _brand.text.trim(),
      'sku': _sku.text.trim(),
      'barcode': _barcode.text.trim(),
      'serialNumber': _serial.text.trim(),
      'description': _description.text.trim(),
      'mainCategoryId': _mainId,
      'categoryId': _categoryId ?? taxonomy.uncategorizedId,
      'quantity': num.parse(normalizeDigits(_quantity.text.trim())),
      'unit': _unit,
      'condition': _condition,
      'valuation': valuation?.toJson(),
      'createdAt': base?.createdAt ?? now,
      'updatedAt': now,
    });
  }

  Future<void> _save({required bool next}) async {
    final l = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    if (!_form.currentState!.validate()) return;
    final taxonomy = await ref.read(taxonomyProvider.future);
    if (!mounted) return;
    final item = _build(taxonomy);
    setState(() => _saving = true);
    final repo = ref.read(itemRepositoryProvider);
    try {
      await inventoryWrite(ref, () async {
        if (_original == null) {
          await repo.createItem(item);
        } else {
          await repo.updateItem(item, expectedVersion: _original!.version);
        }
      });
      if (!mounted) return;
      if (next) {
        // Classification and unit stay; every identifier starts empty.
        for (final c in [_name, _brand, _sku, _barcode, _serial, _valuation, _description]) {
          c.clear();
        }
        _quantity.text = '1';
        _condition = '';
        setState(() => _saving = false);
        messenger
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(l.formSavedNext)));
        _nameFocus.requestFocus();
      } else {
        context.pop(item.id);
      }
    } on AppError catch (e) {
      setState(() => _saving = false);
      final message = e.code == 'repo/sku-conflict' ? l.formSkuTakenTitle : l.formSaveFailed;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Future<void> _pickNode({required bool main}) async {
    final l = AppLocalizations.of(context);
    final title = main ? l.fieldMainCategory : l.fieldCategory;
    final taxonomy = await ref.read(taxonomyProvider.future);
    if (!mounted) return;
    final nodes = main
        ? taxonomy.mains
        : [
            for (final m in taxonomy.mains)
              if (_mainId == null || m.id == _mainId) ...m.children,
          ];
    final picked = await showModalBottomSheet<TaxonomyNode?>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _NodeSheet(nodes: nodes, title: title),
    );
    if (picked == null) return;
    setState(() {
      if (main) {
        if (_mainId != picked.id) _categoryId = null;
        _mainId = picked.id;
      } else {
        _categoryId = picked.id;
        _mainId = picked.parentId;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final taxonomy = ref.watch(taxonomyProvider).value;
    final editing = widget.itemId != null;
    if (_loading || taxonomy == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final parsed = _valuation.text.trim().isEmpty ? null : parseValuationText(_valuation.text);
    return Scaffold(
      appBar: AppBar(title: Text(editing ? l.formEditTitle : l.formAddTitle)),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _name,
              focusNode: _nameFocus,
              autofocus: !editing,
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(labelText: l.fieldName, hintText: l.formNamePlaceholder),
              validator: (v) => (v == null || v.trim().isEmpty) ? l.formNameRequired : null,
            ),
            const SizedBox(height: 12),
            _PickerRow(
              label: l.fieldMainCategory,
              value: taxonomy.node(_mainId)?.label(language),
              onTap: () => _pickNode(main: true),
            ),
            _PickerRow(
              label: l.fieldCategory,
              value: _categoryId == null || _categoryId == taxonomy.uncategorizedId
                  ? null
                  : taxonomy.node(_categoryId)?.label(language) ?? _categoryId,
              onTap: () => _pickNode(main: false),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _quantity,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(labelText: l.fieldQuantity),
                    validator: (v) {
                      final n = num.tryParse(normalizeDigits(v?.trim() ?? ''));
                      if (n == null || n < 0) return l.fieldErrorNumber;
                      if (integerUnits.contains(_unit) && n != n.truncate()) return l.fieldErrorInteger;
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _unit,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l.fieldUnit),
                    items: [
                      for (final u in {...unitGroups.values.expand((g) => g), _unit})
                        DropdownMenuItem(value: u, child: Text(unitLabel(l, u))),
                    ],
                    onChanged: (u) => setState(() => _unit = u ?? _unit),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _condition,
              isExpanded: true,
              decoration: InputDecoration(labelText: l.fieldCondition),
              items: [
                DropdownMenuItem(value: '', child: Text(l.commonNone)),
                for (final c in {...conditionValues, if (_condition.isNotEmpty) _condition})
                  DropdownMenuItem(value: c, child: Text(conditionLabel(l, c))),
              ],
              onChanged: (c) => setState(() => _condition = c ?? ''),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _brand,
              decoration: InputDecoration(labelText: l.fieldBrand, hintText: l.formBrandPlaceholder),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: TextFormField(
                    controller: _valuation,
                    decoration: InputDecoration(
                      labelText: l.fieldValuation,
                      hintText: l.formValuationPlaceholder,
                      helperText: _valuation.text.trim().isEmpty
                          ? null
                          : parsed == null
                          ? l.formValuationUnread
                          : l.formValuationWillSave(
                              formatValuation(
                                context,
                                Valuation(min: parsed.min, max: parsed.max, currency: _currency),
                              ),
                            ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: DropdownButtonFormField<String>(
                    initialValue: _currency,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l.fieldCurrency),
                    items: [
                      for (final c in {...commonCurrencies, _currency}) DropdownMenuItem(value: c, child: Text(c)),
                    ],
                    onChanged: (c) => setState(() => _currency = c ?? _currency),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _sku,
              decoration: InputDecoration(labelText: l.fieldSku),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _barcode,
              decoration: InputDecoration(labelText: l.fieldBarcode),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _serial,
              decoration: InputDecoration(labelText: l.fieldSerialNumber),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _description,
              minLines: 2,
              maxLines: 6,
              decoration: InputDecoration(labelText: l.fieldDescription),
            ),
            const SizedBox(height: 88),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(
            children: [
              if (!editing)
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => _save(next: true),
                    child: Text(l.formSaveAndNext),
                  ),
                ),
              if (!editing) const SizedBox(width: 12),
              Expanded(
                child: FilledButton(onPressed: _saving ? null : () => _save(next: false), child: Text(l.commonSave)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PickerRow extends StatelessWidget {
  const _PickerRow({required this.label, required this.value, required this.onTap});
  final String label;
  final String? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(label),
      subtitle: Text(value ?? l.taxonomyChoose),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}

/// A searchable list of classification nodes, in a bottom sheet.
class _NodeSheet extends StatefulWidget {
  const _NodeSheet({required this.nodes, required this.title});
  final List<TaxonomyNode> nodes;
  final String title;

  @override
  State<_NodeSheet> createState() => _NodeSheetState();
}

class _NodeSheetState extends State<_NodeSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final language = Localizations.localeOf(context).languageCode;
    final folded = normalizeArabic(_query);
    final shown = [
      for (final n in widget.nodes)
        if (n.matches(folded)) n,
    ];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.75,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Semantics(header: true, child: Text(widget.title, style: Theme.of(context).textTheme.titleMedium)),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                autofocus: true,
                decoration: InputDecoration(hintText: l.taxonomySearch, prefixIcon: const Icon(Icons.search)),
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: shown.length,
                itemBuilder: (context, i) => ListTile(
                  leading: kIsWeb || shown[i].icon == null
                      ? null
                      : Text(shown[i].icon!, style: const TextStyle(fontSize: 20)),
                  title: Text(shown[i].label(language)),
                  onTap: () => Navigator.of(context).pop(shown[i]),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
