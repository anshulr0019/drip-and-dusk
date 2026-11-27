// Shipmozo courier booking (Shipmozo API guide v1). Calls go from the Worker with SHIPMOZO_PUBLIC_KEY/SHIPMOZO_PRIVATE_KEY; the browser never sees them.
// Shipmozo has no sandbox: assigning a courier books a real pickup and charges the wallet, so only live orders (real addresses) can be booked.
// Price checks and pickup-address lists are free and work for test orders too. Shipmozo documents no webhook, so the 5-minute cron polls track-order.
import {stages} from '../dist/commerce-model.mjs';
const base='https://shipping-api.com/app/api/v1';
const fail=(message,status=400,expose=false)=>{throw Object.assign(Error(message),{status,expose})};
const run=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run(),first=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
export const shipmozoReady=env=>/^\S{8,100}$/.test(env.SHIPMOZO_PUBLIC_KEY||'')&&/^\S{8,100}$/.test(env.SHIPMOZO_PRIVATE_KEY||'');
const clean=v=>String(v&&typeof v==='object'?Object.values(v).flat().join(' '):v??'').replace(/[<>\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,200);
// Field names in replies the guide leaves undocumented (rates, order detail) vary, so values are looked up by a list of likely keys, nested up to 4 deep.
export const pick=(v,keys,depth=0)=>{if(!v||typeof v!=='object'||depth>4)return;for(const k of keys)if(v[k]!=null&&v[k]!==''&&typeof v[k]!=='object')return v[k];for(const x of Object.values(v)){const f=pick(x,keys,depth+1);if(f!=null)return f}};
export async function shipmozo(env,path,{method='GET',body}={},fetchExternal=(...a)=>fetch(...a)){
 if(!shipmozoReady(env))fail('Shipmozo keys are not set on the server.',503,true);
 let data;try{const r=await fetchExternal(base+path,{method,signal:AbortSignal.timeout(15000),headers:{accept:'application/json','public-key':env.SHIPMOZO_PUBLIC_KEY,'private-key':env.SHIPMOZO_PRIVATE_KEY,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});data=await r.json()}catch{fail('Shipmozo did not respond. Try again in a minute.',502,true)}
 if(String(data?.result)!=='1')fail('Shipmozo says: '+(clean(data?.data?.error||data?.message)||'the request failed.'),502,true);
 return data.data;
}
export async function warehouses(env,fx){const d=await shipmozo(env,'/get-warehouses',{},fx);return (Array.isArray(d)?d:[]).map(w=>({id:String(w.id),title:clean(w.address_title)||'Untitled',city:clean(w.city),pincode:clean(w.pincode),isDefault:w.default==='YES',active:!w.status||w.status==='ACTIVE'})).filter(w=>/^\d{1,12}$/.test(w.id))}
const money=v=>{const n=Number(String(v??'').replace(/[^\d.]/g,''));return v!=null&&v!==''&&Number.isFinite(n)?n:null};
export function rateOptions(d){
 const list=Array.isArray(d)?d:d&&typeof d==='object'?Object.values(d).find(Array.isArray)||[]:[];
 return list.map(r=>{const id=String(pick(r,['courier_id','id'])??'');return {courierId:id,name:clean(pick(r,['courier_name','name','courier','courier_company']))||'Courier '+id,pricePaise:(p=>p==null?null:Math.round(p*100))(money(pick(r,['total_charges','total_charge','total_amount','total_price','total','rate','charges','freight_charges','amount','price']))),days:clean(pick(r,['estimated_delivery_days','estimated_days','delivery_days','tat','edd'])),autoPickup:String(pick(r,['pickups_automatically_scheduled'])||'').toUpperCase()==='YES'}})
  .filter(r=>/^\d{1,9}$/.test(r.courierId)).sort((a,b)=>(a.pricePaise??Infinity)-(b.pricePaise??Infinity));
}
export function parcel(b){
 const weight=Number(b.weightGrams),dims=['length','width','height'].map(k=>Number(b[k]));
 if(!Number.isInteger(weight)||weight<50||weight>30000)fail('Enter the parcel weight in grams (50 to 30000).');
 if(dims.some(d=>!Number.isFinite(d)||d<1||d>150))fail('Enter the box length, width and height in cm (1 to 150).');
 const [length,width,height]=dims;return {weight,length,width,height};
}
const indiaDay=t=>new Date(t+19800000).toISOString().slice(0,10);
export function pushBody(o,orderId,warehouseId,p){
 const c=JSON.parse(o.customer),lines=JSON.parse(o.lines);
 return {order_id:orderId,order_date:indiaDay(o.created_at),order_type:'NON ESSENTIALS',consignee_name:c.name,consignee_phone:Number(String(c.phone).slice(-10)),consignee_address_line_one:c.line1,consignee_address_line_two:c.line2||'',consignee_pin_code:Number(c.postcode),consignee_city:c.city,consignee_state:c.state,
  // HSN 3303 is perfumes and toilet waters.
  product_detail:lines.map(l=>({name:[l.brand,l.name].filter(Boolean).join(' ').slice(0,150)||'Perfume',sku_number:String(l.id||'').slice(0,60),quantity:l.qty,discount:'',hsn:'3303',unit_price:l.unitPaise/100,product_category:'Other'})),
  payment_type:'PREPAID',cod_amount:'',weight:p.weight,length:p.length,width:p.width,height:p.height,warehouse_id:String(warehouseId),gst_ewaybill_number:'',gstin_number:''};
}
// Courier wording differs; anything that sounds like a problem (RTO, cancelled, undelivered) changes no stage and is only shown to the owner.
export function stageFor(status){const s=String(status||'').toLowerCase();if(!s||/rto|return|cancel|lost|undeliver|not deliver|fail|exception|damage|hold/.test(s))return null;if(/deliver/.test(s)&&!/out for/.test(s))return 'delivered';if(/out for delivery|transit|picked|dispatch|shipped|reached|arrived|connected/.test(s))return 'shipped';return null}
const validAWB=a=>a!=null&&/^[A-Za-z0-9_-]{1,100}$/.test(String(a));
async function pickupAddress(env,id,fx){const w=(await warehouses(env,fx)).find(w=>w.id===String(id));if(!w)fail('That pickup address is not on the Shipmozo account any more. Reload and choose another.',409);if(!w.active)fail('That pickup address is inactive in Shipmozo.',409);if(!/^[1-9]\d{5}$/.test(w.pincode))fail('That pickup address has no valid PIN code in Shipmozo.',409);return w}
async function saveAWB(env,o,awb,courier,actor,now){
 const r=await env.DB.batch([env.DB.prepare("UPDATE orders SET shipment_id=?,courier_name=?,shipment_provider='shipmozo',shipment_status='Booked',shipment_checked_at=0,ops_revision=ops_revision+1,updated_at=? WHERE id=? AND shipment_id IS NULL").bind(String(awb),clean(courier).slice(0,80)||'Courier',now,o.id),env.DB.prepare("INSERT INTO owner_audit(id,order_id,action,actor,reference,at) SELECT ?,?,'shipmozo-book',?,?,? WHERE changes()=1").bind(crypto.randomUUID(),o.id,actor,JSON.stringify({awb:String(awb),courier:clean(courier),shipmozoOrderId:o.shipmozo_order_id}),now)]);
 return r[0].meta.changes===1;
}
export async function bookShipment(env,o,b,actor,now,fx){
 if(o.mode!=='live')fail("Test orders can't be booked with Shipmozo. Demo mode saves a sample address, and Shipmozo would send a real courier. Switch the site to live mode first.",409);
 if(o.payment_status!=='captured'||!['confirmed','packed'].includes(o.status)||o.anonymised_at)fail('Book a shipment only for a paid order that is confirmed or packed.',409);
 if(o.shipment_id)fail('This order already has a shipment. Cancel it first to book again.',409);
 const p=parcel(b),warehouseId=String(b.warehouseId||''),courierId=String(b.courierId||'');
 if(!/^\d{1,12}$/.test(warehouseId))fail('Choose a pickup address.');if(!o.shipmozo_courier_id&&!/^\d{1,9}$/.test(courierId))fail('Choose a courier.');
 // The lease stops a double tap or a second owner tab from booking (and paying for) two couriers.
 const claim=await run(env,'UPDATE orders SET shipment_lease_until=? WHERE id=? AND shipment_id IS NULL AND shipment_lease_until<=? AND ops_revision=?',now+120000,o.id,now,b.expectedRevision);
 if(!claim.meta.changes)fail('This order changed or a booking is already running. Reload and check before trying again.',409);
 try{
  let smId=o.shipmozo_order_id;
  if(!smId){await pickupAddress(env,warehouseId,fx);smId=o.ref+(o.shipment_attempt?'-R'+o.shipment_attempt:'');
   await shipmozo(env,'/push-order',{method:'POST',body:pushBody(o,smId,warehouseId,p)},fx);
   await run(env,"UPDATE orders SET shipmozo_order_id=?,shipmozo_warehouse_id=?,shipment_provider='shipmozo',shipment_status='Sent to Shipmozo',updated_at=? WHERE id=?",smId,warehouseId,now,o.id);
  }else if(!o.shipmozo_courier_id&&o.shipmozo_warehouse_id!==warehouseId){await pickupAddress(env,warehouseId,fx);await shipmozo(env,'/order/update-warehouse',{method:'POST',body:{order_id:smId,warehouse_id:Number(warehouseId)}},fx);await run(env,'UPDATE orders SET shipmozo_warehouse_id=? WHERE id=?',warehouseId,o.id)}
  let awb,courier=o.courier_name||'';
  if(!o.shipmozo_courier_id){const a=await shipmozo(env,'/assign-courier',{method:'POST',body:{order_id:smId,courier_id:Number(courierId)}},fx);awb=pick(a,['awb_number','awb']);courier=pick(a,['courier','courier_company','courier_name'])||courier;
   await run(env,"UPDATE orders SET shipmozo_courier_id=?,courier_name=?,shipment_status='Courier assigned',updated_at=? WHERE id=?",courierId,clean(courier).slice(0,80),now,o.id);}
  if(!validAWB(awb)&&b.autoPickup!==true){try{const s=await shipmozo(env,'/schedule-pickup',{method:'POST',body:{order_id:smId}},fx);awb=pick(s,['awb_number','awb']);courier=pick(s,['courier','courier_company'])||courier}catch(e){if(!/already|scheduled/i.test(e.message))throw e}}
  if(!validAWB(awb)){try{const d=await shipmozo(env,'/get-order-detail/'+encodeURIComponent(smId),{},fx);awb=pick(d,['awb_number','awb']);courier=courier||pick(d,['courier','courier_company'])||''}catch{}}
  if(!validAWB(awb))return {booked:false,message:'Courier assigned in Shipmozo, but no AWB number came back yet. Tap Refresh in a few minutes, or check the Shipmozo panel.'};
  await saveAWB(env,{...o,shipmozo_order_id:smId},awb,courier,actor,now);return {booked:true,awb:String(awb),courier:clean(courier)};
 }finally{await run(env,'UPDATE orders SET shipment_lease_until=0 WHERE id=?',o.id)}
}
// One order: fill a missing AWB after a slow booking, then read the courier status and move the stage forward only.
export async function syncShipment(env,o,now,fx,actor='shipmozo'){
 if(!o.shipment_id&&o.shipmozo_courier_id&&o.shipmozo_order_id){const d=await shipmozo(env,'/get-order-detail/'+encodeURIComponent(o.shipmozo_order_id),{},fx),awb=pick(d,['awb_number','awb']);if(validAWB(awb)){await saveAWB(env,o,awb,pick(d,['courier','courier_company'])||o.courier_name,actor,now);o={...o,shipment_id:String(awb)};}}
 if(!o.shipment_id){await run(env,'UPDATE orders SET shipment_checked_at=? WHERE id=?',now,o.id);return {status:o.shipment_status||''};}
 const d=await shipmozo(env,'/track-order?awb_number='+encodeURIComponent(o.shipment_id),{},fx),status=clean(pick(d,['current_status'])).slice(0,80),eta=clean(pick(d,['expected_delivery_date'])).slice(0,40),stage=stageFor(status),from=stages.indexOf(o.status),to=stage?stages.indexOf(stage):-1;
 const writes=[env.DB.prepare('UPDATE orders SET shipment_status=?,expected_delivery=?,shipment_checked_at=? WHERE id=?').bind(status||o.shipment_status,eta,now,o.id)];
 if(from>=0&&to>from)writes.push(env.DB.prepare("UPDATE orders SET status=?,ops_revision=ops_revision+1,updated_at=? WHERE id=? AND payment_status='captured' AND status IN("+stages.slice(0,to).map(()=>'?').join(',')+')').bind(stage,now,o.id,...stages.slice(0,to)),env.DB.prepare('INSERT OR IGNORE INTO order_events(order_id,status,at) SELECT id,?,? FROM orders WHERE id=? AND status=?').bind(stage,now,o.id,stage));
 await env.DB.batch(writes);return {status,expectedDelivery:eta,stage:to>from?stage:null};
}
export async function syncShipments(env,{fetchExternal=(...a)=>fetch(...a),now=Date.now()}={}){
 if(!shipmozoReady(env))return;
 const rows=(await env.DB.prepare("SELECT * FROM orders WHERE shipment_provider='shipmozo' AND payment_status='captured' AND status IN('confirmed','packed','shipped') AND shipment_checked_at<=? ORDER BY shipment_checked_at LIMIT 10").bind(now-1800000).all()).results;
 for(const o of rows){try{await syncShipment(env,o,now,fetchExternal)}catch{await run(env,'UPDATE orders SET shipment_checked_at=? WHERE id=?',now,o.id)}}
}
export async function cancelShipment(env,o,b,actor,now,fx){
 if(!o.shipmozo_order_id)fail('There is no Shipmozo booking on this order.',409);if(['shipped','delivered'].includes(o.status))fail('The parcel has already shipped. Handle it in the Shipmozo panel.',409);if(b.confirm!==true)fail('Tick the box to confirm the cancellation.');
 if(o.ops_revision!==b.expectedRevision)fail('This order changed. Reload before saving.',409);
 // Without an AWB nothing is booked with a courier yet, so clearing it here is enough; the next booking uses a fresh Shipmozo order ID.
 if(o.shipment_id)await shipmozo(env,'/cancel-order',{method:'POST',body:{order_id:o.shipmozo_order_id,awb_number:/^\d{1,15}$/.test(o.shipment_id)?Number(o.shipment_id):o.shipment_id}},fx);
 const r=await env.DB.batch([env.DB.prepare("UPDATE orders SET shipment_id=NULL,courier_name='',tracking_url='',shipment_provider='',shipmozo_order_id=NULL,shipmozo_warehouse_id=NULL,shipmozo_courier_id=NULL,shipment_status='',expected_delivery='',shipment_attempt=shipment_attempt+1,ops_revision=ops_revision+1,updated_at=? WHERE id=? AND ops_revision=?").bind(now,o.id,b.expectedRevision),env.DB.prepare("INSERT INTO owner_audit(id,order_id,action,actor,reference,at) SELECT ?,?,'shipmozo-cancel',?,?,? WHERE changes()=1").bind(crypto.randomUUID(),o.id,actor,JSON.stringify({awb:o.shipment_id||'',shipmozoOrderId:o.shipmozo_order_id}),now)]);
 if(!r[0].meta.changes)fail('This order changed. Reload before saving.',409);return {cancelled:true};
}
export async function shippingLabel(env,o,fx){
 if(o.shipment_provider!=='shipmozo'||!o.shipment_id)fail('This order has no Shipmozo AWB yet.',409);
 const d=await shipmozo(env,'/get-order-label/'+encodeURIComponent(o.shipment_id),{},fx),label=String((Array.isArray(d)?d[0]:d)?.label||'');
 if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(label)||label.length>4000000)fail('Shipmozo has not made the label yet. Try again in a minute.',502,true);return {label};
}
export async function courierRates(env,o,b,fx){
 const p=parcel(b),w=await pickupAddress(env,String(b.warehouseId||''),fx),c=JSON.parse(o.customer);
 const d=await shipmozo(env,'/rate-calculator',{method:'POST',body:{order_id:'',pickup_pincode:Number(w.pincode),delivery_pincode:Number(c.postcode),payment_type:'PREPAID',shipment_type:'FORWARD',order_amount:o.total_paise/100,type_of_package:'SPS',rov_type:'ROV_OWNER',cod_amount:'',weight:p.weight,dimensions:[{no_of_box:'1',length:String(p.length),width:String(p.width),height:String(p.height)}]}},fx);
 const options=rateOptions(d);if(!options.length)fail('Shipmozo returned no couriers for this route and parcel.',502,true);return {options,pickup:w,deliveryPincode:c.postcode};
}
