import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nazm/features/catalogs/domain/catalog_entity.dart';
import 'package:nazm/features/catalogs/domain/catalog_index.dart';
import 'package:nazm/features/catalogs/domain/catalog_service.dart';

import '../fixtures.dart';

CatalogService freshService() => CatalogService((path) => File(path).readAsString());

void main() {
  final golden = fixture('catalog.json')! as Map<String, Object?>;

  test('search ranks exactly as the reference: same ids, same order, same scores, same totals', () async {
    for (final s in (golden['searches']! as List).cast<Map<String, Object?>>()) {
      final service = freshService();
      final page = await service.search(
        CatalogLevel(domain: s['domain']! as String, entityType: s['entityType']! as String),
        query: s['query']! as String,
        limit: 12,
      );
      final label = '${s['domain']}/${s['entityType']} «${s['query']}»';
      expect(page.total, s['total'], reason: label);
      expect([for (final r in page.items) r.entity.id], s['ids'], reason: label);
      expect([for (final r in page.items) r.score], s['scores'], reason: label);
    }
  });

  test('scoped levels hold exactly what the reference holds', () async {
    for (final s in (golden['scoped']! as List).cast<Map<String, Object?>>()) {
      final spec = s['spec']! as Map<String, Object?>;
      final page = await freshService().search(
        CatalogLevel(
          domain: s['domain']! as String,
          entityType: s['entityType']! as String,
          parentId: spec['parentId'] as String?,
          ancestorId: spec['ancestorId'] as String?,
        ),
        query: (spec['query'] as String?) ?? '',
        limit: 100,
      );
      expect(page.total, s['total'], reason: '$spec');
      expect([for (final r in page.items) r.entity.id], s['ids'], reason: '$spec');
    }
  });

  test('duplicate checks, text resolution and paths agree with the reference', () async {
    final service = freshService();
    for (final d in (golden['duplicates']! as List).cast<Map<String, Object?>>()) {
      final found = await service.findDuplicates(
        domain: d['domain']! as String,
        entityType: d['entityType']! as String,
        parentId: d['parentId'] as String?,
        label: d['label']! as String,
      );
      expect(found.exact?.id, d['exact'], reason: '${d['label']}');
      expect([for (final e in found.similar) e.id], d['similar'], reason: '${d['label']}');
    }
    for (final r in (golden['resolves']! as List).cast<Map<String, Object?>>()) {
      final got = await service.resolveText(
        domain: r['domain']! as String,
        entityType: r['entityType']! as String,
        ancestorId: r['ancestorId'] as String?,
        text: r['text']! as String,
      );
      expect(got.status.name, r['status'], reason: '${r['text']} ${r['ancestorId']}');
      expect(got.entity?.id, r['entity'], reason: '${r['text']}');
      expect([for (final e in got.candidates) e.id], r['candidates'], reason: '${r['text']}');
    }
    for (final p in (golden['paths']! as List).cast<Map<String, Object?>>()) {
      expect([for (final e in await service.path(p['id']! as String)) e.id], p['path']);
    }
  });

  test('the whole bundled catalog loads: 1,711 entities, 197 watch brands', () async {
    final service = freshService();
    final manifest = await service.builtin.manifest();
    for (final g in (manifest['groups']! as Map).keys) {
      await service.builtin.loadGroup('$g');
    }
    expect(service.builtin.index.length, 1711);
    final brands = await service.search(const CatalogLevel(domain: 'watch', entityType: 'brand'), limit: 1);
    expect(brands.total, 197);
  });

  test(
    'a custom entry under a built-in parent is found in that parent\'s scope, and duplicates respect parents',
    () async {
      final service = freshService()
        ..setCustomEntities([
          CatalogEntity.fromJson({
            'id': 'cust_hilux1',
            'domains': ['vehicle'],
            'entityType': 'model',
            'parentId': 'vehicle_make_toyota',
            'nameEn': 'Hilux Custom',
            'source': 'custom',
            'status': 'active',
          })!,
        ]);
      final scoped = await service.search(
        const CatalogLevel(domain: 'vehicle', entityType: 'model', ancestorId: 'vehicle_make_toyota'),
        query: 'hilux custom',
      );
      expect(scoped.items.first.entity.id, 'cust_hilux1');
      final underToyota = await service.findDuplicates(
        domain: 'vehicle',
        entityType: 'model',
        parentId: 'vehicle_make_toyota',
        label: 'hilux custom',
      );
      expect(underToyota.exact?.id, 'cust_hilux1');
      final itself = await service.findDuplicates(
        domain: 'vehicle',
        entityType: 'model',
        parentId: 'vehicle_make_toyota',
        label: 'Hilux Custom',
        exceptId: 'cust_hilux1',
      );
      expect(itself.exact, isNull);
      final underNissan = await service.findDuplicates(
        domain: 'vehicle',
        entityType: 'model',
        parentId: 'vehicle_make_nissan',
        label: 'hilux custom',
      );
      expect(underNissan.exact, isNull);
    },
  );

  test('a picker page never exceeds 100 rows, and pages chain', () async {
    final service = freshService();
    const level = CatalogLevel(domain: 'watch', entityType: 'brand');
    final first = await service.search(level, limit: 5000);
    expect(first.items.length, 100);
    final second = await service.search(level, limit: 100, cursor: first.nextCursor);
    expect(second.items.length, 97);
    expect(second.nextCursor, isNull);
    expect({...first.items.map((r) => r.entity.id), ...second.items.map((r) => r.entity.id)}.length, 197);
  });
}
