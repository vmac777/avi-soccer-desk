import { NavLink as RouterNavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { BarChart3, Users, LogOut, Menu, Shield, ArrowLeftRight, ClipboardCheck, FileSearch, Activity, Target, LayoutDashboard, Newspaper } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState } from 'react';
import { useFollowUpBadgeCount } from '@/hooks/useFollowUps';
import BrandMark from '@/components/BrandMark';
import ProfileNameDialog from '@/components/ProfileNameDialog';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  hasBadge?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const adminSections: NavSection[] = [
  {
    label: 'CLUB NETWORK',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Board' },
      { to: '/contacts', icon: Users, label: 'Contacts' },
      { to: '/network', icon: BarChart3, label: 'Network' },
      { to: '/needs', icon: Target, label: 'Club Needs' },
      { to: '/pending-actions', icon: ClipboardCheck, label: 'Pending Actions', hasBadge: true },
      { to: '/news/repository', icon: Newspaper, label: 'Club News' },
    ],
  },
  {
    label: 'REPRESENTATION',
    items: [
      { to: '/roster', icon: Shield, label: 'Roster' },
      { to: '/pitches', icon: ArrowLeftRight, label: 'Pitches' },
    ],
  },
  {
    label: 'ADMIN',
    items: [],
  },
];

const superAdminExtraItems = [
  { to: '/admin/audit', icon: FileSearch, label: 'Audit' },
  { to: '/admin/system-health', icon: Activity, label: 'System Health' },
];


const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, displayName, isAdmin, isSuperAdmin } = useAuth();
  const badgeCount = useFollowUpBadgeCount();
  const [nameOpen, setNameOpen] = useState(false);

  const sections = isAdmin
    ? adminSections.map((s) =>
        s.label === 'ADMIN' && isSuperAdmin
          ? { ...s, items: [...s.items, ...superAdminExtraItems] }
          : s
      )
    : [];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* Brand */}
      <div className="h-14 flex items-center px-5 border-b border-border">
        <BrandMark height={26} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="text-[10px] tracking-[0.15em] font-bold text-primary uppercase px-3 mb-2">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.to;
                const showBadge = (item as any).hasBadge && badgeCount > 0;
                return (
                  <RouterNavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150',
                      isActive
                        ? 'bg-accent text-primary border-l-2 border-primary'
                        : 'text-sidebar-foreground hover:bg-accent/50'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className={cn('flex-1', isActive && 'font-medium')}>{item.label}</span>
                    {showBadge && (
                      <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#c8952a', color: '#fff' }}>
                        {badgeCount}
                      </span>
                    )}
                  </RouterNavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between px-3 py-2">
          {/* The name is the control: it is the one place it already appears,
              so that is where somebody looks to change it. */}
          <button
            onClick={() => setNameOpen(true)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            title="Change your name"
          >
            {displayName}
          </button>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {nameOpen && <ProfileNameDialog open={nameOpen} onClose={() => setNameOpen(false)} />}
    </>
  );
};

const AppSidebar = () => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="fixed top-3 left-3 z-50 p-2 rounded-md bg-sidebar border border-border text-foreground hover:bg-accent transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[240px] p-0 bg-sidebar border-border [&>button]:hidden">
          <div className="min-h-screen flex flex-col">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className="w-[240px] min-h-screen bg-sidebar border-r border-border flex flex-col shrink-0">
      <SidebarContent />
    </aside>
  );
};

export default AppSidebar;
