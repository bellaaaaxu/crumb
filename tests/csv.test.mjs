import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, exportLedger } from '../server/csv.mjs';
import { grant, revokeGrant } from '../server/ledger.mjs';
import { recordSpend, voidSpend } from '../server/spending.mjs';
import { fixture } from './helpers.mjs';

// Writes a second apart: the export is ordered by time, and rows that share a time fall back to their random ids.
const at = seconds => () => Date.parse('2026-09-01T09:00:00.000Z') + seconds * 1000;

test('spreadsheet formulas are neutralized and quotes escaped', () => {
  assert.equal(csvCell('=1+1'),'"\'=1+1"');
  assert.equal(csvCell('Sam "S"'),'"Sam ""S"""');
  assert.equal(csvCell('\t=1+1'),'"\'\t=1+1"');
});

test('every risky first character is neutralized; plain numbers stay numbers', () => {
  for (const risky of ['+1+1', '-1+2', '@SUM(A1:A2)', '  =cmd|\' /C calc\'!A0', '\r=1', '　=1', '=HYPERLINK("http://x")'])
    assert.ok(csvCell(risky).startsWith('"\''), risky);
  assert.equal(csvCell('-5000'), '"-5000"');
  assert.equal(csvCell(-5000), '"-5000"');
  assert.equal(csvCell('12.50'), '"12.50"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
  assert.equal(csvCell('Sam'), '"Sam"');
});

test('the ledger export is complete, safe to open and free of secrets', t => {
  const { db, owner, member } = fixture(t);
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run('=HYPERLINK("http://evil.example","Mina")', member.id);
  const first = grant(db, owner, { userId: member.id, units: 1250, reason: '@team "great" job', key: 'csv-export-grant-01' }, at(0));
  revokeGrant(db, owner, { grantId: first.entry.id, reason: '-wrong person', key: 'csv-export-revoke-1' }, at(1));

  const csv = exportLedger(db, owner);
  assert.ok(csv.startsWith('\uFEFF'), 'starts with a BOM so spreadsheets read UTF-8');
  const lines = csv.slice(1).split('\r\n').filter(Boolean);
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '"time","member","username","type","units","amount","reason","recorded_by","related_id","entry_id"');
  assert.ok(lines[1].includes('"\'=HYPERLINK(""http://evil.example"",""Mina"")"'));
  assert.ok(lines[1].includes('"grant","1250","$12.50","\'@team ""great"" job"'));
  assert.ok(lines[2].includes('"revoke","-1250","−$12.50","\'-wrong person"'));
  assert.ok(lines[2].includes(`"${first.entry.id}"`), 'the revoke row names the grant it corrects');
  assert.doesNotMatch(csv, /fixture-no-login|scrypt|password/);
});

test('self-recorded entries and their corrections export with their kinds', t => {
  const { db, owner, member } = fixture(t);
  grant(db, owner, { userId: member.id, units: 5000, reason: '', key: 'csv-spend-grant-01' }, at(0));
  const spend = recordSpend(db, member, { units: 700, mode: 'credit', key: 'csv-spend-entry-01' }, at(1));
  voidSpend(db, owner, { spendId: spend.entry.id, reason: 'Wrong amount', key: 'csv-spend-void-01' }, at(2));
  const lines = exportLedger(db, owner).split('\r\n').filter(Boolean);
  const types = lines.slice(1).map(line => line.split(',')[3]);
  assert.deepEqual(types, ['"grant"', '"spend"', '"void"']);
});

test('only managers can export', t => {
  const { db, member } = fixture(t);
  assert.throws(() => exportLedger(db, member), error => error.code === 'FORBIDDEN');
});
