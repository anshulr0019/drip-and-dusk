// Open-order caps, the verification hold, demo/live separation, owner-action races, late payments, anonymisation and tracking resets.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../backend/worker.mjs';
import {setup,secret,hmac,customer,nextPhone} from './support.mjs';
import {summaryMarkup} from '../dist/checkout.mjs';
import {signingStatus} from '../dist/owner-model.mjs';
import {approvalFields,whatsappEnabled,packingSlip} from '../dist/owner-orders.mjs';
import {prepareStoreFields} from '../dist/store-settings.mjs';
const liveEnv={MERCHANT_UPI_ID:'dripdusk.store@okaxis',MERCHANT_PAYEE_NAME:'Drip & Dusk'};
const gwKeys=()=>({RAZORPAY_ENABLED:'true',RAZORPAY_KEY_ID:'rzp_test_'+crypto.randomUUID().replaceAll('-',''),RAZORPAY_KEY_SECRET:crypto.randomUUID(),RAZORPAY_WEBHOOK_SECRET:secret(),SHIPPING_RULES_JSON:JSON.stringify({zones:[{prefixes:['411'],feePaise:9900,label:'Test delivery'}]})});
const gateway=async(url,init)=>{if(url.endsWith('/orders')){const b=JSON.parse(init.body);return Response.json({id:'order_safety1',amount:b.amount,currency:b.currency})}throw Error('unexpected '+url)};
// Runs fn just before the first batch whose first statement starts with prefix, so a competing request lands between the handler's read and its write.
function before(s,prefix,fn){const original=s.DB.batch.bind(s.DB);let armed=true;s.DB.batch=async statements=>{if(armed&&statements[0].sql.startsWith(prefix)){armed=false;await fn()}return original(statements)}}
const audit=(s,id,action)=>s.count('SELECT COUNT(*) n FROM owner_audit WHERE order_id=? AND action=?',id,action);
const events=(s,id,status)=>s.count('SELECT COUNT(*) n FROM order_events WHERE order_id=? AND status=?',id,status);
const expireAll=async s=>{s.advance(31*60000);await s.request('/api/catalogue')};
const L=(id,suffix)=>'/api/admin/orders/'+id+'/'+suffix;
const visitorCookie=async s=>{const r=await s.request('/api/auth/config');return r.headers.getSetCookie()[0].split(';')[0]};
test('open unpaid orders are capped per phone, with slots freed by expiry or approval',async t=>{
 const s=setup(t),phone=nextPhone(),a=await s.order({phone}),b=await s.order({phone});assert.equal(a.status,201);assert.equal(b.status,201);
 const c=await s.order({phone});assert.equal(c.status,429);assert.match(c.data.error,/already have unpaid orders/);assert.equal((await s.stock()).held,2);
 assert.equal((await s.order({phone:nextPhone()})).status,201);
 assert.equal((await s.approve(a.data)).status,200);assert.equal((await s.order({phone})).status,201);
 assert.equal((await s.order({phone})).status,429);
 await expireAll(s);assert.equal((await s.order({phone})).status,201);
});
test('the cap counts the phone that was entered even though demo orders store a sample customer',async t=>{
 const s=setup(t),phone=nextPhone(),o=(await s.order({phone})).data,row=await s.row(o.id);
 assert.equal(JSON.parse(row.customer).phone,'919999999999');assert.match(row.phone_hash,/^[0-9a-f]{64}$/);assert(!JSON.stringify(row).includes(phone));
 assert.equal((await s.order({phone})).status,201);assert.equal((await s.order({phone})).status,429);assert.equal((await s.order({phone:nextPhone()})).status,201);
});
test('open orders are capped per browser and per verified network address',async t=>{
 const s=setup(t,{env:{PROXY_SIGNING_SECRET:secret()}}),cookie=await visitorCookie(s);
 for(let i=0;i<2;i++)assert.equal((await s.order({headers:{Cookie:cookie}})).status,201);
 const blocked=await s.order({headers:{Cookie:cookie}});assert.equal(blocked.status,429);assert.match(blocked.data.error,/unpaid orders/);
 const sign=async ip=>{const ts=s.now();return {'x-dd-client-ip':ip,'x-dd-client-ts':String(ts),'x-dd-client-sig':await hmac(s.env.PROXY_SIGNING_SECRET,`client-ip:v1:${ip}:${ts}:POST:/api/orders`)}};
 await s.DB.prepare("UPDATE products SET quantity=40 WHERE id='khamrah-bottle'").run();
 for(let i=0;i<5;i++)assert.equal((await s.order({headers:await sign('203.0.113.50')})).status,201,'order '+i);
 assert.equal((await s.order({headers:await sign('203.0.113.50')})).status,429);
 assert.equal((await s.order({headers:await sign('203.0.113.51')})).status,201,'another address is unaffected');
 // Unsigned callers never earn an address hash, so a spoofed header cannot be used to lock out a stranger.
 const spoof=await s.order({headers:{'x-dd-client-ip':'203.0.113.50'}});assert.equal(spoof.status,201);assert.equal((await s.row(spoof.data.id)).client_ip_hash,null);
});
test('simultaneous orders cannot slip past the cap',async t=>{
 const s=setup(t),phone=nextPhone(),results=await Promise.all(Array.from({length:5},()=>s.order({phone})));
 assert.deepEqual(results.map(r=>r.status).sort(),[201,201,429,429,429]);assert.equal((await s.stock()).held,2);assert.equal(await s.count('SELECT COUNT(*) n FROM orders'),2);
});
test('the cron clears abuse hashes once an order is no longer open',async t=>{
 const s=setup(t),a=(await s.order()).data,b=(await s.order()).data;await s.approve(a);
 assert.equal((await s.row(a.id)).phone_hash!==null,true);
 await worker.scheduled({},s.env,{waitUntil:()=>{}});
 const ra=await s.row(a.id),rb=await s.row(b.id);assert.deepEqual([ra.phone_hash,ra.visitor_hash,ra.client_ip_hash],[null,null,null]);assert.notEqual(rb.phone_hash,null);
});
test('live orders hold stock for 4 hours after a UTR, test orders for 30 minutes, and a UTR alone never captures',async t=>{
 const live=setup(t,{mode:'live'}),demo=setup(t),l=(await live.order()).data,d=(await demo.order()).data;
 for(const [s,o] of [[live,l],[demo,d]])assert.equal((await s.submitUTR(o)).status,200);
 const status=(s,o)=>s.row(o.id).then(r=>r.status);
 live.advance(3*3600000+59*60000);demo.advance(31*60000);await live.request('/api/catalogue');await demo.request('/api/catalogue');
 assert.equal(await status(live,l),'awaiting_verification');assert.equal((await live.stock()).held,1);assert.equal(await status(demo,d),'expired');
 const r=await live.row(l.id);assert.equal(r.payment_status,'pending');assert.equal(r.payment_id,null);assert.equal((await live.stock()).quantity,6);
 live.advance(61000);await live.request('/api/catalogue');assert.equal(await status(live,l),'expired');assert.equal((await live.stock()).held,0);
});
test('owner actions on the other checkout mode are refused; cancelling test holds is allowed on a live deployment',async t=>{
 const s=setup(t,{env:liveEnv}),pending=(await s.order()).data,paid=(await s.order()).data;await s.approve(paid);
 const closed=(await s.order()).data;await s.owner(L(closed.id,'cancel'));
 s.env.COMMERCE_MODE='live';const mode=/another checkout mode/;
 let r=await s.approve(pending);assert.equal(r.status,409);assert.match(r.data.error,mode);
 r=await s.owner(L(paid.id,'status'),{status:'packed'});assert.equal(r.status,409);assert.match(r.data.error,mode);
 const rev=(await s.row(paid.id)).ops_revision;
 for(const [action,body] of [['shipment',{courier:'Test',shipmentId:'AWB123',trackingUrl:'',expectedRevision:rev}],['aftercare',{status:'requested',note:'x',expectedRevision:rev}]]){r=await s.owner(L(paid.id,action),body,'PUT');assert.equal(r.status,409,action);assert.match(r.data.error,mode);}
 for(const action of ['late-payment','fulfil-review']){r=await s.owner(L(pending.id,action),{checkedBank:true,amountPaise:229800,bankReference:'BANK12345',confirm:true});assert.equal(r.status,409,action);assert.match(r.data.error,mode);}
 assert.equal((await s.owner(L(paid.id,'reset-tracking'))).status,200,'reset works in any mode');
 r=await s.owner(L(closed.id,'anonymise'),{confirm:true,expectedRevision:(await s.row(closed.id)).ops_revision});assert.equal(r.status,200,'anonymise works in any mode');
 assert.equal((await s.owner(L(pending.id,'cancel'))).status,200);assert.equal((await s.stock()).held,0);
 // The reverse is never allowed: a live order cannot be touched from a test deployment.
 const real=(await s.order()).data;assert.equal((await s.row(real.id)).mode,'live');s.env.COMMERCE_MODE='manual_demo';
 r=await s.owner(L(real.id,'cancel'));assert.equal(r.status,409);assert.match(r.data.error,mode);assert.equal((await s.row(real.id)).status,'pending');
 assert.equal((await s.approve(real)).status,409);
});
test('order lists, reports and CSV show only the current mode unless all modes are requested',async t=>{
 const s=setup(t,{env:liveEnv});await s.order();await s.order();s.env.COMMERCE_MODE='live';const real=(await s.order()).data;
 const list=(q='')=>s.request('/api/admin/orders'+q,{asOwner:true});
 let r=await list();assert.equal(r.data.total,1);assert.equal(r.data.orders[0].id,real.id);assert.equal(r.data.report.orders,1);
 assert.equal((await list('?scope=all')).data.total,3);assert.equal((await list('?scope=all')).data.report.orders,3);
 assert.equal((await list('?scope=other')).status,400);
 const csv=await s.request('/api/admin/orders/export',{asOwner:true});assert.equal(csv.data.split('\r\n').length,2);
 assert.equal((await s.request('/api/admin/orders/export?scope=all',{asOwner:true})).data.split('\r\n').length,4);
 assert.equal(r.data.orders[0].phone_hash,undefined);
});
test('pending test holds still expire 30 minutes after switching to live',async t=>{
 const s=setup(t,{env:liveEnv}),o=(await s.order()).data;s.env.COMMERCE_MODE='live';await expireAll(s);
 assert.equal((await s.row(o.id)).status,'expired');assert.equal((await s.stock()).held,0);
});
test('approve versus cancel: whichever lands first wins and only that action is audited',async t=>{
 let s=setup(t),o=(await s.order()).data;
 before(s,'UPDATE orders SET payment_status',()=>s.owner(L(o.id,'cancel')));
 let r=await s.approve(o);assert.equal(r.status,409);assert.equal((await s.row(o.id)).status,'cancelled');
 assert.deepEqual([await audit(s,o.id,'cancel'),await audit(s,o.id,'approve-payment'),await events(s,o.id,'confirmed')],[1,0,0]);assert.deepEqual({...await s.stock()},{quantity:6,held:0});
 s=setup(t);o=(await s.order()).data;
 before(s,"UPDATE orders SET status='cancelled'",()=>s.approve(o));
 r=await s.owner(L(o.id,'cancel'));assert.equal(r.status,409);assert.match(r.data.error,/may have been approved/);assert.equal((await s.row(o.id)).status,'confirmed');
 assert.deepEqual([await audit(s,o.id,'cancel'),await audit(s,o.id,'approve-payment'),await events(s,o.id,'confirmed')],[0,1,1]);assert.deepEqual({...await s.stock()},{quantity:5,held:0});
});
test('a double cancel writes one audit row and a double status advance writes one audit row and event',async t=>{
 let s=setup(t),o=(await s.order()).data;
 before(s,"UPDATE orders SET status='cancelled'",()=>s.owner(L(o.id,'cancel')));
 let r=await s.owner(L(o.id,'cancel'));assert.equal(r.status,200);assert.equal(r.data.status,'cancelled');assert.equal(await audit(s,o.id,'cancel'),1);assert.equal((await s.stock()).held,0);
 s=setup(t);o=(await s.order()).data;await s.approve(o);
 before(s,'UPDATE orders SET status=?',()=>s.owner(L(o.id,'status'),{status:'packed'}));
 r=await s.owner(L(o.id,'status'),{status:'packed'});assert.equal(r.status,200);assert.equal(await audit(s,o.id,'status'),1);assert.equal(await events(s,o.id,'packed'),1);
});
const lateOrder=async(s,{amountPaise,bankReference='LATE'+crypto.randomUUID().slice(0,8)}={})=>{const o=(await s.order()).data;await expireAll(s);const r=await s.owner(L(o.id,'late-payment'),{checkedBank:true,amountPaise:amountPaise??o.amount,bankReference});return {o,r,bankReference}};
test('a late payment is recorded for review without touching stock or sending alerts',async t=>{
 const s=setup(t),{o,r,bankReference}=await lateOrder(s);
 assert.equal(r.status,200);const row=await s.row(o.id);
 assert.deepEqual([row.status,row.payment_status,row.payment_id,row.received_paise],['payment_review','captured_unallocated','manual-'+bankReference.toUpperCase(),o.amount]);
 assert.deepEqual({...await s.stock()},{quantity:6,held:0});assert.equal(await audit(s,o.id,'late-payment'),1);
 assert.equal((await s.owner(L(o.id,'late-payment'),{checkedBank:true,amountPaise:o.amount,bankReference})).status,200,'repeat is idempotent');assert.equal(await audit(s,o.id,'late-payment'),1);
 const dup=await lateOrder(s,{bankReference});assert.equal(dup.r.status,409);assert.match(dup.r.data.error,/already recorded on another order/);
 const x=(await s.order()).data;await expireAll(s);
 assert.equal((await s.owner(L(x.id,'late-payment'),{checkedBank:false,amountPaise:x.amount,bankReference:'BANK99999'})).status,400);
 assert.equal((await s.owner(L(x.id,'late-payment'),{checkedBank:true,amountPaise:0,bankReference:'BANK99999'})).status,400);
 const pending=(await s.order()).data;assert.equal((await s.owner(L(pending.id,'late-payment'),{checkedBank:true,amountPaise:pending.amount,bankReference:'BANK88888'})).status,409);
});
test('fulfilling a reviewed late payment deducts stock once; short stock or a wrong amount changes nothing',async t=>{
 let s=setup(t),{o}=await lateOrder(s);
 assert.equal((await s.owner(L(o.id,'fulfil-review'),{})).status,400,'needs confirmation');
 let r=await s.owner(L(o.id,'fulfil-review'),{confirm:true});assert.equal(r.status,200);
 let row=await s.row(o.id);assert.deepEqual([row.status,row.payment_status],['confirmed','captured']);assert.deepEqual({...await s.stock()},{quantity:5,held:0});
 assert.deepEqual([await events(s,o.id,'confirmed'),await audit(s,o.id,'fulfil-review')],[1,1]);
 assert.equal((await s.owner(L(o.id,'fulfil-review'),{confirm:true})).status,409,'cannot fulfil twice');assert.equal((await s.stock()).quantity,5);
 // Not enough free stock: nothing changes, including the audit trail.
 s=setup(t);({o}=await lateOrder(s));await s.DB.prepare("UPDATE products SET quantity=0 WHERE id='khamrah-bottle'").run();
 r=await s.owner(L(o.id,'fulfil-review'),{confirm:true});assert.equal(r.status,409);assert.match(r.data.error,/Nothing was changed/);
 row=await s.row(o.id);assert.deepEqual([row.status,row.payment_status],['payment_review','captured_unallocated']);assert.equal(await audit(s,o.id,'fulfil-review'),0);assert.equal(await events(s,o.id,'confirmed'),0);
 // Amount mismatch: fulfilment refused, a refund record is allowed, and afterwards fulfilment stays refused.
 s=setup(t);({o}=await lateOrder(s,{amountPaise:100000}));
 r=await s.owner(L(o.id,'fulfil-review'),{confirm:true});assert.equal(r.status,409);assert.match(r.data.error,/Record a refund instead/);
 let summary=(await s.request('/api/admin/summary',{asOwner:true})).data;assert.equal(summary.review,1);
 r=await s.owner(L(o.id,'aftercare'),{status:'refund_recorded',note:'Refunded in bank',amountPaise:100000,reference:'REF-1',completedExternally:true,expectedRevision:(await s.row(o.id)).ops_revision},'PUT');assert.equal(r.status,200);
 summary=(await s.request('/api/admin/summary',{asOwner:true})).data;assert.equal(summary.review,0);
 assert.match((await s.owner(L(o.id,'fulfil-review'),{confirm:true})).data.error,/refund is already recorded/);assert.deepEqual({...await s.stock()},{quantity:6,held:0});
});
test('two simultaneous fulfilments deduct stock once',async t=>{
 const s=setup(t),{o}=await lateOrder(s);
 before(s,"UPDATE orders SET status='confirmed'",()=>s.owner(L(o.id,'fulfil-review'),{confirm:true}));
 const r=await s.owner(L(o.id,'fulfil-review'),{confirm:true});assert.equal(r.status,200);assert.deepEqual({...await s.stock()},{quantity:5,held:0});assert.equal(await audit(s,o.id,'fulfil-review'),1);
});
test('a Razorpay payment that arrived after expiry can be fulfilled from review',async t=>{
 const s=setup(t,{env:gwKeys(),fetchExternal:gateway}),o=(await s.order({paymentMethod:'razorpay'})).data;s.advance(16*60000);await s.request('/api/catalogue');
 const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_late1',order_id:o.gatewayOrderId,amount:o.amount,currency:'INR',status:'captured'}}}});
 assert.equal((await s.request('/api/webhooks/razorpay',{method:'POST',raw,headers:{'x-razorpay-event-id':'late1','X-Razorpay-Signature':await hmac(s.env.RAZORPAY_WEBHOOK_SECRET,raw)}})).status,200);
 assert.equal((await s.row(o.id)).status,'payment_review');assert.equal((await s.owner(L(o.id,'fulfil-review'),{confirm:true})).status,200);assert.deepEqual({...await s.stock()},{quantity:5,held:0});
});
const deliver=async(s,o)=>{await s.approve(o);for(const status of ['packed','shipped','delivered'])assert.equal((await s.owner(L(o.id,'status'),{status})).status,200)};
test('anonymising removes personal data only when the order is finished, and is idempotent',async t=>{
 const s=setup(t),o=(await s.order()).data,pending=(await s.order()).data;
 const anon=(id,body={})=>s.owner(L(id,'anonymise'),{confirm:true,expectedRevision:body.rev??1,...body});
 assert.equal((await anon(pending.id)).status,409,'open unpaid order');
 await deliver(s,o);let row=await s.row(o.id);
 assert.equal((await s.owner(L(o.id,'anonymise'),{expectedRevision:row.ops_revision})).status,400,'needs confirmation');
 assert.equal((await anon(o.id,{rev:row.ops_revision-1})).status,409,'stale revision');
 await s.owner(L(o.id,'aftercare'),{status:'requested',note:'Wants to return',expectedRevision:row.ops_revision},'PUT');
 let r=await anon(o.id,{rev:(await s.row(o.id)).ops_revision});assert.equal(r.status,409);assert.match(r.data.error,/open return/);
 await s.owner(L(o.id,'aftercare'),{status:'rejected',note:'Closed',expectedRevision:(await s.row(o.id)).ops_revision},'PUT');
 row=await s.row(o.id);await s.DB.prepare('UPDATE orders SET customer_user_id=?,return_note=? WHERE id=?').bind('user-1','private note',o.id).run();
 r=await anon(o.id,{rev:row.ops_revision});assert.equal(r.status,200);
 const after=await s.row(o.id);assert.deepEqual(JSON.parse(after.customer),{name:'Customer details removed',phone:'',line1:'',line2:'',city:'',state:'',postcode:'',country:'IN',anonymised:true});
 assert.deepEqual([after.customer_user_id,after.return_note,after.phone_hash,after.consent],[null,'',null,0]);assert(after.anonymised_at>0);
 for(const k of ['ref','total_paise','lines','payment_id','created_at'])assert.equal(after[k],row[k],k);
 assert.equal((await s.request('/api/orders/'+o.id,{token:o.token})).status,404,'old tracking link is dead');
 assert.equal((await anon(o.id,{rev:row.ops_revision})).status,200,'repeat is idempotent');assert.equal(await audit(s,o.id,'anonymise'),1);
 // A cancelled unpaid order and a refunded order are also eligible.
 await s.owner(L(pending.id,'cancel'));assert.equal((await anon(pending.id,{rev:(await s.row(pending.id)).ops_revision})).status,200);
 // Slips and WhatsApp links cope with blank details.
 assert.equal(whatsappEnabled({mode:'live',anonymised_at:1}),false);assert.doesNotMatch(packingSlip({ref:'DD-1',created_at:1,customer:JSON.parse(after.customer),lines:[]},{},x=>x),/Phone: \+/);
});
test('resetting a tracking link kills the old one, leaves other orders alone and keeps old v1 links valid until then',async t=>{
 const s=setup(t),a=(await s.order()).data,b=(await s.order()).data;
 assert.equal(a.token,await hmac(s.env.TRACKING_SECRET,'tracking:'+a.id),'existing links keep their original format');
 assert.equal((await s.request('/api/orders/'+a.id,{token:a.token})).status,200);
 const r=await s.owner(L(a.id,'reset-tracking'));assert.equal(r.status,200);const fresh=r.data.trackingPath.split('/').at(-1);
 assert.equal((await s.request('/api/orders/'+a.id,{token:a.token})).status,404);assert.equal((await s.request('/api/orders/'+a.id,{token:fresh})).status,200);
 assert.equal((await s.request('/api/orders/'+b.id,{token:b.token})).status,200);assert.equal((await s.request('/api/orders/'+b.id,{token:fresh})).status,404);
 assert.equal(await audit(s,a.id,'reset-tracking'),1);
 const listed=(await s.request('/api/admin/orders',{asOwner:true})).data.orders.find(x=>x.id===a.id);assert.equal(listed.trackingPath,r.data.trackingPath);
 assert.equal((await s.owner(L('nonexistent-id','reset-tracking'))).status,404);
});
test('delivery labels reject markup, and the order summary escapes every string',()=>{
 for(const label of ['<img src=x onerror=alert(1)>','Fast" onmouseover="x','It\'s','a`b','two\nlines'])assert.throws(()=>prepareStoreFields({delivery:{feePaise:9900,freeAbovePaise:null,label}}),/plain text/);
 assert.equal(prepareStoreFields({delivery:{feePaise:9900,freeAbovePaise:null,label:'Standard delivery (2-4 days)'}}).delivery.label,'Standard delivery (2-4 days)');
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const evil='<img src=x onerror=alert(1)>',lines=[{name:evil,image:'a" onerror="x',size:evil,format:evil,qty:1,unitPaise:100}];
 // Quote-shaped (checkout review) and tracking-shaped (stored order) inputs.
 for(const q of [{lines,subtotalPaise:100,feePaise:0,totalPaise:100,deliveryLabel:evil},{lines,subtotalPaise:100,feePaise:null,totalPaise:100,deliveryLabel:'"><script>alert(1)</script>'}]){const html=summaryMarkup(q,esc,x=>x);assert.doesNotMatch(html,/<img src=x|<script|onerror="x/);assert.match(html,/&lt;/)}
});
test('the approval form starts with a blank amount and names the expected total',()=>{
 const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const html=approvalFields({totalPaise:229800},esc);assert.match(html,/name="amount" value=""/);assert.match(html,/placeholder="Expected ₹2,298"/);assert.doesNotMatch(html,/value="2298"/);
});
const signFor=(s,ip,path,method='POST')=>{const ts=s.now();return hmac(s.env.PROXY_SIGNING_SECRET,`client-ip:v1:${ip}:${ts}:${method}:${path}`).then(sig=>({'x-dd-client-ip':ip,'x-dd-client-ts':String(ts),'x-dd-client-sig':sig}))};
test('REQUIRE_SIGNED_PROXY: only a trimmed "true" turns it on, then unsigned orders and UTRs are refused with no hold',async t=>{
 for(const v of ['1','yes','false','','truee',undefined]){const s=setup(t,{env:{PROXY_SIGNING_SECRET:secret(),...(v===undefined?{}:{REQUIRE_SIGNED_PROXY:v})}});assert.equal((await s.order()).status,201,'off for '+v);assert.equal((await s.request('/api/admin/summary',{asOwner:true})).data.requireSignedProxy,false);}
 for(const v of ['True ',' TRUE','true']){
  const s=setup(t,{env:{PROXY_SIGNING_SECRET:secret(),REQUIRE_SIGNED_PROXY:v}});
  const refused=await s.order();assert.equal(refused.status,403,v);assert.equal(refused.data.error,'Please place your order through the Drip & Dusk website.');
  assert.deepEqual([(await s.stock()).held,await s.count('SELECT COUNT(*) n FROM orders')],[0,0]);
  const o=(await s.order({headers:await signFor(s,'203.0.113.9','/api/orders')}));assert.equal(o.status,201);
  const path='/api/orders/'+o.data.id+'/payment-submission';
  assert.equal((await s.submitUTR(o.data)).status,403);assert.equal((await s.row(o.data.id)).status,'pending');
  assert.equal((await s.request(path,{method:'POST',token:o.data.token,body:{reference:'UTR123456789'},headers:await signFor(s,'203.0.113.9',path)})).status,200);
  assert.equal((await s.request('/api/orders/'+o.data.id,{token:o.data.token})).status,200,'reads are unaffected');
  assert.equal((await s.request('/api/catalogue')).status,200);assert.equal((await s.request('/api/admin/summary',{asOwner:true})).data.requireSignedProxy,true);
 }
 for(const key of [undefined,'short']){const s=setup(t,{env:{REQUIRE_SIGNED_PROXY:'true',...(key?{PROXY_SIGNING_SECRET:key}:{})}});const r=await s.order();assert.equal(r.status,503);assert.equal(r.data.error,'Checkout is not configured.');assert.equal((await s.stock()).held,0);}
});
test('the network cap and the phone cap give different messages',async t=>{
 const s=setup(t,{env:{PROXY_SIGNING_SECRET:secret()}}),phone=nextPhone();await s.order({phone});await s.order({phone});
 assert.equal((await s.order({phone})).data.error,'You already have unpaid orders. Finish or wait for those first.');
 await s.DB.prepare("UPDATE products SET quantity=40 WHERE id='khamrah-bottle'").run();
 for(let i=0;i<5;i++)assert.equal((await s.order({headers:await signFor(s,'203.0.113.60','/api/orders')})).status,201);
 const r=await s.order({headers:await signFor(s,'203.0.113.60','/api/orders')});assert.equal(r.status,429);assert.equal(r.data.error,'Too many unpaid orders are open from this network right now. Please try again in a little while.');
});
test('the cap is enforced by the INSERT itself when the pre-check is bypassed, even without foreign-key backstop',async t=>{
 const s=setup(t),phone=nextPhone();s.DB.sqlite.exec('PRAGMA foreign_keys=OFF');
 const prepare=s.DB.prepare.bind(s.DB);s.DB.prepare=sql=>/^SELECT COUNT\(\*\) n FROM orders WHERE (phone_hash|visitor_hash|client_ip_hash)=\?/.test(sql)?{bind:()=>({first:async()=>({n:0})})}:prepare(sql);
 const statuses=[];for(let i=0;i<3;i++)statuses.push((await s.order({phone})).status);
 assert.deepEqual(statuses,[201,201,409]);assert.equal((await s.stock()).held,2);assert.equal(await s.count('SELECT COUNT(*) n FROM orders'),2);assert.equal(await s.count('SELECT COUNT(*) n FROM order_lines'),2);
});
test('late payments are refused on pending and awaiting-verification orders, in the handler and in the SQL',async t=>{
 const s=setup(t),pending=(await s.order()).data,waiting=(await s.order()).data;await s.submitUTR(waiting);
 for(const o of [pending,waiting]){const r=await s.owner(L(o.id,'late-payment'),{checkedBank:true,amountPaise:o.amount,bankReference:'BANK'+o.id.slice(0,6)});assert.equal(r.status,409);assert.match(r.data.error,/only be recorded on expired or cancelled/);}
 assert.equal((await s.stock()).held,2);assert.deepEqual([(await s.row(pending.id)).status,(await s.row(waiting.id)).status],['pending','awaiting_verification']);
 // The order changes between the handler's read and its write: the SQL guard alone must refuse.
 const raced=(await s.order()).data;await expireAll(s);const held=(await s.stock()).held;
 before(s,"UPDATE orders SET status='payment_review'",()=>s.DB.prepare("UPDATE orders SET status='awaiting_verification' WHERE id=?").bind(raced.id).run());
 const r=await s.owner(L(raced.id,'late-payment'),{checkedBank:true,amountPaise:raced.amount,bankReference:'RACE12345'});
 assert.equal(r.status,409);assert.match(r.data.error,/order changed/);const row=await s.row(raced.id);assert.deepEqual([row.status,row.payment_status,row.payment_id],['awaiting_verification','pending',null]);assert.equal(await audit(s,raced.id,'late-payment'),0);assert.equal((await s.stock()).held,held);
});
test('refunds on an unallocated late payment are capped at the amount received, not the order total',async t=>{
 const s=setup(t),{o,r}=await lateOrder(s,{amountPaise:229800+500});assert.equal(r.status,200);
 const rev=async()=>(await s.row(o.id)).ops_revision;
 const send=async amountPaise=>s.owner(L(o.id,'aftercare'),{status:'refund_recorded',note:'Overpaid',amountPaise,reference:'REF-9',completedExternally:true,expectedRevision:await rev()},'PUT');
 assert.equal((await send(229800+501)).status,400);assert.equal((await send(229800+500)).status,200);assert.equal((await s.row(o.id)).refund_amount_paise,230300);
 // A normally captured order is still capped at its total.
 const paid=(await s.order()).data;await s.approve(paid);
 const over=await s.owner(L(paid.id,'aftercare'),{status:'refund_recorded',note:'x',amountPaise:229801,reference:'R',completedExternally:true,expectedRevision:(await s.row(paid.id)).ops_revision},'PUT');assert.equal(over.status,400);
});
test('anonymising blanks customer text stored in aftercare audit rows but keeps refund references and bank references',async t=>{
 const s=setup(t),o=(await s.order()).data;await deliver(s,o);
 const note='Asha Rao called from 9876543210 about the parcel';
 assert.equal((await s.owner(L(o.id,'aftercare'),{status:'refund_recorded',note,amountPaise:1000,reference:'REFUND-77',completedExternally:true,expectedRevision:(await s.row(o.id)).ops_revision},'PUT')).status,200);
 const before=await s.DB.prepare('SELECT COUNT(*) n FROM owner_audit WHERE reference LIKE ?').bind('%Asha%').first();assert.equal(before.n,1);
 assert.equal((await s.owner(L(o.id,'anonymise'),{confirm:true,expectedRevision:(await s.row(o.id)).ops_revision})).status,200);
 const rows=await s.DB.prepare('SELECT action,reference FROM owner_audit WHERE order_id=?').bind(o.id).all();
 const text=JSON.stringify(rows.results);assert.doesNotMatch(text,/Asha|9876543210/);assert.match(text,/REFUND-77/);assert(rows.results.some(r=>r.action==='approve-payment'&&/^BANK/.test(r.reference)));
 assert.equal(JSON.parse(rows.results.find(r=>r.action==='aftercare').reference).note,'');
});
test('repeating a status the order is already at is a quiet success',async t=>{
 const s=setup(t),o=(await s.order()).data;await s.approve(o);
 for(let i=0;i<2;i++){const r=await s.owner(L(o.id,'status'),{status:'packed'});assert.equal(r.status,200);}
 assert.deepEqual([await audit(s,o.id,'status'),await events(s,o.id,'packed')],[1,1]);
 assert.equal((await s.owner(L(o.id,'status'),{status:'delivered'})).status,409,'skipping a stage is still refused');
});
test('refused anonymisation leaves the aftercare audit note untouched',async t=>{
 const s=setup(t),o=(await s.order()).data;await deliver(s,o);const note='Asha Rao called from 9876543210';
 const aftercare=async status=>s.owner(L(o.id,'aftercare'),{status,note,expectedRevision:(await s.row(o.id)).ops_revision},'PUT');
 const intact=()=>s.count("SELECT COUNT(*) n FROM owner_audit WHERE order_id=? AND reference LIKE '%Asha Rao called%'",o.id);
 assert.equal((await aftercare('requested')).status,200);
 let r=await s.owner(L(o.id,'anonymise'),{confirm:true,expectedRevision:(await s.row(o.id)).ops_revision});assert.equal(r.status,409);assert.equal(await intact(),1,'open return');
 assert.equal((await aftercare('rejected')).status,200);
 r=await s.owner(L(o.id,'anonymise'),{confirm:true,expectedRevision:(await s.row(o.id)).ops_revision-1});assert.equal(r.status,409);assert.equal(await intact(),2,'stale revision');
 assert.equal((await s.row(o.id)).anonymised_at,null);
});
test('after a failed insert the cap is re-checked and the right message comes back',async t=>{
 // The pre-check is fooled exactly once; the INSERT guard then refuses and the real re-check names the cap.
 const fool=(s,times)=>{let left=times;const prepare=s.DB.prepare.bind(s.DB);s.DB.prepare=sql=>left>0&&/^SELECT COUNT\(\*\) n FROM orders WHERE (phone_hash|client_ip_hash)=\?/.test(sql)?{bind:()=>({first:async()=>{left--;return {n:0}}})}:prepare(sql)};
 let s=setup(t);const phone=nextPhone();await s.order({phone});await s.order({phone});fool(s,1);
 let r=await s.order({phone});assert.equal(r.status,429);assert.equal(r.data.error,'You already have unpaid orders. Finish or wait for those first.');
 s=setup(t,{env:{PROXY_SIGNING_SECRET:secret()}});await s.DB.prepare("UPDATE products SET quantity=40 WHERE id='khamrah-bottle'").run();
 for(let i=0;i<5;i++)assert.equal((await s.order({headers:await signFor(s,'203.0.113.70','/api/orders')})).status,201);
 fool(s,2);r=await s.order({headers:await signFor(s,'203.0.113.70','/api/orders')});assert.equal(r.status,429);assert.match(r.data.error,/from this network/);
});
test('repeating a status on an order from another checkout mode is refused',async t=>{
 const s=setup(t,{env:liveEnv}),o=(await s.order()).data;await s.approve(o);assert.equal((await s.owner(L(o.id,'status'),{status:'packed'})).status,200);
 s.env.COMMERCE_MODE='live';const r=await s.owner(L(o.id,'status'),{status:'packed'});assert.equal(r.status,409);assert.match(r.data.error,/another checkout mode/);
});
test('Today warns loudly when signing is required but not working',()=>{
 const warn=signingStatus({requireSignedProxy:true,clientIpSource:'cf-connecting-ip'});assert.equal(warn.warn,true);assert.equal(warn.text,'New orders are being refused: storefront signing is not working. Turn off REQUIRE_SIGNED_PROXY or fix PROXY_SIGNING_SECRET.');
 const ok=signingStatus({requireSignedProxy:true,clientIpSource:'signed-proxy'});assert.equal(ok.warn,false);assert.match(ok.text,/verified through the storefront.*accepted only through the storefront/);
 const off=signingStatus({requireSignedProxy:false,clientIpSource:'cf-connecting-ip'});assert.equal(off.warn,false);assert.match(off.text,/not verified/);assert.match(off.text,/Turn on REQUIRE_SIGNED_PROXY only after/);
 assert.match(signingStatus({requireSignedProxy:false,clientIpSource:'signed-proxy'}).text,/^Visitor addresses: verified through the storefront\./);
});
test('malformed baskets and settings are rejected without leaking JavaScript errors; an unsigned refusal costs no rate-limit budget',async t=>{
 const s=setup(t),bad=await s.request('/api/checkout/quote',{method:'POST',body:{basket:[null],postcode:'411001'}});
 assert.equal(bad.status,400);assert.match(bad.data.error,/couldn't read/);assert.doesNotMatch(JSON.stringify(bad.data),/Cannot read|undefined|null/);
 const q=await s.quote();let r=await s.request('/api/orders',{method:'POST',body:{quoteId:q.quoteId,basket:[null],address:customer(),whatsappConsent:false,requestId:crypto.randomUUID(),paymentMethod:'manual_upi'}});
 assert.equal(r.status,409);assert.match(r.data.error,/couldn't read/);assert.equal((await s.stock()).held,0);
 // A genuine runtime fault after the quote is a generic 500, not a 409 with the JS message.
 const q3=await s.quote(),prepare=s.DB.prepare.bind(s.DB);s.DB.prepare=sql=>{if(sql.startsWith('SELECT * FROM products'))throw new TypeError('Cannot read properties of undefined (reading secret)');return prepare(sql)};
 r=await s.request('/api/orders',{method:'POST',body:{quoteId:q3.quoteId,basket:s.bag,address:customer(),whatsappConsent:false,requestId:crypto.randomUUID(),paymentMethod:'manual_upi'}});s.DB.prepare=prepare;
 assert.equal(r.status,500);assert.doesNotMatch(JSON.stringify(r.data),/Cannot read|secret/);
 const settings=await s.owner('/api/admin/settings',{settings:null,expectedRevision:null},'PUT');assert.equal(settings.status,400);assert.equal(settings.data.error,'Enter valid request data.');
 assert.equal((await s.owner('/api/admin/settings',{settings:[1],expectedRevision:null},'PUT')).status,400);
 const signed=setup(t,{env:{PROXY_SIGNING_SECRET:secret(),REQUIRE_SIGNED_PROXY:'true'}}),sq=await signed.quote(),limits=()=>signed.count('SELECT COALESCE(SUM(count),0) n FROM rate_limits'),beforeCount=await limits();
 const refused=await signed.request('/api/orders',{method:'POST',body:{quoteId:sq.quoteId,basket:signed.bag,address:customer(),whatsappConsent:false,requestId:crypto.randomUUID(),paymentMethod:'manual_upi'}});
 assert.equal(refused.status,403);assert.equal(await limits(),beforeCount);
});
