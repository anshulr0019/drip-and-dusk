// The Worker trusts a visitor IP only when the Vercel middleware signed it with the shared secret.
import test from 'node:test';
import assert from 'node:assert/strict';
import {clientIP} from '../backend/traffic.mjs';
import {setup,secret,hmac,customer} from './support.mjs';
import middleware,{config} from '../middleware.js';
const key=secret(),now=1800000000000,url='https://worker.test/api/orders';
const signed=async({ip='203.0.113.5',ts=now,method='POST',path='/api/orders',signWith=key,signMethod=method,signPath=path}={})=>({'x-dd-client-ip':ip,'x-dd-client-ts':String(ts),'x-dd-client-sig':await hmac(signWith,`client-ip:v1:${ip}:${ts}:${signMethod}:${signPath}`)});
const req=(headers,method='POST')=>new Request(url,{method,headers});
test('a valid signature yields the signed IP',async()=>{
 assert.deepEqual(await clientIP(req(await signed()),{PROXY_SIGNING_SECRET:key},now),{ip:'203.0.113.5',source:'signed-proxy'});
 assert.equal((await clientIP(req(await signed({ts:now-59000})),{PROXY_SIGNING_SECRET:key},now)).source,'signed-proxy');
});
test('forged, stale, wrong-path, wrong-method and unconfigured signatures fall back to cf-connecting-ip',async()=>{
 const env={PROXY_SIGNING_SECRET:key},cf={'cf-connecting-ip':'198.51.100.7'};
 const cases={forged:await signed({signWith:secret()}),stale:await signed({ts:now-61000}),future:await signed({ts:now+61000}),path:await signed({signPath:'/api/other'}),method:await signed({signMethod:'GET'}),changedIp:{...await signed(),'x-dd-client-ip':'203.0.113.99'},badTs:{...await signed(),'x-dd-client-ts':'12345'},badIp:await signed({ip:'not an ip!'}),none:{}};
 for(const [name,h] of Object.entries(cases)){const r=await clientIP(req({...h,...cf}),env,now);assert.deepEqual(r,{ip:'198.51.100.7',source:'cf-connecting-ip'},name);}
 const good={...await signed(),...cf};
 assert.equal((await clientIP(req(good),{},now)).source,'cf-connecting-ip','missing secret');
 assert.equal((await clientIP(req(good),{PROXY_SIGNING_SECRET:key.slice(0,31)},now)).source,'cf-connecting-ip','short secret');
 assert.equal((await clientIP(req({...cf,'x-forwarded-for':'1.2.3.4','x-real-ip':'1.2.3.4'}),env,now)).ip,'198.51.100.7','unsigned forwarding headers are ignored');
 assert.equal((await clientIP(new Request(url,{method:'POST'}),{},now)).ip,'local');
});
test('IPv6 addresses are bucketed by /64',async()=>{
 const ip=async(a,b)=>(await clientIP(req(await signed({ip:a})),{PROXY_SIGNING_SECRET:key},now)).ip;
 assert.equal(await ip('2001:db8:abcd:12::1'),await ip('2001:db8:abcd:12:ffff:ffff:ffff:ffff'));
 assert.notEqual(await ip('2001:db8:abcd:12::1'),await ip('2001:db8:abcd:13::1'));
 assert.equal((await clientIP(req({'cf-connecting-ip':'2001:db8::5'}),{},now)).ip,(await clientIP(req({'cf-connecting-ip':'2001:db8::9'}),{},now)).ip);
});
test('the middleware signs x-real-ip, replaces client-supplied headers and skips cached and webhook routes',async()=>{
 const saved=process.env.PROXY_SIGNING_SECRET;process.env.PROXY_SIGNING_SECRET=key;
 try{
  assert.deepEqual(config.matcher,['/api/:path*']);
  const incoming=new Request('https://shop.test/api/orders',{method:'POST',headers:{'x-real-ip':'203.0.113.5','x-forwarded-for':'9.9.9.9','x-dd-client-ip':'6.6.6.6','x-dd-client-sig':'f'.repeat(64),'content-type':'application/json'}});
  const out=await middleware(incoming);assert.equal(out.headers.get('x-middleware-next'),'1');
  const names=out.headers.get('x-middleware-override-headers').split(',');for(const n of ['x-dd-client-ip','x-dd-client-ts','x-dd-client-sig','content-type','x-real-ip'])assert(names.includes(n),n);
  const forwarded={};for(const n of names)forwarded[n]=out.headers.get('x-middleware-request-'+n);
  assert.equal(forwarded['x-dd-client-ip'],'203.0.113.5');assert.equal(forwarded['content-type'],'application/json');
  // Round trip: the Worker accepts exactly what the middleware produced, but only on the path and method that were signed.
  const atWorker=(path,method)=>new Request('https://worker.test'+path,{method,headers:forwarded});
  assert.equal((await clientIP(atWorker('/api/orders','POST'),{PROXY_SIGNING_SECRET:key},Date.now())).source,'signed-proxy');
  assert.equal((await clientIP(atWorker('/api/orders','POST'),{PROXY_SIGNING_SECRET:key},Date.now())).ip,'203.0.113.5');
  assert.equal((await clientIP(atWorker('/api/quote','POST'),{PROXY_SIGNING_SECRET:key},Date.now())).source,'cf-connecting-ip');
  // Without a valid IP the spoofed headers are blanked rather than passed on.
  const noIp=await middleware(new Request('https://shop.test/api/orders',{method:'POST',headers:{'x-dd-client-ip':'6.6.6.6','x-dd-client-sig':'f'.repeat(64)}}));
  assert.equal(noIp.headers.get('x-middleware-request-x-dd-client-ip'),'');assert.equal(noIp.headers.get('x-middleware-request-x-dd-client-sig'),'');
  const viaXff=await middleware(new Request('https://shop.test/api/orders',{method:'POST',headers:{'x-forwarded-for':'203.0.113.8, 10.0.0.1'}}));assert.equal(viaXff.headers.get('x-middleware-request-x-dd-client-ip'),'203.0.113.8');
  for(const p of ['/api/catalogue','/api/config','/api/webhooks/razorpay','/api/webhooks/courier'])assert.equal(await middleware(new Request('https://shop.test'+p,{headers:{'x-real-ip':'203.0.113.5'}})),undefined,p);
  process.env.PROXY_SIGNING_SECRET='short';assert.equal(await middleware(incoming),undefined);
  delete process.env.PROXY_SIGNING_SECRET;assert.equal(await middleware(incoming),undefined);
 }finally{if(saved===undefined)delete process.env.PROXY_SIGNING_SECRET;else process.env.PROXY_SIGNING_SECRET=saved}
});
test('limits are isolated per signed IP, and without the secret every caller shares one bucket',async t=>{
 const s=setup(t,{env:{PROXY_SIGNING_SECRET:key}}),n=s.now();
 const quoteAs=async(ip,env=s)=>{const headers=await signed({ip,ts:n,path:'/api/checkout/quote'});return (await env.request('/api/checkout/quote',{method:'POST',body:{basket:s.bag,postcode:'411001'},headers})).status};
 for(let i=0;i<60;i++)assert.equal(await quoteAs('203.0.113.1'),200);
 assert.equal(await quoteAs('203.0.113.1'),429);assert.equal(await quoteAs('203.0.113.2'),200);
 // Fail-safe: no configured secret means forged headers earn nothing and callers share the old bucket.
 const open=setup(t);let last;for(let i=0;i<61;i++)last=await open.request('/api/checkout/quote',{method:'POST',body:{basket:open.bag,postcode:'411001'},headers:{...await signed({ip:'203.0.113.'+(i%200+1),ts:open.now(),path:'/api/checkout/quote'})}});
 assert.equal(last.status,429);
});
test('Today reports only whether visitor addresses are verified, never an address',async t=>{
 const s=setup(t,{env:{PROXY_SIGNING_SECRET:key}}),n=s.now();
 const headers=await signed({ip:'203.0.113.77',ts:n,method:'GET',path:'/api/admin/summary'});
 const verified=await s.request('/api/admin/summary',{asOwner:true,headers});assert.equal(verified.data.clientIpSource,'signed-proxy');assert.doesNotMatch(JSON.stringify(verified.data),/203\.0\.113/);
 assert.equal((await s.request('/api/admin/summary',{asOwner:true})).data.clientIpSource,'cf-connecting-ip');
});
