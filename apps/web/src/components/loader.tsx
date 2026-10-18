import { useLocation } from "@tanstack/react-router";
import { Skeleton } from "@web-kwu/ui/components/skeleton";

/** Skeleton block tinted for the light storefront/admin surfaces (the root `<html>` is `dark`). */
function Bone({ className = "" }: { className?: string }) {
  return <Skeleton className={`rounded-lg bg-lilac/60 ${className}`} />;
}

/** Router default: picks the skeleton that matches the area being loaded. */
export default function Loader() {
  const { pathname } = useLocation();

  // Dashboard child routes render inside the admin layout, so only the content column is needed.
  return pathname.startsWith("/dashboard") ? <AdminPageSkeleton /> : <StorefrontSkeleton />;
}

export function StorefrontSkeleton() {
  return (
    <div aria-busy className="flex min-h-svh flex-col bg-white font-body">
      <header className="border-b border-ube-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 lg:h-[78px] lg:px-16">
          <Bone className="size-12 rounded-full lg:size-[58px]" />
          <div className="hidden items-center gap-[34px] lg:flex">
            {Array.from({ length: 4 }, (_, index) => (
              <Bone key={index} className="h-3.5 w-20" />
            ))}
          </div>
          <Bone className="size-10 lg:h-12 lg:w-40 lg:rounded-full" />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto grid w-full max-w-[1280px] gap-[13px] px-5 py-[25px] lg:min-h-[400px] lg:grid-cols-[minmax(0,560px)_1fr] lg:items-center lg:gap-[42px] lg:px-16 lg:pt-[42px] lg:pb-10">
          <div className="flex flex-col gap-[13px] lg:gap-[18px]">
            <Bone className="h-7 w-56 rounded-full" />
            <Bone className="h-9 w-full max-w-[480px] lg:h-12" />
            <Bone className="h-9 w-3/4 lg:h-12" />
            <Bone className="h-4 w-full" />
            <Bone className="h-4 w-5/6" />
            <Bone className="mt-2 h-12 w-48 rounded-full" />
          </div>
          <Bone className="aspect-[4/3] w-full rounded-3xl" />
        </section>

        <section className="mx-auto grid w-full max-w-[1280px] grid-cols-2 gap-4 px-5 pb-10 lg:grid-cols-4 lg:gap-6 lg:px-16">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-3">
              <Bone className="aspect-square w-full rounded-2xl" />
              <Bone className="h-4 w-3/4" />
              <Bone className="h-4 w-1/2" />
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

/** Content column only; mirrors `AdminPage` + `PageHeading`. */
export function AdminPageSkeleton() {
  return (
    <main
      aria-busy
      className="flex min-w-0 flex-1 flex-col gap-5 px-5 pt-[88px] pb-7 lg:px-8 lg:pt-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Bone className="h-3 w-40" />
          <Bone className="h-9 w-72 max-w-full" />
          <Bone className="h-3 w-64 max-w-full" />
        </div>
        <Bone className="h-10 w-36" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Bone key={index} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-ube-line p-4">
        <Bone className="h-5 w-48" />
        {Array.from({ length: 6 }, (_, index) => (
          <Bone key={index} className="h-10 w-full" />
        ))}
      </div>
    </main>
  );
}

/** Full admin layout (sidebar + content), shown while the `_auth` guard resolves. */
export function AdminShellSkeleton() {
  return (
    <div className="flex min-h-svh bg-white font-body">
      <aside className="sticky top-0 hidden h-svh w-[214px] shrink-0 flex-col gap-7 border-r border-ube-line bg-vanilla px-[18px] py-7 lg:flex">
        <Bone className="size-[54px] rounded-full" />
        <Bone className="h-3 w-24" />
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 7 }, (_, index) => (
            <Bone key={index} className="h-10 w-full" />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-ube-line pt-4">
          <Bone className="h-3 w-20" />
          <Bone className="h-4 w-32" />
          <Bone className="h-3 w-40" />
        </div>
      </aside>
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-ube-line bg-vanilla px-5 py-3 lg:hidden">
        <Bone className="size-10 rounded-full" />
        <Bone className="size-10" />
      </header>
      <AdminPageSkeleton />
    </div>
  );
}

/** Auth form placeholder: title, three fields and a submit button. */
export function FormSkeleton() {
  return (
    <div aria-busy className="mx-auto mt-10 flex w-full max-w-md flex-col gap-4 p-6">
      <Skeleton className="mx-auto mb-2 h-9 w-56" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
