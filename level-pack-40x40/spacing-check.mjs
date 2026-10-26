import { readFile } from 'node:fs/promises';
import { createGame, advanceGame, dispatchCar, availableBottomColors } from '../src/engine.js';
import { importLevel } from '../src/validation.js';
const report = JSON.parse(await readFile(new URL('verification-report.json', import.meta.url), 'utf8'));
for (const gap of [10, 20, 30, 50]) {
  const states = [];
  for (const item of report.levels) {
    const level = importLevel(await readFile(new URL(item.file, import.meta.url), 'utf8'), item.id);
    const game = createGame(level);
    let i = 0, last = -gap, peak = 0;
    const dispatches = [];
    while (game.status === 'playing' && game.tick < 18000) {
      const next = item.route[i];
      if (next && game.tick >= Math.max(next.tick, last + gap) && game.garage[next.column - 1][0]?.id === next.id && game.road.length < 6) {
        const step = { tick: game.tick, id: next.id, column: next.column,
          color: next.color, capacity: next.capacity, roadBefore: game.road.length,
          ballsLeft: game.ballsLeft, bottomColors: [...availableBottomColors(game)] };
        if (!dispatchCar(game, next.id).ok) throw Error('派车失败');
        dispatches.push(step);
        last = game.tick; i++; peak = Math.max(peak, game.road.length);
      }
      advanceGame(game);
    }
    states.push(`${item.id}:${game.status}/${game.tick}/${i}/${peak}`);
    if (gap === 30) console.log(JSON.stringify({ id: item.id, status: game.status, ticks: game.tick, peak, dispatches }));
  }
  console.log(`${gap} ticks: ${states.join(' ')}`);
}
