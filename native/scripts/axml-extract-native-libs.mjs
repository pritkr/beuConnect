/**
 * Flip `android:extractNativeLibs` to true in a compiled (binary XML) manifest.
 *
 * `nsh package` writes the manifest with `extractNativeLibs="false"`, which
 * forces the native libraries to be stored uncompressed and page-aligned in the
 * APK. That is the right call for a page-mapped runtime, but it makes a
 * directly-shipped APK enormous: the 25 MB runtime cannot be deflated.
 *
 * Compressing libnsh.so (25 MB → ~9 MB) requires the platform to extract it at
 * install time, and the platform only does that when the manifest says so. This
 * script patches that one boolean in place, by walking the AXML chunk table.
 *
 * Usage: bun scripts/axml-extract-native-libs.mjs <path to AndroidManifest.xml>
 */

import { readFileSync, writeFileSync } from "node:fs";

const TEXT = "android:extractNativeLibs";
const RES_XML_TYPE = 0x0003;
const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;
const EXTRACT_NATIVE_LIBS_ID = 0x010104ea;
const TYPE_INT_BOOLEAN = 0x12;

const path = process.argv[2];
if (!path) {
  console.error("usage: bun axml-extract-native-libs.mjs <AndroidManifest.xml>");
  process.exit(2);
}

const buffer = readFileSync(path);
const u16 = (at) => buffer.readUInt16LE(at);
const u32 = (at) => buffer.readUInt32LE(at);

function fail(message) {
  console.error(`${TEXT}: ${message} (${path})`);
  process.exit(1);
}

function utf8(at) {
  let cursor = at;
  let length = buffer[cursor++];
  if (length & 0x80) length = ((length & 0x7f) << 8) | buffer[cursor++];
  return buffer.subarray(cursor, cursor + length).toString("utf8");
}

function utf16(at) {
  const first = u16(at);
  let length = first;
  let cursor = at + 2;
  if (first & 0x8000) {
    length = ((first & 0x7fff) << 16) | u16(at + 2);
    cursor = at + 4;
  }
  return buffer.subarray(cursor, cursor + length * 2).toString("utf16le");
}

function stringPool(at) {
  const headerSize = u16(at + 2);
  const count = u32(at + 8);
  const flags = u32(at + 16);
  const stringsStart = u32(at + 20);
  const isUtf8 = (flags & 0x100) !== 0;
  const offsets = at + headerSize;
  const strings = [];
  for (let index = 0; index < count; index += 1) {
    const start = at + stringsStart + u32(offsets + index * 4);
    strings.push(isUtf8 ? utf8(start) : utf16(start));
  }
  return strings;
}

if (buffer.length < 8 || u16(0) !== RES_XML_TYPE) fail("not a binary XML document");

let strings = [];
let resourceIds = [];
let patched = false;
const end = u32(4);

for (let at = u16(2); at + 8 <= end; ) {
  const type = u16(at);
  const headerSize = u16(at + 2);
  const size = u32(at + 4);
  if (size < 8 || at + size > buffer.length) break;

  if (type === RES_STRING_POOL_TYPE) {
    strings = stringPool(at);
  } else if (type === RES_XML_RESOURCE_MAP_TYPE) {
    const count = (size - headerSize) / 4;
    resourceIds = [];
    for (let index = 0; index < count; index += 1) resourceIds.push(u32(at + headerSize + index * 4));
  } else if (type === RES_XML_START_ELEMENT_TYPE) {
    const element = strings[u32(at + 20)] ?? "";
    if (element === "application") {
      const attributeStart = u16(at + 24);
      const attributeCount = u16(at + 28);
      for (let index = 0; index < attributeCount; index += 1) {
        const attribute = at + 16 + attributeStart + index * 20;
        const nameIndex = u32(attribute + 4);
        const name = strings[nameIndex] ?? "";
        const resourceId = resourceIds[nameIndex];
        if (name !== "extractNativeLibs" && resourceId !== EXTRACT_NATIVE_LIBS_ID) continue;
        buffer.writeUInt8(TYPE_INT_BOOLEAN, attribute + 15);
        buffer.writeUInt32LE(1, attribute + 16);
        patched = true;
      }
    }
  }

  at += size;
}

if (!patched) fail("attribute not found — the manifest template may have changed");

writeFileSync(path, buffer);
console.log(`${TEXT}=true`);
