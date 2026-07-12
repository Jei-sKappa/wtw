import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

// Manifest convention (see specs/001/spec.md §1–2). Requirement ids are
// `<DOMAIN>-FR-<NNNN>`: an uppercase-alphabetic domain prefix and a four-digit
// number scoped to that prefix. The prefix↔file binding is an invariant —
// every FR in one manifest file carries that file's single prefix, and no two
// files share a prefix (enforced in `loadRequirements`). Acceptance ids are
// `AC-<NNNN>`, numbered locally per FR; a bare AC id has no meaning outside its
// FR, so every cross-reference uses the compound form `<FR-ID>.<AC-ID>`. Each
// AC declares one `verifiedBy` kind (`case | checkpoint | unit | manual`) with
// its evidence reference. Withdrawn FRs/ACs stay as `status: retired`
// tombstones with a mandatory `retiredReason`; ids are never reused.
const REQUIREMENT_ID_PATTERN = /^[A-Z]+-FR-\d{4}$/;
const ACCEPTANCE_ID_PATTERN = /^AC-\d{4}$/;
const MANUAL_STEP_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const BANNED_STATEMENT_SUBSTRINGS = ["FR-", "AC-", "(spec"];
const NOTES_TASK_PATTERN = /Task \d/;
const REQUIREMENT_STATUSES = new Set(["active", "deferred", "retired"]);
const VERIFIED_BY_KINDS = new Set(["case", "checkpoint", "unit", "manual"]);
const CASE_MODES = new Set(["contract"]);
const REQUIREMENT_FIELDS = new Set([
  "id",
  "title",
  "status",
  "description",
  "acceptance",
  "notes",
  "replacedBy",
  "retiredReason",
  "coverage",
  "caseMode",
]);
const ACCEPTANCE_FIELDS = new Set([
  "id",
  "statement",
  "verifiedBy",
  "unitTest",
  "manualStep",
  "status",
  "retiredReason",
]);

export type VerifiedBy = "case" | "checkpoint" | "unit" | "manual";

export type AcceptanceCriterion = {
  id: string;
  statement: string;
  verifiedBy: VerifiedBy;
  unitTest?: string;
  manualStep?: string;
  status?: "retired";
  retiredReason?: string;
};

export type Requirement = {
  id: string;
  title: string;
  status: "active" | "deferred" | "retired";
  description: string;
  acceptance: AcceptanceCriterion[];
  notes?: string;
  replacedBy?: string;
  retiredReason?: string;
  coverage?: string;
  caseMode?: "contract";
};

export type RawRequirement = Requirement;

type Source = {
  filePath: string;
};

type LoadedRequirement = {
  requirement: Requirement;
  filePath: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(source: Source, detail: string): never {
  throw new Error(`${source.filePath}: ${detail}`);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  source: Source,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(source, `unknown ${label} field ${key}`);
  }
}

