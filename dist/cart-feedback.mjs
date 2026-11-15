/** A single, non-blocking acknowledgement; decorative motion never changes bag data. */
export function createCartFeedback({document:doc=document,window:win=window}={}){
 const panel=doc.createElement('div');panel.className='cart-feedback';panel.setAttribute('popover','manual');panel.setAttribute('aria-label','Bag confirmation');
 panel.innerHTML='<span class="cart-feedback-check" aria-hidden="true"><svg class=ui-icon aria-hidden=true focusable=false><use href=#check-icon></use></svg><svg class="ui-icon cart-feedback-spark" aria-hidden="true" focusable="false"><use href="#spark-icon"></use></svg></span><div class="cart-feedback-copy"><p role="status" aria-live="polite" aria-atomic="true"><strong>Added to your bag</strong><span class="cart-feedback-product"></span></p><button class="cart-feedback-link" data-action="basket">View bag <span aria-hidden="true"><svg class=ui-icon aria-hidden=true focusable=false><use href=#arrow-up-right-icon></use></svg></span></button></div><button class="cart-feedback-close" aria-label="Dismiss bag confirmation"><svg class=ui-icon aria-hidden=true focusable=false><use href=#close-icon></use></svg></button>';
 doc.body.append(panel);const product=panel.querySelector('.cart-feedback-product'),animations=new Set();let timer,closing=null;
 const reduced=()=>win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 function animate(target,frames,options){if(!target?.animate||reduced())return null;const a=target.animate(frames,options);animations.add(a);a.finished.catch(()=>{}).finally(()=>animations.delete(a));return a;}
 function hide(){clearTimeout(timer);closing?.cancel();closing=null;for(const a of animations)a.cancel();animations.clear();panel.classList.remove('is-visible');if(typeof panel.hidePopover==='function'&&panel.matches(':popover-open'))panel.hidePopover();}
 function dismiss(){if(panel.contains(doc.activeElement))return hide();closing=animate(panel,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-5px)'}],{duration:140,easing:'ease-in',fill:'forwards'});if(closing)closing.finished.then(hide).catch(()=>{});else hide();}
 panel.querySelector('.cart-feedback-close').addEventListener('click',hide);panel.querySelector('.cart-feedback-link').addEventListener('click',hide);
 panel.addEventListener('pointerenter',()=>clearTimeout(timer));panel.addEventListener('pointerleave',()=>{if(!panel.contains(doc.activeElement))timer=win.setTimeout(dismiss,2200);});panel.addEventListener('focusin',()=>clearTimeout(timer));panel.addEventListener('focusout',()=>{timer=win.setTimeout(dismiss,2200);});
 doc.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});doc.addEventListener('close',event=>{if(event.target.tagName==='DIALOG')hide();},true);
 // A brass drop arcs from the tapped button into the bag. Only from the page itself: an open dialog hides the header bag.
 // Returns how long until it lands, so the bag answers on arrival. Transform/opacity only; the element is removed afterwards.
 function drop(source){
  const bag=doc.querySelector('.bag-button svg');
  if(reduced()||!source?.isConnected||!bag||doc.querySelector('dialog[open]')||typeof doc.body.animate!=='function')return 0;
  const s=source.getBoundingClientRect(),t=bag.getBoundingClientRect();if(!s.width||!t.width)return 0;
  const el=doc.createElement('span');el.className='bag-drop';el.setAttribute('aria-hidden','true');doc.body.append(el);
  const x0=s.left+s.width/2-5,y0=s.top+s.height/2-5,x1=t.left+t.width/2-5,y1=t.top+t.height/2-3,peak=Math.max(8,Math.min(y0,y1)-56),at=(x,y,k)=>`translate(${x}px,${y}px) rotate(45deg) scale(${k})`;
  const a=animate(el,[{transform:at(x0,y0,.3),opacity:0},{transform:at(x0,y0-10,.9),opacity:1,offset:.12},{transform:at(x0+(x1-x0)*.7,peak,1),opacity:1,offset:.6},{transform:at(x1,y1-8,.85),opacity:1,offset:.84},{transform:at(x1,y1+2,.3),opacity:0}],{duration:680,easing:'cubic-bezier(.4,0,.3,1)'});
  if(!a){el.remove();return 0;}a.finished.catch(()=>{}).finally(()=>el.remove());return 570;
 }
 function show({name,size,quantity=1,source}){
  hide();product.textContent=`${name} · ${size}${quantity>1?' × '+quantity:''}`;
  // Manual popovers share the top layer with product dialogs without stealing focus.
  (doc.querySelector('dialog[open]')||doc.body).append(panel);if(typeof panel.showPopover==='function')panel.showPopover();
  panel.classList.add('is-visible');
  animate(panel,[{opacity:0,transform:'translateY(-9px) scale(.97)'},{opacity:1,transform:'translateY(2px) scale(1.005)',offset:.72},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:360,easing:'cubic-bezier(.2,.7,.25,1)'});
  // The bag count's pulse is a CSS class set by renderCounters (app.mjs), so it also fires for changes made inside the bag.
  const bag=doc.querySelector('.bag-button'),landing=drop(source);
  animate(bag?.querySelector('svg'),[{transform:'rotate(0)'},{transform:'rotate(-12deg)',offset:.25},{transform:'rotate(9deg)',offset:.5},{transform:'rotate(-4deg)',offset:.75},{transform:'rotate(0)'}],{duration:500,delay:landing,easing:'ease-out'});
  animate(panel.querySelector('.cart-feedback-check'),[{transform:'scale(.65) rotate(-18deg)'},{transform:'scale(1.13) rotate(5deg)',offset:.65},{transform:'scale(1) rotate(0)'}],{duration:430,easing:'ease-out'});
  if(source?.isConnected)animate(source,[{transform:'scale(1)'},{transform:'scale(.96)',offset:.25},{transform:'scale(1.025)',offset:.65},{transform:'scale(1)'}],{duration:300,easing:'ease-out'});
  timer=win.setTimeout(dismiss,3600);
 }
 return {show,hide};
}
