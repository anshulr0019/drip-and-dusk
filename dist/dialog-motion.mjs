// Keep the native dialog and focus trap alive until the exit finishes. Route/payment
// handoffs close immediately; reopening invalidates an older pending close.
export function createDialogMotion(dialog,{window:win=window}={}){
 const reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
 let animation=null,revision=0,closing=false;
 const allowed=()=>!reduced.matches&&typeof dialog.animate==='function';
 function cancel(){revision++;animation?.cancel();animation=null;closing=false;dialog.classList.remove('is-closing');}
 function open(){
  if(dialog.open&&!closing)return;
  cancel();if(!dialog.open)dialog.showModal();
  if(allowed()){
   const a=dialog.animate([{opacity:0,transform:'translateY(18px) scale(.99)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:230,easing:'cubic-bezier(.2,.7,.2,1)'});animation=a;
   a.finished.then(()=>{if(animation===a)animation=null;},()=>{});
  }
 }
 function close(done,{immediate=false}={}){
  if(immediate||!dialog.open||!allowed()){cancel();if(dialog.open)dialog.close();done();return;}
  if(closing)return;
  cancel();closing=true;const current=revision;dialog.classList.add('is-closing');
  const a=dialog.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(12px) scale(.99)'}],{duration:170,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});animation=a;
  const finish=()=>{if(revision!==current||!closing)return;animation=null;closing=false;if(dialog.open)dialog.close();a.cancel();dialog.classList.remove('is-closing');done();};
  a.finished.then(finish,finish);
 }
 function refresh(element){if(element&&allowed()&&!closing)element.animate([{opacity:.45,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:170,easing:'ease-out'});}
 return {open,close,refresh};
}
