#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const proposalPath = resolve(
  here,
  '../../docs/03-delivery/schema-proposals/backend-warehouse-linehaul.sql',
);
const foundationPath = resolve(here, '../../packages/db/migrations/0000_foundation.sql');

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
requireMatch('database-enforces the next local device sequence', /NEW\.local_sequence\s*>\s*session_last_local_sequence\s*\+\s*1/i);
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
  await verifyPostgres();
}

async function verifyPostgres() {
  const container = `zhili-warehouse-proposal-${process.pid}`;
  const postgresImage = process.env.POSTGRES_IMAGE ?? 'postgres:17-alpine';
  let started = false;

  const docker = (args, input, allowFailure = false) => {
    const result = spawnSync('docker', args, {
      input,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    if (!allowFailure && result.status !== 0) {
      throw new Error(
        `docker ${args.join(' ')} failed (${result.status})\n${result.stdout}${result.stderr}`,
      );
    }
    return result;
  };

  const psql = (statement, allowFailure = false) =>
    docker(
      [
        'exec',
        '-i',
        container,
        'psql',
        '-X',
        '-A',
        '-t',
        '-q',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'zhili_proposal',
      ],
      statement,
      allowFailure,
    );

  const expectRejected = (description, statement, expectedText) => {
    const result = psql(`BEGIN;\n${statement}\nROLLBACK;\n`, true);
    const output = `${result.stdout}${result.stderr}`;
    if (result.status === 0) {
      failures.push(`${description}: statement unexpectedly succeeded`);
    } else if (expectedText && !output.includes(expectedText)) {
      failures.push(`${description}: rejected for the wrong reason: ${output.trim()}`);
    }
  };

  const psqlAsync = (statement) =>
    new Promise((resolvePromise) => {
      const child = spawn(
        'docker',
        [
          'exec',
          '-i',
          container,
          'psql',
          '-X',
          '-A',
          '-t',
          '-q',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'postgres',
          '-d',
          'zhili_proposal',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('close', (status) => resolvePromise({ status, stdout, stderr }));
      child.stdin.end(statement);
    });

  const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

  const expectSealRaceRejected = async (description, loadUnitId, mutation) => {
    const seal = psqlAsync(`
BEGIN;
UPDATE load_units
SET status = 'SEALED', version = version + 1, sealed_at = now()
WHERE tenant_id = 't1' AND id = '${loadUnitId}';
SELECT pg_sleep(1);
COMMIT;
`);
    await sleep(250);
    const mutationResult = psql(`${mutation}\n`, true);
    const sealResult = await seal;
    if (sealResult.status !== 0) {
      failures.push(`${description}: sealing session failed: ${sealResult.stdout}${sealResult.stderr}`);
    }
    const mutationOutput = `${mutationResult.stdout}${mutationResult.stderr}`;
    if (mutationResult.status === 0) {
      failures.push(`${description}: concurrent manifest mutation unexpectedly succeeded`);
    } else if (!mutationOutput.includes('sealed or dispatched load unit items are immutable')) {
      failures.push(`${description}: mutation failed for the wrong reason: ${mutationOutput.trim()}`);
    }
  };

  const cleanup = () => {
    if (started) docker(['rm', '-f', container], undefined, true);
  };
  process.once('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  try {
    docker([
      'run',
      '-d',
      '--rm',
      '--name',
      container,
      '-e',
      'POSTGRES_PASSWORD=proposal',
      '-e',
      'POSTGRES_DB=zhili_proposal',
      postgresImage,
    ]);
    started = true;

    let ready = false;
    let consecutiveReadyChecks = 0;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = docker(
        ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'zhili_proposal'],
        undefined,
        true,
      );
      if (result.status === 0) {
        consecutiveReadyChecks += 1;
        if (consecutiveReadyChecks >= 3) {
          ready = true;
          break;
        }
      } else {
        consecutiveReadyChecks = 0;
      }
      await sleep(250);
    }
    if (!ready) throw new Error('PostgreSQL 17 container did not become ready');

    psql(readFileSync(foundationPath, 'utf8'));
    psql(`
CREATE TABLE tenants (id text PRIMARY KEY);
CREATE TABLE customers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT
);
CREATE TABLE customer_addresses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id) ON DELETE RESTRICT
);
CREATE TABLE devices (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT
);
CREATE TABLE warehouses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT
);
CREATE TABLE waybills (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT
);
CREATE TABLE waybill_packages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  waybill_id text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, waybill_id) REFERENCES waybills (tenant_id, id) ON DELETE CASCADE
);
`);
    psql(sql);

    psql(`
DO $$
DECLARE
  table_name text;
  missing_count integer;
  tenant_tables constant text[] := ARRAY[
    'warehouse_scans', 'warehouse_receipts', 'warehouse_measurements', 'warehouse_media',
    'inventory_balances', 'inventory_ledger_entries', 'route_decisions', 'load_units',
    'load_unit_items', 'linehaul_bookings', 'bills_of_lading', 'fba_deliveries',
    'delivery_tasks', 'delivery_task_events', 'pod_records', 'pod_versions',
    'device_sync_sessions', 'device_event_receipts', 'device_event_media_claims',
    'device_sync_conflicts', 'print_jobs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    SELECT count(*) INTO missing_count
    FROM pg_class
    WHERE oid = table_name::regclass AND relrowsecurity AND relforcerowsecurity;
    IF missing_count <> 1 THEN RAISE EXCEPTION '% lacks forced RLS', table_name; END IF;

    SELECT count(*) INTO missing_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND roles = ARRAY['zhili_app']::name[]
      AND qual LIKE '%current_setting(''app.tenant_id''::text, true)%'
      AND with_check LIKE '%current_setting(''app.tenant_id''::text, true)%';
    IF missing_count <> 1 THEN RAISE EXCEPTION '% lacks the foundation RLS policy', table_name; END IF;
  END LOOP;

  SELECT count(*) INTO missing_count
  FROM pg_constraint c
  JOIN pg_class child ON child.oid = c.conrelid
  WHERE c.contype = 'f'
    AND child.relname = ANY (tenant_tables)
    AND c.confdeltype NOT IN ('r', 'c');
  IF missing_count <> 0 THEN RAISE EXCEPTION '% FKs lack explicit delete behavior', missing_count; END IF;
END
$$;
`);

    psql(`
INSERT INTO tenants VALUES ('t1'), ('t2');
INSERT INTO customers VALUES ('customer-1', 't1'), ('customer-2', 't1');
INSERT INTO customer_addresses VALUES
  ('address-1', 't1', 'customer-1'),
  ('address-2', 't1', 'customer-2');
INSERT INTO devices VALUES ('device-1', 't1'), ('device-2', 't2');
INSERT INTO warehouses VALUES
  ('warehouse-1', 't1'), ('warehouse-2', 't1'), ('warehouse-3', 't2');
INSERT INTO waybills VALUES ('waybill-1', 't1'), ('waybill-2', 't1');
INSERT INTO waybill_packages VALUES
  ('package-1', 't1', 'waybill-1'),
  ('package-2', 't1', 'waybill-1'),
  ('package-other', 't1', 'waybill-2');
`);

    const scanReplay = (candidateId) => psql(`
WITH attempted AS (
  INSERT INTO warehouse_scans (
    id, tenant_id, warehouse_id, device_id, client_event_id, scan_code, scan_kind, occurred_at
  ) VALUES (
    '${candidateId}', 't1', 'warehouse-1', 'device-1', 'scan-event-1', 'WB-1', 'RECEIVE', now()
  )
  ON CONFLICT (tenant_id, device_id, client_event_id) DO NOTHING
  RETURNING id
), stable AS (
  SELECT id, 'APPLIED'::text AS disposition FROM attempted
  UNION ALL
  SELECT id, 'DUPLICATE'::text FROM warehouse_scans
  WHERE tenant_id = 't1' AND device_id = 'device-1' AND client_event_id = 'scan-event-1'
  LIMIT 1
)
SELECT id || '|' || disposition FROM stable;
`).stdout.trim();
    const firstScan = scanReplay('scan-original');
    const replayedScan = scanReplay('scan-replay');
    if (firstScan !== 'scan-original|APPLIED' || replayedScan !== 'scan-original|DUPLICATE') {
      failures.push(`scan replay did not return a stable result: ${firstScan} / ${replayedScan}`);
    }

    psql(`
INSERT INTO device_sync_sessions (
  id, tenant_id, device_id, warehouse_id, binding_version, expires_at
) VALUES ('session-1', 't1', 'device-1', 'warehouse-1', 1, now() + interval '1 hour');
`);
    const eventReplay = (candidateId) => psql(`
WITH attempted AS (
  INSERT INTO device_event_receipts (
    id, tenant_id, session_id, device_id, warehouse_id, event_id, local_sequence,
    event_type, aggregate_type, aggregate_id, disposition, server_version, payload, occurred_at
  ) VALUES (
    '${candidateId}', 't1', 'session-1', 'device-1', 'warehouse-1', 'event-1', 1,
    'RECEIVE', 'WAYBILL', 'waybill-1', 'APPLIED', 7, '{}'::jsonb, now()
  )
  ON CONFLICT (tenant_id, device_id, event_id) DO NOTHING
  RETURNING id, server_version
), stable AS (
  SELECT id, server_version, 'APPLIED'::text AS disposition FROM attempted
  UNION ALL
  SELECT id, server_version, 'DUPLICATE'::text FROM device_event_receipts
  WHERE tenant_id = 't1' AND device_id = 'device-1' AND event_id = 'event-1'
  LIMIT 1
)
SELECT id || '|' || disposition || '|' || server_version FROM stable;
`).stdout.trim();
    const firstEvent = eventReplay('event-receipt-original');
    const replayedEvent = eventReplay('event-receipt-replay');
    if (
      firstEvent !== 'event-receipt-original|APPLIED|7' ||
      replayedEvent !== 'event-receipt-original|DUPLICATE|7'
    ) {
      failures.push(`device replay did not return a stable result: ${firstEvent} / ${replayedEvent}`);
    }

    expectRejected(
      'direct SEALED load insert',
      `INSERT INTO load_units (
        id, tenant_id, load_unit_no, origin_warehouse_id, destination_warehouse_id,
        status, version, sealed_at
      ) VALUES (
        'load-direct-sealed', 't1', 'LOAD-DIRECT-SEALED', 'warehouse-1', 'warehouse-2',
        'SEALED', 1, now()
      );`,
      'load units must be inserted as DRAFT',
    );
    expectRejected(
      'direct DISPATCHED load insert',
      `INSERT INTO load_units (
        id, tenant_id, load_unit_no, origin_warehouse_id, destination_warehouse_id,
        status, version, sealed_at, dispatched_at
      ) VALUES (
        'load-direct-dispatched', 't1', 'LOAD-DIRECT-DISPATCHED', 'warehouse-1', 'warehouse-2',
        'DISPATCHED', 2, now(), now()
      );`,
      'load units must be inserted as DRAFT',
    );

    expectRejected(
      'inventory package/waybill mismatch',
      `INSERT INTO inventory_balances (
        id, tenant_id, warehouse_id, waybill_id, package_id, stock_state
      ) VALUES ('inventory-mismatch', 't1', 'warehouse-1', 'waybill-1', 'package-other', 'RECEIVED');`,
      'package does not belong to waybill',
    );
    psql(`
INSERT INTO load_units (
  id, tenant_id, load_unit_no, origin_warehouse_id, destination_warehouse_id
) VALUES ('load-pair', 't1', 'LOAD-PAIR', 'warehouse-1', 'warehouse-2');
`);
    expectRejected(
      'load item package/waybill mismatch',
      `INSERT INTO load_unit_items (
        id, tenant_id, load_unit_id, waybill_id, package_id, item_sequence
      ) VALUES ('item-mismatch', 't1', 'load-pair', 'waybill-1', 'package-other', 1);`,
      'package does not belong to waybill',
    );
    expectRejected(
      'delivery customer/address mismatch',
      `INSERT INTO delivery_tasks (
        id, tenant_id, task_no, waybill_id, customer_id, destination_address_id
      ) VALUES (
        'delivery-mismatch', 't1', 'DELIVERY-MISMATCH', 'waybill-1', 'customer-1', 'address-2'
      );`,
      'address does not belong to customer',
    );

    psql(`
INSERT INTO delivery_tasks (
  id, tenant_id, task_no, waybill_id, customer_id, destination_address_id
) VALUES
  ('delivery-1', 't1', 'DELIVERY-1', 'waybill-1', 'customer-1', 'address-1'),
  ('delivery-2', 't1', 'DELIVERY-2', 'waybill-1', 'customer-1', 'address-1');
BEGIN;
INSERT INTO pod_records (
  id, tenant_id, pod_no, delivery_task_id, captured_at
) VALUES ('pod-1', 't1', 'POD-1', 'delivery-1', now());
INSERT INTO pod_versions (
  id, tenant_id, pod_record_id, pod_version, recipient_name, payload, captured_at
) VALUES ('pod-1-v1', 't1', 'pod-1', 1, 'Receiver 1', '{}'::jsonb, now());
COMMIT;
BEGIN;
INSERT INTO pod_records (
  id, tenant_id, pod_no, delivery_task_id, captured_at
) VALUES ('pod-2', 't1', 'POD-2', 'delivery-2', now());
INSERT INTO pod_versions (
  id, tenant_id, pod_record_id, pod_version, recipient_name, payload, captured_at
) VALUES ('pod-2-v1', 't1', 'pod-2', 1, 'Receiver 2', '{}'::jsonb, now());
COMMIT;
`);
    expectRejected(
      'cross-record POD supersedes link',
      `INSERT INTO pod_versions (
        id, tenant_id, pod_record_id, pod_version, recipient_name,
        amendment_reason, supersedes_version_id, payload, captured_at
      ) VALUES (
        'pod-1-v2-cross', 't1', 'pod-1', 2, 'Receiver 1',
        'cross record', 'pod-2-v1', '{}'::jsonb, now()
      );`,
      'pod_versions_supersedes_fk',
    );
    expectRejected(
      'skipped POD supersedes link',
      `INSERT INTO pod_versions (
        id, tenant_id, pod_record_id, pod_version, recipient_name,
        amendment_reason, supersedes_version_id, payload, captured_at
      ) VALUES (
        'pod-1-v3-skip', 't1', 'pod-1', 3, 'Receiver 1',
        'skip version', 'pod-1-v1', '{}'::jsonb, now()
      );`,
      'pod_versions_supersedes_fk',
    );
    psql(`
BEGIN;
INSERT INTO pod_versions (
  id, tenant_id, pod_record_id, pod_version, recipient_name,
  amendment_reason, supersedes_version_id, payload, captured_at
) VALUES (
  'pod-1-v2', 't1', 'pod-1', 2, 'Receiver 1',
  'valid amendment', 'pod-1-v1', '{}'::jsonb, now()
);
UPDATE pod_records SET current_version = 2, status = 'AMENDED' WHERE id = 'pod-1';
COMMIT;
`);

    psql(`
INSERT INTO load_units (
  id, tenant_id, load_unit_no, origin_warehouse_id, destination_warehouse_id
) VALUES
  ('load-race-insert', 't1', 'LOAD-RACE-INSERT', 'warehouse-1', 'warehouse-2'),
  ('load-race-delete', 't1', 'LOAD-RACE-DELETE', 'warehouse-1', 'warehouse-2'),
  ('load-race-move-old', 't1', 'LOAD-RACE-MOVE-OLD', 'warehouse-1', 'warehouse-2'),
  ('load-race-move-new', 't1', 'LOAD-RACE-MOVE-NEW', 'warehouse-1', 'warehouse-2');
INSERT INTO load_unit_items (
  id, tenant_id, load_unit_id, waybill_id, package_id, item_sequence
) VALUES
  ('item-race-insert-base', 't1', 'load-race-insert', 'waybill-1', 'package-1', 1),
  ('item-race-delete', 't1', 'load-race-delete', 'waybill-1', 'package-1', 1),
  ('item-race-move', 't1', 'load-race-move-old', 'waybill-1', 'package-1', 1),
  ('item-race-move-new-base', 't1', 'load-race-move-new', 'waybill-1', 'package-2', 1);
`);
    await expectSealRaceRejected(
      'seal versus insert',
      'load-race-insert',
      `INSERT INTO load_unit_items (
        id, tenant_id, load_unit_id, waybill_id, package_id, item_sequence
      ) VALUES ('item-race-insert-new', 't1', 'load-race-insert', 'waybill-1', 'package-2', 2);`,
    );
    await expectSealRaceRejected(
      'seal versus delete',
      'load-race-delete',
      `DELETE FROM load_unit_items WHERE tenant_id = 't1' AND id = 'item-race-delete';`,
    );
    await expectSealRaceRejected(
      'seal versus move',
      'load-race-move-old',
      `UPDATE load_unit_items
       SET load_unit_id = 'load-race-move-new', item_sequence = 2
       WHERE tenant_id = 't1' AND id = 'item-race-move';`,
    );

    const rlsResult = psql(`
SET ROLE zhili_app;
SELECT set_config('app.tenant_id', 't1', false);
SELECT count(*) FROM warehouse_scans;
SELECT set_config('app.tenant_id', 't2', false);
SELECT count(*) FROM warehouse_scans;
RESET ROLE;
`).stdout
      .trim()
      .split('\n')
      .filter((line) => /^\d+$/.test(line));
    if (rlsResult.at(-2) !== '1' || rlsResult.at(-1) !== '0') {
      failures.push(`RLS visibility expected 1/0, got ${rlsResult.join('/')}`);
    }

    if (failures.length > 0) {
      console.error(`FAIL: ${failures.length} PostgreSQL semantic contract violation(s)`);
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `PASS: PostgreSQL 17 warehouse proposal (${requiredTables.length} RLS tables; replay, POD, pairing, state and seal races verified)`,
    );
  } finally {
    cleanup();
  }
}
