import {applyCommunityPhotoUpdates} from './community-photo-updates.mjs';
import {communityProducts,mergeCommunityOffers} from './community-products.mjs';
import {enrichFragrance,migrateFragranceFacts} from './fragrance-facts.mjs';
import {processNotes} from './fragrance-notes.mjs';
import {instagramProducts} from './instagram-products.mjs';
export const KEY = 'drip-dusk-demo-v1';
export const money = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);
export const inStock = p => !!p && !p.enquiryOnly && Number.isFinite(p.price) && Number.isInteger(p.size) && p.size>0 && !p.hidden && !p.archived && p.available && p.quantity > 0;
export const discount = p => Number.isFinite(p.reference) && p.reference > p.price ? Math.round((p.reference-p.price)/p.reference*100) : null;
export const normalize = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export const catalogue = products => products.filter(p=>!p.hidden&&!p.archived).sort((a,b)=>a.order-b.order);
export function filterProducts(products, f, saved=[]) {
 let out=catalogue(products).filter(p=>(!f.query||normalize([p.brand,p.name,p.notes,p.description].join(' ')).includes(normalize(f.query)))&&(!f.brand||p.brand===f.brand)&&(!f.budget||(Number.isFinite(p.price)&&(f.budget==='over'?p.price>=3000:p.price<Number(f.budget))))&&(!f.stock||(f.stock==='in'?inStock(p):f.stock==='ask'?p.enquiryOnly:!p.enquiryOnly&&!inStock(p)))&&(!f.collection||matchesCollection(p,f.collection))&&(!f.kind||f.kind==='all'||(f.kind==='saved'?saved.includes(p.id):p.format===f.kind)));
 if(f.sort==='price-asc')out.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));if(f.sort==='price-desc')out.sort((a,b)=>a.price===null?b.price===null?0:1:b.price===null?-1:b.price-a.price);if(f.sort==='name')out.sort((a,b)=>a.name.localeCompare(b.name));return out;
}
export function validateProduct(p) {
 if(!p.name?.trim()||!p.brand?.trim()) return 'Brand and product name are required.';
 if(!(p.enquiryOnly&&p.size===null)&&(!Number.isInteger(p.size)||p.size<=0||p.size>2000))return 'Size must be a whole number from 1 to 2,000 ml.';
 if(!(p.enquiryOnly&&p.price===null)&&(!Number.isFinite(p.price)||p.price<1||p.price>1000000))return 'Enter a selling price between ₹1 and ₹10,00,000.';
 if(p.enquiryOnly&&(p.available||p.quantity!==0||p.reference!==null))return 'Enquiry-only products must have unconfirmed availability, zero recorded stock and no reference price.';
 if(p.reference!==null&&(!Number.isFinite(p.reference)||p.reference<=p.price))return 'Reference price must be greater than the selling price, or left blank.';
 if(!Number.isInteger(p.quantity)||p.quantity<0||p.quantity>10000)return 'Quantity must be a whole number from 0 to 10,000.';
 if(p.available&&p.quantity===0)return 'Add stock or mark this product sold out.';
 if(!Number.isFinite(p.order)||!Number.isFinite(p.featureOrder))return 'Display order must be a number.';
 if(!['Full bottle','Decant'].includes(p.format))return 'Choose a valid format.';
 return '';
}
export function saleProduct(p, qty) {
 if(!inStock(p))throw Error('This product is unavailable. Restock or make it visible before recording a sale.');
 if(!Number.isInteger(qty)||qty<1||qty>p.quantity)throw Error(`Enter a whole number from 1 to ${p.quantity}.`);
 return {...p,quantity:p.quantity-qty,available:p.quantity-qty>0};
}
export function basketSummary(products,basket) {
 const lines=basket.map(item=>{const p=products.find(x=>x.id===item.id);const valid=inStock(p)&&Number.isInteger(item.qty)&&item.qty>0&&item.qty<=p.quantity;return {...item,p,valid,subtotal:valid?p.price*item.qty:0};});
 return {lines,valid:lines.length>0&&lines.every(x=>x.valid),total:lines.reduce((s,l)=>s+l.subtotal,0)};
}
export function enquiryMessage(products,basket) {
 const s=basketSummary(products,basket);if(!s.valid)throw Error('Please remove unavailable items or adjust quantities before enquiring.');
 return `Hello Drip & Dusk! I’d like to enquire about:\n\n${s.lines.map((l,i)=>`${i+1}. ${l.p.brand} ${l.p.name}\n${l.p.size} ml · ${l.p.format} · ${l.p.condition}\nQuantity: ${l.qty} × ${money(l.p.price)} = ${money(l.subtotal)}`).join('\n\n')}\n\nEstimated total: ${money(s.total)}\n\nPlease confirm availability, shipping charges and payment details. This enquiry is not an order or stock reservation.`;
}
export const defaults = () => {
 const seeds=[
 ['hawas','Rasasi','Hawas for Him',100,3450,4200,8,'Fresh, aquatic and full of character. A bright opening with a warm, woody finish.','Apple · Bergamot · Lemon · Cinnamon / Orange blossom · Cardamom · Plum / Patchouli · Grey amber · Driftwood · Musk','https://rasasistore.com/products/hawas-for-him',true,true],
 ['khamrah','Lattafa','Khamrah',100,2199,2800,6,'Warm spice meets a rich, sweet heart. An invitation to slow down after dusk.','Bergamot · Cinnamon · Nutmeg / Dates accord · Lily of the valley · Praline · Tuberose / Tonka · Benzoin · Myrrh · Akigalawood · Vanilla · Amberwood','https://lattafa.com/product/khamrah/',true,false],
 ['asad','Lattafa','Asad',100,1699,2100,5,'Peppery warmth, a coffee heart and a smooth amber base. Bold by nature.','Black pepper · Pineapple · Tobacco / Coffee · Iris · Patchouli / Amber · Vanilla · Dry woods · Benzoin · Labdanum','https://lattafa.com/product/asad/',true,false],
 ['yara','Lattafa','Yara',100,1599,1950,7,'A soft, creamy floral with tropical sweetness and a comforting vanilla base.','Tangerine · Heliotrope · Orchid / Tropical notes · Gourmand / Vanilla · Sandalwood · Musk','https://lattafa.com/product/yara/',true,false],
 ['qahwa','Lattafa','Khamrah Qahwa',100,2499,3000,4,'A coffee-inflected take on warm spice and gourmand sweetness. Made for a slower evening.','Ginger · Cinnamon · Cardamom / Praline · Candied fruits · White flowers / Coffee · Tonka · Musk · Benzoin · Vanilla','https://lattafa.com/product/khamrah-qahwa/',false,true],
 ['oud-for-glory','Lattafa','Badee Al Oud — Oud for Glory',100,1999,null,0,'An amber-woody entry in the collection. Ask the seller to confirm the scent profile.','Note pyramid pending verification: the brand page contains conflicting note lists.','https://lattafa.com/product/badee-al-oud-oud-for-glory/',false,false],
 ['qaed','Lattafa','Qaed Al Fursan',90,1299,null,9,'Pineapple and saffron open into an aromatic heart and a warm, woody base.','Saffron · Pineapple / Jasmine · Fir balsam / Oud wood · Cedarwood · Amber','https://lattafa.com/product/qaed-al-fursan/',false,false]
 ];
 const products=seeds.map((s,i)=>enrichFragrance({id:s[0]+'-bottle',group:s[0],image:`assets/${s[0]}.jpg`,brand:s[1],name:s[2],size:s[3],price:s[4],reference:s[5],quantity:s[6],description:s[7],notes:s[8],source:s[9],deal:s[10],featured:s[11],format:'Full bottle',condition:'Sealed retail bottle',available:s[6]>0,order:i,featureOrder:i,hidden:false,archived:false}));
 seeds.forEach((s,i)=>products.push({...products[i],id:s[0]+'-10ml',size:10,format:'Decant',condition:'Seller-filled atomiser',price:[499,349,299,279,399,329,229][i],reference:null,quantity:i===5?0:12-i,available:i!==5,deal:false,featured:false,order:7+i}));
 products.push(...structuredClone(instagramProducts));
 products.splice(0,products.length,...mergeCommunityOffers(products));
 products.forEach(p=>{if(['hawas','khamrah','qahwa','yara'].includes(p.group)&&p.format==='Full bottle')p.hotSeller=true;});
 return {version:1,catalogueRevision:7,products,settings:{communityUrl:'',whatsapp:'',instagram:'',about:'Drip & Dusk is a multi-brand fragrance retailer. Explore full bottles and smaller decants, compare your options, and talk directly with the seller before deciding.',ordering:'Choose your fragrance, enter your delivery details and review the total. Pay by direct UPI or through Razorpay. Your order is confirmed as soon as the payment is verified.',shipping:'Delivery charges are shown at checkout before you pay. Once your order ships, its courier and tracking details appear on your private order page.',payment:'Pay by direct UPI or through Razorpay, with no added payment fee. Direct UPI orders are confirmed once we verify the payment. For cancellations or returns, contact us with your order reference.',faq:'Are prices and stock up to date?|Yes for anything you can add to your bag; checkout rechecks the price and stock before you pay. Community offers show dated seller quotes, so confirm the current price, availability and terms with us.\nWhat is a decant?|A smaller amount transferred from the original bottle into a separate atomiser. The photo shows the original bottle for reference, not the decant packaging.\nDoes adding to my bag reserve stock?|No. Your bottles are held once you place an order at checkout, and released if payment is not completed in time.\nHow do delivery and payment work?|Delivery charges are shown at checkout before you pay. Choose direct UPI or Razorpay; there is no added payment fee.',reviews:'Customer reviews have not been supplied. This space is reserved for genuine feedback shared with permission.'}};
};

