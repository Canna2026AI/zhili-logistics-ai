import { useRef, useState, type ReactNode } from 'react';
import { Button, DataTable, Dialog, Input, StatusTag, type DataTableColumn } from '@zhili/ui';
import { buildDangerousFinanceCommand } from '../../../../../packages/features/finance/src';
import { deriveMeasurement } from '../../../../../packages/features/warehouse/src';
import {
  FlowStatePanel,
  type FlowStateActionRequest,
  type FlowStateActionResult,
  type OpsFlowId,
  type OpsFlowSelection,
} from '../interaction-states';
import './fulfillment-finance-workbench.css';

export type FulfillmentSection = 'warehouse' | 'linehaul' | 'tracking' | 'finance';
export type WorkbenchViewState =
  'normal' | 'loading' | 'empty' | 'failed' | 'forbidden' | 'stale' | 'partial';

export type FulfillmentFinanceOperationId =
  | 'receiveScan'
  | 'recordMeasurement'
  | 'attachReceiptMedia'
  | 'confirmReceipt'
  | 'undoReceipt'
  | 'routeWaybill'
  | 'moveInventory'
  | 'commitStocktake'
  | 'attachWaybills'
  | 'createLoadUnit'
  | 'sealLoadUnit'
  | 'dispatchLoadUnit'
  | 'createPrintJob'
  | 'reprintDocument'
  | 'createBooking'
  | 'validateLoadCompatibility'
  | 'captureProofOfDelivery'
  | 'createBillOfLading'
  | 'linkFbaShipment'
  | 'syncLastMilePartner'
  | 'replayPartnerEvent'
  | 'generateLastMileCharges'
  | 'createLastMileIntake'
  | 'scanLastMileIntake'
  | 'createDeliveryTask'
  | 'updateDeliveryTaskStatus'
  | 'amendProofOfDelivery'
  | 'ingestTrackingEvent'
  | 'appendManualTrackingEvent'
  | 'detectTrackingStall'
  | 'createIssue'
  | 'assignIssue'
  | 'requestIssueMaterial'
  | 'resolveIssue'
  | 'createClaim'
  | 'settleClaim'
  | 'placeShipmentHold'
  | 'releaseShipmentHold'
  | 'requestShipmentHoldReleaseApproval'
  | 'generateCharges'
  | 'reviewCharge'
  | 'unreviewCharge'
  | 'adjustCharge'
  | 'createPayableImport'
  | 'validatePayableImport'
  | 'commitPayableImport'
  | 'reconcilePayables'
  | 'createStatement'
  | 'sendStatement'
  | 'openStatementDispute'
  | 'recordReceipt'
  | 'createDisbursement'
  | 'allocateReceipt'
  | 'allocateDisbursement'
  | 'reverseAllocation'
  | 'publishExchangeRateSet'
  | 'allocateCharges'
  | 'getProfitTrace'
  | 'closeFinancialPeriod'
  | 'reopenFinancialPeriod'
  | 'createInvoiceRequest'
  | 'reviewInvoiceRequest'
  | 'createPrepaymentOrder'
  | 'createStatementPaymentOrder'
  | 'closePaymentOrder'
  | 'createPaymentRefund'
  | 'reconcilePayments'
  | 'queryBusinessReport'
  | 'retryNotificationDelivery';

export interface FulfillmentFinanceCommand {
  domain: FulfillmentSection;
  operationId: FulfillmentFinanceOperationId;
  entityRef: string;
  idempotencyKey: string;
  expectedVersion?: number;
  payload?: Record<string, unknown>;
}

export interface FulfillmentFinanceCommandPort {
  execute(command: FulfillmentFinanceCommand): Promise<{ auditId: string }>;
}

export interface FulfillmentFinanceWorkbenchProps {
  initialSection?: FulfillmentSection;
  initialViewState?: WorkbenchViewState;
  commandPort: FulfillmentFinanceCommandPort;
  onSectionChange?: (section: FulfillmentSection) => void;
  showScenarioControls?: boolean;
}

type RunCommand = (
  command: FulfillmentFinanceCommand,
  successMessage: string,
  onResolved?: () => void
) => Promise<void>;

function command(
  domain: FulfillmentSection,
  operationId: FulfillmentFinanceOperationId,
  entityRef: string,
  expectedVersion = 1,
  payload?: Record<string, unknown>
): FulfillmentFinanceCommand {
  return {
    domain,
    operationId,
    entityRef,
    idempotencyKey: `${operationId}:${entityRef}:v${expectedVersion}`,
    expectedVersion,
    payload,
  };
}

const measurement = deriveMeasurement({
  expectedWeightKg: 122,
  actualWeightKg: 123.5,
  lengthCm: 100,
  widthCm: 80,
  heightCm: 60,
  volumeDivisor: 6000,
});

