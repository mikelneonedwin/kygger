import type { KyInstance } from "ky";
import { handler } from "./handler";
import { ImplicitKyggerTree, Options, Return } from "./types";

/**
 * Creates a type-safe API client based on a generated Tree.
 *
 * @param client The Ky instance to use for requests
 * @returns An object with get, post, put, delete, patch methods
 */
export function createApiClient<Tree extends ImplicitKyggerTree>(
  client: KyInstance,
) {
  return {
    get: handler<Tree, "get">("get", client),
    delete: handler<Tree, "delete">("delete", client),
    post: handler<Tree, "post">("post", client),
    patch: handler<Tree, "patch">("patch", client),
    put: handler<Tree, "put">("put", client),
  } as {
    [Method in keyof Tree]: <Path extends keyof Tree[Method]>(
      options: Options<Tree, Method, Path>,
    ) => Return<Tree, Method, Path>;
  };
}
