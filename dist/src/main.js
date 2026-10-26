import {
  COLORS, COLOR_KEYS, GARAGE_ROWS, cellIndex, clone, insideGrid,
  levelSize, reindexGarage, resizeLevel, roadCapacityOf
} from './constants.js';
import { BUILTIN_LEVELS, getBuiltinLevel } from './levels.js';
import { generateRandomGarage, generateRandomLevel } from './generator.js';
import {
  advanceGame, clearGarageCar, createGame, dispatchCar, getGameStats,
  magnetRoadCar, setPaused, setSpeed, shuffleGarage
} from './engine.js';
import { exportLevel, importLevel, validateLevel } from './validation.js';
import { loadDraft, removeDraft, saveDraft } from './storage.js';
import { parseBallLayout } from './pattern-layout.js';
import {
  createView, drawBoard, drawMini, fitView, focusBottom, gridPoint,
  panView, resizeView, roadPosition, setViewSize, worldPoint, zoomView
} from './render.js';

const $ = (id) => document.getElementById(id);
const TICK_MS = 12;
const COLOR_EMOJI = { R: '🔴', B: '🔵', Y: '🟡', G: '🟢', O: '🟠', P: '🟣' };

let levelId = BUILTIN_LEVELS[0].id;
let editorDraft = loadDraft(localStorage, levelId) ?? getBuiltinLevel(levelId);
let game = createGame(editorDraft);
let gameBeforePreview = null;
let mode = 'game';
let preview = false;
let dirty = false;
let tool = null;
let brush = 'R';
let drawMode = 'brush';
let selectedCarId = null;
let previewRect = null;
let lastUiSignature = '';
let editorUpdateQueued = false;
let lastGameStatus = game.status;
let accumulator = 0;
let lastFrame = 0;
let verifyWorker = null;
let verificationRequestId = 0;
let garageWorker = null;
let garageRequestId = 0;

const gameView = createView($('gameCanvas'));
const editorView = createView($('editorCanvas'));
fitView(gameView);
fitView(editorView);
setViewSize(gameView, game.width, game.height);
setViewSize(editorView, editorDraft.width, editorDraft.height);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function toast(message, type = '') {
  const element = $('message');
  element.textContent = message;
  element.className = `message ${type}`.trim();
}

function randomSeedFrom(inputId) {
  const text = $(inputId).value.trim();
  return text === ''
    ? (globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0)
    : Number(text);
}

function resetVerification() {
  verificationRequestId++;
  verifyWorker?.terminate();
  verifyWorker = null;
  garageRequestId++;
  garageWorker?.terminate();
  garageWorker = null;
  $('generateVehiclesBtn').disabled = false;
  $('vehicleSeedResult').textContent = '';
  $('vehicleSeedResult').classList.remove('error-text');
  $('verifyBtn').disabled = false;
  $('verifyResult').className = 'verify-result hidden';
  $('verifyResult').textContent = '';
}

function showVerification(result) {
  const titles = {
    solvable: '✓ 已验证：找到无道具通关路线',
    impossible: '✕ 已证实：当前配置无法无道具通关',
    invalid: '配置错误，无法验证',
    unknown: '尚未证实可通关'
  };
  const route = result.dispatches?.length
    ? `<ol>${result.dispatches.map((step) =>
      `<li>第 ${step.tick} 步：派出第 ${step.column} 列 ${COLORS[step.color].name}车（容量 ${step.capacity}）</li>`).join('')}</ol>`
    : '';
  $('verifyResult').className = `verify-result ${result.status}`;
  $('verifyResult').innerHTML = `<strong>${titles[result.status] ?? '验证结果'}</strong><div>${escapeHtml(result.reason)}</div>${result.status === 'solvable'
    ? `<p class="small-note">共 ${result.ticks.toLocaleString('zh-CN')} 步、${result.pickups.toLocaleString('zh-CN')} 次接球；按下列时点派车即可复现。</p>${route}`
    : ''}`;
}

function startVerification() {
  resetVerification();
  const requestId = verificationRequestId;
  $('verifyBtn').disabled = true;
  $('verifyResult').className = 'verify-result';
  $('verifyResult').textContent = '正在后台回放无道具派车路线…';
  try {
    const worker = new Worker(new URL('./verify-worker.js', import.meta.url), { type: 'module' });
    verifyWorker = worker;
    worker.onmessage = ({ data }) => {
      if (requestId !== verificationRequestId || worker !== verifyWorker) return;
      if (data.progress) { $('verifyResult').textContent = data.progress; return; }
      worker.terminate();
      verifyWorker = null;
      $('verifyBtn').disabled = false;
      if (data.error) {
        $('verifyResult').className = 'verify-result invalid';
        $('verifyResult').textContent = `验证失败：${data.error}`;
      } else showVerification(data.result);
    };
    worker.onerror = (event) => {
      if (requestId !== verificationRequestId) return;
      worker.terminate();
      verifyWorker = null;
      $('verifyBtn').disabled = false;
      $('verifyResult').className = 'verify-result invalid';
      $('verifyResult').textContent = `验证程序运行失败：${event.message || '未知错误'}`;
    };
    worker.postMessage({ requestId, level: clone(editorDraft) });
  } catch (error) {
    $('verifyBtn').disabled = false;
    $('verifyResult').className = 'verify-result invalid';
    $('verifyResult').textContent = `无法启动验证：${error.message}`;
  }
}

