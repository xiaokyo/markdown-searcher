import {
  Action,
  ActionPanel,
  LaunchProps,
  List,
  Toast,
  getApplications,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import fs from "fs";
import path from "path";
import { useEffect, useState } from "react";

const fsp = fs.promises;

/** 异步递归收集 md 文件路径；cancelled 用于 query 变化时中止旧任务 */
async function readWithFolder(
  rootPath: string,
  excludeRegexps: RegExp[],
  result: string[],
  visited: Set<string>,
  cancelled: () => boolean
) {
  async function getMd(dir: string) {
    if (cancelled()) return;

    let real: string;
    try {
      real = await fsp.realpath(dir);
    } catch {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);

    let files: string[];
    try {
      files = await fsp.readdir(dir, "utf-8");
    } catch {
      // 目录不可读（权限/不存在）直接跳过
      return;
    }

    for (const file of files) {
      if (cancelled()) return;

      const fullPath = path.join(dir, file);
      let stats: fs.Stats;
      try {
        // stat 跟随软链接；失效软链接/无权限会抛错，被 catch 跳过
        stats = await fsp.stat(fullPath);
      } catch {
        continue;
      }
      const isExclude = excludeRegexps.some((regexp) => regexp.test(fullPath));
      const isDir = stats.isDirectory() && !file.startsWith(".");
      const isMd = /\.(md|markdown)$/i.test(file) && stats.isFile();
      if (isMd && !isExclude) {
        result.push(fullPath);
      }
      if (isDir && !isExclude) {
        await getMd(fullPath);
      }
    }
  }

  await getMd(rootPath);
}

/** 结果数上限，避免宽泛查询在大目录下产生海量结果拖垮渲染 */
const MAX_RESULTS = 200;

const VSCODE_BUNDLE_ID = "com.microsoft.VSCode";

interface IProps {
  query: string;
}

interface IFile {
  filename: string;
  title: string;
  subTitle: string;
  detailMarkdown: string;
  pathname: string;
}

/** 转义正则特殊字符 */
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 列表副标题：用 「」 包裹搜索词 */
function wrapKeyword(text: string, query: string) {
  if (!query) return text;
  return text.replace(new RegExp(escapeRegExp(query), "gi"), (m) => `「${m}」`);
}

/** 中和代码围栏，避免摘录截断 ``` 破坏后续渲染 */
function neutralizeFences(text: string) {
  return text.replace(/```/g, "ˋˋˋ");
}

/** 详情 markdown：匹配位置上下文置顶 + 分割线 + 全文原文（全文围栏保持平衡不做处理） */
function buildDetailMarkdown(content: string, query: string) {
  if (!query) return content;

  // 摘录在换行归一化文本上定位，与列表匹配/副标题保持一致（覆盖跨硬换行短语）
  const normalized = content.replace(/\r\n?|\n/g, " ");
  const idx = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content;

  const start = Math.max(0, idx - 80);
  const end = Math.min(normalized.length, idx + query.length + 200);
  const raw = `${start > 0 ? "…" : ""}${normalized.substring(start, end)}${end < normalized.length ? "…" : ""}`;
  const excerpt = neutralizeFences(raw);

  return [
    "### MATCH POINT",
    excerpt.replace(/\n/g, "\n> ").replace(/^/, "> "),
    "",
    "-------------------------------------------------",
    "",
    content,
  ].join("\n");
}

interface Preferences {
  /** 文件目录集合 */
  MarkdownFolder: string;
  /** 排除文件正则 */
  excludeFileRegexp?: string;
}

export default function Command(props: LaunchProps<{ arguments: IProps }>) {
  const { query } = props.arguments;
  const preferences = getPreferenceValues<Preferences>();
  const [list, setList] = useState<IFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [hasVSCode, setHasVSCode] = useState(false);

  // 检测是否安装 VSCode，未安装则不渲染对应 action，避免打开时报错
  useEffect(() => {
    let cancelled = false;
    getApplications()
      .then((apps) => {
        if (!cancelled) setHasVSCode(apps.some((a) => a.bundleId === VSCODE_BUNDLE_ID));
      })
      .catch(() => {
        // 检测失败按未安装处理
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    async function run() {
      try {
        const { MarkdownFolder: foldersText, excludeFileRegexp = "" } = preferences;
        const folders = (foldersText || "")
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean);

        // 编译排除正则，非法正则跳过
        const excludeRegexps: RegExp[] = [];
        excludeFileRegexp
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean)
          .forEach((r) => {
            try {
              excludeRegexps.push(new RegExp(r));
            } catch {
              // 忽略非法正则
            }
          });

        // 异步扫描全部目录，共享 visited 去重跨目录软链
        const paths: string[] = [];
        const visited = new Set<string>();
        for (const folder of folders) {
          await readWithFolder(folder, excludeRegexps, paths, visited, () => cancelled);
        }
        const files = new Set(paths);

        // 去除查询词首尾空格，避免尾随空格导致匹配落空
        const trimmedQuery = query.trim();
        const q = trimmedQuery.toLowerCase();
        // 空查询（纯空格）直接返回空结果，避免匹配到所有文件
        if (!q) {
          if (cancelled) return;
          setList([]);
          return;
        }
        const findList: IFile[] = [];
        let truncated = false;
        for (const filename of files) {
          if (cancelled) return;
          if (findList.length >= MAX_RESULTS) {
            truncated = true;
            break;
          }

          let _content: string;
          try {
            _content = await fsp.readFile(filename, "utf-8");
          } catch {
            // 单个文件读取失败不影响整体
            continue;
          }
          // 去除 UTF-8 BOM，避免其破坏标题标记去除等前缀匹配
          if (_content.charCodeAt(0) === 0xfeff) _content = _content.slice(1);
          // 首个非空行作为标题，仅去除行首的标题标记
          const _title = (_content.split("\n").find((l) => l.trim()) ?? "").replace(/^#+\s*/, "").trim();
          // 统一换行为空格后再匹配，避免跨硬换行的短语漏匹配
          const stripped = _content.replace(/\r\n?|\n/g, " ");
          const strippedIdx = stripped.toLowerCase().indexOf(q);
          const match = strippedIdx > -1 || _title.toLowerCase().indexOf(q) > -1 || filename.toLowerCase().indexOf(q) > -1;
          if (!match) continue;

          const name = path.basename(filename).replace(/\.(md|markdown)$/i, "").trim();

          // 以匹配点为中心取 200 字窗口
          const subStart = strippedIdx > -1 ? Math.max(0, strippedIdx - 20) : 0;
          const _subTitle = stripped.substring(subStart, subStart + 200).trim();

          findList.push({
            title: _title,
            subTitle: wrapKeyword(_subTitle, trimmedQuery),
            detailMarkdown: buildDetailMarkdown(_content, trimmedQuery),
            filename: name,
            pathname: filename,
          });
        }
        if (cancelled) return;
        setList(findList);
        if (truncated) {
          showToast({
            style: Toast.Style.Success,
            title: `Showing first ${MAX_RESULTS} matches`,
            message: "Refine your query to narrow results",
          });
        }
      } catch (err) {
        if (cancelled) return;
        showToast({
          style: Toast.Style.Failure,
          title: "Something went wrong",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <List isLoading={isLoading} isShowingDetail={showDetail}>
      {list?.map((item) => {
        const props: Partial<List.Item.Props> = showDetail
          ? {
              detail: <List.Item.Detail markdown={item.detailMarkdown} />,
            }
          : {
              accessories: [
                {
                  text: "Command",
                },
              ],
            };

        return (
          <List.Item
            key={item.pathname}
            icon={{ source: "command-icon-custom.png" }}
            title={item.filename + " -- " + item.title}
            subtitle={item.subTitle}
            {...props}
            actions={
              <ActionPanel>
                <Action title={"View Detail"} onAction={() => setShowDetail(!showDetail)} />
                <Action.Open title={`Open File`} target={item.pathname} />
                {hasVSCode && (
                  <Action.Open
                    title={`Open File Visual Studio Code`}
                    target={item.pathname}
                    application={VSCODE_BUNDLE_ID}
                  />
                )}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
