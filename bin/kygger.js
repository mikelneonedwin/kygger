#!/usr/bin/env node
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Path to the compiled JS file in the dist folder
const generatorPath = join(__dirname, "../dist/generator.js");

// Use dynamic import to run the compiled ESM generator
import(generatorPath)
  .then((mod) => {
    if (typeof mod.main === "function") {
      return mod.main();
    }
  })
  .catch((err1) => {
    // Fallback to require if ESM fails (though tsup generates both)
    try {
      const mod = require(generatorPath);
      if (typeof mod.main === "function") {
        return mod.main();
      }
    } catch (err2) {
      console.error("Failed to load generator:", err1, err2);
      process.exit(1);
    }
  });