function requireString(value: unknown, field: string, source: Source): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(source, `${field} must be a non-empty string.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  source: Source,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    fail(source, `${field} must be a non-empty string.`);
  }
  return value;
}

/** `validateSafePath` semantics: a non-empty, relative, forward-slash path with
 * no `..` segments. */
function requireSafePath(value: string, field: string, source: Source): string {
  if (value.includes("\\")) {
    fail(source, `${field} must use forward slashes: ${value}`);
  }
  if (path.posix.isAbsolute(value)) {
    fail(source, `${field} must not be absolute: ${value}`);
  }
  if (value.split("/").some((segment) => segment === "..")) {
    fail(source, `${field} must not contain .. path segments: ${value}`);
  }
  return value;
}

function domainPrefix(requirementId: string): string {
  return requirementId.split("-FR-")[0] as string;
}

function validateAcceptance(
  value: unknown,
  requirementId: string,
  index: number,
  source: Source,
): AcceptanceCriterion {
  if (!isRecord(value)) {
    fail(source, `${requirementId}.acceptance[${index}] must be a mapping.`);
  }
  rejectUnknownFields(value, ACCEPTANCE_FIELDS, "acceptance", source);
  const id = requireString(
    value.id,
    `${requirementId}.acceptance[${index}].id`,
    source,
  );
  if (!ACCEPTANCE_ID_PATTERN.test(id)) {
    fail(source, `invalid acceptance criterion id ${requirementId}.${id}`);
  }
  const statement = requireString(
    value.statement,
    `${requirementId}.${id}.statement`,
    source,
  );
  for (const banned of BANNED_STATEMENT_SUBSTRINGS) {
    if (statement.includes(banned)) {
      fail(
        source,
        `${requirementId}.${id} statement must not contain the substring ${banned}`,
      );
    }
  }

  const verifiedBy = requireString(
    value.verifiedBy,
    `${requirementId}.${id}.verifiedBy`,
    source,
  );
  if (!VERIFIED_BY_KINDS.has(verifiedBy)) {
    fail(source, `invalid verifiedBy ${requirementId}.${id}: ${verifiedBy}`);
  }

  const unitTest = optionalString(
    value.unitTest,
    `${requirementId}.${id}.unitTest`,
    source,
  );
  if (unitTest !== undefined) {
    requireSafePath(unitTest, `${requirementId}.${id}.unitTest`, source);
  }
  if (verifiedBy === "unit" && unitTest === undefined) {
    fail(source, `${requirementId}.${id} verifiedBy unit requires unitTest.`);
  }
  if (verifiedBy !== "unit" && unitTest !== undefined) {
    fail(
      source,
      `${requirementId}.${id} unitTest is only allowed when verifiedBy is unit.`,
    );
  }

  const manualStep = optionalString(
    value.manualStep,
    `${requirementId}.${id}.manualStep`,
    source,
  );
  if (manualStep !== undefined && !MANUAL_STEP_PATTERN.test(manualStep)) {
    fail(source, `invalid manualStep ${requirementId}.${id}: ${manualStep}`);
  }
  if (verifiedBy === "manual" && manualStep === undefined) {
    fail(
      source,
      `${requirementId}.${id} verifiedBy manual requires manualStep.`,
    );
  }
  if (verifiedBy !== "manual" && manualStep !== undefined) {
    fail(
      source,
      `${requirementId}.${id} manualStep is only allowed when verifiedBy is manual.`,
    );
  }

  const status = optionalString(
    value.status,
    `${requirementId}.${id}.status`,
    source,
  );
  if (status !== undefined && status !== "retired") {
    fail(
      source,
      `invalid acceptance criterion status ${requirementId}.${id}: ${status}`,
    );
  }
  const retiredReason = optionalString(
    value.retiredReason,
    `${requirementId}.${id}.retiredReason`,
    source,
  );
  if (status === "retired" && retiredReason === undefined) {
    fail(
      source,
      `${requirementId}.${id} retired acceptance criterion requires retiredReason.`,
    );
  }

  return {
    id,
    statement,
    verifiedBy: verifiedBy as VerifiedBy,
    ...(unitTest === undefined ? {} : { unitTest }),
    ...(manualStep === undefined ? {} : { manualStep }),
    ...(status === undefined ? {} : { status: status as "retired" }),
    ...(retiredReason === undefined ? {} : { retiredReason }),
  };
}

export function validateRequirements(
  value: unknown,
  source: Source,
): Requirement[] {
  if (!Array.isArray(value)) fail(source, "requirements file must be a list.");

  const seenRequirements = new Set<string>();
  return value.map((raw, index) => {
    if (!isRecord(raw))
      fail(source, `requirements[${index}] must be a mapping.`);
    rejectUnknownFields(raw, REQUIREMENT_FIELDS, "requirement", source);
    const id = requireString(raw.id, `requirements[${index}].id`, source);
    if (!REQUIREMENT_ID_PATTERN.test(id))
      fail(source, `invalid requirement id ${id}`);
    if (seenRequirements.has(id))
      fail(source, `duplicate requirement id ${id}`);
    seenRequirements.add(id);

    const title = requireString(raw.title, `${id}.title`, source);
    const status = requireString(raw.status, `${id}.status`, source);
    if (!REQUIREMENT_STATUSES.has(status)) {
      fail(source, `invalid requirement status ${id}: ${status}`);
    }
    const description = requireString(
      raw.description,
      `${id}.description`,
      source,
    );
    if (!Array.isArray(raw.acceptance) || raw.acceptance.length === 0) {
      fail(source, `${id}.acceptance must be a non-empty list.`);
    }

    const seenAcceptance = new Set<string>();
    const acceptance = raw.acceptance.map((item, acceptanceIndex) => {
      const criterion = validateAcceptance(item, id, acceptanceIndex, source);
      if (seenAcceptance.has(criterion.id)) {
        fail(source, `duplicate acceptance criterion id ${id}.${criterion.id}`);
      }
      seenAcceptance.add(criterion.id);
      return criterion;
    });

    const retiredReason = optionalString(
      raw.retiredReason,
      `${id}.retiredReason`,
      source,
    );
    const coverage = optionalString(raw.coverage, `${id}.coverage`, source);
    if (status === "retired" && retiredReason === undefined) {
      fail(source, `${id} retired requirement requires retiredReason.`);
    }
    if (status === "deferred" && coverage === undefined) {
      fail(source, `${id} deferred requirement requires coverage.`);
    }

    const notes = optionalString(raw.notes, `${id}.notes`, source);
    if (notes !== undefined && NOTES_TASK_PATTERN.test(notes)) {
      fail(source, `${id}.notes must not carry task references: ${notes}`);
    }
    const replacedBy = optionalString(
      raw.replacedBy,
      `${id}.replacedBy`,
      source,
    );
    const caseMode = optionalString(raw.caseMode, `${id}.caseMode`, source);
    if (caseMode !== undefined && !CASE_MODES.has(caseMode)) {
      fail(source, `invalid caseMode ${id}: ${caseMode}`);
    }

    return {
      id,
      title,
      status: status as Requirement["status"],
      description,
      acceptance,
      ...(notes === undefined ? {} : { notes }),
      ...(replacedBy === undefined ? {} : { replacedBy }),
      ...(retiredReason === undefined ? {} : { retiredReason }),
      ...(coverage === undefined ? {} : { coverage }),
      ...(caseMode === undefined ? {} : { caseMode: caseMode as "contract" }),
    };
  });
}

function rejectDuplicateRequirementIds(
  requirements: LoadedRequirement[],
): void {
  const seen = new Map<string, string>();
  for (const { requirement, filePath } of requirements) {
    const previous = seen.get(requirement.id);
    if (previous !== undefined) {
      throw new Error(
        `${filePath}: duplicate requirement id ${requirement.id} (already defined in ${previous})`,
      );
    }
    seen.set(requirement.id, filePath);
  }
}

/** Bind one domain prefix to each manifest file: every FR in a file shares that
 * file's single prefix, and no two files share a prefix. */
function rejectPrefixViolations(requirements: LoadedRequirement[]): void {
  const prefixByFile = new Map<string, string>();
  const fileByPrefix = new Map<string, string>();
  for (const { requirement, filePath } of requirements) {
    const prefix = domainPrefix(requirement.id);
    const filePrefix = prefixByFile.get(filePath);
    if (filePrefix === undefined) {
      prefixByFile.set(filePath, prefix);
    } else if (filePrefix !== prefix) {
      throw new Error(
        `${filePath}: file mixes domain prefixes ${filePrefix} and ${prefix}`,
      );
    }
    const prefixFile = fileByPrefix.get(prefix);
    if (prefixFile !== undefined && prefixFile !== filePath) {
      throw new Error(
        `${filePath}: domain prefix ${prefix} already used by ${prefixFile}`,
      );
    }
    fileByPrefix.set(prefix, filePath);
  }
}

export async function loadRequirements(root: string): Promise<Requirement[]> {
  const dirPath = "requirements/functional";
  const absoluteDir = path.join(root, dirPath);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yml"))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();

  const loaded: LoadedRequirement[] = [];
  for (const filePath of files) {
    const source = await readFile(path.join(root, filePath), "utf8");
    const requirements = validateRequirements(YAML.parse(source), { filePath });
    loaded.push(
      ...requirements.map((requirement) => ({ requirement, filePath })),
    );
  }

  rejectDuplicateRequirementIds(loaded);
  rejectPrefixViolations(loaded);
  return loaded.map((entry) => entry.requirement);
}

export function acceptanceRef(requirementId: string, acId: string): string {
  return `${requirementId}.${acId}`;
}

export async function loadPackageVersion(root: string): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(`${root}/package.json`, "utf8"),
  ) as {
    version?: unknown;
  };
  if (
    typeof packageJson.version !== "string" ||
    packageJson.version.length === 0
  ) {
    throw new Error("package.json: version must be a non-empty string.");
  }
  return packageJson.version;
}
