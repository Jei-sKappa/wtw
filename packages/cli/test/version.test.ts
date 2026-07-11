import { describe, expect, it } from "vitest";
import { WTW_GIT_SHA_OR_DEV, WTW_VERSION } from "../src/version";

describe("version (source mode)", () => {
  it("exposes a semver package version", () => {
    expect(WTW_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reports the source-mode marker when no git sha is injected", () => {
    expect(WTW_GIT_SHA_OR_DEV).toBe("dev");
  });

  it("renders the version string as `<version> (dev)`", () => {
    expect(`${WTW_VERSION} (${WTW_GIT_SHA_OR_DEV})`).toBe(
      `${WTW_VERSION} (dev)`,
    );
  });
});
