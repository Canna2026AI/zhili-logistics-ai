import { AppShell, Button, StatusTag, type NavigationGroup, type WorkspaceTab } from '@zhili/ui';
import { useRef, useState } from 'react';
import { MasterDataPanel } from '@zhili/feature-identity-masterdata';
import {
  QuoteWorkbench,
  RateCatalogPanel,
  quoteWorkflowFixture,
  type CalculatedQuote,
  type QuoteWorkflowRequest,
  type QuoteViewState,
  type QuoteOperation,
} from '@zhili/feature-rates-routing';
import type { DomainApiError } from '@zhili/api-client';
import {
  ImportWorkbench,
  OrderDraftPanel,
  WaybillList,
  type AiMappingProposalRef,
  type ImportOperation,
  type ImportJobRef,
} from '@zhili/feature-waybills';
import { defaultOpsOrdersPorts, type OpsOrdersPorts } from './ports';
import {
  FlowStatePanel,
  type FlowStateActionRequest,
  type FlowStateActionResult,
  type OpsFlowSelection,
} from '../interaction-states';
import './orders-workspace.css';

type OrdersPage =
  'dashboard' | 'master-data' | 'rate-catalog' | 'quotes' | 'orders' | 'waybills' | 'imports';

const navigation: NavigationGroup[] = [
  { label: '运营工作台', items: [{ id: 'dashboard', label: '工作台' }] },
  { label: '主数据', items: [{ id: 'master-data', label: '主数据' }] },
  {
    label: '渠道报价',
    items: [
      { id: 'rate-catalog', label: '渠道价卡' },
      { id: 'quotes', label: '报价管理' },
    ],
  },
  {
    label: '订单运单',
    items: [
      { id: 'waybills', label: '运单管理' },
      { id: 'orders', label: '订单草稿' },
      { id: 'imports', label: '导入运单' },
    ],
  },
  { label: '仓库', items: [{ id: 'warehouse', label: '仓库管理' }] },
  { label: '订舱/提单', items: [{ id: 'booking', label: '订舱管理' }] },
  { label: '尾程', items: [{ id: 'last-mile', label: '尾程管理' }] },
  { label: '轨迹客服', items: [{ id: 'tracking', label: '轨迹与问题件' }] },
  { label: '财务', items: [{ id: 'finance', label: '应收应付' }] },
  { label: '报表', items: [{ id: 'reports', label: '运营报表' }] },
  { label: '自动化集成', items: [{ id: 'automation', label: '自动化配置' }] },
  {
    label: '系统',
    items: [
      { id: 'settings', label: '系统设置' },
      { id: 'permissions', label: '权限管理' },
    ],
  },
];

const labels: Record<OrdersPage, string> = {
  dashboard: '运营工作台',
  'master-data': '主数据',
  'rate-catalog': '渠道价卡',
  quotes: '新建预报 / 报价',
  orders: '订单草稿',
  waybills: '运单管理',
  imports: '导入运单',
};

function OperationsDashboard({ onOpen }: { onOpen: (page: OrdersPage) => void }) {
  return (
    <section className="orders-dashboard">
      <header>
        <div>
          <h1>运营工作台</h1>
          <p>从异常和待办进入真实业务对象；数据时点 2026-07-22 09:32</p>
        </div>
        <Button onClick={() => onOpen('quotes')}>新建预报</Button>
      </header>
      <div className="orders-dashboard__metrics">
        <button onClick={() => onOpen('waybills')}>
          <strong>156</strong>
          <span>待收货运单</span>
        </button>
        <button onClick={() => onOpen('waybills')}>
          <strong>46</strong>
          <span>问题件</span>
        </button>
        <button onClick={() => onOpen('rate-catalog')}>
          <strong>3</strong>
          <span>价卡待发布</span>
        </button>
        <button onClick={() => onOpen('imports')}>
          <strong>2</strong>
          <span>导入待处理</span>
        </button>
      </div>
      <div className="orders-dashboard__lanes">
        <section>
          <h2>今日订单与报价</h2>
          <ol>
            <li>
              <strong>Q2505120042</strong>
              <span>DHL Express · CNY 5,320.00</span>
              <StatusTag tone="success">可提交</StatusTag>
            </li>
            <li>
              <strong>ORD-DRAFT-0268</strong>
              <span>Amazon FBA · 5 箱</span>
              <StatusTag tone="warning">待校验</StatusTag>
            </li>
          </ol>
        </section>
        <section>
          <h2>需要处理</h2>
          <ol>
            <li>
              <strong>S2505120004</strong>
              <span>已收货，待分货 · +1.50 kg</span>
              <StatusTag tone="warning">待分货</StatusTag>
            </li>
            <li>
              <strong>S2505120007</strong>
              <span>缺少客户补充资料</span>
              <StatusTag tone="danger">问题件</StatusTag>
            </li>
          </ol>
        </section>
      </div>
    </section>
  );
}

