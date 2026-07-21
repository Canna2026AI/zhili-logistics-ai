import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Input({ className = '', error, hint, id, label, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const description = error ?? hint;

  return (
    <div className={`zl-field ${className}`.trim()}>
      <label className="zl-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        className="zl-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={description ? descriptionId : undefined}
      />
      {description ? (
        <span
          id={descriptionId}
          className={`zl-field__description ${error ? 'zl-field__description--error' : ''}`.trim()}
        >
          {description}
        </span>
      ) : null}
    </div>
  );
}
