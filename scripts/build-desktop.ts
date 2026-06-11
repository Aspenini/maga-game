import { mkdir, rm } from "node:fs/promises";

const outdir = "desktop-dist";
const outfile = `${outdir}/maga-disclosure-runner`;

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: ["./desktop/main.ts"],
  target: "bun",
  minify: true,
  sourcemap: "none",
  compile: {
    outfile,
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadTsconfig: false,
    autoloadPackageJson: false,
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const output of result.outputs) {
  console.log(`${output.kind.padEnd(10)} ${output.path}`);
}
