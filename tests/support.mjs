// Shared fixture for the order-safety tests: an in-memory D1 with every migration, a controllable clock and a Worker handler.
import {readFile,readdir} from 'node:fs/promises';
import {LocalD1} from '../backend/local-db.mjs';
import {seedSQL} from '../backend/seed.mjs';
import {createHandler,hmac} from '../backend/worker.mjs';
const folder=new URL('../backend/migrations/',import.meta.url);
export const schema=(await Promise.all((await readdir(folder)).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL(n,folder),'utf8')))).join('\n');
export const origin='http://127.0.0.1:4190',secret=()=>crypto.randomUUID()+crypto.randomUUID();
let seq=0;export const nextPhone=()=>'98'+String(20000000+ ++seq);
export const customer=(phone=nextPhone())=>({name:'Asha Rao',phone,line1:'22 Private Lane',city:'Pune',state:'Maharashtra',postcode:'411001'});
export function setup(t,{mode='manual_demo',env:extra={},fetchExternal}={}){
 const DB=new LocalD1();DB.exec(schema);DB.exec(seedSQL());t.after(()=>DB.close());
 let clock=1800000000000;const waits=[],ownerKey=secret();
 const env={DB,COMMERCE_MODE:mode,PUBLIC_ORIGIN:origin,TRACKING_SECRET:secret(),ADMIN_SECRET:ownerKey,...(mode==='live'?{MERCHANT_UPI_ID:'dripdusk.store@okaxis',MERCHANT_PAYEE_NAME:'Drip & Dusk'}:{}),...extra};
 const handler=createHandler({now:()=>clock,fetchExternal:fetchExternal||(async()=>{throw Error('No external calls expected')})});
 const request=async(path,{method='GET',body,token,asOwner=false,raw,headers={}}={})=>{
  const r=await handler(new Request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(asOwner?{Authorization:'Bearer '+ownerKey}:token?{Authorization:'Bearer '+token}:{}),...headers},...(method!=='GET'?{body:raw??JSON.stringify(body||{})}:{})}),env,{waitUntil:p=>waits.push(p)});
  const type=r.headers.get('Content-Type')||'';return {status:r.status,headers:r.headers,data:type.includes('json')?await r.json():await r.text()};
 };
 const bag=[{id:'khamrah-bottle',qty:1}];
 const quote=async(basket=bag)=>(await request('/api/checkout/quote',{method:'POST',body:{basket,postcode:'411001'}})).data;
 const order=async({phone,headers,basket=bag,paymentMethod='manual_upi',consent=false,requestId=crypto.randomUUID()}={})=>{const q=await quote(basket);return request('/api/orders',{method:'POST',headers,body:{quoteId:q.quoteId,basket,address:customer(phone),whatsappConsent:consent,requestId,paymentMethod}})};
 const owner=(path,body={},method='POST')=>request(path,{method,body,asOwner:true});
 const row=id=>DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
 const stock=(id='khamrah-bottle')=>DB.prepare('SELECT quantity,held FROM products WHERE id=?').bind(id).first();
 const count=(sql,...a)=>DB.prepare(sql).bind(...a).first().then(r=>r.n);
 const submitUTR=(o,reference='UTR123456789')=>request('/api/orders/'+o.id+'/payment-submission',{method:'POST',token:o.token,body:{reference}});
 const approve=(o,{amountPaise=o.amount,bankReference='BANK'+crypto.randomUUID().slice(0,8)}={})=>owner('/api/admin/orders/'+o.id+'/approve-payment',{checkedBank:true,amountPaise,bankReference});
 return {DB,env,request,quote,order,owner,row,stock,count,submitUTR,approve,bag,handler,waits,ownerKey,advance:ms=>clock+=ms,now:()=>clock};
}
export {hmac};
