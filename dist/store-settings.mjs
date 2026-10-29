export const storeDefaults={storeName:'Drip & Dusk',legalName:'',supportEmail:'',supportPhone:'',grievanceOfficer:'',businessAddress:'',instagramUrl:'',announcement:'',heroTitle:'Find your signature.',heroDescription:'From the first impression to the lasting memory. Discover fragrances worth making your own.',heroMedia:'film',lowStockThreshold:3};
export const defaultDelivery={feePaise:9900,freeAbovePaise:300000,label:'Standard delivery'};
export function deliveryRules(settings={},preview=true){const d=settings.delivery||defaultDelivery;return {preview,zones:[{prefixes:[''],feePaise:d.feePaise,label:d.label}],freeAbovePaise:d.freeAbovePaise};}
export function prepareStoreFields(input={}){
 const out={};for(const [key,max] of Object.entries({storeName:80,legalName:120,supportEmail:160,supportPhone:20,grievanceOfficer:120,businessAddress:600,instagramUrl:250,announcement:180,heroTitle:100,heroDescription:300})){out[key]=String(input[key]??storeDefaults[key]).trim();if(out[key].length>max)throw Error(key+' is too long.');}
 if(!out.storeName||!out.heroTitle||!out.heroDescription)throw Error('Keep the store name, hero headline and description filled.');
 if(out.supportEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.supportEmail))throw Error('Enter a valid support email.');
 // Customer-care number shown on the contact and policy pages: country code and digits only.
 if(out.supportPhone&&!/^[1-9]\d{7,14}$/.test(out.supportPhone))throw Error('Enter the support phone with country code, digits only (e.g. 919876543210).');
 if(out.instagramUrl){let u;try{u=new URL(out.instagramUrl)}catch{}if(!u||u.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(u.hostname)||u.username||u.password)throw Error('Use an HTTPS Instagram profile link.');}
 out.heroMedia=input.heroMedia??storeDefaults.heroMedia;if(!['film','poster'].includes(out.heroMedia))throw Error('Choose film or still image.');
 out.lowStockThreshold=input.lowStockThreshold??storeDefaults.lowStockThreshold;if(!Number.isInteger(out.lowStockThreshold)||out.lowStockThreshold<0||out.lowStockThreshold>100)throw Error('Low-stock threshold must be a whole number from 0 to 100.');
 if(input.delivery!==undefined){const d=input.delivery;if(!d||!Number.isInteger(d.feePaise)||d.feePaise<0||d.feePaise>100000||!(d.freeAbovePaise===null||Number.isInteger(d.freeAbovePaise)&&d.freeAbovePaise>=100&&d.freeAbovePaise<=100000000))throw Error('Check delivery charges and the free-delivery threshold.');const label=String(d.label||'').trim();if(!label||label.length>100)throw Error('Enter a delivery label of up to 100 characters.');out.delivery={feePaise:d.feePaise,freeAbovePaise:d.freeAbovePaise,label};}
 return out;
}
export function lowStockProducts(products,threshold=3){return products.filter(p=>!p.archived&&!p.hidden&&!p.enquiryOnly&&p.available&&p.quantity-(p.held||0)<=threshold).sort((a,b)=>(a.quantity-(a.held||0))-(b.quantity-(b.held||0)));}
