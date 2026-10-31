// Request bodies are size-bounded while streaming, must be JSON objects, and never echo internal error text.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readText,readJSON} from '../backend/http.mjs';
import {setup,secret,hmac} from './support.mjs';
const post=(s,path,raw,headers={})=>s.request(path,{method:'POST',raw,headers});
test('JSON bodies that are not objects are rejected with one generic message',async t=>{
 const s=setup(t);
 for(const raw of ['null','[]','5','"x"','true','{bad json','']){const r=await post(s,'/api/checkout/quote',raw);assert.equal(r.status,400,raw);assert.equal(r.data.error,'Enter valid request data.',raw);}
 assert.equal((await post(s,'/api/scent-matches','[1]')).status,400);
});
test('a large declared Content-Length is refused before the body is read; a malformed one is a 400',async t=>{
 const s=setup(t);let pulled=false;
 const stream=new ReadableStream({pull(c){pulled=true;c.enqueue(new TextEncoder().encode('{}'));c.close()}},{highWaterMark:0});
 const r=await s.handler(new Request('http://127.0.0.1:4190/api/checkout/quote',{method:'POST',headers:{Origin:'http://127.0.0.1:4190','Content-Type':'application/json','Content-Length':'999999'},body:stream,duplex:'half'}),s.env,{waitUntil(){}});
 assert.equal(r.status,413);assert.equal(pulled,false,'the stream was never read');
 const bad=await post(s,'/api/checkout/quote','{}',{'Content-Length':'12abc'});assert.equal(bad.status,400);
 await assert.rejects(readText(new Request('http://x.test',{method:'POST',headers:{'Content-Length':'-5'},body:'{}'}),100),{status:400});
});
test('an oversized body without Content-Length is cut off while streaming and the stream is cancelled',async t=>{
 const s=setup(t);let cancelled=false,sent=0,stop=false;
 // The source never ends and yields to the event loop, so a missing cut-off shows up as a timeout instead of hanging the run.
 const stream=new ReadableStream({async pull(c){sent++;await new Promise(r=>setTimeout(r,0));if(stop)return c.close();c.enqueue(new TextEncoder().encode('x'.repeat(8000)))},cancel(){cancelled=true}},{highWaterMark:0});
 let timer;const hung=new Promise((_,reject)=>{timer=setTimeout(()=>{stop=true;reject(Error('body was never cut off'))},3000)});
 const r=await Promise.race([s.handler(new Request('http://127.0.0.1:4190/api/checkout/quote',{method:'POST',headers:{Origin:'http://127.0.0.1:4190','Content-Type':'application/json'},body:stream,duplex:'half'}),s.env,{waitUntil(){}}),hung]);clearTimeout(timer);
 assert.equal(r.status,413);assert.equal(cancelled,true);assert(sent<10,'stopped reading soon after the limit');
 // Bytes, not characters, are counted.
 await assert.rejects(readText(new Request('http://x.test',{method:'POST',body:'é'.repeat(60)}),100),{status:413});
 assert.equal(await readText(new Request('http://x.test',{method:'POST',body:'é'.repeat(40)}),100),'é'.repeat(40));
 await assert.rejects(readJSON(new Request('http://x.test',{method:'POST',body:'[]'}),100),{status:400});
});
test('oversized webhooks are refused with 413 before any signature work',async t=>{
 const s=setup(t,{env:{RAZORPAY_KEY_ID:'rzp_test_abc123',RAZORPAY_KEY_SECRET:'k',RAZORPAY_WEBHOOK_SECRET:secret(),COURIER_WEBHOOK_SECRET:secret(),WHATSAPP_APP_SECRET:'wa'}});
 for(const [path,max] of [['/api/webhooks/razorpay',200000],['/api/webhooks/courier',24000],['/api/webhooks/whatsapp',200000]]){const r=await post(s,path,'x'.repeat(max+1));assert.equal(r.status,413,path);assert.equal(r.data.error,'Webhook is too large.');}
 const raw=JSON.stringify({event:'ping'});assert.equal((await post(s,'/api/webhooks/razorpay',raw,{'x-razorpay-event-id':'e1','X-Razorpay-Signature':await hmac(s.env.RAZORPAY_WEBHOOK_SECRET,raw)})).status,200);
});
test('unexpected runtime errors are not echoed, while intended validation messages still are',async t=>{
 const s=setup(t),calls=[],original=console.error;console.error=(...a)=>calls.push(a);t.after(()=>{console.error=original});
 const quote=await s.quote();
 s.DB.prepare=(()=>{const real=s.DB.prepare.bind(s.DB);return sql=>{if(sql.startsWith('SELECT * FROM products'))throw new TypeError("Cannot read properties of undefined (reading 'secret-customer-detail')");return real(sql)}})();
 const r=await s.request('/api/checkout/quote',{method:'POST',body:{basket:s.bag,postcode:'411001'}});
 assert.equal(r.status,500);assert.match(r.data.error,/unavailable or not configured/);assert.doesNotMatch(JSON.stringify(r.data),/secret-customer-detail|Cannot read/);
 assert.deepEqual(calls[0],['unhandled','TypeError']);assert(!JSON.stringify(calls).includes('secret-customer-detail'));
 const t2=setup(t);
 let v=await t2.request('/api/orders',{method:'POST',body:{quoteId:quote.quoteId,basket:t2.bag,address:{name:'Asha Rao',phone:'9876543210',line1:'22 Private Lane',city:'Pune',state:'Maharashtra',postcode:'123'},whatsappConsent:false,requestId:crypto.randomUUID(),paymentMethod:'manual_upi'}});
 assert.equal(v.status,400);assert.match(v.data.error,/six-digit Indian PIN/);
 v=await t2.owner('/api/admin/settings',{settings:{supportPhone:'123'},expectedRevision:null},'PUT');assert.equal(v.status,400);assert.match(v.data.error,/support phone/);
 v=await t2.owner('/api/admin/settings',{settings:{delivery:{feePaise:9900,freeAbovePaise:null,label:'<b>'}},expectedRevision:null},'PUT');assert.equal(v.status,400);assert.match(v.data.error,/plain text/);
});
