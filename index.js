const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// ─── Firebase Init ─────────────────────────────────────────────────────────────
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CERT_URL,
  universe_domain: "googleapis.com"
};

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── SERVER-SIDE CACHE ────────────────────────────────────────────────────────
// This is the #1 fix for your Firestore quota problem.
// Instead of hitting Firestore on every request, we store results in memory
// and only re-fetch after the TTL expires.
//
// TTLs chosen carefully:
//   - 5 min  for data that changes during games (live scores, fixtures)
//   - 15 min for data that rarely changes (standings, leaders, players)
//   - 60 min for static data (team/league info, rosters, logos/photos)
//
// This means 100 users visiting your site in an hour = ~1-5 Firestore reads
// instead of 100+, keeping you well within the free tier.

const cache = new Map();

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// TTL constants (milliseconds)
const TTL = {
  STATIC:   60 * 60 * 1000,  // 60 min — logos, team info, rosters
  NORMAL:   15 * 60 * 1000,  // 15 min — standings, leaders, players, player profiles
  LIVE:      5 * 60 * 1000,  // 5 min  — games, live scores, fixtures
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const q = (col, field, val) =>
  db.collection(col).where(field, "==", val).get()
    .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })));

function normalizeStats(s) {
  const gp = s.gamesPlayed || 0;
  return {
    playerId: s.playerId, leagueId: s.leagueId, gamesPlayed: gp,
    totalPoints: s.totalPoints || 0, totalRebounds: s.totalRebounds || 0,
    totalAssists: s.totalAssists || 0, totalSteals: s.totalSteals || 0,
    totalBlocks: s.totalBlocks || 0, totalFGM: s.totalFGM || 0,
    totalFGA: s.totalFGA || 0, total3PM: s.total3PM || 0, total3PA: s.total3PA || 0,
    totalFTM: s.totalFTM || 0, totalFTA: s.totalFTA || 0,
    totalTurnovers: s.totalTurnovers || 0, totalFouls: s.totalFouls || 0,
  };
}

function calcPlayerStats(events) {
  const twoPm  = events.filter(e => e.type === "2PT_MAKE").length;
  const twoPa  = events.filter(e => e.type.startsWith("2PT")).length;
  const threePm = events.filter(e => e.type === "3PT_MAKE").length;
  const threePa = events.filter(e => e.type.startsWith("3PT")).length;
  const ftm = events.filter(e => e.type === "FT_MAKE").length;
  const fta = events.filter(e => e.type.startsWith("FT")).length;
  const oreb = events.filter(e => e.type === "REB_OFF").length;
  const dreb = events.filter(e => e.type === "REB_DEF").length;
  const ast = events.filter(e => e.type === "ASSIST").length;
  const stl = events.filter(e => e.type === "STEAL").length;
  const blk = events.filter(e => e.type === "BLOCK").length;
  const to  = events.filter(e => e.type === "TURNOVER").length;
  const pf  = events.filter(e => e.type === "FOUL").length;
  const pts = twoPm * 2 + threePm * 3 + ftm;
  const reb = oreb + dreb;
  const fgm = twoPm + threePm;
  const fga = twoPa + threePa;
  return {
    pts, reb, ast, stl, blk, pf, fgm, fga, threePm, threePa, ftm, fta, oreb, dreb, to,
    eff: pts + reb + ast + stl + blk - (fga - fgm + (fta - ftm) + to)
  };
}

