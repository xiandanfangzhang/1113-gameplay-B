import { advanceGame, availableBottomColors, createGame, dispatchCar } from '../src/engine.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';

const colors = ['R', 'B', 'Y', 'G', 'O', 'P'];
const quotas = [27, 27, 27, 27, 26, 26];
const parts = [
  [2,2,1,1,1,1], [2,2,2,1,1,1], [2,2,2,2,1,1],
  [2,2,2,2,2,1], [2,2,2,2,2,2], [3,2,2,2,2,2],
  [3,3,2,2,2,2], [3,3,3,2,2,2], [3,3,3,3,2,2]
];
const hidden = [
  ['G','P'], ['Y','P'], ['O','P'], ['P'], ['G','P'],
  ['O'], ['Y','P'], ['G','O'], []
];
const titles = ['四色入口','橙车解锁','紫车深藏','错列接力','双色伏笔','跨段周转','三链并进','逆向释位','六色总调度'];
function random(seed) { let s=seed>>>0; return () => { s=(s+0x6d2b79f5)>>>0; let v=s; v=Math.imul(v^v>>>15,v|1); v^=v+Math.imul(v^v>>>7,v|61); return ((v^v>>>14)>>>0)/4294967296; }; }
function shuffle(a,r) { for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; }
function ballLayout(n,seed) {
  const r=random(seed), groups=shuffle(colors.flatMap((c,i)=>Array(quotas[i]).fill(c)),r);
  // Keep selected colors out of the lowest two two-row bands, while all six
  // colors remain visible in the grid and later exposure is still irregular.
  for(let band=18;band<20;band++)for(let j=0;j<8;j++){
    const at=band*8+j;
    if(!hidden[n].includes(groups[at]))continue;
    const options=[];
    for(let k=0;k<18*8;k++)if(!hidden[n].includes(groups[k]))options.push(k);
    const other=options[Math.floor(r()*options.length)];
    [groups[at],groups[other]]=[groups[other],groups[at]];
  }
  const balls=Array(1600);
  for(let band=0;band<20;band++)for(let block=0;block<8;block++){
    const c=groups[band*8+block];
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<5;dx++)balls[(band*2+dy)*40+block*5+dx]=c;
  }
  // Neighbor swaps soften the regular 2×5 block silhouette without changing
  // color counts or the bottom-band exposure plan.
  for(let band=0;band<20;band++)for(let k=0;k<30;k++){
    const y=band*2+Math.floor(r()*2),x=Math.floor(r()*39),a=y*40+x,b=a+1;
    [balls[a],balls[b]]=[balls[b],balls[a]];
  }
  return balls;
}
function garageFor(balls,n,seed) {
  const r=random(seed), primary=[],extras=[];
  const extraUnits=[3,4,5,6,7,6,7,7,8][n];
  for(let i=0;i<6;i++){
    const color=colors[i],units=balls.filter(c=>c===color).length/10,pieces=parts[n][i];
    primary.push({color,capacity:(units-(pieces-1)*extraUnits)*10});
    for(let j=1;j<pieces;j++)extras.push({color,capacity:extraUnits*10});
  }
  const perm=shuffle([...colors],r);
  const garage=[[],[],[]];
  for(let i=0;i<6;i++){
    const col=Math.floor(i/2);
    garage[col].push(primary[colors.indexOf(perm[i])]);
  }
  for(let col=0;col<3;col++){
    const pair=new Set([perm[col*2],perm[col*2+1]]);
    const tail=shuffle(extras.filter(car=>pair.has(car.color)),r);
    garage[col].push(...tail);
  }
  let index=0;
  for(const column of garage)for(let slot=0;slot<column.length;slot++){
    column[slot]={id:`six-${n+1}-${seed}-${++index}`,...column[slot],slot};
  }
  return garage;
}
function scriptedRoute(level) {
  const game=createGame(level),dispatches=[];let peak=0,lastPickup=0,lastBalls=game.ballsLeft;
  const opening=[0,1,2,0,1,2];
  while(game.status==='playing'&&game.tick<18000){
    let col=null;
    if(dispatches.length<6)col=opening[dispatches.length];
    else if(game.road.length<6){
      const bottom=availableBottomColors(game);
      const choices=game.garage.map((column,i)=>({i,car:column[0]})).filter(x=>x.car);
      choices.sort((a,b)=>{
        const score=x=>(bottom.has(x.car.color)?100:0)+
          (!game.road.some(v=>v.color===x.car.color)?30:0)+
          ((game.garage[x.i][1]&&bottom.has(game.garage[x.i][1].color))?15:0);
        return score(b)-score(a)||a.i-b.i;
      });
      if(choices.length&&(bottom.has(choices[0].car.color)||game.tick-lastPickup>=108))col=choices[0].i;
    }
    if(col!==null&&game.garage[col]?.length&&game.road.length<6){
      const car=game.garage[col][0];
      if(!dispatchCar(game,car.id).ok)throw Error('scripted dispatch');
      dispatches.push({tick:game.tick,id:car.id,color:car.color,column:col+1,capacity:car.capacity});
      peak=Math.max(peak,game.road.length);
    }
    advanceGame(game);
    if(game.ballsLeft!==lastBalls){lastBalls=game.ballsLeft;lastPickup=game.tick;}
  }
  return {status:game.status,ticks:game.tick,peak,pickups:game.events.filter(e=>e.type==='pickup').length,dispatches};
}
function flood(level,order) {
  const game=createGame(level);let peak=0;
  while(game.status==='playing'&&game.tick<18000){
    for(const col of order)while(game.garage[col].length&&game.road.length<6){
      if(!dispatchCar(game,game.garage[col][0].id).ok)throw Error('flood dispatch');
      peak=Math.max(peak,game.road.length);
    }
    advanceGame(game);
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak};
}
function lateFlood(level,order) {
  const game=createGame(level),opening=[0,1,2,0,1,2];let sent=0,peak=0;
  while(game.status==='playing'&&game.tick<18000){
    if(sent<6){
      const col=opening[sent++];
      if(!dispatchCar(game,game.garage[col][0].id).ok)throw Error('opening dispatch');
      peak=Math.max(peak,game.road.length);
    }else if(game.road.length<6){
      const col=order.find(i=>game.garage[i].length);
      if(col!==undefined){
        if(!dispatchCar(game,game.garage[col][0].id).ok)throw Error('late dispatch');
        peak=Math.max(peak,game.road.length);
      }
    }
    advanceGame(game);
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak};
}
function spacedRoute(level,source,gap) {
  const game=createGame(level),dispatches=[];let i=0,last=-gap,peak=0;
  while(game.status==='playing'&&game.tick<18000){
    const next=source[i];
    if(next&&game.tick>=Math.max(next.tick,last+gap)&&
       game.garage[next.column-1][0]?.id===next.id&&game.road.length<6){
      const step={tick:game.tick,id:next.id,color:next.color,column:next.column,
        capacity:next.capacity,roadBefore:game.road.length,ballsLeft:game.ballsLeft,
        bottomColors:[...availableBottomColors(game)]};
      if(!dispatchCar(game,next.id).ok)throw Error('spaced dispatch');
      dispatches.push(step);last=game.tick;i++;peak=Math.max(peak,game.road.length);
    }
    advanceGame(game);
  }
  return {status:game.status,ticks:game.tick,peak,pickups:game.events.filter(e=>e.type==='pickup').length,dispatches};
}
const n=Number(process.argv[2])-1;
if(!Number.isInteger(n)||n<0||n>8)throw Error('level 1..9');
const ballSeed=601000+n*149;
const balls=ballLayout(n,ballSeed);
if(process.argv[3]==='emit'){
  const seed=[620001,621001,622001,623001,624005,625001,626003,627008,628001][n];
  const level={id:`six-40-${String(n+1).padStart(2,'0')}`,name:`第 ${n+1} 关 · ${titles[n]}`,width:40,height:40,balls,garage:garageFor(balls,n,seed),roadCapacity:6};
  const validation=validateLevel(level);
  if(validation.errors.length||validation.warnings.length)throw Error(JSON.stringify(validation));
  const json=JSON.stringify(JSON.parse(exportLevel(level)));
  if(JSON.stringify(importLevel(json,level.id))!==JSON.stringify(level))throw Error('round trip');
  const route=scriptedRoute(level);
  if(route.status!=='won'||route.pickups!==1600)throw Error('exact replay failed');
  const spaced=[30,40,50,20,10].map(gap=>({gap,...spacedRoute(level,route.dispatches,gap)}));
  const human=spaced.find(x=>x.status==='won'&&x.dispatches.length===level.garage.flat().length);
  if(!human)throw Error('no spaced human route');
  const branches=[[0,1,2],[2,1,0],[1,2,0]].map(order=>({columnPriority:order.map(x=>x+1),...flood(level,order)}));
  const lateBranches=[[0,1,2],[2,1,0],[1,2,0]].map(order=>({columnPriority:order.map(x=>x+1),...lateFlood(level,order)}));
  let neighbors=0,same=0;
  for(let y=0;y<40;y++)for(let x=0;x<40;x++){
    const a=balls[y*40+x];
    if(x<39){neighbors++;if(a===balls[y*40+x+1])same++;}
    if(y<39){neighbors++;if(a===balls[(y+1)*40+x])same++;}
  }
  const item={file:`level-${String(n+1).padStart(2,'0')}.json`,id:level.id,name:level.name,
    ballSeed,garageSeed:seed,counts:validation.counts,garage:level.garage,
    initialBottom:[...new Set(balls.slice(1560))],adjacentSameRatio:same/neighbors,
    route,human,branches,lateBranches};
  console.log(JSON.stringify({json,item}));
  process.exit(0);
}
const target=[1,2,3,3,3,3,3,3,3][n];
const lateTarget=[0,0,0,2,2,3,3,3,3][n];
let best=null;
for(let candidate=1;candidate<=120;candidate++){
  const garageSeed=620000+n*1000+candidate;
  const level={id:`six-40-${String(n+1).padStart(2,'0')}`,name:`第 ${n+1} 关 · ${titles[n]}`,width:40,height:40,balls,garage:garageFor(balls,n,garageSeed),roadCapacity:6};
  const valid=validateLevel(level);
  if(valid.errors.length||valid.warnings.length)throw Error(JSON.stringify(valid));
  const route=scriptedRoute(level);
  if(route.status!=='won')continue;
  const branches=[[0,1,2],[2,1,0],[1,2,0]].map(order=>({order:order.map(x=>x+1),...flood(level,order)}));
  const failures=branches.filter(b=>b.status==='failed').length;
  const lateBranches=[[0,1,2],[2,1,0],[1,2,0]].map(order=>({order:order.map(x=>x+1),...lateFlood(level,order)}));
  const lateFailures=lateBranches.filter(b=>b.status==='failed').length;
  const rank=failures*100+lateFailures*10-route.ticks/1000;
  if(!best||rank>best.rank)best={rank,ballSeed,garageSeed,counts:valid.counts.balls,garage:level.garage.map(c=>c.map(v=>`${v.color}${v.capacity}`)),route,branches,lateBranches};
  if(failures>=target&&lateFailures>=lateTarget&&
     (n!==7||spacedRoute(level,route.dispatches,30).status==='won'))break;
}
console.log(JSON.stringify({n:n+1,target,found:best}));