function levelSource() {
  return loadDraft(localStorage, levelId) ?? getBuiltinLevel(levelId);
}

function setMode(next) {
  mode = next;
  const shown = next === 'editor' ? levelSize(editorDraft) : game;
  $('brandSize').textContent = `宽 ${shown.width} · 高 ${shown.height}`;
  $('gameView').classList.toggle('hidden', next !== 'game');
  $('editorView').classList.toggle('hidden', next !== 'editor');
  $('gameTab').classList.toggle('active', next === 'game');
  $('editorTab').classList.toggle('active', next === 'editor');
  $('returnEditor').classList.toggle('hidden', !preview || next !== 'game');
  accumulator = 0;
  requestAnimationFrame(() => {
    resizeView(next === 'game' ? gameView : editorView);
    renderBoardNow();
  });
}

function resetGame() {
  game = createGame(preview ? editorDraft : levelSource());
  setViewSize(gameView, game.width, game.height);
  lastGameStatus = game.status;
  lastUiSignature = '';
  tool = null;
  accumulator = 0;
  toast('关卡已重开。');
  renderGameUI();
  renderBoardNow();
}

function chooseLevel(id) {
  if (dirty && mode === 'editor' && !window.confirm('当前关卡有未保存修改，确定切换关卡吗？')) {
    $('levelSelect').value = levelId;
    return;
  }
  levelId = id;
  resetVerification();
  editorDraft = levelSource();
  game = createGame(levelSource());
  setViewSize(gameView, game.width, game.height);
  setViewSize(editorView, editorDraft.width, editorDraft.height);
  gameBeforePreview = null;
  dirty = false;
  preview = false;
  selectedCarId = null;
  tool = null;
  lastGameStatus = game.status;
  lastUiSignature = '';
  $('levelSelect').value = id;
  $('returnEditor').classList.add('hidden');
  toast(`已切换到 ${game.levelName}。`);
  updateEditor();
  renderGameUI();
  renderBoardNow();
}

function statusText() {
  if (game.status === 'won') return '已通关';
  if (game.status === 'failed') return '道路死局';
  return game.paused ? '已暂停' : '运行中';
}

function carCard(car, { head = false, blocked = false, selected = false, editor = false } = {}) {
  return `<button class="car-card ${editor ? 'editor-car' : 'garage-car'} ${head ? 'head' : ''} ${blocked ? 'blocked' : ''} ${selected ? 'selected' : ''}" type="button" data-id="${escapeHtml(car.id)}" aria-label="${escapeHtml(COLORS[car.color].name)}车，${editor ? '初始' : '剩余'}容量${car.capacity}${blocked ? '，被前车阻挡' : ''}">
    <span class="car-top">${COLOR_EMOJI[car.color]} ${COLORS[car.color].name}车</span>
    <span class="car-amount"><span>${editor ? '初始容量' : '剩余容量'}</span><strong>${car.capacity.toLocaleString('zh-CN')}</strong></span>
    <small>${editor ? `位置 ${car.slot + 1}` : head ? '可派出 · 点按上路' : '前车阻挡'}</small>
  </button>`;
}

function renderGarage(containerId, columns, editor = false) {
  $(containerId).innerHTML = columns.map((column, index) => `<div class="garage-column"><h3>第 ${index + 1} 列 · ${column.length}/${GARAGE_ROWS}</h3>${column.length
    ? column.map((car, slot) => carCard(car, {
      head: slot === 0, blocked: slot !== 0 && !editor,
      selected: editor && car.id === selectedCarId, editor
    })).join('')
    : '<div class="garage-empty">空车位</div>'}</div>`).join('');
}

