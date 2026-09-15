
(() => {
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const ui = {
  overlay: document.getElementById('overlay'),
  start: document.getElementById('startBtn'),
  score: document.getElementById('score'),
  beers: document.getElementById('beers'),
  pretzels: document.getElementById('pretzels'),
  lives: document.getElementById('lives'),
  prost: document.querySelector('#prostBar i'),
  pause: document.getElementById('pause')
};

const head = new Image();
head.src = 'head.png';

const keys = Object.create(null);
let running = false, paused = false;
let last = 0, worldY = 0, spawnClock = 0, decorClock = 0;
let score = 0, lives = 3, beers = 0, pretzels = 0, beerStreak = 0;
let prostUntil = 0, speed = 250, elapsed = 0, shake = 0;
let items = [], particles = [], decor = [];
let audioCtx = null;

const player = {x: W/2, y: H-205, w: 100, h: 150, vx:0, vy:0, inv:0, bob:0};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rnd=(a,b)=>a+Math.random()*(b-a);

function sfx(kind){
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g);g.connect(audioCtx.destination);
    const now=audioCtx.currentTime;
    let f1=440,f2=660,d=.09;
    if(kind==='beer'){f1=330;f2=560;d=.12}
    if(kind==='hit'){f1=150;f2=70;d=.2}
    if(kind==='prost'){f1=440;f2=880;d=.32}
    o.frequency.setValueAtTime(f1,now);o.frequency.exponentialRampToValueAtTime(Math.max(40,f2),now+d);
    g.gain.setValueAtTime(.06,now);g.gain.exponentialRampToValueAtTime(.001,now+d);
    o.start(now);o.stop(now+d);
  }catch(e){}
}

function reset(){
  score=0;lives=3;beers=0;pretzels=0;beerStreak=0;prostUntil=0;
  speed=250;elapsed=0;worldY=0;spawnClock=.25;decorClock=0;
  items=[];particles=[];decor=[];shake=0;
  player.x=W/2;player.y=H-205;player.inv=0;player.bob=0;
  running=true;paused=false;last=performance.now();
  ui.overlay.style.display='none';ui.pause.style.display='none';
  requestAnimationFrame(loop);
}

function gameOver(){
  running=false;
  const best=Math.max(score, Number(localStorage.getItem('wiesnJaffaBest')||0));
  localStorage.setItem('wiesnJaffaBest',best);
  ui.overlay.innerHTML = `<div class="panel">
    <div class="logo">FEIERABEND!</div>
    <div class="tag">${score.toLocaleString('da-DK')} POINT</div>
    <p>Highscore: <strong>${best.toLocaleString('da-DK')}</strong></p>
    <p>🥨 ${pretzels} &nbsp;&nbsp; 🍺 ${beers}</p>
    <button id="again" class="again">NOCH EIN MASS! 🍺</button>
  </div>`;
  ui.overlay.style.display='grid';
  document.getElementById('again').onclick=()=>location.reload();
}

function togglePause(){
  if(!running) return;
  paused=!paused;
  ui.pause.style.display=paused?'grid':'none';
  if(!paused){last=performance.now();requestAnimationFrame(loop);}
}

addEventListener('keydown', e=>{
  const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','p',' '].includes(k)) e.preventDefault();
  if(k==='p'){togglePause();return}
  keys[k]=true;
});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);

document.querySelectorAll('#touch button').forEach(b=>{
  const k=b.dataset.key;
  const on=e=>{e.preventDefault();keys[k]=true};
  const off=e=>{e.preventDefault();keys[k]=false};
  b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);
  b.addEventListener('pointercancel',off);b.addEventListener('pointerleave',off);
});
ui.start.onclick=reset;

function roadLeft(y){
  return 125 + Math.sin((y+worldY)*.0018)*7;
}
function roadRight(y){
  return W-125 + Math.sin((y+worldY)*.0016+2)*7;
}

