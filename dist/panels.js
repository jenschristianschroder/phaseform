import {LEVELS,TOTAL_LEVELS,levelOf,formations,units} from './campaign.js'
import {paths,mounts,slotsAt,maxRank,researchCost,requirement,research,fit,refitResearch} from './research.js'
import {refundChassis,repair,repairCost,availableShards} from './engine.js'

const pad=n=>String(n).padStart(2,'0')
const byId=id=>document.getElementById(id)
const selected=(a,b)=>a===b?' selected':''
const disabled=condition=>condition?' disabled':''
const details={
  Surge:'The Warden accelerates below 45% hull.',
  Aegis:'The Warden raises a shield at 55% hull.',
  Shepherd:'The Warden accelerates allies within 3.2 units.'
}
function levelBrief(level){
  const roster=[...new Set(level.fleet.units)].map(k=>units[k].name)
  if(level.boss)roster.push(level.warden+' Warden')
  return '<div class="intel"><span class="eyebrow">Approach</span><h3>'+formations[level.pattern][0]+'</h3><p>'+formations[level.pattern][1]+'</p>'+
    '<dl><div><dt>Contacts</dt><dd>'+level.count+' · '+level.fleet.name+'</dd></div><div><dt>Fleet</dt><dd>'+roster.join(', ')+'</dd></div>'+
    '<div><dt>Coverage</dt><dd>'+['Equator','Equator + north','Full sphere'][level.axis]+'</dd></div></dl>'+
    (level.boss?'<p class="boss-note">'+details[level.warden]+' Wardens resist slows and secondary arc or gravity hits.</p>':'')+'</div>'
}
export function campaignPanel(g,open,close){
  let chosen=g.level
  function display(keepFocus=false){
    const l=LEVELS[chosen-1],start=(l.chapter-1)*10
    const options=LEVELS.filter(level=>(level.number-1)%10===0).map(level=>'<option value="'+level.number+'"'+selected(level.chapter,l.chapter)+'>'+pad(level.chapter)+' · '+level.sector+'</option>').join('')
    const cards=LEVELS.slice(start,start+10).map(level=>{
      const current=level.number===g.level&&g.phase!=='won'
      const state=level.number<g.level||g.phase==='won'?'Cleared':current?'Current':'Upcoming'
      return '<button id="mission-'+level.number+'" class="mission '+(level.number===chosen?'chosen':'')+'" aria-pressed="'+(level.number===chosen)+'">'+
        '<span>'+pad(level.number)+'</span><strong>'+level.name+'</strong><small>'+state+'</small></button>'
    }).join('')
    open('campaign','Campaign · '+TOTAL_LEVELS+' levels','Sector chart',
      '<div class="panel-toolbar"><label>Sector <select id="sector-select">'+options+'</select></label><span>Level '+pad(g.level)+' / '+TOTAL_LEVELS+'</span></div>'+
      '<div class="chart-body"><div class="mission-list">'+cards+'</div><aside class="mission-brief"><span class="eyebrow">Level '+pad(chosen)+'</span><h3>'+l.name+'</h3>'+levelBrief(l)+'</aside></div>',
      [['Back to field',close,true]])
    byId('sector-select').onchange=e=>{chosen=Number(e.target.value);display();byId('sector-select').focus()}
    for(const level of LEVELS.slice(start,start+10))byId('mission-'+level.number).onclick=()=>{chosen=level.number;display(true)}
    if(keepFocus)byId('mission-'+chosen).focus({preventScroll:true})
  }
  display()
}
export function labPanel(g,open,close,changed){
  let active=g.rigs[0]?.key||'lance',note=''
  const editable=g.phase==='build'
  function display(focusId){
    const path=paths[active],ranks=g.research[active],openSlots=slotsAt(g.level)
    const tabs=Object.entries(paths).map(([key,p])=>'<button id="path-'+key+'" aria-pressed="'+(active===key)+'" class="path-tab '+(active===key?'chosen':'')+'" style="--path:'+p.color+'">'+p.name+'</button>').join('')
    const nodes=path.nodes.map(([title,desc],i)=>{
      const rank=ranks[i],max=maxRank(i),cost=researchCost(i,rank),lock=requirement(ranks,i)
      const label=rank===max?'Complete':lock||'Research · '+cost+' RP'
      return '<article class="node"><div class="node-type">'+['Foundation','Branch A','Branch B','Keystone'][i]+'<span>'+rank+' / '+max+'</span></div>'+
        '<h4>'+title+'</h4><p>'+desc+'</p><button id="node-'+i+'"'+disabled(!editable||rank>=max||lock||g.points<cost)+'>'+label+'</button></article>'
    }).join('')
    const rigs=Array.from({length:openSlots},(_,slot)=>{
      const rig=g.rigs[slot]
      const options=Object.entries(paths).map(([key,p])=>'<option value="'+key+'"'+selected(key,rig?.key)+disabled(!g.research[key][0]||g.rigs.some((r,i)=>r.key===key&&i!==slot))+'>'+p.name+'</option>').join('')
      const mountOptions=Object.entries(mounts).map(([key,name])=>'<option value="'+key+'"'+selected(key,rig?.mount)+'>'+name+'</option>').join('')
      return '<div class="rig"><span>Socket '+(slot+1)+'</span><select aria-label="Module in socket '+(slot+1)+'" id="rig-'+slot+'"'+disabled(!editable||slot>g.rigs.length)+'><option value="">Empty</option>'+options+'</select>'+
        '<select aria-label="Mount direction in socket '+(slot+1)+'" id="mount-'+slot+'"'+disabled(!editable||!rig)+'>'+mountOptions+'</select></div>'
    }).join('')
    const status=editable?'Earn 1 RP every two levels and 1 more for each Warden.':'Research and refitting reopen between levels.'
    open('lab','Research & equipment','Research lab',
      '<div class="research-wallet"><strong>'+g.points+' RP</strong><span>'+status+'</span></div>'+
      '<div class="path-tabs">'+tabs+'</div><section class="tree" style="--path:'+path.color+'"><div class="path-role">'+path.role+'</div><div class="node-grid">'+nodes+'</div></section>'+
      '<div class="socket-heading"><h3>Equipped modules</h3><span>'+g.rigs.length+' / '+openSlots+' equipped</span></div>'+
      '<div class="rigs">'+rigs+'</div><p class="lab-help">Omni covers every bearing. A directional mount boosts its module by 35% in its band and reduces it by 18% elsewhere.'+
        (openSlots===1?' A second socket opens at level 21.':'')+'</p>'+
      '<div class="lab-tools"><button id="repair-core"'+disabled(!editable||g.hp>=100||availableShards(g,'repair')<repairCost(g))+
        '>Repair 28% · '+repairCost(g)+' shards</button><button id="refit"'+disabled(!editable)+'>Reset build</button></div>'+
      '<div class="lab-note" role="status">'+note+'</div>',[['Back to field',close,true]])
    for(const key of Object.keys(paths))byId('path-'+key).onclick=()=>{active=key;note='';display('path-'+key)}
    path.nodes.forEach(([name],n)=>{byId('node-'+n).onclick=()=>{
      if(research(g,active,n)){note=name+' researched.';changed();display('path-'+active)}
    }})
    for(let slot=0;slot<openSlots;slot++){
      byId('rig-'+slot).onchange=e=>{if(fit(g,slot,e.target.value,'omni')){note='Loadout updated.';changed()}display('rig-'+slot)}
      byId('mount-'+slot).onchange=e=>{if(fit(g,slot,g.rigs[slot].key,e.target.value)){note='Mount direction updated.';changed()}display('mount-'+slot)}
    }
    byId('repair-core').onclick=()=>{if(repair(g)){changed();note='Core integrity restored to '+g.hp+'%.';display('path-'+active)}}
    byId('refit').onclick=()=>open('refit','Research lab','Reset this build?',
      '<p>Recover all research points and the shards invested in pulse damage and range. Your current level, integrity and axis installations are preserved.</p>',
      [['Keep build',()=>display('refit'),true],['Refund upgrades',()=>{refitResearch(g);refundChassis(g);changed();note='Research and chassis costs refunded.';display('path-'+active)},false]])
    if(focusId)byId(focusId)?.focus({preventScroll:true})
  }
  display()
}
