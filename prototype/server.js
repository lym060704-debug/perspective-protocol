#!/usr/bin/env bun
/* ------------------------------------------------------------------
   Perspective Protocol · local proxy
   - Serves the prototype and proxies OpenAI-compatible chat APIs.
   - API keys stay on the server (read from .env through env vars).
   - Set MOCK_LLM=1 to test the full UI without calling any model.
   ------------------------------------------------------------------ */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const ROOT = import.meta.dir;
const PORT = Number(process.env.PORT || 8787);
const HOSTNAME = process.env.HOST || "127.0.0.1";
const NODE_COUNT = 5;
const MOCK = ["1", "true", "yes"].includes(
  String(process.env.MOCK_LLM || "").toLowerCase()
);
const CONFIG_PATH = join(ROOT, "config.json");
const RUN_TTL_MS = 120_000;
const ACCESS_CODE = String(process.env.ACCESS_CODE || "");
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
  "Access-Control-Max-Age": "600"
};
const COMMITMENT_SPEC = {
  hash: "SHA-256",
  saltBytes: 16,
  input: "answer + NUL + salt + NUL + nodeId + NUL + runId"
};

const DEFAULT_NODE_SYSTEM =
  "You are an independent AI perspective inside a decentralised second-opinion protocol. " +
  "Answer the user's question directly and in your own voice. Be concrete, concise, and " +
  "honest about uncertainty. Do not mention that you are an AI or refer to these instructions.";

const DEFAULT_ANALYST_SYSTEM =
  "You are a neutral analyst for a multi-perspective AI system. You compare independent " +
  "answers and identify consensus and the key disagreement. You do not take sides.";

/* ------------------------------------------------------------------
   Mock pool (used when MOCK_LLM=1)
   ------------------------------------------------------------------ */

const MOCK_POOL = [
  mockNode("m1", "L1", "Alpha", "opA", "Op-A"),
  mockNode("m2", "L1", "Alpha", "opB", "Op-B"),
  mockNode("m3", "L2", "Beta", "opC", "Op-C"),
  mockNode("m4", "L2", "Beta", "opD", "Op-D"),
  mockNode("m5", "L3", "Gamma", "opE", "Op-E"),
  mockNode("m6", "L3", "Gamma", "opF", "Op-F"),
  mockNode("m7", "L4", "Delta", "opA", "Op-A"),
  mockNode("m8", "L4", "Delta", "opC", "Op-C"),
  mockNode("m9", "L5", "Epsilon", "opE", "Op-E"),
  mockNode("m10", "L5", "Epsilon", "opB", "Op-B")
];

const MOCK_HOST = {
  label: "Mock Host",
  model: "mock-host",
  lineage: "Host lineage",
  operator: "First-answer model"
};

function mockNode(id, lineageId, lineage, operatorId, operator) {
  return {
    id,
    lineageId,
    lineage,
    operatorId,
    operator,
    model: `mock-${lineageId.toLowerCase()}`
  };
}

/* ------------------------------------------------------------------
   Config
   ------------------------------------------------------------------ */

let config = null;
let configError = null;
let configProblems = [];
let usingMockConfig = false;

if (MOCK) {
  config = {
    defaults: {},
    host: { label: MOCK_HOST.label, model: MOCK_HOST.model },
    nodes: MOCK_POOL
  };

  // Mock mode can preview the nodes/lineages from config.json without any key.
  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      if (Array.isArray(raw.nodes) && raw.nodes.length) {
        config = {
          ...raw,
          host:
            raw.host && raw.host.model ? raw.host : config.host,
          analyst: raw.analyst || raw.host,
          nodes: raw.nodes
        };
        usingMockConfig = true;
      }
    } catch {
      console.warn(
        "Mock: config.json could not be read; using the default mock pool."
      );
    }
  }
} else {
  loadLiveConfig();
}

