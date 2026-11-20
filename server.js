'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/health',(req,res)=>res.json({ok:true}));

// The line equation is elevation = m*time + b. Real and mathematical seconds match.
const RACES = [
 {seconds:10,scene:'sunrise',lines:[[2,34],[5,0],[3,17]]},
 {seconds:12,scene:'sunset',lines:[[2,50],[5,11],[3,31],[4,15]]},
 {seconds:15,scene:'night',lines:[[2,59],[6,0],[4,28],[3,46],[5,9]]}
];
// Version 8: one balanced set of equations per classroom, with varied winners.
// Race lengths and animation timing are unchanged.
function randomShuffle(a){
 const out=[...a];
 for(let i=out.length-1;i>0;i--){const j=crypto.randomInt(i+1);[out[i],out[j]]=[out[j],out[i]];}
 return out;
}
function makeRaces(){
 const slopes=[[2,3,5],[2,3,4,5],[2,3,4,5,6]];
 const offsets=[[-4,-1,3],[-5,-2,1,4],[-5,-3,0,2,5]];
 const baseHeights=[55,78,97];
 let previousWinner=-1;
 return RACES.map((template,round)=>{
   const ms=randomShuffle(slopes[round]);
   let vals,leader;
   // Rotate winners, and keep final elevations close enough for dramatic overtakes.
   for(let tries=0;tries<30;tries++){
     vals=randomShuffle(offsets[round]);
     leader=vals.indexOf(Math.max(...vals));
     if(leader!==previousWinner)break;
   }
   previousWinner=leader;
   const center=baseHeights[round]+crypto.randomInt(0,4);
   const lines=ms.map((m,i)=>[m,center+vals[i]-m*template.seconds]);
   return {...template,lines};
 });
}
const FINAL_INDEX=RACES.length;
const KING_INDEX=FINAL_INDEX+1;
const QUEEN_BUDGET=10;
const SUNRISE_MIN=8, SUNRISE_MAX=22;
// The lake is a landing zone at the FINISH LINE, not an all-along-the-path band.
// Free 3x turtle reaches 60 ft, safely inside the lake.
const PLATEAU={seconds:20,scene:'day',low:60,high:120};
const LAKE_TARGETS=[70,80,90,100,110];
const BETTING_SECONDS=120;
// At 0 coins, give a one-coin rescue grant at the start of the next betting round.
function maxBet(tokens){return tokens<=0?0:Math.max(1,Math.floor(tokens/2));}
function makeTraining(){
 const rand=(lo,hi)=>crypto.randomInt(lo,hi+1);
 const plotM=[-2,-1,1,2][rand(0,3)],plotB=rand(-1,1),plotXs=[-2,0,2];
 const tableM=[-2,-1,1,2][rand(0,3)],tableB=rand(-1,1),tableXs=[-2,0,2];
 return [
  {type:'plot',rows:plotXs.map(x=>[x,plotM*x+plotB])},
  {type:'table',xs:tableXs,route:{m:tableM,b:tableB}}
 ];
}
function makeLakeTarget(){return LAKE_TARGETS[crypto.randomInt(LAKE_TARGETS.length)];}

const NAMES=['Coral','Chartreuse','Zaffre','Wisteria','Nacarat'];
const COLORS=['#ff6b78','#badb36','#386ee8','#ac8cdb','#f58b4a'];

