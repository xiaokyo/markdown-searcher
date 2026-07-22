import { escapeRegExp, neutralizeFences, highlightKeywords, wrapKeywords, buildDetailMarkdown } from "./markdown";

describe("escapeRegExp", () => {
  it("escapes regex specials", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });
});

describe("neutralizeFences", () => {
  it("replaces ``` so excerpts can't break rendering", () => {
    expect(neutralizeFences("a ``` b")).toBe("a ˋˋˋ b");
  });
});

describe("highlightKeywords", () => {
  it("bolds each keyword case-insensitively", () => {
    expect(highlightKeywords("Hello World", ["world"])).toBe("Hello **World**");
  });
  it("bolds multiple keywords", () => {
    expect(highlightKeywords("foo bar baz", ["foo", "baz"])).toBe("**foo** bar **baz**");
  });
  it("returns text unchanged with no keywords", () => {
    expect(highlightKeywords("foo", [])).toBe("foo");
  });
});

describe("wrapKeywords", () => {
  it("wraps every keyword with corner brackets", () => {
    expect(wrapKeywords("foo bar", ["foo", "bar"])).toBe("「foo」 「bar」");
  });
});

describe("buildDetailMarkdown", () => {
  it("returns content unchanged with no keywords", () => {
    expect(buildDetailMarkdown("# Title\nbody", [])).toBe("# Title\nbody");
  });

  it("returns content unchanged when keywords match nothing", () => {
    const content = "# Title\nsome body text";
    expect(buildDetailMarkdown(content, ["zzz"])).toBe(content);
  });

  it("puts a highlighted excerpt on top and the full content below", () => {
    const content = "line1\nintro alpha here\nline3";
    const out = buildDetailMarkdown(content, ["alpha"]);
    // excerpt highlights the match
    expect(out).toContain("intro **alpha** here");
    // full original content appended verbatim (nothing lost, incl. earlier line1)
    expect(out).toContain(content);
    expect(out).toContain("line1");
  });

  it("highlights all match points in the top excerpt section", () => {
    const content = "alpha here\n" + "x".repeat(400) + "\nalpha again";
    const out = buildDetailMarkdown(content, ["alpha"]);
    // both bolded in excerpt; full content appended raw
    expect((out.match(/\*\*alpha\*\*/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(out).toContain(content);
  });

  it("keeps block-level markdown at line start so the excerpt renders", () => {
    const content = "intro line\n## Heading alpha\n- item alpha\nmore";
    const out = buildDetailMarkdown(content, ["alpha"]);
    expect(out).toContain("## Heading **alpha**");
    expect(out).toContain("- item **alpha**");
    expect(out).not.toMatch(/^>/m);
  });

  it("neutralizes fences inside the excerpt but keeps full content fences intact", () => {
    const content = "before ``` alpha ``` after";
    const out = buildDetailMarkdown(content, ["alpha"]);
    expect(out).toContain("ˋˋˋ");
    expect(out).toContain(content);
  });

  it("neutralizes full content when it has an unbalanced (odd) fence, so it can't swallow the view", () => {
    const content = "alpha\n" + "x".repeat(300) + "\n```\nunclosed code block";
    const out = buildDetailMarkdown(content, ["alpha"]);
    // excerpt window doesn't reach the fence, so the ``` must be neutralized via the full-content guard
    expect(out).toContain("ˋˋˋ");
    expect(out).not.toContain("```");
  });

  it("keeps balanced (even) fences in full content so code still renders", () => {
    const content = "alpha\n" + "x".repeat(300) + "\n```\ncode\n```\nend";
    const out = buildDetailMarkdown(content, ["alpha"]);
    expect(out).toContain("```");
    expect(out).not.toContain("ˋˋˋ");
  });
});