function spawnItem(){
  const r=Math.random();
  let type = r<.31?'pretzel':r<.60?'beer':r<.78?'girl':'security';
  const margin=170;
  items.push({
    type, x:rnd(margin,W-margin), y:-100, z:rnd(.92,1.12),
    phase:rnd(0,Math.PI*2), drift:rnd(-16,16), touched:false
  });
}

function spawnDecor(){
  const side=Math.random()<.5?'left':'right';
  const kinds=['barrel','table','bunting','person','sign'];
  decor.push({side, kind:kinds[(Math.random()*kinds.length)|0], y:-120, phase:rnd(0,6.28)});
}

function hitboxItem(o){
  const s= o.type==='security'?70:60;
  return {x:o.x-s/2,y:o.y-s/2,w:s,h:s};
}
function hitboxPlayer(){
  return {x:player.x-34,y:player.y-56,w:68,h:104};
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}

function burst(x,y,color,count=12){
  for(let i=0;i<count;i++)particles.push({x,y,vx:rnd(-150,150),vy:rnd(-220,30),life:rnd(.35,.7),color,size:rnd(3,8)});
}

function collect(o, now){
  const mult=now<prostUntil?2:1;
  if(o.type==='pretzel'){pretzels++;score+=100*mult;beerStreak=0;burst(o.x,o.y,'#e89b25');sfx('coin')}
  if(o.type==='beer'){
    beers++;score+=250*mult;beerStreak++;burst(o.x,o.y,'#ffd454',16);sfx('beer');
    if(beerStreak>=3){
      beerStreak=0;prostUntil=now+10000;burst(player.x,player.y,'#ffd21f',30);shake=10;sfx('prost');
    }
  }
  if(o.type==='girl'){score+=500*mult;beerStreak=0;burst(o.x,o.y,'#ff5d8f',18);sfx('coin')}
  if(o.type==='security' && now>player.inv){
    lives--;beerStreak=0;player.inv=now+1600;shake=18;burst(player.x,player.y,'#ff4949',28);sfx('hit');
    if(lives<=0) gameOver();
  }
}

function update(dt,now){
  elapsed+=dt;worldY+=speed*dt;speed=Math.min(480,250+elapsed*3.1);

  let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
  let dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
  if(dx&&dy){dx*=.707;dy*=.707}
  const mv=360;
  player.x+=dx*mv*dt; player.y+=dy*mv*dt;
  player.x=clamp(player.x,165,W-165);
  player.y=clamp(player.y,125,H-130);
  player.bob += dt*(7+speed/120);

  spawnClock-=dt;
  if(spawnClock<=0){
    spawnItem();
    spawnClock=Math.max(.30,.70-speed/1050)*rnd(.78,1.18);
  }
  decorClock-=dt;
  if(decorClock<=0){spawnDecor();decorClock=rnd(.4,.9)}

  const ph=hitboxPlayer();
  for(let i=items.length-1;i>=0;i--){
    const o=items[i];
    o.y += (speed*(o.type==='security'?1.07:1))*dt;
    o.x += Math.sin(elapsed*1.8+o.phase)*o.drift*dt;
    if(overlap(ph,hitboxItem(o))){
      collect(o,now);items.splice(i,1);continue;
    }
    if(o.y>H+120) items.splice(i,1);
  }
  for(let i=decor.length-1;i>=0;i--){
    decor[i].y+=speed*.92*dt;
    if(decor[i].y>H+150)decor.splice(i,1);
  }
  for(let i=particles.length-1;i>=0;i--){
    let p=particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=350*dt;
    if(p.life<=0)particles.splice(i,1);
  }
  shake*=Math.pow(.02,dt);

  ui.score.textContent=score.toLocaleString('da-DK');
  ui.lives.textContent=lives;ui.beers.textContent=beers;ui.pretzels.textContent=pretzels;
  ui.prost.style.width=(now<prostUntil?100:(beerStreak/3*100))+'%';
}

