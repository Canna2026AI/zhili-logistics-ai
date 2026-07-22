import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');

async function readOrEmpty(path: string): Promise<string> {
  return readFile(resolve(packageRoot, path), 'utf8').catch(() => '');
}

describe('B1 persistence alignment migration contract', () => {
  it('adds every normalized aggregate required by the three P0 audits', async () => {
    const sql = await readOrEmpty('migrations/0002_b1_persistence_alignment.sql');
    const requiredTables = [
      // Identity and access.
      'user_organization_memberships',
      'partner_contacts',
      'reauthentication_grants',
      'login_throttle_buckets',
      // Rates, orders and waybills.
      'shipment_restriction_rules',
      'order_package_snapshots',
      'accepted_quote_order_links',
      'waybill_lineage',
      'waybill_number_history',
      'label_jobs',
      'declaration_attachments',
      'transaction_command_contexts',
      // Warehouse and fulfillment.
      'warehouse_location_inventory',
      'warehouse_location_inventory_ledger',
      'warehouse_stocktakes',
      'warehouse_stocktake_items',
      'load_unit_waybills',
      'bill_of_lading_waybills',
      'fba_shipment_links',
      'fba_shipment_cartons',
      'last_mile_intakes',
      'last_mile_intake_expected_waybills',
      'last_mile_intake_scans',
      'delivery_task_waybills',
      'device_media_reservations',
      'partner_event_receipts',
      'partner_event_replay_attempts',
      'last_mile_charge_generations',
      'last_mile_charge_generation_tasks',
      'pod_version_media',
    ];

    for (const table of requiredTables) {
      expect(sql, `missing normalized table ${table}`).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('preserves every audited request field as a typed column or normalized relation', async () => {
    const sql = await readOrEmpty('migrations/0002_b1_persistence_alignment.sql');
    const requiredColumns = [
      // Identity.
      'default_timezone',
      'default_currency',
      'mobile',
      'settlement_currency',
      'address_label',
      'is_default',
      'contact_name',
      'contact_phone',
      'version_label',
      'publish_reason',
      'credit_tier',
      'payment_cycle_days',
      'hold_on_exceed',
      'change_reason',
      'quota_map',
      'is_enabled',
      'replacement_version',
      'created_by_actor_tenant_id',
      'created_by_actor_subject_id',
      // Rates/orders/import.
      'transport_mode',
      'price_type',
      'zone_code',
      'effective_from',
      'effective_until',
      'rounding_mode',
      'minimum_charge_minor',
      'rule_code',
      'charge_code',
      'accepted_quote_version',
      'insured',
      'insured_value_minor',
      'atomicity',
      'mapping_version',
      'validation_version',
      'source_file_ref',
      // Fulfillment/PDA.
      'station_code',
      'device_event_id',
      'measured_at',
      'load_unit_type',
      'seal_no',
      'origin_port',
      'destination_port',
      'planned_departure_at',
      'bill_type',
      'parent_bill_of_lading_id',
      'executor_type',
      'executor_id',
      'planned_start_at',
      'planned_end_at',
      'subject_id',
      'resolved_by_subject_id',
      'resolution_reason',
      'claimed_media_refs',
    ];

    for (const column of requiredColumns) {
      expect(sql, `missing audited column ${column}`).toMatch(
        new RegExp(`(?:ADD COLUMN|\\"${column}\\")`)
      );
    }
  });

  it('installs least-privilege opaque refresh and login-throttle capabilities', async () => {
    const sql = await readOrEmpty('migrations/0002_b1_persistence_alignment.sql');

    expect(sql).toContain('auth_lookup_refresh_token');
    expect(sql).toContain('auth_consume_login_throttle');
    expect(sql).toMatch(/SECURITY DEFINER/g);
    expect(sql).toMatch(/SET search_path = pg_catalog, public/g);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC/g);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO zhili_auth/g);
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON ALL TABLES TO zhili_auth/);
  });

  it('installs the remaining pre-tenant OAuth and audited platform capabilities', async () => {
    const sql = await readOrEmpty('migrations/0002_b1_persistence_alignment.sql');

    expect(sql).toContain('auth_resolve_tenant');
    expect(sql).toContain('auth_lookup_oauth_state');
    expect(sql).toContain('control_plane_create_tenant');
    expect(sql).toContain('p_default_timezone text');
    expect(sql).toContain('p_default_currency text');
    expect(sql).toContain('control_plane_start_impersonation');
    expect(sql).toContain('control_plane_end_impersonation');
    expect(sql).toContain("'platform.impersonate'");
  });

  it('ships an explicit 0002-only down migration and records a snapshot', async () => {
    const [down, journal, snapshot] = await Promise.all([
      readOrEmpty('migrations/down/0002_b1_persistence_alignment.down.sql'),
      readOrEmpty('migrations/meta/_journal.json'),
      readOrEmpty('migrations/meta/0002_snapshot.json'),
    ]);

    expect(down).not.toBe('');
    expect(down).not.toMatch(/DROP SCHEMA/i);
    expect(down).not.toMatch(/DROP TABLE IF EXISTS "?(?:tenants|orders|waybills)"?/i);
    expect(journal).toContain('0002_b1_persistence_alignment');
    expect(snapshot).toContain('public.user_organization_memberships');
    expect(snapshot).toContain('public.last_mile_charge_generations');
  });
});
