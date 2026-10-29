// Telegram messages to the owner when an order needs attention. Needs TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID. Alerts carry the order reference, amount, items and UPI reference only, never
// the customer's name, phone or address. A failed alert never affects the order itself.
const rupees=p=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2}).format(p/100);
export const alertsConfigured=env=>/^\d+:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN||'')&&/^-?\d{1,20}$/.test(String(env.TELEGRAM_CHAT_ID||''));
const headlines={
 upi_order:'New Direct UPI order · waiting for payment',
 upi_submitted:'UPI payment to verify',
 paid:'Paid with Razorpay · ready to pack',
 review:'Payment needs review',
 test:'Test alert'
};
export function alertText(kind,order,env){
 if(kind==='test')return `✅ Drip & Dusk alerts are connected.\nYou will get a message here for new orders and payments to verify.\n${env.PUBLIC_ORIGIN}/#admin`;
 let items=[];try{items=JSON.parse(order.lines||'[]')}catch{}
 const lines=[`${kind==='review'||kind==='upi_submitted'?'⚠️':'🛍️'} ${headlines[kind]}`,`${order.ref} · ${rupees(order.total_paise)}`,...items.slice(0,6).map(l=>`• ${l.name}${l.size?' '+l.size+' ml':''}${l.format==='Decant'?' decant':''} × ${l.qty}`)];
 if(items.length>6)lines.push(`• and ${items.length-6} more`);
 if(kind==='upi_submitted')lines.push(`UTR: ${order.payment_reference}`,'Check that this exact amount reached your bank, then approve it in Orders. The bottles are held for 24 hours.');
 if(kind==='upi_order')lines.push('The customer has 30 minutes to pay and submit their UPI reference.');
 if(kind==='review')lines.push('A Razorpay payment arrived after the order had expired. Check stock, then fulfil or refund it.');
 lines.push(`${env.PUBLIC_ORIGIN}/#admin`);
 return lines.join('\n');
}
export async function sendOwnerAlert(env,kind,order,fetchExternal){
 if(!alertsConfigured(env))return false;
 const r=await fetchExternal(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:alertText(kind,order,env),disable_web_page_preview:true})});
 if(!r.ok)throw Error('Telegram rejected the alert.');
 return true;
}
// Background delivery for checkout paths: errors are swallowed so orders always complete.
export const queueOwnerAlert=(ctx,env,kind,order,fetchExternal)=>ctx.waitUntil(sendOwnerAlert(env,kind,order,fetchExternal).catch(()=>false));
