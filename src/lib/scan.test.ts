import fs from "fs";
import os from "os";
import path from "path";
import { scanFiles } from "./scan";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-"));
  fs.mkdirSync(path.join(root, "sub"));
  fs.mkdirSync(path.join(root, ".hidden"));
  fs.writeFileSync(path.join(root, "a.md"), "a");
  fs.writeFileSync(path.join(root, "b.markdown"), "b");
  fs.writeFileSync(path.join(root, "c.txt"), "c");
  fs.writeFileSync(path.join(root, "sub", "d.md"), "d");
  fs.writeFileSync(path.join(root, "sub", "skip.md"), "skip");
  fs.writeFileSync(path.join(root, ".hidden", "e.md"), "e");
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function names(files: { path: string }[]) {
  return files.map((f) => path.basename(f.path)).sort();
}

describe("scanFiles", () => {
  it("recurses and filters by extension", async () => {
    const files = await scanFiles([root], [], ["md", "markdown"]);
    expect(names(files)).toEqual(["a.md", "b.markdown", "d.md", "skip.md"]);
  });

  it("honors custom extensions", async () => {
    const files = await scanFiles([root], [], ["txt"]);
    expect(names(files)).toEqual(["c.txt"]);
  });

  it("skips hidden directories", async () => {
    const files = await scanFiles([root], [], ["md"]);
    expect(names(files)).not.toContain("e.md");
  });

  it("applies exclude regexps", async () => {
    const files = await scanFiles([root], [/skip/], ["md"]);
    expect(names(files)).not.toContain("skip.md");
  });

  it("returns mtime", async () => {
    const files = await scanFiles([root], [], ["md"]);
    expect(files[0].mtime).toBeGreaterThan(0);
  });

  it("dedupes via symlink loop without hanging", async () => {
    try {
      fs.symlinkSync(root, path.join(root, "sub", "loop"), "dir");
    } catch {
      return; // 无权限建软链则跳过
    }
    const files = await scanFiles([root], [], ["md"]);
    expect(names(files)).toContain("a.md");
  });

  it("returns empty when cancelled up front", async () => {
    const files = await scanFiles([root], [], ["md"], () => true);
    expect(files).toEqual([]);
  });

  it("skips unreadable/nonexistent folders", async () => {
    const files = await scanFiles([path.join(root, "nope")], [], ["md"]);
    expect(files).toEqual([]);
  });
});
