"use client";
// Stock Profile — app/page.tsx
// Institutional-grade portfolio tracker
// Search: ANY ticker, ETF, REIT, ADR, Islamic ETF — no manual configuration
// Data: Finnhub → Polygon → Twelve Data → Yahoo → mock (automatic failover)
// Architecture: server-proxied via /api/quotes & /api/search (keys never reach browser)

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ======================================================================
// DESIGN TOKENS
// BG #07090D | Surface #0E1117 | Surface2 #141820 | Border #1C2333
// Teal #00C896 | Red #E5484D | Amber #F59E0B | Blue #3B82F6
// Text #F0F4FF | Sub #8892A4 | Muted #3D4A5C
// ======================================================================

// -- CACHE LAYER -------------------------------------------------------
// Two-level: in-memory L1 (fast) + localStorage L2 (persists across refreshes)
const MEM_CACHE: Record<string, { data: any; ts: number }> = {};
const QUOTE_TTL    = 45_000;   // 45s — respects Finnhub 60 req/min free tier
const SEARCH_TTL   = 300_000;  // 5m — search results change rarely
const ASSET_TTL    = 86_400_000; // 24h — asset metadata (name, sector, exchange)

const memGet = (key: string, ttl: number) => {
  const e = MEM_CACHE[key];
  return e && Date.now() - e.ts < ttl ? e.data : null;
};
const memSet = (key: string, data: any) => {
  MEM_CACHE[key] = { data, ts: Date.now() };
};

// -- AI WRAPPER --------------------------------------------------------
const callAI = async (messages: any[], max_tokens = 1000) => {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || `AI error ${res.status}`);
  }
  const d = await res.json();
  return (d.content || []).map((b: any) => b.text || "").join("");
};

// ======================================================================
// UNIVERSAL ASSET SEARCH
// Calls /api/search which server-side queries Finnhub symbol search.
// Falls back to local SEED_DB for instant offline results.
// ======================================================================
const searchAssets = async (query: string): Promise<AssetMeta[]> => {
  if (!query || query.length < 1) return [];
  const q = query.trim();

  // L1 memory cache
  const cached = memGet(`search:${q.toLowerCase()}`, SEARCH_TTL);
  if (cached) return cached;

  // Local seed always first for instant sub-50ms results
  const local = searchLocal(q);

  // Fire server search in parallel (don't await for initial render)
  fetchRemoteSearch(q).then(remote => {
    if (remote && remote.length > 0) {
      // Merge: remote results take priority, then local extras not already present
      const remoteSyms = new Set(remote.map((r: AssetMeta) => r.sym));
      const merged = [...remote, ...local.filter(l => !remoteSyms.has(l.sym))].slice(0, 10);
      memSet(`search:${q.toLowerCase()}`, merged);
    }
  }).catch(() => {});

  // Return local immediately
  memSet(`search:${q.toLowerCase()}`, local);
  return local;
};

const fetchRemoteSearch = async (q: string): Promise<AssetMeta[]> => {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // /api/search returns { results: [{sym, name, exchange, type, sector}] }
    return (data.results || []).map((r: any): AssetMeta => ({
      sym:      r.sym || r.symbol || "",
      name:     r.name || r.description || r.sym,
      exchange: r.exchange || "US",
      sector:   inferSector(r.sym, r.type, r.name),
      assetType: inferAssetType(r.type),
      mktcap:   r.mktcap || null,
    })).filter((r: AssetMeta) => r.sym && r.sym.length <= 6);
  } catch (_e) {
    return [];
  }
};

// ======================================================================
// ASSET METADATA TYPES & SEED DATABASE
// The seed DB covers the most common searches instantly.
// Anything not in seed is found via server search.
// ======================================================================
interface AssetMeta {
  sym:      string;
  name:     string;
  exchange?: string;
  sector:   string;
  assetType?: string; // "Stock" | "ETF" | "REIT" | "ADR" | "Islamic ETF" | "Crypto"
  mktcap?:  string | null;
}

// Sector inference for remote results that don't include it
const inferSector = (sym: string, type: string, name: string): string => {
  if (!sym) return "Other";
  // ETF detection
  const etfKeywords = ["ETF","FUND","INDEX","TRUST","SHARES","PORTFOLIO"];
  if (type?.toUpperCase().includes("ETF") || etfKeywords.some(k => name?.toUpperCase().includes(k))) return "ETF";
  // Look up in seed
  const seed = SEED_DB.find(s => s.sym === sym.toUpperCase());
  if (seed) return seed.sector;
  return "Other";
};

const inferAssetType = (type: string): string => {
  if (!type) return "Stock";
  const t = type.toUpperCase();
  if (t.includes("ETF"))   return "ETF";
  if (t.includes("REIT"))  return "REIT";
  if (t.includes("ADR"))   return "ADR";
  return "Stock";
};