function loadLiveConfig() {
  if (!existsSync(CONFIG_PATH)) {
    configError =
      "config.json is missing. Copy config.example.json to config.json and fill in the model and API-key environment names.";
    return;
  }

  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    const problems = [];

    if (!raw.host || !raw.host.model) problems.push("host.model is missing");
    if (!Array.isArray(raw.nodes) || raw.nodes.length < 2) {
      problems.push("nodes requires at least 2 nodes");
    }

    const ids = new Set();
    const allSections = [];

    if (raw.host) allSections.push({ name: "host", section: raw.host });
    if (raw.analyst) allSections.push({ name: "analyst", section: raw.analyst });
    (raw.nodes || []).forEach((node, index) => {
      allSections.push({ name: `nodes[${index}]`, section: node });
      if (!node.id) problems.push(`nodes[${index}].id is missing`);
      if (node.id && ids.has(node.id)) problems.push(`Duplicate node id: ${node.id}`);
      if (node.id) ids.add(node.id);
      if (!node.model) problems.push(`Node ${node.id || index} is missing model`);
      if (!node.lineageId) problems.push(`Node ${node.id || index} is missing lineageId`);
      if (!node.lineage) problems.push(`Node ${node.id || index} is missing lineage`);
      if (!node.operatorId) problems.push(`Node ${node.id || index} is missing operatorId`);
      if (!node.operator) problems.push(`Node ${node.id || index} is missing operator`);
    });

    for (const { name, section } of allSections) {
      const merged = mergeSection(raw, section);
      if (!merged.baseUrl) problems.push(`${name}.baseUrl is missing (set it in defaults)`);
      if (!merged.model) problems.push(`${name}.model is missing`);
      if (String(merged.model || "").includes("REPLACE")) {
        problems.push(`${name}.model is still a placeholder`);
      }
      if (merged.apiKeyEnv && !process.env[merged.apiKeyEnv]) {
        problems.push(`Missing environment variable ${merged.apiKeyEnv}`);
      }
    }

    if (problems.length) {
      configError = problems.join("; ");
      configProblems = problems;
    }

    config = raw;
    console.log(
      `Config loaded: ${raw.nodes.length} nodes · ${new Set(raw.nodes.map((node) => node.lineageId)).size} lineages`
    );
  } catch (error) {
    configError = `Failed to read config.json: ${error.message}`;
  }
}

function mergeSection(raw, section) {
  const defaults = raw.defaults || {};
  return {
    ...defaults,
    ...section,
    headers: {
      ...(defaults.headers || {}),
      ...(section?.headers || {})
    }
  };
}

function nodeConfig(node) {
  return mergeSection(config, node);
}

function hostConfig() {
  return mergeSection(config, config.host);
}

function analystConfig() {
  return mergeSection(config, config.analyst || config.host);
}

function isReady() {
  return MOCK || (config !== null && configProblems.length === 0);
}

function readyError() {
  return (
    configError ||
    "Models are not configured. Fill in config.json and .env, or use MOCK_LLM=1 to test the UI."
  );
}

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hashHex(text) {
  return createHash("sha256").update(text).digest("hex");
}

