import { Action, ActionPanel, LaunchProps, List, Toast, getPreferenceValues, showToast } from "@raycast/api";
import fs from "fs";
import { useEffect, useState } from "react";

function getContent(filename: string) {
  const content = fs.readFileSync(filename, "utf-8");
  return content;
}

function readWithFolder(rootPath: string, excludeRegexps: RegExp[]) {
  const result: string[] = [];

  function getMd(path: string) {
    const files = fs.readdirSync(path, "utf-8");
    // 过滤只保留文件夹和md文件
    files.forEach((file) => {
      // 判断是否是文件夹
      const stats = fs.statSync(path + file);
      const isDir = stats.isDirectory() && !file.startsWith(".");
      const isMd = file.endsWith(".md");
      const isExclude = excludeRegexps.some((regexp) => regexp.test(path + file));
      if (isMd && !isExclude) {
        result.push(path + file);
      }

      if (isDir) {
        getMd(path + file + "/");
      }
    });
  }

  getMd(rootPath);

  return result;
}

interface IProps {
  query: string;
}

interface IFile {
  filename: string;
  title: string;
  subTitle: string;
  content: string;
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

/** 详情 markdown：匹配位置上下文置顶 + 分割线 + 全文原文 */
function buildDetailMarkdown(content: string, query: string) {
  if (!query) return content;

  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content;

  const start = Math.max(0, idx - 80);
  const end = Math.min(content.length, idx + query.length + 200);
  const excerpt = `${start > 0 ? "…" : ""}${content.substring(start, end)}${end < content.length ? "…" : ""}`;

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
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    try {
      const { MarkdownFolder: foldersText, excludeFileRegexp = "" } = preferences;
      const folders = foldersText.split(",");

      const files: string[] = [];
      folders.map((folder) => {
        files.push(
          ...readWithFolder(
            folder.trim(),
            excludeFileRegexp
              .split(",")
              .filter(Boolean)
              .map((regexp: string) => new RegExp(regexp.trim()))
          )
        );
      });
      const findList: IFile[] = [];
      [...files].forEach((filename) => {
        const _content = getContent(filename);
        // 获取内容的第一行
        const _title = _content.split("\n")[0].replace(/#/g, "").trim();
        const findIndex = _content.indexOf(query);
        const match = findIndex > -1 || _title.indexOf(query) > -1 || filename.indexOf(query) > -1;
        if (match) {
          let name = filename;
          folders.forEach((folder) => {
            name = name.replace(folder, "");
          });
          name = name.replace(".md", "").trim();

          const nameArr = name.split("/");
          name = nameArr[nameArr.length - 1];

          const _subTitle = _content
            .replace(/\n/g, "")
            .trim()
            .substring(findIndex > -1 ? (findIndex - 20 > -1 ? findIndex - 20 : 0) : 0, 200);

          findList.push({
            title: _title,
            subTitle: wrapKeyword(_subTitle, query),
            content: _content,
            detailMarkdown: buildDetailMarkdown(_content, query),
            filename: name,
            pathname: filename,
          });
        }
      });
      setList([...findList]);
    } catch (err: any) {
      showToast({ style: Toast.Style.Failure, title: "Something went wrong", message: err.message });
    }
  }, []);

  return (
    <List isShowingDetail={showDetail}>
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
                <Action.Open
                  title={`Open File Visual Studio Code`}
                  target={item.pathname}
                  application={"com.microsoft.VSCode"}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
