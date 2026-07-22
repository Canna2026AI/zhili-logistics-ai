#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const proposalPath = resolve(
  here,
  '../../docs/03-delivery/schema-proposals/backend-warehouse-linehaul.sql',
);

let sql;
try {
  sql = readFileSync(proposalPath, 'utf8');
} catch (error) {
  console.error(`FAIL: proposal is missing: ${proposalPath}`);
  process.exitCode = 1;
  process.exit();
}

const failures = [];
const requireMatch = (description, pattern) => {
  if (!pattern.test(sql)) failures.push(description);
};

const requiredTables = [
  'warehouse_scans',
  'warehouse_receipts',
  'warehouse_measurements',
  'warehouse_media',
  'inventory_balances',
  'inventory_ledger_entries',
  'route_decisions',
  'load_units',
  'load_unit_items',
  'linehaul_bookings',
  'bills_of_lading',
  'fba_deliveries',
  'delivery_tasks',
  'delivery_task_events',
  'pod_records',
  'pod_versions',
  'device_sync_sessions',
  'device_event_receipts',
  'device_event_media_claims',
  'device_sync_conflicts',
  'print_jobs',
];

requireMatch(
  'declares the foundation dependency',
  /Depends on:[^\n]*0000_foundation\.sql/i,
);
requireMatch(
  'declares the identity/master-data proposal dependency',
  /Depends on proposal:[^\n]*backend-identity-masterdata\.sql/i,
);
requireMatch(
  'declares the rates/waybills proposal dependency',
  /Depends on proposal:[^\n]*backend-rates-waybills\.sql/i,
);

for (const upstreamTable of [
  'tenants',
  'customers',
  'customer_addresses',
  'devices',
  'warehouses',
  'waybills',
]) {
  if (new RegExp(`CREATE\\s+TABLE\\s+${upstreamTable}\\b`, 'i').test(sql)) {
    failures.push(`does not redefine upstream table ${upstreamTable}`);
  }
}

for (const table of requiredTables) {
  const escaped = table.replaceAll('_', '\\_');
  requireMatch(
    `creates ${table}`,
    new RegExp(`CREATE\\s+TABLE\\s+${table}\\b`, 'i'),
  );
  requireMatch(
    `${table} has tenant_id`,
    new RegExp(
      `CREATE\\s+TABLE\\s+${table}\\s*\\([\\s\\S]*?tenant_id\\s+text\\s+NOT\\s+NULL[\\s\\S]*?\\n\\);`,
      'i',
    ),
  );
  requireMatch(
    `${table} has tenant-scoped identity uniqueness`,
    new RegExp(
      `CREATE\\s+TABLE\\s+${table}\\s*\\([\\s\\S]*?UNIQUE\\s*\\(tenant_id,\\s*id\\)[\\s\\S]*?\\n\\);`,
      'i',
    ),
  );
  requireMatch(
    `${table} enables RLS`,
    new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
  );
  requireMatch(
    `${table} forces RLS`,
    new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
  );
  requireMatch(
    `${table} has tenant isolation policy`,
    new RegExp(
      `CREATE\\s+POLICY\\s+\\w+\\s+ON\\s+${table}[\\s\\S]*?USING\\s*\\(tenant_id\\s*=\\s*nullif\\(current_setting\\('app\\.tenant_id',\\s*true\\),\\s*''\\)\\)[\\s\\S]*?WITH\\s+CHECK\\s*\\(tenant_id\\s*=\\s*nullif\\(current_setting\\('app\\.tenant_id',\\s*true\\),\\s*''\\)\\)`,
      'i',
    ),
  );
  requireMatch(
    `${table} has a stable tenant cursor index`,
    new RegExp(
      `CREATE\\s+INDEX\\s+\\w+\\s+ON\\s+${table}\\s*\\(tenant_id,\\s*created_at,\\s*id\\)`,
      'i',
    ),
  );
}