function shortHash(hex, head = 8, tail = 6) {
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function addrFor(node) {
  const digest = hashHex(`${node.id}:${node.model}`);
  return `0x${digest.slice(0, 2).toUpperCase()}…${digest.slice(-2).toUpperCase()}`;
}

function publicNode(node) {
  return {
    id: node.id,
    addr: addrFor(node),
    lineageId: node.lineageId,
    lineage: node.lineage,
    operatorId: node.operatorId,
    operator: node.operator,
    model: node.model
  };
}

function publicHost() {
  const host = config?.host || (MOCK ? MOCK_HOST : {});
  const model = host.model || (MOCK ? MOCK_HOST.model : "host");

  return {
    addr: addrFor({ id: "host", model }),
    label: host.label || (MOCK ? MOCK_HOST.label : "First-answer model"),
    lineage: host.lineage || (MOCK ? MOCK_HOST.lineage : "Host lineage"),
    operator: host.operator || (MOCK ? MOCK_HOST.operator : "First-answer model"),
    model
  };
}

function pool() {
  const nodes = MOCK
    ? config?.nodes || MOCK_POOL
    : config?.nodes || [];

  return nodes.filter(
    (node) => node.id && node.lineageId && node.operatorId
  );
}

function lineageCount(nodes = pool()) {
  return new Set(nodes.map((node) => node.lineageId)).size;
}

function operatorCount(nodes = pool()) {
  return new Set(nodes.map((node) => node.operatorId)).size;
}

function randomSeed() {
  return randomBytes(4).readUInt32BE(0);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, random) {
  const copy = list.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function selectNodes(seed, count) {
  const random = mulberry32(seed);
  const byLineage = new Map();

  pool().forEach((node) => {
    if (!byLineage.has(node.lineageId)) byLineage.set(node.lineageId, []);
    byLineage.get(node.lineageId).push(node);
  });

  const groups = shuffle(
    Array.from(byLineage.entries()).map(([lineageId, nodes]) => ({
      lineageId,
      nodes
    })),
    random
  );

  const target = Math.min(count, groups.length);
  const chosenGroups = groups.slice(0, target);
  const picked = new Array(chosenGroups.length).fill(null);
  const usedOperators = new Set();

  function backtrack(index) {
    if (index === chosenGroups.length) return true;

    const candidates = shuffle(chosenGroups[index].nodes, random);
    for (const node of candidates) {
      if (usedOperators.has(node.operatorId)) continue;

      usedOperators.add(node.operatorId);
      picked[index] = node;

      if (backtrack(index + 1)) return true;

      usedOperators.delete(node.operatorId);
      picked[index] = null;
    }
    return false;
  }

  let relaxed = false;
  if (!backtrack(0)) {
    relaxed = true;
    usedOperators.clear();
    chosenGroups.forEach((group, index) => {
      const candidates = shuffle(group.nodes, random).sort((a, b) => {
        return (
          Number(usedOperators.has(a.operatorId)) -
          Number(usedOperators.has(b.operatorId))
        );
      });
      picked[index] = candidates[0];
      usedOperators.add(candidates[0].operatorId);
    });
  }

  const nodes = picked.filter(Boolean);
  const selectedIds = new Set(nodes.map((node) => node.id));
  const fillOperators = new Set(
    nodes.map((node) => node.operatorId)
  );
  let fillRelaxed = false;

  // Low-diversity fallback: fill extra nodes from existing lineages when the
  // config explicitly allows it. The UI labels these runs as low-diversity.
  if (config?.allowSameLineage && nodes.length < count) {
    const candidates = shuffle(
      pool().filter((node) => !selectedIds.has(node.id)),
      random
    );

    for (const node of candidates) {
      if (nodes.length >= count) break;
      if (fillOperators.has(node.operatorId)) continue;
      nodes.push(node);
      selectedIds.add(node.id);
      fillOperators.add(node.operatorId);
    }

    if (nodes.length < count) {
      fillRelaxed = true;
      for (const node of candidates) {
        if (nodes.length >= count) break;
        if (selectedIds.has(node.id)) continue;
        nodes.push(node);
        selectedIds.add(node.id);
      }
    }
  }

  const lineageTotal = new Set(
    nodes.map((node) => node.lineageId)
  ).size;

  return {
    nodes,
    relaxed: relaxed || fillRelaxed,
    requested: count,
    shortfall: Math.max(0, count - nodes.length),
    lineages: lineageTotal,
    operators: new Set(nodes.map((node) => node.operatorId)).size,
    lowDiversity: lineageTotal < count
  };
}

/* ------------------------------------------------------------------
   Model calls
   ------------------------------------------------------------------ */

async function callChat(section, { system, user, temperature, maxTokens, timeoutMs }) {
  const envName = section.apiKeyEnv;
  const apiKey = envName ? process.env[envName] : null;

  if (envName && !apiKey) {
    throw new Error(`Missing environment variable ${envName}`);
  }

  const baseUrl = String(section.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("baseUrl is not configured");

  const headers = {
    "Content-Type": "application/json",
    ...(section.headers || {})
  };

  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model: section.model,
    messages: [
      { role: "system", content: system || DEFAULT_NODE_SYSTEM },
      { role: "user", content: user }
    ],
    max_tokens: maxTokens || section.maxTokens || 600,
    ...(section.extraBody || {})
  };

  if (temperature !== null && temperature !== undefined) {
    body.temperature = temperature;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs || section.timeoutMs || 45_000)
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Model ${section.model} returned HTTP ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) return content.trim();

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("")
      .trim();
    if (joined) return joined;
  }

  throw new Error(`Model ${section.model} returned no text content`);
}