const formatMoney = (cents: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(cents / 100);

function MiniIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const navItems: Array<{
  id: FulfillmentSection;
  label: string;
  description: string;
  path: string;
}> = [
  {
    id: 'warehouse',
    label: '仓库作业',
    description: '收货·库位·分货·出库',
    path: 'M4 4h16v16H4z M8 9h8 M8 13h8',
  },
  {
    id: 'linehaul',
    label: '干线尾程',
    description: '订舱·提单·清关·POD',
    path: 'M3 16h13V6H3z M16 10h3l2 3v3h-5 M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  },
  {
    id: 'tracking',
    label: '轨迹客服',
    description: '轨迹·问题件·退件·索赔',
    path: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7v5l3 2',
  },
  {
    id: 'finance',
    label: '财务结算',
    description: '应收应付·核销·期间·利润',
    path: 'M4 5h16v14H4z M7 9h10 M7 13h4 M15 13h2',
  },
];

const viewStateEvidence: Record<Exclude<WorkbenchViewState, 'normal'>, ReactNode> = {
  loading: (
    <div className="ff-state ff-state--loading" role="status">
      <span className="ff-spinner" />
      <strong>正在加载履约数据</strong>
      <span>超过 8 秒可取消，后台任务不会丢失。</span>
    </div>
  ),
  empty: (
    <div className="ff-state">
      <strong>当前筛选没有数据</strong>
      <span>已区分业务空集与筛选无结果，可清除筛选或新建任务。</span>
    </div>
  ),
  failed: (
    <div className="ff-state ff-state--danger" role="alert">
      <strong>请求失败 · REQ-FIN-5001</strong>
      <span>服务暂时不可用，已保留输入和幂等键，可仅重试失败命令。</span>
    </div>
  ),
  forbidden: (
    <div className="ff-state ff-state--warning" role="alert">
      <strong>缺少权限 finance.charge.review</strong>
      <span>数据范围：华南区；字段策略：成本脱敏。已隐藏审核命令，可申请权限。</span>
    </div>
  ),
  stale: (
    <div className="ff-state ff-state--warning" role="alert">
      <strong>数据已过期：本地版本 10 / 服务器版本 11</strong>
      <span>他人已修改该费用。请比较差异，刷新后基于新版本重试。</span>
    </div>
  ),
  partial: (
    <div className="ff-state ff-state--warning" role="status">
      <strong>批量结果：成功 8 条，失败 2 条</strong>
      <span>成功项已提交；只重试失败项，复用原批次 BATCH-FIN-20260722-01。</span>
    </div>
  ),
};

function WarehouseWorkbench({ runCommand }: { runCommand: RunCommand }) {
  const [scan, setScan] = useState('S2505120004');
  const [media, setMedia] = useState(['外箱全景.jpg', '箱角封装.jpg', '托盘标签.jpg']);
  const [selectedRoute, setSelectedRoute] = useState('COSCO AQUARIUS 085W');
  const [printState, setPrintState] = useState('未创建打印任务');
  const [lastRefreshed, setLastRefreshed] = useState('尚未刷新');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="ff-domain" aria-labelledby="warehouse-title">
      <div className="ff-section-heading">
        <div>
          <h2 id="warehouse-title">收货扫描</h2>
          <p>扫码匹配预报，在一屏内完成复重、量方、图片、库位与分货预检。</p>
        </div>
        <div className="ff-inline-actions">
          <Button
            variant="secondary"
            onClick={() => setLastRefreshed(`已刷新 · ${new Date().toLocaleTimeString('zh-CN')}`)}
          >
            刷新
          </Button>
          <Button
            onClick={() =>
              runCommand(
                command('warehouse', 'confirmReceipt', 'RCV-S2505120004', 7, {
                  waybillNo: 'S2505120004',
                }),
                '收货已确认，已进入待分货'
              )
            }
          >
            确认收货
          </Button>
        </div>
      </div>

      <div className="ff-metric-strip" aria-label="仓库任务统计">
        {[
          ['156', '待收货'],
          ['1,123', '已收货'],
          ['86', '待分货'],
          ['12', '异常'],
          ['238', '待出库'],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="ff-warehouse-grid">
        <div className="ff-stack">
          <div className="ff-panel ff-scan-panel">
            <label htmlFor="ff-scan">运单条码 / 运单号</label>
            <div className="ff-scan-row">
              <input
                id="ff-scan"
                value={scan}
                onChange={(event) => setScan(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter')
                    void runCommand(
                      command('warehouse', 'receiveScan', scan, 1, { barcode: scan }),
                      `已匹配预报 ${scan}`
                    );
                }}
              />
              <Button
                onClick={() =>
                  runCommand(
                    command('warehouse', 'receiveScan', scan, 1, { barcode: scan }),
                    `已匹配预报 ${scan}`
                  )
                }
              >
                匹配
              </Button>
            </div>
            <div className="ff-waybill-line">
              <div>
                <span>当前运单</span>
                <strong>S2505120004</strong>
              </div>
              <StatusTag tone="success">已到仓</StatusTag>
              <span>深圳鑫源贸易有限公司</span>
            </div>
          </div>

          <div className="ff-panel">
            <div className="ff-panel-title">
              <h3>重量与尺寸</h3>
              <span>电子秤-01 · 体积扫描仪-02 已连接 · {lastRefreshed}</span>
            </div>
            <dl className="ff-measurements">
              <div>
                <dt>预报重量</dt>
                <dd>122.00 kg</dd>
              </div>
              <div>
                <dt>实收重量</dt>
                <dd className="ff-value--warning">123.50 kg</dd>
              </div>
              <div>
                <dt>差异</dt>
                <dd>
                  +{measurement.discrepancyKg.toFixed(2)} kg / +
                  {measurement.discrepancyPercent.toFixed(2)}%
                </dd>
              </div>
              <div>
                <dt>尺寸</dt>
                <dd>100 × 80 × 60 cm</dd>
              </div>
              <div>
                <dt>体积 / 材积重</dt>
                <dd>
                  {measurement.volumeM3.toFixed(2)} m³ / {measurement.volumetricWeightKg.toFixed(2)}{' '}
                  kg
                </dd>
              </div>
              <div>
                <dt>计费重</dt>
                <dd className="ff-value--primary">
                  {measurement.chargeableWeightKg.toFixed(2)} kg
                </dd>
              </div>
            </dl>
            <Button
              variant="secondary"
              onClick={() =>
                runCommand(
                  command('warehouse', 'recordMeasurement', 'RCV-S2505120004', 7, {
                    actualWeightKg: 123.5,
                    lengthCm: 100,
                    widthCm: 80,
                    heightCm: 60,
                  }),
                  '测量结果已记录到收货版本 8'
                )
              }
            >
              记录测量
            </Button>
          </div>

          <div className="ff-panel">
            <div className="ff-panel-title">
              <h3>图片证据 ({media.length})</h3>
              <button className="ff-link" onClick={() => fileInputRef.current?.click()}>
                上传图片
              </button>
            </div>
            <input
              ref={fileInputRef}
              className="ff-visually-hidden"
              type="file"
              accept="image/*"
              multiple
              aria-label="选择收货图片"
              onChange={(event) => {
                const names = [...(event.target.files ?? [])].map((file) => file.name);
                if (names.length > 0)
                  void runCommand(
                    command('warehouse', 'attachReceiptMedia', 'RCV-S2505120004', 7, {
                      files: names,
                    }),
                    `已上传 ${names.length} 张图片`,
                    () => setMedia((current) => [...current, ...names])
                  );
              }}
            />
            <div className="ff-media-list">
              {media.map((name, index) => (
                <div key={`${name}-${index}`} className="ff-media-item">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{name}</strong>
                  <small>已绑定收货版本 7</small>
                </div>
              ))}
            </div>
          </div>
          <div className="ff-panel">
            <div className="ff-panel-title">
              <h3>最近扫描记录</h3>
              <button
                className="ff-link"
                onClick={() =>
                  runCommand(
                    command('finance', 'queryBusinessReport', 'WH-SZX-01', 1, {
                      reportType: 'WAREHOUSE_RECEIPT_SCAN',
                    }),
                    '扫描报告已生成'
                  )
                }
              >
                导出报告
              </button>
            </div>
            <table className="ff-compact-table" aria-label="最近扫描记录">
              <thead>
                <tr>
                  <th>扫描时间</th>
                  <th>运单号</th>
                  <th>结果</th>
                  <th>重量</th>
                  <th>体积</th>
                  <th>操作员</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['10:21:35', 'S2505120004', '成功', '123.50', '0.480', '张伟'],
                  ['10:18:02', 'S2505120003', '成功', '125.30', '0.600', '张伟'],
                  ['10:15:47', 'S2505120002', '异常', '32.00', '—', '张伟'],
                  ['10:10:12', 'S2505120001', '成功', '122.10', '0.420', '张伟'],
                ].map((row) => (
                  <tr key={`${row[0]}-${row[1]}`}>
                    {row.map((cell, index) => (
                      <td
                        key={`${cell}-${index}`}
                        data-tone={cell === '异常' ? 'danger' : undefined}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ff-stack">
          <div className="ff-panel">
            <div className="ff-panel-title">
              <h3>分货与渠道</h3>
              <span>基于计费重 123.50 kg</span>
            </div>
            <div className="ff-route-options">
              <button
                aria-label="COSCO AQUARIUS 085W 2026年船期"
                data-selected={selectedRoute === 'COSCO AQUARIUS 085W'}
                onClick={() =>
                  runCommand(
                    command('warehouse', 'routeWaybill', 'S2505120004', 7, {
                      route: 'COSCO AQUARIUS 085W',
                    }),
                    '已选择 COSCO AQUARIUS 085W',
                    () => setSelectedRoute('COSCO AQUARIUS 085W')
                  )
                }
              >
                <span>推荐</span>
                <strong>COSCO AQUARIUS 085W</strong>
                <small>US-LAX · USD 320.00 · 05-28</small>
              </button>
              <button
                aria-label="EMC OAKLAND 082W 2026年船期"
                data-selected={selectedRoute === 'EMC OAKLAND 082W'}
                onClick={() =>
                  runCommand(
                    command('warehouse', 'routeWaybill', 'S2505120004', 7, {
                      route: 'EMC OAKLAND 082W',
                    }),
                    '已选择 EMC OAKLAND 082W',
                    () => setSelectedRoute('EMC OAKLAND 082W')
                  )
                }
              >
                <strong>EMC OAKLAND 082W</strong>
                <small>US-ONT · USD 318.00 · 05-30</small>
              </button>
              <button
                aria-label="COSCO PISCES 086W 2026年船期"
                data-selected={selectedRoute === 'COSCO PISCES 086W'}
                onClick={() =>
                  runCommand(
                    command('warehouse', 'routeWaybill', 'S2505120004', 7, {
                      route: 'COSCO PISCES 086W',
                    }),
                    '已选择 COSCO PISCES 086W',
                    () => setSelectedRoute('COSCO PISCES 086W')
                  )
                }
              >
                <strong>COSCO PISCES 086W</strong>
                <small>US-LGB · USD 322.00 · 05-29</small>
              </button>
            </div>
          </div>
          <div className="ff-two-column-panels">
            <div className="ff-panel">
              <h3>限制校验</h3>
              <ul className="ff-check-list">
                <li>
                  禁运品 <StatusTag tone="success">通过</StatusTag>
                </li>
                <li>
                  仓库限制 <StatusTag tone="success">通过</StatusTag>
                </li>
                <li>
                  目的港限制 <StatusTag tone="success">通过</StatusTag>
                </li>
                <li>
                  HS 编码 <StatusTag tone="success">通过</StatusTag>
                </li>
              </ul>
            </div>
            <div className="ff-panel">
              <h3>库位信息</h3>
              <dl className="ff-compact-dl">
                <dt>仓库</dt>
                <dd>WH-SZX-01</dd>
                <dt>库区</dt>
                <dd>A 区</dd>
                <dt>库位</dt>
                <dd>A-01-15</dd>
              </dl>
              <Button
                variant="secondary"
                onClick={() =>
                  runCommand(
                    command('warehouse', 'moveInventory', 'S2505120004', 7, {
                      fromLocation: 'A-01-15',
                      toLocation: 'A-01-16',
                    }),
                    '已移库至 A-01-16'
                  )
                }
              >
                移库
              </Button>
            </div>
          </div>
          <div className="ff-panel">
            <div className="ff-panel-title">
              <h3>分货 / 装载 / 出库</h3>
              <span>实体版本 7</span>
            </div>
            <div className="ff-process-rail">
              {(
                [
                  ['收货', 'confirmReceipt'],
                  ['上架', 'moveInventory'],
                  ['分货', 'routeWaybill'],
                  ['加入托盘', 'attachWaybills'],
                  ['封装', 'sealLoadUnit'],
                  ['出库', 'dispatchLoadUnit'],
                ] as const
              ).map(([item, operationId], index) => (
                <button
                  key={item}
                  data-complete={index < 2}
                  onClick={() =>
                    runCommand(
                      command('warehouse', operationId, 'S2505120004', 7, { stage: item }),
                      `已执行：${item}`
                    )
                  }
                >
                  {index + 1}
                  <span>{item}</span>
                </button>
              ))}
            </div>
            <div className="ff-print-row" aria-label="WH-08 打印任务">
              <div>
                <strong>WH-08 交接单打印</strong>
                <span>{printState}</span>
              </div>
              <div className="ff-inline-actions">
                <Button
                  variant="secondary"
                  onClick={() =>
                    runCommand(
                      command('warehouse', 'createPrintJob', 'S2505120004', 7, {
                        documentType: 'HANDOVER',
                        copies: 1,
                      }),
                      '打印任务 PRINT-S2505120004 已排队',
                      () => setPrintState('打印任务 PRINT-S2505120004 已排队')
                    )
                  }
                >
                  打印交接单
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    runCommand(
                      command('warehouse', 'reprintDocument', 'PRINT-S2505120004', 1, {
                        reason: '交接单模糊',
                        copies: 1,
                      }),
                      '交接单重打任务已排队',
                      () => setPrintState('重打任务已排队')
                    )
                  }
                >
                  重打交接单
                </Button>
              </div>
            </div>
            <div className="ff-inline-actions" aria-label="仓库补充操作">
              <Button
                variant="secondary"
                onClick={() =>
                  runCommand(
                    command('warehouse', 'undoReceipt', 'RCV-S2505120004', 7, {
                      reason: '收货数量需复核',
                    }),
                    '收货已撤销并返回待复核'
                  )
                }
              >
                撤销收货
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  runCommand(
                    command('warehouse', 'commitStocktake', 'STK-WH-SZX-01-0722', 1, {
                      warehouseId: 'WH-SZX-01',
                      countedQuantity: 42,
                    }),
                    '盘点结果已提交'
                  )
                }
              >
                提交盘点
              </Button>
              <Button
                onClick={() =>
                  runCommand(
                    command('linehaul', 'createLoadUnit', 'CNT-SZX-260722-01', 1, {
                      loadUnitType: 'CONTAINER',
                      warehouseId: 'WH-SZX-01',
                    }),
                    '装载单 CNT-SZX-260722-01 已创建'
                  )
                }
              >
                创建装载单
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type LoadRow = {
  id: string;
  ref: string;
  type: string;
  route: string;
  count: number;
  state: string;
};
const loadRows: LoadRow[] = [
  {
    id: '1',
    ref: 'BK202607220018',
    type: '订舱 / 提单',
    route: 'SZX → LAX',
    count: 42,
    state: '待装柜',
  },
  {
    id: '2',
    ref: 'PLT-SZX-260722-08',
    type: '托盘',
    route: 'SZX → LAX',
    count: 16,
    state: '兼容通过',
  },
  {
    id: '3',
    ref: 'DEL-LAX-260729-03',
    type: '尾程派送',
    route: 'LAX → ONT8',
    count: 8,
    state: 'POD 待回传',
  },
];

function LinehaulWorkbench({
  runCommand,
  scenario,
}: {
  runCommand: RunCommand;
  scenario: OpsFlowSelection;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [partnerState, setPartnerState] = useState('等待同步');
  const columns: DataTableColumn<LoadRow>[] = [
    {
      key: 'ref',
      header: '业务号',
      render: (row) => <strong className="ff-table-link">{row.ref}</strong>,
    },
    { key: 'type', header: '层级', render: (row) => row.type },
    { key: 'route', header: '路由 / 清关', render: (row) => row.route },
    { key: 'count', header: '运单数', align: 'right', render: (row) => row.count },
    {
      key: 'state',
      header: '状态',
      render: (row) => <StatusTag tone="warning">{row.state}</StatusTag>,
    },
  ];
  return (
    <section className="ff-domain" aria-labelledby="linehaul-title">
      <div className="ff-section-heading">
        <div>
          <h2 id="linehaul-title">干线与尾程履约</h2>
          <p>订舱、提单、清关、FBA 箱号、接货、派送和 POD 主从工作台。</p>
        </div>
        <Button
          onClick={() =>
            runCommand(
              command('linehaul', 'createBooking', 'BK202607220019', 1, {
                route: 'SZX-LAX',
              }),
              '新订舱 BK202607220019 已创建'
            )
          }
        >
          新建订舱
        </Button>
      </div>
      <div className="ff-flow-map" aria-label="干线履约阶段">
        {['订舱', '提单', '集包/卡板', '报关', '装柜', 'FBA 关联', '尾程接货', '派送', 'POD'].map(
          (step, index) => (
            <div key={step} data-current={index === 4}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          )
        )}
      </div>
      <div className="ff-panel">
        <div className="ff-panel-title">
          <h3>待处理装载与派送任务</h3>
          <div className="ff-inline-actions">
            <Button
              variant="secondary"
              disabled={selected.length === 0}
              onClick={() =>
                runCommand(
                  command('linehaul', 'validateLoadCompatibility', 'CNT-SZX-260722-01', 4, {
                    selectedIds: selected,
                  }),
                  `已对 ${selected.length} 条任务运行兼容校验`
                )
              }
            >
              兼容校验
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runCommand(
                  command('linehaul', 'captureProofOfDelivery', 'DEL-LAX-260729-03', 3),
                  'POD v3 已锁定为当前版本'
                )
              }
            >
              POD 版本
            </Button>
          </div>
        </div>
        <DataTable
          ariaLabel="干线与尾程任务"
          columns={columns}
          rows={loadRows}
          rowKey={(row) => row.id}
          selectedKeys={selected}
          onSelectionChange={setSelected}
        />
      </div>
      <div className="ff-three-panels">
        <div className="ff-panel">
          <h3>清关资料</h3>
          <p>CI/PL 已验证 · HS 编码 4/4 通过</p>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'createBillOfLading', 'BOL-SZX-260722-04', 1),
                '报关资料包已生成'
              )
            }
          >
            生成资料包
          </Button>
        </div>
        <div className="ff-panel">
          <h3>FBA 关联</h3>
          <p>Amazon 货件 FBA18Q4K9 · ONT8 · 8 箱</p>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'linkFbaShipment', 'FBA18Q4K9', 2),
                'FBA 箱号与运单已双向关联'
              )
            }
          >
            关联箱号
          </Button>
        </div>
        <div className="ff-panel ff-preflight">
          <h3>出库预检</h3>
          <ul>
            <li>42 票 / 5,187.20 kg</li>
            <li>费用缺口 0</li>
            <li>未关闭问题 0</li>
            <li>交接单已打印</li>
          </ul>
          <Button
            disabled={scenario.stateId !== 'normal'}
            onClick={() =>
              runCommand(
                command('linehaul', 'dispatchLoadUnit', 'CNT-SZX-260722-01', 4),
                '装载单 CNT-SZX-260722-01 已出库'
              )
            }
          >
            确认出库
          </Button>
        </div>
      </div>
      <div className="ff-panel ff-partner-ops" aria-label="合作方同步状态">
        <div>
          <h3>LM-05 / LM-06 合作方执行</h3>
          <p>{partnerState}</p>
        </div>
        <div className="ff-inline-actions">
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'createLastMileIntake', 'LMI-LAX-260722-01', 1, {
                  partnerCode: 'LAX-PARTNER',
                  loadUnitId: 'CNT-SZX-260722-01',
                }),
                '尾程接货单 LMI-LAX-260722-01 已创建',
                () => setPartnerState('尾程接货单已创建，等待扫描')
              )
            }
          >
            创建尾程接货
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'scanLastMileIntake', 'LMI-LAX-260722-01', 1, {
                  barcode: 'CNT-SZX-260722-01',
                }),
                '尾程接货扫描已入库',
                () => setPartnerState('接货扫描完成 · 42/42 票')
              )
            }
          >
            扫描尾程接货
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'createDeliveryTask', 'DEL-LAX-260729-04', 1, {
                  intakeId: 'LMI-LAX-260722-01',
                  destination: 'ONT8',
                }),
                '派送任务 DEL-LAX-260729-04 已创建',
                () => setPartnerState('派送任务已下发给 LAX-PARTNER')
              )
            }
          >
            创建派送任务
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'updateDeliveryTaskStatus', 'DEL-LAX-260729-03', 3, {
                  status: 'OUT_FOR_DELIVERY',
                }),
                '派送状态已更新为派送中',
                () => setPartnerState('派送中 · 尾程设备在线')
              )
            }
          >
            更新派送状态
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'amendProofOfDelivery', 'DEL-LAX-260729-03', 3, {
                  reason: '补充收件人姓名',
                  recipientName: 'Alex Chen',
                }),
                'POD v4 已修订并保留历史版本',
                () => setPartnerState('POD 已修订至 v4')
              )
            }
          >
            修订 POD
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'syncLastMilePartner', 'LAX-PARTNER', 8, {
                  checkpoint: 'CP-20260722-42',
                }),
                '合作方同步已完成 42 条',
                () => setPartnerState('已完成 42 条 · 检查点 CP-20260722-42')
              )
            }
          >
            同步合作方
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('linehaul', 'replayPartnerEvent', 'EVT-LM-5001', 8, {
                  sourceEventId: 'EVT-LM-5001',
                }),
                '合作方事件 EVT-LM-5001 已幂等重放',
                () => setPartnerState('已重放 EVT-LM-5001 · 未产生重复状态')
              )
            }
          >
            重放事件
          </Button>
          <Button
            onClick={() =>
              runCommand(
                command('linehaul', 'generateLastMileCharges', 'DEL-LAX-260729-03', 3, {
                  receivableCents: 86000,
                  payableCents: 62000,
                }),
                '尾程应收应付已生成并进入对账',
                () => setPartnerState('费用已生成：应收 ¥860.00 / 应付 ¥620.00')
              )
            }
          >
            生成尾程费用
          </Button>
        </div>
      </div>
    </section>
  );
}

