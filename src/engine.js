import {
  COLOR_KEYS, cellIndex, clone, levelSize, reindexGarage, roadCapacityOf, roadLength
} from './constants.js';
import { validateLevel } from './validation.js';
import { animatedPosition, settleBalls } from './gravity.js';

export { settleBalls } from './gravity.js';

function record(game, type, details = {}) {
  game.events.push({ tick: game.tick, type, ...details });
}

export function createGame(level) {
  const result = validateLevel(level);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  const copy = clone(level);
  const { width, height } = levelSize(copy);
  const ballIds = copy.balls.map((color, index) => color === null ? null : index);
  settleBalls(copy.balls, ballIds, width, height);
  const game = {
    levelId: copy.id,
    levelName: copy.name,
    width, height,
    roadLength: roadLength(width),
    roadCapacity: roadCapacityOf(copy),
    balls: copy.balls,
    ballIds,
    ballAnimations: new Map(),
    garage: copy.garage,
    road: [],
    tick: 0,
    nextSequence: 1,
    shuffleCount: 0,
    ballsLeft: copy.balls.reduce((count, ball) => count + (ball !== null), 0),
    status: 'playing',
    paused: false,
    speed: 1,
    events: []
  };
  evaluateGame(game);
  return game;
}

export function availableBottomColors(game) {
  const colors = new Set();
  for (let phase = 0; phase < game.width; phase++) {
    const color = game.balls[cellIndex(phase, game.height - 1, game.width)];
    if (color !== null) colors.add(color);
  }
  return colors;
}

export function remainingByColor(game) {
  const balls = Object.fromEntries(COLOR_KEYS.map((color) => [color, 0]));
  const capacity = Object.fromEntries(COLOR_KEYS.map((color) => [color, 0]));
  for (const ball of game.balls) if (ball !== null) balls[ball]++;
  for (const column of game.garage) for (const car of column) capacity[car.color] += car.capacity;
  for (const car of game.road) capacity[car.color] += car.remaining;
  return { balls, capacity };
}

export function evaluateGame(game) {
  if (game.status !== 'playing') return game.status;
  const garageEmpty = game.garage.every((column) => column.length === 0);
  if (game.ballsLeft === 0 && garageEmpty && game.road.length === 0) {
    game.status = 'won';
    game.ballAnimations.clear();
    record(game, 'win');
    return game.status;
  }
  if (game.ballsLeft > 0 && game.road.length === game.roadCapacity && game.ballAnimations.size === 0) {
    const bottom = availableBottomColors(game);
    const canEventuallyCollect = game.road.some((car) => car.remaining > 0 && bottom.has(car.color));
    if (!canEventuallyCollect) {
      game.status = 'failed';
      record(game, 'deadlock');
    }
  }
  return game.status;
}

export function capacityWarnings(game) {
  const remaining = remainingByColor(game);
  return COLOR_KEYS.filter((color) => remaining.balls[color] > remaining.capacity[color])
    .map((color) => ({
      color,
      shortage: remaining.balls[color] - remaining.capacity[color]
    }));
}

export function dispatchCar(game, id) {
  if (game.status !== 'playing') return { ok: false, message: '本局已结束，请重开。' };
  if (game.paused) return { ok: false, message: '暂停中，请先继续。' };
  const columnIndex = game.garage.findIndex((column) => column.some((car) => car.id === id));
  if (columnIndex < 0) return { ok: false, message: '这辆车不在车库中。' };
  if (game.garage[columnIndex][0].id !== id) return { ok: false, message: '前车阻挡，先派出同列车头。' };
  if (game.road.length >= game.roadCapacity) {
    return { ok: false, message: `道路已满（${game.roadCapacity}/${game.roadCapacity}）。` };
  }
  const occupied = new Set(game.road.map((car) => car.phase));
  let phase = -1;
  for (let candidate = game.roadLength - 1; candidate >= game.roadLength - game.roadCapacity; candidate--) {
    if (!occupied.has(candidate)) { phase = candidate; break; }
  }
  if (phase < 0) return { ok: false, message: '入口暂时被占用，请稍等。' };
  const car = game.garage[columnIndex].shift();
  reindexGarage(game.garage);
  game.road.push({
    id: car.id, color: car.color, capacity: car.capacity,
    remaining: car.capacity, phase, sequence: game.nextSequence++
  });
  record(game, 'dispatch', { id: car.id, color: car.color, column: columnIndex });
  evaluateGame(game);
  return { ok: true, message: `${car.id} 已上路。` };
}

