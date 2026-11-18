import * as fs from "fs";
import { config } from "../common/config";
import { logger } from "@user-office-software/duo-logger";
import path from "path";

export interface FileLink {
  filename: string;
  filepath: string;
  token: string;
  expiresAt: number;
  datasetId?: string;
}
export interface FileResolution {
  statusCode: number;
  filename?: string;
  error?: string;
  folders?: string[];
}

export function validateFilenames(filenames: string[]): boolean {
  for (const filename of filenames) {
    if (filename.includes("..")) {
      return false;
    }
  }
  return true;
}

export type VariableValue = string | string[];

const DEFAULT_MAX_RESOLVED_PATH_CANDIDATES = 1000;

class CandidateLimitError extends Error {
  constructor() {
    super("Too many possible file directories");
    this.name = "CandidateLimitError";
  }
}

function getMaxResolvedPathCandidates(): number {
  const configured = Number(config.maxResolvedPathCandidates);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_RESOLVED_PATH_CANDIDATES;
}

// May return multiple values, each one becoming a candidate directory.
function normalizeVariableValue(key: string, value: string): VariableValue {
  if (config.facility === "ILL") {
    if (key.startsWith("proposalId")) {
      return value.startsWith("internalUse") ? value : "exp_" + value;
    } else if (key == "type") {
      if (value == "raw") return "rawdata";
      else if (value == "derived") return ["derived", "processed"];
      else return value;
    } else if (key.startsWith("instrumentId")) {
      return value.toLowerCase();
    }
  }
  return value;
}

const PLACEHOLDER_PATTERN = /\{\{\s*@([^}\s]+)\s*\}\}/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLexicallyInsideDirectory(
  dir: string,
  filePath: string,
  allowEqual = false,
): boolean {
  const relative = path.relative(path.resolve(dir), path.resolve(filePath));
  if (relative === "") return allowEqual;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function realpath(filePath: string): string | null {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return null;
  }
}

function isInsideDirectory(
  dir: string,
  filePath: string,
  allowEqual = false,
): boolean {
  const canonicalDir = realpath(dir);
  const canonicalFile = realpath(filePath);
  if (!canonicalDir || !canonicalFile) return false;

  const relative = path.relative(canonicalDir, canonicalFile);
  if (relative === "") return allowEqual;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function isPathInsideAllowedDataDirectory(filePath: string): boolean {
  const root = config.allowedDataDirectory;
  return Boolean(root && isInsideDirectory(root, filePath));
}

// A relative filename may be in any resolved directory, an absolute one only
// in the resolved directories containing it.
function getFileCandidates(
  resolvedPatterns: string[],
  filename: string,
): FileResolution {
  const folders = path.isAbsolute(filename)
    ? resolvedPatterns.filter((folder) =>
        isLexicallyInsideDirectory(folder, filename),
      )
    : resolvedPatterns;
  if (folders.length === 0) {
    return {
      statusCode: 403,
      error: "File is not accessible from the resolved directories",
    };
  }
  return { statusCode: 200, filename, folders };
}

// Resolves the `{{ @variable }}` pattern placeholders, a list variable value
// expands the pattern into one candidate directory per value.
export function resolvePattern(
  pattern: string,
  variables: Record<string, VariableValue>,
): string[] {
  const keys = new Set(
    [...pattern.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]),
  );
  let resolved = [pattern];
  const maxCandidates = getMaxResolvedPathCandidates();

  for (const key of keys) {
    const value = variables[key];
    const values = (Array.isArray(value) ? value : [value])
      .filter((v) => v !== undefined && v !== null && v !== "")
      .flatMap((v) => normalizeVariableValue(key, String(v)));
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 0) {
      throw new Error(`Missing variable '${key}'`);
    }
    if (resolved.length > maxCandidates / uniqueValues.length) {
      throw new CandidateLimitError();
    }

    const placeholder = new RegExp(
      `\\{\\{\\s*@${escapeRegExp(key)}\\s*\\}\\}`,
      "g",
    );
    resolved = resolved.flatMap((p) =>
      uniqueValues.map((v) => p.replace(placeholder, () => v)),
    );
  }
  if (!resolved.every(validateResolvedPattern))
    throw new Error("The resolved path is not valid or unaccessable !");
  return [...new Set(resolved)];
}

export function validateResolvedPattern(pattern: string): boolean {
  const root = config.allowedDataDirectory;
  if (!root || !isLexicallyInsideDirectory(root, pattern, true)) return false;

  // Lexical validation handles patterns that do not exist yet. Existing
  // patterns are also checked canonically so symlinked directories cannot
  // escape the configured data root.
  const canonicalPattern = realpath(pattern);
  return !canonicalPattern || isInsideDirectory(root, pattern, true);
}

export function findFile(dirPattern: string, filename: string): string[] {
  try {
    const filePath = path.resolve(dirPattern, filename);
    if (!isLexicallyInsideDirectory(dirPattern, filePath)) return [];

    const canonicalRoot = realpath(config.allowedDataDirectory);
    const canonicalFolder = realpath(dirPattern);
    const canonicalFile = realpath(filePath);
    if (!canonicalRoot || !canonicalFolder || !canonicalFile) return [];
    if (!isInsideDirectory(config.allowedDataDirectory, canonicalFile)) return [];
    if (!isInsideDirectory(canonicalFolder, canonicalFile)) return [];

    const stat = fs.statSync(canonicalFile);
    return stat.isFile() ? [canonicalFolder] : [];
  } catch (err) {
    logger.logError("Error searching file directories", { err });
    return [];
  }
}

export function resolveFilePath(
  filename: string,
  variables: Record<string, VariableValue> = {},
): FileResolution {
  const dataRoot = config.allowedDataDirectory;
  const dirPattern = config.directoryPathPattern;
  if (!dataRoot) {
    return {
      statusCode: 500,
      error: "Data root directory is not configured",
    };
  }
  if (!dirPattern) {
    return {
      statusCode: 400,
      error: "directoryPathPattern must be specified",
    };
  }

  let resolvedPatterns: string[];
  try {
    resolvedPatterns = resolvePattern(dirPattern, variables);
  } catch (err) {
    logger.logError("Error resolving file path pattern", { err });
    if (err instanceof CandidateLimitError) {
      return { statusCode: 413, error: err.message };
    }
    return {
      statusCode: 400,
      error:
        err instanceof Error ? err.message : "File path pattern is invalid",
    };
  }
  const candidates = getFileCandidates(resolvedPatterns, filename);
  if (candidates.error) return candidates;
  const matchedFolders = [
    ...new Set(
      (candidates.folders ?? []).flatMap((folder) =>
        findFile(folder, filename),
      ),
    ),
  ];
  if (matchedFolders.length === 0) {
    return {
      statusCode: 404,
      error: "File not found",
    };
  } else if (matchedFolders.length > 1) {
    return {
      statusCode: 409,
      error: "File exists in multiple directories",
      folders: matchedFolders,
    };
  }
  return {
    statusCode: 200,
    filename,
    folders: matchedFolders,
  };
}