const trackingEvents = [
  ['2026-07-22 16:42', '派送完成 / POD v3', '尾程 PDA', '正常'],
  ['2026-07-22 13:10', '开始派送', 'LAX-Partner', '正常'],
  ['2026-07-21 08:20', '清关放行', 'DHL', '迟到事件'],
  ['2026-07-20 07:55', '抵达 LAX', 'DHL', '重复×2'],
] as const;

function TrackingWorkbench({ runCommand }: { runCommand: RunCommand }) {
  const [issueState, setIssueState] = useState('处理中');
  const [trackingState, setTrackingState] = useState('轨迹监控正常');
  return (
    <section className="ff-domain" aria-labelledby="tracking-title">
      <div className="ff-section-heading">
        <div>
          <h2 id="tracking-title">轨迹客服与异常处理</h2>
          <p>保留事件时间、接收时间和来源，问题件、退件、索赔与扣放货并行处理。</p>
        </div>
        <Button
          onClick={() =>
            runCommand(
              command('tracking', 'appendManualTrackingEvent', 'S2505120004', 12, {
                status: 'CUSTOMER_CONFIRMED',
              }),
              '已追加人工轨迹 TRK-MANUAL-018'
            )
          }
        >
          追加轨迹
        </Button>
      </div>
      <div className="ff-panel ff-partner-ops" aria-label="轨迹与异常命令">
        <div>
          <h3>轨迹检测与处置</h3>
          <p>{trackingState}</p>
        </div>
        <div className="ff-inline-actions">
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('tracking', 'ingestTrackingEvent', 'EVT-DHL-260722-88', 1, {
                  waybillNo: 'S2505120004',
                  status: 'DELIVERED',
                  occurredAt: '2026-07-22T16:42:00+08:00',
                }),
                '合作方轨迹已接收并去重',
                () => setTrackingState('最新轨迹已接收 · EVT-DHL-260722-88')
              )
            }
          >
            接收轨迹
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('tracking', 'detectTrackingStall', 'S2505120004', 12, {
                  thresholdHours: 48,
                }),
                '停滞检测完成：未超过 48 小时阈值',
                () => setTrackingState('停滞检测通过 · 48h 阈值')
              )
            }
          >
            检测停滞
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('tracking', 'createIssue', 'ISSUE-260722-10', 1, {
                  waybillNo: 'S2505120004',
                  issueType: 'TRACKING_STALL',
                }),
                '问题件 ISSUE-260722-10 已创建',
                () => setIssueState('待指派')
              )
            }
          >
            创建问题件
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('tracking', 'assignIssue', 'ISSUE-260722-09', 4, {
                  assigneeId: 'USR-ZHANGWEI',
                }),
                '问题件已指派给张伟',
                () => setIssueState('已指派')
              )
            }
          >
            指派问题件
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('tracking', 'settleClaim', 'CLM-260722-02', 2, {
                  settlementAmountCents: 36800,
                  currency: 'CNY',
                }),
                '索赔 CLM-260722-02 已结算',
                () => setTrackingState('索赔已结算 · CNY 368.00')
              )
            }
          >
            结算索赔
          </Button>
          <Button
            onClick={() =>
              runCommand(
                command('tracking', 'releaseShipmentHold', 'HOLD-S2505120004', 2, {
                  reason: '审批通过',
                }),
                '扣货已解除，运单恢复履约',
                () => setTrackingState('已授权放货')
              )
            }
          >
            授权放货
          </Button>
        </div>
      </div>
      <div className="ff-tracking-grid">
        <div className="ff-panel">
          <div className="ff-panel-title">
            <h3>S2505120004 轨迹时间线</h3>
            <StatusTag tone="success">已签收</StatusTag>
          </div>
          <ol className="ff-timeline">
            {trackingEvents.map(([time, label, source, note]) => (
              <li key={`${time}-${label}`}>
                <time>{time}</time>
                <div>
                  <strong>{label}</strong>
                  <span>来源：{source}</span>
                </div>
                <StatusTag tone={note === '正常' ? 'success' : 'warning'}>{note}</StatusTag>
              </li>
            ))}
          </ol>
        </div>
        <div className="ff-stack">
          <div className="ff-panel">
            <div className="ff-panel-title">
              <h3>问题件 ISSUE-260722-09</h3>
              <StatusTag tone="warning">{issueState}</StatusTag>
            </div>
            <dl className="ff-compact-dl">
              <dt>SLA</dt>
              <dd>剩余 01:42</dd>
              <dt>责任人</dt>
              <dd>张伟 / 客服组</dd>
              <dt>问题</dt>
              <dd>POD 照片收件人不清晰</dd>
            </dl>
            <div className="ff-inline-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  runCommand(
                    command('tracking', 'requestIssueMaterial', 'ISSUE-260722-09', 4),
                    '已向客户请求补充资料'
                  )
                }
              >
                补资料
              </Button>
              <Button
                onClick={() =>
                  runCommand(
                    command('tracking', 'resolveIssue', 'ISSUE-260722-09', 4, {
                      resolution: 'POD_EVIDENCE_ACCEPTED',
                    }),
                    '问题件已关闭；客户通知失败，已创建重试 JOB-NOTIFY-5001',
                    () => setIssueState('已解决')
                  )
                }
              >
                解决问题
              </Button>
            </div>
          </div>
          <div className="ff-panel">
            <h3>退件与索赔</h3>
            <div className="ff-action-list">
              <button
                onClick={() =>
                  runCommand(
                    command('tracking', 'createClaim', 'RET-260722-04', 1, { type: 'RETURN' }),
                    '退件 RET-260722-04 已创建'
                  )
                }
              >
                <strong>创建退件</strong>
                <span>原路退回 / 改派 / 销毁</span>
              </button>
              <button
                onClick={() =>
                  runCommand(
                    command('tracking', 'createClaim', 'CLM-260722-02', 1, { type: 'DAMAGE' }),
                    '索赔 CLM-260722-02 已创建'
                  )
                }
              >
                <strong>创建索赔</strong>
                <span>破损 / 丢失 / 延误证据</span>
              </button>
              <button
                onClick={() =>
                  runCommand(
                    command('tracking', 'placeShipmentHold', 'S2505120004', 11, {
                      action: 'RELEASE_REQUEST',
                    }),
                    '放货申请已提交审批链'
                  )
                }
              >
                <strong>扣货 / 放货</strong>
                <span>信用策略、原因与审批</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type FinanceRow = {
  id: string;
  waybill: string;
  customer: string;
  item: string;
  salesCents: number;
  costCents: number;
  state: string;
};
const financeRows: FinanceRow[] = [
  {
    id: '1',
    waybill: 'S2505120001',
    customer: 'COSCO SHIPPING',
    item: '海运费',
    salesCents: 890290,
    costCents: 620000,
    state: '待审核',
  },
  {
    id: '2',
    waybill: 'S2505120002',
    customer: '上海智立科技有限公司',
    item: '港口操作费',
    salesCents: 231360,
    costCents: 180000,
    state: '待审核',
  },
  {
    id: '3',
    waybill: 'S2505120003',
    customer: '德国法兰克福公司',
    item: '文件费',
    salesCents: 63000,
    costCents: 15000,
    state: '待生账单',
  },
  {
    id: '4',
    waybill: 'S2505120004',
    customer: '深圳鑫源贸易有限公司',
    item: '海运费',
    salesCents: 532000,
    costCents: 458050,
    state: '待审核',
  },
  {
    id: '5',
    waybill: 'S2505120005',
    customer: '俄罗斯奥斯科贸易',
    item: '目的港费',
    salesCents: 433800,
    costCents: 270000,
    state: '待生账单',
  },
  {
    id: '6',
    waybill: 'S2505120006',
    customer: '日本东京株式会社',
    item: '报关费',
    salesCents: 86760,
    costCents: 40000,
    state: '待审核',
  },
  {
    id: '7',
    waybill: 'S2505120007',
    customer: '加拿大温哥华公司',
    item: '保险费',
    salesCents: 180750,
    costCents: 95000,
    state: '待生账单',
  },
  {
    id: '8',
    waybill: 'S2505120008',
    customer: '美国纽约有限公司',
    item: 'AMS 申报',
    salesCents: 25305,
    costCents: 10000,
    state: '待审核',
  },
  {
    id: '9',
    waybill: 'S2505120009',
    customer: '法国巴黎公司',
    item: '滞箱费',
    salesCents: 325350,
    costCents: 120000,
    state: '逾期',
  },
  {
    id: '10',
    waybill: 'S2505120010',
    customer: '哈萨克斯坦阿拉木图',
    item: '海运费',
    salesCents: 723000,
    costCents: 530000,
    state: '已审核',
  },
];

