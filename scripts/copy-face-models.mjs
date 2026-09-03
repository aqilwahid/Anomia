// Copies the Human face-detector + face-description model weights from
// node_modules into public/models/human so they're served as static
// assets. Runs on postinstall so the weights are never committed to git
// (see docs/discovery.md 9.1 / repo structure notes) but are always
// present after `npm install`.
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const srcDir = path.join(rootDir, "node_modules", "@vladmandic", "human", "models");
const destDir = path.join(rootDir, "public", "models", "human");

const files = [
  "blazeface.bin",
  "blazeface.json",
  "facemesh.bin",
  "facemesh.json",
  "faceres.bin",
  "faceres.json",
];

await mkdir(destDir, { recursive: true });
await Promise.all(
  files.map((file) => copyFile(path.join(srcDir, file), path.join(destDir, file)))
);

console.log(`Copied ${files.length} face model files to public/models/human`);
