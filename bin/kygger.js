#!/usr/bin/env node
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const generatorPath = join(__dirname, "../src/generator.ts");

const child = spawn("npx", ["tsx", generatorPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
