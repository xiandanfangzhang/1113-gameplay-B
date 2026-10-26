import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_CELL_COUNT, CELL_COUNT, COLOR_KEYS, GARAGE_COLUMNS, GARAGE_ROWS } from '../src/constants.js';
import { advanceGame, createGame, dispatchCar } from '../src/engine.js';
import { generateRandomGarage, generateRandomLevel } from '../src/generator.js';
import { BUILTIN_LEVELS, getBuiltinLevel } from '../src/levels.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';
import { verifyLevel } from '../src/verifier.js';
import { generateVerifiedGarage } from '../src/verified-garage.js';

test('随机车辆严格填充指定列行，各色容量等于当前球数且不修改球区', () => {
  const balls = [...getBuiltinLevel('split').balls];
  const before = [...balls];
  for (const [columns, rows] of [[1, 3], [2, 4], [3, GARAGE_ROWS]]) {
    const garage = generateRandomGarage({ balls, columns, rows, seed: 12345 });
    assert.equal(garage.length, GARAGE_COLUMNS);
    assert.deepEqual(garage.map((column) => column.length),
      Array.from({ length: GARAGE_COLUMNS }, (_, index) => index < columns ? rows : 0));
    assert.deepEqual(garage, generateRandomGarage({ balls, columns, rows, seed: 12345 }));
    assert.equal(new Set(garage.flat().map((car) => car.id)).size, columns * rows);
    assert.ok(garage.flat().every((car) => Number.isInteger(car.capacity) && car.capacity >= 1 && car.capacity <= CELL_COUNT));
    assert.ok(garage.flat().every((car) => car.capacity % 5 === 0));
    const draft = { ...getBuiltinLevel('split'), balls, garage };
    assert.deepEqual(validateLevel(draft).errors, []);
    assert.deepEqual(validateLevel(draft).warnings, []);
    assert.deepEqual(importLevel(exportLevel(draft), draft.id), draft);
    assert.deepEqual(balls, before);
  }
});

test('随机车辆拒绝无法满足的尺寸，输入保持不变', () => {
  const balls = Array(CELL_COUNT).fill(null);
  for (let index = 0; index < 15; index++) balls[index] = COLOR_KEYS[Math.floor(index / 5)];
  const before = [...balls];
  assert.throws(() => generateRandomGarage({ balls, columns: 1, rows: 2, seed: 1 }), /至少每色一辆/);
  assert.throws(() => generateRandomGarage({ balls, columns: 3, rows: 2, seed: 1 }), /每辆车容量至少为 5/);
  assert.throws(() => generateRandomGarage({ balls, columns: 4, rows: 1, seed: 1 }), /列数/);
  assert.throws(() => generateRandomGarage({ balls, columns: 1, rows: 13, seed: 1 }), /行数/);
  assert.throws(() => generateRandomGarage({ balls, columns: 1, rows: 3, seed: -1 }), /随机种子/);
  const unmatched = [...balls];
  unmatched[15] = 'R';
  assert.throws(() => generateRandomGarage({ balls: unmatched, columns: 1, rows: 3, seed: 1 }), /5 的倍数/);
  assert.deepEqual(balls, before);
});

test('按数量生成车辆只交付真实回放可无道具通关的车库', () => {
  for (const id of ['tutorial', 'split', 'parking']) {
    const level = getBuiltinLevel(id);
    const before = structuredClone(level);
    const result = generateVerifiedGarage(level, { columns: 3, rows: 12, seed: 12345 });
    assert.equal(result.status, 'solvable', id);
    assert.equal(result.garage.length, GARAGE_COLUMNS);
    assert.deepEqual(result.garage.map((column) => column.length), [12, 12, 12]);
    assert.ok(result.garage.flat().every((car) => car.capacity >= 5 && car.capacity % 5 === 0));
    assert.equal(result.verification.status, 'solvable');
    const generated = { ...level, garage: result.garage };
    assert.deepEqual(validateLevel(generated).warnings, []);
    const replay = createGame(generated);
    let next = 0;
    while (replay.status === 'playing' && replay.tick < result.verification.ticks) {
      while (result.verification.dispatches[next]?.tick === replay.tick) {
        assert.equal(dispatchCar(replay, result.verification.dispatches[next].id).ok, true);
        next++;
      }
      advanceGame(replay, 1);
    }
    assert.equal(replay.status, 'won', id);
    assert.deepEqual(level, before);
    assert.deepEqual(result, generateVerifiedGarage(level, { columns: 3, rows: 12, seed: 12345 }));
  }
});

