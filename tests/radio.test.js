import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadio } from '../src/radio.js';

function setup(play = async () => {}) {
  const media = new EventTarget();
  Object.assign(media, { play, pause() {}, load() {}, removeAttribute(name) { delete this[name]; } });
  const states = [];
  const radio = createRadio(media, status => states.push(status));
  return { radio, media, states };
}

test('radio waits for a gesture and reports actual playback and buffering', async () => {
  const { radio, media, states } = setup();
  assert.equal(media.src, undefined);
  const start = radio.toggle();
  assert.equal(states.at(-1), 'CONNECTING');
  media.dispatchEvent(new Event('playing'));
  await start;
  assert.equal(states.at(-1), 'LIVE');
  media.dispatchEvent(new Event('waiting'));
  assert.equal(states.at(-1), 'CONNECTING');
  await radio.toggle();
  assert.equal(states.at(-1), 'OFF');
  assert.equal(media.src, undefined);
});

test('stopping during connection ignores a late rejected play promise', async () => {
  let reject;
  const { radio, states } = setup(() => new Promise((_, fail) => { reject = fail; }));
  const start = radio.toggle();
  await radio.toggle();
  reject(new Error('interrupted'));
  await start;
  assert.equal(states.at(-1), 'OFF');
});

test('stream errors release the connection and allow retry', async () => {
  const { radio, media, states } = setup();
  await radio.toggle();
  media.dispatchEvent(new Event('error'));
  assert.equal(states.at(-1), 'UNAVAILABLE');
  assert.equal(media.src, undefined);
  await radio.toggle();
  media.dispatchEvent(new Event('playing'));
  assert.equal(states.at(-1), 'LIVE');
});

test('autoplay rejection is recoverable', async () => {
  const { radio, states } = setup(async () => { throw new Error('blocked'); });
  await radio.toggle();
  assert.equal(states.at(-1), 'UNAVAILABLE');
});
