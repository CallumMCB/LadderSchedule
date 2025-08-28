import * as React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
variant?: "default" | "outline";
size?: "sm" | "md" | "lg";
};

export function Button({ className = "", variant = "default", size = "md", ...props }: Props) {
const variantClass = variant === "outline" ? "border border-neutral-300 bg-white text-neutral-900" : "bg-neutral-900 text-white";
const sizeClass = size === "sm" ? "h-7 text-xs px-2" : size === "lg" ? "h-11 text-base px-5" : "h-9 text-sm px-3";
return (
<button
{...props}
className={`rounded-2xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${variantClass} ${sizeClass} ${className}`}
/>
);
}