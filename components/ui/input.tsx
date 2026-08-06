import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-[12px] border border-white/[0.08] bg-[#0F172A] px-3.5 py-2 text-sm text-white shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white placeholder:text-[#71717A] focus-visible:outline-none focus-visible:border-[#5A6BFF] focus-visible:shadow-[0_0_0_3px_rgba(90,107,255,0.12)] disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
