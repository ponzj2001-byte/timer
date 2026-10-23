(function(){
'use strict';
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const now=()=>Date.now();
const COL={blue:'#00838f',orange:'#e65100',red:'#c62828'};   // 다이얼 색: 청록 → 주황 → 빨강

// ---------- 저장되는 설정 (이 폰의 브라우저에만 저장, 밖으로 보내지 않음) ----------
const KEY='phoneTimerV1';
const DEF={theme:'light',scale:1,volume:.8,muted:false,sound:'chime',repeat:2,tick:true,vibrate:true,
  presets:[1,3,5,10,15,20],timerSec:300,run:null,
  events:[],fired:{},evSound:'system',pin:'',
  showCs:true,show5:true,csAlarm:0,p5Alarm:-1};
let S;
try{S=Object.assign({},DEF,JSON.parse(localStorage.getItem(KEY)||'{}'))}catch(e){S=Object.assign({},DEF)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

function hm(ms){const d=new Date(ms);return pad(d.getHours())+':'+pad(d.getMinutes())}
function fmt(ms){let s=Math.max(0,Math.ceil(ms/1000));const h=Math.floor(s/3600),m=Math.floor(s%3600/60);s%=60;return h?`${h}:${pad(m)}:${pad(s)}`:`${pad(m)}:${pad(s)}`}
function setText(el,t){if(el&&el._t!==t){el.textContent=t;el._t=t}}

// ---------- 타이머 엔진 (종료 시각 기준 계산 → 밀리지 않음) ----------
let screen='home';
const E={state:'idle',segEnd:0,remMs:0,total:0,lastMs:0,lastSec:null,warned:false};
function remaining(){if(E.state==='running')return Math.max(0,E.segEnd-now());if(E.state==='paused')return E.remMs;return 0}
function setRemaining(ms){ms=Math.max(0,ms);if(E.state==='running')E.segEnd=now()+ms;else E.remMs=ms;if(ms>E.total)E.total=ms;persistRun()}
function persistRun(){
  if(E.state==='running'||E.state==='paused')S.run={state:E.state,segEnd:E.segEnd,remMs:E.remMs,total:E.total,lastMs:E.lastMs};
  else S.run=null;
  save();
}
function start(){
  ensureAudio();screen='timer';
  if(S.timerSec<=0)return toast('시간을 입력하세요');
  E.lastMs=S.timerSec*1000;E.total=E.lastMs;E.segEnd=now()+E.total;E.lastSec=null;E.warned=false;E.state='running';
  persistRun();renderAll();
}
function pause(){if(E.state!=='running')return;E.remMs=Math.max(0,E.segEnd-now());E.state='paused';persistRun();renderAll()}
function resume(){if(E.state!=='paused')return;ensureAudio();E.segEnd=now()+E.remMs;E.state='running';persistRun();renderAll()}
function toggle(){if(E.state==='idle')start();else if(E.state==='running')pause();else if(E.state==='paused')resume();else if(E.state==='done')reset()}
function reset(){if(document.body.classList.contains('done'))screen='timer';E.state='idle';document.body.classList.remove('done');stopVibrate();hideWarn();document.title='수업 타이머';persistRun();renderAll()}
function again(){screen='timer';document.body.classList.remove('done');stopVibrate();ensureAudio();E.total=E.lastMs;E.segEnd=now()+E.total;E.lastSec=null;E.warned=false;E.state='running';persistRun();renderAll()}
function finish(){
  E.state='done';hideWarn();persistRun();
  $('#dSub').textContent=`${fmt(E.lastMs)} 타이머 종료`;
  document.body.classList.add('done');
  document.title='시간 종료 · 수업 타이머';
  playAlarm();startVibrate();renderAll();
}
function adjustMinutes(d){
  if(E.state==='idle'){
    S.timerSec=Math.max(60,Math.min(999*60,(d>0?Math.floor(S.timerSec/60):Math.ceil(S.timerSec/60))*60+d*60));save();syncInputs();uiTick();
  }else if(E.state==='running'||E.state==='paused'){
    const r=remaining();setRemaining(d>0?r+60000:Math.max(1000,r-60000));E.lastSec=null;
  }
}

// ---------- 1초 주기 (화면 꺼짐 전까지 백그라운드 워커로도 동작) ----------
let lastClock=-1;
function tick(){
  const t=now();
  if(E.state==='running'){
    const rem=E.segEnd-t,sec=Math.ceil(rem/1000);
    if(sec!==E.lastSec){E.lastSec=sec;onSecond(rem,sec)}
    if(rem<=0)finish();
  }
  const s=Math.floor(t/1000);
  if(s!==lastClock){lastClock=s;updateClock(t);if(window.__evTick)window.__evTick(t)}
}
function onSecond(rem,sec){
  if(S.tick&&sec>=1&&sec<=10&&E.total>10000)playTick();
  if(rem>0)document.title=`${fmt(rem)} · 수업 타이머`;
}
let fallbackTimer=null;
function useFallback(){if(!fallbackTimer)fallbackTimer=setInterval(tick,200)}
try{
  const w=new Worker(URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},200)'],{type:'text/javascript'})));
  w.onmessage=tick;w.onerror=()=>{try{w.terminate()}catch(e){}useFallback()};
}catch(e){useFallback()}
setTimeout(()=>{if(lastClock<0)useFallback()},1500);

// ---------- 한국 표준시 날짜·시각 + 음력 ----------
// 한국 음력 (한국천문연구원 기준 음력표 1990~2050). 중국 음력과 하루씩 다른 달이 있어 직접 계산
const KLUN={start:'1990-01-27',data:"1R34UE6WX9Z[\\1R34U67X9Z[\\1RS45V78Y:[\\1RSCT5V78Y:[<QRS4U6W89Z;\\1RS4UV7XHY:;\\1R3TU6W8YZ;\\12S4U6WX9Z[<Q23T5EVW8YZ[<Q23T56W8YZ[<QR34U67X9Z[<QRS4DU67X9Z;\\QR3T5V78Y:[<QR3TU6W89Z;\\1RBST5V7X9Z;\\1R3T5VW8YZ;<Q2S4U6WGXY:[\\12S45V7XYZ;\\Q23T56W8YZ;\\QR34UE6W8Y:[\\Q2S4U67X9Z;\\Q2ST5V78Y:[<Q2ScT5V78Y:[<Q2ST5V7X9Z;\\1R3T5V7XYIZ;\\1R34U6WXY:[<Q2S45V7XY:[\\1R3T5EV7X9Z[\\1R3T56W8Y:[\\Q2S4U67X9Z;\\Q2STDU67X9Z;\\1RS4U6W8Y:[<Q2S4UV7X9Z;\\1RBS4U6WX9Z;\\1R34U6WX9Z[<Q2S45VFW8YZ[<Q2S45V7X9Z[\\1R3T56W89Z[\\1RS4UE6W89Z[<QR3TU67X9:[\\1R3TU6W8Y:[<Q2SCT5VW8Y:[<Q23T5VW8YZ;\\1R34U6W8YZ[K\\1R34U6W8YZ[<Q2S45V78YZ;\\QR3T56f78YZ;\\QR3T56W89Z;\\QR3T5V7X9:[<QR3TUEV7X9Z;<Q2ST5VW8Y:[<Q23T5VW8YZ;\\1RB3T5V7XY:[\\1R34U67XY:[\\Q2S45V7GX9Z[\\Q2S45V78Y:[\\Q2ST56W89Z;\\Q2ST5e6W89Z;\\1RS4UV7X9Z;<Q2S4UV7XY:[<Q23c4U6WX9Z"};
const KL=(function(){
  const [y0,m0,d0]=KLUN.start.split('-').map(Number),base=Date.UTC(y0,m0-1,d0)/864e5,starts=[],info=[];let t=base;
  for(const ch of KLUN.data){const c=ch.charCodeAt(0)-48,len=c&32?30:29;starts.push(t);info.push({m:c&15,leap:!!(c&16),len});t+=len}
  return function(y,m,d){
    const x=Date.UTC(y,m-1,d)/864e5;if(x<base||x>=t)return null;
    let lo=0,hi=starts.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(starts[mid]<=x)lo=mid;else hi=mid-1}
    const i=info[lo];return {m:i.m,leap:i.leap,d:x-starts[lo]+1,len:i.len};
  };
})();
const fParts=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',weekday:'long',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:'h23'});
const fLunar=new Intl.DateTimeFormat('ko-KR-u-ca-chinese',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'});
let lunarKey='',lunarText='(음력 --월 --일)';
function lunarOf(t,solarKey){
  if(solarKey===lunarKey)return lunarText;
  try{
    const [y,m,d]=solarKey.split('-').map(Number),k=KL(y,m,d);
    if(k)lunarText=`(음력 ${k.leap?'윤':''}${k.m}월 ${k.d}일)`;
    else{const p=Object.fromEntries(fLunar.formatToParts(t).map(x=>[x.type,x.value]));
      const leap=/^윤/.test(p.month||''),mo=String(p.month||'').replace('윤','');
      lunarText=`(음력 ${leap?'윤':''}${mo}월 ${p.day}일)`}
  }catch(e){lunarText=''}
  lunarKey=solarKey;return lunarText;
}
function updateClock(t){
  const p=Object.fromEntries(fParts.formatToParts(t).map(x=>[x.type,x.value]));
  setText($('#dY'),`${p.year}년`);setText($('#dM'),`${p.month}월`);setText($('#dD'),`${p.day}일`);
  const wd=$('#dW');setText(wd,p.weekday);wd.classList.toggle('sat',p.weekday==='토요일');wd.classList.toggle('sun',p.weekday==='일요일');
  setText($('#dL'),lunarOf(t,`${p.year}-${p.month}-${p.day}`));
  const h=+p.hour;
  setText($('#cH'),pad(h));setText($('#cM'),pad(+p.minute));setText($('#cS'),pad(+p.second));
  setText($('#ampm'),`${h<12?'오전':'오후'} ${h%12||12}시 ${+p.minute}분 ${+p.second}초`);
  setText($('#endPlan'),hm(t+S.timerSec*1000));
  const live=E.state==='running'||E.state==='paused';
  setText($('#homeBtn'),live?`⏱ 타이머 ${fmt(remaining())} 남음`:'⏱ 타이머 설정');
}

// ---------- 다이얼 그리기 ----------
const CX=230,CY=230,R=170,C=2*Math.PI*R;
const ring=$('#ring'),arc=$('#arc'),handle=$('#handle'),center=$('#center');
(function buildDial(){
  let h='',l='';
  for(let i=0;i<60;i++){const a=i*Math.PI/30-Math.PI/2,major=i%5===0,r1=major?190:195;
    h+=`<line x1="${(CX+r1*Math.cos(a)).toFixed(1)}" y1="${(CY+r1*Math.sin(a)).toFixed(1)}" x2="${(CX+202*Math.cos(a)).toFixed(1)}" y2="${(CY+202*Math.sin(a)).toFixed(1)}" stroke-width="${major?3:1.3}"/>`}
  for(let i=1;i<=12;i++){const a=i*Math.PI/6-Math.PI/2;
    l+=`<text x="${(CX+218*Math.cos(a)).toFixed(1)}" y="${(CY+218*Math.sin(a)).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${i*5}</text>`}
  $('#ticks').innerHTML=h;$('#labels').innerHTML=l;
})();

function colorFor(rem,total){
  if(rem<=10000&&total>10000)return'red';
  if(total>=30000&&rem<=total/3)return'orange';
  return'blue';
}
function computeView(){
  const t=now(),st=E.state;
  const v={text:'00:00',label:'',sub:'',hint:'',frac:0,color:'blue',drag:false,last:false};
  if(st==='running'||st==='paused'||st==='done'){
    const rem=st==='done'?0:remaining();
    v.text=fmt(rem);v.frac=E.total?Math.min(1,rem/E.total):0;v.color=colorFor(rem,E.total);
    v.last=st!=='done'&&rem>0&&rem<=10000&&E.total>10000;
    v.drag=st!=='done';
    const endAt=st==='running'?E.segEnd:t+E.remMs;
    v.label=st==='paused'?'일시정지':'남은 시간';
    v.sub=st==='done'?'':`${hm(endAt)} 종료`;
    v.hint=st==='paused'?'눌러서 계속':st==='running'?'눌러서 일시정지':'';
  }else{
    const ms=S.timerSec*1000;
    v.text=fmt(ms);v.frac=Math.min(1,ms/3600000);v.drag=true;v.label='설정한 시간';v.hint='원을 돌려 설정 · 눌러서 시작';v.sub=`시작하면 ${hm(t+ms)} 종료`;
  }
  return v;
}
let disp=0,curView=null,dragging=false,dragPrev=0;
function frame(){
  const v=computeView();curView=v;
  if(dragging)disp=v.frac;
  else{disp+=(v.frac-disp)*.22;if(Math.abs(v.frac-disp)<.0004)disp=v.frac}
  const f=Math.max(0,Math.min(1,disp)),c=COL[v.color];
  arc.style.strokeDasharray=`${(C*f).toFixed(2)} ${C.toFixed(2)}`;
  arc.style.strokeOpacity=f<.0005?0:1;arc.style.stroke=c;
  const a=f*2*Math.PI-Math.PI/2;
  handle.setAttribute('cx',(CX+R*Math.cos(a)).toFixed(2));handle.setAttribute('cy',(CY+R*Math.sin(a)).toFixed(2));
  handle.style.stroke=c;
  ring.classList.toggle('candrag',v.drag);
  ring.classList.toggle('dial',v.drag&&E.state==='idle');
  setText($('#cTime'),v.text);setText($('#cLabel'),v.label);setText($('#cSub'),v.sub);setText($('#cHint'),v.hint);
  const tc=v.color==='blue'?'':c;
  if($('#cTime')._c!==tc){$('#cTime').style.color=tc;$('#cTime')._c=tc}
  center.classList.toggle('last',v.last);
  const tf=v.text.length<=5?.24:v.text.length<=7?.18:.14;
  if($('#ringWrap')._tf!==tf){$('#ringWrap').style.setProperty('--tf',tf);$('#ringWrap')._tf=tf}
  requestAnimationFrame(frame);
}

// ---------- 다이얼 드래그 ----------
function angleFrac(e){const r=ring.getBoundingClientRect();let a=Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2)+Math.PI/2;if(a<0)a+=2*Math.PI;return a/(2*Math.PI)}
let lastDialMin=null;
function applyDrag(e){
  let f=angleFrac(e);
  if(dragPrev>.75&&f<.25)f=1;else if(dragPrev<.25&&f>.75)f=0;
  dragPrev=f;
  if(E.state==='idle'){
    const m=Math.max(1,Math.min(60,Math.round(f*60)));
    if(m!==lastDialMin){lastDialMin=m;S.timerSec=m*60;syncInputs();uiTick();if(navigator.vibrate&&S.vibrate&&m%5===0)try{navigator.vibrate(8)}catch(x){}}
  }else if(E.state==='running'||E.state==='paused'){setRemaining(Math.max(1000,f*E.total));E.lastSec=null}
}
ring.addEventListener('pointerdown',e=>{
  if(!curView||!curView.drag)return;
  const r=ring.getBoundingClientRect(),sc=r.width/460,dist=Math.hypot(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2)/sc;
  if(dist<110||dist>235)return;
  ensureAudio();dragging=true;dragPrev=disp;lastDialMin=null;ring.setPointerCapture(e.pointerId);applyDrag(e);e.preventDefault();
});
ring.addEventListener('pointermove',e=>{if(dragging)applyDrag(e)});
['pointerup','pointercancel'].forEach(ev=>ring.addEventListener(ev,()=>{if(dragging){dragging=false;save()}}));

// ---------- 설정 카드와 버튼 ----------
const CHIPCOL=['#1565c0','#2e7d32','#e65100','#6a1b9a','#00838f','#c62828'];
function renderChips(){
  $('#chips').innerHTML=S.presets.map((m,i)=>`<button class="chip" style="--cc:${CHIPCOL[i%CHIPCOL.length]}" data-act="preset" data-m="${m}">${m}분</button>`).join('');
}
function syncInputs(){
  const a=document.activeElement,im=$('#inMin'),is=$('#inSec');
  if(a!==im)im.value=Math.floor(S.timerSec/60);
  if(a!==is)is.value=S.timerSec%60;
  document.querySelectorAll('[data-act=preset]').forEach(b=>b.classList.toggle('on',S.timerSec===+b.dataset.m*60));
  setText($('#endPlan'),hm(now()+S.timerSec*1000));
}
function renderControls(){
  const st=E.state;let h='';
  if(screen!=='timer')h='';
  else if(st==='idle')h='<button class="btn big green" data-act="start">▶ 시작</button>';
  else if(st==='done')h='';
  else h=`<button class="btn gray" data-act="minus">−1분</button><button class="btn ${st==='running'?'orange':'green'}" data-act="toggle">${st==='running'?'⏸ 일시정지':'▶ 계속'}</button><button class="btn gray" data-act="plus">+1분</button><button class="btn red" data-act="reset">■ 초기화</button>`;
  $('#controls').innerHTML=h;
}
function setScreen(s){screen=s;renderAll();updateClock(now());window.scrollTo(0,0)}
function renderAll(){
  document.body.dataset.screen=screen;document.body.dataset.state=E.state;
  document.body.dataset.live=(E.state==='running'||E.state==='paused')?'on':'off';
  renderControls();syncInputs();
}

// ---------- 입력 처리 ----------
function act(a,el){
  switch(a){
    case 'opentimer':setScreen('timer');break;
    default:if(window.__evAct)window.__evAct(a,el);break;
    case 'home':setScreen('home');break;
    case 'start':start();break;
    case 'toggle':toggle();break;
    case 'reset':reset();break;
    case 'again':again();break;
    case 'plus':adjustMinutes(1);break;
    case 'minus':adjustMinutes(-1);break;
    case 'preset':S.timerSec=+el.dataset.m*60;save();syncInputs();uiTick();break;
    case 'mute':S.muted=!S.muted;save();applyAudio();syncIcons();toast(S.muted?'소리 끔':'소리 켬');break;
    case 'theme':S.theme=S.theme==='dark'?'light':'dark';save();applyTheme();break;
    case 'settings':openSettings();break;
    case 'closesheet':closeSheet();break;
    case 'test':ensureAudio();playAlarm(1);break;
    case 'how':openHow();break;
    case 'share':shareApp();break;
    case 'install':doInstall();break;
    case 'resetall':if(confirm('모든 설정을 처음 상태로 되돌릴까요?')){try{localStorage.removeItem(KEY)}catch(e){}location.reload()}break;
  }
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b)act(b.dataset.act,b)});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='inMin'||t.id==='inSec'){S.timerSec=Math.max(0,(parseInt($('#inMin').value)||0)*60+(parseInt($('#inSec').value)||0));save();syncInputs()}
});
document.addEventListener('change',e=>{
  if(e.target.id==='inMin'||e.target.id==='inSec'){$('#inMin').value=Math.floor(S.timerSec/60);$('#inSec').value=S.timerSec%60}
});
document.addEventListener('focusin',e=>{if(e.target.matches&&e.target.matches('.numIn'))setTimeout(()=>{try{e.target.select()}catch(x){}},0)});

