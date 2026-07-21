export * from './master-data/model/master-data';
export * from './master-data/ui/master-data-panel';
export * from './session/adapters/api/session-api';
export * from './session/model/session';
export * from './session/ui/login-shell';

export const featurePackage = {
  id: 'identity-masterdata',
  name: '身份、租户、组织、客户与权限',
  status: 'implemented',
} as const;
