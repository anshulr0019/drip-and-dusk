import {inStock} from './core.mjs';
export const stages=['confirmed','packed','shipped','delivered'];
export const stageLabels={confirmed:'Confirmed',packed:'Packed',shipped:'Shipped',delivered:'Delivered',pending:'Awaiting payment',expired:'Payment window expired',cancelled:'Cancelled',payment_review:'Payment needs review'};
export const previewShipping={preview:true,zones:[{prefixes:[''],feePaise:9900,label:'Sample standard delivery'}],freeAbovePaise:300000};
export function validateAddress(a){
 if(!a||typeof a!=='object')throw Error('Enter a delivery address.');
 const out={};for(const [key,min,max] of [['name',2,80],['line1',5,160],['city',2,80],['state',2,80]]){out[key]=String(a[key]||'').trim();if(out[key].length<min||out[key].length>max)throw Error('Check your '+({name:'name',line1:'street address',city:'city',state:'state'}[key])+'.');}
 out.line2=String(a.line2||'').trim();if(out.line2.length>160)throw Error('Address line 2 is too long.');
 out.postcode=String(a.postcode||'').trim();if(!/^[1-9]\d{5}$/.test(out.postcode))throw Error('Enter a valid six-digit Indian PIN code.');
 let phone=String(a.phone||'').replace(/[\s()+-]/g,'');if(/^91\d{10}$/.test(phone))phone=phone.slice(2);if(!/^[6-9]\d{9}$/.test(phone))throw Error('Enter a valid Indian mobile number.');out.phone='91'+phone;
 out.country='IN';return out;
}
export function quoteCheckout(products,basket,postcode,shipping){
 if(!/^[1-9]\d{5}$/.test(String(postcode)))throw Error('Enter a valid six-digit Indian PIN code.');
 if(!Array.isArray(basket)||!basket.length||basket.length>20)throw Error('Choose between 1 and 20 product variants.');
 if(!shipping?.zones?.length)throw Error('Delivery rates are not configured yet.');
 const zone=shipping.zones.find(z=>z.prefixes?.some(prefix=>String(postcode).startsWith(prefix)));if(!zone)throw Error('Delivery is not available for this PIN code. Ask the seller for help.');
 const seen=new Set(),lines=basket.map(item=>{if(seen.has(item.id))throw Error('A product appears twice in the bag.');seen.add(item.id);const p=products.find(p=>p.id===item.id);if(!inStock(p)||!Number.isInteger(item.qty)||item.qty<1||item.qty>20||item.qty>p.quantity)throw Error('One or more products are unavailable. Review your bag.');const unitPaise=Math.round(p.price*100);if(!Number.isSafeInteger(unitPaise)||unitPaise<100)throw Error('A product price needs confirmation.');return {id:p.id,name:p.name,brand:p.brand,size:p.size,format:p.format,image:p.image,qty:item.qty,unitPaise};});
 const subtotalPaise=lines.reduce((s,l)=>s+l.unitPaise*l.qty,0),feePaise=Number.isFinite(shipping.freeAbovePaise)&&subtotalPaise>=shipping.freeAbovePaise?0:zone.feePaise;
 if(!Number.isSafeInteger(subtotalPaise)||subtotalPaise>100000000)throw Error('Please contact the seller for an order of this value.');
 if(!Number.isSafeInteger(feePaise)||feePaise<0||!Number.isSafeInteger(subtotalPaise+feePaise))throw Error('Delivery pricing needs confirmation.');
 return {lines,subtotalPaise,feePaise,totalPaise:subtotalPaise+feePaise,postcode:String(postcode),deliveryLabel:zone.label,preview:!!shipping.preview};
}
export const quoteFingerprint=q=>JSON.stringify({lines:q.lines.map(l=>[l.id,l.qty,l.unitPaise]).sort((a,b)=>a[0].localeCompare(b[0])),fee:q.feePaise,postcode:q.postcode});
export function completePreviewOrder(state,basket,quote,{requestId,consent=false,now=new Date().toISOString()}={}){
 const existing=(state.demoOrders||[]).find(o=>o.requestId===requestId);if(existing)return {state,order:existing};
 if(!requestId)throw Error('Restart checkout and try again.');
 const current=quoteCheckout(state.products,basket,quote.postcode,previewShipping);if(quoteFingerprint(current)!==quoteFingerprint(quote))throw Error('Your bag or prices changed. Review delivery and totals again.');
 const next=structuredClone(state),id='demo-'+crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID();
 const order={id,token,ref:'DD-DEMO-'+id.slice(-8).toUpperCase(),requestId,mode:'preview',status:'confirmed',paymentStatus:'simulated',notificationStatus:consent?'preview':'not_requested',lines:quote.lines,subtotalPaise:quote.subtotalPaise,feePaise:quote.feePaise,totalPaise:quote.totalPaise,deliveryLabel:quote.deliveryLabel,events:[{status:'confirmed',at:now}],createdAt:now};
 for(const line of order.lines){const p=next.products.find(p=>p.id===line.id);p.quantity-=line.qty;p.available=p.quantity>0;}
 next.demoOrders=[order,...(next.demoOrders||[])].slice(0,100);return {state:next,order};
}
export function advancePreviewOrder(state,id,status,now=new Date().toISOString()){
 const next=structuredClone(state),o=next.demoOrders?.find(o=>o.id===id);if(!o)throw Error('Demo order not found.');
 const before=stages.indexOf(o.status),after=stages.indexOf(status);if(after<0)throw Error('Choose a valid fulfilment stage.');if(after<=before)return next;if(after!==before+1)throw Error('Advance one fulfilment stage at a time.');
 o.status=status;o.events.push({status,at:now});return next;
}
export function previewTracking(state,id,token){const o=state.demoOrders?.find(o=>o.id===id&&o.token===token);if(!o)throw Error('Tracking link not found in this browser. Demo links work only on the device that created them.');return o;}
