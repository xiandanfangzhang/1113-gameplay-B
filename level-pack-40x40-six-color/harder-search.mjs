import { readFile } from 'node:fs/promises';
import { advanceGame, availableBottomColors, createGame, dispatchCar } from '../src/engine.js';
import { exportLevel, importLevel, validateLevel } from '../src/validation.js';

const colors = ['R','B','Y','G','O','P'];
function rng(seed) { let s=seed>>>0; return () => { s=(s+0x6d2b79f5)>>>0; let v=s; v=Math.imul(v^v>>>15,v|1); v^=v+Math.imul(v^v>>>7,v|61); return ((v^v>>>14)>>>0)/4294967296; }; }
function shuffle(a,r) { for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; }
function permuteColumns(balls,seed){
  const order=shuffle(Array.from({length:40},(_,i)=>i),rng(seed));
  return balls.map((_,i)=>balls[Math.floor(i/40)*40+order[i%40]]);
}
function layout(source, seed, gates) {
  const r=rng(seed), cars=source.garage.flat().map(({id,color,capacity})=>({id,color,capacity}));
  const primaries=colors.map(c=>cars.filter(v=>v.color===c).sort((a,b)=>b.capacity-a.capacity)[0]);
  const extras=cars.filter(v=>!primaries.includes(v));
  const perm=shuffle([...primaries],r);
  const bottom=new Set(source.balls.slice(-40));
  const candidates=shuffle(perm.map((v,i)=>({v,i})).filter(({v})=>!bottom.has(v.color)),r);
  candidates.push(...shuffle(perm.map((v,i)=>({v,i})).filter(({v})=>bottom.has(v.color)),r));
  const targets=candidates.slice(0,gates);
  if(targets.length<gates)return null;
  const six=[...perm], hidden=[];
  for(const {v,i} of targets){
    const choices=extras.filter(e=>bottom.has(e.color)&&e.capacity<=80&&six.some(p=>p.color===e.color));
    if(!choices.length)return null;
    const key=choices[Math.floor(r()*choices.length)];
    extras.splice(extras.indexOf(key),1);
    six[i]=key; hidden.push({car:v,column:Math.floor(i/2)});
  }
  const garage=[six.slice(0,2),six.slice(2,4),six.slice(4,6)];
  for(const {car,column} of hidden)garage[column].push(car);
  for(const car of shuffle(extras,r)){
    const lens=garage.map(c=>c.length), min=Math.min(...lens);
    const choices=[0,1,2].filter(i=>lens[i]<=min+1);
    const c=choices[Math.floor(r()*choices.length)];garage[c].push(car);
  }
  for(const col of garage)col.forEach((car,slot)=>car.slot=slot);
  return {...source,garage};
}
function route(level, mode) {
  const game=createGame(level),dispatches=[];let peak=0,lastPickup=0,lastBalls=game.ballsLeft;
  while(game.status==='playing'&&game.tick<18000){
    const bottom=availableBottomColors(game),roadColors=new Set(game.road.map(v=>v.color));
    const heads=game.garage.map((column,c)=>({car:column[0],next:column[1],c})).filter(x=>x.car);
    const score=x=>{
      const matching=bottom.has(x.car.color),newColor=!roadColors.has(x.car.color);
      const unlock=x.next&&bottom.has(x.next.color)&&!roadColors.has(x.next.color);
      const depth=x.next&&x.next.color!==x.car.color;
      return (matching?100:0)+(newColor?32:0)+(unlock?36:0)+(depth?3:0)-x.car.capacity/100+(mode%3===0?x.c:-x.c)*0.1;
    };
    heads.sort((a,b)=>score(b)-score(a));
    const choice=heads[0];
    const target=[4,5,6,5,4,6,5,6][mode%8];
    if(choice&&game.road.length<6){
      const idle=game.tick-lastPickup;
      const should=game.road.length<target || (bottom.has(choice.car.color)&&!roadColors.has(choice.car.color)) ||
        (idle>=game.roadLength*(mode%2?2:1) && (game.road.length<5||bottom.has(choice.car.color)));
      if(should){
        if(!dispatchCar(game,choice.car.id).ok)throw Error('dispatch');
        dispatches.push({tick:game.tick,id:choice.car.id,color:choice.car.color,column:choice.c+1,capacity:choice.car.capacity,
          roadBefore:game.road.length-1,ballsLeft:game.ballsLeft,bottomColors:[...bottom]});
        peak=Math.max(peak,game.road.length);
      }
    }
    advanceGame(game);
    if(game.ballsLeft!==lastBalls){lastBalls=game.ballsLeft;lastPickup=game.tick;}
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak,dispatches};
}
function flood(level,order,roundRobin=false){
  const game=createGame(level);let peak=0,sent=0;
  while(game.status==='playing'&&game.tick<18000){
    if(roundRobin&&sent<6){
      const c=[0,1,2,0,1,2][sent++];
      if(game.garage[c]?.length&&game.road.length<6)dispatchCar(game,game.garage[c][0].id);
    }else{
      for(const c of order)while(game.garage[c].length&&game.road.length<6)dispatchCar(game,game.garage[c][0].id);
    }
    peak=Math.max(peak,game.road.length);advanceGame(game);
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak};
}
function spaced(level,source,gap){
  const game=createGame(level),dispatches=[];let index=0,last=-gap,peak=0;
  while(game.status==='playing'&&game.tick<18000){
    const next=source[index];
    if(next&&game.tick>=Math.max(next.tick,last+gap)&&game.road.length<6&&
      game.garage[next.column-1][0]?.id===next.id){
      const step={tick:game.tick,id:next.id,color:next.color,column:next.column,capacity:next.capacity,
        roadBefore:game.road.length,ballsLeft:game.ballsLeft,bottomColors:[...availableBottomColors(game)]};
      dispatchCar(game,next.id);dispatches.push(step);index++;last=game.tick;peak=Math.max(peak,game.road.length);
    }
    advanceGame(game);
  }
  return {status:game.status,ticks:game.tick,ballsLeft:game.ballsLeft,peak,dispatches};
}
const n=Number(process.argv[2])-1,limit=Number(process.argv[3]??300),gates=Number(process.argv[4]??1);
if(n<0||n>8)throw Error('level 1-9');
const source=importLevel(await readFile(new URL(`level-${String(n+1).padStart(2,'0')}.json`,import.meta.url),'utf8'),`six-40-${String(n+1).padStart(2,'0')}`);
if(process.argv[3]==='emit'){
  const seed=Number(process.argv[4]),gateCount=Number(process.argv[5]),mode=Number(process.argv[6]);
  const finalN=Number(process.argv[7]??n+1),transformSeed=Number(process.argv[8]??0);
  if(transformSeed)source.balls=permuteColumns(source.balls,transformSeed);
  const level=layout(source,seed,gateCount);
  level.id=`six-hard-40-${String(finalN).padStart(2,'0')}`;
  level.name=`第 ${finalN} 关 · ${['错色开局','双车钥匙','三列交锁','余量陷阱','跨列换位','多段接力','深层周转','双底色困局','六色总调度'][finalN-1]}`;
  level.garage.forEach((column,c)=>column.forEach((car,s)=>car.id=`hard-${String(finalN).padStart(2,'0')}-c${c+1}-s${s+1}`));
  const actual=route(level,mode),human=spaced(level,actual.dispatches,30);
  const orders=[[0,1,2],[2,1,0],[1,2,0]];
  const branches=orders.map(order=>({order:order.map(v=>v+1),...flood(level,order)}));
  const lateBranches=orders.map(order=>({order:order.map(v=>v+1),...flood(level,order,true)}));
  console.log(JSON.stringify({json:exportLevel(level),item:{file:`level-${String(finalN).padStart(2,'0')}.json`,id:level.id,name:level.name,
    sourceLevel:n+1,gateCount,seed,mode,transformSeed,counts:validateLevel(level).counts,garage:level.garage,
    initialBottom:[...new Set(level.balls.slice(-40))],route:actual,human,branches,lateBranches}}));
  process.exit(0);
}
if(process.argv[3]==='scan'){
  const count=Number(process.argv[4]),gateCount=Number(process.argv[5]),transformSeed=Number(process.argv[6]??0);let best=null,solved=0;
  if(transformSeed)source.balls=permuteColumns(source.balls,transformSeed);
  for(let i=1;i<=count;i++){
    const seed=900000+n*100000+i,level=layout(source,seed,gateCount);if(!level)continue;
    let found=null,mode=-1;
    for(let m=0;m<8;m++){const x=route(level,m);if(x.status==='won'){found=x;mode=m;break;}}
    if(!found)continue;solved++;
    const orders=[[0,1,2],[2,1,0],[1,2,0]],early=orders.map(o=>flood(level,o)),late=orders.map(o=>flood(level,o,true));
    const e=early.filter(x=>x.status==='failed').length,l=late.filter(x=>x.status==='failed').length;
    const steps=found.dispatches.map(x=>x.tick),maxGap=Math.max(...steps.slice(1).map((tick,j)=>tick-steps[j]));
    const rank=e*100+l*20-Math.floor(maxGap/30)-Math.floor(found.ticks/300);
    if(!best||rank>best.rank)best={rank,seed,mode,e,l,ticks:found.ticks,human:spaced(level,found.dispatches,30).status,
      maxGap,early:early.map(x=>x.ballsLeft),late:late.map(x=>x.ballsLeft),garage:level.garage.map(c=>c.map(v=>`${v.color}${v.capacity}`))};
  }
  console.log(JSON.stringify({n:n+1,gateCount,count,solved,best}));process.exit(0);
}
let best=null,solutions=0;
for(let i=1;i<=limit;i++){
  const seed=900000+n*100000+i,level=layout(source,seed,gates);if(!level)continue;
  const valid=validateLevel(level);if(valid.errors.length||valid.warnings.length)throw Error(JSON.stringify(valid));
  for(let mode=0;mode<8;mode++){
    const found=route(level,mode);
    if(found.status!=='won')continue;
    solutions++;
    const firstSix=level.garage.flatMap(c=>c.slice(0,2)).map(v=>v.color);
    const rank=1000-firstSix.filter((v,i)=>firstSix.indexOf(v)===i).length*50-found.ticks/1000;
    if(!best||rank>best.rank)best={rank,seed,mode,level,route:found,firstSix};
    break;
  }
  if(solutions>=3)break;
}
console.log(JSON.stringify({n:n+1,gates,solutions,best}));
