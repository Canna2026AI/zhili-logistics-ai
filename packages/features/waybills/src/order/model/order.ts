import type { components } from '@zhili/contracts';

export type OrderType = components['schemas']['CreateOrderDraftRequest']['orderType'];
export type OrderRequest = components['schemas']['CreateOrderDraftRequest'];
export type OrderResult = components['schemas']['Order'];
export type OrderValidation = components['schemas']['OrderValidation'];

export interface OrderPort {
  save(request: OrderRequest): Promise<OrderResult>;
  validate(orderId: string, version: number): Promise<OrderValidation>;
  copy(orderId: string, version: number): Promise<OrderResult>;
  submit(orderId: string, version: number): Promise<OrderResult>;
}

export const memoryOrderPort: OrderPort = {
  async save() {
    return { id: 'order-1', orderNo: 'ORD-DRAFT-0268', status: 'DRAFT', version: 1 };
  },
  async validate() {
    return { valid: true, items: [] };
  },
  async copy() {
    return { id: 'order-copy-1', orderNo: 'ORD-DRAFT-0269', status: 'DRAFT', version: 1 };
  },
  async submit(orderId, version) {
    return { id: orderId, orderNo: 'ORD-DRAFT-0268', status: 'SUBMITTED', version: version + 1 };
  },
};

export function buildOrderRequest(
  orderType: OrderType
): components['schemas']['CreateOrderDraftRequest'] {
  return {
    orderType,
    customerId: 'customer-xinyuan',
    origin: {
      countryCode: 'CN',
      city: '深圳',
      line1: '宝安区西乡街道建源路 2001 号',
      postalCode: '518102',
    },
    destination: {
      countryCode: 'US',
      state: 'CA',
      city: 'Los Angeles',
      line1: '123 Harbor Ave',
      postalCode: '90001',
    },
    packages: [
      {
        packageRef: 'PKG-01',
        weightKg: '122.00',
        lengthCm: '100',
        widthCm: '80',
        heightCm: '60',
        commodityDescription: orderType === 'FBA' ? 'Amazon FBA 电子产品及配件' : '电子产品及配件',
      },
    ],
  };
}
