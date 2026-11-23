import request from "supertest";
import * as fs from "fs";
import type { Express } from "express";
import { loadApp } from "../helpers/app";
import { binaryParser } from "../helpers/http";
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

const CONTENT = "0123456789";
const HDF_VIEW_URL = "https://hdf.example.org/view";
const PUBLIC_ORIGIN = "https://zip.example.org";

let env: TestEnv;
let app: Express;

beforeAll(() => {
  env = createTestEnv();
  env.writeData("loki/123/data.txt", CONTENT);
  env.writeData("loki/123/sub/nested.txt", "nested");
  env.writeData("loki/123/scan.h5", "hdf-content");
  env.writeData('loki/123/we"ird.txt', "weird");
  env.writeData("loki/123/folder/placeholder.txt", "x");
  env.writeData("loki/999/foreign.txt", "foreign");
});
afterAll(() => env.cleanup());

function startApp(overrides: Record<string, unknown> = {}) {
  app = loadApp(
    baseConfig(env, {
      publicOrigin: PUBLIC_ORIGIN,
      hdfViewServiceUrl: HDF_VIEW_URL,
      ...overrides,
    }),
  );
}

beforeEach(() => {
  mockFindById.mockResolvedValue(makeDataset());
  startApp();
});

const token = (groups = ["owners"]) => signToken({ groups });

function createLink(body: Record<string, unknown> = {}) {
  return request(app)
    .post("/file")
    .send({ jwt: token(), dataset: "dataset-1", file: "data.txt", ...body });
}

async function getLinkUrls(file = "data.txt") {
  const res = await createLink({ file });
  expect(res.status).toBe(201);
  return res.body as {
    fileName: string;
    size: number;
    expiresAt: string;
    downloadUrl: string;
    streamUrl: string;
    openUrl: string;
  };
}

describe("GET /file (form)", () => {
  it("renders the form with empty fields", async () => {
    const res = await request(app).get("/file");
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="jwt"');
    expect(res.text).toMatch(/name="jwt"[^>]*value=""/);
  });

  it("is a 404 when the form is disabled", async () => {
    startApp({ formViewsEnabled: { file: false } });
    const res = await request(app).get("/file");
    expect(res.status).toBe(404);
  });
});

