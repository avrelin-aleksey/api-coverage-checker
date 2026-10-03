import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(here, "../dist/index.html");
const target = resolve(here, "../../src/api_coverage_checker/dashboard/page.html");

if (!existsSync(built)) {
  console.error("Build output not found:", built);
  process.exit(1);
}
copyFileSync(built, target);
console.log("Copied report template to", target);
