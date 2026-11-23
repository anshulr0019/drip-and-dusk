import test from 'node:test';
import assert from 'node:assert/strict';
import {searchReferenceNotes} from '../dist/fragrance-notes.mjs';
import {noteEntryContext} from '../dist/owner-note-entry.mjs';

test('note suggestions rank prefixes first and skip notes already in the field',()=>{
 assert.equal(searchReferenceNotes('bén')[0],'Benzoin');
 assert.ok(searchReferenceNotes('ben',{exclude:['BENZOIN']}).includes('Bengal Pepper'));
 assert.ok(!searchReferenceNotes('ben',{exclude:['BENZOIN']}).includes('Benzoin'));
});

test('completing the middle note leaves earlier and later notes in place',()=>{
 const value='Vanilla, ben · Sandalwood';
 const {start,end,query,otherNotes}=noteEntryContext(value,12);
 assert.equal(query,'ben');
 assert.equal(value.slice(start,end),'ben ');
 assert.deepEqual(otherNotes,['Vanilla','Sandalwood']);
});

test('autocomplete keeps an existing comma-containing accord in one note',()=>{
 const value='Cupuaçu, Cupuassu, Copoasu, ben';
 const {query,otherNotes}=noteEntryContext(value,value.length);
 assert.equal(query,'ben');
 assert.deepEqual(otherNotes,['Cupuaçu, Cupuassu, Copoasu']);
 assert.equal(noteEntryContext(value,20).start,0);
});
