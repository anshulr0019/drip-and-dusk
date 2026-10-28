// Shared by the owner form, server catalogue and scent finder.
const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const noteTerms={
 fresh:['bergamot','lemon','lime','orange','mandarin','tangerine','grapefruit','apple','pineapple','aquatic','marine','citrus','mint','green','pear'],
 sweet:['vanilla','praline','tonka','dates','candied','gourmand','caramel','chocolate','honey','tropical'],
 woody:['wood','patchouli','cedar','sandalwood','oud','fir balsam','vetiver'],
 floral:['flower','jasmine','orchid','heliotrope','iris','tuberose','lily','peony','rose','lavender','violet'],
 coffee:['coffee']
};
const split=s=>(Array.isArray(s)?s:String(s||'').split(/[·,;\n]/)).map(n=>String(n).trim()).filter(Boolean);
export function notePyramid(p){
 if(p.notePyramid&&typeof p.notePyramid==='object')return Object.fromEntries(['top','heart','base'].map(k=>[k,split(p.notePyramid[k])]));
 const stages=String(p.notes||'').split('/');return {top:split(stages[0]),heart:split(stages[1]),base:split(stages[2])};
}
export function notesError(pyramid){
 if(!pyramid||typeof pyramid!=='object')return 'Add top, heart and base notes.';
 for(const key of ['top','heart','base']){const list=split(pyramid[key]);if(!list.length||list.length>24||list.some(n=>n.length>80)||/pending|conflict|unverified|unknown|confirm|verification/i.test(list.join(' ')))return 'Enter verified notes for all three stages (up to 24 notes per stage).';}
 return '';
}
export function processNotes(p){
 const pyramid=notePyramid(p),notes=['top','heart','base'].map(k=>pyramid[k].join(' · ')).join(' / ');
 const scores=Object.fromEntries(Object.entries(noteTerms).map(([style,terms])=>[style,['top','heart','base'].reduce((sum,k,i)=>sum+pyramid[k].filter(n=>terms.some(t=>clean(n).includes(t))).length*[2,3,2][i],0)]));
 // One bright top note must not turn a vanilla/amber fragrance into a fresh scent.
 const spices=(clean(notes).match(/cinnamon|nutmeg|tobacco|pepper|myrrh/g)||[]).length;
 const floralCore=scores.floral>=4&&scores.sweet<=scores.floral+5&&spices<2;
 const main=scores.coffee?'coffee':floralCore?'floral':scores.sweet>=4||spices>=2?'sweet':scores.fresh>=Math.max(scores.woody-2,scores.floral)&&scores.fresh>0?'fresh':scores.woody?'woody':null;
 const warm=['coffee','sweet'].includes(main);
 const directions=Object.keys(scores).filter(k=>scores[k]>0&&(!['fresh','floral'].includes(k)||main===k));
 const family={coffee:'Coffee & gourmand',sweet:'Warm & spiced',fresh:'Fresh & bright',floral:'Soft & floral',woody:'Woody & textured'}[main]||'A personal discovery';
 const occasions=warm?['date','evening','gift']:['daily','office','cafe','gift'];
 return {notePyramid:pyramid,notes,scentProfile:{directions,occasions,family,edit:main==='fresh'?'fresh':main==='floral'?'soft':warm?'warm':main==='woody'?'dark':'',scores}};
}
