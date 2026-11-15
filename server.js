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
 {seconds:15,scene:'sunrise',lines:[[2,38],[4,0]]},
 {seconds:20,scene:'day',lines:[[2,58],[4,21],[3,37]]},
 {seconds:25,scene:'sunset',lines:[[2,95],[5,24],[3,63],[4,36]]},
 {seconds:30,scene:'night',lines:[[2,120],[5,0],[3,91],[4,55],[1,171]]}
];
const PLATEAU={seconds:25,scene:'night',low:75,high:105};
const NAMES=['Coral','Chartreuse','Zaffre','Wisteria','Nacarat'];
const COLORS=['#ff6b78','#badb36','#386ee8','#ac8cdb','#f58b4a'];
const rooms=new Map();
const clean=s=>String(s??'').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24);
const token=()=>crypto.randomBytes(16).toString('hex');
const newCode=()=>{let c;do{c=String(crypto.randomInt(100000,1000000));}while(rooms.has(c));return c;};
function winners(r){const ys=r.lines.map(([m,b])=>m*r.seconds+b),top=Math.max(...ys);return ys.flatMap((y,i)=>y===top?[i]:[]);}
function heatGroups(room){const ids=[...room.players.keys()];const groups=[];for(let i=0;i<ids.length;i+=5)groups.push(ids.slice(i,i+5));return groups.length?groups:[[]];}
function heatMembers(room){const ids=room.heats[room.heatIndex]||[];return ids.map(id=>({id,p:room.players.get(id)})).filter(({p})=>p);}
function finishStatus(build){const height=build.m*PLATEAU.seconds+build.b;if(height>PLATEAU.high)return {status:'crash',height,time:null};if(height<PLATEAU.low)return {status:'short',height,time:null};return {status:'safe',height,time:Math.max(0,(PLATEAU.low-build.b)/build.m)};}
function activeRace(room){if(room.index<4)return RACES[room.index];const heat=heatMembers(room);return {...PLATEAU,lines:heat.map(({p})=>[p.build?.m??3,p.build?.b??0])};}
function publicState(room,role={}){
 const players=[...room.players.values()],me=room.players.get(role.playerId),race=activeRace(room),final=room.index===4;
 const heat=final?heatMembers(room):[];
 const counts=!final?race.lines.map((_,i)=>players.filter(p=>p.bet?.round===room.index&&p.bet.pick===i).length):[];
 const betCount=counts.reduce((a,b)=>a+b,0);
 const custom=heat.map(({id,p},i)=>({id,name:p.name,color:COLORS[i%5],build:p.build||{m:3,b:0,cost:0},...finishStatus(p.build||{m:3,b:0})}));
 const leaderboard=players.map(p=>({name:p.name,tokens:p.tokens,wins:p.wins,build:p.build||null,final:p.final||null})).sort((a,b)=>{
  if(final){const ta=a.final?.status==='safe'?a.final.time:Infinity,tb=b.final?.status==='safe'?b.final.time:Infinity;if(ta!==tb)return ta-tb;}
  return b.tokens-a.tokens||b.wins-a.wins||a.name.localeCompare(b.name);
 });
 return {code:room.code,phase:room.phase,round:room.index,total:5,race,final,plateau:final?PLATEAU:null,
 names:final?custom.map(t=>t.name):NAMES.slice(0,race.lines.length),colors:final?custom.map(t=>t.color):COLORS.slice(0,race.lines.length),
 joined:players.length,betCount,counts:room.phase==='betting'?null:counts,
 builtCount:players.filter(p=>p.build).length,heatsTotal:room.heats.length,heatIndex:room.heatIndex,
 heatTurtles:custom,startAt:room.startAt,endAt:room.endAt,
 winners:!final&&room.phase==='results'?winners(race):null,
 myName:me?.name||null,myTokens:me?.tokens??null,myBet:me?.bet?.round===room.index?me.bet:null,
 myBuild:me?.build||null,myFinal:me?.final||null,
 leaderboard:['results','final-results','finished'].includes(room.phase)?leaderboard:null,isTeacher:!!role.teacher};
}
function publish(room){for(const [id,role] of room.connections){const s=io.sockets.sockets.get(id);if(s)s.emit('state',publicState(room,role));}}
function err(cb,msg){if(typeof cb==='function')cb({ok:false,error:msg});}
function getRoom(socket){const r=rooms.get(socket.data.code);return r?.connections.has(socket.id)?r:null;}
function attach(socket,room,role){socket.data.code=room.code;room.connections.set(socket.id,role);socket.join(room.code);}
function clearRace(room){clearTimeout(room.timer);room.timer=null;room.startAt=null;room.endAt=null;}
function startRace(room){
 room.phase=room.index===4?'final-racing':'racing';room.startAt=Date.now()+1500;
 room.endAt=room.startAt+activeRace(room).seconds*1000;
 room.timer=setTimeout(()=>{
  if(!['racing','final-racing'].includes(room.phase))return;
  if(room.index<4){const winning=winners(RACES[room.index]);for(const p of room.players.values()){
    if(p.bet?.round!==room.index)continue;
    const won=winning.includes(p.bet.pick);p.tokens+=won?p.bet.amount:-p.bet.amount;if(won)p.wins++;
   }room.phase='results';
  }else{for(const {p} of heatMembers(room))p.final=finishStatus(p.build||{m:3,b:0});room.phase='final-results';}
  publish(room);
 },Math.max(0,room.endAt-Date.now()));
}
io.on('connection',socket=>{
 socket.on('create',(_,cb)=>{const code=newCode(),secret=token(),room={code,secret,index:0,phase:'betting',players:new Map(),connections:new Map(),heats:[],heatIndex:0,timer:null,startAt:null,endAt:null};rooms.set(code,room);attach(socket,room,{teacher:true});cb?.({ok:true,code,secret});publish(room);});
 socket.on('host:rejoin',({code,secret}={},cb)=>{const r=rooms.get(String(code||''));if(!r||r.secret!==secret)return err(cb,'Teacher session unavailable. Create a new game.');attach(socket,r,{teacher:true});cb?.({ok:true});publish(r);});
 socket.on('join',({code,name,id}={},cb)=>{const room=rooms.get(String(code||'').trim());if(!room)return err(cb,'No game with that PIN.');if(room.phase==='finished')return err(cb,'This game has ended.');name=clean(name);if(!name)return err(cb,'Enter a name.');let playerId=(typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)&&room.players.has(id))?id:null;if(!playerId){if(room.index>0)return err(cb,'This game has already started.');if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return err(cb,'That name is taken; add an initial.');playerId=token();room.players.set(playerId,{name,tokens:5,wins:0,bet:null,build:null,final:null});}attach(socket,room,{teacher:false,playerId});cb?.({ok:true,id:playerId});publish(room);});
 socket.on('bet',({pick,amount}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='betting'||room.index>=4)return err(cb,'Betting is closed.');const p=room.players.get(role.playerId);if(p.bet?.round===room.index)return err(cb,'Your bet is locked.');if(!Number.isInteger(pick)||pick<0||pick>=RACES[room.index].lines.length)return err(cb,'Choose a turtle.');if(!Number.isInteger(amount)||amount<1||amount>Math.min(3,p.tokens))return err(cb,'Bet exceeds your balance or limit.');p.bet={round:room.index,pick,amount};cb?.({ok:true});publish(room);});
 socket.on('build',({m,b}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||role.teacher)return err(cb,'Join as a student.');if(room.phase!=='workshop')return err(cb,'Workshop is closed.');const p=room.players.get(role.playerId);if(p.build)return err(cb,'Turtle is already built.');if(!Number.isInteger(m)||m<3||m>10||!Number.isInteger(b)||b<0||b>50)return err(cb,'Choose whole-number upgrades.');const cost=m-3+b;if(cost>p.tokens)return err(cb,'Not enough coins.');p.tokens-=cost;p.build={m,b,cost};cb?.({ok:true});publish(room);});
 socket.on('host:action',({action}={},cb)=>{const room=getRoom(socket),role=room?.connections.get(socket.id);if(!room||!role.teacher)return err(cb,'Teacher access required.');
  if(action==='start'&&room.phase==='betting')startRace(room);
  else if(action==='next'&&room.phase==='results'){
    room.index++;clearRace(room);if(room.index===4){room.phase='workshop';room.heats=[];room.heatIndex=0;}else room.phase='betting';
  }else if(action==='start'&&room.phase==='workshop'){
    for(const p of room.players.values())if(!p.build)p.build={m:3,b:0,cost:0};
    room.heats=heatGroups(room);room.heatIndex=0;startRace(room);
  }else if(action==='next'&&room.phase==='final-results'){
    clearRace(room);room.heatIndex++;if(room.heatIndex>=room.heats.length)room.phase='finished';else startRace(room);
  }else if(action==='reset'&&['betting','results','workshop','final-results','finished'].includes(room.phase)){
    clearRace(room);room.index=0;room.phase='betting';room.heats=[];room.heatIndex=0;for(const p of room.players.values()){p.tokens=5;p.wins=0;p.bet=null;p.build=null;p.final=null;}
  }else return err(cb,'That action is not available right now.');
  cb?.({ok:true});publish(room);
 });
 socket.on('disconnect',()=>{const r=getRoom(socket);if(r){r.connections.delete(socket.id);publish(r);}});
});
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log('Turtle Mountain Climb 2 on '+port));
