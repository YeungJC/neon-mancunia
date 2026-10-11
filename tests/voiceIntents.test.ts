import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseCommand, type Intent } from '../src/lib/voiceIntents';

const intents = (said: string) => parseCommand(said).intents;
const only = (said: string, expected: Intent[]) => assert.deepEqual(intents(said), expected, said);

test('tempo: relative, by an amount, and absolute', () => {
  only('increase the bpm', [{ kind: 'bpm', delta: 10 }]);
  only('decrease the BPM', [{ kind: 'bpm', delta: -10 }]);
  only('raise the tempo', [{ kind: 'bpm', delta: 10 }]);
  only('speed it up', [{ kind: 'bpm', delta: 10 }]);
  only('slow it down', [{ kind: 'bpm', delta: -10 }]);
  only('faster', [{ kind: 'bpm', delta: 10 }]);
  only('bpm up by 20', [{ kind: 'bpm', delta: 20 }]);
  only('lower the tempo by five', [{ kind: 'bpm', delta: -5 }]);
  only('set the tempo to 128', [{ kind: 'bpm', set: 128 }]);
  only('128 BPM', [{ kind: 'bpm', set: 128 }]);
  only('set the bpm to a hundred and twenty', [{ kind: 'bpm', set: 120 }]);
});

test('volume: turn it up/down, louder, percentages, mute', () => {
  only('turn it up', [{ kind: 'volume', delta: 0.15 }]);
  only('Turn it down!', [{ kind: 'volume', delta: -0.15 }]);
  only('louder', [{ kind: 'volume', delta: 0.15 }]);
  only('make it quieter', [{ kind: 'volume', delta: -0.15 }]);
  only('volume up', [{ kind: 'volume', delta: 0.15 }]);
  only('decrease the volume', [{ kind: 'volume', delta: -0.15 }]);
  only('volume to 50 percent', [{ kind: 'volume', set: 0.5 }]);
  only('set the volume to 30', [{ kind: 'volume', set: 0.3 }]);
  only('volume down by 20', [{ kind: 'volume', delta: -0.2 }]);
  only('volume up 10%', [{ kind: 'volume', delta: 0.1 }]);
  only('max volume', [{ kind: 'volume', set: 1 }]);
  only('mute', [{ kind: 'mute', on: true }]);
  only('unmute', [{ kind: 'mute', on: false }]);
});

test('combined commands keep every part', () => {
  only('louder and faster', [{ kind: 'volume', delta: 0.15 }, { kind: 'bpm', delta: 10 }]);
  only('turn on the drums and bass', [
    { kind: 'layer', id: 'drums', on: true },
    { kind: 'layer', id: 'bass', on: true },
  ]);
});

test('ambiguous phrases resolve the musical way', () => {
  // "drop the bpm" lowers the tempo; it must not start a beat drop
  only('drop the bpm', [{ kind: 'bpm', delta: -10 }]);
  // naming a layer means the layer, not the master volume
  only('turn up the bass', [{ kind: 'layer', id: 'bass', on: true }]);
  only('mute the drums', [{ kind: 'layer', id: 'drums', on: false }]);
  only('turn down the bass', [{ kind: 'layer', id: 'bass', on: false }]);
  only('bring back the lead', [{ kind: 'layer', id: 'lead', on: true }]);
});

test('layers, everything, stop', () => {
  only('kill the bass', [{ kind: 'layer', id: 'bass', on: false }]);
  only('give me greggs', [{ kind: 'layer', id: 'greggs', on: true }]);
  only('everything', [{ kind: 'allLayers', on: true }]);
  only('turn everything off', [{ kind: 'allLayers', on: false }]);
  only('stop the music', [{ kind: 'allLayers', on: false }]);
});

test('navigation, filter and the drop', () => {
  only('take me to the Hacienda', [{ kind: 'go', chapter: 2 }]);
  only('next', [{ kind: 'step', dir: 1 }]);
  only('go back', [{ kind: 'step', dir: -1 }]);
  only('muffle it', [{ kind: 'filter', open: 0.3 }]);
  only('open it up', [{ kind: 'filter', open: 1 }]);
  only('drop it', [{ kind: 'drop' }]);
  only('send it', [{ kind: 'drop' }]);
});

test('chat when nothing is a command', () => {
  assert.equal(parseCommand('is it raining?').chat, 'weather');
  assert.equal(parseCommand('play wonderwall').chat, 'wonderwall');
  assert.equal(parseCommand('who are you').chat, 'who');
  assert.equal(parseCommand('blah blah').chat, undefined);
});

test('"get rid of" means off', () => {
  only('get rid of the drums', [{ kind: 'layer', id: 'drums', on: false }]);
  only('ditch the lead', [{ kind: 'layer', id: 'lead', on: false }]);
});

test('Gemma output is validated and clamped before it touches the set', async () => {
  const { fromGemma } = await import('../src/lib/voiceIntents');
  assert.deepEqual(
    fromGemma([
      { action: 'volume_change', value: -20 },
      { action: 'bpm_change', value: -10 },
      { action: 'layer_off', layer: 'drums' },
      { action: 'go_to', place: 'hacienda' },
    ]),
    [
      { kind: 'volume', delta: -0.2 },
      { kind: 'bpm', delta: -10 },
      { kind: 'layer', id: 'drums', on: false },
      { kind: 'go', chapter: 2 },
    ],
  );
  // clamped: tempo and volume can't leave their ranges whatever the model says
  assert.deepEqual(fromGemma([{ action: 'bpm_set', value: 400 }, { action: 'volume_set', value: 250 }]), [
    { kind: 'bpm', set: 150 },
    { kind: 'volume', set: 1 },
  ]);
  // unknown actions, unknown layers and missing values are dropped, not guessed
  assert.deepEqual(
    fromGemma([{ action: 'delete_everything' }, { action: 'layer_on', layer: 'kazoo' }, { action: 'bpm_set' }, { action: 'go_to', place: 'london' }]),
    [],
  );
});
