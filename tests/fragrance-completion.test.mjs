import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {defaults,migrateCatalogue} from '../dist/core.mjs';
import {fragranceFacts,researchMetadata} from '../dist/fragrance-facts.mjs';
import {completedFactsPatch,completeSeedFragrance} from '../dist/fragrance-completion.mjs';
import {notesError,processNotes} from '../dist/fragrance-notes.mjs';
import {verifiedForFinder,discoverScents} from '../dist/scent-matching.mjs';
import {prepareProduct} from '../backend/catalogue.mjs';
const all=defaults().products,get=g=>all.find(p=>p.group===g);
test('all 67 fragrances and 78 variants have sourced notes and useful product facts',()=>{
 assert.equal(all.length,78);assert.equal(new Set(all.map(p=>p.group)).size,67);
 for(const p of all){assert(fragranceFacts[p.group],p.group);assert(p.description.length>40,p.group);assert(p.family&&p.pairing&&p.concentration,p.group);assert(p.publishedSizes.length,p.group);assert(p.publishedSizes.every(s=>/^\d+(?:\.\d+)? (?:ml|oz)(?: \(.*\))?$/.test(s)),p.group);assert(p.noteSources.length,p.group);assert(!/pending|no account yet|awaiting confirmation|unknown/i.test(p.notes),p.group);assert(p.notePyramid||p.signatureNotes?.length,p.group);assert.equal(prepareProduct(p).notes,p.notes,p.group);assert(researchMetadata(p).noteSources.length,p.group);}
 assert.equal(all.filter(verifiedForFinder).length,77);assert.equal(verifiedForFinder(get('chanel-chance-eau-fraiche')),false);
});
test('scraped navigation and repeated Nishane stages are replaced by the actual official pyramids',()=>{
 const getNotes=g=>get('nishane-'+g).notePyramid;
 assert.deepEqual(getNotes('tempfluo').base,['cashmere wood','cedarwood','vanilla']);
 assert.deepEqual(getNotes('deziro').top,['mandarin','ambergris','marine accord']);
 assert.deepEqual(getNotes('wulong-cha').heart,['oolong tea','nutmeg']);
 assert.deepEqual(getNotes('safran-colognise').top,['cedrat','passion fruit','pink grapefruit']);
 assert.equal(get('nishane-safran-colognise').concentration,'Extrait de Parfum');
 for(const garbage of ['No account yet?','Sign in','Add to cart','Subscribe','Privacy policy']){assert(notesError({top:['Bergamot'],heart:['Jasmine'],base:[garbage]}),garbage);assert.equal(verifiedForFinder({finderVerified:true,notes:'Bergamot / Jasmine / '+garbage}),false);}
});
test('official signature notes can be matched without invented stages, and owner edits lose source attribution',()=>{
 const p=get('chanel-bleu-edt');assert(!p.notePyramid);assert(p.signatureNotes.includes('Cedar'));assert(verifiedForFinder(p));
 const result=discoverScents([p],{occasion:'office',style:'woody',budget:'any',format:'Full bottle'});assert.equal(result.length,1);assert(result[0].reason.includes('published notes'));assert(!result[0].reason.includes('note pyramid'));
 const changed=prepareProduct({...p,...processNotes({signatureNotes:['Rose','Vanilla']}),notePyramid:undefined});assert(!changed.noteSources);assert.deepEqual(researchMetadata(changed),{});
 const fraiche=get('chanel-chance-eau-fraiche');assert.equal(fraiche.editionProfiles.length,2);assert.match(fraiche.concentration,/Confirm EDT or EDP/);
});
test('completion preserves deleted listings, owner copy and custom notes in browser migration',()=>{
 const current={...defaults(),catalogueRevision:6,products:[{...get('nishane-tempfluo'),factsRevision:0,notes:'Owner bespoke notes',notePyramid:{top:['Lemon'],heart:['Rose'],base:['Musk']}}]};
 const migrated=migrateCatalogue(current);assert.equal(migrated.products.length,1);assert.equal(migrated.products[0],current.products[0]);assert.equal(migrated.catalogueRevision,7);assert.equal(migrateCatalogue(migrated),migrated);
 assert.equal(completeSeedFragrance(current.products[0]),current.products[0]);
});
test('new data backfill repairs old seed notes without changing commerce, images, reservations or owner notes',()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE products(id TEXT PRIMARY KEY,data TEXT,revision INTEGER DEFAULT 1,price_paise INTEGER,quantity INTEGER,held INTEGER,enabled INTEGER)');
 const p={...get('nishane-tempfluo'),factsRevision:0,notePyramid:{top:['Bergamot','Mandarin','Saffron'],heart:['Jasmine sambac absolute','Orange flower','Praline'],base:['No account yet?']},notes:'Bergamot · Mandarin · Saffron / Jasmine sambac absolute · Orange flower · Praline / No account yet?',description:'Owner description',image:'assets/custom-owner.webp',price:1234,size:70,hidden:true};
 const custom={...get('nishane-hacivat'),factsRevision:0,notePyramid:{top:['Lemon'],heart:['Rose'],base:['Musk']},notes:'Lemon / Rose / Musk'};
 const put=db.prepare('INSERT INTO products VALUES(?,?,5,123400,8,2,1)');put.run(p.id,JSON.stringify(p));put.run(custom.id,JSON.stringify(custom));
 const sql=readFileSync(new URL('../backend/migrations/0008_complete_fragrance_profiles.sql',import.meta.url),'utf8');db.exec(sql);
 const row=db.prepare('SELECT * FROM products WHERE id=?').get(p.id),data=JSON.parse(row.data);assert.deepEqual(data.notePyramid,completedFactsPatch(p.group).notePyramid);assert.equal(data.description,'Owner description');assert.equal(data.image,p.image);assert.equal(data.price,p.price);assert.equal(data.size,p.size);assert.equal(data.hidden,true);assert.equal(row.price_paise,123400);assert.equal(row.quantity,8);assert.equal(row.held,2);assert.equal(row.enabled,1);assert.equal(row.revision,6);
 assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM products WHERE id=?').get(custom.id).data),custom);db.exec(sql);assert.equal(db.prepare('SELECT revision FROM products WHERE id=?').get(p.id).revision,6);db.close();
});
