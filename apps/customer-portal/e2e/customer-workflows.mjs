import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.CUSTOMER_PORTAL_URL ?? 'http://localhost:4101/?mock=1';
const outputDir = process.env.CUSTOMER_PORTAL_E2E_OUTPUT ?? '/tmp/zhili-customer-v2';

const assertVisible = async (locator, message) => {
  await locator.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    throw new Error(message);
  });
};

const openPortal = async (page) => {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await assertVisible(page.getByRole('heading', { name: '下午好，张伟 👋' }), '客户门户未完成加载');
};

const navigateDesktop = (page, name) =>
  page
    .getByRole('navigation', { name: '客户门户导航' })
    .getByRole('button', { name, exact: true })
    .click();

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  await openPortal(desktop);

  await navigateDesktop(desktop, '新建运单');
  await desktop.getByLabel('收件人').fill('李楠');
  await desktop.getByLabel('目的地').fill('US-LAX 90001');
  await desktop.getByRole('button', { name: '选择地址' }).click();
  await desktop.getByRole('button', { name: '查询报价' }).click();
  await assertVisible(
    desktop.getByRole('heading', { name: '选择承运商方案' }),
    '询价流程未到达报价结果'
  );
  await desktop.getByRole('button', { name: '提交运单' }).click();
  await assertVisible(desktop.getByRole('heading', { name: '运单创建成功' }), '运单提交未成功');
  await desktop.screenshot({ path: `${outputDir}/f01-result.png`, fullPage: true });

  await navigateDesktop(desktop, '问题工单');
  await desktop.getByRole('button', { name: '查看详情' }).click();
  await desktop.getByRole('button', { name: '补充资料' }).click();
  await desktop.getByLabel('入口照片').setInputFiles({
    name: 'entrance.png',
    mimeType: 'image/png',
    buffer: Buffer.from('customer-portal-e2e'),
  });
  await desktop.getByRole('button', { name: '提交资料' }).click();
  await assertVisible(
    desktop.getByRole('heading', { name: '资料已提交，通知部分失败' }),
    '异常处理未呈现部分成功'
  );
  await desktop.screenshot({ path: `${outputDir}/f03-partial.png`, fullPage: true });
  await desktop.getByRole('button', { name: '仅重试失败通知' }).click();
  await assertVisible(desktop.getByText('所有通知渠道已送达'), '失败通知未能单独重试');

  await navigateDesktop(desktop, '轨迹查询');
  await desktop.getByRole('button', { name: '创建工单' }).click();
  await desktop.getByRole('button', { name: '提交工单' }).click();
  await assertVisible(desktop.getByText('TKT-20260723-086', { exact: true }), '轨迹停滞工单未创建');
  await desktop.getByRole('button', { name: '准备关闭' }).click();
  await desktop.getByRole('button', { name: '确认关闭' }).click();
  await assertVisible(desktop.getByRole('heading', { name: '轨迹问题已解决' }), '轨迹工单未关闭');

  await navigateDesktop(desktop, '账单与付款');
  await desktop.getByRole('button', { name: '打开账单详情' }).click();
  await desktop.getByRole('button', { name: '立即支付' }).click();
  await desktop.getByRole('button', { name: '确认付款' }).click();
  await assertVisible(
    desktop.getByRole('heading', { name: '支付订单已创建' }),
    '支付订单未进入等待回执状态'
  );
  await desktop.getByRole('button', { name: '查询支付结果' }).click();
  await assertVisible(
    desktop.getByRole('heading', { name: '付款成功，部分金额待分配' }),
    '付款后未呈现部分核销'
  );
  await desktop.getByRole('button', { name: '模拟并发更新' }).click();
  await assertVisible(
    desktop.getByRole('heading', { name: '账单已被其他操作员更新' }),
    '核销冲突未被拦截'
  );
  await desktop.screenshot({ path: `${outputDir}/f06-conflict.png`, fullPage: true });
  await desktop.getByRole('button', { name: '刷新数据' }).click();
  await desktop.getByRole('button', { name: '分配剩余金额' }).click();
  await assertVisible(
    desktop.getByRole('heading', { name: '账单已完成全额核销' }),
    '账单未完成全额核销'
  );

  await navigateDesktop(desktop, '地址簿');
  await desktop.getByLabel('地址名称').fill('北京亦庄仓');
  await desktop.getByLabel('城市').fill('北京');
  await desktop.getByLabel('详细地址').fill('亦庄开发区泰河路 18 号');
  await desktop.getByLabel('邮编').fill('100176');
  await desktop.getByRole('button', { name: '保存地址' }).click();
  await assertVisible(desktop.getByText('北京亦庄仓'), '企业地址未保存');
  await desktop.getByRole('button', { name: '进入 API 接入' }).click();
  await desktop.getByRole('button', { name: '提交申请' }).click();
  await assertVisible(
    desktop.getByRole('heading', { name: '无法提交生产环境申请' }),
    'API 权限拦截未生效'
  );
  await desktop.getByRole('button', { name: '进入安全设置' }).click();
  await assertVisible(
    desktop.getByText('企业安全评分 92 / 100', { exact: true }),
    '企业安全页未显示'
  );

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openPortal(mobile);
  await mobile
    .getByRole('navigation', { name: '移动端导航' })
    .getByRole('button', { name: '账单', exact: true })
    .click();
  await mobile.getByRole('button', { name: '打开账单详情' }).click();
  await mobile.getByRole('button', { name: '立即支付' }).click();
  await mobile.getByRole('button', { name: '确认付款' }).click();
  await assertVisible(
    mobile.getByRole('heading', { name: '支付订单已创建' }),
    '移动端支付订单未进入等待回执状态'
  );
  await mobile.getByRole('button', { name: '查询支付结果' }).click();
  await assertVisible(
    mobile.getByRole('heading', { name: '付款成功，部分金额待分配' }),
    '移动端部分核销流程失败'
  );
  await mobile.screenshot({ path: `${outputDir}/mobile-f06-partial.png`, fullPage: true });

  console.log(`customer portal workflows passed; screenshots: ${outputDir}`);
} finally {
  await browser.close();
}
