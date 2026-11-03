import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scoreGame, breakdown } from '../scoring.mjs';
const races = JSON.parse(fs.readFileSync(new URL('../races.json', import.meta.url), 'utf8'));
const profiles = [{user_id:'p1',display_name:'Alex'}, {user_id:'p2',display_name:'Blake'}];
const settings = {picks_locked:true,senate_dem_final:49,senate_rep_final:51,house_dem_final:219,house_rep_final:216};
const forecasts=[
 {user_id:'p1',senate_dem:49,senate_rep:51,house_dem:218,house_rep:217},
 {user_id:'p2',senate_dem:48,senate_rep:52,house_dem:219,house_rep:216},
];
test('races match the approved scorecard', () => {
 assert.equal(races.length,54);
 assert.equal(races.filter(r=>r.chamber==='house').length,41);
 assert.equal(races.filter(r=>r.chamber==='senate').length,13);
 assert.deepEqual(breakdown(races),{senate:32,house:92});
 assert(!races.some(r => ['house-ca-06','house-ca-11','house-ca-34','house-ca-40','house-vt-al','house-nh-02','house-id-01','house-tx-28'].includes(r.id)));
 assert(races.some(r=>r.id==='house-mo-02'));
 assert(races.some(r=>r.id==='house-ar-02'));
 assert(races.some(r=>r.id==='house-tx-09'));
});
test('points, exact senate bonus, and house tiebreaker', () => {
 const results=races.map(r=>({race_id:r.id,candidate_key:'a'}));
 const picks=races.flatMap(r=>[
   {user_id:'p1',race_id:r.id,candidate_key:'a'},
   {user_id:'p2',race_id:r.id,candidate_key:'a'},
 ]);
 const game=scoreGame(races,profiles,picks,results,forecasts,settings);
 assert.equal(game.completed,true);
 assert.equal(game.players[0].user_id,'p1');
 assert.equal(game.players[0].total,134);
 assert.equal(game.players[1].total,124);
 assert.equal(game.players[1].houseError,0);
});
test('house tiebreaker only applies to tied scores', () => {
 const race=races[0];
 const picks=[{user_id:'p1',race_id:race.id,candidate_key:'a'},{user_id:'p2',race_id:race.id,candidate_key:'a'}];
 const game=scoreGame(races,profiles,picks,[{race_id:race.id,candidate_key:'a'}],forecasts,{...settings,senate_dem_final:null,senate_rep_final:null});
 assert.equal(game.players[0].user_id,'p2');
 assert.equal(game.players[0].houseError,0);
 assert.equal(game.players[0].total,race.points);
 assert.equal(game.players[1].total,race.points);
});
test('no Senate bonus before final split and no final winner for partial results',()=>{
 const game=scoreGame(races,profiles,[],[],forecasts,{...settings,senate_dem_final:null,senate_rep_final:null});
 assert.equal(game.completed,false);
 assert.equal(game.players[0].senateBonus,0);
 assert.equal(game.players.find(p => p.user_id === 'p1').houseError,2);
});
