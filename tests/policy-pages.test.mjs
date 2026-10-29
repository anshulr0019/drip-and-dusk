import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pages,render} from '../scripts/policy-pages.mjs';
import {applyStore,deliveryText} from '../dist/policy.mjs';
import {prepareStoreFields} from '../dist/store-settings.mjs';
import {createHandler} from '../backend/worker.mjs';
const ids=['privacy','terms','refunds','shipping','contact'];
test('all five policy pages Razorpay reviews are published and match their generator',async()=>{
 assert.deepEqual(Object.keys(pages),ids);
 for(const id of ids){const html=await readFile(new URL(`../dist/policies/${id}.html`,import.meta.url),'utf8');assert.equal(html,render(id),'Run node scripts/policy-pages.mjs after editing policy wording.');for(const other of ids)assert.match(html,new RegExp(`href="/${other}"`));assert.doesNotMatch(html,/(?<![Mm]a)demo|sample|lorem/i);}
 const home=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');for(const id of ids)assert.match(home,new RegExp(`href="/${id}"`));
});
function fakeDoc(html){
 const els=[...html.matchAll(/<(\w+)([^>]*)>/g)].map(([,tag,attrs])=>{const dataset={},attr={};for(const [,k,v=''] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)){attr[k]=v;if(k.startsWith('data-'))dataset[k.slice(5).replace(/-(\w)/g,(_,c)=>c.toUpperCase())]=v;}return {tag,attr,dataset,hidden:false,textContent:'',setAttribute(k,v){attr[k]=v},removeAttribute(k){delete attr[k]}};});
 const select=q=>{const key=q.slice(6,-1).replace(/-(\w)/g,(_,c)=>c.toUpperCase());return els.filter(e=>key in e.dataset)};
 return {querySelectorAll:select};
}
test('owner details fill the pages, and details not yet provided are hidden instead of left blank',()=>{
 const doc=fakeDoc(render('contact'));applyStore(doc,{storeName:'Drip & Dusk',supportEmail:'care@dripdusk.in',supportPhone:'919876543210'});
 const store=doc.querySelectorAll('[data-store]'),lines=doc.querySelectorAll('[data-store-line]');
 const email=store.find(e=>e.dataset.store==='supportEmail'&&e.dataset.storeHref);assert.equal(email.textContent,'care@dripdusk.in');assert.equal(email.attr.href,'mailto:care@dripdusk.in');
 assert.equal(store.find(e=>e.dataset.storeHref==='tel').attr.href,'tel:+919876543210');
 assert.equal(lines.find(e=>e.dataset.storeLine==='businessAddress').hidden,true);assert.equal(lines.find(e=>e.dataset.storeLine==='supportEmail').hidden,false);
 assert.equal(doc.querySelectorAll('[data-store-missing]')[0].hidden,true);
 const empty=fakeDoc(render('contact'));applyStore(empty,{});assert.equal(empty.querySelectorAll('[data-store-missing]')[0].hidden,false);
 const insta=fakeDoc(render('contact'));applyStore(insta,{instagramUrl:'javascript:alert(1)'});assert.equal(insta.querySelectorAll('[data-store-href]').find(e=>e.dataset.storeHref==='url').attr.href,undefined);
});
test('shipping page states the same delivery charge checkout uses',()=>{
 assert.match(deliveryText({feePaise:9900,freeAbovePaise:300000}),/₹99 per order.*₹3,000 or more ship free/);
 assert.match(deliveryText({feePaise:0,freeAbovePaise:null}),/free on every order/);assert.doesNotMatch(deliveryText({feePaise:5000,freeAbovePaise:null}),/ship free/);
});
test('business settings accept the legal name, phone and grievance officer and reject a malformed phone',()=>{
 const out=prepareStoreFields({legalName:'Drip and Dusk Fragrances',supportPhone:'919876543210',grievanceOfficer:'A. Kumar'});assert.equal(out.supportPhone,'919876543210');assert.equal(out.grievanceOfficer,'A. Kumar');
 for(const supportPhone of ['+91 98765 43210','98765','0123456789'])assert.throws(()=>prepareStoreFields({supportPhone}),/support phone/);
});
test('clean policy URLs resolve on both Vercel and the Worker',async()=>{
 const routes=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8')).routes,route=routes.find(r=>r.dest==='/policies/$1.html');
 assert(routes.indexOf(route)<routes.findIndex(r=>r.handle==='filesystem'));for(const id of ids)assert.match('/'+id,new RegExp('^'+route.src+'$'));
 let asked;const env={ASSETS:{fetch:r=>{asked=new URL(r.url).pathname;return new Response('ok')}}};
 for(const id of ids){await createHandler()(new Request('https://shop.test/'+id),env);assert.equal(asked,`/policies/${id}.html`);}
 await createHandler()(new Request('https://shop.test/app.mjs'),env);assert.equal(asked,'/app.mjs');
});
