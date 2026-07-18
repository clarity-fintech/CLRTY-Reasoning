import type { YieldPattern } from "./databricks.js";
import type { TxSummary } from "./txs.js";

export type LlmProvider = "openai" | "anthropic" | "mock";

export type YieldStrategy = {
  name: string;
  rationale: string;
  target_apr_bps: number;
  risk_score: number;
  allocations: Array<{ venue: string; weight_bps: number }>;
  grounded_pattern_ids: string[];
  provider: LlmProvider;
  mock: boolean;
};

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const raw = (env.LLM_PROVIDER || "mock").toLowerCase();
  if (raw === "openai" || raw === "anthropic" || raw === "mock") return raw;
  return "mock";
}

function hasKey(provider: LlmProvider, env: NodeJS.ProcessEnv): boolean {
  if (provider === "openai") return Boolean(env.OPENAI_API_KEY);
  if (provider === "anthropic") return Boolean(env.ANTHROPIC_API_KEY);
  return false;
}

function mockStrategy(patterns: YieldPattern[], txs: TxSummary[]): YieldStrategy {
  const ranked = [...patterns].sort((a, b) => a.risk_score - b.risk_score || b.apr_bps - a.apr_bps);
  const primary = ranked[0] || {
    id: "fallback",
    label: "stable_base_yield",
    apr_bps: 400,
    risk_score: 0.3,
    venues: ["clrty_l1_staking"],
    lookback_days: 30,
  };
  const secondary = ranked[1];
  const venues = [...new Set([...(primary.venues || []), ...(secondary?.venues || [])])];
  const weight = venues.length ? Math.floor(10_000 / venues.length) : 10_000;
  const allocations = venues.map((venue, i) => ({
    venue,
    weight_bps: i === venues.length - 1 ? 10_000 - weight * (venues.length - 1) : weight,
  }));

  const txHint =
    txs.length > 0
      ? ` Recent chain activity: ${txs.length} txs (sample ${txs[0]?.hash?.slice(0, 10) || "n/a"}).`
      : " No recent txs available; pattern-only grounding.";

  return {
    name: `mock_${primary.label}`,
    rationale: `Mock strategy grounded in pattern ${primary.id} (${primary.notes || primary.label}).${txHint}`,
    target_apr_bps: primary.apr_bps,
    risk_score: primary.risk_score,
    allocations,
    grounded_pattern_ids: [primary.id, ...(secondary ? [secondary.id] : [])],
    provider: "mock",
    mock: true,
  };
}

async function openaiStrategy(
  patterns: YieldPattern[],
  txs: TxSummary[],
  env: NodeJS.ProcessEnv,
): Promise<YieldStrategy> {
  const key = env.OPENAI_API_KEY!;
  const prompt = buildPrompt(patterns, txs);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are CLRTY Reasoning-Core. Return JSON only with keys: name, rationale, target_apr_bps, risk_score, allocations[{venue,weight_bps}], grounded_pattern_ids.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`openai_http_${res.status}`);
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("openai_empty");
  return normalizeStrategy(JSON.parse(content), "openai", false, patterns);
}

async function anthropicStrategy(
  patterns: YieldPattern[],
  txs: TxSummary[],
  env: NodeJS.ProcessEnv,
): Promise<YieldStrategy> {
  const key = env.ANTHROPIC_API_KEY!;
  const prompt = buildPrompt(patterns, txs);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic_http_${res.status}`);
  const body = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = body.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("anthropic_empty");
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  const slice = jsonStart >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
  return normalizeStrategy(JSON.parse(slice), "anthropic", false, patterns);
}

function buildPrompt(patterns: YieldPattern[], txs: TxSummary[]): string {
  return [
    "Ground a CLRTY yield strategy in these Delta patterns and recent txs.",
    "Patterns JSON:",
    JSON.stringify(patterns.slice(0, 10)),
    "Recent txs JSON:",
    JSON.stringify(txs.slice(0, 20)),
  ].join("\n");
}

function normalizeStrategy(
  raw: Record<string, unknown>,
  provider: LlmProvider,
  mock: boolean,
  patterns: YieldPattern[],
): YieldStrategy {
  const allocations = Array.isArray(raw.allocations)
    ? (raw.allocations as Array<{ venue?: string; weight_bps?: number }>).map((a) => ({
        venue: String(a.venue || "unknown"),
        weight_bps: Number(a.weight_bps) || 0,
      }))
    : mockStrategy(patterns, []).allocations;

  const grounded = Array.isArray(raw.grounded_pattern_ids)
    ? (raw.grounded_pattern_ids as unknown[]).map(String)
    : patterns.slice(0, 2).map((p) => p.id);

  return {
    name: String(raw.name || "llm_strategy"),
    rationale: String(raw.rationale || "LLM strategy grounded in patterns"),
    target_apr_bps: Number(raw.target_apr_bps) || patterns[0]?.apr_bps || 400,
    risk_score: Number(raw.risk_score) || patterns[0]?.risk_score || 0.3,
    allocations,
    grounded_pattern_ids: grounded,
    provider,
    mock,
  };
}

/** Produce a yield strategy. Without provider keys, always returns mock. */
export async function generateYieldStrategy(
  patterns: YieldPattern[],
  txs: TxSummary[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<YieldStrategy> {
  const provider = resolveProvider(env);
  if (provider === "mock" || !hasKey(provider, env)) {
    return mockStrategy(patterns, txs);
  }
  try {
    if (provider === "openai") return await openaiStrategy(patterns, txs, env);
    if (provider === "anthropic") return await anthropicStrategy(patterns, txs, env);
  } catch {
    return mockStrategy(patterns, txs);
  }
  return mockStrategy(patterns, txs);
}
