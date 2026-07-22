import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = readFileSync(
  resolve(packageRoot, "openapi/zhili.openapi.yaml"),
  "utf8",
);
const flowMap = JSON.parse(
  readFileSync(resolve(packageRoot, "core-flow-operation-map.json"), "utf8"),
) as Record<string, string[]>;
const traceability = readFileSync(
  resolve(packageRoot, "../../docs/00-product/feature-traceability.md"),
  "utf8",
);

function splitReferences(value: string): string[] {
  return value
    .split("/")
    .map((reference) => reference.replaceAll("`", "").trim())
    .filter((reference) => reference !== "" && reference !== "—");
}

function parseOperationContracts(source: string) {
  const operations = new Map<
    string,
    { features: Set<string>; permissions: Set<string> }
  >();
  const operationBlock =
    /^    (?:get|post|put|patch|delete):\n([\s\S]*?)(?=^    (?:get|post|put|patch|delete):\n|^  \/|^components:)/gm;

  for (const match of source.matchAll(operationBlock)) {
    const block = match[0];
    const operationId = block.match(/^      operationId:\s+(\S+)$/m)?.[1];
    if (!operationId) continue;

    const features = new Set(
      [...block.matchAll(/^      x-feature-id:\s+(\S+)$/gm)].map(
        (featureMatch) => featureMatch[1],
      ),
    );
    const featureList = block.match(/^      x-feature-ids:\s+\[([^\]]+)\]$/m);
    if (featureList) {
      for (const feature of featureList[1].split(",")) {
        features.add(feature.trim());
      }
    }

    const permissions = new Set(
      [...block.matchAll(/^      x-permission:\s+(\S+)$/gm)].map(
        (permissionMatch) => permissionMatch[1],
      ),
    );
    const permissionList = block.match(
      /^      x-permissions:\s+\[([^\]]+)\]$/m,
    );
    if (permissionList) {
      for (const permission of permissionList[1].split(",")) {
        permissions.add(permission.trim());
      }
    }
    operations.set(operationId, { features, permissions });
  }

  return operations;
}

function operationBlock(operationId: string): string {
  const start = contract.indexOf(`      operationId: ${operationId}`);
  if (start === -1) return "";
  const end = contract.indexOf("\n  /", start);
  return contract.slice(start, end === -1 ? undefined : end);
}

