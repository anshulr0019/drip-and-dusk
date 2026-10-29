import {prepareStoreFields} from '../dist/store-settings.mjs';
import {researchMetadata} from '../dist/fragrance-facts.mjs';
import {validateProduct,defaults} from '../dist/core.mjs';
import {processNotes,notesError} from '../dist/fragrance-notes.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function prepareProduct(input){
 if(!input||typeof input!=='object')fail('Enter a fragrance.');
 const p={};
 for(const [key,max] of Object.entries({id:100,group:100,brand:80,name:160,format:30,condition:160,description:1200,notes:1500,source:500,family:120,pairing:160,concentration:100,scentEdit:30})){
  p[key]=String(input[key]??'').trim();if(p[key].length>max)fail(key+' is too long.');
 }
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(p.id)||!/^[a-zA-Z0-9-]{1,100}$/.test(p.group))fail('Invalid fragrance identifier.');
 for(const key of ['size','price','reference'])p[key]=input[key]===null||input[key]===''?null:input[key];
 for(const key of ['quantity','order','featureOrder'])p[key]=input[key];
 for(const key of ['enquiryOnly','available','deal','featured','hidden','archived','finderVerified','hotSeller'])p[key]=input[key]===true;
 p.image=String(input.image||'');
 if(!/^(assets\/[a-zA-Z0-9._-]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/.test(p.image)||p.image.length>1500000)fail('Choose a valid product image under 1 MB after resizing.');
 if(p.source){try{if(new URL(p.source).protocol!=='https:')fail('Use an HTTPS source link.')}catch{fail('Use a valid HTTPS source link.')}}
 const error=validateProduct(p);if(error)fail(error);
 if(p.finderVerified){const processed=processNotes(input),error=notesError(processed.notePyramid);if(error)fail(error);Object.assign(p,processed);p.family=p.family||processed.scentProfile.family;p.scentEdit=p.scentEdit||processed.scentProfile.edit;}
 else if(input.notePyramid){p.notePyramid=processNotes(input).notePyramid;}
 if(input.communityOffer){
  const q=input.communityOffer;
  if(!/^2026-10-(25|26|27|28|29)$/.test(q.postedAt)||q.contact!=='917021915706'||typeof q.shipping!=='string'||q.shipping.length>250||typeof q.status!=='string'||q.status.length>300)fail('Invalid community quote details.');
  p.communitySource=true;p.communityOffer={postedAt:q.postedAt,contact:q.contact,shipping:q.shipping,status:q.status,pricePlus:q.pricePlus===true};
 }
 p.photoPending=input.photoPending===true&&p.image==='assets/community-photo-pending.webp';
 if(input.publishedAccords){p.publishedAccords=String(input.publishedAccords).slice(0,500);}
 Object.assign(p,researchMetadata(p));
 return p;
}
export function prepareSettings(input){
 const out=prepareStoreFields(input);
 for(const key of ['about','ordering','shipping','payment','faq','reviews']){out[key]=String(input[key]??defaults().settings[key]).trim();if(out[key].length>6000)fail('Business information is too long.');}
 out.whatsapp=String(input.whatsapp||'').trim();if(out.whatsapp&&!/^[1-9]\d{7,14}$/.test(out.whatsapp))fail('Enter a WhatsApp number with country code, or leave it blank.');
 out.communityUrl=String(input.communityUrl||'').trim();if(out.communityUrl&&!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,100}$/.test(out.communityUrl))fail('Use the official WhatsApp community invite link (https://chat.whatsapp.com/…).');
 return out;
}
