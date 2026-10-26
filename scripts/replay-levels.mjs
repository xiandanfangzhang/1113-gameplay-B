import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getBuiltinLevel } from '../src/levels.js';
import { advanceGame, createGame, dispatchCar } from '../src/engine.js';

function dispatch(game, id) {
  const result = dispatchCar(game, id);
  if (!result.ok) throw new Error(`${game.levelId}: ${id} 派车失败：${result.message}`);
}

function runUntil(game, predicate, maxSteps = 20000) {
  for (let i = 0; i < maxSteps && !predicate(game); i++) advanceGame(game);
  if (!predicate(game)) throw new Error(`${game.levelId}: ${maxSteps} 步内未达到预期状态，当前 ${game.status}。`);
}

function summary(game) {
  const byType = (type) => game.events.filter((event) => event.type === type);
  return {
    id: game.levelId,
    result: game.status,
    ticks: game.tick,
    ballsLeft: game.ballsLeft,
    garageLeft: game.garage.flat().length,
    roadLeft: game.road.length,
    dispatches: byType('dispatch').map(({ tick, id }) => `${tick}:${id}`),
    departures: byType('depart').map(({ tick, id }) => `${tick}:${id}`),
    pickups: byType('pickup').length
  };
}

export function replayTutorial() {
  const game = createGame(getBuiltinLevel('tutorial'));
  dispatch(game, 'car-0-0');
  dispatch(game, 'car-1-0');
  runUntil(game, (g) => g.status !== 'playing');
  return { game, summary: summary(game) };
}

export function replaySplit() {
  const game = createGame(getBuiltinLevel('split'));
  dispatch(game, 'car-0-0');
  dispatch(game, 'car-0-1');
  dispatch(game, 'car-1-0');
  runUntil(game, (g) => g.status !== 'playing');
  return { game, summary: summary(game) };
}

export function replayParking() {
  const game = createGame(getBuiltinLevel('parking'));
  for (const id of ['car-0-0', 'car-0-1', 'car-1-0', 'car-1-1', 'car-1-2', 'car-1-3']) dispatch(game, id);
  for (const id of ['car-2-0', 'car-2-1']) {
    runUntil(game, (g) => g.road.length < g.roadCapacity || g.status !== 'playing');
    dispatch(game, id);
  }
  runUntil(game, (g) => g.status !== 'playing');
  return { game, summary: summary(game) };
}

export function replayWrongParking() {
  const game = createGame(getBuiltinLevel('parking'));
  for (const id of ['car-0-0', 'car-1-0', 'car-1-1', 'car-1-2', 'car-1-3', 'car-2-0']) dispatch(game, id);
  return { game, summary: summary(game) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const good = [replayTutorial(), replaySplit(), replayParking()];
  const wrong = replayWrongParking();
  for (const item of good) {
    if (item.game.status !== 'won') throw new Error(`${item.game.levelId} 未通关：${item.game.status}`);
  }
  if (wrong.game.status !== 'failed') throw new Error('第 3 关错误路线未触发死局。');
  const report = { verifiedAt: new Date().toISOString(), successes: good.map((item) => item.summary), wrongRoute: wrong.summary };
  if (process.argv.includes('--write')) {
    await writeFile(new URL('../replay-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
}
