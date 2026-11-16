'use strict';
const sock=io(),main=document.getElementById('main'),net=document.getElementById('network');
let S=null,role='',chosen=0,stake=1,m=3,b=0,previous='',raf=null;
const letters='ABCDE';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
const toast=message=>{let el=document.getElementById('toast');el.textContent=message;el.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>el.style.display='none',3200);};
function send(ev,obj,success){sock.emit(ev,obj,answer=>{if(!answer?.ok)return toast(answer?.error||'Connection error');success?.(answer);});}
function stored(key){try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}}
function reconnect(){let host=stored('mountainHost'),player=stored('mountainPlayer');if(host)return send('host:rejoin',host,()=>role='teacher');if(player)return send('join',player,()=>role='student');welcome();}
sock.on('connect',()=>{net.textContent='● connected';reconnect();});sock.on('disconnect',()=>net.textContent='● reconnecting');
sock.on('state',data=>{const phaseChanged=data.phase!==S?.phase||data.round!==S?.round;S=data;role=data.isTeacher?'teacher':data.myName?'student':role;if(phaseChanged){chosen=0;stake=1;m=3;b=0;}draw();});
function welcome(){if(S)return;main.innerHTML=`<div class="startwrap"><div class="card startart"><div class="big">🐢 ⛰️</div><p>Sunrise to moonlight</p><div class="introTurtles">🌅 🌇 🌙 🏔️</div></div><div class="card flexcol"><h1>Turtle<br>Mountain<br>Climb!</h1><div class="muted">5 🪙 · 3 races · Alpine Lake Championship</div><button class="btn yellow" id="host">Teacher — Create game</button><hr style="width:100%;border:1px solid #e6dbc9"><input id="name" class="field" maxlength="24" placeholder="Name" autocomplete="off"><input id="pin" class="field" maxlength="6" inputmode="numeric" placeholder="Game PIN"><button class="btn" id="join">Join</button></div></div>`;
 document.getElementById('host').onclick=()=>send('create',{},a=>{role='teacher';sessionStorage.setItem('mountainHost',JSON.stringify({code:a.code,secret:a.secret}));});
 document.getElementById('join').onclick=()=>{const name=document.getElementById('name').value.trim(),code=document.getElementById('pin').value.trim();if(!name||!/^\d{6}$/.test(code))return toast('Enter name and 6-digit PIN');send('join',{name,code},a=>{role='student';sessionStorage.setItem('mountainPlayer',JSON.stringify({id:a.id,name,code}));});};
}
const eq=([mm,bb])=>`y = ${mm===1?'':mm}x${bb>0?' + '+bb:bb<0?' − '+Math.abs(bb):''}`;
function action(name){send('host:action',{action:name});}
function side(){if(!S)return '';
 const isFinal=S.final,teacher=role==='teacher';
 const title=isFinal?'🏔️ ALPINE LAKE':`RACE ${S.round+1} / 3`;
 const duration=S.race?.seconds||0;
 let html=`<div class="card"><div class="minihead"><span class="chip">${title}</span><span class="chip">⏱ ${duration}s</span></div>`;
 if(teacher)html+=`<div class="notice" style="margin-top:14px">PIN <span class="bigpin">${esc(S.code)}</span></div>`;
 if(!isFinal){html+=`<div class="equations">${S.race.lines.map((line,i)=>`<div class="eq"><span class="letter">${letters[i]}</span><span class="n">${esc(S.names[i])}</span><span class="formula">${eq(line)}</span></div>`).join('')}</div>`;
 if(teacher){html+=`<div class="stat">${S.betCount} / ${S.joined} <span class="small">bets</span></div>`;if(S.phase==='betting')html+='<button class="btn yellow full" id="startRace">🏁 START RACE</button>';if(S.phase==='results')html+='<button class="btn yellow full" id="nextRace">NEXT →</button>';}
 else if(S.myBet?.round===S.round)html+=`<div class="locked">✓ ${esc(S.names[S.myBet.pick])} · ${S.myBet.amount} 🪙</div><div class="stat">${S.myTokens} 🪙</div>`;
 else if(S.phase==='betting'){
  const max=Math.min(3,S.myTokens||0);html+=`<div class="stat">${S.myTokens} 🪙</div>`;
  if(max){stake=clamp(stake,1,max);html+=`<div class="bets">${S.race.lines.map((_,i)=>`<button class="pick ${chosen===i?'sel':''}" data-pick="${i}"><span class="dot" style="background:${S.colors[i]}"></span>${esc(S.names[i])}</button>`).join('')}</div><div class="wager"><strong>Bet</strong><input id="wager" type="number" min="1" max="${max}" value="${stake}" step="1"><span class="small muted">max ${max}</span></div><button class="btn yellow full" id="betNow">✓ BET</button>`;}
  else html+='<div class="locked">0 🪙 · You can still watch!</div>';
 }else html+=`<div class="locked">${S.phase==='racing'?'🐢 Climbing…':'🏁 Race finished'}</div><div class="stat">${S.myTokens} 🪙</div>`;
 }else{
  html+=`<div class="notice" style="margin:12px 0">LAKE AT FINISH: ${S.plateau.low}–${S.plateau.high} ft</div>`;
  if(teacher){html+=`<div class="stat">${S.builtCount} / ${S.joined} <span class="small">built</span></div>`;
   if(S.phase==='workshop')html+='<button class="btn yellow full" id="startRace">🏁 START ALL TURTLES</button>';
   
   if(S.phase==='final-racing')html+=`<div class="notice">All ${S.joined} student turtles racing!</div>`;
  }else if(S.phase==='workshop'){
   html+=`<div class="stat">${S.myTokens} 🪙</div>`;
   if(S.myBuild)html+=`<div class="locked">✓ ${eq([S.myBuild.m,S.myBuild.b])}<div class="small">${S.myBuild.cost} 🪙 spent</div></div>`;
   else{const free=S.myTokens<3;const cost=free?0:m+b/10,balance=S.myTokens,valid=free||cost<=balance;html+=`<div class="notice">${free?"Fewer than 3 coins: free y = 3x":"Every +1 slope costs 1 🪙; each +10 ft head start costs 1 🪙"}</div><div class="upgrade"><div class="buildrow"><span>Climb slope (m)</span><button class="step" data-step="m:-1">−</button><b>${m}</b><button class="step" data-step="m:1">+</button></div><div class="buildrow"><span>Head start (+10 ft)</span><button class="step" data-step="b:-1">−</button><b>${b}</b><button class="step" data-step="b:1">+</button></div><div class="buildEq">${eq([m,b])}</div><div class="notice">${free?"Free fallback turtle (y = 3x)":"Cost: "+cost+" 🪙 · Left: "+(balance-cost)+" 🪙"}</div><button class="btn yellow full" id="lockBuild" ${valid?'':'disabled'}>✓ BUILD TURTLE</button></div>`;}
  }else{html+=`<div class="stat">${S.myTokens} 🪙</div><div class="locked">${S.myBuild?eq([S.myBuild.m,S.myBuild.b]):'Build locked'}</div>`;
  if(S.myFinal)html+=`<div class="notice">${S.myChampion?'🏆 ALPINE LAKE CHAMPION!':S.myFinal.status==='safe'?'💦 Safe lake landing!':S.myFinal.status==='crash'?'💥 Overshot the lake!':'🐢 Below the lake'} · ${S.myFinal.height} ft</div>`;
  }
 }
 html+='</div>';
 if(['results','final-results','finished'].includes(S.phase)){
  const board=S.leaderboard||[];
  if(!isFinal)html+=`<div class="card"><h2>🏆 ${esc(S.winners?.map(i=>S.names[i]).join(' + ')||'Winner')}</h2>${role==='student'&&S.myBet?`<div class="resultline">${S.winners?.includes(S.myBet.pick)?'🎉 Won!':'🐢 Not this time!'}</div>`:''}${leader(board,false)}</div>`;
  else{html+=`<div class="card"><h2>${S.phase==='finished'?'🏆 ALPINE LAKE CHAMPIONS':'🏔️ Alpine Lake'}</h2><div class="notice">Closest to the center of the lake win. Ties favor fewer coins spent.</div>${S.phase==='finished'?`<div class="resultline">💦 ${S.champions.map(esc).join(' · ')||'No successful landings this round'}</div>${leader(board,true)}`:''}</div>`;}

 }
 if(teacher&&['betting','results','workshop','final-results','finished'].includes(S.phase))html+='<button class="btn secondary full" id="reset" style="margin-top:12px">↻ Reset</button>';
 return html;
}
function leader(board,final){return `<table class="leader">${board.slice(0,12).map((p,i)=>`<tr><td>${i<3?['🥇','🥈','🥉'][i]:i+1+'.'} ${esc(p.name)}</td><td>${final?(p.final?.status==='safe'?p.final.height+' ft'+(p.champion?' 🏆':''):p.final?.status==='crash'?'💥':'—'):p.tokens+' 🪙'}</td></tr>`).join('')}</table>`;}
function draw(){if(!S)return welcome();const phase=S.phase;const sky=S.race?.scene||'night';
 main.innerHTML=`<div class="game"><div class="side">${side()}</div><section class="scene ${sky}"><div class="sceneTop">${S.final?'🏔️ ALPINE LAKE':phase==='racing'?'🐢 CLIMB!':'🐢 MOUNTAIN CLIMB'}</div><div id="mountain"></div><div class="sceneBottom">${S.final?phase==='workshop'?'🔧 TURTLE WORKSHOP':phase==='finished'?'💦 FIVE LAKE CHAMPIONS':`ALL ${S.joined} TURTLES RACING`:phase==='betting'?`${S.betCount} BETS`:'🏁 '+S.race.seconds+' SECONDS'}</div></section></div>`;
 for(const button of main.querySelectorAll('[data-pick]'))button.onclick=()=>{chosen=Number(button.dataset.pick);draw();};
 const bet=document.getElementById('betNow');if(bet)bet.onclick=()=>{const max=Math.min(3,S.myTokens);stake=clamp(Math.floor(Number(document.getElementById('wager').value)||1),1,max);send('bet',{pick:chosen,amount:stake});};
 for(const step of main.querySelectorAll('[data-step]'))step.onclick=()=>{const [which,delta]=step.dataset.step.split(':');if(S.myTokens<3)return; if(which==='m')m=clamp(m+Number(delta),1,15);else b=clamp(b+Number(delta)*10,0,150);draw();};
 const build=document.getElementById('lockBuild');if(build)build.onclick=()=>send('build',{m,b});
 const start=document.getElementById('startRace');if(start)start.onclick=()=>action('start');
 const next=document.getElementById('nextRace');if(next)next.onclick=()=>action('next');
 const reset=document.getElementById('reset');if(reset)reset.onclick=()=>{if(confirm('Reset scores and return to Sunrise?'))action('reset');};
 if(raf)cancelAnimationFrame(raf);animate();
}
function terrain(scene){const c={sunrise:['#ffe6b3','#f9aa9a','#719e83'],day:['#91d9ef','#d6f5e9','#61977c'],sunset:['#917ac0','#f5a18d','#6a7a94'],night:['#1c2e58','#526197','#345968']}[scene]||['#1c2e58','#526197','#345968'];const night=scene==='night';let stars='';if(night)for(let i=0;i<56;i++)stars+=`<circle cx="${(i*173+37)%1000}" cy="${(i*57+23)%250}" r="${i%6===0?2:1}" fill="#fff8c9" opacity=".85"/>`;
 return `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${c[0]}"/><stop offset=".75" stop-color="${c[1]}"/></linearGradient></defs><rect width="1000" height="600" fill="url(#sky)"/>${stars}<circle cx="865" cy="93" r="${night?35:49}" fill="${night?'#fff5d6':'#ffedb3'}"/><path d="M0 455L115 290L255 415L420 155L562 390L737 210L890 387L1000 277V600H0Z" fill="${night?'#50647b':'#abb7ac'}"/><path d="M0 550L200 350L365 501L518 283L700 498L859 312L1000 438V600H0Z" fill="${c[2]}"/><path d="M0 552Q180 503 340 555T670 548T1000 547V600H0Z" fill="${night?'#254d55':'#4c936d'}"/>${Array.from({length:12},(_,i)=>{const x=(i*107+10)%980,y=520+(i%3)*19;return `<path d="M${x} ${y}l-15 0 12-27-9 0 12-27 12 27-9 0 12 27z" fill="${night?'#153d4c':'#2b7954'}"/>`;}).join('')}`;}