function FinanceWorkbench({
  runCommand,
  scenario,
  commandPending,
}: {
  runCommand: RunCommand;
  scenario: OpsFlowSelection;
  commandPending: boolean;
}) {
  const [selected, setSelected] = useState(['4']);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('全部');
  const [workflowState, setWorkflowState] = useState('选择流程并提交后显示服务端结果');
  const selectedCharge = financeRows.find((row) => row.id === '4')!;
  const allocationBlocked =
    scenario.flowId === 'F06' && ['stale-allocate', 'danger-unreview'].includes(scenario.stateId);
  const paymentBlocked = scenario.flowId === 'F07' && scenario.stateId === 'forbidden-pay';
  const columns: DataTableColumn<FinanceRow>[] = [
    {
      key: 'waybill',
      header: '运单号',
      render: (row) => <strong className="ff-table-link">{row.waybill}</strong>,
    },
    { key: 'customer', header: '客户', width: 210, render: (row) => row.customer },
    { key: 'item', header: '费用项目', render: (row) => row.item },
    {
      key: 'sales',
      header: '应收 (CNY)',
      align: 'right',
      render: (row) => formatMoney(row.salesCents),
    },
    {
      key: 'cost',
      header: '成本 (CNY)',
      align: 'right',
      render: (row) => formatMoney(row.costCents),
    },
    {
      key: 'profit',
      header: '毛利',
      align: 'right',
      render: (row) => formatMoney(row.salesCents - row.costCents),
    },
    {
      key: 'state',
      header: '状态',
      render: (row) => (
        <StatusTag tone={row.state === '待审核' ? 'warning' : 'info'}>{row.state}</StatusTag>
      ),
    },
  ];

  return (
    <section className="ff-domain" aria-labelledby="finance-title">
      <div className="ff-section-heading">
        <div>
          <h2 id="finance-title">物流财务结算</h2>
          <p>费用版本、应收应付、账单、收付款、核销、分摊、期间与利润全链追溯。</p>
        </div>
        <div className="ff-inline-actions">
          <Button
            variant="secondary"
            onClick={() =>
              runCommand(
                command('finance', 'createPayableImport', 'PIMP-20260722-08', 1, {
                  fileName: 'supplier-payables-202607.xlsx',
                }),
                '应付导入 PIMP-20260722-08 已创建',
                () => setWorkflowState('应付文件已导入，等待校验')
              )
            }
          >
            应付导入
          </Button>
          <Button
            onClick={() =>
              runCommand(
                command('finance', 'generateCharges', 'S2505120004', 11, {
                  source: 'WAYBILL_AND_LAST_MILE',
                }),
                '费用生成任务 JOB-FIN-260722-08 已提交'
              )
            }
          >
            生成费用
          </Button>
        </div>
      </div>
      <div className="ff-metric-strip ff-metric-strip--finance" aria-label="应收状态统计">
        {[
          ['¥268,450.50', '待生成应收'],
          ['¥86,320.30', '待审核'],
          ['¥52,140.00', '待生成账单'],
          ['¥1,284,530.00', '已出账'],
          ['¥96,310.20', '部分核销'],
          ['¥165,430.60', '逾期'],
        ].map(([value, label]) => (
          <button
            key={label}
            aria-pressed={selectedFilter === label}
            onClick={() => setSelectedFilter(label)}
          >
            <strong>{value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="ff-finance-layout">
        <div className="ff-stack">
          <div className="ff-filter-row">
            <label>
              客户
              <select>
                <option>全部客户</option>
                <option>深圳鑫源贸易有限公司</option>
              </select>
            </label>
            <label>
              币种
              <select>
                <option>全部</option>
                <option>CNY</option>
                <option>USD</option>
              </select>
            </label>
            <label>
              费用期间
              <input type="text" defaultValue="2026-07-01 ~ 2026-07-31" />
            </label>
            <Button variant="secondary" onClick={() => setSelectedFilter('高级筛选')}>
              高级筛选
            </Button>
          </div>
          <div className="ff-panel ff-table-panel">
            <div className="ff-panel-title">
              <div className="ff-inline-actions">
                <Button
                  variant="secondary"
                  disabled={selected.length === 0}
                  onClick={() =>
                    runCommand(
                      command('finance', 'reviewCharge', 'CHG-S2505120004', 11, {
                        selectedIds: selected,
                      }),
                      `已审核 ${selected.length} 条费用`
                    )
                  }
                >
                  审核
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    runCommand(
                      command('finance', 'createStatement', 'ST202605-0008', 2),
                      '账单 ST202605-0008 v2 已生成'
                    )
                  }
                >
                  生成账单
                </Button>
                <Button
                  variant="secondary"
                  disabled={allocationBlocked}
                  onClick={() =>
                    runCommand(
                      command('finance', 'allocateReceipt', 'RCT-20260722-03', 6, {
                        amountCents: 300000,
                      }),
                      '核销守恒校验通过，已核销 CNY 3,000.00'
                    )
                  }
                >
                  核销
                </Button>
              </div>
              <span>共 86 条 · 金额按最小币种单位守恒</span>
            </div>
            <DataTable
              ariaLabel="应收费用列表"
              columns={columns}
              rows={financeRows}
              rowKey={(row) => row.id}
              selectedKeys={selected}
              onSelectionChange={setSelected}
            />
          </div>
        </div>
        <aside className="ff-finance-detail" aria-label="应收详情">
          <div className="ff-panel-title">
            <h3>应收详情</h3>
            <StatusTag tone="warning">待审核</StatusTag>
          </div>
          <dl className="ff-compact-dl">
            <dt>运单号</dt>
            <dd>S2505120004</dd>
            <dt>客户</dt>
            <dd>深圳鑫源贸易有限公司</dd>
            <dt>费用版本</dt>
            <dd>v1.1 · 期望版本 11</dd>
          </dl>
          <div className="ff-money-overview">
            <div>
              <span>销售金额</span>
              <strong>{formatMoney(selectedCharge.salesCents)}</strong>
            </div>
            <div>
              <span>成本金额</span>
              <strong>{formatMoney(selectedCharge.costCents)}</strong>
            </div>
            <div>
              <span>毛利</span>
              <strong>{formatMoney(selectedCharge.salesCents - selectedCharge.costCents)}</strong>
            </div>
            <div>
              <span>毛利率</span>
              <strong>13.90%</strong>
            </div>
          </div>
          <div className="ff-charge-lines">
            <h4>费用明细</h4>
            {[
              ['基础运费', 468000],
              ['燃油附加费', 51480],
              ['偏远附加费', 8000],
              ['操作费', 4520],
            ].map(([label, cents]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>{formatMoney(Number(cents))}</strong>
              </div>
            ))}
            <div className="ff-charge-total">
              <span>合计</span>
              <strong>¥5,320.00</strong>
            </div>
          </div>
          <div className="ff-version-diff">
            <h4>版本差异与利润影响</h4>
            <p>v1.0 → v1.1：偏远附加费 +¥56.00；毛利率 +1.06%</p>
            <p>已核销 ¥3,000.00 · 未收 ¥2,320.00 · 未分配 ¥0.00</p>
          </div>
          <ol className="ff-audit-trail">
            <li>
              <strong>待审核</strong>
              <span>张伟 · 2026-07-22 10:21</span>
            </li>
            <li>
              <strong>生成费用 v1.1</strong>
              <span>系统 · 09:50</span>
            </li>
            <li>
              <strong>关联运单</strong>
              <span>系统 · 09:20</span>
            </li>
          </ol>
          <div className="ff-detail-actions">
            <Button
              onClick={() =>
                runCommand(
                  command('finance', 'reviewCharge', 'CHG-S2505120004', 11),
                  '费用 CHG-S2505120004 已审核，版本 11 已锁定'
                )
              }
            >
              审核通过
            </Button>
            <Button
              variant="danger"
              disabled={scenario.flowId === 'F06' && scenario.stateId === 'danger-unreview'}
              onClick={() => setDangerOpen(true)}
            >
              反审核
            </Button>
          </div>
        </aside>
      </div>
      <section className="ff-finance-workflows" aria-label="财务流程状态">
        <div className="ff-panel-title">
          <div>
            <h3>财务 P0 流程执行</h3>
            <p>{workflowState}</p>
          </div>
          <span className="ff-filter-state">筛选：{selectedFilter}</span>
        </div>
        <div className="ff-finance-modules" aria-label="财务功能入口">
          {(
            [
              [
                '校验应付导入',
                'validatePayableImport',
                'PIMP-20260722-08',
                1,
                '应付导入校验：98 成功 / 2 失败',
              ],
              [
                '提交部分成功项',
                'commitPayableImport',
                'PIMP-20260722-08',
                1,
                '应付导入部分提交：98 已提交 / 2 条保留失败',
              ],
              [
                '执行应付对账',
                'reconcilePayables',
                'RECON-PAYABLE-07',
                1,
                '应付对账完成：差异 2 条',
              ],
              [
                '调整费用',
                'adjustCharge',
                'CHG-S2505120004',
                11,
                '调整单 ADJ-CHG-S2505120004 已创建',
              ],
              [
                '发送账单',
                'sendStatement',
                'ST202605-0008',
                2,
                '账单 ST202605-0008 v2 已冻结并发送',
              ],
              [
                '创建供应商付款',
                'createDisbursement',
                'DISB-20260722-03',
                1,
                '供应商付款 DISB-20260722-03 已创建',
              ],
              [
                '分配付款',
                'allocateDisbursement',
                'DISB-20260722-03',
                3,
                '付款 CNY 3,000.00 已分配，未分配 0.00',
              ],
              [
                '发起账单争议',
                'openStatementDispute',
                'ST202605-0008',
                2,
                '账单争议 DSP-ST202605-0008-01 已创建',
              ],
              [
                '记录未分配收款',
                'recordReceipt',
                'RCT-20260722-03',
                6,
                '预存款 ¥3,000.00 已进入未分配余额',
              ],
              [
                '撤销核销',
                'reverseAllocation',
                'ALLOC-20260722-06',
                3,
                '核销 ALLOC-20260722-06 已撤销并回到未分配余额',
              ],
              [
                '创建预存款订单',
                'createPrepaymentOrder',
                'PREPAY-20260722-01',
                1,
                '预存款订单 PREPAY-20260722-01 已创建',
              ],
              [
                '创建支付订单',
                'createStatementPaymentOrder',
                'PAY-ST202605-0008',
                1,
                '支付订单 PAY-ST202605-0008 已创建',
              ],
              [
                '退款校验',
                'createPaymentRefund',
                'PAY-ST202605-0008',
                2,
                '退款 ¥320.00 已提交，未超过原支付余额',
              ],
              [
                '关闭支付订单',
                'closePaymentOrder',
                'PAY-ST202605-0008',
                2,
                '未支付订单 PAY-ST202605-0008 已关闭',
              ],
              [
                '执行支付对账',
                'reconcilePayments',
                'PAY-RECON-20260722',
                1,
                '微信账单对账完成：隔离金额异常 1 条',
              ],
              [
                '发布汇率版本',
                'publishExchangeRateSet',
                'FX-20260722',
                4,
                '汇率版本 FX-20260722 v4 已发布',
              ],
              ['执行费用分摊', 'allocateCharges', 'S2505120004', 11, '费用已按重量分摊，余额 0.00'],
              [
                '关闭财务期间',
                'closeFinancialPeriod',
                'PERIOD-2026-07',
                5,
                '财务期间 2026-07 已关闭',
              ],
              [
                '重开财务期间',
                'reopenFinancialPeriod',
                'PERIOD-2026-07',
                6,
                '财务期间 2026-07 已授权重开',
              ],
              [
                '创建发票申请',
                'createInvoiceRequest',
                'INV-202607-018',
                1,
                '发票 INV-202607-018 已申请',
              ],
              [
                '审批发票',
                'reviewInvoiceRequest',
                'INV-202607-018',
                2,
                '发票 INV-202607-018 已审批',
              ],
              [
                '利润回查',
                'getProfitTrace',
                'S2505120004',
                11,
                '利润链路已对账：收入 ¥5,320.00 / 成本 ¥4,580.50',
              ],
            ] as const
          ).map(([label, operationId, entityRef, version, result]) => (
            <button
              key={operationId}
              disabled={
                (operationId === 'reverseAllocation' && allocationBlocked) ||
                ((['createDisbursement', 'allocateDisbursement'] as string[]).includes(
                  operationId
                ) &&
                  paymentBlocked)
              }
              onClick={() =>
                runCommand(
                  command('finance', operationId, entityRef, version, {
                    amountCents: 300000,
                    commitMode: operationId === 'commitPayableImport' ? 'PARTIAL' : undefined,
                    reason:
                      operationId === 'openStatementDispute' ? '尾程附加费证据待补' : undefined,
                    decision: operationId === 'reviewInvoiceRequest' ? 'APPROVE' : undefined,
                  }),
                  result,
                  () => setWorkflowState(result)
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <Dialog
        open={dangerOpen}
        title="反审核费用"
        description="高风险操作：提交后不可静默覆盖下游数据。"
        size={640}
        onOpenChange={setDangerOpen}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={commandPending}
              onClick={() => setDangerOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              disabled={reason.trim().length < 5 || commandPending}
              onClick={() => {
                const validated = buildDangerousFinanceCommand({
                  action: 'UNREVIEW_CHARGE',
                  impact: '解锁账单 ST202605-0008 费用版本，要求重新检查支付分配与期间',
                  reason,
                  expectedVersion: 11,
                  auditDestination: 'audit://finance/charges/CHG-S2505120004',
                });
                return runCommand(
                  command('finance', 'unreviewCharge', 'CHG-S2505120004', 11, {
                    reason: validated.reason,
                    impact: validated.impact,
                    auditDestination: validated.auditDestination,
                  }),
                  '反审核已提交',
                  () => setDangerOpen(false)
                );
              }}
            >
              确认反审核
            </Button>
          </>
        }
      >
        <div className="ff-danger-grid">
          <div>
            <strong>影响</strong>
            <p>
              解锁账单 ST202605-0008 的费用版本；已核销 CNY 3,000.00 需重新检查；当前期间 2026-07
              未关闭。
            </p>
          </div>
          <div>
            <strong>并发与版本</strong>
            <p>本地版本 11 · 预期版本 11 · 提交前使用 If-Match 再检查。</p>
          </div>
          <div>
            <strong>审计去向</strong>
            <p className="ff-mono">audit://finance/charges/CHG-S2505120004</p>
          </div>
        </div>
        <Input
          label="操作原因"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="至少填写 5 个字"
          hint="原因会进入不可变审计日志并对账单查询可见。"
        />
      </Dialog>
    </section>
  );
}

export function FulfillmentFinanceWorkbench({
  initialSection = 'warehouse',
  initialViewState = 'normal',
  commandPort,
  onSectionChange,
  showScenarioControls = false,
}: FulfillmentFinanceWorkbenchProps) {
  const [section, setSection] = useState<FulfillmentSection>(initialSection);
  const [viewState, setViewState] = useState<WorkbenchViewState>(initialViewState);
  const [feedback, setFeedback] = useState<
    | { kind: 'pending'; message: string }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
    | null
  >(null);
  const [auditCount, setAuditCount] = useState(0);
  const [scenario, setScenario] = useState<OpsFlowSelection>(() => ({
    flowId:
      initialSection === 'warehouse'
        ? 'F03'
        : initialSection === 'linehaul'
          ? 'F04'
          : initialSection === 'tracking'
            ? 'F05'
            : 'F06',
    stateId: 'normal',
  }));
  const [dispatchConfirmationOpen, setDispatchConfirmationOpen] = useState(false);
  const [dispatchChecklistConfirmed, setDispatchChecklistConfirmed] = useState(false);
  const [scenarioUnreviewOpen, setScenarioUnreviewOpen] = useState(false);
  const [scenarioUnreviewReason, setScenarioUnreviewReason] = useState('');
  const [commandPending, setCommandPending] = useState(false);
  const commandPendingRef = useRef(false);
  const auditedCommandKeysRef = useRef(new Set<string>());
  const active = navItems.find((item) => item.id === section)!;
  const scenarioFlows: OpsFlowId[] =
    section === 'warehouse'
      ? ['F03']
      : section === 'linehaul'
        ? ['F04']
        : section === 'tracking'
          ? ['F05']
          : ['F06', 'F07'];

  const runCommand: RunCommand = async (nextCommand, successMessage, onResolved) => {
    if (commandPendingRef.current) return;
    commandPendingRef.current = true;
    setCommandPending(true);
    setFeedback({ kind: 'pending', message: `正在提交 ${nextCommand.operationId}` });
    try {
      const result = await commandPort.execute(nextCommand);
      onResolved?.();
      if (!auditedCommandKeysRef.current.has(nextCommand.idempotencyKey)) {
        auditedCommandKeysRef.current.add(nextCommand.idempotencyKey);
        setAuditCount((count) => count + 1);
      }
      setFeedback({
        kind: 'success',
        message: `${successMessage} · 审计 ${result.auditId}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '命令执行失败';
      setFeedback({ kind: 'error', message: `操作失败：${message}。输入与幂等键已保留，可重试。` });
    } finally {
      commandPendingRef.current = false;
      setCommandPending(false);
    }
  };

  const executeScenarioCommand = async (
    nextCommand: FulfillmentFinanceCommand,
    message: string
  ): Promise<FlowStateActionResult> => {
    if (commandPendingRef.current) throw new Error('已有命令正在执行，请等待完成');
    commandPendingRef.current = true;
    setCommandPending(true);
    try {
      const result = await commandPort.execute(nextCommand);
      if (!auditedCommandKeysRef.current.has(nextCommand.idempotencyKey)) {
        auditedCommandKeysRef.current.add(nextCommand.idempotencyKey);
        setAuditCount((count) => count + 1);
      }
      return {
        message,
        evidence: {
          kind: 'server',
          auditId: result.auditId,
          operationId: nextCommand.operationId,
        },
      };
    } finally {
      commandPendingRef.current = false;
      setCommandPending(false);
    }
  };

  const runScenarioAction = async (
    request: FlowStateActionRequest
  ): Promise<FlowStateActionResult> => {
    switch (request.actionId) {
      case 'attach-receipt-evidence':
        return executeScenarioCommand(
          command('warehouse', 'attachReceiptMedia', 'RCV-S2505120004', 7, {
            evidenceTypes: ['CARTON_FRONT', 'WEIGHT_READING'],
            retry: true,
          }),
          '收货证据补拍任务已提交，可继续关闭问题件'
        );
      case 'retry-issue-notification':
        return executeScenarioCommand(
          command('tracking', 'retryNotificationDelivery', 'NTF-260723-92', 1, {
            source: 'ISS-260723-019',
          }),
          '问题件通知已重新排队'
        );
      case 'download-load-report':
        return {
          message: 'clientAction 已生成装载兼容失败报告',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F04-REPORT' },
          download: {
            filename: 'load-compatibility-errors.csv',
            mimeType: 'text/csv',
            content:
              'waybill,reason\nS2505120031,目的地不符\nS2505120042,危险品标签缺失\nS2505120050,订舱约束不匹配\n',
          },
        };
      case 'request-release-approval':
        return executeScenarioCommand(
          command('tracking', 'requestShipmentHoldReleaseApproval', 'HOLD-S2505120004', 2, {
            reason: '信用扣货待财务放货审批',
            requestedAction: 'RELEASE',
          }),
          '放货审批已提交财务复核'
        );
      case 'open-dispatch-confirmation':
        setDispatchChecklistConfirmed(false);
        setDispatchConfirmationOpen(true);
        return {
          message: 'clientAction 已打开出仓二次确认',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F04-DISPATCH-CHECK' },
        };
      case 'retry-carrier-sync':
        return executeScenarioCommand(
          command('tracking', 'syncLastMilePartner', 'DHL', 12, {
            waybillNo: 'S2505120004',
            retry: true,
          }),
          '承运商轨迹同步已重新提交'
        );
      case 'retry-customer-notification':
        return executeScenarioCommand(
          command('tracking', 'retryNotificationDelivery', 'NTF-260723-91', 1, {
            source: 'S2505120004',
          }),
          '客户通知已重新排队'
        );
      case 'inspect-unreview-impact':
        setScenarioUnreviewReason('');
        setScenarioUnreviewOpen(true);
        return {
          message: 'clientAction 已加载反审核影响范围',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F06-UNREVIEW-IMPACT' },
        };
      case 'download-payable-report':
        return {
          message: 'clientAction 已生成应付导入错误报告',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F07-REPORT' },
          download: {
            filename: 'payable-import-errors.csv',
            mimeType: 'text/csv',
            content: 'sheet,row,column,error\n应付明细,183,F,费用编码缺失\n',
          },
        };
      case 'retry-failed-payables':
        return executeScenarioCommand(
          command('finance', 'validatePayableImport', 'PIMP-20260722-08', 1, {
            failedOnly: true,
            rowIds: [99, 100],
          }),
          '失败应付行已重新校验，成功项未重复提交'
        );
      default:
        throw new Error(`当前履约工作区不支持动作 ${request.actionId}`);
    }
  };

  const renderSection = () => {
    if (viewState !== 'normal') return viewStateEvidence[viewState];
    if (section === 'warehouse') return <WarehouseWorkbench runCommand={runCommand} />;
    if (section === 'linehaul')
      return <LinehaulWorkbench runCommand={runCommand} scenario={scenario} />;
    if (section === 'tracking') return <TrackingWorkbench runCommand={runCommand} />;
    return (
      <FinanceWorkbench
        runCommand={runCommand}
        scenario={scenario}
        commandPending={commandPending}
      />
    );
  };

  return (
    <div className="ff-workbench">
      <aside className="ff-nav" aria-label="履约与财务导航">
        <header>
          <strong>履约与结算</strong>
          <span>F1B 可执行域</span>
        </header>
        {navItems.map((item) => (
          <button
            key={item.id}
            data-active={section === item.id}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => {
              setSection(item.id);
              setScenario({
                flowId:
                  item.id === 'warehouse'
                    ? 'F03'
                    : item.id === 'linehaul'
                      ? 'F04'
                      : item.id === 'tracking'
                        ? 'F05'
                        : 'F06',
                stateId: 'normal',
              });
              setDispatchConfirmationOpen(false);
              setScenarioUnreviewOpen(false);
              setFeedback(null);
              onSectionChange?.(item.id);
            }}
          >
            <MiniIcon path={item.path} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
        <footer>
          <span>审计事件</span>
          <strong>{auditCount}</strong>
        </footer>
      </aside>
      <main className="ff-main">
        <header className="ff-toolbar">
          <div>
            <span>运营工作台 / {active.label}</span>
            <strong>{active.description}</strong>
          </div>
          {showScenarioControls ? (
            <label>
              验收状态
              <select
                aria-label="验收状态"
                value={viewState}
                onChange={(event) => setViewState(event.target.value as WorkbenchViewState)}
              >
                {[
                  ['normal', '正常'],
                  ['loading', '加载'],
                  ['empty', '空'],
                  ['failed', '失败'],
                  ['forbidden', '无权限'],
                  ['stale', '过期'],
                  ['partial', '部分成功'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </header>
        <div className="ff-content">
          {showScenarioControls || scenario.stateId !== 'normal' ? (
            <FlowStatePanel
              key={`${section}:${scenario.flowId}:${scenario.stateId}`}
              flows={scenarioFlows as [OpsFlowId, ...OpsFlowId[]]}
              value={scenario}
              onChange={setScenario}
              onAction={runScenarioAction}
              controlsVisible={showScenarioControls}
            />
          ) : null}
          {renderSection()}
        </div>
        {feedback ? (
          <div
            className="ff-toast"
            data-kind={feedback.kind}
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            <strong>
              {feedback.kind === 'pending'
                ? '正在执行'
                : feedback.kind === 'success'
                  ? '操作成功'
                  : '操作失败'}
            </strong>
            <span>{feedback.message}</span>
            <button aria-label="关闭反馈" onClick={() => setFeedback(null)}>
              ×
            </button>
          </div>
        ) : null}
      </main>
      <Dialog
        open={dispatchConfirmationOpen}
        title="出仓危险确认"
        description="确认后装载单封装并出仓，下游通知和不可变审计立即生效。"
        onOpenChange={setDispatchConfirmationOpen}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={commandPending}
              onClick={() => setDispatchConfirmationOpen(false)}
            >
              返回检查
            </Button>
            <Button
              variant="danger"
              disabled={!dispatchChecklistConfirmed || commandPending}
              onClick={() =>
                runCommand(
                  command('linehaul', 'dispatchLoadUnit', 'CNT-SZX-260722-01', 4, {
                    confirmedIssues: 2,
                    printedDocuments: 40,
                  }),
                  '装载单 CNT-SZX-260722-01 已确认出库',
                  () => {
                    setScenario({ flowId: 'F04', stateId: 'normal' });
                    setDispatchConfirmationOpen(false);
                    setDispatchChecklistConfirmed(false);
                  }
                )
              }
            >
              确认出库并记录审计
            </Button>
          </>
        }
      >
        <div className="ff-danger-grid">
          <div>
            <strong>出仓影响</strong>
            <p>42 票 / 5,187.20 kg；当前仍有 2 项未关闭问题。</p>
          </div>
          <div>
            <strong>打印与交接</strong>
            <p>打印完成 40 / 42；确认后必须在审计中说明差异。</p>
          </div>
          <label>
            <input
              type="checkbox"
              checked={dispatchChecklistConfirmed}
              onChange={(event) => setDispatchChecklistConfirmed(event.target.checked)}
            />
            已核对未关闭问题与打印清单
          </label>
        </div>
      </Dialog>
      <Dialog
        open={scenarioUnreviewOpen}
        title="反审核影响范围"
        description="场景操作会解除费用锁定，并要求重新检查支付分配和期间。"
        onOpenChange={setScenarioUnreviewOpen}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={commandPending}
              onClick={() => setScenarioUnreviewOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              disabled={scenarioUnreviewReason.trim().length < 5 || commandPending}
              onClick={() =>
                runCommand(
                  command('finance', 'unreviewCharge', 'CHG-S2505120004', 11, {
                    reason: scenarioUnreviewReason.trim(),
                    impact: '账单、支付分配与期间 2026-07 需要重算',
                    auditDestination: 'audit://finance/charges/CHG-S2505120004',
                  }),
                  '场景反审核已提交',
                  () => {
                    setScenario({ flowId: 'F06', stateId: 'normal' });
                    setScenarioUnreviewOpen(false);
                    setScenarioUnreviewReason('');
                  }
                )
              }
            >
              确认反审核并记录审计
            </Button>
          </>
        }
      >
        <div className="ff-danger-grid">
          <div>
            <strong>影响范围</strong>
            <p>账单 ST202605-0008 解锁；期间 2026-07 需要重算；已核销 CNY 3,000.00 需复核。</p>
          </div>
        </div>
        <Input
          label="场景反审核原因"
          value={scenarioUnreviewReason}
          onChange={(event) => setScenarioUnreviewReason(event.target.value)}
          hint="至少填写 5 个字；提交后进入不可变审计。"
        />
      </Dialog>
    </div>
  );
}
