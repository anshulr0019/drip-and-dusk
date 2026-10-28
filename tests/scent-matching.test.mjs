import test from 'node:test';import assert from 'node:assert/strict';
import {defaults} from '../dist/core.mjs';
import {recommendScents,verifiedForFinder} from '../dist/scent-matching.mjs';
const products=defaults().products;
const answers={occasion:'date',style:'sweet',budget:'3000',format:'Full bottle'};
test('returns up to three distinct, available fragrances within the selected budget and exact format without mutating catalogue',()=>{
 const before=JSON.stringify(products),matches=recommendScents(products,answers);
 assert.equal(matches.length,3);assert.equal(new Set(matches.map(m=>m.product.group)).size,3);
 for(const m of matches){assert.ok(m.product.available);assert.ok(m.product.price<=3000);assert.equal(m.product.format,'Full bottle');assert.ok(m.reason);assert.ok(m.tradeOff);}
 assert.equal(JSON.stringify(products),before);
});
test('coffee means verified coffee notes, with Qahwa ranked first and no unrelated filler',()=>{
 const matches=recommendScents(products,{...answers,occasion:'cafe',style:'coffee'});
 assert.deepEqual(matches.map(m=>m.product.group),['qahwa','asad']);assert.ok(matches.every(m=>m.reason.toLowerCase().includes('coffee')));
 assert.ok(recommendScents(products,{...answers,occasion:'cafe',style:'fresh'}).every(m=>m.notes.length>0));
});
test('budget never silently swaps bottles for decants; either format prefers a bottle only when it fits',()=>{
 assert.equal(recommendScents(products,{...answers,budget:'500'}).length,0);
 const decants=recommendScents(products,{...answers,budget:'500',format:'Decant'});assert.equal(decants.length,3);assert.ok(decants.every(m=>m.product.format==='Decant'&&m.product.price<=500));
 const either=recommendScents(products,{...answers,budget:'500',format:'either'});assert.ok(either.every(m=>m.product.format==='Decant'));
 const bottles=recommendScents(products,{...answers,format:'either'});assert.ok(bottles.every(m=>m.product.format==='Full bottle'));
});
test('changed prices and stock, hidden products and archives are used immediately; there are no stale result ids',()=>{
 const results=recommendScents(products,answers),first=results[0].product;
 for(const patch of [{quantity:0},{available:false},{hidden:true},{archived:true},{enquiryOnly:true},{price:9000}])assert.ok(!recommendScents(products.map(p=>p.id===first.id?{...p,...patch}:p),answers).some(m=>m.product.id===first.id));
});
test('researched entries have complete verified notes without converting unknown stock into available recommendations',()=>{
 for(const p of products.filter(p=>p.instagramSource)){assert.equal(verifiedForFinder(p),true);assert.equal(recommendScents([p],{...answers,style:'unsure',budget:'any'}).length,0);}
 assert.equal(verifiedForFinder(products.find(p=>p.group==='oud-for-glory')),true);
 assert.equal(verifiedForFinder({...products[0],notes:'New unverified / changed / content'}),false);
 assert.equal(verifiedForFinder({...products[0],finderVerified:false}),false);
});
test('owner-confirmed notes enable custom products, while a verification checkbox alone cannot enable pending data',()=>{
 const custom={...products[0],id:'custom',group:'new',name:'New fragrance',notePyramid:undefined,finderVerified:true,price:1500,notes:'Bergamot / Coffee · Jasmine / Sandalwood'};
 assert.equal(verifiedForFinder(custom),true);assert.equal(recommendScents([custom],{...answers,style:'coffee'}).length,1);
 for(const notes of ['Pending verification','Pending / Coffee / Vanilla','Coffee / / Vanilla'])assert.equal(verifiedForFinder({...custom,notes}),false);
 assert.equal(recommendScents([{...custom,enquiryOnly:true}],{...answers,style:'coffee'}).length,0);
});
test('invalid answers and empty catalogues never produce fabricated recommendations',()=>{
 assert.deepEqual(recommendScents([],answers),[]);
 for(const patch of [{occasion:'unknown'},{style:'unknown'},{budget:'1'},{format:'Bottle'}, {budget:''}])assert.deepEqual(recommendScents(products,{...answers,...patch}),[]);
});

test('a single citrus or flower note does not misclassify a rich gourmand as a fresh or floral fragrance',()=>{
 const fresh=recommendScents(products,{...answers,style:'fresh',budget:'any'});assert.deepEqual(new Set(fresh.map(m=>m.product.group)),new Set(['hawas','qaed']));
 const floral=recommendScents(products,{...answers,style:'floral'});assert.deepEqual(floral.map(m=>m.product.group),['yara']);
});
