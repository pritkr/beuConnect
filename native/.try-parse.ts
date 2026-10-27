import { readFileSync } from "node:fs";
import { parseRoutineHtml } from "./src/features/tools/routine-parse";

const html = readFileSync("/tmp/r_24105157001.html", "utf8");
const parsed = parseRoutineHtml(html, "https://beu.prit.eu.org/routine?reg=24105157001");
console.log(JSON.stringify(parsed, null, 2).slice(0, 4000));
