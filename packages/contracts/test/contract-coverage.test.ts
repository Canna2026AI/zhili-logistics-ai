import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { components as GeneratedComponents } from "../src/index.js";
import {
  preconditionFailedSchema,
  validatePreconditionFailed,
} from "./precondition-schema.js";

type GeneratedPreconditionBody =
  GeneratedComponents["responses"]["PreconditionFailed"]["content"]["application/problem+json"];

const preconditionBodies = (
  ["PRECONDITION_REQUIRED", "PRECONDITION_INVALID", "STALE_VERSION"] as const
).map((code) => ({
  code,
  message: `Precondition failed: ${code}`,
  details: [{ field: "If-Match", reason: code }],
  remediation: "Refresh and retry with the latest strong ETag.",
  requestId: "req-precondition-schema",
})) satisfies GeneratedPreconditionBody[];

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = readFileSync(
  resolve(packageRoot, "openapi/zhili.openapi.yaml"),
  "utf8",
);
const openapi = parse(contract) as {
  components: { schemas: Record<string, Record<string, unknown>> };
};
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

function schemaBlock(schemaName: string): string {
  const start = contract.indexOf(`    ${schemaName}:`);
  if (start === -1) return "";
  const remainder = contract.slice(start + 5);
  const next = remainder.search(/^    [A-Za-z][A-Za-z0-9]+:/m);
  return contract.slice(start, next === -1 ? undefined : start + 5 + next);
}

