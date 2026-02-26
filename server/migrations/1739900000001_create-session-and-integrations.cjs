exports.up = (pgm) => {
  pgm.createTable('user_integrations', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    google_refresh_token: { type: 'text' },
    google_calendar_id: { type: 'varchar(255)', default: 'primary' },
    squarespace_site_id: { type: 'varchar(255)' },
    squarespace_api_key: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('user_integrations', 'user_id');

  pgm.createTable('calendar_events', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    external_id: { type: 'varchar(255)', notNull: true },
    title: { type: 'varchar(500)' },
    start_at: { type: 'timestamptz', notNull: true },
    end_at: { type: 'timestamptz' },
    raw_json: { type: 'jsonb' },
    synced_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('calendar_events', 'user_id');
  pgm.createIndex('calendar_events', ['user_id', 'external_id'], { unique: true });
  pgm.createIndex('calendar_events', ['user_id', 'start_at']);

  pgm.createTable('cleaning_records', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    calendar_event_id: { type: 'integer', notNull: true, references: 'calendar_events(id)', onDelete: 'CASCADE' },
    status: { type: 'varchar(50)', notNull: true, default: 'pending' },
    notes: { type: 'text' },
    extra_work: { type: 'varchar(500)' },
    squarespace_order_id: { type: 'varchar(255)' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('cleaning_records', 'user_id');
  pgm.createIndex('cleaning_records', 'calendar_event_id', { unique: true });

  pgm.createTable('squarespace_orders', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    external_order_id: { type: 'varchar(255)', notNull: true },
    customer_email: { type: 'varchar(255)' },
    amount: { type: 'varchar(50)' },
    line_items_summary: { type: 'text' },
    raw_json: { type: 'jsonb' },
    synced_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('squarespace_orders', 'user_id');
  pgm.createIndex('squarespace_orders', ['user_id', 'external_order_id'], { unique: true });

  pgm.createTable('event_invoice_mappings', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    calendar_event_id: { type: 'integer', notNull: true, references: 'calendar_events(id)', onDelete: 'CASCADE' },
    squarespace_order_id: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('event_invoice_mappings', 'user_id');
  pgm.createIndex('event_invoice_mappings', 'calendar_event_id', { unique: true });

  pgm.createTable('push_tokens', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    device_token: { type: 'varchar(500)', notNull: true },
    platform: { type: 'varchar(50)', notNull: true, default: 'ios' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('push_tokens', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('push_tokens');
  pgm.dropTable('event_invoice_mappings');
  pgm.dropTable('squarespace_orders');
  pgm.dropTable('cleaning_records');
  pgm.dropTable('calendar_events');
  pgm.dropTable('user_integrations');
};