describe("POST /file: request validation", () => {
  it("requires exactly one file", async () => {
    const none = await request(app).post("/file").send({ jwt: token() });
    expect(none.status).toBe(400);
    expect(none.body.error).toBe("Exactly one file must be specified");

    const two = await createLink({ file: undefined, files: ["a", "b"] });
    expect(two.status).toBe(400);
    expect(two.body.error).toBe("Exactly one file must be specified");
  });

  it("requires the file to be a string", async () => {
    const res = await createLink({ file: undefined, files: [{ a: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("File must be a string");
  });

  it("rejects file names containing '..'", async () => {
    const res = await createLink({ file: "../etc/passwd" });
    expect(res.status).toBe(400);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it("requires a configured directoryPathPattern", async () => {
    startApp({ directoryPathPattern: undefined });
    const res = await createLink();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("directoryPathPattern must be specified");
  });

  it.each([
    ["files", { file: undefined, files: ["data.txt"] }],
    ["fileName", { file: undefined, fileName: "data.txt" }],
    ["file", { file: "data.txt" }],
  ])("accepts the file name in field '%s'", async (_field, body) => {
    const res = await createLink(body);
    expect(res.status).toBe(201);
    expect(res.body.fileName).toBe("data.txt");
  });

  it("accepts urlencoded form posts and the datasetId alias", async () => {
    const res = await request(app)
      .post("/file")
      .type("form")
      .send({ jwt: token(), datasetId: "dataset-1", file: "data.txt" });
    expect(res.status).toBe(201);
    expect(mockFindById).toHaveBeenCalledWith({ pid: "dataset-1" });
  });
});

describe("POST /file: access control", () => {
  it("answers 401 without a valid token", async () => {
    const res = await createLink({ jwt: "garbage" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired JWT");
  });

  it("answers 403 for users without access to the dataset", async () => {
    const res = await createLink({ jwt: token(["strangers"]) });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("You do not have access to this resource");
  });

  it("accepts the token from a cookie", async () => {
    const res = await request(app)
      .post("/file")
      .set("Cookie", `jwt=${token()}`)
      .send({ dataset: "dataset-1", file: "data.txt" });
    expect(res.status).toBe(201);
  });
});

describe("POST /file: file resolution", () => {
  it("answers 404 for a file that does not exist", async () => {
    const res = await createLink({ file: "missing.txt" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("File not found");
  });

  it("answers 404 for a directory", async () => {
    const res = await createLink({ file: "folder" });
    expect(res.status).toBe(404);
  });

  it("answers 403 for an absolute path outside the dataset directory", async () => {
    const res = await createLink({
      file: `${env.dataDir}/loki/999/foreign.txt`,
    });
    expect(res.status).toBe(403);
  });

  it("answers 400 when the dataset lacks a required variable", async () => {
    mockFindById.mockResolvedValue(makeDataset({ proposalId: undefined }));
    const res = await createLink();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing variable 'proposalId'");
  });

  it("finds files in sub directories and by absolute path", async () => {
    const nested = await createLink({ file: "sub/nested.txt" });
    expect(nested.status).toBe(201);

    const absolute = await createLink({
      file: `${env.dataDir}/loki/123/data.txt`,
    });
    expect(absolute.status).toBe(201);
  });
});

describe("POST /file: link creation", () => {
  it("returns the file name, size, expiry and the three access URLs", async () => {
    const before = Date.now();
    const body = await getLinkUrls();

    expect(body.fileName).toBe("data.txt");
    expect(body.size).toBe(CONTENT.length);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThanOrEqual(
      before + 3600000 - 1000,
    );
    expect(body.downloadUrl).toMatch(/^\/file\/download\?token=[\w-]+$/);
    expect(body.streamUrl).toMatch(/^\/file\/stream\?token=[\w-]+$/);
    expect(body.openUrl).toMatch(/^\/file\/open\?token=[\w-]+$/);
  });

  it("issues a different token for every request", async () => {
    const first = await getLinkUrls();
    const second = await getLinkUrls();
    expect(first.downloadUrl).not.toBe(second.downloadUrl);
  });

  it("prefixes the URLs with the configured route base path", async () => {
    startApp({ routeBasePath: "zip-service/" });
    const body = await getLinkUrls();
    expect(body.downloadUrl).toMatch(/^\/zip-service\/file\/download\?token=/);
    expect(body.streamUrl).toMatch(/^\/zip-service\/file\/stream\?token=/);
    expect(body.openUrl).toMatch(/^\/zip-service\/file\/open\?token=/);
  });

  it("honours the configured link retention", async () => {
    startApp({ fileLinkRetentionMillis: 60000 });
    const body = await getLinkUrls();
    const ttl = new Date(body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeLessThanOrEqual(60000);
    expect(ttl).toBeGreaterThan(50000);
  });

  it("redirects to the download when the Download action is chosen", async () => {
    const res = await createLink({ fileAction: "Download" });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/^\/file\/download\?token=/);
  });

  it("redirects to the viewer link when the Open action is chosen for HDF", async () => {
    const res = await createLink({ file: "scan.h5", fileAction: "Open" });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/^\/file\/open\?token=/);
  });

  it("refuses the Open action for files the viewer cannot show", async () => {
    const res = await createLink({ fileAction: "Open" });
    expect(res.status).toBe(400);
    expect(res.text).toContain(
      "only .h5, .hdf5, .hdf, .nxs files can be opened",
    );
    expect(mockFindById).not.toHaveBeenCalled();
  });
});

describe("GET /file/download and /file/stream", () => {
  it("sends the whole file as an attachment", async () => {
    const { downloadUrl } = await getLinkUrls();
    const res = await request(app)
      .get(downloadUrl)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe(CONTENT);
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="data.txt"',
    );
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.headers["content-length"]).toBe(String(CONTENT.length));
  });

  it("serves the file inline from /file/stream", async () => {
    const { streamUrl } = await getLinkUrls();
    const res = await request(app)
      .get(streamUrl)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe(CONTENT);
    expect(res.headers["content-disposition"]).toBe(
      'inline; filename="data.txt"',
    );
  });

  it("uses the HDF5 content type for HDF files", async () => {
    const { streamUrl } = await getLinkUrls("scan.h5");
    const res = await request(app)
      .get(streamUrl)
      .buffer(true)
      .parse(binaryParser);
    expect(res.headers["content-type"]).toBe("application/x-hdf5");
  });

  it("sanitises quotes in the file name of the Content-Disposition header", async () => {
    const { downloadUrl } = await getLinkUrls('we"ird.txt');
    const res = await request(app).get(downloadUrl);
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="we_ird.txt"',
    );
  });

  it("may be used more than once until the link expires", async () => {
    const { downloadUrl } = await getLinkUrls();
    expect((await request(app).get(downloadUrl)).status).toBe(200);
    expect((await request(app).get(downloadUrl)).status).toBe(200);
  });

  it.each([
    ["an unknown", "/file/download?token=unknown"],
    ["a missing", "/file/download"],
    ["a repeated", "/file/download?token=a&token=b"],
  ])("answers 403 for %s token", async (_kind, url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(403);
    expect(res.text).toBe("This file link is no longer valid");
  });

  it("answers 403 once the link has expired", async () => {
    const { downloadUrl } = await getLinkUrls();
    const later = Date.now() + 3600000 + 1000;
    jest.spyOn(Date, "now").mockReturnValue(later);

    const res = await request(app).get(downloadUrl);
    expect(res.status).toBe(403);
  });

  it("answers 404 when the file was removed after the link was issued", async () => {
    const target = env.writeData("loki/123/short-lived.txt");
    const { downloadUrl } = await getLinkUrls("short-lived.txt");
    fs.rmSync(target);

    const res = await request(app).get(downloadUrl);
    expect(res.status).toBe(404);
  });

  it("does not accept a token from one link on a different file", async () => {
    const first = await getLinkUrls("data.txt");
    const second = await getLinkUrls("sub/nested.txt");
    const a = await request(app)
      .get(first.downloadUrl)
      .buffer(true)
      .parse(binaryParser);
    const b = await request(app)
      .get(second.downloadUrl)
      .buffer(true)
      .parse(binaryParser);
    expect(a.body.toString()).toBe(CONTENT);
    expect(b.body.toString()).toBe("nested");
  });
});

describe("range requests", () => {
  async function ranged(range: string) {
    const { downloadUrl } = await getLinkUrls();
    return request(app)
      .get(downloadUrl)
      .set("Range", range)
      .buffer(true)
      .parse(binaryParser);
  }

  it.each([
    ["bytes=2-5", "2345", "bytes 2-5/10"],
    ["bytes=0-0", "0", "bytes 0-0/10"],
    ["bytes=5-", "56789", "bytes 5-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
    ["bytes=-100", CONTENT, "bytes 0-9/10"],
    ["bytes=0-9", CONTENT, "bytes 0-9/10"],
  ])("serves %s as a partial response", async (range, body, contentRange) => {
    const res = await ranged(range);
    expect(res.status).toBe(206);
    expect(res.body.toString()).toBe(body);
    expect(res.headers["content-range"]).toBe(contentRange);
    expect(res.headers["content-length"]).toBe(String(body.length));
  });

  it.each([
    "bytes=10-",
    "bytes=0-10",
    "bytes=5-2",
    "bytes=-0",
    "bytes=-",
    "bytes=a-b",
    "items=0-1",
    "bytes=0-1,3-4",
  ])("answers 416 for the unsatisfiable range %p", async (range) => {
    const res = await ranged(range);
    expect(res.status).toBe(416);
    expect(res.headers["content-range"]).toBe("bytes */10");
  });
});

describe("HEAD /file/download and /file/stream", () => {
  it("returns the headers of a download without a body", async () => {
    const { downloadUrl } = await getLinkUrls();
    const res = await request(app).head(downloadUrl);
    expect(res.status).toBe(200);
    expect(res.headers["content-length"]).toBe(String(CONTENT.length));
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="data.txt"',
    );
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.text).toBeFalsy();
  });

  it("returns inline headers for a stream", async () => {
    const { streamUrl } = await getLinkUrls();
    const res = await request(app).head(streamUrl);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe(
      'inline; filename="data.txt"',
    );
  });

  it("answers 403 for an invalid token", async () => {
    expect((await request(app).head("/file/download?token=nope")).status).toBe(
      403,
    );
    expect((await request(app).head("/file/stream?token=nope")).status).toBe(
      403,
    );
  });

  it("answers 404 when the file is gone", async () => {
    const target = env.writeData("loki/123/head-gone.txt");
    const { downloadUrl } = await getLinkUrls("head-gone.txt");
    fs.rmSync(target);
    expect((await request(app).head(downloadUrl)).status).toBe(404);
  });
});

describe("GET /file/open", () => {
  it("redirects to the HDF viewer with the stream URL and a label", async () => {
    const { openUrl } = await getLinkUrls("scan.h5");
    const res = await request(app).get(openUrl);

    expect(res.status).toBe(303);
    const target = new URL(res.headers.location);
    expect(`${target.origin}${target.pathname}`).toBe(HDF_VIEW_URL);
    expect(target.searchParams.get("label")).toBe("scan.h5");

    const streamUrl = new URL(target.searchParams.get("url") as string);
    expect(streamUrl.origin).toBe(PUBLIC_ORIGIN);
    expect(streamUrl.pathname).toBe("/file/stream");
    expect(streamUrl.searchParams.get("token")).toBe(
      new URL(openUrl, PUBLIC_ORIGIN).searchParams.get("token"),
    );
  });

  it("includes the route base path in the stream URL", async () => {
    startApp({ routeBasePath: "/zip-service" });
    const { openUrl } = await getLinkUrls("scan.h5");
    const res = await request(app).get(openUrl.replace("/zip-service", ""));
    const target = new URL(res.headers.location);
    expect(new URL(target.searchParams.get("url") as string).pathname).toBe(
      "/zip-service/file/stream",
    );
  });

  it.each([".h5", ".hdf5", ".hdf", ".nxs", ".H5"])(
    "supports %s files",
    async (extension) => {
      const name = `viewable${extension}`;
      env.writeData(`loki/123/${name}`);
      const { openUrl } = await getLinkUrls(name);
      expect((await request(app).get(openUrl)).status).toBe(303);
    },
  );

  it("refuses files that are not HDF", async () => {
    const { openUrl } = await getLinkUrls("data.txt");
    const res = await request(app).get(openUrl);
    expect(res.status).toBe(400);
    expect(res.text).toContain("Cannot open &#34;data.txt&#34;");
  });

  it("answers 403 for an invalid token", async () => {
    const res = await request(app).get("/file/open?token=nope");
    expect(res.status).toBe(403);
  });

  it("answers 500 when the public origin is not configured", async () => {
    startApp({ publicOrigin: undefined });
    const { openUrl } = await getLinkUrls("scan.h5");
    const res = await request(app).get(openUrl);
    expect(res.status).toBe(500);
    expect(res.text).toBe("Service public origin is not configured");
  });

  it.each([undefined, "not a url"])(
    "answers 500 when the HDF viewer URL is %p",
    async (hdfViewServiceUrl) => {
      startApp({ hdfViewServiceUrl });
      const { openUrl } = await getLinkUrls("scan.h5");
      const res = await request(app).get(openUrl);
      expect(res.status).toBe(500);
      expect(res.text).toBe("HDF View service URL is not configured");
    },
  );
});
