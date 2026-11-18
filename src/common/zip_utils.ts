import path from "path";
import { resolveFilePath, VariableValue } from "./file_utils";

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

    absPaths.push({
      path: path.resolve(resolvedFile.folders[0], resolvedFile.filename),
      name: resolvedFile.filename,
    });
  }
  return {
    statusCode: 200,
    paths: absPaths,
  };
}
