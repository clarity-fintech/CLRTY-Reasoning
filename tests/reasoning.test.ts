import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";
import { loadPatterns } from "../src/databricks.js";
import { generateYieldStrategy, resolveProvider } from "../src/llm.js";
import { fetchRecentTxs } from "../src/txs.js";
import { loadClrty1Config, rpcSmokeEnabled } from "../src/clrty1.js";

describe("CLRTY-Reasoning", () => {
  beforeAll(() => {
    process.env.CLRTY_RPC_SMOKE = "0";
    process.env.LLM_PROVIDER = "mock";
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DATABRICKS_HOST;
    delete process.env.DATABRICKS_TOKEN;
  });

  it("disables RPC smoke in tests", () => {
    expect(rpcSmokeEnabled()).toBe(false);
  });

  it("loads local pattern store", async () => {
    const store = await loadPatterns(30);
    expect(store.source).toBe("local_json");
    expect(store.patterns.length).toBeGreaterThan(0);
  });

  it("returns mock strategy without LLM keys", async () => {
    expect(resolveProvider()).toBe("mock");
    const store = await loadPatterns(30);
    const strategy = await generateYieldStrategy(store.patterns, []);
    expect(strategy.mock).toBe(true);
    expect(strategy.grounded_pattern_ids.length).toBeGreaterThan(0);
    expect(strategy.allocations.length).toBeGreaterThan(0);
  });

  it("fetchRecentTxs fails closed to empty array", async () => {
    const cfg = loadClrty1Config({
      ...process.env,
      CLRTY_L1_RPC: "http://127.0.0.1:9",
      CLRTY_API_BASE: "http://127.0.0.1:9",
    });
    const txs = await fetchRecentTxs(5, cfg);
    expect(Array.isArray(txs)).toBe(true);
    expect(txs.length).toBe(0);
  });

  it("GET /health and POST /v1/strategies/yield", async () => {
    const app = createApp();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    try {
      const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
      expect(healthRes.status).toBe(200);
      const health = (await healthRes.json()) as {
        ok: boolean;
        service: string;
        clrty1: { chainId: string };
      };
      expect(health.ok).toBe(true);
      expect(health.service).toBe("CLRTY-Reasoning");
      expect(health.clrty1.chainId).toBeTruthy();

      const stratRes = await fetch(`http://127.0.0.1:${port}/v1/strategies/yield`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookback: 30 }),
      });
      expect(stratRes.status).toBe(200);
      const body = (await stratRes.json()) as {
        ok: boolean;
        strategy: { mock: boolean; name: string };
      };
      expect(body.ok).toBe(true);
      expect(body.strategy.mock).toBe(true);
      expect(body.strategy.name).toBeTruthy();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
