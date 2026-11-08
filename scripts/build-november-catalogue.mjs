import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const {processNotes,notesError}=await import(pathToFileURL(root+'/dist/fragrance-notes.mjs'));
const {fragranceFacts}=await import(pathToFileURL(root+'/dist/fragrance-facts.mjs'));
const dir=root+'/research/november-catalogue/';
const read=f=>JSON.parse(readFileSync(dir+f,'utf8'));
const plan=read('import-plan.json'),existing=read('existing-products.json');
const research=['afnan-rayhaan.json','mykonos-ard.json','rasasi-khadlaj.json','lattafa.json'].flatMap(read);
const facts=new Map(research.map(p=>[p.number,p])),photos=new Map(read('images.json').map(p=>[p.number,p]));
const norm=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const slug=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const products=[],missing=[],issues=[],seen=new Set(existing.map(p=>p.id));
for(const r of plan){
 if(r.skipId)continue;
 const f=facts.get(r.number);if(!f){missing.push(r.number);continue;}
 const brand=f.canonicalBrand||r.brand,name=(f.canonicalName||r.requestedName).replace(/\s*\(\d+\s*ml\)/ig,'').trim();
 const format=f.format||r.format;
 let size=f.size??r.declaredSize;
 let group=slug(brand+' '+name),id;
 // Same fragrance in a different retail size belongs in its existing size selector.
 const old=existing.find(p=>norm(p.brand)===norm(brand)&&norm(p.name)===norm(name)&&p.format===format);
 if(old)group=old.group;
 if(format==='Gift set'&&!/gift-set$/.test(group))group+='-gift-set';
 if(format==='Discovery kit'&&!/discovery-kit$/.test(group))group+='-discovery-kit';
 if(format==='Attar'&&!/oil$/.test(group))group+='-oil';
 id=group+'-'+(format==='Full bottle'?'bottle-'+size+'ml':format==='Attar'?size+'ml':slug(format));
 if(seen.has(id)){issues.push({number:r.number,issue:'Duplicate generated identity',id});continue;}seen.add(id);
 const photo=photos.get(r.number),noteData=f.notePyramid?{notePyramid:f.notePyramid}:f.signatureNotes?.length?{signatureNotes:f.signatureNotes}:{};
 let verified=!!f.verified&&!f.notesDisputed;
 if(noteData.notePyramid&&notesError(noteData.notePyramid)){verified=false;issues.push({number:r.number,issue:'Incomplete notes',error:notesError(noteData.notePyramid)});}
 const packContents=(f.packContents||[]).map(v=>typeof v==='string'?v:[v.quantity&&v.quantity!==1?v.quantity+' ×':'',v.name,v.sizeMl?v.sizeMl+'ml':''].filter(Boolean).join(' '));
 const quality=f.notesDisputed?'disputed':f.notesQuality||((f.noteSources||[]).every(x=>['official','manufacturer'].includes(x.kind))?'manufacturer':'regional_reference');
 const p={id,group,brand,name,size,price:r.price,reference:null,format,quantity:r.quantity,available:r.quantity>0,enquiryOnly:false,condition:format==='Gift set'?'Retail gift set; contents listed below.':format==='Discovery kit'?'Brand discovery kit; individual samples, not a full bottle.':format==='Attar'?'Concentrated perfume oil; check application format on the packaging.':'Full retail bottle; packaging may vary.',image:photo?.image||'assets/community-photo-pending.webp',...(photo?{imageScale:photo.scale}:{photoPending:true}),deal:false,featured:false,hotSeller:false,hidden:false,archived:false,order:2000+r.number,featureOrder:2000+r.number,...noteData,description:f.description||`${name} by ${brand}.`,concentration:f.concentration||'Confirm on packaging',source:f.source,noteSources:f.noteSources||[],notesQuality:quality,notesCaveat:[f.notesCaveat,f.researchCaveat,f.packCaveat].filter(Boolean).join(' '),factsCheckedAt:'2026-11-08',factsRevision:1,finderVerified:verified,...(f.packLabel?{packContents,packLabel:f.packLabel}:{}),...(f.packProfiles?{packProfiles:f.packProfiles}:{})};
 if(existing.some(x=>x.group===group)&&fragranceFacts[group]){const canonical=fragranceFacts[group];for(const k of ['notePyramid','signatureNotes','description','family','pairing','concentration','source','noteSources','notesQuality','notesCaveat','factsCheckedAt','factsRevision','finderVerified','scentEdit']){delete p[k];if(canonical[k]!==undefined)p[k]=structuredClone(canonical[k]);}}
 if(format==='Discovery kit'||f.packProfiles?.length||f.packLabel&&!Object.keys(noteData).length)p.finderVerified=false;
 const hadPyramid=!!p.notePyramid,processed=processNotes(p);Object.assign(p,processed);if(!hadPyramid)delete p.notePyramid;p.family=p.family||f.family||((format==='Discovery kit')?'Fragrance discovery collection':processed.scentProfile.family);p.scentEdit=p.scentEdit||processed.scentProfile.edit;p.pairing=p.pairing||format==='Discovery kit'?'Explore individual scent profiles':processed.scentProfile.occasions.map(x=>({date:'Date night',evening:'Evening',daily:'Everyday',office:'Office',cafe:'Coffee outings',gift:'Gifting'}[x]||x)).join(' · ');p.publishedSizes=[p.packLabel||`${size} ml`];
 if(!photo)issues.push({number:r.number,issue:'Photo unresolved'});
 products.push(p);
}
const factKeys=['notePyramid','signatureNotes','description','family','pairing','concentration','publishedSizes','source','noteSources','notesQuality','notesCaveat','factsCheckedAt','factsRevision','finderVerified','scentEdit','packProfiles','packContents','packLabel'];
const body='// Merchant prices and availability from 8 November 2026; source-linked fragrance references.\nexport const novemberProducts='+JSON.stringify(products)+';\nconst factKeys='+JSON.stringify(factKeys)+';\nexport const novemberFragranceFacts=Object.fromEntries(novemberProducts.map(p=>[p.group,Object.fromEntries(factKeys.filter(k=>p[k]!==undefined).map(k=>[k,structuredClone(p[k])]))]));\nexport function mergeNovemberProducts(products){const ids=new Set(products.map(p=>p.id));return [...products,...structuredClone(novemberProducts).filter(p=>!ids.has(p.id))];}\n';
writeFileSync(root+'/dist/november-products.mjs',body);
const sqlQuote=s=>"'"+s.replaceAll("'","''")+"'";
writeFileSync(root+'/backend/migrations/0013_november_catalogue.sql','-- New identities only; replays preserve existing prices, stock, reservations and owner changes.\n'+products.map(p=>`INSERT OR IGNORE INTO products(id,data,price_paise,quantity,enabled) VALUES(${sqlQuote(p.id)},${sqlQuote(JSON.stringify(p))},${Math.round(p.price*100)},${p.quantity},${p.available?1:0});`).join('\n')+'\n');
writeFileSync(dir+'integration-report.json',JSON.stringify({requested:plan.length,skipped:plan.filter(p=>p.skipId).length,added:products.length,missing,issues,available:products.filter(p=>p.quantity>0).length,soldOut:products.filter(p=>p.quantity===0).length,formats:Object.fromEntries([...new Set(products.map(p=>p.format))].map(f=>[f,products.filter(p=>p.format===f).length]))},null,2)+'\n');
console.log(read('integration-report.json'));
