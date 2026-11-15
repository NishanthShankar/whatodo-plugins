#!/usr/bin/env node
// Scaffold a plugin: node scripts/new-plugin.mjs <id> "<Name>" "<emoji>"
// Copies templates/plugin into src/plugins/<id>, fills in the names and registers it.
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [id, name, icon = "🧩"] = process.argv.slice(2);
if (!id || !name || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
  console.error('Usage: pnpm new <id> "<Name>" "<emoji>"   (id: lowercase letters, digits, dashes)');
  process.exit(1);
}
const dest = join("src/plugins", id);
if (existsSync(dest)) {
  console.error(`${dest} already exists`);
  process.exit(1);
}
cpSync("templates/plugin", dest, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const camel = id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const fill = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) fill(p);
    else writeFileSync(p, readFileSync(p, "utf8").replaceAll("__ID__", id).replaceAll("__NAME__", name).replaceAll("__ICON__", icon).replaceAll("__CAMEL__", camel).replaceAll("__DATE__", today));
  }
};
fill(dest);

const index = readFileSync("src/index.ts", "utf8")
  .replace(/(import type \{ PluginDef \})/, `import ${camel} from "./plugins/${id}";\n$1`)
  .replace(/export const plugins: PluginDef\[\] = \[([^\]]*)\];/, (_, list) => `export const plugins: PluginDef[] = [${list.trim()}, ${camel}];`);
writeFileSync("src/index.ts", index);
console.log(`Created ${dest} and registered it. Next: read docs/building-a-plugin.md, then pnpm check.`);
