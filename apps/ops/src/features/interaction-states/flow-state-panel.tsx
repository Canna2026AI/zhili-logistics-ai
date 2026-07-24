import { useMemo, useState } from 'react';
import { Button, StatusTag } from '@zhili/ui';
import { opsFlowCatalog, type OpsFlowId } from './flow-state-catalog';
import './flow-state-panel.css';

export interface FlowStatePanelProps {
  flows: OpsFlowId[];
  initialFlow?: OpsFlowId;
  stateLabel?: string;
}

export function FlowStatePanel({ flows, initialFlow = flows[0], stateLabel }: FlowStatePanelProps) {
  const [flowId, setFlowId] = useState<OpsFlowId>(initialFlow);
  const [stateId, setStateId] = useState('normal');
  const [feedback, setFeedback] = useState('');
  const flow = opsFlowCatalog[flowId];
  const state = useMemo(
    () => flow.states.find((candidate) => candidate.id === stateId) ?? flow.states[0],
    [flow, stateId]
  );

  const reset = () => {
    setStateId('normal');
    setFeedback('');
  };

  return (
    <section className="ops-flow-state" aria-label={`${flowId} 交互状态`}>
      <header>
        <div>
          <strong>{flow.label}</strong>
          <span>正常、失败、权限、并发与恢复路径</span>
        </div>
        <div className="ops-flow-state__selectors">
          <label>
            业务流程
            <select
              aria-label="业务流程"
              value={flowId}
              onChange={(event) => {
                setFlowId(event.target.value as OpsFlowId);
                reset();
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
              onChange={(event) => {
                setStateId(event.target.value);
                setFeedback('');
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
      </header>

      {state.id !== 'normal' ? (
        <div className="ops-flow-state__body" data-tone={state.tone} role={state.role}>
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
            <Button variant="secondary" size="compact" onClick={reset}>
              返回正常流程
            </Button>
            {state.primaryAction ? (
              <Button
                size="compact"
                onClick={() => {
                  setFeedback(state.actionFeedback ?? '操作已受理');
                  if (state.recoverOnPrimary) setStateId('normal');
                }}
              >
                {state.primaryAction}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {feedback ? <p className="ops-flow-state__feedback">{feedback}</p> : null}
    </section>
  );
}
