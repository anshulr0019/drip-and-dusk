import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {maisonProducts,mergeMaisonProducts} from '../dist/maison-products.mjs';
import {defaults,migrateCatalogue,validateProduct,inStock,filterProducts} from '../dist/core.mjs';
import {prepareProduct} from '../backend/catalogue.mjs';
import {verifiedForFinder} from '../dist/scent-matching.mjs';
import {setup} from './support.mjs';
const request=JSON.parse(readFileSync(new URL('../research/maison-alhambra/requested-products.json',import.meta.url)));
test('all 92 requested bottles preserve the exact prices, nine-bottle stock and 33 unavailable entries',()=>{
 assert.equal(maisonProducts.length,92);assert.equal(new Set(maisonProducts.map(p=>p.id)).size,92);
 assert.equal(maisonProducts.filter(inStock).length,59);assert.equal(maisonProducts.filter(p=>!p.available).length,33);
 for(const [i,p] of maisonProducts.entries()){
  assert.equal(p.price,request[i].price,p.name);assert.equal(p.quantity,request[i].quantity,p.name);
  assert.equal(p.available,p.quantity>0,p.name);assert.equal(p.enquiryOnly,false);assert.equal(p.format,'Full bottle');
  if(request[i].requestedSize)assert.equal(p.size,request[i].requestedSize,p.name);
  assert.equal(validateProduct(p),'',p.name);assert(existsSync(new URL('../dist/'+p.image,import.meta.url)),p.name);
  assert(p.description.length>=40,p.name);assert(p.publishedSizes.length&&p.concentration&&p.family&&p.pairing,p.name);
  assert(p.noteSources.length,p.name);assert(p.notePyramid||p.signatureNotes?.length,p.name);
  assert.equal(prepareProduct(p).notes,p.notes,p.name);
  for(const source of p.noteSources)assert.equal(new URL(source.url).protocol,'https:');
  if(!p.finderVerified){assert(p.notesCaveat,p.name);assert.equal(verifiedForFinder(p),false,p.name);}
 }
 assert.equal(defaults().products.length,170);
});
test('the one-time browser addition preserves existing owner changes and later deletions',()=>{
 const owned={...maisonProducts[0],price:777,quantity:3,available:false,hidden:true,image:'data:image/jpeg;base64,eA=='};
 const merged=mergeMaisonProducts([owned]);assert.equal(merged.length,92);assert.equal(merged[0],owned);
 const before={...defaults(),catalogueRevision:7,products:[owned]};const after=migrateCatalogue(before);
 assert.equal(after.products.length,92);assert.equal(after.products[0],owned);assert.equal(after.catalogueRevision,8);
 const removed={...after,products:after.products.slice(1)};assert.equal(migrateCatalogue(removed),removed);
});
test('production insert is additive and replay-safe, preserving reservations and existing stock',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE products(id TEXT PRIMARY KEY,data TEXT NOT NULL,price_paise INTEGER,quantity INTEGER,held INTEGER DEFAULT 0,enabled INTEGER,revision INTEGER DEFAULT 1)');
 const p=maisonProducts[0];db.prepare('INSERT INTO products VALUES(?,?,77700,4,2,1,9)').run(p.id,JSON.stringify({...p,price:777}));
 db.prepare('INSERT INTO products VALUES(?,?,10000,5,1,1,2)').run('owner-custom',JSON.stringify({name:'Owner fragrance'}));
 const sql=readFileSync(new URL('../backend/migrations/0012_maison_alhambra_catalogue.sql',import.meta.url),'utf8');db.exec(sql);db.exec(sql);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n,93);
 const row=db.prepare('SELECT * FROM products WHERE id=?').get(p.id);
 assert.equal(row.price_paise,77700);assert.equal(row.quantity,4);assert.equal(row.held,2);assert.equal(row.revision,9);assert.equal(JSON.parse(row.data).price,777);
 assert.equal(db.prepare('SELECT held FROM products WHERE id=?').get('owner-custom').held,1);
 for(const item of maisonProducts.slice(1)){
  const row=db.prepare('SELECT * FROM products WHERE id=?').get(item.id);
  assert.equal(row.quantity,item.quantity,item.name);assert.equal(row.price_paise,item.price*100,item.name);assert.equal(row.enabled,item.available?1:0,item.name);
 }
 db.close();
});
test('checkout accepts a stocked new bottle and refuses an N/A bottle',async t=>{
 const s=setup(t),stocked=maisonProducts.find(inStock),sold=maisonProducts.find(p=>!p.available);
 const q=await s.request('/api/checkout/quote',{method:'POST',body:{basket:[{id:stocked.id,qty:1}],postcode:'411001'}});
 assert.equal(q.status,200);assert.equal(q.data.subtotalPaise,stocked.price*100);
 const out=await s.request('/api/checkout/quote',{method:'POST',body:{basket:[{id:sold.id,qty:1}],postcode:'411001'}});
 assert.equal(out.status,400);assert.match(out.data.error,/unavailable/i);
 const tooMany=await s.request('/api/checkout/quote',{method:'POST',body:{basket:[{id:stocked.id,qty:10}],postcode:'411001'}});
 assert.equal(tooMany.status,400);
});
test('our edit lists buyable bottles first and keeps the curated order within each group',()=>{
 const list=filterProducts(defaults().products,{sort:'curated'}),n=list.filter(inStock).length;
 assert(n>=59);assert(list.slice(0,n).every(inStock));assert(!list.slice(n).some(inStock));
 for(const part of [list.slice(0,n),list.slice(n)])assert.deepEqual(part.map(p=>p.order),[...part.map(p=>p.order)].sort((a,b)=>a-b));
});
