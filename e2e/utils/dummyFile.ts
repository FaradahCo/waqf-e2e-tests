import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Creates a tiny throwaway PNG in the OS temp dir for tests that need to
 * exercise a real file input (e.g. antd <Upload>) via
 * `locator.setInputFiles()`. Never point tests at real user files - this
 * generates its own disposable one on demand.
 */
export function makeDummyImageFile(name = "e2e-dummy-receipt.png"): string {
  const filePath = path.join(os.tmpdir(), name);
  if (!fs.existsSync(filePath)) {
    // Smallest valid 1x1 transparent PNG.
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  }
  return filePath;
}
