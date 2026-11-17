'use strict';
const sock=io(),main=document.getElementById('main'),net=document.getElementById('network');
let S=null,role='',chosen=0,stake=1,m=3,b=0,previous='',raf=null;
const letters='ABCDE';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
const toast=message=>{let el=document.getElementById('toast');el.textContent=message;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display='none',3200);};
function send(ev,obj,success){sock.emit(ev,obj,answer=>{if(!answer?.ok)return toast(answer?.error||'Connection error');success?.(answer);});}
function stored(key){try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}}
function reconnect(){
 const host=stored('mountainHost'),player=stored('mountainPlayer');
 if(host){sock.emit('host:rejoin',host,a=>{if(a?.ok){role='teacher';return;}sessionStorage.removeItem('mountainHost');reconnect();});return;}
 if(player){sock.emit('join',player,a=>{if(a?.ok){role='student';return;}sessionStorage.removeItem('mountainPlayer');role='';S=null;welcome();});return;}
 role='';S=null;welcome();
}
sock.on('connect',()=>{net.textContent='● connected';reconnect();});sock.on('disconnect',()=>net.textContent='● reconnecting');
sock.on('state',data=>{const phaseChanged=data.phase!==S?.phase||data.round!==S?.round;S=data;role=data.isTeacher?'teacher':data.myName?'student':role;if(phaseChanged){chosen=0;stake=1;m=data.king?1:3;b=0;}draw();});
function welcome(){if(S)return;main.innerHTML=`<div class="startwrap"><div class="card startart"><div class="big">🐢 ⛰️</div><p>Sunrise to moonlight</p><div class="introTurtles">🌅 🌇 🌙 🏔️</div></div><div class="card flexcol"><h1>Turtle<br>Mountain<br>Climb!</h1><div class="muted">5 🪙 · 3 races · Queen of the Island · King of the Mountain</div><button class="btn yellow" id="host">Teacher — Create game</button><hr style="width:100%;border:1px solid #e6dbc9"><input id="name" class="field" maxlength="24" placeholder="Name" autocomplete="off"><input id="pin" class="field" maxlength="6" inputmode="numeric" placeholder="Game PIN"><button class="btn" id="join">Join</button></div></div>`;
 document.getElementById('host').onclick=()=>send('create',{},a=>{role='teacher';sessionStorage.setItem('mountainHost',JSON.stringify({code:a.code,secret:a.secret}));});
 document.getElementById('join').onclick=()=>{const name=document.getElementById('name').value.trim(),code=document.getElementById('pin').value.trim();if(!name||!/^\d{6}$/.test(code))return toast('Enter name and 6-digit PIN');send('join',{name,code},a=>{role='student';sessionStorage.setItem('mountainPlayer',JSON.stringify({id:a.id,name,code}));});};
}
const eq=([mm,bb])=>`y = ${mm===1?'':mm}x${bb>0?' + '+bb:bb<0?' − '+Math.abs(bb):''}`;
function action(name){send('host:action',{action:name});}
function side(){
 if(!S)return '';
 const teacher=role==='teacher',queen=S.final,king=S.king,phase=S.phase;
 const title=queen?'👑 QUEEN OF THE ISLAND':king?'🌅 KING OF THE MOUNTAIN':`RACE ${S.round+1} / 3`;
 const seconds=king?(phase==='king-finished'?`${S.sunriseSeconds}s`:'???'):`${S.race.seconds}s`;
 let html=`<div class="card"><div class="minihead"><span class="chip">${title}</span><span class="chip">⏱ ${seconds}</span></div>`;
 if(teacher)html+=`<div class="notice" style="margin-top:14px">PIN <span class="bigpin">${esc(S.code)}</span></div>`;
 if(!queen&&!king){
  html+=`<div class="equations">${S.race.lines.map((line,i)=>`<div class="eq"><span class="letter">${letters[i]}</span><span class="n">${esc(S.names[i])}</span><span class="formula">${eq(line)}</span></div>`).join('')}</div>`;
  if(teacher){html+=`<div class="stat">${S.betCount} / ${S.joined} <span class="small">bets</span></div>`;if(phase==='betting')html+='<button class="btn yellow full" id="startRace">🏁 START RACE</button>';if(phase==='results')html+='<button class="btn yellow full" id="nextRace">NEXT →</button>';}
  else if(S.myBet?.round===S.round)html+=`<div class="locked">✓ ${esc(S.names[S.myBet.pick])} · ${S.myBet.amount} 🪙</div><div class="stat">${S.myTokens} 🪙</div>`;
  else if(phase==='betting'){
   const max=Math.min(3,S.myTokens||0);html+=`<div class="stat">${S.myTokens} 🪙</div>`;
   if(max){stake=clamp(stake,1,max);html+=`<div class="bets">${S.race.lines.map((_,i)=>`<button class="pick ${chosen===i?'sel':''}" data-pick="${i}"><span class="dot" style="background:${S.colors[i]}"></span>${esc(S.names[i])}</button>`).join('')}</div><div class="wager"><strong>Bet</strong><input id="wager" type="number" min="1" max="${max}" value="${stake}" step="1"><span class="small muted">max ${max}</span></div><button class="btn yellow full" id="betNow">✓ BET</button>`;}
   else html+='<div class="locked">0 🪙 · You can still watch!</div>';
  }else html+=`<div class="locked">${phase==='racing'?'🐢 Climbing…':'🏁 Race finished'}</div><div class="stat">${S.myTokens} 🪙</div>`;
 }else if(queen){
  html+=`<div class="goal"><b>🎯 AIM FOR THE ISLAND: 90 FEET!</b><span>At 20 seconds, get as close to 90 ft as you can. 60–120 ft = lake. Closest = Queen! Calculate it yourself.</span></div>`;
  if(teacher){html+=`<div class="stat">${S.builtCount} / ${S.joined} <span class="small">built</span></div>`;
   if(phase==='workshop')html+='<button class="btn yellow full" id="startRace">🏁 START ALL TURTLES</button>';
   if(phase==='final-racing')html+=`<div class="notice">All ${S.joined} student turtles climbing!</div>`;
   if(phase==='queen-finished')html+='<button class="btn yellow full" id="nextRace">🌅 NEXT: KING OF THE MOUNTAIN →</button>';
  }else if(phase==='workshop'){
   html+=`<div class="stat">${S.myTokens} 🪙 <span class="small">betting budget</span></div>`;
   if(S.myBuild)html+=`<div class="locked">✓ ${eq([S.myBuild.m,S.myBuild.b])}<div class="small">${S.myBuild.cost} 🪙 of your building allowance · coins saved for King</div></div>`;
   else html+=workshop(false);
  }else{
   html+=`<div class="stat">${S.myTokens} 🪙</div>`;
   if(S.myBuild)html+=`<div class="locked">${eq([S.myBuild.m,S.myBuild.b])}</div>`;
   if(S.myFinal)html+=`<div class="notice">${S.myChampion?'👑 QUEEN OF THE ISLAND!':S.myFinal.status==='safe'?'💦 You made the lake!':S.myFinal.status==='crash'?'💥 Overshot the lake!':'🏖️ On the beach'} · ${S.myFinal.height} ft</div>`;
   if(S.myQueenBonus!=null)html+=`<div class="reward">Place #${S.myQueenRank} · +${S.myQueenBonus} 🪙 for King of the Mountain!</div>`;
  }
 }else{
  const budget=S.myTokens+(S.myQueenBonus||0);
  html+=`<div class="goal"><b>🌅 HIGHEST WHEN THE SUN RISES WINS!</b><span>Sunrise is a surprise between 8 and 22 seconds. Spend on slope (+1 per coin) or a 10-foot head start (1 coin).</span></div>`;
  if(teacher){html+=`<div class="stat">${S.builtCount} / ${S.joined} <span class="small">ready</span></div>`;
   if(phase==='king-workshop')html+='<button class="btn yellow full" id="startRace">🌙 START NIGHT RACE</button>';
   if(phase==='king-racing')html+='<div class="locked">🌙 Waiting for surprise sunrise…</div>';
  }else if(phase==='king-workshop'){
   html+=`<div class="stat">${S.myTokens} 🪙 + ${S.myQueenBonus||0} 🪙 = <b>${budget} 🪙</b></div>`;
   if(S.myBuild)html+=`<div class="locked">✓ Sunrise turtle: ${eq([S.myBuild.m,S.myBuild.b])}</div>`;
   else html+=workshop(true);
  }else{html+=`<div class="stat">Budget: ${budget} 🪙</div><div class="locked">${S.myBuild?eq([S.myBuild.m,S.myBuild.b]):'Turtle ready'}</div>`;
   if(S.myKingHeight!=null)html+=`<div class="resultline">🌅 Your height: ${S.myKingHeight} ft</div>`;
  }
 }
 html+='</div>';
 if(['results','queen-finished','king-finished'].includes(phase)){
  const board=S.leaderboard||[];
  if(phase==='results')html+=`<div class="card"><h2>🏆 ${esc(S.winners?.map(i=>S.names[i]).join(' + ')||'Winner')}</h2>${role==='student'&&S.myBet?`<div class="resultline">${S.winners?.includes(S.myBet.pick)?'🎉 Won!':'🐢 Not this time!'}</div>`:''}${leader(board,'bet')}</div>`;
  if(phase==='queen-finished')html+=`<div class="card"><h2>👑 QUEEN OF THE ISLAND</h2><div class="notice">Ranked by accuracy. Ties share rank. Add the placement bonus to betting coins for King's race.</div><div class="resultline">👑 ${S.champions.map(esc).join(' & ')||'No island queen'} · 💦 ${S.swimmerCount} swimming</div>${leader(board,'queen')}</div>`;
  if(phase==='king-finished')html+=`<div class="card"><h2>🌅 SUNRISE! KING OF THE MOUNTAIN</h2><div class="resultline">Sun rose at ${S.sunriseSeconds} seconds!</div>${leader(board,'king')}</div>`;
 }
 if(teacher&&['betting','results','workshop','queen-finished','king-workshop','king-finished'].includes(phase))html+='<button class="btn secondary full" id="reset" style="margin-top:12px">↻ Reset</button>';
 return html;
}
function workshop(king){
 const budget=king?S.myTokens+(S.myQueenBonus||0):S.myTokens,free=!king&&budget<3;
 const cost=free?0:m+b/10,valid=free||cost<=budget;
 return `<div class="notice">${free?'Free y = 3x for students with under 3 coins':'1 coin = +1 slope OR +10 ft starting height'}</div><div class="upgrade"><div class="buildrow"><span>Slope (m)</span><button class="step" data-step="m:-1">−</button><b>${m}</b><button class="step" data-step="m:1">+</button></div><div class="buildrow"><span>Head start (b)</span><button class="step" data-step="b:-1">−</button><b>${b} ft</b><button class="step" data-step="b:1">+</button></div><div class="buildEq">${eq([m,b])}</div><div class="notice">${free?'Free fallback turtle (y = 3x)':'Cost: '+cost+' 🪙 · Unspent: '+(budget-cost)+' 🪙'}</div><button class="btn yellow full" id="lockBuild" ${valid?'':'disabled'}>✓ BUILD TURTLE</button></div>`;
}
function leader(board,mode){return `<table class="leader">${board.slice(0,40).map((p,i)=>`<tr><td>${mode==='queen'?'#'+p.queenRank: i<3?['🥇','🥈','🥉'][i]:i+1+'.'} ${esc(p.name)}</td><td>${mode==='queen'?`+${p.queenBonus} 🪙 · ${p.final?.height??'—'} ft`:mode==='king'?`${p.kingHeight??'—'} ft`:p.tokens+' 🪙'}</td></tr>`).join('')}</table>`;}
function draw(){if(!S)return welcome();const phase=S.phase;const sky=S.race?.scene||'night';
 main.innerHTML=`<div class="game"><div class="side">${side()}</div><section class="scene ${sky}"><div class="sceneTop">${S.king?'🌅 KING OF THE MOUNTAIN':S.final?'👑 QUEEN OF THE ISLAND':phase==='racing'?'🐢 CLIMB!':'🐢 MOUNTAIN CLIMB'}</div><div id="mountain"></div><div class="sceneBottom">${S.king?phase==='king-workshop'?'🔧 BUILD YOUR SUNRISE TURTLE':phase==='king-finished'?'🌅 SUNRISE!':'🌙 THE SUN CAN RISE ANY MOMENT':S.final?phase==='workshop'?'🎯 AIM FOR 90 FEET':phase==='queen-finished'?'👑 QUEEN & LAKE SWIMMERS':`ALL ${S.joined} TURTLES CLIMBING`:phase==='betting'?`${S.betCount} BETS`:'🏁 '+S.race.seconds+' SECONDS'}</div></section></div>`;
 for(const button of main.querySelectorAll('[data-pick]'))button.onclick=()=>{chosen=Number(button.dataset.pick);draw();};
 const bet=document.getElementById('betNow');if(bet)bet.onclick=()=>{const max=Math.min(3,S.myTokens);stake=clamp(Math.floor(Number(document.getElementById('wager').value)||1),1,max);send('bet',{pick:chosen,amount:stake});};
 for(const step of main.querySelectorAll('[data-step]'))step.onclick=()=>{const [which,delta]=step.dataset.step.split(':');if(S.final&&S.myTokens<3)return; if(which==='m')m=clamp(m+Number(delta),1,S.king?60:15);else b=clamp(b+Number(delta)*10,0,S.king?600:150);draw();};
 const build=document.getElementById('lockBuild');if(build)build.onclick=()=>send(S.king?'king:build':'build',{m,b});
 const start=document.getElementById('startRace');if(start)start.onclick=()=>action('start');
 const next=document.getElementById('nextRace');if(next)next.onclick=()=>action('next');
 const reset=document.getElementById('reset');if(reset)reset.onclick=()=>{if(confirm('Reset scores and return to Sunrise?'))action('reset');};
 if(raf)cancelAnimationFrame(raf);animate();
}
function terrain(scene){const c={sunrise:['#ffe6b3','#f9aa9a','#719e83'],day:['#91d9ef','#d6f5e9','#61977c'],sunset:['#917ac0','#f5a18d','#6a7a94'],night:['#1c2e58','#526197','#345968']}[scene]||['#1c2e58','#526197','#345968'];const night=scene==='night';let stars='';if(night)for(let i=0;i<56;i++)stars+=`<circle cx="${(i*173+37)%1000}" cy="${(i*57+23)%250}" r="${i%6===0?2:1}" fill="#fff8c9" opacity=".85"/>`;
 return `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${c[0]}"/><stop offset=".75" stop-color="${c[1]}"/></linearGradient></defs><rect width="1000" height="600" fill="url(#sky)"/>${stars}<circle cx="865" cy="93" r="${night?35:49}" fill="${night?'#fff5d6':'#ffedb3'}"/><path d="M0 455L115 290L255 415L420 155L562 390L737 210L890 387L1000 277V600H0Z" fill="${night?'#50647b':'#abb7ac'}"/><path d="M0 550L200 350L365 501L518 283L700 498L859 312L1000 438V600H0Z" fill="${c[2]}"/><path d="M0 552Q180 503 340 555T670 548T1000 547V600H0Z" fill="${night?'#254d55':'#4c936d'}"/>${Array.from({length:12},(_,i)=>{const x=(i*107+10)%980,y=520+(i%3)*19;return `<path d="M${x} ${y}l-15 0 12-27-9 0 12-27 12 27-9 0 12 27z" fill="${night?'#153d4c':'#2b7954'}"/>`;}).join('')}`;}
