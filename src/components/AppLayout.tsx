import { ReactNode } from 'react';
import AppSidebar from '@/components/AppSidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { CLIENT } from '@/config/client';
import BrandMark from '@/components/BrandMark';

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
        <header className="h-14 border-b border-border flex items-center px-6 shrink-0">
          {/* Spacer for hamburger on mobile */}
          {isMobile && <div className="w-10" />}
          <BrandMark height={26} />
          <span className="text-muted-foreground mx-3">|</span>
          <span className="text-[11px] tracking-[0.15em] text-muted-foreground uppercase truncate">
            {CLIENT.deskName}
          </span>
        </header>
        {/* Main */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
