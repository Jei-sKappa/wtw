import { WtwError } from "@wtw/core";
import { describe, expect, it } from "vitest";
import { validateCliArgv } from "../src/args";

/** Assert `validateCliArgv(argv)` throws an `invalid_command` `WtwError`. */
function expectInvalidCommand(argv: string[]): void {
  let thrown: unknown;
  try {
    validateCliArgv(argv);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(WtwError);
  expect((thrown as WtwError).code).toBe("invalid_command");
  expect((thrown as WtwError).message.length).toBeGreaterThan(0);
}

describe("validateCliArgv accept branches", () => {
  it("accepts a bare invocation (root help)", () => {
    expect(() => validateCliArgv([])).not.toThrow();
  });

  it.each([
    ["-h"],
    ["--help"],
    ["help"],
    ["-V"],
    ["--version"],
  ])("accepts the root help/version token %s", (token) => {
    expect(() => validateCliArgv([token])).not.toThrow();
  });

  it("accepts init with no options", () => {
    expect(() => validateCliArgv(["init"])).not.toThrow();
  });

  it("accepts check with no options", () => {
    expect(() => validateCliArgv(["check"])).not.toThrow();
  });

  it("accepts sync with no options", () => {
    expect(() => validateCliArgv(["sync"])).not.toThrow();
  });

  it("accepts sync --open", () => {
    expect(() => validateCliArgv(["sync", "--open"])).not.toThrow();
  });

  it.each([["init"], ["sync"], ["check"]])("accepts %s --help", (command) => {
    expect(() => validateCliArgv([command, "--help"])).not.toThrow();
  });

  it("accepts sync -h even after --open", () => {
    expect(() => validateCliArgv(["sync", "--open", "-h"])).not.toThrow();
  });
});

describe("validateCliArgv reject branches", () => {
  it("rejects an unknown command", () => {
    expectInvalidCommand(["frobnicate"]);
  });

  it("rejects a leading unknown flag as command", () => {
    expectInvalidCommand(["--nope"]);
  });

  it("rejects an unknown init option", () => {
    expectInvalidCommand(["init", "--force"]);
  });

  it("rejects an unexpected init positional", () => {
    expectInvalidCommand(["init", "extra"]);
  });

  it("rejects an unknown check option", () => {
    expectInvalidCommand(["check", "--verbose"]);
  });

  it("rejects an unexpected check positional", () => {
    expectInvalidCommand(["check", "extra"]);
  });

  it("rejects an unknown sync option", () => {
    expectInvalidCommand(["sync", "--closed"]);
  });

  it("rejects an unexpected sync positional", () => {
    expectInvalidCommand(["sync", "extra"]);
  });

  it("rejects sync --open with a trailing positional", () => {
    expectInvalidCommand(["sync", "--open", "extra"]);
  });
});
