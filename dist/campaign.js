// Each row is one ten-level sector. The last encounter includes a Warden.
const sectorPlans = [
  ['Equatorial Orbit', ['First Contact','Twin Vectors','Slipstream','Northern Rise','High Passage','Orbital Pair','Southern Reach','Meridian Turn','Crossing Paths','Equinox Warden'], 'fan pincer shoal polar fan pincer polar helix weave shell'],
  ['Meridian Drift', ['Offset Entry','Golden Angle','Divergence','High Meridian','Split Current','Azimuth','Lantern Shoal','Retrograde','Outer Reach','Meridian Warden'], 'fan shell pincer polar weave helix shoal sling shell pincer'],
  ['Twin Helix', ['First Coil','Mirror Flight','Rising Thread','Perigee','Interlace','Descending Thread','Counterturn','Spindle','Double Bind','Helix Warden'], 'helix pincer polar sling weave helix shell shoal helix weave'],
  ['Polar Divide', ['Cap Inversion','Cold Passage','Antipodes','Long Meridian','Falling Crown','Needlepoint','Oblique Arc','Counterweight','White Divide','Polar Warden'], 'polar fan pincer weave shell shoal sling polar helix pincer'],
  ['Prism Belt', ['Shard Rain','Diffraction','Narrow Band','Scattered Light','Prism Wake','Sundog','Fracture Line','Folded Light','Dispersal','Prism Warden'], 'shoal shell fan pincer sling helix weave polar shoal shell'],
  ['Lagrange Reach', ['Drift Window','Trojan Pair','Saddle Point','Halo Crossing','Leading Edge','Far Flank','Balance Point','Falling Loop','Backscatter','Lagrange Warden'], 'sling pincer polar helix shoal fan shell weave sling helix'],
  ['Apsis Current', ['Apsidal Shift','Outbound','Return Burn','Far Current','Midnight Arc','Close Passage','Inside Track','Coreward','Oblique Return','Apsis Warden'], 'weave sling pincer shell helix polar shoal fan sling weave'],
  ['Penumbra', ['First Shadow','Limb Crossing','Umbra Pair','Eclipse Train','Dark Meridian','Corona','Braid Break','Totality','Last Light','Eclipse Warden'], 'fan weave pincer shoal polar shell helix sling shoal polar'],
  ['Eventide', ['Westward','Night Spiral','Opposition','Tidal Lock','Crescent','Shattered Ring','Falling Star','Deep Transit','Black Current','Eventide Warden'], 'polar helix pincer sling fan shoal shell weave polar helix'],
  ['Aphelion', ['Final Approach','Distant Twins','Terminal Arc','Roche Limit','Redshift','Last Meridian','Point of Return','Singularity','Convergence','Aphelion Prime'], 'shell pincer sling weave shoal polar fan helix shell sling']
]
export const formations={
  fan:['Radial fan','Vectors spread around the equator and across tilted latitudes.'],
  pincer:['Opposed lanes','Paired columns close from opposite directions. Piercing hits can travel down a column.'],
  polar:['Polar dive','Contacts dive from high latitudes. A polar mount can concentrate fire on one hemisphere.'],
  helix:['Twin helix','Two curling streams wrap around the sphere and exchange altitude.'],
  weave:['Meridian crossing','Attackers weave through the equator on their way to the core.'],
  shell:['Spherical shell','Contacts surround the sphere from widely separated bearings.'],
  shoal:['Cluster flight','Small groups converge along neighboring tracks. Chain fire and gravity wells can catch the whole group.'],
  sling:['Slingshot','Attackers sweep sideways, change latitude and turn inward near the core.']
}
const fleets={
  patrol:{name:'Patrol',units:['shard','shard','dart','shard','heavy']},
  rush:{name:'Fast wing',units:['dart','shard','dart','dart','heavy','shard']},
  armor:{name:'Armored column',units:['shard','heavy','dart','shard','heavy']},
  drift:{name:'Weavers',units:['wisp','dart','shard','wisp','heavy','shard']},
  prism:{name:'Shield wing',units:['prism','dart','shard','heavy','prism','wisp']}
}
export const units={
  shard:{name:'Shard',hp:1,speed:1,impact:8},
  dart:{name:'Dart',hp:.73,speed:1.27,impact:6},
  heavy:{name:'Bulwark',hp:1.74,speed:.76,impact:13},
  wisp:{name:'Weaver',hp:.94,speed:1.13,impact:8},
  prism:{name:'Shield prism',hp:1.12,speed:.92,impact:10},
  warden:{name:'Warden',hp:6.35,speed:.65,impact:32}
}
export const LEVELS=sectorPlans.flatMap(([sector,names,plan],chapter)=>{
  const patterns=plan.split(' ')
  return names.map((name,index)=>{
    const number=chapter*10+index+1, boss=index===9
    const roster=['patrol','rush','armor','drift','prism']
    const fleet=fleets[roster[(index+chapter*2)%Math.min(5,2+Math.floor(number/5))]]
    // Sector openers give a short recovery after each Warden. Pressure then ramps again.
    const pressure=number+(boss?1.8:0)-(index===0&&chapter>0?1.8:0)
    const count=7+Math.floor(pressure*.19)+(boss?2:0)
    return {number,name,sector,chapter:chapter+1,pattern:patterns[index],fleet,boss,count,
      axis:number<4?0:number<7?1:2,
      warden:['Surge','Aegis','Shepherd'][chapter%3],
      hp:17+2.28*pressure+.019*pressure*pressure+45*Math.sin(Math.PI*(number-1)/99),
      interval:1.25-.0057*pressure,speed:.49+.0039*pressure,
      reward:24+Math.floor(number*.21)+(boss?32:0),
      points:(number%2===0?1:0)+(boss?1:0)}
  })
})
export const TOTAL_LEVELS=LEVELS.length
export const levelOf=g=>LEVELS[g.level-1]
export const axisCost=rank=>rank===0?70:100
export const axisGrant=level=>level===4?70:level===7?100:0
const TAU=Math.PI*2
const goldenAngle=2.39996323
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))
export function makeEnemy(level,index,id){
  const kind=level.boss&&index===Math.floor(level.count*.46)?'warden':level.fleet.units[index%level.fleet.units.length]
  const type=units[kind],radius=7.5+.29*(index%4)
  const elite=kind!=='warden'&&level.number>=15&&(index+level.chapter)%Math.max(5,11-Math.floor(level.number/15))===0
  const hp=Math.round(type.hp*level.hp*(elite?1.55:1))
  const e={id,index,level:level.number,pattern:level.pattern,axis:level.axis,seed:level.number*.63,
    kind,elite,hp,maxHp:hp,shield:kind==='prism'?hp*.29:0,warden:kind==='warden'?level.warden:'',shieldTriggered:false,r:radius,start:radius,
    speed:level.speed*type.speed,spin:index*goldenAngle,hit:0,slow:0,slowTime:0}
  Object.assign(e,positionAt(e,radius))
  return e
}
export function positionAt(e,r){
  const progress=1-r/e.start,i=e.index,side=i%2?1:-1
  let angle=e.seed+i*goldenAngle,tilt=side*(.22+.17*(i%5))
  switch(e.pattern){
    case 'fan': angle+=progress*.3*side;break
    case 'pincer': angle=e.seed+(i%2)*Math.PI+.05*(Math.floor(i/2)%3);tilt=side*.48;break
    case 'polar': angle+=progress*.9*side;tilt=side*(1.09+.26*Math.cos(progress*3+i));break
    case 'helix': angle=e.seed+i*Math.PI+.17*Math.floor(i/2)+progress*(3.2+e.level*.008)*side;tilt=.98*Math.sin(i*.83+progress*4.8);break
    case 'weave': angle+=side*progress*1.3;tilt=1.19*Math.sin(i*.62+progress*5.6);break
    case 'shell': tilt=Math.asin(2*((i*.61803399+.13)%1)-1);angle+=side*progress*.38;break
    case 'shoal': angle=e.seed+Math.floor(i/4)*goldenAngle+(i%4)*.092+progress*.35;tilt=Math.sin(Math.floor(i/4)*2.1+.6)*.91+(i%4)*.07;break
    case 'sling': angle+=side*(.3*progress+3.5*progress*progress);tilt=1.12*Math.cos(progress*3.8+side*1.1+i*.35);break
  }
  if(e.kind==='wisp'){angle+=.24*Math.sin(progress*10+i);tilt+=.29*Math.sin(progress*8+i)}
  if(e.kind==='warden'){angle+=progress*.58;tilt+=.21*Math.sin(progress*5)}
  tilt=e.axis===0?0:e.axis===1?Math.abs(tilt):tilt
  tilt=clamp(tilt,-1.49,1.49)
  const horizontal=r*Math.cos(tilt)
  return {x:horizontal*Math.cos(angle),y:r*Math.sin(tilt),z:horizontal*Math.sin(angle),band:Math.abs(tilt)<.13?0:Math.sign(tilt)}
}
export function spawnInterval(level,index){
  if(level.pattern==='shoal')return level.interval*(index%4===3?2.8:.4)
  if(level.pattern==='pincer')return level.interval*(index%2===0?.46:1.54)
  return level.interval
}
