import {sectors,newGame,prepareWave,buyUpgrade,pulse,tick,restore,checkpoint,waveCount,costOf,MAX_UPGRADE,damageOf,rangeOf} from './engine.js'
import {World,drawUpgrade} from './world.js'
import {bindOrbitInput} from './orbit-input.js'

const icons={
  book:'<path d="M3 5c3-1 6-.6 9 1.5C15 4.4 18 4 21 5v14c-3-1-6-.6-9 1.5C9 18.4 6 18 3 19zM12 6.5v14"/>',
  sound:'<path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 5.8a9 9 0 0 1 0 12.4"/>',
  mute:'<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>',
  pause:'<path d="M7.5 5.5v13M16.5 5.5v13" stroke-width="3.2"/>',
  sector:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
  layers:'<path d="m2.5 8 9.5-5 9.5 5-9.5 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  shield:'<path d="m12 3 8 3v5c0 4.5-2.5 7.6-8 10-5.5-2.4-8-5.5-8-10V6z"/>',
  shard:'<path d="m13 2 6 8-8 12-6-9z" fill="currentColor" stroke="none"/><path d="m13 4-1 9 5-3" stroke="#203c33" stroke-width="1.1"/>',
  wave:'<path d="M2 15h3l4-9 3 13 4-10 2 6h4"/>',
  orbit:'<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.8" transform="rotate(-28 12 12)"/>',
  resetView:'<path d="M3 10a9 9 0 1 1 2.6 8.4M3 4v6h6"/>',
  speed:'<path d="m3 6 7 6-7 6zm9 0 7 6-7 6z" fill="currentColor" stroke="none"/>',
  upgrade:'<path d="m3 14 5-5 5 5M3 19l5-5 5 5M13 8l4-4 4 4M17 4v12"/>',
  burst:'<path d="m12 2 1.7 6.6L20 5l-3.8 6.3L23 13l-7 1.6 3.5 6.1-6.1-3.6L11 23l-1-7-6.8 3.6L7 13.4 1 11l7-1.7L5 3.4l5.6 4.4z"/>',
  play:'<path d="M5 3.5 21 12 5 20.5z" fill="currentColor" stroke="none"/>',
  close:'<path d="m5 5 14 14M19 5 5 19"/>',
  mouse:'<rect x="6.5" y="2" width="11" height="20" rx="5.5"/><path d="M12 5v4"/>',
  save:'<path d="m12 2 8 4v6c0 4-3.4 7.6-8 10-4.6-2.4-8-6-8-10V6zM8.4 11.8l2.5 2.5 4.8-5.1"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check:'<path d="m4 12 5 5L20 6"/>'
}
const svg=key=>'<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[key]+'</svg>'
const el=id=>document.getElementById(id)
for(const i of document.querySelectorAll('[data-icon]'))i.innerHTML=svg(i.dataset.icon)
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('phaseform-'+key))??fallback}catch{return fallback}}
const write=(key,value)=>{try{localStorage.setItem('phaseform-'+key,JSON.stringify(value))}catch{}}
let game=restore(read('checkpoint',null)),speed=read('speed',1)===2?2:1,muted=read('mute',false)
const save=()=>{if(game.phase==='build')write('checkpoint',checkpoint(game))}
const world=new World(el('field')),dialog=el('dialog')
const pad=n=>String(n).padStart(2,'0')
const statusKey={damage:'Pulse emitter',range:'Field radius',axis:'Axis array'}
let audio,modalKind='',toastTimer=0,visualTime=.6,last=performance.now(),uiClock=0
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches
function sound(type){
  if(muted||!audio||audio.state!=='running')return
  const pitches={shot:[340,115,.08,.025],start:[220,490,.23,.045],upgrade:[460,920,.17,.052],clear:[470,940,.4,.04],impact:[130,55,.13,.045],burst:[570,65,.45,.075],select:[630,470,.09,.033]}
  const def=pitches[type];if(!def)return
  const [start,end,duration,volume]=def,t=audio.currentTime,o=audio.createOscillator(),amp=audio.createGain()
  o.type=type==='shot'||type==='impact'?'triangle':'sine'
  o.frequency.setValueAtTime(start,t);o.frequency.exponentialRampToValueAtTime(end,t+duration)
  amp.gain.setValueAtTime(.0001,t);amp.gain.exponentialRampToValueAtTime(volume,t+.012)
  amp.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(amp);amp.connect(audio.destination);o.start(t);o.stop(t+duration+.02)
}
function unlockAudio(){
  if(muted)return
  try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{})}catch{}
}
document.addEventListener('pointerdown',unlockAudio,{passive:true});document.addEventListener('keydown',unlockAudio)
function toast(msg){clearTimeout(toastTimer);el('toast').textContent=msg;el('toast').classList.add('show');toastTimer=setTimeout(()=>el('toast').classList.remove('show'),2800)}
function setIcon(button,name){button.querySelector('i').innerHTML=svg(name)}
function refresh(){
  const s=sectors[game.sector-1]
  el('sector').textContent='SECTOR '+pad(game.sector);el('location').textContent=s.name;el('plane').textContent=s.plane
  el('wallet').textContent=game.shards;el('health').textContent=game.hp;el('wave').textContent=pad(game.wave)
  el('segments').innerHTML=Array.from({length:10},(_,i)=>'<b class="'+(i*10>=game.hp?'off':'')+'"></b>').join('')
  const fighting=game.phase==='battle',needsAxis=game.axis<game.sector-1
  el('phase').textContent=fighting?'Wave active':game.phase==='build'?'Build phase':game.phase==='won'?'Field secured':'Core offline'
  el('phase').parentNode.classList.toggle('active',fighting)
  el('speed-text').textContent=speed+'×';el('speed').setAttribute('aria-label','Change simulation speed, currently '+speed+' times')
  el('burst').hidden=!fighting;el('burst').disabled=game.burstClock>0
  el('burst-text').textContent=game.burstClock>0?Math.ceil(game.burstClock)+'s cooldown':'Pulse burst'
  const remaining=game.left+game.enemies.length
  el('next-label').textContent=fighting?'In combat':'Next wave'
  el('incoming').textContent=(fighting?remaining:waveCount(game))+' '+((fighting?remaining:waveCount(game))===1?'hostile':'hostiles')
  el('launch-text').textContent=fighting?'Pause wave':needsAxis?'Install axis array':'Start wave'
  el('launch').disabled=['won','lost'].includes(game.phase)
  setIcon(el('launch'),fighting?'pause':needsAxis?'upgrade':'play')
  const canBuild=['battle','build'].includes(game.phase)
  for(const k of Object.keys(statusKey)){
    const btn=el('upgrade-'+k),limit=k==='axis'?game.sector-1:MAX_UPGRADE
    const locked=k==='axis'&&game.axis===limit&&game.axis<2
    const full=game[k]>=limit
    const cost=costOf(game,k)
    const budget=game.shards-(needsAxis&&k!=='axis'?costOf(game,'axis'):0)
    btn.disabled=!canBuild||full||budget<cost
    btn.classList.toggle('locked',locked);btn.classList.toggle('unaffordable',!full&&budget<cost)
    el('lv-'+k).textContent=locked?(game.axis===0?'LOCKED':'LV. 01'):full?'MAX LEVEL':'LV. '+pad(game[k])
    el('price-'+k).innerHTML=locked?svg('lock')+'Sector '+pad(game.sector+1):full?svg('check')+'Maxed':svg('shard')+cost
    const info=k==='damage'?damageOf(game)+' → '+(damageOf(game)+6)+' pulse damage':k==='range'?rangeOf(game).toFixed(1)+' → '+(rangeOf(game)+.67).toFixed(1)+' unit range':game.axis===0?'Add an upper-axis emitter':'Add a lower-axis emitter'
    btn.title=locked?'Next axis available in sector '+pad(game.sector+1):full?'Fully upgraded':budget<cost?(needsAxis&&k!=='axis'?'Shards reserved for the axis array':'Requires '+cost+' shards'):info+' · '+cost+' shards'
    btn.setAttribute('aria-label',statusKey[k]+'. '+btn.title)
  }
  const soundText=muted?'Unmute sound':'Mute sound'
  setIcon(el('sound'),muted?'mute':'sound');el('sound').title=soundText+' (M)';el('sound').setAttribute('aria-label',soundText)
  el('sound').setAttribute('aria-pressed',String(muted))
}
function paintCards(){for(const canvas of document.querySelectorAll('[data-art]'))drawUpgrade(canvas,canvas.dataset.art,game.axis===0&&game.sector===1)}
function upgrade(key){
  if(game.axis<game.sector-1&&key!=='axis'&&game.shards-costOf(game,key)<costOf(game,'axis')){toast('Reserve '+costOf(game,'axis')+' shards for the axis array.');return}
  if(buyUpgrade(game,key)){
    sound('upgrade');game.soundEvent='';save();refresh();paintCards()
    toast(key==='axis'?(game.axis===1?'Upper-axis emitter online':'Lower-axis emitter online'):statusKey[key]+' upgraded to level '+pad(game[key]))
  }
}
function closeDialog(){if(dialog.open)dialog.close();modalKind='';last=performance.now()}
function openDialog(kind,kicker,title,content,buttons,canClose=true){
  modalKind=kind;el('dialog-kicker').textContent=kicker;el('dialog-title').textContent=title;el('dialog-content').innerHTML=content
  el('close').hidden=!canClose;el('dialog-buttons').replaceChildren()
  for(const [text,action,primary] of buttons){
    const btn=document.createElement('button');btn.textContent=text;if(primary)btn.className='primary';btn.addEventListener('click',action);el('dialog-buttons').append(btn)
  }
  if(!dialog.open)dialog.showModal()
  el('dialog-buttons').querySelector('.primary')?.focus()
}
function guide(){
  if(modalKind==='guide'){closeDialog();return}
  openDialog('guide','Field manual','How to defend','<p>Keep the core intact through three waves in each sector. It fires automatically at hostiles inside the dashed range ring.</p><p>Spend shards on the pulse emitter and field radius. In later sectors, install the axis array to intercept enemies above and below the plane.</p><div class="manual-row"><span>Orbit the sphere</span><kbd>DRAG / ARROW KEYS</kbd></div><div class="manual-row"><span>Zoom</span><kbd>SCROLL / PINCH</kbd></div><div class="manual-row"><span>Reset view</span><kbd>R</kbd></div><div class="manual-row"><span>Focus a hostile</span><kbd>CLICK / TAP</kbd></div><div class="manual-row"><span>Cycle focus</span><kbd>F</kbd></div><div class="manual-row"><span>Fire a pulse burst</span><kbd>E</kbd></div><div class="manual-row"><span>Start wave or pause</span><kbd>SPACE</kbd></div>',[['Back to field',closeDialog,true]])
}
function pauseGame(){
  if(modalKind==='pause'){closeDialog();return}
  if(dialog.open||['lost','won'].includes(game.phase))return
  openDialog('pause','Simulation paused','Field on hold','<p>'+sectors[game.sector-1].name+' · Wave '+pad(game.wave)+' of 03</p>',[['Resume',closeDialog,true],['Field guide',guide,false],['Restart run',confirmReset,false]])
}
function confirmReset(){
  openDialog('reset','Restart run','Return to sector 01?','<p>Return to equatorial orbit with a fresh core and 120 shards. This replaces your saved run.</p>',[['Keep playing',closeDialog,true],['Restart run',resetRun,false]])
}
function resetRun(){world.camera.reset();game=newGame();save();paintCards();refresh();closeDialog();toast('Fresh core online')}
function launch(){
  if(dialog.open)return
  if(game.phase==='battle'){pauseGame();return}
  if(game.axis<game.sector-1){upgrade('axis');return}
  if(prepareWave(game)){sound('start');game.soundEvent='';refresh();toast('Wave '+pad(game.wave)+' incoming')}
}
function useBurst(){
  if(!dialog.open&&pulse(game)){sound('burst');game.soundEvent='';refresh()}
}
function toggleSound(){muted=!muted;write('mute',muted);if(!muted){unlockAudio();sound('select')}refresh()}
function focusTarget(id){
  if(!id)return
  if(game.phase==='build'){toast('Approach preview · Start the wave to engage');return}
  game.target=id;sound('select')
}
function phaseChanged(){
  if(game.phase==='build'){
    save();paintCards()
    if(game.notice==='sector'){
      openDialog('sector','Sector '+pad(game.sector)+' unlocked',sectors[game.sector-1].name,
        '<p>'+(game.sector===2?'Hostiles are approaching from above the equator. Install an upper-axis emitter to reach elevated hostiles.':'Hostiles are crossing beneath the field. Extend the axis array downward to cover the lower approach.')+'</p><p>Sector reward · '+(game.sector===2?'70':'100')+' shards</p>',[['Enter sector',closeDialog,true]])
    }else toast('Wave cleared · +25 shards')
  }else if(game.phase==='won'||game.phase==='lost'){
    const won=game.phase==='won'
    write('checkpoint',null)
    openDialog('result',won?'All sectors secured':'Run complete',won?'Field stabilized':'Core fractured',
      '<p>'+(won?'You defended all nine waves across three dimensions.':sectors[game.sector-1].name+' fell during wave '+pad(game.wave)+'.')+'</p><div class="manual-row"><span>Hostiles cleared</span><strong>'+game.totalKills+'</strong></div><div class="manual-row"><span>Final integrity</span><strong>'+game.hp+'%</strong></div>',[['Play again',resetRun,true]],false)
  }
  refresh()
}
el('guide').addEventListener('click',guide);el('pause').addEventListener('click',pauseGame);el('sound').addEventListener('click',toggleSound)
el('speed').addEventListener('click',()=>{speed=speed===1?2:1;write('speed',speed);refresh()})
el('burst').addEventListener('click',useBurst);el('launch').addEventListener('click',launch)
for(const key of Object.keys(statusKey))el('upgrade-'+key).addEventListener('click',()=>upgrade(key))
el('close').addEventListener('click',closeDialog)
dialog.addEventListener('cancel',e=>{e.preventDefault();if(modalKind!=='result')closeDialog()})
dialog.addEventListener('click',e=>{if(e.target!==dialog||modalKind==='result')return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog()})
bindOrbitInput(el('field'),world,focusTarget)
function resetView(){world.camera.reset();world.hover=0}
el('reset-view').addEventListener('click',resetView)
const orbitKeys={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,.08],ArrowDown:[0,-.08]}
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return
  if(dialog.open){if(!e.repeat&&e.code==='Space'&&modalKind==='pause'){e.preventDefault();closeDialog()}return}
  if(orbitKeys[e.key]){
    e.preventDefault();world.camera.orbit(...orbitKeys[e.key]);world.hover=0;return
  }
  if(e.repeat)return
  if(e.code==='KeyR')resetView()
  if(e.code==='Space'){
    e.preventDefault();launch()
  }
  if(e.code==='Escape')pauseGame()
  if(e.code==='KeyH')guide()
  if(e.code==='KeyE')useBurst()
  if(e.code==='KeyM')toggleSound()
  if(e.code==='KeyF'&&game.phase==='battle'&&game.enemies.length){const i=game.enemies.findIndex(e=>e.id===game.target);focusTarget(game.enemies[(i+1)%game.enemies.length].id)}
})
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.phase==='battle'&&!dialog.open)pauseGame();last=performance.now()})
function frame(now){
  const dt=Math.min(.08,(now-last)/1000);last=now
  if(!dialog.open&&!document.hidden){
    if(!reduceMotion||game.phase==='battle')visualTime+=dt*(game.phase==='battle'?speed:1)
    const oldPhase=game.phase
    tick(game,dt*speed)
    if(oldPhase!==game.phase)phaseChanged()
    if(game.soundEvent){sound(game.soundEvent);game.soundEvent=''}
    uiClock+=dt
    if(uiClock>.15&&game.phase==='battle'){refresh();uiClock=0}
  }
  world.draw(game,visualTime);requestAnimationFrame(frame)
}
paintCards();refresh();requestAnimationFrame(frame)
