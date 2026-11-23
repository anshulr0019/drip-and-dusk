// Shared by the owner form, server catalogue and scent finder.
// Note names repeat across hundreds of products; cache the accent-folding so home-page edits stay cheap on phones.
const cleaned=new Map(),clean=s=>{s=String(s||'');let v=cleaned.get(s);if(v===undefined){if(cleaned.size>5000)cleaned.clear();v=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();cleaned.set(s,v)}return v};
export const matchesNoteTerm=(note,term)=>term==='sand'?/\bsand\b/.test(clean(note)):clean(note).includes(term);
export const noteTerms={
 fresh:['bergamot','lemon','lime','orange','mandarin','tangerine','grapefruit','apple','pineapple','aquatic','marine','citrus','mint','green','pear','sea water','ambergris','yuzu','citron','petitgrain','petit grain','clementine','kumquat','verbena','litsea','raspberr','blackcurrant','black currant','black current','redcurrant','cassis','peach','nectarine','apricot','plum','mango','lychee','litchi','strawberr','rhubarb','passionfruit','passion fruit','guava','melon','pomegranate','cherry','berries','blueberry','blackberry','kiwi','papaya','dragon fruit','pitahaya','fig','fruit','cucumber','galbanum','bamboo','cactus','tomato lea','granny smith','anjou','cedrat','sea notes','sea accord','sea salt','seaweed','ozon','calone','aquozone','cascalone','water notes','dew'],
 sweet:['vanilla','praline','tonka','toka bean','dates','candied','gourmand','caramel','chocolate','honey','tropical','sugar','toffee','butterscotch','marshmallow','almond','coconut','milk','cream','cocoa','cacao','brulee','meringue','biscuit','cookie','cupcake','candy','pistachio','hazelnut','chestnut','nutty','coumarin','maltol','lactonic','butter','gelato','panna cotta','dulce de leche','frosting','jam','rum','cognac','whiskey','amaretto','liqueur','liquor','boozy','banana','sapodilla','champagne','sweet note','sweet accord'],
 woody:['wood','patchouli','cedar','sandalwood','oud','fir balsam','vetiver','vetivar','oakmoss','oak moss','moss','oak','cypress','cypriol','nagarmotha','guaiac','gaiac','birch','mahogany','pine tree','siberian pine','pine needle','spruce','cashmeran','cashmere','iso e super','papyrus','palo santo','gurjan','gurjum','incense','frankincense','olibanum','smoke','smoky','cade','truffle','earthy','orris root'],
 floral:['flower','jasmine','jasmin','sambac','orchid','heliotrop','iris','tuberose','lily','peony','rose','lavender','lavandin','violet','magnolia','neroli','freesia','orris','floral','blossom','petal','ylang','gardenia','osmanthus','frangipani','tiare','muguet','lotus','cyclamen','carnation','narcissus','mimosa','lilac','hibiscus','daisy','marigold','geranium','pelargonium','linden','broom','hawthorn','honeysuckle','champaca','mahonia','hedione','reseda','chamomile','rangoon creeper','rosyfolia','tubercose','immortelle','plumeria'],
 coffee:['coffee','espresso','arabica','mocha'],
 spicy:['pepper','cinnamon','nutmeg','saffron','cardamom','ginger','basil','thyme','armoise','spic','clove','pimento','allspice','turmeric','cumin','coriander','caraway','star anise','anise','licorice','liquorice','sage','rosemary','bay leaf','laurel','oregano','myrtle','artemisia','mugwort','tarragon','juniper','angelica','davana','aromatic','herbal','elemi','mastic','lentisk'],
 leather:['leather','suede','castoreum','birch tar','cade','animalic'],
 marine:['sea water','marine','aquatic','ambergris','amber gris','sand','driftwood','sea notes','sea accord','sea salt','salt','seaweed','ozon','calone','aquozone','cascalone','water notes','mineral notes'],
 tea:['tea','mate','matcha','oolong','earl grey']
};
const split=s=>(Array.isArray(s)?s:String(s||'').split(/[·,;\n]/)).map(n=>String(n).trim()).filter(Boolean);
export function notePyramid(p){
 if(p.signatureNotes&&!p.notePyramid)return {top:[],heart:[],base:[]};
 if(p.notePyramid&&typeof p.notePyramid==='object')return Object.fromEntries(['top','heart','base'].map(k=>[k,split(p.notePyramid[k])]));
 const stages=String(p.notes||'').split('/');return {top:split(stages[0]),heart:split(stages[1]),base:split(stages[2])};
}
export const invalidNoteText=/pending|conflict|unverified|unknown|confirm|verification|no account yet|sign in|log in|add to cart|checkout|subscribe|cookies?\s*(?:policy|consent|settings|preferences|banner)|password|privacy policy/i;
export function validNoteList(value){const list=split(value);return list.length>0&&list.length<=24&&list.every(n=>n.length<=80&&!invalidNoteText.test(n));}
export function notesError(pyramid){
 if(!pyramid||typeof pyramid!=='object')return 'Add top, heart and base notes.';
 for(const key of ['top','heart','base']){const list=split(pyramid[key]);if(!validNoteList(list))return 'Enter verified notes for all three stages (up to 24 notes per stage).';}
 return '';
}
export function processNotes(p){
 const signature=!p.notePyramid&&p.signatureNotes?split(p.signatureNotes):null;
 const pyramid=signature?{top:[],heart:signature,base:[]}:notePyramid(p),notes=signature?'Signature notes: '+signature.join(' · '):['top','heart','base'].map(k=>pyramid[k].join(' · ')).join(' / ');
 const scores=Object.fromEntries(Object.entries(noteTerms).map(([style,terms])=>[style,['top','heart','base'].reduce((sum,k,i)=>sum+pyramid[k].filter(n=>terms.some(t=>matchesNoteTerm(n,t))).length*[2,3,2][i],0)]));
 // One bright top note must not turn a vanilla/amber fragrance into a fresh scent.
 const spices=(clean(notes).match(/cinnamon|nutmeg|tobacco|pepper|myrrh/g)||[]).length;
 const floralCore=scores.floral>=4&&scores.sweet<=scores.floral+5&&spices<2;
 const main=scores.coffee?'coffee':floralCore?'floral':scores.sweet>=4||spices>=2?'sweet':scores.fresh>=Math.max(scores.woody-2,scores.floral)&&scores.fresh>0?'fresh':scores.woody?'woody':null;
 const warm=['coffee','sweet'].includes(main);
 const directions=Object.keys(scores).filter(k=>scores[k]>0&&(!['fresh','floral'].includes(k)||main===k));
 const family={coffee:'Coffee & gourmand',sweet:'Warm & spiced',fresh:'Fresh & bright',floral:'Soft & floral',woody:'Woody & textured'}[main]||'A personal discovery';
 const occasions=warm?['date','evening','gift']:['daily','office','cafe','gift'];
 return {...(signature?{signatureNotes:signature}:{notePyramid:pyramid}),notes,scentProfile:{directions,occasions,family,edit:main==='fresh'?'fresh':main==='floral'?'soft':warm?'warm':main==='woody'?'dark':'',scores}};
}
