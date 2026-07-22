import type { ZhiliApiClient } from '@zhili/api-client';
import {
  createMasterDataApi,
  memoryMasterDataPort,
  type MasterDataPort,
} from '@zhili/feature-identity-masterdata';
import {
  createQuoteApi,
  createRateCatalogApi,
  memoryQuotePort,
  memoryRateCatalogPort,
  type QuotePort,
  type RateCatalogPort,
} from '@zhili/feature-rates-routing';
import {
  createImportApi,
  createOrderApi,
  createWaybillApi,
  memoryImportPort,
  memoryOrderPort,
  memoryWaybillPort,
  type ImportPort,
  type OrderPort,
  type WaybillPort,
} from '@zhili/feature-waybills';

export interface OpsOrdersPorts {
  masterData: MasterDataPort;
  rates: RateCatalogPort;
  quotes: QuotePort;
  orders: OrderPort;
  imports: ImportPort;
  waybills: WaybillPort;
}

export const defaultOpsOrdersPorts: OpsOrdersPorts = {
  masterData: memoryMasterDataPort,
  rates: memoryRateCatalogPort,
  quotes: memoryQuotePort,
  orders: memoryOrderPort,
  imports: memoryImportPort,
  waybills: memoryWaybillPort,
};

export function createApiOpsOrdersPorts(client: ZhiliApiClient): OpsOrdersPorts {
  return {
    masterData: createMasterDataApi(client),
    rates: createRateCatalogApi(client),
    quotes: createQuoteApi(client),
    orders: createOrderApi(client),
    imports: createImportApi(client),
    waybills: createWaybillApi(client),
  };
}
