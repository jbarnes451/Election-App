import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const dir=new URL('../',import.meta.url);
const appEl={innerHTML:''},toastEl={textContent:'',className:''};
const events={};
const store=new Map();
globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,v)=>store.set(key,v)};
globalThis.window={ELECTION_APP_CONFIG:{},addEventListener:()=>{},scrollTo:()=>{},location:{origin:'http://localhost',pathname:'/'}};
globalThis.document={getElementById:id=>id==='app'?appEl:id==='toast'?toastEl:null,addEventListener:(name,fn)=>{events[name]=fn;},querySelector:()=>null,activeElement:null,hidden:false};
globalThis.fetch=async path=>{const text=await readFile(new URL('../'+path.replace(/^\.\//,''),import.meta.url),'utf8');return {ok:true,json:async()=>JSON.parse(text),text:async()=>text};};
globalThis.confirm=()=>true;globalThis.setInterval=()=>1;
const realTimeout=globalThis.setTimeout;
globalThis.setTimeout=(fn,ms)=>1;globalThis.clearTimeout=()=>{};
await import('../app.mjs');
await new Promise(resolve=>realTimeout(resolve,80));
const click=async dataset=>{
 await events.click({target:{closest:selector=>selector==='[data-action]'?{dataset}:null}});
};
test('demo renders full interactive map and all scorecard elements',()=>{
 assert.match(appEl.innerHTML,/THE MAP IS/);
 assert.match(appEl.innerHTML,/HOST CONTROL/);
 assert.match(appEl.innerHTML,/134/);
 assert.match(appEl.innerHTML,/data-state="TX"/);
 assert.match(appEl.innerHTML,/data-race="sen-tx"/);
 assert.match(appEl.innerHTML,/LOCAL DEMO MODE/);
});
test('clicking a pick saves the current player selection',async()=>{
 await click({action:'pick',race:'sen-tx',choice:'a'});
 const data=JSON.parse([...store.values()][0]);
 assert(data.picks.some(p=>p.race_id==='sen-tx'&&p.candidate_key==='a'));
 assert.match(appEl.innerHTML,/YOUR PICK IS IN/);
});
test('host can lock picks and non-admin cannot edit afterward',async()=>{
 await click({action:'toggle-lock'});
 const data=JSON.parse([...store.values()][0]);
 assert.equal(data.settings.picks_locked,true);
 const prior=console.error;console.error=()=>{};
 await click({action:'pick',race:'sen-tx',choice:'b'});
 console.error=prior;
 const newdata=JSON.parse([...store.values()][0]);
 assert.equal(newdata.picks.find(p=>p.race_id==='sen-tx').candidate_key,'a');
});
test('host-declared results update scores and race status',async()=>{
 await events.change({target:{dataset:{change:'result',race:'sen-tx'},value:'a'}});
 const data=JSON.parse([...store.values()][0]);
 assert.deepEqual(data.results.find(r=>r.race_id==='sen-tx'),{race_id:'sen-tx',candidate_key:'a'});
 assert.match(appEl.innerHTML,/RACES CALLED/);
 assert.match(appEl.innerHTML,/1<small> \/ 54<\/small>/);
});
test('all navigation pages render without errors',async()=>{
 for(const name of ['ballot','leaderboard','bonus','admin','map']){
  await click({action:'view',view:name});
  assert(appEl.innerHTML.length>1000,name);
 }
});
