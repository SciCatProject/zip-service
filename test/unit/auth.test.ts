import type express from "express";
import { hasFileAccess } from "../../src/auth";
import { setConfig } from "../helpers/config";
import {
  baseConfig,
  createTestEnv,
  JWT_SECRET,
  makeDataset,
  signToken,
  TestEnv,
} from "../helpers/fixtures";

const mockFindById = jest.fn();

jest.mock("../../src/common/scicatAPI", () => ({
  scicatDataSetAPI: () => ({ datasetsV4ControllerFindByIdV4: mockFindById }),
}));

let env: TestEnv;
beforeAll(() => {
  env = createTestEnv();
});
afterAll(() => env.cleanup());

function makeReq(
  parts: {
    body?: Record<string, unknown>;
    cookies?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
): express.Request {
  return {
    body: parts.body ?? {},
    cookies: parts.cookies ?? {},
    query: parts.query ?? {},
    originalUrl: "/file",
    method: "POST",
  } as unknown as express.Request;
}

const reqWithToken = (groups: string[] = ["owners"]) =>
  makeReq({ body: { jwt: signToken({ groups }) } });

beforeEach(() => {
  setConfig(baseConfig(env));
  mockFindById.mockResolvedValue(makeDataset());
});

describe("hasFileAccess: request validation", () => {
  it("fails with 500 when no JWT secret is configured", async () => {
    setConfig(baseConfig(env, { jwtSecret: undefined }));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result).toMatchObject({ hasAccess: false, statusCode: 500 });
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it("fails with 401 when there is no token", async () => {
    const result = await hasFileAccess(makeReq(), ["a.txt"], "ds");
    expect(result).toMatchObject({
      hasAccess: false,
      statusCode: 401,
      error: "Invalid or expired JWT",
    });
  });

  it("fails with 401 for a token signed with another secret", async () => {
    const token = signToken({ groups: ["owners"] }, {}, "another-secret");
    const result = await hasFileAccess(
      makeReq({ body: { jwt: token } }),
      ["a.txt"],
      "ds",
    );
    expect(result.statusCode).toBe(401);
  });

  it("fails with 401 for an expired token", async () => {
    const token = signToken({ groups: ["owners"] }, { expiresIn: -10 });
    const result = await hasFileAccess(
      makeReq({ body: { jwt: token } }),
      ["a.txt"],
      "ds",
    );
    expect(result.statusCode).toBe(401);
  });

  it.each([
    ["body", (jwt: string) => makeReq({ body: { jwt } })],
    ["cookie", (jwt: string) => makeReq({ cookies: { jwt } })],
    ["query string", (jwt: string) => makeReq({ query: { jwt } })],
  ])("reads the token from the %s", async (_where, build) => {
    const result = await hasFileAccess(
      build(signToken({ groups: ["owners"] })),
      ["a.txt"],
      "ds",
    );
    expect(result.hasAccess).toBe(true);
  });

  it("fails with 400 when no file names are given", async () => {
    const result = await hasFileAccess(reqWithToken(), [], "ds");
    expect(result).toMatchObject({
      hasAccess: false,
      statusCode: 400,
      error: "'fileNames' was not specified",
    });
  });

  it("fails with 404 for file names containing '..'", async () => {
    const result = await hasFileAccess(reqWithToken(), ["../x"], "ds");
    expect(result).toMatchObject({ hasAccess: false, statusCode: 404 });
  });

  it("fails with 400 when the token has no groups", async () => {
    const token = signToken({ groups: undefined });
    const result = await hasFileAccess(
      makeReq({ body: { jwt: token } }),
      ["a.txt"],
      "ds",
    );
    expect(result).toMatchObject({
      hasAccess: false,
      statusCode: 400,
      error: "The jwt does not contain field 'groups'",
    });
  });
});

describe("hasFileAccess: admin shortcut", () => {
  it("lets admins in without a dataset and without asking SciCat", async () => {
    const result = await hasFileAccess(
      reqWithToken(["admin"]),
      ["a.txt"],
      undefined,
    );
    expect(result).toEqual({
      hasAccess: true,
      statusCode: 200,
      error: "",
      fileNames: ["a.txt"],
      variables: {},
    });
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it("does not let admins skip the dataset check when a dataset is given", async () => {
    mockFindById.mockResolvedValue(makeDataset({ ownerGroup: "someone-else" }));
    const result = await hasFileAccess(
      reqWithToken(["admin"]),
      ["a.txt"],
      "ds",
    );
    expect(mockFindById).toHaveBeenCalled();
    expect(result).toMatchObject({ hasAccess: false, statusCode: 403 });
  });

  it("denies a non-admin when no dataset is given", async () => {
    mockFindById.mockRejectedValue(new Error("not found"));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], undefined);
    expect(result).toMatchObject({ hasAccess: false, statusCode: 403 });
  });
});

describe("hasFileAccess: dataset access", () => {
  it("asks SciCat for the requested dataset", async () => {
    await hasFileAccess(reqWithToken(), ["a.txt"], "dataset-1");
    expect(mockFindById).toHaveBeenCalledWith({ pid: "dataset-1" });
  });

  it("grants access to the owner group and returns the variables", async () => {
    const result = await hasFileAccess(
      reqWithToken(),
      ["a.txt", "b.txt"],
      "ds",
    );
    expect(result).toEqual({
      hasAccess: true,
      statusCode: 200,
      error: "",
      fileNames: ["a.txt", "b.txt"],
      variables: { instrumentId: "loki", proposalId: "123" },
    });
  });

  it("grants access through an access group", async () => {
    mockFindById.mockResolvedValue(
      makeDataset({ ownerGroup: "x", accessGroups: ["y", "beamline"] }),
    );
    const result = await hasFileAccess(
      reqWithToken(["beamline"]),
      ["a.txt"],
      "ds",
    );
    expect(result.hasAccess).toBe(true);
  });

  it("grants access to anyone for a published dataset", async () => {
    mockFindById.mockResolvedValue(
      makeDataset({ isPublished: true, ownerGroup: "x" }),
    );
    const result = await hasFileAccess(
      reqWithToken(["unrelated"]),
      ["a.txt"],
      "ds",
    );
    expect(result.hasAccess).toBe(true);
  });

  it("denies a user in none of the dataset's groups", async () => {
    const result = await hasFileAccess(
      reqWithToken(["unrelated"]),
      ["a.txt"],
      "ds",
    );
    expect(result).toEqual({
      hasAccess: false,
      statusCode: 403,
      error: "You do not have access to this resource",
      fileNames: [],
      variables: {},
    });
  });

  it("denies access when SciCat fails", async () => {
    mockFindById.mockRejectedValue(new Error("boom"));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result).toMatchObject({
      hasAccess: false,
      statusCode: 403,
      fileNames: [],
    });
  });
});

describe("hasFileAccess: dataset variables", () => {
  it("only collects the configured variables", async () => {
    setConfig(baseConfig(env, { requiredDatasetVariables: ["instrumentId"] }));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result.variables).toEqual({ instrumentId: "loki" });
  });

  it("returns no variables when none are configured", async () => {
    setConfig(baseConfig(env, { requiredDatasetVariables: undefined }));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result).toMatchObject({ hasAccess: true, variables: {} });
  });

  it("supports list variables", async () => {
    setConfig(baseConfig(env, { requiredDatasetVariables: ["keywords"] }));
    mockFindById.mockResolvedValue(makeDataset({ keywords: ["a", "b"] }));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result.variables).toEqual({ keywords: ["a", "b"] });
  });

  it("supports indexed variables such as keywords[1]", async () => {
    setConfig(baseConfig(env, { requiredDatasetVariables: ["keywords[1]"] }));
    mockFindById.mockResolvedValue(makeDataset({ keywords: ["a", "b"] }));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result.variables).toEqual({ "keywords[1]": "b" });
  });

  it("yields undefined for an index into something that is not a list", async () => {
    setConfig(
      baseConfig(env, { requiredDatasetVariables: ["instrumentId[0]"] }),
    );
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result.variables).toEqual({ "instrumentId[0]": undefined });
  });

  it.each([
    ["..", "../other"],
    ["*", "lo*"],
  ])("rejects a value containing '%s'", async (_what, value) => {
    mockFindById.mockResolvedValue(makeDataset({ instrumentId: value }));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result).toMatchObject({
      hasAccess: false,
      statusCode: 400,
      fileNames: [],
    });
    expect(result.error).toContain("instrumentId");
  });

  it("rejects an ambiguous value inside a list", async () => {
    setConfig(baseConfig(env, { requiredDatasetVariables: ["keywords"] }));
    mockFindById.mockResolvedValue(makeDataset({ keywords: ["ok", "../x"] }));
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result).toMatchObject({ hasAccess: false, statusCode: 400 });
  });

  it("does not leak variables of a dataset the user may not read", async () => {
    mockFindById.mockResolvedValue(
      makeDataset({ ownerGroup: "x", instrumentId: "../secret" }),
    );
    const result = await hasFileAccess(reqWithToken(), ["a.txt"], "ds");
    expect(result.hasAccess).toBe(false);
    expect(result.variables).toEqual({});
  });
});

it("uses the secret from the configuration", async () => {
  setConfig(baseConfig(env, { jwtSecret: "rotated" }));
  const result = await hasFileAccess(
    makeReq({
      body: { jwt: signToken({ groups: ["owners"] }, {}, JWT_SECRET) },
    }),
    ["a.txt"],
    "ds",
  );
  expect(result.statusCode).toBe(401);
});
