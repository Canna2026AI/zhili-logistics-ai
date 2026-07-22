import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const PERMISSIONS_METADATA_KEY = 'zhili:permissions';
export const PUBLIC_ROUTE_METADATA_KEY = 'zhili:public-route';

export function RequirePermissions(...permissions: string[]): CustomDecorator<string> {
  return SetMetadata(PERMISSIONS_METADATA_KEY, Object.freeze([...permissions]));
}

export function PublicRoute(): CustomDecorator<string> {
  return SetMetadata(PUBLIC_ROUTE_METADATA_KEY, true);
}
