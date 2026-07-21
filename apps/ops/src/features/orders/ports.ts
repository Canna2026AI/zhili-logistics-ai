import { memoryMasterDataPort, type MasterDataPort } from '@zhili/feature-identity-masterdata';
import {
  memoryQuotePort,
  memoryRateCatalogPort,
  type QuotePort,
  type RateCatalogPort,
} from '@zhili/feature-rates-routing';
import {
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
