import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-[12px] border border-white/[0.08] bg-[#0F172A] px-3.5 py-2.5 text-sm text-white shadow-sm transition-all duration-200 placeholder:text-[#71717A] focus-visible:outline-none focus-visible:border-[#5A6BFF] focus-visible:shadow-[0_0_0_3px_rgba(90,107,255,0.12)] disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
