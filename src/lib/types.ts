/** 内存索引条目 */
export interface IndexEntry {
  /** 绝对路径 */
  path: string;
  /** 文件修改时间(ms)，用于增量刷新 */
  mtime: number;
  /** 首个非空行(去标题标记)作为标题 */
  title: string;
  /** 文件全文 */
  content: string;
}

/** 单条搜索结果 */
export interface SearchResult {
  path: string;
  /** 文件名(去扩展名) */
  filename: string;
  title: string;
  subtitle: string;
  /** 文件全文(用于 Copy Content 与惰性构建详情) */
  content: string;
  mtime: number;
  /** 正文命中次数 */
  matchCount: number;
  /** 首个正文命中的行号(1-based)，仅正文命中时有值 */
  matchLine?: number;
  /** 首个正文命中的列号(1-based) */
  matchCol?: number;
  /** 命中的关键词(原始大小写) */
  keywords: string[];
}
