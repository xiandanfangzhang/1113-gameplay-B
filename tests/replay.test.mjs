import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_CELL_COUNT } from '../src/constants.js';
import { replayParking, replaySplit, replayTutorial, replayWrongParking } from '../scripts/replay-levels.mjs';

test('三个内置关卡经真实引擎无道具通关', () => {
  for (const replay of [replayTutorial, replaySplit, replayParking]) {
    const { game, summary } = replay();
    assert.equal(game.status, 'won', summary.id);
    assert.equal(summary.pickups, ACTIVE_CELL_COUNT);
    assert.equal(summary.ballsLeft, 0);
    assert.equal(summary.garageLeft, 0);
    assert.equal(summary.roadLeft, 0);
    assert.equal(game.events.some((event) => ['clear', 'shuffle', 'magnet'].includes(event.type)), false);
  }
});

test('第三关错误派车可形成真实六车死局', () => {
  const { game } = replayWrongParking();
  assert.equal(game.status, 'failed');
  assert.equal(game.road.length, 6);
  assert.equal(game.ballsLeft, ACTIVE_CELL_COUNT);
});
