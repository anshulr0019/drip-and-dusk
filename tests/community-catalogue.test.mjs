import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {communityProducts,mergeCommunityOffers} from '../dist/community-products.mjs';
import {defaults,migrateCatalogue,validateProduct,inStock,priceLabel,referenceEnquiryMessage,basketSummary} from '../dist/core.mjs';
import {prepareProduct} from '../backend/catalogue.mjs';
const get=id=>communityProducts.find(p=>p.id===id);
test('47 deduplicated dated offers add 46 variants and update existing Inception without creating sellable stock',()=>{
 const all=defaults().products;assert.equal(communityProducts.length,47);assert.equal(all.length,78);assert.equal(new Set(all.map(p=>p.id)).size,78);
 for(const p of communityProducts){assert.equal(validateProduct(p),'',p.id);assert.equal(inStock(p),false);assert.equal(p.quantity,0);assert.equal(p.available,false);assert(existsSync(new URL('../dist/'+p.image,import.meta.url)));assert.equal(p.communityOffer.contact,'917021915706');assert.equal(basketSummary(all,[{id:p.id,qty:1}]).valid,false);const saved=prepareProduct(p);assert.deepEqual(saved.communityOffer,p.communityOffer);}
 const inception=all.find(p=>p.id==='mykonos-inception-bottle');assert.equal(inception.price,2899);assert.equal(inception.size,100);assert(inception.notePyramid.heart.includes('Black tea'));
});
test('latest quotes, decant sizes, shipping and tester availability stay distinct',()=>{
 assert.equal(get('nishane-ani-bottle').price,14000);assert.equal(get('nishane-wulong-cha-x-bottle').price,null);assert.match(get('nishane-wulong-cha-x-bottle').communityOffer.status,/unavailable.*Retail/);
 for(const group of ['lattafa-atlas-canyon','lattafa-atlas-glacial-valley']){assert.equal(get(group+'-bottle').price,2875);for(const [size,price] of [[5,300],[10,575]]){const p=get(group+'-'+size+'ml');assert.equal(p.price,price);assert.equal(p.size,size);assert.equal(p.format,'Decant');assert.match(priceLabel(p),/\+$/);assert.match(referenceEnquiryMessage(p),/charges.*confirm/);assert(referenceEnquiryMessage(p).includes(size+' ml · Decant'));}}
 assert.equal(get('lattafa-atlas-5ml').price,260);assert.match(get('paris-corner-rifaaqat-bottle').communityOffer.shipping,/included/);assert.equal(get('chanel-chance-eau-fraiche-bottle').concentration,'Confirm EDT or EDP with seller');
});
test('browser migration runs once, preserves existing uploads, edits, archives and later deletions',()=>{
 const old={...defaults(),catalogueRevision:4,products:defaults().products.filter(p=>!p.communitySource)};old.products[0]={...old.products[0],price:1234,hidden:true};
 const next=migrateCatalogue(old);assert.equal(next.products[0].price,1234);assert.equal(next.products[0].hidden,true);assert.equal(migrateCatalogue(next),next);
 const removed={...next,products:next.products.filter(p=>p.id!=='nishane-nefs-bottle')};assert.equal(migrateCatalogue(removed),removed);
 const custom={...get('mykonos-inception-bottle'),price:1234,image:'data:image/jpeg;base64,eA=='};delete custom.communitySource;assert.equal(mergeCommunityOffers([custom])[0],custom);
});
test('SQL migration is additive, idempotent and cannot overwrite merchant stock or reservations',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE products(id TEXT PRIMARY KEY,data TEXT,price_paise INTEGER,quantity INTEGER,held INTEGER DEFAULT 0,enabled INTEGER,revision INTEGER DEFAULT 1)');
 const p=get('nishane-ani-bottle');db.prepare('INSERT INTO products VALUES(?,?,77700,4,1,1,9)').run(p.id,JSON.stringify({...p,price:777}));
 const sql=readFileSync(new URL('../backend/migrations/0006_community_offers.sql',import.meta.url),'utf8');db.exec(sql);db.exec(sql);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n,46);const row=db.prepare('SELECT * FROM products WHERE id=?').get(p.id);assert.equal(row.price_paise,77700);assert.equal(row.quantity,4);assert.equal(row.held,1);assert.equal(row.revision,9);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM products WHERE id!=? AND (quantity!=0 OR enabled!=0)').get(p.id).n,0);db.close();
});
