import { Link, type LinkProps, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  CalendarDays,
  LayoutDashboard,
  type LucideIcon,
  Menu,
  Package,
  ReceiptText,
  Settings,
  Ticket,
  TicketPercent,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

interface NavItem {
  label: string;
  icon: LucideIcon;
  to: LinkProps["to"];
  /** Ringkasan sits at the admin root, so it only matches its own path. */
  exact?: boolean;
}

const navItems: NavItem[] = [
  { label: "Ringkasan", icon: LayoutDashboard, to: "/dashboard", exact: true },
  { label: "Pesanan", icon: ReceiptText, to: "/dashboard/pesanan" },
  { label: "Verifikasi bayar", icon: BadgeCheck, to: "/dashboard/verifikasi-bayar" },
  { label: "Produksi & kirim", icon: Package, to: "/dashboard/produksi-kirim" },
  { label: "Batch & produk", icon: CalendarDays, to: "/dashboard/batch-produk" },
  { label: "Voucher", icon: TicketPercent, to: "/dashboard/voucher" },
  { label: "Undian", icon: Ticket, to: "/dashboard/undian" },
  { label: "Pengaturan", icon: Settings, to: "/dashboard/pengaturan" },
];

const itemClassName =
  "flex items-center gap-[11px] rounded-[11px] px-[13px] py-[11px] text-xs transition-colors";

const drawerId = "admin-sidebar-drawer";

function useSignOut() {
  const navigate = useNavigate();
  return () =>
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/login" });
        },
        onError: (error) => {
          toast.error(error.error.message || error.error.statusText);
        },
      },
    });
}

interface SidebarUser {
  name: string;
  email: string;
}

export default function AdminSidebar({ user }: { user: SidebarUser }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onResize = () => desktop.matches && setOpen(false);
    const { overflow } = document.body.style;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onResize);
    };
  }, [open]);

  return (
    <>
      <aside className="sticky top-0 hidden h-svh w-[214px] shrink-0 border-r border-ube-line bg-vanilla lg:block print:hidden">
        <SidebarContent user={user} />
      </aside>

      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-ube-line bg-vanilla px-5 py-3 lg:hidden print:hidden">
        <Link to="/dashboard" aria-label="ubeloom ringkasan">
          <img
            src="/images/ubeloom-logo.webp"
            alt="ubeloom"
            width={40}
            height={40}
            className="size-10"
          />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka menu"
          aria-expanded={open}
          aria-controls={drawerId}
          className="flex size-10 items-center justify-center rounded-[10px] text-deep-ube transition-colors hover:bg-lilac/50"
        >
          <Menu className="size-5" />
        </button>
      </header>

      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-ink/40 transition-opacity lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-label="Menu admin"
        inert={!open}
        className={`fixed inset-y-0 left-0 z-50 w-[260px] max-w-[85vw] border-r border-ube-line bg-vanilla shadow-xl transition-transform duration-200 lg:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Tutup menu"
          className="absolute top-7 right-4 flex size-9 items-center justify-center rounded-[10px] text-deep-ube transition-colors hover:bg-lilac/50"
        >
          <X className="size-5" />
        </button>
        <SidebarContent user={user} onNavigate={() => setOpen(false)} />
      </div>
    </>
  );
}

function SidebarContent({ user, onNavigate }: { user: SidebarUser; onNavigate?: () => void }) {
  const signOut = useSignOut();

  return (
    <div className="flex h-full flex-col gap-7 overflow-y-auto px-[18px] py-7">
      <Link to="/dashboard" onClick={onNavigate} aria-label="ubeloom ringkasan" className="w-fit">
        <img
          src="/images/ubeloom-logo.webp"
          alt="ubeloom"
          width={54}
          height={54}
          className="size-[54px]"
        />
      </Link>

      <p className="text-[10px] font-bold tracking-[1.6px] text-plum">RUANG KERJA</p>

      <nav aria-label="Navigasi admin" className="flex flex-col gap-1.5">
        {navItems.map(({ label, icon: Icon, to, exact }) => (
          <Link
            key={label}
            to={to}
            onClick={onNavigate}
            activeOptions={{ exact }}
            className={`${itemClassName} group font-semibold text-ink hover:bg-lilac/50`}
            activeProps={{
              className: "bg-deep-ube font-bold text-vanilla hover:bg-deep-ube",
              "aria-current": "page",
            }}
          >
            <Icon className="size-[17px] shrink-0 text-plum group-aria-[current=page]:text-vanilla" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-[5px] border-t border-ube-line px-1 pt-4">
        <p className="text-[10px] font-bold tracking-[1px] text-plum">MASUK SEBAGAI</p>
        <p className="truncate text-[13px] font-bold text-ink">{user.name}</p>
        <p className="truncate text-[11px] text-plum">{user.email}</p>
        <button
          type="button"
          onClick={signOut}
          className="w-fit text-[11px] font-semibold text-deep-ube transition-colors hover:text-ube-pop"
        >
          Sesi aman · Keluar ↗
        </button>
      </div>
    </div>
  );
}
