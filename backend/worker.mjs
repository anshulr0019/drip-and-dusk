import {quoteCheckout,quoteFingerprint,validateAddress,previewShipping,stages} from '../dist/commerce-model.mjs';
const encoder=new TextEncoder(),json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...headers}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export async function hmac(secret,message){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args),first=(env,sql,...args)=>stmt(env,sql,...args).first(),all=async(env,sql,...args)=>(await stmt(env,sql,...args).all()).results;
const tokenFor=(env,id)=>hmac(env.TRACKING_SECRET,'tracking:'+id);
const mode=env=>env.COMMERCE_MODE||'sandbox';
function readiness(env){const preview=mode(env)==='preview';if(!['preview','sandbox'].includes(mode(env)))return false;return !!(env.TRACKING_SECRET?.length>=32&&env.ADMIN_SECRET?.length>=32&&(preview||(env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')&&env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET?.length>=32&&env.SHIPPING_RULES_JSON)))}
function shipping(env){if(mode(env)==='preview')return previewShipping;let rules;try{rules=JSON.parse(env.SHIPPING_RULES_JSON)}catch{fail('Delivery rates are not configured.',503)}return {...rules,preview:false}}
async function body(request){const raw=await request.text();if(raw.length>24000)fail('Request is too large.',413);try{return JSON.parse(raw)}catch{fail('Enter valid request data.')}}
async function catalogue(env){return (await all(env,'SELECT * FROM products')).map(p=>({...JSON.parse(p.data),price:p.price_paise>0?p.price_paise/100:null,quantity:p.quantity-p.held,available:p.enabled===1&&p.quantity>p.held}));}
async function expire(env,now){await stmt(env,"UPDATE orders SET status='expired',updated_at=? WHERE status='pending' AND payment_status='pending' AND expires_at<=?",now,now).run();}
async function limit(env,request,scope,max,now){const window=Math.floor(now/600000),key=await digest(scope+':'+(request.headers.get('cf-connecting-ip')||'local')+':'+window);const r=await first(env,'INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',key,window);if(r.count>max)fail('Too many requests. Please try again in a few minutes.',429)}
async function requireTracking(env,request,id){const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!env.TRACKING_SECRET||!equalSecret(token,await tokenFor(env,id)))fail('This tracking link is unavailable.',404);const order=await first(env,'SELECT * FROM orders WHERE id=?',id);if(!order)fail('This tracking link is unavailable.',404);return order;}
async function isAdmin(env,request,now){if((env.ADMIN_SECRET?.length||0)<32)return false;const bearer=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(bearer&&equalSecret(bearer,env.ADMIN_SECRET))return true;const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)dd_owner=([^;]+)/)?.[1];if(!cookie)return false;const [expiry,mac]=cookie.split('.');return /^\d+$/.test(expiry)&&Number(expiry)>now&&Number(expiry)<=now+3600000&&equalSecret(mac,await hmac(env.ADMIN_SECRET,'owner:'+expiry));}
async function requireAdmin(env,request,now){if(!await isAdmin(env,request,now))fail('Owner sign-in is required.',401)}
async function publicOrder(env,o){const n=await first(env,"SELECT status FROM notifications WHERE order_id=? AND kind='confirmation'",o.id);return {id:o.id,ref:o.ref,mode:o.mode,status:o.status,paymentStatus:o.payment_status,notificationStatus:!o.consent?'not_requested':o.mode==='preview'?'preview':n?.status||'pending',lines:JSON.parse(o.lines),subtotalPaise:o.subtotal_paise,feePaise:o.shipping_paise,totalPaise:o.total_paise,deliveryLabel:o.delivery_label,events:(await all(env,'SELECT status,at FROM order_events WHERE order_id=? ORDER BY at',o.id)).map(e=>({...e,at:new Date(e.at).toISOString()})),createdAt:new Date(o.created_at).toISOString()};}
async function sessionFor(env,o){if(o.status!=='pending')return {id:o.id,token:await tokenFor(env,o.id),provider:o.mode==='preview'?'preview':'razorpay',status:o.status,amount:o.total_paise};if(o.mode!=='preview'&&!o.gateway_order_id)fail('Payment setup is pending. Keep this bag and try again after the payment window expires.',409);return {id:o.id,token:await tokenFor(env,o.id),provider:o.mode==='preview'?'preview':'razorpay',keyId:env.RAZORPAY_KEY_ID||null,gatewayOrderId:o.gateway_order_id,amount:o.total_paise};}
async function gateway(env,path,init,fetchExternal){const r=await fetchExternal('https://api.razorpay.com/v1/'+path,{...init,signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET),'Content-Type':'application/json',...init?.headers}});let data;try{data=await r.json()}catch{fail('The payment provider is unavailable. Your payment has not been confirmed.',502)}if(!r.ok)fail('The payment provider could not complete this request. Your payment has not been confirmed.',502);return data;}
// The conditional transition and SQL trigger make repeated callbacks harmless.
async function capture(env,o,payment,now){
 if(payment.order_id!==o.gateway_order_id||payment.amount!==o.total_paise||payment.currency!=='INR'||payment.status!=='captured')fail('Payment has not been verified as captured for this order.',409);
 await expire(env,now);
 const current=await first(env,'SELECT * FROM orders WHERE id=?',o.id);
 if(current.payment_status==='captured'){if(current.payment_id!==payment.id)fail('Another payment already belongs to this order.',409);return;}
 if(['expired','cancelled','payment_review'].includes(current.status)){
  if(current.payment_id&&current.payment_id!==payment.id)fail('Another payment already belongs to this order.',409);
  await stmt(env,"UPDATE orders SET status='payment_review',payment_status='captured_unallocated',payment_id=?,updated_at=? WHERE id=? AND payment_status IN('pending','captured_unallocated')",payment.id,now,o.id).run();return;
 }
 await env.DB.batch([
  stmt(env,"UPDATE orders SET payment_status='captured',payment_id=?,status='confirmed',updated_at=? WHERE id=? AND payment_status='pending' AND status='pending'",payment.id,now,o.id),
  stmt(env,"INSERT OR IGNORE INTO order_events(order_id,status,at) SELECT id,'confirmed',? FROM orders WHERE id=? AND status='confirmed'",now,o.id),
  stmt(env,"INSERT OR IGNORE INTO notifications(id,order_id,kind) SELECT ?,id,'confirmation' FROM orders WHERE id=? AND status='confirmed' AND consent=1",crypto.randomUUID(),o.id)
 ]);
}
export function createHandler({fetchExternal=(...a)=>fetch(...a),now=()=>Date.now()}={}){
 return async function handle(request,env,ctx={waitUntil:()=>{}}){
  const url=new URL(request.url),path=url.pathname,time=now();
  try{
   if(path==='/commerce-config.mjs')return new Response("export const commerceConfig={mode:'api',apiBase:''};",{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
   if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
   if(!env.DB)fail('Checkout storage is not configured.',503);
   // Same-origin JSON requests only. Provider callbacks use their own signatures.
   const isWebhook=path.startsWith('/api/webhooks/');
   if(!isWebhook&&request.method!=='GET'){
    if(request.headers.get('Origin')!==env.PUBLIC_ORIGIN||url.origin!==env.PUBLIC_ORIGIN)fail('Request origin is not allowed.',403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON requests are required.',415);
   }
   if(mode(env)==='preview'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))fail('Server payment simulation is local-only.',503);
   if(!['sandbox','preview'].includes(mode(env)))fail('Live payments are not enabled in this release.',503);
   if(path==='/api/config'&&request.method==='GET')return json({mode:mode(env),provider:mode(env)==='preview'?'preview':'razorpay',ready:readiness(env),shippingConfigured:!!env.SHIPPING_RULES_JSON||mode(env)==='preview',courierConnected:!!env.COURIER_WEBHOOK_SECRET,whatsappConnected:!!(env.WHATSAPP_ACCESS_TOKEN&&env.ALLOW_SANDBOX_MESSAGES==='true')});
   if(path==='/api/catalogue'&&request.method==='GET'){await expire(env,time);return json({products:await catalogue(env)})}
   if(path==='/api/checkout/quote'&&request.method==='POST'){
    if(!readiness(env))fail('Merchant test keys and delivery setup are not connected yet.',503);
    await limit(env,request,'quote',60,time);await expire(env,time);const b=await body(request),q=quoteCheckout(await catalogue(env),b.basket,String(b.postcode),shipping(env)),id=crypto.randomUUID();
    await stmt(env,'INSERT INTO quotes(id,data,expires_at) VALUES(?,?,?)',id,JSON.stringify(q),time+600000).run();return json({...q,quoteId:id,expiresAt:new Date(time+600000).toISOString()});
   }
   if(path==='/api/orders'&&request.method==='POST'){
    if(!readiness(env))fail('Merchant test keys and delivery setup are not connected yet.',503);
    await limit(env,request,'order',20,time);await expire(env,time);const b=await body(request),a=validateAddress(b.address);
    if(!/^[a-zA-Z0-9-]{20,80}$/.test(b.requestId||'')||typeof b.whatsappConsent!=='boolean')fail('Restart checkout and try again.');
    const requestHash=await digest(JSON.stringify({quoteId:b.quoteId,basket:b.basket,address:a,consent:b.whatsappConsent}));
    const existing=await first(env,'SELECT * FROM orders WHERE request_id=?',b.requestId);if(existing){if(!equalSecret(requestHash,existing.request_hash))fail('This checkout request has changed. Restart checkout.',409);return json(await sessionFor(env,existing));}
    const saved=await first(env,'SELECT * FROM quotes WHERE id=?',b.quoteId||'');if(!saved||saved.expires_at<=time)fail('Delivery quote expired. Review your address and total again.',409);
    const quoted=JSON.parse(saved.data);let q;try{q=quoteCheckout(await catalogue(env),b.basket,a.postcode,shipping(env))}catch(e){fail(e.message,409)}if(quoteFingerprint(q)!==quoteFingerprint(quoted))fail('Prices, delivery or your bag changed. Review your total again.',409);
    const id=crypto.randomUUID(),ref='DD-TEST-'+id.replace(/-/g,'').slice(0,12).toUpperCase();
    try{await env.DB.batch([
     stmt(env,'INSERT INTO orders(id,ref,request_id,request_hash,quote_id,customer,consent,lines,subtotal_paise,shipping_paise,total_paise,delivery_label,mode,created_at,expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,ref,b.requestId,requestHash,b.quoteId,JSON.stringify(mode(env)==='preview'?{name:'Demo Customer',phone:'919999999999',line1:'12 Example Avenue',line2:'',city:'Pune',state:'Maharashtra',postcode:'411001',country:'IN'}:a),b.whatsappConsent?1:0,JSON.stringify(q.lines),q.subtotalPaise,q.feePaise,q.totalPaise,q.deliveryLabel||'Delivery',mode(env),time,time+900000,time),
     ...q.lines.map(l=>stmt(env,'INSERT INTO order_lines(order_id,product_id,qty,unit_paise) VALUES(?,?,?,?)',id,l.id,l.qty,l.unitPaise))
    ])}catch{
     const repeated=await first(env,'SELECT * FROM orders WHERE request_id=?',b.requestId);if(repeated&&equalSecret(repeated.request_hash,requestHash))return json(await sessionFor(env,repeated));
     fail('Stock or checkout changed. Refresh your bag and review the order again.',409);
    }
    if(mode(env)==='sandbox'){
     // Never create another gateway order on an ambiguous network timeout. The hold expires safely.
     let created;try{created=await gateway(env,'orders',{method:'POST',body:JSON.stringify({amount:q.totalPaise,currency:'INR',receipt:ref})},fetchExternal)}catch(e){throw e}
     if(!created.id||created.amount!==q.totalPaise||created.currency!=='INR')fail('Payment provider returned an unexpected order. No order is confirmed.',502);
     await stmt(env,'UPDATE orders SET gateway_order_id=?,updated_at=? WHERE id=?',created.id,time,id).run();
    }
    return json(await sessionFor(env,await first(env,'SELECT * FROM orders WHERE id=?',id)),201);
   }
   const match=path.match(/^\/api\/orders\/([a-zA-Z0-9-]+)(?:\/(verify|preview-payment))?$/);
   if(match){await limit(env,request,'track',120,time);await expire(env,time);const o=await requireTracking(env,request,match[1]);
    if(request.method==='GET'&&!match[2])return json(await publicOrder(env,o));
    if(request.method==='POST'&&match[2]==='preview-payment'){
     if(mode(env)!=='preview')fail('Payment simulation is disabled.',403);const b=await body(request);if(b.outcome!=='success')return json({status:'pending'});
     const simulated={...o,gateway_order_id:'preview-'+o.id};await capture(env,simulated,{id:'preview-payment-'+o.id,order_id:simulated.gateway_order_id,amount:o.total_paise,currency:'INR',status:'captured'},time);return json({status:(await first(env,'SELECT status FROM orders WHERE id=?',o.id)).status});
    }
    if(request.method==='POST'&&match[2]==='verify'){
     if(mode(env)!=='sandbox'||!env.RAZORPAY_KEY_SECRET)fail('Razorpay verification is not configured.',503);const b=await body(request);
     if(!/^pay_[a-zA-Z0-9]+$/.test(b.razorpay_payment_id||'')||b.razorpay_order_id!==o.gateway_order_id||!equalSecret(b.razorpay_signature,await hmac(env.RAZORPAY_KEY_SECRET,o.gateway_order_id+'|'+b.razorpay_payment_id)))fail('Payment signature could not be verified.',400);
     const p=await gateway(env,'payments/'+b.razorpay_payment_id,{method:'GET'},fetchExternal);if(p.id!==b.razorpay_payment_id)fail('Payment ID mismatch.',409);await capture(env,o,p,time);ctx.waitUntil(dispatchNotifications(env,{fetchExternal,now:time}));return json({status:(await first(env,'SELECT status FROM orders WHERE id=?',o.id)).status});
    }
   }
   if(path==='/api/webhooks/razorpay'&&request.method==='POST'){
    if(mode(env)!=='sandbox'||!env.RAZORPAY_WEBHOOK_SECRET)fail('Webhook is not configured.',503);const raw=await request.text();if(raw.length>200000)fail('Webhook is too large.',413);
    if(!equalSecret(request.headers.get('X-Razorpay-Signature'),await hmac(env.RAZORPAY_WEBHOOK_SECRET,raw)))fail('Invalid webhook signature.',401);
    const eventId=request.headers.get('x-razorpay-event-id');if(!eventId||eventId.length>200)fail('Missing webhook event ID.');if(await first(env,"SELECT event_id FROM webhook_receipts WHERE provider='razorpay' AND event_id=?",eventId))return json({received:true});
    let b;try{b=JSON.parse(raw)}catch{fail('Invalid webhook JSON.')};if(b.event==='payment.captured'||b.event==='order.paid'){
     const p=b.payload?.payment?.entity;if(!p?.id||!p.order_id)fail('Missing payment entity.');const o=await first(env,'SELECT * FROM orders WHERE gateway_order_id=?',p.order_id);
     if(!o)fail('Order is not available yet. Retry this callback.',409);await capture(env,o,p,time);
    }
    await stmt(env,"INSERT OR IGNORE INTO webhook_receipts(provider,event_id,at) VALUES('razorpay',?,?)",eventId,time).run();ctx.waitUntil(dispatchNotifications(env,{fetchExternal,now:time}));return json({received:true});
   }
   if(path==='/api/webhooks/courier'&&request.method==='POST'){
    if(!env.COURIER_WEBHOOK_SECRET||env.COURIER_WEBHOOK_SECRET.length<32)fail('Courier bridge is not configured.',503);const raw=await request.text();if(raw.length>24000)fail('Webhook is too large.',413);if(!equalSecret(request.headers.get('X-Drip-Signature'),await hmac(env.COURIER_WEBHOOK_SECRET,raw)))fail('Invalid courier signature.',401);
    let b;try{b=JSON.parse(raw)}catch{fail('Invalid webhook JSON.')};if(!/^[a-zA-Z0-9_-]{1,160}$/.test(b.eventId||''))fail('Missing courier event ID.');const o=await first(env,'SELECT * FROM orders WHERE shipment_id=?',b.shipmentId||'');if(!o)fail('Shipment is not linked to an order.',404);if(o.payment_status!=='captured')fail('Order payment is not confirmed.',409);
    const from=stages.indexOf(o.status),to=stages.indexOf(b.status);if(to<2||from<1)fail('Pack the confirmed order before courier updates.',409);
    // Couriers may skip or repeat events. Move forward only; preserve actual reported stages.
    await env.DB.batch([stmt(env,'UPDATE orders SET status=?,updated_at=? WHERE id=? AND status IN('+stages.slice(1,to).map(()=>'?').join(',')+')',b.status,time,o.id,...stages.slice(1,to)),stmt(env,'INSERT OR IGNORE INTO order_events(order_id,status,at) SELECT id,?,? FROM orders WHERE id=? AND status=?',b.status,time,o.id,b.status),stmt(env,"INSERT OR IGNORE INTO webhook_receipts(provider,event_id,at) VALUES('courier',?,?)",b.eventId,time)]);return json({received:true});
   }
   if(path==='/api/admin/login'&&request.method==='POST'){
    await limit(env,request,'login',5,time);const b=await body(request);if(env.ADMIN_SECRET?.length<32||!equalSecret(b.token,env.ADMIN_SECRET))fail('Owner access key is incorrect.',401);const expiry=String(time+3600000),mac=await hmac(env.ADMIN_SECRET,'owner:'+expiry);return json({signedIn:true},200,{'Set-Cookie':`dd_owner=${expiry}.${mac}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=3600${url.protocol==='https:'?'; Secure':''}`});
   }
   if(path==='/api/admin/logout'&&request.method==='POST')return json({signedIn:false},200,{'Set-Cookie':`dd_owner=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${url.protocol==='https:'?'; Secure':''}`});
   if(path==='/api/admin/orders'&&request.method==='GET'){await requireAdmin(env,request,time);await expire(env,time);return json({orders:await all(env,'SELECT id,ref,status,payment_status,total_paise AS totalPaise,customer FROM orders ORDER BY created_at DESC LIMIT 100').then(rows=>rows.map(o=>({...o,customer:JSON.parse(o.customer)})))})}
   const admin=path.match(/^\/api\/admin\/orders\/([a-zA-Z0-9-]+)\/status$/);
   if(admin&&request.method==='POST'){
    await requireAdmin(env,request,time);const b=await body(request),o=await first(env,'SELECT * FROM orders WHERE id=?',admin[1]);if(!o||o.status!=='confirmed'||o.payment_status!=='captured'||b.status!=='packed')fail('Only confirmed, paid orders can be marked packed.',409);
    if(b.shipmentId&&!/^[a-zA-Z0-9_-]{1,100}$/.test(b.shipmentId))fail('Invalid shipment ID.');await env.DB.batch([stmt(env,"UPDATE orders SET status='packed',shipment_id=?,updated_at=? WHERE id=? AND status='confirmed'",b.shipmentId||null,time,o.id),stmt(env,"INSERT OR IGNORE INTO order_events(order_id,status,at) VALUES(?,'packed',?)",o.id,time)]);return json({status:'packed'});
   }
   if(path==='/api/webhooks/whatsapp'&&request.method==='GET'){
    if(!env.WHATSAPP_VERIFY_TOKEN||!equalSecret(url.searchParams.get('hub.verify_token'),env.WHATSAPP_VERIFY_TOKEN)||url.searchParams.get('hub.mode')!=='subscribe')fail('Webhook verification failed.',403);return new Response(url.searchParams.get('hub.challenge')||'',{headers:{'Content-Type':'text/plain'}});
   }
   if(path==='/api/webhooks/whatsapp'&&request.method==='POST'){
    if(!env.WHATSAPP_APP_SECRET)fail('WhatsApp webhook is not configured.',503);const raw=await request.text();if(raw.length>200000)fail('Webhook is too large.',413);if(!equalSecret(request.headers.get('X-Hub-Signature-256'),'sha256='+await hmac(env.WHATSAPP_APP_SECRET,raw)))fail('Invalid WhatsApp signature.',401);let b;try{b=JSON.parse(raw)}catch{fail('Invalid webhook JSON.')};
    for(const entry of b.entry||[])for(const change of entry.changes||[])for(const s of change.value?.statuses||[]){if(['delivered','read'].includes(s.status))await stmt(env,"UPDATE notifications SET status='delivered' WHERE message_id=?",s.id).run();else if(s.status==='failed')await stmt(env,"UPDATE notifications SET status='failed',last_error='Delivery failed' WHERE message_id=? AND status!='delivered'",s.id).run();}return json({received:true});
   }
   return json({error:'Endpoint not found.'},404);
  }catch(e){const status=e.status||(/D1|SQLITE|constraint|no such|database/i.test(String(e.message))?500:400);return json({error:status>=500?'Checkout service is unavailable or not configured. Please try again later.':e.message},status)}
 };
}
export async function dispatchNotifications(env,{fetchExternal=(...a)=>fetch(...a),now=Date.now()}={}){
 // An opt-in and explicit sandbox-send switch are both required. Default sandbox sends nothing.
 if(mode(env)!=='sandbox'||env.ALLOW_SANDBOX_MESSAGES!=='true'||!env.WHATSAPP_ACCESS_TOKEN||!env.WHATSAPP_PHONE_ID||!/^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION||'')||!env.WHATSAPP_TEMPLATE)return;
 const pending=await all(env,"SELECT n.*,o.ref,o.total_paise,o.customer FROM notifications n JOIN orders o ON o.id=n.order_id WHERE n.status IN('pending','retry') AND n.attempts<5 AND n.next_attempt_at<=? AND n.lease_until<=? AND o.status IN('confirmed','packed','shipped','delivered') AND o.consent=1 LIMIT 10",now,now);
 for(const n of pending){const lease=await stmt(env,"UPDATE notifications SET lease_until=?,attempts=attempts+1 WHERE id=? AND lease_until<=? AND status IN('pending','retry')",now+120000,n.id,now).run();if(!lease.meta.changes)continue;
  const customer=JSON.parse(n.customer),tracking=env.PUBLIC_ORIGIN+'/#track/'+n.order_id+'/'+await tokenFor(env,n.order_id);
  try{const r=await fetchExternal(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_ID}/messages`,{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:customer.phone,type:'template',template:{name:env.WHATSAPP_TEMPLATE,language:{code:env.WHATSAPP_LANGUAGE||'en'},components:[{type:'body',parameters:[{type:'text',text:n.ref},{type:'text',text:'INR '+(n.total_paise/100).toFixed(2)},{type:'text',text:tracking}]}]}})});const data=await r.json();if(!r.ok||!data.messages?.[0]?.id)throw Error('Provider rejected the template');await stmt(env,"UPDATE notifications SET status='submitted',message_id=?,last_error=NULL,lease_until=0 WHERE id=?",data.messages[0].id,n.id).run();
  }catch{await stmt(env,"UPDATE notifications SET status=?,last_error='Provider request failed',next_attempt_at=?,lease_until=0 WHERE id=?",n.attempts+1>=5?'failed':'retry',now+Math.min(3600000,60000*2**n.attempts),n.id).run();}
 }
}
const handler=createHandler();
export default {fetch:handler,async scheduled(_event,env,ctx){const now=Date.now();await expire(env,now);await stmt(env,'DELETE FROM rate_limits WHERE window<?',Math.floor(now/600000)-2).run();await stmt(env,'DELETE FROM quotes WHERE expires_at<? AND id NOT IN(SELECT quote_id FROM orders)',now-86400000).run();ctx.waitUntil(dispatchNotifications(env,{now}));}};
