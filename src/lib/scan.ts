import fs from "fs";
import path from "path";

const fsp = fs.promises;

export interface ScannedFile {
  path: string;
  mtime: number;
}

/** 由扩展名集合构建匹配正则，如 ["md","markdown"] -> /\.(md|markdown)$/i */
function extensionRegex(extensions: string[]): RegExp {
  const exts = extensions.map((e) => e.trim().replace(/^\./, "")).filter(Boolean);
  const alt = (exts.length ? exts : ["md", "markdown"]).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\.(${alt.join("|")})$`, "i");
}

/**
 * 递归扫描目录，仅 readdir + stat（不读文件内容），返回匹配扩展名的文件路径与 mtime。
 * visited 跨目录共享去重软链；cancelled 用于中止。
 */
export async function scanFiles(
  folders: string[],
  excludeRegexps: RegExp[],
  extensions: string[],
  cancelled: () => boolean = () => false
): Promise<ScannedFile[]> {
  const extRe = extensionRegex(extensions);
  const result: ScannedFile[] = [];
  const visited = new Set<string>();

  async function walk(dir: string) {
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
      const isExclude = excludeRegexps.some((re) => re.test(fullPath));
      if (isExclude) continue;

      if (stats.isDirectory() && !file.startsWith(".")) {
        await walk(fullPath);
      } else if (stats.isFile() && extRe.test(file)) {
        result.push({ path: fullPath, mtime: stats.mtimeMs });
      }
    }
  }

  for (const folder of folders) {
    if (cancelled()) break;
    await walk(folder);
  }
  return result;
}
