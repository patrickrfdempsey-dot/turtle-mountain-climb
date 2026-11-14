'use strict';
const sock = io();
const main = document.getElementById('main');
const net = document.getElementById('network');
const refs = {};
let state = null, role = null, chosen = 0, amount = 10, lastPhase = '', animationFrame = null;
const initial = {name: '',pin: ''};
const labels = ['A','B','C','D','E'];
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (x,a,b)=>Math.min(b,Math.max(a,x));
const toast = msg => {const el=document.getElementById('toast');el.textContent=msg;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display='none',3700);};
function send(ev,data,done){sock.emit(ev,data,ans=>{if(!ans?.ok){toast(ans?.error||'Could not connect.');return;}if(done)done(ans);});}
function saveTeacher(code,secret){sessionStorage.setItem('turtleTeacher',JSON.stringify({code,secret}));}
function savePlayer(code,id,name){sessionStorage.setItem('turtlePlayer',JSON.stringify({code,id,name}));}
function reconnect(){const host=sessionStorage.getItem('turtleTeacher');const player=sessionStorage.getItem('turtlePlayer');if(host){try{const h=JSON.parse(host);send('host:rejoin',h,()=>{role='teacher';});return;}catch{}}if(player){try{const p=JSON.parse(player);send('join',p,()=>{role='student';});return;}catch{}}renderStart();}
sock.on('connect',()=>{net.textContent='● connected';reconnect();});
sock.on('disconnect',()=>{net.textContent='● reconnecting';});
sock.on('state',s=>{const was=state?.round;state=s;if(s.isTeacher)role='teacher';else if(s.myName)role='student';if(s.phase!==lastPhase||was!==s.round){chosen=0;amount=10;lastPhase=s.phase;}render();});
function renderStart(){if(state)return;main.innerHTML=`<div class="startwrap"><div class="startart card"><div class="big">🐢 ⛰️</div><p>Four races.<br>One big climb.</p><div class="introTurtles">🌅 ☀️ 🌇 🌙</div></div><div class="card flexcol"><h1>Turtle<br>Mountain<br>Climb!</h1><div class="muted">50 🪙 to start · 4 races</div><button class="btn" id="host">🎬 Teacher — create game</button><hr style="width:100%;border:1px solid #e6dbc9"><h2>Join the climb</h2><input id="name" class="field" maxlength="25" placeholder="Your name" autocomplete="off"><input id="pin" class="field" maxlength="6" inputmode="numeric" placeholder="6-digit game PIN"><button id="join" class="btn yellow">🐢 Join game</button></div></div>`;
 document.getElementById('host').onclick=()=>send('create',{},a=>{role='teacher';saveTeacher(a.code,a.secret);});
 document.getElementById('join').onclick=()=>{const name=document.getElementById('name').value.trim(),code=document.getElementById('pin').value.trim();if(!name||!/^\d{6}$/.test(code))return toast('Enter a name and 6-digit PIN.');send('join',{name,code},a=>{role='student';savePlayer(code,a.id,name);});};
}
function formatEq(m,b){return `y = ${m===1?'':m}x${b>0?' + '+b:b<0?' − '+Math.abs(b):''}`;}
function pickButton(i,student){const disabled=student && (state.phase!=='betting'||!!state.myBet||state.myTokens<1);return `<button ${disabled?'disabled':''} class="pick ${chosen===i?'sel':''}" data-pick="${i}"><span class="dot" style="background:${state.colors[i]}"></span>${esc(state.names[i])}</button>`;}
function raceCard(){const r=state.race;if(!r)return `<div class="card"><h2>🏆 Finish!</h2><div class="notice">The mountain championship is complete.</div></div>`;
 const n=r.lines.length;const isTeacher=role==='teacher';const raceNum=state.round+1;
 const nameRows=r.lines.map(([m,b],i)=>`<div class="eq"><span class="letter">${labels[i]}</span><span class="n">${esc(state.names[i])}</span><span class="formula">${formatEq(m,b)}</span></div>`).join('');
 const ready=state.betCount;
 return `<div class="card"><div class="minihead"><span class="chip">RACE ${raceNum} / ${state.total}</span><span class="chip">⏱ ${r.seconds}s</span></div><div class="raceinfo"><span class="phase">${n} TURTLES</span><span class="badge">${r.scene.toUpperCase()}</span></div><div class="equations">${nameRows}</div>${isTeacher?teacherPanel():studentPanel()}</div>`;
}
function teacherPanel(){let c='';if(state.phase==='betting')c=`<button id="raceStart" class="btn yellow full">🏁 START RACE</button>`;else if(state.phase==='racing')c=`<div class="locked">🏔️ Climbing...</div>`;else if(state.phase==='results')c=`<button id="nextRace" class="btn yellow full">${state.round===state.total-1?'🏆 FINISH GAME':'NEXT RACE →'}</button>`;
 return `<div class="teacherControls"><div class="notice">PIN <span class="bigpin">${state.code}</span></div><div class="stat">${state.betCount} / ${state.joined} <span class="small">bets</span></div>${c}<div class="small muted">Project this screen · teacher controls the race</div></div>`;
}
function studentPanel(){if(state.phase==='finished')return `<div class="stat">🏆 ${state.myTokens} 🪙</div>`;
 const max=Math.min(30,state.myTokens??0);
 if(state.myBet && state.myBet.round===state.round) return `<div class="locked">✓ ${esc(state.names[state.myBet.pick])} · ${state.myBet.amount} 🪙<div class="small muted">Bet locked</div></div><div class="stat" style="margin-top:14px">🪙 ${state.myTokens}</div>`;
 if(state.phase!=='betting')return `<div class="locked">🏔️ ${state.phase==='racing'?'Race in progress':'Race finished'}</div><div class="stat">🪙 ${state.myTokens}</div>`;
 if(max<1)return `<div class="locked">0 🪙 · You're out of tokens, but you can watch!</div>`;
 amount=clamp(amount,1,max);
 return `<div class="stat">🪙 <b>${state.myTokens}</b></div><div class="bets">${state.race.lines.map((_,i)=>pickButton(i,true)).join('')}</div><div class="wager"><strong>Bet</strong><input id="wager" type="number" min="1" max="${max}" step="1" value="${amount}"><span class="muted small">max ${max}</span></div><button id="betNow" class="btn yellow full">✓ PLACE BET</button>`;
}
function resultCard(){if(!state||!['results','finished'].includes(state.phase))return '';
 const ranks=state.leaderboard||[];
 const win=state.race&&state.winners?.map(i=>state.names[i]).join(' + ');
 return `<div class="card"><h2>${state.phase==='finished'?'🏆 CHAMPIONS':'🏆 '+esc(win||'Winners')}</h2>${role==='student'&&state.phase==='results'?`<div class="resultline">${state.winners.includes(state.myBet?.pick)?'🎉 You won!':'🐢 Better luck next climb!'}</div>`:''}<table class="leader">${ranks.slice(0,10).map((p,i)=>`<tr><td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1+'.'} ${esc(p.name)}</td><td>${p.tokens} 🪙</td></tr>`).join('')}</table>${role==='teacher'?'<button class="btn secondary full" id="restart" style="margin-top:16px">↻ Reset game</button>':''}</div>`;
}
function render(){if(!state){renderStart();return;}
 main.innerHTML=`<div class="game"><div class="side">${state.race?raceCard():`<div class="card"><h2>🏆 Tournament complete</h2><div class="notice">PIN ${state.code}</div></div>`}${resultCard()}</div><section class="scene ${state.race?.scene||'night'}"><div class="sceneTop">${state.phase==='betting'?'🏔️ READY':state.phase==='racing'?'🐢 CLIMB!':state.phase==='results'?'🏁 FINISH!':'🏆 CHAMPIONS'}</div><div id="mountain"></div><div class="sceneBottom">${state.phase==='betting'?'🌄 '+state.betCount+' BETS LOCKED':state.phase==='racing'?'THE CLIMB IS ON!':state.phase==='results'?'🎉 '+state.names[state.winners[0]]+' WINS!':'THANKS FOR CLIMBING!'}</div></section></div>`;
 for(const btn of main.querySelectorAll('[data-pick]'))btn.onclick=()=>{chosen=Number(btn.dataset.pick);render();};
 const wager=document.getElementById('wager');if(wager)wager.onchange=()=>{const max=Math.min(30,state.myTokens);amount=clamp(Math.floor(Number(wager.value)||1),1,max);wager.value=amount;};
 const bet=document.getElementById('betNow');if(bet)bet.onclick=()=>{const max=Math.min(30,state.myTokens);amount=clamp(Math.floor(Number(document.getElementById('wager').value)||1),1,max);send('bet',{pick:chosen,amount});};
 const start=document.getElementById('raceStart');if(start)start.onclick=()=>send('host:action',{action:'start'});
 const next=document.getElementById('nextRace');if(next)next.onclick=()=>send('host:action',{action:'next'});
 const reset=document.getElementById('restart');if(reset)reset.onclick=()=>{if(confirm('Reset all scores and return to sunrise?'))send('host:action',{action:'reset'});};
 if(animationFrame)cancelAnimationFrame(animationFrame);animate();
}
function terrain(scene){const sky={sunrise:['#ffdfaa','#ffc39b','#faf0ba'],day:['#91d9ed','#c2f2f1','#f5efaf'],sunset:['#aa7fbb','#f4a18e','#ffd18a'],night:['#162a53','#384c7e','#6d71a4']}[scene||'sunrise'];const night=scene==='night';
 let stars='';if(night)for(let i=0;i<40;i++){const x=(i*177+41)%980,y=(i*61+17)%250;stars+=`<circle cx="${x}" cy="${y}" r="${i%4===0?2.3:1.1}" fill="#fff8cd" opacity=".8"/>`;}
 return `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${sky[0]}"/><stop offset="60%" stop-color="${sky[1]}"/><stop offset="100%" stop-color="${sky[2]}"/></linearGradient><linearGradient id="ridge" x2="0" y2="1"><stop stop-color="${night?'#5b7696':'#8ab8a5'}"/><stop offset="1" stop-color="${night?'#294a5a':'#4a8a70'}"/></linearGradient></defs><rect width="1000" height="600" fill="url(#sky)"/>${stars}<circle cx="850" cy="105" r="${night?33:48}" fill="${night?'#fff3ce':'#fff0ae'}" opacity=".95"/><g opacity="${night?.21:.42}" fill="#fff"><ellipse cx="130" cy="110" rx="92" ry="23"/><ellipse cx="165" cy="96" rx="48" ry="21"/><ellipse cx="530" cy="70" rx="115" ry="23"/><ellipse cx="540" cy="55" rx="52" ry="24"/></g><path d="M0 445L130 265L245 385L405 165L525 350L674 195L803 355L932 235L1000 315V600H0Z" fill="${night?'#43536e':'#a7b4a9'}"/><path d="M0 525L175 355L285 470L475 255L645 495L792 320L1000 470V600H0Z" fill="url(#ridge)"/><path d="M0 555 Q220 495 350 550 Q510 502 680 548 Q845 496 1000 553 V600H0Z" fill="${night?'#274d51':'#4e8b67'}"/>${Array.from({length:13},(_,i)=>{const x=(i*97+15)%990,y=520+(i%3)*17;return `<path d="M${x} ${y}l-16 0 13-25-10 0 13-26 13 26-10 0 13 25z" fill="${night?'#194b53':'#327959'}" opacity=".85"/>`;}).join('')}`;
}
function turtleShape(x,y,color,name,i,progress,winning){const bob=Math.sin(Date.now()/110+i*2)*2.6;const sad=state.phase==='results'&&!winning;const smile=sad?'M 22 7 Q 27 1 32 7':'M 22 4 Q 27 12 32 4';const eye=state.phase==='racing'&&Math.floor(Date.now()/2100+i)%11===0?1.5:4.5;
 const accessories=[`<path d="M-13 -22Q-3-34 12-22l-2 7h-22z" fill="#e86154"/><rect x="-10" y="-18" width="31" height="5" rx="2" fill="#f0bb53"/>`,`<path d="M-7 -21l-5-13 10 8 10-11 8 14" fill="none" stroke="#f8f1a4" stroke-width="4"/>`,`<path d="M16 -8l20 0" stroke="#102e46" stroke-width="7"/><rect x="21" y="-9" width="12" height="9" rx="4" fill="#1e3748"/>`,`<path d="M-9 -22Q3-35 12-21" fill="none" stroke="#ffe8f2" stroke-width="7"/><circle cx="11" cy="-26" r="7" fill="#ffc5ec"/>`,`<path d="M-4 -26L6 -40 13 -24" fill="#ffd973" stroke="#b76d2d" stroke-width="2"/>`][i%5];return `<g class="walk" transform="translate(${x.toFixed(2)},${(y+bob).toFixed(2)})" aria-label="${name}"><ellipse cx="0" cy="26" rx="29" ry="6" fill="#122b3450"/><ellipse cx="-13" cy="20" rx="11" ry="7" fill="#8cc85d"/><ellipse cx="14" cy="20" rx="10" ry="7" fill="#8cc85d"/><ellipse cx="0" cy="0" rx="29" ry="25" fill="${color}" stroke="#244b4c" stroke-width="3.4"/><path d="M-16 -12 Q1 -3 17 -14 M-20 7 Q0 12 20 5 M-2 -21Q-11 0-2 21 M10 -19Q21-1 9 19" fill="none" stroke="#ffffff" stroke-width="2.5" opacity=".35"/><ellipse cx="27" cy="-4" rx="15" ry="13" fill="#9eda70" stroke="#244b4c" stroke-width="3"/><ellipse cx="30" cy="-10" rx="5.5" ry="7" fill="white"/><circle cx="31" cy="-10" r="${eye}" fill="#152c3a"/><path d="${smile}" stroke="#244b4c" stroke-width="2.3" fill="none" stroke-linecap="round"/>${accessories}${winning&&state.phase==='results'?'<path d="M-11 -36l6-12 9 8 8-14 9 18" fill="#f9d365" stroke="#d38d35" stroke-width="2"/>':''}<text x="0" y="-47" text-anchor="middle" font-family="Fredoka" font-size="16" font-weight="700" fill="white" stroke="#214254" stroke-width="3.5" paint-order="stroke">${esc(name)}</text></g>`;}
