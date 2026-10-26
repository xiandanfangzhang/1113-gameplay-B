import { readFile } from 'node:fs/promises';
import { advanceGame, availableBottomColors, createGame, dispatchCar } from '../src/engine.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';

const colors=['R','B','Y','G','O','P'];
const pieces=[
  [2,1,1,1,1,1],[2,2,1,1,1,1],[2,2,2,1,1,1],
  [2,2,2,2,1,1],[2,2,2,2,2,1],[2,2,2,2,2,2],
  [3,2,2,2,2,2],[3,3,2,2,2,2],[3,3,3,2,2,2]
];
const extraUnits=[4,4,5,5,6,6,6,7,7];
const targetEarly=[0,0,2,2,2,2,3,3,3];
const targetLate=[0,0,0,1,1,2,2,3,3];
const titles=['首辆补车','双车接力','关键列头','跨列换位','保留通道','折返调度','多层挡车','双色底排','全局接驳'];
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6d2b79f5)>>>0;let v=s;v=Math.imul(v^v>>>15,v|1);v^=v+Math.imul(v^v>>>7,v|61);return((v^v>>>14)>>>0)/4294967296;};}
function shuffle(a,r){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function permuteColumns(balls,seed){const order=shuffle(Array.from({length:40},(_,i)=>i),rng(seed));return balls.map((_,i)=>balls[Math.floor(i/40)*40+order[i%40]]);}
function garageFor(balls,n,seed){
  const r=rng(seed),primary=[],extras=[];
  for(let i=0;i<6;i++){
    const color=colors[i],units=balls.filter(v=>v===color).length/10,count=pieces[n][i];
    primary.push({color,capacity:(units-(count-1)*extraUnits[n])*10});
    for(let j=1;j<count;j++)extras.push({color,capacity:extraUnits[n]*10});
  }
  shuffle(primary,r);shuffle(extras,r);
  const garage=[primary.slice(0,2),primary.slice(2,4),primary.slice(4,6)];
  for(const car of extras){
    const depths=garage.map(c=>c.length),min=Math.min(...depths);
    const choices=[0,1,2].filter(i=>depths[i]<=min+1);
    garage[choices[Math.floor(r()*choices.length)]].push(car);
  }
  garage.forEach((column,c)=>column.forEach((car,slot)=>{
    car.id=`matched-${String(n+1).padStart(2,'0')}-c${c+1}-s${slot+1}`;car.slot=slot;
  }));
  return garage;
}
function route(level,n){
  const game=createGame(level),dispatches=[];let peak=0,lastPickup=0,lastBalls=game.ballsLeft;
  const opening=[0,1,2,0,1,2];
  while(game.status==='playing'&&game.tick<18000){
    let col=null;
    if(dispatches.length<6)col=opening[dispatches.length];
    else if(game.road.length<6){
      const bottom=availableBottomColors(game),roadColors=new Set(game.road.map(v=>v.color));
      const options=game.garage.map((column,i)=>({i,car:column[0],next:column[1]})).filter(v=>v.car);
      const score=x=>(bottom.has(x.car.color)?100:0)+(!roadColors.has(x.car.color)?25:0)+
        (x.next&&bottom.has(x.next.color)&&!roadColors.has(x.next.color)?12:0)-x.car.capacity/200;
      options.sort((a,b)=>score(b)-score(a)||a.i-b.i);
      if(options.length&&(bottom.has(options[0].car.color)||game.tick-lastPickup>=108||game.road.length<3))col=options[0].i;
    }
    if(col!==null&&game.garage[col]?.length&&game.road.length<6){
      const car=game.garage[col][0];
      const step={tick:game.tick,id:car.id,color:car.color,column:col+1,capacity:car.capacity,
        roadBefore:game.road.length,ballsLeft:game.ballsLeft,bottomColors:[...availableBottomColors(game)]};
      if(!dispatchCar(game,car.id).ok)throw Error('dispatch failed');
      dispatches.push(step);peak=Math.max(peak,game.road.length);
    }
    advanceGame(game);
    if(game.ballsLeft!==lastBalls){lastBalls=game.ballsLeft;lastPickup=game.tick;}
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak,dispatches};
}
function spaced(level,source,gap){
  const game=createGame(level),dispatches=[];let index=0,last=-gap,peak=0;
  while(game.status==='playing'&&game.tick<18000){
    const next=source[index];
    if(next&&game.tick>=Math.max(next.tick,last+gap)&&game.road.length<6&&game.garage[next.column-1][0]?.id===next.id){
      const step={tick:game.tick,id:next.id,color:next.color,column:next.column,capacity:next.capacity,
        roadBefore:game.road.length,ballsLeft:game.ballsLeft,bottomColors:[...availableBottomColors(game)]};
      if(!dispatchCar(game,next.id).ok)throw Error('spaced dispatch failed');
      dispatches.push(step);index++;last=game.tick;peak=Math.max(peak,game.road.length);
    }
    advanceGame(game);
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak,dispatches};
}
function branch(level,order){
  const game=createGame(level);let peak=0;
  while(game.status==='playing'&&game.tick<18000){
    for(const col of order)while(game.garage[col].length&&game.road.length<6){
      if(!dispatchCar(game,game.garage[col][0].id).ok)throw Error('branch dispatch failed');
      peak=Math.max(peak,game.road.length);
    }
    advanceGame(game);
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak};
}
function exposure(level,source){
  const game=createGame(level),first={},initial=[...availableBottomColors(game)];
  for(const color of initial)first[color]=0;
  let changes=0,index=0,previous=initial.join('|');
  while(game.status==='playing'&&game.tick<=source.ticks){
    while(source.dispatches[index]?.tick===game.tick){dispatchCar(game,source.dispatches[index].id);index++;}
    advanceGame(game);
    const next=[...availableBottomColors(game)],key=next.join('|');
    for(const color of next)if(first[color]===undefined)first[color]=game.tick;
    if(key!==previous){changes++;previous=key;}
  }
  return {firstBottomTick:first,bottomSetChanges:changes};
}
function adjacentSameRatio(balls){
  let same=0,neighbors=0;
  for(let y=0;y<40;y++)for(let x=0;x<40;x++){
    const a=balls[y*40+x];
    if(x<39){neighbors++;if(a===balls[y*40+x+1])same++;}
    if(y<39){neighbors++;if(a===balls[(y+1)*40+x])same++;}
  }
  return same/neighbors;
}
const n=Number(process.argv[2])-1;
if(!Number.isInteger(n)||n<0||n>8)throw Error('level 1..9');
const source=importLevel(await readFile(new URL(`../level-pack-40x40-six-color/level-${String(n+1).padStart(2,'0')}.json`,import.meta.url),'utf8'),`matched-${String(n+1).padStart(2,'0')}`);
const ballSeed=94000+n*149;
const balls=permuteColumns(source.balls,ballSeed);
function candidate(seed){
  const level={id:`matched-40-${String(n+1).padStart(2,'0')}`,name:`第 ${n+1} 关 · ${titles[n]}`,width:40,height:40,
    balls,garage:garageFor(balls,n,seed),roadCapacity:6};
  const v=validateLevel(level);if(v.errors.length||v.warnings.length)throw Error(JSON.stringify(v));
  const exact=route(level,n);if(exact.status!=='won')return null;
  const human=spaced(level,exact.dispatches,30);if(human.status!=='won'||human.dispatches.length!==level.garage.flat().length)return null;
  const orders=[[0,1,2],[2,1,0],[1,2,0]];
  const branches=orders.map(order=>({columnPriority:order.map(i=>i+1),...branch(level,order)}));
  return {level,exact,human,branches};
}
if(process.argv[3]==='emit'){
  const seed=Number(process.argv[4]),x=candidate(seed);if(!x)throw Error('candidate did not win');
  const item={file:`level-${String(n+1).padStart(2,'0')}.json`,id:x.level.id,name:x.level.name,
    ballSeed,garageSeed:seed,counts:validateLevel(x.level).counts,garage:x.level.garage,
    initialBottom:[...new Set(balls.slice(-40))],adjacentSameRatio:adjacentSameRatio(balls),
    exposure:exposure(x.level,x.human),route:x.exact,human:x.human,branches:x.branches};
  console.log(JSON.stringify({json:exportLevel(x.level),item}));process.exit(0);
}
const limit=Number(process.argv[3]??500),desiredWinner=process.argv[4]??null;let best=null,matched=0,solved=0;
for(let i=1;i<=limit;i++){
  const seed=950000+n*10000+i,x=candidate(seed);if(!x)continue;solved++;
  if(desiredWinner&&!x.branches.some(b=>b.status==='won'&&b.columnPriority.join('')===desiredWinner))continue;
  const failures=x.branches.filter(b=>b.status==='failed').length;
  const delta=Math.abs(failures-targetEarly[n]);
  const peakDelta=0;
  const score=100-delta*30-peakDelta*15-Math.max(0,x.human.ticks-5000)/1000;
  if(!best||score>best.score)best={score,seed,failures,peak:x.human.peak,ticks:x.human.ticks,garage:x.level.garage.map(c=>c.map(v=>`${v.color}${v.capacity}`)),branches:x.branches.map(b=>`${b.status}:${b.ballsLeft}`)};
  if(delta===0&&peakDelta===0){matched++;if(matched>=3)break;}
}
console.log(JSON.stringify({n:n+1,target:targetEarly[n],solved,matched,best}));
