import type { Diagnostic, ReportFormat } from "./types";

export function formatDiagnostics(
  diagnostics: Diagnostic[],
  format: ReportFormat = "console",
): string {
  if (diagnostics.length === 0) {
    if (format === "json") return "[]";
    if (format === "markdown" || format === "prompt")
      return "# OpenAPI Spec Report\n\nNo issues detected. Spec adheres to best practices.\n";
    return "";
  }

  switch (format) {
    case "json":
      return JSON.stringify(diagnostics, null, 2);

    case "markdown": {
      const lines: string[] = [];
      lines.push("# Kygger OpenAPI Diagnostic Report");
      lines.push("");
      lines.push(
        `Found **${diagnostics.length}** issues in OpenAPI specification.`,
      );
      lines.push("");
      lines.push("| Severity | Category | Target | Issue | Recommendation |");
      lines.push("| :--- | :--- | :--- | :--- | :--- |");

      for (const d of diagnostics) {
        const target = d.endpoint
          ? `\`${d.endpoint.method} ${d.endpoint.path}\``
          : `\`${d.specPath}\``;
        const icon =
          d.severity === "error"
            ? "🛑 Error"
            : d.severity === "warning"
              ? "⚠️ Warning"
              : "ℹ️ Info";
        const doc = d.docUrl ? ` ([docs](${d.docUrl}))` : "";
        lines.push(
          `| ${icon} | ${d.category} | ${target} | ${d.message.replace(/\|/g, "\\|")} | ${d.recommendation.replace(/\|/g, "\\|")}${doc} |`,
        );
      }

      return lines.join("\n") + "\n";
    }

    case "prompt": {
      const lines: string[] = [];
      lines.push("# OpenAPI Specification Remediation Instructions");
      lines.push("");
      lines.push(
        "I generated frontend TypeScript API clients with Kygger, which identified the following issues in our OpenAPI specification. Please update our backend route decorators, controllers, and DTOs to resolve them:",
      );
      lines.push("");

      diagnostics.forEach((d, idx) => {
        const target = d.endpoint
          ? `Route \`${d.endpoint.method} ${d.endpoint.path}\``
          : `Schema \`${d.specPath}\``;
        lines.push(`### ${idx + 1}. ${target}`);
        lines.push(`- **Severity**: ${d.severity.toUpperCase()}`);
        lines.push(`- **Category**: ${d.category}`);
        lines.push(`- **Issue**: ${d.message}`);
        lines.push(`- **Required Action**: ${d.recommendation}`);
        if (d.docUrl) {
          lines.push(`- **Reference**: ${d.docUrl}`);
        }
        lines.push("");
      });

      return lines.join("\n");
    }

    case "console":
    default: {
      const lines: string[] = [];
      const errorCount = diagnostics.filter(
        (d) => d.severity === "error",
      ).length;
      const warnCount = diagnostics.filter(
        (d) => d.severity === "warning",
      ).length;

      lines.push("");
      lines.push(
        `⚠️  Kygger Spec Diagnostics (${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"} found: ${errorCount} error${errorCount === 1 ? "" : "s"}, ${warnCount} warning${warnCount === 1 ? "" : "s"}):`,
      );
      lines.push("");

      for (const d of diagnostics) {
        const tag =
          d.severity === "error"
            ? "\x1b[31m[ERROR]\x1b[0m"
            : "\x1b[33m[WARN]\x1b[0m";
        const target = d.endpoint
          ? `${d.endpoint.method} ${d.endpoint.path}`
          : d.specPath;
        const category = `\x1b[36m[${d.category}]\x1b[0m`;

        lines.push(`• ${tag} ${category} ${target}`);
        lines.push(`  Issue: ${d.message}`);
        lines.push(`  Advice: ${d.recommendation}`);
        if (d.docUrl) {
          lines.push(`  Ref: ${d.docUrl}`);
        }
        lines.push("");
      }

      lines.push(
        "💡 Tip: Run with --report prompt to generate copy-paste instructions for your backend team or AI agent.",
      );
      return lines.join("\n");
    }
  }
}
