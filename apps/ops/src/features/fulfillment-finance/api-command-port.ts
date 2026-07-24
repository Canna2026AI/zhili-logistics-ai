import { DomainApiError, toDomainApiError, type ZhiliApiClient } from '@zhili/api-client';
import type { paths } from '../../../../../packages/contracts/src';
import type {
  FulfillmentFinanceCommand,
  FulfillmentFinanceCommandEvidence,
  FulfillmentFinanceCommandPort,
  FulfillmentFinanceOperationId,
} from './fulfillment-finance-workbench';

type ApiPath = keyof paths;

interface ApiRoute {
  method: 'GET' | 'POST';
  path: ApiPath;
  pathParam?: string;
}

/**
 * Exhaustive command-to-contract routing table. Adding a workbench command without
 * registering its generated-client endpoint is a compile-time error.
 */
export const fulfillmentFinanceApiRoutes = {
  receiveScan: { method: 'POST', path: '/warehouse/scans:receive' },
  recordMeasurement: {
    method: 'POST',
    path: '/warehouse/receipts/{receiptId}/measurements',
    pathParam: 'receiptId',
  },
  attachReceiptMedia: {
    method: 'POST',
    path: '/warehouse/receipts/{receiptId}/media',
    pathParam: 'receiptId',
  },
  confirmReceipt: {
    method: 'POST',
    path: '/warehouse/receipts/{receiptId}:confirm',
    pathParam: 'receiptId',
  },
  undoReceipt: {
    method: 'POST',
    path: '/warehouse/receipts/{receiptId}:undo',
    pathParam: 'receiptId',
  },
  routeWaybill: {
    method: 'POST',
    path: '/warehouse/waybills/{waybillId}:route',
    pathParam: 'waybillId',
  },
  moveInventory: { method: 'POST', path: '/warehouse/inventory:move' },
  commitStocktake: { method: 'POST', path: '/warehouse/stocktakes:commit' },
  attachWaybills: {
    method: 'POST',
    path: '/linehaul/load-units/{loadUnitId}:attach-waybills',
    pathParam: 'loadUnitId',
  },
  createLoadUnit: { method: 'POST', path: '/linehaul/load-units' },
  sealLoadUnit: {
    method: 'POST',
    path: '/linehaul/load-units/{loadUnitId}:seal',
    pathParam: 'loadUnitId',
  },
  dispatchLoadUnit: {
    method: 'POST',
    path: '/linehaul/load-units/{loadUnitId}:dispatch',
    pathParam: 'loadUnitId',
  },
  createPrintJob: { method: 'POST', path: '/documents/print-jobs' },
  reprintDocument: { method: 'POST', path: '/documents/print-jobs:reprint' },
  createBooking: { method: 'POST', path: '/linehaul/bookings' },
  validateLoadCompatibility: {
    method: 'POST',
    path: '/linehaul/load-compatibility:validate',
  },
  captureProofOfDelivery: {
    method: 'POST',
    path: '/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery',
    pathParam: 'deliveryTaskId',
  },
  createBillOfLading: { method: 'POST', path: '/linehaul/bills-of-lading' },
  linkFbaShipment: { method: 'POST', path: '/linehaul/fba-shipment-links' },
  syncLastMilePartner: { method: 'POST', path: '/last-mile/partners:sync' },
  replayPartnerEvent: { method: 'POST', path: '/last-mile/partner-events:replay' },
  generateLastMileCharges: { method: 'POST', path: '/last-mile/charges:generate' },
  createLastMileIntake: { method: 'POST', path: '/last-mile/intakes' },
  scanLastMileIntake: {
    method: 'POST',
    path: '/last-mile/intakes/{intakeId}:scan',
    pathParam: 'intakeId',
  },
  createDeliveryTask: { method: 'POST', path: '/last-mile/delivery-tasks' },
  updateDeliveryTaskStatus: {
    method: 'POST',
    path: '/last-mile/delivery-tasks/{deliveryTaskId}:transition',
    pathParam: 'deliveryTaskId',
  },
  amendProofOfDelivery: {
    method: 'POST',
    path: '/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery:amend',
    pathParam: 'deliveryTaskId',
  },
  ingestTrackingEvent: { method: 'POST', path: '/tracking/events:ingest' },
  appendManualTrackingEvent: { method: 'POST', path: '/tracking/events:manual' },
  detectTrackingStall: { method: 'POST', path: '/tracking/stalls:detect' },
  createIssue: { method: 'POST', path: '/issues' },
  assignIssue: {
    method: 'POST',
    path: '/issues/{issueId}:assign',
    pathParam: 'issueId',
  },
  requestIssueMaterial: {
    method: 'POST',
    path: '/issues/{issueId}/material-requests',
    pathParam: 'issueId',
  },
  resolveIssue: {
    method: 'POST',
    path: '/issues/{issueId}:resolve',
    pathParam: 'issueId',
  },
  createClaim: { method: 'POST', path: '/claims' },
  settleClaim: {
    method: 'POST',
    path: '/claims/{claimId}:settle',
    pathParam: 'claimId',
  },
  placeShipmentHold: { method: 'POST', path: '/shipment-holds' },
  releaseShipmentHold: {
    method: 'POST',
    path: '/shipment-holds/{holdId}:release',
    pathParam: 'holdId',
  },
  requestShipmentHoldReleaseApproval: {
    method: 'POST',
    path: '/shipment-holds/{holdId}:request-release-approval',
    pathParam: 'holdId',
  },
  generateCharges: { method: 'POST', path: '/finance/charges:generate' },
  reviewCharge: {
    method: 'POST',
    path: '/finance/charges/{chargeId}:review',
    pathParam: 'chargeId',
  },
  unreviewCharge: {
    method: 'POST',
    path: '/finance/charges/{chargeId}:unreview',
    pathParam: 'chargeId',
  },
  adjustCharge: {
    method: 'POST',
    path: '/finance/charges/{chargeId}:adjust',
    pathParam: 'chargeId',
  },
  createPayableImport: { method: 'POST', path: '/finance/payable-imports' },
  validatePayableImport: {
    method: 'POST',
    path: '/finance/payable-imports/{payableImportId}:validate',
    pathParam: 'payableImportId',
  },
  commitPayableImport: {
    method: 'POST',
    path: '/finance/payable-imports/{payableImportId}:commit',
    pathParam: 'payableImportId',
  },
  reconcilePayables: { method: 'POST', path: '/finance/payables:reconcile' },
  createStatement: { method: 'POST', path: '/finance/statements' },
  sendStatement: {
    method: 'POST',
    path: '/finance/statements/{statementId}:send',
    pathParam: 'statementId',
  },
  openStatementDispute: {
    method: 'POST',
    path: '/finance/statements/{statementId}/disputes',
    pathParam: 'statementId',
  },
  recordReceipt: { method: 'POST', path: '/finance/receipts' },
  createDisbursement: { method: 'POST', path: '/finance/disbursements' },
  allocateReceipt: {
    method: 'POST',
    path: '/finance/receipts/{receiptId}:allocate',
    pathParam: 'receiptId',
  },
  allocateDisbursement: {
    method: 'POST',
    path: '/finance/disbursements/{disbursementId}:allocate',
    pathParam: 'disbursementId',
  },
  reverseAllocation: {
    method: 'POST',
    path: '/finance/allocations/{allocationId}:reverse',
    pathParam: 'allocationId',
  },
  publishExchangeRateSet: {
    method: 'POST',
    path: '/finance/exchange-rate-sets:publish',
  },
  allocateCharges: { method: 'POST', path: '/finance/charges:allocate' },
  getProfitTrace: {
    method: 'GET',
    path: '/finance/profit-traces/{waybillId}',
    pathParam: 'waybillId',
  },
  closeFinancialPeriod: {
    method: 'POST',
    path: '/finance/periods/{periodId}:close',
    pathParam: 'periodId',
  },
  reopenFinancialPeriod: {
    method: 'POST',
    path: '/finance/periods/{periodId}:reopen',
    pathParam: 'periodId',
  },
  createInvoiceRequest: { method: 'POST', path: '/finance/invoice-requests' },
  reviewInvoiceRequest: {
    method: 'POST',
    path: '/finance/invoice-requests/{invoiceRequestId}:review',
    pathParam: 'invoiceRequestId',
  },
  createPrepaymentOrder: { method: 'POST', path: '/payments/prepayment-orders' },
  createStatementPaymentOrder: { method: 'POST', path: '/payments/statement-orders' },
  closePaymentOrder: {
    method: 'POST',
    path: '/payments/{paymentOrderId}:close',
    pathParam: 'paymentOrderId',
  },
  createPaymentRefund: {
    method: 'POST',
    path: '/payments/{paymentOrderId}/refunds',
    pathParam: 'paymentOrderId',
  },
  reconcilePayments: { method: 'POST', path: '/payments/reconciliations' },
  queryBusinessReport: { method: 'POST', path: '/reports/business:query' },
  retryNotificationDelivery: {
    method: 'POST',
    path: '/notification-deliveries/{deliveryId}:retry',
    pathParam: 'deliveryId',
  },
} as const satisfies Record<FulfillmentFinanceOperationId, ApiRoute>;

