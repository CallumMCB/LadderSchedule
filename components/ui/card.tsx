import * as React from "react";

export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
return <div {...props} className={`rounded-2xl border border-neutral-200 bg-white shadow-sm ${className}`} />;
}

export function CardContent({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
return <div {...props} className={`p-6 ${className}`} />;
}