// -- LOCAL SEED DATABASE (instant search, no API needed) ---------------
// Covers S&P 500 majors, Nasdaq, NYSE, Islamic ETFs, REITs, ADRs
const SEED_DB: AssetMeta[] = [
  // === MEGA CAP TECH ===
  {sym:"AAPL",  name:"Apple Inc",                 sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"3.27T"},
  {sym:"MSFT",  name:"Microsoft Corp",            sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"3.18T"},
  {sym:"NVDA",  name:"NVIDIA Corp",               sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"5.04T"},
  {sym:"GOOGL", name:"Alphabet Inc (Class A)",    sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"2.19T"},
  {sym:"GOOG",  name:"Alphabet Inc (Class C)",    sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"2.19T"},
  {sym:"AMZN",  name:"Amazon.com Inc",            sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"2.08T"},
  {sym:"META",  name:"Meta Platforms Inc",        sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"1.51T"},
  {sym:"TSLA",  name:"Tesla Inc",                 sector:"EV & Growth", exchange:"NASDAQ", assetType:"Stock", mktcap:"796B"},
  {sym:"AVGO",  name:"Broadcom Inc",              sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"621B"},
  {sym:"ORCL",  name:"Oracle Corp",               sector:"Technology",  exchange:"NYSE",   assetType:"Stock", mktcap:"448B"},
  {sym:"AMD",   name:"Advanced Micro Devices",    sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"272B"},
  {sym:"INTC",  name:"Intel Corp",                sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"91B"},
  {sym:"CRM",   name:"Salesforce Inc",            sector:"Technology",  exchange:"NYSE",   assetType:"Stock", mktcap:"277B"},
  {sym:"ADBE",  name:"Adobe Inc",                 sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"233B"},
  {sym:"MU",    name:"Micron Technology",         sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"128B"},
  {sym:"QCOM",  name:"Qualcomm Inc",              sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"187B"},
  {sym:"AMAT",  name:"Applied Materials Inc",     sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"158B"},
  {sym:"ASML",  name:"ASML Holding NV",           sector:"Technology",  exchange:"NASDAQ", assetType:"ADR",   mktcap:"289B"},
  {sym:"TSM",   name:"Taiwan Semiconductor",      sector:"Technology",  exchange:"NYSE",   assetType:"ADR",   mktcap:"523B"},
  {sym:"UBER",  name:"Uber Technologies",         sector:"Technology",  exchange:"NYSE",   assetType:"Stock", mktcap:"174B"},
  {sym:"SHOP",  name:"Shopify Inc",               sector:"Technology",  exchange:"NYSE",   assetType:"Stock", mktcap:"94B"},
  {sym:"SNOW",  name:"Snowflake Inc",             sector:"Technology",  exchange:"NYSE",   assetType:"Stock", mktcap:"42B"},
  // === AI & DEFENSE TECH ===
  {sym:"PLTR",  name:"Palantir Technologies",     sector:"AI & Defense",exchange:"NYSE",   assetType:"Stock", mktcap:"61B"},
  {sym:"BBAI",  name:"BigBear.ai Holdings",       sector:"AI & Defense",exchange:"NYSE",   assetType:"Stock", mktcap:"1.2B"},
  {sym:"SOFI",  name:"SoFi Technologies",         sector:"Finance",     exchange:"NASDAQ", assetType:"Stock", mktcap:"11B"},
  {sym:"SOUN",  name:"SoundHound AI",             sector:"AI & Defense",exchange:"NASDAQ", assetType:"Stock", mktcap:"4.8B"},
  {sym:"IONQ",  name:"IonQ Inc",                  sector:"AI & Defense",exchange:"NYSE",   assetType:"Stock", mktcap:"7.2B"},
  {sym:"RGTI",  name:"Rigetti Computing",         sector:"AI & Defense",exchange:"NASDAQ", assetType:"Stock", mktcap:"3.4B"},
  {sym:"AI",    name:"C3.ai Inc",                 sector:"AI & Defense",exchange:"NYSE",   assetType:"Stock", mktcap:"4.1B"},
  // === FINANCE ===
  {sym:"BRKB",  name:"Berkshire Hathaway B",      sector:"Finance",     exchange:"NYSE",   assetType:"Stock", mktcap:"1.04T"},
  {sym:"JPM",   name:"JPMorgan Chase",            sector:"Finance",     exchange:"NYSE",   assetType:"Stock", mktcap:"698B"},
  {sym:"V",     name:"Visa Inc",                  sector:"Finance",     exchange:"NYSE",   assetType:"Stock", mktcap:"589B"},
  {sym:"MA",    name:"Mastercard Inc",            sector:"Finance",     exchange:"NYSE",   assetType:"Stock", mktcap:"466B"},
  {sym:"BAC",   name:"Bank of America",           sector:"Finance",     exchange:"NYSE",   assetType:"Stock", mktcap:"338B"},
  {sym:"GS",    name:"Goldman Sachs",             sector:"Finance",     exchange:"NYSE",   assetType:"Stock", mktcap:"180B"},
  {sym:"WFC",   name:"Wells Fargo",               sector:"Finance",     exchange:"NYSE",   assetType:"Stock", mktcap:"225B"},
  {sym:"BX",    name:"Blackstone Inc",            sector:"Finance",     exchange:"NYSE",   assetType:"Stock", mktcap:"188B"},
  {sym:"PYPL",  name:"PayPal Holdings",           sector:"Finance",     exchange:"NASDAQ", assetType:"Stock", mktcap:"72B"},
  // === HEALTHCARE ===
  {sym:"UNH",   name:"UnitedHealth Group",        sector:"Healthcare",  exchange:"NYSE",   assetType:"Stock", mktcap:"285B"},
  {sym:"JNJ",   name:"Johnson & Johnson",         sector:"Healthcare",  exchange:"NYSE",   assetType:"Stock", mktcap:"381B"},
  {sym:"LLY",   name:"Eli Lilly",                 sector:"Healthcare",  exchange:"NYSE",   assetType:"Stock", mktcap:"740B"},
  {sym:"ABBV",  name:"AbbVie Inc",                sector:"Healthcare",  exchange:"NYSE",   assetType:"Stock", mktcap:"328B"},
  {sym:"MRK",   name:"Merck & Co",                sector:"Healthcare",  exchange:"NYSE",   assetType:"Stock", mktcap:"257B"},
  {sym:"PFE",   name:"Pfizer Inc",                sector:"Healthcare",  exchange:"NYSE",   assetType:"Stock", mktcap:"142B"},
  // === CONSUMER & RETAIL ===
  {sym:"WMT",   name:"Walmart Inc",               sector:"Consumer",    exchange:"NYSE",   assetType:"Stock", mktcap:"784B"},
  {sym:"COST",  name:"Costco Wholesale",          sector:"Consumer",    exchange:"NASDAQ", assetType:"Stock", mktcap:"388B"},
  {sym:"MCD",   name:"McDonald's Corp",           sector:"Consumer",    exchange:"NYSE",   assetType:"Stock", mktcap:"212B"},
  {sym:"KO",    name:"Coca-Cola Co",              sector:"Consumer",    exchange:"NYSE",   assetType:"Stock", mktcap:"307B"},
  {sym:"PEP",   name:"PepsiCo Inc",               sector:"Consumer",    exchange:"NASDAQ", assetType:"Stock", mktcap:"198B"},
  {sym:"NKE",   name:"Nike Inc",                  sector:"Consumer",    exchange:"NYSE",   assetType:"Stock", mktcap:"122B"},
  // === ENERGY ===
  {sym:"XOM",   name:"Exxon Mobil",               sector:"Energy",      exchange:"NYSE",   assetType:"Stock", mktcap:"456B"},
  {sym:"CVX",   name:"Chevron Corp",              sector:"Energy",      exchange:"NYSE",   assetType:"Stock", mktcap:"278B"},
  {sym:"COP",   name:"ConocoPhillips",            sector:"Energy",      exchange:"NYSE",   assetType:"Stock", mktcap:"121B"},
  // === COMMUNICATION ===
  {sym:"NFLX",  name:"Netflix Inc",               sector:"Communication",exchange:"NASDAQ",assetType:"Stock", mktcap:"477B"},
  {sym:"DIS",   name:"Walt Disney Co",            sector:"Communication",exchange:"NYSE",  assetType:"Stock", mktcap:"179B"},
  {sym:"T",     name:"AT&T Inc",                  sector:"Communication",exchange:"NYSE",  assetType:"Stock", mktcap:"143B"},
  {sym:"VZ",    name:"Verizon Communications",    sector:"Communication",exchange:"NYSE",  assetType:"Stock", mktcap:"167B"},
  // === INDUSTRIALS ===
  {sym:"BA",    name:"Boeing Co",                 sector:"Industrial",  exchange:"NYSE",   assetType:"Stock", mktcap:"103B"},
  {sym:"CAT",   name:"Caterpillar Inc",           sector:"Industrial",  exchange:"NYSE",   assetType:"Stock", mktcap:"162B"},
  {sym:"HON",   name:"Honeywell International",   sector:"Industrial",  exchange:"NASDAQ", assetType:"Stock", mktcap:"134B"},
  // === REITs ===
  {sym:"O",     name:"Realty Income Corp",        sector:"REIT",        exchange:"NYSE",   assetType:"REIT",  mktcap:"32B"},
  {sym:"AMT",   name:"American Tower Corp",       sector:"REIT",        exchange:"NYSE",   assetType:"REIT",  mktcap:"87B"},
  {sym:"PLD",   name:"Prologis Inc",              sector:"REIT",        exchange:"NYSE",   assetType:"REIT",  mktcap:"95B"},
  {sym:"SPG",   name:"Simon Property Group",      sector:"REIT",        exchange:"NYSE",   assetType:"REIT",  mktcap:"53B"},
  {sym:"WELL",  name:"Welltower Inc",             sector:"REIT",        exchange:"NYSE",   assetType:"REIT",  mktcap:"81B"},
  {sym:"VNQ",   name:"Vanguard Real Estate ETF",  sector:"REIT",        exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  // === CORE US ETFs ===
  {sym:"SPY",   name:"SPDR S&P 500 ETF",          sector:"ETF",         exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"VOO",   name:"Vanguard S&P 500 ETF",      sector:"ETF",         exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"IVV",   name:"iShares Core S&P 500 ETF",  sector:"ETF",         exchange:"NASDAQ", assetType:"ETF",   mktcap:null},
  {sym:"VTI",   name:"Vanguard Total Stock Mkt ETF",sector:"ETF",       exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"QQQ",   name:"Invesco NASDAQ 100 ETF",    sector:"ETF",         exchange:"NASDAQ", assetType:"ETF",   mktcap:null},
  {sym:"DIA",   name:"SPDR Dow Jones ETF",        sector:"ETF",         exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"IWM",   name:"iShares Russell 2000 ETF",  sector:"ETF",         exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  // === DIVIDEND / INCOME ETFs ===
  {sym:"SCHD",  name:"Schwab US Dividend Equity ETF",sector:"ETF",      exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"VIG",   name:"Vanguard Dividend Appreciation ETF",sector:"ETF", exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"DGRO",  name:"iShares Core Dividend Growth ETF",sector:"ETF",   exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"SPHD",  name:"Invesco S&P 500 High Div Low Vol ETF",sector:"ETF",exchange:"NYSE",  assetType:"ETF",   mktcap:null},
  {sym:"JEPI",  name:"JPMorgan Equity Premium Income ETF",sector:"ETF", exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"JEPQ",  name:"JPMorgan NASDAQ Equity Premium Income ETF",sector:"ETF",exchange:"NASDAQ",assetType:"ETF",mktcap:null},
  // === ISLAMIC / HALAL ETFs ===
  {sym:"SPUS",  name:"SP Funds S&P 500 Sharia ETF",sector:"Islamic ETF",exchange:"NYSE",   assetType:"Islamic ETF",mktcap:null},
  {sym:"HLAL",  name:"Wahed FTSE USA Shariah ETF", sector:"Islamic ETF",exchange:"NASDAQ", assetType:"Islamic ETF",mktcap:null},
  {sym:"UMMA",  name:"Wahed Dow Jones Islamic World ETF",sector:"Islamic ETF",exchange:"NYSE",assetType:"Islamic ETF",mktcap:null},
  {sym:"SPSK",  name:"SP Funds Dow Jones Global Sukuk ETF",sector:"Islamic ETF",exchange:"NYSE",assetType:"Islamic ETF",mktcap:null},
  {sym:"ISWD",  name:"iShares MSCI World Islamic UCITS ETF",sector:"Islamic ETF",exchange:"LSE",assetType:"Islamic ETF",mktcap:null},
  // === SECTOR ETFs ===
  {sym:"XLK",   name:"Technology Select Sector SPDR",sector:"ETF",      exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"XLF",   name:"Financial Select Sector SPDR",sector:"ETF",       exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"XLE",   name:"Energy Select Sector SPDR",  sector:"ETF",        exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"XLV",   name:"Health Care Select Sector SPDR",sector:"ETF",     exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"ARKK",  name:"ARK Innovation ETF",         sector:"ETF",        exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"GLD",   name:"SPDR Gold Shares ETF",        sector:"Commodity",  exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"SLV",   name:"iShares Silver Trust ETF",   sector:"Commodity",  exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  {sym:"USO",   name:"United States Oil Fund ETF", sector:"Commodity",  exchange:"NYSE",   assetType:"ETF",   mktcap:null},
  // === INTERNATIONAL ADRs ===
  {sym:"BABA",  name:"Alibaba Group",              sector:"Technology",  exchange:"NYSE",   assetType:"ADR",   mktcap:"210B"},
  {sym:"NVO",   name:"Novo Nordisk",               sector:"Healthcare",  exchange:"NYSE",   assetType:"ADR",   mktcap:"395B"},
  {sym:"SAP",   name:"SAP SE",                     sector:"Technology",  exchange:"NYSE",   assetType:"ADR",   mktcap:"243B"},
  {sym:"TM",    name:"Toyota Motor Corp",          sector:"Industrial",  exchange:"NYSE",   assetType:"ADR",   mktcap:"244B"},
  {sym:"BP",    name:"BP PLC",                     sector:"Energy",      exchange:"NYSE",   assetType:"ADR",   mktcap:"93B"},
  {sym:"RIO",   name:"Rio Tinto PLC",              sector:"Industrial",  exchange:"NYSE",   assetType:"ADR",   mktcap:"98B"},
  // === CRYPTO ADJACENT ===
  {sym:"COIN",  name:"Coinbase Global",            sector:"Finance",     exchange:"NASDAQ", assetType:"Stock", mktcap:"62B"},
  {sym:"MSTR",  name:"MicroStrategy",              sector:"Technology",  exchange:"NASDAQ", assetType:"Stock", mktcap:"38B"},
  {sym:"BTC-USD",name:"Bitcoin USD",               sector:"Crypto",      exchange:"CRYPTO", assetType:"Crypto",mktcap:null},
];

// -- LOCAL SEARCH FUNCTION (instant, no network) ----------------------
const searchLocal = (query: string): AssetMeta[] => {
  const q = query.toUpperCase();
  const ql = query.toLowerCase();
  const exactSym   = SEED_DB.filter(t => t.sym === q);
  const startsSym  = SEED_DB.filter(t => t.sym.startsWith(q) && t.sym !== q);
  const containsSym= SEED_DB.filter(t => t.sym.includes(q) && !t.sym.startsWith(q));
  const nameMatch  = SEED_DB.filter(t =>
    t.name.toLowerCase().includes(ql) &&
    !t.sym.startsWith(q) && !t.sym.includes(q)
  );
  return [...exactSym, ...startsSym, ...containsSym, ...nameMatch].slice(0, 10);
};

// ======================================================================
// QUOTE FETCH — Multi-provider failover
// Priority: Finnhub → Polygon → Twelve Data → Yahoo → mock
// All via server-side /api/quotes proxy — no CORS, no exposed keys
// ======================================================================
const fetchQuote = async (symbol: string) => {
  const now = Date.now();
  const cached = memGet(`quote:${symbol}`, QUOTE_TTL);
  if (cached) return cached;

  try {
    const res = await fetch(`/api/quotes?symbol=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const q = await res.json();
      if (q.price && q.price > 0) {
        const data = {
          symbol,
          price:      q.price,
          change:     q.change      ?? 0,
          pct:        q.pct         ?? 0,
          dayHigh:    q.dayHigh     ?? null,
          dayLow:     q.dayLow      ?? null,
          volume:     q.volume      ?? null,
          mktcap:     q.mktcap      ?? null,
          pe:         q.pe          ?? null,
          fiftyTwoHigh: q.fiftyTwoHigh ?? null,
          fiftyTwoLow:  q.fiftyTwoLow  ?? null,
          currency:   q.currency    ?? "USD",
          provider:   q.provider    ?? "live",
          live: true,
          ts: now,
        };
        memSet(`quote:${symbol}`, data);
        return data;
      }
    }
  } catch (_e) { /* fall through */ }

  return getMockQuote(symbol);
};

// -- DETERMINISTIC MOCK QUOTES ----------------------------------------
const MOCK_BASE: Record<string, any> = {
  NVDA: {price:208.19,change:-0.45,pct:-0.22,volume:82e6, mktcap:5.04e12,pe:31.88,fiftyTwoHigh:236.54,fiftyTwoLow:140.86},
  AAPL: {price:213.45,change:2.31, pct:1.09, volume:52e6, mktcap:3.27e12,pe:34.2, fiftyTwoHigh:237.23,fiftyTwoLow:164.08},
  MSFT: {price:428.17,change:-1.88,pct:-0.44,volume:18e6, mktcap:3.18e12,pe:36.8, fiftyTwoHigh:468.35,fiftyTwoLow:385.02},
  TSLA: {price:248.90,change:-7.22,pct:-2.82,volume:88e6, mktcap:0.796e12,pe:71.3,fiftyTwoHigh:488.54,fiftyTwoLow:138.80},
  AMZN: {price:196.08,change:0.93, pct:0.48, volume:34e6, mktcap:2.08e12,pe:44.6, fiftyTwoHigh:230.17,fiftyTwoLow:151.61},
  GOOGL:{price:178.32,change:1.54, pct:0.87, volume:22e6, mktcap:2.19e12,pe:24.1, fiftyTwoHigh:207.05,fiftyTwoLow:155.01},
  META: {price:594.21,change:8.17, pct:1.39, volume:17e6, mktcap:1.51e12,pe:28.4, fiftyTwoHigh:638.40,fiftyTwoLow:414.50},
  JPM:  {price:242.66,change:-0.88,pct:-0.36,volume:9e6,  mktcap:0.698e12,pe:13.2,fiftyTwoHigh:265.90,fiftyTwoLow:183.75},
  V:    {price:289.44,change:1.22, pct:0.42, volume:7e6,  mktcap:0.589e12,pe:31.7,fiftyTwoHigh:313.35,fiftyTwoLow:252.20},
  XOM:  {price:114.56,change:0.77, pct:0.68, volume:14e6, mktcap:0.456e12,pe:14.1,fiftyTwoHigh:126.34,fiftyTwoLow:95.77 },
  JNJ:  {price:157.83,change:-0.41,pct:-0.26,volume:6e6,  mktcap:0.381e12,pe:16.8,fiftyTwoHigh:168.07,fiftyTwoLow:143.13},
  SPY:  {price:544.32,change:3.21, pct:0.59, volume:62e6, mktcap:null,    pe:null, fiftyTwoHigh:565.16,fiftyTwoLow:490.20},
  VOO:  {price:498.41,change:2.89, pct:0.58, volume:4e6,  mktcap:null,    pe:null, fiftyTwoHigh:515.00,fiftyTwoLow:455.10},
  QQQ:  {price:463.28,change:5.12, pct:1.12, volume:31e6, mktcap:null,    pe:null, fiftyTwoHigh:503.52,fiftyTwoLow:390.00},
  VTI:  {price:270.15,change:1.44, pct:0.53, volume:3e6,  mktcap:null,    pe:null, fiftyTwoHigh:287.00,fiftyTwoLow:235.00},
  SCHD: {price:82.44, change:0.31, pct:0.38, volume:4e6,  mktcap:null,    pe:null, fiftyTwoHigh:86.90, fiftyTwoLow:71.20 },
  SPUS: {price:38.47, change:0.18, pct:0.47, volume:0.2e6,mktcap:null,    pe:null, fiftyTwoHigh:41.20, fiftyTwoLow:33.10 },
  HLAL: {price:29.83, change:0.12, pct:0.40, volume:0.1e6,mktcap:null,    pe:null, fiftyTwoHigh:32.00, fiftyTwoLow:26.50 },
  UMMA: {price:22.10, change:0.09, pct:0.41, volume:0.05e6,mktcap:null,   pe:null, fiftyTwoHigh:24.00, fiftyTwoLow:19.00 },
  SPSK: {price:24.33, change:0.04, pct:0.16, volume:0.03e6,mktcap:null,   pe:null, fiftyTwoHigh:25.50, fiftyTwoLow:23.00 },
  GLD:  {price:237.44,change:-0.83,pct:-0.35,volume:8e6,  mktcap:null,    pe:null, fiftyTwoHigh:249.60,fiftyTwoLow:175.00},
  AMD:  {price:168.55,change:3.12, pct:1.89, volume:42e6, mktcap:0.272e12,pe:48.7, fiftyTwoHigh:227.30,fiftyTwoLow:110.00},
  BRKB: {price:468.20,change:2.10, pct:0.45, volume:4e6,  mktcap:1.04e12, pe:21.3, fiftyTwoHigh:498.78,fiftyTwoLow:384.10},
  BAC:  {price:43.12, change:-0.22,pct:-0.51,volume:31e6, mktcap:0.338e12,pe:12.8, fiftyTwoHigh:47.52, fiftyTwoLow:35.74 },
  PLTR: {price:28.14, change:0.88, pct:3.23, volume:55e6, mktcap:0.061e12,pe:220,  fiftyTwoHigh:31.50, fiftyTwoLow:13.85 },
  BBAI: {price:4.14,  change:-0.09,pct:-2.1, volume:3.4e6,mktcap:1.2e9,   pe:null, fiftyTwoHigh:9.80,  fiftyTwoLow:1.50  },
  SOFI: {price:12.87, change:0.22, pct:1.74, volume:22e6, mktcap:0.011e12,pe:null, fiftyTwoHigh:18.42, fiftyTwoLow:7.22  },
  NFLX: {price:1102.4,change:14.3, pct:1.31, volume:3e6,  mktcap:0.477e12,pe:55.2, fiftyTwoHigh:1138.6,fiftyTwoLow:542.01},
  KO:   {price:71.24, change:0.18, pct:0.25, volume:12e6, mktcap:0.307e12,pe:24.8, fiftyTwoHigh:76.00, fiftyTwoLow:57.88 },
  O:    {price:53.72, change:-0.44,pct:-0.81,volume:5e6,  mktcap:0.032e12,pe:42.1, fiftyTwoHigh:62.01, fiftyTwoLow:47.68 },
  WMT:  {price:97.44, change:0.34, pct:0.35, volume:12e6, mktcap:0.784e12,pe:42.3, fiftyTwoHigh:105.30,fiftyTwoLow:60.01 },
  DIS:  {price:99.18, change:-1.03,pct:-1.03,volume:14e6, mktcap:0.179e12,pe:35.6, fiftyTwoHigh:122.89,fiftyTwoLow:83.91 },
  CRM:  {price:286.77,change:4.44, pct:1.57, volume:7e6,  mktcap:0.277e12,pe:67.4, fiftyTwoHigh:369.93,fiftyTwoLow:212.00},
};

const getMockQuote = (sym: string) => {
  const b = MOCK_BASE[sym] || {price:100,change:0.5,pct:0.5,volume:1e6,mktcap:null,pe:null,fiftyTwoHigh:120,fiftyTwoLow:80};
  const jitter = (Math.random() - 0.5) * b.price * 0.001;
  return {
    ...b, symbol: sym,
    price: +(b.price + jitter).toFixed(2),
    live: false, provider: "mock", ts: Date.now(),
    currency: "USD",
  };
};

// ======================================================================
// MARKET CAP HISTORY (for Growth Engine)
// ======================================================================
const MKTCAP_HISTORY: Record<string, Record<string, number>> = {
  NVDA: {"2022-01-01":0.62e12,"2023-01-01":0.36e12,"2023-06-01":0.98e12,"2024-01-01":1.22e12,"2024-06-01":2.8e12,current:5.04e12},
  AAPL: {"2022-01-01":2.91e12,"2023-01-01":2.07e12,"2024-01-01":2.99e12,"2024-06-01":3.01e12,current:3.27e12},
  MSFT: {"2022-01-01":2.52e12,"2023-01-01":1.79e12,"2024-01-01":2.79e12,"2024-06-01":3.32e12,current:3.18e12},
  TSLA: {"2022-01-01":1.06e12,"2023-01-01":0.39e12,"2024-01-01":0.80e12,"2024-06-01":0.55e12,current:0.796e12},
  AMZN: {"2022-01-01":1.71e12,"2023-01-01":0.86e12,"2024-01-01":1.56e12,"2024-06-01":1.93e12,current:2.08e12},
  META: {"2022-01-01":0.91e12,"2023-01-01":0.32e12,"2024-01-01":1.22e12,"2024-06-01":1.28e12,current:1.51e12},
  JPM:  {"2022-01-01":0.48e12,"2023-01-01":0.39e12,"2024-01-01":0.49e12,"2024-06-01":0.57e12,current:0.698e12},
};

const getHistoricalMktCap = (symbol: string, purchaseDate: string): number | null => {
  const hist = MKTCAP_HISTORY[symbol];
  if (!hist) return null;
  const keys = Object.keys(hist).filter(k => k !== "current").sort();
  let best = keys[0];
  for (const k of keys) { if (k <= purchaseDate) best = k; }
  return hist[best] || null;
};

// ======================================================================
// UTILS
// ======================================================================
const fmt   = (n: any, d = 2) => (+n).toLocaleString("en-US", {minimumFractionDigits: d, maximumFractionDigits: d});
const fmtB  = (n: any) => !n ? "N/A" : n >= 1e12 ? "$" + (n / 1e12).toFixed(2) + "T" : n >= 1e9 ? "$" + (n / 1e9).toFixed(1) + "B" : "$" + (n / 1e6).toFixed(0) + "M";
const fmtV  = (n: any) => !n ? "-" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(n);
const pctC  = (v: any) => v >= 0 ? "#00C896" : "#E5484D";
const pctBg = (v: any) => v >= 0 ? "#00C89612" : "#E5484D12";
const pctBd = (v: any) => v >= 0 ? "#00C89630" : "#E5484D30";
const uid   = () => Math.random().toString(36).slice(2, 9);

const SECTOR_C: Record<string, string> = {
  Technology:   "#3B82F6",
  Finance:      "#8B5CF6",
  Energy:       "#F59E0B",
  Healthcare:   "#10B981",
  ETF:          "#6B7280",
  "Islamic ETF":"#059669",
  Commodity:    "#F97316",
  Communication:"#EC4899",
  Consumer:     "#14B8A6",
  Industrial:   "#84CC16",
  "EV & Growth":"#22D3EE",
  "AI & Defense":"#F43F5E",
  REIT:         "#A855F7",
  Crypto:       "#F59E0B",
  Other:        "#94A3B8",
};

const ASSET_TYPE_BADGE: Record<string, {color: string; bg: string}> = {
  "ETF":        {color:"#6B7280",  bg:"#6B728020"},
  "Islamic ETF":{color:"#059669",  bg:"#05966920"},
  "REIT":       {color:"#A855F7",  bg:"#A855F720"},
  "ADR":        {color:"#F59E0B",  bg:"#F59E0B20"},
  "Stock":      {color:"#3D4A5C",  bg:"transparent"},
  "Crypto":     {color:"#F59E0B",  bg:"#F59E0B20"},
};

// -- DEFAULT PORTFOLIO --------------------------------------------------
const DEFAULT_HOLDINGS = [
  {id:uid(),sym:"NVDA",  sector:"Technology",  lots:[{id:uid(),shares:20, avgCost:148.00,date:"2024-01-15"},{id:uid(),shares:22,avgCost:148.40,date:"2024-03-10"}]},
  {id:uid(),sym:"AAPL",  sector:"Technology",  lots:[{id:uid(),shares:85, avgCost:171.40,date:"2023-08-20"}]},
  {id:uid(),sym:"MSFT",  sector:"Technology",  lots:[{id:uid(),shares:30, avgCost:385.10,date:"2023-11-05"}]},
  {id:uid(),sym:"JPM",   sector:"Finance",     lots:[{id:uid(),shares:55, avgCost:198.30,date:"2024-03-10"}]},
  {id:uid(),sym:"V",     sector:"Finance",     lots:[{id:uid(),shares:40, avgCost:254.80,date:"2023-06-18"}]},
  {id:uid(),sym:"XOM",   sector:"Energy",      lots:[{id:uid(),shares:70, avgCost:102.40,date:"2024-02-28"}]},
  {id:uid(),sym:"SPY",   sector:"ETF",         lots:[{id:uid(),shares:20, avgCost:480.10,date:"2023-07-01"}]},
  {id:uid(),sym:"SPUS",  sector:"Islamic ETF", lots:[{id:uid(),shares:100,avgCost:38.50, date:"2024-06-01"}]},
];

const DEFAULT_WATCHLIST = [
  {id:uid(),sym:"META",  group:"Tech Giants"},
  {id:uid(),sym:"TSLA",  group:"EV & Growth"},
  {id:uid(),sym:"AMD",   group:"Tech Giants"},
  {id:uid(),sym:"PLTR",  group:"AI & Defense"},
  {id:uid(),sym:"BBAI",  group:"AI & Defense"},
  {id:uid(),sym:"HLAL",  group:"Islamic ETFs"},
  {id:uid(),sym:"NFLX",  group:"Streaming"},
];

// ======================================================================
// UNIVERSAL TICKER AUTOCOMPLETE
// Searches local DB instantly + fires server search in background.
// No search button. Debounced. Results appear < 50ms for local,
// < 300ms for server results when they arrive.
// ======================================================================
const TickerAutocomplete = ({
  value, onChange, onSelect,
  placeholder = "Search any ticker, ETF, or company name…"
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (t: AssetMeta) => void;
  placeholder?: string;
}) => {
  const [open,         setOpen]         = useState(false);
  const [highlighted,  setHighlighted]  = useState(0);
  const [suggestions,  setSuggestions]  = useState<AssetMeta[]>([]);
  const [loading,      setLoading]      = useState(false);
  const ref    = useRef<HTMLDivElement>(null);
  const debRef = useRef<any>(null);

  // Debounced search — fires 80ms after last keystroke
  useEffect(() => {
    clearTimeout(debRef.current);
    if (!value || value.length < 1) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    debRef.current = setTimeout(async () => {
      const results = await searchAssets(value);
      setSuggestions(results);
      setHighlighted(0);
      setOpen(results.length > 0);
      setLoading(false);
    }, 80);
  }, [value]);

  // Background refresh — updates results with server data after local shown
  useEffect(() => {
    if (!value || value.length < 1) return;
    const t = setTimeout(async () => {
      await fetchRemoteSearch(value); // populates cache
      const refreshed = await searchAssets(value);
      if (refreshed.length > 0) {
        setSuggestions(refreshed);
        setOpen(true);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (ticker: AssetMeta) => {
    onSelect(ticker);
    setOpen(false);
    setLoading(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown")  { e.preventDefault(); setHighlighted(h => Math.min(h + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")    { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === "Enter" && suggestions[highlighted]) { e.preventDefault(); select(suggestions[highlighted]); }
    if (e.key === "Escape")     setOpen(false);
  };

  const assetBadge = (t: AssetMeta) => {
    const type = t.assetType || "Stock";
    const style = ASSET_TYPE_BADGE[type] || ASSET_TYPE_BADGE["Stock"];
    if (type === "Stock") return null;
    return (
      <span style={{fontSize:8,fontWeight:700,letterSpacing:"0.05em",
        color:style.color,background:style.bg,border:`1px solid ${style.color}44`,
        borderRadius:3,padding:"1px 4px",flexShrink:0}}>
        {type}
      </span>
    );
  };

  return (
    <div ref={ref} style={{position:"relative",width:"100%"}}>
      <div style={{position:"relative"}}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          style={{background:"#141820",border:"1px solid #1C2333",color:"#F0F4FF",
            padding:"9px 36px 9px 12px",borderRadius:7,fontSize:13,fontFamily:"inherit",
            width:"100%",boxSizing:"border-box",transition:"border-color 0.15s"}}
        />
        <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
          display:"flex",alignItems:"center",gap:4}}>
          {loading && (
            <span style={{width:8,height:8,borderRadius:"50%",border:"2px solid #3B82F6",
              borderTopColor:"transparent",display:"inline-block",
              animation:"spin 0.6s linear infinite"}}/>
          )}
          {!loading && value && (
            <button onMouseDown={e=>{e.preventDefault();onChange("");setSuggestions([]);setOpen(false);}}
              style={{background:"none",border:"none",color:"#3D4A5C",cursor:"pointer",
                fontSize:14,padding:0,lineHeight:1}}>×</button>
          )}
        </div>
      </div>

      {open && suggestions.length > 0 && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,
          background:"#0E1117",border:"1px solid #252E40",borderRadius:9,
          zIndex:300,overflow:"hidden",boxShadow:"0 8px 32px #00000077"}}>

          {/* Header hint */}
          <div style={{padding:"6px 14px",borderBottom:"1px solid #1C2333",
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10,color:"#3D4A5C"}}>
              {suggestions.length} result{suggestions.length !== 1 ? "s" : ""}
            </span>
            <span style={{fontSize:9,color:"#3D4A5C"}}>↑↓ navigate  ↵ select</span>
          </div>

          {suggestions.map((t, i) => {
            const sectorColor = SECTOR_C[t.sector] || "#888";
            return (
              <div key={t.sym}
                onMouseDown={() => select(t)}
                onMouseEnter={() => setHighlighted(i)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",
                  background: i === highlighted ? "#141820" : "transparent",
                  cursor:"pointer",
                  borderBottom: i < suggestions.length - 1 ? "1px solid #1C233366" : "none",
                  transition:"background 0.08s"}}>

                {/* Sector color chip */}
                <div style={{width:32,height:32,borderRadius:7,flexShrink:0,
                  background:`${sectorColor}18`,border:`1px solid ${sectorColor}30`,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:8,fontWeight:800,color:sectorColor,fontFamily:"monospace",letterSpacing:"-0.03em"}}>
                    {t.sym.slice(0, 3)}
                  </span>
                </div>

                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#F0F4FF",fontFamily:"monospace"}}>{t.sym}</span>
                    {assetBadge(t)}
                    {t.exchange && t.exchange !== "US" && (
                      <span style={{fontSize:9,color:"#3D4A5C",letterSpacing:"0.04em"}}>{t.exchange}</span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:"#8892A4",marginTop:1,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div>
                </div>

                <div style={{textAlign:"right",flexShrink:0}}>
                  {t.mktcap && (
                    <div style={{fontSize:11,color:"#3D4A5C",fontFamily:"monospace"}}>{t.mktcap}</div>
                  )}
                  <div style={{fontSize:9,color:sectorColor,background:`${sectorColor}14`,
                    borderRadius:3,padding:"1px 5px",display:"inline-block",marginTop:1}}>
                    {t.sector}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && suggestions.length === 0 && !loading && value.length >= 2 && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,
          background:"#0E1117",border:"1px solid #252E40",borderRadius:9,
          padding:"16px 14px",zIndex:300,textAlign:"center"}}>
          <div style={{fontSize:12,color:"#3D4A5C",marginBottom:4}}>No results for "{value}"</div>
          <div style={{fontSize:11,color:"#3D4A5C"}}>
            Try the exact ticker (e.g. BBAI) or type the full company name
          </div>
        </div>
      )}
    </div>
  );
};

// ======================================================================
// MICRO UI COMPONENTS
// ======================================================================
const genSpark = (base: number, up: boolean) => {
  let v = base * (1 - (up ? 0.014 : 0.011));
  return Array.from({length: 20}, (_, i) => {
    v += (Math.random() - (up ? 0.41 : 0.59)) * base * 0.003;
    return i === 19 ? base : v;
  });
};

const Spark = ({sym, up, w = 70, h = 26}: {sym: string; up: boolean; w?: number; h?: number}) => {
  const data = useMemo(() => genSpark(100, up), [sym, up]);
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rng) * h}`).join(" ");
  const c = up ? "#00C896" : "#E5484D";
  const gid = `g_${sym}_${up ? "u" : "d"}`;
  return (
    <svg width={w} height={h} style={{overflow:"visible",display:"block",flexShrink:0}}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={c} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gid})`}/>
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
};

const Pct = ({v, size = 11}: {v: any; size?: number}) => (
  <span style={{fontSize:size,color:pctC(v),background:pctBg(v),
    border:`1px solid ${pctBd(v)}`,borderRadius:4,padding:"2px 6px",
    fontFamily:"monospace",fontWeight:600,whiteSpace:"nowrap"}}>
    {v >= 0 ? "+" : ""}{fmt(v)}%
  </span>
);

const LiveDot = ({live, provider}: {live: boolean; provider?: string}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:9,
    color:live ? "#00C896" : "#F59E0B"}}>
    <span style={{width:4,height:4,borderRadius:"50%",background:live?"#00C896":"#F59E0B",
      boxShadow:live?"0 0 4px #00C896":"none",display:"inline-block",flexShrink:0}}/>
    {live ? (provider || "LIVE") : "CACHED"}
  </span>
);

const Btn = ({children, onClick, variant = "ghost", disabled = false, full = false}: any) => {
  const s: Record<string, any> = {
    primary:   {background:"linear-gradient(135deg,#00C896,#0EA5E9)",color:"#07090D",border:"none",fontWeight:700},
    secondary: {background:"#141820",color:"#F0F4FF",border:"1px solid #1C2333"},
    ghost:     {background:"transparent",color:"#8892A4",border:"1px solid #1C2333"},
    danger:    {background:"#E5484D14",color:"#E5484D",border:"1px solid #E5484D30"},
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{...s[variant],padding:"8px 16px",borderRadius:7,cursor:disabled?"not-allowed":"pointer",
        fontSize:12,fontFamily:"inherit",opacity:disabled?0.5:1,whiteSpace:"nowrap",
        transition:"opacity 0.15s",width:full?"100%":"auto"}}>
      {children}
    </button>
  );
};

const Input = ({value, onChange, placeholder, type = "text", style = {}}: any) => (
  <input value={value} onChange={onChange} placeholder={placeholder} type={type}
    style={{background:"#141820",border:"1px solid #1C2333",color:"#F0F4FF",
      padding:"9px 12px",borderRadius:7,fontSize:12,fontFamily:"inherit",width:"100%",...style}}/>
);

const Modal = ({title, onClose, children}: any) => (
  <div style={{position:"fixed",inset:0,background:"#000000AA",zIndex:200,display:"flex",
    alignItems:"flex-end",justifyContent:"center",padding:"0"}}
    onClick={(e: any) => e.target === e.currentTarget && onClose()}>
    <div style={{background:"#0E1117",border:"1px solid #252E40",borderRadius:"14px 14px 0 0",
      width:"100%",maxWidth:"min(520px,96vw)",maxHeight:"90vh",overflow:"auto",
      animation:"slideUp 0.22s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"16px 20px",borderBottom:"1px solid #1C2333",position:"sticky",top:0,
        background:"#0E1117",zIndex:10}}>
        <span style={{fontSize:14,fontWeight:700,color:"#F0F4FF"}}>{title}</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#8892A4",
          cursor:"pointer",fontSize:22,lineHeight:1,padding:"0 4px"}}>×</button>
      </div>
      <div style={{padding:"20px"}}>{children}</div>
    </div>
  </div>
);

const SecLabel = ({children, right}: any) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
    <span style={{fontSize:10,color:"#8892A4",letterSpacing:"0.14em",fontWeight:600,textTransform:"uppercase"}}>{children}</span>
    {right}
  </div>
);

// Asset type mini-badge (shown in tables next to ticker)
const AssetTypePill = ({assetType}: {assetType?: string}) => {
  if (!assetType || assetType === "Stock") return null;
  const style = ASSET_TYPE_BADGE[assetType] || ASSET_TYPE_BADGE["Stock"];
  return (
    <span style={{fontSize:8,fontWeight:700,letterSpacing:"0.04em",
      color:style.color,background:style.bg,border:`1px solid ${style.color}44`,
      borderRadius:3,padding:"1px 4px",flexShrink:0,marginLeft:3}}>
      {assetType}
    </span>
  );
};

// ======================================================================
// HOLDINGS MANAGER
// ======================================================================
const HoldingsManager = ({holdings, setHoldings, quotes, showToast = () => {}}: any) => {
  const [modal,      setModal]      = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [symInput,   setSymInput]   = useState("");
  const [selectedAsset, setSelectedAsset] = useState<AssetMeta | null>(null);
  const [form, setForm] = useState({sym:"",sector:"Technology",assetType:"Stock",shares:"",avgCost:"",date:new Date().toISOString().slice(0,10)});
  const [lotForm, setLotForm] = useState({shares:"",avgCost:"",date:new Date().toISOString().slice(0,10)});
  const [expanded,   setExpanded]   = useState<any>(null);
  const isMobile = useIsMobile();

  const openAdd = () => {
    setSymInput(""); setSelectedAsset(null);
    setForm({sym:"",sector:"Technology",assetType:"Stock",shares:"",avgCost:"",date:new Date().toISOString().slice(0,10)});
    setModal("add");
  };
  const openLot = (h: any) => {
    setEditTarget(h);
    setLotForm({shares:"",avgCost:"",date:new Date().toISOString().slice(0,10)});
    setModal("lot");
  };

  const handleTickerSelect = (t: AssetMeta) => {
    setSymInput(t.sym + " — " + t.name);
    setSelectedAsset(t);
    setForm(f => ({...f, sym: t.sym, sector: t.sector, assetType: t.assetType || "Stock"}));
    // Auto-fetch quote so price is pre-filled if available
    fetchQuote(t.sym).then(q => {
      if (q?.price) {
        // Optionally pre-fill avgCost hint
      }
    });
  };

  const addHolding = () => {
    const sym = form.sym.toUpperCase().trim();
    if (!sym || !form.shares || !form.avgCost) return;
    if (isNaN(+form.shares) || +form.shares <= 0) { showToast("Shares must be a positive number","error"); return; }
    if (isNaN(+form.avgCost) || +form.avgCost <= 0) { showToast("Average cost must be positive","error"); return; }
    const existing = holdings.find((h: any) => h.sym === sym);
    if (existing) {
      setHoldings((hs: any[]) => hs.map(h => h.sym === sym
        ? {...h, lots:[...h.lots,{id:uid(),shares:+form.shares,avgCost:+form.avgCost,date:form.date}]}
        : h
      ));
    } else {
      setHoldings((hs: any[]) => [...hs, {
        id:uid(), sym, sector:form.sector, assetType:form.assetType,
        lots:[{id:uid(),shares:+form.shares,avgCost:+form.avgCost,date:form.date}]
      }]);
    }
    setModal(null);
    showToast(`${sym} added to holdings`, "success");
  };

  const addLot = () => {
    if (!lotForm.shares || !lotForm.avgCost) return;
    setHoldings((hs: any[]) => hs.map(h =>
      h.id === editTarget.id
        ? {...h, lots:[...h.lots,{id:uid(),shares:+lotForm.shares,avgCost:+lotForm.avgCost,date:lotForm.date}]}
        : h
    ));
    setModal(null);
    showToast(`Lot added to ${editTarget.sym}`, "success");
  };

  const removeLot = (holdingId: string, lotId: string) => {
    setHoldings((hs: any[]) => hs.map(h => {
      if (h.id !== holdingId) return h;
      const lots = h.lots.filter((l: any) => l.id !== lotId);
      return lots.length === 0 ? null : {...h, lots};
    }).filter(Boolean));
  };

  const enriched = holdings.map((h: any) => {
    const q = quotes[h.sym];
    const totalShares = h.lots.reduce((s: number, l: any) => s + l.shares, 0);
    const avgCost = h.lots.reduce((s: number, l: any) => s + l.shares * l.avgCost, 0) / totalShares;
    const price = q?.price || avgCost;
    return {...h, totalShares, avgCost, price,
      mktVal: totalShares * price,
      totalRet: ((price - avgCost) / avgCost) * 100,
      dayPct: q?.pct || 0, q};
  });
  const totalVal = enriched.reduce((s: number, h: any) => s + h.mktVal, 0);
  const enrichedW = enriched.map((h: any) => ({...h, weight: (h.mktVal / totalVal) * 100}));

  return (
    <div style={{padding:isMobile?"14px":"20px 24px",maxWidth:1400,margin:"0 auto",width:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:isMobile?16:20,fontWeight:800,color:"#F0F4FF",letterSpacing:"-0.03em"}}>Holdings</div>
          <div style={{fontSize:12,color:"#8892A4",marginTop:2}}>{holdings.length} positions · ${fmt(totalVal)} total value</div>
        </div>
        <Btn variant="primary" onClick={openAdd}>+ Add Holding</Btn>
      </div>

      {/* Mobile cards */}
      {isMobile ? (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {enrichedW.map((h: any) => (
            <div key={h.id} style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:10,overflow:"hidden"}}>
              <div style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                onClick={() => setExpanded(expanded === h.id ? null : h.id)}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:28,height:28,borderRadius:6,
                    background:(SECTOR_C[h.sector]||"#888")+"22",
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:8,fontWeight:800,color:SECTOR_C[h.sector]||"#888",fontFamily:"monospace"}}>
                      {h.sym.slice(0,2)}
                    </span>
                  </div>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:13,fontWeight:700,color:"#F0F4FF",fontFamily:"monospace"}}>{h.sym}</span>
                      <AssetTypePill assetType={h.assetType}/>
                    </div>
                    <div style={{fontSize:10,color:"#3D4A5C"}}>{h.totalShares} shares</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:14,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF"}}>${fmt(h.price)}</div>
                  <Pct v={h.totalRet} size={10}/>
                </div>
              </div>
              {expanded === h.id && (
                <div style={{borderTop:"1px solid #1C2333",padding:"12px 14px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:10}}>
                    {[["Avg Cost","$"+fmt(h.avgCost),"#8892A4"],
                      ["Mkt Value","$"+fmt(h.mktVal),"#F0F4FF"],
                      ["Today",h.dayPct,null],
                      ["Weight",fmt(h.weight,1)+"%","#8892A4"]].map(([l,v,c]: any) => (
                      <div key={l} style={{background:"#141820",borderRadius:6,padding:"8px 10px",border:"1px solid #1C2333"}}>
                        <div style={{fontSize:9,color:"#3D4A5C",marginBottom:3}}>{l}</div>
                        {l === "Today" ? <Pct v={v} size={11}/> : <div style={{fontSize:12,fontWeight:600,color:c,fontFamily:"monospace"}}>{v}</div>}
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={() => openLot(h)}
                      style={{flex:1,background:"#3B82F614",border:"1px solid #3B82F630",
                        color:"#3B82F6",borderRadius:6,padding:"7px",cursor:"pointer",fontSize:12}}>+Lot</button>
                    <button onClick={() => {
                        if(window.confirm(`Remove ${h.sym}?`)){
                          setHoldings((hs: any[]) => hs.filter(x => x.id !== h.id));
                        }
                      }}
                      style={{flex:1,background:"#E5484D14",border:"1px solid #E5484D30",
                        color:"#E5484D",borderRadius:6,padding:"7px",cursor:"pointer",fontSize:12}}>Remove</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Desktop table */
        <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,overflow:"hidden",marginBottom:16}}>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",minWidth:580}}>
              <thead>
                <tr style={{background:"#141820",borderBottom:"1px solid #1C2333"}}>
                  {["","Symbol","Shares","Avg Cost","Price","Value","Today","Return","Weight","Actions"].map((h, i) => (
                    <th key={i} style={{padding:"9px "+(i===0?"8px 9px 8px 14px":"8px"),
                      textAlign:i<=1||i===0?"left":"right",fontSize:10,color:"#3D4A5C",
                      letterSpacing:"0.08em",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrichedW.map((h: any) => (
                  <React.Fragment key={h.id}>
                    <tr style={{borderTop:"1px solid #1C2333",cursor:"pointer",transition:"background 0.12s"}}
                      onMouseEnter={e => (e.currentTarget.style.background="#141820")}
                      onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                      <td style={{padding:"10px 4px 10px 14px",textAlign:"center"}}>
                        <button onClick={() => setExpanded(expanded===h.id?null:h.id)}
                          style={{background:"none",border:"none",color:"#3D4A5C",cursor:"pointer",
                            fontSize:14,padding:0,transition:"transform 0.2s",
                            transform:expanded===h.id?"rotate(90deg)":"rotate(0deg)"}}>▶</button>
                      </td>
                      <td style={{padding:"10px 8px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:26,height:26,borderRadius:6,
                            background:(SECTOR_C[h.sector]||"#888")+"22",
                            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <span style={{fontSize:8,fontWeight:800,color:SECTOR_C[h.sector]||"#888",fontFamily:"monospace"}}>
                              {h.sym.slice(0,2)}
                            </span>
                          </div>
                          <div>
                            <div style={{display:"flex",alignItems:"center",gap:4}}>
                              <span style={{fontSize:13,fontWeight:700,color:"#F0F4FF",fontFamily:"monospace"}}>{h.sym}</span>
                              <AssetTypePill assetType={h.assetType}/>
                            </div>
                            <div style={{fontSize:9,color:"#3D4A5C"}}>{h.sector}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:"10px 8px",textAlign:"right",fontSize:12,fontFamily:"monospace",color:"#8892A4"}}>{h.totalShares}</td>
                      <td style={{padding:"10px 8px",textAlign:"right",fontSize:12,fontFamily:"monospace",color:"#8892A4"}}>${fmt(h.avgCost)}</td>
                      <td style={{padding:"10px 8px",textAlign:"right"}}>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}>
                          <span style={{fontSize:13,fontFamily:"monospace",color:"#F0F4FF",fontWeight:600}}>${fmt(h.price)}</span>
                          {h.q && <LiveDot live={h.q.live} provider={h.q.provider}/>}
                        </div>
                      </td>
                      <td style={{padding:"10px 8px",textAlign:"right",fontSize:12,fontFamily:"monospace",color:"#F0F4FF"}}>${fmt(h.mktVal)}</td>
                      <td style={{padding:"10px 8px",textAlign:"right"}}><Pct v={h.dayPct}/></td>
                      <td style={{padding:"10px 8px",textAlign:"right"}}><Pct v={h.totalRet}/></td>
                      <td style={{padding:"10px 8px",textAlign:"right"}}>
                        <div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"flex-end"}}>
                          <div style={{width:36,height:3,background:"#1C2333",borderRadius:2,overflow:"hidden"}}>
                            <div style={{width:h.weight+"%",height:"100%",background:SECTOR_C[h.sector]||"#888",borderRadius:2}}/>
                          </div>
                          <span style={{fontSize:11,fontFamily:"monospace",color:"#8892A4",minWidth:32,textAlign:"right"}}>
                            {fmt(h.weight,1)}%
                          </span>
                        </div>
                      </td>
                      <td style={{padding:"10px 14px",textAlign:"right"}}>
                        <div style={{display:"flex",gap:5,justifyContent:"flex-end"}}>
                          <button onClick={() => openLot(h)}
                            style={{background:"#3B82F614",border:"1px solid #3B82F630",color:"#3B82F6",
                              borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11}}>+Lot</button>
                          <button onClick={() => {
                              if(window.confirm(`Remove ${h.sym}?`)){
                                setHoldings((hs: any[]) => hs.filter(x => x.id !== h.id));
                                if(expanded===h.id) setExpanded(null);
                              }
                            }}
                            style={{background:"#E5484D14",border:"1px solid #E5484D30",color:"#E5484D",
                              borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:11}}>×</button>
                        </div>
                      </td>
                    </tr>
                    {expanded === h.id && (
                      <tr style={{background:"#141820"}}>
                        <td colSpan={10} style={{padding:"0 14px 14px 46px"}}>
                          <div style={{paddingTop:10,borderTop:"1px solid #1C2333"}}>
                            <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.1em",marginBottom:8}}>PURCHASE LOTS</div>
                            {h.lots.map((lot: any, i: number) => {
                              const r = ((h.price - lot.avgCost) / lot.avgCost) * 100;
                              return (
                                <div key={lot.id} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",
                                  padding:"6px 10px",background:"#0E1117",borderRadius:6,border:"1px solid #1C2333",marginBottom:4}}>
                                  <span style={{fontSize:10,color:"#3D4A5C",minWidth:18}}>#{i+1}</span>
                                  <span style={{fontSize:11,color:"#8892A4",minWidth:90}}>{lot.date}</span>
                                  <span style={{fontSize:11,fontFamily:"monospace",color:"#F0F4FF"}}>{lot.shares} shares @ ${fmt(lot.avgCost)}</span>
                                  <Pct v={r} size={10}/>
                                  <button onClick={() => removeLot(h.id, lot.id)}
                                    style={{background:"none",border:"none",color:"#3D4A5C",cursor:"pointer",
                                      fontSize:13,marginLeft:"auto",padding:"2px 5px"}}
                                    onMouseEnter={(e: any) => (e.currentTarget.style.color="#E5484D")}
                                    onMouseLeave={(e: any) => (e.currentTarget.style.color="#3D4A5C")}>×</button>
                                </div>
                              );
                            })}
                            <button onClick={() => openLot(h)}
                              style={{fontSize:11,color:"#3B82F6",background:"#3B82F614",
                                border:"1px solid #3B82F630",borderRadius:6,padding:"5px 12px",cursor:"pointer",marginTop:6}}>
                              + Add another lot
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD HOLDING MODAL */}
      {modal === "add" && (
        <Modal title="Add Holding" onClose={() => setModal(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontSize:11,color:"#8892A4",display:"block",marginBottom:6}}>
                Ticker / Company — stocks, ETFs, REITs, Islamic ETFs, ADRs
              </label>
              <TickerAutocomplete
                value={symInput}
                onChange={v => {
                  setSymInput(v);
                  setSelectedAsset(null);
                  const bare = v.split(" ")[0].toUpperCase();
                  setForm(f => ({...f, sym: bare}));
                }}
                onSelect={handleTickerSelect}
                placeholder="e.g. BBAI, SPUS, Apple, BigBear, Palantir…"
              />
              {form.sym && (
                <div style={{fontSize:11,color:"#00C896",marginTop:6,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span>✓</span>
                  <strong style={{fontFamily:"monospace"}}>{form.sym}</strong>
                  <span style={{fontSize:10,color:"#3D4A5C"}}>{form.sector}</span>
                  {selectedAsset && <AssetTypePill assetType={selectedAsset.assetType}/>}
                  {selectedAsset?.exchange && (
                    <span style={{fontSize:9,color:"#3D4A5C"}}>{selectedAsset.exchange}</span>
                  )}
                </div>
              )}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{fontSize:11,color:"#8892A4",display:"block",marginBottom:6}}>Shares</label>
                <Input value={form.shares} onChange={(e: any) => setForm(f => ({...f, shares:e.target.value}))} placeholder="e.g. 100" type="number"/>
              </div>
              <div>
                <label style={{fontSize:11,color:"#8892A4",display:"block",marginBottom:6}}>Avg Cost ($)</label>
                <Input value={form.avgCost} onChange={(e: any) => setForm(f => ({...f, avgCost:e.target.value}))} placeholder="e.g. 38.50" type="number"/>
              </div>
            </div>
            <div>
              <label style={{fontSize:11,color:"#8892A4",display:"block",marginBottom:6}}>Purchase Date</label>
              <Input value={form.date} onChange={(e: any) => setForm(f => ({...f, date:e.target.value}))} type="date"/>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={addHolding} disabled={!form.sym||!form.shares||!form.avgCost}>
                Add Holding
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ADD LOT MODAL */}
      {modal === "lot" && editTarget && (
        <Modal title={`Add Lot — ${editTarget.sym}`} onClose={() => setModal(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{fontSize:11,color:"#8892A4",display:"block",marginBottom:6}}>Shares</label>
                <Input value={lotForm.shares} onChange={(e: any) => setLotForm(f => ({...f, shares:e.target.value}))} placeholder="e.g. 50" type="number"/>
              </div>
              <div>
                <label style={{fontSize:11,color:"#8892A4",display:"block",marginBottom:6}}>Price Paid ($)</label>
                <Input value={lotForm.avgCost} onChange={(e: any) => setLotForm(f => ({...f, avgCost:e.target.value}))} placeholder="e.g. 38.50" type="number"/>
              </div>
            </div>
            <div>
              <label style={{fontSize:11,color:"#8892A4",display:"block",marginBottom:6}}>Purchase Date</label>
              <Input value={lotForm.date} onChange={(e: any) => setLotForm(f => ({...f, date:e.target.value}))} type="date"/>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",paddingTop:4}}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={addLot} disabled={!lotForm.shares||!lotForm.avgCost}>Add Lot</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ======================================================================
// WATCHLIST MANAGER
// ======================================================================
const WatchlistManager = ({watchlist, setWatchlist, quotes, showToast = () => {}}: any) => {
  const [symInput,  setSymInput]  = useState("");
  const [addSym,    setAddSym]    = useState("");
  const [addGroup,  setAddGroup]  = useState("Tech Giants");
  const [groups]                  = useState(["Tech Giants","AI & Defense","EV & Growth","Dividend Stocks","Islamic ETFs","ETFs","REITs","Other"]);
  const [view,      setView]      = useState("list");
  const [filter,    setFilter]    = useState("All");
  const isMobile = useIsMobile();

  const handleTickerSelect = (t: AssetMeta) => {
    setSymInput(t.sym + " — " + t.name);
    setAddSym(t.sym);
    // Smart group assignment
    if (t.assetType === "Islamic ETF") setAddGroup("Islamic ETFs");
    else if (t.assetType === "ETF") setAddGroup("ETFs");
    else if (t.assetType === "REIT") setAddGroup("REITs");
    else if (t.sector === "AI & Defense") setAddGroup("AI & Defense");
    else if (t.sector === "EV & Growth") setAddGroup("EV & Growth");
    else if (["Finance","Technology"].includes(t.sector)) setAddGroup("Tech Giants");
    else setAddGroup("Other");
  };

  const add = () => {
    const sym = (addSym || symInput.split(" ")[0]).toUpperCase().trim();
    if (!sym || watchlist.find((w: any) => w.sym === sym)) return;
    setWatchlist((wl: any[]) => [...wl, {id:uid(), sym, group:addGroup}]);
    showToast(`${sym} added to watchlist`, "success");
    setSymInput(""); setAddSym("");
  };

  const remove = (id: string) => setWatchlist((wl: any[]) => wl.filter(w => w.id !== id));

  const allGroups = useMemo(() => {
    const g = new Set([...watchlist.map((w: any) => w.group), ...groups]);
    return ["All", ...Array.from(g)];
  }, [watchlist, groups]);

  const filtered = filter === "All" ? watchlist : watchlist.filter((w: any) => w.group === filter);
  const grouped  = filtered.reduce((acc: any, w: any) => { acc[w.group]=[...(acc[w.group]||[]),w]; return acc; }, {});

  return (
    <div style={{padding:isMobile?"14px":"20px 24px",maxWidth:1100,margin:"0 auto",width:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:isMobile?16:20,fontWeight:800,color:"#F0F4FF",letterSpacing:"-0.03em"}}>Watchlist</div>
          <div style={{fontSize:12,color:"#8892A4",marginTop:2}}>{watchlist.length} symbols tracked</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <div style={{display:"flex",background:"#141820",border:"1px solid #1C2333",borderRadius:7,overflow:"hidden"}}>
            {["list","grid","compact"].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{padding:"6px 10px",background:v===view?"#1C2333":"transparent",border:"none",
                  color:v===view?"#F0F4FF":"#8892A4",cursor:"pointer",fontSize:11,textTransform:"capitalize"}}>
                {v}
              </button>
            ))}
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{background:"#141820",border:"1px solid #1C2333",color:"#8892A4",
              padding:"6px 10px",borderRadius:7,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>
            {allGroups.map(g => <option key={g as string}>{g as string}</option>)}
          </select>
        </div>
      </div>

      {/* Add bar */}
      <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:10,padding:14,marginBottom:16}}>
        <div style={{fontSize:11,color:"#8892A4",marginBottom:8}}>
          Add any stock, ETF, REIT, or Islamic ETF — search by name or ticker
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 200px",minWidth:0}}>
            <TickerAutocomplete
              value={symInput}
              onChange={v => { setSymInput(v); setAddSym(v.split(" ")[0].toUpperCase()); }}
              onSelect={handleTickerSelect}
              placeholder="BBAI, SPUS, BigBear, Palantir, Apple…"
            />
          </div>
          <select value={addGroup} onChange={e => setAddGroup(e.target.value)}
            style={{background:"#141820",border:"1px solid #1C2333",color:"#8892A4",
              padding:"9px 12px",borderRadius:7,fontSize:12,fontFamily:"inherit",cursor:"pointer",flex:"1 1 120px"}}>
            {groups.map(g => <option key={g}>{g}</option>)}
          </select>
          <Btn variant="primary" onClick={add}>+ Add</Btn>
        </div>
      </div>

      {/* List view */}
      {view === "list" && Object.entries(grouped).map(([group, items]) => (
        <div key={group} style={{marginBottom:14}}>
          <div style={{fontSize:10,color:"#8892A4",letterSpacing:"0.14em",fontWeight:600,marginBottom:8}}>
            {(group as string).toUpperCase()}
          </div>
          <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:10,overflow:"hidden"}}>
            {(items as any[]).map((w, i) => {
              const q = quotes[w.sym];
              const asset = SEED_DB.find(s => s.sym === w.sym);
              return (
                <div key={w.id} style={{display:"flex",alignItems:"center",gap:8,
                  padding:isMobile?"10px 12px":"10px 16px",
                  borderTop:i===0?"none":"1px solid #1C2333",flexWrap:isMobile?"wrap":"nowrap"}}
                  onMouseEnter={e => (e.currentTarget as any).style.background="#141820"}
                  onMouseLeave={e => (e.currentTarget as any).style.background="transparent"}>
                  <div style={{display:"flex",alignItems:"center",gap:6,minWidth:70}}>
                    <span style={{fontSize:13,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF"}}>{w.sym}</span>
                    <AssetTypePill assetType={asset?.assetType}/>
                  </div>
                  {!isMobile && asset && (
                    <span style={{fontSize:11,color:"#3D4A5C",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>
                      {asset.name}
                    </span>
                  )}
                  {q ? (
                    <>
                      <span style={{fontSize:13,fontFamily:"monospace",color:"#F0F4FF",minWidth:70,textAlign:"right"}}>${fmt(q.price)}</span>
                      <Pct v={q.pct}/>
                      {!isMobile && <span style={{fontSize:11,color:"#8892A4",minWidth:50,textAlign:"right"}}>{fmtV(q.volume)}</span>}
                      {!isMobile && <span style={{fontSize:11,color:"#8892A4",minWidth:60,textAlign:"right"}}>{fmtB(q.mktcap)}</span>}
                      <div style={{flex:1,minWidth:60}}><Spark sym={w.sym} up={q.pct>=0} w={isMobile?60:80} h={20}/></div>
                      {!isMobile && <LiveDot live={q.live}/>}
                    </>
                  ) : (
                    <span style={{fontSize:11,color:"#3D4A5C",flex:1}}>Loading…</span>
                  )}
                  <button onClick={() => { if(window.confirm(`Remove ${w.sym}?`)) remove(w.id); }}
                    style={{background:"none",border:"none",color:"#3D4A5C",cursor:"pointer",fontSize:14,padding:"2px 4px",marginLeft:"auto"}}
                    onMouseEnter={(e: any) => (e.currentTarget.style.color="#E5484D")}
                    onMouseLeave={(e: any) => (e.currentTarget.style.color="#3D4A5C")}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Grid view */}
      {view === "grid" && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(160px,calc(50% - 4px)),1fr))",gap:8}}>
          {filtered.map((w: any) => {
            const q = quotes[w.sym];
            const asset = SEED_DB.find(s => s.sym === w.sym);
            return (
              <div key={w.id} style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:10,padding:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:14,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF"}}>{w.sym}</span>
                      <AssetTypePill assetType={asset?.assetType}/>
                    </div>
                    <div style={{fontSize:9,color:"#3D4A5C"}}>{w.group}</div>
                  </div>
                  <button onClick={() => remove(w.id)}
                    style={{background:"none",border:"none",color:"#3D4A5C",cursor:"pointer",fontSize:12,padding:"0 2px"}}
                    onMouseEnter={(e: any) => (e.currentTarget.style.color="#E5484D")}
                    onMouseLeave={(e: any) => (e.currentTarget.style.color="#3D4A5C")}>×</button>
                </div>
                {q ? (
                  <>
                    <div style={{fontSize:16,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF",marginBottom:4}}>${fmt(q.price)}</div>
                    <Pct v={q.pct} size={10}/>
                    <div style={{marginTop:8}}><Spark sym={w.sym} up={q.pct>=0} w={140} h={28}/></div>
                  </>
                ) : (
                  <div style={{fontSize:11,color:"#3D4A5C"}}>Loading…</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compact view */}
      {view === "compact" && (
        <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:10,overflow:"hidden"}}>
          {filtered.map((w: any, i: number) => {
            const q = quotes[w.sym];
            const asset = SEED_DB.find(s => s.sym === w.sym);
            return (
              <div key={w.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 14px",
                borderTop:i===0?"none":"1px solid #1C2333"}}>
                <div style={{display:"flex",alignItems:"center",gap:4,minWidth:60}}>
                  <span style={{fontSize:12,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF"}}>{w.sym}</span>
                  <AssetTypePill assetType={asset?.assetType}/>
                </div>
                <span style={{fontSize:10,color:"#3D4A5C",flex:1}}>{w.group}</span>
                {q && (
                  <>
                    <span style={{fontSize:12,fontFamily:"monospace",color:"#F0F4FF"}}>${fmt(q.price)}</span>
                    <Pct v={q.pct} size={10}/>
                  </>
                )}
                <button onClick={() => remove(w.id)}
                  style={{background:"none",border:"none",color:"#3D4A5C",cursor:"pointer",fontSize:12,padding:"1px 4px"}}
                  onMouseEnter={(e: any) => (e.currentTarget.style.color="#E5484D")}
                  onMouseLeave={(e: any) => (e.currentTarget.style.color="#3D4A5C")}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ======================================================================
// GROWTH ENGINE TAB
// ======================================================================
const MktCapGrowthCard = ({holding, quote}: any) => {
  const isMobile = useIsMobile();
  const firstLot = [...holding.lots].sort((a: any, b: any) => a.date.localeCompare(b.date))[0];
  const purchaseMktCap = getHistoricalMktCap(holding.sym, firstLot.date);
  const currentMktCap  = quote?.mktcap || null;
  const totalShares    = holding.lots.reduce((s: number, l: any) => s + l.shares, 0);
  const avgCost        = holding.lots.reduce((s: number, l: any) => s + l.shares * l.avgCost, 0) / totalShares;
  const currentPrice   = quote?.price || avgCost;
  const priceGrowth    = ((currentPrice - avgCost) / avgCost) * 100;
  const mktCapGrowth   = purchaseMktCap && currentMktCap ? ((currentMktCap - purchaseMktCap) / purchaseMktCap) * 100 : null;
  const multiple       = mktCapGrowth ? (currentMktCap / purchaseMktCap) : null;
  const valueDelta     = purchaseMktCap && currentMktCap ? currentMktCap - purchaseMktCap : null;
  const costBasis      = totalShares * avgCost;
  const mktValue       = totalShares * currentPrice;
  const unrealized     = mktValue - costBasis;
  const c              = SECTOR_C[holding.sector] || "#8892A4";

  return (
    <div style={{background:"#0E1117",border:`1px solid ${c}22`,borderRadius:12,overflow:"hidden"}}>
      <div style={{background:`${c}0A`,borderBottom:"1px solid #1C2333",padding:"14px 16px",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,borderRadius:8,background:`${c}22`,border:`1px solid ${c}33`,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:9,fontWeight:800,color:c,fontFamily:"monospace"}}>{holding.sym.slice(0,2)}</span>
          </div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{fontSize:15,fontWeight:800,color:"#F0F4FF",fontFamily:"monospace"}}>{holding.sym}</div>
              <AssetTypePill assetType={holding.assetType}/>
            </div>
            <div style={{fontSize:10,color:"#8892A4"}}>{totalShares} sh · avg ${fmt(avgCost)}</div>
          </div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:isMobile?15:17,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF"}}>${fmt(currentPrice)}</div>
          {quote && <Pct v={quote.pct} size={10}/>}
        </div>
      </div>
      <div style={{padding:"14px 16px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(180px,100%),1fr))",gap:8,marginBottom:14}}>
          {[{label:"Cost Basis",val:"$"+fmt(costBasis),col:"#8892A4"},
            {label:"Mkt Value",val:"$"+fmt(mktValue),col:"#F0F4FF"},
            {label:"P&L",val:(unrealized>=0?"+":"")+"$"+fmt(unrealized),col:pctC(unrealized)}]
            .map(({label,val,col}) => (
              <div key={label} style={{background:"#141820",borderRadius:7,padding:"9px 10px",border:"1px solid #1C2333"}}>
                <div style={{fontSize:9,color:"#3D4A5C",letterSpacing:"0.08em",marginBottom:3}}>{label.toUpperCase()}</div>
                <div style={{fontSize:13,fontWeight:700,color:col,fontFamily:"monospace"}}>{val}</div>
              </div>
            ))
          }
        </div>
        {purchaseMktCap && currentMktCap && (
          <div style={{background:"#141820",border:"1px solid #1C2333",borderRadius:8,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.1em",marginBottom:10}}>MARKET CAP JOURNEY</div>
            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:9,color:"#3D4A5C",marginBottom:2}}>When you bought</div>
                <div style={{fontSize:13,fontWeight:700,color:"#8892A4",fontFamily:"monospace"}}>{fmtB(purchaseMktCap)}</div>
                <div style={{fontSize:9,color:"#3D4A5C",marginTop:1}}>{firstLot.date}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"0 8px",flexShrink:0}}>
                <div style={{fontSize:16,color:pctC(mktCapGrowth as number)}}>→</div>
                <div style={{fontSize:11,fontWeight:700,color:pctC(mktCapGrowth as number)}}>
                  {(mktCapGrowth as number)>=0?"+":""}{fmt(mktCapGrowth)}%
                </div>
                {multiple && <div style={{fontSize:10,color:"#8892A4"}}>{multiple.toFixed(1)}x</div>}
              </div>
              <div style={{flex:1,textAlign:"right"}}>
                <div style={{fontSize:9,color:"#3D4A5C",marginBottom:2}}>Today</div>
                <div style={{fontSize:13,fontWeight:700,color:pctC(mktCapGrowth as number),fontFamily:"monospace"}}>{fmtB(currentMktCap)}</div>
              </div>
            </div>
            {valueDelta && (
              <div style={{fontSize:11,color:"#8892A4",lineHeight:1.5}}>
                Participated in{" "}
                <span style={{color:pctC(valueDelta),fontWeight:600}}>
                  {valueDelta>=0?"+":""}{fmtB(Math.abs(valueDelta))}
                </span>{" "}
                in company value {valueDelta>=0?"creation":"destruction"}.
              </div>
            )}
          </div>
        )}
        <div>
          <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.1em",marginBottom:8}}>GROWTH SINCE PURCHASE</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
            <span style={{fontSize:11,color:"#8892A4",minWidth:120}}>Stock Price</span>
            <div style={{flex:1,height:3,background:"#1C2333",borderRadius:2,overflow:"hidden"}}>
              <div style={{width:Math.min(100,Math.abs(priceGrowth)/8)+"%",height:"100%",background:pctC(priceGrowth),borderRadius:2}}/>
            </div>
            <Pct v={priceGrowth} size={10}/>
          </div>
          {mktCapGrowth !== null && (
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
              <span style={{fontSize:11,color:"#8892A4",minWidth:120}}>Market Cap</span>
              <div style={{flex:1,height:3,background:"#1C2333",borderRadius:2,overflow:"hidden"}}>
                <div style={{width:Math.min(100,Math.abs(mktCapGrowth)/8)+"%",height:"100%",background:pctC(mktCapGrowth),borderRadius:2}}/>
              </div>
              <Pct v={mktCapGrowth} size={10}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const GrowthEngine = ({holdings, quotes}: any) => {
  const enriched = holdings.map((h: any) => {
    const q = quotes[h.sym];
    const totalShares = h.lots.reduce((s: number, l: any) => s + l.shares, 0);
    const avgCost = h.lots.reduce((s: number, l: any) => s + l.shares * l.avgCost, 0) / totalShares;
    const price = q?.price || avgCost;
    const mktVal = totalShares * price;
    return {...h, totalShares, avgCost, price, mktVal, totalRet: ((price-avgCost)/avgCost)*100, q};
  });
  const totalPortfolio = enriched.reduce((s: number, h: any) => s + h.mktVal, 0);
  const contributions = enriched.map((h: any) => ({...h,
    contribution: h.mktVal - h.totalShares * h.avgCost,
    contribPct: ((h.mktVal - h.totalShares * h.avgCost) / totalPortfolio) * 100,
  })).sort((a: any, b: any) => b.contribution - a.contribution);
  const isMobile = useIsMobile();

  return (
    <div style={{padding:isMobile?"14px":"20px 24px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:isMobile?16:20,fontWeight:800,color:"#F0F4FF",letterSpacing:"-0.03em",marginBottom:4}}>
          Market Cap Growth Engine
        </div>
        <div style={{fontSize:12,color:"#8892A4"}}>How each business grew since you invested — beyond P&L</div>
      </div>
      <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,padding:16,marginBottom:16}}>
        <SecLabel>Portfolio Return Contribution</SecLabel>
        {contributions.map((h: any) => (
          <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF",minWidth:60}}>{h.sym}</span>
            <AssetTypePill assetType={h.assetType}/>
            <div style={{flex:1,minWidth:80,height:6,background:"#141820",borderRadius:3,overflow:"hidden"}}>
              <div style={{width:Math.min(100,Math.abs(h.contribPct)*3)+"%",height:"100%",
                background:h.contribution>=0?"#00C896":"#E5484D",borderRadius:3,opacity:0.85}}/>
            </div>
            <span style={{fontSize:11,fontFamily:"monospace",color:pctC(h.contribPct),minWidth:54,textAlign:"right"}}>
              {h.contribPct>=0?"+":""}{fmt(h.contribPct)}%
            </span>
            <span style={{fontSize:11,fontFamily:"monospace",color:pctC(h.contribution),minWidth:80,textAlign:"right"}}>
              {h.contribution>=0?"+":""}${fmt(h.contribution)}
            </span>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(320px,100%),1fr))",gap:12}}>
        {enriched.map((h: any) => <MktCapGrowthCard key={h.id} holding={h} quote={quotes[h.sym]}/>)}
      </div>
    </div>
  );
};

// ======================================================================
// DASHBOARD
// ======================================================================
const Dashboard = ({holdings, watchlist, quotes, lastUpdate}: any) => {
  const isMobile = useIsMobile();
  const enriched = holdings.map((h: any) => {
    const q = quotes[h.sym];
    const totalShares = h.lots.reduce((s: number, l: any) => s + l.shares, 0);
    const avgCost = h.lots.reduce((s: number, l: any) => s + l.shares * l.avgCost, 0) / totalShares;
    const price = q?.price || avgCost;
    const mktVal = totalShares * price;
    return {...h, totalShares, avgCost, price, mktVal, totalRet: ((price-avgCost)/avgCost)*100, dayPct: q?.pct||0, q};
  });
  const totalVal  = enriched.reduce((s: number, h: any) => s + h.mktVal, 0);
  const totalCost = enriched.reduce((s: number, h: any) => s + h.totalShares * h.avgCost, 0);
  const totalRet  = ((totalVal - totalCost) / totalCost) * 100;
  const dayGain   = enriched.reduce((s: number, h: any) => s + h.mktVal * (h.dayPct / 100), 0);
  const withW     = enriched.map((h: any) => ({...h, weight: (h.mktVal / totalVal) * 100}));
  const best      = [...withW].sort((a: any, b: any) => b.totalRet - a.totalRet)[0];
  const worst     = [...withW].sort((a: any, b: any) => a.totalRet - b.totalRet)[0];
  const sectorMap: Record<string, number> = {};
  withW.forEach((h: any) => { sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.weight; });

  const kpis = [
    {l:"Portfolio Value",  v:"$"+fmt(totalVal),    c:"#F0F4FF"},
    {l:"Today's P&L",      v:(dayGain>=0?"+":"")+"$"+fmt(Math.abs(dayGain)), c:pctC(dayGain)},
    {l:"Total Return",     v:(totalRet>=0?"+":"")+fmt(totalRet)+"%", c:pctC(totalRet)},
    {l:"Invested",         v:"$"+fmt(totalCost),   c:"#8892A4"},
    {l:"Holdings",         v:holdings.length+" pos",c:"#F0F4FF"},
    {l:"Best",             v:best?.sym||"-",        c:"#00C896"},
    {l:"Watch",            v:worst?.sym||"-",       c:"#E5484D"},
  ];

  return (
    <div style={{padding:isMobile?"14px":"20px 24px",maxWidth:1400,margin:"0 auto",width:"100%"}}>
      <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:16,width:"100%"}}>
        {kpis.map(({l,v,c}) => (
          <div key={l} style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:10,padding:"11px 12px"}}>
            <div style={{fontSize:9,color:"#3D4A5C",letterSpacing:"0.1em",marginBottom:4}}>{l.toUpperCase()}</div>
            <div style={{fontSize:isMobile?14:15,fontWeight:700,color:c,fontFamily:"monospace"}}>{v}</div>
          </div>
        ))}
      </div>
      <div className="dash-main" style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:14,width:"100%"}}>
        <div>
          <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,overflow:"hidden",marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #1C2333",alignItems:"center"}}>
              <span style={{fontSize:10,color:"#8892A4",letterSpacing:"0.14em",fontWeight:600}}>HOLDINGS</span>
              {lastUpdate && <span style={{fontSize:9,color:"#3D4A5C"}}>Updated {Math.round((Date.now()-lastUpdate)/1000)}s ago</span>}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",width:"100%",minWidth:isMobile?280:480}}>
                <thead>
                  <tr style={{background:"#141820"}}>
                    {["Symbol","Price","Value","Today","Return","Weight"].map((h,i)=>(
                      <th key={h} className={i===2?"col-value":i===3?"col-today":i===5?"col-weight":""}
                        style={{padding:"8px "+(i===0?"16px":"8px"),textAlign:i===0?"left":"right",
                        fontSize:9,color:"#3D4A5C",letterSpacing:"0.06em",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {withW.map((h: any) => (
                    <tr key={h.id} style={{borderTop:"1px solid #1C2333"}}
                      onMouseEnter={e=>(e.currentTarget.style.background="#141820")}
                      onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                      <td className="tbl-sym tbl-cell" style={{padding:"9px 16px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:20,height:20,borderRadius:4,
                            background:(SECTOR_C[h.sector]||"#888")+"22",
                            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            <span style={{fontSize:7,fontWeight:800,color:SECTOR_C[h.sector]||"#888",fontFamily:"monospace"}}>{h.sym.slice(0,2)}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:3}}>
                            <span style={{fontSize:isMobile?11:12,fontWeight:700,color:"#F0F4FF",fontFamily:"monospace"}}>{h.sym}</span>
                            <AssetTypePill assetType={h.assetType}/>
                          </div>
                        </div>
                      </td>
                      <td className="tbl-num tbl-cell" style={{padding:"9px 8px",textAlign:"right",fontSize:12,fontFamily:"monospace",color:"#F0F4FF"}}>${fmt(h.price)}</td>
                      <td className="col-value" style={{padding:"9px 8px",textAlign:"right",fontSize:12,fontFamily:"monospace",color:"#8892A4"}}>${fmt(h.mktVal)}</td>
                      <td className="col-today" style={{padding:"9px 8px",textAlign:"right"}}><Pct v={h.dayPct}/></td>
                      <td className="tbl-num" style={{padding:"9px 8px",textAlign:"right"}}><Pct v={h.totalRet}/></td>
                      <td className="col-weight" style={{padding:"9px 8px",textAlign:"right",fontSize:11,fontFamily:"monospace",color:"#8892A4"}}>{fmt(h.weight,1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* Watchlist preview */}
          <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #1C2333"}}>
              <span style={{fontSize:10,color:"#8892A4",letterSpacing:"0.14em",fontWeight:600}}>WATCHLIST</span>
            </div>
            <div className="watchlist-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:0}}>
              {watchlist.slice(0,6).map((w: any, i: number) => {
                const q = quotes[w.sym];
                const cols = isMobile ? 2 : 3;
                return (
                  <div key={w.id} style={{padding:"11px 14px",
                    borderRight:(i+1)%cols!==0?"1px solid #1C2333":"none",
                    borderTop:i>=cols?"1px solid #1C2333":"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                      <span style={{fontSize:12,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF"}}>{w.sym}</span>
                      {q && <Pct v={q.pct} size={10}/>}
                    </div>
                    {q && (
                      <>
                        <div style={{fontSize:14,fontWeight:700,fontFamily:"monospace",color:"#F0F4FF",marginBottom:4}}>${fmt(q.price)}</div>
                        <Spark sym={w.sym} up={q.pct>=0} w={isMobile?100:110} h={20}/>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* Right panel */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,padding:14}}>
            <SecLabel>Allocation</SecLabel>
            {Object.entries(sectorMap).sort((a,b) => b[1]-a[1]).map(([s,pct]) => (
              <div key={s} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:"#8892A4",display:"flex",alignItems:"center",gap:5}}>
                    <span style={{width:5,height:5,borderRadius:"50%",background:SECTOR_C[s]||"#888",display:"inline-block",flexShrink:0}}/>
                    {s}
                  </span>
                  <span style={{fontSize:11,fontFamily:"monospace",color:SECTOR_C[s]||"#888"}}>{fmt(pct,1)}%</span>
                </div>
                <div style={{height:3,background:"#1C2333",borderRadius:2,overflow:"hidden"}}>
                  <div style={{width:pct+"%",height:"100%",background:SECTOR_C[s]||"#888",borderRadius:2,maxWidth:"100%"}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,padding:14}}>
            <SecLabel>Risk Snapshot</SecLabel>
            {[
              {l:"Diversification", v:"71/100", c:"#00C896"},
              {l:"Tech Weight", v:fmt(sectorMap["Technology"]||0,1)+"%", c:(sectorMap["Technology"]||0)>50?"#E5484D":"#F59E0B"},
              {l:"Positions", v:String(holdings.length), c:"#8892A4"},
              {l:"Sectors", v:String(Object.keys(sectorMap).length), c:"#8892A4"},
            ].map(({l,v,c}) => (
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1C2333"}}>
                <span style={{fontSize:11,color:"#8892A4"}}>{l}</span>
                <span style={{fontSize:12,fontWeight:600,color:c,fontFamily:"monospace"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ======================================================================
// NEWS INTELLIGENCE
// ======================================================================
const SEED_NEWS = [
  {id:"n1",headline:"NVIDIA signs $10B AI infrastructure deal with Saudi Aramco",source:"Reuters",time:"18m ago",category:"Technology",tickers:["NVDA","AMD","TSM","SMCI"],sentiment:"bullish",impact:"high",summary:"NVIDIA will supply next-gen H200 clusters to Aramco's new data center hub in Riyadh, securing one of the largest sovereign AI contracts of 2025."},
  {id:"n2",headline:"Apple delays on-device AI features in EU citing regulatory concerns",source:"Bloomberg",time:"1h ago",category:"Technology",tickers:["AAPL","MSFT","GOOGL"],sentiment:"bearish",impact:"medium",summary:"Apple confirmed iOS 18.2 AI features will not launch in the EU until at least Q2 2026, as the company navigates Digital Markets Act compliance."},
  {id:"n3",headline:"JPMorgan raises full-year NII guidance to $94B on rate resilience",source:"WSJ",time:"2h ago",category:"Macro",tickers:["JPM","BAC","GS","WFC"],sentiment:"bullish",impact:"high",summary:"CEO Jamie Dimon cited stronger-than-expected loan growth and sustained net interest margin as drivers, outpacing analyst consensus of $91B."},
  {id:"n4",headline:"Fed minutes signal two rate cuts remain possible in 2025",source:"FT",time:"3h ago",category:"Macro",tickers:["SPY","QQQ","VOO","GLD"],sentiment:"bullish",impact:"high",summary:"FOMC participants expressed growing confidence that inflation is returning to target, leaving the door open for 50bps of cuts before year-end."},
  {id:"n5",headline:"SPUS Islamic ETF hits record AUM — halal investing gains traction",source:"Bloomberg",time:"4h ago",category:"Islamic Finance",tickers:["SPUS","HLAL","UMMA","SPSK"],sentiment:"bullish",impact:"medium",summary:"SP Funds' S&P 500 Sharia ETF surpassed $1B in assets under management as retail demand for Sharia-compliant equity vehicles accelerates globally."},
  {id:"n6",headline:"BigBear.ai secures Panama logistics AI contract — commercial pivot",source:"Benzinga",time:"5h ago",category:"AI & Defense",tickers:["BBAI","PLTR","AI"],sentiment:"bullish",impact:"high",summary:"BigBear.ai announced a foundational deal to deploy its AI-powered supply chain platform in Panama, marking a strategic shift from pure defense to commercial logistics."},
  {id:"n7",headline:"Microsoft Azure growth reaccelerates to 31% — Copilot adoption cited",source:"CNBC",time:"6h ago",category:"Technology",tickers:["MSFT","AMZN","GOOGL"],sentiment:"bullish",impact:"high",summary:"Cloud revenue momentum returned. Management said Copilot Enterprise contributed approximately 4 percentage points of growth."},
  {id:"n8",headline:"Exxon Mobil expands Permian output — crude falls on OPEC+ signals",source:"Bloomberg",time:"7h ago",category:"Energy",tickers:["XOM","CVX","OXY"],sentiment:"bearish",impact:"medium",summary:"WTI crude fell 2.1% after OPEC+ indicated it may accelerate supply increases in Q3, compressing margins for US shale producers."},
  {id:"n9",headline:"Visa cross-border volume hits all-time high — travel recovery intact",source:"Visa IR",time:"8h ago",category:"Finance",tickers:["V","MA","PYPL"],sentiment:"bullish",impact:"medium",summary:"Cross-border payment volume grew 18% year-over-year in May. Visa guided full-year revenue growth of 12-13%."},
  {id:"n10",headline:"Fed rate cuts positive for REITs — analysts upgrade sector",source:"Barron's",time:"10h ago",category:"Real Estate",tickers:["O","AMT","PLD","VNQ"],sentiment:"bullish",impact:"medium",summary:"With two expected Fed cuts, REIT valuations are set to benefit from lower discount rates. Realty Income and Prologis cited as top picks."},
  {id:"n11",headline:"Palantir wins multi-year DoD AI modernization contract",source:"Reuters",time:"12h ago",category:"AI & Defense",tickers:["PLTR","BBAI","AI"],sentiment:"bullish",impact:"high",summary:"The Department of Defense awarded Palantir a $480M contract to deploy its AI platform across military logistics operations."},
  {id:"n12",headline:"Amazon Web Services hits 38.7% operating margin — AI inference key driver",source:"TechCrunch",time:"14h ago",category:"Technology",tickers:["AMZN","MSFT","GOOGL"],sentiment:"bullish",impact:"high",summary:"AWS operating income beat consensus by $800M. Amazon Bedrock now serves over 50,000 active enterprise customers."},
];

const FILTER_TAGS = ["All","Portfolio","Watchlist","High Impact","Technology","AI & Defense","Islamic Finance","Macro","Finance","Energy","Real Estate"];

const NewsCard = ({article, holdingSyms, watchlistSyms, isMobile}: any) => {
  const [expanded, setExpanded] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string|null>(null);
  const [aiLoading,  setAiLoading]  = useState(false);

  const isPortfolio  = article.tickers.some((t: string) => holdingSyms.includes(t));
  const isWatchlist  = article.tickers.some((t: string) => watchlistSyms.includes(t));
  const sentColor    = article.sentiment === "bullish" ? "#00C896" : article.sentiment === "bearish" ? "#E5484D" : "#F59E0B";
  const impactColor  = article.impact === "high" ? "#E5484D" : article.impact === "medium" ? "#F59E0B" : "#3D4A5C";

  const getAiAnalysis = async () => {
    if (aiAnalysis) return;
    setAiLoading(true);
    try {
      const txt = await callAI([{role:"user",content:`News headline: "${article.headline}"\nSummary: ${article.summary}\nAffected tickers: ${article.tickers.join(", ")}\nUser holds: ${holdingSyms.join(", ")}\n\nGive a 2-sentence portfolio impact assessment. Be specific and direct. No disclaimer.`}], 200);
      setAiAnalysis(txt);
    } catch (_e) {
      setAiAnalysis("Analysis unavailable.");
    }
    setAiLoading(false);
  };

  return (
    <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:10,overflow:"hidden",
      borderLeft:`3px solid ${sentColor}`}}>
      <div style={{padding:isMobile?"12px":"14px 16px",cursor:"pointer"}} onClick={() => { setExpanded(e => !e); if(!expanded) getAiAnalysis(); }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:8}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:isMobile?13:14,fontWeight:700,color:"#F0F4FF",lineHeight:1.4,marginBottom:4}}>
              {article.headline}
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:10,color:"#3D4A5C"}}>{article.source}</span>
              <span style={{fontSize:10,color:"#3D4A5C"}}>·</span>
              <span style={{fontSize:10,color:"#3D4A5C"}}>{article.time}</span>
              {isPortfolio && (
                <span style={{fontSize:9,color:"#00C896",background:"#00C89614",border:"1px solid #00C89630",
                  borderRadius:4,padding:"1px 6px",fontWeight:600,letterSpacing:"0.03em"}}>IN PORTFOLIO</span>
              )}
              {isWatchlist && !isPortfolio && (
                <span style={{fontSize:9,color:"#3B82F6",background:"#3B82F614",border:"1px solid #3B82F630",
                  borderRadius:4,padding:"1px 6px",fontWeight:600,letterSpacing:"0.03em"}}>WATCHING</span>
              )}
              <span style={{fontSize:9,color:impactColor,background:impactColor+"14",
                borderRadius:4,padding:"1px 6px",fontWeight:600,letterSpacing:"0.03em",marginLeft:"auto"}}>
                {article.impact.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {article.tickers.map((t: string) => (
            <span key={t} style={{fontSize:10,fontFamily:"monospace",fontWeight:700,
              color: holdingSyms.includes(t) ? "#00C896" : watchlistSyms.includes(t) ? "#3B82F6" : "#3D4A5C",
              background: holdingSyms.includes(t) ? "#00C89614" : watchlistSyms.includes(t) ? "#3B82F614" : "#1C2333",
              border: `1px solid ${holdingSyms.includes(t)?"#00C89630":watchlistSyms.includes(t)?"#3B82F630":"#1C2333"}`,
              borderRadius:4,padding:"1px 6px"}}>
              {t}
            </span>
          ))}
        </div>
      </div>
      {expanded && (
        <div style={{padding:isMobile?"0 12px 12px":"0 16px 14px",borderTop:"1px solid #1C2333"}}>
          <p style={{fontSize:12,color:"#8892A4",lineHeight:1.6,margin:"12px 0 10px"}}>{article.summary}</p>
          {aiLoading && (
            <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#3D4A5C",padding:"8px 0"}}>
              <span style={{animation:"spin 0.7s linear infinite",display:"inline-block",fontSize:10}}>◌</span>
              Generating portfolio impact…
            </div>
          )}
          {aiAnalysis && !aiLoading && (
            <div style={{background:"linear-gradient(135deg,#00C89608,#3B82F608)",border:"1px solid #3B82F620",
              borderRadius:8,padding:"10px 12px",marginTop:8}}>
              <div style={{fontSize:9,color:"#3B82F6",letterSpacing:"0.1em",marginBottom:5,fontWeight:600}}>AI PORTFOLIO IMPACT</div>
              <p style={{fontSize:12,color:"#8892A4",lineHeight:1.6,margin:0}}>{aiAnalysis}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DailyBriefing = ({holdings, watchlist}: any) => {
  const [dismissed, setDismissed] = useState(false);
  const [brief,     setBrief]     = useState<any>(null);
  const [loading,   setLoading]   = useState(false);
  if (dismissed) return null;

  const generate = async () => {
    setLoading(true);
    try {
      const holdingList = holdings.map((h: any) => h.sym).join(", ");
      const watchList   = watchlist.map((w: any) => w.sym).join(", ");
      const prompt = `You are a portfolio analyst. Generate a morning brief for this investor.
Holdings: ${holdingList}
Watchlist: ${watchList}
Date: ${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}

Return ONLY a JSON array of 4 objects: [{icon,title,body,ticker,risk}]
- icon: single emoji
- title: 5-8 word action title
- body: 1-2 sentence insight (include specific tickers from their portfolio)
- ticker: most relevant ticker or null
- risk: "high"|"medium"|"low"
Return ONLY the JSON array, no markdown.`;
      const txt = await callAI([{role:"user",content:prompt}]);
      setBrief(JSON.parse(txt.replace(/```json|```/g,"").trim()));
    } catch (_e) {
      setBrief([{icon:"⚡",title:"Brief Unavailable",body:"Could not generate briefing. Check your connection.",ticker:null,risk:"low"}]);
    }
    setLoading(false);
  };

  const riskColor = (r: string) => r==="high"?"#E5484D":r==="medium"?"#F59E0B":"#00C896";

  return (
    <div style={{background:"linear-gradient(135deg,#0E1117,#141820)",border:"1px solid #252E40",
      borderRadius:12,marginBottom:16,overflow:"hidden"}}>
      <div style={{padding:"14px 16px",borderBottom:"1px solid #1C2333",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,
            background:"linear-gradient(135deg,#00C896,#3B82F6)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>🌅</div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#F0F4FF"}}>Daily Portfolio Brief</div>
            <div style={{fontSize:10,color:"#3D4A5C"}}>
              {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {!brief && !loading && (
            <button onClick={generate}
              style={{background:"linear-gradient(135deg,#00C896,#0EA5E9)",border:"none",color:"#07090D",
                padding:"7px 14px",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:700,letterSpacing:"0.04em"}}>
              Generate Brief
            </button>
          )}
          <button onClick={() => setDismissed(true)}
            style={{background:"none",border:"none",color:"#3D4A5C",cursor:"pointer",fontSize:18,padding:"0 4px"}}>×</button>
        </div>
      </div>
      {loading && (
        <div style={{padding:"20px 16px",display:"flex",alignItems:"center",gap:10,color:"#8892A4",fontSize:13}}>
          <span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:14}}>◌</span>
          Analysing your portfolio…
        </div>
      )}
      {brief && (
        <div style={{padding:"4px 0"}}>
          {brief.map((b: any, i: number) => (
            <div key={i} style={{display:"flex",gap:12,padding:"12px 16px",
              borderBottom:i < brief.length-1?"1px solid #1C2333":"none",alignItems:"flex-start"}}>
              <span style={{fontSize:18,flexShrink:0,marginTop:1}}>{b.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#F0F4FF"}}>{b.title}</span>
                  {b.ticker && (
                    <span style={{fontSize:9,fontFamily:"monospace",fontWeight:700,
                      color:"#3B82F6",background:"#3B82F618",padding:"1px 5px",borderRadius:3}}>{b.ticker}</span>
                  )}
                  <span style={{fontSize:9,color:riskColor(b.risk),background:riskColor(b.risk)+"14",
                    padding:"1px 6px",borderRadius:3,fontWeight:600,letterSpacing:"0.04em",marginLeft:"auto"}}>
                    {b.risk?.toUpperCase()} RISK
                  </span>
                </div>
                <div style={{fontSize:12,color:"#8892A4",lineHeight:1.55}}>{b.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!brief && !loading && (
        <div style={{padding:"16px",fontSize:12,color:"#3D4A5C",textAlign:"center"}}>
          Generate a personalised morning brief based on your holdings and watchlist
        </div>
      )}
    </div>
  );
};

const NewsIntelligence = ({holdings, watchlist}: any) => {
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQ,      setSearchQ]      = useState("");
  const isMobile = useIsMobile();
  const holdingSyms   = holdings.map((h: any) => h.sym);
  const watchlistSyms = watchlist.map((w: any) => w.sym);

  const filtered = useMemo(() => {
    let news = SEED_NEWS;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      news = news.filter(n =>
        n.headline.toLowerCase().includes(q) ||
        n.tickers.some(t => t.toLowerCase().includes(q)) ||
        n.source.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q)
      );
    }
    if (activeFilter === "Portfolio")    news = news.filter(n => n.tickers.some(t => holdingSyms.includes(t)));
    else if (activeFilter === "Watchlist") news = news.filter(n => n.tickers.some(t => watchlistSyms.includes(t)));
    else if (activeFilter === "High Impact") news = news.filter(n => n.impact === "high");
    else if (activeFilter !== "All") news = news.filter(n => n.category === activeFilter || n.tickers.some(t => t === activeFilter));
    return news;
  }, [activeFilter, searchQ, holdingSyms, watchlistSyms]);

  const portfolioCount  = SEED_NEWS.filter(n => n.tickers.some(t => holdingSyms.includes(t))).length;
  const highImpactCount = SEED_NEWS.filter(n => n.impact === "high").length;

  return (
    <div style={{padding:isMobile?"14px":"20px 24px",maxWidth:1100,margin:"0 auto",width:"100%"}}>
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:10,marginBottom:12}}>
          <div>
            <div style={{fontSize:isMobile?16:20,fontWeight:800,color:"#F0F4FF",letterSpacing:"-0.03em",marginBottom:3}}>
              News Intelligence
            </div>
            <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#8892A4"}}>{SEED_NEWS.length} articles monitored</span>
              <span style={{fontSize:11,color:"#E5484D",background:"#E5484D14",padding:"2px 8px",borderRadius:4,fontWeight:600}}>
                ↑ {portfolioCount} affect your portfolio
              </span>
              <span style={{fontSize:11,color:"#F59E0B",background:"#F59E0B14",padding:"2px 8px",borderRadius:4,fontWeight:600}}>
                ! {highImpactCount} high impact
              </span>
            </div>
          </div>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search news, tickers, sources…"
            style={{background:"#0E1117",border:"1px solid #1C2333",color:"#F0F4FF",
              padding:"8px 14px",borderRadius:8,fontSize:12,width:isMobile?"100%":"220px",minWidth:0}}/>
        </div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
          {FILTER_TAGS.map(tag => {
            const isActive = activeFilter === tag;
            const count = tag === "Portfolio" ? portfolioCount : tag === "High Impact" ? highImpactCount : null;
            return (
              <button key={tag} onClick={() => setActiveFilter(tag)}
                style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${isActive?"#3B82F6":"#1C2333"}`,
                  background:isActive?"#3B82F618":"transparent",
                  color:isActive?"#3B82F6":"#8892A4",cursor:"pointer",fontSize:11,
                  whiteSpace:"nowrap",fontWeight:isActive?600:400,flexShrink:0,
                  display:"flex",alignItems:"center",gap:5,transition:"all 0.15s"}}>
                {tag}
                {count !== null && (
                  <span style={{fontSize:9,background:isActive?"#3B82F6":"#1C2333",
                    color:isActive?"#07090D":"#8892A4",borderRadius:10,padding:"0 5px",fontWeight:700}}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <DailyBriefing holdings={holdings} watchlist={watchlist}/>
      {filtered.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px 0",color:"#3D4A5C"}}>
          <div style={{fontSize:32,marginBottom:10}}>🔍</div>
          <div style={{fontSize:14,marginBottom:4}}>No articles match this filter</div>
          <div style={{fontSize:12}}>Try a different filter or search term</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map(article => (
            <NewsCard key={article.id} article={article}
              holdingSyms={holdingSyms} watchlistSyms={watchlistSyms} isMobile={isMobile}/>
          ))}
        </div>
      )}
    </div>
  );
};

