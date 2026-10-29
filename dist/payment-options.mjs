const details={
 manual_upi:{name:'Direct UPI',description:'Pay our UPI ID from any UPI app. We confirm your order once the payment is verified.',test:'Sample merchant UPI details. The seller checks the receipt before confirming your order.'},
 razorpay:{name:'Razorpay',description:'Cards, UPI, netbanking and wallets through Razorpay’s secure checkout.',test:'Test checkout for supported payment methods. Confirmation follows backend payment verification.'}
};
export function checkoutPaymentOptions(info){
 const options=Array.isArray(info?.paymentOptions)?info.paymentOptions:[{id:'manual_upi',available:info?.provider==='manual_upi'&&info?.ready!==false},{id:'razorpay',available:info?.provider==='razorpay'&&info?.ready===true}];
 const live=info?.mode==='live';
 return ['manual_upi','razorpay'].map(id=>{const option=options.find(p=>p.id===id),available=option?.available===true,{name,description,test}=details[id];return {id,name,description:live?description:test,available,status:live?(available?'':'Unavailable'):id==='manual_upi'?'Sample':available?'Test mode':'Setup pending',reason:option?.reason||'',customerFeePaise:0};});
}
export function paymentSelector(info,selected,locked,esc){
 return `<fieldset class="payment-methods"><legend>Choose how to pay</legend><div role="radiogroup" aria-label="Payment method">${checkoutPaymentOptions(info).map(p=>`<button type="button" class="payment-choice ${p.id===selected?'selected':''}" role="radio" aria-checked="${p.id===selected}" data-action="checkout-method" data-method="${p.id}" ${!p.available||locked?'disabled':''}><span class="payment-choice-mark" aria-hidden="true"></span><span class="payment-choice-copy"><span class="payment-choice-heading"><b>${p.name}</b>${p.status?`<small>${p.status}</small>`:''}</span><span>${esc(p.description)}</span>${!p.available?`<em>${esc(p.reason||'This payment method is not available right now.')}</em>`:''}</span></button>`).join('')}</div><p class="fineprint">No added payment fee. The order total is the same for both methods.${locked?' A payment order already exists; use its tracking link to continue.':''}</p></fieldset>`;
}
