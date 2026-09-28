import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/inventory/presentation/inventory_screen.dart';
import '../../features/inventory/presentation/item_detail_screen.dart';
import '../../features/inventory/presentation/item_form_screen.dart';
import '../../features/overview/presentation/overview_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/trash/presentation/trash_screen.dart';
import '../../l10n/generated/app_localizations.dart';
import '../shell/phase_placeholder.dart';

/// The tab paths, in the reference's order (src/navigation.js TABS): the
/// inventory, the overview, the assistant and settings in the bar; the
/// classification manager is reached from settings.
abstract final class Routes {
  static const inventory = '/inventory';
  static const overview = '/overview';
  static const assistant = '/assistant';
  static const settings = '/settings';
  static const categories = '/settings/categories';
}

final _root = GlobalKey<NavigatorState>();

GoRouter buildRouter() => GoRouter(
  navigatorKey: _root,
  initialLocation: Routes.inventory,
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => _Shell(shell: shell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.inventory,
              builder: (c, s) => const InventoryScreen(),
              routes: [
                GoRoute(path: 'new', parentNavigatorKey: _root, builder: (c, s) => const ItemFormScreen()),
                GoRoute(
                  path: 'item/:id',
                  parentNavigatorKey: _root,
                  builder: (c, s) => ItemDetailScreen(itemId: s.pathParameters['id']!),
                  routes: [
                    GoRoute(
                      path: 'edit',
                      parentNavigatorKey: _root,
                      builder: (c, s) => ItemFormScreen(itemId: s.pathParameters['id']),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [GoRoute(path: Routes.overview, builder: (c, s) => const OverviewScreen())],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.assistant,
              builder: (c, s) => PhasePlaceholder(title: AppLocalizations.of(c).navAssistant),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: Routes.settings,
              builder: (c, s) => const SettingsScreen(),
              routes: [
                GoRoute(path: 'trash', parentNavigatorKey: _root, builder: (c, s) => const TrashScreen()),
                GoRoute(
                  path: 'categories',
                  builder: (c, s) => PhasePlaceholder(title: AppLocalizations.of(c).navCategories),
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
);

class _Shell extends StatelessWidget {
  const _Shell({required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (index) => shell.goBranch(index, initialLocation: index == shell.currentIndex),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.inventory_2_outlined), label: l.navInventory),
          NavigationDestination(icon: const Icon(Icons.insights_outlined), label: l.navOverview),
          NavigationDestination(icon: const Icon(Icons.auto_awesome_outlined), label: l.navAssistant),
          NavigationDestination(icon: const Icon(Icons.settings_outlined), label: l.navSettings),
        ],
      ),
    );
  }
}
