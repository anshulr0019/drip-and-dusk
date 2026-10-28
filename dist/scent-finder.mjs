import {occasions,styles,budgets,formats,recommendScents,discoverScents} from './scent-matching.mjs';
import {money,sizeLabel,fragranceProfile} from './core.mjs';

export function createScentFinder({getMatches=async()=>null,openModal,getProducts,esc,imageURL,photoStyle,icon}){
 let remoteMatches=null,matchingError='',loading=false;
 let step=0,showResults=false,answers={occasion:'',style:'',budget:'',format:'Full bottle'};
 const questions=[
  {field:'occasion',title:'Where will you wear it?',intro:'Start with the moment you have in mind.',options:occasions},
  {field:'style',title:'What draws you in?',intro:'Choose a scent direction. It’s fine to be undecided.',options:styles},
  {field:'budget',title:'A little room for discovery.',intro:'Set your budget and choose a bottle or a discovery size.',options:budgets}
 ];
 const progress=()=>`<ol class="finder-progress" aria-label="Finder progress">${['The occasion','Your preference','Your budget'].map((label,i)=>`<li class="${showResults||i<step?'complete':i===step?'current':''}" ${!showResults&&i===step?'aria-current="step"':''}><span>${i+1}</span>${label}</li>`).join('')}</ol>`;
 function choices(field,options){return `<div class="finder-options ${field==='format'?'finder-formats':''}" role="radiogroup" aria-label="${{occasion:'Occasion',style:'Scent preference',budget:'Budget',format:'Bottle or decant'}[field]}">${options.map(o=>`<button class="finder-choice ${answers[field]===o.id?'selected':''}" type="button" role="radio" aria-checked="${answers[field]===o.id}" tabindex="${answers[field]?answers[field]===o.id?'0':'-1':o===options[0]?'0':'-1'}" data-action="finder-choice" data-field="${field}" data-value="${esc(o.id)}"><span>${o.label}</span>${o.detail?`<small>${o.detail}</small>`:''}<i aria-hidden="true">${answers[field]===o.id?'✓':'+'}</i></button>`).join('')}</div>`}
 function render(focus=false){
  let body;
  if(showResults)body=results();
  else{const q=questions[step];body=`${progress()}<div class="finder-question"><p class="eyebrow">0${step+1} / A SHORTLIST OF YOUR OWN</p><h3 id="finder-question" tabindex="-1">${q.title}</h3><p>${q.intro}</p>${step===1&&answers.occasion==='cafe'?'<p class="finder-tip">Coffee date is the occasion. Choose Coffee notes only if you want a coffee note in the perfume.</p>':''}${choices(q.field,q.options)}${step===2?`<div class="finder-format-section"><h4>How would you like to explore?</h4>${choices('format',formats)}<p class="fineprint">A decant is a smaller amount in a seller-filled atomiser.</p></div>`:''}<div class="finder-navigation"><button class="text-link" data-action="finder-back" ${step===0?'disabled':''}>← Back</button><button class="btn" data-action="finder-next" ${answers[q.field]?'':'disabled'}>${step===2?'Find my matches':'Continue'} <span>↗</span></button></div><p class="finder-method">Guided by catalogue notes and your choices. No account needed.</p></div>`;}
  openModal('Find your scent',body,'finder','DRIP & DUSK / A PERSONAL EDIT');
  if(focus){document.querySelector('#modal').scrollTop=0;document.querySelector('#finder-question')?.focus({preventScroll:true})}
 }
 function discoveryResults(discoveries){
  if(!discoveries.length)return '';
  return `<section class="finder-discoveries" aria-label="More scents to explore"><p class="eyebrow">MORE FROM THE COLLECTION</p><h4>A direction worth asking about.</h4><p>These fragrances also match your note preference. Their price, bottle size and availability need confirmation, so they are separate from available matches.</p><div class="finder-discovery-grid">${discoveries.map(m=>{const p=m.product;return `<article class="finder-discovery"><img src="${imageURL(p.image)}" alt="${esc(p.brand+' '+p.name)} bottle reference" loading="lazy" width="300" height="300"><p class="eyebrow">${esc(p.brand)}</p><h5>${esc(p.name)}</h5><p>${esc(fragranceProfile(p).family)}</p><p>${esc(m.reason)}</p><p class="fineprint">Ask for price · Availability to confirm</p><a class="btn outline" href="#product/${esc(p.id)}">Explore the notes ↗</a></article>`}).join('')}</div></section>`;
 }
 function results(){
  const matches=remoteMatches??recommendScents(getProducts(),answers),discoveries=discoverScents(getProducts(),answers),summary=[occasions.find(o=>o.id===answers.occasion)?.label,styles.find(s=>s.id===answers.style)?.label,budgets.find(b=>b.id===String(answers.budget))?.label,formats.find(f=>f.id===answers.format)?.label];
  return `${progress()}${matchingError?`<p class="form-error" role="alert">${esc(matchingError)}</p>`:''}<div class="finder-result-heading"><p class="eyebrow">YOUR PERSONAL EDIT</p><h3 id="finder-question" tabindex="-1">${matches.length?'A few scents to make your own.':discoveries.length?'A scent direction to explore.':'Let’s find another direction.'}</h3><p>${matches.length?`${matches.length} ${matches.length===1?'fragrance fits':'fragrances fit'} your choices. Explore what makes each one a match.`:'No available fragrance matches this combination. Explore any suggestions below, or change your scent direction, budget or format.'}</p><div class="finder-summary">${summary.map(s=>`<span>${s}</span>`).join('')}</div></div>${matches.length?`<div class="finder-results">${matches.map((m,i)=>{const p=m.product;return `<article class="finder-result"><div class="finder-result-photo" style="${photoStyle(p)}"><span>0${i+1} / YOUR EDIT</span><img src="${imageURL(p.image)}" alt="${esc(p.brand+' '+p.name)} original bottle" width="640" height="640"></div><div class="finder-result-copy"><p class="eyebrow">${esc(p.brand)}</p><h4>${esc(p.name)}</h4><p class="finder-family">${esc(fragranceProfile(p).family)}</p><p class="finder-why"><b>Why it fits</b>${esc(m.reason)}</p><p class="finder-tradeoff">${esc(m.tradeOff)}</p><div class="finder-result-price"><b>${money(p.price)}</b><span>${sizeLabel(p)} · ${esc(p.format)}</span></div><div class="finder-result-actions"><a class="btn outline" href="#product/${esc(p.id)}">View perfume ↗</a><button class="add-btn" data-action="add" data-id="${esc(p.id)}" aria-label="Add ${esc(p.name+' '+sizeLabel(p)+' '+p.format)} to enquiry bag">${icon('plus')}</button></div></div></article>`}).join('')}</div>`:discoveries.length?'':'<div class="finder-empty">'+icon('bottle')+'<p>Your preferences stay yours. We’ll only show a match when its details and availability support it.</p></div>'}${discoveryResults(discoveries)}<div class="finder-result-footer"><div><p class="fineprint">Matches use the current demo catalogue. Prices and stock are sample data. Occasion pairings are editorial suggestions, and skin and application affect the experience.</p><p class="fineprint">Available matches require stock, price and complete notes. With no set budget, separate discovery suggestions include enquiry-only fragrances with published notes.</p></div><div class="finder-result-tools"><button class="text-link" data-action="finder-edit">Change answers ↗</button><button class="text-link" data-action="finder-restart">Start again</button><button class="text-link" data-action="contact">Ask Drip & Dusk ${icon('chat')}</button></div></div>`;
 }
 async function handle(action,el){
  if(action==='finder-choice'){
   const field=el.dataset.field,value=el.dataset.value,options={occasion:occasions,style:styles,budget:budgets,format:formats}[field];
   if(!options?.some(o=>o.id===value))return;
   answers[field]=value;render();
   [...document.querySelectorAll('[data-action="finder-choice"]')].find(b=>b.dataset.field===field&&b.dataset.value===value)?.focus({preventScroll:true});
  }
  if(action==='finder-next'&&!loading&&answers[questions[step].field]){if(step===2){loading=true;el.disabled=true;el.textContent='Finding your matches…';matchingError='';try{remoteMatches=await getMatches({...answers});showResults=true;}catch(e){remoteMatches=[];matchingError=e.message;showResults=true;}finally{loading=false;}}else step++;render(true)}
  if(action==='finder-back'&&step>0){step--;render(true)}
  if(action==='finder-edit'){remoteMatches=null;showResults=false;step=0;render(true)}
  if(action==='finder-restart'){remoteMatches=null;answers={occasion:'',style:'',budget:'',format:'Full bottle'};step=0;showResults=false;render(true)}
 }
 return {open:()=>render(true),refresh:()=>{if(showResults){remoteMatches=null;showResults=false;step=2;render()}},handle};
}