// ======================================================================
// MARKET BAR (live-looking indices strip)
// ======================================================================
const MARKET_BAR = [
  {l:"S&P 500",v:"5,431",p:"+0.62%",up:true},
  {l:"NASDAQ", v:"17,689",p:"+0.91%",up:true},
  {l:"DOW",    v:"39,110",p:"+0.15%",up:true},
  {l:"VIX",    v:"13.42", p:"-4.21%",up:false},
  {l:"10Y",    v:"4.318%",p:"+0.02%",up:true, n:true},
  {l:"BTC",    v:"$69,812",p:"+1.44%",up:true},
  {l:"GOLD",   v:"$2,351",p:"+0.82%",up:true},
];

// ======================================================================
// TOAST
// ======================================================================
const Toast = ({toast}: any) => {
  if (!toast) return null;
  const colors: Record<string, any> = {
    success: {bg:"#00C89618",border:"#00C89640",color:"#00C896",icon:"✓"},
    error:   {bg:"#E5484D18",border:"#E5484D40",color:"#E5484D",icon:"✕"},
    warn:    {bg:"#F59E0B18",border:"#F59E0B40",color:"#F59E0B",icon:"!"},
    info:    {bg:"#3B82F618",border:"#3B82F640",color:"#3B82F6",icon:"i"},
  };
  const s = colors[toast.type] || colors.info;
  return (
    <div role="alert" aria-live="polite" style={{position:"fixed",bottom:80,left:"50%",
      transform:"translateX(-50%)",zIndex:9999,background:s.bg,
      border:`1px solid ${s.border}`,borderRadius:10,padding:"10px 18px",
      display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 24px #00000055",
      animation:"slideUp 0.2s ease",whiteSpace:"nowrap",maxWidth:"90vw"}}>
      <span style={{fontSize:14,color:s.color,fontWeight:700}}>{s.icon}</span>
      <span style={{fontSize:13,color:"#F0F4FF"}}>{toast.msg}</span>
    </div>
  );
};

