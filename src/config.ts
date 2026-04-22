import { join, resolve } from "node:path";
import { z } from "zod";

export const kyggerOutputFileSchema = z.string().refine(
  (val) => {
    if (!val) return false;
    const trimmed = val.trim();
    return (
      trimmed.length > 0 &&
      (trimmed.endsWith(".ts") || trimmed.endsWith(".tsx"))
    );
  },
  { message: "Output file must be a TypeScript file (.ts or .tsx)" },
);

export const kyggerConfigSchema = z
  .union([
    z.string().refine(
      (val) => {
        if (!val) return false;
        return val.trim().length > 0;
      },
      { message: "Folder path cannot be empty" },
    ),
    z.object({
      types: z
        .union([kyggerOutputFileSchema, z.null()])
        .optional()
        .default("api.types.ts"),
      zod: z
        .union([kyggerOutputFileSchema, z.null()])
        .optional()
        .default("api.zod.ts"),
    }),
  ])
  .default(".");

export type KyggerConfig = z.infer<typeof kyggerConfigSchema>;
export type KyggerOutputFile = z.infer<typeof kyggerOutputFileSchema>;

export function parseKyggerConfig(config: unknown): KyggerConfig {
  const result = kyggerConfigSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid kygger configuration: ${issues}`);
  }

  return result.data;
}

export function resolveOutputPaths(
  config: KyggerConfig,
  cwd: string,
): { typesPath: string | null; zodPath: string | null } {
  if (typeof config === "string") {
    const folderPath = resolve(cwd, config);
    return {
      typesPath: join(folderPath, "api.types.ts"),
      zodPath: join(folderPath, "api.zod.ts"),
    };
  }

  const { types, zod: zodFile } = config;

  return {
    typesPath: types ? resolve(cwd, types) : null,
    zodPath: zodFile ? resolve(cwd, zodFile) : null,
  };
}
