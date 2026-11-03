import { createBackend } from './backend.mjs';
import { scoreGame, candidateFor, breakdown } from './scoring.mjs';

let backend, races=[], mapMarkup='', game=null;
let view='map', selectedState='TX', ballotFilter='all', adminState='ALL', accountOpen=false;
let accountStatus=null, sentUpgradeEmail='';
let toastTimeout=null, busy=false;
const app=document.getElementById('app');
const raceMap=new Map();
const nameOf=Object.fromEntries(Object.entries({
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'
}).map(([name,code])=>[code,name]));
const gameStates=()=>[...new Set(races.map(r=>r.state))].sort((a,b)=>nameOf[a].localeCompare(nameOf[b]));
const clean=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const many=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
const picksFor=(uid)=>new Map((game?.picks??[]).filter(p=>p.user_id===uid).map(p=>[p.race_id,p.candidate_key]));
const forecastFor=(uid)=>game?.forecasts.find(f=>f.user_id===uid);
const currentName=()=>game?.profiles.find(p=>p.user_id===game.currentId)?.display_name ?? 'Player';
const resultMap=()=>new Map((game?.results??[]).map(r=>[r.race_id,r.candidate_key]));
const yourPicks=()=>picksFor(game.currentId);
const scoreboard=()=>scoreGame(races,game.profiles,game.picks,game.results,game.forecasts,game.settings);
const yourScore=()=>scoreboard().players.find(p=>p.user_id===game.currentId);
const hasProfile=()=>game?.profiles.some(p=>p.user_id===game.currentId);

function notify(message,isError=false) {
 const el=document.getElementById('toast');
 if(toastTimeout)clearTimeout(toastTimeout);
 el.textContent=message;el.className=`toast show${isError?' toast-error':''}`;
 toastTimeout=setTimeout(()=>{el.className='toast';},4400);
}
async function update() { game=await backend.load(); if(!game.isDemo && (!accountStatus||view==='upgrade'))accountStatus=await backend.getAuthStatus();render(); }
async function run(fn,done='Saved') {
 if(busy)return;
 busy=true;
 try {await fn(); await update();if(done)notify(done);}
 catch(err){console.error(err);notify(err.message||'Something went wrong',true);}
 finally{busy=false;}
}
async function boot(){
 try {
  const files=await Promise.all([fetch('./races.json'),fetch('./assets/us-map.svg')]);
  if(!files[0].ok || !files[1].ok)throw new Error('App files did not load. Open the site through a web server, not file://.');
  races=await files[0].json();mapMarkup=await files[1].text();
  for(const r of races)raceMap.set(r.id,r);
  backend=await createBackend();
  await backend.getSession();
  if(backend.isLoggedIn()){game=await backend.load();if(!game.isDemo)accountStatus=await backend.getAuthStatus();}
  render();
  setInterval(async()=>{
   if(!backend?.isLoggedIn()||busy||document.hidden||document.activeElement?.matches('input, textarea, select'))return;
   try {await update();} catch(err) {console.warn('Could not sync',err);}
  },15000);
  window.addEventListener('focus',async()=>{
   if(!backend?.isLoggedIn()||busy||document.activeElement?.matches('input, textarea, select'))return;
   try {await update();} catch {}
  });
 } catch(err) {console.error(err);app.innerHTML=`<div class="fatal"><h1>Unable to load the game</h1><p>${clean(err.message)}</p><p>See README.md for local and Supabase setup.</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`;}
}

