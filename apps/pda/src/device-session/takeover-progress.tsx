import type { TakeoverProgressStage } from './takeover-service';

const takeoverCopy: Record<
  TakeoverProgressStage,
  { title: string; summary: string; detail: string; tone: 'info' | 'success' | 'danger' }
> = {
  AUTHORIZING: {
    title: '管理员接管授权',
    summary: '正在向服务器申请短期授权',
    detail: '服务器将校验 pda.takeover.export、设备作用域与 manifest SHA-256。',
    tone: 'info',
  },
  AUTHORIZED: {
    title: '管理员接管授权',
    summary: '服务器已签发短期加密授权',
    detail: 'RSA-OAEP-256 公钥已取得；尚未清理本地数据。',
    tone: 'info',
  },
  ENCRYPTING: {
    title: '加密接管上传',
    summary: '正在生成 AES-256-GCM 密文',
    detail: '完整 manifest、事件和媒体在本机加密，AES 密钥由授权公钥封装。',
    tone: 'info',
  },
  UPLOADING: {
    title: '加密接管上传',
    summary: '密文正在上传并等待完整性校验',
    detail: '只有 manifest 与 ciphertext 双 SHA-256 匹配的 VERIFIED 回执才允许清理。',
    tone: 'info',
  },
  VERIFIED: {
    title: '加密接管上传已验证',
    summary: '服务器返回 VERIFIED 完整性回执',
    detail: '作用域与双哈希已核对，本地接管包已按授权范围原子清理。',
    tone: 'success',
  },
  EXPIRED: {
    title: '接管授权已过期',
    summary: '旧授权和旧密文均不得继续使用',
    detail: '本地事件与媒体完整保留；请重新申请授权，禁止降级为明文导出。',
    tone: 'danger',
  },
};

export function TakeoverProgress({ stage }: { stage?: TakeoverProgressStage }) {
  if (!stage) return null;
  const copy = takeoverCopy[stage];
  return (
    <section className="pda-takeover-progress" data-tone={copy.tone} aria-live="polite">
      <h2>{copy.title}</h2>
      <strong>{copy.summary}</strong>
      <p>{copy.detail}</p>
    </section>
  );
}