export interface OpsOrdersWorkspaceProps {
  initialPage?: OrdersPage;
  showPermissionController?: boolean;
  showScenarioControls?: boolean;
  ports?: Partial<OpsOrdersPorts>;
  onNavigateOutside?: (navigationId: string) => void;
}

export function OpsOrdersWorkspace({
  initialPage = 'waybills',
  showPermissionController = false,
  showScenarioControls = false,
  ports,
  onNavigateOutside,
}: OpsOrdersWorkspaceProps) {
  const [page, setPage] = useState<OrdersPage>(initialPage);
  const [openPages, setOpenPages] = useState<OrdersPage[]>(
    initialPage === 'dashboard' ? ['dashboard'] : ['dashboard', initialPage]
  );
  const [simulation, setSimulation] = useState(false);
  const [quoteFlow, setQuoteFlow] = useState<OpsFlowSelection>({
    flowId: 'F02',
    stateId: 'normal',
  });
  const [importFlow, setImportFlow] = useState<OpsFlowSelection>({
    flowId: 'F10',
    stateId: 'normal',
  });
  const [quoteDraft, setQuoteDraft] = useState<QuoteWorkflowRequest>(quoteWorkflowFixture);
  const [quoteSnapshot, setQuoteSnapshot] = useState<CalculatedQuote | null>(null);
  const [manualMappingOpen, setManualMappingOpen] = useState(false);
  const [manualMappingId, setManualMappingId] = useState('01JY8Z8F6ME4F0Y9QH2X6D4R7G');
  const [importJob, setImportJob] = useState<ImportJobRef | null>(null);
  const [importProposal, setImportProposal] = useState<AiMappingProposalRef | null>(null);
  const [mappingApplied, setMappingApplied] = useState(false);
  const [manualMappingJob, setManualMappingJob] = useState<ImportJobRef | null>(null);
  const [mappingPending, setMappingPending] = useState(false);
  const [mappingError, setMappingError] = useState('');
  const [mappingReceipt, setMappingReceipt] = useState<ImportJobRef | null>(null);
  const mappingPendingRef = useRef(false);
  const activePorts = { ...defaultOpsOrdersPorts, ...ports };

  const open = (next: OrdersPage) => {
    if (showScenarioControls && page !== next && next === 'quotes') {
      setQuoteFlow({ flowId: 'F02', stateId: 'normal' });
    }
    if (showScenarioControls && page !== next && next === 'imports') {
      setImportFlow({ flowId: 'F10', stateId: 'normal' });
      setManualMappingOpen(false);
      setMappingError('');
    }
    setPage(next);
    setOpenPages((pages) => (pages.includes(next) ? pages : [...pages, next]));
  };

  const handleQuoteError = (error: DomainApiError, operation: QuoteOperation) => {
    if (error.status === 410 || error.code === 'QUOTE_EXPIRED') {
      setQuoteFlow({ flowId: 'F02', stateId: 'expired' });
      return;
    }
    if (
      error.status === 409 ||
      error.status === 412 ||
      error.code === 'STALE_VERSION' ||
      error.code === 'PRECONDITION_FAILED'
    ) {
      setQuoteFlow({ flowId: 'F02', stateId: 'stale-rate' });
      return;
    }
    if (operation === 'quote') setQuoteFlow({ flowId: 'F02', stateId: 'failed-no-rate' });
  };

  const runFlowAction = async (request: FlowStateActionRequest): Promise<FlowStateActionResult> => {
    switch (request.actionId) {
      case 'requote-current-rules': {
        const quote = await activePorts.quotes.create(quoteDraft);
        setQuoteSnapshot(quote);
        return {
          message: `已生成新报价 ${quote.quoteNo}`,
          evidence: {
            kind: 'server',
            operationId: 'quote.create',
            resourceId: `quote:${quote.id}:v${quote.version}`,
          },
          recoverToStateId: 'normal',
          details: {
            title: '新报价快照',
            items: [`报价号 ${quote.quoteNo}`, `快照版本 v${quote.version}`, '旧快照仍保留审计'],
          },
        };
      }
      case 'open-manual-mapping': {
        if ((!importJob || !importProposal) && showScenarioControls) {
          const fixtureJob: ImportJobRef = {
            id: '01JY8Z8F6ME4F0Y9QH2X6D4R7E',
            version: 4,
            status: 'UPLOADED',
          };
          const fixtureProposal: AiMappingProposalRef = {
            id: '01JY8Z8F6ME4F0Y9QH2X6D4R7F',
            importId: fixtureJob.id,
            model: 'Zhili-Map 2.1',
            promptVersion: 'prompt-17',
            status: 'READY',
            version: 3,
            candidates: [
              {
                id: '01JY8Z8F6ME4F0Y9QH2X6D4R7G',
                sourceColumn: 'receiver_state',
                targetField: 'receiverState',
                confidence: 0.61,
                evidence: ['列名与历史映射相似'],
                risk: 'MEDIUM',
              },
              {
                id: '01JY8Z8F6ME4F0Y9QH2X6D4R7J',
                sourceColumn: 'province',
                targetField: 'receiverState',
                confidence: 0.32,
                evidence: ['样本值与州缩写部分匹配'],
                risk: 'MEDIUM',
              },
            ],
          };
          setImportJob(fixtureJob);
          setManualMappingJob(fixtureJob);
          setImportProposal(fixtureProposal);
          setManualMappingId(fixtureProposal.candidates[0]!.id);
        }
        setManualMappingOpen(true);
        return {
          message: 'clientAction 已进入人工字段映射，AI 建议保持可追溯',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F10-MAP' },
        };
      }
      case 'locate-quote-fields':
        return {
          message: '已定位缺失字段并保留当前报价输入',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F02-FIELDS' },
          details: {
            title: '需要补充的字段',
            items: ['目的地邮编末段', '包裹重量或替代渠道'],
          },
        };
      case 'compare-rate-rules':
        return {
          message: '已生成价卡规则差异，未覆盖当前报价快照',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F02-RATE-DIFF' },
          details: {
            title: 'v18 → v19 规则差异',
            items: ['销售价预计变化 +2.4%', '燃油附加费版本已更新'],
          },
        };
      case 'inspect-import-rollback':
        return {
          message: '已列出可回滚范围，当前批次尚未改变',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F10-ROLLBACK' },
          details: {
            title: '导入回滚影响',
            items: ['仅回滚本批次创建的可逆记录', '外部已消费记录将逐项拒绝'],
          },
        };
      default:
        throw new Error(`当前工作区不支持动作 ${request.actionId}`);
    }
  };

  const quoteViewState: QuoteViewState =
    quoteFlow.stateId === 'expired'
      ? 'expired'
      : quoteFlow.stateId === 'stale-rate'
        ? 'stale'
        : quoteFlow.stateId === 'failed-no-rate'
          ? 'failed'
          : quoteFlow.stateId === 'masked-cost' || simulation
            ? 'forbidden-cost'
            : 'normal';
  const quoteReadOnly =
    simulation || ['expired', 'stale-rate', 'failed-no-rate'].includes(quoteFlow.stateId);
  const importBlocked =
    simulation ||
    ['low-confidence', 'failed-model', 'forbidden'].includes(importFlow.stateId) ||
    manualMappingOpen ||
    mappingPending;

  const confirmManualMapping = async () => {
    if (mappingPendingRef.current) return;
    mappingPendingRef.current = true;
    setMappingPending(true);
    setMappingError('');
    try {
      const currentJob = manualMappingJob ?? importJob;
      if (!currentJob || !importProposal) {
        throw new Error('导入批次或 AI 提案尚未就绪');
      }
      const applied = await activePorts.imports.applyMapping(
        currentJob.id,
        currentJob.version,
        importProposal.id,
        importProposal.version,
        [manualMappingId]
      );
      setManualMappingJob(applied);
      setImportJob(applied);
      setMappingApplied(true);
      setMappingReceipt(applied);
      setManualMappingOpen(false);
      setImportFlow({ flowId: 'F10', stateId: 'normal' });
    } catch (error) {
      setMappingError(error instanceof Error ? error.message : '人工映射提交失败，请重试');
    } finally {
      mappingPendingRef.current = false;
      setMappingPending(false);
    }
  };

  const handleImportError = (error: DomainApiError, operation: ImportOperation) => {
    if (operation !== 'propose') return;
    const proposal = error.context?.proposal as AiMappingProposalRef | undefined;
    if (proposal) {
      setImportProposal(proposal);
      setManualMappingId(proposal.candidates[0]?.id ?? '');
    }
    if (error.status === 422 || error.code === 'AI_LOW_CONFIDENCE') {
      setImportFlow({ flowId: 'F10', stateId: 'low-confidence' });
    }
  };

  const tabs: WorkspaceTab[] = openPages.map((id) => ({
    id,
    label: labels[id],
    stale: false,
  }));

  const content =
    page === 'dashboard' ? (
      <OperationsDashboard onOpen={open} />
    ) : page === 'master-data' ? (
      <MasterDataPanel
        port={activePorts.masterData}
        readOnly={simulation}
        dataScope={simulation ? '深圳分公司' : '全租户'}
        maskPhone={simulation}
      />
    ) : page === 'rate-catalog' ? (
      <RateCatalogPanel port={activePorts.rates} readOnly={simulation} />
    ) : page === 'quotes' ? (
      <>
        <FlowStatePanel
          flows={['F02']}
          value={quoteFlow}
          onChange={setQuoteFlow}
          onAction={runFlowAction}
          stateLabel="报价状态"
          controlsVisible={showScenarioControls}
        />
        <QuoteWorkbench
          port={activePorts.quotes}
          state={quoteViewState}
          readOnly={quoteReadOnly}
          draft={quoteDraft}
          onDraftChange={setQuoteDraft}
          snapshot={quoteSnapshot}
          onSnapshotChange={(snapshot) => {
            setQuoteSnapshot(snapshot);
            if (['stale-rate', 'expired', 'failed-no-rate'].includes(quoteFlow.stateId)) {
              setQuoteFlow({ flowId: 'F02', stateId: 'normal' });
            }
          }}
          onError={handleQuoteError}
        />
      </>
    ) : page === 'orders' ? (
      <OrderDraftPanel port={activePorts.orders} readOnly={simulation} />
    ) : page === 'imports' ? (
      <>
        <FlowStatePanel
          flows={['F10']}
          value={importFlow}
          onChange={(selection) => {
            setImportFlow(selection);
            if (selection.stateId !== 'low-confidence') setManualMappingOpen(false);
          }}
          onAction={runFlowAction}
          stateLabel="AI 导入状态"
          controlsVisible={showScenarioControls}
        />
        {manualMappingOpen ? (
          <section className="orders-manual-mapping" role="region" aria-label="AI 人工字段映射">
            <header>
              <div>
                <h2>AI 人工字段映射</h2>
                <p>模型 Zhili-Map 2.1 的低置信度建议；人工选择会写入导入批次审计。</p>
              </div>
              <StatusTag tone="warning">待人工确认</StatusTag>
            </header>
            <label>
              收件州候选字段
              <select
                aria-label="收件州候选字段"
                value={manualMappingId}
                disabled={mappingPending}
                onChange={(event) => setManualMappingId(event.target.value)}
              >
                {importProposal?.candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.sourceColumn} → {candidate.targetField}（置信度{' '}
                    {Math.round(candidate.confidence * 100)}%）
                  </option>
                ))}
              </select>
            </label>
            <div className="orders-manual-mapping__actions">
              <Button disabled={mappingPending} onClick={() => void confirmManualMapping()}>
                {mappingPending ? '提交中…' : '确认人工映射'}
              </Button>
            </div>
            {mappingError ? (
              <p role="alert">提交失败：{mappingError}。当前批次、版本与人工选择已保留。</p>
            ) : null}
          </section>
        ) : null}
        {mappingReceipt ? (
          <p className="orders-mapping-receipt" role="status">
            人工映射已应用 · 批次 {mappingReceipt.id} · v{mappingReceipt.version} ·{' '}
            {mappingReceipt.evidence?.kind === 'audit'
              ? `审计 ${mappingReceipt.evidence.auditId}`
              : mappingReceipt.evidence?.kind === 'trace'
                ? `请求追踪 ${mappingReceipt.evidence.requestId}`
                : mappingReceipt.evidence?.kind === 'resource'
                  ? `资源 ${mappingReceipt.evidence.resourceId}`
                  : '服务端未返回证据编号'}
          </p>
        ) : null}
        <ImportWorkbench
          port={activePorts.imports}
          readOnly={importBlocked}
          job={importJob}
          proposal={importProposal}
          mappingApplied={mappingApplied}
          onBatchCreated={(job) => {
            setImportJob(job);
            setManualMappingJob(job);
            setImportProposal(null);
            setMappingApplied(false);
            setMappingReceipt(null);
            setManualMappingOpen(false);
            setMappingError('');
            setImportFlow({ flowId: 'F10', stateId: 'normal' });
          }}
          onJobChange={(job) => {
            setImportJob(job);
            setManualMappingJob(job);
          }}
          onProposalChange={(proposal) => {
            setImportProposal(proposal);
            setManualMappingId(proposal.candidates[0]?.id ?? '');
          }}
          onError={handleImportError}
        />
      </>
    ) : (
      <WaybillList
        port={activePorts.waybills}
        readOnly={simulation}
        dataScope={simulation ? '深圳分公司' : '全租户'}
        fieldPolicy={
          simulation
            ? {
                customer: 'MASK',
                customerCode: 'MASK',
                contactName: 'MASK',
                contactPhone: 'MASK',
              }
            : undefined
        }
        onCreate={() => open('quotes')}
      />
    );

  return (
    <AppShell
      brand="智立科技物流AI系统"
      tenant="智立科技物流（深圳）有限公司"
      navigation={navigation}
      activeNavigationId={page}
      tabs={tabs}
      activeTabId={page}
      onNavigate={(id) => {
        if (id in labels) open(id as OrdersPage);
        else onNavigateOutside?.(id);
      }}
      onTabChange={(id) => open(id as OrdersPage)}
    >
      {showPermissionController ? (
        <div
          className={
            simulation ? 'orders-permission orders-permission--active' : 'orders-permission'
          }
        >
          {simulation ? (
            <>
              <div>
                <strong>权限模拟：王丽 · 客服专员</strong>
                <span>
                  waybill.read 被 ALLOW、waybill.write 被
                  DENY，其他写动作同步禁用；数据范围仅深圳分公司；手机号按字段策略脱敏。模拟剩余 13
                  分钟，操作会记录审计。
                </span>
              </div>
              <Button size="compact" variant="secondary" onClick={() => setSimulation(false)}>
                结束模拟
              </Button>
            </>
          ) : (
            <>
              <span>当前视角：运营管理员 · 全租户业务范围</span>
              <Button size="compact" variant="secondary" onClick={() => setSimulation(true)}>
                模拟只读权限
              </Button>
            </>
          )}
        </div>
      ) : null}
      {content}
    </AppShell>
  );
}

export default OpsOrdersWorkspace;
