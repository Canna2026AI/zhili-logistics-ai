export * from './catalog/model/catalog';
export * from './catalog/ui/rate-catalog-panel';
export * from './quote/adapters/api/quote-api';
export * from './quote/model/quote';
export * from './quote/ui/quote-workbench';

export const featurePackage = {
  id: 'rates-routing',
  name: '渠道、价卡、规则、报价与路由',
  status: 'implemented',
} as const;
