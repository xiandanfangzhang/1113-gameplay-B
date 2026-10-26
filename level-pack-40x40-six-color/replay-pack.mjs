import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceGame, availableBottomColors, createGame, dispatchCar } from '../src/engine.js';
import { COLOR_KEYS } from '../src/constants.js';
import { importLevel, validateLevel } from '../src/validation.js';

const report = JSON.parse(await readFile(new URL('verification-report.json', import.meta.url), 'utf8'));
assert.equal(report.levels.length, 9);
function replay(level, expected) {
  const game = createGame(level);
  let index = 0, peak = 0;
  while (game.status === 'playing' && game.tick <= expected.ticks) {
    while (expected.dispatches[index]?.tick === game.tick) {
      const step = expected.dispatches[index];
      assert.equal(game.garage[step.column - 1][0]?.id, step.id);
      if (step.roadBefore !== undefined) assert.equal(game.road.length, step.roadBefore);
      if (step.ballsLeft !== undefined) assert.equal(game.ballsLeft, step.ballsLeft);
      if (step.bottomColors !== undefined) assert.deepEqual([...availableBottomColors(game)], step.bottomColors);
      assert.equal(dispatchCar(game, step.id).ok, true);
      peak = Math.max(peak, game.road.length);
      index++;
    }
    advanceGame(game);
  }
  assert.equal(game.status, 'won');
  assert.equal(game.tick, expected.ticks);
  assert.equal(game.ballsLeft, 0);
  assert.equal(game.garage.flat().length, 0);
  assert.equal(game.road.length, 0);
  assert.equal(game.events.filter(e => e.type === 'pickup').length, 1600);
  assert.equal(game.events.some(e => ['clear', 'shuffle', 'magnet'].includes(e.type)), false);
  assert.equal(index, expected.dispatches.length);
  assert.equal(peak, expected.peak);
  return { ticks: game.tick, peak };
}
function flood(level, priority) {
  const game = createGame(level);
  let peak = 0;
  while (game.status === 'playing' && game.tick < 18000) {
    for (const column of priority) {
      while (game.garage[column - 1].length && game.road.length < 6) {
        assert.equal(dispatchCar(game, game.garage[column - 1][0].id).ok, true);
        peak = Math.max(peak, game.road.length);
      }
    }
    advanceGame(game);
  }
  return { status: game.status, ticks: game.tick, ballsLeft: game.ballsLeft, peak };
}
function lateFlood(level, priority) {
  const game = createGame(level), opening = [0, 1, 2, 0, 1, 2];
  let sent = 0, peak = 0;
  while (game.status === 'playing' && game.tick < 18000) {
    if (sent < 6) {
      const column = opening[sent++];
      assert.equal(dispatchCar(game, game.garage[column][0].id).ok, true);
      peak = Math.max(peak, game.road.length);
    } else if (game.road.length < 6) {
      const column = priority.find(index => game.garage[index - 1].length);
      if (column !== undefined) {
        assert.equal(dispatchCar(game, game.garage[column - 1][0].id).ok, true);
        peak = Math.max(peak, game.road.length);
      }
    }
    advanceGame(game);
  }
  return { status: game.status, ticks: game.tick, ballsLeft: game.ballsLeft, peak };
}
function adjacentSameRatio(balls) {
  let same = 0, neighbors = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const a = balls[y * 40 + x];
    if (x < 39) { neighbors++; if (a === balls[y * 40 + x + 1]) same++; }
    if (y < 39) { neighbors++; if (a === balls[(y + 1) * 40 + x]) same++; }
  }
  return same / neighbors;
}
for (const item of report.levels) {
  const level = importLevel(await readFile(new URL(item.file, import.meta.url), 'utf8'), item.id);
  const valid = validateLevel(level);
  assert.deepEqual(valid.errors, []);
  assert.deepEqual(valid.warnings, []);
  assert.deepEqual(valid.counts.balls, valid.counts.capacity);
  assert.equal(level.width, 40);
  assert.equal(level.height, 40);
  assert.equal(level.roadCapacity, 6);
  assert.equal(level.balls.length, 1600);
  assert.equal(level.balls.every(ball => COLOR_KEYS.includes(ball)), true);
  assert.deepEqual([...new Set(level.balls)].sort(), [...COLOR_KEYS].sort());
  assert.equal(level.garage.flat().every(car => car.capacity % 10 === 0), true);
  assert.equal(level.garage.length, 3);
  assert.equal(level.garage.every(column => column.length <= 12), true);
  assert.ok(Math.abs(adjacentSameRatio(level.balls) - item.adjacentSameRatio) < 1e-12);
  const exact = replay(level, item.route);
  const spaced = replay(level, item.human);
  assert.equal(item.human.gap, 30);
  for (const branch of item.branches) {
    assert.deepEqual(flood(level, branch.columnPriority), {
      status: branch.status, ticks: branch.ticks,
      ballsLeft: branch.ballsLeft, peak: branch.peak
    });
  }
  for (const branch of item.lateBranches) {
    assert.deepEqual(lateFlood(level, branch.columnPriority), {
      status: branch.status, ticks: branch.ticks,
      ballsLeft: branch.ballsLeft, peak: branch.peak
    });
  }
  console.log(`${item.file}: won; exact ${exact.ticks}, spaced ${spaced.ticks}; peak ${spaced.peak}/6; early/late branch failures ${item.branches.filter(b => b.status === 'failed').length}/${item.lateBranches.filter(b => b.status === 'failed').length}`);
}
