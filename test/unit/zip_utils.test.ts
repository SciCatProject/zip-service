import * as path from "path";
import { resolvePaths } from "../../src/common/zip_utils";
import { setConfig } from "../helpers/config";
import { baseConfig, createTestEnv, TestEnv } from "../helpers/fixtures";

let env: TestEnv;
const variables = { instrumentId: "loki", proposalId: "123" };

beforeAll(() => {
  env = createTestEnv();
  env.writeData("loki/123/a.txt");
  env.writeData("loki/123/sub/b.txt");
});
afterAll(() => env.cleanup());

beforeEach(() => setConfig(baseConfig(env)));

describe("resolvePaths", () => {
  it("returns an absolute path and the requested name for each file", () => {
    expect(resolvePaths(["a.txt", "sub/b.txt"], variables)).toEqual({
      statusCode: 200,
      paths: [
        { path: path.join(env.dataDir, "loki/123/a.txt"), name: "a.txt" },
        {
          path: path.join(env.dataDir, "loki/123/sub/b.txt"),
          name: "sub/b.txt",
        },
      ],
    });
  });

  it("returns an empty list for no files", () => {
    expect(resolvePaths([], variables)).toEqual({ statusCode: 200, paths: [] });
  });

  it("stops at the first file that cannot be resolved", () => {
    expect(
      resolvePaths(["a.txt", "missing.txt", "sub/b.txt"], variables),
    ).toEqual({
      statusCode: 404,
      paths: [],
      error: "File not found",
    });
  });

  it("propagates resolution errors", () => {
    expect(resolvePaths(["a.txt"], {})).toEqual({
      statusCode: 400,
      paths: [],
      error: "Missing variable 'instrumentId'",
    });
  });
});
