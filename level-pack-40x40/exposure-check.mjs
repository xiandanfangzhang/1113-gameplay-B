import { readFile } from 'node:fs/promises';
import { advanceGame, availableBottomColors, createGame, dispatchCar } from '../src/engine.js';
import { importLevel } from '../src/validation.js';
const report = JSON.parse(await readFile(new URL('human-route-report.json', import.meta.url), 'utf8'));
for (const item of report.levels) {
  const n = Number(item.id.slice(-2));
  const level = importLevel(await readFile(new URL(`level-${String(n).padStart(2, '0')}.json`, import.meta.url), 'utf8'), item.id);
  const game = createGame(level);
  const firstSeen = { R: null, B: null, Y: null, G: null };
  const sets = new Set(); let changes = 0, last = null, i = 0;
  while (game.status === 'playing' && game.tick <= item.ticks) {
    const current = [...availableBottomColors(game)].sort().join('');
    sets.add(current);
    if (last !== null && current !== last) changes++;
    last = current;
    for (const c of current) firstSeen[c] ??= game.tick;
    while (item.dispatches[i]?.tick === game.tick) dispatchCar(game, item.dispatches[i++].id);
    advanceGame(game);
  }
  console.log(JSON.stringify({ id: item.id, firstSeen, bottomSetChanges: changes, distinctBottomSets: sets.size }));
}
