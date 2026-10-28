import {notePyramid,processNotes,notesError,noteTerms,matchesNoteTerm} from './fragrance-notes.mjs';
import {catalogue,defaults,inStock,fragranceProfile} from './core.mjs';

export const occasions = [
 {id:'date',label:'Date night',detail:'An evening together'},
 {id:'cafe',label:'Coffee date',detail:'A daytime café catch-up'},
 {id:'office',label:'Office',detail:'For your working day'},
 {id:'daily',label:'Everyday',detail:'Your regular rotation'},
 {id:'evening',label:'Evening out',detail:'Dinner, celebrations & after dark'},
 {id:'gift',label:'A gift',detail:'Something for someone else'}
];
export const styles = [
 {id:'fresh',label:'Fresh',detail:'Citrus, fruit & a brighter direction'},
 {id:'sweet',label:'Sweet',detail:'Vanilla, praline & gourmand notes'},
 {id:'woody',label:'Woody',detail:'Woods, patchouli & earthy notes'},
 {id:'floral',label:'Floral',detail:'Flowers & softer accords'},
 {id:'coffee',label:'Coffee notes',detail:'A coffee note in the fragrance'},
 {id:'spicy',label:'Spicy & herbal',detail:'Pepper, saffron, spices & aromatic herbs'},
 {id:'leather',label:'Leathery',detail:'Leather accords & a darker texture'},
 {id:'marine',label:'Marine',detail:'Sea-water, ambergris & coastal accords'},
 {id:'tea',label:'Tea notes',detail:'Tea listed in the note pyramid'},
 {id:'unsure',label:'Not sure yet',detail:'Help me explore the collection'}
];
export const budgets = [
 {id:'500',label:'Up to ₹500'}, {id:'1500',label:'Up to ₹1,500'},
 {id:'3000',label:'Up to ₹3,000'}, {id:'5000',label:'Up to ₹5,000'},
 {id:'any',label:'No set budget'}
];
export const formats = [
 {id:'Full bottle',label:'Full bottle'}, {id:'Decant',label:'Decant'},
 {id:'either',label:'Either format'}
];
const knownNotes=new Map(defaults().products.filter(p=>!p.instagramSource&&p.group!=='oud-for-glory').map(p=>[p.group,p.notes]));
const terms=noteTerms;
const directions={fresh:/fresh|aquatic|citrus|fruity/,sweet:/sweet|gourmand|vanilla/,floral:/floral/,woody:/wood|oud|earth/,coffee:/coffee/};
const clean=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function verifiedForFinder(p){
 const notes=p.notePyramid?processNotes(p).notes:String(p.notes||'');
 if(p.notePyramid&&(notesError(notePyramid(p))||(p.notes&&p.notes!==notes)))return false;
 if(p.finderVerified===false||notes.split('/').length!==3||notes.split('/').some(s=>!s.trim())||/pending|conflict|unverified|unknown|confirm|verification/i.test(notes))return false;
 return p.finderVerified===true||knownNotes.get(p.group)===notes;
}
function evidence(p,style){
 return [notePyramid(p).top.join(' · '),notePyramid(p).heart.join(' · '),notePyramid(p).base.join(' · ')].flatMap((stage,i)=>stage.split(/[·,;]/).map(n=>n.trim()).filter(n=>n&&terms[style].some(t=>matchesNoteTerm(n,t))).map(note=>({note,weight:[2,3,2][i]})));
}
function affinity(p,occasion){

 const profile=fragranceProfile(p),family=clean(profile.family),warm=/warm|spic|coffee|gourmand|amber/.test(family),fresh=/fresh|aquatic|floral|fruity/.test(family);
 if(['date','evening'].includes(occasion))return warm?4:2;
 if(['office','daily','cafe'].includes(occasion))return fresh?4:1;
 return 2;
}
export function recommendScents(products,answers){return rankScents(products,answers,false)}
// Unknown prices cannot be treated as satisfying a price cap or a decant request.
export function discoverScents(products,answers){
 if(answers?.budget!=='any'||answers?.format==='Decant')return [];
 return rankScents(products,answers,true);
}
function rankScents(products,answers,references){
 if(!occasions.some(o=>o.id===answers?.occasion)||!styles.some(s=>s.id===answers?.style)||!budgets.some(b=>b.id===String(answers?.budget))||!formats.some(f=>f.id===answers?.format))return [];
 const limit=answers.budget==='any'?Infinity:Number(answers.budget),byGroup=new Map();
 for(const p of catalogue(products)){
  if(!(references?p.enquiryOnly:inStock(p))||!verifiedForFinder(p)||(!references&&p.price>limit)||(answers.format!=='either'&&p.format!==answers.format))continue;
  const found=answers.style==='unsure'?[]:evidence(p,answers.style);
  if(answers.style!=='unsure'&&!found.length)continue;
  const primary=answers.style!=='unsure'&&(directions[answers.style]?.test(clean(fragranceProfile(p).family))||(answers.style==='sweet'&&/creamy|sweet|gourmand/.test(clean(p.description))));
  // A citrus top note alone does not make a warm amber scent a fresh recommendation.
  if(['fresh','floral'].includes(answers.style)&&!primary)continue;
  if(answers.style==='fresh'&&['warm','dark'].includes(fragranceProfile(p).edit))continue;
  const styleScore=found.reduce((sum,n)=>sum+n.weight,0)+(primary?6:0);
  const score=styleScore+affinity(p,answers.occasion);
  const item={product:p,score,notes:[...new Set(found.map(n=>n.note))].slice(0,3)};
  const old=byGroup.get(p.group||p.id);
  // With either format selected, show a bottle when it fits; never silently exceed budget.
  if(!old||answers.format==='either'&&p.format==='Full bottle'&&old.product.format==='Decant'||p.format===old.product.format&&(score>old.score||score===old.score&&p.price<old.product.price))byGroup.set(p.group||p.id,item);
 }
 return [...byGroup.values()].sort((a,b)=>b.score-a.score||a.product.order-b.product.order||a.product.name.localeCompare(b.product.name)).slice(0,3).map(item=>({...item,...explain(item,answers),...(references?{tradeOff:'Price, bottle size and availability need seller confirmation. This is a scent suggestion, not a stocked offer.'}:{})}));
}
function explain(item,answers){
 const p=item.product,profile=fragranceProfile(p),selected=styles.find(s=>s.id===answers.style);
 const reason=answers.style==='unsure'?`${profile.family} is a direction to explore for ${occasions.find(o=>o.id===answers.occasion).label.toLowerCase()}. ${profile.pairing}.`:`${item.notes.join(', ')} ${item.notes.length===1?'is listed':'are listed'} in its note pyramid, matching your ${selected.label.toLowerCase()} preference.`;
 const tradeOff=answers.style==='coffee'&&!/coffee/i.test(profile.family)?`Coffee is one note within a ${profile.family.toLowerCase()} profile; it is not necessarily the dominant impression.`:answers.occasion==='gift'?'A scent preference is personal. A decant can help the recipient try it first.':answers.occasion==='office'||answers.occasion==='cafe'?'For a shared indoor space, start with a light application.':p.format==='Decant'?'A seller-filled discovery size; the original bottle photo is a fragrance reference.':'A full-bottle choice. Consider a decant first if this scent direction is new to you.';
 return {reason,tradeOff};
}