test('未找到路线时不返回车辆，也不修改输入草稿', () => {
  const level = getBuiltinLevel('tutorial');
  const before = structuredClone(level);
  const result = generateVerifiedGarage(level, {
    columns: 2, rows: 3, seed: 8, maxCandidates: 2, maxAttempts: 1, maxTicks: 1
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.garage, undefined);
  assert.deepEqual(level, before);
});

test('40×40 四色球区的 3 列 × 6 行车辆可经回放筛出通关组', () => {
  const level = generateRandomLevel({
    id: 'large', colors: ['R', 'B', 'Y', 'G'], seed: 2615584982, width: 40, height: 40
  });
  const before = structuredClone(level);
  const result = generateVerifiedGarage(level, { columns: 3, rows: 6, seed: 3252605659 });
  assert.equal(result.status, 'solvable');
  assert.ok(result.attempts > 1);
  assert.deepEqual(result.garage.map((column) => column.length), [6, 6, 6]);
  assert.equal(result.verification.pickups, 1600);
  assert.deepEqual(level, before);
});

test('快速验证为三个内置关卡找到真实无道具通关路线，且不修改配置', () => {
  for (const level of BUILTIN_LEVELS) {
    const before = structuredClone(level);
    const result = verifyLevel(level);
    assert.equal(result.status, 'solvable', level.id);
    assert.equal(result.pickups, ACTIVE_CELL_COUNT);
    const game = createGame(level);
    let routeIndex = 0;
    while (game.status === 'playing' && game.tick < result.ticks) {
      while (result.dispatches[routeIndex]?.tick === game.tick) {
        assert.equal(dispatchCar(game, result.dispatches[routeIndex].id).ok, true);
        routeIndex++;
      }
      advanceGame(game, 1);
    }
    assert.equal(game.status, 'won', level.id);
    assert.equal(routeIndex, result.dispatches.length);
    assert.deepEqual(level, before);
  }
});

test('快速验证区分确定无解、配置错误和预算内未证实', () => {
  const shortage = getBuiltinLevel('tutorial');
  shortage.garage[0][0].capacity--;
  assert.equal(verifyLevel(shortage).status, 'impossible');
  const surplus = getBuiltinLevel('tutorial');
  surplus.garage[0][0].capacity++;
  assert.equal(verifyLevel(surplus).status, 'impossible');
  const invalid = getBuiltinLevel('tutorial');
  invalid.garage[0][0].capacity = 0;
  assert.equal(verifyLevel(invalid).status, 'invalid');
  const bounded = verifyLevel(getBuiltinLevel('tutorial'), { maxAttempts: 1, maxTicks: 1 });
  assert.equal(bounded.status, 'unknown');
  assert.equal(COLOR_KEYS.length, 6);
});

test('六色球区可生成两行车库并找到无道具通关路线', () => {
  const level = generateRandomLevel({ id: 'six-colors', colors: COLOR_KEYS, seed: 42 });
  const result = generateVerifiedGarage(level, { columns: 3, rows: 2, seed: 42 });
  assert.equal(result.status, 'solvable');
  assert.deepEqual(result.garage.map((column) => column.length), [2, 2, 2]);
  assert.deepEqual(new Set(result.garage.flat().map((car) => car.color)), new Set(COLOR_KEYS));
  assert.equal(result.verification.pickups, ACTIVE_CELL_COUNT);
});

test('快速验证使用编辑后的道路车位上限', () => {
  const level = getBuiltinLevel('tutorial');
  level.roadCapacity = 1;
  const result = verifyLevel(level);
  assert.equal(result.status, 'solvable');
  assert.equal(result.dispatches.length, 2);
  assert.ok(result.dispatches[1].tick > result.dispatches[0].tick);
});
