import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceGame, createGame, dispatchCar } from '../src/engine.js';
import { importLevel, validateLevel } from '../src/validation.js';

const report = JSON.parse(await readFile(new URL('verification-report.json', import.meta.url), 'utf8'));
const humanReport = JSON.parse(await readFile(new URL('human-route-report.json', import.meta.url), 'utf8'));
function branch(level, priority) {
  const game = createGame(level);
  let peak = 0;
  while (game.status === 'playing' && game.tick < 12000) {
    for (const column of priority) {
      while (game.garage[column - 1].length && game.road.length < 6) {
        const result = dispatchCar(game, game.garage[column - 1][0].id);
        assert.equal(result.ok, true);
        peak = Math.max(peak, game.road.length);
      }
    }
    advanceGame(game);
  }
  return { status: game.status, tick: game.tick, ballsLeft: game.ballsLeft, peak };
}

for (const item of report.levels) {
  const json = await readFile(new URL(item.file, import.meta.url), 'utf8');
  const level = importLevel(json, item.id);
  const check = validateLevel(level);
  assert.deepEqual(check.errors, []);
  assert.deepEqual(check.warnings, []);
  assert.equal(level.width, 40);
  assert.equal(level.height, 40);
  assert.equal(level.roadCapacity, 6);
  assert.equal(level.balls.length, 1600);
  assert.equal(level.balls.every(ball => ['R', 'B', 'Y', 'G'].includes(ball)), true);
  assert.equal(['R', 'B', 'Y', 'G'].every(color => check.counts.balls[color] > 0), true);
  assert.equal(['O', 'P'].every(color => check.counts.balls[color] === 0), true);
  assert.deepEqual(check.counts.balls, check.counts.capacity);
  const game = createGame(level);
  let index = 0, peak = 0;
  while (game.status === 'playing' && game.tick <= item.result.ticks) {
    while (item.route[index]?.tick === game.tick) {
      assert.equal(game.garage[item.route[index].column - 1][0]?.id, item.route[index].id);
      assert.equal(dispatchCar(game, item.route[index].id).ok, true);
      peak = Math.max(peak, game.road.length);
      index++;
    }
    advanceGame(game);
    peak = Math.max(peak, game.road.length);
  }
  assert.equal(game.status, 'won');
  assert.equal(game.ballsLeft, 0);
  assert.equal(game.garage.flat().length, 0);
  assert.equal(game.road.length, 0);
  assert.equal(game.events.filter(event => event.type === 'pickup').length, 1600);
  assert.equal(game.events.some(event => ['clear', 'shuffle', 'magnet'].includes(event.type)), false);
  assert.equal(index, item.route.length);
  assert.equal(game.tick, item.result.ticks);
  assert.equal(peak, item.result.peak);
  for (const expected of item.branches) {
    assert.deepEqual(branch(level, expected.columnPriority), {
      status: expected.status, tick: expected.tick,
      ballsLeft: expected.ballsLeft, peak: expected.peak
    });
  }
  const human = humanReport.levels.find(entry => entry.id === item.id);
  assert.ok(human);
  const manualGame = createGame(level);
  let manualIndex = 0, manualPeak = 0;
  while (manualGame.status === 'playing' && manualGame.tick <= human.ticks) {
    while (human.dispatches[manualIndex]?.tick === manualGame.tick) {
      const step = human.dispatches[manualIndex];
      assert.equal(manualGame.road.length, step.roadBefore);
      assert.equal(manualGame.ballsLeft, step.ballsLeft);
      assert.equal(dispatchCar(manualGame, step.id).ok, true);
      manualPeak = Math.max(manualPeak, manualGame.road.length);
      manualIndex++;
    }
    advanceGame(manualGame);
  }
  assert.equal(manualGame.status, 'won');
  assert.equal(manualGame.tick, human.ticks);
  assert.equal(manualGame.ballsLeft, 0);
  assert.equal(manualGame.garage.flat().length, 0);
  assert.equal(manualGame.road.length, 0);
  assert.equal(manualGame.events.filter(event => event.type === 'pickup').length, 1600);
  assert.equal(manualGame.events.some(event => ['clear', 'shuffle', 'magnet'].includes(event.type)), false);
  assert.equal(manualIndex, human.dispatches.length);
  assert.equal(manualPeak, human.peak);
  console.log(`${item.file}: won, exact ${game.tick} / spaced ${human.ticks} ticks, 1600 pickups, peak ${peak}/6, ${item.branches.filter(b => b.status === 'failed').length}/3 sampled branches failed`);
}