function render(){
 if(!backend.isLoggedIn()){renderAuth();return;}
 if(!game){app.innerHTML='<div class="boot">LOADING THE GAME…</div>';return;}
 if(!hasProfile()&&!game.isDemo){renderOnboard();return;}
 const score=scoreboard(), mine=yourScore(), picks=yourPicks();
 const called=game.results.length;
 app.innerHTML=`<div class="shell">
   <header class="topbar">
     <div class="topbar-brand"><div class="brand-mark"><span>★</span><i></i><i></i></div><div class="brand-text"><strong>ELECTION NIGHT</strong><small>PICK 'EM / 2026</small></div></div>
     <div class="header-center"><span class="red-dot"></span><span>2026 GENERAL ELECTION</span><span class="header-divider">/</span><span>NOVEMBER 03</span></div>
     <div class="header-right"><span class="status-pill ${game.settings.picks_locked?'status-locked':'status-open'}">${game.settings.picks_locked?'● PICKS LOCKED':'● PICKS OPEN'}</span><button data-action="account" class="account-btn" title="Account settings"><span class="avatar">${clean(currentName().slice(0,1).toUpperCase())}</span><span class="account-name">${clean(currentName())}</span><span class="down-caret">⌄</span></button></div>
   </header>
   ${game.isDemo?'<div class="demo-banner"><strong>LOCAL DEMO MODE</strong><span>Changes are saved only in this browser. Connect Supabase to play with friends across devices.</span><a href="./README.md" target="_blank" rel="noopener">Setup guide ↗</a></div>':''}
   ${accountOpen?renderAccount():''}
   <main class="main-content">
     <section class="masthead"><div><p class="eyebrow"><span class="ticker-line"></span> THE 2026 ELECTION NIGHT CHALLENGE <span class="eyebrow-edition">/ EDITION 01</span></p><h1>THE MAP IS <em>YOUR CALL.</em></h1><p class="masthead-desc">${races.filter(r=>r.chamber==='senate').length} Senate battles. ${races.filter(r=>r.chamber==='house').length} House races. One winner. Call each race, then watch the points roll in.</p></div><div class="masthead-right"><div class="diagonal-stripes"></div><div class="masthead-year">26</div></div></section>
     <section class="stat-strip">
       <div class="stat-block"><div class="stat-caption">YOUR POINTS <span class="tiny-arrow">↗</span></div><div class="stat-value">${mine?.total??0}<small> / 134</small></div><div class="stat-meta">${mine?.correct??0} correct predictions so far</div></div>
       <div class="stat-block"><div class="stat-caption">YOUR BALLOT <span class="tiny-arrow">↗</span></div><div class="stat-value">${picks.size}<small> / 54</small></div><div class="meter"><span style="width:${Math.round(picks.size/54*100)}%"></span></div></div>
       <div class="stat-block"><div class="stat-caption">RACES CALLED <span class="tiny-arrow">↗</span></div><div class="stat-value">${called}<small> / 54</small></div><div class="meter meter-blue"><span style="width:${Math.round(called/54*100)}%"></span></div></div>
       <div class="stat-block stat-last"><div class="stat-caption">THE FIELD <span class="tiny-arrow">↗</span></div><div class="stat-value">${game.profiles.length}<small> PLAYER${game.profiles.length===1?'':'S'}</small></div><div class="stat-meta">${game.settings.picks_locked?'Predictions locked in':'Predictions still open'}</div></div>
     </section>
     <nav class="tabs" aria-label="Game sections">
       ${navTab('map','◈','THE MAP')}${navTab('ballot','▤','MY BALLOT')}${navTab('leaderboard','▥','LEADERBOARD')}${navTab('bonus','✦','SEAT PREDICTIONS')}${game.isAdmin?navTab('admin','⚙','HOST CONTROL'):''}
     </nav>
     ${view==='map'?renderMapView():view==='ballot'?renderBallot():view==='leaderboard'?renderLeaderboard():view==='bonus'?renderBonus():view==='admin'&&game.isAdmin?renderAdmin():view==='upgrade'?renderUpgrade():renderMapView()}
     <footer><div><span class="footer-star">★</span> ELECTION NIGHT 2026</div><span>41 HOUSE RACES · 13 SENATE RACES · 10 BONUS POINTS</span><span>MADE FOR FRIENDLY COMPETITION</span></footer>
   </main>
 </div>`;
 decorateMap();
}
function navTab(id,icon,label){return `<button class="tab ${view===id?'active':''}" data-action="view" data-view="${id}" ${view===id?'aria-current="page"':''}><span>${icon}</span>${label}${id==='admin'?'<i class="host-dot"></i>':''}</button>`;}
function renderAccount(){
 return `<div class="account-menu"><div class="account-menu-head"><strong>${clean(currentName())}</strong><span>${game.isDemo?'Testing locally':'Player account'}</span></div>
 ${game.isDemo?`<div class="account-menu-label">SWITCH TEST PLAYER</div>${game.profiles.map(p=>`<button class="menu-item ${p.user_id===game.currentId?'active':''}" data-action="switch-player" data-id="${p.user_id}">${clean(p.display_name)} ${p.user_id===game.currentId?'✓':''}</button>`).join('')}`:''}
 <button class="menu-item" data-action="rename">✎ &nbsp; Change display name</button>
 ${!game.isDemo?'<button class="menu-item" data-action="copy-id">⎘ &nbsp; Copy my player ID (host setup)</button>':''}
 ${!game.isDemo?`<button class="menu-item" data-action="upgrade">${accountStatus?.isAnonymous?'✉ &nbsp; Make account permanent':'🔒 &nbsp; Email & password settings'}</button>`:''}
 ${!game.isDemo?'<button class="menu-item" data-action="logout">↪ &nbsp; Sign out</button>':''}
 <button class="menu-item" data-action="account">Close menu</button></div>`;
}
function renderAuth(){
 app.innerHTML=`<div class="auth-page"><div class="auth-art"><div class="auth-star">★</div><p>2026 ELECTION NIGHT</p><h1>MAKE YOUR<br><em>CALL.</em></h1><div class="auth-stripe"></div><span>54 races. 134 possible points.<br>Unlimited bragging rights.</span></div><div class="auth-content"><div class="auth-card"><p class="eyebrow">JOIN THE GAME</p><h2>You're on the board.</h2><p>Join instantly with a nickname, or sign in with email. Each friend gets their own saved picks and a spot on the shared leaderboard.</p><button class="btn btn-primary btn-wide guest-btn" data-action="join-guest">JOIN INSTANTLY AS A GUEST <span>→</span></button><div class="auth-or">OR USE EMAIL SIGN-IN</div><form id="password-login-form"><label for="password-login-email">EMAIL ADDRESS</label><input id="password-login-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required><label for="password-login-password">PASSWORD</label><input id="password-login-password" name="password" type="password" autocomplete="current-password" required><button type="submit" class="btn btn-primary btn-wide">SIGN IN WITH PASSWORD <span>→</span></button></form><div class="auth-or">OR EMAIL ME A SIGN-IN LINK</div><form id="login-form"><label for="login-email">EMAIL ADDRESS</label><input id="login-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required><button type="submit" class="btn btn-secondary btn-wide">EMAIL MY SIGN-IN LINK <span>→</span></button></form><div class="auth-foot">Guest sessions stay on this device. Password login works across devices. Email links and account verification may require Supabase SMTP setup.</div></div></div></div>`;
}
function renderUpgrade(){
 const isGuest=accountStatus?.isAnonymous!==false;
 const status=isGuest?'GUEST ACCOUNT':'PERMANENT ACCOUNT';
 return `<section class="content-view" style="max-width:700px;margin:0 auto">
  <div class="view-title-row"><div><p class="section-overline">ACCOUNT SECURITY</p><h2>KEEP YOUR <em>HOST ACCESS.</em></h2><p>Your player ID and admin permissions stay the same when you link your email to this guest account.</p></div></div>
  <div class="host-final" style="max-width:680px;margin-top:26px">
   <p class="section-overline">${status}</p>
   <h3>${isGuest?'LINK AN EMAIL':'CREATE A PASSWORD'}</h3>
   ${isGuest?`<p>Use an email address you can access. Supabase will send a verification link. Open it in <strong>this same browser</strong>, then return here and refresh. Do not sign out until your permanent login is confirmed.</p>
    <form id="upgrade-email-form" style="margin-top:22px"><label for="upgrade-email">EMAIL ADDRESS</label><input id="upgrade-email" class="account-upgrade-input" style="display:block;width:100%;background:#172641;border:1px solid #50607d;color:#fff;padding:14px;margin:9px 0 18px;border-radius:4px" type="email" autocomplete="email" placeholder="you@example.com" required><button class="btn btn-primary" type="submit">SEND VERIFICATION EMAIL →</button></form>
    ${sentUpgradeEmail?`<p class="account-upgrade-note">Verification requested for <strong>${clean(sentUpgradeEmail)}</strong>. Check your inbox and spam folder. Then click <strong>Refresh account status</strong> below.</p>`:''}
   `:`<p>Email linked: <strong>${clean(accountStatus?.email??'')}</strong>. Your player ID and game-host privileges are preserved. Choose a password you will use when signing in from other devices.</p>
     <form id="upgrade-password-form" style="margin-top:22px"><label for="upgrade-password">NEW PASSWORD (12+ CHARACTERS)</label><input id="upgrade-password" class="account-upgrade-input" style="display:block;width:100%;background:#172641;border:1px solid #50607d;color:#fff;padding:14px;margin:9px 0 18px;border-radius:4px" type="password" autocomplete="new-password" minlength="12" required><label for="upgrade-password-confirm">CONFIRM PASSWORD</label><input id="upgrade-password-confirm" class="account-upgrade-input" style="display:block;width:100%;background:#172641;border:1px solid #50607d;color:#fff;padding:14px;margin:9px 0 18px;border-radius:4px" type="password" autocomplete="new-password" minlength="12" required><button class="btn btn-primary" type="submit">SAVE PASSWORD →</button></form>
     <p class="account-upgrade-note">After saving, verify your account from another browser using email and password before signing out here.</p>
   `}
   <div style="margin-top:18px;display:flex;flex-wrap:wrap;gap:10px"><button class="btn btn-secondary" data-action="refresh-account">REFRESH ACCOUNT STATUS</button><button class="btn btn-secondary" data-action="cancel-upgrade">BACK TO GAME</button></div>
  </div>
 </section>`;
}
function renderOnboard(){
 app.innerHTML=`<div class="auth-page"><div class="auth-art"><div class="auth-star">★</div><p>YOU'RE IN</p><h1>WHAT'S<br><em>YOUR NAME?</em></h1></div><div class="auth-content"><div class="auth-card"><p class="eyebrow">CREATE YOUR PLAYER CARD</p><h2>Pick a scoreboard name.</h2><p>Friends will see this name on the leaderboard.</p><form id="name-form"><label for="onboard-name">DISPLAY NAME</label><input id="onboard-name" name="name" maxlength="32" minlength="2" placeholder="Your name" required><button class="btn btn-primary btn-wide" type="submit">JOIN THE BOARD →</button></form></div></div></div>`;
}
function stateSelect(active,onChange='select-state') {
 return `<select class="state-select" data-change="${onChange}" aria-label="Select state"><option value="ALL" ${active==='ALL'?'selected':''}>ALL STATES</option>${gameStates().map(s=>`<option value="${s}" ${active===s?'selected':''}>${clean(nameOf[s])} (${s})</option>`).join('')}</select>`;
}
function renderMapView() {
 const stateRaces=races.filter(r=>r.state===selectedState);
 const picked=yourPicks();
 const statePicked=stateRaces.filter(r=>picked.has(r.id)).length;
 return `<section class="workspace">
   <div class="map-column">
    <div class="panel-header"><div><div class="section-overline">01 / THE BATTLEGROUND</div><h2>THE UNITED STATES <span class="soft-count">/ 30 GAME STATES</span></h2></div><div class="map-header-controls"><span class="map-hint">SELECT A STATE TO PICK</span></div></div>
    <div class="map-frame"><div class="map-gradient"></div><div class="map-corner north">NATIONAL ELECTION BOARD<br><b>USA / NOV 03, 2026</b></div><div class="map-corner east">30 STATES WITH GAME RACES<br>CLICK OR TAP TO EXPLORE</div><div id="usa-map" class="map-svg">${mapMarkup}</div><div class="map-legend"><div><span class="legend-dot active"></span> WITH RACES</div><div><span class="legend-dot selected"></span> SELECTED</div><div><span class="legend-dot complete"></span> PICKS COMPLETE</div></div></div>
    <div class="map-underbar"><div class="map-under-left"><span class="star-mini">✦</span> PICK YOUR WINNERS BEFORE THE HOST LOCKS THE BOARD</div><div class="map-under-right">${gameStates().length} STATES · ${races.length} RACES</div></div>
    <div class="below-map-grid"><div class="info-box"><div class="info-icon">★</div><div><strong>THE BIG CALL</strong><p>Get the exact final Senate split right to earn <b>10 bonus points.</b></p><button class="link-arrow" data-action="view" data-view="bonus">MAKE YOUR SEAT PREDICTIONS ↗</button></div></div><div class="info-box blue-box"><div class="info-icon">↗</div><div><strong>THE TIEBREAKER</strong><p>If points tie, whoever is closest to the final House seat count wins.</p><button class="link-arrow" data-action="view" data-view="bonus">VIEW THE RULES ↗</button></div></div></div>
   </div>
   <aside class="detail-column"><div class="detail-head"><div><span class="section-overline">02 / STATE DESK</span><h2>${clean(nameOf[selectedState]??selectedState)}</h2></div><div class="state-flag">${selectedState}</div></div><div class="state-summary"><span>${many(stateRaces.length,'RACE')} ON THE BOARD</span><span>${statePicked} / ${stateRaces.length} PICKED</span></div><div class="detail-races">${stateRaces.length?stateRaces.map(renderRaceCard).join(''):'<div class="empty-state">No races from your selected game list in this state. Click a highlighted state or choose one below.</div>'}</div><div class="detail-footer"><label>JUMP TO ANOTHER STATE</label>${stateSelect(selectedState)}<p>${game.settings.picks_locked?'The host has locked all predictions.':'Picks save immediately when you select a candidate.'}</p></div></aside>
  </section>`;
}
function renderRaceCard(race){
 const myPick=yourPicks().get(race.id), winner=resultMap().get(race.id), canPick=!game.settings.picks_locked;
 const success=winner&&myPick===winner;
 return `<article class="race-card"><div class="race-top"><span class="race-chamber ${race.chamber}">${race.chamber==='senate'?'US SENATE':'US HOUSE'}</span><span class="race-points">${race.points} PT${race.points===1?'':'S'}</span></div><div class="race-title">${clean(race.chamber==='senate'?race.stateName:race.label)}</div><div class="race-meta">${clean(race.subtitle)}</div><div class="pick-options">${race.candidates.map(c=>`<button class="pick-option ${myPick===c.key?'picked':''} ${winner===c.key?'winner-option':''}" data-action="pick" data-race="${race.id}" data-choice="${c.key}" ${!canPick?'disabled':''} aria-pressed="${myPick===c.key}"><span class="pick-radio">${myPick===c.key?'✓':''}</span><span class="candidate-name">${clean(c.name)}</span>${c.party?`<span class="party-badge party-${c.party.toLowerCase()}">${c.party}</span>`:''}</button>`).join('')}</div><div class="race-bottom">${winner?`<span class="result-label">RESULT: ${clean(candidateFor(race,winner)?.name??'')}</span><span class="${success?'picked-correct':'picked-wrong'}">${success?'✓ +'+race.points+' PTS':myPick?'✕ MISSED':'NO PICK'}</span>`:myPick?`<span class="selected-label">✓ YOUR PICK IS IN</span>${canPick?`<button class="clear-btn" data-action="clear-pick" data-race="${race.id}">CLEAR</button>`:'<span class="muted">AWAITING RESULT</span>'}`:`<span class="muted">AWAITING YOUR PICK</span><span class="muted">${canPick?'OPEN':'LOCKED'}</span>`}</div></article>`;
}
function decorateMap(){
 const root=document.querySelector('#usa-map');if(!root)return;
 const picked=yourPicks();const results=resultMap();
 root.querySelectorAll('.map-state').forEach(node=>{
  const code=node.dataset.state;
  const local=races.filter(r=>r.state===code), playable=local.length>0;
  node.classList.toggle('playable',playable);
  node.classList.toggle('selected',code===selectedState);
  node.classList.toggle('all-picked',playable&&local.every(r=>picked.has(r.id)));
  node.classList.toggle('all-called',playable&&local.every(r=>results.has(r.id)));
  node.setAttribute('aria-label',`${nameOf[code]??code}: ${many(local.length,'game race')}`);
 });
 root.querySelectorAll('.map-label').forEach(node=>{
  node.classList.toggle('selected',node.dataset.state===selectedState);
 });
}
function renderBallot(){
 const picks=yourPicks(), winners=resultMap(), mine=yourScore();
 const filtered=races.filter(r=>ballotFilter==='all'||(ballotFilter==='missing'&&!picks.has(r.id))||(ballotFilter==='called'&&winners.has(r.id)));
 return `<section class="content-view"><div class="view-title-row"><div><p class="section-overline">YOUR ELECTION NIGHT WORKSHEET</p><h2>YOUR <em>BALLOT.</em></h2><p>All 54 races from the final scorecard. Tap a race to open that state and make your pick.</p></div><div class="view-counter"><strong>${picks.size}/54</strong><span>PICKS ENTERED</span></div></div><div class="subtabs">${[['all','ALL RACES'],['missing','STILL TO PICK'],['called','RESULTS IN']].map(([id,label])=>`<button data-action="ballot-filter" data-filter="${id}" class="subtab ${ballotFilter===id?'active':''}">${label}</button>`).join('')}</div><div class="ballot-layout"><div class="ballot-main">${['senate','house'].map(chamber=>{const rr=filtered.filter(r=>r.chamber===chamber);return rr.length?`<div class="ballot-group"><div class="ballot-group-title"><strong>${chamber==='senate'?'SENATE RACES':'HOUSE RACES'}</strong><span>${rr.length} SHOWN</span></div>${rr.map(r=>{const choice=picks.get(r.id),win=winners.get(r.id),candidate=candidateFor(r,choice);return `<button class="ballot-row" data-action="go-race" data-state="${r.state}" data-race="${r.id}"><span class="ballot-state">${r.state}</span><span class="ballot-names"><b>${clean(r.chamber==='senate'?r.stateName:r.label)}</b><small>${r.candidates.map(c=>clean(c.name)).join(' vs. ')}</small></span><span class="ballot-choice ${choice?'has-pick':''}">${candidate?clean(candidate.name):'NO PICK YET'}</span><span class="ballot-result ${win?(win===choice?'good':'bad'):''}">${win?(win===choice?`+${r.points} PTS`:'0 PTS'):`${r.points} PT${r.points===1?'':'S'}`}</span><span class="ballot-chevron">›</span></button>`;}).join('')}</div>`:'';}).join('')}${!filtered.length?'<div class="empty-state">Nothing to show in this filter.</div>':''}</div><aside class="ballot-side"><p class="section-overline">YOUR SCORECARD</p><strong class="ballot-big-score">${mine?.total??0}<small> / 134</small></strong><div class="score-mini"><span>SENATE RACES</span><b>${mine?.senatePoints??0} / 32</b></div><div class="score-mini"><span>HOUSE RACES</span><b>${mine?.housePoints??0} / 92</b></div><div class="score-mini"><span>EXACT SENATE BONUS</span><b>+${mine?.senateBonus??0} / 10</b></div><div class="ballot-side-footer"><span>DON'T FORGET</span><p>Predict the full Senate and House seat counts before the lock.</p><button class="btn btn-secondary btn-wide" data-action="view" data-view="bonus">SET SEAT TOTALS →</button></div></aside></div></section>`;
}
function renderLeaderboard(){
 const scores=scoreboard(), privacy=!game.settings.picks_locked&&!game.isAdmin;
 const top=scores.players[0];
 return `<section class="content-view"><div class="view-title-row"><div><p class="section-overline">THE COMPETITION</p><h2>LEADER<em>BOARD.</em></h2><p>${scores.completed?'Every result is entered. The final standings are in.':'Scores update automatically as the host reports each race winner.'}</p></div><span class="live-score-label"><span class="red-dot"></span> ${scores.completed?'FINAL':'PROVISIONAL'}</span></div>
 ${privacy?'<div class="privacy-note">Other players’ picks remain hidden until the host locks the game. Everyone’s scores will appear here as results are entered.</div>':''}
 <div class="leader-grid"><div class="leader-list"><div class="leader-table-head"><span>RANK / PLAYER</span><span>PICKS</span><span>POINTS</span></div>${scores.players.map(p=>`<div class="leader-row ${p.user_id===game.currentId?'is-me':''} ${p.rank===1?'is-first':''}"><div class="leader-ident"><span class="leader-rank">${String(p.rank).padStart(2,'0')}</span><div class="leader-avatar">${clean(p.display_name.slice(0,1).toUpperCase())}</div><div class="leader-names"><b>${clean(p.display_name)}${p.user_id===game.currentId?' <span class="you-tag">YOU</span>':''}</b><small>${p.picksCount} / 54 picks · ${p.correct} right</small></div></div><span class="leader-picks">${p.picksCount}/54</span><span class="leader-points">${p.total}<small> PTS</small></span><div class="leader-breakdown"><span class="score-progress"><i style="width:${Math.min(100,p.total/134*100)}%"></i></span><span>SEN ${p.senatePoints}</span><span>HOUSE ${p.housePoints}</span><span>BONUS ${p.senateBonus}</span>${scores.houseReady?`<span>T/B ERROR ${p.houseError??'—'}</span>`:''}</div></div>`).join('')}${!scores.players.length?'<div class="empty-state">Be the first player to join.</div>':''}</div><aside class="leader-side"><div class="winner-card"><p class="section-overline">${scores.completed?'THE WINNER':'CURRENT LEADER'}</p><div class="trophy-glyph">★</div><h3>${top?clean(top.display_name):'THE FIELD IS OPEN'}</h3><div class="winner-count">${top?.total??0} <span>POINTS</span></div><p>${scores.completed?(scores.players.filter(p=>p.rank===1).length>1?'The tiebreaker is still tied. Co-winners!':'Official game champion.'): 'The leaderboard is provisional until all results and final seat totals are entered.'}</p></div><div class="rules-mini"><div class="section-overline">SCORING RULES</div><div><span>★ ★ ★</span><b>3</b> KEY TOSS-UPS</div><div><span>★ ★</span><b>2</b> LEAN RACES</div><div><span>★</span><b>1</b> OTHER RACES</div><div><span>EXACT SENATE SPLIT</span><b>+10</b></div><p>House seat accuracy decides a tie on points. Lower combined D/R seat-count error wins.</p></div></aside></div></section>`;
}
function renderBonus(){
 const f=forecastFor(game.currentId), s=game.settings,locked=s.picks_locked;
 const hasS=Number.isInteger(s.senate_dem_final),hasH=Number.isInteger(s.house_dem_final);
 return `<section class="content-view"><div class="view-title-row"><div><p class="section-overline">THE EXTRA CHALLENGE</p><h2>CALL THE <em>CHAMBERS.</em></h2><p>These are predictions for total seats in the next Congress—not just the seats in our game.</p></div><div class="bonus-badge">★ +10 POINT BONUS</div></div><div class="bonus-grid"><div class="bonus-main">
 <div class="forecast-card"><div class="forecast-heading"><span>01 / SENATE BONUS</span><strong>NAIL THE SPLIT. WIN 10.</strong><p>Predict the final balance of all 100 Senate seats. Count independents aligned with Democrats in the Democratic caucus.</p></div>
 <form id="forecast-form"><div class="forecast-form-grid"><div class="number-entry"><label for="senate-dem">DEMOCRATIC CAUCUS</label><div class="count-input"><input id="senate-dem" name="senate-dem" type="number" min="0" max="100" value="${f?.senate_dem??''}" placeholder="—" ${locked?'disabled':''} required><span>SEATS</span></div></div><div class="number-entry"><label>REPUBLICANS / AUTO-CALCULATED</label><div class="count-input calculated"><div id="senate-rep">${f?f.senate_rep:'—'}</div><span>SEATS</span></div></div></div>
 <div class="forecast-line"></div><div class="forecast-heading"><span>02 / HOUSE TIEBREAKER</span><strong>HOW MANY HOUSE SEATS?</strong><p>Predict the final House balance of all 435 seats. Closest combined error wins a tie—this is not worth bonus points.</p></div>
 <div class="forecast-form-grid"><div class="number-entry"><label for="house-dem">DEMOCRATS</label><div class="count-input"><input id="house-dem" name="house-dem" type="number" min="0" max="435" value="${f?.house_dem??''}" placeholder="—" ${locked?'disabled':''} required><span>SEATS</span></div></div><div class="number-entry"><label>REPUBLICANS / AUTO-CALCULATED</label><div class="count-input calculated"><div id="house-rep">${f?f.house_rep:'—'}</div><span>SEATS</span></div></div></div>
 <button type="submit" class="btn btn-primary btn-wide" ${locked?'disabled':''}>${locked?'PREDICTIONS LOCKED':f?'UPDATE SEAT PREDICTIONS':'SAVE MY SEAT PREDICTIONS'} <span>→</span></button><p class="form-footnote">${f?'✓ Seat predictions saved. ':''}${locked?'No changes allowed after lock.':'Both predictions save together. Republicans = total minus Democrats.'}</p></form></div>
 </div><aside class="bonus-side"><div class="bonus-actual"><div class="section-overline">THE ACTUAL COUNT</div><h3>SENATE</h3><div class="actual-total"><span>DEMOCRATIC CAUCUS</span><strong>${hasS?s.senate_dem_final:'—'}</strong></div><div class="actual-total"><span>REPUBLICANS</span><strong>${hasS?s.senate_rep_final:'—'}</strong></div><div class="actual-points">${hasS?f&&f.senate_dem===s.senate_dem_final?'+10 BONUS EARNED':'FINAL SENATE SPLIT REPORTED':'AWAITING OFFICIAL FINAL TOTALS'}</div></div><div class="bonus-actual"><div class="section-overline">THE TIEBREAKER</div><h3>HOUSE</h3><div class="actual-total"><span>DEMOCRATS</span><strong>${hasH?s.house_dem_final:'—'}</strong></div><div class="actual-total"><span>REPUBLICANS</span><strong>${hasH?s.house_rep_final:'—'}</strong></div><div class="actual-points">${hasH&&f?`YOUR COMBINED ERROR: ${Math.abs(f.house_dem-s.house_dem_final)+Math.abs(f.house_rep-s.house_rep_final)} SEATS`:'AWAITING FINAL TOTALS'}</div></div></aside></div></section>`;
}
function renderAdmin(){
 const s=game.settings,called=resultMap();
 const rr=races.filter(r=>adminState==='ALL'||r.state===adminState);
 const senateFinal=s.senate_dem_final,houseFinal=s.house_dem_final;
 return `<section class="content-view"><div class="view-title-row"><div><p class="section-overline">COMMISSIONER ACCESS / HOST ONLY</p><h2>CONTROL <em>ROOM.</em></h2><p>Lock submissions, call races, and enter the final seat counts. Results update every player’s scoreboard.</p></div><span class="host-access">★ HOST ACCESS</span></div><div class="host-actions"><div class="host-lock"><div><p class="section-overline">PREDICTION WINDOW</p><h3>${s.picks_locked?'PICKS ARE LOCKED':'PICKS ARE OPEN'}</h3><p>${s.picks_locked?'Everyone’s predictions are frozen. You can declare winners below.':'Everyone can still enter and revise predictions. Lock before you post the first result.'}</p></div><button class="btn ${s.picks_locked?'btn-secondary':'btn-primary'}" data-action="toggle-lock">${s.picks_locked?'UNLOCK PICKS':'LOCK ALL PICKS'} <span>→</span></button></div><div class="host-stat"><span>RESULTS REPORTED</span><strong>${called.size}<small> / 54</small></strong><div class="meter meter-blue"><span style="width:${called.size/54*100}%"></span></div></div></div>
 <div class="host-grid"><section class="host-results"><div class="host-section-head"><div><span class="section-overline">RACE RESULTS / ${rr.length} SHOWN</span><h3>DECLARE THE WINNERS</h3></div>${stateSelect(adminState,'admin-state')}</div>${!s.picks_locked?'<div class="privacy-note">You must lock predictions before recording results.</div>':''}<div class="host-result-list">${rr.map(r=>{const winner=called.get(r.id);return `<div class="host-result-row"><div><span class="host-result-tag">${r.chamber.toUpperCase()} · ${r.points} PTS</span><strong>${clean(r.label)}</strong><small>${r.candidates.map(c=>clean(c.name)).join(' / ')}</small></div><div class="host-result-action"><select data-change="result" data-race="${r.id}" ${!s.picks_locked?'disabled':''} aria-label="Declared winner for ${clean(r.label)}"><option value="">NOT CALLED</option>${r.candidates.map(c=>`<option value="${c.key}" ${winner===c.key?'selected':''}>${clean(c.name)}</option>`).join('')}</select>${winner?'<span class="result-reported">✓ CALLED</span>':'<span class="result-pending">PENDING</span>'}</div></div>`;}).join('')}</div></section>
 <aside class="host-final"><div class="section-overline">FINAL TOTALS / OFFICIAL COUNTS</div><h3>CLOSE OUT THE GAME</h3><p>Once the full Congress seat totals are known, enter them below to award the Senate bonus and calculate the House tiebreaker.</p><form id="final-totals-form"><label for="final-senate-dem">FINAL SENATE · DEMOCRATIC CAUCUS</label><div class="count-input"><input id="final-senate-dem" type="number" min="0" max="100" placeholder="—" value="${senateFinal??''}"><span>OF 100</span></div><small>Republicans: <b id="final-senate-rep">${senateFinal!==null?100-senateFinal:'—'}</b></small><label for="final-house-dem">FINAL HOUSE · DEMOCRATS</label><div class="count-input"><input id="final-house-dem" type="number" min="0" max="435" placeholder="—" value="${houseFinal??''}"><span>OF 435</span></div><small>Republicans: <b id="final-house-rep">${houseFinal!==null?435-houseFinal:'—'}</b></small><button class="btn btn-primary btn-wide" type="submit">SAVE FINAL SEAT TOTALS →</button><p class="form-footnote">Leave a field blank until its final total is known. Enter House totals only when all 435 seats can be accounted for.</p></form><div class="host-help"><strong>KEEP IT FAIR</strong><p>Only the admin can enter results. The database also blocks users from changing picks after lock. To unlock after results are entered, clear every result and final seat total first.</p></div></aside></div></section>`;
}

