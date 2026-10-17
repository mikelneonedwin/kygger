/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any */
import type { KyResponse, ResponsePromise } from "ky";

interface EndpointSchema {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  request?: { json?: unknown; body?: unknown };
  response?: KyResponse<unknown> | KyggerResponse<unknown, any>;
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

export type KyggerResponse<T = unknown, Status extends number = number> = Omit<
  KyResponse<T>,
  "json" | "status"
> & {
  status: Status;
  json(): Promise<T>;
};

export type KyggerResponsePromise<T = unknown, R = KyggerResponse<T>> = Omit<
  ResponsePromise<T>,
  "json" | "then" | "catch" | "finally"
> & {
  json(): Promise<T>;
} & Promise<R>;

type ExtractResponseData<R> =
  R extends KyggerResponse<infer Data, any>
    ? Data
    : R extends KyResponse<infer Data>
      ? Data
      : any;

export type Return<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
  Path extends keyof Tree[Method],
> = Tree[Method][Path] extends { response: infer R }
  ? [R] extends [never]
    ? KyggerResponsePromise<any, any>
    : KyggerResponsePromise<ExtractResponseData<R>, R>
  : KyggerResponsePromise<any, any>;

export type Query<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
  Path extends keyof Tree[Method],
> = Tree[Method][Path] extends { query: infer Q } ? Q : undefined;

export type Params<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
  Path extends keyof Tree[Method],
> = Tree[Method][Path] extends { params: infer P } ? P : undefined;

export type Request<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
  Path extends keyof Tree[Method],
> = Tree[Method][Path] extends { request: infer Req } ? Req : undefined;

export type Response<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
  Path extends keyof Tree[Method],
> = Tree[Method][Path] extends { response: infer Res } ? Res : undefined;

export type Endpoint<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
  Path extends keyof Tree[Method],
> = Tree[Method][Path];
