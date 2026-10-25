import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,filterProducts,catalogueDisplay,fragranceProfile,matchesCollection} from '../dist/core.mjs';
const {products}=defaults();
test('the all-fragrance view keeps one bottle per scent while explicit formats and saved variants remain exact',()=>{
 const all=catalogueDisplay(products,'all');assert.equal(all.length,7);assert.ok(all.every(p=>p.format==='Full bottle'));
 const decants=filterProducts(products,{kind:'Decant'});assert.equal(catalogueDisplay(decants,'Decant').length,7);
 assert.equal(catalogueDisplay(products.slice(0,2),'saved').length,2);
});
test('collection filters compose with price, format, search and availability',()=>{
 assert.deepEqual(filterProducts(products,{collection:'fresh',kind:'Full bottle'}).map(p=>p.group),['hawas','qaed']);
 assert.deepEqual(filterProducts(products,{collection:'warm',query:'qahwa',kind:'Decant'}).map(p=>p.id),['qahwa-10ml']);
 assert.equal(filterProducts(products,{collection:'dark',stock:'out',kind:'Full bottle'}).length,1);
 assert.equal(filterProducts(products,{collection:'under3000',kind:'Full bottle',stock:'in'}).length,5);
});
test('under-budget edits use current prices and curated edits never invent metadata for custom products',()=>{
 const p={...products[0],price:3000};assert.equal(matchesCollection(p,'under3000'),false);assert.equal(matchesCollection({...p,price:2999},'under3000'),true);
 const custom={group:'custom',family:'Citrus',concentration:'Eau de Parfum',pairing:'Daytime'};
 assert.equal(fragranceProfile(custom).family,'Citrus');assert.equal(fragranceProfile(custom).concentration,'Eau de Parfum');assert.equal(matchesCollection(custom,'fresh'),false);
 assert.equal(fragranceProfile({group:'new'}).concentration,'Confirm with seller');assert.equal(matchesCollection({...custom,scentEdit:'fresh'},'fresh'),true);
});
test('a decant-only budget match remains visible and grouping does not modify source inventory',()=>{
 const before=JSON.stringify(products),matches=filterProducts(products,{budget:'500'}),visible=catalogueDisplay(matches,'all');
 assert.equal(visible.length,7);assert.ok(visible.every(p=>p.format==='Decant'));assert.equal(JSON.stringify(products),before);
});
