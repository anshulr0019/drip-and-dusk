/** The hero still comes alive through scroll depth, a pointer-led glow and slow ambient light.
 * Only transform/opacity change, one animation frame at a time. Reduced-motion visitors and a
 * paused or owner-disabled hero keep the plain photograph. */
export function initHeroMotion({document:doc=document,window:win=window}={}){
 const hero=doc.querySelector('.hero'),button=doc.querySelector('[data-action="motion"]');
 if(!hero)return {toggle(){},setEnabled(){}};
 const reduced=win.matchMedia('(prefers-reduced-motion: reduce)'),finePointer=win.matchMedia('(pointer: fine)');
 let siteEnabled=true,choice=null,frame=0,x=0,y=0,targetX=0,targetY=0,last='';
 const enabled=()=>siteEnabled&&(choice??!reduced.matches);
 const set=(name,value)=>hero.style.setProperty(name,value.toFixed(4));
 function render(){
  frame=0;if(!enabled())return;
  const rect=hero.getBoundingClientRect(),progress=Math.min(1,Math.max(0,-rect.top/Math.max(1,rect.height)));
  // Ease the pointer so the bottle drifts after the cursor rather than snapping to it.
  x+=(targetX-x)*.1;y+=(targetY-y)*.1;
  const state=progress.toFixed(3)+x.toFixed(3)+y.toFixed(3);
  if(state!==last){last=state;set('--hero-progress',progress);set('--hero-x',x);set('--hero-y',y);}
  if(Math.abs(targetX-x)>.001||Math.abs(targetY-y)>.001)request();
 }
 function request(){if(!frame&&enabled())frame=win.requestAnimationFrame(render);}
 function sync(){
  const on=enabled();
  hero.classList.toggle('is-alive',on);
  if(!on){targetX=targetY=x=y=0;last='';for(const name of ['--hero-progress','--hero-x','--hero-y'])hero.style.removeProperty(name);}
  if(button){
   button.hidden=!siteEnabled;
   button.innerHTML=`<svg class=ui-icon aria-hidden=true focusable=false><use href=#${on?'pause':'play'}-icon></use></svg>`;
   button.setAttribute('aria-label',on?'Pause hero animation':'Play hero animation');
  }
  request();
 }
 win.addEventListener('scroll',request,{passive:true});
 win.addEventListener('resize',request,{passive:true});
 hero.addEventListener('pointermove',e=>{
  if(!finePointer.matches)return;const rect=hero.getBoundingClientRect();
  targetX=Math.max(-1,Math.min(1,((e.clientX-rect.left)/rect.width-.5)*2));targetY=Math.max(-1,Math.min(1,((e.clientY-rect.top)/rect.height-.5)*2));request();
 });
 hero.addEventListener('pointerleave',()=>{targetX=targetY=0;request();});
 reduced.addEventListener('change',()=>{choice=null;sync();});
 sync();
 return {toggle(){choice=!enabled();sync();},setEnabled(value){siteEnabled=!!value;sync();}};
}

const REVEAL='.section-heading,.featured-heading,.scent-edit,.product-card,.feature-card,.order-step,.story-heading,.clarity-card,.faq-list details,.contact-section>div,.benefit-strip>span';
/** Storefront sections and cards rise into place as they scroll into view, including cards
 * rendered later by filters and pagination. Without IntersectionObserver or with reduced motion,
 * nothing is hidden. */
export function initReveal({document:doc=document,window:win=window,root=doc.querySelector('#storefront')}={}){
 if(!root||!win.IntersectionObserver||win.matchMedia('(prefers-reduced-motion: reduce)').matches)return {refresh(){}};
 const observer=new win.IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}},{rootMargin:'0px 0px -6% 0px',threshold:.08});
 function refresh(scope=root){
  for(const el of scope.querySelectorAll(REVEAL)){
   if(el.classList.contains('reveal-item'))continue;
   // Siblings arrive in a short cascade, capped so long grids never feel slow.
   const index=[...el.parentElement.children].indexOf(el);
   el.style.setProperty('--reveal-delay',(index%4)*80+'ms');el.classList.add('reveal-item');observer.observe(el);
  }
 }
 doc.documentElement.classList.add('reveal-ready');refresh();
 new win.MutationObserver(()=>refresh()).observe(root,{childList:true,subtree:true});
 // Printing or saving the page must never hide content waiting for a scroll.
 win.addEventListener('beforeprint',()=>root.querySelectorAll('.reveal-item').forEach(el=>el.classList.add('is-revealed')));
 return {refresh};
}
