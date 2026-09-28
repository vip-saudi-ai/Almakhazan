# NAZM (Flutter)

The native Flutter/Dart implementation of NAZM. The HTML/JavaScript app in
the repository root is the golden functional reference; see
[MIGRATION-PLAN.md](MIGRATION-PLAN.md) for the migration map, schema,
parity matrix and phase status.

```sh
node tool/export_reference.mjs     # regenerate ARB, catalog and taxonomy assets from the reference
node tool/export_fixtures.mjs      # regenerate golden parity fixtures from the reference
dart run build_runner build        # Drift code
flutter analyze && flutter test
```
