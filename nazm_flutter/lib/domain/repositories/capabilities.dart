/// What a backend answers itself. Carried over from the reference
/// (src/repository.js `capabilities`): a backend that declares nothing is
/// assumed to answer nothing, so a new backend is safe until it says
/// otherwise.
class BackendCapabilities {
  const BackendCapabilities({
    this.serverQueries = false,
    this.aggregates = false,
    this.search = false,
    this.duplicateCandidates = false,
    this.fullExport = false,
    this.wholeInventoryRead = false,
  });

  /// queryItems / countItemsMatching answered by the backend.
  final bool serverQueries;

  /// inventoryAggregate / aggregateItems (may still answer null).
  final bool aggregates;

  /// Text search in queryItems.
  final bool search;

  /// Bounded duplicate candidates.
  final bool duplicateCandidates;

  /// An explicit, user-requested export of everything.
  final bool fullExport;

  /// Reading every record is cheap and local. False for any remote source:
  /// a cloud workspace is never downloaded whole for an ordinary screen.
  final bool wholeInventoryRead;

  static const none = BackendCapabilities();

  /// The device database: everything is local.
  static const local = BackendCapabilities(
    serverQueries: true,
    aggregates: true,
    search: true,
    duplicateCandidates: true,
    fullExport: true,
    wholeInventoryRead: true,
  );
}

/// The only reasons a whole-dataset read may be requested from a backend
/// without [BackendCapabilities.wholeInventoryRead]: each is a job the
/// customer started on purpose.
enum WholeDatasetPurpose { export, restore, migration, maintenance }
