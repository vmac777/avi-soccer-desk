import { ReactNode } from 'react';
import AppSidebar, { MobileNavSheet } from '@/components/AppSidebar';
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
        {/* Top bar. Slimmer on a phone, where 56px of branding is 56px not
            spent on the work — same content, smaller mark. */}
        <header className="h-11 sm:h-14 border-b border-border flex items-center px-3 sm:px-6 shrink-0">
          {/* The drawer trigger lives here rather than floating over the page. */}
          {isMobile && <MobileNavSheet />}
          <BrandMark height={isMobile ? 22 : 26} />
          <span className="text-muted-foreground mx-2 sm:mx-3">|</span>
          <span className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase truncate min-w-0">
            {CLIENT.deskName}
          </span>
        </header>
        {/* Main. The bottom padding clears the tab bar and the home indicator.
            Computed rather than a round number: 6rem was a guess that is short
            on one phone and wasteful on another, and being short means the bar
            covers the last row, which reads as content cut off. */}
        <main className="flex-1 overflow-auto p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
};

export default AppLayout;