function mockHostAnswer(question) {
  return (
    `(Mock first answer) For “${truncate(question, 60)}”, a direct answer is: ` +
    "it depends on whether you prioritise goals, cost or long-term risk. " +
    "If efficiency comes first, the conclusion leans one way; if fairness or long-term resilience comes first, it may reverse."
  );
}

function mockNodeAnswer(question, node, mode, firstAnswer) {
  const angles = {
    L1: "goals and cost",
    L2: "risk and long-term effects",
    L3: "individual differences and context",
    L4: "evidence strength and verifiability",
    L5: "implementation order and governance"
  };
  const angle = angles[node.lineageId] || "different constraints";
  const base =
    `(Mock answer · ${node.lineage}) For “${truncate(question, 50)}”, ` +
    `from the perspective of ${angle}: there is no answer that fits every context; ` +
    "you need to state the premises first, then compare costs and benefits.";

  if (mode === "nonblind") {
    return (
      `(Mock · non-blind) The first answer points toward “${truncate(firstAnswer, 46)}”. ` +
      `I partly agree, but it misses contextual differences; a more careful judgment should preserve the conditions. ${base}`
    );
  }

  return base;
}

function mockAnalysis(question, answers) {
  return {
    consensus: [
      "（Mock analysis）Most perspectives agree that the conclusion depends on premises and constraints",
      "（Mock analysis）No single answer covers every context"
    ],
    cruxTitle: "（Mock）Key disagreement: how to weigh costs and benefits",
    cruxBody:
      "（Mock）Nodes weight risk appetite, evidence requirements and implementation order differently. This is server-generated mock text, not a real model analysis.",
    note: "Server mock mode; no real model was called."
  };
}

function truncate(text, length) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------
   Run storage (commitments first, answers on reveal)
   ------------------------------------------------------------------ */

const runs = new Map();

function commitmentMaterial(text, salt, nodeId, runId) {
  return [text, salt, nodeId, runId].join(String.fromCharCode(0));
}

function storeRun(question, mode, results) {
  const runId = randomUUID();
  const commitments = {};

  const answers = results.map((result) => {
    const text = result.text || "";
    const base = {
      nodeId: result.node.id,
      text,
      error: result.error || null,
      ms: result.ms
    };

    if (!text) {
      return { ...base, salt: null, commitment: null };
    }

    // Salt prevents offline dictionary / rainbow-table recovery of short
    // answers from the commitment. nodeId + runId bind it to this request.
    const salt = randomBytes(16).toString("hex");
    const commitment = hashHex(
      commitmentMaterial(text, salt, result.node.id, runId)
    );
    commitments[result.node.id] = commitment;

    return { ...base, salt, commitment };
  });

  runs.set(runId, {
    runId,
    question,
    mode,
    answers,
    commitments,
    createdAt: Date.now()
  });

  setTimeout(() => runs.delete(runId), RUN_TTL_MS);
  return { runId, answers, commitments };
}

/* ------------------------------------------------------------------
   HTTP helpers
   ------------------------------------------------------------------ */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS
    }
  });
}

function fail(status, message) {
  return json({ ok: false, error: message }, status);
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 200_000) throw new Error("Request body is too large");

  try {
    return await request.json();
  } catch {
    throw new Error("Request body is not valid JSON");
  }
}

function validateQuestion(value) {
  const question = String(value || "").trim();
  if (question.length < 3) throw new Error("Question is too short");
  if (question.length > 2000) throw new Error("Question cannot exceed 2,000 characters");
  return question;
}

