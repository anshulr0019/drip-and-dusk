// Fills policy pages with the owner's business details from Business & ordering settings.
// Details the owner has not provided are hidden rather than shown as blanks.
import {storeDefaults,defaultDelivery} from './store-settings.mjs';
const rupees=p=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(p/100);
export function deliveryText(delivery=defaultDelivery){
 const fee=delivery.feePaise===0?'Delivery is free on every order.':`Delivery costs ${rupees(delivery.feePaise)} per order, anywhere we deliver in India.`;
 return fee+(delivery.feePaise>0&&delivery.freeAbovePaise!==null&&delivery.freeAbovePaise!==undefined?` Orders of ${rupees(delivery.freeAbovePaise)} or more ship free.`:'')+' The exact charge is always shown at checkout before you pay.';
}
export function applyStore(doc,settings={}){
 const s={...storeDefaults,...settings};
 for(const el of doc.querySelectorAll('[data-store]')){
  const value=String(s[el.dataset.store]||''),kind=el.dataset.storeHref;
  el.textContent=kind==='tel'&&value?'+'+value:value;
  if(kind==='mailto')el.setAttribute('href','mailto:'+value);
  if(kind==='tel')el.setAttribute('href','tel:+'+value);
  if(kind==='url')/^https:\/\//.test(value)?el.setAttribute('href',value):el.removeAttribute('href');
 }
 for(const el of doc.querySelectorAll('[data-store-line]'))el.hidden=!String(s[el.dataset.storeLine]||'').trim();
 // A contact box with nothing filled in yet is hidden rather than shown empty.
 for(const el of doc.querySelectorAll('.policy-contact'))el.hidden=[...el.children].every(child=>child.hidden);
 for(const el of doc.querySelectorAll('[data-store-delivery]'))el.textContent=deliveryText(s.delivery||defaultDelivery);
 for(const el of doc.querySelectorAll('[data-store-missing]'))el.hidden=!!(s.supportEmail||s.supportPhone);
 for(const el of doc.querySelectorAll('[data-year]'))el.textContent=new Date().getFullYear();
}
if(typeof document!=='undefined'){
 applyStore(document);
 fetch('/api/catalogue',{signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).then(data=>{if(data?.settings)applyStore(document,data.settings)}).catch(()=>{});
}
