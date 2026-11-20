export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  tenure_floor: number;
  tenure_days: number;
  tenure_range: number;
  chain_weight: number;
  chain_cap: number;
  unknown_age_days: number;
  excluded_categories: string[];
  exchange_prefixes: string[];
}

export interface FactorRow {
  growth_pct: number;
  growth_multiplier: number;
  tenure_multiplier: number;
  chain_multiplier: number;
  category_tilt: number;
  age_days: number | null;
}

export interface BoardRow extends FactorRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: "pre-token";
  watchlisted: boolean;
  early: boolean;
  implied_value_usd: number;
  signals: string[];
  farm_steps: string[];
}

export interface RadarRow extends FactorRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlisted: boolean;
  early: boolean;
  implied_value_usd: number;
  signals: string[];
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const DERIVED = /\b(wrapped|staked|staking)\b/i;

export const MODEL: ModelConstants = {
  base_multiple: 0.22,
  growth_weight: 1.2,
  growth_floor: -40,
  growth_cap: 60,
  tenure_floor: 0.55,
  tenure_days: 1460,
  tenure_range: 0.45,
  chain_weight: 0.03,
  chain_cap: 6,
  unknown_age_days: 180,
  excluded_categories: ["Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"],
  exchange_prefixes: ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"],
};

export const MODEL_VERSION = "radar-2";

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

export function categoryTilt(category: string | null): number {
  const value = (category ?? "").toLowerCase();
  if (value.includes("dex") || value.includes("lending") || value.includes("cdp") || value.includes("yield")) return 1.1;
  if (value.includes("allocator") || value.includes("curator")) return 1.06;
  if (value.includes("chain") || value.includes("oracle") || value.includes("infrastructure")) return 1.08;
  if (value.includes("rwa") || value.includes("stable") || value.includes("prediction")) return 1.04;
  return 1;
}

export function factors(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): FactorRow {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = clamp(protocol.change_7d ?? 0, model.growth_floor, model.growth_cap);
  const growthMultiplier = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const tenureMultiplier = model.tenure_floor + (clamp(ageForModel, 0, model.tenure_days) / model.tenure_days) * model.tenure_range;
  const chainMultiplier = 1 + Math.min(protocol.chains.length, model.chain_cap) * model.chain_weight;
  return {
    growth_pct: round4(growthPct),
    growth_multiplier: growthMultiplier,
    tenure_multiplier: tenureMultiplier,
    chain_multiplier: chainMultiplier,
    category_tilt: categoryTilt(protocol.category),
    age_days: age,
  };
}

export function impliedValue(protocol: SnapshotProtocol, factor: FactorRow, model: ModelConstants): number {
  const value = protocol.tvl_usd * model.base_multiple * factor.growth_multiplier * factor.tenure_multiplier * factor.chain_multiplier * factor.category_tilt;
  return Math.max(1, Math.round(value));
}

export function isPreToken(protocol: SnapshotProtocol): boolean {
  return protocol.mcap_usd === null && protocol.gecko_id === null && protocol.symbol === null;
}

export function isLaunchCandidate(protocol: SnapshotProtocol, model: ModelConstants): boolean {
  if (!isPreToken(protocol)) return false;
  if (protocol.category !== null && model.excluded_categories.includes(protocol.category)) return false;
  if (VERSIONED.test(protocol.name) || DERIVED.test(protocol.name)) return false;
  if (model.exchange_prefixes.some((prefix) => protocol.name.startsWith(prefix))) return false;
  return true;
}

function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null, growthPct: number): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (growthPct > 5) return 30;
  return 45;
}

function actionFor(protocol: SnapshotProtocol, capital: number, chain: string): string {
  const category = (protocol.category ?? "").toLowerCase();
  const name = protocol.name;
  if (category.includes("lend") || category.includes("cdp") || category.includes("collateral")) {
    return `Supply ${capital} dollars of USDC to ${name} on ${chain} and keep the receipt position open.`;
  }
  if (category.includes("dex") || category.includes("yield") || category.includes("liquidity") || category.includes("farm")) {
    return `Provide ${capital} dollars of two-sided liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (category.includes("risk") || category.includes("curator") || category.includes("allocator")) {
    return `Deposit ${capital} dollars into one ${name} vault on ${chain} and keep the share tokens in the same wallet.`;
  }
  if (category.includes("rwa") || category.includes("stable")) {
    return `Mint ${capital} dollars of the yield asset through ${name} on ${chain} and hold it in the farm wallet.`;
  }
  if (category.includes("perpetual") || category.includes("derivative") || category.includes("basis")) {
    return `Deposit ${capital} dollars of margin on ${name} and open one small hedged position on ${chain}.`;
  }
  if (category.includes("prediction")) {
    return `Fund ${capital} dollars on ${chain} and place one small market position through ${name}.`;
  }
  if (category.includes("chain") || category.includes("validator")) {
    return `Delegate ${capital} dollars of the chain's native asset to a validator associated with ${name} and keep the delegation receipt.`;
  }
  return `Deposit ${capital} dollars of USDC into ${name} on ${chain} and keep the position open.`;
}