function turtle(x,y,color,name,i,good,crash){let bob=Math.sin(Date.now()/160+i*1.3)*2;const sad=crash||good===false;return `<g transform="translate(${x.toFixed(1)},${(y+bob).toFixed(1)})" style="filter:drop-shadow(0 4px 3px #10293870)"><ellipse cx="-10" cy="18" rx="12" ry="6" fill="#86c865"/><ellipse cx="11" cy="19" rx="11" ry="6" fill="#86c865"/><ellipse cx="0" cy="0" rx="26" ry="22" fill="${color}" stroke="#234753" stroke-width="3"/><path d="M-14-12Q0-1 15-13M-20 5Q0 14 18 6" fill="none" stroke="#ffffff85" stroke-width="2"/><ellipse cx="24" cy="-5" rx="15" ry="13" fill="#91d36b" stroke="#234753" stroke-width="3"/><ellipse cx="28" cy="-10" rx="5" ry="6" fill="white"/><circle cx="29" cy="-10" r="3" fill="#1b3944"/><path d="${sad?'M19 6Q25 -1 32 6':'M19 3Q25 11 32 3'}" fill="none" stroke="#234753" stroke-width="2.5"/>${i%3===0?'<path d="M-10-22l4-14 14 9 8-12 4 16" fill="#f9d56f" stroke="#ad8547" stroke-width="2"/>':i%3===1?'<path d="M-18-21Q0-38 16-19l-2 5h-29z" fill="#f4d278"/>':'<path d="M15-13h22" stroke="#263e58" stroke-width="5"/>'}<text x="0" y="-42" fill="white" text-anchor="middle" paint-order="stroke" stroke="#224251" stroke-width="4" font-size="16" font-weight="900">${esc(name)}</text>${crash?'<text x="0" y="-66" text-anchor="middle" font-size="24">💥</text>':good===true?'<text x="0" y="-66" text-anchor="middle" font-size="22">🏆</text>':''}</g>`;}
function sceneSVG(){if(!S?.race)return '';const r=S.race,final=S.final,n=r.lines.length;
 const maxVal=Math.max(final?120:0,...r.lines.map(([mm,bb])=>mm*r.seconds+bb))+15;
 const maxY=Math.ceil(maxVal/20)*20;
 const X=t=>120+780*t/r.seconds,Y=y=>525-390*y/maxY;
 let time=0,show=false;
 if(['racing','final-racing'].includes(S.phase)){time=clamp((Date.now()-S.startAt)/1000,0,r.seconds);show=Date.now()>=S.startAt;}
 else if(['results','final-results','finished'].includes(S.phase)){time=r.seconds;show=true;}
 const hidden=['betting','workshop'].includes(S.phase);
 let grid='';for(let i=0;i<=4;i++){const y=i*maxY/4;grid+=`<line x1="105" y1="${Y(y)}" x2="920" y2="${Y(y)}" stroke="#fff" opacity=".24"/><text x="94" y="${Y(y)+5}" text-anchor="end" fill="#fff" stroke="#243e50" stroke-width="3" paint-order="stroke" font-weight="900">${y}</text>`;}
 let plateau='';if(final){const a=Y(S.plateau.high),bb=Y(S.plateau.low);
 // The lake exists ONLY at the horizontal finish line; it is not a band along the climb.
 plateau=`<rect x="890" y="${a}" width="53" height="${bb-a}" rx="12" fill="#48d5e3" opacity=".9" stroke="#ffffff" stroke-width="3"/><path d="M893 ${a+12}q12 -10 24 0t24 0" fill="none" stroke="#d9ffff" stroke-width="3"/><text x="911" y="${a-15}" text-anchor="middle" font-size="17" font-weight="900" fill="white" stroke="#194354" stroke-width="3" paint-order="stroke">LAKE</text><text x="960" y="${(a+bb)/2}" font-size="13" fill="white" font-weight="900" transform="rotate(90 960 ${(a+bb)/2})" text-anchor="middle">${S.plateau.low}–${S.plateau.high}ft</text>`;
 }
 let paths='';for(let i=0;i<n;i++){
  const [mm,bb]=r.lines[i],x0=X(0),y0=Y(bb),xx=X(time),yy=Y(mm*time+bb);
  const color=S.colors[i%S.colors.length],name=S.names[i];
  if(hidden){if(!final)paths+=`<circle cx="${x0}" cy="${y0}" r="10" fill="#fff7db" stroke="#213f51" stroke-width="2.5"/><text x="${x0}" y="${y0+4}" font-size="12" text-anchor="middle" font-weight="900" fill="#263e4e">${letters[i]}</text>`;
   continue;
  }
  if(show){
   const status=final&&S.heatTurtles[i]?.status,champion=final&&S.heatTurtles[i]?.champion;
   const crash=final&&S.phase==='finished'&&status==='crash';
   const success=final&&S.phase==='finished'?champion:(!final&&S.phase==='results'?S.winners.includes(i):null);
   // Thirty racers: miniatures without overlapping names; student highlights their own turtle.
   const mini=final&&n>8;
   paths+=`<path d="M${x0} ${y0}L${xx} ${yy}" fill="none" stroke="${color}" stroke-width="${mini?3:8}" opacity="${mini?.55:.95}" stroke-linecap="round"/>`;
   if(mini){const own=name===S.myName;const radius=own?11:6;
    paths+=`<circle cx="${xx}" cy="${yy}" r="${radius}" fill="${color}" stroke="${champion?'#ffe98e':own?'#ffffff':'#163c4a'}" stroke-width="${champion?4:2}"/><circle cx="${xx+radius*.55}" cy="${yy-3}" r="${radius*.55}" fill="#9dda6e" stroke="#163c4a" stroke-width="1"/>`;
    if(champion||own)paths+=`<text x="${xx}" y="${yy-18}" text-anchor="middle" font-size="${own?18:14}" font-weight="900" fill="white" stroke="#173d49" stroke-width="3" paint-order="stroke">${esc(name)}</text>`;
   }else paths+=turtle(xx,yy,color,name,i,success,crash);
  }
 }
 if(final&&S.phase==='finished'&&S.champions.length){
 const swimmers=S.champions.slice(0,5).map((name,i)=>{const angle=Date.now()/550+i*1.7;const x=315+i*92,y=360+Math.sin(angle)*7;
 return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="10" rx="34" ry="10" fill="#dbffff" opacity=".5"/><ellipse cx="0" cy="0" rx="24" ry="18" fill="${['#ff6b78','#badb36','#386ee8','#ac8cdb','#f58b4a'][i]}" stroke="#285063" stroke-width="3"/><circle cx="23" cy="-9" r="13" fill="#9bd86e" stroke="#285063" stroke-width="3"/><circle cx="26" cy="-12" r="2.5" fill="#253e4c"/><text x="0" y="-34" font-size="17" text-anchor="middle" font-weight="900" fill="#fff" stroke="#1c4858" stroke-width="3" paint-order="stroke">${esc(name)}</text></g>`;}).join('');
 return `<svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet"><g>${terrain('day')}</g><ellipse cx="510" cy="380" rx="350" ry="155" fill="#36bace" stroke="#e8ffff" stroke-width="10"/><ellipse cx="490" cy="395" rx="280" ry="105" fill="#70e1e5" opacity=".55"/><text x="500" y="118" text-anchor="middle" font-size="48" font-weight="900" fill="#fff9dd" stroke="#215969" stroke-width="6" paint-order="stroke">ALPINE LAKE CHAMPIONS!</text><text x="500" y="168" text-anchor="middle" font-size="26" fill="#ffffff" stroke="#215969" stroke-width="4" paint-order="stroke">💦 SWIM PARTY! 💦</text>${swimmers}</svg>`;
 }
 return `<svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mountain paths with exact linear equations"><g>${terrain(r.scene)}</g>${grid}<path d="M120 112V525H925" stroke="#e8f3de" stroke-width="4" fill="none" opacity=".7"/><text x="120" y="554" text-anchor="middle" fill="white" font-weight="900">0s</text><text x="915" y="554" text-anchor="end" fill="white" font-weight="900">${r.seconds}s</text><text x="36" y="320" transform="rotate(-90 36 320)" text-anchor="middle" fill="white" font-weight="900">ELEVATION</text>${plateau}${paths}${show?`<text x="500" y="578" text-anchor="middle" fill="white" stroke="#153f48" stroke-width="3" paint-order="stroke" font-size="22" font-weight="900">${time.toFixed(1)} / ${r.seconds}s</text>`:''}</svg>`;
}
function animate(){const mount=document.getElementById('mountain');if(!mount)return;mount.innerHTML=sceneSVG();if(['racing','final-racing'].includes(S?.phase)||(S?.final&&S?.phase==='finished'&&S?.champions?.length))raf=requestAnimationFrame(animate);else raf=null;}
if(!sock.connected)welcome();
