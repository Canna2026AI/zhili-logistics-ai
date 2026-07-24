import type { components } from '@zhili/contracts';

export type LoginCredentials = components['schemas']['PasswordLoginRequest'];
export type SessionInfo = Pick<
  components['schemas']['Session'],
  'id' | 'subjectId' | 'tenantId' | 'expiresAt' | 'permissionsVersion'
>;
export type ReauthenticationProof = components['schemas']['ReauthenticateCurrentSessionRequest'];

export interface SessionPort {
  login(credentials: LoginCredentials): Promise<SessionInfo>;
  refresh(): Promise<SessionInfo>;
  reauthenticate(proof: ReauthenticationProof): Promise<void>;
  logout(): Promise<void>;
}

export function sessionErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'SESSION_EXPIRED' || code === 'SESSION_REVOKED') {
    return '登录状态已过期，请重新验证账号与密码。草稿仍保留在当前浏览器。';
  }
  if (code === 'PERMISSION_DENIED') {
    return '当前账号不能进入运营端，请联系租户管理员授予 ops.login。';
  }
  return '登录失败，请核对账号、密码与租户。请求未创建会话。';
}
