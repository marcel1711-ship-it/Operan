import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[14px] text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] hover-lift',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--brand-primary)] text-white shadow-sm hover:bg-[var(--brand-hover)] active:bg-[var(--brand-pressed)]',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-[var(--border-default)] bg-[rgba(255,255,255,0.04)] text-[var(--text-primary)] shadow-sm hover:bg-[rgba(255,255,255,0.08)] hover:border-[var(--border-strong)]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-foreground hover:bg-secondary',
        link: 'text-[var(--brand-primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