describe("OpenAPI UI-foundation gate", () => {
  it("covers every operation used by the ten core flows", () => {
    const operationIds = new Set(
      [...contract.matchAll(/^\s+operationId:\s+(\S+)$/gm)].map(
        (match) => match[1],
      ),
    );

    for (const [flowId, requiredOperations] of Object.entries(flowMap)) {
      for (const operationId of requiredOperations) {
        expect(operationIds, `${flowId} is missing ${operationId}`).toContain(
          operationId,
        );
      }
    }
  });

  it("defines actionable error and concurrency contracts", () => {
    for (const field of [
      "code",
      "message",
      "details",
      "remediation",
      "requestId",
    ]) {
      expect(contract).toContain(field);
    }
    expect(contract).toContain("Idempotency-Key");
    expect(contract).toContain("If-Match");
    expect(contract).toContain("STATE_TRANSITION_NOT_ALLOWED");
    expect(contract).toContain("STALE_VERSION");
  });

  it("lets PDA clients fetch a conflict snapshot and its own strong ETag before resolution", () => {
    expect(contract).toContain("operationId: getDeviceConflict");
    expect(contract).toContain("description: Strong ETag for the conflict resource version.");
    expect(contract).toContain("required: [id, localEvent, serverVersion, serverState, differences, status, version]");
    expect(contract).toContain("conflictVersion: {type: integer, minimum: 1}");
    expect(contract).toContain("ConflictFieldDifference:");
  });

  it("returns server-owned PDA tenant, permissions and task versions", () => {
    expect(contract).toContain(
      "required: [deviceId, tenantId, warehouseId, subjectId, permissions, expiresAt]",
    );
    expect(contract).toContain(
      "required: [id, type, reference, status, priority, version]",
    );
  });

  it("defines palletized as a canonical last-mile task transition", () => {
    expect(contract).toContain("DeliveryTaskStatus:");
    expect(contract).toContain(
      "enum: [PLANNED, PALLETIZED, LOADED, OUT_FOR_DELIVERY, COMPLETED, EXCEPTION]",
    );
    expect(contract).toContain(
      "PLANNED -> PALLETIZED -> LOADED -> OUT_FOR_DELIVERY -> COMPLETED",
    );
    expect(contract).toContain(
      "PLANNED, PALLETIZED, LOADED, OUT_FOR_DELIVERY and COMPLETED may each transition to EXCEPTION",
    );
    expect(contract).toContain(
      "required: [deviceEventId, targetStatus, occurredAt, mediaRefs, scanEvidence]",
    );
  });

  it("makes online last-mile transition and POD receipts server-authoritative", () => {
    const transition = operationBlock("updateDeliveryTaskStatus");
    const pod = operationBlock("captureProofOfDelivery");

    expect(transition).toContain(
      "$ref: '#/components/schemas/DeliveryTaskTransitionResponse'",
    );
    expect(pod).toContain(
      "$ref: '#/components/schemas/ProofOfDeliveryCaptureResponse'",
    );
    expect(contract).toContain(
      "required: [deviceEventId, disposition, deliveryTask, claimedMediaRefs]",
    );
    expect(contract).toContain(
      "required: [deviceEventId, disposition, deliveryTask, proofOfDelivery, claimedMediaRefs]",
    );
    expect(contract).toContain(
      "required: [deviceEventId, recipientName, signedAt, evidenceRefs]",
    );
    expect(contract).toContain(
      "Only this authoritative deliveryTask status and version may update or clear client state",
    );
  });

  it("models device media as scoped reservations claimed by an applied device event", () => {
    expect(contract).toContain(
      "required: [mediaId, eventId, scope, status, objectRef, expiresAt]",
    );
    expect(contract).toContain(
      "enum: [UPLOADED, SCANNING, READY, REJECTED]",
    );
    expect(contract).toContain(
      "READY only after an atomic transition or POD claim, or after device event sync returns APPLIED or DUPLICATE",
    );
  });

  it("authorizes and receives only encrypted PDA takeover exports", () => {
    const authorize = operationBlock("authorizeDeviceTakeoverExport");
    const upload = operationBlock("uploadEncryptedDeviceTakeoverExport");

    for (const operation of [authorize, upload]) {
      expect(operation).toContain("x-feature-id: PDA-04");
      expect(operation).toContain("x-permission: pda.takeover.export");
      expect(operation).toContain("x-audit-event:");
      expect(operation).toContain("#/components/parameters/IdempotencyKey");
      expect(operation).toContain("#/components/responses/Forbidden");
      expect(operation).toContain("#/components/responses/ValidationFailed");
    }

    expect(contract).toContain(
      "required: [authorizationId, deviceId, scope, manifestHash, eventCount, mediaCount, expiresAt, keyEncryptionAlgorithm, contentEncryptionAlgorithm, publicKeyJwk, maxCiphertextBytes, status]",
    );
    expect(contract).toContain("enum: [RSA-OAEP-256]");
    expect(contract).toContain("enum: [A256GCM]");
    expect(contract).toContain(
      "required: [manifestHash, ciphertextHash, ciphertext, iv, wrappedKey]",
    );
    expect(contract).toContain(
      "required: [exportId, authorizationId, deviceId, scope, manifestHash, ciphertextHash, eventCount, mediaCount, checksumAlgorithm, status, receivedAt]",
    );
    expect(contract).toContain("enum: [RECEIVED, VERIFIED, REJECTED]");
  });

  it("has generated TypeScript path types", () => {
    const generatedPath = resolve(packageRoot, "src/generated/api.d.ts");
    expect(existsSync(generatedPath)).toBe(true);
    expect(readFileSync(generatedPath, "utf8")).toContain(
      "export interface paths",
    );
  });

  it("generates dedicated authoritative PDA receipt and takeover types", () => {
    const generated = readFileSync(
      resolve(packageRoot, "src/generated/api.d.ts"),
      "utf8",
    );

    for (const schemaName of [
      "DeliveryTaskStatus",
      "DeliveryTaskTransitionReceipt",
      "DeliveryTaskTransitionResponse",
      "ProofOfDeliveryCaptureReceipt",
      "ProofOfDeliveryCaptureResponse",
      "DeviceTakeoverExportAuthorization",
      "DeviceTakeoverExportReceipt",
    ]) {
      expect(generated).toContain(`${schemaName}:`);
    }
    expect(generated).toContain("| 'PALLETIZED'");
    expect(generated).toContain(
      "deviceEventId: components['schemas']['Ulid'];",
    );
    expect(generated).toContain(
      "deliveryTask: components['schemas']['DeliveryTask'];",
    );
    expect(generated).toContain(
      "publicKeyJwk: components['schemas']['RsaOaepPublicJwk'];",
    );
  });

  it("uses one executable canonical fixture with valid arithmetic", () => {
    const fixturePath = resolve(
      packageRoot,
      "../testing/fixtures/canonical.json",
    );
    expect(existsSync(fixturePath)).toBe(true);
    if (!existsSync(fixturePath)) return;

    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const waybill = fixture.waybill;
    expect(waybill.actualWeightKg - waybill.expectedWeightKg).toBeCloseTo(
      waybill.weightDifferenceKg,
    );
    expect(
      (waybill.lengthCm * waybill.widthCm * waybill.heightCm) /
        waybill.volumetricDivisor,
    ).toBeCloseTo(waybill.volumetricWeightKg);
    expect(
      Math.max(waybill.actualWeightKg, waybill.volumetricWeightKg),
    ).toBeCloseTo(waybill.chargeableWeightKg);

    const quoteLineTotal = fixture.quote.lines.reduce(
      (total: number, line: { amount: number }) => total + line.amount,
      0,
    );
    expect(quoteLineTotal).toBeCloseTo(fixture.quote.total.amount);
    expect(fixture.quote.total.amount - fixture.quote.cost.amount).toBeCloseTo(
      fixture.quote.grossProfit.amount,
    );
    expect(
      fixture.statement.total.amount - fixture.statement.allocated.amount,
    ).toBeCloseTo(fixture.statement.outstanding.amount);
  });

  it("maps every core flow branch to an API or client action and error code", () => {
    const stateMapPath = resolve(packageRoot, "core-flow-state-map.json");
    expect(existsSync(stateMapPath)).toBe(true);
    if (!existsSync(stateMapPath)) return;

    const stateMap = JSON.parse(readFileSync(stateMapPath, "utf8")) as Record<
      string,
      Record<string, { source: string; action: string; errorCode?: string }>
    >;

    for (const flowId of Object.keys(flowMap)) {
      expect(stateMap).toHaveProperty(flowId);
      for (const [stateId, mapping] of Object.entries(stateMap[flowId])) {
        expect(stateId.startsWith(`${flowId}-`)).toBe(true);
        expect(["api", "client"]).toContain(mapping.source);
        if (mapping.source === "api") {
          expect(flowMap[flowId]).toContain(mapping.action);
        } else {
          expect(mapping.action.startsWith("clientAction:")).toBe(true);
        }
        if (mapping.errorCode) {
          expect(contract).toContain(mapping.errorCode);
        }
      }
    }
  });

  it("closes every P0 traceability reference against OpenAPI", () => {
    const schemaSection = contract.slice(contract.indexOf("\n  schemas:\n"));
    const operationContracts = parseOperationContracts(contract);
    const operationIds = new Set(
      [...contract.matchAll(/^\s+operationId:\s+(\S+)$/gm)].map(
        (match) => match[1],
      ),
    );
    const schemas = new Set(
      [...schemaSection.matchAll(/^    ([A-Za-z][A-Za-z0-9]+):$/gm)].map(
        (match) => match[1],
      ),
    );
    const permissions = new Set(
      [...contract.matchAll(/^\s+x-permission:\s+(\S+)$/gm)].map(
        (match) => match[1],
      ),
    );
    const featureIds = new Set(
      [...contract.matchAll(/^\s+x-feature-id:\s+(\S+)$/gm)].map(
        (match) => match[1],
      ),
    );

    const rows = traceability
      .split("\n")
      .filter((line) => /^\| [A-Z]+-[0-9]+ \|/.test(line))
      .map((line) =>
        line
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim()),
      )
      .filter((cells) => cells[1] === "P0");

    for (const cells of rows) {
      const [featureId, , , , , operationCell, schemaCell, permissionCell] =
        cells;
      const operations = splitReferences(operationCell);

      for (const schema of splitReferences(schemaCell)) {
        expect(schemas, `${featureId} is missing schema ${schema}`).toContain(
          schema,
        );
      }

      if (operations.length === 0) continue;

      expect(featureIds, `${featureId} has no x-feature-id`).toContain(
        featureId,
      );
      for (const operationId of operations) {
        expect(
          operationIds,
          `${featureId} is missing operationId ${operationId}`,
        ).toContain(operationId);
        expect(
          operationContracts.get(operationId)?.features,
          `${operationId} is not assigned to ${featureId}`,
        ).toContain(featureId);
      }
      for (const permission of splitReferences(permissionCell)) {
        if (["public", "session.active"].includes(permission)) continue;
        expect(
          permissions,
          `${featureId} is missing permission ${permission}`,
        ).toContain(permission);
        expect(
          new Set(
            operations.flatMap((operationId) => [
              ...(operationContracts.get(operationId)?.permissions ?? []),
            ]),
          ),
          `${featureId} operations do not enforce ${permission}`,
        ).toContain(permission);
      }
    }
  });
});
