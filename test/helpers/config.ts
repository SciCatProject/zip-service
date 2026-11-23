/* eslint-disable @typescript-eslint/no-explicit-any */
// Stand-in for src/common/config.ts. Same export, but mutable so that tests
// can describe the deployment they want with `setConfig`.
export const config: Record<string, any> = {};

export function setConfig(values: Record<string, unknown>): void {
  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, values);
}
