import * as path from "path";
import {
  findFile,
  resolveFilePath,
  resolvePattern,
  validateFilenames,
  validateResolvedPattern,
} from "../../src/common/file_utils";
import { setConfig } from "../helpers/config";
import { baseConfig, createTestEnv, TestEnv } from "../helpers/fixtures";

let env: TestEnv;

beforeAll(() => {
  env = createTestEnv();
});
afterAll(() => env.cleanup());

beforeEach(() => {
  setConfig(baseConfig(env));
});

describe("validateFilenames", () => {
  it("accepts plain, nested and empty lists", () => {
    expect(validateFilenames([])).toBe(true);
    expect(validateFilenames(["a.txt", "dir/b.txt", "/abs/c.txt"])).toBe(true);
  });

  it.each(["../secret", "dir/../../secret", "a..b", ".."])(
    "rejects %p",
    (name) => {
      expect(validateFilenames(["ok.txt", name])).toBe(false);
    },
  );
});

describe("validateResolvedPattern", () => {
  it("accepts the allowed directory itself and anything below it", () => {
    expect(validateResolvedPattern(env.dataDir)).toBe(true);
    expect(validateResolvedPattern(path.join(env.dataDir, "a", "b"))).toBe(
      true,
    );
  });

  it("rejects paths outside the allowed directory", () => {
    expect(validateResolvedPattern(env.root)).toBe(false);
    expect(validateResolvedPattern(`${env.dataDir}-sibling`)).toBe(false);
    expect(validateResolvedPattern(path.join(env.dataDir, "..", "x"))).toBe(
      false,
    );
    expect(validateResolvedPattern("/etc")).toBe(false);
  });
});