function roundedRect(x,y,w,h,r,fill,stroke){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
}

function drawWorld(now){
  // distant warm ground
  ctx.fillStyle='#b88751';ctx.fillRect(0,0,W,H);

  // side tents
  ctx.fillStyle='#153f76';ctx.fillRect(0,0,133,H);ctx.fillRect(W-133,0,133,H);
  const stripeH=92, oy=(worldY*.7)%stripeH;
  for(let y=-stripeH+oy;y<H+stripeH;y+=stripeH){
    ctx.fillStyle='#f4f1e9';ctx.fillRect(0,y,133,stripeH/2);ctx.fillRect(W-133,y,133,stripeH/2);
  }

  // floral/wood edges
  ctx.fillStyle='#5c3b20';ctx.fillRect(115,0,22,H);ctx.fillRect(W-137,0,22,H);
  for(let y=-40+(worldY*.85)%80;y<H;y+=80){
    ctx.fillStyle='#2f7537';
    for(let i=0;i<5;i++){
      ctx.beginPath();ctx.arc(118+rnd(-10,15),y+i*11,10,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(W-118+rnd(-15,10),y+i*11,10,0,Math.PI*2);ctx.fill();
    }
  }

  // road
  ctx.fillStyle='#d5b278';
  ctx.beginPath();ctx.moveTo(137,0);ctx.lineTo(W-137,0);ctx.lineTo(W-137,H);ctx.lineTo(137,H);ctx.closePath();ctx.fill();

  // cobbles
  ctx.strokeStyle='#b89360';ctx.lineWidth=2;
  const rowH=48, rowOff=worldY%rowH;
  for(let y=-rowH+rowOff;y<H+rowH;y+=rowH){
    const row=Math.floor((y-worldY)/rowH);
    for(let x=137+(row%2?0:34);x<W-137;x+=68){
      ctx.strokeRect(x,y,66,rowH-3);
    }
  }

  // strings of lights
  const ly=(worldY*.45)%250;
  for(let base=-250+ly;base<H+250;base+=250){
    ctx.strokeStyle='#493019';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(122,base);ctx.quadraticCurveTo(W/2,base+55,W-122,base);ctx.stroke();
    for(let i=0;i<=8;i++){
      let tt=i/8,x=122+(W-244)*tt,y=base+Math.sin(Math.PI*tt)*42;
      ctx.fillStyle='#ffd56c';ctx.shadowBlur=12;ctx.shadowColor='#ffd56c';ctx.beginPath();ctx.arc(x,y,4.5,0,7);ctx.fill();ctx.shadowBlur=0;
    }
  }

  // top sign every so often
  if(((worldY/900)|0)%2===0){
    let sy=((worldY*.92)%900)-160;
    roundedRect(W/2-145,sy,290,64,8,'#7a4a25','#3c220e');
    ctx.fillStyle='#f0d6a2';ctx.font='900 24px system-ui';ctx.textAlign='center';ctx.fillText("WILLKOMMEN AUF DER WIESN!",W/2,sy+40);
  }
}

function drawDecor(o){
  const left=o.side==='left', edge=left?105:W-105;
  ctx.save();ctx.translate(edge,o.y);
  if(o.kind==='barrel'){
    ctx.fillStyle='#8c5b2c';ctx.fillRect(-30,-30,60,60);ctx.strokeStyle='#3a2616';ctx.lineWidth=5;ctx.strokeRect(-30,-30,60,60);
  }else if(o.kind==='table'){
    ctx.fillStyle='#6a3b1e';ctx.fillRect(left?-92:-10,-12,102,24);ctx.fillRect(left?-80:2,10,12,42);
  }else if(o.kind==='bunting'){
    ctx.fillStyle='#e7f1ff';ctx.beginPath();ctx.moveTo(-18,-15);ctx.lineTo(18,-15);ctx.lineTo(0,18);ctx.fill();
  }else if(o.kind==='person'){
    ctx.fillStyle='#ddc0a0';ctx.beginPath();ctx.arc(0,-18,12,0,7);ctx.fill();ctx.fillStyle='#204b7b';ctx.fillRect(-12,-5,24,42);
  }else{
    roundedRect(left?-110:-5,-25,115,50,5,'#754421','#2e180d');
    ctx.fillStyle='#fff';ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.fillText(left?'HOFBRÄU →':'← SCHÜTZENLISL',left?-54:52,5);
  }
  ctx.restore();
}

function drawPretzel(o){
  ctx.save();ctx.translate(o.x,o.y);ctx.rotate(Math.sin(elapsed*2+o.phase)*.12);
  ctx.strokeStyle='#7e3e08';ctx.lineWidth=14;ctx.lineCap='round';
  ctx.beginPath();ctx.arc(-13,-3,19,.15,6.1);ctx.stroke();ctx.beginPath();ctx.arc(13,-3,19,.15,6.1);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-27,10);ctx.lineTo(27,-15);ctx.moveTo(27,10);ctx.lineTo(-27,-15);ctx.stroke();
  ctx.strokeStyle='#e79826';ctx.lineWidth=9;
  ctx.beginPath();ctx.arc(-13,-3,19,.15,6.1);ctx.stroke();ctx.beginPath();ctx.arc(13,-3,19,.15,6.1);ctx.stroke();
  ctx.restore();
}
function drawBeer(o){
  ctx.save();ctx.translate(o.x,o.y);
  ctx.fillStyle='#f7b615';roundedRect(-20,-27,37,54,6,'#f7b615','#fff8');
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-11,-28,13,0,7);ctx.arc(4,-31,15,0,7);ctx.arc(13,-24,11,0,7);ctx.fill();
  ctx.strokeStyle='#eee';ctx.lineWidth=6;ctx.beginPath();ctx.arc(20,0,15,-1.2,1.2);ctx.stroke();
  ctx.restore();
}
function drawGirl(o){
  ctx.save();ctx.translate(o.x,o.y+Math.sin(elapsed*3+o.phase)*3);
  ctx.fillStyle='#edb38d';ctx.beginPath();ctx.arc(0,-26,14,0,7);ctx.fill();
  ctx.fillStyle='#7a3c19';ctx.beginPath();ctx.arc(0,-30,17,Math.PI,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2f7a45';ctx.beginPath();ctx.moveTo(-19,-8);ctx.lineTo(19,-8);ctx.lineTo(29,35);ctx.lineTo(-29,35);ctx.closePath();ctx.fill();
  ctx.fillStyle='#f7f1e5';ctx.fillRect(-18,-12,36,12);
  ctx.fillStyle='#d63c52';ctx.fillRect(-6,-8,12,40);
  ctx.strokeStyle='#3c2416';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-12,35);ctx.lineTo(-15,56);ctx.moveTo(12,35);ctx.lineTo(15,56);ctx.stroke();
  ctx.restore();
}
function drawSecurity(o){
  ctx.save();ctx.translate(o.x,o.y);const s=1+Math.sin(elapsed*4+o.phase)*.03;ctx.scale(s,s);
  ctx.fillStyle='#d4a27e';ctx.beginPath();ctx.arc(0,-31,15,0,7);ctx.fill();
  ctx.fillStyle='#111';ctx.fillRect(-15,-36,30,6);
  ctx.beginPath();ctx.arc(0,-20,35,0,Math.PI);ctx.fill();
  roundedRect(-36,-18,72,62,15,'#181818');
  ctx.fillStyle='#fff';ctx.font='900 10px system-ui';ctx.textAlign='center';ctx.fillText('SECURITY',0,16);
  ctx.strokeStyle='#111';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(-20,42);ctx.lineTo(-24,68);ctx.moveTo(20,42);ctx.lineTo(24,68);ctx.stroke();
  ctx.restore();
}

