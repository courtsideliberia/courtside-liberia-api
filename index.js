const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

const serviceAccount = {
  type: "service_account",
  project_id: "courtsideliberia-stats-system",
  private_key_id: "882bb1e517f7a827a64c6663936475e3ca4c4cd9",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDmSZ5zTsQrM5rH\n1cc+kGx/2fHISkVvRR0U4dFWfMUHSFlE7dNZyvH/KPXIrCHQ7PLi9Xh60mIypOTK\n7fWeryX+iyoMIDhvsa6Zu2VjaNTvQOJAOrHDjwOTzsWo76mexEXVMxj7+TcDJkQI\n2SXO18MjNYv49kZQvJ7/SM2cJyAaQ1wpAsG2AwUp2IoRPYiLmAPSeZSmag9RPumP\nFJ0Dy4KbXRROjlQKukjU7mHAidg5OYxEK06jwQR3iukRRwtSCySH7Z9nM1kaMBdZ\nxTg10TIw4UdmoDYbyL5ePRY6HzI7mUnfMocJKcg3yGcZLSdn6uzp0hs/DzDDz5dL\n16nCkkjLAgMBAAECggEAGVJvsubZWUAZEpo7iMdMDEREetf330QD7ko6a5PX/R9Z\nJDmGgPF46gFwrU/dfrdfVHzWHPifRZ8DbXD8Y3uHkQAab9o8em5Y8Ec+ic961+gU\nONMmEtvZ8oR3uvDHf6a+Cwh4WdSjK5x8j1XZUMTsNyXp2JwJSqgYT6KLa/09YXBg\nqbeOgpyBj2j/RO2OTzueW+6BW48Jfzx2dnkqLmD8u+Ay3xnEX578CAB9D8G3iOkt\nCpvu5i6h/TQwP5Rc6KTNWwZBTPNog11u8fW6/SDLLmdFKwU8d2PD4yYQQ4zxeJps\nUYt4T+4TvsJtJWZrYot4pMPyoAzkTjx7xB7gwhR2aQKBgQDz5YQ5crABmWr1Z0iU\nPD6rBnhZX5TjHS+AtXqqnJmxMehYHHnQSJufxK49FLiW3qKnTvpwk+8baf/RTjdE\nn6KfWkrjRZ2PX3N9W6xMvTKZFkOt+OnrFidwAOMqxyaHEaBttaYMvw44KElm3bwa\nxrrlqKeti0qQx62GFntNI4T/vQKBgQDxtzZ7HO8K3IluazENk0MfhiUo97G3qX4+\nh+6vRDuSRDSKM8lK+gW2BLvrZbNGNdH5FYHPLEqjuiNGVKp3mIuGBnFJDH53szUc\n1psYM4hQNoKFdyWuE7mbU0CThDeLvbWpotMLv0/s3h+AyfsFg6LxWfDRYiyOcXQj\n322kjDRPJwKBgF2ptq2ZLZ5vnHPBxk2nFSn4wh8QZc0SWDvFdeYvXZZ+5AtyZBVo\nzNr+XSt32auWtEAsRGEXbqvIeUWYFAF2jK1Fr5y4D1oP/foWSoTt45CGzFbzUGHH\nkD2jGZpEALe+PS3kpHAgrwVB825dmO9vgjbQHhS3eVtAU5M67v8gtOLBAoGAfc8t\nlTC/Hrkg8w7pzjYK5tqMduFNZ9nZcrSPwDvUgdHsQs6ng9XUqSOXp/McN3wF2Q6f\nrPRRuRxGBfJFc9A7NrwdtLbDEIx/JY5x1UvlNFLa5prYSt3LapQPdXiI7LwGVNAB\n5whhklkeroryk7ErW1HD7UebB1z35UACsnWjOFsCgYEAjQFVK/E8d197WW40xonl\nLjzCit29lODEuyk1xDDEtVArIVZC755N+N7IRcotiwC9+Mf0fsV5/WqQ86FC5STJ\nWG95wXDR9pnygs2NxGdEfBLhteYtFSzEtXPHH02g0C4f721SUhCiUMGGlw2eWhwT\nrxqUjW7bEsx8iW6BkGdSq5Y=\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@courtsideliberia-stats-system.iam.gserviceaccount.com",
  client_id: "110206127020314200408",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40courtsideliberia-stats-system.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const q = (col, field, val) => db.collection(col).where(field, "==", val).get()
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
  const twoPm = events.filter(e => e.type === "2PT_MAKE").length;
  const twoPa = events.filter(e => e.type.startsWith("2PT")).length;
  const threePm = events.filter(e => e.type === "3PT_MAKE").length;
  const threePa = events.filter(e => e.type.startsWith("3PT")).length;
  const ftm = events.filter(e => e.type === "FT_MAKE").length;
  const fta = events.filter(e => e.type.startsWith("FT")).length;
  const oreb = events.filter(e => e.type === "REB_OFF").length;
  const dreb = events.filter(e => e.type === "REB_DEF").length;
  const ast = events.filter(e => e.type === "ASSIST").length;
  const stl = events.filter(e => e.type === "STEAL").length;
  const blk = events.filter(e => e.type === "BLOCK").length;
  const to = events.filter(e => e.type === "TURNOVER").length;
  const pf = events.filter(e => e.type === "FOUL").length;
  const pts = twoPm * 2 + threePm * 3 + ftm;
  const reb = oreb + dreb;
  const fgm = twoPm + threePm;
  const fga = twoPa + threePa;
  return { pts, reb, ast, stl, blk, pf, fgm, fga, threePm, threePa, ftm, fta, oreb, dreb, to,
    eff: pts + reb + ast + stl + blk - (fga - fgm + (fta - ftm) + to) };
}

