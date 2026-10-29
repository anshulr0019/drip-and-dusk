// Provider availability is server-controlled. Customer surcharges are not supported.
// `live` accepts real money: rzp_live_ keys and the merchant's own UPI ID. Other modes are test-only.
export const isManualDemo=env=>env.COMMERCE_MODE==='manual_demo';
export const isLive=env=>env.COMMERCE_MODE==='live';
const upiPattern=/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
export const samplePayment={sample:true,upiId:'dripanddusk@example',payeeName:'Drip & Dusk (sample)',whatsapp:''};
// Live UPI details come from deployment configuration, never from the browser.
export function merchantUPI(env){
 if(isManualDemo(env))return samplePayment;
 if(!isLive(env))return null;
 const upiId=String(env.MERCHANT_UPI_ID||'').trim(),payeeName=String(env.MERCHANT_PAYEE_NAME||'').trim();
 return upiPattern.test(upiId)&&payeeName&&payeeName.length<=80?{sample:false,upiId,payeeName}:null;
}
export function razorpayReady(env){
 const live=isLive(env);
 if(!live&&!['manual_demo','sandbox'].includes(env.COMMERCE_MODE||'sandbox'))return false;
 return env.TRACKING_SECRET?.length>=32&&(live?/^rzp_live_[A-Za-z0-9]+$/:/^rzp_test_[A-Za-z0-9]+$/).test(env.RAZORPAY_KEY_ID||'')&&!!env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET?.length>=32;
}
export const razorpayTestReady=razorpayReady;
export function paymentOptions(env){
 const live=isLive(env),upi=env.TRACKING_SECRET?.length>=32&&!!merchantUPI(env),razorpay=razorpayReady(env);
 return [
  {id:'manual_upi',available:upi,status:live?'live':'sample',customerFeePaise:0,reason:upi?'':'Direct UPI is not available right now.'},
  {id:'razorpay',available:razorpay,status:live?'live':'test',customerFeePaise:0,reason:razorpay?'':live?'Razorpay is not available right now. You can pay by direct UPI.':'Razorpay test checkout is being set up. You can use the manual UPI sample.'}
 ];
}
export function choosePaymentMethod(env,input){
 const options=paymentOptions(env),method=input??(options.find(p=>p.available)?.id||'razorpay');
 if(!['manual_upi','razorpay'].includes(method))throw Object.assign(Error('Choose a supported payment method.'),{status:400});
 // The legacy local preview is intentionally simulated and never calls Razorpay.
 if(env.COMMERCE_MODE==='preview'&&method==='razorpay')return method;
 const option=options.find(p=>p.id===method);
 if(!option?.available)throw Object.assign(Error(option?.reason||'This payment method is unavailable.'),{status:503});
 return method;
}