/* ------------------------------------------------------------------
   API
   ------------------------------------------------------------------ */

async function handleApi(request, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (ACCESS_CODE && request.headers.get("x-access-code") !== ACCESS_CODE) {
    return fail(401, "Unauthorized");
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    const nodes = pool();
    return json({
      ok: true,
      version: 1,
      mode: MOCK ? "mock" : "live",
      mock: MOCK,
      configured: isReady(),
      configError: isReady() ? null : readyError(),
      host: publicHost(),
      nodeCount: nodes.length,
      lineageCount: lineageCount(nodes),
      operatorCount: operatorCount(nodes)
    });
  }

  if (url.pathname === "/api/nodes" && request.method === "GET") {
    const nodes = pool();
    return json({
      ok: true,
      mode: MOCK ? "mock" : "live",
      mock: MOCK,
      configured: isReady(),
      configError: isReady() ? null : readyError(),
      nodes: nodes.map(publicNode),
      host: publicHost()
    });
  }

  // Debug / test endpoint: inspect selection without calling any model.
  if (url.pathname === "/api/select" && request.method === "GET") {
    const rawSeed = Number(url.searchParams.get("seed"));
    const seed = Number.isFinite(rawSeed)
      ? rawSeed >>> 0
      : randomSeed();
    const selection = selectNodes(seed, NODE_COUNT);

    return json({
      ok: true,
      seed,
      mock: MOCK,
      selected: selection.nodes.map(publicNode),
      diversity: {
        requested: selection.requested,
        selected: selection.nodes.length,
        shortfall: selection.shortfall,
        relaxed: selection.relaxed,
        lineages: selection.lineages,
        operators: selection.operators,
        lowDiversity: selection.lowDiversity
      }
    });
  }

  if (url.pathname === "/api/first-answer" && request.method === "POST") {
    const body = await readJson(request);
    const question = validateQuestion(body.question);

    if (!isReady()) return fail(503, readyError());

    const startedAt = Date.now();

    if (MOCK) {
      await sleep(450);
      return json({
        ok: true,
        answer: mockHostAnswer(question),
        model: config?.host?.model || MOCK_HOST.model,
        mock: true,
        ms: Date.now() - startedAt
      });
    }

    const section = hostConfig();
    const answer = await callChat(section, {
      system:
        section.system ||
        "You are the first AI answer in a conversation. Answer the user's question directly, " +
          "concisely, and with a clear position. Do not mention being an AI.",
      user: `Question:\n${question}\n\nGive your best first answer.`,
      temperature: section.temperature ?? 0.5,
      maxTokens: section.maxTokens ?? 500
    });

    return json({
      ok: true,
      answer,
      model: section.model,
      mock: false,
      ms: Date.now() - startedAt
    });
  }

  if (url.pathname === "/api/perspectives" && request.method === "POST") {
    const body = await readJson(request);
    const question = validateQuestion(body.question);
    const mode = body.mode === "nonblind" ? "nonblind" : "blind";
    const firstAnswer = String(body.firstAnswer || "").trim();
    const seed = Number.isFinite(Number(body.seed))
      ? Number(body.seed) >>> 0
      : randomSeed();

    if (mode === "nonblind" && !firstAnswer) {
      return fail(400, "Non-blind comparison requires firstAnswer");
    }
    if (!isReady()) return fail(503, readyError());

    const selection = selectNodes(seed, NODE_COUNT);
    if (!selection.nodes.length) return fail(503, "No usable nodes");

    const startedAt = Date.now();

    const results = await Promise.all(
      selection.nodes.map(async (node) => {
        const nodeStart = Date.now();

        try {
          let text;

          if (MOCK) {
            await sleep(250 + (hashHex(node.id).charCodeAt(0) % 400));
            text = mockNodeAnswer(question, node, mode, firstAnswer);
          } else {
            const section = nodeConfig(node);
            const prompt =
              mode === "nonblind"
                ? `Question:\n${question}\n\nA first AI answered:\n"""\n${firstAnswer}\n"""\n\n` +
                  "Give your independent perspective. Where do you agree or disagree with the first answer, and why? " +
                  "Do not simply repeat it."
                : `Question:\n${question}\n\nGive your independent answer. Do not assume that any other answer exists.`;

            text = await callChat(section, {
              system: section.system || DEFAULT_NODE_SYSTEM,
              user: prompt,
              temperature: section.temperature ?? 0.7,
              maxTokens: section.maxTokens ?? 600
            });
          }

          return {
            node,
            text,
            error: null,
            ms: Date.now() - nodeStart
          };
        } catch (error) {
          return {
            node,
            text: "",
            error: truncate(error.message, 300),
            ms: Date.now() - nodeStart
          };
        }
      })
    );

    const stored = storeRun(question, mode, results);
    const errors = {};
    results.forEach((result) => {
      if (result.error) errors[result.node.id] = result.error;
    });

    return json({
      ok: true,
      runId: stored.runId,
      seed,
      mode,
      mock: MOCK,
      selected: selection.nodes.map(publicNode),
      commitments: stored.commitments,
      commitmentSpec: COMMITMENT_SPEC,
      errors,
      diversity: {
        requested: selection.requested,
        selected: selection.nodes.length,
        shortfall: selection.shortfall,
        relaxed: selection.relaxed,
        lineages: selection.lineages,
        operators: selection.operators,
        lowDiversity: selection.lowDiversity
      },
      ms: Date.now() - startedAt,
      note:
        "Live mode: blind prompts are constructed by the local proxy; commitments are salted SHA-256 bound to nodeId + runId; on-chain timing remains simulated."
    });
  }

  if (url.pathname === "/api/reveal" && request.method === "POST") {
    const body = await readJson(request);
    const runId = String(body.runId || "");
    const run = runs.get(runId);

    if (!run) return fail(404, "This run does not exist or has expired; run it again");

    runs.delete(runId);
    return json({
      ok: true,
      runId: run.runId,
      mode: run.mode,
      mock: MOCK,
      commitmentSpec: COMMITMENT_SPEC,
      answers: run.answers
    });
  }

  if (url.pathname === "/api/analyze" && request.method === "POST") {
    const body = await readJson(request);
    const question = validateQuestion(body.question);
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, 10) : [];

    if (!answers.length) return fail(400, "No answers to analyze");
    if (!isReady()) return fail(503, readyError());

    const valid = answers.filter(
      (answer) => typeof answer.text === "string" && answer.text.trim()
    );
    if (!valid.length) {
      return json({
        ok: true,
        consensus: ["No node returned a usable answer."],
        cruxTitle: "No content to analyze",
        cruxBody: "Check the model configuration or retry.",
        note: "No successful answers.",
        mock: MOCK
      });
    }

    if (MOCK) {
      await sleep(350);
      return json({ ok: true, ...mockAnalysis(question, valid), mock: true });
    }

    const section = analystConfig();
    const numbered = valid
      .map((answer, index) => {
        const node = pool().find((item) => item.id === answer.nodeId);
        const meta = node ? `${node.lineage} · ${node.operator}` : answer.nodeId;
        return `[${index + 1}] (${meta})\n${truncate(answer.text, 1800)}`;
      })
      .join("\n\n");

    const user =
      `Question:\n${question}\n\nIndependent answers:\n${numbered}\n\n` +
      "Return ONLY a JSON object with this shape:\n" +
      '{"consensus":["..."],"cruxTitle":"...","cruxBody":"..."}\n' +
      "Rules: consensus = 1-3 short points most answers agree on; cruxTitle = the single most " +
      "important disagreement, short; cruxBody = 1-2 sentences explaining it. Do not take sides. " +
      "Use the same language as the question. No markdown fences.";

    const raw = await callChat(section, {
      system: section.system || DEFAULT_ANALYST_SYSTEM,
      user,
      temperature: section.temperature ?? 0.2,
      maxTokens: section.maxTokens ?? 500
    });

    const parsed = parseJsonObject(raw);
    if (!parsed || !Array.isArray(parsed.consensus)) {
      return json({
        ok: true,
        consensus: ["The analyst model returned unparseable JSON."],
        cruxTitle: "Could not generate a key disagreement",
        cruxBody: "Read the node answers above directly.",
        note: "Analysis format could not be parsed.",
        mock: false
      });
    }

    return json({
      ok: true,
      consensus: parsed.consensus
        .filter((item) => typeof item === "string")
        .slice(0, 3),
      cruxTitle:
        typeof parsed.cruxTitle === "string" ? parsed.cruxTitle : "Key disagreement",
      cruxBody:
        typeof parsed.cruxBody === "string" ? parsed.cruxBody : "",
      note: "Generated by the analyst model; may contain bias.",
      mock: false
    });
  }

  return fail(404, "API not found");
}

