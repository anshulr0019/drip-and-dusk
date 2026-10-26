import {defaults,inStock} from '../dist/core.mjs';
// Explicit demo seed. Never infer merchant-approved stock or prices from this file.
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
export function seedSQL(){return defaults().products.map(p=>`INSERT OR IGNORE INTO products(id,data,price_paise,quantity,enabled) VALUES(${quote(p.id)},${quote(JSON.stringify(p))},${Math.round((p.price||0)*100)},${p.quantity||0},${inStock(p)?1:0});`).join('\n')}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)process.stdout.write('-- SAMPLE CATALOGUE FOR TEST MODE ONLY\n'+seedSQL()+'\n');
