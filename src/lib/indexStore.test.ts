import fs from "fs";
import os from "os";
import path from "path";
import { buildIndex, parseEntry } from "./indexStore";
import { IndexEntry } from "./types";
import { ScannedFile } from "./scan";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "idx-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function write(name: string, content: string): ScannedFile {
  const p = path.join(root, name);
  fs.writeFileSync(p, content);
  return { path: p, mtime: fs.statSync(p).mtimeMs };
}

describe("parseEntry", () => {
  it("strips BOM and reads title from first non-empty line", () => {
    const e = parseEntry("/x.md", 1, "﻿\n\n# Hello World\nbody");
    expect(e.title).toBe("Hello World");
    expect(e.content.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe("buildIndex", () => {
  it("reads content and title for new files", async () => {
    const s = write("a.md", "# Title A\nbody a");
    const idx = await buildIndex([s], []);
    expect(idx).toHaveLength(1);
    expect(idx[0].title).toBe("Title A");
    expect(idx[0].content).toContain("body a");
  });

  it("reuses cached entry when mtime unchanged (no re-read)", async () => {
    const s = write("a.md", "# Real\nreal body");
    const prev: IndexEntry[] = [{ path: s.path, mtime: s.mtime, title: "CACHED", content: "SENTINEL" }];
    const idx = await buildIndex([s], prev);
    expect(idx[0].content).toBe("SENTINEL");
    expect(idx[0].title).toBe("CACHED");
  });

  it("re-reads when mtime differs", async () => {
    const s = write("a.md", "# New\nnew body");
    const prev: IndexEntry[] = [{ path: s.path, mtime: s.mtime - 1, title: "OLD", content: "OLD" }];
    const idx = await buildIndex([s], prev);
    expect(idx[0].content).toContain("new body");
  });

  it("drops deleted files (present in prev, absent in scan)", async () => {
    const s = write("a.md", "a");
    const prev: IndexEntry[] = [{ path: path.join(root, "gone.md"), mtime: 1, title: "g", content: "g" }];
    const idx = await buildIndex([s], prev);
    expect(idx.map((e) => e.path)).toEqual([s.path]);
  });

  it("skips files that fail to read without aborting the rest", async () => {
    const good = write("a.md", "# Good\nok");
    const missing: ScannedFile = { path: path.join(root, "missing.md"), mtime: 123 };
    const idx = await buildIndex([missing, good], []);
    expect(idx.map((e) => e.title)).toEqual(["Good"]);
  });
});
