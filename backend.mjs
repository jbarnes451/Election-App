const DEMO_KEY='election-night-2026-demo-v1';
const DEFAULT_SETTINGS={id:1,picks_locked:false,senate_dem_final:null,senate_rep_final:null,house_dem_final:null,house_rep_final:null};

function initDemo() {
  const stored=localStorage.getItem(DEMO_KEY);
  if (stored) { try { return JSON.parse(stored); } catch { /* reset corrupt demo */ } }
  const data={profiles:[{user_id:'demo-host',display_name:'You (host)'},{user_id:'demo-friend',display_name:'Your friend'}],
    currentId:'demo-host',picks:[],forecasts:[],results:[],settings:{...DEFAULT_SETTINGS}};
  localStorage.setItem(DEMO_KEY,JSON.stringify(data));
  return data;
}
export async function createBackend() {
  const config=window.ELECTION_APP_CONFIG || {};
  if (!config.supabaseUrl || !config.supabasePublishableKey) return createDemoBackend();
  const { createClient }=await import('https://esm.sh/@supabase/supabase-js@2');
  const client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
  return createSupabaseBackend(client);
}
function createDemoBackend() {
  let data=initDemo();
  const commit=()=>localStorage.setItem(DEMO_KEY,JSON.stringify(data));
  const refresh=()=>{data=initDemo(); return {
    profiles:[...data.profiles], picks:[...data.picks], forecasts:[...data.forecasts], results:[...data.results],
    settings:{...data.settings}, currentId:data.currentId, isAdmin:data.currentId==='demo-host', isDemo:true,
  };};
  const assertOpen=()=>{if(data.settings.picks_locked) throw new Error('Predictions are locked by the host.');};
  const assertAdmin=()=>{if(data.currentId!=='demo-host') throw new Error('Only the host can enter results.');};
  return {
    isDemo:true, isLoggedIn:()=>true, load:async()=>refresh(),
    async savePick(race_id,candidate_key) {assertOpen();data.picks=data.picks.filter(p=>!(p.user_id===data.currentId&&p.race_id===race_id));data.picks.push({user_id:data.currentId,race_id,candidate_key});commit();},
    async clearPick(race_id){assertOpen();data.picks=data.picks.filter(p=>!(p.user_id===data.currentId&&p.race_id===race_id));commit();},
    async saveForecast(f){assertOpen();data.forecasts=data.forecasts.filter(x=>x.user_id!==data.currentId);data.forecasts.push({user_id:data.currentId,...f});commit();},
    async saveProfile(name){const p=data.profiles.find(p=>p.user_id===data.currentId);if(p)p.display_name=name;commit();},
    async saveResult(race_id,candidate_key){assertAdmin();if(!data.settings.picks_locked)throw new Error('Lock picks before entering results.');data.results=data.results.filter(r=>r.race_id!==race_id);if(candidate_key)data.results.push({race_id,candidate_key});commit();},
    async saveSettings(patch){assertAdmin();if(data.settings.picks_locked && patch.picks_locked===false && (data.results.length || data.settings.senate_dem_final!==null || data.settings.house_dem_final!==null))throw new Error('Clear all results and final seat totals before unlocking picks.');Object.assign(data.settings,patch);commit();},
    async switchPlayer(id){if(!data.profiles.some(p=>p.user_id===id))throw new Error('Unknown demo player.');data.currentId=id;commit();},
    async sendMagic(){throw new Error('Email sign-in requires Supabase.');}, async signInGuest(){}, async logout(){},
    async signInPassword(){throw new Error('Password sign-in requires Supabase.');},
    async startUpgrade(){throw new Error('Account upgrade requires Supabase.');},
    async setPassword(){throw new Error('Account upgrade requires Supabase.');},
    async getAuthStatus(){return {isAnonymous:false,email:null};},
    async getSession(){return {user:{id:data.currentId}};},
  };
}
function createSupabaseBackend(supabase) {
  let user=null;
  const call=async(promise)=>{const {data,error}=await promise;if(error)throw new Error(error.message);return data;};
  const signed=()=>{if(!user)throw new Error('Please sign in.');};
  return {
    isDemo:false,
    isLoggedIn:()=>Boolean(user),
    async getSession(){const session=await call(supabase.auth.getSession());user=session.session?.user || null;return {user};},
    async sendMagic(email){await call(supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin+window.location.pathname}}));},
    async signInPassword(email,password){
      const data=await call(supabase.auth.signInWithPassword({email,password}));
      user=data.user;
    },
    async getAuthStatus(){
      signed();
      const data=await call(supabase.auth.getUser());
      user=data.user;
      return {isAnonymous: Boolean(user?.is_anonymous),email:user?.email||null};
    },
    async startUpgrade(email){
      signed();
      const data=await call(supabase.auth.getUser());
      if (!data.user?.is_anonymous) throw new Error('This account already has a permanent sign-in identity.');
      if (!email || !email.includes('@')) throw new Error('Enter a valid email address.');
      await call(supabase.auth.updateUser({email}));
    },
    async setPassword(password){
      signed();
      const data=await call(supabase.auth.getUser());
      if (data.user?.is_anonymous || !data.user?.email_confirmed_at)
        throw new Error('Verify your email first using the email from Supabase, then refresh this page.');
      if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
      await call(supabase.auth.updateUser({password}));
    },
    async signInGuest(){const data=await call(supabase.auth.signInAnonymously());user=data.user;},
    async logout(){await call(supabase.auth.signOut());user=null;},
    async load(){signed();
      const [profiles,picks,forecasts,results,settings,admin]=await Promise.all([
        call(supabase.from('profiles').select('user_id,display_name')),
        call(supabase.from('picks').select('user_id,race_id,candidate_key')),
        call(supabase.from('forecasts').select('user_id,senate_dem,senate_rep,house_dem,house_rep')),
        call(supabase.from('results').select('race_id,candidate_key')),
        call(supabase.from('game_settings').select('*').eq('id',1).single()),
        call(supabase.from('admins').select('user_id').eq('user_id',user.id)),
      ]);
      return {profiles,picks,forecasts,results,settings,currentId:user.id,isAdmin:admin.length>0,isDemo:false};
    },
    async saveProfile(name){signed();await call(supabase.from('profiles').upsert({user_id:user.id,display_name:name},{onConflict:'user_id'}));},
    async savePick(race_id,candidate_key){signed();await call(supabase.from('picks').upsert({user_id:user.id,race_id,candidate_key},{onConflict:'user_id,race_id'}));},
    async clearPick(race_id){signed();await call(supabase.from('picks').delete().eq('user_id',user.id).eq('race_id',race_id));},
    async saveForecast(f){signed();await call(supabase.from('forecasts').upsert({user_id:user.id,...f},{onConflict:'user_id'}));},
    async saveResult(race_id,candidate_key){signed();if(candidate_key)
      await call(supabase.from('results').upsert({race_id,candidate_key,updated_at:new Date().toISOString()},{onConflict:'race_id'}));
      else await call(supabase.from('results').delete().eq('race_id',race_id));
    },
    async saveSettings(patch){signed();await call(supabase.from('game_settings').update(patch).eq('id',1));},
    async switchPlayer(){throw new Error('Use a separate email account for each player.');},
  };
}
