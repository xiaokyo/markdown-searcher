import {
  Action,
  ActionPanel,
  Icon,
  LaunchProps,
  List,
  LocalStorage,
  Toast,
  getApplications,
  getPreferenceValues,
  open,
  showToast,
} from "@raycast/api";
import { useFrecencySorting } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import { useMarkdownIndex } from "./hooks/useMarkdownIndex";
import { searchIndex } from "./lib/search";
import { buildDetailMarkdown } from "./lib/markdown";

const VSCODE_BUNDLE_ID = "com.microsoft.VSCode";
const DETAIL_KEY = "show-detail";

interface Arguments {
  query?: string;
}

interface Preferences {
  MarkdownFolder: string;
  excludeFileRegexp?: string;
  fileExtensions?: string;
  maxResults?: string;
  editorApp?: string;
}

/** 逐段编码路径，保证 # ? 空格等在 vscode:// 深链中不被截断 */
function encodePathForUri(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** mtime 转相对时间，用于列表 accessory */
function relativeTime(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const day = 86400000;
  if (diff < day) return "today";
  const days = Math.floor(diff / day);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function Command(props: LaunchProps<{ arguments: Arguments }>) {
  const preferences = getPreferenceValues<Preferences>();
  const { index, isLoading } = useMarkdownIndex(
    preferences.MarkdownFolder,
    preferences.excludeFileRegexp ?? "",
    preferences.fileExtensions ?? "md,markdown"
  );

  const [searchText, setSearchText] = useState(props.arguments?.query ?? "");
  const [showDetail, setShowDetail] = useState(false);
  const [hasVSCode, setHasVSCode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const maxResults = Math.max(1, parseInt(preferences.maxResults || "200", 10) || 200);
  const editorApp = preferences.editorApp?.trim();

  useEffect(() => {
    LocalStorage.getItem<string>(DETAIL_KEY).then((v) => setShowDetail(v === "true"));
    let cancelled = false;
    getApplications()
      .then((apps) => {
        if (!cancelled) setHasVSCode(apps.some((a) => a.bundleId === VSCODE_BUNDLE_ID));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const { results, truncated } = useMemo(
    () => searchIndex(index, searchText, maxResults),
    [index, searchText, maxResults]
  );

  useEffect(() => {
    if (truncated) {
      showToast({
        style: Toast.Style.Success,
        title: `Showing first ${maxResults} matches`,
        message: "Refine your query to narrow results",
      });
    }
  }, [truncated, maxResults]);

  const { data: sorted, visitItem } = useFrecencySorting(results, { key: (r) => r.path });

  function toggleDetail() {
    setShowDetail((prev) => {
      const next = !prev;
      LocalStorage.setItem(DETAIL_KEY, String(next));
      return next;
    });
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      onSelectionChange={setSelectedId}
      searchBarPlaceholder="Search markdown content, title or filename (space = AND)"
      throttle
    >
      {sorted.length === 0 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title={searchText.trim() ? "No matches" : "Type to search"}
          description={searchText.trim() ? "Try different keywords" : "Multiple keywords are matched with AND"}
        />
      ) : (
        sorted.map((item) => {
          const accessories: List.Item.Accessory[] = [];
          if (item.matchLine) accessories.push({ tag: `L${item.matchLine}` });
          if (item.matchCount) accessories.push({ tag: `${item.matchCount}` });
          const rel = relativeTime(item.mtime);
          if (rel) accessories.push({ text: rel });
          // vscode://file/<path>:<line>:<col> 深链，让 VSCode 打开即定位到匹配行
          const vscodeTarget = item.matchLine
            ? `vscode://file${encodePathForUri(item.path)}:${item.matchLine}:${item.matchCol ?? 1}`
            : undefined;
          // 仅为当前选中项构建详情，避免开详情时每次渲染给全部结果构建(大库卡顿)
          const extraProps: Partial<List.Item.Props> = showDetail
            ? {
                detail: (
                  <List.Item.Detail
                    markdown={item.path === selectedId ? buildDetailMarkdown(item.content, item.keywords) : ""}
                  />
                ),
              }
            : { accessories };

          return (
            <List.Item
              key={item.path}
              id={item.path}
              icon={{ source: "command-icon-custom.png" }}
              title={item.filename + (item.title ? " -- " + item.title : "")}
              subtitle={item.subtitle}
              {...extraProps}
              actions={
                <ActionPanel>
                  <Action title="Toggle Detail" icon={Icon.Sidebar} onAction={toggleDetail} />
                  <Action
                    title="Open File"
                    icon={Icon.BlankDocument}
                    onAction={async () => {
                      await visitItem(item);
                      await open(item.path);
                    }}
                  />
                  {hasVSCode && vscodeTarget && (
                    <Action
                      title="Open in Visual Studio Code at Match"
                      icon={Icon.Code}
                      onAction={async () => {
                        await visitItem(item);
                        await open(vscodeTarget);
                      }}
                    />
                  )}
                  {hasVSCode && (
                    <Action
                      title="Open in Visual Studio Code"
                      icon={Icon.Code}
                      onAction={async () => {
                        await visitItem(item);
                        await open(item.path, VSCODE_BUNDLE_ID);
                      }}
                    />
                  )}
                  {editorApp && (
                    <Action
                      title={`Open with ${editorApp}`}
                      icon={Icon.Pencil}
                      onAction={async () => {
                        await visitItem(item);
                        await open(item.path, editorApp);
                      }}
                    />
                  )}
                  <Action.ShowInFinder path={item.path} />
                  <ActionPanel.Section>
                    <Action.CopyToClipboard
                      title="Copy Path"
                      content={item.path}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                    />
                    <Action.CopyToClipboard
                      title="Copy Matched Excerpt"
                      content={item.subtitle}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
                    />
                    <Action.CopyToClipboard
                      title="Copy Content"
                      content={item.content}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "." }}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
