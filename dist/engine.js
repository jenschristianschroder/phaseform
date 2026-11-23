import {LEVELS,TOTAL_LEVELS,levelOf,axisCost,axisGrant,makeEnemy,positionAt,spawnInterval,units} from './campaign.js'
import {paths,mounts,blankResearch,slotsAt,maxRank,mountFactor,rigPosition,requirement} from './research.js'

export const waveCount=g=>levelOf(g).count
export const rangeOf=g=>4.15+(g.range-1)*.32
export const damageOf=g=>11+(g.damage-1)*4.7
export const limitOf=(g,part)=>part==='axis'?levelOf(g).axis:part==='range'?10:40
export const needsAxis=g=>g.axis<levelOf(g).axis
export const costOf=(g,part)=>part==='axis'?axisCost(g.axis):part==='range'?45+36*(g.range-1):40+12*(g.damage-1)
export function availableShards(g,part){
  let reserve=0
  if(part!=='axis')for(let rank=g.axis;rank<levelOf(g).axis;rank++)reserve+=axisCost(rank)
  return g.shards-reserve
}
export function newGame(){
  return {version:2,level:1,hp:100,shards:120,damage:1,range:1,axis:0,totalKills:0,
    points:1,research:blankResearch(),rigs:[],phase:'build',enemies:[],shots:[],bursts:[],dust:[],
    left:0,spawnClock:0,shotClock:0,burstClock:0,shotNumber:0,simTime:0,killed:0,escaped:0,target:0,
    nextId:1,soundEvent:'',lastReward:null}
}
export function prepareWave(g){
  if(g.phase!=='build'||needsAxis(g))return false
  Object.assign(g,{phase:'battle',left:waveCount(g),spawnClock:0,shotClock:0,burstClock:0,shotNumber:0,killed:0,escaped:0,target:0,soundEvent:'start'})
  return true
}
export function buyUpgrade(g,part){
  if(!['build','battle'].includes(g.phase)||!['damage','range','axis'].includes(part))return false
  if(g[part]>=limitOf(g,part)||availableShards(g,part)<costOf(g,part))return false
  g.shards-=costOf(g,part);g[part]++;g.soundEvent='upgrade';return true
}
export const repairCost=g=>20+Math.floor(g.level*.35)
export function repair(g){
  const cost=repairCost(g)
  if(g.phase!=='build'||g.hp>=100||availableShards(g,'repair')<cost)return false
  g.shards-=cost;g.hp=Math.min(100,g.hp+28);return true
}
export function refundChassis(g){
  if(g.phase!=='build')return false
  for(const part of ['damage','range'])while(g[part]>1){g[part]--;g.shards+=costOf(g,part)}
  return true
}
const position=e=>[e.x,e.y,e.z]
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)
const armored=e=>['heavy','prism','warden'].includes(e.kind)
export function canReach(g,e){return e.band===0||(e.band===1&&g.axis>=1)||(e.band===-1&&g.axis>=2)}
function hit(g,e,amount,secondary=false){
  if(e.hp<=0||amount<=0)return
  if(secondary&&e.kind==='warden')amount*=.55
  if(secondary&&e.kind==='prism'&&e.shield>0)amount*=.65
  const shield=Math.min(amount,e.shield)
  e.shield-=shield;e.hp-=amount-shield;e.hit=.14
  if(e.hp>0){
    if(e.warden==='Aegis'&&!e.shieldTriggered&&e.hp<e.maxHp*.55){e.shield=e.maxHp*.35;e.shieldTriggered=true}
    return
  }
  g.shards+=e.kind==='warden'?20:e.kind==='heavy'?6:4;g.killed++;g.totalKills++
  for(let i=0;i<6;i++){
    const a=Math.random()*Math.PI*2,v=.5+Math.random()*1.35
    g.dust.push({x:e.x,y:e.y,z:e.z,vx:Math.cos(a)*v,vy:(Math.random()-.5)*1.8,vz:Math.sin(a)*v,t:.5})
  }
}
function slow(e,rank,power){
  const resistance=e.kind==='warden'?.48:e.kind==='heavy'?.76:1
  e.slow=Math.max(e.slow,Math.min(.64,(.09+rank*.09)*power*resistance));e.slowTime=2.8
}
function beam(g,from,to,color){g.shots.push({from,x:to.x,y:to.y,z:to.z,color,t:.2})}
function pierce(g,target,candidates,rank,damage,power){
  const ray=position(target).map(value=>value/target.r)
  const piercable=candidates.filter(e=>{
    if(e===target||e.hp<=0)return false
    const along=e.x*ray[0]+e.y*ray[1]+e.z*ray[2]
    return along>target.r&&Math.pow(e.r,2)-along*along<(.7+.24*rank)**2
  }).sort((a,b)=>a.r-b.r).slice(0,rank)
  for(const other of piercable){
    beam(g,position(target),other,'lance');hit(g,other,damage*.78*power)
  }
}
function chain(g,target,candidates,ranks,damage,power){
  const visited=new Set([target]);let last=target,charge=damage
  for(let hop=0;hop<ranks[0];hop++){
    let next=null,best=(2.5+.9*ranks[1])*power
    for(const e of candidates){
      if(e.hp<=0||visited.has(e))continue
      const d=distance(last,e)
      if(d<best){best=d;next=e}
    }
    if(!next)break
    charge*=.56+.08*ranks[2];beam(g,position(last),next,'arc');hit(g,next,charge*power,true)
    visited.add(next);last=next
  }
  if(ranks[3]&&last!==target&&target.hp>0){
    beam(g,position(last),target,'arc');hit(g,target,damage*.65*power,true)
  }
}
function fire(g,target,available){
  const base=damageOf(g);let damage=base
  g.shotNumber++
  for(const rig of g.rigs){
    const ranks=g.research[rig.key],power=mountFactor(rig.mount,target)
    if(rig.key==='lance')damage+=base*(ranks[0]*.16+(armored(target)?ranks[2]*.30:0))*power
    if(rig.key==='arc')damage+=base*ranks[2]*.07*power
    if(rig.key==='gravity'&&target.slowTime>0)damage+=base*ranks[2]*.16*power
  }
  const from=target.band===0?position(target).map(v=>v/target.r*1.18):[0,target.band*1.53,0]
  beam(g,from,target,'core');hit(g,target,damage)
  g.rigs.forEach((rig,slot)=>{
    const ranks=g.research[rig.key],power=mountFactor(rig.mount,target)
    beam(g,rigPosition(rig.key,rig.mount,slot),target,rig.key)
    if(rig.key==='lance'){
      if(ranks[1])pierce(g,target,available,ranks[1],damage,power)
      if(ranks[3]&&g.shotNumber%4===0)hit(g,target,damage*.85*power)
    }else if(rig.key==='arc')chain(g,target,available,ranks,damage,power)
    else{
      slow(target,ranks[0],power)
      if(ranks[1])for(const e of available){
        if(e===target||e.hp<=0||distance(target,e)>(1.6+ranks[1]*.67)*power)continue
        slow(e,ranks[0],power);beam(g,position(target),e,'gravity');hit(g,e,damage*.26*power,true)
      }
    }
  })
  g.shotClock=.64;g.soundEvent='shot'
}
export function pulse(g){
  if(g.phase!=='battle'||g.burstClock>0)return false
  const rig=g.rigs.find(r=>r.key==='gravity'),ranks=rig?g.research.gravity:[0,0,0,0]
  g.burstClock=8-ranks[2]*.65;g.bursts.push({t:0});g.soundEvent='burst'
  for(const e of g.enemies){
    if(e.hp<=0||e.r>rangeOf(g)*1.3||!canReach(g,e))continue
    hit(g,e,damageOf(g)*1.72)
    if(ranks[3]&&e.hp>0){
      e.r=Math.min(e.start,e.r+(e.kind==='warden'?.35:e.kind==='heavy'?.72:1.1));Object.assign(e,positionAt(e,e.r));slow(e,ranks[0],mountFactor(rig.mount,e))
    }
  }
  return true
}
function finish(g,level){
  const next=Math.min(TOTAL_LEVELS,g.level+1),grant=axisGrant(next)
  g.lastReward={level:g.level,shards:level.reward,points:level.points,grant}
  g.shards+=level.reward+grant;g.points+=level.points
  g.soundEvent='clear';g.shots=[];g.dust=[];g.bursts=[]
  if(g.level===TOTAL_LEVELS){g.phase='won';return}
  g.hp=Math.min(100,g.hp+(level.boss?16:4));g.level=next;g.phase='build'
}
export function tick(g,dt){
  if(g.phase!=='battle')return
  g.simTime+=dt;g.spawnClock-=dt;g.shotClock-=dt;g.burstClock=Math.max(0,g.burstClock-dt)
  const level=levelOf(g)
  if(g.left&&g.spawnClock<=0){
    const index=level.count-g.left
    g.enemies.push(makeEnemy(level,index,g.nextId++));g.left--;g.spawnClock+=spawnInterval(level,index)
  }
  const shepherd=g.enemies.find(e=>e.warden==='Shepherd'&&e.hp>0)
  for(const e of g.enemies){
    if(e.hp<=0)continue
    e.slowTime=Math.max(0,e.slowTime-dt);if(!e.slowTime)e.slow=0
    const surge=e.warden==='Surge'&&e.hp<e.maxHp*.45?1.52:shepherd&&e!==shepherd&&distance(e,shepherd)<3.2?1.26:1
    e.r-=e.speed*surge*(1-e.slow)*dt;e.hit=Math.max(0,e.hit-dt)
    Object.assign(e,positionAt(e,e.r))
    if(e.r<=1.18){e.hp=0;g.escaped++;g.hp=Math.max(0,g.hp-units[e.kind].impact);g.soundEvent='impact'}
  }
  if(g.shotClock<=0){
    const available=g.enemies.filter(e=>e.hp>0&&e.r<=rangeOf(g)&&canReach(g,e))
    const target=available.find(e=>e.id===g.target)||available.reduce((best,e)=>!best||e.r<best.r?e:best,null)
    if(target)fire(g,target,available)
  }
  g.enemies=g.enemies.filter(e=>e.hp>0);g.shots=g.shots.filter(s=>(s.t-=dt)>0)
  g.bursts=g.bursts.filter(b=>(b.t+=dt)<.7)
  for(const p of g.dust){p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.t-=dt}
  g.dust=g.dust.filter(p=>p.t>0)
  if(!g.hp){g.phase='lost';g.soundEvent='impact';return}
  if(!g.left&&!g.enemies.length)finish(g,level)
}
export function checkpoint(g){
  return {version:2,level:g.level,hp:g.hp,shards:g.shards,damage:g.damage,range:g.range,axis:g.axis,totalKills:g.totalKills,
    points:g.points,research:Object.fromEntries(Object.entries(g.research).map(([k,r])=>[k,[...r]])),
    rigs:g.rigs.map(r=>({...r})),completed:g.phase==='won'}
}
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max
export function restore(raw){
  const g=newGame()
  if(!raw||![1,2].includes(raw.version))return g
  const old=raw.version===1
  const limits={hp:[1,100],shards:[0,1000000],damage:[1,old?5:40],range:[1,old?5:10],axis:[0,2],totalKills:[0,1000000]}
  for(const [key,[lo,hi]] of Object.entries(limits))if(!integer(raw[key],lo,hi))return g
  if(old){
    if(!integer(raw.sector,1,3)||!integer(raw.wave,1,3))return g
    g.level=(raw.sector-1)*3+raw.wave
    g.points+=LEVELS.slice(0,g.level-1).reduce((sum,l)=>sum+l.points,0)
  }else{
    if(!integer(raw.level,1,TOTAL_LEVELS)||!integer(raw.points,0,1000))return newGame()
    g.level=raw.level;g.points=raw.points
    for(const key of Object.keys(paths)){
      const ranks=raw.research?.[key]
      if(!Array.isArray(ranks)||ranks.length!==4||ranks.some((r,n)=>!integer(r,0,maxRank(n))||(r>0&&requirement(ranks,n))))return newGame()
      g.research[key]=[...ranks]
    }
    if(!Array.isArray(raw.rigs)||raw.rigs.length>slotsAt(g.level))return newGame()
    for(const rig of raw.rigs){
      if(!rig||!fitRestored(g,rig))return newGame()
      g.rigs.push({key:rig.key,mount:rig.mount})
    }
    if(raw.completed&&raw.level===TOTAL_LEVELS)g.phase='won'
  }
  for(const key of Object.keys(limits))g[key]=raw[key]
  return g
}
function fitRestored(g,rig){
  return Object.hasOwn(paths,rig.key)&&g.research[rig.key][0]>0&&Object.hasOwn(mounts,rig.mount)&&!g.rigs.some(r=>r.key===rig.key)
}
