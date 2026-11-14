'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(__dirname));
app.get('/health', (req, res) => res.json({ ok: true }));

// Each [m,b] gives the climber's elevation y=m*x+b at time x.
// Order of lines matches A, B, C, D. No random winners.
const RACES = [
  // A smaller slope can win when it starts higher. No identical ending elevations.
  { seconds: 6, scene: 'sunrise', lines: [[2,10],[4,0]] },
  { seconds: 6, scene: 'day', lines: [[2,12],[4,0],[3,7]] },
  { seconds: 8, scene: 'sunset', lines: [[2,14],[4,0],[3,6],[1,26]] },
  { seconds: 8, scene: 'night', lines: [[2,18],[4,0],[3,12],[1,27],[5,0]] }
];
const NAMES = ['Coral','Chartreuse','Zaffre','Wisteria','Nacarat'];
const COLORS = ['#ff6b78','#bbdb3c','#3265e9','#bb94df','#f68a49'];
const rooms = new Map();
const clean = value => String(value || '').replace(/[<>\x00-\x1f]/g, '').trim().slice(0,25);
const newToken = () => crypto.randomBytes(16).toString('hex');
function roomCode() {let c; do {c = String(crypto.randomInt(100000,1000000));} while (rooms.has(c)); return c;}
function winners(race) {
  const heights = race.lines.map(([m,b]) => m*race.seconds+b), maximum = Math.max(...heights);
  return heights.flatMap((y,i) => y===maximum ? [i] : []);
}
function state(room, playerId, isTeacher) {
  const players=[...room.players.values()];
  const me=room.players.get(playerId);
  const race=RACES[room.index] || null;
  const counts=race?.lines.map((_,i)=>players.filter(p=>p.bet?.round===room.index&&p.bet.pick===i).length)||[];
  return {
    code:room.code, phase:room.phase, round:room.index, total:RACES.length, race,
    names:NAMES.slice(0,race?.lines.length||4), colors:COLORS.slice(0,race?.lines.length||4),
    joined:players.length, betCount:counts.reduce((a,b)=>a+b,0),
    counts:room.phase==='betting'?null:counts, startAt:room.startAt, endAt:room.endAt,
    winners:room.phase==='results'?winners(race):null,
    myName:me?.name||null, myTokens:me?.tokens??null,
    myBet:me?.bet?.round===room.index?me.bet:null,
    leaderboard:['results','finished'].includes(room.phase)?players.map(p=>({name:p.name,tokens:p.tokens,wins:p.wins})).sort((a,b)=>b.tokens-a.tokens||b.wins-a.wins||a.name.localeCompare(b.name)):null,
    isTeacher:!!isTeacher
  };
}
function publish(room) {
  for (const [id, role] of room.connections) {
    const sock=io.sockets.sockets.get(id);
    if(sock) sock.emit('state',state(room,role.playerId,role.teacher));
  }
}
function fail(callback,message) {if(typeof callback==='function')callback({ok:false,error:message});}
function getRoom(socket) {const r=rooms.get(socket.data.code);return r?.connections.has(socket.id)?r:null;}
function attached(socket,room,role) {socket.data.code=room.code;room.connections.set(socket.id,role);socket.join(room.code);}

io.on('connection',socket=>{
  socket.on('create',(_,cb)=>{
    const code=roomCode(), secret=newToken();
    const room={code,secret,index:0,phase:'betting',players:new Map(),connections:new Map(),startAt:null,endAt:null,timer:null};
    rooms.set(code,room);attached(socket,room,{teacher:true});
    cb?.({ok:true,code,secret});publish(room);
  });
  socket.on('host:rejoin',({code,secret}={},cb)=>{
    const room=rooms.get(String(code||''));
    if(!room||room.secret!==secret)return fail(cb,'Teacher game not found. Create a new one.');
    attached(socket,room,{teacher:true});cb?.({ok:true});publish(room);
  });
  socket.on('join',({code,name,id}={},cb)=>{
    const room=rooms.get(String(code||'').trim());
    if(!room)return fail(cb,'No game with that PIN.');
    if(room.phase==='finished')return fail(cb,'That game has ended.');
    name=clean(name);
    if(!name)return fail(cb,'Enter a first name or nickname.');
    let playerId=(typeof id==='string'&&/^[a-f0-9]{32}$/.test(id)&&room.players.has(id))?id:null;
    if(!playerId) {
      if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return fail(cb,'That name is taken; add an initial.');
      playerId=newToken();room.players.set(playerId,{name,tokens:50,wins:0,bet:null});
    }
    attached(socket,room,{teacher:false,playerId});cb?.({ok:true,id:playerId});publish(room);
  });
  socket.on('bet',({pick,amount}={},cb)=>{
    const room=getRoom(socket),role=room?.connections.get(socket.id);
    if(!room||role.teacher)return fail(cb,'Join as a student first.');
    if(room.phase!=='betting')return fail(cb,'Betting has closed.');
    const p=room.players.get(role.playerId);
    if(p.bet?.round===room.index)return fail(cb,'Your bet is already locked.');
    const n=RACES[room.index].lines.length;
    if(!Number.isInteger(pick)||pick<0||pick>=n)return fail(cb,'Choose a valid turtle.');
    if(!Number.isInteger(amount)||amount<1||amount>Math.min(30,p.tokens))return fail(cb,'Bet must be between 1 and your available maximum.');
    p.bet={round:room.index,pick,amount};cb?.({ok:true});publish(room);
  });
  socket.on('host:action',({action}={},cb)=>{
    const room=getRoom(socket),role=room?.connections.get(socket.id);
    if(!room||!role.teacher)return fail(cb,'Teacher access required.');
    if(action==='start'&&room.phase==='betting') {
      room.phase='racing';room.startAt=Date.now()+1600;room.endAt=room.startAt+10000;
      room.timer=setTimeout(()=>{
        if(room.phase!=='racing')return;
        const winning=winners(RACES[room.index]);
        for(const p of room.players.values()){
          if(p.bet?.round!==room.index)continue;
          const won=winning.includes(p.bet.pick);
          p.tokens+=won?p.bet.amount:-p.bet.amount;
          if(won)p.wins++;
        }
        room.phase='results';publish(room);
      },room.endAt-Date.now());
    } else if(action==='next'&&room.phase==='results') {
      room.index++;
      room.startAt=null;room.endAt=null;
      room.phase=room.index>=RACES.length?'finished':'betting';
    } else if(action==='reset'&&['results','finished','betting'].includes(room.phase)) {
      clearTimeout(room.timer);room.index=0;room.phase='betting';room.startAt=null;room.endAt=null;
      for(const p of room.players.values()){p.tokens=50;p.wins=0;p.bet=null;}
    } else return fail(cb,'Action not available yet.');
    cb?.({ok:true});publish(room);
  });
  socket.on('disconnect',()=>{
    const room=getRoom(socket);
    if(room){room.connections.delete(socket.id);publish(room);}
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log('Turtle Mountain Climb listening on '+PORT));
