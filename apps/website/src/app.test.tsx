// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { websitePort } from './api';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
  cleanup();
});

describe('官网', () => {
  it('呈现概念规定的深色首屏和真实产品事实', () => {
    render(<App />);
    const hero = screen.getByRole('region', { name: '智立物流 AI 产品介绍' });
    expect(hero).toHaveClass('site-hero-dark');
    expect(screen.getByRole('heading', { name: /让跨境物流业务/ })).toBeVisible();
    expect(screen.getByLabelText('智立系统产品预览')).toHaveTextContent('S2505120004');
    expect(screen.getByLabelText('智立系统产品预览')).toHaveTextContent('123.50 kg');
  });

  it('产品能力、安全部署和页脚法律信息完整', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '下单' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '结算（对账与收款）' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '安全可靠，自主可控' })).toBeVisible();
    expect(screen.getByText('私有化部署')).toBeVisible();
    expect(screen.getByText('权限与审计')).toBeVisible();
    expect(screen.getByText('AGPL-3.0')).toBeVisible();
    expect(screen.getByText('© 2026 智立科技')).toBeVisible();
  });

  it('登录入口和预约演示表单可用', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(screen.getByRole('dialog', { name: '登录智立系统' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '关闭登录' }));
    await user.click(screen.getByRole('button', { name: '预约演示' }));
    await user.type(screen.getByLabelText('企业名称'), '深圳鑫源贸易有限公司');
    await user.type(screen.getByLabelText('联系电话'), '13800138000');
    await user.click(screen.getByRole('button', { name: '提交预约' }));
    expect(await screen.findByRole('status')).toHaveTextContent('预约已提交');
  });

  it('密码登录会校验输入并通过 API port 建立会话', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '登录' }));
    await user.type(screen.getByLabelText('企业账号'), 'admin@zhili.test');
    await user.type(screen.getByLabelText('密码'), 'correct-password');
    await user.click(screen.getByRole('button', { name: '密码登录' }));
    expect(await screen.findByRole('status')).toHaveTextContent('登录成功');
  });

  it('公开法律页面可在站内访问并更新 SEO', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: '隐私政策' }));
    expect(screen.getByRole('heading', { name: '隐私政策' })).toBeVisible();
    expect(document.title).toBe('隐私政策｜智立科技物流AI系统');
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      expect.stringContaining('智立科技')
    );
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://canna2026ai.github.io/zhili-logistics-ai/privacy'
    );
    expect(document.querySelector('script[type="application/ld+json"]')).toHaveTextContent(
      'WebPage'
    );
  });

  it('预约 API 失败时保留表单输入', async () => {
    vi.spyOn(websitePort, 'requestDemo').mockRejectedValueOnce(new Error('预约服务不可用'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '预约演示' }));
    await user.type(screen.getByLabelText('企业名称'), '保留企业');
    await user.type(screen.getByLabelText('联系电话'), '13800138000');
    await user.click(screen.getByRole('button', { name: '提交预约' }));
    expect(await screen.findByRole('status')).toHaveTextContent('预约服务不可用');
    expect(screen.getByRole('dialog', { name: '预约产品演示' })).toBeVisible();
    expect(screen.getByLabelText('企业名称')).toHaveValue('保留企业');
  });
});
