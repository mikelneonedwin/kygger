#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as prettier from "prettier";
import yaml from "yaml";
import { formatDiagnostics } from "./advisor/reporter";
import { runDiagnostics } from "./advisor/rules";
import type { ReportFormat } from "./advisor/types";

export function ensureDirExists(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function isUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getTextContent(input: string): Promise<string> {
  if (isUrl(input)) {
    const res = await fetch(input);

    if (!res.ok) {
      throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
    }

    return await res.text();
  }

  if (input.startsWith("file://")) {
    input = fileURLToPath(input);
  }

  const absolutePath = resolve(input);
  return readFileSync(absolutePath, "utf-8");
}

export interface OpenApiSpec {
  openapi: string;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

export function parseSpecContent(rawText: string, src: string): OpenApiSpec {
  const isYaml = /\.ya?ml($|\?)/i.test(src);
  if (isYaml) {
    const parsed = yaml.parse(rawText);
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Failed to parse OpenAPI YAML spec from: ${src}`);
    }
    return parsed as OpenApiSpec;
  }

  try {
    return JSON.parse(rawText) as OpenApiSpec;
  } catch {
    try {
      const parsed = yaml.parse(rawText);
      if (parsed && typeof parsed === "object") {
        return parsed as OpenApiSpec;
      }
    } catch {
      // Fall through to final error
    }
    throw new Error(
      `Failed to parse OpenAPI spec from "${src}". The content must be valid JSON or YAML.`,
    );
  }
}

interface PathItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [method: string]: OperationObject | any;
}

interface OperationObject {
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses?: Record<string, ResponseObject>;
}

interface ParameterObject {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: SchemaObject;
}

interface RequestBodyObject {
  content: {
    [contentType: string]: MediaTypeObject;
  };
}

interface ResponseObject {
  description: string;
  content?: {
    [contentType: string]: MediaTypeObject;
  };
}

interface MediaTypeObject {
  schema?: SchemaObject;
}

interface SchemaObject {
  type?: string | string[];
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  $ref?: string;
  required?: string[];
  enum?: string[];
  oneOf?: SchemaObject[];
  allOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  nullable?: boolean;
}

function toPascalCase(str: string): string {
  return str.replace(/(^\w|[_-]\w)/g, (match) =>
    match.replace(/[_-]/, "").toUpperCase(),
  );
}

function parseSchema(schema: SchemaObject, rootSpec: OpenApiSpec): string {
  const withNullable = (typeStr: string) => {
    return schema.nullable ? `${typeStr} | null` : typeStr;
  };

  if (schema.$ref) {
    const refName = schema.$ref.split("/").pop();
    return withNullable(refName ? toPascalCase(refName) : "unknown");
  }

  if (schema.oneOf) {
    const union = schema.oneOf.map((s) => parseSchema(s, rootSpec)).join(" | ");
    return withNullable(union);
  }

  if (schema.anyOf) {
    const union = schema.anyOf.map((s) => parseSchema(s, rootSpec)).join(" | ");
    return withNullable(union);
  }

  if (schema.allOf) {
    const intersection = schema.allOf
      .map((s) => parseSchema(s, rootSpec))
      .join(" & ");
    return withNullable(intersection);
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type.map((t) =>
      parseSchema({ ...schema, type: t }, rootSpec),
    );
    return types.join(" | ");
  }

  switch (schema.type) {
    case "string":
      if (schema.enum) {
        return withNullable(schema.enum.map((e) => `"${e}"`).join(" | "));
      }
      return withNullable("string");

    case "integer":
    case "number":
      return withNullable("number");

    case "boolean":
      return withNullable("boolean");

    case "null":
      return "null";

    case "array":
      return withNullable(`(${parseSchema(schema.items || {}, rootSpec)})[]`);

    case "object": {
      if (!schema.properties) return withNullable("Record<string, unknown>");

      const props = Object.entries(schema.properties).map(([key, value]) => {
        const isRequired = schema.required?.includes(key);
        return `${key}${isRequired ? "" : "?"}: ${parseSchema(value, rootSpec)};`;
      });
      return withNullable(`{\n${props.join("\n")}\n}`);
    }

    default:
      if (schema.properties) {
        const props = Object.entries(schema.properties).map(([key, value]) => {
          const isRequired = schema.required?.includes(key);
          return `${key}${isRequired ? "" : "?"}: ${parseSchema(value, rootSpec)};`;
        });
        return withNullable(`{\n${props.join("\n")}\n}`);
      }
      return withNullable("unknown");
  }
}

function generatePathParamsType(
  urlPath: string,
  parameters: ParameterObject[] = [],
): string {
  const regex = /\{([^}]+)\}/g;
  const matches = [...urlPath.matchAll(regex)].map((m) => m[1]);

  if (matches.length === 0) {
    return "undefined";
  }

  const props = matches.map((paramName) => {
    const paramDef = parameters.find(
      (p) => p.name === paramName && p.in === "path",
    );
    const schemaType = paramDef?.schema?.type;
    const type =
      schemaType === "integer" || schemaType === "number" ? "number" : "string";

    return `${paramName}: ${type};`;
  });

  return `{\n${props.join("\n")}\n}`;
}

function generateQueryParamsType(
  parameters: ParameterObject[] = [],
  rootSpec: OpenApiSpec,
): string {
  const queryParams = parameters.filter((p) => p.in === "query");

  if (queryParams.length === 0) {
    return "undefined";
  }

  const props = queryParams.map((param) => {
    const isRequired = param.required;
    const schemaType = param.schema
      ? parseSchema(param.schema, rootSpec)
      : "string";
    return `"${param.name}"${isRequired ? "" : "?"}: ${schemaType};`;
  });

  return `{\n${props.join("\n")}\n}`;
}

function mergeParameters(
  pathItemParams: ParameterObject[] = [],
  opParams: ParameterObject[] = [],
): ParameterObject[] {
  const map = new Map<string, ParameterObject>();
  for (const p of pathItemParams) {
    if (p?.name && p?.in) map.set(`${p.in}:${p.name}`, p);
  }
  for (const p of opParams) {
    if (p?.name && p?.in) map.set(`${p.in}:${p.name}`, p);
  }
  return Array.from(map.values());
}

function parseResponseType(
  responseObj: ResponseObject,
  statusCode: string,
  rootSpec: OpenApiSpec,
): string {
  if (statusCode === "204") {
    return "void";
  }

  const content = responseObj.content;
  if (!content) {
    return "void";
  }

  if (content["application/json"]?.schema) {
    return parseSchema(content["application/json"].schema, rootSpec);
  }

  const binaryPrefixes = [
    "application/octet-stream",
    "application/pdf",
    "application/zip",
    "image/",
    "audio/",
    "video/",
  ];
  const hasBinary = Object.keys(content).some((mime) =>
    binaryPrefixes.some((b) => mime.startsWith(b)),
  );
  if (hasBinary) {
    return "Blob";
  }

  const textPrefixes = ["text/plain", "text/csv", "text/html", "text/markdown"];
  const hasText = Object.keys(content).some((mime) =>
    textPrefixes.some((t) => mime.startsWith(t)),
  );
  if (hasText) {
    return "string";
  }

  if (content["text/event-stream"]) {
    return "ReadableStream";
  }

  const firstMime = Object.keys(content)[0];
  if (firstMime && content[firstMime]?.schema) {
    return parseSchema(content[firstMime].schema, rootSpec);
  }

  return "unknown";
}

export interface GenerateOptions {
  typesPath?: string;
  diagnostics?: boolean;
  advisor?: boolean;
  quiet?: boolean;
  strict?: boolean;
  report?: ReportFormat;
  reportFile?: string;
}

export async function generate(
  src: string,
  options: GenerateOptions = {},
): Promise<void> {
  const cwd = process.cwd();
  const typesPath = resolve(cwd, options.typesPath || "api.types.ts");

  const rawText = await getTextContent(src);
  const spec: OpenApiSpec = parseSpecContent(rawText, src);
  const buffer: string[] = [];

  buffer.push(`/**
 * ============================================================================
 * AUTO-GENERATED FILE - DO NOT MODIFY MANUALLY
 * ============================================================================
 *
 * This file was automatically generated by kygger from an OpenAPI specification.
 *
 * FOR AI CODING AGENTS & DEVELOPERS:
 * - DO NOT manually edit, patch, or alter the types or interfaces in this file.
 * - Only Kygger is allowed to modify this file.
 * - To update types, modify the upstream OpenAPI / Swagger spec and re-run:
 *     kygger <source-spec> -t <output-path>
 *
 * Any manual modifications will be overwritten upon regeneration.
 * ============================================================================
 */
`);
  buffer.push(`/* eslint-disable */`);
  buffer.push(`// @ts-nocheck`);
  buffer.push(`import type { KyResponse } from "ky";`);
  buffer.push(`import type { KyggerResponse } from "kygger";\n`);
  buffer.push(`// --- Generated Types from OpenAPI Spec --- \n`);

  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      const typeName = toPascalCase(name);
      buffer.push(`export type ${typeName} = ${parseSchema(schema, spec)};\n`);
    }
  }

  const paths = Object.keys(spec.paths);
  const pathsString = paths.map((p) => `"${p}"`).join(" | \n  ");
  buffer.push(`export type Paths = \n  ${pathsString};\n`);

  buffer.push(`export interface KyggerTree {`);

  const methods = ["get", "post", "put", "delete", "patch"] as const;

  for (const method of methods) {
    const pathsWithMethod = Object.entries(spec.paths).filter(
      ([, pathItem]) => !!pathItem[method],
    );

    if (pathsWithMethod.length === 0) continue;

    buffer.push(`  "${method}": {`);

    for (const [route, pathItem] of pathsWithMethod) {
      const op = pathItem[method] as OperationObject;

      buffer.push(`    "${route}": {`);
      buffer.push(`      pathname: "${route}";`);

      const mergedParameters = mergeParameters(
        pathItem.parameters as ParameterObject[],
        op.parameters as ParameterObject[],
      );

      const pathParamsType = generatePathParamsType(route, mergedParameters);
      if (pathParamsType !== "undefined") {
        buffer.push(`      params: ${pathParamsType};`);
      }

      const queryType = generateQueryParamsType(mergedParameters, spec);
      if (queryType !== "undefined") {
        buffer.push(`      query: ${queryType};`);
      }

      const successEntries = Object.entries(op.responses || {}).filter(([k]) =>
        k.startsWith("2"),
      );

      if (successEntries.length > 0) {
        const responseVariants = successEntries.map(([code, resp]) => {
          const returnType = parseResponseType(resp, code, spec);
          const numericCode = parseInt(code, 10);
          const statusType = isNaN(numericCode) ? "number" : numericCode;
          return `KyggerResponse<${returnType}, ${statusType}>`;
        });

        buffer.push(`      response: ${responseVariants.join(" | ")};`);
      }

      if (op.requestBody && op.requestBody.content) {
        buffer.push(`      request:`);
        const content = op.requestBody.content;
        const requestOptions: string[] = [];

        if (content["application/json"]?.schema) {
          const bodyType = parseSchema(
            content["application/json"].schema,
            spec,
          );
          requestOptions.push(`{ json: ${bodyType}; }`);
        }

        if (content["multipart/form-data"]) {
          requestOptions.push(`{ body: FormData; }`);
        }

        if (requestOptions.length > 0) {
          buffer.push(requestOptions.join(" | ") + ";");
        } else {
          buffer.push(" never;");
        }
      }

      buffer.push(`    };`);
    }

    buffer.push(`  };`);
  }

  buffer.push(`}`);
  buffer.push("");

  const code = buffer.join("\n");
  const prettierOptions = typesPath
    ? (await prettier.resolveConfig(typesPath)) || {}
    : {};
  const formatted = await prettier.format(code, {
    ...prettierOptions,
    parser: "typescript",
  });

  ensureDirExists(typesPath);
  writeFileSync(typesPath, formatted);
  console.info(`Successfully generated ${typesPath}`);

  const isDiagnosticsEnabled = Boolean(
    options.diagnostics ||
    options.advisor ||
    options.strict ||
    options.report ||
    options.reportFile ||
    process.env.KYGGER_DIAGNOSTICS === "true" ||
    process.env.KYGGER_DIAGNOSTICS === "1" ||
    process.env.KYGGER_ADVISOR === "true" ||
    process.env.KYGGER_ADVISOR === "1",
  );

  if (isDiagnosticsEnabled) {
    const diagnostics = runDiagnostics(
      spec as unknown as Parameters<typeof runDiagnostics>[0],
    );
    const isQuiet =
      options.quiet ??
      (process.env.KYGGER_QUIET === "true" || process.env.KYGGER_QUIET === "1");

    if (options.reportFile) {
      const reportFormat = options.report ?? "markdown";
      const reportContent = formatDiagnostics(diagnostics, reportFormat);
      const resolvedReportPath = resolve(cwd, options.reportFile);
      ensureDirExists(resolvedReportPath);
      writeFileSync(resolvedReportPath, reportContent);
      console.info(`Exported diagnostic report to ${resolvedReportPath}`);
    }

    if (!isQuiet) {
      const consoleOutput = formatDiagnostics(
        diagnostics,
        options.report ?? "console",
      );
      if (consoleOutput) {
        console.log(consoleOutput);
      }
    }

    if (options.strict) {
      const hasErrorsOrWarnings = diagnostics.some(
        (d) => d.severity === "error" || d.severity === "warning",
      );
      if (hasErrorsOrWarnings) {
        console.error(
          `Exiting with code 1 due to --strict flag (${diagnostics.length} diagnostic issue(s) detected).`,
        );
        process.exit(1);
      }
    }
  }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args,
    options: {
      types: {
        type: "string",
        short: "t",
      },
      diagnostics: {
        type: "boolean",
        short: "d",
      },
      advisor: {
        type: "boolean",
        short: "a",
      },
      quiet: {
        type: "boolean",
        short: "q",
      },
      strict: {
        type: "boolean",
      },
      report: {
        type: "string",
      },
      "report-file": {
        type: "string",
      },
    },
    allowPositionals: true,
  });

  const src = positionals[0];

  if (!src) {
    console.error(
      "Usage: kygger <source-url-or-file> [--types|-t path.ts] [--diagnostics|-d] [--advisor|-a] [--quiet|-q] [--strict] [--report console|markdown|json|prompt] [--report-file path]",
    );
    process.exit(1);
  }

  await generate(src, {
    typesPath: values.types,
    diagnostics: values.diagnostics,
    advisor: values.advisor,
    quiet: values.quiet,
    strict: values.strict,
    report: values.report as ReportFormat | undefined,
    reportFile: values["report-file"],
  });
}

const isMain =
  process.argv[1]?.endsWith("generator.ts") ||
  /(?:^|[\\/])kygger(?:\.[cm]?[jt]s)?$/i.test(process.argv[1] ?? "");

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
