import 'dart:convert';
import 'dart:io';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'events/base_event.dart';
import 'events/ingestion_metadata.dart';

class EventStorage {
  static const String _databaseName = 'analytics_events.db';
  static const int _databaseVersion = 2;

  // Table names
  static const String _eventsTable = 'events';
  static const String _identifyTable = 'identifies';
  static const String _groupsTable = 'groups';
  static const String _instanceNameColumn = 'instance_name';

  final String instanceName;

  Database? _database;

  EventStorage(this.instanceName);

  /// Initialize the database
  Future<void> initialize() async {
    if (_database != null) return;

    final databasesPath = await getDatabasesPath();
    final path = join(databasesPath, _databaseName);

    _database = await openDatabase(
      path,
      version: _databaseVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );

    await _migrateLegacyRows();
  }

  /// Create database tables
  Future<void> _onCreate(Database db, int version) async {
    // Events table
    await db.execute('''
      CREATE TABLE $_eventsTable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        event_data TEXT NOT NULL,
        $_instanceNameColumn TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0
      )
    ''');

    // Identifies table
    await db.execute('''
      CREATE TABLE $_identifyTable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identify_data TEXT NOT NULL,
        $_instanceNameColumn TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0
      )
    ''');

    // Groups table
    await db.execute('''
      CREATE TABLE $_groupsTable (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_data TEXT NOT NULL,
        $_instanceNameColumn TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0
      )
    ''');

    // Create indexes for better performance
    await db.execute(
        'CREATE INDEX idx_events_instance_timestamp ON $_eventsTable($_instanceNameColumn, timestamp)');
    await db.execute(
        'CREATE INDEX idx_identify_instance_timestamp ON $_identifyTable($_instanceNameColumn, timestamp)');
    await db.execute(
        'CREATE INDEX idx_groups_instance_timestamp ON $_groupsTable($_instanceNameColumn, timestamp)');
  }

