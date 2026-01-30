import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AppHeader } from '@/components/layout/AppHeader';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <AppHeader />
      <main className="w-full px-4 py-4">
        <Outlet />
      </main>
    </>
  );
}
