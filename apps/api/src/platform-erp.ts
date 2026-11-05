import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";

type Json = Record<string, unknown>;
type Client = { query<T = unknown>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>; release(): void };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEAD_STAGES = ["new", "qualified", "discovery", "demo", "proposal", "negotiation", "won", "lost", "dormant"] as const;
const CUSTOMER_TYPES = ["institution", "foundation", "company", "individual", "government", "other"] as const;

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
  res.end(JSON.stringify(body));
}
function record(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 32_768) return null;
    chunks.push(part);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return record(value) ? value : null;
  } catch { return null; }
}
function emailValid(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function validateLeadInput(value: Json): string | null {
  if (typeof value.organizationName !== "string" || value.organizationName.trim().length < 2 || value.organizationName.length > 180) return "invalid_organization_name";
  if (typeof value.contactName !== "string" || value.contactName.trim().length < 2 || value.contactName.length > 160) return "invalid_contact_name";
  if (value.email !== undefined && value.email !== null && (typeof value.email !== "string" || !emailValid(value.email.trim()))) return "invalid_email";
  if (value.phone !== undefined && value.phone !== null && (typeof value.phone !== "string" || value.phone.length > 40)) return "invalid_phone";
  if (value.source !== undefined && (typeof value.source !== "string" || value.source.trim().length < 2 || value.source.length > 60)) return "invalid_source";
  if (value.stage !== undefined && !LEAD_STAGES.includes(value.stage as typeof LEAD_STAGES[number])) return "invalid_lead_stage";
  if (value.estimatedValue !== undefined && value.estimatedValue !== null && (typeof value.estimatedValue !== "number" || !Number.isFinite(value.estimatedValue) || value.estimatedValue < 0 || value.estimatedValue > 1_000_000_000_000_000)) return "invalid_estimated_value";
  if (value.currency !== undefined && (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))) return "invalid_currency";
  if (value.consentStatus !== undefined && !["unknown", "granted", "withdrawn", "not_required"].includes(String(value.consentStatus))) return "invalid_consent_status";
  if (value.notes !== undefined && value.notes !== null && (typeof value.notes !== "string" || value.notes.length > 5000)) return "invalid_notes";
  if (value.lostReason !== undefined && value.lostReason !== null && (typeof value.lostReason !== "string" || value.lostReason.length > 1000)) return "invalid_lost_reason";
  return null;
}
export function validateCustomerInput(value: Json): string | null {
  if (typeof value.legalName !== "string" || value.legalName.trim().length < 2 || value.legalName.length > 220) return "invalid_legal_name";
  if (typeof value.displayName !== "string" || value.displayName.trim().length < 2 || value.displayName.length > 180) return "invalid_display_name";
  if (value.entityType !== undefined && !CUSTOMER_TYPES.includes(value.entityType as typeof CUSTOMER_TYPES[number])) return "invalid_entity_type";
  if (value.billingEmail !== undefined && value.billingEmail !== null && (typeof value.billingEmail !== "string" || !emailValid(value.billingEmail.trim()))) return "invalid_billing_email";
  if (value.billingPhone !== undefined && value.billingPhone !== null && (typeof value.billingPhone !== "string" || value.billingPhone.length > 40)) return "invalid_billing_phone";
  if (value.billingAddress !== undefined && !record(value.billingAddress)) return "invalid_billing_address";
  if (value.billingAddress && JSON.stringify(value.billingAddress).length > 8000) return "billing_address_too_large";
  return null;
}
async function withAdmin<T>(pool: TenantDatabase, userId: string, work: (client: Client) => Promise<T>): Promise<{ forbidden: boolean; value?: T }> {
  if (!pool.connect) throw new Error("platform_transaction_unavailable");
  const client = await pool.connect() as Client;
  let active = false;
  try {
    await client.query("BEGIN"); active = true;
    const check = await client.query<{ allowed: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM platform.super_admins WHERE user_id = $1::uuid AND status = 'active') AS allowed", [userId],
    );
    if (check.rows[0]?.allowed !== true) {
      await client.query("ROLLBACK"); active = false;
      return { forbidden: true };
    }
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    await client.query("SET LOCAL ROLE pondok_platform_runtime");
    const value = await work(client);
    await client.query("COMMIT"); active = false;
    return { forbidden: false, value };
  } catch (error) {
    if (active) await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
async function audit(client: Client, userId: string, action: string, resource: string, id: string, metadata: Json = {}): Promise<void> {
  await client.query(
    "INSERT INTO platform.audit_events (actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2,$3,$4::uuid,$5::jsonb)",
    [userId, action, resource, id, JSON.stringify(metadata)],
  );
}
function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
}

