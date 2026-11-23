export const paths={
  lance:{name:'Lance',color:'#ecc385',role:'Precision · line penetration',nodes:[
    ['Focused lens','Concentrate each primary shot. +16% damage per rank.'],
    ['Throughshot','Pierce one extra enemy per rank behind the target in a narrow 3D line.'],
    ['Armor breach','Deal 30% more damage per rank to Bulwarks, shield prisms and Wardens.'],
    ['Afterimage','Every fourth shot repeats for 85% damage.']]},
  arc:{name:'Arc',color:'#80d6c8',role:'Chain fire · clustered contacts',nodes:[
    ['Arc relay','Shots jump to one nearby enemy per rank. Each jump carries 56% of the previous hit.'],
    ['Long conductor','Extend the jump distance by 0.9 units per rank in any direction.'],
    ['Capacitor','Retain 8 extra percentage points of damage per jump per rank. Charge the first shot by 7% per rank.'],
    ['Return circuit','After a successful chain, return 65% damage to the original target if it survives.']]},
  gravity:{name:'Gravity',color:'#b5a3e6',role:'Control · volume suppression',nodes:[
    ['Mass anchor','Slow struck targets by 18%, 27% or 36% for 2.8 seconds.'],
    ['Tidal well','Spread the slow and 26% shot damage through a sphere around each hit. Its radius grows with rank.'],
    ['Compression','Deal 16% extra damage per rank to slowed targets and recharge the pulse burst faster.'],
    ['Event horizon','Pulse bursts push enemies up to 1.1 units outward and apply the anchor slow.']]}
}
export const mounts={omni:'Omni',north:'North',equator:'Equator',south:'South'}
export const blankResearch=()=>Object.fromEntries(Object.keys(paths).map(key=>[key,[0,0,0,0]]))
export const slotsAt=level=>level>=21?2:1
export const maxRank=node=>node===3?1:3
export function researchCost(node,rank){return node===3?4:node===0?[1,2,3][rank]:[2,2,3][rank]}
export function requirement(ranks,node){
  if((node===1||node===2)&&!ranks[0])return 'Requires the first node'
  if(node===3&&(ranks[1]<2||ranks[2]<2))return 'Requires rank 2 in both branches'
  return ''
}
export function research(g,key,node){
  if(g.phase!=='build'||!Object.hasOwn(paths,key)||!Number.isInteger(node)||node<0||node>3)return false
  const ranks=g.research[key],rank=ranks[node],cost=researchCost(node,rank)
  if(rank>=maxRank(node)||requirement(ranks,node)||g.points<cost)return false
  g.points-=cost;ranks[node]++
  if(node===0&&rank===0&&g.rigs.length<slotsAt(g.level))g.rigs.push({key,mount:'omni'})
  return true
}
export function fit(g,slot,key,mount){
  if(g.phase!=='build'||!Number.isInteger(slot)||slot<0||slot>=slotsAt(g.level)||slot>g.rigs.length)return false
  if(!key){g.rigs.splice(slot,1);return true}
  if(!Object.hasOwn(paths,key)||!g.research[key][0]||!Object.hasOwn(mounts,mount))return false
  if(g.rigs.some((rig,i)=>i!==slot&&rig.key===key))return false
  g.rigs[slot]={key,mount};return true
}
export function spentPoints(tree){
  let total=0
  for(const ranks of Object.values(tree))ranks.forEach((rank,node)=>{for(let i=0;i<rank;i++)total+=researchCost(node,i)})
  return total
}
export function refitResearch(g){
  if(g.phase!=='build')return false
  g.points+=spentPoints(g.research);g.research=blankResearch();g.rigs=[];return true
}
export function mountFactor(mount,e){
  if(mount==='omni')return 1
  const latitude=e.y/e.r
  const aligned=mount==='north'?latitude>.33:mount==='south'?latitude<-.33:Math.abs(latitude)<=.33
  return aligned?1.35:.82
}
export function rigPosition(key,mount,slot){
  const angle={lance:.75,arc:2.95,gravity:5.15}[key]+slot*.23
  const tilt={omni:slot?-.45:.42,north:1.10,equator:0,south:-1.10}[mount]
  const radius=1.46
  return [radius*Math.cos(tilt)*Math.cos(angle),radius*Math.sin(tilt),radius*Math.cos(tilt)*Math.sin(angle)]
}
