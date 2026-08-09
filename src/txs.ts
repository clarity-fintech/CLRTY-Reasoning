import { jsonRpc, loadClrty1Config, type Clrty1Config } from "./clrty1.js";

export type TxSummary = {
  hash: string;
  height?: number | string;
  from?: string;
  to?: string;
  value?: string;
  source: string;
};

/** Fetch recent txs via RPC/API. Gracefully returns [] on any failure. */
export async function fetchRecentTxs(
  limit = 20,
  cfg: Clrty1Config = loadClrty1Config(),
): Promise<TxSummary[]> {
  try {
    const fromRpc = await fetchViaRpc(cfg, limit);
    if (fromRpc.length) return fromRpc;
  } catch {
    /* continue */
  }

  try {
    const fromApi = await fetchViaApi(cfg, limit);
    if (fromApi.length) return fromApi;
  } catch {
    /* continue */
  }

  return [];
}

async function fetchViaRpc(cfg: Clrty1Config, limit: number): Promise<TxSummary[]> {
  const tip = await jsonRpc<string>(cfg.rpcUrl, "clrty_blockNumber");
  if (!tip.ok || tip.data == null) return [];
  return fetchBlockTxs(cfg, tip.data, limit);
}

async function fetchBlockTxs(
  cfg: Clrty1Config,
  blockTag: string,
  limit: number,
): Promise<TxSummary[]> {
  const block = await jsonRpc<{
    number?: string;
    transactions?: Array<string | { hash?: string; from?: string; to?: string; value?: string }>;
  }>(cfg.rpcUrl, "eth_getBlockByNumber", [blockTag, true]);

  if (!block.ok || !block.data?.transactions) return [];

  const out: TxSummary[] = [];
  for (const tx of block.data.transactions) {
    if (typeof tx === "string") {
      out.push({ hash: tx, height: block.data.number, source: "rpc" });
    } else if (tx?.hash) {
      out.push({
        hash: tx.hash,
        height: block.data.number,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        source: "rpc",
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchViaApi(cfg: Clrty1Config, limit: number): Promise<TxSummary[]> {
  const base = cfg.apiBase.replace(/\/$/, "");
  const urls = [
    `${base}/v1/txs?limit=${limit}`,
    `${base}/cosmos/tx/v1beta1/txs?pagination.limit=${limit}&order_by=ORDER_BY_DESC`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const body = (await res.json()) as Record<string, unknown>;
      const txs = normalizeApiTxs(body);
      if (txs.length) return txs.slice(0, limit);
    } catch {
      /* try next */
    }
  }
  return [];
}

function normalizeApiTxs(body: Record<string, unknown>): TxSummary[] {
  if (Array.isArray(body.txs)) {
    return (body.txs as Array<Record<string, unknown>>).map((t) => ({
      hash: String(t.hash || t.txhash || t.id || ""),
      height: (t.height as number | string | undefined) ?? undefined,
      from: t.from != null ? String(t.from) : undefined,
      to: t.to != null ? String(t.to) : undefined,
      value: t.value != null ? String(t.value) : undefined,
      source: "api",
    })).filter((t) => t.hash);
  }

  if (Array.isArray(body.tx_responses)) {
    return (body.tx_responses as Array<Record<string, unknown>>).map((t) => ({
      hash: String(t.txhash || t.hash || ""),
      height: t.height != null ? String(t.height) : undefined,
      source: "api",
    })).filter((t) => t.hash);
  }

  return [];
}
