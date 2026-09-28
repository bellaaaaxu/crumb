import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, exportLedger } from '../server/csv.mjs';
import { grant, revokeGrant } from '../server/ledger.mjs';
import { fixture } from './helpers.mjs';

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
  const first = grant(db, owner, { userId: member.id, units: 1250, reason: '@team "great" job', key: 'csv-export-grant-01' });
  revokeGrant(db, owner, { grantId: first.entry.id, reason: '-wrong person', key: 'csv-export-revoke-1' });

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

test('only managers can export', t => {
  const { db, member } = fixture(t);
  assert.throws(() => exportLedger(db, member), error => error.code === 'FORBIDDEN');
});
