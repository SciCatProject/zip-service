import request from "supertest";
import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
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
});
afterAll(() => env.cleanup());

beforeEach(() => {
  for (const file of fs.readdirSync(env.zipDir)) {
    fs.rmSync(path.join(env.zipDir, file), { recursive: true, force: true });
  }
  mockFindById.mockResolvedValue(makeDataset());
  app = loadApp(baseConfig(env));
});

type Agent = ReturnType<typeof request.agent>;

function startZip(agent: Agent, body: Record<string, unknown> = {}) {
  return agent.post("/zip").send({
    jwt: signToken(),
    dataset: "dataset-1",
    files: ["a.txt", "b.txt"],
    ...body,
  });
}

interface ZipStatus {
  ready: boolean;
  zipFileName: string;
  currentFileIndex: number;
  files: { fileName: string; size: number; progress: number }[];
  datasetId: string;
}

async function waitUntilReady(agent: Agent): Promise<ZipStatus> {
  const deadline = Date.now() + 10000;
  for (;;) {
    const res = await agent.get("/zip/status");
    expect(res.status).toBe(200);
    if (res.body.ready) return res.body;
    if (Date.now() > deadline) throw new Error("zip was not ready in time");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("GET /zip (form)", () => {
  it("renders the form with empty fields", async () => {
    const res = await request(app).get("/zip");
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="jwt"');
    expect(res.text).toMatch(/name="jwt"[^>]*value=""/);
  });

  it("is a 404 when the form is disabled", async () => {
    app = loadApp(baseConfig(env, { formViewsEnabled: { zip: false } }));
    expect((await request(app).get("/zip")).status).toBe(404);
  });
});

describe("zip, poll and download", () => {
  it("zips the files in the background and serves the result once", async () => {
    const agent = request.agent(app);

    const started = await startZip(agent, { files: ["a.txt", "sub/c.txt"] });
    expect(started.status).toBe(200);
    expect(started.text).toContain("Please wait, the files are being zipped");

    const status = await waitUntilReady(agent);
    expect(status.datasetId).toBe("dataset-1");
    expect(status.files.map((f) => f.fileName)).toEqual(["a.txt", "sub/c.txt"]);
    expect(status.files.map((f) => f.size)).toEqual([
      "content of a".length,
      "content of c".length,
    ]);
    expect(status.zipFileName).toMatch(/^[\w-]+_\d+\.zip$/);
    expect(started.text).toContain(status.zipFileName);

    const download = await agent
      .get(`/download/${status.zipFileName}`)
      .buffer(true)
      .parse(binaryParser);
    expect(download.status).toBe(200);
    expect(download.headers["content-disposition"]).toBe(
      `attachment; filename=${status.zipFileName}`,
    );
    expect(download.headers["content-length"]).toBe(
      String(download.body.length),
    );
    expect(await readZip(download.body)).toEqual({
      "a.txt": "content of a",
      "sub/c.txt": "content of c",
    });

    // The session no longer references the archive: the link is single use.
    const again = await agent.get(`/download/${status.zipFileName}`);
    expect(again.status).toBe(403);
    expect(again.text).toContain("You do not have access to this file");
  });

  it("writes the archive into the configured zip directory", async () => {
    const agent = request.agent(app);
    await startZip(agent);
    const { zipFileName } = await waitUntilReady(agent);
    expect(fs.existsSync(path.join(env.zipDir, zipFileName))).toBe(true);
  });

  it("creates the zip directory if it does not exist", async () => {
    const zipDir = path.join(env.root, "created-on-demand");
    app = loadApp(baseConfig(env, { zipDir }));
    const agent = request.agent(app);

    await startZip(agent);
    await waitUntilReady(agent);
    expect(fs.existsSync(zipDir)).toBe(true);
  });

  it("reports progress of 1 for every file once ready", async () => {
    const agent = request.agent(app);
    await startZip(agent);
    const status = await waitUntilReady(agent);
    expect(status.currentFileIndex).toBe(2);
    expect(status.files.every((f) => f.progress === 1)).toBe(true);
  });

  it("keeps zip jobs of different sessions apart", async () => {
    const first = request.agent(app);
    const second = request.agent(app);
    await startZip(first, { files: ["a.txt"] });
    await startZip(second, { files: ["b.txt"] });

    const a = await waitUntilReady(first);
    const b = await waitUntilReady(second);
    expect(a.zipFileName).not.toBe(b.zipFileName);

    const forbidden = await first.get(`/download/${b.zipFileName}`);
    expect(forbidden.status).toBe(403);

    const own = await second
      .get(`/download/${b.zipFileName}`)
      .buffer(true)
      .parse(binaryParser);
    expect(await readZip(own.body)).toEqual({ "b.txt": "content of b" });
  });
});

describe("POST /zip: validation", () => {
  it.each([
    ["missing", undefined],
    ["empty", []],
    ["not made of strings", [1]],
  ])("rejects 'files' that is %s", async (_why, files) => {
    const res = await startZip(request.agent(app), { files });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("'files' must be a non-empty array of strings");
  });

  it("rejects file names containing '..'", async () => {
    const res = await startZip(request.agent(app), { files: ["../x"] });
    expect(res.status).toBe(400);
  });

  it("answers 400 when no directoryPathPattern is configured", async () => {
    app = loadApp(baseConfig(env, { directoryPathPattern: undefined }));
    const res = await startZip(request.agent(app));
    expect(res.status).toBe(400);
  });

  it("answers 401 for an invalid token", async () => {
    const res = await startZip(request.agent(app), { jwt: "nope" });
    expect(res.status).toBe(401);
  });

  it("answers 403 without access to the dataset", async () => {
    const res = await startZip(request.agent(app), {
      jwt: signToken({ groups: ["strangers"] }),
    });
    expect(res.status).toBe(403);
  });

  it("answers 404 if a file is missing and does not start zipping", async () => {
    const agent = request.agent(app);
    const res = await startZip(agent, { files: ["a.txt", "missing.txt"] });
    expect(res.status).toBe(404);
    expect(fs.readdirSync(env.zipDir)).toEqual([]);
  });
});

describe("GET /download/:file", () => {
  it("does not serve files that are not the session's archive", async () => {
    fs.writeFileSync(path.join(env.zipDir, "secret.zip"), "secret");
    const agent = request.agent(app);
    await startZip(agent);
    await waitUntilReady(agent);

    const res = await agent.get("/download/secret.zip");
    expect(res.status).toBe(403);
  });

  it("does not allow path traversal", async () => {
    const agent = request.agent(app);
    await startZip(agent);
    await waitUntilReady(agent);

    const res = await agent.get("/download/..%2Fdata%2Floki%2F123%2Fa.txt");
    expect(res.status).toBe(403);
  });

  it("answers 404 when the archive has been removed", async () => {
    const agent = request.agent(app);
    await startZip(agent);
    const { zipFileName } = await waitUntilReady(agent);
    fs.rmSync(path.join(env.zipDir, zipFileName));

    const res = await agent.get(`/download/${zipFileName}`);
    expect(res.status).toBe(404);
    expect(res.text).toBe("File not found");
  });

  // KNOWN BUG: without a zip in the session the error page is rendered with
  // HTTP 200 although it says 403 (the other branches set the status).
  // Remove `.failing` once fixed.
  it.failing("answers 403 when the session has no archive", async () => {
    const res = await request(app).get("/download/whatever.zip");
    expect(res.status).toBe(403);
    expect(res.text).toContain("This download link is no longer valid");
  });
});

describe("GET /zip/status", () => {
  // KNOWN BUG: the handler destructures req.session.zipData without checking
  // that it exists, so polling without having started a zip is a 500 (TypeError).
  // Remove `.failing` once fixed.
  it.failing(
    "does not fail with a server error without a started zip",
    async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const res = await request(app).get("/zip/status");
      expect(res.status).toBeLessThan(500);
    },
  );
});