// All event handlers are attached once; rerendering the UI does not duplicate listeners.
document.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-action]');
 if(btn){
  const action=btn.dataset.action;
  if(action==='view'){view=btn.dataset.view;accountOpen=false;render();window.scrollTo({top:280,behavior:'smooth'});return;}
  if(action==='account'){accountOpen=!accountOpen;render();return;}
  if(action==='ballot-filter'){ballotFilter=btn.dataset.filter;render();return;}
  if(action==='go-race'){selectedState=btn.dataset.state;view='map';render();window.scrollTo({top:340,behavior:'smooth'});return;}
  if(action==='pick'){await run(()=>backend.savePick(btn.dataset.race,btn.dataset.choice),'Prediction saved');return;}
  if(action==='clear-pick'){await run(()=>backend.clearPick(btn.dataset.race),'Prediction cleared');return;}
  if(action==='join-guest'){await run(()=>backend.signInGuest(),'Guest account created');return;}
  if(action==='copy-id'){try {await navigator.clipboard.writeText(game.currentId);notify('Player ID copied');} catch {prompt('Copy your player ID:',game.currentId);}return;}
  if(action==='upgrade'){accountOpen=false;view='upgrade';accountStatus=await backend.getAuthStatus();render();return;}
  if(action==='cancel-upgrade'){view='map';render();return;}
  if(action==='refresh-account'){await run(async()=>{await backend.getSession();accountStatus=await backend.getAuthStatus();},'Account status updated');return;}
  if(action==='switch-player'){await run(()=>backend.switchPlayer(btn.dataset.id),'Switched test player');accountOpen=false;return;}
  if(action==='rename'){
   accountOpen=false;const name=prompt('Your display name (2–32 characters):',currentName());
   if(name===null)return;const trimmed=name.trim();if(trimmed.length<2||trimmed.length>32){notify('Name must be 2–32 characters.',true);return;}
   await run(()=>backend.saveProfile(trimmed),'Name updated');return;
  }
  if(action==='logout'){if(!confirm(accountStatus?.isAnonymous?'Sign out? This guest account cannot be recovered unless you link an email first.':'Sign out of this device?'))return;try{await backend.logout();game=null;accountStatus=null;accountOpen=false;render();notify('Signed out');}catch(err){notify(err.message,true);}return;}
  if(action==='toggle-lock'){
   const message=game.settings.picks_locked?'Reopen predictions? This is allowed only when all race results and final seat totals are cleared.':'Lock all predictions? No player will be able to change picks or seat predictions.';
   if(!confirm(message))return;
   await run(()=>backend.saveSettings({picks_locked:!game.settings.picks_locked}),game.settings.picks_locked?'Predictions reopened':'All picks locked');return;
  }
 }
 const statePath=e.target.closest('#usa-map [data-state]');
 if(statePath){selectedState=statePath.dataset.state;view='map';render();return;}
});
document.addEventListener('keydown',e=>{
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('#usa-map .map-state')){
  e.preventDefault();selectedState=e.target.dataset.state;view='map';render();
 }
});
document.addEventListener('change',async e=>{
 const change=e.target.dataset.change;
 if(change==='select-state'){selectedState=e.target.value;render();return;}
 if(change==='admin-state'){adminState=e.target.value;render();return;}
 if(change==='result'){
  const race=e.target.dataset.race,choice=e.target.value;
  await run(()=>backend.saveResult(race,choice),choice?'Race result reported':'Race result cleared');return;
 }
});
document.addEventListener('input',e=>{
 const value=e.target.value===''?null:Number(e.target.value);
 const complements={'senate-dem':['senate-rep',100], 'house-dem':['house-rep',435], 'final-senate-dem':['final-senate-rep',100], 'final-house-dem':['final-house-rep',435]};
 const target=complements[e.target.id];
 if(target){const el=document.getElementById(target[0]);if(el)el.textContent=value===null||!Number.isInteger(value)||value<0||value>target[1]?'—':target[1]-value;}
});
document.addEventListener('submit',async e=>{
 if(!['login-form','password-login-form','upgrade-email-form','upgrade-password-form','name-form','forecast-form','final-totals-form'].includes(e.target.id))return;
 e.preventDefault();const form=e.target;
 if(form.id==='login-form'){
  const email=form.querySelector('#login-email').value.trim();
  try{await backend.sendMagic(email);notify('Sign-in email sent. Check your inbox.');}catch(err){notify(err.message,true);}return;
 }
 if(form.id==='password-login-form'){
  const email=form.querySelector('#password-login-email').value.trim(),password=form.querySelector('#password-login-password').value;
  await run(async()=>{await backend.signInPassword(email,password);accountStatus=await backend.getAuthStatus();},'Signed in');return;
 }
 if(form.id==='upgrade-email-form'){
  const email=form.querySelector('#upgrade-email').value.trim();
  await run(async()=>{await backend.startUpgrade(email);sentUpgradeEmail=email;},'Verification email requested. Check your inbox.');return;
 }
 if(form.id==='upgrade-password-form'){
  const password=form.querySelector('#upgrade-password').value,confirmation=form.querySelector('#upgrade-password-confirm').value;
  if(password!==confirmation)return notify('Passwords do not match.',true);
  await run(async()=>{await backend.setPassword(password);accountStatus=await backend.getAuthStatus();},'Password saved. Your permanent account is ready.');return;
 }
 if(form.id==='name-form'){
  const name=form.querySelector('#onboard-name').value.trim();if(name.length<2||name.length>32)return notify('Use 2–32 characters',true);
  await run(()=>backend.saveProfile(name),'Welcome to the game!');return;
 }
 if(form.id==='forecast-form'){
  const s=form.querySelector('#senate-dem').value,h=form.querySelector('#house-dem').value;
  if(s===''||h==='')return notify('Enter both seat-count predictions.',true);
  const sd=Number(s),hd=Number(h);
  if(!Number.isInteger(sd)||sd<0||sd>100||!Number.isInteger(hd)||hd<0||hd>435)return notify('Seat totals must be valid whole numbers.',true);
  await run(()=>backend.saveForecast({senate_dem:sd,senate_rep:100-sd,house_dem:hd,house_rep:435-hd}),'Seat predictions saved');return;
 }
 if(form.id==='final-totals-form'){
  const s=form.querySelector('#final-senate-dem').value,h=form.querySelector('#final-house-dem').value;
  const sd=s===''?null:Number(s),hd=h===''?null:Number(h);
  if((sd!==null&&(!Number.isInteger(sd)||sd<0||sd>100))||(hd!==null&&(!Number.isInteger(hd)||hd<0||hd>435)))return notify('Final seat totals must be valid whole numbers.',true);
  await run(()=>backend.saveSettings({senate_dem_final:sd,senate_rep_final:sd===null?null:100-sd,house_dem_final:hd,house_rep_final:hd===null?null:435-hd}),'Final seat totals saved');return;
 }
});
boot();
