import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_CELL_COUNT, BOTTOM_LEFT, CONFIG_VERSION, GRID_HEIGHT, GRID_WIDTH, cellIndex, isActiveCell, rowLeft, rowWidth } from '../src/constants.js';
import { createGame, advanceGame, dispatchCar } from '../src/engine.js';
import { getBuiltinLevel } from '../src/levels.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';
import { loadDraft, removeDraft, saveDraft } from '../src/storage.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
}

test('三个内置关卡数量精确匹配，配置有效', () => {
  for (const id of ['tutorial', 'split', 'parking']) {
    const result = validateLevel(getBuiltinLevel(id));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
  }
});

test('矩形宽 60、高 20；边界外禁止放球', () => {
  assert.deepEqual([GRID_WIDTH, GRID_HEIGHT, rowWidth(0), rowWidth(19), BOTTOM_LEFT, ACTIVE_CELL_COUNT],
    [60, 20, 60, 60, 0, 1200]);
  for (let y = 0; y < GRID_HEIGHT; y++) {
    const active = Array.from({ length: GRID_WIDTH }, (_, x) => x).filter((x) => isActiveCell(x, y));
    assert.equal(active.length, rowWidth(y));
    assert.equal(active[0], rowLeft(y));
  }
  const level = getBuiltinLevel('tutorial');
  assert.equal(isActiveCell(-1, 19), false);
  assert.equal(isActiveCell(60, 19), false);
  level.balls.pop();
  assert.match(validateLevel(level).errors.join(' '), /60×20/);
  level.balls.push('R');
  assert.deepEqual(validateLevel(level).errors, []);
});

test('数量不匹配为警告，仍可保存和试玩', () => {
  const level = getBuiltinLevel('tutorial');
  level.balls[0] = null;
  assert.equal(validateLevel(level).errors.length, 0);
  assert.equal(validateLevel(level).warnings.length, 1);
  const storage = fakeStorage();
  saveDraft(storage, level);
  assert.deepEqual(loadDraft(storage, level.id), level);
  assert.equal(createGame(level).ballsLeft, ACTIVE_CELL_COUNT - 1);
});

test('位置冲突、非法容量、缺失字段均明确报错', () => {
  const level = getBuiltinLevel('tutorial');
  level.garage[1][0].slot = 1;
  level.garage[0][0].capacity = 0;
  level.name = '';
  const errors = validateLevel(level).errors.join(' ');
  assert.match(errors, /关卡名称/);
  assert.match(errors, /容量/);
  assert.match(errors, /车位不连续/);
});

test('编辑与试玩隔离；导入失败不更改原草稿', () => {
  const original = getBuiltinLevel('tutorial');
  const saved = structuredClone(original);
  const game = createGame(original);
  dispatchCar(game, 'car-0-0');
  advanceGame(game, 3);
  assert.deepEqual(original, saved);
  const json = exportLevel(original);
  const imported = importLevel(json, 'split');
  assert.equal(imported.id, 'split');
  assert.deepEqual(imported.balls, original.balls);
  assert.throws(() => importLevel('{', 'tutorial'), /JSON 语法错误/);
  assert.deepEqual(original, saved);
});

test('本地保存刷新恢复并可恢复默认', () => {
  const storage = fakeStorage();
  const level = getBuiltinLevel('split');
  level.name = '修改过的关卡';
  saveDraft(storage, level);
  assert.equal(loadDraft(storage, 'split').name, '修改过的关卡');
  removeDraft(storage, 'split');
  assert.equal(loadDraft(storage, 'split'), null);
});

test('道路车位上限可校验、保存、导入，旧配置默认补为 6', () => {
  const level = getBuiltinLevel('tutorial');
  level.roadCapacity = 8;
  assert.deepEqual(validateLevel(level).errors, []);
  const storage = fakeStorage();
  saveDraft(storage, level);
  assert.equal(loadDraft(storage, level.id).roadCapacity, 8);
  assert.equal(importLevel(exportLevel(level), level.id).roadCapacity, 8);
  assert.equal(createGame(level).roadCapacity, 8);
  level.roadCapacity = 0;
  assert.match(validateLevel(level).errors.join(' '), /道路车位上限/);
  level.roadCapacity = 37;
  assert.match(validateLevel(level).errors.join(' '), /道路车位上限/);
  level.roadCapacity = 36;
  assert.deepEqual(validateLevel(level).errors, []);
  delete level.roadCapacity;
  assert.deepEqual(validateLevel(level).errors, []);
  assert.equal(importLevel(JSON.stringify({ version: CONFIG_VERSION, level }), level.id).roadCapacity, 6);
  saveDraft(storage, level);
  assert.equal(loadDraft(storage, level.id).roadCapacity, 6);
});
