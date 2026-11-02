import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Json = Record<string, unknown>;

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 65_536) return null;
    chunks.push(part);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
  } catch { return null; }
}

export function validateAccountInput(value: Json): string | null {
  if (typeof value.accountCode !== "string" || !/^[A-Za-z0-9._-]{1,32}$/.test(value.accountCode)) return "invalid_account_code";
  if (typeof value.accountName !== "string" || value.accountName.trim().length < 2 || value.accountName.length > 160) return "invalid_account_name";
  if (!["asset","liability","equity","revenue","expense"].includes(String(value.accountType))) return "invalid_account_type";
  if (value.parentAccountId !== undefined && value.parentAccountId !== null
    && (typeof value.parentAccountId !== "string" || !UUID.test(value.parentAccountId))) return "invalid_parent_account_id";
  return null;
}

export function validateJournalInput(value: Json): string | null {
  if (typeof value.fiscalPeriodId !== "string" || !UUID.test(value.fiscalPeriodId)) return "invalid_fiscal_period_id";
  if (typeof value.entryNumber !== "string" || !/^[A-Za-z0-9._/-]{1,64}$/.test(value.entryNumber)) return "invalid_entry_number";
  if (typeof value.entryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.entryDate) || Number.isNaN(Date.parse(value.entryDate))) return "invalid_entry_date";
  if (typeof value.description !== "string" || value.description.trim().length < 3 || value.description.length > 500) return "invalid_description";
  if (!Array.isArray(value.lines) || value.lines.length < 2 || value.lines.length > 200) return "invalid_journal_lines";
  let debitTotal = 0;
  let creditTotal = 0;
  for (const [index, raw] of value.lines.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "invalid_journal_line";
    const line = raw as Json;
    if (typeof line.accountId !== "string" || !UUID.test(line.accountId)) return "invalid_journal_account_id";
    if (typeof line.debit !== "number" || !Number.isFinite(line.debit) || line.debit < 0) return "invalid_debit";
    if (typeof line.credit !== "number" || !Number.isFinite(line.credit) || line.credit < 0) return "invalid_credit";
    if (!((line.debit > 0 && line.credit === 0) || (line.credit > 0 && line.debit === 0))) return "journal_line_must_be_debit_or_credit";
    if (line.description !== undefined && line.description !== null && (typeof line.description !== "string" || line.description.length > 250)) return "invalid_line_description";
    debitTotal += line.debit;
    creditTotal += line.credit;
    if (!Number.isSafeInteger(index + 1)) return "invalid_journal_line_number";
  }
  if (Math.round(debitTotal * 100) !== Math.round(creditTotal * 100) || debitTotal <= 0) return "journal_not_balanced";
  return null;
}

