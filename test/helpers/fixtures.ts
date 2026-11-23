import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import jwt from "jsonwebtoken";

export const JWT_SECRET = "test-jwt-secret";

export interface TestEnv {
  root: string;
  dataDir: string;
  zipDir: string;
  /** Writes `content` to `<dataDir>/<relativePath>`, creating directories. */
  writeData(relativePath: string, content?: string | Buffer): string;
  cleanup(): void;
}

/** Creates an isolated data/zip directory pair under the OS temp dir. */
export function createTestEnv(): TestEnv {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "zip-service-test-")),
  );
  const dataDir = path.join(root, "data");
  const zipDir = path.join(root, "zips");
  fs.mkdirSync(dataDir);
  fs.mkdirSync(zipDir);

  return {
    root,
    dataDir,
    zipDir,
    writeData(relativePath, content = relativePath) {
      const target = path.join(dataDir, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
      return target;
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * A working configuration for `env`: files live under
 * `<dataDir>/<instrumentId>/<proposalId>`, both taken from the dataset.
 */
export function baseConfig(
  env: TestEnv,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    facility: "test",
    jwtSecret: JWT_SECRET,
    sessionSecret: "test-session-secret",
    zipDir: env.zipDir,
    allowedDataDirectory: env.dataDir,
    directoryPathPattern: `${env.dataDir}/{{ @instrumentId }}/{{ @proposalId }}`,
    requiredDatasetVariables: ["instrumentId", "proposalId"],
    ...overrides,
  };
}

export function signToken(
  payload: Record<string, unknown> = { groups: ["owners"] },
  options: jwt.SignOptions = {},
  secret = JWT_SECRET,
): string {
  return jwt.sign({ username: "tester", ...payload }, secret, options);
}

/** A dataset as returned by SciCat, owned by group "owners". */
export function makeDataset(overrides: Record<string, unknown> = {}) {
  return {
    pid: "dataset-1",
    isPublished: false,
    ownerGroup: "owners",
    accessGroups: [] as string[],
    instrumentId: "loki",
    proposalId: "123",
    ...overrides,
  };
}
