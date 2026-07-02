import * as React from 'react'
import { cn } from '../../lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive'
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-white text-neutral-900 hover:bg-neutral-200',
  secondary: 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700',
  ghost: 'text-neutral-200 hover:bg-neutral-800',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
)
Button.displayName = 'Button'

export { Button }
