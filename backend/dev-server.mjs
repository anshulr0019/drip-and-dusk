import http from 'node:http';
import {readFile,stat,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {LocalD1} from './local-db.mjs';
import {seedSQL} from './seed.mjs';
import {createHandler} from './worker.mjs';
const root=fileURLToPath(new URL('../dist',import.meta.url)),port=Number(process.env.PORT||4173),origin='http://127.0.0.1:'+port;
const db=new LocalD1(process.env.LOCAL_DB_PATH||':memory:');
db.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
for(const name of (await readdir(new URL('migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
 if(db.sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name))continue;
 const oldOrders=name==='0001_orders.sql'&&db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'").get();
 if(!oldOrders)db.exec(await readFile(new URL('migrations/'+name,import.meta.url),'utf8'));
 db.sqlite.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
}
db.exec(seedSQL());
const env={...process.env,DB:db,COMMERCE_MODE:process.env.COMMERCE_MODE||'preview',PUBLIC_ORIGIN:origin,TRACKING_SECRET:process.env.TRACKING_SECRET||crypto.randomUUID()+crypto.randomUUID(),ADMIN_SECRET:process.env.ADMIN_SECRET||'local-owner-key-for-development-only',ASSETS:{async fetch(request){const url=new URL(request.url),path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(path!==root&&!path.startsWith(root+sep))return new Response('Not found',{status:404});try{if(!(await stat(path)).isFile())return new Response('Not found',{status:404});return new Response(await readFile(path),{headers:{'Content-Type':({'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4'})[extname(path)]||'application/octet-stream'}})}catch{return new Response('Not found',{status:404})}}}};
const handler=createHandler(),server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const payload=Buffer.concat(chunks),request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(payload.length?{body:payload,duplex:'half'}:{})});const response=await handler(request,env,{waitUntil:p=>p.catch(()=>{})});const outgoing=Object.fromEntries(response.headers);const cookies=response.headers.getSetCookie();if(cookies.length)outgoing['set-cookie']=cookies;res.writeHead(response.status,outgoing);res.end(Buffer.from(await response.arrayBuffer()))}catch{res.writeHead(500);res.end('Local development server error')}});
server.listen(port,'127.0.0.1',()=>console.log(`Checkout development server: ${origin} (${env.COMMERCE_MODE}; no real payments/messages by default)`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0)}));