const rooms=new Map();
const clean=s=>String(s??'').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24);
const token=()=>crypto.randomBytes(16).toString('hex');
const newCode=()=>{let c;do{c=String(crypto.randomInt(100000,1000000));}while(rooms.has(c));return c;};
function winners(r){const ys=r.lines.map(([m,b])=>m*r.seconds+b),top=Math.max(...ys);return ys.flatMap((y,i)=>y===top?[i]:[]);}
function heatGroups(room){return [[...room.players.keys()]];} // One simultaneous classroom race, up to 40 students.
function heatMembers(room){return (room.heats[0]||[]).map(id=>({id,p:room.players.get(id)})).filter(({p})=>p);}
function finishStatus(build,room){const height=build.m*PLATEAU.seconds+build.b;
 if(height>PLATEAU.high)return {status:'crash',height,time:null};
 if(height<PLATEAU.low)return {status:'short',height,time:null};
 return {status:'safe',height,time:null,distance:Math.abs(height-room.lakeTarget)};
}
function determineChampions(room){
 const contenders=[...room.players.entries()].map(([id,p])=>({id,p,result:finishStatus(p.build||{m:3,b:0,cost:0},room)}))
   .filter(x=>x.result.status==='safe')
   .sort((a,b)=>a.result.distance-b.result.distance||a.p.queenSubmitOrder-b.p.queenSubmitOrder||a.p.name.localeCompare(b.p.name));
 room.swimmers=contenders.map(x=>x.id);
 if(!contenders.length){room.champions=[];return;}
 const best=contenders[0];
 // Closest lake landing wins; first equation submission breaks an exact-distance tie.
 room.champions=[best.id];
}
function queenRankings(room){
 const arr=[...room.players.entries()].map(([id,p])=>({id,p,r:finishStatus(p.build||{m:3,b:0,cost:0},room)}));
 // Safe landings outrank misses; tied distances share Queen placement bonuses.
 arr.sort((a,b)=>(a.r.status==='safe'?0:1)-(b.r.status==='safe'?0:1)||Math.abs(a.r.height-room.lakeTarget)-Math.abs(b.r.height-room.lakeTarget)||a.p.name.localeCompare(b.p.name));
 let lastScore=null,rank=0;
 arr.forEach((entry,i)=>{
   const score=(entry.r.status==='safe'?'S':'M')+':'+Math.abs(entry.r.height-room.lakeTarget);
   if(score!==lastScore)rank=i+1;
   lastScore=score;
   entry.p.queenRank=rank;
   entry.p.queenBonus=Math.max(1,arr.length-rank+1);
 });
}
function activeRace(room){if(room.index<FINAL_INDEX)return room.races[room.index];const heat=heatMembers(room);
 if(room.index===FINAL_INDEX)return {...PLATEAU,lines:heat.map(({p})=>[p.build?.m??3,p.build?.b??0])};
 return {seconds:room.phase==='king-racing'?SUNRISE_MAX:(room.sunriseSeconds||SUNRISE_MAX),scene:'night',lines:heat.map(({p})=>[p.kingBuild?.m??3,p.kingBuild?.b??0])};
}
function publicState(room,role={}){
 const players=[...room.players.values()],me=room.players.get(role.playerId),race=activeRace(room),final=room.index===FINAL_INDEX,king=room.index===KING_INDEX;
 const heat=(final||king)?heatMembers(room):[];
 const counts=room.index<FINAL_INDEX?race.lines.map((_,i)=>players.filter(p=>p.bet?.round===room.index&&p.bet.pick===i).length):[];
 const betCount=counts.reduce((a,b)=>a+b,0);
 const custom=heat.map(({id,p},i)=>({id,bib:i+1,name:p.name,color:COLORS[i%5],build:king?(p.kingBuild||{m:3,b:0,cost:0}):(p.build||{m:3,b:0,cost:0}),champion:room.champions.includes(id),queenRank:p.queenRank,queenBonus:p.queenBonus,kingHeight:p.kingHeight,...(king?{}:finishStatus(p.build||{m:3,b:0},room))}));
 const leaderboard=players.map((p,i)=>({name:p.name,tokens:p.tokens,wins:p.wins,build:p.build||null,final:p.final||null,champion:room.champions.includes([...room.players.keys()][i]),queenRank:p.queenRank,queenBonus:p.queenBonus,kingHeight:p.kingHeight,kingBuild:p.kingBuild||null})).sort((a,b)=>{
  if(king)return (b.kingHeight??-Infinity)-(a.kingHeight??-Infinity)||a.name.localeCompare(b.name);
  if(final)return (a.queenRank??Infinity)-(b.queenRank??Infinity)||a.name.localeCompare(b.name);
  return b.tokens-a.tokens||b.wins-a.wins||a.name.localeCompare(b.name);
 });
 return {code:room.code,phase:room.phase,round:room.index,total:KING_INDEX+1,race,final,king,plateau:final?PLATEAU:null,
 names:(final||king)?custom.map(t=>t.name):NAMES.slice(0,race.lines.length),colors:(final||king)?custom.map(t=>t.color):COLORS.slice(0,race.lines.length),
 joined:players.length,betCount,swimmerCount:room.swimmers.length,counts:room.phase==='betting'?null:counts,
 trainingDone:players.filter(p=>p.training?.done).length,
 builtCount:players.filter(p=>king?p.kingBuild:p.build).length,heatsTotal:room.heats.length,heatIndex:room.heatIndex,
 heatTurtles:custom,queenBudget:QUEEN_BUDGET,lakeTarget:room.lakeTarget,trainingQuestions:room.trainingQuestions,betEndsAt:room.betEndsAt,betPaused:room.betPaused,betRemainingMs:room.betRemainingMs,startAt:room.startAt,endAt:king&&room.phase==='king-racing'?null:room.endAt,
 sunriseSeconds:king&&room.phase==='king-finished'?room.sunriseSeconds:null,
 winners:!final&&room.phase==='results'?winners(race):null,
 myName:me?.name||null,myTokens:me?.tokens??null,myBet:me?.bet?.round===room.index?me.bet:null,myTraining:me?.training||null,
 myBuild:king?(me?.kingBuild||null):(me?.build||null),myFinal:me?.final||null,
 myQueenRank:me?.queenRank??null,myQueenBonus:me?.queenBonus??null,myKingHeight:me?.kingHeight??null,myChampion:!!(role.playerId&&room.champions.includes(role.playerId)),champions:room.champions.map(id=>room.players.get(id)?.name).filter(Boolean),
 leaderboard:['results','final-results','queen-finished','king-finished'].includes(room.phase)?leaderboard:null,isTeacher:!!role.teacher};
}
function publish(room){for(const [id,role] of room.connections){const s=io.sockets.sockets.get(id);if(s)s.emit('state',publicState(room,role));}}
function err(cb,msg){if(typeof cb==='function')cb({ok:false,error:msg});}
function getRoom(socket){const r=rooms.get(socket.data.code);return r?.connections.has(socket.id)?r:null;}
function attach(socket,room,role){socket.data.code=room.code;room.connections.set(socket.id,role);socket.join(room.code);}
function cancelBetTimer(room){clearTimeout(room.betTimer);room.betTimer=null;room.betEndsAt=null;room.betRemainingMs=null;room.betPaused=false;}
function beginBetting(room){
 cancelBetTimer(room);
 room.phase='betting';
 // Grant one coin only once at the start of a new betting round.
 for(const p of room.players.values())if(p.tokens===0)p.tokens=1;
 room.betRemainingMs=BETTING_SECONDS*1000;
 room.betEndsAt=Date.now()+room.betRemainingMs;
 scheduleBetTimer(room);
}
function scheduleBetTimer(room){
 clearTimeout(room.betTimer);
 if(room.phase!=='betting'||room.betPaused)return;
 room.betTimer=setTimeout(()=>{
  if(room.phase==='betting'&&!room.betPaused){startRace(room);publish(room);}
 },Math.max(0,room.betEndsAt-Date.now()));
}
function clearRace(room){clearTimeout(room.timer);room.timer=null;room.startAt=null;room.endAt=null;}
function startRace(room){
 if(room.phase==='betting')cancelBetTimer(room);
 room.phase=room.index===KING_INDEX?'king-racing':room.index===FINAL_INDEX?'final-racing':'racing';room.startAt=Date.now()+1500;
 if(room.index===KING_INDEX)room.sunriseSeconds=crypto.randomInt(SUNRISE_MIN,SUNRISE_MAX+1);
 room.endAt=room.startAt+(room.index===KING_INDEX?room.sunriseSeconds:activeRace(room).seconds)*1000;
 room.timer=setTimeout(()=>{
  if(!['racing','final-racing','king-racing'].includes(room.phase))return;
  if(room.index<FINAL_INDEX){const winning=winners(room.races[room.index]);for(const p of room.players.values()){
    if(p.bet?.round!==room.index)continue;
    const won=winning.includes(p.bet.pick);p.tokens+=won?p.bet.amount:-p.bet.amount;if(won)p.wins++;
   }room.phase='results';
  }else if(room.index===FINAL_INDEX){for(const {p} of heatMembers(room))p.final=finishStatus(p.build||{m:3,b:0},room);determineChampions(room);queenRankings(room);room.phase='queen-finished';}
  else{for(const {p} of heatMembers(room))p.kingHeight=p.kingBuild.m*room.sunriseSeconds+p.kingBuild.b;room.phase='king-finished';}
  publish(room);
 },Math.max(0,room.endAt-Date.now()));
}
io.on('connection',socket=>{
 socket.on('create',(_,cb)=>{const code=newCode(),secret=token(),room={code,secret,races:makeRaces(),trainingQuestions:makeTraining(),lakeTarget:makeLakeTarget(),queenSubmissionSeq:0,betTimer:null,betEndsAt:null,betRemainingMs:null,betPaused:false,index:0,phase:'training',players:new Map(),connections:new Map(),heats:[],heatIndex:0,champions:[],swimmers:[],sunriseSeconds:null,timer:null,startAt:null,endAt:null};rooms.set(code,room);attach(socket,room,{teacher:true});cb?.({ok:true,code,secret});publish(room);});
 socket.on('host:rejoin',({code,secret}={},cb)=>{const r=rooms.get(String(code||''));if(!r||r.secret!==secret)return err(cb,'Teacher session unavailable. Create a new game.');attach(socket,r,{teacher:true});cb?.({ok:true});publish(r);});
 socket.on('join',({code,name,id}={},cb)=>{const room=rooms.get(String(code||'').trim());if(!room)return err(cb,'No game with that PIN.');if(room.phase==='king-finished')return err(cb,'This game has ended.');name=clean(name);if(!name)return err(cb,'Enter a name.');let playerId=(typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)&&room.players.has(id))?id:null;if(!playerId){if(room.index>0||!['training','betting'].includes(room.phase))return err(cb,'This game has already started.');if(room.players.size>=40)return err(cb,'This classroom is full.');if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return err(cb,'That name is taken; add an initial.');playerId=token();room.players.set(playerId,{name,tokens:2,wins:0,bet:null,training:{q:0,correct:0,attempts:0,done:false},build:null,final:null,queenRank:null,queenBonus:null,kingBuild:null,kingHeight:null,queenSubmitOrder:Number.MAX_SAFE_INTEGER});}attach(socket,room,{teacher:false,playerId});cb?.({ok:true,id:playerId});publish(room);});
 socket.on('training:answer',({q,answer}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='training')return err(cb,'Training is closed.');const p=room.players.get(role.playerId),t=p.training;if(t.done||q!==t.q||!room.trainingQuestions[q])return err(cb,'That question is no longer active.');const question=room.trainingQuestions[q],expected=question.type==='plot'?question.rows:question.xs.map(x=>question.route.m*x+question.route.b);let normalized=answer;if(question.type==='plot'&&Array.isArray(answer))normalized=answer.map(v=>[Number(v?.[0]),Number(v?.[1])]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(question.type==='table'&&Array.isArray(answer))normalized=answer.map(Number);const correct=JSON.stringify(normalized)===JSON.stringify(expected);t.attempts++;if(correct){p.tokens++;t.correct++;t.q++;t.attempts=0;}else if(t.attempts>=2){t.q++;t.attempts=0;}if(t.q>=room.trainingQuestions.length)t.done=true;cb?.({ok:true,correct,done:t.done,retry:!correct&&!t.done&&t.attempts===1});publish(room);});
 socket.on('bet',({pick,amount}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='betting'||room.index>=FINAL_INDEX||(!room.betPaused&&Date.now()>=room.betEndsAt))return err(cb,'Betting is closed.');const p=room.players.get(role.playerId);if(p.bet?.round===room.index)return err(cb,'Your bet is locked.');if(!Number.isInteger(pick)||pick<0||pick>=room.races[room.index].lines.length)return err(cb,'Choose a turtle.');if(!Number.isInteger(amount)||amount<1||amount>maxBet(p.tokens))return err(cb,'Bet exceeds your balance or limit.');p.bet={round:room.index,pick,amount};cb?.({ok:true});publish(room);});
 socket.on('build',({m,b}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='workshop')return err(cb,'Workshop is closed.');const p=room.players.get(role.playerId);if(p.build)return err(cb,'Turtle is already built.');if(!Number.isInteger(m)||m<0||m>15||!Number.isInteger(b)||b<0||b>150||b%10!==0)return err(cb,'Use whole-number slope and 10-foot head starts.');
 const cost=m+b/10;
 if(m<1)return err(cb,'Choose a slope of at least 1.');
 if(cost>QUEEN_BUDGET)return err(cb,'That turtle costs more than the shared Queen allowance.');
 // Queen builds use a separate allowance; betting coins remain available for King.
 p.build={m,b,cost};p.queenSubmitOrder=++room.queenSubmissionSeq;cb?.({ok:true});publish(room);});
 socket.on('king:build',({m,b}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='king-workshop')return err(cb,'Sunrise workshop is closed.');const p=room.players.get(role.playerId);if(p.kingBuild)return err(cb,'Sunrise turtle already built.');if(!Number.isInteger(m)||m<1||m>60||!Number.isInteger(b)||b<0||b>600||b%10!==0)return err(cb,'Choose whole-number slope and 10-foot upgrades.');const cost=m+b/10;const budget=p.tokens+(p.queenBonus||0);if(cost>budget)return err(cb,'Not enough coins for that turtle.');p.kingBuild={m,b,cost};cb?.({ok:true});publish(room);});
 socket.on('host:action',({action}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||!role.teacher)return err(cb,'Teacher access required.');
  if(action==='start'&&room.phase==='training')beginBetting(room);
  else if(action==='start'&&room.phase==='betting')startRace(room);
  else if(action==='pause'&&room.phase==='betting'&&!room.betPaused){
    room.betRemainingMs=Math.max(0,room.betEndsAt-Date.now());room.betEndsAt=null;room.betPaused=true;clearTimeout(room.betTimer);room.betTimer=null;
  }else if(action==='resume'&&room.phase==='betting'&&room.betPaused){
    room.betPaused=false;room.betEndsAt=Date.now()+room.betRemainingMs;scheduleBetTimer(room);
  }
  else if(action==='next'&&room.phase==='results'){
    room.index++;clearRace(room);if(room.index===FINAL_INDEX){room.phase='workshop';room.heats=[];room.heatIndex=0;room.champions=[];room.swimmers=[];}else beginBetting(room);
  }else if(action==='start'&&room.phase==='workshop'){
    for(const p of room.players.values())if(!p.build)p.build={m:3,b:0,cost:0};
    room.heats=heatGroups(room);room.heatIndex=0;startRace(room);
  }else if(action==='next'&&room.phase==='queen-finished'){
    clearRace(room);room.index=KING_INDEX;room.phase='king-workshop';room.sunriseSeconds=null;
  }else if(action==='start'&&room.phase==='king-workshop'){
    for(const p of room.players.values())if(!p.kingBuild)p.kingBuild={m:3,b:0,cost:0};
    startRace(room);
  }else if(action==='reset'&&['training','betting','results','workshop','queen-finished','king-workshop','king-finished'].includes(room.phase)){
    clearRace(room);cancelBetTimer(room);room.index=0;room.races=makeRaces();room.trainingQuestions=makeTraining();room.lakeTarget=makeLakeTarget();room.queenSubmissionSeq=0;room.phase='training';room.heats=[];room.heatIndex=0;room.champions=[];room.swimmers=[];room.sunriseSeconds=null;for(const p of room.players.values()){p.tokens=2;p.wins=0;p.bet=null;p.training={q:0,correct:0,attempts:0,done:false};p.build=null;p.final=null;p.queenRank=null;p.queenBonus=null;p.kingBuild=null;p.kingHeight=null;p.queenSubmitOrder=Number.MAX_SAFE_INTEGER;}
  }else return err(cb,'That action is not available right now.');
  cb?.({ok:true});publish(room);
 });
 socket.on('disconnect',()=>{const r=getRoom(socket);if(r){r.connections.delete(socket.id);publish(r);}});
});
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log('Turtle Mountain Climb 10 on '+port));
