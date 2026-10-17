import { Outlet, createFileRoute } from "@tanstack/react-router";

import AdminSidebar from "@/components/admin/admin-sidebar";
import { requireUser } from "@/functions/get-user";
import { requireAuthMiddleware } from "@/middleware/auth";

export const Route = createFileRoute("/_auth")({
  // Guards document requests on the server before anything renders.
  server: {
    middleware: [requireAuthMiddleware],
  },
  // Guards client-side navigations; the server fn redirects when signed out.
  beforeLoad: async () => {
    const session = await requireUser();
    return { session };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { session } = Route.useRouteContext();

  return (
    <div className="flex min-h-svh bg-white font-body text-ink">
      <AdminSidebar userName={session.user.name} />
      <Outlet />
    </div>
  );
}