// ---------- 소리 (인터넷 없이 브라우저에서 직접 만듦) ----------
let AC=null,master=null;
function ensureAudio(){
  try{
    if(!AC){AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.connect(AC.destination)}
    if(AC.state==='suspended')AC.resume();
    applyAudio();
  }catch(e){}
  return AC;
}
document.addEventListener('pointerdown',ensureAudio,{once:true});
function applyAudio(){if(master)master.gain.value=S.muted?0:S.volume}
function tone(f,t0,dur,gain,type){
  const o=AC.createOscillator(),g=AC.createGain();
  o.type=type||'sine';o.frequency.value=f;
  g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(gain,t0+.01);g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
  o.connect(g);g.connect(master);o.start(t0);o.stop(t0+dur+.05);
}
function bell(f,t0,dur,gain){tone(f,t0,dur,gain);tone(f*2.76,t0,dur*.5,gain*.25);tone(f*2,t0,dur*.7,gain*.2)}
function canPlay(){return AC&&!S.muted&&S.sound!=='none'}
function playAlarm(times){
  if(!canPlay())return;
  const n=times||S.repeat,t=AC.currentTime+.05;
  for(let k=0;k<n;k++){
    if(S.sound==='beep'){const b=t+k*2.8;for(let i=0;i<6;i++)tone(880,b+i*.4,.2,.6)}
    else if(S.sound==='school'){const b=t+k*4.6;[392,392,440,440,392,392,329.6].forEach((f,i)=>bell(f,b+i*.5,i===6?1.4:.6,.5))}
    else{const b=t+k*2.4;[523.25,659.25,783.99].forEach((f,i)=>bell(f,b+i*.38,1.6,.45))}
  }
}
function playTick(){if(!AC||S.muted)return;tone(1000,AC.currentTime+.01,.05,.25)}
function uiTick(){if(!AC||S.muted)return;tone(1600,AC.currentTime+.005,.03,.1)}
let vibT=null;
function startVibrate(){if(!S.vibrate||!navigator.vibrate)return;try{navigator.vibrate([400,200,400,200,400])}catch(e){}clearInterval(vibT);vibT=setInterval(()=>{try{navigator.vibrate([400,200,400])}catch(e){}},3000)}
function stopVibrate(){clearInterval(vibT);vibT=null;try{navigator.vibrate&&navigator.vibrate(0)}catch(e){}}

