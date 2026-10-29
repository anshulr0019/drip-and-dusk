// Owner tools: Telegram alerts, photo storage, the Today summary, bulk edits, WhatsApp links and packing slips.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {LocalD1,LocalR2} from '../backend/local-db.mjs';
import {seedSQL} from '../backend/seed.mjs';
import {createHandler,hmac} from '../backend/worker.mjs';
import {whatsappMessages,whatsappLink,packingSlip} from '../dist/owner-orders.mjs';
const folder=new URL('../backend/migrations/',import.meta.url),schema=(await Promise.all((await readdir(folder)).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL(n,folder),'utf8')))).join('\n');
const origin='http://127.0.0.1:4178',owner=crypto.randomUUID()+crypto.randomUUID(),address={name:'Asha Rao',phone:'9876543210',line1:'22 Private Lane',city:'Pune',state:'Maharashtra',postcode:'411001'};
const jpeg='data:image/jpeg;base64,'+Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3,4]).toString('base64');
function setup(t,{alerts=true,media=true,telegramDown=false}={}){
 const DB=new LocalD1();DB.exec(schema);DB.exec(seedSQL());t.after(()=>DB.close());let clock=1800000000000;const sent=[],background=[];
 const env={DB,COMMERCE_MODE:'manual_demo',PUBLIC_ORIGIN:origin,TRACKING_SECRET:crypto.randomUUID()+crypto.randomUUID(),ADMIN_SECRET:owner,RAZORPAY_KEY_ID:'rzp_test_'+crypto.randomUUID().replaceAll('-',''),RAZORPAY_KEY_SECRET:crypto.randomUUID(),RAZORPAY_WEBHOOK_SECRET:crypto.randomUUID()+crypto.randomUUID(),
  ...(alerts?{TELEGRAM_BOT_TOKEN:'123456:'+'A'.repeat(30),TELEGRAM_CHAT_ID:'987654321'}:{}),...(media?{MEDIA:new LocalR2()}:{})};
 const handler=createHandler({now:()=>clock,fetchExternal:async(url,init)=>{
  if(url.startsWith('https://api.telegram.org/')){if(telegramDown)throw Error('Telegram outage');sent.push(JSON.parse(init.body));return Response.json({ok:true});}
  if(url.endsWith('/orders')){const b=JSON.parse(init.body);return Response.json({id:'order_gw1',amount:b.amount,currency:'INR'});}
  if(url.includes('/payments/'))return Response.json({id:url.split('/').at(-1),order_id:'order_gw1',amount:229800,currency:'INR',status:'captured'});
  throw Error('Unexpected external call '+url);
 }});
 const request=async(path,{method='GET',body,token,asOwner=false,raw,headers={}}={})=>{const r=await handler(new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(asOwner?{Authorization:'Bearer '+owner}:token?{Authorization:'Bearer '+token}:{}),...headers},...(method!=='GET'?{body:raw??JSON.stringify(body||{})}:{})}),env,{waitUntil:p=>background.push(p)});const type=r.headers.get('Content-Type')||'';return {status:r.status,headers:r.headers,data:type.includes('json')?await r.json():await r.arrayBuffer()};};
 const order=async(paymentMethod='manual_upi')=>{const q=(await request('/api/checkout/quote',{method:'POST',body:{basket:[{id:'khamrah-bottle',qty:1}],postcode:'411001'}})).data;return (await request('/api/orders',{method:'POST',body:{quoteId:q.quoteId,basket:[{id:'khamrah-bottle',qty:1}],address,whatsappConsent:false,requestId:crypto.randomUUID(),paymentMethod}})).data;};
 return {DB,env,request,order,sent,settle:()=>Promise.all(background),advance:ms=>clock+=ms};
}
test('Telegram alerts arrive for new UPI orders and submitted references, without customer details',async t=>{
 const s=setup(t),o=await s.order();await s.request('/api/orders/'+o.id+'/payment-submission',{method:'POST',token:o.token,body:{reference:'UTR123456789'}});await s.settle();
 assert.equal(s.sent.length,2);assert.equal(s.sent[0].chat_id,'987654321');assert.match(s.sent[0].text,/New Direct UPI order/);assert.match(s.sent[0].text,new RegExp(o.ref));assert.match(s.sent[0].text,/Khamrah 100 ml × 1/);
 assert.match(s.sent[1].text,/UPI payment to verify/);assert.match(s.sent[1].text,/UTR123456789/);assert.match(s.sent[1].text,/₹2,298/);
 for(const m of s.sent)for(const secret of ['Asha','Private Lane','9876543210'])assert(!m.text.includes(secret));
});
test('a Razorpay payment alerts once even when the callback and webhook both arrive',async t=>{
 const s=setup(t),o=await s.order('razorpay');await s.settle();assert.equal(s.sent.length,0);
 const signature=await hmac(s.env.RAZORPAY_KEY_SECRET,o.gatewayOrderId+'|pay_x');
 assert.equal((await s.request('/api/orders/'+o.id+'/verify',{method:'POST',token:o.token,body:{razorpay_order_id:o.gatewayOrderId,razorpay_payment_id:'pay_x',razorpay_signature:signature}})).data.status,'confirmed');
 const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_x',order_id:o.gatewayOrderId,amount:o.amount,currency:'INR',status:'captured'}}}});
 assert.equal((await s.request('/api/webhooks/razorpay',{method:'POST',raw,headers:{'x-razorpay-event-id':'evt1','X-Razorpay-Signature':await hmac(s.env.RAZORPAY_WEBHOOK_SECRET,raw)}})).status,200);
 await s.settle();assert.equal(s.sent.length,1);assert.match(s.sent[0].text,/Paid with Razorpay/);
});
test('a Telegram outage or missing setup never blocks checkout, and the test button reports it',async t=>{
 const down=setup(t,{telegramDown:true}),o=await down.order();assert.match(o.ref,/^DD-/);await down.settle();assert.equal((await down.request('/api/admin/alerts/test',{method:'POST',asOwner:true})).status,502);
 const off=setup(t,{alerts:false});assert.equal((await off.order()).status,'pending');assert.equal((await off.request('/api/admin/alerts/test',{method:'POST',asOwner:true})).status,503);
 const on=setup(t);assert.equal((await on.request('/api/admin/alerts/test',{method:'POST',asOwner:true})).status,200);assert.match(on.sent[0].text,/alerts are connected/);
 assert.equal((await on.request('/api/admin/alerts/test',{method:'POST'})).status,401);
});
test('uploaded photos are stored as content-addressed files, served with long caching, and kept out of product data',async t=>{
 const s=setup(t),up=await s.request('/api/admin/images',{method:'POST',asOwner:true,body:{image:jpeg}});assert.equal(up.status,201);assert.match(up.data.image,/^media\/[a-f0-9]{64}\.jpg$/);
 const served=await s.request('/'+up.data.image);assert.equal(served.status,200);assert.equal(served.headers.get('Content-Type'),'image/jpeg');assert.match(served.headers.get('Cache-Control'),/immutable/);assert.equal(new Uint8Array(served.data)[0],0xff);
 assert.equal((await s.request('/api/admin/images',{method:'POST',asOwner:true,body:{image:'data:image/jpeg;base64,'+btoa('<svg onload=alert(1)>')}})).status,400);
 assert.equal((await s.request('/api/admin/images',{method:'POST',body:{image:jpeg}})).status,401);
 const products=(await s.request('/api/admin/products',{asOwner:true})).data.products,p=products.find(x=>x.id==='khamrah-bottle');
 assert.equal((await s.request('/api/admin/products/'+p.id,{method:'PUT',asOwner:true,body:{product:{...p,image:jpeg},expectedRevision:p.revision}})).status,400);
 assert.equal((await s.request('/api/admin/products/'+p.id,{method:'PUT',asOwner:true,body:{product:{...p,image:up.data.image},expectedRevision:p.revision}})).status,200);
 assert.equal((await s.request('/api/catalogue')).data.products.find(x=>x.id===p.id).image,up.data.image);
 const none=setup(t,{media:false});assert.equal((await none.request('/api/admin/images',{method:'POST',asOwner:true,body:{image:jpeg}})).status,503);
});
test('the Today summary counts the work waiting for the owner',async t=>{
 const s=setup(t),a=await s.order(),b=await s.order();await s.order();await s.request('/api/orders/'+a.id+'/payment-submission',{method:'POST',token:a.token,body:{reference:'UTR111111111'}});
 await s.request('/api/orders/'+b.id+'/payment-submission',{method:'POST',token:b.token,body:{reference:'UTR222222222'}});
 assert.equal((await s.request('/api/admin/orders/'+b.id+'/approve-payment',{method:'POST',asOwner:true,body:{checkedBank:true,amountPaise:b.amount,bankReference:'BANK22222222'}})).status,200);
 const d=(await s.request('/api/admin/summary',{asOwner:true})).data;
 assert.deepEqual({verify:d.verify,unpaid:d.unpaid,toPack:d.toPack,paidToday:d.paidToday,salesTodayPaise:d.salesTodayPaise},{verify:1,unpaid:1,toPack:1,paidToday:1,salesTodayPaise:229800});
 assert.equal(d.alertsConfigured,true);assert.equal(d.photoStorage,true);assert.equal((await s.request('/api/admin/summary')).status,401);
});
test('bulk edits save every changed row together, or none when a row is stale or invalid',async t=>{
 const s=setup(t),list=(await s.request('/api/admin/products',{asOwner:true})).data.products,a=list.find(x=>x.id==='khamrah-bottle'),b=list.find(x=>x.id==='asad-bottle');
 const change=(p,patch)=>({id:p.id,expectedRevision:p.revision,price:p.price,reference:p.reference,quantity:p.quantity,available:p.available,...patch});
 assert.equal((await s.request('/api/admin/products',{method:'PUT',asOwner:true,body:{changes:[change(a,{price:1999,reference:null}),change(b,{price:-5})]}})).status,400);
 assert.equal((await s.request('/api/admin/products',{method:'PUT',asOwner:true,body:{changes:[change(a,{price:1999,reference:null}),change(b,{expectedRevision:b.revision-1,quantity:9})]}})).status,409);
 assert.equal((await s.DB.prepare("SELECT price_paise FROM products WHERE id='khamrah-bottle'").first()).price_paise,219900);
 const ok=await s.request('/api/admin/products',{method:'PUT',asOwner:true,body:{changes:[change(a,{price:1999,reference:null}),change(b,{quantity:9})]}});assert.equal(ok.status,200);assert.equal(ok.data.saved,2);
 assert.equal(ok.data.products.find(x=>x.id==='khamrah-bottle').price,1999);assert.equal(ok.data.products.find(x=>x.id==='asad-bottle').quantity,9);
 const held=await s.order(),fresh=ok.data.products.find(x=>x.id==='khamrah-bottle'),now=(await s.request('/api/admin/products',{asOwner:true})).data.products.find(x=>x.id==='khamrah-bottle');assert.ok(held.id&&fresh);
 assert.equal((await s.request('/api/admin/products',{method:'PUT',asOwner:true,body:{changes:[change(now,{quantity:0,available:false})]}})).status,409);
 assert.equal((await s.request('/api/admin/products',{method:'PUT',body:{changes:[change(a,{price:1})]}})).status,401);
});
test('WhatsApp quick messages match the order stage and packing slips escape customer text',()=>{
 const base={ref:'DD-ABC',totalPaise:229800,customer:{name:'Asha Rao',phone:'919876543210',line1:'<b>22</b> Lane',city:'Pune',state:'Maharashtra',postcode:'411001'},lines:[{brand:'Lattafa',name:'Khamrah',size:100,format:'Full bottle',qty:1}],created_at:1800000000000};
 const at=(patch)=>whatsappMessages({...base,...patch},'https://shop.test/#track/x/y').map(([label])=>label);
 assert.deepEqual(at({payment_method:'manual_upi',status:'pending',payment_status:'pending'}),['Payment reminder']);
 assert.deepEqual(at({payment_method:'manual_upi',status:'confirmed',payment_status:'captured'}),['Order confirmed']);
 assert.deepEqual(at({payment_method:'razorpay',status:'shipped',payment_status:'captured',shipment_id:'AWB1',courier_name:'Delhivery'}),['Shipped']);
 const [[,text]]=whatsappMessages({...base,payment_method:'manual_upi',status:'pending',payment_status:'pending'},'https://shop.test/t');assert.match(text,/^Hi Asha, this is Drip & Dusk about your order DD-ABC \(₹2,298\)/);
 assert.match(whatsappLink('919876543210','Hi & bye'),/^https:\/\/wa\.me\/919876543210\?text=Hi%20%26%20bye$/);assert.equal(whatsappLink('not-a-phone','x'),'');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const slip=packingSlip(base,{storeName:'Drip & Dusk',businessAddress:'1 Shop Road\nPune'},esc);assert.match(slip,/&lt;b&gt;22&lt;\/b&gt; Lane/);assert.match(slip,/1 Shop Road<br>Pune/);assert.match(slip,/Khamrah/);assert.doesNotMatch(slip,/₹/);
});
