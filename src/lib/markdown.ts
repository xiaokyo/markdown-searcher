/** 转义正则特殊字符 */
export function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 中和代码围栏，避免摘录截断 ``` 破坏后续渲染 */
export function neutralizeFences(text: string) {
  return text.replace(/```/g, "ˋˋˋ");
}

/** 由关键词集合构建大小写不敏感的匹配正则；无关键词返回 null */
function keywordRegex(keywords: string[]): RegExp | null {
  const valid = keywords.filter(Boolean);
  if (!valid.length) return null;
  return new RegExp(`(${valid.map(escapeRegExp).join("|")})`, "gi");
}

/** 命中词加粗（用于详情摘录高亮） */
export function highlightKeywords(text: string, keywords: string[]) {
  const re = keywordRegex(keywords);
  if (!re) return text;
  return text.replace(re, (m) => `**${m}**`);
}

/** 命中词用 「」 包裹（用于列表副标题） */
export function wrapKeywords(text: string, keywords: string[]) {
  const re = keywordRegex(keywords);
  if (!re) return text;
  return text.replace(re, (m) => `「${m}」`);
}

const BEFORE = 80;
const AFTER = 200;

/**
 * 在原文定位全部命中窗口并按行边界对齐后合并。
 * 关键词经空格分词不含空格、不跨硬换行，故直接原文匹配；
 * 对齐整行使块级 markdown(标题/列表/表格)正常渲染，而非当源码展示。
 */
function matchWindows(content: string, keywords: string[]): Array<[number, number]> {
  const re = keywordRegex(keywords);
  if (!re) return [];
  const ranges: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const rawStart = Math.max(0, m.index - BEFORE);
    const rawEnd = Math.min(content.length, m.index + m[0].length + AFTER);
    const start = content.lastIndexOf("\n", rawStart - 1) + 1;
    const nlAfter = content.indexOf("\n", rawEnd);
    const end = nlAfter === -1 ? content.length : nlAfter;
    ranges.push([start, end]);
    if (m.index === re.lastIndex) re.lastIndex++; // 防空匹配死循环
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/**
 * 详情 markdown：命中上下文摘录(整行、正常渲染、命中词加粗)置顶，打开即见匹配；
 * 分割线下接完整全文原文，可继续从头通读，不丢任何内容。
 */
export function buildDetailMarkdown(content: string, keywords: string[]) {
  if (!keywords.length) return content;

  const windows = matchWindows(content, keywords);
  if (!windows.length) return content;

  const blocks = windows.map(([start, end]) => {
    // 摘录围栏可能不平衡，中和以免吞掉后续内容；截断标记独立成段不破坏块级结构
    const excerpt = highlightKeywords(neutralizeFences(content.substring(start, end)), keywords);
    const prefix = start > 0 ? "…\n\n" : "";
    const suffix = end < content.length ? "\n\n…" : "";
    return `${prefix}${excerpt}${suffix}`;
  });

  // 全文围栏奇数(畸形文件)会吞掉后续渲染 → 中和；良构文件(偶数)保留以正常渲染代码
  const fullContent = (content.match(/```/g) || []).length % 2 === 1 ? neutralizeFences(content) : content;

  return [blocks.join("\n\n---\n\n"), "", "---", "", fullContent].join("\n");
}