// ---------- 화면 계속 켜 두기 (앱을 켜 두는 동안 항상) ----------
let wl=null;
async function lockScreen(){try{if('wakeLock' in navigator&&!wl){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>{wl=null})}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){lockScreen();updateClock(now())}});
['pointerdown','touchstart','click'].forEach(ev=>document.addEventListener(ev,()=>{if(!wl)lockScreen()},{passive:true}));
lockScreen();

// ---------- 알림 ----------
let toastT=null;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2600)}
function hideWarn(){$('#warn').style.display='none'}

// ---------- 테마, 아이콘 ----------
const ICON={
  vol:'<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 8.5a5 5 0 010 7M19 5.5a9 9 0 010 13"/></svg>',
  mute:'<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>',
  moon:'<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>',
  sun:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
};
function syncIcons(){$('#bMute').innerHTML=S.muted?ICON.mute:ICON.vol;$('#bTheme').innerHTML=S.theme==='dark'?ICON.sun:ICON.moon}
function applyTheme(){
  document.documentElement.dataset.theme=S.theme;document.documentElement.style.setProperty('--fs',S.scale);syncIcons();
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=S.theme==='dark'?'#141c2c':'#1b2a49';
}

// ---------- 설정 · 설치 · 보내기 시트 ----------
let deferredInstall=null;
const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if($('#sheetBg').classList.contains('open'))openSettings()});
window.addEventListener('appinstalled',()=>{deferredInstall=null;toast('앱이 설치되었습니다')});
async function doInstall(){
  if(!deferredInstall)return openHow();
  deferredInstall.prompt();try{await deferredInstall.userChoice}catch(e){}deferredInstall=null;openSettings();
}
function openSheet(html){$('#sheet').innerHTML=html;$('#sheetBg').classList.add('open')}
function closeSheet(){$('#sheetBg').classList.remove('open')}
$('#sheetBg').addEventListener('click',e=>{if(e.target.id==='sheetBg')closeSheet()});
function openSettings(){
  const installCard=isStandalone()?'':`<h3 class="c3">📲 폰에 앱으로 설치</h3>
    ${deferredInstall?'<button class="sbtn green block" data-act="install">지금 설치</button>':''}
    <button class="sbtn block" data-act="how">설치 방법 보기</button>`;
  openSheet(`
  <div class="shead"><h2>설정</h2><button class="sbtn gray" data-act="closesheet">닫기</button></div>
  <h3 class="c1">🔔 소리와 진동</h3>
  <div class="srow"><label>종료 알림음</label><select id="sSound">
    <option value="chime">부드러운 차임</option><option value="school">학교종 멜로디</option><option value="beep">삑삑음</option><option value="none">무음 (화면만)</option></select>
    <button class="sbtn" data-act="test">들어 보기</button></div>
  <div class="srow"><label>볼륨</label><input id="sVol" type="range" min="0" max="1" step="0.05"></div>
  <div class="srow"><label>반복 횟수</label><input id="sRep" type="number" min="1" max="5"> 회</div>
  <div class="srow"><label>마지막 10초</label><label style="min-width:0;font-weight:normal"><input id="sTick" type="checkbox"> 1초마다 틱 소리</label></div>
  <div class="srow"><label>진동</label><label style="min-width:0;font-weight:normal"><input id="sVib" type="checkbox"> 종료 때 폰 진동</label></div>
  <h3 class="c2">🎨 화면</h3>
  <div class="srow"><label>테마</label><select id="sTheme"><option value="light">밝게</option><option value="dark">어둡게</option></select></div>
  <div class="srow"><label>날짜 글자</label><select id="sScale"><option value="0.9">작게</option><option value="1">보통</option><option value="1.1">크게</option></select></div>
  <h3 class="c4">⏱ 프리셋 버튼</h3>
  <div class="srow"><label>분 (쉼표)</label><input id="sPresets" type="text" style="width:12em"></div>
  <h3 class="c3">📅 일정 알림</h3>
  <div class="srow"><label>알림 소리</label><select id="sEvSound">
    <option value="system">폰 소리 설정 따르기 (무음·진동이면 소리 없음)</option>
    <option value="app">항상 앱에서 소리</option>
    <option value="none">소리 없이 화면만</option></select></div>
  <div class="srow"><label>알림 권한</label><span id="permState"></span><button class="sbtn" data-act="notifperm">알림 허용</button></div>
  <h3 class="c5">🙏 수도 일정 (치성 · 5일)</h3>
  <div class="srow"><label>치성</label><label style="min-width:0;font-weight:normal"><input id="sShowCs" type="checkbox"> 달력에 표시</label>
    <select id="sCsAlarm"><option value="-1">알림 없음</option><option value="0">당일 아침 8시 알림</option><option value="1440">하루 전 아침 8시 알림</option></select></div>
  <div class="srow"><label>5일</label><label style="min-width:0;font-weight:normal"><input id="sShow5" type="checkbox"> 달력에 표시</label>
    <select id="sP5Alarm"><option value="-1">알림 없음</option><option value="0">당일 아침 8시 알림</option><option value="1440">하루 전 아침 8시 알림</option></select></div>
  <div class="memo">치성 15가지는 음력 날짜로 앱에 저장되어 해마다 자동으로 들어갑니다. 5일은 갑(甲)·기(己)일로 5일마다 계산합니다.</div>
  <div class="srow"><label>일정 잠금</label><input id="sPin" type="password" inputmode="numeric" maxlength="8" placeholder="숫자 4~8자리 (비우면 끔)" style="width:12em"><button class="sbtn purple" data-act="setpin">저장</button></div>
  <div class="srow"><label>백업</label><button class="sbtn green" data-act="exportev">일정 내보내기</button><button class="sbtn gray" data-act="importev">가져오기</button><input id="impFile" type="file" accept=".json,application/json" hidden></div>
  ${installCard}
  <h3 class="c5">🔗 다른 분께</h3>
  <button class="sbtn purple block" data-act="share">이 앱을 다른 분께 보내기</button>
  <div class="memo">입력한 시간·설정은 이 폰의 브라우저에만 저장되고 어디로도 전송되지 않습니다.</div>
  <button class="sbtn red block" data-act="resetall">모든 설정 처음으로</button>`);
  $('#sSound').value=S.sound;$('#sVol').value=S.volume;$('#sRep').value=S.repeat;$('#sTick').checked=S.tick;$('#sVib').checked=S.vibrate;
  $('#sEvSound').value=S.evSound;$('#sShowCs').checked=S.showCs!==false;$('#sShow5').checked=S.show5!==false;$('#sCsAlarm').value=String(S.csAlarm);$('#sP5Alarm').value=String(S.p5Alarm);if(window.__evPerm)window.__evPerm();
  $('#sTheme').value=S.theme;$('#sScale').value=String(S.scale);$('#sPresets').value=S.presets.join(', ');
}
function openHow(){
  openSheet(`
  <div class="shead"><h2>폰에 앱으로 설치</h2><button class="sbtn gray" data-act="closesheet">닫기</button></div>
  <h3 class="c3">① 크롬 (갤럭시 기본)</h3>
  <ol class="steps"><li>오른쪽 위 <b>⋮</b> 누르기</li><li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b> 누르기</li><li><b>설치</b> 누르면 홈 화면에 아이콘 생성</li></ol>
  <h3 class="c4">② 삼성 인터넷</h3>
  <ol class="steps"><li>아래 <b>☰</b> 누르기</li><li><b>페이지 추가</b> → <b>홈 화면</b> → <b>추가</b></li></ol>
  <div class="memo">카카오톡에서 연 주소는 <b>⋮ → 다른 브라우저로 열기</b>로 크롬에서 다시 연 뒤 설치합니다.</div>
  <div class="memo">아이폰은 사파리 → 공유 → <b>홈 화면에 추가</b>.</div>`);
}
async function shareApp(){
  const url=location.href.split('#')[0],isLocal=/^(file:|http:\/\/(localhost|127\.)|http:\/\/\[::1\])/.test(url);
  if(isLocal)return toast('아직 인터넷에 올리기 전이라 보낼 주소가 없습니다');
  const data={title:'수업 타이머',text:'큰 글씨 날짜·시계와 남은 시간 원형 타이머 앱',url};
  try{if(navigator.share){await navigator.share(data);return}}catch(e){if(e&&e.name==='AbortError')return}
  try{await navigator.clipboard.writeText(url);toast('주소를 복사했습니다. 카톡에 붙여넣어 보내세요');return}catch(e){}
  openSheet(`<div class="shead"><h2>앱 주소</h2><button class="sbtn gray" data-act="closesheet">닫기</button></div><div class="urlbox">${url}</div>`);
}
const parseList=(s,lo,hi)=>String(s).split(/[,\s]+/).map(Number).filter(x=>Number.isFinite(x)&&x>=lo&&x<=hi).map(x=>Math.round(x));
$('#sheetBg').addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='sSound')S.sound=t.value;
  else if(t.id==='sVol'){S.volume=+t.value;applyAudio()}
  else if(t.id==='sRep')S.repeat=Math.max(1,Math.min(5,parseInt(t.value)||1));
  else if(t.id==='sTick')S.tick=t.checked;
  else if(t.id==='sVib')S.vibrate=t.checked;
  else if(t.id==='sTheme'){S.theme=t.value;applyTheme()}
  else if(t.id==='sScale'){S.scale=+t.value;applyTheme()}
  else if(t.id==='sEvSound'){S.evSound=t.value}
  else if(t.id==='sShowCs'||t.id==='sShow5'){S[t.id==='sShowCs'?'showCs':'show5']=t.checked;if(window.__evRefresh)window.__evRefresh()}
  else if(t.id==='sCsAlarm'||t.id==='sP5Alarm'){S[t.id==='sCsAlarm'?'csAlarm':'p5Alarm']=+t.value}
  else if(t.id==='sPresets'){const l=parseList(t.value,1,300);if(l.length){S.presets=l.slice(0,6);renderChips();syncInputs()}}
  else return;
  save();
});


