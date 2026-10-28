// Test credentials are generated in memory. No merchant credentials are read or embedded.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {LocalD1} from '../backend/local-db.mjs';
import {seedSQL} from '../backend/seed.mjs';
import {createHandler,hmac} from '../backend/worker.mjs';
import {checkoutPaymentOptions,paymentSelector} from '../dist/payment-options.mjs';
const folder=new URL('../backend/migrations/',import.meta.url),schema=(await Promise.all((await readdir(folder)).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL(n,folder),'utf8')))).join('\n');
const origin='http://127.0.0.1:4175',address={name:'Private Customer',phone:'9876543210',line1:'Private Address 12',city:'Pune',state:'Maharashtra',postcode:'411001'},owner=crypto.randomUUID()+crypto.randomUUID();
function setup(t,{connected=true}={}){
 const DB=new LocalD1();DB.exec(schema);DB.exec(seedSQL());t.after(()=>DB.close());let clock=1800000000000,createCalls=0,failCreate=false,paymentPatch={};
 const env={DB,COMMERCE_MODE:'manual_demo',PUBLIC_ORIGIN:origin,TRACKING_SECRET:crypto.randomUUID()+crypto.randomUUID(),ADMIN_SECRET:owner,...(connected?{RAZORPAY_KEY_ID:'rzp_test_'+crypto.randomUUID().replaceAll('-',''),RAZORPAY_KEY_SECRET:crypto.randomUUID(),RAZORPAY_WEBHOOK_SECRET:crypto.randomUUID()+crypto.randomUUID()}:{})};
 const handler=createHandler({now:()=>clock,fetchExternal:async(url,init)=>{
  if(url.endsWith('/orders')){createCalls++;if(failCreate)throw Error('Ambiguous network timeout');const b=JSON.parse(init.body);assert.equal(b.amount,229800);assert.equal(b.currency,'INR');return Response.json({id:'order_gateway'+createCalls,amount:b.amount,currency:b.currency});}
  if(url.includes('/payments/'))return Response.json({id:url.split('/').at(-1),order_id:'order_gateway1',amount:229800,currency:'INR',status:'captured',...paymentPatch});
  throw Error('No messaging or courier calls are allowed');
 }});
 const request=async(path,{method='GET',body,token,raw,headers={}}={})=>{const r=await handler(new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},...(method!=='GET'?{body:raw??JSON.stringify(body||{})}:{})}),env,{waitUntil:()=>{}});return {status:r.status,data:await r.json()};};
 const basket=[{id:'khamrah-bottle',qty:1}];
 const quote=async()=>(await request('/api/checkout/quote',{method:'POST',body:{basket,postcode:'411001'}})).data;
 const submit=async(paymentMethod='razorpay',patch={})=>{const q=await quote();return request('/api/orders',{method:'POST',body:{quoteId:q.quoteId,basket,address,whatsappConsent:false,requestId:crypto.randomUUID(),paymentMethod,...patch}});};
 const verify=async(o,patch={})=>request('/api/orders/'+o.id+'/verify',{method:'POST',token:o.token,body:{razorpay_order_id:o.gatewayOrderId,razorpay_payment_id:'pay_example',razorpay_signature:await hmac(env.RAZORPAY_KEY_SECRET,o.gatewayOrderId+'|pay_example'),...patch}});
 const webhook=async(o,{eventId='event_captured',...patch}={})=>{const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_example',order_id:o.gatewayOrderId,amount:o.amount,currency:'INR',status:'captured',...patch}}}});return request('/api/webhooks/razorpay',{method:'POST',raw,headers:{'x-razorpay-event-id':eventId,'X-Razorpay-Signature':await hmac(env.RAZORPAY_WEBHOOK_SECRET,raw)}});};
 return {DB,env,request,quote,submit,verify,webhook,basket,stock:()=>DB.prepare("SELECT quantity,held FROM products WHERE id='khamrah-bottle'").first(),advance:ms=>clock+=ms,createCalls:()=>createCalls,failCreate:()=>failCreate=true,patchPayment:p=>paymentPatch=p};
}
test('missing test setup leaves manual UPI usable and cannot reserve stock through Razorpay',async t=>{
 const s=setup(t,{connected:false}),config=(await s.request('/api/config')).data;
 assert.equal(config.ready,true);assert.equal(config.customerFeePaise,0);assert.equal(config.paymentOptions.find(p=>p.id==='manual_upi').available,true);assert.equal(config.paymentOptions.find(p=>p.id==='razorpay').available,false);
 assert.equal((await s.submit()).status,503);assert.equal((await s.stock()).held,0);assert.equal((await s.submit('manual_upi')).status,201);assert.equal(s.createCalls(),0);
});
test('both routes coexist; orders store the chosen method and reserve for its correct payment window',async t=>{
 const s=setup(t),config=(await s.request('/api/config')).data;assert(config.paymentOptions.every(p=>p.available&&p.customerFeePaise===0));
 const pg=(await s.submit()).data,manual=(await s.submit('manual_upi')).data;
 assert.equal(pg.provider,'razorpay');assert.match(pg.keyId,/^rzp_test_/);assert.equal(manual.provider,'manual_upi');assert(!manual.gatewayOrderId);assert(!manual.keyId);assert.equal(s.createCalls(),1);
 const rows=await s.DB.prepare('SELECT payment_method,mode,expires_at-created_at AS duration,customer FROM orders').all();
 assert.deepEqual(rows.results.map(o=>[o.payment_method,o.mode,o.duration]),[['razorpay','sandbox',900000],['manual_upi','manual_demo',1800000]]);assert(rows.results.every(o=>!o.customer.includes('Private')));
 assert.equal((await s.stock()).quantity,6);assert.equal((await s.stock()).held,2);
});
test('Razorpay request retries reuse the gateway order and cannot silently switch payment method',async t=>{
 const s=setup(t),q=await s.quote(),requestId=crypto.randomUUID(),patch={quoteId:q.quoteId,requestId};
 const a=(await s.submit('razorpay',patch)).data,b=(await s.submit('razorpay',patch)).data;assert.equal(a.id,b.id);assert.equal(a.gatewayOrderId,b.gatewayOrderId);assert.equal(s.createCalls(),1);
 assert.equal((await s.submit('manual_upi',patch)).status,409);assert.equal((await s.stock()).held,1);
 const resumed=await s.request('/api/orders/'+a.id+'/payment-session',{token:a.token});assert.equal(resumed.data.gatewayOrderId,a.gatewayOrderId);assert(!JSON.stringify(resumed.data).includes(s.env.RAZORPAY_KEY_SECRET));
 assert.equal((await s.request('/api/orders/'+a.id+'/payment-session',{token:'forged'})).status,404);
});
test('unknown payment methods, live keys and client-added charges are rejected or ignored safely',async t=>{
 const s=setup(t);assert.equal((await s.submit('fake')).status,400);
 s.env.RAZORPAY_KEY_ID='rzp_live_'+crypto.randomUUID().replaceAll('-','');assert.equal((await s.submit()).status,503);assert.equal((await s.submit('manual_upi')).status,201);assert.equal(s.createCalls(),0);
 s.env.RAZORPAY_KEY_ID='rzp_test_'+crypto.randomUUID().replaceAll('-','');const o=(await s.submit('razorpay',{amount:1,customerFeePaise:8000,totalPaise:1})).data;assert.equal(o.amount,229800);assert.equal(s.createCalls(),1);
});
test('manual approval cannot confirm a gateway order, and a gateway callback cannot confirm a manual order',async t=>{
 const s=setup(t),pg=(await s.submit()).data,manual=(await s.submit('manual_upi')).data;
 assert.equal((await s.request('/api/admin/orders/'+pg.id+'/approve-payment',{method:'POST',token:owner,body:{checkedBank:true,amountPaise:pg.amount,bankReference:'BANK123456789'}})).status,404);
 assert.equal((await s.verify(manual)).status,503);
 assert.equal((await s.request('/api/orders/'+pg.id+'/payment-submission',{method:'POST',token:pg.token,body:{reference:'CLAIM123456'}})).status,409);
 assert.equal((await s.stock()).quantity,6);
});
test('invalid signatures and non-captured / mismatched provider records never deduct stock',async t=>{
 const s=setup(t),o=(await s.submit()).data;
 assert.equal((await s.verify(o,{razorpay_signature:'forged'})).status,400);
 for(const patch of [{amount:1},{currency:'USD'},{status:'authorized'},{order_id:'order_wrong'}]){s.patchPayment(patch);assert.equal((await s.verify(o)).status,409);}
 assert.equal((await s.stock()).quantity,6);assert.equal((await s.stock()).held,1);
});
test('verified callback followed by repeated signed webhook confirms and deducts once in mixed mode',async t=>{
 const s=setup(t),o=(await s.submit()).data;assert.equal((await s.verify(o)).data.status,'confirmed');
 assert.equal((await s.webhook(o)).status,200);assert.equal((await s.webhook(o)).status,200);assert.equal((await s.stock()).quantity,5);assert.equal((await s.stock()).held,0);
 const status=(await s.request('/api/orders/'+o.id,{token:o.token})).data;assert.equal(status.paymentMethod,'razorpay');assert.equal(status.mode,'sandbox');assert.equal(status.payment,undefined);
 for(const next of ['packed','shipped','delivered'])assert.equal((await s.request('/api/admin/orders/'+o.id+'/status',{method:'POST',token:owner,body:{status:next}})).status,200);
});
test('a signed webhook can confirm without a browser callback; invalid webhook signatures fail',async t=>{
 const s=setup(t),o=(await s.submit()).data;assert.equal((await s.request('/api/webhooks/razorpay',{method:'POST',raw:'{}',headers:{'X-Razorpay-Signature':'bad'}})).status,401);
 assert.equal((await s.webhook(o)).status,200);assert.equal((await s.request('/api/orders/'+o.id,{token:o.token})).data.status,'confirmed');assert.equal((await s.stock()).quantity,5);
});
test('expired captures are flagged for review without allocating released inventory',async t=>{
 const s=setup(t),o=(await s.submit()).data;s.advance(16*60000);
 assert.equal((await s.request('/api/orders/'+o.id+'/payment-session',{token:o.token})).data.status,'expired');assert.equal((await s.stock()).held,0);
 assert.equal((await s.webhook(o)).status,200);const status=(await s.request('/api/orders/'+o.id,{token:o.token})).data;assert.equal(status.status,'payment_review');assert.equal(status.paymentStatus,'captured_unallocated');assert.equal((await s.stock()).quantity,6);
});
test('ambiguous gateway creation errors do not create a second gateway order on retry',async t=>{
 const s=setup(t),q=await s.quote(),patch={quoteId:q.quoteId,requestId:crypto.randomUUID()};s.failCreate();assert.equal((await s.submit('razorpay',patch)).status,400);assert.equal((await s.submit('razorpay',patch)).status,409);assert.equal(s.createCalls(),1);assert.equal((await s.stock()).held,1);
});
test('payment selector keeps test setup explicit and locks an already-created payment order',()=>{
 const options=checkoutPaymentOptions({provider:'manual_upi',ready:true});assert.equal(options[0].available,true);assert.equal(options[1].available,false);
 const esc=s=>s.replaceAll('<','&lt;');const html=paymentSelector({paymentOptions:[{id:'manual_upi',available:true},{id:'razorpay',available:false,reason:'Connect <test> keys'}]},'manual_upi',false,esc);
 assert.match(html,/Setup pending/);assert.match(html,/Connect &lt;test> keys/);assert.match(html,/No added payment fee/);
 const locked=paymentSelector({paymentOptions:[{id:'manual_upi',available:true},{id:'razorpay',available:true}]},'razorpay',true,esc);assert.equal((locked.match(/ disabled/g)||[]).length,2);
});
