import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {defaults,validateProduct,sizeLabel,catalogueDisplay,enquiryMessage} from '../dist/core.mjs';
import {prepareProduct} from '../backend/catalogue.mjs';
import {quoteCheckout,quoteFingerprint,previewShipping} from '../dist/commerce-model.mjs';
import {packingSlip} from '../dist/owner-orders.mjs';
import {alertText} from '../backend/owner-alerts.mjs';
import {LocalD1} from '../backend/local-db.mjs';
import {createHandler} from '../backend/worker.mjs';

const product=()=>({...defaults().products[0],id:'sample-discovery-kit',group:'sample-discovery-kit',name:'Sample discovery kit',format:'Discovery kit',size:10,reference:null,price:1000,quantity:9,available:true,packLabel:'5 × 2ml discovery kit',packContents:['Sample citrus Eau de Parfum 2ml','Sample floral Eau de Parfum 2ml']});
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('new formats validate without changing full bottles, decants or existing catalogue grouping',()=>{
 for(const format of ['Full bottle','Decant','Gift set','Discovery kit','Attar'])assert.equal(validateProduct({...product(),format}),'');
 assert.match(validateProduct({...product(),format:'Unknown'}),/valid format/);
 const grouped=[product(),{...product(),id:'second-kit'}];
 assert.equal(catalogueDisplay(grouped,'all').length,1);
 assert.equal(catalogueDisplay(grouped,'Discovery kit').length,2);
 assert.equal(sizeLabel(product()),'5 × 2ml discovery kit');
 assert.equal(sizeLabel({size:100}),'100 ml');
 assert.equal(sizeLabel({size:null}),'Size to confirm');
});

test('owner product preparation preserves trimmed pack metadata and rejects HTML, wrong types and excessive contents',()=>{
 const p=prepareProduct({...product(),packLabel:'  5 × 2ml discovery kit  ',packContents:[' Citrus 2ml ',' Floral 2ml ']});
 assert.equal(p.packLabel,'5 × 2ml discovery kit');assert.deepEqual(p.packContents,['Citrus 2ml','Floral 2ml']);
 for(const patch of [{packLabel:'<img src=x>'},{packLabel:'a'.repeat(121)},{packLabel:42},{packLabel:'line\nline'},{packContents:['<script>bad</script>']},{packContents:['a'.repeat(161)]},{packContents:Array(13).fill('2ml')},{packContents:[' ']},{packContents:[{}]},{packContents:'2ml'}]){
  assert.throws(()=>prepareProduct({...product(),...patch}),undefined,JSON.stringify(patch));
 }
 assert.equal(validateProduct({...product(),packLabel:'a'.repeat(120),packContents:Array(12).fill('a'.repeat(160))}),'');
});

test('checkout snapshots pack contents independently and invalidates a quote if the advertised pack changes',()=>{
 const p=product(),q=quoteCheckout([p],[{id:p.id,qty:2}],'411001',previewShipping),before=quoteFingerprint(q);
 assert.equal(q.lines[0].packLabel,p.packLabel);assert.deepEqual(q.lines[0].packContents,p.packContents);
 p.packContents[0]='Changed sample 2ml';p.packLabel='Different kit';
 assert.equal(q.lines[0].packContents[0],'Sample citrus Eau de Parfum 2ml');assert.equal(quoteFingerprint(q),before);
 const changed=quoteCheckout([p],[{id:p.id,qty:2}],'411001',previewShipping);assert.notEqual(quoteFingerprint(changed),before);
});

test('packing slips, enquiries and owner alerts identify a discovery pack and escape supplied text',()=>{
 const p=product(),q=quoteCheckout([p],[{id:p.id,qty:1}],'411001',previewShipping);
 const slip=packingSlip({ref:'DD-SAMPLE',created_at:1800000000000,lines:[{...q.lines[0],packContents:['Sample <b>2ml</b>']}],customer:{}},{},esc);
 assert.match(slip,/5 × 2ml discovery kit/);assert.match(slip,/Sample &lt;b&gt;2ml&lt;\/b&gt;/);assert.doesNotMatch(slip,/₹/);
 assert.match(enquiryMessage([p],[{id:p.id,qty:1}]),/5 × 2ml discovery kit · Discovery kit/);
 const text=alertText('upi_order',{ref:'DD-SAMPLE',mode:'live',total_paise:q.totalPaise,lines:JSON.stringify(q.lines)},{PUBLIC_ORIGIN:'https://example.test'});
 assert.match(text,/5 × 2ml discovery kit · Discovery kit × 1/);assert.doesNotMatch(text,/10 ml/);
});

test('server owner save, catalogue, checkout and private tracking retain pack snapshots after later edits',async t=>{
 const folder=new URL('../backend/migrations/',import.meta.url),names=(await readdir(folder)).filter(n=>n.endsWith('.sql')).sort();
 const DB=new LocalD1();DB.exec((await Promise.all(names.map(n=>readFile(new URL(n,folder),'utf8')))).join('\n'));t.after(()=>DB.close());
 const origin='http://127.0.0.1:4187',owner=crypto.randomUUID()+crypto.randomUUID(),env={DB,COMMERCE_MODE:'manual_demo',PUBLIC_ORIGIN:origin,TRACKING_SECRET:crypto.randomUUID()+crypto.randomUUID(),ADMIN_SECRET:owner};
 const handler=createHandler({now:()=>1800000000000,fetchExternal:async()=>{throw Error('External calls disabled');}});
 const request=async(path,{method='GET',body,admin=false,token}={})=>{
  const response=await handler(new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(admin?{Authorization:'Bearer '+owner}:token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {status:response.status,data:await response.json()};
 };
 const p=product(),save=await request('/api/admin/products/'+p.id,{method:'PUT',admin:true,body:{product:p,expectedRevision:null}});assert.equal(save.status,200,JSON.stringify(save.data));
 const publicProduct=(await request('/api/catalogue')).data.products.find(x=>x.id===p.id);assert.deepEqual(publicProduct.packContents,p.packContents);
 const basket=[{id:p.id,qty:1}],quote=await request('/api/checkout/quote',{method:'POST',body:{basket,postcode:'411001'}});assert.equal(quote.status,200);assert.equal(quote.data.lines[0].packLabel,p.packLabel);
 const order=await request('/api/orders',{method:'POST',body:{basket,quoteId:quote.data.quoteId,requestId:crypto.randomUUID(),whatsappConsent:false,address:{name:'Sample Buyer',phone:'9999999999',line1:'123 Example Street',city:'Pune',state:'Maharashtra',postcode:'411001'}}});assert.equal(order.status,201,JSON.stringify(order.data));
 const row=await DB.prepare('SELECT data,revision FROM products WHERE id=?').bind(p.id).first(),current=JSON.parse(row.data);
 assert.equal((await request('/api/admin/products/'+p.id,{method:'PUT',admin:true,body:{product:{...current,packLabel:'Revised kit label',packContents:['Different sample 2ml']},expectedRevision:row.revision}})).status,200);
 const tracked=await request('/api/orders/'+order.data.id,{token:order.data.token});assert.equal(tracked.status,200);assert.equal(tracked.data.lines[0].packLabel,p.packLabel);assert.deepEqual(tracked.data.lines[0].packContents,p.packContents);
});