/* ------------------------------------------------------------------
   Static files
   ------------------------------------------------------------------ */

const STATIC_FILES = new Set(["/index.html", "/styles.css", "/app.js"]);
const DOC_FILES = new Set([
  "/perspective-protocol-whitepaper-zh-CN.md",
  "/perspective-protocol-whitepaper.md"
]);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

async function handleStatic(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!STATIC_FILES.has(pathname) && !DOC_FILES.has(pathname)) {
    return new Response("Not Found", { status: 404 });
  }

  const filePath = DOC_FILES.has(pathname)
    ? join(ROOT, "..", pathname.slice(1))
    : join(ROOT, pathname.slice(1));
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  const extension = pathname.slice(pathname.lastIndexOf("."));
  return new Response(file, {
    headers: {
      "Content-Type": MIME[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    }
  });
}

/* ------------------------------------------------------------------
   Server
   ------------------------------------------------------------------ */

const server = Bun.serve({
  hostname: HOSTNAME,
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const startedAt = Date.now();

    try {
      if (url.pathname.startsWith("/api/")) {
        const response = await handleApi(request, url);
        console.log(
          `${request.method} ${url.pathname} ${response.status} ${Date.now() - startedAt}ms`
        );
        return response;
      }

      return await handleStatic(request, url);
    } catch (error) {
      console.error(
        `${request.method} ${url.pathname} error:`,
        truncate(error.message, 300)
      );
      return fail(500, truncate(error.message, 300));
    }
  }
});