// ======================================================================
// PERSISTENCE
// ======================================================================
const LS_HOLDINGS  = "sp_holdings_v2";
const LS_WATCHLIST = "sp_watchlist_v2";
const loadLS = (key: string, fallback: any) => {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const saveLS = (key: string, val: any) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

// ======================================================================
// MOBILE HOOK
// ======================================================================
const useIsMobile = () => {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(window.innerWidth < 640);
    const h = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", h, {passive:true});
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
};

// ======================================================================
// ERROR BOUNDARY
// ======================================================================
class ErrorBoundary extends React.Component<{children: React.ReactNode},{error: Error|null}> {
  constructor(props: any) { super(props); this.state = {error:null}; }
  static getDerivedStateFromError(error: Error) { return {error}; }
  render() {
    if (this.state.error) {
      return (
        <div style={{background:"#07090D",minHeight:"100vh",display:"flex",alignItems:"center",
          justifyContent:"center",padding:20,fontFamily:"monospace"}}>
          <div style={{background:"#0E1117",border:"1px solid #E5484D",borderRadius:12,padding:24,maxWidth:600,width:"100%"}}>
            <div style={{color:"#E5484D",fontSize:14,fontWeight:700,marginBottom:12}}>Application Error</div>
            <div style={{color:"#F0F4FF",fontSize:13,marginBottom:8}}>{this.state.error.message}</div>
            <pre style={{color:"#8892A4",fontSize:10,overflowX:"auto",background:"#141820",padding:12,
              borderRadius:6,whiteSpace:"pre-wrap"}}>{this.state.error.stack}</pre>
            <button onClick={() => window.location.reload()}
              style={{marginTop:16,background:"#00C896",border:"none",borderRadius:8,
                color:"#07090D",padding:"10px 20px",cursor:"pointer",fontWeight:700}}>
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ======================================================================
// ROOT APP
// ======================================================================
export default function App() {
  const [tab,            setTab]           = useState("dashboard");
  const [holdings,       setHoldingsRaw]   = useState(() => loadLS(LS_HOLDINGS,  DEFAULT_HOLDINGS));
  const [watchlist,      setWatchlistRaw]  = useState(() => loadLS(LS_WATCHLIST, DEFAULT_WATCHLIST));
  const [quotes,         setQuotes]        = useState<Record<string,any>>({});
  const [lastUpdate,     setLastUpdate]    = useState<number|null>(null);
  const [time,           setTime]          = useState(new Date());
  const [fetching,       setFetching]      = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen]= useState(false);
  const [toast,          setToast]         = useState<any>(null);
  const isMobile  = useIsMobile();
  const fetchRef  = useRef(false);
  const toastRef  = useRef<any>(null);

  const setHoldings = useCallback((updater: any) => {
    setHoldingsRaw((prev: any) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveLS(LS_HOLDINGS, next);
      return next;
    });
  }, []);

  const setWatchlist = useCallback((updater: any) => {
    setWatchlistRaw((prev: any) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveLS(LS_WATCHLIST, next);
      return next;
    });
  }, []);

  const showToast = useCallback((msg: string, type = "success") => {
    setToast({msg, type});
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const allSymbols = useMemo(() => {
    const s = new Set<string>();
    (holdings as any[]).forEach(h => s.add(h.sym));
    (watchlist as any[]).forEach(w => s.add(w.sym));
    return Array.from(s);
  }, [holdings, watchlist]);

  const refreshQuotes = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true; setFetching(true);
    const results: Record<string,any> = {};
    for (const sym of allSymbols) {
      try { results[sym] = await fetchQuote(sym); } catch { results[sym] = getMockQuote(sym); }
      await new Promise(r => setTimeout(r, 100)); // rate-limit spacing
    }
    setQuotes(prev => ({...prev, ...results}));
    setLastUpdate(Date.now());
    fetchRef.current = false; setFetching(false);
  }, [allSymbols]);

  useEffect(() => { refreshQuotes(); }, []);
  useEffect(() => { const id = setInterval(refreshQuotes, 60_000); return () => clearInterval(id); }, [refreshQuotes]);
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);

  const mktOpen = (() => { const h = time.getUTCHours() - 4; return h >= 9 && h < 16; })();

  const nav = [
    {id:"dashboard", label:"Dashboard", icon:"◎"},
    {id:"holdings",  label:"Holdings",  icon:"▤"},
    {id:"watchlist", label:"Watchlist", icon:"★"},
    {id:"news",      label:"News",      icon:"◉"},
    {id:"growth",    label:"Growth",    icon:"↑"},
  ];

  // News alert badge
  const holdingSyms = (holdings as any[]).map(h => h.sym);
  const newsAlerts  = SEED_NEWS.filter(n => n.tickers.some(t => holdingSyms.includes(t)) && n.impact === "high").length;

  return (
    <ErrorBoundary>
    <div style={{background:"#07090D",height:"100vh",maxHeight:"100vh",
      fontFamily:"-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
      color:"#F0F4FF",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;text-size-adjust:100%}
        body{overflow-x:hidden;max-width:100vw;-webkit-font-smoothing:antialiased}
        img{max-width:100%;height:auto;display:block}
        table{border-collapse:collapse;width:100%}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#07090D}
        ::-webkit-scrollbar-thumb{background:#1C2333;border-radius:2px}
        input,select,textarea{outline:none;font-family:inherit;-webkit-appearance:none}
        input:focus,select:focus,textarea:focus{border-color:#3B82F6!important}
        input::placeholder,textarea::placeholder{color:#3D4A5C}
        input[type=number]{-moz-appearance:textfield}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
        button{cursor:pointer;font-family:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        button:focus-visible,a:focus-visible{outline:2px solid #3B82F6;outline-offset:2px;border-radius:4px}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @supports(padding-bottom:env(safe-area-inset-bottom)){
          .bottom-nav{padding-bottom:calc(6px + env(safe-area-inset-bottom))!important}
          .nav-top{padding-top:env(safe-area-inset-top)}
        }
        @media(prefers-reduced-motion:reduce){*{animation-duration:0.01ms!important;transition-duration:0.01ms!important}}
        @media(forced-colors:active){button:focus,a:focus{outline:2px solid ButtonText}}
        @media(max-width:639px){
          .desktop-only{display:none!important}
          .mobile-only{display:flex!important}
          .mobile-bottom-nav{display:flex!important}
          .col-value,.col-today,.col-weight,.col-actions-extra{display:none!important}
          .tbl-cell{padding:8px 8px!important;font-size:11px!important}
          .tbl-sym{padding:8px 10px!important}
          .tbl-num{padding:8px 6px!important;font-size:11px!important}
          .kpi-grid{grid-template-columns:1fr 1fr!important}
          .watchlist-grid{grid-template-columns:1fr 1fr!important}
          .dash-main{grid-template-columns:1fr!important}
        }
        @media(min-width:640px) and (max-width:1023px){
          .desktop-only{display:flex!important}
          .mobile-only{display:none!important}
          .mobile-bottom-nav{display:none!important}
          .col-value,.col-today,.col-weight{display:table-cell!important}
          .kpi-grid{grid-template-columns:repeat(3,1fr)!important}
          .dash-main{grid-template-columns:1fr 260px!important}
        }
        @media(min-width:1024px){
          .desktop-only{display:flex!important}
          .mobile-only{display:none!important}
          .mobile-bottom-nav{display:none!important}
          .col-value,.col-today,.col-weight{display:table-cell!important}
          .kpi-grid{grid-template-columns:repeat(7,1fr)!important}
          .dash-main{grid-template-columns:1fr 300px!important}
        }
        @media(min-width:1920px){.page-container{max-width:1600px!important;margin:0 auto!important}}
      `}</style>

      {/* TOP NAV */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:isMobile?"10px 14px":"11px 24px",borderBottom:"1px solid #1C2333",
        background:"#07090D",position:"sticky",top:0,zIndex:50,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:26,height:26,background:"linear-gradient(135deg,#00C896,#3B82F6)",
            borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:10,fontWeight:800,color:"#07090D",flexShrink:0,letterSpacing:"-0.05em"}}>SP</div>
          <span style={{fontWeight:800,fontSize:isMobile?14:15,letterSpacing:"-0.03em"}}>Stock Profile</span>
          {!isMobile && (
            <>
              <div style={{width:1,height:16,background:"#1C2333"}}/>
              <nav style={{display:"flex",gap:2}}>
                {nav.map(n => {
                  const isNews   = n.id === "news";
                  const isActive = tab === n.id;
                  return (
                    <button key={n.id} onClick={() => setTab(n.id)}
                      style={{padding:"5px 11px",borderRadius:6,border:"none",cursor:"pointer",
                        fontSize:12,fontWeight:isActive?600:400,
                        color:isActive?"#F0F4FF":"#8892A4",
                        background:isActive?"#1C2333":"transparent",
                        transition:"all 0.15s",position:"relative",
                        display:"flex",alignItems:"center",gap:5}}>
                      {n.label}
                      {isNews && newsAlerts > 0 && (
                        <span style={{background:"#E5484D",color:"#fff",borderRadius:10,
                          fontSize:9,padding:"0 5px",fontWeight:700,lineHeight:"14px"}}>
                          {newsAlerts}
                        </span>
                      )}
                    </button>
                  );
                })}
                <div style={{width:1,height:16,background:"#1C2333",alignSelf:"center"}}/>
                <a href="/tools"
                  style={{padding:"5px 11px",borderRadius:6,border:"1px solid #1C2333",
                    cursor:"pointer",fontSize:12,fontWeight:400,color:"#00C896",
                    textDecoration:"none",background:"#00C89608",transition:"all 0.15s",
                    display:"flex",alignItems:"center",gap:5,minHeight:36}}>
                  $ Calc
                </a>
              </nav>
            </>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={refreshQuotes} disabled={fetching}
            aria-label="Refresh market data" className="desktop-only"
            style={{background:"#141820",border:"1px solid #1C2333",
              color:fetching?"#3D4A5C":"#8892A4",borderRadius:6,
              padding:"5px 10px",cursor:fetching?"not-allowed":"pointer",
              fontSize:11,display:"flex",alignItems:"center",gap:5}}>
            <span style={{display:"inline-block",animation:fetching?"spin 1s linear infinite":"none",fontSize:10}}>◌</span>
            {fetching?"…":"Refresh"}
          </button>
          <div className="desktop-only" style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:5,height:5,borderRadius:"50%",
              background:mktOpen?"#00C896":"#3D4A5C",
              boxShadow:mktOpen?"0 0 5px #00C896":"none",flexShrink:0}}/>
            <span style={{fontSize:10,color:mktOpen?"#00C896":"#3D4A5C",letterSpacing:"0.05em"}}>
              {mktOpen?"OPEN":"CLOSED"}
            </span>
          </div>
          <span className="desktop-only" style={{fontSize:10,color:"#3D4A5C",fontFamily:"monospace"}}>
            {time.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"})} ET
          </span>
          <button className="mobile-only" onClick={() => setMobileMenuOpen(o => !o)}
            aria-label="Open navigation menu" aria-expanded={mobileMenuOpen}
            style={{background:"#141820",border:"1px solid #1C2333",color:"#8892A4",
              borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:16}}>☰</button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {isMobile && mobileMenuOpen && (
        <div style={{background:"#0E1117",borderBottom:"1px solid #1C2333",padding:"8px 14px",
          display:"flex",gap:4,flexWrap:"wrap",zIndex:40}}>
          {nav.map(n => (
            <button key={n.id} onClick={() => { setTab(n.id); setMobileMenuOpen(false); }}
              style={{padding:"7px 14px",borderRadius:7,border:"none",cursor:"pointer",fontSize:13,
                fontWeight:tab===n.id?600:400,color:tab===n.id?"#F0F4FF":"#8892A4",
                background:tab===n.id?"#1C2333":"transparent"}}>
              {n.label}
            </button>
          ))}
        </div>
      )}

      {/* Market bar */}
      <div style={{display:"flex",overflowX:"auto",borderBottom:"1px solid #1C2333",
        background:"#07090D",padding:isMobile?"5px 14px":"6px 24px",flexShrink:0,
        scrollbarWidth:"none",WebkitOverflowScrolling:"touch" as any}}>
        {MARKET_BAR.map((m, i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:5,paddingRight:14,marginRight:14,
            flexShrink:0,whiteSpace:"nowrap",
            borderRight:i < MARKET_BAR.length-1?"1px solid #1C2333":"none"}}>
            <span style={{fontSize:9,color:"#3D4A5C",letterSpacing:"0.07em"}}>{m.l}</span>
            <span style={{fontSize:10,color:"#F0F4FF",fontFamily:"monospace",fontWeight:600}}>{m.v}</span>
            <span style={{fontSize:10,fontFamily:"monospace",
              color:(m as any).n?"#8892A4":m.up?"#00C896":"#E5484D"}}>{m.p}</span>
          </div>
        ))}
      </div>

      {/* Page content */}
      <div style={{flex:1,overflowY:"auto"}}>
        {tab === "dashboard" && <Dashboard holdings={holdings} watchlist={watchlist} quotes={quotes} lastUpdate={lastUpdate}/>}
        {tab === "holdings"  && <HoldingsManager holdings={holdings} setHoldings={setHoldings} quotes={quotes} showToast={showToast}/>}
        {tab === "watchlist" && <WatchlistManager watchlist={watchlist} setWatchlist={setWatchlist} quotes={quotes} showToast={showToast}/>}
        {tab === "news"      && <NewsIntelligence holdings={holdings} watchlist={watchlist}/>}
        {tab === "growth"    && <GrowthEngine holdings={holdings} quotes={quotes}/>}
      </div>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav mobile-bottom-nav" aria-label="Mobile navigation"
        style={{display:"none",borderTop:"1px solid #1C2333",background:"#07090D",
          flexShrink:0,position:"sticky",bottom:0,zIndex:50}}>
        {nav.map(n => (
          <button key={n.id} onClick={() => { setTab(n.id); setMobileMenuOpen(false); }}
            style={{flex:1,padding:"10px 4px",border:"none",cursor:"pointer",
              color:tab===n.id?"#00C896":"#3D4A5C",background:"transparent",
              display:"flex",flexDirection:"column",alignItems:"center",gap:2,minHeight:44}}>
            <span style={{fontSize:14}}>{n.icon}</span>
            <span style={{fontSize:9,letterSpacing:"0.04em",fontWeight:tab===n.id?600:400}}>{n.label}</span>
          </button>
        ))}
        <a href="/tools"
          style={{flex:1,padding:"10px 4px",textDecoration:"none",
            borderLeft:"1px solid #1C2333",color:"#00C896",background:"#00C8960A",
            display:"flex",flexDirection:"column",alignItems:"center",gap:2,minHeight:44}}>
          <span style={{fontSize:14}}>$</span>
          <span style={{fontSize:9,letterSpacing:"0.04em",fontWeight:600}}>Calc</span>
        </a>
      </nav>

      {/* Footer */}
      <div style={{borderTop:"1px solid #1C2333",padding:"8px 24px",display:"flex",
        justifyContent:"space-between",fontSize:10,color:"#3D4A5C",flexShrink:0}}>
        <span>Stock Profile · Not financial advice · Data: Finnhub → Polygon → Twelve Data → Yahoo (auto-failover)</span>
        <span>{lastUpdate ? "Updated " + new Date(lastUpdate).toLocaleTimeString() : "Initialising…"}</span>
      </div>

      <Toast toast={toast}/>
    </div>
    </ErrorBoundary>
  );
}

// ======================================================================
// ARCHITECTURE NOTES — for /api/search and /api/quotes implementation
// ======================================================================
//
// /api/search?q=BBAI  (Next.js API route)
// Priority:
//   1. Finnhub symbol search: GET /search?q={query}&token={FINNHUB_KEY}
//      Returns: { result: [{description, displaySymbol, symbol, type}] }
//   2. Polygon ticker search: GET /v3/reference/tickers?search={query}&apiKey={POLY_KEY}
//   3. Twelve Data symbol search: GET /symbol_search?symbol={query}&apikey={TD_KEY}
//   → Normalise to { results: [{sym, name, exchange, type}] }
//
// /api/quotes?symbol=BBAI  (Next.js API route)
// Priority:
//   1. Finnhub quote: GET /quote?symbol={sym}&token={key}
//      Fields: c (price), d (change), dp (pct), h, l, v, pc
//   2. Polygon snapshot: GET /v2/snapshot/locale/us/markets/stocks/tickers/{sym}?apiKey={key}
//   3. Twelve Data: GET /price + /quote?symbol={sym}&apikey={key}
//   4. Yahoo Finance fallback: scrape (or yahoo-finance2 npm package)
//   → Normalise to { price, change, pct, dayHigh, dayLow, volume, mktcap, pe, provider }
//
// Cache: Redis or in-memory LRU with 45s TTL for quotes, 300s for search.
// Rate limit: Finnhub free = 60 req/min; batch where possible.
// International: prefix exchange (e.g. LSE:BP for London, KLSE:MAYBANK for Bursa)
//   → Finnhub supports these with exchange prefix notation.
// ======================================================================
