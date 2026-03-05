'use strict';

exports.up = (pgm) => {
  pgm.addColumn('event_invoice_mappings', {
    recurring_series_id: { type: 'varchar(255)' },
  });
  pgm.createIndex('event_invoice_mappings', ['user_id', 'recurring_series_id'], {
    name: 'event_invoice_mappings_user_recurring_series_idx',
  });
  // Backfill from linked calendar_event
  pgm.sql(`
    UPDATE event_invoice_mappings m
    SET recurring_series_id = COALESCE(ce.recurring_event_id, ce.raw_json->>'recurringEventId')
    FROM calendar_events ce
    WHERE ce.id = m.calendar_event_id AND m.recurring_series_id IS NULL
      AND (ce.recurring_event_id IS NOT NULL OR (ce.raw_json IS NOT NULL AND ce.raw_json ? 'recurringEventId'))
  `);
};

exports.down = (pgm) => {
  pgm.dropIndex('event_invoice_mappings', ['user_id', 'recurring_series_id'], {
    name: 'event_invoice_mappings_user_recurring_series_idx',
  });
  pgm.dropColumn('event_invoice_mappings', 'recurring_series_id');
};
