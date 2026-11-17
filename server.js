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
const FINAL_INDEX=RACES.length;
const KING_INDEX=FINAL_INDEX+1;
const QUEEN_BUDGET=10;
const SUNRISE_MIN=8, SUNRISE_MAX=22;
// The lake is a landing zone at the FINISH LINE, not an all-along-the-path band.
// Free 3x turtle reaches 60 ft, safely inside the lake.
const PLATEAU={seconds:20,scene:'day',low:60,high:120};
const LAKE_CENTER=(PLATEAU.low+PLATEAU.high)/2;
const NAMES=['Coral','Chartreuse','Zaffre','Wisteria','Nacarat'];
const COLORS=['#ff6b78','#badb36','#386ee8','#ac8cdb','#f58b4a'];
const TRAINING=[
 {type:'plot',answer:[[-3,-2],[-1,2],[1,6]]},
 {type:'table',answer:[4,2,-1]},
 {type:'plot',answer:[[-4,3],[-1,0],[2,-3]]}
];
const rooms=new Map();
const clean=s=>String(s??'').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24);
const token=()=>crypto.randomBytes(16).toString('hex');
const newCode=()=>{let c;do{c=String(crypto.randomInt(100000,1000000));}while(rooms.has(c));return c;};
function winners(r){const ys=r.lines.map(([m,b])=>m*r.seconds+b),top=Math.max(...ys);return ys.flatMap((y,i)=>y===top?[i]:[]);}
function heatGroups(room){return [[...room.players.keys()]];} // One simultaneous classroom race, up to 40 students.
function heatMembers(room){return (room.heats[0]||[]).map(id=>({id,p:room.players.get(id)})).filter(({p})=>p);}
function finishStatus(build){const height=build.m*PLATEAU.seconds+build.b;
 if(height>PLATEAU.high)return {status:'crash',height,time:null};
 if(height<PLATEAU.low)return {status:'short',height,time:null};
 return {status:'safe',height,time:null,distance:Math.abs(height-LAKE_CENTER)};
}
function determineChampions(room){
 const contenders=[...room.players.entries()].map(([id,p])=>({id,p,result:finishStatus(p.build||{m:3,b:0,cost:0})}))
   .filter(x=>x.result.status==='safe')
   .sort((a,b)=>a.result.distance-b.result.distance||a.p.build.cost-b.p.build.cost||a.p.name.localeCompare(b.p.name));
 room.swimmers=contenders.map(x=>x.id);
 if(!contenders.length){room.champions=[];return;}
 const best=contenders[0];
 // Same distance and same coin cost share the crown. Nobody loses on alphabetic order.
 room.champions=contenders.filter(x=>x.result.distance===best.result.distance && x.p.build.cost===best.p.build.cost).map(x=>x.id);
}
function queenRankings(room){
 const arr=[...room.players.entries()].map(([id,p])=>({id,p,r:finishStatus(p.build||{m:3,b:0,cost:0})}));
 // A safe landing outranks a miss; within each group, closer to 90 feet wins.
 arr.sort((a,b)=>(a.r.status==='safe'?0:1)-(b.r.status==='safe'?0:1)||Math.abs(a.r.height-LAKE_CENTER)-Math.abs(b.r.height-LAKE_CENTER)||a.p.name.localeCompare(b.p.name));
 let lastScore=null,rank=0;
 arr.forEach((entry,i)=>{
   const score=(entry.r.status==='safe'?'S':'M')+':'+Math.abs(entry.r.height-LAKE_CENTER);
   if(score!==lastScore)rank=i+1;
   lastScore=score;
   entry.p.queenRank=rank;
   entry.p.queenBonus=Math.max(1,arr.length-rank+1);
 });
}
function activeRace(room){if(room.index<FINAL_INDEX)return RACES[room.index];const heat=heatMembers(room);
 if(room.index===FINAL_INDEX)return {...PLATEAU,lines:heat.map(({p})=>[p.build?.m??3,p.build?.b??0])};
 return {seconds:room.phase==='king-racing'?SUNRISE_MAX:(room.sunriseSeconds||SUNRISE_MAX),scene:'night',lines:heat.map(({p})=>[p.kingBuild?.m??3,p.kingBuild?.b??0])};
}
function publicState(room,role={}){
 const players=[...room.players.values()],me=room.players.get(role.playerId),race=activeRace(room),final=room.index===FINAL_INDEX,king=room.index===KING_INDEX;
 const heat=(final||king)?heatMembers(room):[];
 const counts=room.index<FINAL_INDEX?race.lines.map((_,i)=>players.filter(p=>p.bet?.round===room.index&&p.bet.pick===i).length):[];
 const betCount=counts.reduce((a,b)=>a+b,0);
 const custom=heat.map(({id,p},i)=>({id,bib:i+1,name:p.name,color:COLORS[i%5],build:king?(p.kingBuild||{m:3,b:0,cost:0}):(p.build||{m:3,b:0,cost:0}),champion:room.champions.includes(id),queenRank:p.queenRank,queenBonus:p.queenBonus,kingHeight:p.kingHeight,...(king?{}:finishStatus(p.build||{m:3,b:0}))}));
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
 heatTurtles:custom,queenBudget:QUEEN_BUDGET,startAt:room.startAt,endAt:king&&room.phase==='king-racing'?null:room.endAt,
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
function clearRace(room){clearTimeout(room.timer);room.timer=null;room.startAt=null;room.endAt=null;}
function startRace(room){
 room.phase=room.index===KING_INDEX?'king-racing':room.index===FINAL_INDEX?'final-racing':'racing';room.startAt=Date.now()+1500;
 if(room.index===KING_INDEX)room.sunriseSeconds=crypto.randomInt(SUNRISE_MIN,SUNRISE_MAX+1);
 room.endAt=room.startAt+(room.index===KING_INDEX?room.sunriseSeconds:activeRace(room).seconds)*1000;
 room.timer=setTimeout(()=>{
  if(!['racing','final-racing','king-racing'].includes(room.phase))return;
  if(room.index<FINAL_INDEX){const winning=winners(RACES[room.index]);for(const p of room.players.values()){
    if(p.bet?.round!==room.index)continue;
    const won=winning.includes(p.bet.pick);p.tokens+=won?p.bet.amount:-p.bet.amount;if(won)p.wins++;
   }room.phase='results';
  }else if(room.index===FINAL_INDEX){for(const {p} of heatMembers(room))p.final=finishStatus(p.build||{m:3,b:0});determineChampions(room);queenRankings(room);room.phase='queen-finished';}
  else{for(const {p} of heatMembers(room))p.kingHeight=p.kingBuild.m*room.sunriseSeconds+p.kingBuild.b;room.phase='king-finished';}
  publish(room);
 },Math.max(0,room.endAt-Date.now()));
}
io.on('connection',socket=>{
 socket.on('create',(_,cb)=>{const code=newCode(),secret=token(),room={code,secret,index:0,phase:'training',players:new Map(),connections:new Map(),heats:[],heatIndex:0,champions:[],swimmers:[],sunriseSeconds:null,timer:null,startAt:null,endAt:null};rooms.set(code,room);attach(socket,room,{teacher:true});cb?.({ok:true,code,secret});publish(room);});
 socket.on('host:rejoin',({code,secret}={},cb)=>{const r=rooms.get(String(code||''));if(!r||r.secret!==secret)return err(cb,'Teacher session unavailable. Create a new game.');attach(socket,r,{teacher:true});cb?.({ok:true});publish(r);});
 socket.on('join',({code,name,id}={},cb)=>{const room=rooms.get(String(code||'').trim());if(!room)return err(cb,'No game with that PIN.');if(room.phase==='king-finished')return err(cb,'This game has ended.');name=clean(name);if(!name)return err(cb,'Enter a name.');let playerId=(typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)&&room.players.has(id))?id:null;if(!playerId){if(room.index>0||!['training','betting'].includes(room.phase))return err(cb,'This game has already started.');if(room.players.size>=40)return err(cb,'This classroom is full.');if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return err(cb,'That name is taken; add an initial.');playerId=token();room.players.set(playerId,{name,tokens:2,wins:0,bet:null,training:{q:0,correct:0,attempts:0,done:false},build:null,final:null,queenRank:null,queenBonus:null,kingBuild:null,kingHeight:null});}attach(socket,room,{teacher:false,playerId});cb?.({ok:true,id:playerId});publish(room);});
 socket.on('training:answer',({q,answer}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='training')return err(cb,'Training is closed.');const p=room.players.get(role.playerId),t=p.training;if(t.done||q!==t.q||!TRAINING[q])return err(cb,'That question is no longer active.');const expected=TRAINING[q].answer;let normalized=answer;if(TRAINING[q].type==='plot'&&Array.isArray(answer))normalized=answer.map(v=>[Number(v?.[0]),Number(v?.[1])]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(TRAINING[q].type==='table'&&Array.isArray(answer))normalized=answer.map(Number);const correct=JSON.stringify(normalized)===JSON.stringify(expected);t.attempts++;if(correct){p.tokens++;t.correct++;t.q++;t.attempts=0;}else if(t.attempts>=2){t.q++;t.attempts=0;}if(t.q>=TRAINING.length)t.done=true;cb?.({ok:true,correct,done:t.done,retry:!correct&&!t.done&&t.attempts===1});publish(room);});
 socket.on('bet',({pick,amount}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='betting'||room.index>=FINAL_INDEX)return err(cb,'Betting is closed.');const p=room.players.get(role.playerId);if(p.bet?.round===room.index)return err(cb,'Your bet is locked.');if(!Number.isInteger(pick)||pick<0||pick>=RACES[room.index].lines.length)return err(cb,'Choose a turtle.');if(!Number.isInteger(amount)||amount<1||amount>Math.min(3,p.tokens))return err(cb,'Bet exceeds your balance or limit.');p.bet={round:room.index,pick,amount};cb?.({ok:true});publish(room);});
 socket.on('build',({m,b}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='workshop')return err(cb,'Workshop is closed.');const p=room.players.get(role.playerId);if(p.build)return err(cb,'Turtle is already built.');if(!Number.isInteger(m)||m<0||m>15||!Number.isInteger(b)||b<0||b>150||b%10!==0)return err(cb,'Use whole-number slope and 10-foot head starts.');
 const cost=m+b/10;
 if(m<1)return err(cb,'Choose a slope of at least 1.');
 if(cost>QUEEN_BUDGET)return err(cb,'That turtle costs more than the shared Queen allowance.');
 // Queen builds use a separate allowance; betting coins remain available for King.
 p.build={m,b,cost};cb?.({ok:true});publish(room);});
 socket.on('king:build',({m,b}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='king-workshop')return err(cb,'Sunrise workshop is closed.');const p=room.players.get(role.playerId);if(p.kingBuild)return err(cb,'Sunrise turtle already built.');if(!Number.isInteger(m)||m<1||m>60||!Number.isInteger(b)||b<0||b>600||b%10!==0)return err(cb,'Choose whole-number slope and 10-foot upgrades.');const cost=m+b/10;const budget=p.tokens+(p.queenBonus||0);if(cost>budget)return err(cb,'Not enough coins for that turtle.');p.kingBuild={m,b,cost};cb?.({ok:true});publish(room);});
 socket.on('host:action',({action}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||!role.teacher)return err(cb,'Teacher access required.');
  if(action==='start'&&room.phase==='training')room.phase='betting';
  else if(action==='start'&&room.phase==='betting')startRace(room);
  else if(action==='next'&&room.phase==='results'){
    room.index++;clearRace(room);if(room.index===FINAL_INDEX){room.phase='workshop';room.heats=[];room.heatIndex=0;room.champions=[];room.swimmers=[];}else room.phase='betting';
  }else if(action==='start'&&room.phase==='workshop'){
    for(const p of room.players.values())if(!p.build)p.build={m:3,b:0,cost:0};
    room.heats=heatGroups(room);room.heatIndex=0;startRace(room);
  }else if(action==='next'&&room.phase==='queen-finished'){
    clearRace(room);room.index=KING_INDEX;room.phase='king-workshop';room.sunriseSeconds=null;
  }else if(action==='start'&&room.phase==='king-workshop'){
    for(const p of room.players.values())if(!p.kingBuild)p.kingBuild={m:3,b:0,cost:0};
    startRace(room);
  }else if(action==='reset'&&['training','betting','results','workshop','queen-finished','king-workshop','king-finished'].includes(room.phase)){
    clearRace(room);room.index=0;room.phase='training';room.heats=[];room.heatIndex=0;room.champions=[];room.swimmers=[];room.sunriseSeconds=null;for(const p of room.players.values()){p.tokens=2;p.wins=0;p.bet=null;p.training={q:0,correct:0,attempts:0,done:false};p.build=null;p.final=null;p.queenRank=null;p.queenBonus=null;p.kingBuild=null;p.kingHeight=null;}
  }else return err(cb,'That action is not available right now.');
  cb?.({ok:true});publish(room);
 });
 socket.on('disconnect',()=>{const r=getRoom(socket);if(r){r.connections.delete(socket.id);publish(r);}});
});
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log('Turtle Mountain Climb 7 on '+port));
