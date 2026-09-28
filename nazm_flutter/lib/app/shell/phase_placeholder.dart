import 'package:flutter/material.dart';

/// A tab whose screen arrives in a later migration phase. Development builds
/// only: phase 3 replaces every use, and the release build is not cut before.
class PhasePlaceholder extends StatelessWidget {
  const PhasePlaceholder({super.key, required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: const SizedBox.expand(),
    );
  }
}
