/** The hero comes alive through a pointer-led glow and slow ambient light. The photo's scroll drift is pure CSS
 * (a named view-timeline in style.css), so nothing here listens to scroll or resize. Only transform/opacity change,
 * one animation frame at a time. Reduced-motion visitors and a paused or owner-disabled hero keep the plain photograph. */
export function initHeroMotion({document:doc=document,window:win=window}={}){
 const hero=doc.querySelector('.hero'),button=doc.querySelector('[data-action="motion"]');
 if(!hero)return {toggle(){},setEnabled(){}};
 const reduced=win.matchMedia('(prefers-reduced-motion: reduce)'),finePointer=win.matchMedia('(pointer: fine)');
 let siteEnabled=true,choice=null,frame=0,x=0,y=0,targetX=0,targetY=0,last='';
 const enabled=()=>siteEnabled&&(choice??!reduced.matches);
 const set=(name,value)=>hero.style.setProperty(name,value.toFixed(4));
 function render(){
  frame=0;if(!enabled())return;
  // Ease the pointer so the bottle drifts after the cursor rather than snapping to it.
  x+=(targetX-x)*.1;y+=(targetY-y)*.1;
  const state=x.toFixed(3)+y.toFixed(3);
  if(state!==last){last=state;set('--hero-x',x);set('--hero-y',y);}
  if(Math.abs(targetX-x)>.001||Math.abs(targetY-y)>.001)request();
 }
 function request(){if(!frame&&enabled())frame=win.requestAnimationFrame(render);}
 function sync(){
  const on=enabled();
  hero.classList.toggle('is-alive',on);
  // The CSS drift runs from first paint, before this script, so stillness is its own class rather than the absence of is-alive.
  hero.classList.toggle('is-still',!on);
  if(!on){targetX=targetY=x=y=0;last='';for(const name of ['--hero-x','--hero-y'])hero.style.removeProperty(name);}
  if(button){
   button.hidden=!siteEnabled;
   button.innerHTML=`<svg class=ui-icon aria-hidden=true focusable=false><use href=#${on?'pause':'play'}-icon></use></svg>`;
   button.setAttribute('aria-label',on?'Pause hero animation':'Play hero animation');
  }
  request();
 }
 // Off-screen, the dust and sheen animations pause (style.css .is-offscreen).
 if(win.IntersectionObserver)new win.IntersectionObserver(entries=>hero.classList.toggle('is-offscreen',!entries[entries.length-1].isIntersecting)).observe(hero);
 hero.addEventListener('pointermove',e=>{
  if(!finePointer.matches)return;const rect=hero.getBoundingClientRect();
  targetX=Math.max(-1,Math.min(1,((e.clientX-rect.left)/rect.width-.5)*2));targetY=Math.max(-1,Math.min(1,((e.clientY-rect.top)/rect.height-.5)*2));request();
 });
 hero.addEventListener('pointerleave',()=>{targetX=targetY=0;request();});
 reduced.addEventListener('change',()=>{choice=null;sync();});
 sync();
 return {toggle(){choice=!enabled();sync();},setEnabled(value){siteEnabled=!!value;sync();}};
}

// Static elements only: cards, mood tiles, the featured edit and the benefit strip are rebuilt by renders (filters, heart taps), so they never hide.
const REVEAL='.section-heading,.story-heading,.order-step,.clarity-card,.contact-section>div';
/** Section headings and panels fade up a few pixels, once, as they scroll into view. Whatever is already on screen
 * the first time it is reported is never hidden, so nothing blinks after first paint. Without IntersectionObserver or
 * with reduced motion nothing is hidden; printing is handled in CSS. */
export function initReveal({document:doc=document,window:win=window,root=doc.querySelector('#storefront')}={}){
 if(!root||!win.IntersectionObserver||win.matchMedia('(prefers-reduced-motion: reduce)').matches)return {refresh(){}};
 const registered=new WeakSet(),
  show=new win.IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');show.unobserve(entry.target);}},{rootMargin:'0px 0px -6% 0px',threshold:.08}),
  // The hidden state is only applied to elements that were off-screen at their first report, so it is never painted over visible content.
  first=new win.IntersectionObserver(entries=>{for(const entry of entries){first.unobserve(entry.target);if(entry.isIntersecting)continue;entry.target.classList.add('reveal-item');show.observe(entry.target);}},{rootMargin:'0px',threshold:0});
 function refresh(scope=root){
  for(const el of scope.querySelectorAll(REVEAL)){
   if(registered.has(el))continue;registered.add(el);
   // Siblings arrive in a short cascade (at most 120 ms).
   el.style.setProperty('--reveal-delay',([...el.parentElement.children].indexOf(el)%4)*40+'ms');first.observe(el);
  }
 }
 doc.documentElement.classList.add('reveal-ready');refresh();
 return {refresh};
}
