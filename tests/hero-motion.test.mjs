import test from 'node:test';
import assert from 'node:assert/strict';
import {initHeroMotion,initReveal} from '../dist/hero-motion.mjs';
function classes(){const s=new Set();return {add:(...x)=>x.forEach(v=>s.add(v)),remove:x=>s.delete(x),contains:x=>s.has(x),toggle(x,on){on?s.add(x):s.delete(x)}}}
function rig({reduced=false,fine=true,top=0}={}){
 const vars=new Map(),listeners={},frames=[];
 const hero=Object.assign(new EventTarget(),{classList:classes(),style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)},getBoundingClientRect:()=>({top:rig.top??top,left:0,width:1000,height:500})});
 const button={hidden:true,innerHTML:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const media=q=>Object.assign(new EventTarget(),{matches:q.includes('reduce')?reduced:fine});
 const win={matchMedia:media,addEventListener:(n,f)=>listeners[n]=f,requestAnimationFrame:f=>{frames.push(f);return frames.length}};
 const doc={querySelector:s=>s==='.hero'?hero:s==='[data-action="motion"]'?button:null};
 const control=initHeroMotion({document:doc,window:win});
 const flush=()=>{while(frames.length)frames.shift()();};
 return {hero,button,vars,listeners,control,flush};
}
test('the hero comes alive by default and scroll depth follows the page position',()=>{
 const r=rig();r.flush();assert.equal(r.hero.classList.contains('is-alive'),true);assert.equal(r.button.hidden,false);assert.equal(r.button.attributes['aria-label'],'Pause hero animation');
 rig.top=-250;r.listeners.scroll();r.flush();assert.equal(r.vars.get('--hero-progress'),'0.5000');
 rig.top=-2000;r.listeners.scroll();r.flush();assert.equal(r.vars.get('--hero-progress'),'1.0000');rig.top=undefined;
});
test('a fine pointer steers the glow smoothly; touch screens ignore pointer tracking',()=>{
 const r=rig();r.hero.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:1000,clientY:250}));r.flush();assert.ok(Number(r.vars.get('--hero-x'))>.99);
 const touch=rig({fine:false});touch.hero.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:1000,clientY:250}));touch.flush();assert.equal(touch.vars.get('--hero-x'),'0.0000');
});
test('reduced motion keeps the still photograph until the visitor presses Play',()=>{
 const r=rig({reduced:true});r.flush();assert.equal(r.hero.classList.contains('is-alive'),false);assert.equal(r.vars.size,0);assert.equal(r.button.attributes['aria-label'],'Play hero animation');
 r.control.toggle();assert.equal(r.hero.classList.contains('is-alive'),true);
});
test('pause and the owner still-photo setting stop all motion and reset the depth variables',()=>{
 const r=rig();r.flush();r.control.toggle();assert.equal(r.hero.classList.contains('is-alive'),false);assert.equal(r.vars.size,0);
 r.control.toggle();r.control.setEnabled(false);assert.equal(r.hero.classList.contains('is-alive'),false);assert.equal(r.button.hidden,true);
});
test('cards rendered later still reveal once in view; reduced motion hides nothing',()=>{
 let callback,observed=[],mutation;const make=()=>({classList:classes(),style:{setProperty(){}},parentElement:null});
 const cards=[make(),make()],parent={children:cards};cards.forEach(c=>c.parentElement=parent);
 const root={querySelectorAll:()=>cards};
 const win={matchMedia:()=>({matches:false}),addEventListener(){},IntersectionObserver:class{constructor(cb){callback=cb}observe(el){observed.push(el)}unobserve(){}},MutationObserver:class{constructor(cb){mutation=cb}observe(){}}};
 const doc={documentElement:{classList:classes()}};initReveal({document:doc,window:win,root});
 assert.equal(doc.documentElement.classList.contains('reveal-ready'),true);assert.equal(observed.length,2);
 callback([{isIntersecting:true,target:cards[0]}]);assert.equal(cards[0].classList.contains('is-revealed'),true);assert.equal(cards[1].classList.contains('is-revealed'),false);
 const late=make();late.parentElement=parent;cards.push(late);mutation();assert.equal(observed.length,3);
 const calm={documentElement:{classList:classes()}};initReveal({document:calm,window:{...win,matchMedia:()=>({matches:true})},root});assert.equal(calm.documentElement.classList.contains('reveal-ready'),false);
});
