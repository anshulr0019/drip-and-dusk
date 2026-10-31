// The browser security headers have one source (backend/security-headers.mjs); every copy must match it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {securityHeaders} from '../backend/security-headers.mjs';
import {createHandler} from '../backend/worker.mjs';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('vercel.json applies the same headers first, on every path, and keeps routing',async()=>{
 const routes=JSON.parse(await read('../vercel.json')).routes;
 assert.deepEqual(routes[0],{src:'/(.*)',headers:securityHeaders,continue:true});
 assert(routes.some(r=>r.handle==='filesystem'));assert(routes.some(r=>r.src==='/api/(.*)'));
});
test('dist/_headers repeats the same block for workers.dev static assets',async()=>{
 const text=await read('../dist/_headers'),lines=text.trim().split('\n');assert.equal(lines[0],'/*');
 assert.deepEqual(Object.fromEntries(lines.slice(1).map(l=>{const [,k,v]=l.match(/^\s+([\w-]+):\s(.*)$/);return [k,v]})),securityHeaders);
});
test('the policy is strict: no framing, no eval, same-origin scripts only',()=>{
 const csp=securityHeaders['Content-Security-Policy'],directive=n=>csp.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+' '));
 assert.equal(directive('frame-ancestors'),"frame-ancestors 'none'");assert.equal(directive('script-src'),"script-src 'self'");assert.doesNotMatch(csp,/unsafe-eval/);
 assert.equal(directive('object-src'),"object-src 'none'");assert.equal(directive('base-uri'),"base-uri 'none'");assert.doesNotMatch(directive('default-src'),/\*|https:/);
 assert.equal(securityHeaders['X-Frame-Options'],'DENY');assert.equal(securityHeaders['X-Content-Type-Options'],'nosniff');assert.equal(securityHeaders['Referrer-Policy'],'no-referrer');
});
test('Worker page responses, including clean policy URLs, carry the headers',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html','X-Frame-Options':'SAMEORIGIN'}})}},handler=createHandler();
 for(const path of ['/','/privacy','/terms/','/app.mjs']){const r=await handler(new Request('https://shop.test'+path),env);for(const [k,v] of Object.entries(securityHeaders))assert.equal(r.headers.get(k),v,path+' '+k);assert.equal(r.headers.get('Content-Type'),'text/html');}
});
test('pages ship no inline scripts or inline event handlers, which the policy would block',async()=>{
 const pages=['../dist/index.html',...(await readdir(new URL('../dist/policies/',import.meta.url))).map(n=>'../dist/policies/'+n)];
 for(const p of pages){const html=await read(p);for(const [tag] of html.matchAll(/<script\b[^>]*>/gi))assert.match(tag,/\bsrc="/,p+' '+tag);assert.doesNotMatch(html.replace(/<script\b[^>]*src=[^>]*><\/script>/gi,''),/<script\b/i,p);assert.doesNotMatch(html,/\son[a-z]+\s*=/i,p);assert.doesNotMatch(html,/javascript:/i,p);}
});
