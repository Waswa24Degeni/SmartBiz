/**
 * Minimal Deno global type declarations for VS Code IntelliSense.
 * These are picked up automatically by the functions tsconfig.json.
 * The real types ship with the Deno runtime — these exist only so that
 * VS Code's TypeScript server does not flag `Deno.*` usages as errors.
 */

declare namespace Deno {
  /** Read-only environment variable accessor provided by the Deno runtime. */
  export const env: {
    /** Returns the value of the environment variable `key`, or `undefined` if unset. */
    get(key: string): string | undefined;
    /** Returns all environment variables as a plain object. */
    toObject(): Record<string, string>;
  };

  /** Current Deno version information. */
  export const version: {
    deno: string;
    v8: string;
    typescript: string;
  };
}
