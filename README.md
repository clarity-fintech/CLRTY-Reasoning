# CLRTY-Reasoning (Reasoning-Core)

Node 20 TypeScript service that produces yield strategies grounded in Delta patterns (local JSON mock or Databricks SQL) and optional LLM providers.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health + CLRTY-1 probe summary |
| `POST` | `/v1/strategies/yield` | Body `{ "lookback"?: number }` → strategy grounded in patterns |

## Quick start

```bash
cp .env.example .env
npm install
npm test          # CLRTY_RPC_SMOKE=0
npm run build && npm start
```

Smoke against a live RPC (optional):

```bash
CLRTY_RPC_SMOKE=1 npm run smoke
```

## Configuration

See [`.env.example`](.env.example).

- **Patterns**: defaults to `var/patterns.json`. When `DATABRICKS_HOST` + `DATABRICKS_TOKEN` are set, queries Databricks SQL warehouse.
- **LLM**: `LLM_PROVIDER=openai|anthropic|mock`. Without API keys, always returns a mock strategy grounded in loaded patterns.
- **Txs**: recent txs via CLRTY L1 RPC / API; failures return an empty list (no hard error).

## Scripts

| Script | Action |
|--------|--------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled server |
| `npm test` | Vitest with `CLRTY_RPC_SMOKE=0` |
| `npm run smoke` | CLRTY-1 probe (`CLRTY_RPC_SMOKE=1`) |

## License

Apache-2.0 — see [LICENSE](LICENSE).
