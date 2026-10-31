export function shipmentFields(input){
 const courier=String(input.courier||'').trim(),shipmentId=String(input.shipmentId||'').trim(),trackingUrl=String(input.trackingUrl||'').trim();
 if(courier.length>80||shipmentId&&!/^[a-zA-Z0-9_-]{1,100}$/.test(shipmentId))throw Error('Check the courier name and AWB / shipment number.');
 if(trackingUrl){let u;try{u=new URL(trackingUrl)}catch{}if(!u||u.protocol!=='https:'||u.username||u.password||trackingUrl.length>500)throw Error('Use a valid HTTPS courier tracking link.');}
 if(!!courier!==!!shipmentId)throw Error('Enter both a courier name and AWB / shipment number.');
 return {courier,shipmentId,trackingUrl};
}
export const returnStates=['none','requested','approved','rejected','returned','refund_recorded'];
export function aftercareFields(b,order){
 if(!['captured','captured_unallocated'].includes(order.payment_status))throw Error('Returns and refunds can only be recorded for paid orders.');
 const status=String(b.status),note=String(b.note||'').trim();if(!returnStates.includes(status)||note.length>2000||!note)throw Error('Choose a valid return status and enter a reason or update.');
 if(order.return_status==='refund_recorded'&&status!=='refund_recorded')throw Error('Keep the completed refund record.');
 // An unallocated late payment is refundable up to what actually arrived, which can exceed the order total.
 let amount=0,reference='';const refundable=order.payment_status==='captured_unallocated'&&order.received_paise?order.received_paise:order.total_paise;if(status==='refund_recorded'){amount=b.amountPaise;reference=String(b.reference||'').trim();if(b.completedExternally!==true||!Number.isInteger(amount)||amount<1||amount>refundable||!reference||reference.length>160)throw Error('Confirm the refund was completed externally; enter its reference and amount within the amount paid.');}
 return {status,note,amount,reference};
}
export function orderFilter(url,modes){
 const p=url.searchParams,where=[],args=[];const query=(p.get('q')||'').trim();if(query.length>100)throw Error('Search is too long.');if(query){where.push('(ref LIKE ? OR customer LIKE ? OR lines LIKE ?)');args.push(...Array(3).fill('%'+query.replace(/[\\%_]/g,'')+'%'));}
 for(const [key,column,allowed] of [['status','status',['pending','awaiting_verification','confirmed','packed','shipped','delivered','expired','cancelled','payment_review']],['payment','payment_status',['pending','captured','captured_unallocated']],['method','payment_method',['manual_upi','razorpay']],['returns','return_status',returnStates]]){const value=p.get(key);if(value){if(!allowed.includes(value))throw Error('Invalid order filter.');where.push(column+'=?');args.push(value);}}
 // Test and live orders are separate books; only the owner asking for scope=all sees both.
 if(p.get('scope')&&p.get('scope')!=='all')throw Error('Invalid order filter.');
 if(modes&&p.get('scope')!=='all'){where.push('mode IN('+modes.map(()=>'?').join(',')+')');args.push(...modes);}
 for(const [key,operator,extra] of [['from','>=',0],['to','<',86400000]]){const value=p.get(key);if(value){const time=Date.parse(value+'T00:00:00+05:30');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(time)||new Date(time+19800000).toISOString().slice(0,10)!==value)throw Error('Enter valid dates.');where.push('created_at'+operator+'?');args.push(time+extra);}}
 if(p.get('from')&&p.get('to')&&p.get('from')>p.get('to'))throw Error('Start date must be before end date.');
 const offset=Number(p.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw Error('Invalid page.');return {where:where.length?' WHERE '+where.join(' AND '):'',args,offset};
}
