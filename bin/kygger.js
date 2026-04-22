#!/usr/bin/env node
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Path to the compiled JS file in the dist folder
const generatorPath = join(__dirname, "../dist/generator.js");

// Use dynamic import to run the compiled ESM generator
import(generatorPath).catch((err) => {
  // Fallback to require if ESM fails (though tsup generates both)
  try {
    require(generatorPath);
  } catch (e) {
    console.error("Failed to load generator:", err);
    process.exit(1);
  }
});
