import { describe, expect, it } from "vitest";
import { evaluateWorktrunkVersion } from "../../src/index";

// AC-12.1: verified range is >=0.67.0 <0.68.0. In-range passes; below fails;
// 0.68.0+ warns as unverified; unparseable/null fails.

describe("evaluateWorktrunkVersion", () => {
  it("passes the pinned lower bound 0.67.0", () => {
    const finding = evaluateWorktrunkVersion("0.67.0");
    expect(finding.severity).toBe("pass");
    expect(finding.version).toBe("0.67.0");
  });

  it("passes a later 0.67.x patch", () => {
    expect(evaluateWorktrunkVersion("0.67.9").severity).toBe("pass");
  });

  it("fails a version below 0.67.0", () => {
    const finding = evaluateWorktrunkVersion("0.66.9");
    expect(finding.severity).toBe("fail");
    expect(finding.version).toBe("0.66.9");
  });

  it("warns on 0.68.0 as unverified but not blocked", () => {
    expect(evaluateWorktrunkVersion("0.68.0").severity).toBe("warn");
  });

  it("warns on a much newer 1.0.0", () => {
    expect(evaluateWorktrunkVersion("1.0.0").severity).toBe("warn");
  });

  it("fails unparseable input", () => {
    const finding = evaluateWorktrunkVersion("not-a-version");
    expect(finding.severity).toBe("fail");
    expect(finding.version).toBe("not-a-version");
  });

  it("fails a null version", () => {
    const finding = evaluateWorktrunkVersion(null);
    expect(finding.severity).toBe("fail");
    expect(finding.version).toBeNull();
  });
});
