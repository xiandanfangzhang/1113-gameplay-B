import { GRID_HEIGHT, GRID_WIDTH, cellIndex, insideGrid } from './constants.js';

export function nextFallPosition(balls, x, y, width = GRID_WIDTH, height = GRID_HEIGHT) {
  if (y >= height - 1 || !insideGrid(x, y, width, height)) return null;
  if (balls[cellIndex(x, y + 1, width)] === null) return { x, y: y + 1 };
  if (insideGrid(x + 1, y, width, height) &&
      balls[cellIndex(x + 1, y, width)] === null && balls[cellIndex(x + 1, y + 1, width)] === null) return { x: x + 1, y: y + 1 };
  if (insideGrid(x - 1, y, width, height) &&
      balls[cellIndex(x - 1, y, width)] === null && balls[cellIndex(x - 1, y + 1, width)] === null) return { x: x - 1, y: y + 1 };
  return null;
}

/**
 * Move each ball at most once per sweep. Sweeps run bottom to top, then left
 * to right, so a vacated cell may be used by the next ball deterministically.
 * Diagonal travel requires both the side cell and destination to be empty.
 */
export function settleBalls(balls, ballIds = null, width = GRID_WIDTH, height = GRID_HEIGHT) {
  if (!Array.isArray(balls) || balls.length !== width * height) throw new Error('球区尺寸无效。');
  const ids = ballIds ?? balls.map((color, index) => color === null ? null : index);
  const paths = new Map();
  let moved;
  do {
    moved = false;
    for (let y = height - 2; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const from = cellIndex(x, y, width);
        const color = balls[from];
        if (color === null) continue;
        const destination = nextFallPosition(balls, x, y, width, height);
        if (!destination) continue;
        const to = cellIndex(destination.x, destination.y, width);
        const id = ids[from];
        balls[to] = color;
        balls[from] = null;
        ids[to] = id;
        ids[from] = null;
        if (!paths.has(id)) paths.set(id, [{ x: x + 0.5, y: y + 0.5 }]);
        paths.get(id).push({ x: destination.x + 0.5, y: destination.y + 0.5 });
        moved = true;
      }
    }
  } while (moved);
  return { paths };
}

export function animatedPosition(animation, simulationTime) {
  const { path, startTick, durationTicks } = animation;
  if (path.length < 2) return path[0];
  const progress = Math.max(0, Math.min(1, (simulationTime - startTick) / durationTicks));
  const position = progress * (path.length - 1);
  const segment = Math.min(path.length - 2, Math.floor(position));
  const fraction = position - segment;
  return {
    x: path[segment].x + (path[segment + 1].x - path[segment].x) * fraction,
    y: path[segment].y + (path[segment + 1].y - path[segment].y) * fraction
  };
}
