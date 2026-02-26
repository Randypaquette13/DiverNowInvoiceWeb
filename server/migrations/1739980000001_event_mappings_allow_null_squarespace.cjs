'use strict';

exports.up = (pgm) => {
  pgm.alterColumn('event_invoice_mappings', 'squarespace_order_id', {
    notNull: false,
  });
};

exports.down = (pgm) => {
  pgm.alterColumn('event_invoice_mappings', 'squarespace_order_id', {
    notNull: true,
  });
};
