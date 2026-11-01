import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initHeroMotion,initReveal} from '../dist/hero-motion.mjs';
function classes(){const s=new Set();return {add:(...x)=>x.forEach(v=>s.add(v)),remove:x=>s.delete(x),contains:x=>s.has(x),toggle(x,on){on?s.add(x):s.delete(x)}}}
// Any window listener is recorded (the old scroll/resize ones would show up here); an IntersectionObserver is only present when asked for.
function rig({reduced=false,fine=true,observer=false}={}){
 const vars=new Map(),listeners=[],frames=[],observers=[];
 const hero=Object.assign(new EventTarget(),{classList:classes(),style:{setProperty:(k,v)=>vars.set(k,v),removeProperty:k=>vars.delete(k)},getBoundingClientRect:()=>({top:0,left:0,width:1000,height:500})});
 const button={hidden:true,innerHTML:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const media=q=>Object.assign(new EventTarget(),{matches:q.includes('reduce')?reduced:fine});
 const win={matchMedia:media,addEventListener:n=>listeners.push(n),requestAnimationFrame:f=>{frames.push(f);return frames.length}};
 if(observer)win.IntersectionObserver=class{constructor(cb){this.cb=cb;observers.push(this)}observe(){}};
 const doc={querySelector:s=>s==='.hero'?hero:s==='[data-action="motion"]'?button:null};
 const control=initHeroMotion({document:doc,window:win});
 const flush=()=>{while(frames.length)frames.shift()();};
 return {hero,button,vars,listeners,observers,control,flush};
}
test('the hero comes alive by default and never listens to scroll or resize',()=>{
 const r=rig({observer:true});r.flush();
 assert.equal(r.hero.classList.contains('is-alive'),true);assert.equal(r.hero.classList.contains('is-still'),false);
 assert.equal(r.button.hidden,false);assert.equal(r.button.attributes['aria-label'],'Pause hero animation');
 assert.deepEqual(r.listeners,[],'no window listeners at all: the photo drift is CSS-only');
 assert.equal(r.vars.has('--hero-progress'),false);
});
test('the IntersectionObserver only flags the hero as off-screen; it adds no listeners and no frames',()=>{
 const r=rig({observer:true});r.flush();const [io]=r.observers;
 io.cb([{isIntersecting:false}]);assert.equal(r.hero.classList.contains('is-offscreen'),true);
 io.cb([{isIntersecting:true}]);assert.equal(r.hero.classList.contains('is-offscreen'),false);
 io.cb([{isIntersecting:true},{isIntersecting:false}]);assert.equal(r.hero.classList.contains('is-offscreen'),true,'the latest entry wins');
 assert.deepEqual(r.listeners,[]);
});
test('a fine pointer steers the glow smoothly; touch screens ignore pointer tracking',()=>{
 const r=rig();r.hero.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:1000,clientY:250}));r.flush();assert.ok(Number(r.vars.get('--hero-x'))>.99);assert.equal(Number(r.vars.get('--hero-y')),0);
 r.hero.dispatchEvent(new Event('pointerleave'));r.flush();assert.ok(Math.abs(Number(r.vars.get('--hero-x')))<.01,'the glow eases back to centre');
 const touch=rig({fine:false});touch.hero.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:1000,clientY:250}));touch.flush();assert.equal(touch.vars.get('--hero-x'),'0.0000');
});
test('reduced motion keeps the still photograph until the visitor presses Play',()=>{
 const r=rig({reduced:true});r.flush();assert.equal(r.hero.classList.contains('is-alive'),false);assert.equal(r.hero.classList.contains('is-still'),true);assert.equal(r.vars.size,0);assert.equal(r.button.attributes['aria-label'],'Play hero animation');
 r.control.toggle();assert.equal(r.hero.classList.contains('is-alive'),true);assert.equal(r.hero.classList.contains('is-still'),false);
});
test('pause and the owner still-photo setting stop all motion, add is-still and reset the glow',()=>{
 const r=rig();r.hero.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:1000,clientY:250}));r.flush();assert.ok(r.vars.size>0);
 r.control.toggle();assert.equal(r.hero.classList.contains('is-alive'),false);assert.equal(r.hero.classList.contains('is-still'),true);assert.equal(r.vars.size,0);
 r.hero.dispatchEvent(Object.assign(new Event('pointermove'),{clientX:1000,clientY:250}));r.flush();assert.equal(r.vars.size,0,'a paused hero ignores the pointer');
 r.control.toggle();assert.equal(r.hero.classList.contains('is-still'),false);
 r.control.setEnabled(false);assert.equal(r.hero.classList.contains('is-alive'),false);assert.equal(r.hero.classList.contains('is-still'),true);assert.equal(r.button.hidden,true);
 r.control.setEnabled(true);assert.equal(r.hero.classList.contains('is-alive'),true);assert.equal(r.button.hidden,false);
});
// A scriptable IntersectionObserver: each instance keeps its options and the elements it watches.
function revealRig({matches=false,withObserver=true,count=6}={}){
 const instances=[],selectors=[];
 const make=i=>({classList:classes(),style:{props:{},setProperty(k,v){this.props[k]=v}},parentElement:null,i});
 const parent={children:[]};const els=Array.from({length:count},(_,i)=>{const e=make(i);e.parentElement=parent;parent.children.push(e);return e});
 const root={querySelectorAll:selector=>{selectors.push(selector);return els}};
 const win={matchMedia:()=>({matches})};
 if(withObserver)win.IntersectionObserver=class{constructor(cb,options){this.cb=cb;this.options=options;this.watched=new Set();instances.push(this)}observe(e){this.watched.add(e)}unobserve(e){this.watched.delete(e)}};
 const doc={documentElement:{classList:classes()}};
 const api=initReveal({document:doc,window:win,root});
 return {els,instances,selectors,doc,api,win};
}
// [first-report observer, reveal observer]
const observersOf=r=>[r.instances.find(i=>i.options.threshold===0),r.instances.find(i=>i.options.threshold!==0)];
test('only static headings and panels reveal; cards, mood tiles, the featured edit and the benefit strip never hide',()=>{
 const r=revealRig();assert.equal(r.selectors.length,1);
 const parts=r.selectors[0].split(',');assert.deepEqual(parts,['.section-heading','.story-heading','.order-step','.clarity-card','.contact-section>div']);
 for(const rebuilt of ['.product-card','.scent-edit','.feature-card','.featured-heading','.benefit-strip','.faq-list details','.feature-card'])assert.ok(!parts.some(p=>p.includes(rebuilt)),rebuilt+' is rebuilt by renders and must not be hidden');
});
test('first-report rule: anything on screen when first reported is never hidden; the rest fade in once',()=>{
 const r=revealRig({count:4}),[first,show]=observersOf(r);
 assert.deepEqual([first.options.rootMargin,first.options.threshold],['0px',0],'any visible pixel at the first report counts as seen');
 assert.equal(show.options.rootMargin,'0px 0px -6% 0px');
 assert.equal(r.doc.documentElement.classList.contains('reveal-ready'),true);
 assert.ok(r.els.every(e=>!e.classList.contains('reveal-item')),'nothing is hidden before the first report, so no paint ever hides visible content');
 assert.equal(first.watched.size,4);
 first.cb([{isIntersecting:true,target:r.els[0]},{isIntersecting:false,target:r.els[1]},{isIntersecting:true,target:r.els[2]},{isIntersecting:false,target:r.els[3]}]);
 assert.equal(r.els[0].classList.contains('reveal-item'),false);assert.equal(r.els[2].classList.contains('reveal-item'),false);
 assert.equal(r.els[1].classList.contains('reveal-item'),true);assert.equal(r.els[3].classList.contains('reveal-item'),true);
 assert.equal(first.watched.size,0,'each element is reported to the first-report observer once');assert.deepEqual([...show.watched].map(e=>e.i),[1,3]);
 show.cb([{isIntersecting:false,target:r.els[1]}]);assert.equal(r.els[1].classList.contains('is-revealed'),false);
 show.cb([{isIntersecting:true,target:r.els[1]}]);assert.equal(r.els[1].classList.contains('is-revealed'),true);assert.deepEqual([...show.watched].map(e=>e.i),[3],'revealed once, then left alone');
});
test('reveals cascade by at most 120 ms and a repeated refresh does not register elements twice',()=>{
 const r=revealRig({count:9});const delays=r.els.map(e=>e.style.props['--reveal-delay']);
 assert.deepEqual(delays,['0ms','40ms','80ms','120ms','0ms','40ms','80ms','120ms','0ms']);
 const [first]=observersOf(r);first.cb(r.els.map(target=>({isIntersecting:false,target})));
 r.api.refresh();assert.equal(first.watched.size,0,'refresh() ignores elements it has already seen');
});
test('there is no MutationObserver and no print hook: later renders cannot re-reveal anything',()=>{
 // The window has neither MutationObserver nor addEventListener; initReveal would throw if it used them.
 assert.doesNotThrow(()=>revealRig());
});
test('reduced motion, or no IntersectionObserver, hides nothing',()=>{
 const calm=revealRig({matches:true});assert.equal(calm.doc.documentElement.classList.contains('reveal-ready'),false);assert.equal(calm.instances.length,0);
 const plain=revealRig({withObserver:false});assert.equal(plain.doc.documentElement.classList.contains('reveal-ready'),false);assert.ok(plain.els.every(e=>!e.classList.contains('reveal-item')));
});
test('the stylesheet keeps focus, print, no-script and reduced-motion visitors out of the hidden state',async()=>{
 const css=await readFile(new URL('../dist/style.css',import.meta.url),'utf8');
 assert.match(css,/\.reveal-ready \.reveal-item:focus-within\{opacity:1;transform:none\}/,'headings contain links, so keyboard focus always shows them');
 assert.match(css,/@media print\{\.reveal-ready \.reveal-item\{opacity:1!important;transform:none!important;animation:none!important\}\}/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\.reveal-ready \.reveal-item\{opacity:1!important/);
 assert.match(css,/\.reveal-ready \.reveal-item:not\(\.is-revealed\)\{opacity:0\}/,'the hidden state needs .reveal-ready, which only the script adds');
 assert.equal((css.match(/@keyframes reveal-up/g)||[]).length,1,'one reveal keyframe');
 assert.match(css,/@keyframes reveal-up\{from\{opacity:0;transform:translate3d\(0,10px,0\)\}/);
 assert.doesNotMatch(css,/featureLight|hero-progress|hero-settle|hero-rise/,'the scroll-linked colour, progress variable and load-time replays are gone');
});
test('the photo drift is a named view-timeline, motion-safe, supported-only and switched off by pause',async()=>{
 const css=await readFile(new URL('../dist/style.css',import.meta.url),'utf8');
 const start=css.indexOf('@supports (animation-timeline:view())'),block=css.slice(start,css.indexOf('}}',start)+2);
 assert.ok(start>0);assert.match(block,/@media \(prefers-reduced-motion:no-preference\)/);
 assert.match(block,/\.hero\{view-timeline:--hero\}/,'a named timeline: the hero clips, so an anonymous view() on its children would not track the page');
 assert.match(block,/\.hero-media\{animation:hero-drift linear both;animation-timeline:--hero;animation-range:exit\}/);
 assert.match(block,/\.hero\.is-still \.hero-media\{animation:none\}/);
 assert.match(block,/@keyframes hero-drift\{to\{translate:0 5%\}\}/,'the individual translate property composes with the pointer transform');
 assert.doesNotMatch(block,/is-alive/,'active from first paint, never gated by the script');
});
