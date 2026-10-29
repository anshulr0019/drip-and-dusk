import {shipmentFields,aftercareFields,orderFilter} from './owner-operations.mjs';
import {deliveryRules} from '../dist/store-settings.mjs';
import {orderRows,ordersCSV} from '../dist/owner-model.mjs';
import {paymentOptions,choosePaymentMethod,razorpayReady,merchantUPI,isLive,samplePayment} from './payment-options.mjs';
import {visitorId,backendIP} from './traffic.mjs';
import {prepareProduct,prepareSettings} from './catalogue.mjs';
import {recommendScents} from '../dist/scent-matching.mjs';
import {processNotes} from '../dist/fragrance-notes.mjs';
import {createAuthService,authReady} from './auth.mjs';
import {alertsConfigured,sendOwnerAlert,queueOwnerAlert} from './owner-alerts.mjs';
import {storeImage,serveImage} from './media.mjs';
import {quoteCheckout,quoteFingerprint,validateAddress,previewShipping,stages} from '../dist/commerce-model.mjs';
const encoder=new TextEncoder(),json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...headers}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export async function hmac(secret,message){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const stmt=(env,sql,...args)=>env.DB.prepare(sql).bind(...args),first=(env,sql,...args)=>stmt(env,sql,...args).first(),all=async(env,sql,...args)=>(await stmt(env,sql,...args).all()).results;
const tokenFor=(env,id)=>hmac(env.TRACKING_SECRET,'tracking:'+id);
const mode=env=>env.COMMERCE_MODE||'sandbox';
const manual=env=>mode(env)==='manual_demo';
// Test profiles replace personal details with a fixed sample before persisting; live stores what the customer entered.
const samplesCustomer=env=>mode(env)==='preview'||manual(env);
const gatewayOrder=o=>['sandbox','live'].includes(o.mode);
// Once a customer submits a UPI reference on a live order, the stock stays held long enough for the owner to check the bank. Test orders keep their 30-minute hold.
const VERIFICATION_HOLD_MS=24*3600000;
// The mode stored on a new order; the summary uses it to show only the current mode's orders.
const orderModeFor=(env,method)=>isLive(env)?'live':method==='manual_upi'?'manual_demo':mode(env)==='preview'?'preview':'sandbox';
const currentOrderModes=env=>[...new Set(['manual_upi','razorpay'].map(m=>orderModeFor(env,m)))];
const ownerAuthReady=env=>env.AUTH_PROVIDER==='supabase'?(authReady(env)&&!!env.AUTH_OWNER_IDS?.trim()):env.ADMIN_SECRET?.length>=32;
function readiness(env){const preview=mode(env)==='preview';if(manual(env))return env.TRACKING_SECRET?.length>=32;if(isLive(env))return !!(env.TRACKING_SECRET?.length>=32&&ownerAuthReady(env)&&paymentOptions(env).some(p=>p.available));if(!['preview','sandbox'].includes(mode(env)))return false;return !!(env.TRACKING_SECRET?.length>=32&&ownerAuthReady(env)&&(preview||(env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')&&env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET?.length>=32&&env.SHIPPING_RULES_JSON)))}
async function shipping(env){const business=await settings(env);if(business?.delivery)return deliveryRules(business,samplesCustomer(env));if(samplesCustomer(env))return previewShipping;if(isLive(env)&&!env.SHIPPING_RULES_JSON)return deliveryRules({},false);let rules;try{rules=JSON.parse(env.SHIPPING_RULES_JSON)}catch{fail('Delivery rates are not configured.',503)}return {...rules,preview:false}}
async function body(request,max=24000){const raw=await request.text();if(raw.length>max)fail('Request is too large.',413);try{return JSON.parse(raw)}catch{fail('Enter valid request data.')}}
async function catalogue(env,owner=false){return (await all(env,'SELECT * FROM products')).map(p=>{const data=JSON.parse(p.data),profile=data.finderVerified===true?processNotes(data):{};return {...data,...profile,revision:p.revision||1,price:p.price_paise>0?p.price_paise/100:null,quantity:owner?p.quantity:p.quantity-p.held,held:owner?p.held:undefined,available:owner?data.available===true:p.enabled===1&&p.quantity>p.held};}).filter(p=>owner||!p.hidden&&!p.archived);}
async function settings(env){const row=await first(env,'SELECT * FROM store_settings WHERE id=1');return row?{...JSON.parse(row.data),revision:row.revision}:null;}
// Public, cookie-free reads may be shared briefly by the Vercel edge. Checkout always revalidates stock and prices.
const edgeCache=seconds=>({'Cache-Control':'public, max-age=0, must-revalidate','CDN-Cache-Control':`public, max-age=${seconds}, stale-while-revalidate=${seconds*5}`});
const snapshots=new WeakMap();
const invalidate=env=>snapshots.delete(env.DB);
async function publicSnapshot(env,time){
 const existing=snapshots.get(env.DB);if(existing&&existing.until>time)return existing.promise;
 const entry={until:time+5000};entry.promise=(async()=>{await expire(env,time);const [products,business]=await Promise.all([catalogue(env),settings(env)]);return {products,settings:business};})();snapshots.set(env.DB,entry);
 try{return await entry.promise}catch(e){if(snapshots.get(env.DB)===entry)snapshots.delete(env.DB);throw e;}
}
async function expire(env,now){const result=await stmt(env,"UPDATE orders SET status='expired',updated_at=? WHERE status IN('pending','awaiting_verification') AND payment_status='pending' AND expires_at<=?",now,now).run();if(result.meta.changes)invalidate(env);}
async function limit(env,request,scope,max,now){
 const window=Math.floor(now/600000),visitor=await visitorId(request,env,now),ip=backendIP(request);
 const keys=[['origin:'+scope+':'+ip,scope==='track'?5000:1000],[scope+':'+(visitor?'visitor:'+visitor:'ip:'+ip),max]];
 for(const [bucket,cap] of keys){const key=await digest(bucket+':'+window),r=await first(env,'INSERT INTO rate_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',key,window);if(r.count>cap)fail('Too many requests. Please try again in a few minutes.',429);}
}
async function requireTracking(env,request,id){const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(!env.TRACKING_SECRET||!equalSecret(token,await tokenFor(env,id)))fail('This tracking link is unavailable.',404);const order=await first(env,'SELECT * FROM orders WHERE id=?',id);if(!order)fail('This tracking link is unavailable.',404);return order;}
async function isAdmin(env,request,now){if((env.ADMIN_SECRET?.length||0)<32)return false;const bearer=request.headers.get('Authorization')?.replace(/^Bearer /,'');if(bearer&&equalSecret(bearer,env.ADMIN_SECRET))return true;const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)dd_owner=([^;]+)/)?.[1];if(!cookie)return false;const [expiry,mac]=cookie.split('.');return /^\d+$/.test(expiry)&&Number(expiry)>now&&Number(expiry)<=now+3600000&&equalSecret(mac,await hmac(env.ADMIN_SECRET,'owner:'+expiry));}
async function requireAdmin(env,request,now){if(!await isAdmin(env,request,now))fail('Owner sign-in is required.',401)}
async function publicOrder(env,o){const n=await first(env,"SELECT status FROM notifications WHERE order_id=? AND kind='confirmation'",o.id);return {id:o.id,ref:o.ref,mode:o.mode,status:o.status,paymentStatus:o.payment_status,paymentMethod:o.payment_method,shipment:{courier:o.courier_name||'',awb:o.shipment_id||'',trackingUrl:o.tracking_url||''},expiresAt:new Date(o.expires_at).toISOString(),payment:o.payment_method==='manual_upi'?(o.mode==='manual_demo'?samplePayment:merchantUPI(env)||undefined):undefined,notificationStatus:o.payment_method==='manual_upi'?'manual':!o.consent?'not_requested':o.mode==='preview'?'preview':n?.status||'pending',lines:JSON.parse(o.lines),subtotalPaise:o.subtotal_paise,feePaise:o.shipping_paise,totalPaise:o.total_paise,deliveryLabel:o.delivery_label,events:(await all(env,'SELECT status,at FROM order_events WHERE order_id=? ORDER BY at',o.id)).map(e=>({...e,at:new Date(e.at).toISOString()})),createdAt:new Date(o.created_at).toISOString()};}
async function sessionFor(env,o){
 const result={id:o.id,ref:o.ref,token:await tokenFor(env,o.id),provider:o.payment_method==='manual_upi'?'manual_upi':o.mode==='preview'?'preview':'razorpay',status:o.status,amount:o.total_paise};
 if(o.payment_method==='manual_upi')return {...result,payment:o.mode==='manual_demo'?samplePayment:merchantUPI(env)||undefined};
 if(o.status!=='pending')return result;
 if(o.mode!=='preview'&&!o.gateway_order_id)fail('Payment setup is pending. Keep this bag and try again after the payment window expires.',409);
 return {...result,keyId:env.RAZORPAY_KEY_ID||null,gatewayOrderId:o.gateway_order_id};
}
async function gateway(env,path,init,fetchExternal){const r=await fetchExternal('https://api.razorpay.com/v1/'+path,{...init,signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET),'Content-Type':'application/json',...init?.headers}});let data;try{data=await r.json()}catch{fail('The payment provider is unavailable. Your payment has not been confirmed.',502)}if(!r.ok)fail('The payment provider could not complete this request. Your payment has not been confirmed.',502);return data;}
// The conditional transition and SQL trigger make repeated callbacks harmless.
async function capture(env,o,payment,now){
 if(o.payment_method!=='razorpay')fail('This order does not use Razorpay.',409);
 if(payment.order_id!==o.gateway_order_id||payment.amount!==o.total_paise||payment.currency!=='INR'||payment.status!=='captured')fail('Payment has not been verified as captured for this order.',409);
 await expire(env,now);
 const current=await first(env,'SELECT * FROM orders WHERE id=?',o.id);
 if(current.payment_status==='captured'){if(current.payment_id!==payment.id)fail('Another payment already belongs to this order.',409);return null;}
 if(['expired','cancelled','payment_review'].includes(current.status)){
  if(current.payment_id&&current.payment_id!==payment.id)fail('Another payment already belongs to this order.',409);
  const review=await stmt(env,"UPDATE orders SET status='payment_review',payment_status='captured_unallocated',payment_id=?,updated_at=? WHERE id=? AND payment_status='pending'",payment.id,now,o.id).run();return review.meta.changes?'review':null;
 }
 // Returns what changed ('confirmed' or 'review') the first time only, so repeated callbacks send one owner alert.
 const results=await env.DB.batch([
  stmt(env,"UPDATE orders SET payment_status='captured',payment_id=?,status='confirmed',updated_at=? WHERE id=? AND payment_status='pending' AND status='pending'",payment.id,now,o.id),
  stmt(env,"INSERT OR IGNORE INTO order_events(order_id,status,at) SELECT id,'confirmed',? FROM orders WHERE id=? AND status='confirmed'",now,o.id),
  stmt(env,"INSERT OR IGNORE INTO notifications(id,order_id,kind) SELECT ?,id,'confirmation' FROM orders WHERE id=? AND status='confirmed' AND consent=1",crypto.randomUUID(),o.id)
  ]);invalidate(env);return results[0].meta.changes?'confirmed':null;
}
export function createHandler({fetchExternal=(...a)=>fetch(...a),now=()=>Date.now()}={}){
 const auth=createAuthService({fetchExternal,now});
 async function requireOwner(env,request,time){if(auth.configured(env)){const user=await auth.session(request,env);if(user?.role!=='owner')fail('Owner sign-in is required.',403);return user.id;}else {await requireAdmin(env,request,time);return 'owner-key';}}
 return async function handle(request,env,ctx={waitUntil:()=>{}}){
  const url=new URL(request.url),path=url.pathname,time=now();
  try{
   if(path==='/commerce-config.mjs')return new Response("export const commerceConfig={mode:'api',apiBase:''};",{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
   // Clean policy URLs map to their static pages, matching the Vercel routes.
   const policy=path.match(/^\/(privacy|terms|refunds|shipping|contact)\/?$/);
   if(path.startsWith('/media/')&&request.method==='GET')return await serveImage(env,path);
   if(!path.startsWith('/api/'))return env.ASSETS.fetch(policy?new Request(new URL('/policies/'+policy[1]+'.html',url),request):request);
   if(!env.DB)fail('Checkout storage is not configured.',503);
   // Browser writes must originate on the storefront. A configured backend origin
   // supports same-origin reverse proxies without trusting forwarded host headers.
   const isWebhook=path.startsWith('/api/webhooks/');
   if(!isWebhook&&request.method!=='GET'){
    if(request.headers.get('Origin')!==env.PUBLIC_ORIGIN||![env.PUBLIC_ORIGIN,env.BACKEND_ORIGIN].includes(url.origin))fail('Request origin is not allowed.',403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON requests are required.',415);
   }
   if(mode(env)==='preview'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))fail('Server payment simulation is local-only.',503);
   if(!['sandbox','preview','manual_demo','live'].includes(mode(env)))fail('Checkout is not configured.',503);
   const authResponse=await auth.handle(request,env);if(authResponse)return authResponse;
   if(path==='/api/account/orders'&&request.method==='GET'){const user=await auth.session(request,env);if(!user)fail('Sign in to view your orders.',401);const rows=await all(env,'SELECT * FROM orders WHERE customer_user_id=? ORDER BY created_at DESC LIMIT 100',user.id);return json({orders:await Promise.all(rows.map(async o=>({...await publicOrder(env,o),trackingPath:'#track/'+o.id+'/'+await tokenFor(env,o.id)})))});}
   if(path==='/api/config'&&request.method==='GET')return json({mode:mode(env),provider:mode(env)==='preview'?'preview':paymentOptions(env).find(p=>p.available)?.id||(manual(env)?'manual_upi':'razorpay'),payment:merchantUPI(env)||undefined,ready:readiness(env),paymentOptions:paymentOptions(env),customerFeePaise:0,shippingConfigured:!!env.SHIPPING_RULES_JSON||samplesCustomer(env),courierConnected:!!env.COURIER_WEBHOOK_SECRET,whatsappConnected:!!(env.WHATSAPP_ACCESS_TOKEN&&env.ALLOW_SANDBOX_MESSAGES==='true')},200,edgeCache(30));
   if(path==='/api/catalogue'&&request.method==='GET')return json(await publicSnapshot(env,time),200,edgeCache(5));
   if(path==='/api/scent-matches'&&request.method==='POST'){await limit(env,request,'finder',120,time);const b=await body(request);return json({matches:recommendScents((await publicSnapshot(env,time)).products,b.answers)});}
   if(path==='/api/admin/summary'&&request.method==='GET'){
    await requireOwner(env,request,time);await expire(env,time);
    // "Today" starts at midnight India time.
    const today=Math.floor((time+19800000)/86400000)*86400000-19800000;
    // Only the current mode's orders count, so test orders never inflate live figures (or the reverse).
    const modes=currentOrderModes(env),marks=modes.map(()=>'?').join(',');
    const counts=await first(env,"SELECT COALESCE(SUM(status='awaiting_verification'),0) verify,COALESCE(SUM(status='pending' AND payment_method='manual_upi'),0) unpaid,COALESCE(SUM(status='confirmed'),0) toPack,COALESCE(SUM(status='packed'),0) toShip,COALESCE(SUM(status='payment_review'),0) review,COALESCE(SUM(return_status='requested'),0) returnsOpen FROM orders WHERE mode IN("+marks+")",...modes);
    const sales=await first(env,"SELECT COUNT(*) paidToday,COALESCE(SUM(o.total_paise),0) salesTodayPaise FROM orders o JOIN order_events e ON e.order_id=o.id AND e.status='confirmed' WHERE e.at>=? AND o.payment_status='captured' AND o.mode IN("+marks+")",today,...modes);
    const shipped=await first(env,"SELECT COUNT(*) shippedToday FROM order_events e JOIN orders o ON o.id=e.order_id WHERE e.status='shipped' AND e.at>=? AND o.mode IN("+marks+")",today,...modes);
    return json({...counts,...sales,...shipped,alertsConfigured:alertsConfigured(env),photoStorage:!!env.MEDIA});
   }
   if(path==='/api/admin/alerts/test'&&request.method==='POST'){
    await requireOwner(env,request,time);if(!alertsConfigured(env))fail('Telegram alerts are not set up yet. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to the server.',503);
    try{await sendOwnerAlert(env,'test',null,fetchExternal)}catch{fail('Telegram did not accept the message. Check the bot token and chat ID.',502)}
    return json({sent:true});
   }
   if(path==='/api/admin/images'&&request.method==='POST'){
    await requireOwner(env,request,time);const b=await body(request,2100000);return json({image:await storeImage(env,b.image)},201);
   }
   if(path==='/api/admin/products'&&request.method==='PUT'){
    // Bulk price and stock edits from the owner's spreadsheet view. Every row is validated before any is saved.
    await requireOwner(env,request,time);await expire(env,time);const b=await body(request,200000);
    if(!Array.isArray(b.changes)||!b.changes.length||b.changes.length>300)fail('Send between 1 and 300 changes.');
    const ids=b.changes.map(c=>String(c?.id||''));if(new Set(ids).size!==ids.length)fail('Each fragrance can appear only once in a bulk edit.');
    const stored=new Map((await all(env,'SELECT * FROM products WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(ids))).map(r=>[r.id,r]));
    const statements=[],conflicts=[];
    for(const change of b.changes){
     const old=stored.get(String(change?.id||''));if(!old)fail('A fragrance in this edit no longer exists. Reload the catalogue.',409);
     if(change.expectedRevision!==old.revision){conflicts.push(old.id);continue;}
     const data=JSON.parse(old.data),merged={...data,price:change.price,reference:change.reference,quantity:change.quantity,available:change.available===true};
     let p;try{p=prepareProduct(merged,{inlineImages:true})}catch(e){fail(`${data.brand} ${data.name} (${data.size??'?'} ml): ${e.message}`)}
     if(p.quantity<old.held)fail(`${data.name}: keep at least ${old.held} units while orders hold them.`,409);
     statements.push(stmt(env,'UPDATE products SET data=?,price_paise=?,quantity=?,enabled=?,revision=revision+1 WHERE id=? AND revision=? AND held<=?',JSON.stringify(p),Math.round((p.price||0)*100),p.quantity,p.available&&!p.enquiryOnly&&!p.hidden&&!p.archived?1:0,p.id,old.revision,p.quantity));
     // A reserve/capture/release trigger can bump the revision between the read above and this batch. If the guarded update then matches nothing, this write violates CHECK(held>=0), which makes D1 roll back the whole batch instead of saving some rows.
     statements.push(stmt(env,'UPDATE products SET held=-1 WHERE id=? AND changes()=0',p.id));
    }
    if(conflicts.length)fail(`${conflicts.length} fragrance${conflicts.length>1?'s':''} changed since you opened this view. Reload and try again; nothing was saved.`,409);
    let results;try{results=await env.DB.batch(statements)}catch(e){if(/CHECK constraint failed/i.test(String(e?.message)))fail('A fragrance changed while saving (an order may have reserved stock). Reload and try again; nothing was saved.',409);throw e}
    invalidate(env);const saved=results.filter((r,i)=>i%2===0&&r.meta.changes).length;
    return json({saved,skipped:b.changes.length-saved,products:await catalogue(env,true)});
   }
   if(path==='/api/admin/products'&&request.method==='GET'){await requireOwner(env,request,time);await expire(env,time);return json({products:await catalogue(env,true)});}
   const productPath=path.match(/^\/api\/admin\/products\/([a-zA-Z0-9-]+)$/);
   if(productPath&&request.method==='PUT'){
    await requireOwner(env,request,time);const b=await body(request,1600000),old=await first(env,'SELECT * FROM products WHERE id=?',productPath[1]);
    // Legacy inline photos stay valid when saved unchanged, so quick edits keep working once R2 is bound; any new inline photo is still refused.
    let storedImage=null;try{storedImage=old?JSON.parse(old.data).image:null}catch{}
    const p=prepareProduct(b.product,{inlineImages:!env.MEDIA||(!!storedImage&&String(b.product?.image||'')===storedImage)});if(p.id!==productPath[1])fail('Product identifier changed.');
    if(old){
     if(b.expectedRevision!==old.revision)fail('This fragrance changed. Reload the catalogue before editing again.',409);
     if(p.quantity<old.held)fail('Stock is reserved by an order. Keep at least '+old.held+' units until those orders are resolved.',409);
     const result=await stmt(env,'UPDATE products SET data=?,price_paise=?,quantity=?,enabled=?,revision=revision+1 WHERE id=? AND revision=? AND held<=?',JSON.stringify(p),Math.round((p.price||0)*100),p.quantity,p.available&&!p.enquiryOnly&&!p.hidden&&!p.archived?1:0,p.id,b.expectedRevision,p.quantity).run();
     if(!result.meta.changes)fail('Catalogue or reservations changed. Reload before saving.',409);
    }else{
     if(b.expectedRevision!==null)fail('This fragrance no longer exists. Reload before saving.',409);
     await stmt(env,'INSERT INTO products(id,data,price_paise,quantity,enabled) VALUES(?,?,?,?,?)',p.id,JSON.stringify(p),Math.round((p.price||0)*100),p.quantity,p.available&&!p.enquiryOnly&&!p.hidden&&!p.archived?1:0).run();
    }
    invalidate(env);return json({products:await catalogue(env,true)});
   }
   if(path==='/api/admin/settings'&&request.method==='PUT'){
    await requireOwner(env,request,time);const b=await body(request,50000),data=prepareSettings(b.settings),old=await settings(env);
    if((old?.revision??null)!==b.expectedRevision)fail('Business settings changed. Reload before saving.',409);
    const result=old?await stmt(env,'UPDATE store_settings SET data=?,revision=revision+1 WHERE id=1 AND revision=?',JSON.stringify(data),b.expectedRevision).run():await stmt(env,'INSERT OR IGNORE INTO store_settings(id,data) VALUES(1,?)',JSON.stringify(data)).run();
    if(!result.meta.changes)fail('Settings changed. Reload before saving.',409);invalidate(env);return json({settings:await settings(env)});
   }
   if(path==='/api/checkout/quote'&&request.method==='POST'){
    if(!readiness(env))fail('Checkout is not available right now. Please try again shortly.',503);
    await limit(env,request,'quote',60,time);await expire(env,time);const b=await body(request),q=quoteCheckout(await catalogue(env),b.basket,String(b.postcode),await shipping(env)),id=crypto.randomUUID();
    await stmt(env,'INSERT INTO quotes(id,data,expires_at) VALUES(?,?,?)',id,JSON.stringify(q),time+600000).run();return json({...q,quoteId:id,expiresAt:new Date(time+600000).toISOString()});
   }
   if(path==='/api/orders'&&request.method==='POST'){
    if(!readiness(env))fail('Checkout is not available right now. Please try again shortly.',503);
    await limit(env,request,'order',20,time);await expire(env,time);const b=await body(request),paymentMethod=choosePaymentMethod(env,b.paymentMethod),a=validateAddress(b.address),account=await auth.session(request,env);
    if(!/^[a-zA-Z0-9-]{20,80}$/.test(b.requestId||'')||typeof b.whatsappConsent!=='boolean')fail('Restart checkout and try again.');
    const requestHash=await digest(JSON.stringify({quoteId:b.quoteId,basket:b.basket,address:a,consent:b.whatsappConsent,customerUserId:account?.id||null,paymentMethod}));
    const existing=await first(env,'SELECT * FROM orders WHERE request_id=?',b.requestId);if(existing){if(!equalSecret(requestHash,existing.request_hash))fail('This checkout request has changed. Restart checkout.',409);return json(await sessionFor(env,existing));}
    const saved=await first(env,'SELECT * FROM quotes WHERE id=?',b.quoteId||'');if(!saved||saved.expires_at<=time)fail('Delivery quote expired. Review your address and total again.',409);
    const quoted=JSON.parse(saved.data);let q;try{q=quoteCheckout(await catalogue(env),b.basket,a.postcode,await shipping(env))}catch(e){fail(e.message,409)}if(quoteFingerprint(q)!==quoteFingerprint(quoted))fail('Prices, delivery or your bag changed. Review your total again.',409);
    const orderMode=orderModeFor(env,paymentMethod);
    const id=crypto.randomUUID(),ref=(orderMode==='live'?'DD-':paymentMethod==='manual_upi'?'DD-DEMO-':'DD-TEST-')+id.replace(/-/g,'').slice(0,12).toUpperCase();
    try{await env.DB.batch([
     stmt(env,'INSERT INTO orders(id,ref,request_id,request_hash,quote_id,customer,consent,lines,subtotal_paise,shipping_paise,total_paise,delivery_label,mode,created_at,expires_at,updated_at,customer_user_id,payment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,ref,b.requestId,requestHash,b.quoteId,JSON.stringify(samplesCustomer(env)?{name:'Demo Customer',phone:'919999999999',line1:'12 Example Avenue',line2:'',city:'Pune',state:'Maharashtra',postcode:'411001',country:'IN'}:a),b.whatsappConsent?1:0,JSON.stringify(q.lines),q.subtotalPaise,q.feePaise,q.totalPaise,q.deliveryLabel||'Delivery',orderMode,time,time+(paymentMethod==='manual_upi'?1800000:900000),time,account?.id||null,paymentMethod),
     ...q.lines.map(l=>stmt(env,'INSERT INTO order_lines(order_id,product_id,qty,unit_paise) VALUES(?,?,?,?)',id,l.id,l.qty,l.unitPaise))
    ])}catch{
     const repeated=await first(env,'SELECT * FROM orders WHERE request_id=?',b.requestId);if(repeated&&equalSecret(repeated.request_hash,requestHash))return json(await sessionFor(env,repeated));
     fail('Stock or checkout changed. Refresh your bag and review the order again.',409);
    }
    invalidate(env);
    if(paymentMethod==='razorpay'&&gatewayOrder({mode:orderMode})){
     // Never create another gateway order on an ambiguous network timeout. The hold expires safely.
     let created;try{created=await gateway(env,'orders',{method:'POST',body:JSON.stringify({amount:q.totalPaise,currency:'INR',receipt:ref})},fetchExternal)}catch(e){throw e}
     if(!/^order_[A-Za-z0-9]+$/.test(created.id||'')||created.amount!==q.totalPaise||created.currency!=='INR')fail('Payment provider returned an unexpected order. No order is confirmed.',502);
     await stmt(env,'UPDATE orders SET gateway_order_id=?,updated_at=? WHERE id=?',created.id,time,id).run();
    }
    const created=await first(env,'SELECT * FROM orders WHERE id=?',id);if(paymentMethod==='manual_upi')queueOwnerAlert(ctx,env,'upi_order',created,fetchExternal);
    return json(await sessionFor(env,created),201);
   }
   const match=path.match(/^\/api\/orders\/([a-zA-Z0-9-]+)(?:\/(verify|preview-payment|payment-submission|payment-session))?$/);
   if(match){await limit(env,request,'track',120,time);await expire(env,time);const o=await requireTracking(env,request,match[1]);
    if(request.method==='GET'&&!match[2])return json(await publicOrder(env,o));
    if(request.method==='GET'&&match[2]==='payment-session'){
     if(o.payment_method!=='razorpay'||!gatewayOrder(o)||!razorpayReady(env))fail('Razorpay is not available for this order right now.',503);
     return json(await sessionFor(env,o));
    }
    if(request.method==='POST'&&match[2]==='payment-submission'){
     if(o.payment_method!=='manual_upi')fail('This order does not use manual UPI.',409);
     const b=await body(request),reference=String(b.reference||'').trim();if(!/^[a-zA-Z0-9-]{6,40}$/.test(reference))fail(o.mode==='manual_demo'?'Enter the sample transaction reference (6–40 letters or digits).':'Enter the UPI transaction reference (UTR) from your payment app.');
     if(o.status==='awaiting_verification')return json({status:o.status});
     if(o.status!=='pending'||o.payment_status!=='pending')fail('This payment window has ended. Contact the seller before paying.',409);
     const r=await env.DB.batch([stmt(env,"UPDATE orders SET status='awaiting_verification',payment_reference=?,updated_at=?,expires_at=MAX(expires_at,?) WHERE id=? AND status='pending'",reference,time,o.mode==='live'?time+VERIFICATION_HOLD_MS:o.expires_at,o.id),stmt(env,"INSERT OR IGNORE INTO order_events(order_id,status,at) SELECT id,'awaiting_verification',? FROM orders WHERE id=? AND status='awaiting_verification'",time,o.id)]);
     // A concurrent submission may have won; alert once, and report an ended window if the order expired meanwhile.
     if(!r[0].meta.changes){const cur=await first(env,'SELECT status FROM orders WHERE id=?',o.id);if(cur?.status!=='awaiting_verification')fail('This payment window has ended. Contact the seller before paying.',409);return json({status:cur.status});}
     queueOwnerAlert(ctx,env,'upi_submitted',await first(env,'SELECT * FROM orders WHERE id=?',o.id),fetchExternal);
     return json({status:'awaiting_verification'});
    }
    if(request.method==='POST'&&match[2]==='preview-payment'){
     if(mode(env)!=='preview')fail('Payment simulation is disabled.',403);const b=await body(request);if(b.outcome!=='success')return json({status:'pending'});
     const simulated={...o,gateway_order_id:'preview-'+o.id};await capture(env,simulated,{id:'preview-payment-'+o.id,order_id:simulated.gateway_order_id,amount:o.total_paise,currency:'INR',status:'captured'},time);return json({status:(await first(env,'SELECT status FROM orders WHERE id=?',o.id)).status});
    }
    if(request.method==='POST'&&match[2]==='verify'){
     if(!razorpayReady(env)||o.payment_method!=='razorpay'||!gatewayOrder(o))fail('Razorpay verification is not configured for this order.',503);const b=await body(request);
     if(!/^pay_[a-zA-Z0-9]+$/.test(b.razorpay_payment_id||'')||b.razorpay_order_id!==o.gateway_order_id||!equalSecret(b.razorpay_signature,await hmac(env.RAZORPAY_KEY_SECRET,o.gateway_order_id+'|'+b.razorpay_payment_id)))fail('Payment signature could not be verified.',400);
     const p=await gateway(env,'payments/'+b.razorpay_payment_id,{method:'GET'},fetchExternal);if(p.id!==b.razorpay_payment_id)fail('Payment ID mismatch.',409);const outcome=await capture(env,o,p,time);if(outcome)queueOwnerAlert(ctx,env,outcome==='review'?'review':'paid',o,fetchExternal);ctx.waitUntil(dispatchNotifications(env,{fetchExternal,now:time}));return json({status:(await first(env,'SELECT status FROM orders WHERE id=?',o.id)).status});
    }
   }
   if(path==='/api/webhooks/razorpay'&&request.method==='POST'){
    if(!razorpayReady(env))fail('Webhook is not configured.',503);const raw=await request.text();if(raw.length>200000)fail('Webhook is too large.',413);
    if(!equalSecret(request.headers.get('X-Razorpay-Signature'),await hmac(env.RAZORPAY_WEBHOOK_SECRET,raw)))fail('Invalid webhook signature.',401);
    const eventId=request.headers.get('x-razorpay-event-id');if(!eventId||eventId.length>200)fail('Missing webhook event ID.');if(await first(env,"SELECT event_id FROM webhook_receipts WHERE provider='razorpay' AND event_id=?",eventId))return json({received:true});
    let b;try{b=JSON.parse(raw)}catch{fail('Invalid webhook JSON.')};if(b.event==='payment.captured'||b.event==='order.paid'){
     const p=b.payload?.payment?.entity;if(!p?.id||!p.order_id)fail('Missing payment entity.');const o=await first(env,'SELECT * FROM orders WHERE gateway_order_id=?',p.order_id);
     if(!o)fail('Order is not available yet. Retry this callback.',409);if(o.payment_method!=='razorpay'||!gatewayOrder(o))fail('This order does not accept Razorpay callbacks.',409);const outcome=await capture(env,o,p,time);if(outcome)queueOwnerAlert(ctx,env,outcome==='review'?'review':'paid',o,fetchExternal);
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
    if(auth.configured(env))fail('Sign in with the approved owner account.',403);
    await limit(env,request,'login',5,time);const b=await body(request);if(env.ADMIN_SECRET?.length<32||!equalSecret(b.token,env.ADMIN_SECRET))fail('Owner access key is incorrect.',401);const expiry=String(time+3600000),mac=await hmac(env.ADMIN_SECRET,'owner:'+expiry);return json({signedIn:true},200,{'Set-Cookie':`dd_owner=${expiry}.${mac}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=3600${url.protocol==='https:'?'; Secure':''}`});
   }
   if(path==='/api/admin/logout'&&request.method==='POST')return json({signedIn:false},200,{'Set-Cookie':`dd_owner=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${url.protocol==='https:'?'; Secure':''}`});
   if(['/api/admin/orders','/api/admin/orders/export'].includes(path)&&request.method==='GET'){
    await requireOwner(env,request,time);await expire(env,time);const f=orderFilter(url),count=await first(env,'SELECT COUNT(*) total FROM orders'+f.where,...f.args);
    const exportCSV=path.endsWith('/export');if(exportCSV&&count.total>10000)fail('Narrow the date range to export at most 10,000 orders.',400);
    const rows=await all(env,'SELECT * FROM orders'+f.where+' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',...f.args,exportCSV?10000:50,exportCSV?0:f.offset);
    const orders=orderRows(rows.map(o=>({...o,totalPaise:o.total_paise,customer:JSON.parse(o.customer),lines:JSON.parse(o.lines)})));
    if(exportCSV)return new Response(ordersCSV(orders),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="drip-dusk-orders.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    const report=await first(env,`SELECT COUNT(*) orders,COALESCE(SUM(CASE WHEN payment_status='captured' THEN 1 ELSE 0 END),0) paidOrders,COALESCE(SUM(CASE WHEN payment_status='captured' THEN total_paise ELSE 0 END),0) collectedPaise,COALESCE(SUM(CASE WHEN payment_status='captured' THEN shipping_paise ELSE 0 END),0) deliveryPaise,COALESCE(SUM(refund_amount_paise),0) recordedRefundPaise FROM orders`+f.where,...f.args);
    return json({orders:await Promise.all(orders.map(async o=>({...o,trackingPath:'#track/'+o.id+'/'+await tokenFor(env,o.id)}))),total:count.total,offset:f.offset,limit:50,report});
   }
   const operations=path.match(/^\/api\/admin\/orders\/([a-zA-Z0-9-]+)\/(shipment|aftercare)$/);
   if(operations&&request.method==='PUT'){
    const actor=await requireOwner(env,request,time),b=await body(request),o=await first(env,'SELECT * FROM orders WHERE id=?',operations[1]);if(!o)fail('Order not found.',404);
    if(o.ops_revision!==b.expectedRevision)fail('This order changed. Reload before saving.',409);
    let sql,args,reference;
    if(operations[2]==='shipment'){
     if(o.payment_status!=='captured')fail('Save shipment details after payment is confirmed.',409);const fields=shipmentFields(b);reference=JSON.stringify(fields);
     sql='UPDATE orders SET courier_name=?,shipment_id=?,tracking_url=?,ops_revision=ops_revision+1,updated_at=? WHERE id=? AND ops_revision=?';args=[fields.courier,fields.shipmentId||null,fields.trackingUrl,time,o.id,b.expectedRevision];
    }else{const fields=aftercareFields(b,o);reference=JSON.stringify(fields);sql='UPDATE orders SET return_status=?,return_note=?,refund_amount_paise=?,refund_reference=?,ops_revision=ops_revision+1,updated_at=? WHERE id=? AND ops_revision=?';args=[fields.status,fields.note,fields.amount,fields.reference,time,o.id,b.expectedRevision];}
    const result=await env.DB.batch([stmt(env,sql,...args),stmt(env,"INSERT INTO owner_audit(id,order_id,action,actor,reference,at) SELECT ?,id,?,?,?,? FROM orders WHERE id=? AND ops_revision=? AND changes()=1",crypto.randomUUID(),operations[2],actor,reference,time,o.id,b.expectedRevision+1)]);
    if(!result[0].meta.changes)fail('This order changed. Reload before saving.',409);return json({saved:true});
   }
   const manualOrder=path.match(/^\/api\/admin\/orders\/([a-zA-Z0-9-]+)\/(approve-payment|cancel)$/);
   if(manualOrder&&request.method==='POST'){
    const actor=await requireOwner(env,request,time);await expire(env,time);const b=await body(request),o=await first(env,'SELECT * FROM orders WHERE id=?',manualOrder[1]);
    if(!o||o.payment_method!=='manual_upi')fail('Manual UPI order not found.',404);
    if(manualOrder[2]==='cancel'){
     if(o.status==='cancelled')return json({status:o.status});if(!['pending','awaiting_verification'].includes(o.status))fail('Only unpaid orders can be cancelled here.',409);
     await env.DB.batch([stmt(env,"UPDATE orders SET status='cancelled',updated_at=? WHERE id=? AND payment_status='pending' AND status IN('pending','awaiting_verification')",time,o.id),stmt(env,"INSERT INTO owner_audit(id,order_id,action,actor,at) VALUES(?,?,'cancel',?,?)",crypto.randomUUID(),o.id,actor,time)]);invalidate(env);return json({status:'cancelled'});
    }
    const reference=String(b.bankReference||'').trim();if(b.checkedBank!==true||b.amountPaise!==o.total_paise||!/^[a-zA-Z0-9-]{6,40}$/.test(reference))fail('Check the bank receipt, enter its reference and the exact amount before approving.');
    const paymentId='manual-'+reference.toUpperCase();
    if(o.payment_status==='captured'){if(o.payment_id!==paymentId)fail('This order was approved with another reference.',409);return json({status:o.status});}
    if(!['pending','awaiting_verification'].includes(o.status)||o.payment_status!=='pending')fail('This reservation expired or was cancelled. Review stock and payment with the customer.',409);
    let approval;try{approval=await env.DB.batch([
     stmt(env,"UPDATE orders SET payment_status='captured',payment_id=?,status='confirmed',updated_at=? WHERE id=? AND payment_status='pending' AND status IN('pending','awaiting_verification')",paymentId,time,o.id),
     stmt(env,"INSERT OR IGNORE INTO order_events(order_id,status,at) SELECT id,'confirmed',? FROM orders WHERE id=? AND status='confirmed'",time,o.id),
     stmt(env,"INSERT INTO owner_audit(id,order_id,action,actor,reference,at) SELECT ?,id,'approve-payment',?,?,? FROM orders WHERE id=? AND status='confirmed' AND payment_id=?",crypto.randomUUID(),actor,reference,time,o.id,paymentId)
    ]);}catch{fail('That bank reference is already in use, or this order changed. Reload and verify the receipt.',409);}
    if(!approval[0].meta.changes){const current=await first(env,'SELECT * FROM orders WHERE id=?',o.id);if(current?.payment_status!=='captured'||current.payment_id!==paymentId)fail('This order changed before approval. Reload and review it.',409);}
    invalidate(env);return json({status:'confirmed'});
   }
   const admin=path.match(/^\/api\/admin\/orders\/([a-zA-Z0-9-]+)\/status$/);
   if(admin&&request.method==='POST'){
    await requireOwner(env,request,time);const b=await body(request),o=await first(env,'SELECT * FROM orders WHERE id=?',admin[1]);
    const allowed={confirmed:'packed',packed:'shipped',shipped:'delivered'};
    if(!o||o.payment_status!=='captured'||allowed[o.status]!==b.status)fail('Advance a paid order one fulfilment stage at a time.',409);
    if(b.shipmentId&&!/^[a-zA-Z0-9_-]{1,100}$/.test(b.shipmentId))fail('Invalid shipment ID.');
    await env.DB.batch([stmt(env,'UPDATE orders SET status=?,shipment_id=COALESCE(?,shipment_id),ops_revision=ops_revision+1,updated_at=? WHERE id=? AND status=?',b.status,b.shipmentId||null,time,o.id,o.status),stmt(env,'INSERT OR IGNORE INTO order_events(order_id,status,at) SELECT id,?,? FROM orders WHERE id=? AND status=?',b.status,time,o.id,b.status)]);return json({status:b.status});
   }
   if(path==='/api/webhooks/whatsapp'&&request.method==='GET'){
    if(!env.WHATSAPP_VERIFY_TOKEN||!equalSecret(url.searchParams.get('hub.verify_token'),env.WHATSAPP_VERIFY_TOKEN)||url.searchParams.get('hub.mode')!=='subscribe')fail('Webhook verification failed.',403);return new Response(url.searchParams.get('hub.challenge')||'',{headers:{'Content-Type':'text/plain'}});
   }
   if(path==='/api/webhooks/whatsapp'&&request.method==='POST'){
    if(!env.WHATSAPP_APP_SECRET)fail('WhatsApp webhook is not configured.',503);const raw=await request.text();if(raw.length>200000)fail('Webhook is too large.',413);if(!equalSecret(request.headers.get('X-Hub-Signature-256'),'sha256='+await hmac(env.WHATSAPP_APP_SECRET,raw)))fail('Invalid WhatsApp signature.',401);let b;try{b=JSON.parse(raw)}catch{fail('Invalid webhook JSON.')};
    for(const entry of b.entry||[])for(const change of entry.changes||[])for(const s of change.value?.statuses||[]){if(['delivered','read'].includes(s.status))await stmt(env,"UPDATE notifications SET status='delivered' WHERE message_id=?",s.id).run();else if(s.status==='failed')await stmt(env,"UPDATE notifications SET status='failed',last_error='Delivery failed' WHERE message_id=? AND status!='delivered'",s.id).run();}return json({received:true});
   }
   return json({error:'Endpoint not found.'},404);
  }catch(e){const status=e.status||(/D1|SQLITE|constraint|no such|database/i.test(String(e.message))?500:400);return json({error:status>=500&&!e.expose?'Checkout service is unavailable or not configured. Please try again later.':e.message,...(e.expose&&e.code?{code:e.code}:{})},status)}
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
export default {fetch:handler,async scheduled(_event,env,ctx){const now=Date.now();await expire(env,now);await stmt(env,'DELETE FROM auth_flows WHERE expires_at<?',now).run();await stmt(env,'DELETE FROM auth_sessions WHERE expires_at<?',now).run();await stmt(env,'DELETE FROM rate_limits WHERE window<?',Math.floor(now/600000)-2).run();await stmt(env,'DELETE FROM quotes WHERE expires_at<? AND id NOT IN(SELECT quote_id FROM orders)',now-86400000).run();ctx.waitUntil(dispatchNotifications(env,{now}));}};
