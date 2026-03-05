'use strict';

/**
 * One-time cleanup: remove all Square invoice rows so the next sync repopulates
 * with only draft invoices. Clear event-to-invoice links so users re-link to drafts.
 */
exports.up = (pgm) => {
  pgm.sql('UPDATE event_invoice_mappings SET square_order_id = NULL WHERE square_order_id IS NOT NULL');
  pgm.sql('DELETE FROM square_orders');
};

exports.down = (pgm) => {
  // One-time cleanup; cannot restore deleted data
  pgm.sql('-- no-op: square_orders and mapping links were intentionally cleared');
};
