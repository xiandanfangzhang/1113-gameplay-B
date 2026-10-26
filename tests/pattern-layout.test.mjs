import test from 'node:test';
import assert from 'node:assert/strict';
import { createBallLayout, imagePixelsToLayout, parseBallLayout, parsePatternText } from '../src/pattern-layout.js';

test('字符图案按行转换，可导出并重新导入球区排布文件', () => {
  const layout = parsePatternText('R B .\nY,G,G', 3, 2);
  assert.deepEqual(layout.balls, ['R', 'B', null, 'Y', 'G', 'G']);
  assert.deepEqual(parseBallLayout(JSON.stringify(layout)), layout);
  assert.throws(() => parsePatternText('R.B', 3, 2), /需要 2 行/);
  assert.throws(() => parsePatternText('R.B\nY?G', 3, 2), /无效字符/);
});

test('橙紫球可用于字符图案与图片取色', () => {
  const layout = parsePatternText('RBYGOP', 6, 1);
  assert.deepEqual(layout.balls, ['R', 'B', 'Y', 'G', 'O', 'P']);
  assert.deepEqual(parseBallLayout(JSON.stringify(layout)), layout);
  const image = imagePixelsToLayout({
    width: 2, height: 1,
    data: Uint8ClampedArray.from([243, 152, 88, 255, 173, 128, 223, 255])
  }, 2, 1);
  assert.deepEqual(image.balls, ['O', 'P']);
});

test('球区排布拒绝格式、尺寸及颜色错误', () => {
  assert.throws(() => parseBallLayout('{'), /JSON 语法错误/);
  assert.throws(() => parseBallLayout(JSON.stringify({ version: 5, level: {} })), /不是受支持/);
  assert.throws(() => createBallLayout(101, 1, []), /宽度/);
  assert.throws(() => createBallLayout(2, 1, ['R']), /球格数量/);
  assert.throws(() => createBallLayout(1, 1, ['X']), /只能使用/);
});

test('图片按比例居中取样，透明和白色变为空格', () => {
  const data = Uint8ClampedArray.from([
    243, 108, 108, 255, 255, 255, 255, 255,
    89, 169, 236, 255, 114, 201, 135, 0
  ]);
  const layout = imagePixelsToLayout({ width: 2, height: 2, data }, 4, 2);
  assert.deepEqual(layout.balls, [null, 'R', null, null, null, 'B', null, null]);
});
