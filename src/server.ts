import express from "express";
import { loadClrty1Config, probeClrty1, rpcSmokeEnabled } from "./clrty1.js";
import { databricksConfigured, loadPatterns } from "./databricks.js";
import { generateYieldStrategy, resolveProvider } from "./llm.js";
import { fetchRecentTxs } from "./txs.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", async (_req, res) => {
    const cfg = loadClrty1Config();
    const probe = await probeClrty1(cfg);
    res.status(200).json({
      ok: true,
      service: "CLRTY-Reasoning",
      llm_provider: resolveProvider(),
      databricks: databricksConfigured() ? "configured" : "local_json",
      clrty1: {
        ok: probe.ok,
        chainId: probe.chainId,
        tipHeight: probe.tipHeight,
        rpcUrl: probe.rpcUrl,
        source: probe.source,
        error: probe.error,
      },
    });
  });

  app.post("/v1/strategies/yield", async (req, res) => {
    try {
      const lookback = Number(req.body?.lookback ?? req.body?.lookback_days ?? 30);
      const lookbackDays = Number.isFinite(lookback) && lookback > 0 ? lookback : 30;
      const store = await loadPatterns(lookbackDays);
      const txs = await fetchRecentTxs(20);
      const strategy = await generateYieldStrategy(store.patterns, txs);
      res.status(200).json({
        ok: true,
        lookback_days: lookbackDays,
        patterns_source: store.source,
        patterns_count: store.patterns.length,
        txs_count: txs.length,
        strategy,
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  return app;
}

async function runSmoke(): Promise<number> {
  const cfg = loadClrty1Config();
  const probe = await probeClrty1(cfg);
  console.log(JSON.stringify({ smoke: "clrty1", ...probe }, null, 2));
  if (!rpcSmokeEnabled()) {
    console.log("CLRTY_RPC_SMOKE=0 — skipping hard fail");
    return 0;
  }
  return probe.ok ? 0 : 1;
}

async function main() {
  if (process.argv.includes("--smoke")) {
    process.exit(await runSmoke());
  }

  const port = Number(process.env.PORT || 8787);
  const app = createApp();
  app.listen(port, () => {
    console.log(`CLRTY-Reasoning listening on :${port}`);
  });
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
