// Read-only Shipmozo key check. Keys are typed hidden (or fetched with the panel login using --login), tested once with
// Get-Warehouses, and never printed. On success it can save exactly the tested keys as Cloudflare Worker secrets.
// Usage: node scripts/shipmozo-check.mjs            paste both keys
//        node scripts/shipmozo-check.mjs --login    sign in with the Shipmozo panel username and password instead
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const base='https://shipping-api.com/app/api/v1',repo=fileURLToPath(new URL('..',import.meta.url));
const read=(q,hide)=>new Promise(res=>{const i=process.stdin;if(!i.isTTY){console.error('Run this in a terminal.');process.exit(2)}process.stdout.write(q);let s='';i.setRawMode(true);i.resume();i.setEncoding('utf8');const on=c=>{for(const ch of c.replace(/\x1b\[20[01]~/g,'')){if(ch==='\r'||ch==='\n'){i.setRawMode(false);i.pause();i.off('data',on);process.stdout.write(hide?' ✓\n':'\n');return res(s.trim())}if(ch==='\u0003'){i.setRawMode(false);process.stdout.write('\n');process.exit(130)}if(ch==='\u007f'||ch==='\b'){if(s&&!hide)process.stdout.write('\b \b');s=s.slice(0,-1);continue}if(ch>=' '){s+=ch;if(!hide)process.stdout.write(ch)}}};i.on('data',on)});
const call=async(path,init={})=>{try{const r=await fetch(base+path,{...init,headers:{accept:'application/json',...init.headers},signal:AbortSignal.timeout(20000)});return await r.json().catch(()=>({result:'?',message:'HTTP '+r.status+' with a non-JSON reply'}))}catch(e){console.log('❌ Could not reach Shipmozo ('+(e.name==='TimeoutError'?'timed out':e.message)+'). Check the internet connection and try again.');process.exit(1)}};
let pub,priv;
if(process.argv.includes('--login')){
 console.log('Signing in to Shipmozo to fetch the exact API keys. The password is sent only to Shipmozo and is not shown or saved.');
 const username=await read('Shipmozo username (the email or phone used to log in to panel.shipmozo.com): '),password=await read('Shipmozo password: ',true);
 const login=await call('/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
 const user=Array.isArray(login.data)?login.data[0]:login.data;
 if(String(login.result)!=='1'||!user?.public_key||!user?.private_key){console.log(`❌ Shipmozo did not sign in: "${login.message}". Check the username and password (try them on panel.shipmozo.com first).`);process.exit(1)}
 pub=String(user.public_key).trim();priv=String(user.private_key).trim();console.log('   Signed in. Fetched both keys (not shown).');
}else{
 pub=await read('Paste the Shipmozo PUBLIC key, then press Enter: ',true);priv=await read('Paste the Shipmozo PRIVATE key, then press Enter: ',true);
 if(!pub||!priv){console.log('❌ One of the keys was empty. Run it again and paste both.');process.exit(1)}
 if(pub===priv)console.log('⚠️  Both keys are identical. The public and private keys should be different.');
}
console.log(`   (lengths only: public ${pub.length} characters, private ${priv.length} characters)`);
const body=await call('/get-warehouses',{headers:{'public-key':pub,'private-key':priv}});
if(String(body.result)!=='1'){console.log(`❌ Shipmozo rejected these keys: "${body.message}".`);console.log(process.argv.includes('--login')?'   The keys came straight from Shipmozo, so ask Shipmozo seller support whether API access is enabled on this account.':'   Copying by hand is error-prone. Run: node scripts/shipmozo-check.mjs --login');process.exit(1)}
const list=Array.isArray(body.data)?body.data:[];
console.log('✅ The keys work. Shipmozo accepted them.');
if(!list.length)console.log('   No pickup warehouse is set up yet. Add the owner\'s pickup address in the Shipmozo panel → Warehouse.');
else{console.log('   Pickup warehouses on this account:');for(const w of list)console.log(`   • ID ${w.id} — ${w.address_title||'(untitled)'}, ${[w.city,w.pincode].filter(Boolean).join(' ')}${w.default==='YES'?' (default)':''}${w.status&&w.status!=='ACTIVE'?' ['+w.status+']':''}`)}
const answer=(await read('Save these exact keys to Cloudflare as the website\'s Shipmozo secrets now? (y/N): ')).toLowerCase();
if(answer!=='y'&&answer!=='yes'){console.log('   Not saved. Nothing in Cloudflare was changed.');process.exit(0)}
for(const [name,value] of [['SHIPMOZO_PUBLIC_KEY',pub],['SHIPMOZO_PRIVATE_KEY',priv]]){
 // wrangler reads a piped value from stdin, so the key never appears on screen or in shell history.
 const r=spawnSync('npx',['--yes','wrangler@4.153.0','secret','put',name,'--config','backend/wrangler.production.jsonc'],{cwd:repo,input:value,encoding:'utf8',stdio:['pipe','pipe','pipe']});
 const out=(r.stdout||'')+(r.stderr||'');
 if(r.status===0&&/success/i.test(out))console.log(`   ✅ Saved ${name} in Cloudflare.`);
 else{console.log(`   ❌ Could not save ${name}. Wrangler said:\n`+out.split('\n').filter(l=>/error|✘|already|not found|login|auth/i.test(l)).slice(0,6).join('\n'));process.exit(1)}
}
console.log('Done. The website\'s Shipmozo keys are now exactly the ones that just passed the check.');
