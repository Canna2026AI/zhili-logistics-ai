import type { DeviceContext, DeviceSession } from '../domain/types';
import { isFutureInstant } from '../domain/time';
import type { OfflineQueue } from '../offline/offline-queue';

export interface LocalDeviceSession extends DeviceContext {
  expiresAt: string;
  permissions: DeviceSession['permissions'];
  invalidatedAt?: string;
  invalidReason?: string;
}

export class SessionExpiredError extends Error {
  constructor() {
    super('会话已过期，本地数据已保留，请重新认证后继续。');
    this.name = 'SessionExpiredError';
  }
}

export class UnsafeBindingChangeError extends Error {
  constructor() {
    super('存在未同步事件，禁止更换用户或仓库；请重新认证原绑定并完成同步。');
    this.name = 'UnsafeBindingChangeError';
  }
}

type SessionAction = 'NEW_BUSINESS_EVENT' | 'EXPORT' | 'SYNC' | 'REAUTHENTICATE';

export class SessionGuard {
  private session?: LocalDeviceSession;

  constructor(
    private readonly queue: OfflineQueue,
    private readonly now = () => new Date()
  ) {}

  setSession(session: LocalDeviceSession) {
    this.session = session;
  }

  async persistSession(session: LocalDeviceSession) {
    this.session = session;
    await this.queue.setMeta('device-session', session);
  }

  async restoreSession() {
    this.session = await this.queue.getMeta<LocalDeviceSession>('device-session');
    return this.session;
  }

  current() {
    return this.session;
  }

  isExpired() {
    return (
      !this.session ||
      Boolean(this.session.invalidatedAt) ||
      !isFutureInstant(this.session.expiresAt, this.now().getTime())
    );
  }

  assertActive() {
    if (this.isExpired()) throw new SessionExpiredError();
  }

  assertAllowed(action: SessionAction) {
    if (action !== 'EXPORT' && action !== 'REAUTHENTICATE') this.assertActive();
  }

  async invalidate(reason: string) {
    if (!this.session) return;
    this.session = {
      ...this.session,
      invalidatedAt: this.now().toISOString(),
      invalidReason: reason,
    };
    await this.queue.setMeta('device-session', this.session);
  }

  async changeBinding(next: LocalDeviceSession, _takeoverToken?: string) {
    void _takeoverToken;
    if (this.queue.snapshot().events.length > 0) {
      throw new UnsafeBindingChangeError();
    }
    this.session = next;
    await this.queue.setMeta('device-session', next);
    return next;
  }
}
