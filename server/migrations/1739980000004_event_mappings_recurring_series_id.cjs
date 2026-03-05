'use strict';

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE event_invoice_mappings ADD COLUMN IF NOT EXISTS recurring_series_id varchar(255);
  `);
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS event_invoice_mappings_user_recurring_series_idx
    ON event_invoice_mappings (user_id, recurring_series_id);
  `);
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
  pgm.sql(`DROP INDEX IF EXISTS event_invoice_mappings_user_recurring_series_idx;`);
  pgm.dropColumn('event_invoice_mappings', 'recurring_series_id');
};
