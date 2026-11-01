import test from 'node:test';
import assert from 'node:assert/strict';
import {createDialogMotion} from '../dist/dialog-motion.mjs';
function rig({reduced=false,animate=true}={}){
 const active=new Set(),animations=[];let closes=0,opens=0;
 const dialog={open:false,classList:{add:n=>active.add(n),remove:n=>active.delete(n)},showModal(){this.open=true;opens++},close(){this.open=false;closes++}};
 if(animate)dialog.animate=(frames,options)=>{let resolve,reject;const finished=new Promise((a,b)=>{resolve=a;reject=b});const a={frames,options,finished,finish:resolve,cancel:()=>reject(Error('cancelled'))};animations.push(a);return a;};
 const motion=createDialogMotion(dialog,{window:{matchMedia:()=>({matches:reduced})}});
 return {dialog,motion,active,animations,get closes(){return closes},get opens(){return opens}};
}
const settle=()=>new Promise(resolve=>queueMicrotask(resolve));
test('opening uses the native dialog and rerendering choices does not replay its entrance',()=>{
 const r=rig();r.motion.open();r.motion.open();assert.equal(r.opens,1);assert.equal(r.animations.length,1);assert.equal(r.dialog.open,true);
});
test('close keeps the native focus trap until its exit completes and calls completion once',async()=>{
 const r=rig();r.motion.open();let done=0;r.motion.close(()=>done++);r.motion.close(()=>done++);
 assert.equal(r.dialog.open,true);assert.equal(r.active.has('is-closing'),true);assert.equal(done,0);
 r.animations.at(-1).finish();await settle();assert.equal(r.dialog.open,false);assert.equal(r.closes,1);assert.equal(done,1);assert.equal(r.active.has('is-closing'),false);
});
test('reopening while closing invalidates the old callback and leaves the new dialog open',async()=>{
 const r=rig();r.motion.open();let done=0;r.motion.close(()=>done++);const exit=r.animations.at(-1);r.motion.open();exit.finish();await settle();
 assert.equal(r.dialog.open,true);assert.equal(done,0);assert.equal(r.closes,0);assert.equal(r.active.has('is-closing'),false);
});
test('payment and route handoffs close synchronously, including during an animated close',async()=>{
 const r=rig();r.motion.open();let stale=0,done=0;r.motion.close(()=>stale++);r.motion.close(()=>done++,{immediate:true});await settle();assert.equal(r.dialog.open,false);assert.equal(stale,0);assert.equal(done,1);
});
for(const config of [{reduced:true},{animate:false}])test('reduced motion or unsupported animation closes immediately: '+JSON.stringify(config),()=>{
 const r=rig(config);r.motion.open();let done=false;r.motion.close(()=>done=true);assert.equal(r.dialog.open,false);assert.equal(done,true);assert.equal(r.animations.length,0);
});
test('a failed animation still completes closing without leaving the page locked',async()=>{
 const r=rig();r.motion.open();let done=false;r.motion.close(()=>done=true);r.animations.at(-1).cancel();await settle();assert.equal(r.dialog.open,false);assert.equal(done,true);
});
