import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits, formatUnits, MAX_UNITS } from '../server/units.mjs';
import { amountToUnits } from '../app/format.js';

test('the browser check agrees with the server on every amount', () => {
  const samples = ['12.50', '12.5', '0.01', '0', '0.00', '1.001', '-1', '1e2', 'Infinity', '', '.5', '5.', ' 5',
    '10000000000.00', '10000000000.01', '1000000000000', '1000000000001', '100', '０', '9'.repeat(33), '007'];
  for (const mode of ['credit', 'points']) {
    for (const sample of samples) {
      let server = null;
      try {
        server = parseUnits(sample, mode);
      } catch {
        server = null;
      }
      assert.equal(amountToUnits(sample, mode), server, `${mode} ${JSON.stringify(sample)}`);
    }
  }
});

test('exact units and invalid representations', () => {
  assert.equal(parseUnits('12.50', 'credit'), 1250);
  assert.equal(parseUnits('100', 'points'), 100);
  for (const value of ['1.1', '0', '-1', '1e2', 'Infinity', '1000000000001'])
    assert.throws(() => parseUnits(value, 'points'));
  assert.throws(() => parseUnits('1.001', 'credit'));
  assert.throws(() => parseUnits(0.1, 'credit'));
});

test('credit amounts parse to whole cents without floating point', () => {
  assert.equal(parseUnits('0.01', 'credit'), 1);
  assert.equal(parseUnits('12.5', 'credit'), 1250);
  assert.equal(parseUnits('0.10', 'credit'), 10);
  // 0.1 + 0.2 style drift cannot happen: every value is split as text.
  assert.equal(parseUnits('1234567.89', 'credit'), 123456789);
  assert.equal(parseUnits('10000000000.00', 'credit'), MAX_UNITS);
});

test('amounts outside the representation are rejected with one error shape', () => {
  const rejected = [
    ['', 'credit'], ['.5', 'credit'], ['5.', 'credit'], [' 5', 'credit'], ['5 ', 'credit'],
    ['0.00', 'credit'], ['-0.01', 'credit'], ['+5', 'credit'], ['1,000', 'credit'],
    ['10000000000.01', 'credit'], ['０', 'points'], ['12.50', 'points'], ['0x10', 'points'],
    [100, 'points'], [null, 'points'], [undefined, 'credit'], [['5'], 'points'],
    ['9'.repeat(33), 'points'],
  ];
  for (const [value, mode] of rejected) {
    assert.throws(() => parseUnits(value, mode), error => {
      assert.equal(error.status, 422, `status for ${JSON.stringify(value)}`);
      assert.equal(error.code, 'INVALID_AMOUNT', `code for ${JSON.stringify(value)}`);
      return true;
    });
  }
});

test('an unknown mode is rejected before the value is read', () => {
  assert.throws(() => parseUnits('5', 'dollars'), error => error.code === 'INVALID_MODE');
  assert.throws(() => parseUnits('5', undefined), error => error.code === 'INVALID_MODE');
});

test('formatting shows the organization unit and never computes with floats', () => {
  const cad = { mode: 'credit', currency: 'CAD', unitLabel: 'Team credit' };
  const cny = { mode: 'credit', currency: 'CNY', unitLabel: '福利额度' };
  const stars = { mode: 'points', currency: null, unitLabel: 'stars' };
  assert.equal(formatUnits(1250, cad, 'en'), '$12.50');
  assert.equal(formatUnits(-1250, cad, 'en'), '-$12.50');
  assert.equal(formatUnits(1, cad, 'en'), '$0.01');
  assert.equal(formatUnits(MAX_UNITS, cad, 'en'), '$10,000,000,000.00');
  assert.equal(formatUnits(1250, cny, 'zh-CN'), '¥12.50');
  assert.equal(formatUnits(100, stars, 'en'), '100 stars');
  assert.equal(formatUnits(1234567, stars, 'en'), '1,234,567 stars');
  assert.equal(formatUnits(-40, stars, 'en'), '-40 stars');
});