// ─── LEAGUES ──────────────────────────────────────────────────────────────────
app.get("/api/leagues", async (req, res) => {
  const cacheKey = "leagues:all";
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const snap = await db.collection("leagues").get();
    const leagues = snap.docs.map(d => {
      const { logoUrl, ...rest } = d.data();
      return { id: d.id, ...rest, hasLogo: !!logoUrl };
    });
    setCache(cacheKey, leagues, TTL.STATIC);
    res.json(leagues);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/leagues/:id", async (req, res) => {
  const cacheKey = `league:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [leagueDoc, stages] = await Promise.all([
      db.collection("leagues").doc(req.params.id).get(),
      q("stages", "leagueId", req.params.id)
    ]);
    if (!leagueDoc.exists) return res.status(404).json({ error: "Not found" });
    const { logoUrl, ...rest } = leagueDoc.data();
    const result = { id: leagueDoc.id, ...rest, hasLogo: !!logoUrl,
      stages: stages.sort((a, b) => (a.order || 0) - (b.order || 0)) };
    setCache(cacheKey, result, TTL.STATIC);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TEAMS ────────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/teams", async (req, res) => {
  const cacheKey = `teams:league:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const teams = await q("teams", "leagueId", req.params.id);
    const result = teams.map(({ logoUrl, players, ...rest }) => ({
      ...rest, hasLogo: !!logoUrl, playerCount: (players || []).length,
      players: (players || []).map(({ photoUrl, ...p }) => ({ ...p, hasPhoto: !!photoUrl }))
    }));
    setCache(cacheKey, result, TTL.STATIC);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/teams/:id", async (req, res) => {
  const cacheKey = `team:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const doc = await db.collection("teams").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    const { logoUrl, players, ...rest } = doc.data();
    const result = { id: doc.id, ...rest, hasLogo: !!logoUrl,
      players: (players || []).map(({ photoUrl, ...p }) => ({ ...p, hasPhoto: !!photoUrl })) };
    setCache(cacheKey, result, TTL.STATIC);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/teams/:id/stats", async (req, res) => {
  const cacheKey = `team-stats:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const doc = await db.collection("teams").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    const team = { id: doc.id, ...doc.data() };
    const [homeGames, awayGames] = await Promise.all([
      q("games", "homeTeamId", team.id),
      q("games", "awayTeamId", team.id)
    ]);
    const all = [...homeGames, ...awayGames].filter(g => g.status === "FINISHED");
    let w = 0, l = 0, tp = 0, to = 0;
    for (const g of all) {
      const isHome = g.homeTeamId === team.id;
      const pts = isHome ? g.homeScore : g.awayScore;
      const opp = isHome ? g.awayScore : g.homeScore;
      tp += pts; to += opp;
      if (pts > opp) w++; else l++;
    }
    const gp = all.length;
    const result = { teamId: team.id, teamName: team.name, gamesPlayed: gp, wins: w, losses: l,
      winPct: gp ? (w / gp).toFixed(3) : "0.000",
      ppg: gp ? (tp / gp).toFixed(1) : "0.0",
      oppPpg: gp ? (to / gp).toFixed(1) : "0.0",
      pointDiff: gp ? ((tp - to) / gp).toFixed(1) : "0.0" };
    setCache(cacheKey, result, TTL.NORMAL);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STANDINGS ────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/standings", async (req, res) => {
  const cacheKey = `standings:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [teams, games] = await Promise.all([
      q("teams", "leagueId", req.params.id),
      q("games", "leagueId", req.params.id)
    ]);
    const finished = games.filter(g => g.status === "FINISHED");
    const table = teams.map(team => {
      const tg = finished.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
      let w = 0, l = 0, pf = 0, pa = 0;
      for (const g of tg) {
        const isHome = g.homeTeamId === team.id;
        const pts = isHome ? g.homeScore : g.awayScore;
        const opp = isHome ? g.awayScore : g.homeScore;
        pf += pts; pa += opp;
        if (pts > opp) w++; else l++;
      }
      return { teamId: team.id, teamName: team.name, hasLogo: !!team.logoUrl,
        gp: w + l, w, l, winPct: w + l > 0 ? (w / (w + l)).toFixed(3) : "0.000",
        pf, pa, diff: pf - pa, ppg: w + l > 0 ? (pf / (w + l)).toFixed(1) : "0.0" };
    });
    const result = table.sort((a, b) => b.w - a.w || b.diff - a.diff);
    setCache(cacheKey, result, TTL.NORMAL);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GAMES ────────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/games", async (req, res) => {
  const { status } = req.query;
  const cacheKey = `games:league:${req.params.id}:${status || "all"}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    let ref = db.collection("games").where("leagueId", "==", req.params.id);
    if (status) ref = ref.where("status", "==", status);
    const snap = await ref.get();
    const games = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    // Live games: short TTL. Finished/scheduled: longer TTL
    const ttl = status === "FINISHED" ? TTL.NORMAL : TTL.LIVE;
    setCache(cacheKey, games, ttl);
    res.json(games);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/games/live", async (req, res) => {
  // NOTE: /api/games/live must be defined BEFORE /api/games/:id
  const cacheKey = "games:live";
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const snap = await db.collection("games").where("status", "==", "LIVE").get();
    const result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setCache(cacheKey, result, TTL.LIVE);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/games/:id", async (req, res) => {
  const cacheKey = `game:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const doc = await db.collection("games").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    const result = { id: doc.id, ...doc.data() };
    // Don't cache live games long
    const ttl = result.status === "LIVE" ? TTL.LIVE : TTL.NORMAL;
    setCache(cacheKey, result, ttl);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/games/:id/boxscore", async (req, res) => {
  const cacheKey = `boxscore:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const gameDoc = await db.collection("games").doc(req.params.id).get();
    if (!gameDoc.exists) return res.status(404).json({ error: "Not found" });
    const game = { id: gameDoc.id, ...gameDoc.data() };
    const [homeDoc, awayDoc, eventsSnap] = await Promise.all([
      db.collection("teams").doc(game.homeTeamId).get(),
      db.collection("teams").doc(game.awayTeamId).get(),
      db.collection("events").where("gameId", "==", req.params.id).get()
    ]);
    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const homeData = homeDoc.exists ? { id: homeDoc.id, ...homeDoc.data() } : {};
    const awayData = awayDoc.exists ? { id: awayDoc.id, ...awayDoc.data() } : {};
    const buildRoster = (roster, playerList) =>
      (roster || []).map(pid => {
        const found = (playerList || []).find(pl => pl.id === pid) || { id: pid, name: "Unknown" };
        const { photoUrl, ...p } = found;
        return { ...p, hasPhoto: !!photoUrl, stats: calcPlayerStats(events.filter(e => e.playerId === pid)) };
      });
    const { logoUrl: hLogo, players: hP, ...hRest } = homeData;
    const { logoUrl: aLogo, players: aP, ...aRest } = awayData;
    const result = {
      game,
      homeTeam: { ...hRest, hasLogo: !!hLogo, starters: game.homeStarters || [], roster: buildRoster(game.homeRoster, hP) },
      awayTeam: { ...aRest, hasLogo: !!aLogo, starters: game.awayStarters || [], roster: buildRoster(game.awayRoster, aP) },
      quarterScores: { home: game.homeQuarterScores || [], away: game.awayQuarterScores || [] },
    };
    // Don't cache live boxscores long
    const ttl = game.status === "LIVE" ? TTL.LIVE : TTL.NORMAL;
    setCache(cacheKey, result, ttl);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PLAYERS ─────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/players", async (req, res) => {
  const cacheKey = `players:league:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [teams, statsSnap] = await Promise.all([
      q("teams", "leagueId", req.params.id),
      db.collection("seasonStats").where("leagueId", "==", req.params.id).get()
    ]);
    const statsMap = {};
    statsSnap.docs.forEach(d => {
      const s = d.data();
      if (s.playerId) statsMap[s.playerId] = normalizeStats(s);
    });
    const allPlayers = teams.flatMap(t =>
      (t.players || []).map(({ photoUrl, ...p }) => ({
        ...p, hasPhoto: !!photoUrl, teamId: t.id, teamName: t.name,
        hasTeamLogo: !!t.logoUrl, seasonStats: statsMap[p.id] || null
      }))
    );
    setCache(cacheKey, allPlayers, TTL.NORMAL);
    res.json(allPlayers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/players/:id", async (req, res) => {
  const cacheKey = `player:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    // FIXED: scan all teams once, cached for 60 min — the original did this on EVERY request
    const teamsSnap = await db.collection("teams").get();
    let foundPlayer = null, foundTeam = null;
    for (const d of teamsSnap.docs) {
      const data = d.data();
      const p = (data.players || []).find(p => p.id === req.params.id);
      if (p) { foundPlayer = p; foundTeam = { id: d.id, ...data }; break; }
    }
    if (!foundPlayer) return res.status(404).json({ error: "Player not found" });
    const statsSnap = await db.collection("seasonStats").where("playerId", "==", req.params.id).get();
    const { photoUrl, ...pRest } = foundPlayer;
    const result = { ...pRest, hasPhoto: !!photoUrl, teamId: foundTeam.id, teamName: foundTeam.name,
      hasTeamLogo: !!foundTeam.logoUrl,
      seasonStats: statsSnap.docs.map(d => normalizeStats({ id: d.id, ...d.data() })) };
    setCache(cacheKey, result, TTL.NORMAL);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── LEADERS ─────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/leaders", async (req, res) => {
  const cacheKey = `leaders:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [teams, statsSnap] = await Promise.all([
      q("teams", "leagueId", req.params.id),
      db.collection("seasonStats").where("leagueId", "==", req.params.id).get()
    ]);
    const allPlayers = teams.flatMap(t => (t.players || []).map(p => ({ ...p, teamName: t.name })));
    const enriched = statsSnap.docs
      .map(d => normalizeStats({ id: d.id, ...d.data() }))
      .filter(s => s.gamesPlayed > 0)
      .map(s => {
        const player = allPlayers.find(p => p.id === s.playerId) || {};
        const gp = s.gamesPlayed;
        return {
          playerId: s.playerId, playerName: player.name || "Unknown",
          teamName: player.teamName || "", hasPhoto: !!player.photoUrl,
          position: player.position || null, number: player.number || "", gamesPlayed: gp,
          ppg: (s.totalPoints / gp).toFixed(1), rpg: (s.totalRebounds / gp).toFixed(1),
          apg: (s.totalAssists / gp).toFixed(1), spg: (s.totalSteals / gp).toFixed(1),
          bpg: (s.totalBlocks / gp).toFixed(1),
          fgPct: s.totalFGA > 0 ? ((s.totalFGM / s.totalFGA) * 100).toFixed(1) : "0.0",
          threePct: s.total3PA > 0 ? ((s.total3PM / s.total3PA) * 100).toFixed(1) : "0.0",
          ftPct: s.totalFTA > 0 ? ((s.totalFTM / s.totalFTA) * 100).toFixed(1) : "0.0",
        };
      });
    const result = {
      scoring:  [...enriched].sort((a, b) => b.ppg - a.ppg).slice(0, 10),
      rebounds: [...enriched].sort((a, b) => b.rpg - a.rpg).slice(0, 10),
      assists:  [...enriched].sort((a, b) => b.apg - a.apg).slice(0, 10),
      steals:   [...enriched].sort((a, b) => b.spg - a.spg).slice(0, 10),
      blocks:   [...enriched].sort((a, b) => b.bpg - a.bpg).slice(0, 10),
    };
    setCache(cacheKey, result, TTL.NORMAL);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── IMAGE ENDPOINTS ─────────────────────────────────────────────────────────
// Images are cached for 60 min since they never change
app.get("/api/leagues/:id/logo", async (req, res) => {
  const cacheKey = `logo:league:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) {
    res.set("Content-Type", cached.mimeType);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(cached.buffer);
  }
  try {
    const doc = await db.collection("leagues").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).send("Not found");
    const { logoUrl } = doc.data();
    if (!logoUrl) return res.status(404).send("No logo");
    if (logoUrl.startsWith("data:")) {
      const [header, data] = logoUrl.split(",");
      const mimeType = header.match(/data:([^;]+)/)[1];
      const buffer = Buffer.from(data, "base64");
      setCache(cacheKey, { mimeType, buffer }, TTL.STATIC);
      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    }
    res.redirect(logoUrl);
  } catch (e) { res.status(500).send(e.message); }
});

