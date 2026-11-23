export const sectors = [
  {name:'Equatorial Orbit', plane:'2D plane'},
  {name:'Ascendant Arc', plane:'3D upper field'},
  {name:'Polar Reach', plane:'3D full field'}
]
export const MAX_UPGRADE = 5
export const waveCount = game => 7 + (game.wave-1)*2 + (game.sector-1)*3
export const rangeOf = game => 4.15 + (game.range-1)*.67
export const damageOf = game => 10 + (game.damage-1)*6
export function costOf(game, part){
  if(part==='axis')return game.axis===0 ? 70 : 100
  return (part==='damage'?40:45) + (game[part]-1)*32
}
export function newGame(){
  return {version:1,sector:1,wave:1,hp:100,shards:120,damage:1,range:1,axis:0,totalKills:0,
    phase:'build',enemies:[],shots:[],bursts:[],dust:[],left:0,spawnClock:0,shotClock:0,burstClock:0,
    simTime:0,killed:0,escaped:0,target:0,lastShot:0,nextId:1,notice:'',soundEvent:''}
}
export function prepareWave(g){
  if(g.phase!=='build'||g.axis<g.sector-1)return false
  Object.assign(g,{phase:'battle',left:waveCount(g),spawnClock:0,shotClock:0,burstClock:0,killed:0,escaped:0,target:0,notice:'',soundEvent:'start'})
  return true
}
export function buyUpgrade(g,part){
  if(!['build','battle'].includes(g.phase))return false
  if(!['damage','range','axis'].includes(part))return false
  const limit=part==='axis'?g.sector-1:MAX_UPGRADE
  if(g[part]>=limit||g.shards<costOf(g,part))return false
  g.shards-=costOf(g,part)
  g[part]++
  g.soundEvent='upgrade'
  return true
}
function spawn(g){
  const i=waveCount(g)-g.left
  const angle=(i*2.39996 + (g.wave-1)*.81+g.sector*.46)
  const band=g.sector===1?0:g.sector===2?(i%3===0?1:0):[1,-1,0,1,-1][i%5]
  const elevation=band*(.26 + .06*(i%4)), radius=7.5+(i%3)*.5
  const kind=i%5===4?'heavy':i%3===1?'dart':'shard'
  const hp=13+g.sector*6+g.wave*3+(kind==='heavy'?16:0)
  g.enemies.push({id:g.nextId++,angle,elevation,band,r:radius,
    hp,maxHp:hp,kind,speed:(.43+g.sector*.055+g.wave*.024)*(kind==='heavy'?.83:kind==='dart'?1.13:1),
    spin:angle,hit:0,x:Math.cos(angle)*radius*Math.cos(elevation),z:Math.sin(angle)*radius*Math.cos(elevation),y:radius*Math.sin(elevation)})
  g.left--
}
function hit(g,e,damage){
  e.hp-=damage;e.hit=.15
  if(e.hp>0)return
  g.shards+=e.kind==='heavy'?11:8;g.killed++;g.totalKills++
  for(let i=0;i<8;i++){
    const a=Math.random()*Math.PI*2,v=.5+Math.random()*1.35
    g.dust.push({x:e.x,y:e.y,z:e.z,vx:Math.cos(a)*v,vy:(Math.random()-.5)*1.8,vz:Math.sin(a)*v,t:.45+Math.random()*.3})
  }
}
export function pulse(g){
  if(g.phase!=='battle'||g.burstClock>0)return false
  g.burstClock=8;g.bursts.push({t:0});g.soundEvent='burst'
  for(const e of g.enemies)if(e.hp>0&&e.r<=rangeOf(g)*1.3&&canReach(g,e))hit(g,e,damageOf(g)*2)
  return true
}
export function canReach(g,e){return e.band===0 || (e.band===1&&g.axis>=1) || (e.band===-1&&g.axis>=2)}
export function tick(g,dt){
  g.simTime+=dt
  if(g.phase!=='battle')return
  g.spawnClock-=dt;g.shotClock-=dt;g.burstClock=Math.max(0,g.burstClock-dt)
  if(g.left&&g.spawnClock<=0){spawn(g);g.spawnClock=1.17-.075*(g.sector-1)}
  for(const e of g.enemies){
    if(e.hp<=0)continue
    e.r-=e.speed*dt;e.hit=Math.max(0,e.hit-dt)
    const radial=e.r*Math.cos(e.elevation)
    e.x=Math.cos(e.angle)*radial;e.z=Math.sin(e.angle)*radial;e.y=Math.sin(e.elevation)*e.r
    if(e.r<1.18){e.hp=0;g.escaped++;g.hp=Math.max(0,g.hp-(e.kind==='heavy'?15:9));g.soundEvent='impact'}
  }
  const available=g.enemies.filter(e=>e.hp>0&&e.r<=rangeOf(g)&&canReach(g,e))
  const target=available.find(e=>e.id===g.target)||available.sort((a,b)=>a.r-b.r)[0]
  if(target&&g.shotClock<=0){
    g.shots.push({x:target.x,y:target.y,z:target.z,band:target.band,t:.2})
    g.lastShot=g.simTime;g.shotClock=.68;hit(g,target,damageOf(g));g.soundEvent='shot'
  }
  g.enemies=g.enemies.filter(e=>e.hp>0)
  g.shots=g.shots.filter(s=>(s.t-=dt)>0)
  g.bursts=g.bursts.filter(b=>(b.t+=dt)<.7)
  for(const p of g.dust){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.t-=dt}
  g.dust=g.dust.filter(p=>p.t>0)
  if(g.hp<=0){g.phase='lost';g.soundEvent='impact';return}
  if(!g.left&&!g.enemies.length){
    if(g.sector===3&&g.wave===3){g.phase='won';g.soundEvent='clear';return}
    const clearedSector=g.wave===3
    g.wave=clearedSector?1:g.wave+1
    if(clearedSector)g.sector++
    g.shards+=clearedSector?(g.sector===2?70:100):25
    g.hp=Math.min(100,g.hp+(clearedSector?25:8))
    Object.assign(g,{phase:'build',shots:[],dust:[],bursts:[],notice:clearedSector?'sector':'wave',soundEvent:'clear'})
  }
}
export function checkpoint(g){
  const keys=['version','sector','wave','hp','shards','damage','range','axis','totalKills']
  return Object.fromEntries(keys.map(k=>[k,g[k]]))
}
export function restore(raw){
  const g=newGame()
  if(!raw||raw.version!==1)return g
  const limits={sector:[1,3],wave:[1,3],hp:[1,100],shards:[0,100000],damage:[1,5],range:[1,5],axis:[0,2],totalKills:[0,100000]}
  for(const [k,[low,high]] of Object.entries(limits)){
    if(!Number.isInteger(raw[k])||raw[k]<low||raw[k]>high)return g
  }
  return Object.assign(g,checkpoint(raw))
}
