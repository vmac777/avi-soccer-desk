import { ReactNode } from 'react';
import AppSidebar from '@/components/AppSidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { CLIENT } from '@/config/client';
import BrandMark from '@/components/BrandMark';
import MobileTabBar from '@/components/MobileTabBar';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center px-4 sm:px-6 shrink-0">
          {/* Spacer for hamburger on mobile */}
          {isMobile && <div className="w-10 shrink-0" />}
          <BrandMark height={26} />
          <span className="text-muted-foreground mx-2 sm:mx-3">|</span>
          <span className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase truncate min-w-0">
            {CLIENT.deskName}
          </span>
        </header>
        {/* Main. The bottom padding on mobile is the tab bar's height plus the
            home indicator — without it the bar covers the last row of every
            page, which reads as content being cut off rather than as chrome. */}
        <main className="flex-1 overflow-auto p-4 pb-24 sm:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
};

export default AppLayout;
