/** A decorative film never blocks shopping, starts with sound, or ignores motion preferences. */
export function initHeroVideo({document:doc=document,window:win=window}={}) {
 const video=doc.querySelector('#hero-video');
 const hero=doc.querySelector('.hero');
 const button=doc.querySelector('[data-action="motion"]');
 if(!video||!hero||!button)return {toggle(){}};
 const reduced=win.matchMedia('(prefers-reduced-motion: reduce)');
 const connection=win.navigator.connection;
 const rect=hero.getBoundingClientRect();
 let visible=!hero.closest('[hidden]')&&rect.bottom>0&&rect.top<win.innerHeight;
 let siteEnabled=true,choice=null,failed=false,loaded=false,playPending=false;
 const wantsMotion=()=>siteEnabled&&(choice??!(reduced.matches||connection?.saveData||['slow-2g','2g','3g'].includes(connection?.effectiveType)));
 video.muted=true;
 video.defaultMuted=true;
 video.playsInline=true;
 button.hidden=false;
 function updateButton(){
  const enabled=wantsMotion()&&!failed;
  button.innerHTML=enabled?'<svg class=ui-icon aria-hidden=true focusable=false><use href=#pause-icon></use></svg>':'<svg class=ui-icon aria-hidden=true focusable=false><use href=#play-icon></use></svg>';
  button.setAttribute('aria-label',enabled?'Pause background video':'Play background video');
  button.hidden=failed||!siteEnabled;
  doc.body.classList.toggle('paused',!enabled);
 }
 function sync(){
  updateButton();
  if(!wantsMotion()||failed||doc.hidden||!visible){
   video.pause();
   // A changed system preference returns to the immediately available poster.
   if(!siteEnabled||reduced.matches&&choice!==true)hero.classList.remove('video-ready');
   return;
  }
  if(!loaded){
   loaded=true;
   // Phones get the 480p encode: a quarter of the bytes for a film cropped to a narrow screen.
   video.src=win.innerWidth<=760&&video.dataset.srcMobile||video.dataset.src;
   video.load();
  }
  if(!video.paused||playPending)return;
  playPending=true;
  Promise.resolve(video.play()).catch(error=>{
   // Pausing while the initial play request is pending is a normal lifecycle change.
   if(error.name!=='AbortError'&&!doc.hidden&&visible){choice=false;updateButton();}
  }).finally(()=>{
   playPending=false;
   if(video.paused&&wantsMotion()&&visible&&!doc.hidden&&!failed)sync();
  });
 }
 video.addEventListener('playing',()=>{
  if(!doc.hidden&&visible&&wantsMotion()&&!failed)hero.classList.add('video-ready');
  else video.pause();
 });
 // A buffering film must not replace the immediately available poster.
 for(const event of ['waiting','stalled'])video.addEventListener(event,()=>hero.classList.remove('video-ready'));
 video.addEventListener('error',()=>{
  failed=true;
  video.pause();
  hero.classList.remove('video-ready');
  updateButton();
 });
 const preferenceChanged=()=>{choice=null;sync();};
 reduced.addEventListener('change',preferenceChanged);
 connection?.addEventListener?.('change',preferenceChanged);
 doc.addEventListener('visibilitychange',sync);
 if(win.IntersectionObserver){
  const observer=new win.IntersectionObserver(entries=>{
   visible=entries[0].isIntersecting;
   sync();
  },{threshold:0});
  observer.observe(hero);
 }
 sync();
 return {toggle(){choice=!wantsMotion();sync();},setEnabled(value){siteEnabled=!!value;sync();}};
}