// Styling and occasion pairings are editorial suggestions, not performance claims.
const PROFILES = {
 hawas: {family:'Fresh & aquatic', pairing:'Everyday · warm afternoons', edit:'fresh', scale:'.88', position:'50% 50%'},
 khamrah: {family:'Warm & gourmand', pairing:'After dark · cooler evenings', edit:'warm', scale:'1.55', position:'50% 50%'},
 asad: {family:'Spicy & amber', pairing:'After dark · dressed-up occasions', edit:'dark', scale:'1.55', position:'50% 50%'},
 yara: {family:'Soft & floral', pairing:'Everyday · unhurried weekends', edit:'soft', scale:'1.55', position:'50% 50%'},
 qahwa: {family:'Coffee & gourmand', pairing:'After dark · cooler evenings', edit:'warm', scale:'1.55', position:'50% 50%'},
 'oud-for-glory': {family:'Woody & amber', pairing:'Ask us for a personal recommendation', edit:'dark', scale:'1.55', position:'50% 50%'},
 qaed: {family:'Fruity & woody', pairing:'Everyday · relaxed occasions', edit:'fresh', scale:'1.55', position:'50% 50%'}
};
export const fragranceProfile = p => ({family:'Discover the scent',pairing:'Ask us for a personal recommendation',edit:'',scale:'1',position:'50% 50%',...PROFILES[p.group],...(p.finderVerified===true?{family:processNotes(p).scentProfile.family,edit:processNotes(p).scentProfile.edit}:{}),...(p.family?{family:p.family}:{}),...(p.pairing?{pairing:p.pairing}:{}),...(['fresh','warm','dark','soft'].includes(p.scentEdit)?{edit:p.scentEdit}:{}),concentration:p.concentration||'Confirm with seller'});
export const edits = [
 {id:'dark',name:'After dark',line:'Depth, warmth & a little intrigue.',number:'01',image:'asad'},
 {id:'fresh',name:'Fresh daily',line:'Bright openings. Easy company.',number:'02',image:'hawas'},
 {id:'warm',name:'Warm & spiced',line:'Comfort in the richer details.',number:'03',image:'khamrah'},
 {id:'under3000',name:'Under ₹3,000',line:'A considered place to begin.',number:'04',image:'yara'}
];
export function matchesCollection(p,id){
 if(id==='instagram')return !!p.instagramSource;
 if(id==='under3000')return Number.isFinite(p.price)&&p.price<3000;
 if(id==='dark')return ['dark','warm'].includes(fragranceProfile(p).edit);
 return fragranceProfile(p).edit===id;
}
export function catalogueDisplay(products,kind){
 if(kind==='Decant'||kind==='Full bottle'||kind==='saved')return products;
 const groups=new Map();
 for(const p of products){const key=p.group||p.id;const old=groups.get(key);if(!old||p.format==='Full bottle'&&old.format!=='Full bottle')groups.set(key,p)}
 return [...groups.values()];
}