interface ApiCallResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}

interface ApiCallOptions {
  params: {
    path?: Record<string, string>;
    query?: Record<string, unknown>;
    header?: Record<string, string>;
  };
  body?: Record<string, unknown>;
}

type ApiCall = (path: ApiPath, options: ApiCallOptions) => Promise<ApiCallResult>;

function recordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function serverResource(data: unknown): { id: string; version?: number } | undefined {
  if (typeof data !== 'object' || !data) return undefined;
  const envelope = data as Record<string, unknown>;
  const nested = envelope.data;
  const source =
    typeof nested === 'object' && nested ? (nested as Record<string, unknown>) : envelope;
  const id = recordString(source, 'resourceId') ?? recordString(source, 'id');
  if (!id) return undefined;
  const version = source.version;
  return {
    id,
    ...(typeof version === 'number' && Number.isInteger(version) ? { version } : {}),
  };
}

function serverEvidence(
  data: unknown,
  response: Response
): FulfillmentFinanceCommandEvidence | undefined {
  if (typeof data === 'object' && data) {
    const envelope = data as Record<string, unknown>;
    const result = envelope.data;
    const resultRecord =
      typeof result === 'object' && result ? (result as Record<string, unknown>) : undefined;
    const auditId =
      recordString(envelope, 'auditEventId') ??
      recordString(envelope, 'auditId') ??
      (resultRecord
        ? (recordString(resultRecord, 'auditEventId') ?? recordString(resultRecord, 'auditId'))
        : undefined);
    if (auditId) return { kind: 'audit', auditId };

    const meta = envelope.meta;
    if (typeof meta === 'object' && meta) {
      const metaRequestId = recordString(meta as Record<string, unknown>, 'requestId');
      if (metaRequestId) return { kind: 'trace', requestId: metaRequestId };
    }
    const requestId =
      recordString(envelope, 'requestId') ??
      (resultRecord ? recordString(resultRecord, 'requestId') : undefined) ??
      response.headers.get('x-request-id') ??
      undefined;
    if (requestId) return { kind: 'trace', requestId };

    const resourceId =
      recordString(envelope, 'resourceId') ??
      recordString(envelope, 'id') ??
      (resultRecord
        ? (recordString(resultRecord, 'resourceId') ?? recordString(resultRecord, 'id'))
        : undefined);
    if (resourceId) return { kind: 'resource', resourceId };
  }
  const requestId = response.headers.get('x-request-id');
  return requestId ? { kind: 'trace', requestId } : undefined;
}