// ─── LEAGUES ──────────────────────────────────────────────────────────────────
app.get("/api/leagues", async (req, res) => {
  try {
    const snap = await db.collection("leagues").get();
    const leagues = snap.docs.map(d => {
      const { logoUrl, ...rest } = d.data();
      return { id: d.id, ...rest, hasLogo: !!logoUrl };
    });
    res.json(leagues);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/leagues/:id", async (req, res) => {
  try {
    const [leagueDoc, stages] = await Promise.all([
      db.collection("leagues").doc(req.params.id).get(),
      q("stages", "leagueId", req.params.id)
    ]);
    if (!leagueDoc.exists) return res.status(404).json({ error: "Not found" });
    const { logoUrl, ...rest } = leagueDoc.data();
    res.json({ id: leagueDoc.id, ...rest, hasLogo: !!logoUrl,
      stages: stages.sort((a, b) => (a.order||0) - (b.order||0)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TEAMS ────────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/teams", async (req, res) => {
  try {
    const teams = await q("teams", "leagueId", req.params.id);
    res.json(teams.map(({ logoUrl, players, ...rest }) => ({
      ...rest, hasLogo: !!logoUrl, playerCount: (players||[]).length,
      players: (players||[]).map(({ photoUrl, ...p }) => ({ ...p, hasPhoto: !!photoUrl }))
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/teams/:id", async (req, res) => {
  try {
    const doc = await db.collection("teams").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    const { logoUrl, players, ...rest } = doc.data();
    res.json({ id: doc.id, ...rest, hasLogo: !!logoUrl,
      players: (players||[]).map(({ photoUrl, ...p }) => ({ ...p, hasPhoto: !!photoUrl })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/teams/:id/stats", async (req, res) => {
  try {
    const doc = await db.collection("teams").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    const team = { id: doc.id, ...doc.data() };
    const games = await q("games", "homeTeamId", team.id);
    const awayGames = await q("games", "awayTeamId", team.id);
    const all = [...games, ...awayGames].filter(g => g.status === "FINISHED");
    let w = 0, l = 0, tp = 0, to = 0;
    for (const g of all) {
      const isHome = g.homeTeamId === team.id;
      const pts = isHome ? g.homeScore : g.awayScore;
      const opp = isHome ? g.awayScore : g.homeScore;
      tp += pts; to += opp;
      if (pts > opp) w++; else l++;
    }
    const gp = all.length;
    res.json({ teamId: team.id, teamName: team.name, gamesPlayed: gp, wins: w, losses: l,
      winPct: gp ? (w/gp).toFixed(3) : "0.000", ppg: gp ? (tp/gp).toFixed(1) : "0.0",
      oppPpg: gp ? (to/gp).toFixed(1) : "0.0", pointDiff: gp ? ((tp-to)/gp).toFixed(1) : "0.0" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STANDINGS ────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/standings", async (req, res) => {
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
        gp: w+l, w, l, winPct: w+l > 0 ? (w/(w+l)).toFixed(3) : "0.000",
        pf, pa, diff: pf-pa, ppg: w+l > 0 ? (pf/(w+l)).toFixed(1) : "0.0" };
    });
    res.json(table.sort((a, b) => b.w - a.w || b.diff - a.diff));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GAMES ────────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/games", async (req, res) => {
  try {
    const { status } = req.query;
    let ref = db.collection("games").where("leagueId", "==", req.params.id);
    if (status) ref = ref.where("status", "==", status);
    const snap = await ref.get();
    const games = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(games.sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/games/live", async (req, res) => {
  try {
    const snap = await db.collection("games").where("status", "==", "LIVE").get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/games/:id", async (req, res) => {
  try {
    const doc = await db.collection("games").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/games/:id/boxscore", async (req, res) => {
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
      (roster||[]).map(pid => {
        const found = (playerList||[]).find(pl => pl.id === pid) || { id: pid, name: "Unknown" };
        const { photoUrl, ...p } = found;
        return { ...p, hasPhoto: !!photoUrl, stats: calcPlayerStats(events.filter(e => e.playerId === pid)) };
      });
    const { logoUrl: hLogo, players: hP, ...hRest } = homeData;
    const { logoUrl: aLogo, players: aP, ...aRest } = awayData;
    res.json({
      game,
      homeTeam: { ...hRest, hasLogo: !!hLogo, starters: game.homeStarters||[], roster: buildRoster(game.homeRoster, hP) },
      awayTeam: { ...aRest, hasLogo: !!aLogo, starters: game.awayStarters||[], roster: buildRoster(game.awayRoster, aP) },
      quarterScores: { home: game.homeQuarterScores||[], away: game.awayQuarterScores||[] },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PLAYERS ─────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/players", async (req, res) => {
  try {
    const [teams, statsSnap] = await Promise.all([
      q("teams", "leagueId", req.params.id),
      db.collection("seasonStats").where("leagueId", "==", req.params.id).get()
    ]);
    const statsMap = {};
    statsSnap.docs.forEach(d => { const s = d.data(); if (s.playerId) statsMap[s.playerId] = normalizeStats(s); });
    const allPlayers = teams.flatMap(t =>
      (t.players||[]).map(({ photoUrl, ...p }) => ({
        ...p, hasPhoto: !!photoUrl, teamId: t.id, teamName: t.name, hasTeamLogo: !!t.logoUrl,
        seasonStats: statsMap[p.id] || null
      }))
    );
    res.json(allPlayers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/players/:id", async (req, res) => {
  try {
    const teamsSnap = await db.collection("teams").get();
    let foundPlayer = null, foundTeam = null;
    for (const d of teamsSnap.docs) {
      const data = d.data();
      const p = (data.players||[]).find(p => p.id === req.params.id);
      if (p) { foundPlayer = p; foundTeam = { id: d.id, ...data }; break; }
    }
    if (!foundPlayer) return res.status(404).json({ error: "Player not found" });
    const statsSnap = await db.collection("seasonStats").where("playerId", "==", req.params.id).get();
    const { photoUrl, ...pRest } = foundPlayer;
    res.json({ ...pRest, hasPhoto: !!photoUrl, teamId: foundTeam.id, teamName: foundTeam.name,
      hasTeamLogo: !!foundTeam.logoUrl,
      seasonStats: statsSnap.docs.map(d => normalizeStats({ id: d.id, ...d.data() })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── LEADERS ─────────────────────────────────────────────────────────────────
app.get("/api/leagues/:id/leaders", async (req, res) => {
  try {
    const [teams, statsSnap] = await Promise.all([
      q("teams", "leagueId", req.params.id),
      db.collection("seasonStats").where("leagueId", "==", req.params.id).get()
    ]);
    const allPlayers = teams.flatMap(t => (t.players||[]).map(p => ({ ...p, teamName: t.name })));
    const enriched = statsSnap.docs
      .map(d => normalizeStats({ id: d.id, ...d.data() }))
      .filter(s => s.gamesPlayed > 0)
      .map(s => {
        const player = allPlayers.find(p => p.id === s.playerId) || {};
        const gp = s.gamesPlayed;
        return {
          playerId: s.playerId, playerName: player.name||"Unknown",
          teamName: player.teamName||"", hasPhoto: !!player.photoUrl,
          position: player.position||null, number: player.number||"", gamesPlayed: gp,
          ppg: (s.totalPoints/gp).toFixed(1), rpg: (s.totalRebounds/gp).toFixed(1),
          apg: (s.totalAssists/gp).toFixed(1), spg: (s.totalSteals/gp).toFixed(1),
          bpg: (s.totalBlocks/gp).toFixed(1),
          fgPct: s.totalFGA > 0 ? ((s.totalFGM/s.totalFGA)*100).toFixed(1) : "0.0",
          threePct: s.total3PA > 0 ? ((s.total3PM/s.total3PA)*100).toFixed(1) : "0.0",
          ftPct: s.totalFTA > 0 ? ((s.totalFTM/s.totalFTA)*100).toFixed(1) : "0.0",
        };
      });
    res.json({
      scoring:  [...enriched].sort((a,b) => b.ppg - a.ppg).slice(0,10),
      rebounds: [...enriched].sort((a,b) => b.rpg - a.rpg).slice(0,10),
      assists:  [...enriched].sort((a,b) => b.apg - a.apg).slice(0,10),
      steals:   [...enriched].sort((a,b) => b.spg - a.spg).slice(0,10),
      blocks:   [...enriched].sort((a,b) => b.bpg - a.bpg).slice(0,10),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── IMAGE ENDPOINTS ─────────────────────────────────────────────────────────
app.get("/api/leagues/:id/logo", async (req, res) => {
  try {
    const doc = await db.collection("leagues").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).send("Not found");
    const { logoUrl } = doc.data();
    if (!logoUrl) return res.status(404).send("No logo");
    // logoUrl is base64 data URI like "data:image/png;base64,..."
    if (logoUrl.startsWith("data:")) {
      const [header, data] = logoUrl.split(",");
      const mimeType = header.match(/data:([^;]+)/)[1];
      const buffer = Buffer.from(data, "base64");
      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    }
    res.redirect(logoUrl);
  } catch (e) { res.status(500).send(e.message); }
});

app.get("/api/teams/:id/logo", async (req, res) => {
  try {
    const doc = await db.collection("teams").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).send("Not found");
    const { logoUrl } = doc.data();
    if (!logoUrl) return res.status(404).send("No logo");
    if (logoUrl.startsWith("data:")) {
      const [header, data] = logoUrl.split(",");
      const mimeType = header.match(/data:([^;]+)/)[1];
      const buffer = Buffer.from(data, "base64");
      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    }
    res.redirect(logoUrl);
  } catch (e) { res.status(500).send(e.message); }
});

app.get("/api/players/:id/photo", async (req, res) => {
  try {
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
      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=86400");
      return res.send(buffer);
    }
    res.redirect(photoUrl);
  } catch (e) { res.status(500).send(e.message); }
});

// ─── SERVER ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Courtside API running on port ${PORT}`));
