import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_CELL_COUNT, COLOR_KEYS, CELL_COUNT } from '../src/constants.js';
import { generateRandomLevel } from '../src/generator.js';
import { advanceGame, createGame, dispatchCar } from '../src/engine.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';

test('随机关卡按所选颜色生成满格球区、匹配运力，并可复现', () => {
  for (let colorCount = 1; colorCount <= COLOR_KEYS.length; colorCount++) {
    const colors = COLOR_KEYS.slice(0, colorCount);
    const level = generateRandomLevel({ id: 'tutorial', colors, seed: 123456789 });
    const validation = validateLevel(level);
    assert.deepEqual(validation.errors, []);
    assert.deepEqual(validation.warnings, []);
    assert.equal(level.balls.length, CELL_COUNT);
    assert.deepEqual(new Set(level.balls.filter(Boolean)), new Set(colors));
    assert.equal(level.balls.filter(Boolean).length, ACTIVE_CELL_COUNT);
    assert.equal(level.garage.flat().length, colorCount);
    assert.ok(level.garage.flat().every((car) => car.capacity % 5 === 0));
    assert.equal(level.roadCapacity, 6);
    assert.deepEqual(level, generateRandomLevel({ id: 'tutorial', colors, seed: 123456789 }));
    assert.deepEqual(importLevel(exportLevel(level), 'tutorial'), level);
  }
});

test('随机关卡的 1–6 色配置经真实引擎无道具通关', () => {
  for (let colorCount = 1; colorCount <= COLOR_KEYS.length; colorCount++) {
    for (const seed of [0, 987654321, 0xffffffff]) {
      const level = generateRandomLevel({ id: 'split', colors: COLOR_KEYS.slice(0, colorCount), seed });
      const game = createGame(level);
      for (const column of level.garage) {
        for (const car of column) assert.equal(dispatchCar(game, car.id).ok, true);
      }
      advanceGame(game, 16000);
      assert.equal(game.status, 'won', `${colorCount} 色，种子 ${seed}，第 ${game.tick} 步`);
      assert.equal(game.ballsLeft, 0);
      assert.equal(game.garage.flat().length, 0);
      assert.equal(game.road.length, 0);
      assert.equal(game.events.filter((event) => event.type === 'pickup').length, ACTIVE_CELL_COUNT);
      assert.equal(game.events.some((event) => ['clear', 'shuffle', 'magnet'].includes(event.type)), false);
    }
  }
});

test('随机关卡参数非法时给出具体错误', () => {
  assert.throws(() => generateRandomLevel({ id: 'tutorial', colors: [], seed: 1 }), /请选择 1–6 种/);
  assert.throws(() => generateRandomLevel({ id: 'tutorial', colors: ['R', 'R'], seed: 1 }), /请选择 1–6 种/);
  assert.throws(() => generateRandomLevel({ id: 'tutorial', colors: [...COLOR_KEYS, 'X'], seed: 1 }), /请选择 1–6 种/);
  assert.throws(() => generateRandomLevel({ id: 'tutorial', colors: ['R'], seed: -1 }), /随机种子/);
});
