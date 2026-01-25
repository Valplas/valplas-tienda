import * as React from 'react';
import { Label } from './label';
import { Input } from './input';
import { Textarea } from './textarea';
import { cn } from '@/lib/utils';

export interface BaseFormFieldProps {
  label: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
  id?: string;
  required?: boolean;
}

export interface InputFormFieldProps
  extends
    BaseFormFieldProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof BaseFormFieldProps> {
  as?: 'input';
}

export interface TextareaFormFieldProps
  extends
    BaseFormFieldProps,
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, keyof BaseFormFieldProps> {
  as: 'textarea';
}

export type FormFieldProps = InputFormFieldProps | TextareaFormFieldProps;

const FormField = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, FormFieldProps>(
  (props, ref) => {
    const {
      label,
      error,
      helperText,
      containerClassName,
      className,
      id,
      required,
      as = 'input',
      ...restProps
    } = props;

    const inputId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}`;

    return (
      <div className={cn('relative pb-5', containerClassName)}>
        <Label
          htmlFor={inputId}
          className={cn(required && 'after:content-["*"] after:ml-0.5 after:text-destructive')}
        >
          {label}
        </Label>
        {as === 'textarea' ? (
          <Textarea
            id={inputId}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            className={cn(error && 'border-destructive focus-visible:ring-destructive', className)}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...(restProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <Input
            id={inputId}
            ref={ref as React.Ref<HTMLInputElement>}
            className={cn(error && 'border-destructive focus-visible:ring-destructive', className)}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...(restProps as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        {error && (
          <p
            id={`${inputId}-error`}
            className="absolute top-full left-0 text-xs text-destructive mt-1"
          >
            {error}
          </p>
        )}
        {!error && helperText && (
          <p
            id={`${inputId}-helper`}
            className="absolute top-full left-0 text-xs text-muted-foreground mt-1"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
FormField.displayName = 'FormField';

export { FormField };