for (const [column, type] of [
  ['actual_weight_grams', 'bigint'],
  ['length_mm', 'integer'],
  ['width_mm', 'integer'],
  ['height_mm', 'integer'],
]) {
  requireMatch(
    `${column} uses a positive integer base unit`,
    new RegExp(
      `${column}\\s+${type}\\s+NOT\\s+NULL[\\s\\S]*?CHECK\\s*\\(${column}\\s*>\\s*0\\)`,
      'i',
    ),
  );
}
requireMatch('enforces non-negative inventory balances', /inventory_balances[\s\S]*?CHECK\s*\(quantity_base\s*>=\s*0\)/i);
requireMatch('makes duplicate scans idempotent', /warehouse_scans[\s\S]*?UNIQUE\s*\(tenant_id,\s*device_id,\s*client_event_id\)/i);
requireMatch('makes duplicate device events idempotent', /device_event_receipts[\s\S]*?UNIQUE\s*\(tenant_id,\s*device_id,\s*event_id\)/i);
requireMatch('stores all per-event dispositions', /APPLIED[\s\S]*DUPLICATE[\s\S]*CONFLICT[\s\S]*REJECTED/i);
requireMatch('stores ordered local event sequences', /UNIQUE\s*\(tenant_id,\s*session_id,\s*local_sequence\)/i);
requireMatch('stores device session and warehouse binding scope', /FOREIGN KEY\s*\(tenant_id,\s*session_id,\s*device_id,\s*warehouse_id\)/i);
requireMatch('stores idempotent media claims', /device_event_media_claims[\s\S]*?UNIQUE\s*\(tenant_id,\s*device_event_receipt_id,\s*claim_key\)/i);
requireMatch('supports all three conflict resolutions', /SERVER_WINS[\s\S]*CLIENT_RETRY[\s\S]*MANUAL_MERGE/i);
requireMatch('deduplicates print jobs', /print_jobs[\s\S]*?UNIQUE\s*\(tenant_id,\s*dedupe_key\)/i);
requireMatch('guards receipt version and stale undo in the database', /CREATE\s+TRIGGER\s+warehouse_receipts_state_guard/i);
requireMatch('guards load sealing and dispatch transitions in the database', /CREATE\s+TRIGGER\s+load_units_state_guard/i);
requireMatch('locks load items once their load unit is sealed', /CREATE\s+TRIGGER\s+load_unit_items_state_guard[\s\S]*?BEFORE\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+load_unit_items/i);
requireMatch('retains immutable POD version history', /CREATE\s+TRIGGER\s+pod_versions_immutable_update[\s\S]*?CREATE\s+TRIGGER\s+pod_versions_immutable_delete/i);
requireMatch('requires the POD head to reference an immutable current version', /FOREIGN\s+KEY\s*\(tenant_id,\s*id,\s*current_version\)[\s\S]*?REFERENCES\s+pod_versions\s*\(tenant_id,\s*pod_record_id,\s*pod_version\)[\s\S]*?DEFERRABLE\s+INITIALLY\s+DEFERRED/i);
requireMatch('makes inventory ledger entries immutable', /CREATE\s+TRIGGER\s+inventory_ledger_entries_immutable_update[\s\S]*?CREATE\s+TRIGGER\s+inventory_ledger_entries_immutable_delete/i);
requireMatch('database-enforces the next local device sequence', /NEW\.local_sequence\s*<>\s*session_last_local_sequence\s*\+\s*1/i);
requireMatch('persists rejected receipts for closed or expired sessions', /session_status\s*<>\s*'OPEN'[\s\S]*?NEW\.disposition\s*<>\s*'REJECTED'/i);

const referenceClauses = [...sql.matchAll(/REFERENCES\s+\w+\s*\([^)]*\)([^,\n]*)/gi)];
for (const [, suffix] of referenceClauses) {
  if (!/ON\s+DELETE\s+(CASCADE|RESTRICT)/i.test(suffix)) {
    failures.push(`foreign key lacks explicit ON DELETE CASCADE/RESTRICT: ${suffix.trim()}`);
  }
}

if (/app\.current_tenant/i.test(sql)) {
  failures.push('does not introduce app.current_tenant');
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} warehouse proposal contract violation(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `PASS: warehouse proposal contract (${requiredTables.length} tenant tables, RLS/constraints/guards verified)`,
  );
}
