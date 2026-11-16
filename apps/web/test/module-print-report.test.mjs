import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = await readFile(new URL("../src/ModuleWorkspace.tsx", import.meta.url), "utf8");
const stylesheet = await readFile(new URL("../src/style.css", import.meta.url), "utf8");

test("module print action renders a dedicated report document", () => {
  assert.match(workspace, /className="print-report"/);
  assert.match(workspace, /className="print-report-table"/);
  assert.match(workspace, /resource\.columns\.map/);
  assert.match(workspace, /visibleRows\.map/);
  assert.match(workspace, /Cetak Laporan/);
});

test("print stylesheet excludes interactive workspace chrome", () => {
  assert.match(stylesheet, /@media print/);
  assert.match(stylesheet, /body \*\{visibility:hidden!important\}/);
  assert.match(stylesheet, /\.print-report,\.print-report \*\{visibility:visible!important\}/);
  assert.match(stylesheet, /\.print-report\{display:block!important/);
});

test("report table omits row action controls and reuses safe display formatting", () => {
  assert.match(workspace, /resource\.columns\.map\(\(\[key\]\)=>\s*<td key=\{key\}>\{displayCell\(key,row\[key\]\)\}<\/td>/);
  assert.match(workspace, /isSensitiveStudentHealthField\(resource\?\.key\?\?""/);
  assert.match(workspace, /resource\?\.key==="student-identity-documents"&&column==="document_number"/);
});
