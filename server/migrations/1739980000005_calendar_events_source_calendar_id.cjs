'use strict';

exports.up = (pgm) => {
  pgm.addColumn('calendar_events', {
    source_calendar_id: { type: 'varchar(255)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('calendar_events', 'source_calendar_id');
};