export function advanceGame(game, steps = 1) {
  if (!Number.isInteger(steps) || steps < 0) throw new Error('推进步数必须是非负整数。');
  if (game.status !== 'playing' || game.paused) return game;
  for (let step = 0; step < steps && game.status === 'playing'; step++) {
    game.tick++;
    for (const [id, animation] of game.ballAnimations) {
      if (game.tick - animation.startTick >= animation.durationTicks) game.ballAnimations.delete(id);
    }
    const ordered = [...game.road].sort((a, b) => a.sequence - b.sequence);
    for (const car of ordered) car.phase = (car.phase + 1) % game.roadLength;
    for (const car of ordered) {
      if (car.phase >= game.width || car.remaining <= 0) continue;
      const x = car.phase;
      const index = cellIndex(x, game.height - 1, game.width);
      if (game.balls[index] !== car.color) continue;
      const pickedId = game.ballIds[index];
      game.balls[index] = null;
      game.ballIds[index] = null;
      game.ballAnimations.delete(pickedId);
      game.ballsLeft--;
      car.remaining--;
      record(game, 'pickup', { id: car.id, color: car.color, x, remaining: car.remaining });
      const { paths } = settleBalls(game.balls, game.ballIds, game.width, game.height);
      for (const [id, movementPath] of paths) {
        const previous = game.ballAnimations.get(id);
        if (previous) movementPath[0] = animatedPosition(previous, game.tick);
        game.ballAnimations.set(id, {
          path: movementPath,
          startTick: game.tick,
          durationTicks: Math.min(60, Math.max(30, movementPath.length * 4))
        });
      }
      if (car.remaining === 0) {
        game.road.splice(game.road.indexOf(car), 1);
        record(game, 'depart', { id: car.id, color: car.color });
      }
    }
    evaluateGame(game);
  }
  return game;
}

function findGarageCar(game, id) {
  for (let columnIndex = 0; columnIndex < game.garage.length; columnIndex++) {
    const index = game.garage[columnIndex].findIndex((car) => car.id === id);
    if (index >= 0) return { columnIndex, index };
  }
  return null;
}

export function clearGarageCar(game, id) {
  if (game.status !== 'playing' || game.paused) return { ok: false, message: '当前不能使用道具。' };
  const found = findGarageCar(game, id);
  if (!found) return { ok: false, message: '请选择尚未派出的车辆。' };
  const [car] = game.garage[found.columnIndex].splice(found.index, 1);
  reindexGarage(game.garage);
  record(game, 'clear', { id: car.id, color: car.color });
  evaluateGame(game);
  return { ok: true, message: `已清除 ${car.id}；小球未变化。` };
}

export function magnetRoadCar(game, id) {
  if (game.status !== 'playing' || game.paused) return { ok: false, message: '当前不能使用道具。' };
  const index = game.road.findIndex((car) => car.id === id);
  if (index < 0) return { ok: false, message: '请选择道路上的车辆。' };
  const [car] = game.road.splice(index, 1);
  record(game, 'magnet', { id: car.id, color: car.color });
  evaluateGame(game);
  return { ok: true, message: `已移走 ${car.id}；释放 1 个车位，小球未变化。` };
}

function hashSeed(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function randomNext(seed) {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}

export function shuffleGarage(game) {
  if (game.status !== 'playing' || game.paused) return { ok: false, message: '当前不能使用道具。' };
  const lengths = game.garage.map((column) => column.length);
  const cars = game.garage.flat();
  if (cars.length < 2) return { ok: false, message: '待发车辆不足 2 辆，无法打乱。' };
  const before = cars.map((car) => car.id).join('|');
  let seed = hashSeed(`${game.levelId}:${game.tick}:${game.shuffleCount++}`) || 1;
  for (let i = cars.length - 1; i > 0; i--) {
    seed = randomNext(seed);
    const j = seed % (i + 1);
    [cars[i], cars[j]] = [cars[j], cars[i]];
  }
  if (cars.map((car) => car.id).join('|') === before) [cars[0], cars[1]] = [cars[1], cars[0]];
  let offset = 0;
  game.garage = lengths.map((length) => cars.slice(offset, offset += length));
  reindexGarage(game.garage);
  record(game, 'shuffle');
  evaluateGame(game);
  return { ok: true, message: '待发车辆已重新排列；道路车辆未变化。' };
}

export function setPaused(game, paused) {
  if (game.status === 'playing') game.paused = Boolean(paused);
}

export function setSpeed(game, speed) {
  if (![1, 2, 4].includes(speed)) throw new Error('速度只支持 1×、2×、4×。');
  game.speed = speed;
}

export function getGameStats(game) {
  const pending = game.garage.reduce((count, column) => count + column.length, 0);
  return {
    balls: game.ballsLeft,
    pending,
    road: game.road.length,
    roadCapacity: game.roadCapacity,
    tick: game.tick,
    status: game.status,
    shortages: capacityWarnings(game)
  };
}
