/// The release's feature configuration. Carried over from the reference
/// (`nazm.config.js`, src/features.js): the App Store 1.0 release is local
/// only, and nothing unfinished is shown to customers.
///
/// A disabled flag means the feature's code path is never entered: no
/// network client is created, no screen offers it, no placeholder appears.
class FeatureFlags {
  const FeatureFlags({
    this.cloud = false,
    this.accounts = false,
    this.team = false,
    this.billing = false,
    this.cloudAi = false,
  });

  final bool cloud;
  final bool accounts;
  final bool team;
  final bool billing;
  final bool cloudAi;

  /// The shipped configuration.
  static const release = FeatureFlags();

  /// Flags that depend on another are switched off with it, as the reference
  /// does when a configuration is inconsistent (team or billing without
  /// accounts, accounts without cloud…).
  FeatureFlags get consistent {
    final cloudOn = cloud;
    final accountsOn = cloudOn && accounts;
    return FeatureFlags(
      cloud: cloudOn,
      accounts: accountsOn,
      team: accountsOn && team,
      billing: accountsOn && billing,
      cloudAi: cloudOn && cloudAi,
    );
  }
}

/// Public addresses are configuration, never invented in code. Null until the
/// release configuration provides them; the UI hides what is not set.
class ReleaseLinks {
  const ReleaseLinks({this.supportEmail, this.supportUrl, this.privacyUrl, this.termsUrl});
  final String? supportEmail;
  final String? supportUrl;
  final String? privacyUrl;
  final String? termsUrl;

  static const release = ReleaseLinks();
}
