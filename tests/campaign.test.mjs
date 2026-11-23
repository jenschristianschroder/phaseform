import test from 'node:test'
import assert from 'node:assert/strict'
import {LEVELS,makeEnemy,positionAt,levelOf} from '../dist/campaign.js'
import {newGame,buyUpgrade,repair,prepareWave,pulse,tick,needsAxis,checkpoint,restore,refundChassis} from '../dist/engine.js'
import {research,fit,refitResearch,mountFactor,spentPoints} from '../dist/research.js'

test('campaign contains 100 encounters, ten Wardens and a gradual transition into 3D',()=>{
  assert.equal(LEVELS.length,100)
  assert.equal(new Set(LEVELS.map(l=>l.name)).size,100)
  const octants=new Set(),behaviors=new Set()
  let crosses=false,polar=false
  for(const level of LEVELS){
    let wardens=0
    for(let i=0;i<level.count;i++){
      const enemy=makeEnemy(level,i,i+1)
      if(enemy.kind==='warden'){wardens++;behaviors.add(enemy.warden)}
      let previous=0
      for(let step=0;step<12;step++){
        const r=enemy.start-step*.5,p=positionAt(enemy,r)
        assert(Math.abs(Math.hypot(p.x,p.y,p.z)-r)<1e-8)
        if(level.number<=3)assert.equal(p.y,0)
        if(level.number<7)assert(p.y>=0)
        if(level.axis===2&&p.x&&p.y&&p.z)octants.add([p.x,p.y,p.z].map(Math.sign).join('/'))
        if(previous*p.y<0)crosses=true
        if(Math.abs(p.y)/r>.95)polar=true
        previous=p.y
      }
    }
    assert.equal(wardens,level.number%10===0?1:0)
  }
  assert.deepEqual([...behaviors].sort(),['Aegis','Shepherd','Surge'])
  assert.equal(octants.size,8);assert(crosses);assert(polar)
})

test('research prerequisites, fitting limits, orientation and refunds use real resources',()=>{
  const g=newGame()
  assert.equal(research(g,'arc',1),false)
  assert.equal(research(g,'arc',0),true)
  assert.deepEqual(g.rigs,[{key:'arc',mount:'omni'}]);assert.equal(g.points,0)
  assert.equal(research(g,'arc',0),false)
  g.points=30
  assert(research(g,'gravity',0));assert.equal(g.rigs.length,1)
  assert.equal(fit(g,1,'gravity','north'),false)
  assert.equal(research(g,'arc',3),false)
  g.level=21;assert(fit(g,1,'gravity','north'))
  assert.equal(fit(g,0,'gravity','south'),false)
  assert(mountFactor('north',{r:4,y:3})>1);assert(mountFactor('north',{r:4,y:-3})<1)
  assert.equal(mountFactor('omni',{r:4,y:-3}),1)
  const points=g.points+spentPoints(g.research)
  const money=g.shards
  buyUpgrade(g,'damage');refundChassis(g);assert.equal(g.shards,money)
  refitResearch(g);assert.equal(g.points,points);assert.deepEqual(g.rigs,[])
})

test('all nine legacy checkpoints keep position, installed axes, upgrades and kill count',()=>{
  for(let sector=1;sector<=3;sector++)for(let wave=1;wave<=3;wave++){
    const g=restore({version:1,sector,wave,axis:sector-1,damage:3,range:2,shards:180,hp:87,totalKills:37})
    assert.equal(g.level,(sector-1)*3+wave);assert.equal(g.axis,sector-1)
    assert.deepEqual([g.hp,g.shards,g.damage,g.range,g.totalKills],[87,180,3,2,37])
    assert.deepEqual(checkpoint(restore(checkpoint(g))),checkpoint(g))
  }
})

test('research changes hits in three dimensions, including between vertical bands',()=>{
  function encounter(path){
    const g=newGame()
    Object.assign(g,{level:10,axis:2,points:30})
    for(const n of [0,1])assert(research(g,path,n))
    assert(prepareWave(g))
    g.left=0
    // Freeze motion in two neighboring northern bearings and one southern bearing.
    g.enemies=[0,1,2].map((i)=>{
      const e=makeEnemy(levelOf(g),i,i+1)
      return Object.assign(e,{pattern:'pincer',index:i===2?0:1,kind:'shard',seed:0,axis:2,speed:0,
        r:[2.7,3.3,3.4][i],hp:200,maxHp:200,shield:0})
    })
    g.target=1
    tick(g,.02)
    return g
  }
  for(const path of ['lance','arc','gravity']){
    const g=encounter(path)
    assert(g.enemies[0].hp<200)
    assert(g.enemies[1].hp<200,path+' hits its nearby or aligned neighbor')
    assert.equal(g.enemies[2].hp,200,path+' excludes the remote opposite bearing')
    if(path==='gravity')assert(g.enemies[1].slowTime>0)
  }
})

const priorities={
  lance:[0,0,2,1,2,1,3,0,2,1],
  arc:[0,1,2,0,2,1,3,0,2,1],
  gravity:[0,1,2,0,1,2,3,0,2,1]
}
function invest(g,key){
  const wanted=[0,0,0,0]
  for(const node of priorities[key]){
    wanted[node]++
    if(g.research[key][node]<wanted[node]&&!research(g,key,node))break
  }
}
function playCampaign(build){
  const g=newGame()
  while(g.phase==='build'){
    const level=g.level
    while(needsAxis(g))assert(buyUpgrade(g,'axis'),'mandatory expansion is funded')
    for(const [slot,key] of build.entries()){
      invest(g,key)
      if(g.research[key][0])fit(g,slot,key,'omni')
    }
    if(g.hp<=65)repair(g)
    if(g.range<Math.min(10,2+Math.floor(level/8)))buyUpgrade(g,'range')
    while(buyUpgrade(g,'damage')){}
    assert.deepEqual(checkpoint(restore(checkpoint(g))),checkpoint(g))
    assert(prepareWave(g))
    let elapsed=0
    while(g.phase==='battle'){
      tick(g,1/60);elapsed+=1/60
      if(g.burstClock===0&&g.enemies.some(e=>e.r<2.8))pulse(g)
      assert(elapsed<120,'encounter resolves within its time budget')
    }
    if(g.phase==='build')assert.equal(g.level,level+1)
  }
  return g
}
for(const build of [['lance'],['arc'],['gravity'],['lance','arc'],['arc','gravity'],['gravity','lance']]){
  test(build.join(' + ')+' can clear the campaign with only earned currency',()=>{
    const g=playCampaign(build)
    assert.equal(g.level,100);assert.equal(g.phase,'won')
    assert.deepEqual(g.rigs.map(r=>r.key),build)
    assert.equal(restore(checkpoint(g)).phase,'won')
  })
}
test('the reference chassis-only build reaches midgame and falls before the final clear',()=>{
  const g=playCampaign([])
  assert.equal(g.phase,'lost');assert(g.level>20&&g.level<=100)
})