// ---------- 달력 · 일정 (한국 표준시 기준, 이 폰에만 자동 저장) ----------
(function(){
const KST=9*3600e3,DAY=86400e3;
const CATS=[{k:'sudo',n:'수도',c:'#8d1f3a'},{k:'mine',n:'개인',c:'#2e7d32'},{k:'school',n:'학교',c:'#1565c0'},{k:'etc',n:'기타',c:'#78909c'}];
const CAT=Object.fromEntries(CATS.map(c=>[c.k,c]));
const catOf=e=>CAT[e.cat]||CAT.etc;
const REP={none:'',daily:'매일',weekdays:'평일',weekly:'매주',monthly:'매월',yearly:'매년',lunar:'음력 매년',p5:'5일마다'};
const WD=['일','월','화','수','목','금','토'];
const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
if(!Array.isArray(S.events))S.events=[];
if(!S.fired||typeof S.fired!=='object')S.fired={};
const OLDCAT={class:'school',meet:'school',event:'school',duty:'school',exam:'school',bday:'mine'};
S.events.forEach(e=>{if(!CAT[e.cat])e.cat=OLDCAT[e.cat]||'etc'});

// 날짜 'YYYY-MM-DD' ↔ 한국 시각
const ymd=t=>{const d=new Date(t+KST);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
const dsUTC=ds=>{const [y,m,d]=ds.split('-').map(Number);return Date.UTC(y,m-1,d)};
const atKST=(ds,tm)=>{const [h,mi]=(tm||'08:00').split(':').map(Number);return dsUTC(ds)+(h*60+mi)*60000-KST};
const addDays=(ds,n)=>{const d=new Date(dsUTC(ds)+n*DAY);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
const wdOf=ds=>new Date(dsUTC(ds)).getUTCDay();
const dayDiff=(a,b)=>Math.round((dsUTC(b)-dsUTC(a))/DAY);
const todayDS=()=>ymd(now());
const fullDate=ds=>{const [y,m,d]=ds.split('-').map(Number);return `${y}년 ${m}월 ${d}일 (${WD[wdOf(ds)]})`};
const timeText=e=>e.allday?'종일':e.time+(e.end?'~'+e.end:'');
const alarmAt=e=>e.allday?'08:00':e.time;   // 종일 일정은 아침 8시 기준

// 음력 + 공휴일
const fLun=new Intl.DateTimeFormat('ko-KR-u-ca-chinese',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'});
const lunC={};
function lunar(ds){
  if(lunC[ds])return lunC[ds];
  const [y,m,d]=ds.split('-').map(Number);let r=KL(y,m,d);
  if(!r){r={m:0,d:0,leap:false,len:30};try{const p=Object.fromEntries(fLun.formatToParts(atKST(ds,'12:00')).map(x=>[x.type,x.value]));r={leap:/^윤/.test(p.month),m:+String(p.month).replace('윤',''),d:+p.day,len:30}}catch(e){}}
  return lunC[ds]=r;
}
const lunText=ds=>{const l=lunar(ds);return l.m?`음력 ${l.leap?'윤':''}${l.m}월 ${l.d}일`:''};
const SOLAR={'01-01':'신정','03-01':'삼일절','05-05':'어린이날','06-06':'현충일','08-15':'광복절','10-03':'개천절','10-09':'한글날','12-25':'성탄절'};
function holiday(ds){
  const md=ds.slice(5);if(SOLAR[md])return SOLAR[md];
  const l=lunar(ds);if(l.leap)return '';
  if(l.m===1&&l.d===1)return '설날';
  if(l.m===1&&l.d===2)return '설 연휴';
  const n=lunar(addDays(ds,1));if(!n.leap&&n.m===1&&n.d===1)return '설 연휴';
  if(l.m===4&&l.d===8)return '부처님오신날';
  if(l.m===8&&l.d===15)return '추석';
  if(l.m===8&&(l.d===14||l.d===16))return '추석 연휴';
  return '';
}

// 반복 일정이 그날에 있는지
function occursOn(e,ds){
  if(ds<e.date)return false;
  if(e.until&&ds>e.until)return false;
  switch(e.repeat){
    case 'daily':return true;
    case 'weekdays':{const w=wdOf(ds);return w>0&&w<6}
    case 'weekly':return dayDiff(e.date,ds)%7===0;
    case 'monthly':return ds.slice(8)===e.date.slice(8);
    case 'yearly':return ds.slice(5)===e.date.slice(5);
    case 'lunar':{const a=lunar(e.date),b=lunar(ds);return a.m===b.m&&a.d===b.d&&a.leap===b.leap}
    default:return ds===e.date;
  }
}

// ---------- 수도 기본 일정: 치성(음력 날짜) + 5일(갑·기일, 5일 간격) ----------
// 치성 날짜·행사명: 대진성주회 행사·일정(djseongju.org)에서 2025~2028년을 확인해 음력으로 정리
const CHISEONG=[[1,1,'원단(설날) 신명종합치성'],[1,7,'태백호텔 치성일'],[2,10,'옥황상제님 대순감오득도치성'],[3,1,'대구도장 영대봉안치성'],[3,6,'옥황상제님 화천치성'],[3,11,'중원도장 영대봉안치성'],[4,28,'옥황상제님 봉천명치성'],[6,24,'구천상제님 화천치성'],[7,21,'신기도장 영대봉안치성'],[8,15,'중추절(추석) 신명종합치성'],[9,19,'구천상제님 탄강치성'],[11,15,'부산도장 영대봉안치성'],[11,30,'박성상제님 탄강치성'],[12,4,'옥황상제님 탄강치성'],[12,4,'박성상제님 화천치성']];
const P5C='#f9a825';
const jdn=ds=>Math.floor(dsUTC(ds)/DAY)+2440588;
const isP5=ds=>(jdn(ds)+9)%5===0;      // 천간이 갑(甲)·기(己)인 날 = 5일마다
function chiseongOn(ds){
  const l=lunar(ds);if(!l.m||l.leap)return [];
  return CHISEONG.map((c,i)=>({c,i})).filter(({c})=>c[0]===l.m&&(c[1]===l.d||(c[1]===30&&l.len===29&&l.d===29)));
}
function builtinsOn(ds){
  const out=[];
  if(S.showCs!==false)chiseongOn(ds).forEach(({c,i})=>out.push({id:'cs'+i,builtin:'cs',title:c[2],allday:true,time:'',cat:'sudo',before:+S.csAlarm,repeat:'lunar',date:ds,memo:'',place:''}));
  if(S.show5!==false&&isP5(ds))out.push({id:'p5',builtin:'p5',title:'5일',allday:true,time:'',cat:'sudo',before:+S.p5Alarm,repeat:'p5',date:ds,memo:'',place:''});
  return out;
}
function nextBuiltin(test,from,max){let ds=from;for(let i=0;i<(max||400);i++,ds=addDays(ds,1))if(test(ds))return ds;return null}
window.__evRefresh=()=>{if(screen==='cal')renderCal();updateNext()};
const eventsOn=ds=>builtinsOn(ds).concat(S.events.filter(e=>occursOn(e,ds)).sort((a,b)=>(a.allday?'':a.time)<(b.allday?'':b.time)?-1:1));
function nextOcc(e,from){let ds=from<e.date?e.date:from;for(let i=0;i<800;i++,ds=addDays(ds,1)){if(e.until&&ds>e.until)return null;if(occursOn(e,ds))return ds}return null}
const alarmText=e=>e.before<0?'알림 없음':e.allday&&e.before===0?'당일 아침 8시 알림':e.allday&&e.before===1440?'하루 전 아침 8시 알림':e.before===0?'정각 알림':e.before===1440?'하루 전 알림':e.before>=60?`${e.before/60}시간 전 알림`:`${e.before}분 전 알림`;
const meta=e=>[alarmText(e),REP[e.repeat],e.place?'📍'+e.place:''].filter(Boolean).join(' · ');
function dayLabel(ds){
  const t=todayDS(),[,m,d]=ds.split('-').map(Number);
  if(ds===t)return '오늘';if(ds===addDays(t,1))return '내일';if(ds===addDays(t,2))return '모레';
  return `${m}/${d}(${WD[wdOf(ds)]})`;
}
function upcoming(days,limit){
  const t=now(),out=[];let ds=todayDS();
  for(let i=0;i<days&&out.length<limit;i++,ds=addDays(ds,1))
    eventsOn(ds).forEach(e=>{const end=e.allday?atKST(addDays(ds,1),'00:00'):atKST(ds,e.end||e.time)+60000;if(end>t)out.push({e,ds,at:e.allday?atKST(ds,'00:00'):atKST(ds,e.time)})});
  return out.sort((a,b)=>a.at-b.at).slice(0,limit);
}
const locked=()=>S.pin&&!unlocked;

// ---------- 잠금 (PIN은 해시만 저장) ----------
let unlocked=false;
async function hash(p){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('phoneTimer|'+p));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return 'plain:'+p}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&S.pin){unlocked=false;if(screen==='cal')setScreen('home');updateNext()}});
function askPin(){
  openSheet(`<div class="shead"><h2>🔒 일정 잠금</h2><button class="sbtn gray" data-act="closesheet">닫기</button></div>
  <div class="lockBox"><div class="small">PIN을 넣어 주세요</div><input id="pinIn" type="password" inputmode="numeric" maxlength="8" autocomplete="off"><br><br><button class="sbtn purple" data-act="unlock">열기</button></div>`);
  setTimeout(()=>{const i=$('#pinIn');if(i)i.focus()},50);
}

// ---------- 달력 화면 ----------
let calY,calM,sel,view='month',editId=null,cat='school';
function openCal(){
  if(locked())return askPin();
  if(!sel)sel=todayDS();calY=+sel.slice(0,4);calM=+sel.slice(5,7);
  setScreen('cal');renderCal();
}
function setView(v){
  view=v;document.querySelectorAll('.vt').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  $('#monthCard').hidden=v!=='month';$('#dayCard').hidden=v!=='month';$('#findCard').hidden=v!=='find';
  $('#listCard').hidden=v==='find';$('#listTag').textContent=v==='list'?'◆ 앞으로 60일 일정':'◆ 앞으로 7일 일정';
  renderUp();if(v==='find')setTimeout(()=>$('#findIn').focus(),50);
}
function renderCal(){
  $('#calTitle').textContent=`${calY}년 ${calM}월`;
  const first=`${calY}-${pad(calM)}-01`,start=addDays(first,-wdOf(first)),t=todayDS();
  const lastDay=new Date(Date.UTC(calY,calM,0)).getUTCDate(),weeks=Math.ceil((wdOf(first)+lastDay)/7);
  let h='',ds=start;
  for(let i=0;i<weeks*7;i++,ds=addDays(ds,1)){
    const l=lunar(ds),hol=holiday(ds),w=i%7,all=eventsOn(ds),evs=all.filter(e=>!e.builtin);
    const p5=all.some(e=>e.builtin==='p5'),cs=all.some(e=>e.builtin==='cs');
    const cls=['cell',+ds.slice(5,7)!==calM?'out':'',w===0?'sun':'',w===6?'sat':'',hol?'hol':'',p5?'p5':'',cs?'cs':'',ds===t?'today':'',ds===sel?'sel':''].filter(Boolean).join(' ');
    h+=`<button class="${cls}" data-act="selday" data-d="${ds}">${p5?'<span class="p5b">5일</span>':''}<span class="dn">${+ds.slice(8)}</span>`+
      (cs?`<span class="hn csn">치성</span>`:hol?`<span class="hn">${hol}</span>`:`<span class="ln">${l.m?(l.leap?'윤':'')+l.m+'.'+l.d:''}</span>`)+
      `<span class="dots">${evs.slice(0,4).map(e=>`<i style="background:${catOf(e).c}"></i>`).join('')}</span></button>`;
  }
  $('#calGrid').innerHTML=h;
  $('#legend').innerHTML=CATS.map(c=>`<i style="background:${c.c}"></i>${c.n}`).join(' ')+` <i class="lg5"></i>5일 <i class="lgcs"></i>치성`;
  renderDay();renderUp();
}
function evRow(e,ds,withDate){
  const c=catOf(e),past=!e.allday&&atKST(ds,e.end||e.time)<now();
  return `<div class="ev${past?' past':''}${e.builtin?' bi-'+e.builtin:''}" style="--cc:${c.c}"><span class="cb"></span><span class="t">${withDate?`<small>${dayLabel(ds)}</small><br>`:''}${timeText(e)}</span>`+
    `<span class="n"><span class="tt">${esc(e.title)}</span><span class="m">${esc(meta(e))}</span>${e.memo?`<span class="mm">📝 ${esc(e.memo.split(/\r?\n/)[0].slice(0,40))}${e.memo.length>40||/\n/.test(e.memo)?' …':''}</span>`:''}</span>`+
    `<span class="ct">${e.builtin==='p5'?'5일':e.builtin==='cs'?'치성':c.n}</span>${e.builtin?'<span class="bi">🙏</span>':`<button class="e" data-act="editev" data-id="${e.id}" data-d="${ds}" aria-label="열기·고치기">✎</button>`}</div>`;
}
function renderDay(){
  const [,m,d]=sel.split('-').map(Number),hol=holiday(sel);
  $('#dayTitle').innerHTML=`${m}월 ${d}일 ${WD[wdOf(sel)]}요일 <span class="lu">(${lunText(sel)})</span>${hol?` <span class="hd">· ${hol}</span>`:''}`;
  const evs=eventsOn(sel);
  $('#dayList').innerHTML=evs.length?evs.map(e=>evRow(e,sel,false)).join(''):'<div class="noev">이날 일정이 없습니다.</div>';
}
function renderUp(){
  const ups=upcoming(view==='list'?60:7,200);let h='',last='';
  ups.forEach(u=>{if(u.ds!==last){h+=`<div class="upDay">▶ ${dayLabel(u.ds)} · ${fullDate(u.ds)}</div>`;last=u.ds}h+=evRow(u.e,u.ds,false)});
  $('#upList').innerHTML=h||'<div class="noev">다가오는 일정이 없습니다.</div>';
}

// ---------- 일정 입력 창 ----------
function renderCats(){$('#evCats').innerHTML=CATS.map(c=>`<button class="cat${c.k===cat?' on':''}" style="--cc:${c.c}" data-act="evcat" data-k="${c.k}">${c.n}</button>`).join('')}
function syncForm(){
  const all=$('#evAllday').checked;$('#timeRow').style.display=all?'none':'';
  const d=$('#evDate').value;$('#evLunar').textContent=d?`${fullDate(d)} · ${lunText(d)}${holiday(d)?' · '+holiday(d):''}`:'';
  const r=$('#evRepeat').value;$('#evUntil').closest('.addRow').style.display=r==='none'?'none':'';
  $('#memoCount').textContent=`${$('#evMemo').value.length} / 10000자`;
  const ta=$('#evMemo');ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight+4,window.innerHeight*.45)+'px';
}
function openForm(e,ds){
  editId=e?e.id:null;cat=e?(e.cat||'etc'):'school';
  $('#formTitle').textContent=e?'✎ 일정 보기 · 고치기':'＋ 새 일정';
  $('#evTitle').value=e?e.title:'';$('#evDate').value=e?e.date:(ds||sel);
  $('#evAllday').checked=e?!!e.allday:false;
  const d=new Date(now()+KST+3600e3);
  $('#evTime').value=e&&e.time?e.time:pad(d.getUTCHours())+':00';$('#evEnd').value=e?(e.end||''):'';
  $('#evBefore').value=String(e?e.before:10);$('#evRepeat').value=e?e.repeat:'none';$('#evUntil').value=e?(e.until||''):'';
  $('#evPlace').value=e?(e.place||''):'';$('#evMemo').value=e?(e.memo||''):'';$('#evDday').checked=e?!!e.dday:false;
  $('#addBtn').textContent=e?'✔ 고친 내용 저장':'＋ 일정 저장';$('#delBtn').hidden=!e;
  renderCats();$('#formBg').classList.add('open');syncForm();
  if(!e)setTimeout(()=>$('#evTitle').focus(),60);
}
function closeForm(){$('#formBg').classList.remove('open');editId=null}
function markPast(e){ // 저장하는 순간 이미 지난 알림은 울리지 않게
  const t=now();for(let i=-1;i<=2;i++){const ds=addDays(todayDS(),i);if(e.before>=0&&occursOn(e,ds)&&atKST(ds,alarmAt(e))-e.before*60000<=t)S.fired[e.id+'@'+ds]=1}
}
function saveForm(){
  const title=$('#evTitle').value.trim(),date=$('#evDate').value,allday=$('#evAllday').checked,time=$('#evTime').value,end=$('#evEnd').value;
  if(!title)return toast('제목을 넣어 주세요');if(!date)return toast('날짜를 넣어 주세요');if(!allday&&!time)return toast('시각을 넣어 주세요');
  if(!allday&&end&&end<=time)return toast('끝 시각이 시작보다 늦어야 합니다');
  const repeat=$('#evRepeat').value,until=repeat==='none'?'':$('#evUntil').value;
  if(until&&until<date)return toast('반복 끝나는 날이 시작 날보다 앞입니다');
  const data={title,date,allday,time:allday?'':time,end:allday?'':end,cat,before:+$('#evBefore').value,repeat,until,
    place:$('#evPlace').value.trim(),memo:$('#evMemo').value,dday:$('#evDday').checked,updated:now()};
  let e;
  if(editId&&(e=S.events.find(x=>x.id===editId))){Object.assign(e,data);Object.keys(S.fired).forEach(k=>{if(k.startsWith(e.id+'@'))delete S.fired[k]})}
  else{e=Object.assign({id:now().toString(36)+Math.random().toString(36).slice(2,6),created:now()},data);S.events.push(e)}
  markPast(e);save();
  toast(`${fullDate(date)} ${timeText(e)} 저장됨`);
  sel=date;calY=+date.slice(0,4);calM=+date.slice(5,7);
  closeForm();renderCal();updateNext();if(view==='find')doFind();askPermOnce();
}
function delForm(){
  const e=S.events.find(x=>x.id===editId);if(!e)return closeForm();
  if(!confirm(e.repeat!=='none'?`반복 일정 "${e.title}"을(를) 모두 지울까요?`:`"${e.title}" 일정을 지울까요?`))return;
  S.events=S.events.filter(x=>x.id!==e.id);save();closeForm();renderCal();updateNext();if(view==='find')doFind();toast('삭제했습니다');
}

