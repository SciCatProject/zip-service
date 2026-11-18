import path from "path";
import {
  isPathInsideAllowedDataDirectory,
  resolveFilePath,
  VariableValue,
} from "./file_utils";

export interface ResolvedFile {
  path: string;
  name: string;
}

export interface ResolvedPaths {
  statusCode: number;
  paths: ResolvedFile[];
  error?: string;
}

export function resolvePaths(
  filenames: string[],
  variables: Record<string, VariableValue> = {},
): ResolvedPaths {
  const absPaths: ResolvedFile[] = [];
  for (const file of filenames) {
    const resolvedFile = resolveFilePath(file, variables);
    if (resolvedFile.error) {
      return {
        statusCode: resolvedFile.statusCode,
        paths: [],
        error: resolvedFile.error,
      };
    }

    if (!resolvedFile.filename || !resolvedFile.folders?.[0]) {
      return {
        statusCode: 500,
        paths: [],
        error: "File path could not be resolved",
      };
    }

    const absolutePath = path.resolve(
      resolvedFile.folders[0],
      resolvedFile.filename,
    );
    if (!isPathInsideAllowedDataDirectory(absolutePath)) {
      return {
        statusCode: 403,
        paths: [],
        error: "File is not accessible from the resolved directories",
      };
    }

    absPaths.push({
      path: absolutePath,
      name: resolvedFile.filename,
    });
  }
  return {
    statusCode: 200,
    paths: absPaths,
  };
}
