import assert from "node:assert/strict";
import { Pool } from "pg";
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error("DATABASE_URL is required for procurement/inventory tests");
const pool=new Pool({connectionString,max:1});
try{
 const tables=["vendors","vendor_contacts","purchase_requisitions","purchase_requisition_lines","request_for_quotations","rfq_vendor_invites","vendor_quotes","vendor_quote_lines","purchase_orders","purchase_order_lines","warehouses","goods_receipts","goods_receipt_lines","stock_movements","stock_transfers","stock_transfer_lines","fixed_assets","asset_events"];
 const relations=await pool.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='platform' AND c.relname=ANY($1::text[]) AND c.relkind='r'`,[tables]);
 assert.equal(relations.rowCount,tables.length,"all procurement and inventory relations must exist");
 for(const row of relations.rows){assert.equal(row.relrowsecurity,true,`${row.relname}: RLS enabled`);assert.equal(row.relforcerowsecurity,true,`${row.relname}: FORCE RLS enabled`);}
 const role=await pool.query("SELECT rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname='pondok_platform_runtime'");
 assert.equal(role.rowCount,1);assert.equal(role.rows[0].rolcanlogin,false);assert.equal(role.rows[0].rolbypassrls,false);
 const privileges=await pool.query(`SELECT has_table_privilege('pondok_platform_runtime','platform.stock_movements','UPDATE') AS movement_update,has_table_privilege('pondok_platform_runtime','platform.stock_movements','DELETE') AS movement_delete,has_table_privilege('pondok_platform_runtime','platform.goods_receipt_lines','UPDATE') AS receipt_update,has_table_privilege('pondok_platform_runtime','platform.asset_events','DELETE') AS asset_event_delete,has_table_privilege('pondok_platform_runtime','platform.vendors','DELETE') AS vendor_delete`);
 assert.equal(privileges.rows[0].movement_update,false);assert.equal(privileges.rows[0].movement_delete,false);assert.equal(privileges.rows[0].receipt_update,false);assert.equal(privileges.rows[0].asset_event_delete,false);assert.equal(privileges.rows[0].vendor_delete,false);
 const constraints=await pool.query(`SELECT count(*)::int AS checks FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='platform' AND t.relname IN ('stock_movements','purchase_orders','goods_receipt_lines','fixed_assets') AND c.contype='c'`);
 assert.ok(constraints.rows[0].checks>=12,"database must enforce business invariants");
 process.stdout.write("Procurement/inventory foundation passed: 18 RLS-protected relations, restricted runtime, immutable stock/receipt/asset evidence, and database-enforced invariants.\n");
}finally{await pool.end();}