// ---------- 검색 (년·월·일·시 함께 표시) ----------
function hl(text,q){const t=esc(text);if(!q)return t;const i=t.toLowerCase().indexOf(esc(q).toLowerCase());return i<0?t:t.slice(0,i)+'<mark>'+t.slice(i,i+esc(q).length)+'</mark>'+t.slice(i+esc(q).length)}
function doFind(){
  const q=$('#findIn').value.trim();
  if(!q){$('#findList').innerHTML='';$('#findSum').textContent='찾을 말을 넣으면 년·월·일·시와 함께 보여 줍니다.';return}
  const ql=q.toLowerCase(),t=todayDS();
  const hits=S.events.filter(e=>{
    const [y,m,d]=e.date.split('-').map(Number);
    const hay=[e.title,e.place,e.memo,catOf(e).n,REP[e.repeat],e.date,`${y}년`,`${m}월`,`${d}일`,`${m}월 ${d}일`,`${y}년 ${m}월`,`${y}.${m}.${d}`,e.time,lunText(e.date)].join(' ').toLowerCase();
    return hay.includes(ql);
  }).sort((a,b)=>(b.date+(b.time||''))<(a.date+(a.time||''))?-1:1);
  let bh='';
  CHISEONG.forEach((c,i)=>{
    if(S.showCs===false)return;
    const hay=[c[2],'치성','수도',`음력 ${c[0]}월 ${c[1]}일`,`${c[0]}.${c[1]}`].join(' ').toLowerCase();if(!hay.includes(ql))return;
    const nx=nextBuiltin(d=>chiseongOn(d).some(x=>x.i===i),t,400);if(!nx)return;const [y,m,d]=nx.split('-').map(Number);
    bh+=`<button class="fr" style="--cc:#8d1f3a" data-act="findday" data-d="${nx}"><span class="cb"></span><span class="fd"><span class="fw"><span class="fy">${y}년</span> ${m}월 ${d}일 (${WD[wdOf(nx)]}) <span class="fh">종일</span></span><span class="fn">${hl(c[2],q)} <span class="ct">치성</span></span><span class="m">🔁 음력 매년 ${c[0]}월 ${c[1]}일 · ${dayDiff(t,nx)===0?'오늘':'D-'+dayDiff(t,nx)}</span></span></button>`;
  });
  if(S.show5!==false&&/5일|오일|수도/.test(q)){
    let d5=nextBuiltin(isP5,t,6);const list=[];for(let i=0;i<6&&d5;i++){list.push(d5);d5=nextBuiltin(isP5,addDays(d5,1),6)}
    bh+=list.map(x=>{const [y,m,d]=x.split('-').map(Number);return `<button class="fr" style="--cc:${P5C}" data-act="findday" data-d="${x}"><span class="cb"></span><span class="fd"><span class="fw"><span class="fy">${y}년</span> ${m}월 ${d}일 (${WD[wdOf(x)]}) <span class="fh">종일</span></span><span class="fn">5일 <span class="ct">5일</span></span><span class="m">🔁 5일마다 · ${lunText(x)}</span></span></button>`}).join('');
  }
  const bn=(bh.match(/class="fr"/g)||[]).length;
  $('#findSum').textContent=`"${q}" 검색 결과 ${hits.length+bn}건`;
  $('#findList').innerHTML=hits.map(e=>{
    const c=catOf(e),[y,m,d]=e.date.split('-').map(Number),nx=e.repeat!=='none'?nextOcc(e,t):null;
    const when=`<span class="fy">${y}년</span> ${m}월 ${d}일 (${WD[wdOf(e.date)]}) <span class="fh">${e.allday?'종일':e.time.replace(':','시 ')+'분'+(e.end?' ~ '+e.end.replace(':','시 ')+'분':'')}</span>`;
    const memoHit=e.memo&&e.memo.toLowerCase().includes(ql)&&!e.title.toLowerCase().includes(ql);
    let snip='';if(memoHit){const i=e.memo.toLowerCase().indexOf(ql),a=Math.max(0,i-20);snip=`<span class="mm">📝 ${a?'…':''}${hl(e.memo.slice(a,i+q.length+30),q)}…</span>`}
    return `<button class="fr" style="--cc:${c.c}" data-act="findgo" data-id="${e.id}" data-d="${nx||e.date}"><span class="cb"></span><span class="fd"><span class="fw">${when}</span><span class="fn">${hl(e.title,q)} <span class="ct">${c.n}</span></span>`+
      `${e.repeat!=='none'?`<span class="m">🔁 ${REP[e.repeat]} 반복 · 다음: ${nx?fullDate(nx):'끝남'}</span>`:''}${e.place?`<span class="m">📍 ${hl(e.place,q)}</span>`:''}${snip}</span></button>`;
  }).join('')+bh||'<div class="noev">찾은 일정이 없습니다.</div>';
}
document.addEventListener('input',ev=>{if(ev.target.id==='findIn')doFind();else if(ev.target.closest&&ev.target.closest('#formBg'))syncForm()});

