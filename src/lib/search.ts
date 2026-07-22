import path from "path";
import { IndexEntry, SearchResult } from "./types";
import { wrapKeywords } from "./markdown";

const TITLE_WEIGHT = 3;
const FILENAME_WEIGHT = 2;
const CONTENT_WEIGHT = 1;
const SUBTITLE_LEN = 200;
const SUBTITLE_BEFORE = 20;

/** 空格分词，去空、按小写去重(保留首个原始大小写) */
export function parseQuery(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of text.split(/\s+/)) {
    const t = tok.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** 统计 haystack 中 needle 的非重叠出现次数 */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

export interface SearchOutput {
  results: SearchResult[];
  truncated: boolean;
}

interface Derived {
  contentLower: string;
  titleLower: string;
  filenameBase: string;
  filenameLower: string;
}

// 派生小写字段按 entry 缓存：同一会话跨按键复用，避免每次搜索对全部全文重复 toLowerCase
const derivedCache = new WeakMap<IndexEntry, Derived>();

function derive(entry: IndexEntry): Derived {
  let d = derivedCache.get(entry);
  if (!d) {
    const filenameBase = path.basename(entry.path).replace(/\.[^.]+$/, "");
    d = {
      contentLower: entry.content.toLowerCase(),
      titleLower: entry.title.toLowerCase(),
      filenameBase,
      filenameLower: filenameBase.toLowerCase(),
    };
    derivedCache.set(entry, d);
  }
  return d;
}

/** 多关键词 AND 匹配 title/文件名/正文 + 相关性排序 */
export function searchIndex(index: IndexEntry[], query: string, max: number): SearchOutput {
  const keywords = parseQuery(query);
  if (!keywords.length) return { results: [], truncated: false };
  const lowers = keywords.map((k) => k.toLowerCase());

  const matched: Array<{ r: SearchResult; score: number }> = [];
  for (const entry of index) {
    // 关键词不含空格、不跨行，直接在原文匹配，偏移量即真实位置(可算行/列)
    const { contentLower, titleLower, filenameBase, filenameLower } = derive(entry);

    let score = 0;
    let matchCount = 0;
    let ok = true;
    let firstContentIdx = -1;
    for (const kw of lowers) {
      const inTitle = titleLower.includes(kw);
      const inFilename = filenameLower.includes(kw);
      const cIdx = contentLower.indexOf(kw);
      const inContent = cIdx > -1;
      if (!inTitle && !inFilename && !inContent) {
        ok = false;
        break;
      }
      score += inTitle ? TITLE_WEIGHT : inFilename ? FILENAME_WEIGHT : CONTENT_WEIGHT;
      if (inContent) {
        matchCount += countOccurrences(contentLower, kw);
        if (firstContentIdx === -1 || cIdx < firstContentIdx) firstContentIdx = cIdx;
      }
    }
    if (!ok) continue;

    // 副标题单行预览：原文取窗口后把换行压成空格
    const subStart = firstContentIdx > -1 ? Math.max(0, firstContentIdx - SUBTITLE_BEFORE) : 0;
    const subtitle = wrapKeywords(
      entry.content
        .substring(subStart, subStart + SUBTITLE_LEN)
        .replace(/\r\n?|\n/g, " ")
        .trim(),
      keywords
    );

    // 首个正文命中的行/列(1-based)，供编辑器跳转
    let matchLine: number | undefined;
    let matchCol: number | undefined;
    if (firstContentIdx > -1) {
      const before = entry.content.slice(0, firstContentIdx);
      matchLine = (before.match(/\n/g)?.length ?? 0) + 1;
      matchCol = firstContentIdx - before.lastIndexOf("\n");
    }

    matched.push({
      score,
      r: {
        path: entry.path,
        filename: filenameBase.trim(),
        title: entry.title,
        subtitle,
        content: entry.content,
        mtime: entry.mtime,
        matchCount,
        matchLine,
        matchCol,
        keywords,
      },
    });
  }

  // 排序：命中权重高优先，其次正文命中多，其次标题字典序
  matched.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.r.matchCount !== a.r.matchCount) return b.r.matchCount - a.r.matchCount;
    return a.r.title.localeCompare(b.r.title);
  });

  const truncated = matched.length > max;
  return { results: matched.slice(0, max).map((m) => m.r), truncated };
}