  /// Handle database upgrades
  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute(
          'ALTER TABLE $_eventsTable ADD COLUMN $_instanceNameColumn TEXT NOT NULL DEFAULT \'\'');
      await db.execute(
          'ALTER TABLE $_identifyTable ADD COLUMN $_instanceNameColumn TEXT NOT NULL DEFAULT \'\'');
      await db.execute(
          'ALTER TABLE $_groupsTable ADD COLUMN $_instanceNameColumn TEXT NOT NULL DEFAULT \'\'');
      await db.execute(
          'CREATE INDEX idx_events_instance_timestamp ON $_eventsTable($_instanceNameColumn, timestamp)');
      await db.execute(
          'CREATE INDEX idx_identify_instance_timestamp ON $_identifyTable($_instanceNameColumn, timestamp)');
      await db.execute(
          'CREATE INDEX idx_groups_instance_timestamp ON $_groupsTable($_instanceNameColumn, timestamp)');
    }
  }

  Future<void> _migrateLegacyRows() async {
    await _database?.update(
      _eventsTable,
      {_instanceNameColumn: instanceName},
      where: '$_instanceNameColumn = ?',
      whereArgs: [''],
    );
    await _database?.update(
      _identifyTable,
      {_instanceNameColumn: instanceName},
      where: '$_instanceNameColumn = ?',
      whereArgs: [''],
    );
    await _database?.update(
      _groupsTable,
      {_instanceNameColumn: instanceName},
      where: '$_instanceNameColumn = ?',
      whereArgs: [''],
    );
  }

  /// Add event to storage
  Future<void> addEvent(BaseEvent event) async {
    await _ensureInitialized();

    final eventData = {
      'event_name': event.eventType,
      'event_data': jsonEncode(event.toMap()),
      _instanceNameColumn: instanceName,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'retry_count': 0,
    };

    await _database?.insert(_eventsTable, eventData);
  }

  /// Add identify data to storage
  Future<void> addIdentify(Map<String, dynamic> identifyData) async {
    await _ensureInitialized();

    await _database?.insert(
      _identifyTable,
      {
        'identify_data': jsonEncode(identifyData),
        _instanceNameColumn: instanceName,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
        'retry_count': 0,
      },
    );
  }

  /// Add group data to storage
  Future<void> addGroup(Map<String, dynamic> groupData) async {
    await _ensureInitialized();

    await _database?.insert(
      _groupsTable,
      {
        'group_data': jsonEncode(groupData),
        _instanceNameColumn: instanceName,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
        'retry_count': 0,
      },
    );
  }

  /// Get stored events, oldest-first by timestamp. When [afterId] is set,
  /// only rows with `id > afterId` are returned — used by the pre-logout
  /// drain to walk past null-userId rows it deliberately leaves on disk,
  /// without re-fetching the same head over and over (a plain LIMIT+ORDER
  /// query would loop back on iteration 2). Autoincrement ids grow in
  /// insertion order alongside `timestamp`, so cursor + timestamp order
  /// give consistent semantics.
  Future<List<BaseEvent>> getEvents({int limit = 50, int? afterId}) async {
    await _ensureInitialized();

    final where = afterId == null
        ? '$_instanceNameColumn = ?'
        : '$_instanceNameColumn = ? AND id > ?';
    final whereArgs = afterId == null
        ? <Object?>[instanceName]
        : <Object?>[instanceName, afterId];

    final List<Map<String, dynamic>> maps = await _database?.query(
          _eventsTable,
          where: where,
          whereArgs: whereArgs,
          orderBy: 'timestamp ASC',
          limit: limit,
        ) ??
        [];

    return maps.map((map) {
      final eventData = jsonDecode(map['event_data']) as Map<String, dynamic>;
      final event = baseEventFromMap(eventData);
      event.eventId ??= map['id']; // Assign database ID if not already set
      return event;
    }).toList();
  }

  /// Get stored identifies. See [getEvents] for `afterId` semantics.
  Future<List<Map<String, dynamic>>> getIdentifies(
      {int limit = 50, int? afterId}) async {
    await _ensureInitialized();

    final where = afterId == null
        ? '$_instanceNameColumn = ?'
        : '$_instanceNameColumn = ? AND id > ?';
    final whereArgs = afterId == null
        ? <Object?>[instanceName]
        : <Object?>[instanceName, afterId];

    final List<Map<String, dynamic>> maps = await _database?.query(
          _identifyTable,
          where: where,
          whereArgs: whereArgs,
          orderBy: 'timestamp ASC',
          limit: limit,
        ) ??
        [];

    return maps.map((map) {
      final identifyData =
          jsonDecode(map['identify_data']) as Map<String, dynamic>;
      identifyData['event_id'] ??= map['id'];
      return identifyData;
    }).toList();
  }

  /// Get stored groups. See [getEvents] for `afterId` semantics.
  Future<List<Map<String, dynamic>>> getGroups(
      {int limit = 50, int? afterId}) async {
    await _ensureInitialized();

    final where = afterId == null
        ? '$_instanceNameColumn = ?'
        : '$_instanceNameColumn = ? AND id > ?';
    final whereArgs = afterId == null
        ? <Object?>[instanceName]
        : <Object?>[instanceName, afterId];

    final List<Map<String, dynamic>> maps = await _database?.query(
          _groupsTable,
          where: where,
          whereArgs: whereArgs,
          orderBy: 'timestamp ASC',
          limit: limit,
        ) ??
        [];

    return maps.map((map) {
      final groupData = jsonDecode(map['group_data']) as Map<String, dynamic>;
      groupData['event_id'] ??= map['id'];
      return groupData;
    }).toList();
  }

  /// Get count of stored events
  Future<int> getEventCount() async {
    await _ensureInitialized();

    final result = await _database?.rawQuery(
          'SELECT COUNT(*) FROM $_eventsTable WHERE $_instanceNameColumn = ?',
          [instanceName],
        ) ??
        [];
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// Get count of stored identifies
  Future<int> getIdentifyCount() async {
    await _ensureInitialized();

    final result = await _database?.rawQuery(
          'SELECT COUNT(*) FROM $_identifyTable WHERE $_instanceNameColumn = ?',
          [instanceName],
        ) ??
        [];
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// Get count of stored groups
  Future<int> getGroupCount() async {
    await _ensureInitialized();

    final result = await _database?.rawQuery(
          'SELECT COUNT(*) FROM $_groupsTable WHERE $_instanceNameColumn = ?',
          [instanceName],
        ) ??
        [];
    return Sqflite.firstIntValue(result) ?? 0;
  }

  /// Clear all events after successful upload
  Future<void> clearEvents() async {
    await _ensureInitialized();
    await _database?.delete(
      _eventsTable,
      where: '$_instanceNameColumn = ?',
      whereArgs: [instanceName],
    );
  }

  /// Clear all identifies after successful upload
  Future<void> clearIdentifies() async {
    await _ensureInitialized();
    await _database?.delete(
      _identifyTable,
      where: '$_instanceNameColumn = ?',
      whereArgs: [instanceName],
    );
  }

  /// Clear all groups after successful upload
  Future<void> clearGroups() async {
    await _ensureInitialized();
    await _database?.delete(
      _groupsTable,
      where: '$_instanceNameColumn = ?',
      whereArgs: [instanceName],
    );
  }

  Future<void> removeEventsByIds(List<int> ids) async {
    await _deleteRowsByIds(_eventsTable, ids);
  }

  Future<void> removeIdentifiesByIds(List<int> ids) async {
    await _deleteRowsByIds(_identifyTable, ids);
  }

  Future<void> removeGroupsByIds(List<int> ids) async {
    await _deleteRowsByIds(_groupsTable, ids);
  }

  /// Clear old events (older than specified days)
  Future<void> clearOldEvents({int olderThanDays = 7}) async {
    await _ensureInitialized();

    final cutoffTime = DateTime.now()
        .subtract(Duration(days: olderThanDays))
        .millisecondsSinceEpoch;

    await _database?.delete(
      _eventsTable,
      where: '$_instanceNameColumn = ? AND timestamp < ?',
      whereArgs: [instanceName, cutoffTime],
    );

    await _database?.delete(
      _identifyTable,
      where: '$_instanceNameColumn = ? AND timestamp < ?',
      whereArgs: [instanceName, cutoffTime],
    );

    await _database?.delete(
      _groupsTable,
      where: '$_instanceNameColumn = ? AND timestamp < ?',
      whereArgs: [instanceName, cutoffTime],
    );
  }

  /// Increment retry count for failed events
  Future<void> incrementEventRetryCount(int id) async {
    await _incrementRetryCount(_eventsTable, id);
  }

  Future<void> incrementIdentifyRetryCount(int id) async {
    await _incrementRetryCount(_identifyTable, id);
  }

  Future<void> incrementGroupRetryCount(int id) async {
    await _incrementRetryCount(_groupsTable, id);
  }

  Future<void> incrementRetryCount(String tableName, int id) async {
    await _incrementRetryCount(tableName, id);
  }

  Future<void> _incrementRetryCount(String tableName, int id) async {
    await _ensureInitialized();

    await _database?.rawUpdate(
      'UPDATE $tableName SET retry_count = retry_count + 1 '
      'WHERE id = ? AND $_instanceNameColumn = ?',
      [id, instanceName],
    );
  }

  /// Remove events that have exceeded max retry attempts
  Future<void> removeFailedEvents({int maxRetries = 3}) async {
    await _ensureInitialized();

    await _database?.delete(
      _eventsTable,
      where: '$_instanceNameColumn = ? AND retry_count >= ?',
      whereArgs: [instanceName, maxRetries],
    );

    await _database?.delete(
      _identifyTable,
      where: '$_instanceNameColumn = ? AND retry_count >= ?',
      whereArgs: [instanceName, maxRetries],
    );

    await _database?.delete(
      _groupsTable,
      where: '$_instanceNameColumn = ? AND retry_count >= ?',
      whereArgs: [instanceName, maxRetries],
    );
  }

  /// Get database size in bytes
  Future<int> getDatabaseSize() async {
    await _ensureInitialized();

    final databasesPath = await getDatabasesPath();
    final path = join(databasesPath, _databaseName);

    try {
      final file = await File(path).stat();
      return file.size;
    } catch (e) {
      return 0;
    }
  }

  /// Dispose database connection
  Future<void> dispose() async {
    await _database?.close();
    _database = null;
  }

  /// Ensure database is initialized
  Future<void> _ensureInitialized() async {
    if (_database == null) {
      await initialize();
    }
  }

  Future<void> _deleteRowsByIds(String tableName, List<int> ids) async {
    if (ids.isEmpty) {
      return;
    }

    await _ensureInitialized();
    final placeholders = List.filled(ids.length, '?').join(', ');

    await _database?.delete(
      tableName,
      where: '$_instanceNameColumn = ? AND id IN ($placeholders)',
      whereArgs: [instanceName, ...ids],
    );
  }
}

/// Helper function to create BaseEvent from Map.
///
/// MUST restore every top-level field `BaseEvent.toMap` emits — the storage
/// roundtrip is `toMap → jsonEncode → SQLite → jsonDecode → baseEventFromMap`,
/// and a field the deserializer misses is silently dropped on flush even
/// though it was persisted correctly. `adid` was the field that surfaced this
/// (empty in ClickHouse for every event) because it has no send-time fallback
/// in `HttpNetworkService._sendEventsViaHttp` — unlike `platform`/`library`
/// which are re-derived from `deviceContext` at flush time and so masked the
/// bug for weeks.
BaseEvent baseEventFromMap(Map<String, dynamic> map) {
  final event = BaseEvent(
    map['event_type'] ?? '',
    eventProperties: Map<String, dynamic>.from(map['event_properties'] ?? {}),
    userProperties: Map<String, dynamic>.from(map['user_properties'] ?? {}),
    groups: Map<String, dynamic>.from(map['groups'] ?? {}),
    groupProperties: Map<String, dynamic>.from(map['group_properties'] ?? {}),
    userId: map['user_id'],
    deviceId: map['device_id'],
    timestamp: map['timestamp'],
    eventId: map['event_id'],
    sessionId: map['session_id'],
    insertId: map['insert_id'],
    locationLat: (map['location_lat'] as num?)?.toDouble(),
    locationLng: (map['location_lng'] as num?)?.toDouble(),
    appVersion: map['app_version'],
    versionName: map['version_name'],
    platform: map['platform'],
    osName: map['os_name'],
    osVersion: map['os_version'],
    deviceBrand: map['device_brand'],
    deviceManufacturer: map['device_manufacturer'],
    deviceModel: map['device_model'],
    carrier: map['carrier'],
    country: map['country'],
    region: map['region'],
    city: map['city'],
    dma: map['dma'],
    idfa: map['idfa'],
    idfv: map['idfv'],
    adid: map['adid'],
    appSetId: map['app_set_id'],
    androidId: map['android_id'],
    language: map['language'],
    library: map['library'],
    ip: map['ip'],
    ingestionMetadata: map['ingestion_metadata'] is Map
        ? IngestionMetadata(
            sourceName: (map['ingestion_metadata'] as Map)['sourceName'],
            sourceVersion:
                (map['ingestion_metadata'] as Map)['sourceVersion'],
          )
        : null,
    revenue: (map['revenue'] as num?)?.toDouble(),
    price: (map['price'] as num?)?.toDouble(),
    quantity: map['quantity'],
    productId: map['product_id'],
    revenueType: map['revenue_type'],
    currency: map['currency'],
    extra: map['extra'] != null
        ? Map<String, dynamic>.from(map['extra'] as Map)
        : null,
    partnerId: map['partner_id'],
  );
  // `attempts` isn't a constructor param — restore separately.
  final attempts = map['attempts'];
  if (attempts is int) event.attempts = attempts;
  // Restore pseudo_id so it is sent at root level in gRPC
  final pseudoId = map['pseudo_id'];
  if (pseudoId != null && pseudoId.toString().isNotEmpty) {
    event.pseudoUserId = pseudoId.toString();
  }
  return event;
}
