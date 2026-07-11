import packageJson from "../package.json" with { type: "json" };

export const WTW_VERSION = packageJson.version;

// `WTW_GIT_SHA` is a build-time define (see globals.d.ts). When it is not
// injected — running from source or under tests — `typeof` is "undefined" and
// the version reports the source-mode marker "dev".
export const WTW_GIT_SHA_OR_DEV =
  typeof WTW_GIT_SHA === "string" ? WTW_GIT_SHA : "dev";
