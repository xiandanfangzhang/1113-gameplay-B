import assert from 'node:assert/strict';
import test from 'node:test';
import { cellIndex, resizeLevel, roadLength } from '../src/constants.js';
import { advanceGame, createGame, dispatchCar } from '../src/engine.js';
import { generateRandomGarage, generateRandomLevel } from '../src/generator.js';
import { settleBalls } from '../src/gravity.js';
import { getBuiltinLevel } from '../src/levels.js';
import { roadPosition } from '../src/render.js';
import { loadDraft, removeDraft, saveDraft } from '../src/storage.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test('调整宽高保留左上角重叠球格，新格为空，裁切数准确', () => {
  const original = getBuiltinLevel('tutorial');
  const smaller = resizeLevel(original, 40, 10);
  assert.deepEqual([smaller.level.width, smaller.level.height, smaller.level.balls.length], [40, 10, 400]);
  assert.equal(smaller.removed, 800);
  assert.equal(smaller.level.balls[cellIndex(39, 9, 40)], original.balls[cellIndex(39, 9, 60)]);
  assert.equal(original.balls.length, 1200);
  const larger = resizeLevel(smaller.level, 43, 12);
  assert.equal(larger.removed, 0);
  assert.equal(larger.level.balls[cellIndex(39, 9, 43)], smaller.level.balls[cellIndex(39, 9, 40)]);
  assert.equal(larger.level.balls[cellIndex(42, 11, 43)], null);
  assert.throws(() => resizeLevel(original, 101, 20), /宽度/);
});

test('自定义尺寸的道路、接球、落球和通关共用同一网格', () => {
  const width = 8, height = 4;
  const balls = Array(width * height).fill(null);
  balls[cellIndex(0, 0, width)] = 'R';
  const level = { id: 'small', name: '小球区', width, height, balls,
    garage: [[{ id: 'red', color: 'R', capacity: 1, slot: 0 }], [], []] };
  assert.deepEqual(validateLevel(level).errors, []);
  const settled = [...balls];
  settleBalls(settled, null, width, height);
  assert.equal(settled[cellIndex(0, 3, width)], 'R');
  const game = createGame(level);
  assert.equal(game.roadLength, roadLength(width));
  assert.deepEqual(roadPosition(0, width, height), { x: 0.5, y: 4.5 });
  assert.equal(dispatchCar(game, 'red').ok, true);
  advanceGame(game, 1);
  assert.equal(game.status, 'won');
  assert.equal(game.ballsLeft, 0);
});

test('任意尺寸随机生成保持车辆容量为五的倍数，余数格留空', () => {
  const level = generateRandomLevel({ id: 'odd', width: 7, height: 4, colors: ['R', 'B'], seed: 42 });
  assert.equal(level.balls.length, 28);
  assert.equal(level.balls.filter((ball) => ball === null).length, 3);
  assert.equal(level.garage.flat().every((car) => car.capacity % 5 === 0), true);
  assert.deepEqual(validateLevel(level).warnings, []);
  const garage = generateRandomGarage({ balls: level.balls, width: 7, height: 4, columns: 2, rows: 1, seed: 3 });
  assert.equal(garage.flat().length, 2);
  assert.equal(garage.flat().every((car) => car.capacity % 5 === 0), true);
});

test('自定义尺寸随版本 5 JSON 和本地存档往返，版本 4 草稿按 60×20 迁移', () => {
  const level = generateRandomLevel({ id: 'tutorial', width: 15, height: 8, colors: ['R'], seed: 7 });
  const exported = JSON.parse(exportLevel(level));
  assert.deepEqual([exported.version, exported.level.width, exported.level.height, exported.level.balls.length], [5, 15, 8, 120]);
  assert.deepEqual(importLevel(JSON.stringify(exported), 'tutorial'), level);
  const store = storage();
  saveDraft(store, level);
  assert.deepEqual(loadDraft(store, 'tutorial'), level);
  const legacy = getBuiltinLevel('tutorial');
  delete legacy.width;
  delete legacy.height;
  store.setItem('color-transit:v4:tutorial', JSON.stringify({ version: 4, level: legacy }));
  store.removeItem('color-transit:v5:tutorial');
  assert.deepEqual([loadDraft(store, 'tutorial').width, loadDraft(store, 'tutorial').height], [60, 20]);
  assert.deepEqual([importLevel(JSON.stringify({ version: 4, level: legacy }), 'tutorial').width,
    importLevel(JSON.stringify({ version: 4, level: legacy }), 'tutorial').height], [60, 20]);
  removeDraft(store, 'tutorial');
  assert.equal(loadDraft(store, 'tutorial'), null);
  const invalid = { ...level, balls: level.balls.slice(1) };
  assert.match(validateLevel(invalid).errors.join(' '), /15×8/);
});
