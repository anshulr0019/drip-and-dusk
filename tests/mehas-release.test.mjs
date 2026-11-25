import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {catalogueDisplay,defaults,filterProducts,inStock,migrateCatalogue} from '../dist/core.mjs';
import {mehasPackagingPhoto,mehasProducts} from '../dist/mehas-products.mjs';
import {prepareProduct} from '../backend/catalogue.mjs';

const ids=mehasProducts.map(p=>p.id);

test('the three Mehas releases lead the curated catalogue, while stock filters stay accurate',()=>{
 const products=defaults().products;
 const curated=catalogueDisplay(filterProducts(products,{}),'all');
 assert.deepEqual(curated.slice(0,3).map(p=>p.id),ids);
 assert.deepEqual(filterProducts(products,{brand:'Mehas',stock:'in'}),[]);
 assert.deepEqual(filterProducts(products,{brand:'Mehas',stock:'out'}).map(p=>p.id),ids);
 assert.deepEqual(filterProducts(products,{brand:'Mehas',sort:'name'}).map(p=>p.name),['Beast Mode','Monarch','Silverback']);
 for(const p of mehasProducts){
  assert.equal(prepareProduct(p).price,3500);
  assert.equal(p.size,100);
  assert.equal(inStock(p),false);
  for(const photo of [p.image,mehasPackagingPhoto(p)])assert(existsSync(new URL('../dist/'+photo,import.meta.url)));
 }
});

test('browser and database upgrades preserve later owner edits and keep initial Mehas stock disabled',()=>{
 const existing={...mehasProducts[0],hidden:true,price:3650};
 const original={catalogueRevision:9,products:[existing],settings:{}};
 const upgraded=migrateCatalogue(original);
 assert.deepEqual(upgraded.products.map(p=>p.id),ids);
 assert.equal(upgraded.products[0],existing);
 assert.equal(migrateCatalogue(upgraded),upgraded);

 const db=new DatabaseSync(':memory:');
 try{
  const migration=name=>readFileSync(new URL('../backend/migrations/'+name,import.meta.url),'utf8');
  db.exec(migration('0001_orders.sql'));
  const release=migration('0014_mehas_release.sql');
  db.exec(release);
  const rows=db.prepare('SELECT * FROM products ORDER BY rowid').all();
  assert.deepEqual(rows.map(r=>JSON.parse(r.data)),mehasProducts);
  assert(rows.every(r=>r.price_paise===350000&&r.quantity===0&&r.enabled===0));
  db.prepare('UPDATE products SET price_paise=365000,quantity=4,enabled=1 WHERE id=?').run(ids[0]);
  db.exec(release);
  const row=db.prepare('SELECT price_paise,quantity,enabled FROM products WHERE id=?').get(ids[0]);
  assert.deepEqual([row.price_paise,row.quantity,row.enabled],[365000,4,1]);
 }finally{db.close();}
});