export const sizeLabel = p => Number.isInteger(p.size)&&p.size>0?`${p.size} ml`:'Size to confirm';
export const priceLabel = p => Number.isFinite(p.price)?money(p.price)+(p.communityOffer?.pricePlus?' +':''):'Ask for price';
// Add the new catalogue once; preserve previous edits, archives and later deletions.
export function migrateCatalogue(state){
 if((state.catalogueRevision||0)>=7)return state;
 const ids=new Set(state.products.map(p=>p.id));let products=(state.catalogueRevision||0)<2?[...state.products,...structuredClone(instagramProducts).filter(p=>!ids.has(p.id))]:state.products;
 products=products.map(p=>['hawas-bottle','khamrah-bottle','qahwa-bottle','yara-bottle'].includes(p.id)&&p.hotSeller===undefined?{...p,hotSeller:true}:p);
 products=products.map(migrateFragranceFacts);
 if((state.catalogueRevision||0)<5)products=mergeCommunityOffers(products);
 products=applyCommunityPhotoUpdates(products);
 return {...state,catalogueRevision:7,products,settings:{communityUrl:'',...state.settings}};
}
export function referenceEnquiryMessage(p){
 if(!p||!p.enquiryOnly||p.hidden||p.archived)throw Error('This fragrance is unavailable for enquiry.');
 return `Hello Drip & Dusk! I’m interested in ${p.brand} ${p.name} ${p.communitySource?'from your community offers':'from your Instagram edit'}.${p.communityOffer?` Selected: ${sizeLabel(p)} · ${p.format} · ${p.condition}. Community post: ${p.communityOffer.postedAt}; quoted price: ${priceLabel(p)}. ${p.communityOffer.shipping} ${p.communityOffer.status}`:''} Please confirm the exact bottle version, available sizes, current price, stock, condition, shipping charges and payment details. This enquiry does not reserve stock or confirm an order.`;
}
