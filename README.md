# CLRTY-Reasoning

> CLRTY Reasoning-Core — yield strategy service grounded in Delta patterns + LLM  
> **CLRTY-1** (chain **1202**) service · TypeScript/Node · Creator **Chandler William Ferguson**  
> Org [`clarity-fintech/CLRTY-Reasoning`](https://github.com/clarity-fintech/CLRTY-Reasoning) · package `@clarity-fintech/clrty-reasoning`

This repository is **self-contained and downloadable**: clone it, install once, and it
builds, tests, and runs against CLRTY-1 with the scripts documented below.

---

## Contents

- [What this is](#what-this-is)
- [Quickstart](#quickstart)
- [Command reference](#command-reference)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [HTTP surface](#http-surface)
- [Testing](#testing)
- [CLRTY-1 integration](#clrty-1-integration)
- [Security](#security)
- [MIS kernel binding](#mis-kernel-binding)
- [Backlinks](#backlinks)

## What this is

**CLRTY-Reasoning** — CLRTY Reasoning-Core — yield strategy service grounded in Delta patterns + LLM

- Language: **TypeScript** (ES modules), entry `dist/server.js`
- Runtime: **Node.js** ≥ 18, HTTP service via `express`
- Settlement context: **CLRTY-1 / chain 1202**
- Runtime dependencies: `express`

## Quickstart

```bash
git clone https://github.com/clarity-fintech/CLRTY-Reasoning
cd CLRTY-Reasoning
npm install
npm run build          # compile TypeScript -> dist/
cp .env.example .env         # then edit the values (see Configuration)
npm run dev            # hot-reload dev server
npm start              # run the built service
```

## Command reference

| Command | What it does |
|---|---|
| `npm run build` | Compile TypeScript to JavaScript (`tsc`). |
| `npm run start` | Run the compiled service from the build output. |
| `npm run dev` | Run the service in watch/hot-reload mode (`tsx`). |
| `npm run test` | Run the unit test suite (RPC smoke disabled). |
| `npm run smoke` | Smoke-check connectivity to CLRTY-1 (`scripts/smoke-clrty1.mjs`). |
| `npm run test:live` | Run the live integration tests against CLRTY-1 (`CLRTY_LIVE=1`). |

## Architecture

Source lives in `src/`. Module-by-module:

| Module | Role |
|---|---|
| `src/clrty1.ts` | CLRTY-1 L1 RPC client — duplicated into each service repo (no private npm this pass). |
| `src/databricks.ts` | exports `databricksConfigured` |
| `src/liquidity/pool_loops.ts` | $CLRTY liquidity pool interaction loops — duplicated per service repo. |
| `src/llm.ts` | exports `resolveProvider` |
| `src/security/validate_ebpf.ts` | exports `validateEbpfPolicy` |
| `src/server.ts` | exports `createApp` |
| `src/txs.ts` | Fetch recent txs via RPC/API. Gracefully returns [] on any failure. |

## Configuration

Copy `.env.example` to `.env` and set:

| Variable | Default / example |
|---|---|
| `CLRTY_L1_RPC` | `https://rpc.clarity-fintech.com` |
| `CLRTY_API_BASE` | `https://api.clarity-fintech.com` |
| `CLRTY_L1_CHAIN_ID` | `clrty-1` |
| `CLRTY_L1_NUMERIC_CHAIN_ID` | `1202` |
| `PORT` | `8787` |
| `CLRTY_RPC_SMOKE` | `0` |
| `LLM_PROVIDER` | `mock` |
| `OPENAI_API_KEY` | _(required)_ |
| `ANTHROPIC_API_KEY` | _(required)_ |
| `DATABRICKS_HOST` | _(required)_ |
| `DATABRICKS_TOKEN` | _(required)_ |
| `DATABRICKS_WAREHOUSE_ID` | _(required)_ |
| `DATABRICKS_HTTP_PATH` | _(required)_ |

## HTTP surface

The service starts an HTTP server (see `src/server.ts`). Route handlers are defined
in the modules listed under Architecture; start it with `npm start` (or `npm run dev`)
and call it over the port configured in your `.env`.

## Testing

```bash
npm test               # unit tests (vitest)
npm run smoke          # CLRTY-1 connectivity smoke test
CLRTY_LIVE=1 npm run test:live   # live CLRTY-1 integration
```

Test files: `tests/clrty1_live.test.ts`, `tests/reasoning.test.ts`

## CLRTY-1 integration

- `src/clrty1.ts` holds the CLRTY-1 client (chain **1202**), used by the service to read
  settlement context and submit/observe activity.
- Configure the endpoint via the `.env` values above; the `smoke` script verifies reachability.

## Security

- `security/CHECKLIST.md` — pre-deploy security checklist.
- `security/ebpf/` — eBPF settlement-path filters (`settlement_path.bpf.c`, `filters.yaml`).

## MIS kernel binding

This service is bound into the MIS substrate: see `MIS_KERNEL.md` and
`manifests/mis_kernel.json`. It settles on the same **CLRTY-1 / chain 1202** network as the
MIS `.mis` modules, compiled by the [CLRTY-MIS-Kernel](https://github.com/clarity-fintech/CLRTY-MIS-Kernel) `misc` compiler.

## Backlinks

- [clarity-fintech/CLRTY-MIS-Kernel](https://github.com/clarity-fintech/CLRTY-MIS-Kernel) — MIS `misc` compiler & kernel
- [clarity-fintech/moniversive_invariant_static_ML](https://github.com/clarity-fintech/moniversive_invariant_static_ML) — MIS language root
- [clarity-fintech/CLRTY-Reasoning](https://github.com/clarity-fintech/CLRTY-Reasoning) — this repository

---
CLRTY-1 (chain 1202) · Creator Chandler William Ferguson