function drawPlayer(now){
  const bob=Math.sin(player.bob)*4;
  const runningSide=Math.sin(player.bob)*10;
  ctx.save();ctx.translate(player.x,player.y+bob);
  if(now<player.inv && ((now/100)|0)%2===0)ctx.globalAlpha=.35;

  // shadow
  ctx.fillStyle='#0003';ctx.beginPath();ctx.ellipse(0,69,37,12,0,0,7);ctx.fill();

  // legs with running animation
  ctx.strokeStyle='#f4efe2';ctx.lineWidth=16;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-14,30);ctx.lineTo(-17+runningSide,62);ctx.moveTo(14,30);ctx.lineTo(17-runningSide,62);ctx.stroke();
  ctx.strokeStyle='#2f7040';ctx.lineWidth=5;
  ctx.beginPath();ctx.moveTo(-22+runningSide,50);ctx.lineTo(-11+runningSide,50);ctx.moveTo(11-runningSide,50);ctx.lineTo(22-runningSide,50);ctx.stroke();
  ctx.strokeStyle='#5a311a';ctx.lineWidth=13;
  ctx.beginPath();ctx.moveTo(-18+runningSide,66);ctx.lineTo(-4+runningSide,66);ctx.moveTo(4-runningSide,66);ctx.lineTo(18-runningSide,66);ctx.stroke();

  // torso/shirt
  roundedRect(-38,-25,76,66,18,'#f5efe1');
  roundedRect(-42,4,84,42,10,'#68401e');
  // suspenders
  ctx.strokeStyle='#6d3f1d';ctx.lineWidth=9;
  ctx.beginPath();ctx.moveTo(-25,-26);ctx.lineTo(-13,34);ctx.moveTo(25,-26);ctx.lineTo(13,34);ctx.stroke();
  // arms
  ctx.strokeStyle='#efbb98';ctx.lineWidth=15;
  ctx.beginPath();ctx.moveTo(-31,-10);ctx.lineTo(-50-runningSide*.5,19);ctx.moveTo(31,-10);ctx.lineTo(50+runningSide*.5,19);ctx.stroke();

  // head - much larger, transparent cutout, no square background
  if(head.complete){
    const hw=98, hh=126;
    ctx.drawImage(head,-hw/2,-135,hw,hh);
  }

  // PROST glow
  if(now<prostUntil){
    ctx.globalCompositeOperation='destination-over';
    const grad=ctx.createRadialGradient(0,-35,10,0,-35,90);
    grad.addColorStop(0,'#ffd84d66');grad.addColorStop(1,'#ffd84d00');
    ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,-35,90,0,7);ctx.fill();
  }
  ctx.restore();
}

