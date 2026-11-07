// Rebuild the merchant-approved November collection from reviewed research.
// This never reads credentials, changes a database, or resets existing inventory.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {processNotes,notesError,validNoteList} from '../dist/fragrance-notes.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const requested=read('research/maison-alhambra/requested-products.json');
const reviewed=['research-01-31.json','research-32-62.json','research-63-92.json'].flatMap(file=>{
 const data=read('research/maison-alhambra/'+file);return Array.isArray(data)?data:data.products;
});
const photos=read('research/maison-alhambra/images.json');
const slug=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const checkedURL=u=>{const url=new URL(u);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid research URL');return url.href;};
const products=requested.map(r=>{
 const f=reviewed.find(p=>p.number===r.number);if(!f)throw Error('Missing research: '+r.number);
 const photo=photos.find(p=>p.number===r.number);if(!photo||!existsSync(new URL('dist/'+photo.image,root)))throw Error('Missing photo: '+r.number);
 const brand=f.canonicalBrand||'Maison Alhambra',name=(f.canonicalName||r.requestedName).replace(new RegExp('^'+brand+'\\s+','i'),'').trim();
 const size=r.requestedSize??f.size;if(!Number.isInteger(size)||size<=0)throw Error('Unverified size: '+r.number);
 const concentration=f.concentration;if(!concentration||/unknown|confirm|pending/i.test(concentration))throw Error('Unverified concentration: '+r.number);
 const noteData=f.notePyramid?{notePyramid:f.notePyramid}:{signatureNotes:f.signatureNotes};
 if(noteData.notePyramid?notesError(noteData.notePyramid):!validNoteList(noteData.signatureNotes))throw Error('Incomplete published notes: '+r.number);
 const processed=processNotes(noteData),sources=f.noteSources||[];
 if(!sources.length)throw Error('Missing evidence: '+r.number);
 sources.forEach(s=>checkedURL(s.url));
 const source=checkedURL(f.source||sources[0].url),verified=f.verified===true;
 const quality=f.notesQuality||(verified?(sources.some(s=>s.kind==='manufacturer')?'manufacturer':'retailer_corroborated'):'disputed');
 const group=slug(brand)+'-'+slug(r.requestedName.replace(/^Jean Low Azure$/,'Jean Lowe Azure'));
 const caveats=[f.notesCaveat,f.identityCaveat].filter(Boolean);
 const facts={...noteData,description:f.description,family:f.family||processed.scentProfile.family,
  pairing:f.pairing||processed.scentProfile.occasions.map(k=>({date:'Date night',evening:'Evening',daily:'Everyday',office:'Office',cafe:'Coffee outings',gift:'Gifting'})[k]||k).join(' · ')||'Explore the published scent notes',
  concentration,publishedSizes:f.publishedSizes||[size+' ml'],source,noteSources:sources,
  notesQuality:quality,notesCaveat:caveats.join(' '),factsCheckedAt:'2026-11-07',factsRevision:3,
  finderVerified:verified,scentEdit:processed.scentProfile.edit};
 if(!facts.description||facts.description.length<40||facts.description.length>1200)throw Error('Description needs review: '+r.number);
 return {id:group+'-bottle',group,brand,name,size,price:r.price,reference:null,format:'Full bottle',
  quantity:r.quantity,available:r.quantity>0,enquiryOnly:false,condition:'Full retail bottle; packaging may vary.',
  image:photo.image,imageScale:photo.scale||'.95',deal:false,featured:false,hotSeller:false,hidden:false,archived:false,
  order:1000+r.number,featureOrder:1000+r.number,...facts,...processed};
});
if(products.length!==92||new Set(products.map(p=>p.id)).size!==92)throw Error('Expected 92 distinct products');
const body=`// Merchant-supplied prices and stock; source-linked fragrance research checked 7 November 2026.\nimport {processNotes} from './fragrance-notes.mjs';\nexport const maisonProducts=${JSON.stringify(products)};\nconst factKeys=['notePyramid','signatureNotes','description','family','pairing','concentration','publishedSizes','source','noteSources','notesQuality','notesCaveat','factsCheckedAt','factsRevision','finderVerified','scentEdit'];\nexport const maisonFragranceFacts=Object.fromEntries(maisonProducts.map(p=>[p.group,Object.fromEntries(factKeys.filter(k=>p[k]!==undefined).map(k=>[k,structuredClone(p[k])]))]));\n// Add once during the catalogue revision; never replace owner edits, sales, archives or later deletions.\nexport function mergeMaisonProducts(products){const ids=new Set(products.map(p=>p.id));return [...products,...structuredClone(maisonProducts).filter(p=>!ids.has(p.id))];}\n`;
writeFileSync(new URL('dist/maison-products.mjs',root),body);
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql='-- Merchant approved prices; 9 bottles each, except the 33 N/A listings at zero.\n-- New IDs only. Replays preserve all existing prices, stock, reservations and owner edits.\n'+products.map(p=>`INSERT OR IGNORE INTO products(id,data,price_paise,quantity,enabled) VALUES(${quote(p.id)},${quote(JSON.stringify(p))},${p.price*100},${p.quantity},${p.available?1:0});`).join('\n')+'\n';
writeFileSync(new URL('backend/migrations/0012_maison_alhambra_catalogue.sql',root),sql);
console.log(JSON.stringify({products:products.length,stocked:products.filter(p=>p.available).length,soldOut:products.filter(p=>!p.available).length,reviewRequired:products.filter(p=>!p.finderVerified).map(p=>({name:p.name,caveat:p.notesCaveat}))},null,2));