function renderGameUI() {
  const stats = getGameStats(game);
  $('brandSize').textContent = `宽 ${game.width} · 高 ${game.height}`;
  $('gameRoadDescription').textContent = `矩形底边的 ${game.width} 段道路可接球。`;
  $('gameSizeTag').textContent = `${game.width} × ${game.height}`;
  $('gameTitle').textContent = game.levelName;
  $('ballCount').textContent = stats.balls.toLocaleString('zh-CN');
  $('roadCount').textContent = `${stats.road}/${stats.roadCapacity}`;
  $('garageCount').textContent = String(stats.pending);
  $('tickCount').textContent = stats.tick.toLocaleString('zh-CN');
  const badge = $('gameStateBadge');
  badge.textContent = statusText();
  badge.className = `state-badge ${game.status === 'won' ? 'won' : game.status === 'failed' ? 'failed' : game.paused ? 'paused' : ''}`;
  $('pauseBtn').textContent = game.paused ? '▶ 继续' : 'Ⅱ 暂停';
  $('speedBtn').textContent = `⏩ ${game.speed}× 加速`;
  for (const [id, active] of [['clearBtn', tool === 'clear'], ['magnetBtn', tool === 'magnet']]) {
    $(id).classList.toggle('active', active);
  }
  $('cancelToolBtn').disabled = tool === null;
  $('toolHint').textContent = tool === 'clear'
    ? '清除模式：点击车库中任意一辆尚未派出的车；再次点按钮或取消可退出。'
    : tool === 'magnet'
      ? '磁铁模式：点击道路车辆卡片或画布上的车；再次点按钮或取消可退出。'
      : '点击车库的列头车辆派出。';
  const alert = $('capacityAlert');
  if (stats.shortages.length) {
    alert.classList.remove('hidden');
    alert.textContent = `运力不足：${stats.shortages.map(({ color, shortage }) => `${COLORS[color].name}球还缺 ${shortage} 个座位`).join('，')}。可重开，游戏不会自动删球或补车。`;
  } else if (stats.balls === 0 && (stats.pending > 0 || stats.road > 0)) {
    alert.classList.remove('hidden');
    alert.textContent = '小球已清空，但仍有车辆未离场；通关要求球、待发车和道路车全部清空。可重开或返回编辑器。';
  } else alert.classList.add('hidden');
  const result = $('resultBanner');
  if (game.status === 'won') {
    result.className = 'result-banner';
    result.textContent = `🎉 ${game.levelName} 通关！全部小球与车辆均已清空。`;
  } else if (game.status === 'failed') {
    result.className = 'result-banner failed';
    result.textContent = `道路已达 ${game.roadCapacity}/${game.roadCapacity}，所有路车在当前球区都无法继续接球。请重开或返回编辑器调整。`;
  } else result.className = 'result-banner hidden';
  const signature = `${game.road.map((car) => `${car.id}:${car.remaining}`).join('|')}|${game.garage.map((column) => column.map((car) => car.id).join(',')).join('|')}|${tool}|${game.status}`;
  if (signature !== lastUiSignature) {
    $('roadCars').innerHTML = game.road.length
      ? game.road.map((car) => `<button class="road-chip" type="button" data-id="${escapeHtml(car.id)}" aria-label="${escapeHtml(COLORS[car.color].name)}色道路车辆，剩余容量${car.remaining}，初始容量${car.capacity}">
          <span class="road-chip-title"><i class="ball-dot" style="background:${COLORS[car.color].hex}"></i>${COLORS[car.color].name}车</span>
          <span class="road-chip-count"><span>剩余容量</span><strong>${car.remaining.toLocaleString('zh-CN')}</strong><small>/ ${car.capacity.toLocaleString('zh-CN')}</small></span>
          <span class="capacity-track"><span style="width:${car.remaining / car.capacity * 100}%;background:${COLORS[car.color].hex}"></span></span>
        </button>`).join('')
      : '<span class="garage-empty">道路暂无车辆</span>';
    renderGarage('gameGarage', game.garage);
    lastUiSignature = signature;
  }
}

function renderBoardNow() {
  if (mode === 'game') {
    setViewSize(gameView, game.width, game.height);
    drawBoard(gameView, game.balls, game.road, {
      ballIds: game.ballIds,
      ballAnimations: game.ballAnimations,
      animationTime: game.tick + (game.paused ? 0 : accumulator / TICK_MS)
    });
    drawMini($('miniCanvas'), game.balls, gameView);
  } else {
    setViewSize(editorView, editorDraft.width, editorDraft.height);
    drawBoard(editorView, editorDraft.balls, [], { editor: true, previewRect });
  }
}

function act(result) {
  toast(result.message, result.ok ? 'success' : 'error');
  if (result.ok) {
    if (game.status !== lastGameStatus) announceEnd();
    renderGameUI();
    renderBoardNow();
  }
}

function announceEnd() {
  if (game.status === lastGameStatus) return;
  lastGameStatus = game.status;
  if (game.status === 'won') toast('恭喜通关！球和车辆全部清空。', 'success');
  if (game.status === 'failed') toast(`道路 ${game.roadCapacity}/${game.roadCapacity} 且所有路车无法再接球，已进入死局。`, 'error');
}

function handleGarageClick(id) {
  if (tool === 'clear') {
    act(clearGarageCar(game, id));
    tool = null;
  } else act(dispatchCar(game, id));
  renderGameUI();
}

function handleRoadClick(id) {
  if (tool !== 'magnet') { toast('道路车辆的剩余容量显示在卡片上；使用磁铁可移走它。'); return; }
  act(magnetRoadCar(game, id));
  tool = null;
  renderGameUI();
}

function setTool(next) {
  tool = tool === next ? null : next;
  renderGameUI();
  toast(tool === 'clear' ? '清除已选中：请点车库中任意待发车。' : tool === 'magnet' ? '磁铁已选中：请点道路上的车。' : '已取消道具选择。');
}

