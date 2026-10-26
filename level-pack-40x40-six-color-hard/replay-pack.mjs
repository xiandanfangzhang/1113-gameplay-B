import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceGame, availableBottomColors, createGame, dispatchCar } from '../src/engine.js';
import { COLOR_KEYS } from '../src/constants.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';

const report=JSON.parse(await readFile(new URL('verification-report.json',import.meta.url),'utf8'));
assert.equal(report.levels.length,9);
function replay(level,expected){
  const game=createGame(level);let index=0,peak=0;
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
  }
  assert.equal(game.status,'won');
  assert.equal(game.tick,expected.ticks);
  assert.equal(game.ballsLeft,0);
  assert.equal(game.garage.flat().length,0);
  assert.equal(game.road.length,0);
  assert.equal(game.events.filter(e=>e.type==='pickup').length,1600);
  assert.equal(game.events.some(e=>['clear','shuffle','magnet'].includes(e.type)),false);
  assert.equal(index,expected.dispatches.length);
  assert.equal(peak,expected.peak);
  return {tick:game.tick,peak};
}
function flood(level,order,roundRobin){
  const game=createGame(level);let peak=0,sent=0;
  while(game.status==='playing'&&game.tick<18000){
    if(roundRobin&&sent<6){
      const c=[0,1,2,0,1,2][sent++];
      if(game.garage[c]?.length&&game.road.length<6)assert.equal(dispatchCar(game,game.garage[c][0].id).ok,true);
    }else{
      for(const c of order)while(game.garage[c].length&&game.road.length<6)
        assert.equal(dispatchCar(game,game.garage[c][0].id).ok,true);
    }
    peak=Math.max(peak,game.road.length);advanceGame(game);
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
  const raw=await readFile(new URL(item.file,import.meta.url),'utf8');
  const level=importLevel(raw,item.id),v=validateLevel(level);
  assert.deepEqual(v.errors,[]);assert.deepEqual(v.warnings,[]);
  assert.deepEqual(v.counts.balls,v.counts.capacity);
  assert.equal(level.width,40);assert.equal(level.height,40);
  assert.equal(level.roadCapacity,6);assert.equal(level.balls.length,1600);
  assert.equal(level.balls.every(c=>COLOR_KEYS.includes(c)),true);
  assert.deepEqual([...new Set(level.balls)].sort(),[...COLOR_KEYS].sort());
  assert.equal(level.garage.flat().every(c=>c.capacity%10===0),true);
  assert.ok(level.garage.length>=1&&level.garage.length<=5);
  assert.equal(level.garage.every(c=>c.length<=12),true);
  assert.ok(Math.abs(adjacency(level.balls)-item.adjacentSameRatio)<1e-12);
  assert.deepEqual(importLevel(exportLevel(level),item.id),level);
  const exact=replay(level,item.route),human=replay(level,item.human);
  assert.equal(item.human.dispatches.length,level.garage.flat().length);
  for(const b of item.branches)assert.deepEqual(flood(level,b.order.map(c=>c-1),false),
    {status:b.status,ticks:b.ticks,ballsLeft:b.ballsLeft,peak:b.peak});
  for(const b of item.lateBranches)assert.deepEqual(flood(level,b.order.map(c=>c-1),true),
    {status:b.status,ticks:b.ticks,ballsLeft:b.ballsLeft,peak:b.peak});
  console.log(`${item.file}: won ${exact.tick}/${human.tick} ticks; peak ${human.peak}/6; failed branches ${item.branches.filter(b=>b.status==='failed').length}+${item.lateBranches.filter(b=>b.status==='failed').length}`);
}
