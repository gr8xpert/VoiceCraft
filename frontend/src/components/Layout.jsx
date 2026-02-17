import React from 'react';
import StatusBar from './StatusBar';

/**
 * Main application layout - simplified without sidebar
 */
function Layout({ children }) {
  return (
    <div className="h-full flex flex-col bg-[var(--color-bg-primary)]">
      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}

export default Layout;