export async function handleFinanceRequest(
  req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/v1/finance/")) return false;
  const tenant = await loadTenantContext(pool, userId, organizationId);
  if (!tenant) { reply(res, 403, { error: "active_membership_required" }); return true; }

  if (path === "/v1/finance/accounts" && req.method === "GET") {
    if (!tenant.permissions.includes("finance.accounts.read")) { reply(res, 403, { error: "permission_required", permission: "finance.accounts.read" }); return true; }
    const result = await pool.query(
      `SELECT id, account_code AS "accountCode", account_name AS "accountName",
              account_type AS "accountType", parent_account_id AS "parentAccountId",
              is_control_account AS "isControlAccount", is_active AS "isActive"
       FROM finance.accounts WHERE organization_id = $1::uuid AND is_active = true
       ORDER BY account_code LIMIT 500`, [organizationId],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/finance/accounts" && req.method === "POST") {
    if (!tenant.permissions.includes("finance.accounts.write")) { reply(res, 403, { error: "permission_required", permission: "finance.accounts.write" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validateAccountInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    try {
      const result = await pool.query(
        `INSERT INTO finance.accounts (organization_id, account_code, account_name, account_type, parent_account_id)
         VALUES ($1::uuid, $2, $3, $4, $5::uuid)
         RETURNING id, account_code AS "accountCode", account_name AS "accountName", account_type AS "accountType"`,
        [organizationId, body.accountCode, (body.accountName as string).trim(), body.accountType, body.parentAccountId ?? null],
      );
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23503" ? 422 : 500, { error: code === "23505" ? "account_code_already_exists" : code === "23503" ? "parent_account_not_found" : "account_create_failed" });
    }
    return true;
  }

  if (path === "/v1/finance/periods" && req.method === "GET") {
    if (!tenant.permissions.includes("finance.journals.read")) { reply(res, 403, { error: "permission_required", permission: "finance.journals.read" }); return true; }
    const result = await pool.query(
      `SELECT id, code, name, starts_on AS "startsOn", ends_on AS "endsOn",
              status, closed_at AS "closedAt"
       FROM finance.fiscal_periods WHERE organization_id = $1::uuid
       ORDER BY starts_on DESC LIMIT 100`, [organizationId],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/finance/periods" && req.method === "POST") {
    if (!tenant.permissions.includes("finance.periods.manage")) { reply(res, 403, { error: "permission_required", permission: "finance.periods.manage" }); return true; }
    const body = await readJson(req);
    if (!body || typeof body.code !== "string" || !/^[A-Za-z0-9._/-]{1,32}$/.test(body.code)
      || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 120
      || typeof body.startsOn !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(body.startsOn)
      || typeof body.endsOn !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(body.endsOn)
      || body.endsOn < body.startsOn) {
      reply(res, 422, { error: "invalid_fiscal_period_input" }); return true;
    }
    try {
      const result = await pool.query(
        `INSERT INTO finance.fiscal_periods (organization_id, code, name, starts_on, ends_on)
         VALUES ($1::uuid, $2, $3, $4::date, $5::date)
         RETURNING id, code, name, starts_on AS "startsOn", ends_on AS "endsOn", status`,
        [organizationId, body.code, (body.name as string).trim(), body.startsOn, body.endsOn],
      );
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23514" ? 422 : 500, { error: code === "23505" ? "fiscal_period_code_exists" : code === "23514" ? "invalid_fiscal_period_range" : "fiscal_period_create_failed" });
    }
    return true;
  }

  const closePeriodMatch = path.match(/^\\/v1\\/finance\\/periods\\/([0-9a-f-]{36})\\/close$/i);
  if (closePeriodMatch && req.method === "POST") {
    if (!tenant.permissions.includes("finance.periods.close")) { reply(res, 403, { error: "permission_required", permission: "finance.periods.close" }); return true; }
    const periodId = closePeriodMatch[1];
    if (!periodId || !UUID.test(periodId)) { reply(res, 400, { error: "invalid_fiscal_period_id" }); return true; }
    const result = await pool.query(
      `UPDATE finance.fiscal_periods fp
       SET status = 'closed', closed_at = now(), closed_by = $3::uuid
       WHERE fp.organization_id = $1::uuid AND fp.id = $2::uuid AND fp.status = 'open'
         AND NOT EXISTS (
           SELECT 1 FROM finance.journal_entries je
           WHERE je.organization_id = fp.organization_id
             AND je.fiscal_period_id = fp.id AND je.status = 'draft'
         )
       RETURNING id, code, status, closed_at AS "closedAt"`,
      [organizationId, periodId, userId],
    );
    if (!result.rows[0]) { reply(res, 409, { error: "period_not_found_closed_or_contains_draft_journals" }); return true; }
    reply(res, 200, { data: result.rows[0] }); return true;
  }

  if (path === "/v1/finance/journals" && req.method === "GET") {
    if (!tenant.permissions.includes("finance.journals.read")) { reply(res, 403, { error: "permission_required", permission: "finance.journals.read" }); return true; }
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const result = await pool.query(
      `SELECT je.id, je.entry_number AS "entryNumber", je.entry_date AS "entryDate",
              je.description, je.status, je.posted_at AS "postedAt",
              COALESCE(SUM(jl.debit),0)::numeric(18,2) AS debit,
              COALESCE(SUM(jl.credit),0)::numeric(18,2) AS credit
       FROM finance.journal_entries je
       LEFT JOIN finance.journal_lines jl
         ON jl.organization_id = je.organization_id AND jl.journal_entry_id = je.id
       WHERE je.organization_id = $1::uuid
       GROUP BY je.id ORDER BY je.entry_date DESC, je.created_at DESC LIMIT $2`,
      [organizationId, limit],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/finance/journals" && req.method === "POST") {
    if (!tenant.permissions.includes("finance.journals.write")) { reply(res, 403, { error: "permission_required", permission: "finance.journals.write" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validateJournalInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    const lines = (body.lines as Json[]).map((line, index) => ({
      line_number: index + 1, account_id: line.accountId, description: line.description ?? null,
      debit: line.debit, credit: line.credit,
    }));
    try {
      const result = await pool.query(
        `WITH entry AS (
           INSERT INTO finance.journal_entries
             (organization_id, fiscal_period_id, entry_number, entry_date, description, created_by)
           SELECT $1::uuid, fp.id, $3, $4::date, $5, $6::uuid
           FROM finance.fiscal_periods fp
           WHERE fp.organization_id = $1::uuid AND fp.id = $2::uuid
             AND fp.status = 'open' AND $4::date BETWEEN fp.starts_on AND fp.ends_on
           RETURNING id, entry_number, entry_date, description, status
         ), lines AS (
           INSERT INTO finance.journal_lines
             (organization_id, journal_entry_id, line_number, account_id, description, debit, credit)
           SELECT $1::uuid, entry.id, l.line_number, l.account_id, l.description, l.debit, l.credit
           FROM entry CROSS JOIN jsonb_to_recordset($7::jsonb)
             AS l(line_number integer, account_id uuid, description text, debit numeric, credit numeric)
           RETURNING id
         )
         SELECT entry.id, entry.entry_number AS "entryNumber", entry.entry_date AS "entryDate",
                entry.description, entry.status, (SELECT COUNT(*) FROM lines)::integer AS "lineCount"
         FROM entry`,
        [organizationId, body.fiscalPeriodId, body.entryNumber, body.entryDate, (body.description as string).trim(), userId, JSON.stringify(lines)],
      );
      if (!result.rows[0]) { reply(res, 422, { error: "fiscal_period_not_open_or_date_outside_period" }); return true; }
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23503" || code === "23514" ? 422 : 500,
        { error: code === "23505" ? "journal_number_already_exists" : code === "23503" ? "journal_account_or_period_not_found" : code === "23514" ? "journal_validation_failed" : "journal_create_failed" });
    }
    return true;
  }

  const postMatch = path.match(/^\/v1\/finance\/journals\/([0-9a-f-]{36})\/post$/i);
  if (postMatch && req.method === "POST") {
    if (!tenant.permissions.includes("finance.journals.post")) { reply(res, 403, { error: "permission_required", permission: "finance.journals.post" }); return true; }
    const journalId = postMatch[1];
    if (!journalId || !UUID.test(journalId)) { reply(res, 400, { error: "invalid_journal_id" }); return true; }
    try {
      const result = await pool.query(
        `UPDATE finance.journal_entries SET status = 'posted', posted_by = $3::uuid
         WHERE organization_id = $1::uuid AND id = $2::uuid AND status = 'draft'
         RETURNING id, entry_number AS "entryNumber", status, posted_at AS "postedAt"`,
        [organizationId, journalId, userId],
      );
      if (!result.rows[0]) { reply(res, 409, { error: "journal_not_found_or_not_draft" }); return true; }
      reply(res, 200, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23514" ? 422 : 500, { error: code === "23514" ? "journal_posting_validation_failed" : "journal_post_failed" });
    }
    return true;
  }

  if (path.startsWith("/v1/finance/")) { res.setHeader("allow", "GET, POST"); reply(res, 405, { error: "method_not_allowed" }); return true; }
  return false;
}
