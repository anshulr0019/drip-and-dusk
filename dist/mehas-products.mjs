const releases = [
 {
  slug:'beast-mode',
  name:'Beast Mode',
  description:'White grapefruit and cardamom brighten a heart of apple, raspberry and jasmine. Amber, musk and sandalwood bring warmth to the finish.',
  notePyramid:{top:['White grapefruit','Geranium','Cardamom'],heart:['Apple','Jasmine','Raspberry'],base:['Musk','Amber','Sandalwood']}
 },
 {
  slug:'silverback',
  name:'Silverback',
  description:'Mandarin, lemon and sea salt give the opening a bright edge, with suede underneath. Jasmine and moss lead into patchouli, musk and mineral amber.',
  notePyramid:{top:['Mandarin','Sea salt','Suede','Lemon'],heart:['Amber','Jasmine','Moss'],base:['Patchouli','Musk','Mineral amber']}
 },
 {
  slug:'monarch',
  name:'Monarch',
  description:'Pink pepper, incense and bergamot open into jasmine, rose and cedarwood. Vanilla, sandalwood and musk round out the base.',
  notePyramid:{top:['Pink pepper','Incense','Bergamot'],heart:['Jasmine','Rose','Cedarwood'],base:['Vanilla','Sandalwood','Musk']}
 }
];

export const mehasProducts = releases.map(({slug,name,description,notePyramid},index)=>{
 const group='mehas-'+slug;
 const order=3000+index;
 return {
  id:group+'-bottle',group,brand:'Mehas',name,description,notePyramid,
  notes:Object.values(notePyramid).map(stage=>stage.join(' · ')).join(' / '),finderVerified:true,
  image:'assets/'+group+'.webp',size:100,concentration:'Extrait de Parfum',
  format:'Full bottle',condition:'Retail bottle with presentation box',
  price:3500,reference:null,quantity:0,available:false,enquiryOnly:false,
  order,featureOrder:order,deal:false,featured:false,hotSeller:false,hidden:false,archived:false
 };
});

const releaseOrder=new Map(mehasProducts.map(({id},index)=>[id,index]));
export const mehasPriority=product=>releaseOrder.get(product.id);
const packaging=new Map(mehasProducts.map(({image,group})=>[image,'assets/'+group+'-packaging.webp']));
export const mehasPackagingPhoto=product=>packaging.get(product.image);
