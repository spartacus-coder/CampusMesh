import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../src-tauri/swarm-runtime");

function getHostTriple() {
  const p = process.platform;
  const a = process.arch;
  return `${p}-${a}`;
}

function getBareBinaryPkgName() {
  if (process.platform === "win32" && process.arch === "x64") {
    return { pkg: "bare-runtime-win32-x64", bin: "bin/bare.exe" };
  }
  if (process.platform === "win32" && process.arch === "arm64") {
    return { pkg: "bare-runtime-win32-arm64", bin: "bin/bare.exe" };
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return { pkg: "bare-runtime-linux-x64", bin: "bin/bare" };
  }
  return null;
}

function ensureSidecarDepsInstalled() {
  const barePackBin = path.join(__dirname, "node_modules/bare-pack/bin.js");
  if (!fs.existsSync(barePackBin)) {
    console.info("[SwarmSidecar] Installing Holepunch + Bare dependencies...");
    execFileSync("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: __dirname,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  }
}

function main() {
  ensureSidecarDepsInstalled();

  const runtimeInfo = getBareBinaryPkgName();
  if (!runtimeInfo) {
    console.warn(
      `[SwarmSidecar] No prebuilt Bare runtime mapping for ${getHostTriple()}.`,
    );
    return;
  }

  const runtimeSrc = path.join(
    __dirname,
    "node_modules",
    runtimeInfo.pkg,
    runtimeInfo.bin,
  );
  if (!fs.existsSync(runtimeSrc)) {
    console.warn(`[SwarmSidecar] Missing Bare runtime binary at ${runtimeSrc}`);
    return;
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const runtimeDestName = path.basename(runtimeSrc);
  const runtimeDest = path.join(outDir, runtimeDestName);
  fs.copyFileSync(runtimeSrc, runtimeDest);

  const barePackEntry = path.join(__dirname, "node_modules/bare-pack/bin.js");
  const bundleDest = path.join(outDir, "swarm.bundle");
  const entryScript = path.join(__dirname, "src/index.mjs");

  console.info(`[SwarmSidecar] Packing bundle for ${getHostTriple()}...`);
  execFileSync(
    runtimeDest,
    [
      barePackEntry,
      "--host",
      getHostTriple(),
      "--offload",
      "--out",
      bundleDest,
      entryScript,
    ],
    {
      cwd: __dirname,
      stdio: "inherit",
    },
  );

  console.info(`[SwarmSidecar] Built standalone Holepunch runtime at ${outDir}`);
}

main();

