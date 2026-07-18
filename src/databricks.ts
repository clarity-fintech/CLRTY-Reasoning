import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type YieldPattern = {
  id: string;
  label: string;
  apr_bps: number;
  risk_score: number;
  venues: string[];
  lookback_days: number;
  notes?: string;
};

export type PatternStore = {
  updated_at: string;
  patterns: YieldPattern[];
  source: "local_json" | "databricks_sql";
};

const DEFAULT_PATTERNS: YieldPattern[] = [
  {
    id: "yield_stable_base",
    label: "stable_base_yield",
    apr_bps: 420,
    risk_score: 0.22,
    venues: ["clrty_l1_staking", "usdc_mm"],
    lookback_days: 30,
    notes: "Low-vol base yield from staking + MM inventory",
  },
  {
    id: "yield_vol_harvest",
    label: "volatility_harvest",
    apr_bps: 980,
    risk_score: 0.61,
    venues: ["fx_oracle_arb", "delta_neutral"],
    lookback_days: 14,
    notes: "Harvest short-horizon FX/oracle dislocation",
  },
];

function patternsPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return process.env.CLRTY_PATTERNS_PATH || join(here, "..", "var", "patterns.json");
}

export function databricksConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.DATABRICKS_HOST && env.DATABRICKS_TOKEN);
}

/** Load patterns from local Delta mock (JSON) or Databricks SQL when credentials exist. */
export async function loadPatterns(
  lookbackDays = 30,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PatternStore> {
  if (databricksConfigured(env)) {
    try {
      const remote = await fetchDatabricksPatterns(lookbackDays, env);
      if (remote.patterns.length) return remote;
    } catch {
      /* fall through to local mock */
    }
  }

  const path = patternsPath();
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { updated_at?: string; patterns?: YieldPattern[] };
    const patterns = (parsed.patterns || DEFAULT_PATTERNS).filter(
      (p) => (p.lookback_days || 0) <= lookbackDays || lookbackDays >= 30,
    );
    return {
      updated_at: parsed.updated_at || new Date().toISOString(),
      patterns: patterns.length ? patterns : DEFAULT_PATTERNS,
      source: "local_json",
    };
  } catch {
    await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
    const seed: PatternStore = {
      updated_at: new Date().toISOString(),
      patterns: DEFAULT_PATTERNS,
      source: "local_json",
    };
    await writeFile(path, JSON.stringify(seed, null, 2), "utf8").catch(() => undefined);
    return seed;
  }
}

async function fetchDatabricksPatterns(
  lookbackDays: number,
  env: NodeJS.ProcessEnv,
): Promise<PatternStore> {
  const host = (env.DATABRICKS_HOST || "").replace(/\/$/, "");
  const token = env.DATABRICKS_TOKEN || "";
  const warehouseId = env.DATABRICKS_WAREHOUSE_ID || "";
  const sql = `SELECT id, label, apr_bps, risk_score, venues, lookback_days, notes
FROM clrty.yield_patterns
WHERE lookback_days <= ${Number(lookbackDays)}
ORDER BY apr_bps DESC
LIMIT 50`;

  const res = await fetch(`${host}/api/2.0/sql/statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      warehouse_id: warehouseId,
      statement: sql,
      wait_timeout: "15s",
    }),
  });

  if (!res.ok) {
    throw new Error(`databricks_http_${res.status}`);
  }

  const body = (await res.json()) as {
    result?: { data_array?: unknown[][] };
    status?: { state?: string };
  };

  const rows = body.result?.data_array || [];
  const patterns: YieldPattern[] = rows.map((row) => {
    const venuesRaw = row[4];
    let venues: string[] = [];
    if (typeof venuesRaw === "string") {
      try {
        venues = JSON.parse(venuesRaw) as string[];
      } catch {
        venues = venuesRaw.split(",").map((s) => s.trim()).filter(Boolean);
      }
    } else if (Array.isArray(venuesRaw)) {
      venues = venuesRaw.map(String);
    }
    return {
      id: String(row[0]),
      label: String(row[1]),
      apr_bps: Number(row[2]) || 0,
      risk_score: Number(row[3]) || 0,
      venues,
      lookback_days: Number(row[5]) || lookbackDays,
      notes: row[6] != null ? String(row[6]) : undefined,
    };
  });

  return {
    updated_at: new Date().toISOString(),
    patterns,
    source: "databricks_sql",
  };
}
