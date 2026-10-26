import { readFile } from 'node:fs/promises';
import { advanceGame, createGame, dispatchCar } from '../src/engine.js';
import { importLevel } from '../src/validation.js';
const report = JSON.parse(await readFile(new URL('verification-report.json', import.meta.url), 'utf8'));
for (const item of report.levels) {
  const level = importLevel(await readFile(new URL(item.file, import.meta.url), 'utf8'), item.id);
  const outcomes=[];
  for(const priority of [[0,1,2],[2,1,0],[1,2,0]]){
    const game=createGame(level),opening=[0,1,2,0,1,2];let sent=0;
    while(game.status==='playing'&&game.tick<18000){
      if(sent<6){const col=opening[sent];dispatchCar(game,game.garage[col][0].id);sent++;}
      else if(game.road.length<6){
        const col=priority.find(i=>game.garage[i].length);
        if(col!==undefined)dispatchCar(game,game.garage[col][0].id);
      }
      advanceGame(game);
    }
    outcomes.push({priority:priority.map(x=>x+1),status:game.status,tick:game.tick,ballsLeft:game.ballsLeft});
  }
  console.log(JSON.stringify({id:item.id,outcomes}));
}
