'use strict';

exports.up = (pgm) => {
  pgm.addColumn('calendar_events', {
    recurring_event_id: { type: 'varchar(255)' },
  });
  pgm.createIndex('calendar_events', ['user_id', 'recurring_event_id'], {
    name: 'calendar_events_user_recurring_idx',
  });
  // Backfill from raw_json where possible
  pgm.sql(`
    UPDATE calendar_events
    SET recurring_event_id = raw_json->>'recurringEventId'
    WHERE raw_json IS NOT NULL AND raw_json ? 'recurringEventId'
  `);
};

exports.down = (pgm) => {
  pgm.dropIndex('calendar_events', ['user_id', 'recurring_event_id'], {
    name: 'calendar_events_user_recurring_idx',
  });
  pgm.dropColumn('calendar_events', 'recurring_event_id');
};
