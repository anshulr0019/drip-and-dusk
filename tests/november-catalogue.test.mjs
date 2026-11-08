import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {defaults,migrateCatalogue,validateProduct} from '../dist/core.mjs';
import {novemberProducts} from '../dist/november-products.mjs';
import {pageWindow} from '../dist/discovery.mjs';
import {prepareProduct} from '../backend/catalogue.mjs';
import {notePyramid,processNotes,validNoteList} from '../dist/fragrance-notes.mjs';
import {recommendScents} from '../dist/scent-matching.mjs';
const research=f=>JSON.parse(readFileSync(new URL('../research/november-catalogue/'+f,import.meta.url),'utf8'));
test('Every new merchant entry retains its exact quoted price and availability',()=>{
 const plan=research('import-plan.json'),byOrder=new Map(novemberProducts.map(p=>[p.order-2000,p]));
 for(const r of plan){if(r.skipId)continue;const p=byOrder.get(r.number);assert.ok(p,'Missing request '+r.number);assert.equal(p.price,r.price);assert.equal(p.quantity,r.quantity);assert.equal(p.available,r.quantity>0);assert.equal(validateProduct(p),'');}
 assert.equal(new Set(novemberProducts.map(p=>p.id)).size,novemberProducts.length);
});
test('Existing identities stay unchanged and catalogue upgrade is idempotent',()=>{
 const original=defaults().products.filter(p=>p.order<2000).map(p=>({...p,price:123,quantity:2}));
 const state={catalogueRevision:8,products:original,settings:{}};const next=migrateCatalogue(state);
 assert.deepEqual(next.products.slice(0,original.length),original);
 assert.equal(next.products.length,original.length+novemberProducts.length);assert.equal(migrateCatalogue(next),next);
});
test('All imported assets and source links are real; kits never pretend to share a pyramid',()=>{
 for(const p of novemberProducts){assert.ok(existsSync(new URL('../dist/'+p.image,import.meta.url)),p.image);if(p.source)assert.match(p.source,/^https:\/\//);if(p.format==='Discovery kit'){assert.equal(p.finderVerified,false);assert.ok(p.packContents?.length);assert.equal(p.notePyramid,undefined);}}
});
test('Large catalogue page navigation remains bounded and preserves first/last/current',()=>{
 for(let page=1;page<=80;page++){const out=pageWindow(page,80);assert.ok(out.length<=7);for(const n of [1,page,80])assert.ok(out.includes(n));assert.ok(!out.some((n,i)=>n===null&&(i===0||i===out.length-1||out[i-1]===null)));}
 assert.deepEqual(pageWindow(1,1),[1]);
});

test('A set with verified perfume notes is not ranked as a single full bottle',()=>{const p=novemberProducts.find(p=>p.format==='Gift set'&&p.finderVerified&&p.quantity>0);assert.ok(p);assert.deepEqual(recommendScents([p],{occasion:'gift',style:'unsure',budget:'any',format:'either'}),[]);});

test('A legitimate cookie accord is accepted but cookie consent navigation is rejected',()=>{assert.equal(validNoteList(['Cookie','Sugar','Milk']),true);assert.equal(validNoteList(['Cookie consent']),false);assert.equal(validNoteList(['Cookies policy']),false);});

test('Admin saves preserve sample profiles only while the exact kit contents remain unchanged',()=>{const kit=novemberProducts.find(p=>p.format==='Discovery kit');const input={...kit,notePyramid:notePyramid(kit),...processNotes(kit),finderVerified:false};assert.deepEqual(prepareProduct(input).packProfiles,kit.packProfiles);assert.equal(prepareProduct({...input,packContents:['Different sample']}).packProfiles,undefined);});

test('All imported size variants retain their source metadata after an ordinary owner save',()=>{for(const p of novemberProducts.filter(p=>p.noteSources.length)){const saved=prepareProduct(p);assert.ok(saved.noteSources?.length,p.id);assert.equal(saved.notesQuality,p.notesQuality,p.id);}});