function lanUrls() {
  const urls = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${PORT}`);
      }
    }
  }
  return urls;
}

const bindsAll = HOSTNAME === "0.0.0.0" || HOSTNAME === "::";
const localUrl = `http://127.0.0.1:${PORT}`;

console.log("");
console.log(`Perspective Protocol server: ${localUrl}`);
if (bindsAll) {
  const urls = lanUrls();
  if (urls.length) {
    console.log("LAN URLs:");
    for (const url of urls) {
      console.log(`  ${url}`);
    }
  } else {
    console.log(
      "LAN sharing: bound to all interfaces, but no non-internal IPv4 address was found."
    );
  }
} else if (HOSTNAME !== "127.0.0.1" && HOSTNAME !== "localhost") {
  console.log(`Bound to: http://${HOSTNAME}:${PORT}`);
}
console.log(
  MOCK
    ? "Mode: MOCK — no real model calls; the UI is fully testable."
    : `Mode: LIVE — ${pool().length} nodes · ${lineageCount()} lineages`
);
if (MOCK && usingMockConfig) {
  console.log("Mock: using node pool from config.json");
}
if (config?.allowSameLineage) {
  console.log(
    "Config: allowSameLineage=true — runs may be labeled low-diversity."
  );
}
if (!MOCK && !isReady()) {
  console.log(`Config: ${readyError()}`);
} else if (!MOCK) {
  console.log("Config: ready");
}
if (bindsAll && !MOCK) {
  console.log(
    "WARNING: sharing this live proxy exposes your API key quota to anyone who can reach the port. There is no login or rate limit."
  );
}
console.log("Open the URL above. API keys stay in this process only.");
console.log("");
