// Live-mode checks use generated credentials and a mocked Razorpay API. No real merchant data is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {LocalD1} from '../backend/local-db.mjs';
import {seedSQL} from '../backend/seed.mjs';
import {createHandler,hmac} from '../backend/worker.mjs';
import {checkoutPaymentOptions,paymentSelector} from '../dist/payment-options.mjs';
import {openRazorpayTest} from '../dist/razorpay-checkout.mjs';
const folder=new URL('../backend/migrations/',import.meta.url),schema=(await Promise.all((await readdir(folder)).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL(n,folder),'utf8')))).join('\n');
const origin='http://127.0.0.1:4176',address={name:'Real Customer',phone:'9876543210',line1:'Flat 4, Lake Road',city:'Pune',state:'Maharashtra',postcode:'411001'},owner=crypto.randomUUID()+crypto.randomUUID();
const delivery={feePaise:9900,freeAbovePaise:null,label:'Standard delivery'};
function setup(t,{upi=true,razorpay=true,keyPrefix='rzp_live_'}={}){
 const DB=new LocalD1();DB.exec(schema);DB.exec(seedSQL());DB.prepare('INSERT INTO store_settings(id,data) VALUES(1,?)').bind(JSON.stringify({delivery})).run();t.after(()=>DB.close());let createCalls=0;
 const env={DB,COMMERCE_MODE:'live',PUBLIC_ORIGIN:origin,TRACKING_SECRET:crypto.randomUUID()+crypto.randomUUID(),ADMIN_SECRET:owner,
  ...(upi?{MERCHANT_UPI_ID:'dripdusk.store@okaxis',MERCHANT_PAYEE_NAME:'Drip & Dusk'}:{}),
  ...(razorpay?{RAZORPAY_KEY_ID:keyPrefix+crypto.randomUUID().replaceAll('-',''),RAZORPAY_KEY_SECRET:crypto.randomUUID(),RAZORPAY_WEBHOOK_SECRET:crypto.randomUUID()+crypto.randomUUID()}:{})};
 const handler=createHandler({now:()=>1800000000000,fetchExternal:async(url,init)=>{
  if(url.endsWith('/orders')){createCalls++;const b=JSON.parse(init.body);return Response.json({id:'order_live'+createCalls,amount:b.amount,currency:b.currency});}
  if(url.includes('/payments/'))return Response.json({id:url.split('/').at(-1),order_id:'order_live1',amount:229800,currency:'INR',status:'captured'});
  throw Error('No messaging or courier calls are allowed');
 }});
 const request=async(path,{method='GET',body,token}={})=>{const r=await handler(new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method!=='GET'?{body:JSON.stringify(body||{})}:{})}),env,{waitUntil:()=>{}});return {status:r.status,data:await r.json()};};
 const basket=[{id:'khamrah-bottle',qty:1}];
 const submit=async paymentMethod=>{const q=(await request('/api/checkout/quote',{method:'POST',body:{basket,postcode:'411001'}})).data;return request('/api/orders',{method:'POST',body:{quoteId:q.quoteId,basket,address,whatsappConsent:false,requestId:crypto.randomUUID(),paymentMethod}});};
 return {DB,env,request,submit,createCalls:()=>createCalls};
}
test('live checkout stores the real delivery address and uses plain order references',async t=>{
 const s=setup(t),config=(await s.request('/api/config')).data;
 assert.equal(config.mode,'live');assert.equal(config.ready,true);assert.deepEqual(config.payment,{sample:false,upiId:'dripdusk.store@okaxis',payeeName:'Drip & Dusk'});
 assert.deepEqual(config.paymentOptions.map(p=>[p.id,p.available,p.status]),[['manual_upi',true,'live'],['razorpay',true,'live']]);
 const manual=(await s.submit('manual_upi')).data;assert.match(manual.ref,/^DD-[0-9A-F]{12}$/);assert.equal(manual.payment.upiId,'dripdusk.store@okaxis');assert.equal(manual.payment.sample,false);
 const row=await s.DB.prepare('SELECT mode,customer,total_paise FROM orders WHERE id=?').bind(manual.id).first();
 assert.equal(row.mode,'live');assert.equal(JSON.parse(row.customer).name,'Real Customer');assert.equal(JSON.parse(row.customer).line1,'Flat 4, Lake Road');assert.equal(row.total_paise,219900+9900);
 const tracked=(await s.request('/api/orders/'+manual.id,{token:manual.token})).data;assert.equal(tracked.payment.upiId,'dripdusk.store@okaxis');assert(!JSON.stringify(tracked).includes('Lake Road'));
});
test('live Razorpay creates a gateway order and confirms a verified live payment once',async t=>{
 const s=setup(t),o=(await s.submit('razorpay')).data;assert.match(o.keyId,/^rzp_live_/);assert.equal(o.gatewayOrderId,'order_live1');assert.match(o.ref,/^DD-[0-9A-F]{12}$/);
 const verify=await s.request('/api/orders/'+o.id+'/verify',{method:'POST',token:o.token,body:{razorpay_order_id:o.gatewayOrderId,razorpay_payment_id:'pay_live',razorpay_signature:await hmac(s.env.RAZORPAY_KEY_SECRET,o.gatewayOrderId+'|pay_live')}});
 assert.equal(verify.data.status,'confirmed');assert.equal((await s.DB.prepare("SELECT quantity FROM products WHERE id='khamrah-bottle'").first()).quantity,5);
});
test('live mode refuses test keys and a missing or malformed merchant UPI ID',async t=>{
 const testKeys=setup(t,{keyPrefix:'rzp_test_'});assert.equal((await testKeys.request('/api/config')).data.paymentOptions[1].available,false);assert.equal((await testKeys.submit('razorpay')).status,503);assert.equal(testKeys.createCalls(),0);
 const noUPI=setup(t,{upi:false});assert.equal((await noUPI.submit('manual_upi')).status,503);assert.equal((await noUPI.submit('razorpay')).status,201);
 const nothing=setup(t,{upi:false,razorpay:false});assert.equal((await nothing.request('/api/config')).data.ready,false);
 const bad=setup(t,{razorpay:false});bad.env.MERCHANT_UPI_ID='not a upi id';assert.equal((await bad.request('/api/config')).data.ready,false);
});
test('live payment choices carry no test or sample labels, and the browser accepts live keys',async()=>{
 const info={mode:'live',paymentOptions:[{id:'manual_upi',available:true},{id:'razorpay',available:true}]};
 const html=paymentSelector(info,'manual_upi',false,s=>s);assert.doesNotMatch(html,/[Ss]ample|[Tt]est mode|[Dd]emo/);
 assert.deepEqual(checkoutPaymentOptions({...info,paymentOptions:[{id:'manual_upi',available:true},{id:'razorpay',available:false}]}).map(p=>p.status),['',  'Unavailable']);
 let options;const window={Razorpay:function(o){options=o;return {on(){},open(){o.handler({razorpay_payment_id:'pay_x'})}}}};
 await openRazorpayTest({provider:'razorpay',keyId:'rzp_live_abc123',gatewayOrderId:'order_abc',amount:229800,ref:'DD-ABC'},{window,document:{}});assert.equal(options.description,'Order DD-ABC');
});
test('launch migration strips demo wording only where the original defaults are still in place',async t=>{
 const names=(await readdir(folder)).filter(n=>n.endsWith('.sql')).sort(),before=(await Promise.all(names.filter(n=>n<'0008').map(n=>readFile(new URL(n,folder),'utf8')))).join('\n'),launch=await readFile(new URL('0008_launch_copy.sql',folder),'utf8');
 const DB=new LocalD1();t.after(()=>DB.close());DB.exec(before);
 DB.prepare('INSERT INTO products(id,data,price_paise,quantity,enabled) VALUES(?,?,?,?,1)').bind('a',JSON.stringify({id:'a',condition:'Sealed retail bottle (demo)'}),100,1).run();
 DB.prepare('INSERT INTO products(id,data,price_paise,quantity,enabled) VALUES(?,?,?,?,1)').bind('b',JSON.stringify({id:'b',condition:'Opened, 90% full'}),100,1).run();
 DB.prepare('INSERT INTO store_settings(id,data) VALUES(1,?)').bind(JSON.stringify({ordering:'Choose your fragrance, enter delivery details and review the total. Try the sample UPI flow; orders stay awaiting verification until the owner approves payment.',payment:'Owner-written payment terms.'})).run();
 DB.exec(launch);DB.exec(launch);
 const condition=async id=>JSON.parse((await DB.prepare('SELECT data FROM products WHERE id=?').bind(id).first()).data).condition,settings=JSON.parse((await DB.prepare('SELECT data FROM store_settings').first()).data);
 assert.equal(await condition('a'),'Sealed retail bottle');assert.equal(await condition('b'),'Opened, 90% full');assert.doesNotMatch(settings.ordering,/sample/i);assert.equal(settings.payment,'Owner-written payment terms.');
});
