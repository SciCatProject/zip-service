import request from "supertest";
import type { Express } from "express";
import * as fs from "fs";
import * as path from "path";
import { loadApp } from "../helpers/app";
import {
  baseConfig,
  createTestEnv,
  signToken,
  TestEnv,
} from "../helpers/fixtures";

let env: TestEnv;
let dramDir: string;
let app: Express;

beforeAll(() => {
  env = createTestEnv();
  dramDir = path.join(env.root, "dram");
  fs.mkdirSync(dramDir);
});
afterAll(() => env.cleanup());

beforeEach(() => {
  // express-fileupload runs with debug: true and logs to the console
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  app = loadApp(
    baseConfig(env, { uploadEnabled: true, dramDirectory: dramDir }),
  );
});

const zipPayload = Buffer.from("PK-not-really-a-zip");

describe("POST /upload availability", () => {
  it.each([undefined, false, "true"])(
    "is not mounted when uploadEnabled is %p",
    async (uploadEnabled) => {
      app = loadApp(baseConfig(env, { uploadEnabled }));
      const res = await request(app)
        .post("/upload")
        .field("jwt", signToken())
        .attach("zipfile", zipPayload, "data.zip");
      expect(res.status).toBe(404);
    },
  );
});

describe("POST /upload: validation", () => {
  it("answers 500 when no JWT secret is configured", async () => {
    app = loadApp(
      baseConfig(env, {
        uploadEnabled: true,
        dramDirectory: dramDir,
        jwtSecret: undefined,
      }),
    );
    const res = await request(app).post("/upload");
    expect(res.status).toBe(500);
    expect(res.text).toContain("No JWT secret");
  });

  it("answers 400 when no file is uploaded", async () => {
    const res = await request(app).post("/upload").field("jwt", signToken());
    expect(res.status).toBe(400);
    expect(res.text).toContain("No files were uploaded");
  });

  it("answers 400 when several zip files are uploaded", async () => {
    const res = await request(app)
      .post("/upload")
      .field("jwt", signToken())
      .attach("zipfile", zipPayload, "one.zip")
      .attach("zipfile", zipPayload, "two.zip");
    expect(res.status).toBe(400);
    expect(res.text).toContain("single zip file");
  });

  it("answers 400 without a token", async () => {
    const res = await request(app)
      .post("/upload")
      .attach("zipfile", zipPayload, "data.zip");
    expect(res.status).toBe(400);
    expect(res.text).toContain("JSON web token not provided");
  });

  it("answers 400 for an invalid token", async () => {
    const res = await request(app)
      .post("/upload")
      .field("jwt", signToken({}, {}, "another-secret"))
      .attach("zipfile", zipPayload, "data.zip");
    expect(res.status).toBe(400);
    expect(res.text).toContain("Invalid JSON web token");
  });

  it.each(["../escape", "a/b", "/absolute", ".."])(
    "rejects the target directory %p",
    async (dir) => {
      const res = await request(app)
        .post("/upload")
        .field("jwt", signToken())
        .field("dir", dir)
        .attach("zipfile", zipPayload, "data.zip");
      expect(res.status).toBe(400);
      expect(res.text).toContain("not allowed");
      expect(fs.readdirSync(dramDir)).toEqual([]);
    },
  );
});
