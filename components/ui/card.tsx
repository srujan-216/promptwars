import type { HTMLAttributes, ReactElement } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div
      className={cn('rounded-lg border border-slate-200 bg-white shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

export function CardTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): ReactElement {
  // `children` is destructured and passed explicitly so jsx-a11y can verify the
  // heading actually has content, rather than losing it inside a props spread.
  return (
    <h2 className={cn('text-lg font-semibold text-slate-900', className)} {...props}>
      {children}
    </h2>
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): ReactElement {
  return <p className={cn('text-sm text-slate-600', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
