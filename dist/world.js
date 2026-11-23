import {rangeOf} from './engine.js'
import {levelOf,makeEnemy,positionAt} from './campaign.js'
import {paths,rigPosition} from './research.js'

const TAU=Math.PI*2
const turn=(x,z,a)=>[x*Math.cos(a)-z*Math.sin(a),x*Math.sin(a)+z*Math.cos(a)]
const blend=(c,f)=>'rgb('+[1,3,5].map(i=>Math.min(255,Math.round(parseInt(c.slice(i,i+2),16)*f))).join(',')+')'
function polygon(ctx,pts,fill,stroke,width=1){
  if(!pts.length)return
  ctx.beginPath();ctx.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)ctx.lineTo(...pts[i]);ctx.closePath()
  if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
}
const DEFAULT_PITCH = .46
const cameraLimit = Math.PI / 2 - .014
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const unit = v => { const l=Math.hypot(...v); return v.map(x=>x/l) }
const average = vertices => vertices.reduce((sum,v)=>sum.map((n,i)=>n+v[i]/vertices.length),[0,0,0])
const mix = (a,b,f) => a.map((n,i)=>n+(b[i]-n)*f)

export class OrbitCamera {
  constructor(){ this.reset() }
  reset(){ this.yaw=0; this.pitch=DEFAULT_PITCH; this.zoom=1 }
  orbit(horizontal,vertical){
    this.yaw=(this.yaw+horizontal)%TAU
    this.pitch=clamp(this.pitch+vertical,-cameraLimit,cameraLimit)
  }
  magnify(factor){ this.zoom=clamp(this.zoom*factor,.62,1.65) }
  view(width,height){
    const sy=Math.sin(this.yaw),cy=Math.cos(this.yaw),sp=Math.sin(this.pitch),cp=Math.cos(this.pitch)
    const forward=[sy*cp,sp,cy*cp]
    const scale=Math.min(width/(width<720?15.1:17.8),height/Math.max(6.7,3.3+11.2*Math.abs(sp)))*this.zoom
    const center=[width*.5,height*(width<720?.55:.53)]
    const depth=(x,y,z)=>x*forward[0]+y*forward[1]+z*forward[2]
    const project=(x,y,z)=>{
      const horizontal=cy*x-sy*z,front=sy*x+cy*z
      const size=scale/(1-depth(x,y,z)/30)
      return [center[0]+horizontal*size,center[1]+(front*sp-y*cp)*size]
    }
    return {project,depth,forward,scale,center}
  }
}
class Mesh {
  constructor(project,depth=(x,y,z)=>z*.89+y*.46){
    this.project=project;this.depth=depth;this.faces=[]
  }
  add(verts,c,edge=c,width=.46){
    this.faces.push({verts,c,edge,width,dep:this.depth(...average(verts))})
  }
  line(a,b,color,width=1){
    this.faces.push({a,b,color,width,dep:(this.depth(...a)+this.depth(...b))*.5})
  }
  draw(ctx){
    this.faces.sort((a,b)=>a.dep-b.dep)
    for(const face of this.faces){
      if(face.verts)polygon(ctx,face.verts.map(v=>this.project(...v)),face.c,face.edge,face.width)
      else{
        ctx.beginPath();ctx.moveTo(...this.project(...face.a));ctx.lineTo(...this.project(...face.b))
        ctx.strokeStyle=face.color;ctx.lineWidth=face.width;ctx.stroke()
      }
    }
  }
}
function ringVerts(x,y,z,r,n,a=0){return Array.from({length:n},(_,i)=>[x+Math.cos(a+i*TAU/n)*r,y,z+Math.sin(a+i*TAU/n)*r])}
function wedgeRing(m,x,y,z,inner,outer,height,n,rot,topCol,sideCol,gap=.02){
  for(let i=0;i<n;i++){
    const a=rot+i*TAU/n+gap,b=rot+(i+1)*TAU/n-gap,at=(r,ang,h)=>[x+Math.cos(ang)*r,y+h,z+Math.sin(ang)*r]
    const top=[at(inner,a,height),at(outer,a,height),at(outer,b,height),at(inner,b,height)]
    const low=[at(inner,a,0),at(outer,a,0),at(outer,b,0),at(inner,b,0)]
    m.add(low,blend(sideCol,.69))
    for(let j=0;j<4;j++){const k=(j+1)%4;m.add([low[j],low[k],top[k],top[j]],blend(sideCol,.85+.17*Math.cos((a+b)/2+.6)))}
    m.add(top,blend(topCol,.94+.06*Math.cos(a)))
  }
}
const cyan=['#83f1dc','#50d0bb','#27af9e','#268f86','#2c7770','#42aa96']
function crystal(m,x,y,z,r,h,n,rot,colors=cyan,lean=0){
  const top=[x+lean,y+h*.57,z-h*.055],bottom=[x-h*.055,y-h*.43,z+.018]
  const mid=ringVerts(x,y,z,r,n,rot)
  for(let i=0;i<n;i++){
    const j=(i+1)%n,angle=rot+(i+.5)*TAU/n
    const idx=Math.floor((((angle+.65)%TAU+TAU)%TAU)/TAU*colors.length)
    m.add([top,mid[i],mid[j]],colors[idx])
    m.add([bottom,mid[j],mid[i]],blend(colors[idx],.67))
  }
}
function beamPrism(m,a,b,r,c){
  const vx=b[0]-a[0],vy=b[1]-a[1],vz=b[2]-a[2]
  const h=Math.hypot(vx,vz)||1, l=Math.hypot(vx,vy,vz)||1
  const u=[-vz/h,0,vx/h],v=[vy*vx/(h*l),-h/l,vy*vz/(h*l)]
  const ring=p=>Array.from({length:4},(_,i)=>p.map((val,j)=>val+r*(u[j]*Math.cos(i*TAU/4)+v[j]*Math.sin(i*TAU/4))))
  const lo=ring(a),hi=ring(b)
  for(let i=0;i<4;i++){const j=(i+1)%4;m.add([lo[i],lo[j],hi[j],hi[i]],blend(c,.75+i*.1))}
  m.add(hi,c)
}
// Subdivide an icosahedron on the unit sphere. The same panels turn with the core.
function spherePanels(){
  const phi=(1+Math.sqrt(5))/2
  const vertices=[[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],
    [0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]].map(unit)
  const patches=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],
    [10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]]
  const panels=[]
  function subdivide(a,b,c,level,group){
    if(level===0){panels.push({vertices:[a,b,c],normal:unit(average([a,b,c])),group});return}
    const ab=unit(mix(a,b,.5)),bc=unit(mix(b,c,.5)),ca=unit(mix(c,a,.5))
    for(const tri of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])subdivide(...tri,level-1,group)
  }
  patches.forEach(([a,b,c],i)=>subdivide(vertices[a],vertices[b],vertices[c],2,i))
  return panels
}
const panels=spherePanels()
const keyLight=unit([-.57,.80,.67])
const CORE_RADIUS=1.18
function core(m,t,g,view){
  const rot=.37+t*.055,cos=Math.cos(rot),sin=Math.sin(rot)
  const rotate=([x,y,z])=>[x*cos-z*sin,y,x*sin+z*cos]
  const halfLight=unit(keyLight.map((v,i)=>v+view.forward[i]+.00001))
  for(let i=0;i<panels.length;i++){
    const panel=panels[i],n=rotate(panel.normal),face=dot(n,view.forward)
    if(face<-.12)continue
    const lit=Math.max(0,dot(n,keyLight)),spec=Math.pow(Math.max(0,dot(n,halfLight)),15)
    const rim=Math.pow(1-Math.max(0,face),3)*.65
    const tone=.85+((panel.group*7+2)%9)*.026+(i%4)*.012
    const material=[12+83*lit+130*spec+29*rim,50+135*lit+67*spec+64*rim,56+114*lit+62*spec+60*rim]
    const color='rgb('+material.map(channel=>Math.min(255,Math.round(channel*tone))).join(',')+')'
    const verts=panel.vertices.map(v=>rotate(v).map(c=>c*CORE_RADIUS))
    m.add(verts,color,color,.65)
    // Inset seams and occasional instrument panels make rotation visible from any side.
    const center=average(verts)
    const inset=verts.map(v=>mix(v,center,.072).map(n=>n*1.004))
    if(i%4===3){
      m.add(inset,color,'rgba(4,40,43,.27)',.65)
      if((panel.group+i)%13===0){
        m.add(verts.map(v=>mix(v,center,.57).map(n=>n*1.013)),'#a2e4cc')
      }
    }
  }
  // The equatorial emitter is attached to the sphere. Its front and rear arcs
  // participate in the same depth sort as the shell and incoming hostiles.
  wedgeRing(m,0,-.044,0,1.18,1.255,.083,42,rot,'#9de4c8','#387d75',.006)
  const emitterCount=3+Math.min(9,g.damage)
  for(let i=0;i<emitterCount;i++){
    const a=rot+i*TAU/emitterCount
    const r=1.248
    crystal(m,Math.cos(a)*r,0,Math.sin(a)*r,.10,.19,4,a,['#fff0b2','#e3bc70','#907b56','#d1ac6c'])
  }
  for(let i=0;i<g.axis;i++){
    const side=i===0?1:-1
    beamPrism(m,[0,side*1.11,0],[.001,side*1.47,0],.082,'#5fa79b')
    crystal(m,0,side*1.51,0,.22,.46,6,rot,cyan)
    wedgeRing(m,0,side*1.38-.025,0,.21,.34,.05,12,rot,'#bce5ca','#4b9084',.012)
  }
  g.rigs.forEach((rig,slot)=>{
    const [x,y,z]=rigPosition(rig.key,rig.mount,slot)
    const color=paths[rig.key].color
    beamPrism(m,[x*.76,y*.76,z*.76],[x,y,z],.075,'#647f7c')
    if(rig.key==='lance'){
      beamPrism(m,[x*.94,y*.94,z*.94],[x*1.2,y*1.2,z*1.2],.135,'#c9ab74')
      crystal(m,x*1.2,y*1.2,z*1.2,.1,.22,4,rot,[color,'#ecd48a','#a98249','#c6a35f'])
    }else if(rig.key==='arc'){
      for(const offset of [-.12,.12])crystal(m,x+offset,y+.055,z-offset,.136,.48,5,rot,cyan)
    }else{
      wedgeRing(m,x,y-.09,z,.12,.27,.085,8,rot,'#c5b4e8','#8f79bb',.035)
      crystal(m,x,y+.085,z,.14,.31,5,rot,[color,'#c8b3ed','#9b8ac9','#7661a3'])
    }
  })
}
function hostile(m,e,t){
  const baseY=e.y,size=(e.kind==='warden'?.91:e.kind==='heavy'?.62:e.kind==='dart'?.43:.51)*(e.elite?1.18:1)
  const ahead=positionAt(e,e.r-.06)
  const dx=ahead.x-e.x,dy=ahead.y-e.y,dz=ahead.z-e.z
  const ang=Math.atan2(dz,dx),elev=Math.atan2(dy,Math.hypot(dx,dz))
  const bank=.17*Math.sin(t*.67+e.spin)
  const at=(u,y,v)=>{
    const up=y*Math.cos(bank)-v*Math.sin(bank),wing=y*Math.sin(bank)+v*Math.cos(bank)
    const [x,z]=turn((u*Math.cos(elev)-up*Math.sin(elev))*size,wing*size,ang)
    return [x+e.x,(u*Math.sin(elev)+up*Math.cos(elev))*size+baseY,z+e.z]
  }
  const shades=e.hit>0?['#ffe7bd','#ffe1ae','#fff4db','#f2c590','#ffcf85','#fff0bb']:
    e.kind==='warden'?['#ffe1a1','#f1af6c','#bb7955','#85594f','#926144','#ffd389']:
    e.kind==='wisp'?['#d1c2fb','#ad91d7','#866ba8','#6e538d','#986da6','#cfb7e6']:
    e.kind==='prism'?['#a8e4f7','#80aecf','#627caa','#565e90','#6674a6','#a6c0de']:
    e.kind==='heavy'?['#ff9869','#d35c41','#9e4637','#8c372f','#bd4837','#ec7655']:['#ff9768','#eb6a49','#c84834','#98382e','#b84432','#fe9568']
  const tip=at(1.30,-.03,0),ridge=at(-.22,.75,-.07),base=at(-.34,-.48,0),L=at(-.88,.08,.74),R=at(-.88,.08,-.74),tail=at(-1,.02,0)
  m.add([tip,ridge,L],shades[1]);m.add([tip,R,ridge],shades[0]);m.add([L,ridge,tail],shades[4]);m.add([tail,ridge,R],shades[5]);m.add([tip,L,base],shades[2]);m.add([tip,base,R],shades[3]);m.add([tail,base,L],shades[4]);m.add([tail,R,base],shades[3])
  if(e.kind==='warden'){
    const a=t*.75+e.spin
    wedgeRing(m,e.x,e.y-.09,e.z,.50,.72,.12,6,a,'#f2be7a','#986645',.07)
    crystal(m,e.x,e.y+.29,e.z,.31,.73,5,a,['#fff0c2','#edc27a','#cf8d56','#dca366'])
  }
  if(e.shield>0||e.slowTime>0||e.elite){
    const shade=e.slowTime>0?'#baa5edb8':e.shield>0?'#a0d9ffaf':'#deb28ca8'
    const radius=size*1.08
    for(let i=0;i<12;i++){
      const a=t*.4+i*TAU/12,b=a+.27
      m.line([e.x+Math.cos(a)*radius,e.y+Math.sin(a)*radius*.53,e.z+Math.sin(a)*radius*.85],
        [e.x+Math.cos(b)*radius,e.y+Math.sin(b)*radius*.53,e.z+Math.sin(b)*radius*.85],shade,1.15)
    }
  }
  if(e.kind==='heavy'||e.kind==='warden')for(const s of [-1,1]){const wing=at(-.52,-.03,s*.88),end=at(.49,-.14,s*.65),high=at(-.36,.24,s*.58);m.add([wing,end,high],shades[0]);m.add([wing,high,s>0?L:R],shades[2])}
}
function makePreview(level){
  const indices=[0,1,2,Math.floor(level.count*.46),level.count-1]
  return [...new Set(indices)].map((index,i)=>{
    const enemy=makeEnemy(level,index,-index-1)
    enemy.r=5.2+(i%3)*.53
    return Object.assign(enemy,positionAt(enemy,enemy.r))
  })
}
export class World{
  constructor(canvas){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.hitPoints=[];this.hover=0;this.camera=new OrbitCamera()
    this.resize=()=>{const b=canvas.getBoundingClientRect();this.w=b.width;this.h=b.height
      const d=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(b.width*d);canvas.height=Math.round(b.height*d);this.ctx.setTransform(d,0,0,d,0,0)}
    this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);this.resize()
  }
  pick(x,y){
    let best=null
    for(const p of this.hitPoints){
      if(Math.hypot(x-p.x,y-p.y)>p.r)continue
      if(!best||p.depth>best.depth)best=p
    }
    return best?.id??0
  }
  draw(g,t){
    const {ctx:c,w,h}=this
    if(!w||!h)return
    c.clearRect(0,0,w,h)
    const view=this.camera.view(w,h),{project,depth,scale,center}=view
    const m=new Mesh(project,depth),range=rangeOf(g)
    const pointOn=(r,a,elev=0)=>[Math.cos(a)*r*Math.cos(elev),Math.sin(elev)*r,Math.sin(a)*r*Math.cos(elev)]
    const ring=(r,elevation,color,segments,dash,width)=>{
      for(let i=0;i<segments;i++){
        const a=i*TAU/segments,b=(i+dash)*TAU/segments
        m.line(pointOn(r,a,elevation),pointOn(r,b,elevation),color,width)
      }
    }
    // These rings describe firing reach. Everything outside the game objects
    // and their targeting indicators is the solid, empty canvas.
    ring(range,0,'#72b2a18c',128,.59,1.15)
    for(let i=0;i<48;i++){
      const a=i*TAU/48,major=i%6===0
      m.line(pointOn(range+.035,a),pointOn(range+(major?.15:.085),a),major?'#a4ccbcab':'#628a8059',major?1.4:1)
    }
    for(let i=0;i<g.axis;i++)ring(range,(i===0?1:-1)*.58,'#7aa8b458',96,.42,1)
    if(g.phase==='build'&&this.previewLevel!==g.level){this.previewLevel=g.level;this.preview=makePreview(levelOf(g))}
    const list=g.phase==='build'?this.preview:g.enemies
    this.hitPoints=[]
    const markers=[],edgeMarkers=[]
    for(const e of list){
      const position=[e.x,e.y,e.z]
      if(g.phase==='build'||e.id===g.target||e.id===this.hover){
        const steps=g.phase==='build'?12:18
        for(let j=0;j<steps;j++){
          const r=e.r-.55-j*.14
          if(r<1.25)break
          const a=positionAt(e,r),b=positionAt(e,r-.072)
          m.line([a.x,a.y,a.z],[b.x,b.y,b.z],e.id===g.target?'#e8c18bab':'#e18a735c',1.15)
        }
      }
      for(let j=0;j<3;j++){
        const d=.62+j*.27,r=.08-j*.016
        const {x,y,z}=positionAt(e,e.r+d)
        crystal(m,x,y,z,r,r*1.6,3,e.spin+j,['#e49b73','#c37859','#aa6151'])
      }
      hostile(m,e,t)
      const [x,y]=project(...position),z=depth(...position),mag=scale/(1-z/30)
      const size=Math.max(15,mag*(e.kind==='warden'?.97:.67))
      if(g.phase==='battle'&&(x<-3||y<-3||x>w+3||y>h+3)){
        const dx=x-center[0],dy=y-center[1]
        const edge=Math.min((w*.5-20)/Math.max(1,Math.abs(dx)),(dy<0?center[1]-50:h-center[1]-40)/Math.max(1,Math.abs(dy)))
        edgeMarkers.push({e,x:center[0]+dx*edge,y:center[1]+dy*edge,angle:Math.atan2(dy,dx),depth:z})
        continue
      }
      // Do not select or draw a HUD bracket over a hostile hidden by the core.
      if(z<0&&Math.hypot(x-center[0],y-center[1])+size*.35<scale*CORE_RADIUS)continue
      this.hitPoints.push({id:e.id,x,y,r:Math.max(size,20),depth:z})
      markers.push({e,x,y,size})
    }
    core(m,t,g,view)
    for(const shot of g.shots){
      const end=[shot.x,shot.y,shot.z]
      const from=shot.from
      const tint={core:'61,216,176',lance:'241,184,103',arc:'99,226,220',gravity:'182,153,239'}[shot.color]
      const alpha=Math.max(0,shot.t/.2)
      for(let i=0;i<12;i++){
        const a=mix(from,end,i/12),b=mix(from,end,(i+1)/12)
        m.line(a,b,'rgba('+tint+','+alpha*.68+')',5)
        m.line(a,b,'rgba(224,255,224,'+alpha+')',1.7)
      }
    }
    for(const burst of g.bursts){
      const f=burst.t/.7,r=Math.max(.05,range*1.3*f)
      ring(r,0,'rgba(164,255,216,'+(1-f)+')',96,1,3.4*(1-f)+.7)
      for(let i=0;i<g.axis;i++)ring(r,(i===0?1:-1)*.58,'rgba(160,225,220,'+(.65-f*.65)+')',80,1,2)
    }
    for(const p of g.dust){
      const r=.04*p.t/.6
      m.add([[p.x-r,p.y,p.z],[p.x,p.y+r,p.z],[p.x+r,p.y-r,p.z]],'#e78a67')
    }
    m.draw(c)
    const used=[]
    for(const marker of edgeMarkers.sort((a,b)=>a.e.r-b.e.r)){
      const {e,x,y,angle,depth}=marker
      if(used.some(p=>Math.hypot(p.x-x,p.y-y)<19))continue
      used.push(marker);this.hitPoints.push({id:e.id,x,y,r:16,depth})
      c.save();c.translate(x,y);c.rotate(angle)
      polygon(c,[[7,0],[-5,-4],[-2,0],[-5,4]],e.id===g.target?'#ffe0a5':'#df9876')
      c.restore()
    }
    for(const {e,x,y,size} of markers){
      if(e.hp<e.maxHp||e.kind==='warden'){
        const length=size*1.1,top=y-size*.98
        c.fillStyle='#423d3e';c.fillRect(x-length/2,top,length,3)
        c.fillStyle='#f1b58a';c.fillRect(x-length/2,top,length*e.hp/e.maxHp,3)
      }
      if(e.id!==g.target&&e.id!==this.hover)continue
      c.beginPath()
      for(let i=0;i<4;i++){
        const sx=i%2?1:-1,sy=i<2?-1:1
        c.moveTo(x+sx*size,y+sy*size*.42);c.lineTo(x+sx*size,y+sy*size*.68)
        c.lineTo(x+sx*size*.72,y+sy*size*.68)
      }
      c.strokeStyle=e.id===g.target?'#ffda9b':'#a6cdc2';c.lineWidth=1.4;c.stroke()
    }
  }
}
export function drawUpgrade(canvas,kind,locked=true){
  const d=2,size=96;canvas.width=canvas.height=size*d;const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0)
  const pr=(x,y,z)=>[48+x*31,54-y*28+z*14],m=new Mesh(pr)
  // A faint wireframe tile gives the three components a shared scale.
  polygon(c,[[7,68],[48,47],[89,68],[48,89]],'#849c7710','#b3c09b22',.8)
  if(kind==='damage'){
    for(let i=0;i<3;i++){
      const x=-.75+i*.66,y=-.05+i*.15
      crystal(m,x,y+.18,0,.46,.91,4,.53,['#baf8d9','#72c4ac','#439b89','#2e726b'],.48)
    }
    crystal(m,.05,.56,0,.41,1.05,4,.53,['#c2f7d9','#89d9bf','#5bb49c','#398971'],.47)
  }else if(kind==='range'){
    for(let i=0;i<3;i++)wedgeRing(m,0,-.25+i*.46,0,.52-i*.10,1.05-i*.17,.15,6,.20,'#a8c9a8','#548c76',.014)
    crystal(m,0,.94,0,.22,.59,4,.2,cyan)
  }else{
    const pal=locked?['#a1ada0','#868f84','#636d65','#474f49']:cyan
    for(let i=0;i<3;i++){const a=i*2.094+.3;const x=.88*Math.cos(a),z=.88*Math.sin(a)
      beamPrism(m,[0,.04,0],[x,.18,z],.085,locked?'#7d8478':'#74a58d')
      crystal(m,x,.23,z,.17,.42,4,a,pal)}
    crystal(m,0,.5,0,.35,1.50,4,.38,pal)
  }
  m.draw(c)
}