function selectedCar() {
  for (let column = 0; column < editorDraft.garage.length; column++) {
    const slot = editorDraft.garage[column].findIndex((car) => car.id === selectedCarId);
    if (slot >= 0) return { car: editorDraft.garage[column][slot], column, slot };
  }
  return null;
}

function markDirty() {
  resetVerification();
  dirty = true;
  $('dirtyBadge').textContent = '有未保存修改';
  scheduleEditorUpdate();
}

function scheduleEditorUpdate() {
  if (editorUpdateQueued) return;
  editorUpdateQueued = true;
  requestAnimationFrame(() => { editorUpdateQueued = false; updateEditor(false); });
}

function updateEditor(updateProperties = true) {
  const { width, height } = levelSize(editorDraft);
  if (mode === 'editor') $('brandSize').textContent = `宽 ${width} · 高 ${height}`;
  $('editorSizeDescription').textContent = `在 ${(width * height).toLocaleString('zh-CN')} 个矩形球格里涂画，调整车队，再一键试玩。`;
  $('editorCanvas').setAttribute('aria-label', `宽 ${width} 高 ${height} 的矩形可编辑球区`);
  if (document.activeElement !== $('gridWidth')) $('gridWidth').value = width;
  if (document.activeElement !== $('gridHeight')) $('gridHeight').value = height;
  $('carCapacity').max = width * height;
  $('dirtyBadge').textContent = dirty ? '有未保存修改' : '已加载';
  if (document.activeElement !== $('levelName')) $('levelName').value = editorDraft.name;
  if (document.activeElement !== $('roadCapacity')) $('roadCapacity').value = roadCapacityOf(editorDraft);
  const validation = validateLevel(editorDraft);
  $('editorStats').innerHTML = '<div class="stat-row head"><span>色</span><span>小球</span><span>容量</span><span>差值</span></div>' +
    COLOR_KEYS.map((color) => {
      const balls = validation.counts.balls[color];
      const capacity = validation.counts.capacity[color];
      const difference = capacity - balls;
      return `<div class="stat-row"><span>${COLOR_EMOJI[color]}</span><span>${balls}</span><span>${capacity}</span><span class="${difference < 0 ? 'negative' : difference > 0 ? 'positive' : ''}">${difference > 0 ? '+' : ''}${difference}</span></div>`;
    }).join('');
  $('validationMessages').innerHTML = validation.errors.length || validation.warnings.length
    ? [...validation.errors.map((message) => `<div class="error">错误：${escapeHtml(message)}</div>`),
      ...validation.warnings.map((message) => `<div class="warning">警告：${escapeHtml(message)}</div>`)].join('')
    : '<div class="okay">配置格式有效，数量匹配。此检查不代表已证明可通关。</div>';
  $('previewBtn').disabled = validation.errors.length > 0;
  $('saveBtn').disabled = validation.errors.length > 0;
  $('exportBtn').disabled = validation.errors.length > 0;
  renderGarage('editorGarage', editorDraft.garage, true);
  if (updateProperties) renderCarProperties();
  if (mode === 'editor') renderBoardNow();
}

function renderCarProperties() {
  const selected = selectedCar();
  $('carProperties').classList.toggle('hidden', !selected);
  $('selectedCarLabel').textContent = selected
    ? `${selected.car.id} · 第 ${selected.column + 1} 列第 ${selected.slot + 1} 位`
    : '尚未选择车辆';
  if (!selected) return;
  $('carColor').value = selected.car.color;
  $('carCapacity').value = selected.car.capacity;
  $('moveColumn').value = String(selected.column);
  populateMoveSlots(selected.slot);
}

function populateMoveSlots(preferred = null) {
  const selected = selectedCar();
  if (!selected) return;
  const targetColumn = Number($('moveColumn').value);
  const same = targetColumn === selected.column;
  const last = editorDraft.garage[targetColumn].length - (same ? 1 : 0);
  $('moveSlot').innerHTML = Array.from({ length: last + 1 }, (_, slot) => `<option value="${slot}">第 ${slot + 1} 位${slot === last ? '（末尾）' : ''}</option>`).join('');
  $('moveSlot').value = String(preferred === null ? last : Math.min(preferred, last));
}

function newCarId() {
  const ids = new Set(editorDraft.garage.flat().map((car) => car.id));
  for (let number = 1; ; number++) {
    const candidate = `custom-${number}`;
    if (!ids.has(candidate)) return candidate;
  }
}

function paintCell(x, y) {
  if (!insideGrid(x, y, editorDraft.width, editorDraft.height)) return;
  const index = cellIndex(x, y, editorDraft.width);
  const color = brush === 'erase' ? null : brush;
  if (editorDraft.balls[index] === color) return;
  editorDraft.balls[index] = color;
  markDirty();
}

function paintLine(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let step = 0; step <= steps; step++) {
    const x = Math.round(from.x + dx * step / (steps || 1));
    const y = Math.round(from.y + dy * step / (steps || 1));
    paintCell(x, y);
  }
}

function paintRectangle(from, to) {
  for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) {
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) paintCell(x, y);
  }
}

