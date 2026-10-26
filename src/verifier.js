import { COLOR_KEYS } from './constants.js';
import { advanceGame, availableBottomColors, createGame, dispatchCar } from './engine.js';
import { validateLevel } from './validation.js';

const STRATEGIES = [3, 4, 2, 5, 6, 3, 4, 5];

function headOptions(game, bottom, attempt) {
  return game.garage.flatMap((column, columnIndex) => {
    if (!column.length) return [];
    const car = column[0];
    const next = column[1];
    const matching = bottom.has(car.color);
    const unlocking = Boolean(next && bottom.has(next.color));
    // Each retry varies only tie breaks. The same engine still executes every candidate route.
    const tie = ((columnIndex * 17 + attempt * 23) % 7) / 10;
    const score = (matching ? 100 : 0) + (unlocking ? 75 : 0) +
      (game.road.some((roadCar) => roadCar.color === car.color) ? 0 : 5) + tie;
    return [{ car, columnIndex, matching, unlocking, score }];
  }).sort((a, b) => b.score - a.score);
}

function attemptRoute(level, attempt, maxTicks) {
  const game = createGame(level);
  const dispatches = [];
  let lastPickupTick = 0;
  let previousBalls = game.ballsLeft;
  const targetRoadCars = Math.min(game.roadCapacity, STRATEGIES[attempt % STRATEGIES.length]);

  while (game.status === 'playing' && game.tick < maxTicks) {
    const bottom = availableBottomColors(game);
    const choice = headOptions(game, bottom, attempt)[0];
    if (choice && game.road.length < game.roadCapacity) {
      const stalled = game.tick - lastPickupTick >= game.roadLength;
      const shouldDispatch = game.road.length < targetRoadCars ||
        choice.matching || (choice.unlocking && game.road.length < game.roadCapacity - 1) || stalled;
      if (shouldDispatch) {
        const result = dispatchCar(game, choice.car.id);
        if (result.ok) dispatches.push({
          tick: game.tick,
          id: choice.car.id,
          color: choice.car.color,
          column: choice.columnIndex + 1,
          capacity: choice.car.capacity
        });
      }
    }
    advanceGame(game, 1);
    if (game.ballsLeft !== previousBalls) {
      previousBalls = game.ballsLeft;
      lastPickupTick = game.tick;
    }
    if (game.road.length === 0 && game.garage.every((column) => !column.length) && game.status === 'playing') break;
  }
  return { game, dispatches };
}

/** Constructive, bounded no-tool verification. "solvable" always includes a real engine replay. */
export function verifyLevel(level, { maxAttempts = STRATEGIES.length, maxTicks = 14000, onProgress } = {}) {
  const validation = validateLevel(level);
  if (validation.errors.length) return {
    status: 'invalid', reason: validation.errors[0], attempts: 0
  };
  const mismatches = COLOR_KEYS.filter((color) =>
    validation.counts.balls[color] !== validation.counts.capacity[color]);
  if (mismatches.length) return {
    status: 'impossible',
    reason: `无道具通关要求每色球数与车辆总容量相等；${mismatches.map((color) =>
      `${color} 色球 ${validation.counts.balls[color]} / 容量 ${validation.counts.capacity[color]}`).join('，')}。`,
    attempts: 0
  };
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 ||
      !Number.isInteger(maxTicks) || maxTicks < 1) {
    throw new Error('验证预算必须是正整数。');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { game, dispatches } = attemptRoute(level, attempt, maxTicks);
    onProgress?.({ attempt: attempt + 1, maxAttempts, tick: game.tick });
    if (game.status === 'won') return {
      status: 'solvable',
      reason: '找到一条无道具通关路线，已由真实玩法逻辑逐步回放。',
      attempts: attempt + 1,
      ticks: game.tick,
      dispatches,
      pickups: game.events.filter((event) => event.type === 'pickup').length
    };
  }
  return {
    status: 'unknown',
    reason: `已尝试 ${maxAttempts} 条无道具派车策略，每条最多 ${maxTicks} 步，暂未找到通关路线；这不能证明关卡无解。`,
    attempts: maxAttempts
  };
}
