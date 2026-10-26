import { createGame, advanceGame, dispatchCar } from '../src/engine.js';
import { verifyLevel } from '../src/verifier.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';

const C = ['R', 'B', 'Y', 'G'];
const mod = (a, n) => (a % n + n) % n;
const rules = [
  (x, d) => C[mod(Math.floor((d + (x < 20 ? 0 : 10)) / 10), 4)],
  (x, d) => C[mod(Math.floor((d + Math.floor(x / 10) * 3) / 9), 4)],
  (x, d) => C[mod(Math.floor((d + (x < 13 ? 0 : x < 27 ? 5 : 10)) / 8), 4)],
  (x, d) => C[mod(Math.floor((d + (x < 20 ? 0 : 6)) / 7) + (x >= 10 && x < 30 ? 1 : 0), 4)],
  (x, d) => C[mod(Math.floor((d + Math.floor(x / 8) * 4) / 8), 4)],
  (x, d) => C[mod(Math.floor((d + (x < 20 ? x % 5 : 10 - x % 5)) / 7) + (x >= 20 ? 1 : 0), 4)],
  (x, d) => C[mod(Math.floor((d + Math.floor(x / 5) * 2) / 6), 4)],
  (x, d) => C[mod(Math.floor((d + Math.abs(x - 19.5) / 2) / 6), 4)],
  (x, d) => C[mod(Math.floor((d + Math.floor(x / 4) * 3) / 6) + (x >= 20 ? 1 : 0), 4)]
];
const parts = [
  { R: 1, B: 2, Y: 1, G: 1 }, { R: 2, B: 2, Y: 1, G: 1 },
  { R: 2, B: 2, Y: 2, G: 1 }, { R: 2, B: 2, Y: 2, G: 2 },
  { R: 2, B: 3, Y: 2, G: 2 }, { R: 3, B: 2, Y: 3, G: 2 },
  { R: 3, B: 3, Y: 2, G: 3 }, { R: 3, B: 3, Y: 3, G: 3 },
  { R: 3, B: 3, Y: 4, G: 3 }
];
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function shuffle(items, random) { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; }
function ballsFor(n) { return Array.from({ length: 1600 }, (_, i) => rules[n](i % 40, 39 - Math.floor(i / 40))); }
function garageFor(balls, counts, seed) {
  const random = rng(seed), cars = [];
  for (const color of C) {
    const total = balls.filter((v) => v === color).length, n = counts[color];
    const sizes = Array(n).fill(Math.floor(total / n));
    for (let i = 0; i < total % n; i++) sizes[i]++;
    for (let i = 0; i < n; i++) cars.push({ color, capacity: sizes[i] });
  }
  shuffle(cars, random);
  const garage = [[], [], []];
  for (let i = 0; i < cars.length; i++) {
    const col = i % 3;
    garage[col].push({ id: `L-${seed}-${i + 1}`, ...cars[i], slot: garage[col].length });
  }
  return garage;
}
function replay(level, route) {
  const game = createGame(level); let at = 0, peak = 0;
  while (game.status === 'playing' && game.tick <= route.ticks) {
    while (route.dispatches[at]?.tick === game.tick) {
      const r = dispatchCar(game, route.dispatches[at].id);
      if (!r.ok) throw Error(r.message);
      at++; peak = Math.max(peak, game.road.length);
    }
    advanceGame(game); peak = Math.max(peak, game.road.length);
  }
  return { status: game.status, peak, ticks: game.tick, dispatches: at, pickups: game.events.filter(e => e.type === 'pickup').length };
}
function flood(level, order) {
  const game = createGame(level); let peak = 0, idle = 0, lastBalls = game.ballsLeft;
  while (game.status === 'playing' && game.tick < 12000) {
    for (const col of order) {
      while (game.garage[col].length && game.road.length < 6) {
        const r = dispatchCar(game, game.garage[col][0].id);
        if (!r.ok) break;
        peak = Math.max(peak, game.road.length);
      }
    }
    advanceGame(game);
    if (game.ballsLeft === lastBalls) idle++; else { lastBalls = game.ballsLeft; idle = 0; }
    if (idle > 216) break;
  }
  return { status: game.status, tick: game.tick, ballsLeft: game.ballsLeft, peak };
}
const seeds = [17001, 17101, 17201, 17303, 17428, 17505, 17601, 17701, 17803];
const names = [
  '双线先行', '错位车头', '三段解锁', '交错转接', '保留通道',
  '折返调度', '多层挡车', '中心汇流', '全局接驳'
];
const selected = Number(process.argv[2]) - 1;
if (!Number.isInteger(selected) || selected < 0 || selected > 8) throw Error('传入 1–9 关卡编号');
for (let n = selected; n <= selected; n++) {
  const balls = ballsFor(n), seed = seeds[n];
  const level = {
    id: `pack-40-${String(n + 1).padStart(2, '0')}`,
    name: `第 ${n + 1} 关 · ${names[n]}`,
    width: 40, height: 40, balls,
    garage: garageFor(balls, parts[n], seed), roadCapacity: 6
  };
  const validation = validateLevel(level);
  if (validation.errors.length || validation.warnings.length) throw Error(JSON.stringify(validation));
  if (balls.length !== 1600 || balls.some(v => !C.includes(v))) throw Error('球区不满足满铺四色');
  const json = JSON.stringify(JSON.parse(exportLevel(level)));
  const imported = importLevel(json, level.id);
  if (JSON.stringify(imported) !== JSON.stringify(level)) throw Error('导入往返不一致');
  const route = verifyLevel(imported, { maxTicks: 18000 });
  if (route.status !== 'solvable') throw Error(`${level.id}: ${route.status}`);
  const result = replay(imported, route);
  if (result.status !== 'won' || result.pickups !== 1600 || result.dispatches !== level.garage.flat().length) throw Error(`${level.id}: 回放失败`);
  const branches = [[0,1,2],[2,1,0],[1,2,0]].map(order => ({ columnPriority: order.map(x => x + 1), ...flood(imported, order) }));
  const initialBottom = [...new Set(balls.slice(1560))];
  const file = `level-${String(n + 1).padStart(2, '0')}.json`;
  const reportItem = { file, id: level.id, name: level.name, seed, colorBalls: validation.counts.balls,
    colorCapacity: validation.counts.capacity, vehicles: level.garage.flat().length,
    garage: level.garage.map(column => column.map(car => `${car.id}:${car.color}${car.capacity}`)),
    initialBottom, route: route.dispatches, result, branches };
  console.log(JSON.stringify({ file, json, reportItem }));
}
