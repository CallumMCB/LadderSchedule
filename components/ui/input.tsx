import * as React from "react";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
({ className = "", ...props }, ref) => (
<input
ref={ref}
{...props}
className={`h-9 px-3 rounded-2xl border border-neutral-300 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 ${className}`}
/>
)
);
Input.displayName = "Input";