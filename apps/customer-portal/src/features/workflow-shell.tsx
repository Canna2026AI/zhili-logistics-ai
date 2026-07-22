import type { ReactNode } from 'react';

export type WorkflowTone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

type WorkflowShellProps = {
  code: string;
  title: string;
  description: string;
  steps: string[];
  activeStep: number;
  panelTitle: string;
  status: string;
  tone?: WorkflowTone;
  summaryTitle: string;
  summary: ReactNode;
  children: ReactNode;
  actions: ReactNode;
};

export function WorkflowShell({
  code,
  title,
  description,
  steps,
  activeStep,
  panelTitle,
  status,
  tone = 'primary',
  summaryTitle,
  summary,
  children,
  actions,
}: WorkflowShellProps) {
  return (
    <section className="customer-workflow" data-tone={tone}>
      <header className="customer-workflow__heading">
        <small>{code}</small>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <ol className="customer-workflow__steps" aria-label="流程进度">
        {steps.map((step, index) => (
          <li
            key={step}
            data-active={index === activeStep || undefined}
            data-done={index < activeStep || undefined}
          >
            <span>{index < activeStep ? '✓' : index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <div className="customer-workflow__workspace">
        <section className="customer-workflow__panel">
          <h2>{panelTitle}</h2>
          {children}
        </section>
        <aside className="customer-workflow__summary">
          <strong className="customer-workflow__status">{status}</strong>
          <h2>{summaryTitle}</h2>
          <div>{summary}</div>
          <small>操作将写入审计日志</small>
        </aside>
      </div>
      <footer className="customer-workflow__actions">{actions}</footer>
    </section>
  );
}

export function SummaryList({ children }: { children: ReactNode }) {
  return <dl className="customer-workflow__summary-list">{children}</dl>;
}

export function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
