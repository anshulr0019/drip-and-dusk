// Provider availability is server-controlled. Live keys and customer surcharges are not supported in this release.
export const isManualDemo=env=>env.COMMERCE_MODE==='manual_demo';
export function razorpayTestReady(env){
 return ['manual_demo','sandbox'].includes(env.COMMERCE_MODE||'sandbox')&&env.TRACKING_SECRET?.length>=32&&/^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_KEY_ID||'')&&!!env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET?.length>=32;
}
export function paymentOptions(env){
 return [
  {id:'manual_upi',available:isManualDemo(env)&&env.TRACKING_SECRET?.length>=32,status:'sample',customerFeePaise:0},
  {id:'razorpay',available:razorpayTestReady(env),status:'test',customerFeePaise:0,reason:razorpayTestReady(env)?'':'Razorpay test checkout is being set up. You can use the manual UPI sample.'}
 ];
}
export function choosePaymentMethod(env,input){
 const method=input??(isManualDemo(env)?'manual_upi':'razorpay');
 if(!['manual_upi','razorpay'].includes(method))throw Object.assign(Error('Choose a supported payment method.'),{status:400});
 // The legacy local preview is intentionally simulated and never calls Razorpay.
 if(env.COMMERCE_MODE==='preview'&&method==='razorpay')return method;
 if(!paymentOptions(env).some(p=>p.id===method&&p.available))throw Object.assign(Error(method==='razorpay'?'Razorpay test checkout is not connected yet. Choose the manual UPI sample.':'Manual UPI is unavailable in this checkout.'),{status:503});
 return method;
}