export async function handlePlatformErpRequest(req: IncomingMessage, res: ServerResponse, pool: TenantDatabase, userId: string): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const leadId = path.match(/^\/v1\/platform\/erp\/leads\/([0-9a-f-]{36})$/i)?.[1];
  const customerId = path.match(/^\/v1\/platform\/erp\/customers\/([0-9a-f-]{36})$/i)?.[1];
  const isLead = path === "/v1/platform/erp/leads" || Boolean(leadId);
  const isCustomer = path === "/v1/platform/erp/customers" || Boolean(customerId);
  if (!isLead && !isCustomer) return false;
  if ((leadId && !UUID.test(leadId)) || (customerId && !UUID.test(customerId))) { reply(res, 400, { error: "invalid_resource_id" }); return true; }

  if (req.method === "GET") {
    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    try {
      const scoped = await withAdmin(pool, userId, async (client) => {
        if (isLead) {
          if (leadId) {
            const result = await client.query(
              `SELECT id,lead_number AS "leadNumber",organization_name AS "organizationName",contact_name AS "contactName",
                email,phone,source,stage,estimated_value AS "estimatedValue",currency,consent_status AS "consentStatus",
                next_follow_up_at AS "nextFollowUpAt",lost_reason AS "lostReason",notes,created_at AS "createdAt",updated_at AS "updatedAt"
               FROM platform.crm_leads WHERE id=$1::uuid`, [leadId],
            );
            return { item: result.rows[0] ?? null };
          }
          const stage = url.searchParams.get("stage");
          const values: unknown[] = [`%${q.replace(/[\\%_]/g, "\\$&")}%`];
          let filter = "($1 = '%%' OR organization_name ILIKE $1 OR contact_name ILIKE $1 OR coalesce(email,'') ILIKE $1)";
          if (stage && LEAD_STAGES.includes(stage as typeof LEAD_STAGES[number])) { values.push(stage); filter += " AND stage=$2"; }
          values.push(limit);
          const result = await client.query(
            `SELECT id,lead_number AS "leadNumber",organization_name AS "organizationName",contact_name AS "contactName",
              email,phone,source,stage,estimated_value AS "estimatedValue",currency,consent_status AS "consentStatus",
              next_follow_up_at AS "nextFollowUpAt",created_at AS "createdAt",updated_at AS "updatedAt"
             FROM platform.crm_leads WHERE ${filter} ORDER BY created_at DESC LIMIT $${values.length}`, values,
          );
          return { items: result.rows, limit, returned: result.rows.length };
        }
        if (customerId) {
          const result = await client.query(
            `SELECT id,customer_code AS "customerCode",legal_name AS "legalName",display_name AS "displayName",
              entity_type AS "entityType",billing_email AS "billingEmail",billing_phone AS "billingPhone",
              billing_address AS "billingAddress",status,created_at AS "createdAt",updated_at AS "updatedAt"
             FROM platform.customers WHERE id=$1::uuid`, [customerId],
          );
          return { item: result.rows[0] ?? null };
        }
        const result = await client.query(
          `SELECT id,customer_code AS "customerCode",legal_name AS "legalName",display_name AS "displayName",
            entity_type AS "entityType",billing_email AS "billingEmail",billing_phone AS "billingPhone",status,
            created_at AS "createdAt",updated_at AS "updatedAt"
           FROM platform.customers
           WHERE ($1='%%' OR legal_name ILIKE $1 OR display_name ILIKE $1 OR customer_code ILIKE $1)
           ORDER BY created_at DESC LIMIT $2`,
          [`%${q.replace(/[\\%_]/g, "\\$&")}%`, limit],
        );
        return { items: result.rows, limit, returned: result.rows.length };
      });
      if (scoped.forbidden) { reply(res, 403, { error: "platform_super_admin_required" }); return true; }
      if (!scoped.value) { reply(res, 503, { error: "platform_erp_unavailable" }); return true; }
      if ("item" in scoped.value && !scoped.value.item) { reply(res, 404, { error: isLead ? "lead_not_found" : "customer_not_found" }); return true; }
      reply(res, 200, { data: scoped.value });
    } catch (error) {
      reply(res, errorCode(error) === "42P01" ? 503 : 500, { error: "platform_erp_read_failed" });
    }
    return true;
  }

  if (req.method === "POST" && !leadId && !customerId) {
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const invalid = isLead ? validateLeadInput(body) : validateCustomerInput(body);
    if (invalid) { reply(res, 422, { error: invalid }); return true; }
    try {
      const scoped = await withAdmin(pool, userId, async (client) => {
        if (isLead) {
          const leadNumber = `LD-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${randomUUID().slice(0,8).toUpperCase()}`;
          const result = await client.query(
            `INSERT INTO platform.crm_leads
              (lead_number,organization_name,contact_name,email,phone,source,stage,estimated_value,currency,consent_status,notes,lost_reason,owner_user_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::uuid)
             RETURNING id,lead_number AS "leadNumber",organization_name AS "organizationName",contact_name AS "contactName",
              email,phone,source,stage,estimated_value AS "estimatedValue",currency,consent_status AS "consentStatus",
              notes,created_at AS "createdAt"`,
            [leadNumber,String(body.organizationName).trim(),String(body.contactName).trim(),body.email ? String(body.email).trim().toLowerCase() : null,
             body.phone ?? null,body.source ? String(body.source).trim() : "manual",body.stage ?? "new",body.estimatedValue ?? null,
             body.currency ?? "IDR",body.consentStatus ?? "unknown",body.notes ?? null,body.lostReason ?? null,userId],
          );
          const row = result.rows[0] as { id: string } | undefined;
          if (!row) throw new Error("lead_insert_failed");
          await audit(client,userId,"crm.lead.created","crm_lead",row.id,{stage:body.stage ?? "new",source:body.source ?? "manual"});
          return row;
        }
        const customerCode = `CUS-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${randomUUID().slice(0,8).toUpperCase()}`;
        const result = await client.query(
          `INSERT INTO platform.customers
            (customer_code,legal_name,display_name,entity_type,billing_email,billing_phone,billing_address,status,account_owner_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'prospect',$8::uuid)
           RETURNING id,customer_code AS "customerCode",legal_name AS "legalName",display_name AS "displayName",
            entity_type AS "entityType",billing_email AS "billingEmail",billing_phone AS "billingPhone",billing_address AS "billingAddress",
            status,created_at AS "createdAt"`,
          [customerCode,String(body.legalName).trim(),String(body.displayName).trim(),body.entityType ?? "institution",
           body.billingEmail ? String(body.billingEmail).trim().toLowerCase() : null,body.billingPhone ?? null,
           JSON.stringify(body.billingAddress ?? {}),userId],
        );
        const row = result.rows[0] as { id: string } | undefined;
        if (!row) throw new Error("customer_insert_failed");
        await audit(client,userId,"crm.customer.created","customer",row.id,{entityType:body.entityType ?? "institution"});
        return row;
      });
      if (scoped.forbidden) { reply(res, 403, { error: "platform_super_admin_required" }); return true; }
      reply(res, 201, { data: scoped.value });
    } catch (error) {
      const code = errorCode(error);
      reply(res, code === "23505" ? 409 : code === "42P01" ? 503 : 500, { error: code === "23505" ? "duplicate_platform_record" : "platform_erp_create_failed" });
    }
    return true;
  }

  if (req.method === "PATCH" && leadId && isLead) {
    const body = await readJson(req);
    if (!body || Object.keys(body).length === 0) { reply(res, 400, { error: "invalid_json_or_empty_update" }); return true; }
    const allowed = new Set(["stage","nextFollowUpAt","estimatedValue","notes","lostReason","consentStatus"]);
    if (Object.keys(body).some(key => !allowed.has(key))) { reply(res, 422, { error: "unsupported_lead_update_field" }); return true; }
    if (body.stage !== undefined && !LEAD_STAGES.includes(body.stage as typeof LEAD_STAGES[number])) { reply(res, 422, { error: "invalid_lead_stage" }); return true; }
    if (body.consentStatus !== undefined && !["unknown","granted","withdrawn","not_required"].includes(String(body.consentStatus))) { reply(res, 422, { error: "invalid_consent_status" }); return true; }
    if (body.estimatedValue !== undefined && body.estimatedValue !== null && (typeof body.estimatedValue !== "number" || !Number.isFinite(body.estimatedValue) || body.estimatedValue < 0)) { reply(res, 422, { error: "invalid_estimated_value" }); return true; }
    if (body.notes !== undefined && body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 5000)) { reply(res, 422, { error: "invalid_notes" }); return true; }
    if (body.lostReason !== undefined && body.lostReason !== null && (typeof body.lostReason !== "string" || body.lostReason.length > 1000)) { reply(res, 422, { error: "invalid_lost_reason" }); return true; }
    if (body.nextFollowUpAt !== undefined && body.nextFollowUpAt !== null && (typeof body.nextFollowUpAt !== "string" || !Number.isFinite(Date.parse(body.nextFollowUpAt)))) { reply(res, 422, { error: "invalid_next_follow_up_at" }); return true; }
    try {
      const scoped = await withAdmin(pool,userId,async client => {
        const fields: Array<[string,string]> = [["stage","stage"],["nextFollowUpAt","next_follow_up_at"],["estimatedValue","estimated_value"],["notes","notes"],["lostReason","lost_reason"],["consentStatus","consent_status"]];
        const values: unknown[]=[leadId]; const sets:string[]=[];
        for(const [key,column] of fields) if(Object.hasOwn(body,key)){values.push(body[key]);sets.push(`${column}=$${values.length}${key==="nextFollowUpAt"?"::timestamptz":""}`);}
        sets.push("updated_at=now()");
        const result=await client.query(
          `UPDATE platform.crm_leads SET ${sets.join(",")} WHERE id=$1::uuid
           RETURNING id,lead_number AS "leadNumber",organization_name AS "organizationName",contact_name AS "contactName",
            email,phone,source,stage,estimated_value AS "estimatedValue",currency,consent_status AS "consentStatus",
            next_follow_up_at AS "nextFollowUpAt",lost_reason AS "lostReason",notes,updated_at AS "updatedAt"`,values);
        const row=result.rows[0] as {id:string}|undefined;
        if(row) await audit(client,userId,"crm.lead.updated","crm_lead",row.id,{changedFields:Object.keys(body)});
        return row ?? null;
      });
      if(scoped.forbidden){reply(res,403,{error:"platform_super_admin_required"});return true;}
      if(!scoped.value){reply(res,404,{error:"lead_not_found"});return true;}
      reply(res,200,{data:scoped.value});
    } catch { reply(res,500,{error:"lead_update_failed"}); }
    return true;
  }
  reply(res, 405, { error: "method_not_allowed" });
  return true;
}
