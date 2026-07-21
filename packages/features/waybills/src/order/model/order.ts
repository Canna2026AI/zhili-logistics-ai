import type { components } from '@zhili/contracts';

export type OrderType = components['schemas']['CreateOrderDraftRequest']['orderType'];

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
