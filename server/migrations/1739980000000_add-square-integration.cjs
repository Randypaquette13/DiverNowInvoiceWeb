'use strict';

exports.up = (pgm) => {
  pgm.addColumns('user_integrations', {
    square_access_token: { type: 'text' },
    square_location_id: { type: 'varchar(255)' },
  });

  pgm.createTable('square_orders', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    external_order_id: { type: 'varchar(255)', notNull: true },
    customer_email: { type: 'varchar(255)' },
    amount: { type: 'varchar(50)' },
    line_items_summary: { type: 'text' },
    raw_json: { type: 'jsonb' },
    synced_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
  });
  pgm.createIndex('square_orders', 'user_id');
  pgm.createIndex('square_orders', ['user_id', 'external_order_id'], { unique: true });

  pgm.addColumns('event_invoice_mappings', {
    square_order_id: { type: 'varchar(255)' },
  });
  pgm.addColumns('cleaning_records', {
    square_order_id: { type: 'varchar(255)' },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('square_orders');
  pgm.dropColumns('event_invoice_mappings', ['square_order_id']);
  pgm.dropColumns('cleaning_records', ['square_order_id']);
  pgm.dropColumns('user_integrations', ['square_access_token', 'square_location_id']);
};
