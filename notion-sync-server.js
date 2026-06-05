/**
 * notion-sync-server.js
 * Backend Node.js — Synchronisation bidirectionnelle Notion ↔ Gantt JGA
 *
 * Dépendances :  npm install express @notionhq/client ws cors dotenv
 *
 * Variables d'environnement (.env) :
 *   NOTION_TOKEN        = secret_xxxx        (Integration Notion)
 *   NOTION_PHASES_DB    = 40c749fb35d24caf97ec0fe5c6b64107
 *   NOTION_AFFAIRES_DB  = a660684cf79a432ebd3f320213c36f40
 *   PORT                = 3001
 *   POLL_INTERVAL_MS    = 5000
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const http = require("http");
const { Client } = require("@notionhq/client");

// ─── Config ───────────────────────────────────────────────────────────────────

const NOTION_TOKEN       = process.env.NOTION_TOKEN;
const PHASES_DB_ID       = process.env.NOTION_PHASES_DB;
const AFFAIRES_DB_ID     = process.env.NOTION_AFFAIRES_DB;
const PORT               = process.env.PORT || 3001;
const POLL_INTERVAL_MS   = parseInt(process.env.POLL_INTERVAL_MS || "5000");

const notion = new Client({ auth: NOTION_TOKEN });

// ─── Mapping Notion → modèle Gantt ───────────────────────────────────────────
//
// Propriétés de la base 📐 Phases :
//   Phase          TITLE
//   Affaire        RELATION  → base Affaires
//   Code phase     SELECT    DIAG|ESQ|AVP|PRO|DCE|ACT|VISA|DET|OPR|AOR
//   Type           SELECT    Étude|Chantier
//   Statut phase   SELECT    À venir|En cours|Rendu|Suspendu|Non applicable
//   Date début     DATE
//   Date fin prévue DATE
//   Date fin réelle DATE
//   Validation MO  DATE      (jalon validation maître d'ouvrage)
//   Avancement %   NUMBER    (0–1)
//   Ordre          NUMBER    (1–10, tri Gantt)
//   Observations   RICH_TEXT

function notionPageToPhase(page) {
  const p = page.properties;

  const get = (prop, type) => {
    if (!p[prop]) return null;
    switch (type) {
      case "title":
        return p[prop].title?.map((t) => t.plain_text).join("") || null;
      case "select":
        return p[prop].select?.name || null;
      case "date":
        return p[prop].date?.start || null;
      case "number":
        return p[prop].number ?? null;
      case "text":
        return p[prop].rich_text?.map((t) => t.plain_text).join("") || null;
      case "relation":
        return p[prop].relation?.map((r) => r.id) || [];
      default:
        return null;
    }
  };

  return {
    id:             page.id,
    notionUrl:      page.url,
    nom:            get("Phase",           "title"),
    affaireIds:     get("Affaire",         "relation"),
    codePhase:      get("Code phase",      "select"),
    type:           get("Type",            "select"),
    statut:         get("Statut phase",    "select"),
    dateDebut:      get("Date début",      "date"),
    dateFinPrevue:  get("Date fin prévue", "date"),
    dateFinReelle:  get("Date fin réelle", "date"),
    validationMO:   get("Validation MO",   "date"),
    avancement:     get("Avancement %",    "number"),
    ordre:          get("Ordre",           "number"),
    observations:   get("Observations",   "text"),
    lastEdited:     page.last_edited_time,
  };
}

// Modèle Gantt → propriétés Notion (update partiel)
function phaseToNotionProps(ganttPhase) {
  const props = {};

  if (ganttPhase.nom !== undefined)
    props["Phase"] = { title: [{ text: { content: ganttPhase.nom } }] };

  if (ganttPhase.codePhase !== undefined)
    props["Code phase"] = { select: { name: ganttPhase.codePhase } };

  if (ganttPhase.type !== undefined)
    props["Type"] = { select: { name: ganttPhase.type } };

  if (ganttPhase.statut !== undefined)
    props["Statut phase"] = { select: { name: ganttPhase.statut } };

  if (ganttPhase.dateDebut !== undefined)
    props["Date début"] = ganttPhase.dateDebut
      ? { date: { start: ganttPhase.dateDebut } }
      : { date: null };

  if (ganttPhase.dateFinPrevue !== undefined)
    props["Date fin prévue"] = ganttPhase.dateFinPrevue
      ? { date: { start: ganttPhase.dateFinPrevue } }
      : { date: null };

  if (ganttPhase.dateFinReelle !== undefined)
    props["Date fin réelle"] = ganttPhase.dateFinReelle
      ? { date: { start: ganttPhase.dateFinReelle } }
      : { date: null };

  if (ganttPhase.validationMO !== undefined)
    props["Validation MO"] = ganttPhase.validationMO
      ? { date: { start: ganttPhase.validationMO } }
      : { date: null };

  if (ganttPhase.avancement !== undefined)
    props["Avancement %"] = { number: ganttPhase.avancement };

  if (ganttPhase.ordre !== undefined)
    props["Ordre"] = { number: ganttPhase.ordre };

  if (ganttPhase.observations !== undefined)
    props["Observations"] = {
      rich_text: [{ text: { content: ganttPhase.observations || "" } }],
    };

  return props;
}

// ─── Cache local (snapshots pour détection des changements) ───────────────────

const phaseCache = new Map(); // id → lastEdited string

async function fetchAllPhases(affaireId = null) {
  const filter = affaireId
    ? { property: "Affaire", relation: { contains: affaireId } }
    : undefined;

  const pages = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: PHASES_DB_ID,
      filter,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return pages.map(notionPageToPhase);
}

async function fetchAllAffaires() {
  const pages = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: AFFAIRES_DB_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return pages.map((p) => ({
    id:          p.id,
    notionUrl:   p.url,
    nom:         p.properties["Affaire"]?.title?.map((t) => t.plain_text).join("") || "",
    numero:      p.properties["N° affaire"]?.rich_text?.map((t) => t.plain_text).join("") || "",
    statut:      p.properties["Statut"]?.select?.name || null,
    phaseActive: p.properties["Phase active"]?.select?.name || null,
    lastEdited:  p.last_edited_time,
  }));
}

// ─── WebSocket — broadcast aux clients connectés ──────────────────────────────

const clients = new Set();

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

// ─── Polling — détection des changements Notion ───────────────────────────────

async function pollNotion() {
  try {
    const phases = await fetchAllPhases();
    const changed = [];

    for (const phase of phases) {
      const prev = phaseCache.get(phase.id);
      if (!prev || prev !== phase.lastEdited) {
        phaseCache.set(phase.id, phase.lastEdited);
        if (prev) changed.push(phase); // nouvelle ou modifiée
      }
    }

    // Détection des suppressions
    const currentIds = new Set(phases.map((p) => p.id));
    for (const [id] of phaseCache) {
      if (!currentIds.has(id)) {
        phaseCache.delete(id);
        broadcast("PHASE_DELETED", { id });
      }
    }

    if (changed.length > 0) {
      broadcast("PHASES_UPDATED", { phases: changed });
    }
  } catch (err) {
    console.error("[Poll] Erreur Notion :", err.message);
  }
}

// ─── Express API ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// GET /affaires — toutes les affaires
app.get("/affaires", async (req, res) => {
  try {
    const affaires = await fetchAllAffaires();
    res.json(affaires);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /phases?affaireId=xxx — phases d'une affaire (ou toutes)
app.get("/phases", async (req, res) => {
  try {
    const { affaireId } = req.query;
    const phases = await fetchAllPhases(affaireId || null);
    // Pré-chargement du cache au premier appel
    for (const p of phases) phaseCache.set(p.id, p.lastEdited);
    res.json(phases.sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /phases/:id — mise à jour partielle depuis le Gantt
app.patch("/phases/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const props = phaseToNotionProps(req.body);

    if (Object.keys(props).length === 0)
      return res.status(400).json({ error: "Aucune propriété à mettre à jour." });

    const updated = await notion.pages.update({
      page_id: id,
      properties: props,
    });

    const phase = notionPageToPhase(updated);
    phaseCache.set(phase.id, phase.lastEdited);

    // Broadcast immédiat aux autres clients
    broadcast("PHASES_UPDATED", { phases: [phase] });

    res.json(phase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /phases — créer une nouvelle phase
app.post("/phases", async (req, res) => {
  try {
    const body = req.body;
    const props = phaseToNotionProps(body);

    if (body.affaireId) {
      props["Affaire"] = { relation: [{ id: body.affaireId }] };
    }

    const page = await notion.pages.create({
      parent: { database_id: PHASES_DB_ID },
      properties: props,
    });

    const phase = notionPageToPhase(page);
    phaseCache.set(phase.id, phase.lastEdited);
    broadcast("PHASES_UPDATED", { phases: [phase] });

    res.status(201).json(phase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /phases/:id — archiver (soft delete via statut)
app.delete("/phases/:id", async (req, res) => {
  try {
    await notion.pages.update({
      page_id: req.params.id,
      archived: true,
    });
    phaseCache.delete(req.params.id);
    broadcast("PHASE_DELETED", { id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Démarrage serveur + WebSocket ───────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  clients.add(ws);
  console.log(`[WS] Client connecté (total: ${clients.size})`);

  // Envoi immédiat du snapshot complet à la connexion
  fetchAllPhases()
    .then((phases) => {
      ws.send(JSON.stringify({
        type: "SNAPSHOT",
        payload: { phases: phases.sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)) },
        ts: Date.now(),
      }));
    })
    .catch(console.error);

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client déconnecté (total: ${clients.size})`);
  });

  ws.on("error", (err) => console.error("[WS] Erreur :", err.message));
});

server.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
  console.log(`🔄 Polling Notion toutes les ${POLL_INTERVAL_MS}ms`);
  setInterval(pollNotion, POLL_INTERVAL_MS);
});
