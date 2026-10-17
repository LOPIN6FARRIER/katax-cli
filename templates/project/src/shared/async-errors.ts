/**
 * Express 4 does not catch rejected promises from async route handlers or
 * middleware: an `async (req, res) => { throw … }` leaves the request hanging
 * and logs an unhandledRejection. This patches the router Layer (same idea as
 * the `express-async-errors` package) so any rejection is forwarded to
 * next(err) and ends up in errorMiddleware → generic JSON error + log.
 *
 * Import it once, before any router is created (first import in app.ts).
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);

type NextFn = (err?: unknown) => void;
type LayerLike = {
  handle: (...args: unknown[]) => unknown;
  __asyncPatched?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require("express/lib/router/layer") as {
  prototype: { handle_request: (...args: unknown[]) => unknown };
};

const originalHandleRequest = Layer.prototype.handle_request;

if (!(Layer.prototype as unknown as LayerLike).__asyncPatched) {
  Layer.prototype.handle_request = function patchedHandleRequest(
    this: LayerLike,
    ...args: unknown[]
  ) {
    const fn = this.handle;
    // Error middleware has 4 params; regular handlers 2-3. Patch both shapes.
    if (typeof fn === "function" && !(fn as { __wrapped?: boolean }).__wrapped) {
      const wrapped = function wrappedHandler(this: unknown, ...handlerArgs: unknown[]) {
        const result = fn.apply(this, handlerArgs);
        if (result && typeof (result as Promise<unknown>).catch === "function") {
          const next = handlerArgs[handlerArgs.length - 1] as NextFn;
          (result as Promise<unknown>).catch((err) =>
            typeof next === "function" ? next(err ?? new Error("Rejected without reason")) : undefined,
          );
        }
        return result;
      };
      Object.defineProperty(wrapped, "length", { value: fn.length });
      // Keep metadata attached to the original handler (e.g. docs() in openapi.utils.ts).
      Object.assign(wrapped, fn);
      (wrapped as { __wrapped?: boolean }).__wrapped = true;
      this.handle = wrapped;
    }
    return originalHandleRequest.apply(this, args);
  };
  (Layer.prototype as unknown as LayerLike).__asyncPatched = true;
}

export {};
