const loads=new WeakMap();
export async function loadRazorpay({window=globalThis.window,document=globalThis.document,timeoutMs=15000}={}){
 if(typeof window.Razorpay==='function')return window.Razorpay;
 if(loads.has(document))return loads.get(document);
 const loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');let timer;
  const fail=()=>{clearTimeout(timer);script.remove();loads.delete(document);reject(Error('The Razorpay window could not load. Retry from your private order link.'));};
  script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
  script.onload=()=>{clearTimeout(timer);if(typeof window.Razorpay!=='function'){fail();return;}resolve(window.Razorpay);};script.onerror=fail;
  timer=setTimeout(fail,timeoutMs);document.head.append(script);
 });loads.set(document,loading);return loading;
}
export async function openRazorpayTest(session,{prefill={},beforeOpen=()=>{},window=globalThis.window,document=globalThis.document}={}){
 if(session?.provider!=='razorpay'||!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(session.keyId||'')||!/^order_[A-Za-z0-9]+$/.test(session.gatewayOrderId||'')||!Number.isSafeInteger(session.amount)||session.amount<100)throw Error('A valid Razorpay order is required. No payment window was opened.');
 const Razorpay=await loadRazorpay({window,document});
 return new Promise((resolve,reject)=>{
  let failed=false;
  try{
   const checkout=new Razorpay({key:session.keyId,amount:session.amount,currency:'INR',name:'Drip & Dusk',description:(session.keyId.startsWith('rzp_test_')?'Test order ':'Order ')+session.ref,order_id:session.gatewayOrderId,prefill:{name:prefill.name||'',contact:prefill.phone||''},theme:{color:'#51412b'},handler:result=>resolve({type:'submitted',result}),modal:{ondismiss:()=>resolve({type:'closed',failed})}});
   checkout.on('payment.failed',()=>{failed=true;});
   // Native dialogs sit above third-party checkout iframes, regardless of z-index.
   beforeOpen();checkout.open();
  }catch(error){reject(error);}
 });
}
