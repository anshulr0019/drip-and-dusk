// Loading-speed guarantees: parallel module fetches, mobile film, and caching that never shares private responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {LocalD1} from '../backend/local-db.mjs';
import {seedSQL} from '../backend/seed.mjs';
import {createHandler} from '../backend/worker.mjs';
import {initHeroVideo} from '../dist/hero-video.mjs';
import {moduleGraph} from '../scripts/module-preloads.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('index.html preloads exactly the modules app.mjs imports, so no import waterfall remains',async()=>{
 const html=await read('dist/index.html'),preloaded=[...html.matchAll(/rel="modulepreload" href="([^"]+)"/g)].map(m=>m[1]).sort();
 assert.deepEqual(preloaded,moduleGraph(),'Run node scripts/module-preloads.mjs after changing imports.');
});
test('phones load the 480p film and wider screens keep the full film',async()=>{
 const html=await read('dist/index.html'),mobile=html.match(/data-src-mobile="(assets\/[^"?]+)/)[1];
 assert(((await stat(new URL('../dist/'+mobile,import.meta.url))).size)<(await stat(new URL('../dist/assets/fragrance-loop.mp4',import.meta.url))).size/2);
 for(const [innerWidth,expected] of [[390,'mobile.mp4'],[1400,'full.mp4']]){
  const video=Object.assign(new EventTarget(),{paused:true,dataset:{src:'full.mp4',srcMobile:'mobile.mp4'},load(){},pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}});
  const button={setAttribute(){}},hero={classList:{add(){},remove(){},toggle(){}},closest:()=>null,getBoundingClientRect:()=>({top:0,bottom:400})};
  const doc=Object.assign(new EventTarget(),{hidden:false,body:{classList:{toggle(){}}},querySelector:s=>s==='#hero-video'?video:s==='.hero'?hero:button});
  initHeroVideo({document:doc,window:{innerWidth,innerHeight:800,navigator:{},matchMedia:()=>Object.assign(new EventTarget(),{matches:false})}});
  assert.equal(video.src,expected);
 }
});
test('only the public catalogue and config are edge-cacheable; private and write endpoints stay no-store',async t=>{
 const folder=new URL('../backend/migrations/',import.meta.url),schema=(await Promise.all((await readdir(folder)).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL(n,folder),'utf8')))).join('\n');
 const DB=new LocalD1();DB.exec(schema);DB.exec(seedSQL());t.after(()=>DB.close());
 const origin='http://127.0.0.1:4177',env={DB,COMMERCE_MODE:'manual_demo',PUBLIC_ORIGIN:origin,TRACKING_SECRET:crypto.randomUUID()+crypto.randomUUID(),ADMIN_SECRET:crypto.randomUUID()+crypto.randomUUID()},handler=createHandler();
 const get=async path=>(await handler(new Request(origin+path),env,{waitUntil:()=>{}})).headers;
 for(const path of ['/api/catalogue','/api/config']){const h=await get(path);assert.match(h.get('CDN-Cache-Control'),/max-age=\d+/);assert.equal(h.get('Set-Cookie'),null);}
 for(const path of ['/api/auth/config','/api/admin/products','/api/account/orders'])assert.equal((await get(path)).get('Cache-Control'),'no-store');
 const routes=JSON.parse(await read('vercel.json')).routes,cached=routes.find(r=>r.src.includes('catalogue')),rest=routes.find(r=>r.src==='/api/(.*)');
 assert(routes.indexOf(cached)<routes.indexOf(rest));assert.equal(cached.headers,undefined);assert.equal(rest.headers['CDN-Cache-Control'],'no-store');
});
