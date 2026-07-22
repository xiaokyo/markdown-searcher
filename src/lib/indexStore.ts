import fs from "fs";
import { IndexEntry } from "./types";
import { ScannedFile } from "./scan";

const fsp = fs.promises;

/** 去 BOM + 取首个非空行(去标题标记)作为 title，构建索引条目 */
export function parseEntry(path: string, mtime: number, raw: string): IndexEntry {
  const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const title = (content.split("\n").find((l) => l.trim()) ?? "").replace(/^#+\s*/, "").trim();
  return { path, mtime, title, content };
}

/**
 * 基于 mtime 的增量索引：未变文件复用 prev（不重读），新增/变更文件才 readFile，删除文件自然丢弃。
 * 单个文件读失败不影响整体。
 */
export async function buildIndex(
  scanned: ScannedFile[],
  prev: IndexEntry[],
  cancelled: () => boolean = () => false
): Promise<IndexEntry[]> {
  const prevMap = new Map(prev.map((e) => [e.path, e]));
  const out: IndexEntry[] = [];

  for (const { path, mtime } of scanned) {
    if (cancelled()) return out;

    const cached = prevMap.get(path);
    if (cached && cached.mtime === mtime) {
      out.push(cached);
      continue;
    }
    let raw: string;
    try {
      raw = await fsp.readFile(path, "utf-8");
    } catch {
      continue;
    }
    out.push(parseEntry(path, mtime, raw));
  }
  return out;
}