function setBrush(value) {
  brush = value;
  document.querySelectorAll('.color-tool').forEach((button) => button.classList.toggle('active', button.dataset.color === value));
}

function setDrawMode(value) {
  drawMode = value;
  document.querySelectorAll('.draw-mode').forEach((button) => button.classList.toggle('active', button.dataset.mode === value));
}

function setupPointerInteractions() {
  const editorCanvas = $('editorCanvas');
  let editing = null;
  editorCanvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    editorCanvas.setPointerCapture(event.pointerId);
    const point = gridPoint(editorView, event.clientX, event.clientY);
    editing = { pointerId: event.pointerId, start: point, last: point, clientX: event.clientX, clientY: event.clientY };
    if (drawMode === 'brush' && point) paintCell(point.x, point.y);
    if (drawMode === 'rect' && point) previewRect = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
    renderBoardNow();
  });
  editorCanvas.addEventListener('pointermove', (event) => {
    const point = gridPoint(editorView, event.clientX, event.clientY);
    $('cellStatus').textContent = point ? `坐标：第 ${point.y + 1} 行 / 第 ${point.x + 1} 列` : '坐标：道路或画布外';
    if (!editing || editing.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (drawMode === 'pan') {
      panView(editorView, event.clientX - editing.clientX, event.clientY - editing.clientY);
    } else if (drawMode === 'brush' && point) {
      if (editing.last) paintLine(editing.last, point);
      else paintCell(point.x, point.y);
      editing.last = point;
    } else if (drawMode === 'rect' && point && editing.start) {
      previewRect = { x1: editing.start.x, y1: editing.start.y, x2: point.x, y2: point.y };
      editing.last = point;
    }
    editing.clientX = event.clientX;
    editing.clientY = event.clientY;
    renderBoardNow();
  });
  const endEditing = (event) => {
    if (!editing || editing.pointerId !== event.pointerId) return;
    if (drawMode === 'rect' && editing.start && editing.last) paintRectangle(editing.start, editing.last);
    editing = null;
    previewRect = null;
    renderBoardNow();
  };
  editorCanvas.addEventListener('pointerup', endEditing);
  editorCanvas.addEventListener('pointercancel', endEditing);

  const gameCanvas = $('gameCanvas');
  let dragging = null;
  gameCanvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    gameCanvas.setPointerCapture(event.pointerId);
    dragging = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  });
  gameCanvas.addEventListener('pointermove', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - dragging.x;
    const dy = event.clientY - dragging.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
    if (dragging.moved) panView(gameView, dx, dy);
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    renderBoardNow();
  });
  gameCanvas.addEventListener('pointerup', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    if (!dragging.moved && tool === 'magnet') {
      const point = worldPoint(gameView, event.clientX, event.clientY);
      const closest = game.road.map((car) => {
        const position = roadPosition(car.phase, game.width, game.height);
        return { car, distance: Math.hypot(position.x - point.x, position.y - point.y) };
      }).sort((a, b) => a.distance - b.distance)[0];
      if (closest?.distance < 1.3) handleRoadClick(closest.car.id);
      else toast('请点道路上的车辆，或点右侧车辆卡片。', 'error');
    }
    dragging = null;
  });
  gameCanvas.addEventListener('pointercancel', () => { dragging = null; });
  $('miniCanvas').addEventListener('pointerdown', (event) => {
    const rect = $('miniCanvas').getBoundingClientRect();
    gameView.focus = 'custom';
    gameView.centerX = Math.max(0, Math.min(game.width, (event.clientX - rect.left) / rect.width * game.width));
    gameView.centerY = Math.max(0, Math.min(game.height + 4, (event.clientY - rect.top) / rect.height * (game.height + 4)));
    renderBoardNow();
  });
}

