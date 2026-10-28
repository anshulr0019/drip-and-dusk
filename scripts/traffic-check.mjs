import {connect as http2Connect} from 'node:http2';
// Controlled, read-only first-visit traffic check. Never creates orders or starts OAuth.
import {writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const base=process.argv[2]||'https://drip-and-dusk-nine.vercel.app';
if(!['https://drip-and-dusk-nine.vercel.app','http://127.0.0.1:4176'].includes(base))throw Error('Use the owned storefront or its local performance preview.');
const visitors=Number(process.argv[3]||150),maxInflight=Number(process.argv[4]||300);
if(!Number.isInteger(visitors)||visitors<1||visitors>150||!Number.isInteger(maxInflight)||maxInflight<1||maxInflight>300)throw Error('This bounded check supports up to 150 visitors and 300 in-flight requests.');
const useHTTP2=process.argv[5]==='h2',includeFilm=process.argv[6]!=='critical',sessions=[];
let nextSession=0,connectionSetupMs=0;
const records=[],failures=[],queue=[];let active=0,peak=0,bytes=0,aborted=false,activeVisitors=0,peakVisitors=0;
const started=performance.now();
if(useHTTP2){
 if(!base.startsWith('https:'))throw Error('The HTTP/2 check requires the published HTTPS storefront.');
 for(let i=0;i<4;i++)sessions.push(await new Promise((resolve,reject)=>{const session=http2Connect(base);const timer=setTimeout(()=>{session.destroy();reject(Error('HTTP/2 connection setup timed out'));},15000);session.once('connect',()=>{clearTimeout(timer);session.on('error',()=>{});resolve(session);});session.once('error',e=>{clearTimeout(timer);reject(e);});}));
 connectionSetupMs=performance.now()-started;
}
async function transportFetch(path,cookie){
 const headers={'user-agent':'DripAndDusk-OwnedSiteTrafficCheck/1.0',...(cookie?{cookie}:{})};
 if(!useHTTP2)return fetch(base+path,{signal:AbortSignal.timeout(25000),headers});
 const session=sessions[nextSession++%sessions.length],stream=session.request({':method':'GET',':path':path,...headers},{signal:AbortSignal.timeout(25000)});
 stream.setTimeout(25000,()=>stream.destroy(Error('HTTP/2 stream timeout')));
 const responseHeaders=new Promise((resolve,reject)=>{stream.once('response',resolve);stream.once('error',reject);});stream.end();const result=await responseHeaders;
 return {status:Number(result[':status']),body:stream,headers:{get:key=>result[key.toLowerCase()]||null,getSetCookie:()=>{const v=result['set-cookie'];return Array.isArray(v)?v:v?[v]:[];}}};
}
async function slot(fn){if(active>=maxInflight)await new Promise(resolve=>queue.push(resolve));active++;peak=Math.max(peak,active);try{return await fn()}finally{active--;queue.shift()?.()}}
async function get(path,cookie=''){
 const queued=performance.now();return slot(async()=>{
  if(aborted)return null;const start=performance.now();let status=0,bodyBytes=0,ttfb=0,text='',setCookie='';
  try{const r=await transportFetch(path,cookie);status=r.status;ttfb=performance.now()-start;setCookie=r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
   const collect=path==='/api/catalogue'||path==='/';const chunks=[];
   for await(const chunk of r.body){bodyBytes+=chunk.length;if(collect)chunks.push(chunk);}
   if(collect)text=Buffer.concat(chunks).toString('utf8');
   if(status!==200||bodyBytes===0)throw Error('HTTP '+status);
   records.push({path,status,ttfbMs:ttfb,durationMs:performance.now()-start,queueMs:start-queued,bytes:bodyBytes,cache:r.headers.get('x-vercel-cache')||r.headers.get('cf-cache-status')||null});
  }catch(e){failures.push({path,status,error:e.name==='TimeoutError'?'timeout':e.message,code:e.cause?.code||e.code||null,detail:e.cause?.message||null});records.push({path,status,ttfbMs:ttfb,durationMs:performance.now()-start,queueMs:start-queued,bytes:bodyBytes,error:true});}
  bytes+=bodyBytes;if(bytes>512*1024*1024||records.length>=100&&failures.length/records.length>.05)aborted=true;
  return {text,setCookie};
 });
}
const modules=['/style.css','/app.mjs','/core.mjs','/instagram-products.mjs','/fragrance-notes.mjs','/scent-matching.mjs','/scent-finder.mjs','/checkout.mjs','/commerce-model.mjs','/account.mjs','/hero-video.mjs','/discovery.mjs','/commerce-config.mjs'];
const journeys=[];
await Promise.all(Array.from({length:visitors},async()=>{
 const start=performance.now();activeVisitors++;peakVisitors=Math.max(peakVisitors,activeVisitors);
 try{const page=await get('/');if(!page||aborted)return;
  const results=await Promise.all([...modules,'/api/config','/api/catalogue','/api/auth/config'].map(path=>get(path)));
  const catalogue=results[modules.length+1],auth=results[modules.length+2];
  const products=catalogue?.text?JSON.parse(catalogue.text).products:[];
  const images=[...new Set(products.slice(0,8).map(p=>p.image).filter(path=>path?.startsWith('assets/')))];
  const poster=page.text.match(/as="image" href="([^"]+)"/)?.[1]||'assets/hero-poster.jpg';
  const video=page.text.match(/data-src="([^"]+\.mp4[^"\s]*)"/)?.[1]||'assets/fragrance-loop.mp4';
  await Promise.all([get('/api/auth/session',auth?.setCookie||''),...images.map(path=>get('/'+path)),get('/'+poster),...(includeFilm?[get('/'+video)]:[])]);
 }catch(e){failures.push({path:'visitor',status:0,error:e.message});}finally{activeVisitors--;journeys.push(performance.now()-start);}
}));
const round=n=>Math.round(n*10)/10,percentile=(values,p)=>{const a=[...values].sort((a,b)=>a-b);return round(a[Math.max(0,Math.ceil(a.length*p)-1)]||0)};
const summary=rows=>({requests:rows.length,errors:rows.filter(r=>r.error).length,p50TTFBms:percentile(rows.map(r=>r.ttfbMs),.5),p95TTFBms:percentile(rows.map(r=>r.ttfbMs),.95),p95CompleteMs:percentile(rows.map(r=>r.durationMs),.95)});
sessions.forEach(s=>s.close());
const report={protocol:useHTTP2?'HTTP/2 with four multiplexed TLS connections':'Node fetch with HTTP/1 connections',connectionSetupMs:round(connectionSetupMs),generatedAt:new Date().toISOString(),base,scenario:'One first visit per simulated guest: HTML, CSS/modules, public configuration/catalogue/auth session, hero poster'+(includeFilm?'/full background video':' (optional background film excluded)')+' and first eight product images. No retries.',visitors,peakActiveVisitors:peakVisitors,maxInflight,peakInflight:peak,durationSeconds:round((performance.now()-started)/1000),downloadedMB:round(bytes/1e6),aborted,errors:failures.length,overall:summary(records),api:summary(records.filter(r=>r.path.startsWith('/api/'))),static:summary(records.filter(r=>!r.path.startsWith('/api/'))),p95VisitorCompleteMs:percentile(journeys,.95),cacheHits:records.filter(r=>r.cache==='HIT').length,failures:failures.slice(0,30),limitations:['Single generator and network location; shared client bandwidth and request queuing affect timings. HTTP/2 mode uses four established connections, not 150 independent TLS handshakes.','HTTP requests only; does not measure browser rendering, Core Web Vitals or low-end phones.','Does not test successful Google sign-ins, payment approvals, live payments, WhatsApp or courier providers.','One bounded burst is evidence for this scenario, not an uptime or unlimited-capacity guarantee.']};
await mkdir('output/performance',{recursive:true});await writeFile('output/performance/traffic-'+visitors+(includeFilm?'':'-critical')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failures.length||aborted)process.exitCode=1;
