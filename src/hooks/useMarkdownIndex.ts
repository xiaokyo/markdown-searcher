import { Cache } from "@raycast/api";
import { useEffect, useState } from "react";
import { scanFiles, ScannedFile } from "../lib/scan";
import { buildIndex } from "../lib/indexStore";
import { IndexEntry } from "../lib/types";

// 容量调大以容纳全文缓存；超限时 set 抛错被吞，仅本会话内存索引可用
const cache = new Cache({ capacity: 200 * 1024 * 1024 });
const CACHE_KEY = "markdown-index-v1";
const SIG_KEY = "markdown-index-sig-v1";

/** 路径+mtime 签名，用于判定索引是否变化以跳过无谓的全量写盘 */
function signature(scanned: ScannedFile[]): string {
  return scanned
    .map((s) => `${s.path}:${s.mtime}`)
    .sort()
    .join("|");
}

function loadCache(): IndexEntry[] {
  try {
    const raw = cache.get(CACHE_KEY);
    return raw ? (JSON.parse(raw) as IndexEntry[]) : [];
  } catch {
    return [];
  }
}

function saveCache(index: IndexEntry[]): boolean {
  try {
    cache.set(CACHE_KEY, JSON.stringify(index));
    return true;
  } catch {
    // 超容量/序列化失败：忽略，保留内存索引
    return false;
  }
}

function parseList(text: string): string[] {
  return (text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function compileRegexps(text: string): RegExp[] {
  const out: RegExp[] = [];
  for (const r of parseList(text)) {
    try {
      out.push(new RegExp(r));
    } catch {
      // 忽略非法正则
    }
  }
  return out;
}

/**
 * 加载缓存 → 扫描目录(仅 stat) → 基于 mtime 增量重建索引 → 回写缓存。
 * 首帧即用缓存索引，后台刷新完成再更新，二次进入近乎秒开。
 */
export function useMarkdownIndex(foldersText: string, excludeText: string, extensionsText: string) {
  const [index, setIndex] = useState<IndexEntry[]>(() => loadCache());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const cancel = () => cancelled;
    setIsLoading(true);

    (async () => {
      try {
        const folders = parseList(foldersText);
        const excludeRegexps = compileRegexps(excludeText);
        const extensions = parseList(extensionsText);

        const scanned = await scanFiles(folders, excludeRegexps, extensions, cancel);
        if (cancelled) return;
        const next = await buildIndex(scanned, loadCache(), cancel);
        if (cancelled) return;
        setIndex(next);
        // 索引无变化则跳过全量写盘；写盘成功才更新签名，避免超容量静默失败后永久跳过缓存
        const sig = signature(scanned);
        if (cache.get(SIG_KEY) !== sig && saveCache(next)) {
          try {
            cache.set(SIG_KEY, sig);
          } catch {
            // 忽略
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [foldersText, excludeText, extensionsText]);

  return { index, isLoading };
}