function stepText(text: string, cost: string, time: string): string {
  const value = `${text} Cost: ${cost}. Time: ${time}.`;
  return value.length > 600 ? `${value.slice(0, 596)}...` : value;
}

export function farmSteps(protocol: SnapshotProtocol, factor: FactorRow): string[] {
  const chain = protocol.chains[0] ?? "its main chain";
  const capital = capitalFor(protocol.tvl_usd);
  const hold = holdDaysFor(factor.age_days, factor.growth_pct);
  const action = actionFor(protocol, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  return [
    stepText(
      `Confirm in ${protocol.name}'s own documentation that the index entry still records no token, then bookmark its official app.`,
      "no capital, just a check",
      "5 minutes",
    ),
    stepText(
      `Fund one dedicated wallet with ${capital} dollars on ${chain}, keep its seed phrase offline, and never reuse it for trading.`,
      `${capital} dollars of capital and about ${gas} dollars of gas`,
      "15 minutes",
    ),
    stepText(action, `${capital} dollars of capital and about ${gas} dollars of gas`, "20 minutes"),
    stepText(
      `Repeat one small qualifying action each week, such as a deposit, borrow, swap, vote or fee payment, from the same wallet.`,
      "about 2 dollars of gas each week",
      "10 minutes a week",
    ),
    stepText(
      `Keep the position open for at least ${hold} days and recheck TVL every Friday so the activity spans more than one index snapshot.`,
      `${capital} dollars stays locked in the position`,
      `${hold} days`,
    ),
    stepText(
      `Claim points only from ${protocol.name}'s official page, and log the wallet, dates and each transaction hash in a farm sheet.`,
      "gas to claim plus a free log",
      "15 minutes",
    ),
  ];
}

function signalsFor(protocol: SnapshotProtocol, factor: FactorRow, watchlisted: boolean): string[] {
  const signals: string[] = [];
  signals.push(watchlisted ? "Watchlist floor" : "Early find");
  if (factor.growth_pct >= 5) signals.push("Positive momentum");
  else if (factor.growth_pct <= -10) signals.push("Deep drawdown");
  if (factor.age_days !== null && factor.age_days >= 365) signals.push("Long runway");
  if (protocol.chains.length >= 3) signals.push("Multi-chain");
  return signals.slice(0, 3);
}

function toRadarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    growth_pct: row.growth_pct,
    growth_multiplier: row.growth_multiplier,
    tenure_multiplier: row.tenure_multiplier,
    chain_multiplier: row.chain_multiplier,
    category_tilt: row.category_tilt,
    watchlisted: row.watchlisted,
    early: row.early,
    implied_value_usd: row.implied_value_usd,
    signals: row.signals,
    farm_steps: row.farm_steps,
  };
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((protocol) => [protocol.slug, protocol]));
  const chosen = new Set<string>(snapshot.watchlist);
  for (const protocol of snapshot.protocols) {
    if (isLaunchCandidate(protocol, model)) chosen.add(protocol.slug);
  }
  const scored = [...chosen]
    .map((slug) => index.get(slug))
    .filter((protocol): protocol is SnapshotProtocol => protocol !== undefined)
    .map((protocol) => {
      const factor = factors(protocol, snapshot.as_of, model);
      const watchlisted = snapshot.watchlist.includes(protocol.slug);
      return {
        protocol,
        factor,
        watchlisted,
        implied: impliedValue(protocol, factor, model),
      };
    });
  scored.sort((a, b) => b.implied - a.implied || (a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0));
  return scored.map((entry, index) => ({
    rank: index + 1,
    slug: entry.protocol.slug,
    name: entry.protocol.name,
    category: entry.protocol.category,
    chains: entry.protocol.chains,
    tvl_usd: entry.protocol.tvl_usd,
    change_7d: entry.protocol.change_7d,
    mcap_usd: entry.protocol.mcap_usd,
    listed_at: entry.protocol.listed_at,
    gecko_id: entry.protocol.gecko_id,
    symbol: entry.protocol.symbol,
    token_status: "pre-token",
    watchlisted: entry.watchlisted,
    early: !entry.watchlisted,
    age_days: entry.factor.age_days,
    growth_pct: entry.factor.growth_pct,
    growth_multiplier: entry.factor.growth_multiplier,
    tenure_multiplier: entry.factor.tenure_multiplier,
    chain_multiplier: entry.factor.chain_multiplier,
    category_tilt: entry.factor.category_tilt,
    implied_value_usd: entry.implied,
    signals: signalsFor(entry.protocol, entry.factor, entry.watchlisted),
    farm_steps: farmSteps(entry.protocol, entry.factor),
  }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((protocol) => !isPreToken(protocol) && protocol.category !== "CEX")
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 30)
    .map((protocol) => ({
      slug: protocol.slug,
      name: protocol.name,
      category: protocol.category,
      chains: protocol.chains,
      tvl_usd: protocol.tvl_usd,
      mcap_usd: protocol.mcap_usd,
      change_7d: protocol.change_7d,
    }));
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((row) => row.early).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(toRadarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError("snapshot.json is not JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SnapshotError("snapshot.json is not a JSON object");
  }
  const object = raw as Record<string, unknown>;
  if (typeof object.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(object.as_of)) {
    throw new SnapshotError("snapshot.json has no as_of date");
  }
  if (typeof object.source !== "string") throw new SnapshotError("snapshot.json has no source");
  if (typeof object.floor_usd !== "number" || !Number.isSafeInteger(object.floor_usd) || object.floor_usd <= 0) {
    throw new SnapshotError("snapshot.json has no floor_usd");
  }
  if (!Array.isArray(object.protocols)) throw new SnapshotError("snapshot.json has no protocols array");
  if (!Array.isArray(object.watchlist) || object.watchlist.some((slug) => typeof slug !== "string")) {
    throw new SnapshotError("snapshot.json has no watchlist of slugs");
  }
  const protocols = object.protocols.map((value, position) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new SnapshotError(`snapshot.json protocol ${position} is not an object`);
    }
    const protocol = value as Record<string, unknown>;
    if (typeof protocol.slug !== "string" || typeof protocol.name !== "string" || typeof protocol.tvl_usd !== "number" || !Number.isFinite(protocol.tvl_usd)) {
      throw new SnapshotError(`snapshot.json protocol ${position} lacks a slug, a name or a TVL`);
    }
    return {
      slug: protocol.slug,
      name: protocol.name,
      category: typeof protocol.category === "string" ? protocol.category : null,
      chains: Array.isArray(protocol.chains) ? protocol.chains.filter((chain): chain is string => typeof chain === "string") : [],
      tvl_usd: protocol.tvl_usd,
      change_7d: typeof protocol.change_7d === "number" && Number.isFinite(protocol.change_7d) ? protocol.change_7d : null,
      mcap_usd: typeof protocol.mcap_usd === "number" && Number.isFinite(protocol.mcap_usd) ? protocol.mcap_usd : null,
      listed_at: typeof protocol.listed_at === "string" ? protocol.listed_at : null,
      gecko_id: typeof protocol.gecko_id === "string" ? protocol.gecko_id : null,
      symbol: typeof protocol.symbol === "string" ? protocol.symbol : null,
    };
  });
  return {
    as_of: object.as_of,
    source: object.source,
    floor_usd: object.floor_usd,
    protocols,
    watchlist: object.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows`;
  const slugs = new Set(board.map((row) => row.slug));
  if (slugs.size !== board.length) return "the board repeats a slug";
  const known = new Set(snapshot.protocols.map((protocol) => protocol.slug));
  const invented = board.filter((row) => !known.has(row.slug)).slice(0, 5).map((row) => row.slug);
  if (invented.length > 0) return `the board invents ${invented.join(", ")}`;
  const missing = snapshot.watchlist.filter((slug) => !slugs.has(slug));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(", ")}`;
  for (let index = 0; index < board.length; index++) {
    if (board[index]!.rank !== index + 1) return `rank ${index + 1} is ${board[index]!.rank}`;
  }
  for (let index = 1; index < board.length; index++) {
    if (board[index]!.implied_value_usd > board[index - 1]!.implied_value_usd) return `row ${index + 1} outranks row ${index}`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return "all rows share one implied value";
  }
  for (const row of board) {
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 100_000_000_000_000) {
      return `${row.slug} has an invalid implied value`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) return `${row.slug} has a farm step of ${trimmed.length} characters`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
