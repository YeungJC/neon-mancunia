import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { quantizeStep, addNote, emptyPattern } from '../src/audio/rainPattern';

test('quantizes to nearest sixteenth, including the two-bar seam', () => {
  assert.equal(quantizeStep(192 * 8, 192 * 8, 192), 0);
  assert.equal(quantizeStep(192 * 8 + 25, 192 * 8, 192), 1);
  assert.equal(quantizeStep(192 * 16 - 2, 192 * 8, 192), 0);
  assert.equal(quantizeStep(192 * 16 + 48, 192 * 8, 192), 1);
});
test('drag repetition cannot double-trigger a lane in one recorded step', () => {
  const pattern = emptyPattern();
  addNote(pattern, 0, { lane: 2, velocity: 0.6 });
  addNote(pattern, 0, { lane: 2, velocity: 0.9 });
  addNote(pattern, 0, { lane: 4, velocity: 0.8 });
  assert.deepEqual(pattern[0], [{ lane: 2, velocity: 0.9 }, { lane: 4, velocity: 0.8 }]);
  assert.equal(pattern[1].length, 0);
  assert.equal(emptyPattern()[0].length, 0);
});