function drawParticles(){
  for(const p of particles){
    ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,7);ctx.fill();
  }
  ctx.globalAlpha=1;
}

function draw(now){
  ctx.save();
  if(shake>0)ctx.translate(rnd(-shake,shake),rnd(-shake,shake));
  drawWorld(now);
  decor.forEach(drawDecor);
  for(const o of items){
    if(o.type==='pretzel')drawPretzel(o);
    if(o.type==='beer')drawBeer(o);
    if(o.type==='girl')drawGirl(o);
    if(o.type==='security')drawSecurity(o);
  }
  drawPlayer(now);
  drawParticles();

  if(now<prostUntil){
    ctx.fillStyle='#ffd21f18';ctx.fillRect(135,0,W-270,H);
    ctx.font='1000 44px system-ui';ctx.textAlign='center';ctx.fillStyle='#ffbd16';
    ctx.strokeStyle='#173d70';ctx.lineWidth=8;ctx.strokeText('PROST MODE!',W/2,120);ctx.fillText('PROST MODE!',W/2,120);
  }
  ctx.restore();
}

function loop(now){
  if(!running||paused)return;
  const dt=Math.min(.035,(now-last)/1000);last=now;
  update(dt,now);draw(now);
  if(running)requestAnimationFrame(loop);
}

// Draw attract screen in background before start.
drawWorld(0);
})();