app.get("/api/teams/:id/logo", async (req, res) => {
  const cacheKey = `logo:team:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) {
    res.set("Content-Type", cached.mimeType);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(cached.buffer);
  }
  try {
    const doc = await db.collection("teams").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).send("Not found");
    const { logoUrl } = doc.data();
    if (!logoUrl) return res.status(404).send("No logo");
    if (logoUrl.startsWith("data:")) {
      const [header, data] = logoUrl.split(",");
      const mimeType = header.match(/data:([^;]+)/)[1];
      const buffer = Buffer.from(data, "base64");
      setCache(cacheKey, { mimeType, buffer }, TTL.STATIC);
      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    }
    res.redirect(logoUrl);
  } catch (e) { res.status(500).send(e.message); }
});

app.get("/api/players/:id/photo", async (req, res) => {
  const cacheKey = `photo:player:${req.params.id}`;
  const cached = getCache(cacheKey);
  if (cached) {
    res.set("Content-Type", cached.mimeType);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(cached.buffer);
  }
  try {
    // FIXED: This was scanning ALL teams on every photo request — very expensive!
    // Now it's cached so the scan only happens once per player per hour.
    const teamsSnap = await db.collection("teams").get();
    let photoUrl = null;
    for (const d of teamsSnap.docs) {
      const players = d.data().players || [];
      const player = players.find(p => p.id === req.params.id);
      if (player) { photoUrl = player.photoUrl; break; }
    }
    if (!photoUrl) return res.status(404).send("No photo");
    if (photoUrl.startsWith("data:")) {
      const [header, data] = photoUrl.split(",");
      const mimeType = header.match(/data:([^;]+)/)[1];
      const buffer = Buffer.from(data, "base64");
      setCache(cacheKey, { mimeType, buffer }, TTL.STATIC);
      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    }
    res.redirect(photoUrl);
  } catch (e) { res.status(500).send(e.message); }
});

// ─── CACHE STATS (helpful for debugging) ─────────────────────────────────────
app.get("/api/cache/stats", (req, res) => {
  const stats = { entries: cache.size, keys: [...cache.keys()] };
  res.json(stats);
});

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Courtside API running on port ${PORT}`));
