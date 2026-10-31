// Razorpay is off unless RAZORPAY_ENABLED is exactly "true" (ignoring case and spaces); existing payments still settle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setup,secret,hmac} from './support.mjs';
import {razorpayEnabled,choosePaymentMethod,paymentOptions} from '../backend/payment-options.mjs';
import {checkoutPaymentOptions,paymentSelector} from '../dist/payment-options.mjs';
const keys=()=>({RAZORPAY_KEY_ID:'rzp_test_'+crypto.randomUUID().replaceAll('-',''),RAZORPAY_KEY_SECRET:crypto.randomUUID(),RAZORPAY_WEBHOOK_SECRET:secret(),SHIPPING_RULES_JSON:JSON.stringify({zones:[{prefixes:['411'],feePaise:9900,label:'Test delivery'}]})});
const gateway=async(url,init)=>{if(url.endsWith('/orders')){const b=JSON.parse(init.body);return Response.json({id:'order_flag1',amount:b.amount,currency:b.currency})}if(url.includes('/payments/'))return Response.json({id:url.split('/').at(-1),order_id:'order_flag1',amount:229800,currency:'INR',status:'captured'});throw Error('unexpected '+url)};
const disabled=[undefined,'','False','0','yes','false'],enabled=[' true ','TRUE','true'];
test('the flag table: only a trimmed, case-insensitive "true" enables Razorpay',()=>{
 for(const v of disabled)assert.equal(razorpayEnabled({RAZORPAY_ENABLED:v}),false,String(v));
 for(const v of enabled)assert.equal(razorpayEnabled({RAZORPAY_ENABLED:v}),true,v);
});
test('disabled values hide Razorpay from config and reject it; enabled values offer it',async t=>{
 for(const v of [...disabled,...enabled]){
  const on=enabled.includes(v),s=setup(t,{env:{...keys(),...(v===undefined?{}:{RAZORPAY_ENABLED:v})},fetchExternal:gateway}),config=(await s.request('/api/config')).data;
  assert.equal(config.paymentOptions.some(p=>p.id==='razorpay'),on,'config '+v);
  assert.equal(JSON.stringify(config).includes('azorpay'),on,'no Razorpay text in config '+v);
  assert.equal(config.provider,'manual_upi');
  const r=await s.order({paymentMethod:'razorpay'});assert.equal(r.status,on?201:400,'order '+v);
  if(!on){assert.match(r.data.error,/supported payment method/);assert.equal((await s.stock()).held,0);}
  assert.equal(paymentOptions(s.env).some(p=>p.id==='razorpay'),on);
  if(!on)assert.throws(()=>choosePaymentMethod(s.env,'razorpay'),/supported payment method/);
  const sandbox=setup(t,{mode:'sandbox',env:{...keys(),ADMIN_SECRET:secret(),...(v===undefined?{}:{RAZORPAY_ENABLED:v})}});
  assert.equal((await sandbox.request('/api/config')).data.ready,on,'sandbox readiness '+v);
 }
 // The local preview simulator is also gated by the flag.
 assert.throws(()=>choosePaymentMethod({COMMERCE_MODE:'preview',RAZORPAY_ENABLED:'false'},'razorpay'),/supported payment method/);
 assert.equal((await setup(t,{mode:'preview'}).request('/api/config')).data.ready,false);
});
test('resuming an unpaid gateway order is refused once Razorpay is disabled',async t=>{
 const s=setup(t,{env:{...keys(),RAZORPAY_ENABLED:'true'},fetchExternal:gateway}),o=(await s.order({paymentMethod:'razorpay'})).data;
 assert.equal((await s.request('/api/orders/'+o.id+'/payment-session',{token:o.token})).status,200);
 s.env.RAZORPAY_ENABLED='false';const r=await s.request('/api/orders/'+o.id+'/payment-session',{token:o.token});assert.equal(r.status,409);assert.match(r.data.error,/Contact us/);
});
test('verification and webhooks for payments already started still confirm with the flag off',async t=>{
 const s=setup(t,{env:{...keys(),RAZORPAY_ENABLED:'true'},fetchExternal:gateway}),a=(await s.order({paymentMethod:'razorpay'})).data;
 s.env.RAZORPAY_ENABLED='false';
 const v=await s.request('/api/orders/'+a.id+'/verify',{method:'POST',token:a.token,body:{razorpay_order_id:a.gatewayOrderId,razorpay_payment_id:'pay_flag1',razorpay_signature:await hmac(s.env.RAZORPAY_KEY_SECRET,a.gatewayOrderId+'|pay_flag1')}});
 assert.equal(v.status,200);assert.equal(v.data.status,'confirmed');
 const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_flag1',order_id:a.gatewayOrderId,amount:a.amount,currency:'INR',status:'captured'}}}});
 assert.equal((await s.request('/api/webhooks/razorpay',{method:'POST',raw,headers:{'x-razorpay-event-id':'e1','X-Razorpay-Signature':await hmac(s.env.RAZORPAY_WEBHOOK_SECRET,raw)}})).status,200);
 assert.deepEqual({...await s.stock()},{quantity:5,held:0});
});
test('checkout options contain no Razorpay text when the server does not list it',async t=>{
 const config=(await setup(t,{env:{...keys(),RAZORPAY_ENABLED:'false'}}).request('/api/config')).data;
 assert.deepEqual(checkoutPaymentOptions(config).map(p=>p.id),['manual_upi']);
 const html=paymentSelector(config,'manual_upi',false,s=>s);assert.doesNotMatch(html,/azorpay/);assert.doesNotMatch(JSON.stringify(checkoutPaymentOptions(config)),/azorpay/);
 assert.deepEqual(checkoutPaymentOptions({provider:'manual_upi',ready:true}).map(p=>p.id),['manual_upi']);
});
test('the dev server defaults to manual_demo and takes a Direct UPI order with no setup',async t=>{
 const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})});
 const env={...process.env,PORT:String(port)};delete env.COMMERCE_MODE;delete env.RAZORPAY_ENABLED;
 const child=spawn(process.execPath,['backend/dev-server.mjs'],{cwd:new URL('..',import.meta.url),env,stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('dev server did not start')),8000);child.stdout.on('data',d=>{if(/development server/.test(String(d))){clearTimeout(timer);resolve()}});child.on('exit',()=>reject(Error('dev server exited')))});
 const base='http://127.0.0.1:'+port,call=(path,body)=>fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)}:{}).then(async r=>({status:r.status,data:await r.json()}));
 const config=(await call('/api/config')).data;assert.equal(config.mode,'manual_demo');assert.equal(config.ready,true);assert.equal(config.paymentOptions.some(p=>p.id==='razorpay'),false);
 const basket=[{id:'khamrah-bottle',qty:1}],q=(await call('/api/checkout/quote',{basket,postcode:'411001'})).data;
 const o=await call('/api/orders',{quoteId:q.quoteId,basket,address:{name:'Asha Rao',phone:'9876543210',line1:'22 Private Lane',city:'Pune',state:'Maharashtra',postcode:'411001'},whatsappConsent:false,requestId:crypto.randomUUID(),paymentMethod:'manual_upi'});
 assert.equal(o.status,201);assert.equal(o.data.provider,'manual_upi');
});
