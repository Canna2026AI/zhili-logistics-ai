// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlowStatePanel, type FlowStateActionResult } from './flow-state-panel';

afterEach(cleanup);

describe('FlowStatePanel', () => {
  it('keeps production rendering read-only and constrains an invalid value to the allowed flow', () => {
    render(
      <FlowStatePanel
        flows={['F03']}
        value={{ flowId: 'F10', stateId: 'low-confidence' }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('region', { name: 'F03 交互状态' })).toBeVisible();
    expect(screen.queryByRole('combobox', { name: '业务流程' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '返回正常流程' })).not.toBeInTheDocument();
  });

  it('reports flow and state changes instead of owning business state', () => {
    const onChange = vi.fn();
    render(
      <FlowStatePanel
        flows={['F06', 'F07']}
        value={{ flowId: 'F06', stateId: 'normal' }}
        onChange={onChange}
        controlsVisible
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: '业务流程' }), {
      target: { value: 'F07' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ flowId: 'F07', stateId: 'normal' });

    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'stale-allocate' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ flowId: 'F06', stateId: 'stale-allocate' });
  });

  it('awaits a typed action, prevents duplicates and announces audited success', async () => {
    let resolveAction: ((value: FlowStateActionResult) => void) | undefined;
    const onAction = vi.fn(
      () =>
        new Promise<FlowStateActionResult>((resolve) => {
          resolveAction = resolve;
        })
    );
    render(
      <FlowStatePanel
        flows={['F03']}
        value={{ flowId: 'F03', stateId: 'partial-notify' }}
        onChange={vi.fn()}
        onAction={onAction}
      />
    );

    const retry = screen.getByRole('button', { name: '重试通知' });
    fireEvent.click(retry);
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(onAction).toHaveBeenCalledTimes(1);

    resolveAction?.({
      message: '通知 Job 已重新排队',
      evidence: {
        kind: 'server',
        auditId: 'AUD-retryNotificationDelivery',
        operationId: 'retryNotificationDelivery',
      },
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '通知 Job 已重新排队 · 审计 AUD-retryNotificationDelivery'
      )
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('keeps the selected state after rejection and exposes the error as an alert', async () => {
    const onAction = vi.fn(async () => {
      throw new Error('409 版本冲突');
    });
    render(
      <FlowStatePanel
        flows={['F05']}
        value={{ flowId: 'F05', stateId: 'failed-carrier' }}
        onChange={vi.fn()}
        onAction={onAction}
        controlsVisible
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '立即重试' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('409 版本冲突');
    expect(screen.getByRole('combobox', { name: '流程状态' })).toHaveValue('failed-carrier');
  });

  it('labels a client-only result as local evidence instead of server audit', async () => {
    render(
      <FlowStatePanel
        flows={['F04']}
        value={{ flowId: 'F04', stateId: 'failed-incompatible' }}
        onChange={vi.fn()}
        onAction={async () => ({
          message: '失败报告已生成',
          evidence: { kind: 'local', evidenceId: 'CLIENT-F04-REPORT' },
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '下载失败报告' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('本地证据');
    expect(status).not.toHaveTextContent('审计');
  });
});
