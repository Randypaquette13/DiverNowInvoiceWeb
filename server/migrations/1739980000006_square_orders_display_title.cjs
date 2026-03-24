'use strict';

exports.up = (pgm) => {
  pgm.addColumns('square_orders', {
    display_title: { type: 'varchar(255)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('square_orders', ['display_title']);
};