// ---------- 첫 화면: 다음 일정 + D-day ----------
function updateNext(){
  const card=$('#nextCard'),ups=upcoming(7,10).filter(u=>!u.e.builtin).slice(0,2),t=todayDS();
  const dd=S.events.filter(e=>e.dday).map(e=>{const ds=nextOcc(e,t);return ds?{e,ds,n:dayDiff(t,ds)}:null}).filter(Boolean).sort((a,b)=>a.n-b.n).slice(0,3);
  if(S.showCs!==false){const nc=nextBuiltin(d=>chiseongOn(d).length>0,t,400);if(nc){const n=dayDiff(t,nc);dd.unshift({e:{title:chiseongOn(nc).map(x=>x.c[2]).join(' · '),cat:'sudo'},ds:nc,n,cs:true})}}
  const n5=S.show5!==false?nextBuiltin(isP5,t,6):null;
  if(!ups.length&&!dd.length&&!n5){card.hidden=true;return}
  card.hidden=false;
  $('#nextList').innerHTML=ups.map(u=>`<div class="nx"><span class="when">${dayLabel(u.ds)} ${timeText(u.e)}</span><span class="what" style="color:${catOf(u.e).c}">${locked()?'🔒 잠긴 일정':esc(u.e.title)}</span></div>`).join('');
  $('#ddayList').innerHTML=dd.map(x=>`<div class="nx dd"><span class="dday${x.cs?' csd':''}">${x.n===0?'D-DAY':'D-'+x.n}</span><span class="what" style="color:${catOf(x.e).c}">${x.cs?'🙏 ':''}${locked()&&!x.cs?'🔒 잠긴 일정':esc(x.e.title)}</span></div>`).join('')+
    (n5?`<div class="nx"><span class="when p5w">${n5===t?'오늘':dayLabel(n5)}</span><span class="what" style="color:#b26a00">5일${n5===t?'입니다':''}</span></div>`:'');
}

