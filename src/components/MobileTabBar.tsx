import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Target, Shield, ArrowLeftRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFollowUpBadgeCount } from '@/hooks/useFollowUps';

/**
 * The four screens an agent actually uses, one thumb-reach away.
 *
 * The hamburger Sheet still holds everything — this is additive, not a
 * replacement. It carries only the four that get opened every day, because a
 * tab bar with eight items is a menu with extra steps.
 *
 * Deliberately not on every route in spirit: it is the mobile shell, so it
 * follows you rather than vanishing the moment you use it. `AppLayout` pads
 * the scroll container underneath so it never sits on top of content.
 */

interface Tab { to: string; icon: LucideIcon; label: string; badge?: boolean }

const TABS: Tab[] = [
  { to: '/', icon: LayoutDashboard, label: 'Board' },
  { to: '/needs', icon: Target, label: 'Needs' },
  { to: '/roster', icon: Shield, label: 'Roster' },
  { to: '/pitches', icon: ArrowLeftRight, label: 'Pitches' },
];

export default function MobileTabBar() {
  const location = useLocation();
  const badge = useFollowUpBadgeCount();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-[hsl(var(--sidebar-background)/0.96)] backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="flex">
        {TABS.map((tab) => {
          // Exact for the board, prefix for the rest, so /needs/:id still
          // highlights Needs rather than dropping the bar's sense of place.
          const active = tab.to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(tab.to);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={cn(
                'relative flex min-h-[48px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 py-2',
                active ? 'text-primary' : 'text-foreground/40',
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
                {tab.label}
              </span>
              {tab.to === '/needs' && badge > 0 && (
                <span className="absolute right-1/4 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
