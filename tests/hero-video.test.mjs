import test from 'node:test';
import assert from 'node:assert/strict';
import {initHeroVideo} from '../dist/hero-video.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function classList(){const s=new Set();return {add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x),toggle(x,on){on?s.add(x):s.delete(x)}}}
function rig({reduced=false,saveData=false,visible=true,reject=false}={}){
 const hero={classList:classList(),closest:()=>null,getBoundingClientRect:()=>({top:visible?0:1000,bottom:visible?450:1450})};
 const button={hidden:true,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const media=Object.assign(new EventTarget(),{matches:reduced});
 const connection=Object.assign(new EventTarget(),{saveData});
 const video=Object.assign(new EventTarget(),{paused:true,dataset:{src:'assets/fragrance-loop.mp4'},calls:0,loads:0,reject,load(){this.loads++},pause(){this.paused=true},play(){this.calls++;if(this.reject)return Promise.reject(Object.assign(new Error('Autoplay blocked'),{name:'NotAllowedError'}));this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve()}});
 const doc=Object.assign(new EventTarget(),{hidden:false,body:{classList:classList()},querySelector:s=>s==='#hero-video'?video:s==='.hero'?hero:button});
 let observer;
 const win={innerHeight:800,navigator:{connection},matchMedia:()=>media,IntersectionObserver:class{constructor(cb){observer=cb}observe(){}}};
 const control=initHeroVideo({document:doc,window:win});
 return {hero,button,media,connection,video,doc,control,intersect:isIntersecting=>observer([{isIntersecting}])};
}
test('ordinary visits play silently, and manual pause/resume controls the film',async()=>{const r=rig();await flush();assert.equal(r.video.paused,false);assert.equal(r.video.muted,true);assert.equal(r.video.defaultMuted,true);assert.equal(r.video.playsInline,true);assert.equal(r.video.src,'assets/fragrance-loop.mp4');r.control.toggle();assert.equal(r.video.paused,true);assert.equal(r.button.attributes['aria-label'],'Play background video');r.control.toggle();assert.equal(r.video.paused,false)});
test('reduced motion does not even load the film until explicit Play',()=>{const r=rig({reduced:true});assert.equal(r.video.loads,0);assert.equal(r.video.calls,0);assert.equal(r.hero.classList.contains('video-ready'),false);r.control.toggle();assert.equal(r.video.paused,false);assert.equal(r.video.loads,1)});
test('data saver and initially offscreen heroes defer the download',()=>{const r=rig({saveData:true});assert.equal(r.video.loads,0);r.control.toggle();assert.equal(r.video.loads,1);const off=rig({visible:false});assert.equal(off.video.loads,0);off.intersect(true);assert.equal(off.video.loads,1)});
test('scrolling away or hiding a tab pauses playback without overriding manual pause',async()=>{const r=rig();await flush();r.intersect(false);assert.equal(r.video.paused,true);r.intersect(true);await flush();assert.equal(r.video.paused,false);r.doc.hidden=true;r.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(r.video.paused,true);r.doc.hidden=false;r.doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(r.video.paused,false);r.control.toggle();r.intersect(false);r.intersect(true);assert.equal(r.video.paused,true)});
test('autoplay rejection retains a working Play button and poster',async()=>{const r=rig({reject:true});await flush();assert.equal(r.button.hidden,false);assert.equal(r.button.attributes['aria-label'],'Play background video');assert.equal(r.hero.classList.contains('video-ready'),false);r.video.reject=false;r.control.toggle();assert.equal(r.video.paused,false)});
test('media errors and preference changes return to the static poster',()=>{const r=rig();assert.equal(r.hero.classList.contains('video-ready'),true);r.media.matches=true;r.media.dispatchEvent(new Event('change'));assert.equal(r.video.paused,true);assert.equal(r.hero.classList.contains('video-ready'),false);const broken=rig();broken.video.dispatchEvent(new Event('error'));assert.equal(broken.video.paused,true);assert.equal(broken.button.hidden,true);assert.equal(broken.hero.classList.contains('video-ready'),false)});