// ---------- 알림: 화면 + 소리 + 진동 ----------
// '폰 소리 설정 따르기' = 폰 알림으로 울림 → 폰이 무음·진동이면 안드로이드가 소리를 내지 않음
const queue=[];
function permText(){if(!('Notification' in window))return '이 브라우저는 지원 안 함';return {granted:'허용됨 ✔',denied:'막힘 (폰 설정에서 허용)',default:'아직 안 물어봄'}[Notification.permission]}
window.__evPerm=()=>{const p=$('#permState');if(p)p.textContent=permText()};
async function askPerm(){if(!('Notification' in window))return toast('이 브라우저는 알림을 지원하지 않습니다');try{await Notification.requestPermission()}catch(e){}window.__evPerm()}
let asked=false;
function askPermOnce(){if(asked||S.evSound!=='system'||!('Notification' in window)||Notification.permission!=='default')return;asked=true;askPerm()}
async function sysNotify(title,body,tag){
  if(!('Notification' in window)||Notification.permission!=='granted')return false;
  const opt={body,tag,renotify:true,requireInteraction:true,icon:'icons/icon-192.png',badge:'icons/icon-192.png',vibrate:[300,150,300,150,300]};
  try{const reg=await navigator.serviceWorker.getRegistration();if(reg){await reg.showNotification(title,opt);return true}}catch(e){}
  try{new Notification(title,opt);return true}catch(e){return false}
}
function appChime(){
  if(!ensureAudio()||S.muted)return;
  const t0=AC.currentTime+.05;
  for(let k=0;k<3;k++){const b=t0+k*1.6;bell(783.99,b,.9,.45);bell(1046.5,b+.25,1.1,.45)}
}
function vib(p){try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}}
function fire(e,ds,at){
  const lead=Math.round((at-now())/60000);
  const when=`${dayLabel(ds)} ${timeText(e)}`;
  const more=[e.allday?'종일 일정':lead>0?(lead>=60?`${Math.round(lead/60)}시간 뒤 시작`:`${lead}분 뒤 시작`):'지금 시작',catOf(e).n,e.place?'📍'+e.place:''].filter(Boolean).join(' · ');
  queue.push({when,name:locked()?'🔒 잠긴 일정':e.title,more,memo:locked()?'':(e.memo||'')});
  if(!document.body.classList.contains('evon'))showAlert();
  if(S.evSound==='app'){appChime();vib([400,200,400,200,400])}
  else if(S.evSound==='system'){sysNotify('🔔 '+(locked()?'일정 알림':e.title),`${when} · ${more}`,e.id+'@'+ds).then(ok=>{if(!ok)vib([400,200,400])})}
}
function showAlert(){
  const a=queue.shift();if(!a){document.body.classList.remove('evon');return}
  $('#evWhen').textContent=a.when;$('#evName').textContent=a.name;$('#evMore').textContent=a.more;
  const mm=$('#evMemoShow');mm.textContent=a.memo;mm.hidden=!a.memo;
  document.body.classList.add('evon');
}
function check(t){
  const today=todayDS();
  for(let i=-1;i<=2;i++){
    const ds=addDays(today,i);
    for(const e of eventsOn(ds)){
      if(e.before<0)continue;
      const at=atKST(ds,alarmAt(e)),trig=at-e.before*60000,key=e.id+'@'+ds;
      if(S.fired[key]||trig>t)continue;
      S.fired[key]=1;save();
      if(t-trig<15*60000)fire(e,ds,at);   // 15분 넘게 지난 알림은 건너뜀
    }
  }
}
let lastMin=-1;
window.__evTick=t=>{
  check(t);
  const m=Math.floor(t/60000);
  if(m!==lastMin){lastMin=m;updateNext();if(screen==='cal'&&!$('#formBg').classList.contains('open')){renderDay();renderUp()}
    const lim=addDays(todayDS(),-3);Object.keys(S.fired).forEach(k=>{if(k.split('@')[1]<lim)delete S.fired[k]})}
};