describe("resolvePattern", () => {
  const base = () => env.dataDir;

  it("returns a pattern without placeholders unchanged", () => {
    expect(resolvePattern(`${base()}/fixed`, {})).toEqual([`${base()}/fixed`]);
  });

  it("substitutes placeholders, tolerating inner whitespace", () => {
    const pattern = `${base()}/{{ @a }}/{{@b}}/{{   @a   }}`;
    expect(resolvePattern(pattern, { a: "x", b: "y" })).toEqual([
      `${base()}/x/y/x`,
    ]);
  });

  it("expands list values into one candidate per value", () => {
    const pattern = `${base()}/{{ @a }}/{{ @b }}`;
    expect(resolvePattern(pattern, { a: ["x", "y"], b: ["1", "2"] })).toEqual([
      `${base()}/x/1`,
      `${base()}/x/2`,
      `${base()}/y/1`,
      `${base()}/y/2`,
    ]);
  });

  it("removes duplicate values and candidates", () => {
    expect(resolvePattern(`${base()}/{{ @a }}`, { a: ["x", "x"] })).toEqual([
      `${base()}/x`,
    ]);
  });

  it("converts non-string values to strings", () => {
    expect(
      resolvePattern(`${base()}/{{ @a }}`, {
        a: 7 as unknown as string,
      }),
    ).toEqual([`${base()}/7`]);
  });

  it("ignores empty values in a list but needs at least one real value", () => {
    expect(
      resolvePattern(`${base()}/{{ @a }}`, {
        a: ["", undefined, "x"] as unknown as string[],
      }),
    ).toEqual([`${base()}/x`]);
    expect(() => resolvePattern(`${base()}/{{ @a }}`, { a: ["", ""] })).toThrow(
      "Missing variable 'a'",
    );
  });

  it("throws when a variable is missing", () => {
    expect(() => resolvePattern(`${base()}/{{ @a }}`, {})).toThrow(
      "Missing variable 'a'",
    );
  });

  it("supports variable names containing regex special characters", () => {
    expect(
      resolvePattern(`${base()}/{{ @a.b[0] }}`, { "a.b[0]": "x" }),
    ).toEqual([`${base()}/x`]);
  });

  // KNOWN BUG: resolvePattern passes the value as the replacement string of
  // String.replace, so "$&", "$`" and "$'" in a dataset value are expanded
  // instead of being used literally. Fix: `p.replace(placeholder, () => v)`.
  // Remove `.failing` once fixed.
  it.failing("does not interpret '$' replacement patterns in values", () => {
    expect(resolvePattern(`${base()}/{{ @a }}`, { a: "$&$1" })).toEqual([
      `${base()}/$&$1`,
    ]);
  });

  it("rejects a pattern that resolves outside the allowed directory", () => {
    expect(() => resolvePattern("/etc/{{ @a }}", { a: "x" })).toThrow(
      "not valid or unaccessable",
    );
    expect(() => resolvePattern(`${base()}/{{ @a }}`, { a: "../.." })).toThrow(
      "not valid or unaccessable",
    );
  });

  describe("ILL facility normalisation", () => {
    beforeEach(() => setConfig(baseConfig(env, { facility: "ILL" })));

    it("prefixes proposal ids with exp_ unless internal use", () => {
      expect(
        resolvePattern(`${base()}/{{ @proposalId }}`, { proposalId: "123" }),
      ).toEqual([`${base()}/exp_123`]);
      expect(
        resolvePattern(`${base()}/{{ @proposalIds }}`, {
          proposalIds: "internalUse42",
        }),
      ).toEqual([`${base()}/internalUse42`]);
    });

    it("maps dataset types to directory names", () => {
      expect(resolvePattern(`${base()}/{{ @type }}`, { type: "raw" })).toEqual([
        `${base()}/rawdata`,
      ]);
      expect(
        resolvePattern(`${base()}/{{ @type }}`, { type: "derived" }),
      ).toEqual([`${base()}/derived`, `${base()}/processed`]);
      expect(
        resolvePattern(`${base()}/{{ @type }}`, { type: "other" }),
      ).toEqual([`${base()}/other`]);
    });

    it("lowercases instrument ids", () => {
      expect(
        resolvePattern(`${base()}/{{ @instrumentId }}`, {
          instrumentId: "D11",
        }),
      ).toEqual([`${base()}/d11`]);
    });

    it("leaves other variables alone", () => {
      expect(
        resolvePattern(`${base()}/{{ @other }}`, { other: "Raw" }),
      ).toEqual([`${base()}/Raw`]);
    });
  });

  it("does not normalise values for other facilities", () => {
    expect(
      resolvePattern(`${base()}/{{ @instrumentId }}`, { instrumentId: "D11" }),
    ).toEqual([`${base()}/D11`]);
  });
});

describe("findFile", () => {
  beforeAll(() => {
    env.writeData("find/present.txt");
    env.writeData("find/sub/nested.txt");
    env.writeData("outside.txt");
  });

  it("returns the directory when the file exists in it", () => {
    const dir = path.join(env.dataDir, "find");
    expect(findFile(dir, "present.txt")).toEqual([dir]);
    expect(findFile(dir, "sub/nested.txt")).toEqual([dir]);
  });

  it("returns nothing for a missing file", () => {
    expect(findFile(path.join(env.dataDir, "find"), "missing.txt")).toEqual([]);
  });

  it("returns nothing for a missing directory", () => {
    expect(findFile(path.join(env.dataDir, "nope"), "present.txt")).toEqual([]);
  });

  it("never escapes the searched directory", () => {
    const dir = path.join(env.dataDir, "find");
    expect(findFile(dir, "../outside.txt")).toEqual([]);
    expect(findFile(dir, path.join(env.dataDir, "outside.txt"))).toEqual([]);
  });

  it("does not match the directory itself", () => {
    const dir = path.join(env.dataDir, "find");
    expect(findFile(dir, ".")).toEqual([]);
  });
});

