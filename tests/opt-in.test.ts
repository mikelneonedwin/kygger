import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { generate } from "../src/generator";

const flawedSpecPath = resolve(__dirname, "../sandbox/specs/flawed-spec.json");
const validSpecPath = resolve(__dirname, "../sandbox/specs/valid-sample.json");
const outputDir = resolve(__dirname, "../sandbox/out");

describe("Diagnostics Advisor Opt-in Behavior", () => {
  beforeAll(() => {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("does not run diagnostics by default (opt-in requirement)", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };

    const targetTypes = resolve(outputDir, "default-run.ts");
    try {
      await generate(flawedSpecPath, {
        typesPath: targetTypes,
      });

      expect(existsSync(targetTypes)).toBe(true);
      // Diagnostic warnings must NOT be present in console.log
      const hasDiagnosticOutput = logs.some((l) =>
        l.includes("Kygger Spec Diagnostics"),
      );
      expect(hasDiagnosticOutput).toBe(false);
    } finally {
      console.log = originalLog;
    }
  });

  it("runs diagnostics when explicitly requested via diagnostics: true", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };

    const targetTypes = resolve(outputDir, "optin-run.ts");
    try {
      await generate(flawedSpecPath, {
        typesPath: targetTypes,
        diagnostics: true,
      });

      expect(existsSync(targetTypes)).toBe(true);
      const hasDiagnosticOutput = logs.some((l) =>
        l.includes("Kygger Spec Diagnostics"),
      );
      expect(hasDiagnosticOutput).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("runs diagnostics when advisor: true is provided", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };

    const targetTypes = resolve(outputDir, "advisor-run.ts");
    try {
      await generate(flawedSpecPath, {
        typesPath: targetTypes,
        advisor: true,
      });

      expect(existsSync(targetTypes)).toBe(true);
      const hasDiagnosticOutput = logs.some((l) =>
        l.includes("Kygger Spec Diagnostics"),
      );
      expect(hasDiagnosticOutput).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it("exports report to file when reportFile is specified", async () => {
    const targetTypes = resolve(outputDir, "report-file-test.ts");
    const targetReport = resolve(outputDir, "audit.md");

    await generate(flawedSpecPath, {
      typesPath: targetTypes,
      reportFile: targetReport,
      report: "markdown",
      quiet: true,
    });

    expect(existsSync(targetReport)).toBe(true);
    const content = readFileSync(targetReport, "utf-8");
    expect(content).toContain("# Kygger OpenAPI Diagnostic Report");
    expect(content).toContain("Found **");
  });

  it("respects quiet flag to silence console diagnostics", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
      originalLog(...args);
    };

    const targetTypes = resolve(outputDir, "quiet-test.ts");
    try {
      await generate(flawedSpecPath, {
        typesPath: targetTypes,
        diagnostics: true,
        quiet: true,
      });

      const hasDiagnosticOutput = logs.some((l) =>
        l.includes("Kygger Spec Diagnostics"),
      );
      expect(hasDiagnosticOutput).toBe(false);
    } finally {
      console.log = originalLog;
    }
  });
});

describe("CLI Opt-in and Execution Verification", () => {
  it("CLI without flags generates cleanly without advisor output", async () => {
    const typesOut = resolve(outputDir, "cli-default.ts");
    const proc = Bun.spawnSync([
      "bun",
      "run",
      "src/generator.ts",
      flawedSpecPath,
      "-t",
      typesOut,
    ]);

    expect(proc.exitCode).toBe(0);
    const stdout = proc.stdout.toString();
    expect(stdout).toContain("Successfully generated");
    expect(stdout).not.toContain("Kygger Spec Diagnostics");
  });

  it("CLI with --diagnostics prints advisor diagnostics", async () => {
    const typesOut = resolve(outputDir, "cli-diagnostics.ts");
    const proc = Bun.spawnSync([
      "bun",
      "run",
      "src/generator.ts",
      flawedSpecPath,
      "-t",
      typesOut,
      "--diagnostics",
    ]);

    expect(proc.exitCode).toBe(0);
    const stdout = proc.stdout.toString();
    expect(stdout).toContain("Successfully generated");
    expect(stdout).toContain("Kygger Spec Diagnostics");
    expect(stdout).toContain("[ERROR]");
    expect(stdout).toContain("[WARN]");
  });

  it("CLI with -a alias prints advisor diagnostics", async () => {
    const typesOut = resolve(outputDir, "cli-advisor-alias.ts");
    const proc = Bun.spawnSync([
      "bun",
      "run",
      "src/generator.ts",
      flawedSpecPath,
      "-t",
      typesOut,
      "-a",
    ]);

    expect(proc.exitCode).toBe(0);
    const stdout = proc.stdout.toString();
    expect(stdout).toContain("Kygger Spec Diagnostics");
  });

  it("CLI with --strict exits with code 1 when flawed spec has errors", async () => {
    const typesOut = resolve(outputDir, "cli-strict-fail.ts");
    const proc = Bun.spawnSync([
      "bun",
      "run",
      "src/generator.ts",
      flawedSpecPath,
      "-t",
      typesOut,
      "--strict",
    ]);

    expect(proc.exitCode).toBe(1);
    const stderr = proc.stderr.toString();
    expect(stderr).toContain("Exiting with code 1 due to --strict flag");
  });

  it("CLI with --strict exits with code 0 on a clean spec", async () => {
    const typesOut = resolve(outputDir, "cli-strict-success.ts");
    const proc = Bun.spawnSync([
      "bun",
      "run",
      "src/generator.ts",
      validSpecPath,
      "-t",
      typesOut,
      "--strict",
    ]);

    expect(proc.exitCode).toBe(0);
    const stdout = proc.stdout.toString();
    expect(stdout).toContain("Successfully generated");
  });

  afterAll(() => {
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
