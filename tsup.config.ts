import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "@vue/reactivity",
    "eventemitter3",
    "fp-ts",
  ],
  esbuildOptions(options) {
    options.target = "es2022";
  },
});