function svgScene(){if(!state?.race)return `<svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">${terrain('night')}<text x="500" y="295" fill="#fff" text-anchor="middle" font-size="50">🏆</text></svg>`;
 const race=state.race, lines=race.lines,maxY=Math.max(...lines.map(([m,b])=>m*race.seconds+b),30)+6;
 const mapX=t=>110+(t/race.seconds)*790, mapY=y=>525-(y/maxY)*400;
 const p=state.phase==='betting'?0:state.phase==='racing'?clamp((Date.now()-state.startAt)/(state.endAt-state.startAt),0,1):1;
 const t=p*race.seconds, showTurtles=state.phase!=='betting'&&Date.now()>=state.startAt, done=state.phase==='results';
 const marks=Array.from({length:5},(_,k)=>{const v=k*(Math.ceil(maxY/4));return `<line x1="90" x2="922" y1="${mapY(v)}" y2="${mapY(v)}" stroke="#fff" stroke-width="1.4" opacity=".25"/><text x="84" y="${mapY(v)+5}" font-family="Nunito" font-size="17" text-anchor="end" fill="#fff" font-weight="900" stroke="#183f4c" stroke-width="2.4" paint-order="stroke">${v}</text>`;}).join('');
 const paths=lines.map(([m,b],i)=>{const x0=mapX(0),y0=mapY(b),x1=mapX(race.seconds),y1=mapY(m*race.seconds+b);let result=`<path d="M${x0} ${y0}L${x1} ${y1}" fill="none" stroke="${state.phase==='betting'?'#f5f5e0':'#d9e9dd'}" stroke-width="${state.phase==='betting'?5:3}" opacity="${state.phase==='betting'?.68:.47}" stroke-linecap="round" ${state.phase==='betting'?'stroke-dasharray="9 11"':''}/>`;
 if(showTurtles){const px=mapX(t),py=mapY(m*t+b);result+=`<path d="M${x0} ${y0}L${px} ${py}" stroke="${state.colors[i]}" stroke-width="10" stroke-linecap="round" fill="none"/><path d="M${x0} ${y0}L${px} ${py}" stroke="#ffffff90" stroke-width="2.5" stroke-linecap="round" fill="none"/>${turtleShape(px,py,state.colors[i],state.names[i],i,p,done&&state.winners?.includes(i))}`;}
 return result;}).join('');
 const timeline=state.phase==='racing'?`<text x="500" y="579" text-anchor="middle" font-family="Fredoka" font-size="23" fill="#fff" stroke="#173c45" stroke-width="3" paint-order="stroke">${Math.round(p*race.seconds*10)/10}s / ${race.seconds}s</text>`:'';
 return `<svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mountain climbing race, paths drawn to the slopes of their equations"><g>${terrain(race.scene)}</g>${marks}<path d="M110 112V525H925" fill="none" stroke="#e8e7d4" stroke-width="4" opacity=".7"/><text x="110" y="553" fill="#fff" font-family="Nunito" font-size="17" text-anchor="middle" font-weight="900">0s</text><text x="905" y="553" fill="#fff" font-family="Nunito" font-size="17" text-anchor="end" font-weight="900">${race.seconds}s</text><text x="29" y="332" transform="rotate(-90 29 332)" fill="#fff" font-family="Nunito" font-weight="900" font-size="19" text-anchor="middle">ELEVATION</text>${paths}${timeline}</svg>`;
}
function animate(){const mount=document.getElementById('mountain');if(!mount)return;mount.innerHTML=svgScene();if(state?.phase==='racing'||(state?.phase==='betting'&&false)){animationFrame=requestAnimationFrame(animate);}else animationFrame=null;}
if(!sock.connected)renderStart();
