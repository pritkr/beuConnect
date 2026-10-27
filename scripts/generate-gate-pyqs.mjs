import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const basePath = path.join(ROOT, "public", "GATEPYQs");
const outputPath = path.join(ROOT, "src", "data", "gate-pyqs.json");

function parsePaperMeta(fileName, subjectCode) {
  const baseName = fileName.replace(/\.pdf$/i, "");
  const normalizedCode = subjectCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const normalizedBase = baseName.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  let suffix = normalizedBase;
  if (normalizedBase.startsWith(normalizedCode)) {
    suffix = normalizedBase.slice(normalizedCode.length);
  }

  let year = "";
  let set = null;

  if (/^\d{4}$/.test(suffix)) {
    year = suffix;
  } else if (/^\d\d{4}$/.test(suffix)) {
    set = suffix.slice(0, 1);
    year = suffix.slice(1);
  } else {
    const yearMatch = normalizedBase.match(/(\d{4})(?!.*\d)/);
    year = yearMatch ? yearMatch[1] : "0000";

    const beforeYear = normalizedBase.slice(0, normalizedBase.lastIndexOf(year));
    const setMatch = beforeYear.match(/(\d)$/);
    set = setMatch ? setMatch[1] : null;
  }

  return {
    year,
    set,
    file: fileName,
    path: `/GATEPYQs/${subjectCode}/${fileName}`,
  };
}

function sortPapersDesc(a, b) {
  const ay = Number(a.year || 0);
  const by = Number(b.year || 0);
  if (by !== ay) return by - ay;

  const as = a.set === null ? -1 : Number(a.set);
  const bs = b.set === null ? -1 : Number(b.set);
  return as - bs;
}

const subjectDirs = fs
  .readdirSync(basePath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const data = {};

for (const subjectCode of subjectDirs) {
  const subjectDir = path.join(basePath, subjectCode);
  const pdfFiles = fs
    .readdirSync(subjectDir)
    .filter((file) => file.toLowerCase().endsWith(".pdf"));

  const papers = pdfFiles
    .map((fileName) => parsePaperMeta(fileName, subjectCode))
    .sort(sortPapersDesc);

  data[subjectCode] = papers;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + "\n");

console.log(`Generated ${outputPath} with ${subjectDirs.length} subjects.`);