describe("resolveFilePath", () => {
  const variables = { instrumentId: "loki", proposalId: "123" };

  beforeAll(() => {
    env.writeData("loki/123/a.txt");
    env.writeData("loki/123/sub/b.txt");
    env.writeData("loki/456/other.txt");
  });

  it("finds a relative file in the resolved directory", () => {
    expect(resolveFilePath("a.txt", variables)).toEqual({
      statusCode: 200,
      filename: "a.txt",
      folders: [path.join(env.dataDir, "loki", "123")],
    });
  });

  it("finds a file in a sub directory", () => {
    const result = resolveFilePath("sub/b.txt", variables);
    expect(result.statusCode).toBe(200);
    expect(result.folders).toEqual([path.join(env.dataDir, "loki", "123")]);
  });

  it("accepts an absolute filename inside a resolved directory", () => {
    const absolute = path.join(env.dataDir, "loki", "123", "a.txt");
    const result = resolveFilePath(absolute, variables);
    expect(result.statusCode).toBe(200);
    expect(result.filename).toBe(absolute);
    expect(result.folders).toEqual([path.join(env.dataDir, "loki", "123")]);
  });

  it("refuses an absolute filename outside the resolved directories", () => {
    const sibling = path.join(env.dataDir, "loki", "456", "other.txt");
    expect(resolveFilePath(sibling, variables)).toMatchObject({
      statusCode: 403,
    });
    expect(resolveFilePath("/etc/passwd", variables)).toMatchObject({
      statusCode: 403,
    });
  });

  it("returns 404 for a missing file", () => {
    expect(resolveFilePath("missing.txt", variables)).toEqual({
      statusCode: 404,
      error: "File not found",
    });
  });

  it("returns 404 when the resolved directory does not exist", () => {
    expect(
      resolveFilePath("a.txt", { instrumentId: "odin", proposalId: "1" }),
    ).toMatchObject({ statusCode: 404 });
  });

  it("returns 409 when the file exists in several candidate directories", () => {
    env.writeData("dup/raw/same.txt");
    env.writeData("dup/proc/same.txt");
    setConfig(
      baseConfig(env, {
        directoryPathPattern: `${env.dataDir}/dup/{{ @kind }}`,
      }),
    );

    const result = resolveFilePath("same.txt", { kind: ["raw", "proc"] });
    expect(result.statusCode).toBe(409);
    expect(result.folders).toEqual([
      path.join(env.dataDir, "dup", "raw"),
      path.join(env.dataDir, "dup", "proc"),
    ]);
  });

  it("uses the only candidate directory that has the file", () => {
    env.writeData("some/raw/only.txt");
    setConfig(
      baseConfig(env, {
        directoryPathPattern: `${env.dataDir}/some/{{ @kind }}`,
      }),
    );

    expect(
      resolveFilePath("only.txt", { kind: ["raw", "proc"] }),
    ).toMatchObject({
      statusCode: 200,
      folders: [path.join(env.dataDir, "some", "raw")],
    });
  });

  it("returns 400 when a variable is missing", () => {
    expect(resolveFilePath("a.txt", { instrumentId: "loki" })).toEqual({
      statusCode: 400,
      error: "Missing variable 'proposalId'",
    });
  });

  it("returns 400 when the pattern resolves outside the allowed directory", () => {
    const result = resolveFilePath("a.txt", {
      instrumentId: "..",
      proposalId: "..",
    });
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 when no data root is configured", () => {
    setConfig(baseConfig(env, { allowedDataDirectory: undefined }));
    expect(resolveFilePath("a.txt", variables).statusCode).toBe(500);
  });

  it("returns 400 when no directory pattern is configured", () => {
    setConfig(baseConfig(env, { directoryPathPattern: undefined }));
    expect(resolveFilePath("a.txt", variables)).toEqual({
      statusCode: 400,
      error: "directoryPathPattern must be specified",
    });
  });

  it("supports a pattern equal to the allowed directory", () => {
    setConfig(baseConfig(env, { directoryPathPattern: env.dataDir }));
    env.writeData("root-level.txt");
    expect(resolveFilePath("root-level.txt")).toMatchObject({
      statusCode: 200,
      folders: [env.dataDir],
    });
  });
});
