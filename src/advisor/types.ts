export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticCategory =
  | "http-semantics"
  | "type-safety"
  | "spec-integrity"
  | "best-practice";

export interface Diagnostic {
  ruleId: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  endpoint?: { method: string; path: string };
  specPath: string;
  message: string;
  recommendation: string;
  docUrl?: string;
}

export type ReportFormat = "console" | "markdown" | "json" | "prompt";
