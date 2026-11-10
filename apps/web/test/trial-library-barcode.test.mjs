import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("non-tenant onboarding visibly explains when the 14-day trial starts", async () => {
  const app = await read("apps/web/src/App.tsx");
  assert.match(app, /TRIAL GRATIS PONDOK OS · 14 HARI/);
  assert.match(app, /Pendaftaran akun saja belum memulai trial/);
  assert.match(app, /<InstitutionActivation\s*\/>/);
});

test("library catalog edition metadata is stored through the tenant API", async () => {
  const migration = await read("database/migrations/0035_library_catalog_edition.sql");
  const api = await read("apps/api/src/module-records.ts");
  const workspace = await read("apps/web/src/ModuleWorkspace.tsx");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS edition text/i);
  assert.match(api, /edition:\{column:"edition",max:80\}/);
  assert.match(workspace, /Edisi \/ cetakan/);
});

test("library barcode generator prints selected copies with bibliographic metadata", async () => {
  const panel = await read("apps/web/src/LibraryBarcodePanel.tsx");
  const workspace = await read("apps/web/src/ModuleWorkspace.tsx");
  assert.match(panel, /CODE39/);
  assert.match(panel, /publication_year/);
  assert.match(panel, /book\?\.edition/);
  assert.match(panel, /book\?\.publisher/);
  assert.match(panel, /window\.open/);
  assert.match(panel, /size:A4/);
  assert.match(panel, /grid-template-columns:repeat\(3,1fr\)/);
  assert.match(workspace, /LibraryBarcodePanel copies=\{rows\}/);
  assert.match(workspace, /Buat barcode unik otomatis/);
});

test("every module workspace has an explicit optional-upgrade roadmap", async () => {
  const workspace = await read("apps/web/src/ModuleWorkspace.tsx");
  const operations = await read("apps/web/src/Operations.tsx");
  assert.match(workspace, /Kesiapan peningkatan modul/);
  assert.match(workspace, /guidance\?\.operationalGaps/);
  assert.match(operations, /Ruang peningkatan modul/);
  assert.match(operations, /bukan klaim bahwa seluruh fitur sudah aktif/);
});
