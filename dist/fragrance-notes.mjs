import {referenceNoteGroups} from './reference-notes.mjs';

// Shared by the owner form, server catalogue and scent finder.
// Match whole words and phrases. Preserve the original spelling for display.
const normalizedNotes=new Map();
export function normalizeNote(value){
 if(typeof value!=='string')return '';
 if(normalizedNotes.has(value))return normalizedNotes.get(value);
 const key=value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()
  .replace(/['’]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 if(normalizedNotes.size>=5000)normalizedNotes.clear();
 normalizedNotes.set(value,key);
 return key;
}
export const matchesNoteTerm=(note,term)=>{
 const key=normalizeNote(term);
 return !!key&&(' '+normalizeNote(note)+' ').includes(' '+key+' ');
};

// Drip & Dusk's editorial mapping from note terms to shopping preferences.
export const noteTerms={
 fresh:['bergamot','lemon','lime','orange','mandarin','tangerine','grapefruit','apple','pineapple','aquatic','marine','citrus','mint','green','pear','sea water','ambergris','yuzu','citron','petitgrain','petit grain','clementine','kumquat','verbena','litsea','raspberry','raspberries','blackcurrant','black currant','black current','redcurrant','cassis','peach','nectarine','apricot','plum','mango','lychee','litchi','strawberry','strawberries','rhubarb','passionfruit','passion fruit','guava','melon','pomegranate','cherry','berries','blueberry','blackberry','kiwi','papaya','dragon fruit','pitahaya','fig','fruit','fruits','fruity','cucumber','galbanum','bamboo','cactus','tomato leaf','tomato leaves','granny smith','anjou','cedrat','sea notes','sea accord','sea salt','seaweed','ozone','ozonic','calone','aquozone','cascalone','water notes','dew','pomelo','hassaku','calamansi','chinotto','sudachi','blood orange','bitter orange','quince','gooseberry','boysenberry','mulberry','cloudberry','black currants','blackcurrants','pink guava','carambola','starfruit','mangosteen','tamarind','grapes','white peach','watermelon','spearmint','peppermint','frost','ice accord'],
 sweet:['vanilla','praline','tonka','toka bean','dates','candied','gourmand','caramel','chocolate','honey','tropical','sugar','toffee','butterscotch','marshmallow','almond','coconut','milk','cream','cocoa','cacao','brulee','meringue','biscuit','cookie','cupcake','candy','pistachio','hazelnut','chestnut','nutty','coumarin','maltol','lactonic','butter','gelato','panna cotta','dulce de leche','frosting','jam','rum','cognac','whiskey','whisky','amaretto','liqueur','liquor','boozy','banana','sapodilla','champagne','sweet note','sweet accord','maple syrup','syrup','brown sugar','molasses','torrone','nougat','baklava','halva','tiramisu','brioche','macaron','macaroon','shortbread','popcorn','rice pudding','rice milk','condensed milk','white chocolate','cotton candy','churros'],
 woody:['wood','woods','woody','patchouli','cedar','sandalwood','oud','fir balsam','vetiver','vetivar','oakmoss','oak moss','moss','oak','cypress','cypriol','nagarmotha','guaiac','gaiac','birch','mahogany','pine tree','siberian pine','pine needle','spruce','cashmeran','cashmere','iso e super','papyrus','palo santo','gurjan','gurjum','incense','frankincense','olibanum','smoke','smoky','cade','truffle','earthy','orris root','agarwood','agar wood','aoud','oudh','rosewood','cedarwood','cedar wood','teak','ebony','hinoki','sugi','redwood','amyris','balsam fir','copaiba','ho wood','muhuhu','birchwood','mesquite','dry woods','mossy','mosses','geosmin','tree bark'],
 floral:['flower','jasmine','jasmin','sambac','orchid','heliotrope','iris','tuberose','lily','peony','rose','lavender','lavandin','violet','magnolia','neroli','freesia','orris','floral','blossom','petal','ylang','gardenia','osmanthus','frangipani','tiare','muguet','lotus','cyclamen','carnation','narcissus','mimosa','lilac','hibiscus','daisy','marigold','geranium','pelargonium','linden','broom','hawthorn','honeysuckle','champaca','mahonia','hedione','reseda','chamomile','rangoon creeper','rosyfolia','tubercose','immortelle','plumeria','flowers','blossoms','tuberoses','cananga','hyacinth','wisteria','sweet pea','crocus','calendula','anthurium','edelweiss','elderflower','honeysuckle','lily of the valley','spider lily','orange flower','fiore','monoi','magnolan','freesias','night blooming cereus'],
 coffee:['coffee','espresso','arabica','mocha','cappuccino','ristretto','robusta','cafe latte'],
 spicy:['pepper','cinnamon','nutmeg','saffron','cardamom','ginger','basil','thyme','armoise','spice','spices','spicy','clove','pimento','allspice','turmeric','cumin','coriander','caraway','star anise','anise','licorice','liquorice','sage','rosemary','bay leaf','laurel','oregano','myrtle','artemisia','mugwort','tarragon','juniper','angelica','davana','aromatic','herbal','elemi','mastic','lentisk','fenugreek','shiso','perilla','marjoram','savory','fennel','dill','lemongrass','garam masala','sansho','wasabi','horseradish','curry leaf','curry leaves','black cardamom','carom','ajwain','lovage','tea tree','nigella','sumac','vanilla pepper'],
 leather:['leather','suede','castoreum','birch tar','cade','animalic','saffiano','buckskin','rawhide','saddle','rubber','saffraleine','isobutyl quinoline'],
 marine:['sea water','marine','aquatic','ambergris','amber gris','sand','driftwood','sea notes','sea accord','sea salt','salt','seaweed','ozone','ozonic','calone','aquozone','cascalone','water notes','mineral notes'],
 tea:['tea','mate','matcha','oolong','earl grey','lapsang souchong','rooibos','hojicha','genmaicha','sencha','pu erh','puerh','darjeeling','assam tea','tisane','honeybush','blacktea'],
 green:['green','greenery','grass','grassy','hay','fern','fougere','galbanum','fig leaf','fig leaves','fig tree','violet leaf','violet leaves','tomato leaf','tomato leaves','ivy','nettle','bamboo','cucumber','vegetal','stem','stems','burdock','eucalyptus','basil','tea tree','shiso','cannabis','petrichor'],
 amber:['amber','ambery','ambrarome','benzoin','labdanum','cistus','myrrh','opoponax','opopanax','styrax','storax','balsam','balsamic','resin','resins','resinous','tolu balsam','peru balsam','elemi','amberwood','amber wood','ambroxan','ambrox','cetalox','ambrofix','orcanox','lorenox'],
 musk:['musk','musks','musky','ambrette','ambrettolide','galaxolide','habanolide','helvetolide','exaltolide','ethylene brassylate','muscone','musk ketone','sylkolide','cashmeran','civet','castoreum','costus','hyraceum','animalic'],
 powdery:['powder','powdery','talc','talcum','lipstick','face powder','orris','iris','heliotrope','violet','rice powder','vanillic powder'],
 smoky:['smoke','smoky','smoked','incense','frankincense','olibanum','myrrh','birch tar','cade','charcoal','burnt wood','ash','ashes','campfire','firewood','tobacco','lapsang souchong','guaiac'],
 boozy:['rum','cognac','brandy','whiskey','whisky','bourbon whiskey','bourbon whisky','amaretto','liqueur','mead','wine','champagne','vermouth','gin','vodka','absinthe','sake','tequila','mezcal','boozy','beer', 'aquavit'],
 drinks:[],
 unusual:[]
};

const referenceGroups=new Map();
const referenceNames=new Map();
for(const [group,notes] of Object.entries(referenceNoteGroups)){
 for(const note of notes){
  const key=normalizeNote(note);
  if(!referenceGroups.has(key))referenceGroups.set(key,new Set());
  referenceGroups.get(key).add(group);
  if(!referenceNames.has(key))referenceNames.set(key,note);
 }
}
const referenceOptions=[...referenceNames].sort(([a],[b])=>a.length-b.length||a.localeCompare(b));
export function searchReferenceNotes(query,{exclude=[],limit=12}={}){
 const key=normalizeNote(query);
 if(!key)return [];
 const used=new Set(exclude.map(normalizeNote));
 const prefix=[],wordPrefix=[],contains=[];
 for(const [normalized,name] of referenceOptions){
  if(used.has(normalized))continue;
  if(normalized.startsWith(key))prefix.push(name);
  else if(normalized.includes(' '+key))wordPrefix.push(name);
  else if(normalized.includes(key))contains.push(name);
  if(prefix.length===limit)return prefix;
 }
 return [...prefix,...wordPrefix,...contains].slice(0,limit);
}

const nutTerms=/\b(?:almonds?|nuts?|cashews?|peanuts?|pecans?|chestnuts?|walnuts?|macadamia|pistachios?|hazelnuts?|acorn)\b/;
const vegetableTerms=/\b(?:lettuce|celery|zucchini|cabbage|broccoli|cucumber|carrots?|peas?|artichoke|tomato|asparagus|beetroot|rhubarb|spinach|kale|bell pepper)\b/;
const alcoholicDrinks=/\b(?:advocaat|aperol|amaretto|amarula|applejack|baileys|batida|bellini|bloody mary|caipirinha|cachaca|calvados|campari|chhaang|cocktail|curacao|daiquiri|eau de vie|genepi|goldwasser|grogue|kir royal|limoncello|mai tai|madeira|margarita|martini|midori|mojito|moonshine|moscow mule|negroni|ouzo|prosecco|raki|rhum|sangria|sherry|soju|baijiu|triple sec|umeshu|vieux carre|yellow wine|wine|ale|liqueur|liquer|liquor)\b/;
const specialNotes=new Map(Object.entries({
 'white tobacco':['smoky'], 'rose hip':['fresh'], 'vanilla':['sweet'],
 'ambergris':['marine','musk'], 'daim':['leather'], 'horse skin':['leather','musk'],
 'beeswax':['sweet','musk'], 'coral reef':['marine'], 'sea shells':['marine'],
 'sea cucumber':['marine'], 'oysters':['marine'], 'starfish':['marine'],
 'bakhoor':['smoky','amber'], 'nag champa':['smoky','amber'], 'kyphi':['smoky','amber'],
 'rubber':['leather'], 'tea tree oil':['green','spicy'], 'surf wax':['unusual'],
 'chai latte':['tea','spicy'], 'masala chai':['tea','spicy'], 'affogato':['coffee','sweet'],
 'macchiato':['coffee'], 'choya loban':['smoky','amber'], 'root beer':['drinks'], 'pandan':['green','sweet'],
 'balsamic vinegar':['unusual'], 'poplar populus buds':['green'],
 'coffee blossom':['floral'], 'tea rose':['floral'],
 'gun smoke':['smoky','unusual'], 'powder from the moon':['powdery','unusual']
}));
function applyReferenceGroups(key,detected){
 const override=specialNotes.get(key);
 if(override)return override;
 const groups=referenceGroups.get(key);
 if(!groups)return detected;
 const mapped=new Set();
 const preserve=(...choices)=>choices.forEach(style=>{if(detected.includes(style))mapped.add(style)});
 for(const group of groups){
  switch(group){
   case 'citrus': mapped.add('fresh'); preserve('green','sweet'); break;
   case 'fruit':
    mapped.add(nutTerms.test(key)?'sweet':vegetableTerms.test(key)?'green':'fresh');
    preserve('sweet','green'); break;
   case 'floral': mapped.add('floral'); preserve('powdery'); break;
   case 'green': mapped.add('green'); preserve('fresh','spicy','tea','marine','woody'); break;
   case 'spicy':
    if(detected.includes('coffee'))mapped.add('coffee');
    else{mapped.add('spicy');preserve('sweet','green');}
    break;
   case 'sweet': mapped.add('sweet'); preserve('coffee','tea','boozy'); break;
   case 'woody': mapped.add('woody'); preserve('amber','smoky','leather'); break;
   case 'resin': mapped.add('amber'); preserve('woody','smoky','spicy'); break;
   case 'animalic':
    preserve('amber','musk','leather','marine','smoky','sweet','woody','green');
    if(!mapped.size)mapped.add(/\b(?:amber|ambre|ambro|aldron|cachalox|civet|genet|fur|feathers|grisalva|muskrat|velvione|animal|skin|skatole)\w*\b/.test(key)?
     (/\b(?:amber|ambre|ambro|aldron|cachalox|grisalva)\w*\b/.test(key)?'amber':'musk'):'unusual');
    break;
   case 'drinks':
    mapped.add('drinks'); preserve('coffee','tea','boozy');
    if(alcoholicDrinks.test(key))mapped.add('boozy');
    break;
   case 'unusual': detected.forEach(style=>mapped.add(style)); break;
  }
 }
 return mapped.size?[...mapped]:['unusual'];
}

const compiledTerms=Object.entries(noteTerms).map(([style,terms])=>
 [style,[...new Set(terms.map(normalizeNote))].map(term=>' '+term+' ')]);
const styleCache=new Map();
export function noteStyles(note){
 const key=normalizeNote(note);
 if(!key)return [];
 if(styleCache.has(key))return styleCache.get(key);
 const padded=' '+key+' ';
 const floralPart=/\b(?:blossoms?|flowers?|petals?)\b/.test(key);
 const leafyPart=/\b(?:leaves|leaf|stems?|tree)\b/.test(key);
 const detected=compiledTerms.filter(([style,terms])=>{
  if(style==='coffee'&&(floralPart||leafyPart))return false;
  if(style==='tea'&&(floralPart||/\b(?:tea rose|tea tree)\b/.test(key)))return false;
  if(style==='fresh'&&floralPart)return false;
  if(['floral','powdery'].includes(style)&&leafyPart&&!floralPart)return false;
  if(style==='floral'&&key==='rose hip')return false;
  return terms.some(term=>padded.includes(term));
 }).map(([style])=>style);
 if(styleCache.size>=5000)styleCache.clear();
 const styles=applyReferenceGroups(key,detected);
 styleCache.set(key,styles);
 return styles;
}

const compoundNotes=new Set([...referenceNames].filter(([,note])=>note.includes(',')).map(([key])=>key));
export function parseNoteInput(value){
 if(Array.isArray(value))return value.map(n=>String(n).trim()).filter(Boolean);
 const notes=[];
 for(const line of String(value||'').split(/[·;\n]/)){
  const segments=line.split(',').map(n=>n.trim()).filter(Boolean);
  for(let i=0;i<segments.length;){
   const compound=[3,2].find(count=>i+count<=segments.length&&compoundNotes.has(normalizeNote(segments.slice(i,i+count).join(', '))));
   const count=compound||1;
   notes.push(segments.slice(i,i+count).join(', '));
   i+=count;
  }
 }
 return notes;
}
const split=parseNoteInput;
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
 const scores=Object.fromEntries(Object.keys(noteTerms).map(style=>[style,0]));
 for(const [stage,weight] of [['top',2],['heart',3],['base',2]]){
  const seen=new Set();
  for(const note of pyramid[stage]){
   const key=normalizeNote(note);
   if(seen.has(key))continue;
   seen.add(key);
   for(const style of noteStyles(note))scores[style]+=weight;
  }
 }
 // One fresh or floral accent should not dominate a warm fragrance.
 const spices=(normalizeNote(notes).match(/\b(?:cinnamon|nutmeg|tobacco|pepper|myrrh)\b/g)||[]).length;
 const floralCore=scores.floral>=4&&scores.sweet<=scores.floral+5&&spices<2;
 const other=['amber','musk','green','powdery','smoky','boozy','marine','tea','spicy','leather','drinks','unusual']
  .reduce((best,style)=>scores[style]>(scores[best]||0)?style:best,null);
 const main=scores.coffee?'coffee':floralCore?'floral':scores.sweet>=4||spices>=2?'sweet':
  scores.fresh>=Math.max(scores.woody-2,scores.floral)&&scores.fresh>0?'fresh':
  (scores.woody>=scores[other]||!other)&&scores.woody?'woody':other;
 const warm=['coffee','sweet','amber','smoky','boozy','spicy','leather','drinks','unusual'].includes(main);
 const classified={coffee:'Coffee & gourmand',sweet:'Warm & spiced',fresh:'Fresh & bright',floral:'Soft & floral',woody:'Woody & textured',amber:'Amber & resinous',musk:'Musky',green:'Green & leafy',powdery:'Soft & powdery',smoky:'Smoky & incense',boozy:'Boozy',marine:'Marine & airy',tea:'Tea',spicy:'Spicy & herbal',leather:'Leathery',drinks:'Drink accords',unusual:'Unusual accords'};
 const family=classified[main]||'A personal discovery';
 const directions=Object.keys(scores).filter(k=>scores[k]>0&&(!['fresh','floral'].includes(k)||main===k));
 const occasions=warm?['date','evening','gift']:['daily','office','cafe','gift'];
 const edit=main==='fresh'||main==='green'||main==='marine'?'fresh':main==='floral'||main==='powdery'?'soft':warm?'warm':main==='woody'?'dark':'';
 return {...(signature?{signatureNotes:signature}:{notePyramid:pyramid}),notes,scentProfile:{directions,occasions,family,edit,scores}};
}
