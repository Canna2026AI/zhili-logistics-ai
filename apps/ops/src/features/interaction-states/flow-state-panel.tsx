import { useRef, useState } from 'react';
import { Button, StatusTag } from '@zhili/ui';
import { opsFlowCatalog, type OpsFlowActionId, type OpsFlowId } from './flow-state-catalog';
import './flow-state-panel.css';

export interface OpsFlowSelection {
  flowId: OpsFlowId;
  stateId: string;
}

export interface FlowStateActionRequest {
  selection: OpsFlowSelection;
  actionId: OpsFlowActionId;
  kind: 'command' | 'clientAction';
}

export interface FlowStateActionResult {
  message: string;
  evidence:
    | {
        kind: 'server';
        operationId: string;
        auditId?: string;
        requestId?: string;
        resourceId?: string;
      }
    | { kind: 'local'; evidenceId: string };
  recoverToStateId?: string;
  details?: { title: string; items: string[] };
  download?: { filename: string; mimeType: string; content: string };
}

type NonEmptyFlows = readonly [OpsFlowId, ...OpsFlowId[]];

export interface FlowStatePanelProps {
  flows: NonEmptyFlows;
  value: OpsFlowSelection;
  onChange: (value: OpsFlowSelection) => void;
  onAction?: (request: FlowStateActionRequest) => Promise<FlowStateActionResult>;
  stateLabel?: string;
  controlsVisible?: boolean;
}

type Outcome =
  { kind: 'success'; result: FlowStateActionResult } | { kind: 'error'; message: string };

export function FlowStatePanel({
  flows,
  value,
  onChange,
  onAction,
  stateLabel,
  controlsVisible = false,
}: FlowStatePanelProps) {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const pendingRef = useRef(false);
  const selectedFlowId = flows.includes(value.flowId) ? value.flowId : flows[0];
  const flow = opsFlowCatalog[selectedFlowId];
  const state = flow.states.find((candidate) => candidate.id === value.stateId) ?? flow.states[0];

  const resetOutcome = () => setOutcome(null);
  const reset = () => {
    resetOutcome();
    onChange({ flowId: selectedFlowId, stateId: 'normal' });
  };
  const executeAction = async () => {
    if (!state.action || !onAction || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setOutcome(null);
    try {
      const result = await onAction({
        selection: { flowId: selectedFlowId, stateId: state.id },
        actionId: state.action.id,
        kind: state.action.kind,
      });
      setOutcome({ kind: 'success', result });
      if (result.recoverToStateId) {
        onChange({ flowId: selectedFlowId, stateId: result.recoverToStateId });
      }
    } catch (error) {
      setOutcome({
        kind: 'error',
        message: error instanceof Error ? error.message : '操作失败，请重试',
      });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <section className="ops-flow-state" aria-label={`${flow.id} 交互状态`}>
      <header>
        <div>
          <strong>{flow.label}</strong>
          <span>正常、失败、权限、并发与恢复路径</span>
        </div>
        {controlsVisible ? (
          <div className="ops-flow-state__selectors">
            <label>
              业务流程
              <select
                aria-label="业务流程"
                value={selectedFlowId}
                disabled={pending}
                onChange={(event) => {
                  resetOutcome();
                  onChange({ flowId: event.target.value as OpsFlowId, stateId: 'normal' });
                }}
              >
                {flows.map((id) => (
                  <option key={id} value={id}>
                    {opsFlowCatalog[id].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {stateLabel ?? '流程状态'}
              <select
                aria-label={stateLabel ?? '流程状态'}
                value={state.id}
                disabled={pending}
                onChange={(event) => {
                  resetOutcome();
                  onChange({ flowId: selectedFlowId, stateId: event.target.value });
                }}
              >
                {flow.states.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </header>

      {state.id !== 'normal' ? (
        <div
          className="ops-flow-state__body"
          data-tone={state.tone}
          role={pending || outcome ? undefined : state.role}
        >
          <div className="ops-flow-state__copy">
            <StatusTag tone={state.tone === 'info' ? 'info' : state.tone}>{state.label}</StatusTag>
            <h3>{state.title}</h3>
            <p>{state.description}</p>
            <ul>
              {state.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="ops-flow-state__actions">
            {controlsVisible ? (
              <Button variant="secondary" size="compact" disabled={pending} onClick={reset}>
                返回正常流程
              </Button>
            ) : null}
            {state.action ? (
              <Button
                size="compact"
                disabled={pending || !onAction}
                onClick={() => void executeAction()}
              >
                {pending ? '处理中…' : state.action.label}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {outcome?.kind === 'success' ? (
        <section className="ops-flow-state__result" aria-label="操作结果">
          <p className="ops-flow-state__feedback" role="status" aria-live="polite">
            {outcome.result.message} ·{' '}
            {outcome.result.evidence.kind === 'server'
              ? outcome.result.evidence.auditId
                ? `审计 ${outcome.result.evidence.auditId} · ${outcome.result.evidence.operationId}`
                : outcome.result.evidence.requestId
                  ? `请求追踪 ${outcome.result.evidence.requestId} · ${outcome.result.evidence.operationId}`
                  : `服务端资源 ${outcome.result.evidence.resourceId ?? '已更新'} · ${outcome.result.evidence.operationId}`
              : `本地证据 ${outcome.result.evidence.evidenceId}`}
          </p>
          {outcome.result.details ? (
            <section aria-label={outcome.result.details.title}>
              <h4>{outcome.result.details.title}</h4>
              <ul>
                {outcome.result.details.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {outcome.result.download ? (
            <a
              download={outcome.result.download.filename}
              href={`data:${outcome.result.download.mimeType};charset=utf-8,${encodeURIComponent(outcome.result.download.content)}`}
            >
              下载 {outcome.result.download.filename}
            </a>
          ) : null}
        </section>
      ) : null}
      {outcome?.kind === 'error' ? (
        <p className="ops-flow-state__feedback ops-flow-state__feedback--error" role="alert">
          操作失败：{outcome.message}。当前状态与输入已保留。
        </p>
      ) : null}
    </section>
  );
}
