// Shared auto-sync logic — fetches finished World Cup matches and
// writes them into the `results` table of every active pool.
import { createClient } from "@supabase/supabase-js";

// Our 48 nation names (must match index.html exactly)
const NATIONS = ["France","Spain","England","Brazil","Argentina","Portugal","Germany","Netherlands",
"Belgium","Norway","Colombia","Morocco","Uruguay","United States","Switzerland","Japan",
"Ecuador","Croatia","Mexico","Senegal","Türkiye","Sweden","Austria","Scotland",
"Canada","Czech Republic","Ivory Coast","Ghana","Egypt","Paraguay","Algeria","South Korea",
"Tunisia","Bosnia","Australia","Iran","DR Congo","South Africa","Cape Verde","Saudi Arabia",
"Panama","Uzbekistan","Qatar","New Zealand","Iraq","Haiti","Curaçao","Jordan"];

// API names that don't match ours 1:1
const ALIASES = {
  "cote divoire":"Ivory Coast", "ivory coast":"Ivory Coast",
  "korea republic":"South Korea", "south korea":"South Korea",
  "czechia":"Czech Republic", "czech republic":"Czech Republic",
  "bosnia and herzegovina":"Bosnia", "bosniaherzegovina":"Bosnia",
  "congo dr":"DR Congo", "dr congo":"DR Congo", "democratic republic of the congo":"DR Congo",
  "cabo verde":"Cape Verde", "cape verde islands":"Cape Verde",
  "usa":"United States", "united states of america":"United States",
  "turkey":"Türkiye", "turkiye":"Türkiye",
  "ir iran":"Iran", "iran islamic republic":"Iran",
};

export const STAGE_MAP = {
  GROUP_STAGE: "GROUP",
  LAST_32: "R32", ROUND_OF_32: "R32", PLAYOFF_ROUND: "R32",
  LAST_16: "R16", ROUND_OF_16: "R16",
  QUARTER_FINALS: "QF", QUARTER_FINAL: "QF",
  SEMI_FINALS: "SF", SEMI_FINAL: "SF",
  FINAL: "F",
  // THIRD_PLACE intentionally unmapped — the pool doesn't score it
};

const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, "").trim();
const CANON = Object.fromEntries(NATIONS.map((n) => [norm(n), n]));
export const mapTeam = (apiName) => CANON[norm(apiName)] || ALIASES[norm(apiName)] || null;

export async function syncResults() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, FOOTBALL_DATA_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !FOOTBALL_DATA_KEY)
    throw new Error("Missing env vars: need SUPABASE_URL, SUPABASE_SERVICE_ROLE, FOOTBALL_DATA_KEY");

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  // 1) finished World Cup matches (competition code WC = FIFA World Cup)
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED", {
    headers: { "X-Auth-Token": FOOTBALL_DATA_KEY },
  });
  if (!res.ok) throw new Error(`football-data.org responded ${res.status}: ${await res.text()}`);
  const { matches = [] } = await res.json();

  // 2) translate API matches → our result rows
  const unknownStages = new Set(), unknownTeams = new Set();
  const rows = [];
  for (const m of matches) {
    const stage = STAGE_MAP[m.stage];
    if (!stage) { if (m.stage !== "THIRD_PLACE") unknownStages.add(m.stage); continue; }
    const home = mapTeam(m.homeTeam?.name), away = mapTeam(m.awayTeam?.name);

    const sh = m.score?.fullTime?.home ?? null, sa = m.score?.fullTime?.away ?? null;
    if (stage === "GROUP") {
      if (!home || !away) { if (!home) unknownTeams.add(m.homeTeam?.name); if (!away) unknownTeams.add(m.awayTeam?.name); continue; }
      const outcome = m.score?.winner === "HOME_TEAM" ? "A" : m.score?.winner === "AWAY_TEAM" ? "B" : "D";
      rows.push({ external_id: String(m.id), stage, team_a: home, team_b: away, outcome, score_a: sh, score_b: sa });
    } else {
      // knockout: winner first (penalties already reflected in score.winner)
      const homeWon = m.score?.winner === "HOME_TEAM", awayWon = m.score?.winner === "AWAY_TEAM";
      if (!homeWon && !awayWon) continue; // not settled yet
      const winner = homeWon ? home : away, loser = homeWon ? away : home;
      if (!winner) continue;
      rows.push({ external_id: String(m.id), stage,
        team_a: winner, team_b: loser || (homeWon ? m.awayTeam?.name : m.homeTeam?.name) || null,
        outcome: "A", score_a: homeWon ? sh : sa, score_b: homeWon ? sa : sh });
    }
  }

  // 3) write the new ones into every active pool
  const { data: pools, error: pe } = await sb.from("pools").select("id").in("status", ["drafting", "playing"]);
  if (pe) throw pe;

  let inserted = 0;
  for (const pool of pools || []) {
    const { data: existing } = await sb.from("results").select("external_id").eq("pool_id", pool.id).not("external_id", "is", null);
    const seen = new Set((existing || []).map((r) => r.external_id));
    const fresh = rows.filter((r) => !seen.has(r.external_id)).map((r) => ({ ...r, pool_id: pool.id, recorded_by: null }));
    if (!fresh.length) continue;
    const { error } = await sb.from("results").insert(fresh);
    if (error) console.error(`pool ${pool.id}:`, error.message);
    else inserted += fresh.length;
  }

  const summary = {
    finishedMatches: matches.length,
    usableResults: rows.length,
    pools: (pools || []).length,
    newlyInserted: inserted,
    unknownStages: [...unknownStages],
    unknownTeams: [...unknownTeams],
  };
  console.log("sync summary:", JSON.stringify(summary));
  return summary;
}

// run when executed directly (GitHub Action)
syncResults()
  .then((s) => console.log("Sync OK:", JSON.stringify(s)))
  .catch((e) => { console.error("Sync FAILED:", e); process.exit(1); });
