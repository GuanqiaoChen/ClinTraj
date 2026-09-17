/** Server-only runtime switch. Never rely on a client-side button to block API use. */
export function isShowcaseOnly(): boolean {
  return process.env.CLINTRAJ_SHOWCASE_ONLY === "true";
}
