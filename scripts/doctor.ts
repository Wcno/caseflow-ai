import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const qvacPackage = JSON.parse(readFileSync(join(dirname(require.resolve("@qvac/sdk")), "..", "..", "package.json"), "utf8")) as { version: string };
const major = Number(process.versions.node.split(".")[0]);
const checks: Array<[string, boolean, string]> = [
  ["Node.js >= 22", major >= 22, process.versions.node],
  ["QVAC SDK 0.19.0", qvacPackage.version === "0.19.0", qvacPackage.version],
  ["Sin clave de inferencia cloud", !Object.keys(process.env).some((key) => /OPENAI|ANTHROPIC|GEMINI|COHERE.*KEY/i.test(key)), "No se encontró una variable de proveedor cloud"],
  ["Archivo de configuración local", !existsSync(".env") || true, ".env no es requerido por CaseFlow"]
];
try {
  const ffmpeg = execFileSync("ffmpeg", ["-version"], { encoding: "utf8", windowsHide: true }).split("\n")[0];
  checks.push(["FFmpeg", true, ffmpeg]);
} catch { checks.push(["FFmpeg", false, "Instala FFmpeg y añádelo al PATH."]); }
try {
  const vulkan = execFileSync("vulkaninfo", ["--summary"], { encoding: "utf8", windowsHide: true });
  checks.push(["Vulkan", true, vulkan.split("\n").find((line) => /Vulkan Instance Version/i.test(line)) ?? "Disponible"]);
} catch { checks.push(["Vulkan", false, "No se detectó vulkaninfo; QVAC puede usar CPU si el backend local lo permite."]); }
for (const [name, passed, detail] of checks) console.log(`${passed ? "✓" : "✗"} ${name}: ${detail}`);
if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
