export function bindOrbitInput(canvas, world, focusTarget){
  const pointers=new Map()
  let pinching=false
  const localPick=event=>{
    const rect=canvas.getBoundingClientRect()
    return world.pick(event.clientX-rect.left,event.clientY-rect.top)
  }
  const span=()=>{
    const [a,b]=[...pointers.values()]
    return Math.max(4,Math.hypot(a.x-b.x,a.y-b.y))
  }
  const clearHover=()=>{
    world.hover=0
    canvas.style.cursor=pointers.size?'grabbing':'grab'
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||pointers.size>=2)return
    canvas.focus({preventScroll:true})
    canvas.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false})
    if(pointers.size===2){
      pinching=true
      for(const point of pointers.values())point.moved=true
    }
    clearHover()
  })
  canvas.addEventListener('pointermove',event=>{
    const p=pointers.get(event.pointerId)
    if(!p){
      if(!pointers.size){
        world.hover=localPick(event)
        canvas.style.cursor=world.hover?'crosshair':'grab'
      }
      return
    }
    const previousSpan=pinching?span():0
    const dx=event.clientX-p.x,dy=event.clientY-p.y
    p.x=event.clientX;p.y=event.clientY
    if(pinching){
      world.camera.magnify(span()/previousSpan)
      return
    }
    if(Math.hypot(p.x-p.startX,p.y-p.startY)>5)p.moved=true
    if(p.moved){
      const sensitivity=Math.PI*1.55/Math.max(300,Math.min(world.w,world.h))
      world.camera.orbit(-dx*sensitivity,dy*sensitivity)
    }
  })
  function release(event){
    const point=pointers.get(event.pointerId)
    if(!point)return
    const tap=event.type==='pointerup'&&!point.moved&&!pinching&&Math.hypot(event.clientX-point.startX,event.clientY-point.startY)<=5
    pointers.delete(event.pointerId)
    pinching=pointers.size===2
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId)
    clearHover()
    if(tap)focusTarget(localPick(event))
  }
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,release)
  canvas.addEventListener('pointerleave',()=>{if(!pointers.size)clearHover()})
  canvas.addEventListener('wheel',event=>{
    if(event.ctrlKey||event.metaKey)return
    event.preventDefault()
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?world.h:1)
    world.camera.magnify(Math.exp(-pixels*.0014))
    clearHover()
  },{passive:false})
}
