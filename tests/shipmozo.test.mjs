// Shipmozo booking against a fake Shipmozo: pickup list, prices, booking, double-tap safety, tracking sync, labels, cancellation and the test-order guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './support.mjs';
import {rateOptions,stageFor,pushBody,syncShipments} from '../backend/shipmozo.mjs';
import {defaultParcelGrams} from '../dist/owner-orders.mjs';
const keys={SHIPMOZO_PUBLIC_KEY:'pubKEY1234567890abcd',SHIPMOZO_PRIVATE_KEY:'privKEY1234567890abc'};
function fakeShipmozo({assign={courier:'Delhivery Surface'},schedule={awb_number:'1234567890123',courier:'Delhivery Surface'},status='In Transit'}={}){
 const calls=[];const ok=data=>new Response(JSON.stringify({result:'1',message:'Success',data}),{headers:{'content-type':'application/json'}}),no=message=>new Response(JSON.stringify({result:'0',message,data:{}}),{headers:{'content-type':'application/json'}});
 const fx=async(url,init={})=>{const u=new URL(url),path=u.pathname.replace('/app/api/v1','');const body=init.body?JSON.parse(init.body):null;calls.push({path,method:init.method||'GET',body,headers:init.headers});
  if(init.headers['public-key']!==keys.SHIPMOZO_PUBLIC_KEY||init.headers['private-key']!==keys.SHIPMOZO_PRIVATE_KEY)return no('unauthorised user access');
  if(path==='/get-warehouses')return ok([{id:158453,default:'NO',address_title:'Anurag',city:'Mumbai',pincode:'400069',status:'ACTIVE'},{id:106972,default:'NO',address_title:'Deepak',city:'Greater Thane',pincode:'421005',status:'ACTIVE'},{id:999,default:'NO',address_title:'Old',city:'Pune',pincode:'411001',status:'INACTIVE'}]);
  if(path==='/rate-calculator')return ok([{courier_id:7,courier_name:'Xpressbees',total_charges:'92.50',estimated_delivery_days:'4',pickups_automatically_scheduled:'NO'},{courier_id:3,courier_name:'Delhivery Surface',total_charges:'71.00',estimated_delivery_days:'5',pickups_automatically_scheduled:'NO'}]);
  if(path==='/push-order')return ok({Info:'Order Pushed Successfully',order_id:body.order_id,reference_id:body.order_id});
  if(path==='/assign-courier')return ok({order_id:body.order_id,reference_id:body.order_id,...assign});
  if(path==='/schedule-pickup')return ok({order_id:body.order_id,reference_id:body.order_id,lr_number:'1',...schedule});
  if(path.startsWith('/get-order-detail/'))return ok({order_id:path.split('/').pop(),awb_number:schedule.awb_number||'',courier:'Delhivery Surface'});
  if(path==='/track-order')return ok({awb_number:u.searchParams.get('awb_number'),current_status:status,expected_delivery_date:'2026-12-03',scan_detail:[]});
  if(path.startsWith('/get-order-label/'))return ok([{label:'data:image/png;base64,iVBORw0KGgo=',created_at:'2026-11-27 10:00:00'}]);
  if(path==='/cancel-order')return ok({order_id:body.order_id,reference_id:body.order_id});
  return no('unknown path '+path);};
 return {fx,calls,set:v=>{status=v}};
}
async function paidLive(t,opts){const sm=fakeShipmozo(opts),s=setup(t,{mode:'live',env:keys,fetchExternal:sm.fx}),o=(await s.order()).data;assert.equal((await s.submitUTR(o)).status,200);assert.equal((await s.approve(o)).status,200);return {s,sm,o,row:()=>s.row(o.id)};}
const parcel={warehouseId:'106972',weightGrams:500,length:15,width:10,height:8};
test('pickup addresses and courier prices come from Shipmozo, cheapest first, with keys sent only as headers',async t=>{
 const {s,sm,o}=await paidLive(t);
 const w=await s.owner('/api/admin/shipmozo/warehouses',undefined,'GET');assert.equal(w.status,200);assert.equal(w.data.configured,true);assert.deepEqual(w.data.warehouses.map(x=>[x.id,x.active]),[['158453',true],['106972',true],['999',false]]);
 const r=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/rates',parcel);assert.equal(r.status,200);assert.deepEqual(r.data.options.map(x=>[x.courierId,x.pricePaise]),[['3',7100],['7',9250]]);
 const rate=sm.calls.find(c=>c.path==='/rate-calculator').body;assert.equal(rate.pickup_pincode,421005);assert.equal(rate.delivery_pincode,411001);assert.equal(rate.weight,500);
 assert.ok(!JSON.stringify(r.data).includes(keys.SHIPMOZO_PRIVATE_KEY));
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/rates',{...parcel,warehouseId:'999'})).status,409,'inactive pickup refused');
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/rates',{...parcel,weightGrams:5})).status,400);
 assert.equal((await s.request('/api/admin/orders/'+o.id+'/shipmozo/rates',{method:'POST',body:parcel,token:o.token})).status,401,'customer token cannot use it');
});
test('booking pushes the real address, assigns the chosen courier, schedules pickup and saves the AWB once',async t=>{
 const {s,sm,o,row}=await paidLive(t),before=await row();
 const b=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',autoPickup:false,expectedRevision:before.ops_revision});
 assert.equal(b.status,200);assert.deepEqual(b.data,{booked:true,awb:'1234567890123',courier:'Delhivery Surface'});
 const push=sm.calls.find(c=>c.path==='/push-order').body;assert.equal(push.order_id,before.ref);assert.equal(push.consignee_name,'Asha Rao');assert.equal(String(push.consignee_phone).length,10);assert.equal(push.consignee_pin_code,411001);assert.equal(push.payment_type,'PREPAID');assert.equal(push.warehouse_id,'106972');assert.equal(push.product_detail[0].hsn,'3303');
 assert.equal(sm.calls.find(c=>c.path==='/assign-courier').body.courier_id,3);
 const after=await row();assert.equal(after.shipment_id,'1234567890123');assert.equal(after.shipment_provider,'shipmozo');assert.equal(after.courier_name,'Delhivery Surface');assert.equal(after.shipment_lease_until,0);assert.equal(after.status,'confirmed','booking alone does not mark it shipped');
 assert.equal(await s.count("SELECT COUNT(*) n FROM owner_audit WHERE order_id=? AND action='shipmozo-book'",o.id),1);
 const again=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:after.ops_revision});assert.equal(again.status,409);
 assert.equal(sm.calls.filter(c=>c.path==='/assign-courier').length,1,'no second courier is paid for');
 const tracking=(await s.request('/api/orders/'+o.id,{token:o.token})).data;assert.equal(tracking.shipment.awb,'1234567890123');
});
test('a stale or concurrent booking is refused before anything is sent to Shipmozo',async t=>{
 const {s,sm,o,row}=await paidLive(t),rev=(await row()).ops_revision;
 await s.DB.prepare('UPDATE orders SET shipment_lease_until=? WHERE id=?').bind(s.now()+60000,o.id).run();
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:rev})).status,409);
 await s.DB.prepare('UPDATE orders SET shipment_lease_until=0 WHERE id=?').bind(o.id).run();
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:rev-1})).status,409);
 assert.equal(sm.calls.filter(c=>c.path!=='/get-warehouses').length,0);
});
test('test orders can compare prices but never book a real courier',async t=>{
 const sm=fakeShipmozo(),s=setup(t,{env:keys,fetchExternal:sm.fx}),o=(await s.order()).data;assert.equal((await s.approve(o)).status,200);const rev=(await s.row(o.id)).ops_revision;
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/rates',parcel)).status,200);
 const b=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:rev});assert.equal(b.status,409);assert.match(b.data.error,/Test orders/);
 assert.ok(!sm.calls.some(c=>['/push-order','/assign-courier','/schedule-pickup'].includes(c.path)));
});
test('unpaid orders cannot be booked, and missing keys give a clear message',async t=>{
 const sm=fakeShipmozo(),s=setup(t,{mode:'live',env:keys,fetchExternal:sm.fx}),o=(await s.order()).data;
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:1})).status,409);
 const bare=setup(t,{mode:'live'}),w=await bare.owner('/api/admin/shipmozo/warehouses',undefined,'GET');assert.equal(w.status,200);assert.equal(w.data.configured,false);
 const p=(await bare.order()).data;await bare.submitUTR(p);await bare.approve(p);const r=await bare.owner('/api/admin/orders/'+p.id+'/shipmozo/rates',parcel);assert.equal(r.status,503);assert.match(r.data.error,/keys are not set/);
});
test('an AWB that arrives late is filled in by the cron without pushing the order again',async t=>{
 const {s,sm,o,row}=await paidLive(t,{schedule:{}});let rev=(await row()).ops_revision;
 const first=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:rev});
 assert.equal(first.status,200);assert.equal(first.data.booked,false);assert.match(first.data.message,/no AWB/);
 const mid=await row();assert.equal(mid.shipmozo_courier_id,'3');assert.equal(mid.shipment_id,null);assert.equal(mid.shipment_provider,'shipmozo');
 // The cron later finds the AWB through order detail.
 sm.calls.length=0;const fx=sm.fx;const awb='9988776655';
 const withAWB=async(url,init)=>new URL(url).pathname.includes('/get-order-detail/')?new Response(JSON.stringify({result:'1',data:{awb_number:awb,courier:'Delhivery Surface'}})):fx(url,init);
 await syncShipments(s.env,{fetchExternal:withAWB,now:s.now()+3600000});
 const done=await row();assert.equal(done.shipment_id,awb);assert.equal(done.status,'shipped','In Transit moves it to shipped');
 assert.equal(sm.calls.filter(c=>c.path==='/push-order').length,0);
});
test('a Shipmozo error reaches the owner, releases the lock, and the retry reuses the pushed order',async t=>{
 const {s,sm,o,row}=await paidLive(t),fx=sm.fx;let failAssign=true;
 const flaky=setup(t,{mode:'live',env:keys,fetchExternal:async(url,init)=>failAssign&&url.endsWith('/assign-courier')?new Response(JSON.stringify({result:'0',message:'Insufficient wallet balance',data:{}})):fx(url,init)});
 const p=(await flaky.order()).data;await flaky.submitUTR(p);await flaky.approve(p);const rev=(await flaky.row(p.id)).ops_revision;
 const r=await flaky.owner('/api/admin/orders/'+p.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:rev});
 assert.equal(r.status,502);assert.match(r.data.error,/Insufficient wallet balance/);
 const mid=await flaky.row(p.id);assert.equal(mid.shipment_lease_until,0);assert.equal(mid.shipmozo_order_id,mid.ref);assert.equal(mid.shipment_id,null);
 failAssign=false;const pushes=sm.calls.filter(c=>c.path==='/push-order').length;
 const ok=await flaky.owner('/api/admin/orders/'+p.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:rev});assert.equal(ok.status,200);assert.equal(ok.data.booked,true);
 assert.equal(sm.calls.filter(c=>c.path==='/push-order').length,pushes,'not pushed twice');
});
test('tracking sync moves stages forward only, records events, and ignores problem statuses',async t=>{
 const {s,sm,o,row}=await paidLive(t,{status:'Pickup Pending'});
 await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:(await row()).ops_revision});
 let r=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/refresh');assert.equal(r.status,200);assert.equal(r.data.stage,null);assert.equal((await row()).status,'confirmed');assert.equal((await row()).shipment_status,'Pickup Pending');
 sm.set('Out For Delivery');r=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/refresh');assert.equal(r.data.stage,'shipped');
 sm.set('RTO Initiated');r=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/refresh');assert.equal(r.data.stage,null);assert.equal((await row()).status,'shipped');
 sm.set('Delivered');await syncShipments(s.env,{fetchExternal:sm.fx,now:s.now()+3600000});assert.equal((await row()).status,'delivered');
 assert.equal(await s.count("SELECT COUNT(*) n FROM order_events WHERE order_id=? AND status IN('shipped','delivered')",o.id),2);
 const before=sm.calls.length;await syncShipments(s.env,{fetchExternal:sm.fx,now:s.now()+7200000});assert.equal(sm.calls.length,before,'delivered orders are not polled again');
 const customer=(await s.request('/api/orders/'+o.id,{token:o.token})).data;assert.equal(customer.status,'delivered');assert.equal(customer.shipment.status,'Delivered');assert.equal(customer.shipment.expectedDelivery,'2026-12-03');
});
test('label and cancellation: label is a checked image, cancel clears the booking so it can be booked again under a new Shipmozo ID',async t=>{
 const {s,sm,o,row}=await paidLive(t);
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/label')).status,409);
 await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'3',expectedRevision:(await row()).ops_revision});
 const l=await s.owner('/api/admin/orders/'+o.id+'/shipmozo/label');assert.equal(l.status,200);assert.match(l.data.label,/^data:image\/png;base64,/);
 let rev=(await row()).ops_revision;assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/cancel',{confirm:false,expectedRevision:rev})).status,400);
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/cancel',{confirm:true,expectedRevision:rev})).status,200);
 const c=sm.calls.find(x=>x.path==='/cancel-order').body;assert.equal(c.awb_number,1234567890123);
 const cleared=await row();assert.equal(cleared.shipment_id,null);assert.equal(cleared.shipment_provider,'');assert.equal(cleared.shipment_attempt,1);
 assert.equal((await s.owner('/api/admin/orders/'+o.id+'/shipmozo/book',{...parcel,courierId:'7',expectedRevision:cleared.ops_revision})).status,200);
 assert.equal(sm.calls.filter(x=>x.path==='/push-order').at(-1).body.order_id,cleared.ref+'-R1');
});
test('reply parsing tolerates other field names and status wording',()=>{
 assert.deepEqual(rateOptions({couriers:[{id:'5',name:'Ekart',rate:'60'},{id:'x',name:'bad'},{courier_id:2,courier:'Blue Dart'}]}).map(r=>[r.courierId,r.name,r.pricePaise]),[['5','Ekart',6000],['2','Blue Dart',null]]);
 for(const [s,stage] of [['Delivered','delivered'],['Out For Delivery','shipped'],['In Transit','shipped'],['Picked Up','shipped'],['Pickup Pending',null],['Pickup Scheduled',null],['Manifested',null],['RTO Delivered',null],['Undelivered',null],['Cancelled',null],['',null]])assert.equal(stageFor(s),stage,s);
 const body=pushBody({customer:JSON.stringify({name:'A B',phone:'919876543210',line1:'1 Road',city:'Pune',state:'MH',postcode:'411001'}),lines:JSON.stringify([{id:'p1',name:'Monarch',brand:'Mehas',qty:2,unitPaise:350000}]),created_at:Date.parse('2026-11-26T20:00:00Z')},'DD-1','5',{weight:900,length:15,width:10,height:8});
 assert.equal(body.consignee_phone,9876543210);assert.equal(body.order_date,'2026-11-27','order date is India time');assert.deepEqual(body.product_detail[0],{name:'Mehas Monarch',sku_number:'p1',quantity:2,discount:'',hsn:'3303',unit_price:3500,product_category:'Other'});
 assert.equal(defaultParcelGrams([{qty:2,format:'Full bottle'},{qty:1,format:'Decant'}]),1100);
});
