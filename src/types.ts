/* eslint-disable @typescript-eslint/no-empty-object-type */

interface EndpointSchema {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  request?: { json: unknown };
  response?: { json: () => Promise<unknown> };
  pathname: string;
}

export interface ImplicitKyggerTree {
  get?: Record<string, EndpointSchema>;
  post?: Record<string, EndpointSchema>;
  put?: Record<string, EndpointSchema>;
  delete?: Record<string, EndpointSchema>;
  patch?: Record<string, EndpointSchema>;
}

export type HTTPMethods = keyof ImplicitKyggerTree;

export type Options<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
  Path extends keyof Tree[Method],
> = {
  path: Path;
} & ("params" extends keyof Tree[Method][Path]
  ? { params: Tree[Method][Path]["params"] }
  : {}) &
  ("request" extends keyof Tree[Method][Path]
    ? Tree[Method][Path]["request"]
    : {}) &
  ("query" extends keyof Tree[Method][Path]
    ? {} extends Tree[Method][Path]["query"]
      ? { query?: Tree[Method][Path]["query"] }
      : { query: Tree[Method][Path]["query"] }
    : {});

export type Return<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
  Path extends keyof Tree[Method],
> = "response" extends keyof Tree[Method][Path]
  ? Tree[Method][Path]["response"]
  : Promise<void>;
