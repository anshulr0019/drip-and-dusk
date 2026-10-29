import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {communityProducts} from '../dist/community-products.mjs';
import {instagramProducts} from '../dist/instagram-products.mjs';
import {defaults,migrateCatalogue,filterProducts,catalogueDisplay,inStock,validateProduct,basketSummary,enquiryMessage,referenceEnquiryMessage,matchesCollection,priceLabel,sizeLabel} from '../dist/core.mjs';
test('all 18 identified Instagram fragrances have packaged images, distinct ids and honest unconfirmed trade data',()=>{
 assert.equal(instagramProducts.length,18);assert.equal(new Set(instagramProducts.map(p=>p.id)).size,18);
 for(const p of instagramProducts){assert.ok(existsSync(new URL('../dist/'+p.image,import.meta.url)));assert.equal(validateProduct(p),'');assert.equal(p.price,null);assert.equal(p.size,null);assert.equal(p.quantity,0);assert.equal(p.available,false);assert.equal(inStock({...p,available:true,quantity:5}),false);assert.equal(priceLabel(p),'Ask for price');assert.equal(sizeLabel(p),'Size to confirm');}
 const all=defaults().products;assert.equal(all.length,78);assert.equal(new Set(all.map(p=>p.id)).size,78);assert.equal(catalogueDisplay(all,'all').length,new Set(all.map(p=>p.group)).size);
});
test('returning browsers get additions once while preserving edits, uploads, hidden products and later deletions',()=>{
 const original=defaults();const old={...original,catalogueRevision:undefined,products:original.products.filter(p=>!p.instagramSource&&!p.communitySource)};old.products[0]={...old.products[0],price:1234,hidden:true,image:'data:image/jpeg;base64,eA=='};
 const next=migrateCatalogue(old);assert.equal(next.products.length,78);assert.equal(next.products[0].price,1234);assert.equal(next.products[0].hidden,true);assert.equal(next.products[0].image,old.products[0].image);assert.equal(old.products.length,14);assert.equal(migrateCatalogue(next),next);
 const deleted={...next,products:next.products.filter(p=>p.id!==instagramProducts[0].id)};assert.equal(migrateCatalogue(deleted).products.length,77);
 const existing={...old,products:[...old.products,{...instagramProducts[0],hidden:true}]};assert.equal(migrateCatalogue(existing).products.length,78);assert.equal(migrateCatalogue(existing).products.find(p=>p.id===instagramProducts[0].id).hidden,true);
});
test('unknown prices are excluded from budget edits and unknown stock is distinct from sold out',()=>{
 const all=[...defaults().products.filter(p=>!p.instagramSource&&!p.communitySource),...instagramProducts];assert.equal(filterProducts(all,{collection:'instagram'}).length,18);assert.equal(filterProducts(all,{stock:'ask'}).length,18);assert.equal(filterProducts(all,{stock:'out'}).length,2);
 assert.equal(filterProducts(all,{brand:'Rasasi',collection:'instagram'}).length,5);
 for(const p of instagramProducts){assert.equal(matchesCollection(p,'under3000'),false);assert.ok(!filterProducts(all,{budget:'500'}).some(x=>x.id===p.id));}
 for(const sort of ['price-asc','price-desc']){const result=filterProducts(all,{sort});assert.ok(result.slice(0,14).every(p=>Number.isFinite(p.price)));assert.ok(result.slice(14).every(p=>p.price===null));}
});
test('reference enquiries identify the exact fragrance without inventing a price or permitting stock calculations',()=>{
 const p=instagramProducts[0],msg=referenceEnquiryMessage(p);assert.ok(msg.includes(p.brand+' '+p.name));assert.match(msg,/available sizes, current price, stock/);assert.doesNotMatch(msg,/₹0|null ml/);
 assert.equal(basketSummary(defaults().products,[{id:p.id,qty:1}]).valid,false);assert.throws(()=>enquiryMessage(defaults().products,[{id:p.id,qty:1}]));assert.throws(()=>referenceEnquiryMessage({...p,hidden:true}));assert.throws(()=>referenceEnquiryMessage({...p,archived:true}));
});
test('owner must provide complete commercial data before converting a reference listing to stocked inventory',()=>{
 const p=instagramProducts[0];assert.notEqual(validateProduct({...p,enquiryOnly:false}),'');assert.equal(validateProduct({...p,enquiryOnly:false,size:100,price:3500,quantity:3,available:true}),'');assert.notEqual(validateProduct({...p,available:true}),'');
});
