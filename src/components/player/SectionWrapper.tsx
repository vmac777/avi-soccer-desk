import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionWrapperProps {
  title: string;
  defaultOpen?: boolean;
  borderAccent?: string;
  children: React.ReactNode;
}

export default function SectionWrapper({ title, defaultOpen = true, borderAccent, children }: SectionWrapperProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('bg-card border border-border rounded-lg overflow-hidden', borderAccent)}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <h2 className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase">{title}</h2>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}
