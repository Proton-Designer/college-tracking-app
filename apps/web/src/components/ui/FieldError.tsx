export interface FieldErrorProps {
  children: string;
}

/** Always paired with a `risk-critical` border on the field itself — color alone is never the error. */
export function FieldError({ children }: FieldErrorProps) {
  return (
    <p role="alert" className="text-body-s text-risk-critical">
      {children}
    </p>
  );
}
