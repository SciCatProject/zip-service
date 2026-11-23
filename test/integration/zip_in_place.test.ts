import request from "supertest";
import type { Express } from "express";
import { loadApp } from "../helpers/app";
import { binaryParser, readZip } from "../helpers/http";
import {
  baseConfig,
  createTestEnv,
  makeDataset,
  signToken,
  TestEnv,
} from "../helpers/fixtures";

const mockFindById = jest.fn();

jest.mock("../../src/common/scicatAPI", () => ({
  scicatDataSetAPI: () => ({ datasetsV4ControllerFindByIdV4: mockFindById }),
}));

let env: TestEnv;
let app: Express;

beforeAll(() => {
  env = createTestEnv();
  env.writeData("loki/123/a.txt", "content of a");
  env.writeData("loki/123/b.txt", "content of b");
  env.writeData("loki/123/sub/c.txt", "content of c");
  env.writeData("loki/123/folder/inner.txt", "inner");
});
afterAll(() => env.cleanup());

beforeEach(() => {
  mockFindById.mockResolvedValue(makeDataset());
  app = loadApp(baseConfig(env));
});

function post(body: Record<string, unknown> = {}) {
  return request(app)
    .post("/zip_in_place")
    .send({
      jwt: signToken(),
      dataset: "dataset-1",
      files: ["a.txt"],
      ...body,
    });
}

describe("POST /zip_in_place", () => {
  it("streams a zip archive with the requested files", async () => {
    const res = await post({ files: ["a.txt", "sub/c.txt"] })
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toMatch(
      /^attachment; filename="[\w-]+_\d+\.zip"$/,
    );
    expect(await readZip(res.body)).toEqual({
      "a.txt": "content of a",
      "sub/c.txt": "content of c",
    });
  });

  it("skips requested directories", async () => {
    const res = await post({ files: ["a.txt", "folder"] })
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(await readZip(res.body)).toEqual({ "a.txt": "content of a" });
  });

  it("uses a fresh archive name for every request", async () => {
    const first = await post().buffer(true).parse(binaryParser);
    const second = await post().buffer(true).parse(binaryParser);
    expect(first.headers["content-disposition"]).not.toBe(
      second.headers["content-disposition"],
    );
  });

  it("asks SciCat about the requested dataset", async () => {
    await post({ dataset: "my-dataset" }).buffer(true).parse(binaryParser);
    expect(mockFindById).toHaveBeenCalledWith({ pid: "my-dataset" });
  });
});

describe("POST /zip_in_place: request validation", () => {
  it.each([
    ["missing", undefined],
    ["not a list", "a.txt"],
    ["empty", []],
    ["not made of strings", ["a.txt", 3]],
  ])("rejects 'files' that is %s", async (_why, files) => {
    const res = await post({ files });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("'files' must be a non-empty array of strings");
  });

  it("rejects file names containing '..'", async () => {
    const res = await post({ files: ["a.txt", "../../etc/passwd"] });
    expect(res.status).toBe(400);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it("answers 400 when no directoryPathPattern is configured", async () => {
    app = loadApp(baseConfig(env, { directoryPathPattern: undefined }));
    const res = await post();
    expect(res.status).toBe(400);
    expect(res.text).toBe("No data Directory Pattern configuration given");
  });
});

describe("POST /zip_in_place: access control and resolution", () => {
  it("answers 401 for an invalid token", async () => {
    const res = await post({ jwt: "nope" });
    expect(res.status).toBe(401);
  });

  it("answers 403 without access to the dataset", async () => {
    const res = await post({ jwt: signToken({ groups: ["strangers"] }) });
    expect(res.status).toBe(403);
  });

  it("answers 404 if any requested file is missing, without sending an archive", async () => {
    const res = await post({ files: ["a.txt", "missing.txt"] });
    expect(res.status).toBe(404);
    expect(res.text).toBe("File not found");
    expect(res.headers["content-type"]).not.toBe("application/zip");
  });

  it("answers 403 for an absolute path outside the dataset directory", async () => {
    const res = await post({ files: ["/etc/passwd"] });
    expect(res.status).toBe(403);
  });
});
