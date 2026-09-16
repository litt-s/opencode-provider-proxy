import { build } from "esbuild"

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  legalComments: "none",
  outfile: "bundle/opencode-provider-proxy.mjs",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
})

console.log("bundled -> bundle/opencode-provider-proxy.mjs")
