import type { Response } from "superagent";
import StreamZip from "node-stream-zip";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** superagent parser that keeps the raw response body as a Buffer. */
export function binaryParser(
  res: Response,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.setEncoding("binary");
  res.on("data", (chunk: string) => chunks.push(Buffer.from(chunk, "binary")));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

/** Lists the entries of a zip archive, mapping entry name to its content. */
export async function readZip(
  archive: Buffer | string,
): Promise<Record<string, string>> {
  let file: string;
  let tempDir: string | undefined;
  if (typeof archive === "string") {
    file = archive;
  } else {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-service-read-"));
    file = path.join(tempDir, "archive.zip");
    fs.writeFileSync(file, archive);
  }

  try {
    return await new Promise((resolve, reject) => {
      const zip = new StreamZip({ file, storeEntries: true });
      zip.on("error", reject);
      zip.on("ready", () => {
        const result: Record<string, string> = {};
        // node-stream-zip returns an object keyed by entry name here, which
        // src/types/node-stream-zip.d.ts wrongly declares as an array.
        const entries = zip.entries() as unknown as Record<
          string,
          { name: string }
        >;
        for (const entry of Object.values(entries)) {
          result[entry.name] = zip.entryDataSync(entry.name).toString();
        }
        zip.close();
        resolve(result);
      });
    });
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