function bindControls() {
  $('levelSelect').innerHTML = BUILTIN_LEVELS.map((level, index) => `<option value="${level.id}">第 ${index + 1} 关 · ${level.name.split('·')[1].trim()}</option>`).join('');
  $('levelSelect').value = levelId;
  $('levelSelect').addEventListener('change', (event) => chooseLevel(event.target.value));
  $('gameTab').addEventListener('click', () => { if (garageWorker) resetVerification(); setMode('game'); });
  const leavePreview = () => {
    if (preview) {
      game = gameBeforePreview ?? createGame(levelSource());
      setViewSize(gameView, game.width, game.height);
      gameBeforePreview = null;
      preview = false;
      lastGameStatus = game.status;
      lastUiSignature = '';
      renderGameUI();
      toast('已返回编辑器；试玩没有改动编辑配置。');
    }
    setMode('editor');
  };
  $('editorTab').addEventListener('click', leavePreview);
  $('returnEditor').addEventListener('click', leavePreview);
  $('restartBtn').addEventListener('click', resetGame);
  $('pauseBtn').addEventListener('click', () => { setPaused(game, !game.paused); renderGameUI(); toast(game.paused ? '已暂停。' : '继续运行。'); });
  $('speedBtn').addEventListener('click', () => {
    setSpeed(game, game.speed === 1 ? 2 : game.speed === 2 ? 4 : 1);
    renderGameUI(); toast(`当前速度 ${game.speed}×。`);
  });
  $('clearBtn').addEventListener('click', () => setTool('clear'));
  $('magnetBtn').addEventListener('click', () => setTool('magnet'));
  $('cancelToolBtn').addEventListener('click', () => { tool = null; renderGameUI(); toast('已取消道具选择。'); });
  $('shuffleBtn').addEventListener('click', () => act(shuffleGarage(game)));
  $('gameGarage').addEventListener('click', (event) => {
    const card = event.target.closest('.car-card');
    if (card) handleGarageClick(card.dataset.id);
  });
  $('roadCars').addEventListener('click', (event) => {
    const chip = event.target.closest('.road-chip');
    if (chip) handleRoadClick(chip.dataset.id);
  });
  for (const [id, view, multiplier] of [
    ['gameZoomOut', gameView, 0.8], ['gameZoomIn', gameView, 1.25],
    ['editorZoomOut', editorView, 0.8], ['editorZoomIn', editorView, 1.25]
  ]) $(id).addEventListener('click', () => { zoomView(view, multiplier); renderBoardNow(); });
  for (const [id, view] of [['gameFit', gameView], ['editorFit', editorView]]) {
    $(id).addEventListener('click', () => { fitView(view); renderBoardNow(); });
  }
  for (const [id, view] of [['gameFocus', gameView], ['editorFocus', editorView]]) {
    $(id).addEventListener('click', () => { focusBottom(view); renderBoardNow(); });
  }
  document.querySelectorAll('.color-tool').forEach((button) => button.addEventListener('click', () => setBrush(button.dataset.color)));
  document.querySelectorAll('.draw-mode').forEach((button) => button.addEventListener('click', () => setDrawMode(button.dataset.mode)));
  $('levelName').addEventListener('input', (event) => { editorDraft.name = event.target.value; markDirty(); });
  $('roadCapacity').addEventListener('input', (event) => {
    editorDraft.roadCapacity = event.target.value === '' ? 0 : Number(event.target.value);
    markDirty(); updateEditor(false);
  });
  $('applySizeBtn').addEventListener('click', () => {
    const width = Number($('gridWidth').value);
    const height = Number($('gridHeight').value);
    let resized;
    try { resized = resizeLevel(editorDraft, width, height); }
    catch (error) { toast(error.message, 'error'); return; }
    if (width === editorDraft.width && height === editorDraft.height) {
      toast('球区尺寸没有变化。'); return;
    }
    if (resized.removed > 0 && !window.confirm(`缩小球区会移除边界外的 ${resized.removed} 个小球。确定应用吗？`)) return;
    editorDraft = resized.level;
    resetVerification();
    setViewSize(editorView, width, height);
    markDirty();
    updateEditor();
    toast(`球区已调整为 ${width}×${height}；${resized.removed ? `移除 ${resized.removed} 个越界球。` : '新增格为空。'}`, 'success');
  });
  $('importLayoutBtn').addEventListener('click', () => $('importLayoutFile').click());
  $('importLayoutFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const layout = parseBallLayout(await file.text());
      const next = { ...editorDraft, width: layout.width, height: layout.height, balls: layout.balls };
      const result = validateLevel(next);
      if (dirty && !window.confirm('导入将替换当前草稿的球区宽高和小球，确定继续吗？')) return;
      resetVerification();
      editorDraft = next;
      dirty = true;
      setViewSize(editorView, next.width, next.height);
      fitView(editorView);
      updateEditor();
      toast(`已导入 ${next.width}×${next.height} 球区排布；车库保持原样${result.errors.length ? '，请修复配置错误' : result.warnings.length ? '，请检查逐色运力差异' : ''}。`, 'success');
    } catch (error) { toast(`球区排布导入失败：${error.message}`, 'error'); }
    finally { event.target.value = ''; }
  });
  const selectedRandomColors = () => [...document.querySelectorAll('.random-color:checked')].map((input) => input.value);
  const updateRandomColorStatus = () => {
    const count = selectedRandomColors().length;
    $('randomColorStatus').textContent = count ? `已选择 ${count} 种颜色` : '请至少选择 1 种颜色';
    $('randomColorStatus').classList.toggle('error-text', count === 0);
  };
  document.querySelectorAll('.random-color').forEach((input) => input.addEventListener('change', updateRandomColorStatus));
  $('generateBtn').addEventListener('click', () => {
    const colors = selectedRandomColors();
    const seed = randomSeedFrom('randomSeed');
    let generated;
    try { generated = generateRandomLevel({ id: levelId, colors, seed, roadCapacity: roadCapacityOf(editorDraft),
      width: editorDraft.width, height: editorDraft.height }); }
    catch (error) { toast(`生成失败：${error.message}`, 'error'); return; }
    if (dirty && !window.confirm('生成将覆盖当前未保存的编辑草稿，确定继续吗？')) return;
    resetVerification();
    editorDraft = generated;
    selectedCarId = null;
    dirty = true;
    $('randomSeedResult').textContent = `本次种子：${seed}（填入上方可复现）`;
    setViewSize(editorView, generated.width, generated.height);
    fitView(editorView);
    updateEditor();
    const empty = generated.balls.filter((ball) => ball === null).length;
    toast(`已生成 ${colors.length} 色关卡（种子 ${seed}）${empty ? `；为保持车辆容量是 5 的倍数，留下 ${empty} 个空格` : ''}。可立即试玩或保存。`, 'success');
  });
  $('generateVehiclesBtn').addEventListener('click', () => {
    const columns = Number($('vehicleColumns').value);
    const rows = Number($('vehicleRows').value);
    const seed = randomSeedFrom('vehicleSeed');
    let candidate;
    try { candidate = generateRandomGarage({ balls: editorDraft.balls, columns, rows, seed,
      width: editorDraft.width, height: editorDraft.height }); }
    catch (error) { toast(`生成车辆失败：${error.message}`, 'error'); return; }
    const check = validateLevel({ ...editorDraft, garage: candidate });
    if (check.errors.length) { toast(`生成车辆失败：${check.errors[0]}`, 'error'); return; }
    if (dirty && !window.confirm('随机车辆将替换当前未保存草稿中的车库，确定继续吗？')) return;
    resetVerification();
    const requestId = garageRequestId;
    $('generateVehiclesBtn').disabled = true;
    $('vehicleSeedResult').textContent = '正在后台生成并回放无道具通关路线…';
    try {
      const worker = new Worker(new URL('./verify-worker.js', import.meta.url), { type: 'module' });
      garageWorker = worker;
      worker.onmessage = ({ data }) => {
        if (requestId !== garageRequestId || worker !== garageWorker) return;
        if (data.progress) { $('vehicleSeedResult').textContent = data.progress; return; }
        worker.terminate();
        garageWorker = null;
        $('generateVehiclesBtn').disabled = false;
        if (data.error || data.result?.status !== 'solvable') {
          const reason = data.error || data.result?.reason || '验证未完成。';
          $('vehicleSeedResult').textContent = `未替换车库：${reason}`;
          $('vehicleSeedResult').classList.add('error-text');
          toast(`生成车辆失败：${reason}`, 'error');
          return;
        }
        editorDraft.garage = data.result.garage;
        selectedCarId = null;
        markDirty();
        updateEditor();
        $('vehicleSeedResult').textContent = `已验证无道具通关：${columns} 列 × ${rows} 行、${columns * rows} 辆车；起始种子 ${seed}，采用种子 ${data.result.seed}（第 ${data.result.attempts} 组）。球区保持不变。`;
        showVerification(data.result.verification);
        toast('车辆已生成，正式玩法逻辑已回放确认无道具通关；派车路线见下方验证结果。', 'success');
      };
      worker.onerror = (event) => {
        if (requestId !== garageRequestId) return;
        worker.terminate();
        garageWorker = null;
        $('generateVehiclesBtn').disabled = false;
        $('vehicleSeedResult').textContent = `未替换车库：验证程序运行失败：${event.message || '未知错误'}`;
        $('vehicleSeedResult').classList.add('error-text');
        toast('车辆验证程序运行失败，原车库保持不变。', 'error');
      };
      worker.postMessage({ requestId, type: 'generate-garage', level: clone(editorDraft), options: { columns, rows, seed } });
    } catch (error) {
      garageWorker?.terminate();
      garageWorker = null;
      $('generateVehiclesBtn').disabled = false;
      $('vehicleSeedResult').textContent = `未替换车库：${error.message}`;
      $('vehicleSeedResult').classList.add('error-text');
      toast(`无法启动车辆验证：${error.message}`, 'error');
    }
  });
  for (const id of ['vehicleColumns', 'vehicleRows', 'vehicleSeed']) {
    $(id).addEventListener('input', () => {
      if (garageWorker) {
        resetVerification();
        $('vehicleSeedResult').textContent = '车辆参数已改变，请重新生成。';
      }
    });
  }
  $('editorGarage').addEventListener('click', (event) => {
    const card = event.target.closest('.car-card');
    if (!card) return;
    selectedCarId = card.dataset.id;
    updateEditor();
  });
  $('addCarBtn').addEventListener('click', () => {
    const columnIndex = Number($('addColumn').value);
    const column = editorDraft.garage[columnIndex];
    if (column.length >= GARAGE_ROWS) { toast(`第 ${columnIndex + 1} 列已满。`, 'error'); return; }
    const car = { id: newCarId(), color: brush === 'erase' ? 'R' : brush, capacity: 1, slot: column.length };
    column.push(car);
    selectedCarId = car.id;
    markDirty();
    updateEditor();
    toast('已新增车辆。', 'success');
  });
  $('carColor').addEventListener('change', (event) => {
    const selected = selectedCar();
    if (!selected) return;
    selected.car.color = event.target.value;
    markDirty(); updateEditor(false);
  });
  $('carCapacity').addEventListener('input', (event) => {
    const selected = selectedCar();
    if (!selected) return;
    selected.car.capacity = event.target.value === '' ? 0 : Number(event.target.value);
    markDirty(); updateEditor(false);
  });
  $('moveColumn').addEventListener('change', () => populateMoveSlots());
  $('moveCarBtn').addEventListener('click', () => {
    const selected = selectedCar();
    if (!selected) return;
    const toColumn = Number($('moveColumn').value);
    const toSlot = Number($('moveSlot').value);
    if (toColumn !== selected.column && editorDraft.garage[toColumn].length >= GARAGE_ROWS) {
      toast('目标列已满。', 'error'); return;
    }
    editorDraft.garage[selected.column].splice(selected.slot, 1);
    editorDraft.garage[toColumn].splice(toSlot, 0, selected.car);
    reindexGarage(editorDraft.garage);
    markDirty(); updateEditor();
    toast('车辆已移动到合法车位。', 'success');
  });
  $('deleteCarBtn').addEventListener('click', () => {
    const selected = selectedCar();
    if (!selected) return;
    editorDraft.garage[selected.column].splice(selected.slot, 1);
    reindexGarage(editorDraft.garage);
    selectedCarId = null;
    markDirty(); updateEditor();
    toast('编辑器车辆已删除。', 'success');
  });
  $('previewBtn').addEventListener('click', () => {
    const result = validateLevel(editorDraft);
    if (result.errors.length) { toast(result.errors[0], 'error'); return; }
    if (garageWorker) resetVerification();
    gameBeforePreview = game;
    game = createGame(editorDraft);
    setViewSize(gameView, game.width, game.height);
    preview = true;
    lastGameStatus = game.status;
    lastUiSignature = '';
    tool = null;
    setMode('game');
    renderGameUI();
    toast(result.warnings.length ? '正在试玩草稿；数量不匹配，请留意运力。' : '正在试玩编辑草稿，原配置保持不变。', result.warnings.length ? '' : 'success');
  });
  $('verifyBtn').addEventListener('click', startVerification);
  $('saveBtn').addEventListener('click', () => {
    try {
      saveDraft(localStorage, editorDraft);
      dirty = false;
      updateEditor(false);
      toast('已保存到此浏览器的本地存储，刷新后可恢复。', 'success');
    } catch (error) { toast(`保存失败：${error.message}`, 'error'); }
  });
  $('exportBtn').addEventListener('click', () => {
    try {
      const json = exportLevel(editorDraft);
      $('importText').value = json;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${levelId}-level.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('JSON 已导出，同时填入下方文本框。', 'success');
    } catch (error) { toast(`导出失败：${error.message}`, 'error'); }
  });
  $('importFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    $('importText').value = await file.text();
    toast(`已读取 ${file.name}，点击“导入到当前关卡”完成校验。`);
  });
  $('importBtn').addEventListener('click', () => {
    try {
      const next = importLevel($('importText').value, levelId);
      resetVerification();
      editorDraft = next;
      setViewSize(editorView, next.width, next.height);
      selectedCarId = null;
      dirty = true;
      updateEditor();
      toast('JSON 导入成功，当前关卡草稿已更新；可试玩或保存。', 'success');
    } catch (error) { toast(`导入失败：${error.message}`, 'error'); }
  });
  $('resetBtn').addEventListener('click', () => {
    if (!window.confirm('将覆盖当前编辑修改并删除本关本地存档，确定恢复默认配置吗？')) return;
    removeDraft(localStorage, levelId);
    resetVerification();
    editorDraft = getBuiltinLevel(levelId);
    setViewSize(editorView, editorDraft.width, editorDraft.height);
    selectedCarId = null;
    dirty = false;
    updateEditor();
    toast('已恢复本关默认配置。', 'success');
  });
  setupPointerInteractions();
  window.addEventListener('resize', () => renderBoardNow());
  new ResizeObserver(() => renderBoardNow()).observe($('gameCanvas').parentElement);
  new ResizeObserver(() => renderBoardNow()).observe($('editorCanvas').parentElement);
}

function frame(timestamp) {
  // Keep simulation time independent of render frequency, including a throttled tab.
  const elapsed = lastFrame ? Math.min(5000, timestamp - lastFrame) : 0;
  lastFrame = timestamp;
  if (mode === 'game' && game.status === 'playing' && !game.paused &&
      (game.road.length > 0 || game.ballAnimations.size > 0)) {
    accumulator += elapsed * game.speed;
    const steps = Math.floor(accumulator / TICK_MS);
    if (steps > 0) {
      accumulator -= steps * TICK_MS;
      advanceGame(game, steps);
      announceEnd();
      renderGameUI();
    }
    if (steps > 0 || game.ballAnimations.size > 0) renderBoardNow();
  } else accumulator = 0;
  requestAnimationFrame(frame);
}

bindControls();
updateEditor();
renderGameUI();
renderBoardNow();
requestAnimationFrame(frame);
