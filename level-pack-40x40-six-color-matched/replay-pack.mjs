import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceGame, availableBottomColors, createGame, dispatchCar } from '../src/engine.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';

const report=JSON.parse(await readFile(new URL('verification-report.json',import.meta.url),'utf8'));
assert.equal(report.levels.length,9);
const colors=['R','B','Y','G','O','P'];
function replay(level,expected){
  const game=createGame(level);let index=0,peak=0,changes=0,previous=[...availableBottomColors(game)].join('|');
  const first={};for(const color of availableBottomColors(game))first[color]=0;
  while(game.status==='playing'&&game.tick<=expected.ticks){
    while(expected.dispatches[index]?.tick===game.tick){
      const step=expected.dispatches[index];
      assert.equal(game.garage[step.column-1][0]?.id,step.id);
      assert.equal(game.road.length,step.roadBefore);
      assert.equal(game.ballsLeft,step.ballsLeft);
      assert.deepEqual([...availableBottomColors(game)],step.bottomColors);
      assert.equal(dispatchCar(game,step.id).ok,true);
      peak=Math.max(peak,game.road.length);index++;
    }
    advanceGame(game);
    const bottom=[...availableBottomColors(game)],key=bottom.join('|');
    for(const color of bottom)if(first[color]===undefined)first[color]=game.tick;
    if(key!==previous){changes++;previous=key;}
  }
  assert.equal(game.status,'won');assert.equal(game.tick,expected.ticks);
  assert.equal(game.ballsLeft,0);assert.equal(game.garage.flat().length,0);assert.equal(game.road.length,0);
  assert.equal(game.events.filter(e=>e.type==='pickup').length,1600);
  assert.equal(game.events.some(e=>['clear','shuffle','magnet'].includes(e.type)),false);
  assert.equal(index,expected.dispatches.length);assert.equal(peak,expected.peak);
  return {peak,changes,first};
}
function branch(level,order){
  const game=createGame(level);let peak=0;
  while(game.status==='playing'&&game.tick<18000){
    for(const col of order)while(game.garage[col-1].length&&game.road.length<6){
      assert.equal(dispatchCar(game,game.garage[col-1][0].id).ok,true);
      peak=Math.max(peak,game.road.length);
    }
    advanceGame(game);
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak};
}
function adjacency(balls){
  let same=0,neighbors=0;
  for(let y=0;y<40;y++)for(let x=0;x<40;x++){
    const a=balls[y*40+x];
    if(x<39){neighbors++;if(a===balls[y*40+x+1])same++;}
    if(y<39){neighbors++;if(a===balls[(y+1)*40+x])same++;}
  }
  return same/neighbors;
}
for(const item of report.levels){
  const level=importLevel(await readFile(new URL(item.file,import.meta.url),'utf8'),item.id);
  const valid=validateLevel(level);
  assert.deepEqual(valid.errors,[]);assert.deepEqual(valid.warnings,[]);
  assert.equal(level.width,40);assert.equal(level.height,40);assert.equal(level.balls.length,1600);
  assert.equal(level.roadCapacity,6);assert.equal(level.garage.length,3);
  assert.equal(level.balls.every(c=>colors.includes(c)),true);
  assert.deepEqual([...new Set(level.balls)].sort(),colors.slice().sort());
  assert.equal(level.garage.every(column=>column.length<=12),true);
  assert.equal(level.garage.flat().every(car=>car.capacity%10===0),true);
  assert.deepEqual(valid.counts.balls,valid.counts.capacity);
  assert.ok(Math.abs(adjacency(level.balls)-item.adjacentSameRatio)<1e-12);
  assert.deepEqual(importLevel(exportLevel(level),item.id),level);
  replay(level,item.route);
  const human=replay(level,item.human);
  assert.equal(item.human.dispatches.length,level.garage.flat().length);
  assert.equal(human.changes,item.exposure.bottomSetChanges);
  assert.deepEqual(human.first,item.exposure.firstBottomTick);
  for(const b of item.branches)assert.deepEqual(branch(level,b.columnPriority),
    {status:b.status,ticks:b.ticks,ballsLeft:b.ballsLeft,peak:b.peak});
  console.log(`${item.file}: won; exact ${item.route.ticks}, spaced ${item.human.ticks}; peak ${human.peak}/6; branch failures ${item.branches.filter(b=>b.status==='failed').length}/3`);
}
