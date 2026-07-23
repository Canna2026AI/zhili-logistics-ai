import { useState } from 'react';
import { Button } from '@zhili/ui';
import { customerPort, type CustomerAddressInput } from '../../api';
import { SummaryItem, SummaryList, WorkflowShell, type WorkflowTone } from '../workflow-shell';

type AccountStep = 'address' | 'api' | 'permission' | 'security';

type AccountFlowProps = {
  initialStep: 'address' | 'api';
  notify: (message: string) => void;
  addressesKey: string;
  companyName: string;
};

const meta: Record<
  AccountStep,
  { title: string; description: string; active: number; tone: WorkflowTone; status: string }
> = {
  address: {
    title: '企业常用地址',
    description: '统一维护仓库、门店与临时收发地址。',
    active: 0,
    tone: 'primary',
    status: '正常 · 24 个地址可用于下单',
  },
  api: {
    title: '申请物流 API 权限',
    description: '创建测试环境应用并选择所需接口范围。',
    active: 1,
    tone: 'info',
    status: '正常 · 域名与回调地址校验通过',
  },
  permission: {
    title: '无法提交生产环境申请',
    description: '当前账号缺少开发者管理员权限。',
    active: 1,
    tone: 'danger',
    status: '权限不足 · 申请未提交',
  },
  security: {
    title: '企业账户安全',
    description: '管理登录验证、API 密钥与活跃会话。',
    active: 2,
    tone: 'success',
    status: '正常 · 企业安全评分 92 / 100',
  },
};

export function AccountFlow({ initialStep, notify, addressesKey, companyName }: AccountFlowProps) {
  const [step, setStep] = useState<AccountStep>(initialStep);
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('CN');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [addresses, setAddresses] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(addressesKey) ?? '["深圳南山发货仓"]') as string[];
    } catch {
      return ['深圳南山发货仓'];
    }
  });
  const current = meta[step];
  const requestApi = async () => {
    setBusy(true);
    try {
      await customerPort.requestApi();
      notify('API 申请已提交，预计 1 个工作日内审核。');
      setStep('permission');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'API 申请失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkflowShell
      code="ACCOUNT · 企业设置"
      title={current.title}
      description={current.description}
      steps={['地址簿', 'API 接入', '安全设置', '审计记录']}
      activeStep={current.active}
      panelTitle={step === 'address' ? '常用地址' : step === 'api' ? '应用申请' : '安全项目'}
      status={current.status}
      tone={current.tone}
      summaryTitle="企业账户"
      summary={
        <SummaryList>
          <SummaryItem label="已验证地址" value="23" />
          <SummaryItem label="API 应用" value="2" />
          <SummaryItem label="安全评分" value="92 / 100" />
        </SummaryList>
      }
      actions={
        <>
          {step === 'address' ? (
            <Button onClick={() => setStep('api')}>进入 API 接入</Button>
          ) : null}
          {step === 'api' ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={() => void requestApi()}>
                提交 API 申请
              </Button>
              <Button disabled={busy} onClick={() => void requestApi()}>
                {busy ? '提交中…' : '提交申请'}
              </Button>
            </>
          ) : null}
          {step === 'permission' ? (
            <Button onClick={() => setStep('security')}>进入安全设置</Button>
          ) : null}
          {step === 'security' ? (
            <Button onClick={() => setStep('address')}>返回地址簿</Button>
          ) : null}
        </>
      }
    >
      {step === 'address' ? (
        <div className="customer-account-addresses">
          <h2>地址簿</h2>
          <form
            className="customer-workflow__form"
            onSubmit={(event) => {
              event.preventDefault();
              const completeAddress: CustomerAddressInput | string =
                city && line1 && postalCode
                  ? {
                      label: name,
                      isDefault: false,
                      address: { countryCode, city, line1, postalCode },
                    }
                  : name;
              void customerPort
                .saveAddress(completeAddress)
                .then(() => {
                  const next = [...addresses, name];
                  localStorage.setItem(addressesKey, JSON.stringify(next));
                  setAddresses(next);
                  setName('');
                  setCity('');
                  setLine1('');
                  setPostalCode('');
                  notify('地址已保存。');
                })
                .catch((error: Error) => notify(error.message));
            }}
          >
            <label>
              地址名称
              <input
                aria-label="地址名称"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <div className="customer-workflow__field-grid">
              <label>
                国家/地区
                <input
                  aria-label="国家/地区"
                  value={countryCode}
                  onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
                />
              </label>
              <label>
                城市
                <input
                  aria-label="城市"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
              </label>
              <label>
                详细地址
                <input
                  aria-label="详细地址"
                  value={line1}
                  onChange={(event) => setLine1(event.target.value)}
                />
              </label>
              <label>
                邮编
                <input
                  aria-label="邮编"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                />
              </label>
            </div>
            <Button type="submit">保存地址</Button>
          </form>
          <table className="portal-table" aria-label="地址列表">
            <tbody>
              {addresses.map((address) => (
                <tr key={address}>
                  <td>{address}</td>
                  <td>{companyName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : step === 'api' ? (
        <form
          className="customer-workflow__form"
          onSubmit={(event) => {
            event.preventDefault();
            void requestApi();
          }}
        >
          <h2>API 申请</h2>
          <label>
            <input aria-label="运单查询" type="checkbox" /> 运单查询
          </label>
          <label>
            <input type="checkbox" /> 轨迹订阅
          </label>
          <label>
            <input type="checkbox" /> 创建预报
          </label>
          <label>
            应用名称
            <input defaultValue="智立 OMS 集成" />
          </label>
          <label>
            回调地址
            <input defaultValue="https://oms.zhili.cn/callback" />
          </label>
          <label>
            用途说明
            <textarea defaultValue="企业 ERP 对接" />
          </label>
        </form>
      ) : step === 'security' ? (
        <section aria-label="企业账户安全" className="customer-workflow__choice-list">
          <div>
            <strong>双因素认证 · 已开启</strong>
            <span>12 位成员</span>
          </div>
          <div>
            <strong>API 密钥 · 2 个有效</strong>
            <span>1 个即将到期</span>
          </div>
          <div>
            <strong>活跃会话 · 8 个</strong>
            <span>2 个异地登录</span>
          </div>
          <div>
            <strong>登录白名单</strong>
            <span>6 个网络范围</span>
          </div>
          <p className="customer-workflow__success-message">企业安全评分 92 / 100</p>
        </section>
      ) : (
        <div className="customer-workflow__result">
          <strong>{current.status}</strong>
          <p>当前角色 · 运营管理员</p>
          <p>所需角色 · 开发者管理员</p>
          <p>审计编号 · AUD-11482</p>
        </div>
      )}
    </WorkflowShell>
  );
}
