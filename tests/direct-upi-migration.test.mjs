// Migrations 0010 and 0011 on a full chain: they rewrite only untouched launch copy and add columns without losing rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {LocalD1} from '../backend/local-db.mjs';
import {defaults} from '../dist/core.mjs';
const folder=new URL('../backend/migrations/',import.meta.url),names=(await readdir(folder)).filter(n=>n.endsWith('.sql')).sort();
const sql=Object.fromEntries(await Promise.all(names.map(async n=>[n,await readFile(new URL(n,folder),'utf8')])));
const chain=(upTo)=>{const DB=new LocalD1();DB.exec(names.filter(n=>n<=upTo).map(n=>sql[n]).join('\n'));return DB};
const launch=sql['0008_launch_copy.sql'],original=k=>launch.match(new RegExp("json_extract\\(data,'\\$\\."+k+"'\\)='([\\s\\S]*?)';"))[1];
// The settings exactly as the original demo shipped them; 0008 then rewrites them to the launch copy, as it did in production.
const launched=()=>{const DB=chain('0007_catalogue_packshots.sql');DB.sqlite.prepare('INSERT INTO store_settings(id,data) VALUES(1,?)').run(JSON.stringify(Object.fromEntries(['ordering','shipping','payment','faq'].map(k=>[k,original(k)]))));DB.exec(sql['0008_launch_copy.sql']+'\n'+sql['0009_complete_fragrance_profiles.sql']);return DB};
const faq=DB=>DB.sqlite.prepare("SELECT json_extract(data,'$.faq') faq,json_extract(data,'$.ordering') ordering,json_extract(data,'$.payment') payment,revision FROM store_settings WHERE id=1").get();
test('0010 does nothing when there are no settings row',t=>{
 const DB=chain('0009_complete_fragrance_profiles.sql');t.after(()=>DB.close());DB.exec(sql['0010_direct_upi_copy.sql']);assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM store_settings').get().n,0);
});
test('0010 moves the launch copy to the Direct UPI wording and matches the code defaults',t=>{
 const DB=launched();t.after(()=>DB.close());assert.match(faq(DB).faq+faq(DB).ordering,/Razorpay/);
 DB.exec(sql['0010_direct_upi_copy.sql']);
 const row=faq(DB),d=defaults().settings;assert.equal(row.faq,d.faq);assert.equal(row.ordering,d.ordering);assert.equal(row.payment,d.payment);assert.doesNotMatch(row.faq+row.ordering+row.payment,/Razorpay/);
 DB.exec(sql['0010_direct_upi_copy.sql']);assert.deepEqual(faq(DB),row,'running it again changes nothing');
});
test('0010 leaves an owner-edited FAQ untouched, byte for byte, even if it mentions the old sentence',t=>{
 const DB=launched(),m8=faq(DB).faq;t.after(()=>DB.close());
 const edited=m8+'\nMy own question?|My own answer.';
 for(const custom of [edited,'Q?|Choose direct UPI or Razorpay; there is no added payment fee.',m8.replace('Yes for anything','Yes, for anything')]){
  DB.exec('DELETE FROM store_settings');DB.sqlite.prepare('INSERT INTO store_settings(id,data) VALUES(1,?)').run(JSON.stringify({faq:custom}));
  DB.exec(sql['0010_direct_upi_copy.sql']);assert.equal(faq(DB).faq,custom);
 }
});
test('0011 adds the order-safety columns and indexes to existing rows without changing them',t=>{
 const DB=chain('0010_direct_upi_copy.sql');t.after(()=>DB.close());
 DB.sqlite.prepare("INSERT INTO quotes(id,data,expires_at) VALUES('q','{}',1)").run();
 DB.sqlite.prepare("INSERT INTO orders(id,ref,request_id,request_hash,quote_id,customer,lines,subtotal_paise,shipping_paise,total_paise,delivery_label,mode,created_at,expires_at,updated_at) VALUES('o','DD-1','r','h','q','{}','[]',1,0,1,'d','live',1,2,3)").run();
 DB.exec(sql['0011_order_safety.sql']);
 const row=DB.sqlite.prepare("SELECT * FROM orders WHERE id='o'").get();
 assert.deepEqual([row.tracking_version,row.phone_hash,row.visitor_hash,row.client_ip_hash,row.received_paise,row.anonymised_at],[1,null,null,null,null,null]);assert.equal(row.ref,'DD-1');
 const idx=DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'orders_open_%'").all().map(r=>r.name).sort();assert.deepEqual(idx,['orders_open_ip','orders_open_phone','orders_open_visitor']);
});
