import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

const inputClassName =
  "h-[50px] w-full rounded-[10px] border border-ube-line bg-surface px-[15px] font-body text-sm text-ink outline-none transition-colors placeholder:text-plum focus:border-ube-pop focus-visible:ring-2 focus-visible:ring-ube-pop/20 aria-invalid:border-red-500";

function FieldErrors({ errors }: { errors: ({ message?: string } | undefined)[] }) {
  return errors.map((error) => (
    <p key={error?.message} className="text-xs font-semibold text-red-600">
      {error?.message}
    </p>
  ));
}

export default function SignInForm() {
  const navigate = useNavigate({
    from: "/",
  });
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success("Berhasil masuk");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Format email tidak valid"),
        password: z.string().min(8, "Kata sandi minimal 8 karakter"),
      }),
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <div className="flex flex-col gap-[17px]">
        <form.Field name="email">
          {(field) => (
            <div className="flex flex-col gap-2">
              <label htmlFor={field.name} className="font-body text-[13px] font-bold text-ink">
                Email akun *
              </label>
              <input
                id={field.name}
                name={field.name}
                type="email"
                autoComplete="email"
                placeholder="nama@contoh.com"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                className={inputClassName}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={field.name} className="font-body text-[13px] font-bold text-ink">
                  Kata sandi *
                </label>
                {/* No self-service reset yet; recovery goes through the team administrator. */}
                <button
                  type="button"
                  onClick={() => toast.info("Hubungi administrator tim untuk pemulihan akun.")}
                  className="font-body text-xs font-bold text-deep-ube transition-colors hover:text-ube-pop"
                >
                  Lupa kata sandi?
                </button>
              </div>
              <div className="relative">
                <input
                  id={field.name}
                  name={field.name}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  className={`${inputClassName} pr-12 text-[15px]`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-plum transition-colors hover:text-deep-ube"
                >
                  {showPassword ? (
                    <EyeOff className="size-[18px]" />
                  ) : (
                    <Eye className="size-[18px]" />
                  )}
                </button>
              </div>
              <FieldErrors errors={field.state.meta.errors} />
            </div>
          )}
        </form.Field>

        <p className="font-body text-[11px]/[1.4] text-plum">
          Pastikan email dan kata sandi benar. Sesi tidak membagikan akses ke data pelanggan tanpa
          izin peran.
        </p>
      </div>

      <form.Subscribe
        selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}
      >
        {({ canSubmit, isSubmitting }) => (
          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="flex h-[50px] w-full items-center justify-center gap-[9px] rounded-full bg-deep-ube font-body text-[15px] font-bold text-vanilla transition-colors hover:bg-ube-pop disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Memproses..." : "Masuk"}
            <ArrowRight className="size-[17px]" />
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
