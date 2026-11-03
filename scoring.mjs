/** All score calculations are pure: results + saved picks + forecasts => leaderboard. */
export function scoreGame(races, profiles, picks, results, forecasts, settings) {
  const actual = new Map(results.map(row => [row.race_id, row.candidate_key]));
  const byPlayerPicks = new Map();
  for (const p of picks) {
    if (!byPlayerPicks.has(p.user_id)) byPlayerPicks.set(p.user_id, new Map());
    byPlayerPicks.get(p.user_id).set(p.race_id, p.candidate_key);
  }
  const byForecast = new Map(forecasts.map(f => [f.user_id, f]));
  const senateReady = Number.isInteger(settings.senate_dem_final) && Number.isInteger(settings.senate_rep_final)
    && settings.senate_dem_final + settings.senate_rep_final === 100;
  const houseReady = Number.isInteger(settings.house_dem_final) && Number.isInteger(settings.house_rep_final)
    && settings.house_dem_final + settings.house_rep_final === 435;
  const completed = settings.picks_locked && actual.size === races.length && senateReady && houseReady;

  const players = profiles.map(profile => {
    const playerPicks = byPlayerPicks.get(profile.user_id) ?? new Map();
    const forecast = byForecast.get(profile.user_id) ?? null;
    let housePoints = 0, senatePoints = 0, correct = 0, decidedPicks = 0;
    for (const race of races) {
      const winner = actual.get(race.id);
      const pick = playerPicks.get(race.id);
      if (winner && pick) decidedPicks++;
      if (winner && pick === winner) {
        correct++;
        if (race.chamber === 'senate') senatePoints += race.points;
        else housePoints += race.points;
      }
    }
    const senateBonus = senateReady && forecast &&
      forecast.senate_dem === settings.senate_dem_final && forecast.senate_rep === settings.senate_rep_final ? 10 : 0;
    const houseError = houseReady && forecast ?
      Math.abs(forecast.house_dem - settings.house_dem_final) +
      Math.abs(forecast.house_rep - settings.house_rep_final) : null;
    return {
      ...profile, picksCount: playerPicks.size, forecastSaved: Boolean(forecast),
      housePoints, senatePoints, senateBonus, total: housePoints + senatePoints + senateBonus,
      correct, decidedPicks, houseError,
    };
  });

  players.sort((a, b) => b.total - a.total ||
    (houseReady ? (a.houseError ?? Infinity) - (b.houseError ?? Infinity) : 0) ||
    a.display_name.localeCompare(b.display_name));
  for (let i=0; i<players.length; i++) {
    const current=players[i]; const prev=players[i-1];
    current.rank = (i>0 && current.total === prev.total && (!houseReady || current.houseError === prev.houseError))
      ? prev.rank : i+1;
  }
  return { players, senateReady, houseReady, completed, called: actual.size, allRaces: races.length };
}

export function candidateFor(race, key) { return race.candidates.find(c => c.key === key) ?? null; }
export function breakdown(races) {
  return { senate: races.filter(r => r.chamber === 'senate').reduce((n, r) => n+r.points, 0),
           house: races.filter(r => r.chamber === 'house').reduce((n, r) => n+r.points, 0) };
}
