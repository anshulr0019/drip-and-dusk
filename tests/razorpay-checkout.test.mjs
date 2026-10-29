import test from 'node:test';import assert from 'node:assert/strict';
import {loadRazorpay,openRazorpayTest} from '../dist/razorpay-checkout.mjs';
const session={provider:'razorpay',keyId:'rzp_test_'+crypto.randomUUID().replaceAll('-',''),gatewayOrderId:'order_example',amount:229800,ref:'DD-TEST-EXAMPLE'};
function harness(){let script,options,failed,openCount=0,closedModal=0;const window={};const document={createElement:()=>({remove(){}}),head:{append(s){script=s;}}};function sdk(){window.Razorpay=class{constructor(o){options=o}on(event,handler){assert.equal(event,'payment.failed');failed=handler}open(){openCount++}};script.onload();}return {window,document,sdk,script:()=>script,options:()=>options,fail:()=>failed(),opens:()=>openCount,beforeOpen:()=>closedModal++,closedModal:()=>closedModal};}
test('SDK loads only once, from the official URL, and a failed script can be retried',async()=>{
 const h=harness(),a=loadRazorpay(h),b=loadRazorpay(h);assert.equal(h.script().src,'https://checkout.razorpay.com/v1/checkout.js');h.sdk();assert.equal(await a,await b);
 const other=harness(),first=loadRazorpay(other);other.script().onerror();await assert.rejects(first,/could not load/);const retry=loadRazorpay(other);other.sdk();assert.equal(await retry,other.window.Razorpay);
});
test('malformed keys or invalid amounts cannot open a payment window',async()=>{
 const h=harness();for(const patch of [{keyId:'rzp_fake_'+crypto.randomUUID().replaceAll('-','')},{keyId:'key_'+crypto.randomUUID().replaceAll('-','')},{amount:1},{amount:1.5},{gatewayOrderId:'wrong'},{provider:'manual_upi'}])await assert.rejects(openRazorpayTest({...session,...patch},h),/valid Razorpay order/);assert.equal(h.script(),undefined);assert.equal(h.opens(),0);
});
test('the native modal is hidden before SDK checkout and the response still requires server verification',async()=>{
 const h=harness(),result=openRazorpayTest(session,{...h,prefill:{name:'Demo',phone:'919999999999'}});h.sdk();await Promise.resolve();await Promise.resolve();
 // Flush async SDK readiness without making a real network request.
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.closedModal(),1);assert.equal(h.opens(),1);assert.equal(h.options().order_id,session.gatewayOrderId);assert.equal(h.options().amount,229800);assert.equal(h.options().prefill.name,'Demo');
 h.options().handler({razorpay_payment_id:'pay_example'});assert.deepEqual(await result,{type:'submitted',result:{razorpay_payment_id:'pay_example'}});
});
test('failed attempts and dismissal never report payment success',async()=>{
 const h=harness(),result=openRazorpayTest(session,h);h.sdk();await new Promise(resolve=>setImmediate(resolve));h.fail();h.options().modal.ondismiss();assert.deepEqual(await result,{type:'closed',failed:true});
});
