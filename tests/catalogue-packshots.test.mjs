import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {defaults,migrateCatalogue} from '../dist/core.mjs';import {communityPhotoUpdates,communityPhotoCaption} from '../dist/community-photo-updates.mjs';
test('all 18 missing images now have local retail packshots and explicit packaging caveats',()=>{
 const all=defaults().products;assert.equal(Object.keys(communityPhotoUpdates).length,18);assert(!all.some(p=>p.photoPending));
 for(const [id,update] of Object.entries(communityPhotoUpdates)){const p=all.find(p=>p.id===id);assert.equal(p.image,update.image);assert(existsSync(new URL('../dist/'+p.image,import.meta.url)));assert.match(communityPhotoCaption(p),/Retail bottle and box.*reference/);assert.equal(communityPhotoCaption({...p,image:'data:image/webp;base64,eA=='}),'');}
 assert.match(communityPhotoCaption(all.find(p=>p.id==='chanel-chance-eau-fraiche-bottle')),/confirm.*EDT or EDP/);
});
test('photo upgrade preserves owner uploads, trade data, saved visibility and deleted listings',()=>{
 const all=defaults().products;const id='chanel-bleu-edt-bottle',uploaded='chanel-bleu-edp-bottle';
 const products=all.filter(p=>p.id!=='nishane-nefs-bottle').map(p=>p.id===id?{...p,image:'assets/community-photo-pending.webp',photoPending:true,price:777,hidden:true}:p.id===uploaded?{...p,image:'data:image/webp;base64,eA=='}:p);
 const state={...defaults(),catalogueRevision:5,products};const next=migrateCatalogue(state);assert.equal(next.products.length,77);assert(!next.products.some(p=>p.id==='nishane-nefs-bottle'));
 const p=next.products.find(p=>p.id===id);assert.equal(p.price,777);assert.equal(p.hidden,true);assert.equal(p.image,communityPhotoUpdates[id].image);assert.equal(p.photoPending,false);
 assert.equal(next.products.find(p=>p.id===uploaded).image,'data:image/webp;base64,eA==');assert.equal(migrateCatalogue(next),next);
});
test('shared photo backfill only changes placeholder media and revision; replay cannot alter stock or owner pictures',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE products(id TEXT PRIMARY KEY,data TEXT,price_paise INTEGER,quantity INTEGER,held INTEGER,enabled INTEGER,revision INTEGER)');
 const p=defaults().products.find(p=>p.id==='chanel-bleu-parfum-bottle'),q=defaults().products.find(p=>p.id==='chanel-coco-edp-bottle');
 const put=db.prepare('INSERT INTO products VALUES(?,?,123456,8,2,1,9)');put.run(p.id,JSON.stringify({...p,image:'assets/community-photo-pending.webp',photoPending:true}));put.run(q.id,JSON.stringify({...q,image:'data:image/webp;base64,eA=='}));
 const sql=readFileSync(new URL('../backend/migrations/0007_catalogue_packshots.sql',import.meta.url),'utf8');db.exec(sql);db.exec(sql);
 const row=db.prepare('SELECT * FROM products WHERE id=?').get(p.id);assert.equal(JSON.parse(row.data).image,communityPhotoUpdates[p.id].image);assert.equal(row.price_paise,123456);assert.equal(row.quantity,8);assert.equal(row.held,2);assert.equal(row.enabled,1);assert.equal(row.revision,10);
 const owner=db.prepare('SELECT * FROM products WHERE id=?').get(q.id);assert.equal(JSON.parse(owner.data).image,'data:image/webp;base64,eA==');assert.equal(owner.revision,9);db.close();
});
