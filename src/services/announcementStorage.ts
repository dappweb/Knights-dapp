const CACHE_KEY = "knights:announcements:cache";

const JSONBIN_BIN_ID = import.meta.env.VITE_JSONBIN_BIN_ID || "69e0e93636566621a8bd9903";
const JSONBIN_ACCESS_KEY = import.meta.env.VITE_JSONBIN_ACCESS_KEY || "";
const JSONBIN_MASTER_KEY = import.meta.env.VITE_JSONBIN_MASTER_KEY || "";
const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

/** 缓存有效期 5 分钟 */
const CACHE_TTL_MS = 5 * 60 * 1000;

type SupportedLanguage = "zh" | "en";
type AnnouncementRecord = Record<SupportedLanguage, string>;

export const NOTICE_FALLBACKS: AnnouncementRecord = {
  zh: "KNIGHTS 已迁移至 CNC Mainnet，请连接 CNC Mainnet 体验",
  en: "KNIGHTS is now live on CNC Mainnet. Please switch to CNC Mainnet to explore.",
};

// ── RuntimeConfig（与公告共存于同一 JSONBin bin）──

export interface RemoteRuntimeConfig {
  usdtAddress?: string;
  usdtDecimalsOverride?: string;
  dexRouterAddress?: string;
  dexPairAddress?: string;
}

// ── 本地缓存 ──

interface BinRecord extends AnnouncementRecord {
  runtimeConfig?: RemoteRuntimeConfig;
}

interface CacheEntry {
  data: BinRecord;
  ts: number;
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(data: BinRecord) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded – ignore */ }
}

// ── 远程读写 ──

/** 从 JSONBin 拉取最新公告（带本地 cache） */
export async function fetchAnnouncements(forceRefresh = false): Promise<AnnouncementRecord> {
  // 1. 优先用有效缓存
  if (!forceRefresh) {
    const cache = readCache();
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return cache.data;
    }
  }

  // 2. 远程拉取
  try {
    const headers: Record<string, string> = {};
    if (JSONBIN_ACCESS_KEY) headers["X-Access-Key"] = JSONBIN_ACCESS_KEY;
    const res = await fetch(`${JSONBIN_BASE}/${JSONBIN_BIN_ID}/latest`, { headers });
    if (!res.ok) throw new Error(`JSONBin ${res.status}`);
    const json = await res.json();
    const record: BinRecord = {
      zh: json.record?.zh || NOTICE_FALLBACKS.zh,
      en: json.record?.en || NOTICE_FALLBACKS.en,
      runtimeConfig: json.record?.runtimeConfig || undefined,
    };
    writeCache(record);
    return record;
  } catch {
    // 3. 网络失败 → 用过期缓存 → fallback
    const cache = readCache();
    return cache?.data ?? { ...NOTICE_FALLBACKS };
  }
}

/** 同步获取：优先缓存，无缓存返回 fallback（不发网络请求） */
export function getAnnouncementContent(language: string): string {
  const normalized: SupportedLanguage = language === "en" ? "en" : "zh";
  const cache = readCache();
  return cache?.data?.[normalized] || NOTICE_FALLBACKS[normalized];
}

/** 获取远程 runtimeConfig（同步从缓存读，无则返回 null） */
export function getRemoteRuntimeConfig(): RemoteRuntimeConfig | null {
  const cache = readCache();
  return (cache?.data as BinRecord)?.runtimeConfig ?? null;
}

/** 管理员保存公告到 JSONBin */
export async function saveAnnouncementContent(
  language: string,
  content: string,
  _adminAddress?: string,
): Promise<{ success: boolean; language: string }> {
  const normalized: SupportedLanguage = language === "en" ? "en" : "zh";

  // 先拉取最新，避免覆盖另一种语言
  const current = await fetchAnnouncements(true) as BinRecord;
  current[normalized] = content.trim() || NOTICE_FALLBACKS[normalized];

  const res = await fetch(`${JSONBIN_BASE}/${JSONBIN_BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_MASTER_KEY,
    },
    body: JSON.stringify(current),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `JSONBin PUT ${res.status}`);
  }

  writeCache(current);
  return { success: true, language: normalized };
}

/** 管理员保存 runtimeConfig 到 JSONBin（与公告合并存储） */
export async function saveRemoteRuntimeConfig(
  config: RemoteRuntimeConfig,
): Promise<void> {
  // 先拉取最新，避免覆盖公告内容
  const current = await fetchAnnouncements(true) as BinRecord;
  current.runtimeConfig = { ...(current.runtimeConfig ?? {}), ...config };

  const res = await fetch(`${JSONBIN_BASE}/${JSONBIN_BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_MASTER_KEY,
    },
    body: JSON.stringify(current),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || `JSONBin PUT ${res.status}`);
  }

  writeCache(current);
}