/** Production adapter: every workbench mutation crosses the generated OpenAPI client. */
export function createApiFulfillmentFinanceCommandPort(
  client: ZhiliApiClient
): FulfillmentFinanceCommandPort {
  const post = client.POST as unknown as ApiCall;
  const get = client.GET as unknown as ApiCall;

  return {
    async execute(command: FulfillmentFinanceCommand) {
      const route: ApiRoute = fulfillmentFinanceApiRoutes[command.operationId];
      const path = route.pathParam ? { [route.pathParam]: command.entityRef } : undefined;
      const header: Record<string, string> = {};
      if (route.method === 'POST') header['Idempotency-Key'] = command.idempotencyKey;
      if (command.expectedVersion !== undefined) {
        header['If-Match'] = `"${command.expectedVersion}"`;
      }

      const result =
        route.method === 'GET'
          ? await get(route.path, { params: { path, header } })
          : await post(route.path, {
              params: { path, header },
              body:
                command.operationId === 'unreviewCharge' && command.expectedVersion !== undefined
                  ? { ...command.payload, version: command.expectedVersion }
                  : (command.payload ?? {}),
            });

      if (result.error) throw toDomainApiError(result.error, result.response);
      const evidence = serverEvidence(result.data, result.response);
      if (!evidence) throw new Error('API 响应缺少审计、请求追踪或资源证据');
      const resource = route.method === 'POST' ? serverResource(result.data) : undefined;
      if (
        resource?.id === command.entityRef &&
        command.expectedVersion !== undefined &&
        (resource.version === undefined || resource.version <= command.expectedVersion)
      ) {
        throw new DomainApiError('服务端资源版本未推进', {
          code: 'FULFILLMENT_VERSION_NOT_ADVANCED',
          details: {
            resourceId: resource.id,
            previousVersion: command.expectedVersion,
            returnedVersion: resource.version,
          },
        });
      }
      return {
        evidence,
        ...(resource?.id === command.entityRef && resource.version !== undefined
          ? { resource: { id: resource.id, version: resource.version } }
          : {}),
      };
    },
  };
}