function turtle(x,y,color,name,i,good,crash){let bob=Math.sin(Date.now()/160+i*1.3)*2;const sad=crash||good===false;return `<g transform="translate(${x.toFixed(1)},${(y+bob).toFixed(1)})" style="filter:drop-shadow(0 4px 3px #10293870)"><ellipse cx="-10" cy="18" rx="12" ry="6" fill="#86c865"/><ellipse cx="11" cy="19" rx="11" ry="6" fill="#86c865"/><ellipse cx="0" cy="0" rx="26" ry="22" fill="${color}" stroke="#234753" stroke-width="3"/><path d="M-14-12Q0-1 15-13M-20 5Q0 14 18 6" fill="none" stroke="#ffffff85" stroke-width="2"/><ellipse cx="24" cy="-5" rx="15" ry="13" fill="#91d36b" stroke="#234753" stroke-width="3"/><ellipse cx="28" cy="-10" rx="5" ry="6" fill="white"/><circle cx="29" cy="-10" r="3" fill="#1b3944"/><path d="${sad?'M19 6Q25 -1 32 6':'M19 3Q25 11 32 3'}" fill="none" stroke="#234753" stroke-width="2.5"/>${i%3===0?'<path d="M-10-22l4-14 14 9 8-12 4 16" fill="#f9d56f" stroke="#ad8547" stroke-width="2"/>':i%3===1?'<path d="M-18-21Q0-38 16-19l-2 5h-29z" fill="#f4d278"/>':'<path d="M15-13h22" stroke="#263e58" stroke-width="5"/>'}<text x="0" y="-42" fill="white" text-anchor="middle" paint-order="stroke" stroke="#224251" stroke-width="4" font-size="16" font-weight="900">${esc(name)}</text>${crash?'<text x="0" y="-66" text-anchor="middle" font-size="24">💥</text>':good===true?'<text x="0" y="-66" text-anchor="middle" font-size="22">🏆</text>':''}</g>`;}
function sceneSVG(){if(!S?.race)return '';const r=S.race,final=S.final,king=S.king,n=r.lines.length;
 const maxVal=Math.max(final?120:0,...r.lines.map(([mm,bb])=>mm*r.seconds+bb))+15;
 const maxY=Math.ceil(maxVal/20)*20;
 const X=t=>120+780*t/r.seconds,Y=y=>525-390*y/maxY;
 let time=0,show=false;
 if(['racing','final-racing','king-racing'].includes(S.phase)){time=clamp((Date.now()-S.startAt)/1000,0,r.seconds);show=Date.now()>=S.startAt;}
 else if(['results','queen-finished','king-finished'].includes(S.phase)){time=r.seconds;show=true;}
 const hidden=['betting','workshop','king-workshop'].includes(S.phase);
 let grid='';for(let i=0;i<=4;i++){const y=i*maxY/4;grid+=`<line x1="105" y1="${Y(y)}" x2="920" y2="${Y(y)}" stroke="#fff" opacity=".24"/><text x="94" y="${Y(y)+5}" text-anchor="end" fill="#fff" stroke="#243e50" stroke-width="3" paint-order="stroke" font-weight="900">${y}</text>`;}
 let plateau='';if(final){const a=Y(S.plateau.high),bb=Y(S.plateau.low),middle=Y((S.plateau.high+S.plateau.low)/2);
 // The lake exists ONLY at the horizontal finish line; it is not a band along the climb.
 plateau=`<rect x="890" y="${a}" width="53" height="${bb-a}" rx="12" fill="#48d5e3" opacity=".9" stroke="#ffffff" stroke-width="3"/><path d="M893 ${a+12}q12 -10 24 0t24 0" fill="none" stroke="#d9ffff" stroke-width="3"/><ellipse cx="913" cy="${middle}" rx="16" ry="7" fill="#f4d18b" stroke="#fff2b1" stroke-width="2"/><text x="911" y="${a-15}" text-anchor="middle" font-size="17" font-weight="900" fill="white" stroke="#194354" stroke-width="3" paint-order="stroke">LAKE</text><text x="960" y="${(a+bb)/2}" font-size="13" fill="white" font-weight="900" transform="rotate(90 960 ${(a+bb)/2})" text-anchor="middle">${S.plateau.low}–${S.plateau.high}ft</text>`;
 }
 let paths='';for(let i=0;i<n;i++){
  const [mm,bb]=r.lines[i],x0=X(0),y0=Y(bb),xx=X(time),yy=Y(mm*time+bb);
  const color=S.colors[i%S.colors.length],name=S.names[i];
  if(hidden){
   if(!final&&!king)paths+=turtle(x0,y0,color,name,i,null,false);
   if(king){const own=name===S.myName;paths+=`<circle cx="${x0}" cy="${y0}" r="${own?11:7}" fill="${color}" stroke="#153c4a" stroke-width="2"/><circle cx="${x0+5}" cy="${y0-4}" r="4" fill="#a5dc77"/>${own?`<text x="${x0}" y="${y0-20}" text-anchor="middle" fill="white" stroke="#254553" stroke-width="3" paint-order="stroke">${esc(name)}</text>`:''}`;}
   continue;
  }
  if(show){
   const status=final&&S.heatTurtles[i]?.status,champion=final&&S.heatTurtles[i]?.champion;
   const crash=final&&S.phase==='queen-finished'&&status==='crash';
   const success=final&&S.phase==='queen-finished'?champion:(!final&&!king&&S.phase==='results'?S.winners.includes(i):null);
   // Thirty racers: miniatures without overlapping names; student highlights their own turtle.
   const mini=(final||king)&&n>8;
   paths+=`<path d="M${x0} ${y0}L${xx} ${yy}" fill="none" stroke="${color}" stroke-width="${mini?3:8}" opacity="${mini?.55:.95}" stroke-linecap="round"/>`;
   if(mini){const own=name===S.myName;const radius=own?11:6;
    paths+=`<circle cx="${xx}" cy="${yy}" r="${radius}" fill="${color}" stroke="${champion?'#ffe98e':own?'#ffffff':'#163c4a'}" stroke-width="${champion?4:2}"/><circle cx="${xx+radius*.55}" cy="${yy-3}" r="${radius*.55}" fill="#9dda6e" stroke="#163c4a" stroke-width="1"/>`;
    if(champion||own)paths+=`<text x="${xx}" y="${yy-18}" text-anchor="middle" font-size="${own?18:14}" font-weight="900" fill="white" stroke="#173d49" stroke-width="3" paint-order="stroke">${esc(name)}</text>`;
   }else paths+=turtle(xx,yy,color,name,i,success,crash);
  }
 }
 if(final&&S.phase==='queen-finished'){
  const turtles=S.heatTurtles||[];
  const wet=turtles.filter(t=>t.status==='safe');
  const dry=turtles.filter(t=>t.status!=='safe');
  const queens=wet.filter(t=>t.champion);
  const crownNames=queens.map(t=>esc(t.name)).join(' & ');
  const t=Date.now()/1000;
  function miniTurtle(x,y,color,name,i,queen=false){
   const wave=Math.sin(t*2+i*1.7)*3;
   return `<g transform="translate(${x.toFixed(1)} ${(y+wave).toFixed(1)})"><ellipse cx="-2" cy="7" rx="18" ry="6" fill="#ffffff80"/><ellipse cx="0" cy="0" rx="17" ry="12" fill="${color}" stroke="#254b58" stroke-width="2.5"/><circle cx="16" cy="-5" r="10" fill="#a1d870" stroke="#254b58" stroke-width="2"/><circle cx="19" cy="-7" r="2" fill="#213d47"/><path d="M15-1Q20 4 24-1" fill="none" stroke="#254b58" stroke-width="1.6"/>${queen?'<path d="M-13 -17L-9 -31L-2 -24L5 -34L12 -18Z" fill="#fbd767" stroke="#b98b27" stroke-width="2"/>':''}<text x="0" y="-24" font-size="${queen?17:12}" text-anchor="middle" font-weight="900" fill="white" stroke="#20495d" stroke-width="3" paint-order="stroke">${esc(name)}</text></g>`;
  }
  const water=wet.map((tu,i)=>{
   // Queen stays on the island; every other successful turtle gets a swimming spot.
   if(tu.champion)return '';
   const col=i%6,row=Math.floor(i/6);
   const x=col<3?217+col*70:643+(col-3)*70;
   return miniTurtle(x,286+row*29,tu.color,tu.name,i);
  }).join('');
  const islandPeople=queens.map((tu,i)=>miniTurtle(500+((i%5)-Math.min(queens.length-1,4)/2)*44,345+Math.floor(i/5)*35,tu.color,tu.name,100+i,true)).join('');
  const beach=dry.map((tu,i)=>{
   const col=i%10,row=Math.floor(i/10);
   const x=95+col*89,y=475+row*32;
   return `<g>${miniTurtle(x,y,tu.color,tu.name,200+i)}${i%3===0?`<path d="M${x-20} ${y+17}q20 7 42 0" stroke="#bd8f58" stroke-width="2" fill="none"/>`:''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Queen of the Island: successful student turtles swimming, the closest on an island, other turtles playing on the beach"><g>${terrain('day')}</g>
   <path d="M0 435 Q100 405 183 418 Q550 453 822 418 Q931 395 1000 424V600H0Z" fill="#efd49a" stroke="#fff0c2" stroke-width="5"/>
   <ellipse cx="500" cy="356" rx="407" ry="132" fill="#33b9c9" stroke="#e3ffff" stroke-width="9"/>
   <ellipse cx="505" cy="363" rx="340" ry="91" fill="#70e2e0" opacity=".45"/>
   <ellipse cx="500" cy="371" rx="98" ry="43" fill="#ead59b" stroke="#fff3c4" stroke-width="5"/><ellipse cx="500" cy="381" rx="69" ry="20" fill="#b8d185" opacity=".6"/>
   <text x="500" y="85" text-anchor="middle" font-size="45" font-weight="900" fill="#fff9dc" stroke="#245467" stroke-width="6" paint-order="stroke">👑 QUEEN OF THE ISLAND! 👑</text>
   <text x="500" y="133" text-anchor="middle" font-size="24" font-weight="900" fill="#fff" stroke="#285b68" stroke-width="4" paint-order="stroke">${queens.length?crownNames:'No queen this time — try another race!'}</text>
   <text x="500" y="175" text-anchor="middle" font-size="22" font-weight="900" fill="#fff" stroke="#285b68" stroke-width="4" paint-order="stroke">💦 ${wet.length} SWIMMING · 🏖️ ${dry.length} ON THE BEACH</text>
   ${water}${islandPeople}${beach}
   <text x="500" y="583" text-anchor="middle" font-size="16" font-weight="900" fill="#6d4b2e">Everyone made it to the beach party!</text></svg>`;
 }
 const zoom=!final&&!king&&['racing','results'].includes(S.phase)?Math.pow(clamp((time/r.seconds-.68)/.32,0,1),1.5):0;
 const lead=Math.max(0,...r.lines.map(([mm,bb])=>mm*time+bb));
 const vw=1000-330*zoom,vh=600-198*zoom,vx=310*zoom,vy=clamp(Y(lead)-190,0,150)*zoom;
 const view=`${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
 const elapsed=(Date.now()-(S.startAt||Date.now()))/1000;
 const dawn=king&&S.phase==='king-racing'?clamp((elapsed-3)/19,0,.56):0;
 const sunrise=king&&S.phase==='king-finished';
 const dawnVisual=king?`<rect width="1000" height="600" fill="#f8b27e" opacity="${sunrise?.60:dawn}"/><circle cx="866" cy="${sunrise?100:180}" r="53" fill="#fff0a1" opacity="${sunrise?1:0}"/>`:'';
 const kingWinner=king&&sunrise?S.heatTurtles.filter(t=>t.kingHeight===Math.max(...S.heatTurtles.map(v=>v.kingHeight))).map(t=>t.name):[];
 const kingBanner=king&&sunrise?`<rect x="220" y="40" width="560" height="100" rx="25" fill="#fff8d8" stroke="#f7cc68" stroke-width="6"/><text x="500" y="82" text-anchor="middle" font-size="31" font-weight="900" fill="#735128">🌅 KING OF THE MOUNTAIN!</text><text x="500" y="119" text-anchor="middle" font-size="23" font-weight="900" fill="#65461f">${esc(kingWinner.join(' & '))}</text>`:'';
 const overtake=(!final&&!king&&S.phase==='racing')?r.lines.flatMap(([ma,ba],i)=>r.lines.slice(i+1).flatMap(([mb,bb],j)=>{const cross=(bb-ba)/(ma-mb);return Number.isFinite(cross)&&cross>1&&cross<r.seconds&&Math.abs(time-cross)<.35?[`<text x="${X(cross)}" y="${Y(ma*cross+ba)-49}" text-anchor="middle" font-size="25" font-weight="900" fill="#ffe88b" stroke="#244352" stroke-width="4" paint-order="stroke">ZOOM!</text>`]:[];})).join(''):'';
 return `<svg viewBox="${view}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mountain paths with exact linear equations"><g>${terrain(r.scene)}</g>${dawnVisual}${grid}<path d="M120 112V525H925" stroke="#e8f3de" stroke-width="4" fill="none" opacity=".7"/><text x="120" y="554" text-anchor="middle" fill="white" font-weight="900">0s</text><text x="915" y="554" text-anchor="end" fill="white" font-weight="900">${king&&S.phase!=='king-finished'?'SUNRISE ?':r.seconds+'s'}</text><text x="36" y="320" transform="rotate(-90 36 320)" text-anchor="middle" fill="white" font-weight="900">ELEVATION</text>${plateau}${paths}${overtake}${kingBanner}${show?`<text x="500" y="578" text-anchor="middle" fill="white" stroke="#153f48" stroke-width="3" paint-order="stroke" font-size="22" font-weight="900">${king?time.toFixed(1)+'s · SUNRISE ???':time.toFixed(1)+' / '+r.seconds+'s'}</text>`:''}</svg>`;
}
function animate(){const mount=document.getElementById('mountain');if(!mount)return;mount.innerHTML=sceneSVG();if(['racing','final-racing','king-racing'].includes(S?.phase)||(S?.final&&S?.phase==='queen-finished'))raf=requestAnimationFrame(animate);else raf=null;}
if(!sock.connected)welcome();
