import test from 'node:test';import assert from 'node:assert/strict';
import {defaults} from '../dist/core.mjs';
import {recommendScents,verifiedForFinder,catalogueNoteOptions,styles} from '../dist/scent-matching.mjs';
const products=defaults().products;
const answers={occasion:'date',style:'sweet',budget:'3000',format:'Full bottle'};
test('returns up to three distinct, available fragrances within the selected budget and exact format without mutating catalogue',()=>{
 const before=JSON.stringify(products),matches=recommendScents(products,answers);
 assert.equal(matches.length,3);assert.equal(new Set(matches.map(m=>m.product.group)).size,3);
 for(const m of matches){assert.ok(m.product.available);assert.ok(m.product.price<=3000);assert.equal(m.product.format,'Full bottle');assert.ok(m.reason);assert.ok(m.tradeOff);}
 assert.equal(JSON.stringify(products),before);
});
test('coffee recommendations require verified coffee evidence without unrelated filler as the catalogue expands',()=>{
 const matches=recommendScents(products,{...answers,occasion:'cafe',style:'coffee'});
 assert.equal(matches.length,3);assert.equal(new Set(matches.map(m=>m.product.group)).size,3);for(const m of matches){assert.ok(verifiedForFinder(m.product));assert.ok(m.notes.some(note=>/coffee/i.test(note)));assert.ok(m.reason.toLowerCase().includes('coffee'));assert.ok(m.product.available&&m.product.quantity>0&&m.product.price<=3000);assert.equal(m.product.format,'Full bottle');}assert.equal(recommendScents(products.filter(p=>p.group==='qahwa'),{...answers,occasion:'cafe',style:'coffee'}).length,1);
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
 const seed=products.filter(p=>p.order<1000),fresh=recommendScents(seed,{...answers,style:'fresh',budget:'any'});assert.deepEqual(new Set(fresh.map(m=>m.product.group)),new Set(['hawas','qaed']));
 const floral=recommendScents(seed,{...answers,style:'floral'});assert.deepEqual(floral.map(m=>m.product.group),['yara']);
});
test('common perfumery notes reach the right finder style, and look-alike words do not cross over',async()=>{
 const {noteStyles:styleOf}=await import('../dist/fragrance-notes.mjs');
 for(const [note,style] of [['Raspberry','fresh'],['Yuzu','fresh'],['Gardenia','floral'],['Ylang-ylang','floral'],['Marshmallow','sweet'],['Coconut','sweet'],['Oakmoss','woody'],['Frankincense','woody'],['Clary Sage','spicy'],['Suede','leather'],['Sea salt','marine'],['Maté','tea']])assert.ok(styleOf(note).includes(style),note+' should count as '+style);
 assert.deepEqual(styleOf('Pineapple'),['fresh']);
 assert.ok(!styleOf('Coconut water').includes('marine'));
 assert.deepEqual(styleOf('Musk'),['musk']);
 assert.deepEqual(styleOf('Amber'),['amber']);
 assert.ok(!styleOf('Oatmeal').includes('tea'));
 assert.ok(!styleOf('Coffee Blossom').includes('coffee'));
 assert.ok(!styleOf('Tea Rose').includes('tea'));
 assert.ok(!styleOf('Bourbon Vanilla').includes('boozy'));
});

test('all supplied note labels map to a finder direction and compound labels survive owner entry',async()=>{
 const {referenceNoteGroups}=await import('../dist/reference-notes.mjs');
 const {noteStyles,parseNoteInput,validNoteList}=await import('../dist/fragrance-notes.mjs');
 const all=new Set(Object.values(referenceNoteGroups).flat());
 const directionIds=new Set(styles.map(style=>style.id));
 assert.equal(all.size,1951);
 for(const name of all){
  const matches=noteStyles(name);
  assert.ok(validNoteList([name]),name);
  assert.ok(matches.length&&matches.every(style=>directionIds.has(style)),name);
 }
 assert.deepEqual(parseNoteInput('Cupuaçu, Cupuassu, Copoasu, Hojicha; Beer/Ale'),['Cupuaçu, Cupuassu, Copoasu','Hojicha','Beer/Ale']);
 for(const [name,style] of [['Cachaça','boozy'],['Nemophila','unusual'],['Civet','musk'],['Ambergris','marine'],['Hojicha','tea'],['Choya Loban','smoky']])assert.ok(noteStyles(name).includes(style),name);
});

test('exact note matching discovers future notes and still respects eligibility',()=>{
 const sample={...products[0],id:'sample-note',group:'sample-note',finderVerified:true,price:1500,notes:undefined,
  notePyramid:{top:['Bergamot'],heart:['Ceramic glaze accord'],base:['Beer/Ale']}};
 const exact={...answers,style:'note',note:' cerámic GLaze accord '};
 assert.deepEqual(recommendScents([sample],exact)[0].notes,['Ceramic glaze accord']);
 assert.deepEqual(catalogueNoteOptions([sample]),['Beer/Ale','Bergamot','Ceramic glaze accord']);
 assert.equal(recommendScents([sample],{...exact,note:'Beer / Ale'}).length,1);
 for(const patch of [{quantity:0},{hidden:true},{finderVerified:false},{format:'Attar'},{price:3500}])assert.equal(recommendScents([{...sample,...patch}],exact).length,0);
 assert.equal(recommendScents([sample],{...exact,note:'Ceramic'}).length,0);
});
