// D1-compatible adapter for local development/tests only. The Worker uses real D1.
import {DatabaseSync} from 'node:sqlite';
export class LocalD1 {
 constructor(path=':memory:'){this.sqlite=new DatabaseSync(path);this.sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');}
 exec(sql){this.sqlite.exec(sql);}
 prepare(sql){const db=this;return {bind(...args){return db.statement(sql,args)},...this.statement(sql,[])}}
 statement(sql,args){const db=this;return {sql,args,async first(){return db.sqlite.prepare(sql).get(...args)||null},async all(){return {results:db.sqlite.prepare(sql).all(...args)}},async run(){const r=db.sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}}
 async batch(statements){this.sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{const r=this.sqlite.prepare(s.sql).run(...s.args);return {success:true,meta:{changes:Number(r.changes)}}});this.sqlite.exec('COMMIT');return results}catch(e){this.sqlite.exec('ROLLBACK');throw e}}
 close(){this.sqlite.close()}
}
