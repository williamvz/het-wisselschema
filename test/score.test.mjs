import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stand, plusMin, verloop } from '../src/lib/score.js';

const goals = [
  { id: 'a', wie: 'wij', sec: 300, opVeld: ['p1', 'p2', 'p3'] },
  { id: 'b', wie: 'zij', sec: 1500, opVeld: ['p1', 'p4', 'p5'] },
  { id: 'c', wie: 'wij', sec: 900, opVeld: ['p1', 'p2', 'p4'] },
];

test('de stand telt goals voor en tegen', () => {
  assert.deepEqual(stand(goals), { wij: 2, zij: 1 });
  assert.deepEqual(stand([]), { wij: 0, zij: 0 });
  assert.deepEqual(stand(), { wij: 0, zij: 0 });
});

test('plus-min telt alleen wie er in het veld stond', () => {
  const pm = plusMin(goals);
  assert.deepEqual(pm.p1, { voor: 2, tegen: 1, saldo: 1 });
  assert.deepEqual(pm.p2, { voor: 2, tegen: 0, saldo: 2 });
  assert.deepEqual(pm.p5, { voor: 0, tegen: 1, saldo: -1 });
  assert.equal(pm.p6, undefined, 'wie niet in het veld stond telt niet mee');
});

test('het verloop geeft de tussenstand in volgorde van de klok', () => {
  assert.deepEqual(verloop(goals).map((d) => `${d.wij}-${d.zij}`), ['1-0', '2-0', '2-1']);
  assert.equal(goals[1].id, 'b', 'de invoer wordt niet omgegooid');
});

test('de goalminuut telt zoals op het wedstrijdformulier', async () => {
  const { goalMinuut } = await import('../src/lib/score.js');
  assert.equal(goalMinuut(0), 1);
  assert.equal(goalMinuut(30), 1);
  assert.equal(goalMinuut(60), 1);
  assert.equal(goalMinuut(61), 2);
});
