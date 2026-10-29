import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {defaults,migrateCatalogue,inStock} from '../dist/core.mjs';
import {fragranceFacts,researchMetadata} from '../dist/fragrance-facts.mjs';
import {processNotes,notesError} from '../dist/fragrance-notes.mjs';
import {discoverScents,verifiedForFinder,recommendScents} from '../dist/scent-matching.mjs';
import {prepareProduct} from '../backend/catalogue.mjs';
const all=defaults().products.filter(p=>fragranceFacts[p.group]?.factsRevision===1),answer={occasion:'date',style:'leather',budget:'any',format:'Full bottle'};
test('every fragrance has complete sourced stages, a description and explicit evidence quality',()=>{
 assert.equal(Object.keys(fragranceFacts).length,67);
 assert.equal(Object.values(fragranceFacts).filter(f=>f.notesQuality==='manufacturer').length,64);
 for(const p of all){assert.equal(notesError(p.notePyramid),'',p.name);assert(verifiedForFinder(p),p.name);assert(!/pending verification|from the Drip & Dusk Instagram edit/.test(p.description));assert(p.description.length>45);assert(p.noteSources.length);for(const s of p.noteSources)assert.equal(new URL(s.url).protocol,'https:');assert.equal(p.factsCheckedAt,'2026-10-28');}
 const lava=all.find(p=>p.group==='rasasi-hawas-lava-gold');assert(lava.notePyramid.heart.includes('Leather'));assert(lava.notePyramid.base.includes('Caramel'));
 const tea=all.find(p=>p.group==='mykonos-inception');assert(tea.notePyramid.heart.includes('Black tea'));
});
test('browser revision upgrades pending seed data, preserving commerce, media, archives and custom owner notes',()=>{
 const pending={...all.find(p=>p.group==='rasasi-hawas-lava-gold'),notes:'Fragrance notes pending verification with the seller.',price:4567,size:150,quantity:9,enquiryOnly:false,hidden:true,image:'data:image/jpeg;base64,eA=='};
 for(const k of ['notePyramid','factsRevision','finderVerified'])delete pending[k];
 const custom={...all[0],notePyramid:{top:['Lemon'],heart:['Rose'],base:['Musk']},notes:'Lemon / Rose / Musk'};delete custom.factsRevision;
 const state={...defaults(),catalogueRevision:3,products:[pending,custom]};const next=migrateCatalogue(state);
 assert.equal(next.products.length,49);assert.equal(next.products[0].price,4567);assert.equal(next.products[0].size,150);assert.equal(next.products[0].quantity,9);assert.equal(next.products[0].hidden,true);assert.equal(next.products[0].image,pending.image);assert(next.products[0].notePyramid.heart.includes('Leather'));assert.equal(next.products[1],custom);assert.equal(migrateCatalogue(next),next);assert(!pending.notePyramid);
});
test('discovery suggestions support tea, marine and leather without implying available stock or satisfying an unknown price cap',()=>{
 for(const style of ['tea','marine','leather','spicy']){const results=discoverScents(all,{...answer,style});assert(results.length,style);assert(results.every(m=>m.product.enquiryOnly&&!inStock(m.product)&&m.notes.length));assert(results.every(m=>m.tradeOff.includes('seller confirmation')));}
 assert.deepEqual(discoverScents(all,{...answer,style:'marine'}).map(m=>m.product.group),['rasasi-hawas-nautilus']);
 assert.equal(discoverScents(all,{...answer,budget:'3000'}).length,0);assert.equal(discoverScents(all,{...answer,format:'Decant'}).length,0);
 assert.deepEqual(discoverScents(all,{...answer,style:'tea'}).map(m=>m.product.group),['mykonos-inception']);
 assert.equal(recommendScents(all,answer).length,0);
 assert(!discoverScents(all,{...answer,style:'fresh'}).some(m=>['rasasi-hawas-lava-gold','assaf-glitch','al-majed-oud-noir'].includes(m.product.group)));
 const hideTea=all.map(p=>p.group==='mykonos-inception'?{...p,hidden:true}:p);assert.equal(discoverScents(hideTea,{...answer,style:'tea'}).length,0);
});
test('saved owner note changes lose brand provenance instead of inheriting an unrelated source claim',()=>{
 const p=all.find(p=>p.group==='rasasi-hawas-lava-gold');assert.equal(prepareProduct(p).noteSources.length,2);
 const change=prepareProduct({...p,notePyramid:{top:['Lemon'],heart:['Rose'],base:['Musk']}});assert.equal(change.notes,'Lemon / Rose / Musk');assert(!change.noteSources);assert(!change.factsCheckedAt);assert.deepEqual(researchMetadata(change),{});
 const unchanged=prepareProduct({...p,quantity:0});assert.equal(unchanged.notesQuality,'manufacturer');assert.equal(unchanged.publishedSizes[0],'100 ml');
});
test('SQL backfill preserves reservations, prices, quantities, visibility and owner-written pyramids; replay is harmless',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE products(id TEXT PRIMARY KEY,data TEXT,revision INTEGER DEFAULT 1,price_paise INTEGER,quantity INTEGER,held INTEGER,enabled INTEGER)');
 const seed={...all.find(p=>p.group==='rasasi-hawas-lava-gold'),notes:'Fragrance notes pending verification with the seller.',hidden:true,image:'assets/custom.jpg'};
 for(const k of ['notePyramid','factsRevision','finderVerified'])delete seed[k];
 const custom={...all.find(p=>p.group==='mykonos-inception'),notes:'Lemon / Rose / Musk',notePyramid:{top:['Lemon'],heart:['Rose'],base:['Musk']}};delete custom.factsRevision;
 const insert=db.prepare('INSERT INTO products(id,data,price_paise,quantity,held,enabled) VALUES(?,?,123456,8,2,1)');insert.run(seed.id,JSON.stringify(seed));insert.run(custom.id,JSON.stringify(custom));
 const sql=readFileSync(new URL('../backend/migrations/0004_fragrance_facts.sql',import.meta.url),'utf8');db.exec(sql);
 const saved=db.prepare('SELECT * FROM products WHERE id=?').get(seed.id),data=JSON.parse(saved.data);assert(data.notePyramid.heart.includes('Leather'));assert.equal(data.hidden,true);assert.equal(data.image,'assets/custom.jpg');assert.equal(saved.price_paise,123456);assert.equal(saved.quantity,8);assert.equal(saved.held,2);assert.equal(saved.enabled,1);assert.equal(saved.revision,2);
 assert.equal(JSON.parse(db.prepare('SELECT data FROM products WHERE id=?').get(custom.id).data).notes,custom.notes);
 db.exec(sql);assert.equal(db.prepare('SELECT revision FROM products WHERE id=?').get(seed.id).revision,2);db.close();
});