describe("Backend B1 hardened operation contracts", () => {
  const explicitRequests = {
    updateTenantEntitlements: "UpdateTenantEntitlementsRequest",
    startWechatLogin: "StartWechatLoginRequest",
    completeWechatLogin: "CompleteWechatLoginRequest",
    reauthenticate: "ReauthenticateCurrentSessionRequest",
    previewFieldPolicy: "PreviewFieldPolicyRequest",
    upsertOrganizationNode: "UpsertOrganizationNodeRequest",
    upsertUser: "UpsertUserRequest",
    upsertCustomerAddress: "UpsertCustomerAddressRequest",
    upsertPartner: "UpsertPartnerRequest",
    publishReferenceDataVersion: "PublishReferenceDataVersionRequest",
    updateCustomerCreditPolicy: "UpdateCustomerCreditPolicyRequest",
    upsertChannelProduct: "UpsertChannelProductRequest",
    publishRateCard: "PublishRateCardRequest",
    upsertRatePriceVersion: "UpsertRatePriceVersionRequest",
    upsertSurchargeRule: "UpsertSurchargeRuleRequest",
    validateShipmentRestrictions: "ValidateShipmentRestrictionsRequest",
    copyOrder: "CopyOrderRequest",
    rollbackImportBatch: "RollbackImportBatchRequest",
    upsertWaybillPackages: "UpsertWaybillPackagesRequest",
    updateWaybillDeclaration: "UpdateWaybillDeclarationRequest",
    createLabelJob: "CreateLabelJobRequest",
    cancelWaybill: "CancelWaybillRequest",
    renumberWaybill: "RenumberWaybillRequest",
    splitWaybill: "SplitWaybillRequest",
    mergeWaybills: "MergeWaybillsRequest",
    batchWaybillCommand: "BatchWaybillCommandRequest",
    recordMeasurement: "RecordMeasurementRequest",
    attachReceiptMedia: "AttachReceiptMediaRequest",
    undoReceipt: "UndoReceiptRequest",
    moveInventory: "MoveInventoryRequest",
    commitStocktake: "CommitStocktakeRequest",
    createPrintJob: "CreatePrintJobRequest",
    reprintDocument: "ReprintDocumentRequest",
    validateLoadCompatibility: "ValidateLoadCompatibilityRequest",
    linkFbaShipment: "LinkFbaShipmentRequest",
    scanLastMileIntake: "ScanLastMileIntakeRequest",
    updateDeliveryTaskStatus: "UpdateDeliveryTaskStatusRequest",
    amendProofOfDelivery: "AmendProofOfDeliveryRequest",
    syncLastMilePartner: "SyncLastMilePartnerRequest",
    replayPartnerEvent: "ReplayPartnerEventRequest",
    generateLastMileCharges: "GenerateLastMileChargesRequest",
  } as const;

  it("uses closed, operation-specific request schemas for every B1 placeholder command", () => {
    for (const [operationId, schemaName] of Object.entries(explicitRequests)) {
      const operation = operationBlock(operationId);
      expect(operation, `${operationId} operation`).toContain(
        `$ref: '#/components/schemas/${schemaName}'`,
      );
      expect(operation, `${operationId} must not accept DomainRecord`).not.toContain(
        "$ref: '#/components/schemas/DomainRecord'",
      );
      const schema = schemaBlock(schemaName);
      const variants = [
        ...schema.matchAll(/#\/components\/schemas\/([A-Za-z0-9]+)/g),
      ].map((match) => match[1]);
      if (/^    [A-Za-z0-9]+:\n      oneOf:/m.test(schema)) {
        for (const variant of variants) {
          expect(schemaBlock(variant!), `${variant} schema`).toContain(
            "additionalProperties: false",
          );
          expect(schemaBlock(variant!), `${variant} required fields`).toContain(
            "required:",
          );
        }
      } else {
        expect(schema, `${schemaName} schema`).toContain(
          "additionalProperties: false",
        );
        expect(schema, `${schemaName} required fields`).toContain("required:");
      }
    }
  });

  it("separates OAuth start and callback and never returns a PKCE verifier", () => {
    const start = operationBlock("startWechatLogin");
    const callback = operationBlock("completeWechatLogin");
    expect(start).toContain("#/components/schemas/WechatAuthorizationResponse");
    expect(callback).toContain("#/components/schemas/SessionResponse");
    expect(schemaBlock("WechatAuthorization")).not.toMatch(/verifier/i);
    expect(schemaBlock("StartWechatLoginRequest")).not.toMatch(/verifier/i);
    expect(schemaBlock("CompleteWechatLoginRequest")).not.toMatch(/verifier/i);
  });

  it("models reauthentication as a credential or challenge proof", () => {
    const schema = schemaBlock("ReauthenticateCurrentSessionRequest");
    expect(schema).toContain("oneOf:");
    expect(schema).toContain("ReauthenticateWithPasswordRequest");
    expect(schema).toContain("ReauthenticateWithChallengeRequest");
    expect(operationBlock("reauthenticate")).not.toContain(
      "#/components/schemas/Session'",
    );
  });

  it("keeps field-policy preview read-only and returns a preview projection", () => {
    const preview = operationBlock("previewFieldPolicy");
    expect(preview).not.toContain("x-audit-event:");
    expect(preview).not.toContain("#/components/parameters/IdempotencyKey");
    expect(preview).not.toContain("#/components/responses/StaleVersion");
    expect(preview).toContain("#/components/schemas/FieldPolicyPreviewResponse");
  });

  it("documents create versus update preconditions for UI-compatible upserts", () => {
    for (const operationId of [
      "upsertOrganizationNode",
      "upsertUser",
      "upsertCustomerAddress",
      "upsertPartner",
      "upsertChannelProduct",
      "upsertRatePriceVersion",
      "upsertSurchargeRule",
    ]) {
      const operation = operationBlock(operationId);
      expect(operation).toContain("#/components/parameters/OptionalIfMatch");
      expect(operation).toMatch(
        /CREATE forbids If-Match; UPDATE requires\s+a\s+strong If-Match/,
      );
    }
  });

  it("links an accepted quote to an order and returns the created waybill identity", () => {
    const link = operationBlock("linkAcceptedQuoteToOrder");
    expect(link).toContain("#/components/schemas/LinkAcceptedQuoteToOrderRequest");
    expect(link).toContain("#/components/schemas/AcceptedQuoteOrderLinkResponse");
    const result = schemaBlock("AcceptedQuoteOrderLink");
    for (const field of [
      "quoteId",
      "quoteOptionId",
      "orderId",
      "waybillId",
      "orderVersion",
      "waybillVersion",
    ]) {
      expect(result).toContain(field);
    }
  });

  it("provides cursor lists and detail reads for every B1 workbench", () => {
    const reads = {
      listQuotes: "QuoteListResponse",
      getQuote: "QuoteResponse",
      listOrders: "OrderListResponse",
      getOrder: "OrderResponse",
      listWaybills: "WaybillListResponse",
      getWaybill: "WaybillResponse",
      listImports: "ImportJobListResponse",
      getImportJob: "ImportJobResponse",
      listWarehouseReceipts: "WarehouseReceiptListResponse",
      getWarehouseReceipt: "WarehouseReceiptResponse",
      listLoadUnits: "LoadUnitListResponse",
      getLoadUnit: "LoadUnitResponse",
      listBookings: "BookingListResponse",
      getBooking: "BookingResponse",
      listLastMileIntakes: "LastMileIntakeListResponse",
      getLastMileIntake: "LastMileIntakeResponse",
      listDeliveryTasks: "DeliveryTaskListResponse",
      getDeliveryTask: "DeliveryTaskResponse",
    } as const;
    for (const [operationId, responseSchema] of Object.entries(reads)) {
      const operation = operationBlock(operationId);
      expect(operation, `${operationId} response`).toContain(
        `#/components/schemas/${responseSchema}`,
      );
      if (operationId.startsWith("list")) {
        expect(operation, `${operationId} cursor`).toContain(
          "#/components/parameters/Cursor",
        );
        expect(operation, `${operationId} limit`).toContain(
          "#/components/parameters/Limit",
        );
      }
    }
    const deviceTasks = operationBlock("getDeviceTasks");
    expect(deviceTasks).toContain("#/components/parameters/Cursor");
    expect(deviceTasks).toContain("#/components/parameters/Limit");
  });

  it("exposes the operational waybill detail used by Ops without fixture fields", () => {
    const waybill = schemaBlock("Waybill");
    for (const field of [
      "masterNo",
      "customerName",
      "customerCode",
      "contactName",
      "senderPhone",
      "recipientPhone",
      "consigneeAddress",
      "route",
      "service",
      "transport",
      "forecastWeightKg",
      "actualWeightKg",
      "volumeM3",
      "pieces",
      "createdAt",
      "branch",
      "timeline",
    ]) {
      expect(waybill).toContain(field);
    }
  });

  it("returns ETags and 412 precondition errors for B1 versioned writes", () => {
    for (const operationId of [
      "updateTenantEntitlements",
      "upsertOrganizationNode",
      "upsertUser",
      "upsertCustomerAddress",
      "upsertPartner",
      "publishReferenceDataVersion",
      "updateCustomerCreditPolicy",
      "acceptQuote",
      "linkAcceptedQuoteToOrder",
      "validateOrder",
      "submitOrder",
      "submitWaybill",
      "confirmReceipt",
      "recordMeasurement",
      "routeWaybill",
      "resolveDeviceConflict",
      "attachWaybills",
      "sealLoadUnit",
      "dispatchLoadUnit",
      "updateDeliveryTaskStatus",
      "captureProofOfDelivery",
      "validateImportRows",
      "commitImport",
      "upsertChannelProduct",
      "publishRateCard",
      "upsertRatePriceVersion",
      "upsertSurchargeRule",
      "copyOrder",
      "rollbackImportBatch",
      "upsertWaybillPackages",
      "updateWaybillDeclaration",
      "createLabelJob",
      "cancelWaybill",
      "renumberWaybill",
      "attachReceiptMedia",
      "undoReceipt",
      "moveInventory",
      "commitStocktake",
      "createPrintJob",
      "reprintDocument",
      "linkFbaShipment",
      "scanLastMileIntake",
      "amendProofOfDelivery",
      "syncLastMilePartner",
      "replayPartnerEvent",
      "generateLastMileCharges",
    ]) {
      const operation = operationBlock(operationId);
      expect(operation, `${operationId} ETag`).toMatch(
        /#\/components\/(?:responses\/[A-Za-z]+WithEtag|schemas\/[A-Za-z]+Response|responses\/CommandSucceeded)/i,
      );
      expect(operation, `${operationId} precondition`).toContain(
        "#/components/responses/PreconditionFailed",
      );
    }
    expect(schemaBlock("PreconditionProblemCode")).toContain("PRECONDITION_REQUIRED");
    expect(schemaBlock("PreconditionProblemCode")).toContain("STALE_VERSION");
  });

  it("models ORD-08 concurrency and outcomes per input aggregate", () => {
    const batch = operationBlock("batchWaybillCommand");
    expect(batch).not.toContain("#/components/parameters/IfMatch");
    expect(batch).toContain("#/components/schemas/WaybillBatchCommandResponse");
    expect(batch).not.toContain("#/components/responses/CommandSucceeded");
    expect(batch).toMatch(/preserv(?:e|es|ing)[^\n]*input order/i);

    const request = schemaBlock("BatchWaybillCommandRequest");
    expect(request).toContain("items:");
    expect(request).toContain("#/components/schemas/WaybillVersionPrecondition");
    expect(request).not.toContain("waybillIds:");
    expect(schemaBlock("WaybillVersionPrecondition")).toMatch(
      /required:\s*\[waybillId, expectedVersion\]/,
    );

    const outcome = schemaBlock("WaybillBatchOutcome");
    expect(outcome).toContain("oneOf:");
    expect(outcome).toContain("WaybillBatchSucceededOutcome");
    expect(outcome).toContain("WaybillBatchFailedOutcome");
    expect(schemaBlock("WaybillBatchSucceededOutcome")).toMatch(
      /required:\s*\[waybillId, disposition, latestVersion\]/,
    );
    expect(schemaBlock("WaybillBatchFailedOutcome")).toMatch(
      /required:\s*\[waybillId, disposition, latestVersion, error\]/,
    );

    for (const [operationId, responseSchema] of [
      ["splitWaybill", "WaybillSplitResponse"],
      ["mergeWaybills", "WaybillMergeResponse"],
    ] as const) {
      const operation = operationBlock(operationId);
      expect(operation).not.toContain("#/components/parameters/IfMatch");
      expect(operation).not.toContain("#/components/responses/CommandSucceeded");
      expect(operation).toContain(`#/components/schemas/${responseSchema}`);
      expect(operation).not.toContain("ETag:");
    }
    expect(schemaBlock("SplitWaybillRequest")).toMatch(
      /required:\s*\[waybillId, expectedVersion, packageRefs, reason\]/,
    );
    expect(schemaBlock("MergeWaybillsRequest")).toContain(
      "#/components/schemas/WaybillVersionPrecondition",
    );
    expect(schemaBlock("WaybillSplitResult")).toContain("children:");
    expect(schemaBlock("WaybillMergeResult")).toContain("sources:");
  });

  it("returns actionable validation results and complete rate-rule semantics", () => {
    expect(operationBlock("validateShipmentRestrictions")).toContain(
      "#/components/schemas/ShipmentRestrictionValidationResponse",
    );
    expect(operationBlock("validateLoadCompatibility")).toContain(
      "#/components/schemas/LoadCompatibilityValidationResponse",
    );
    for (const schemaName of [
      "ShipmentRestrictionValidationResult",
      "LoadCompatibilityValidationResult",
    ]) {
      const schema = schemaBlock(schemaName);
      expect(schema).toContain("failedRules:");
      expect(schema).toContain("warnings:");
      expect(schema).toContain("alternatives:");
    }
    expect(schemaBlock("ShipmentRestrictionValidationResult")).toContain(
      "available:",
    );
    expect(schemaBlock("LoadCompatibilityValidationResult")).toContain(
      "compatible:",
    );

    const priceCreate = schemaBlock("CreateRatePriceVersionRequest");
    for (const field of [
      "scope:",
      "weightRange:",
      "calculation:",
      "measurement:",
      "effectiveFrom:",
      "effectiveUntil:",
    ]) {
      expect(priceCreate, field).toContain(field);
    }
    const surchargeCreate = schemaBlock("CreateSurchargeRuleRequest");
    for (const field of ["scope:", "weightRange:", "calculation:", "measurement:"]) {
      expect(surchargeCreate, field).toContain(field);
    }
    const calculation = schemaBlock("RateCalculationInput");
    expect(calculation).toContain("FlatRateCalculationInput");
    expect(calculation).toContain("PerKgRateCalculationInput");
    expect(calculation).toContain("PercentageRateCalculationInput");
    expect(schemaBlock("FlatRateCalculationInput")).toMatch(
      /required:\s*\[method, amountMinor, currency\]/,
    );
    expect(schemaBlock("PerKgRateCalculationInput")).toMatch(
      /required:\s*\[method, amountMinor, currency\]/,
    );
    expect(schemaBlock("PercentageRateCalculationInput")).toMatch(
      /required:\s*\[method, percentageBps\]/,
    );
    expect(schemaBlock("PercentageRateCalculationInput")).not.toContain("currency:");
  });

  it("uses closed CREATE and UPDATE variants with machine-readable header rules", () => {
    const upserts = {
      upsertOrganizationNode: "OrganizationNode",
      upsertUser: "User",
      upsertCustomerAddress: "CustomerAddress",
      upsertPartner: "Partner",
      upsertChannelProduct: "ChannelProduct",
      upsertRatePriceVersion: "RatePriceVersion",
      upsertSurchargeRule: "SurchargeRule",
    } as const;
    for (const [operationId, resource] of Object.entries(upserts)) {
      const operation = operationBlock(operationId);
      expect(operation, `${operationId} machine rule`).toContain(
        "x-upsert-precondition:",
      );
      expect(operation).toMatch(/CREATE:\s*\n\s+ifMatch: FORBIDDEN/);
      expect(operation).toMatch(/UPDATE:\s*\n\s+ifMatch: REQUIRED/);

      const request = schemaBlock(`Upsert${resource}Request`);
      expect(request).toContain("oneOf:");
      expect(request).toContain(`Create${resource}Request`);
      expect(request).toContain(`Update${resource}Request`);
      expect(request).toContain("propertyName: mode");
      expect(request).toContain(
        `CREATE: '#/components/schemas/Create${resource}Request'`,
      );
      expect(request).toContain(
        `UPDATE: '#/components/schemas/Update${resource}Request'`,
      );

      const create = schemaBlock(`Create${resource}Request`);
      const update = schemaBlock(`Update${resource}Request`);
      expect(create).toContain("mode: {type: string, const: CREATE}");
      expect(create).not.toContain("id:");
      expect(update).toContain("mode: {type: string, const: UPDATE}");
      expect(update).toMatch(/required:\s*\[[^\]]*id[^\]]*\]/);
    }
  });

  it("binds accepted quote, link, order and waybill versions atomically", () => {
    const operation = operationBlock("linkAcceptedQuoteToOrder");
    expect(operation).toContain("#/components/responses/AcceptedQuoteLinkNotFound");
    expect(operation).toContain("#/components/responses/Expired");
    expect(operation).toMatch(/ETag[^\n]*order aggregate/i);
    expect(operation).toMatch(/atomically/i);
    expect(operation).toContain("#/components/parameters/IdempotencyKey");

    expect(schemaBlock("LinkAcceptedQuoteToOrderRequest")).toMatch(
      /required:\s*\[quoteId, quoteOptionId, acceptedQuoteVersion\]/,
    );
    const result = schemaBlock("AcceptedQuoteOrderLink");
    expect(result).toMatch(
      /required:\s*\[quoteId, quoteOptionId, quoteVersion, linkId, linkVersion, orderId, orderVersion, waybillId, waybillVersion\]/,
    );
  });

  it("binds every workbench cursor to filters, snapshot and immutable ordering", () => {
    const listFilters = {
      listQuotes: ["QuoteStatusFilter", "CustomerIdFilter", "CreatedFrom", "CreatedTo", "Search"],
      listOrders: ["OrderStatusFilter", "CustomerIdFilter", "CreatedFrom", "CreatedTo", "Search"],
      listWaybills: ["WaybillStateFilter", "CustomerIdFilter", "WarehouseIdFilter", "StationCodeFilter", "CreatedFrom", "CreatedTo", "Search"],
      listImports: ["ImportStatusFilter", "CreatedFrom", "CreatedTo", "Search"],
      listWarehouseReceipts: ["WarehouseReceiptStatusFilter", "CustomerIdFilter", "WarehouseIdFilter", "StationCodeFilter", "ReceivedFrom", "ReceivedTo", "Search"],
      listLoadUnits: ["LoadUnitStatusFilter", "WarehouseIdFilter", "StationCodeFilter", "DispatchFrom", "DispatchTo", "Search"],
      listBookings: ["BookingStatusFilter", "StationCodeFilter", "DepartureFrom", "DepartureTo", "Search"],
      listLastMileIntakes: ["LastMileIntakeStatusFilter", "WarehouseIdFilter", "StationCodeFilter", "IntakeFrom", "IntakeTo", "Search"],
      listDeliveryTasks: ["DeliveryTaskStatusFilter", "CustomerIdFilter", "StationCodeFilter", "ScheduledFrom", "ScheduledTo", "Search"],
    } as const;
    for (const [operationId, filters] of Object.entries(listFilters)) {
      const operation = operationBlock(operationId);
      for (const filter of filters) {
        expect(operation, `${operationId} ${filter}`).toContain(
          `#/components/parameters/${filter}`,
        );
      }
      expect(operation).toContain("x-stable-cursor:");
      expect(operation).toContain("filterHash: REQUIRED");
      expect(operation).toContain("snapshot: asOf");
      expect(operation).toContain("order:");
      expect(operation).toContain("#/components/responses/CursorFilterMismatch");
    }
    const cursor = schemaBlock("OpaqueCursor");
    expect(cursor).toContain("minLength:");
    expect(cursor).toContain("maxLength:");
    expect(cursor).toContain("pattern:");
    const pageMeta = schemaBlock("CursorPageMeta");
    expect(pageMeta).toMatch(
      /required:\s*\[requestId, nextCursor, asOf, filterHash, order\]/,
    );
    for (const response of [
      "QuoteListResponse",
      "OrderListResponse",
      "WaybillListResponse",
      "ImportJobListResponse",
      "WarehouseReceiptListResponse",
      "LoadUnitListResponse",
      "BookingListResponse",
      "LastMileIntakeListResponse",
      "DeliveryTaskListResponse",
    ]) {
      expect(schemaBlock(response)).toContain("#/components/schemas/CursorPageMeta");
    }
  });

  it("projects Waybill PII with reusable READ MASK and DENY decisions", () => {
    const waybill = schemaBlock("Waybill");
    for (const field of [
      "customerName",
      "customerCode",
      "contactName",
      "senderPhone",
      "recipientPhone",
      "consigneeAddress",
    ]) {
      expect(waybill).toContain(`${field}: {$ref: '#/components/schemas/SecuredTextProjection'}`);
    }
    const secured = schemaBlock("SecuredTextProjection");
    for (const variant of [
      "ReadSecuredTextProjection",
      "MaskedSecuredTextProjection",
      "DeniedSecuredTextProjection",
    ]) {
      expect(secured).toContain(variant);
      expect(schemaBlock(variant)).toContain("additionalProperties: false");
    }
    expect(schemaBlock("ReadSecuredTextProjection")).toContain("rawValue:");
    expect(schemaBlock("MaskedSecuredTextProjection")).not.toContain("rawValue:");
    expect(schemaBlock("DeniedSecuredTextProjection")).toContain(
      "copyAllowed: {type: boolean, const: false}",
    );
    expect(schemaBlock("DeniedSecuredTextProjection")).toContain(
      "exportAllowed: {type: boolean, const: false}",
    );
  });

  it("makes secured Waybill PII combinations machine-valid or machine-invalid", () => {
    const schemas = openapi.components.schemas;
    const secured = schemas.SecuredTextProjection;
    expect(secured).toBeDefined();
    const oneOf = secured?.oneOf as Array<{ $ref: string }>;
    const projectionSchema = {
      oneOf: oneOf.map(({ $ref }) => schemas[$ref.split("/").at(-1)!]),
    };
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      projectionSchema,
    );

    for (const valid of [
      {
        access: "READ",
        rawValue: "CUST-001",
        displayValue: "CUST-001",
        copyAllowed: true,
        exportAllowed: true,
      },
      {
        access: "MASK",
        displayValue: "CUST-***",
        copyAllowed: false,
        exportAllowed: false,
      },
      { access: "DENY", copyAllowed: false, exportAllowed: false },
    ]) {
      expect(validate(valid), JSON.stringify(validate.errors)).toBe(true);
    }

    for (const invalid of [
      {
        access: "DENY",
        rawValue: "CUST-001",
        copyAllowed: false,
        exportAllowed: false,
      },
      {
        access: "DENY",
        copyAllowed: true,
        exportAllowed: false,
      },
      {
        access: "DENY",
        copyAllowed: false,
        exportAllowed: true,
      },
      {
        access: "MASK",
        rawValue: "CUST-001",
        displayValue: "CUST-***",
        copyAllowed: false,
        exportAllowed: false,
      },
    ]) {
      expect(validate(invalid), JSON.stringify(invalid)).toBe(false);
    }

    const waybill = schemas.Waybill;
    const properties = waybill?.properties as Record<
      string,
      { $ref?: string }
    >;
    for (const field of [
      "customerName",
      "customerCode",
      "contactName",
      "senderPhone",
      "recipientPhone",
      "consigneeAddress",
    ]) {
      expect(properties[field]?.$ref).toBe(
        "#/components/schemas/SecuredTextProjection",
      );
    }
    expect(waybill?.required).toEqual(
      expect.arrayContaining([
        "customerName",
        "customerCode",
        "contactName",
        "senderPhone",
        "recipientPhone",
        "consigneeAddress",
      ]),
    );
    expect(properties.fieldPolicy).toBeUndefined();
    expect(properties.contactPhone).toBeUndefined();
  });

  it("does not advertise stale versions for stateless validation", () => {
    for (const operationId of [
      "validateShipmentRestrictions",
      "validateLoadCompatibility",
    ]) {
      const operation = operationBlock(operationId);
      expect(operation).not.toContain("#/components/responses/StaleVersion");
      expect(operation).not.toContain("409:");
      expect(operation).not.toContain("'409':");
    }
  });

  it("validates every precondition code against the fully dereferenced 412 schema", () => {
    expect(JSON.stringify(preconditionFailedSchema)).not.toContain('"$ref"');
    for (const body of preconditionBodies) {
      expect(validatePreconditionFailed(body), JSON.stringify(validatePreconditionFailed.errors)).toBe(
        true,
      );
    }
    expect(
      validatePreconditionFailed({
        ...preconditionBodies[0],
        code: "VALIDATION_FAILED",
      }),
    ).toBe(false);
  });

  it("requires authoritative operation-specific responses instead of generic acknowledgements", () => {
    const responses = {
      publishRateCard: "RateCardPublicationResponse",
      copyOrder: "OrderResponse",
      submitOrder: "OrderResponse",
      createLabelJob: "LabelJobCreatedResponse",
      renumberWaybill: "WaybillRenumberResponse",
      changeTenantStatus: "TenantResponse",
      updateTenantEntitlements: "TenantEntitlementsResponse",
    } as const;
    for (const [operationId, response] of Object.entries(responses)) {
      const operation = operationBlock(operationId);
      expect(operation).toContain(`#/components/schemas/${response}`);
      expect(operation).not.toContain("#/components/responses/CommandSucceeded");
    }
    expect(operationBlock("changeTenantStatus")).toContain(
      "#/components/schemas/ChangeTenantStatusRequest",
    );
  });
});

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