// ---------- 백업 ----------
function exportEv(){
  const blob=new Blob([JSON.stringify({app:'수업 타이머',saved:new Date().toISOString(),events:S.events},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`수업타이머_일정백업_${todayDS()}.json`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
document.addEventListener('change',async ev=>{
  if(ev.target.id!=='impFile'||!ev.target.files[0])return;
  try{
    const j=JSON.parse(await ev.target.files[0].text());
    const ok=e=>e&&e.id&&/^\d{4}-\d\d-\d\d$/.test(e.date)&&(e.allday||/^\d\d:\d\d$/.test(e.time));
    const ids=new Set(S.events.map(e=>e.id));let n=0;
    (j.events||[]).filter(ok).forEach(e=>{if(ids.has(e.id))return;
      S.events.push({id:String(e.id),date:e.date,allday:!!e.allday,time:e.allday?'':e.time,end:/^\d\d:\d\d$/.test(e.end)?e.end:'',title:String(e.title||'').slice(0,60),
        cat:CAT[e.cat]?e.cat:'etc',before:Number.isFinite(+e.before)?+e.before:0,repeat:REP[e.repeat]!==undefined?e.repeat:'none',until:/^\d{4}-\d\d-\d\d$/.test(e.until)?e.until:'',
        place:String(e.place||'').slice(0,60),memo:String(e.memo||'').slice(0,10000),dday:!!e.dday});n++});
    S.events.forEach(markPast);save();updateNext();if(screen==='cal')renderCal();toast(`일정 ${n}건을 가져왔습니다`);
  }catch(e){toast('백업 파일을 읽지 못했습니다')}
  ev.target.value='';
});

// ---------- 버튼 연결 ----------
window.__evAct=async(a,el)=>{
  switch(a){
    case 'opencal':openCal();break;
    case 'view':setView(el.dataset.v);break;
    case 'calprev':calM--;if(calM<1){calM=12;calY--}renderCal();break;
    case 'calnext':calM++;if(calM>12){calM=1;calY++}renderCal();break;
    case 'caltoday':sel=todayDS();calY=+sel.slice(0,4);calM=+sel.slice(5,7);renderCal();break;
    case 'selday':if(sel===el.dataset.d){openForm(null,sel);break}sel=el.dataset.d;if(+sel.slice(5,7)!==calM){calY=+sel.slice(0,4);calM=+sel.slice(5,7)}renderCal();break;
    case 'newev':openForm(null,sel);break;
    case 'evcat':cat=el.dataset.k;renderCats();break;
    case 'addev':saveForm();break;
    case 'cancelev':closeForm();break;
    case 'delform':delForm();break;
    case 'editev':openForm(S.events.find(x=>x.id===el.dataset.id));break;
    case 'findgo':{const d=el.dataset.d;sel=d;calY=+d.slice(0,4);calM=+d.slice(5,7);setView('month');renderCal();openForm(S.events.find(x=>x.id===el.dataset.id));break}
    case 'findday':{const d=el.dataset.d;sel=d;calY=+d.slice(0,4);calM=+d.slice(5,7);setView('month');renderCal();$('#dayCard').scrollIntoView({behavior:'smooth'});break}
    case 'findclear':$('#findIn').value='';doFind();break;
    case 'evok':showAlert();break;
    case 'notifperm':await askPerm();break;
    case 'exportev':exportEv();break;
    case 'importev':$('#impFile').click();break;
    case 'setpin':{const v=$('#sPin').value.trim();if(v&&!/^\d{4,8}$/.test(v))return toast('숫자 4~8자리로 넣어 주세요');S.pin=v?await hash(v):'';unlocked=!!v;save();updateNext();toast(v?'일정 잠금을 켰습니다':'일정 잠금을 껐습니다');break}
    case 'unlock':{const v=$('#pinIn').value;if(await hash(v)===S.pin){unlocked=true;closeSheet();updateNext();openCal()}else{toast('PIN이 맞지 않습니다');$('#pinIn').value=''}break}
  }
};
$('#formBg').addEventListener('click',e=>{if(e.target.id==='formBg')closeForm()});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='pinIn'){e.preventDefault();window.__evAct('unlock')}});
setView('month');updateNext();check(now());
})();

// ---------- 서비스워커 (오프라인 저장) ----------
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})});
}

// ---------- 시작 ----------
// 앱을 닫았다 다시 열어도 진행 중이던 타이머를 이어서 보여 줌
if(S.run&&(S.run.state==='running'||S.run.state==='paused')){
  const r=S.run;
  if(r.state==='paused'||r.segEnd>now()){screen='timer';E.state=r.state;E.segEnd=r.segEnd;E.remMs=r.remMs;E.total=r.total;E.lastMs=r.lastMs}
  else S.run=null;
}
applyTheme();renderChips();updateClock(now());renderAll();
requestAnimationFrame(frame);
})();
