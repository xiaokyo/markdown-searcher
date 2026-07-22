import { parseQuery, searchIndex } from "./search";
import { IndexEntry } from "./types";

function entry(path: string, title: string, content: string): IndexEntry {
  return { path, title, content, mtime: 0 };
}

describe("parseQuery", () => {
  it("splits on whitespace and trims", () => {
    expect(parseQuery("  foo   bar ")).toEqual(["foo", "bar"]);
  });
  it("returns empty for blank", () => {
    expect(parseQuery("   ")).toEqual([]);
  });
  it("dedupes repeated keywords case-insensitively", () => {
    expect(parseQuery("foo Foo foo")).toEqual(["foo"]);
  });
});

describe("searchIndex", () => {
  const index: IndexEntry[] = [
    entry("/a.md", "alpha title", "nothing relevant here"),
    entry("/b.md", "b", "some alpha in the body text"),
    entry("/c.md", "c", "foo and bar both appear here"),
    entry("/d.md", "d", "only foo here"),
  ];

  it("requires ALL keywords to match (AND)", () => {
    const { results } = searchIndex(index, "foo bar", 100);
    expect(results.map((r) => r.path)).toEqual(["/c.md"]);
  });

  it("returns nothing when a keyword is missing everywhere", () => {
    const { results } = searchIndex(index, "foo zzz", 100);
    expect(results).toEqual([]);
  });

  it("ranks title hits above body-only hits", () => {
    const { results } = searchIndex(index, "alpha", 100);
    expect(results.map((r) => r.path)).toEqual(["/a.md", "/b.md"]);
  });

  it("matches against filename too", () => {
    const { results } = searchIndex([entry("/notes/report.md", "t", "body")], "report", 100);
    expect(results).toHaveLength(1);
  });

  it("truncates to max and flags it", () => {
    const { results, truncated } = searchIndex(index, "foo", 1);
    expect(results).toHaveLength(1);
    expect(truncated).toBe(true);
  });

  it("does not flag truncation under the limit", () => {
    const { truncated } = searchIndex(index, "foo", 100);
    expect(truncated).toBe(false);
  });

  it("wraps keywords in the subtitle", () => {
    const { results } = searchIndex([entry("/x.md", "t", "hello alpha world")], "alpha", 100);
    expect(results[0].subtitle).toContain("「alpha」");
  });

  it("counts body match occurrences", () => {
    const { results } = searchIndex([entry("/x.md", "t", "foo foo foo")], "foo", 100);
    expect(results[0].matchCount).toBe(3);
  });

  it("returns empty for blank query", () => {
    expect(searchIndex(index, "  ", 100).results).toEqual([]);
  });

  it("records 1-based line and column of the first body match", () => {
    const { results } = searchIndex([entry("/x.md", "t", "top\nintro alpha here")], "alpha", 100);
    expect(results[0].matchLine).toBe(2);
    expect(results[0].matchCol).toBe(7);
  });

  it("computes correct line/col for CRLF line endings (\\r belongs to previous line)", () => {
    const { results } = searchIndex([entry("/x.md", "t", "top line\r\nintro alpha here")], "alpha", 100);
    expect(results[0].matchLine).toBe(2);
    expect(results[0].matchCol).toBe(7);
  });

  it("leaves line/col undefined when only title or filename matches", () => {
    const { results } = searchIndex([entry("/report.md", "t", "body")], "report", 100);
    expect(results[0].matchLine).toBeUndefined();
    expect(results[0].matchCol).toBeUndefined();
  });
});
