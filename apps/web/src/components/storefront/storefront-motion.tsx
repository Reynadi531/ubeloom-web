import { ReactLenis } from "lenis/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export default function StorefrontMotion({
  children,
  className,
  smoothScroll = false,
  transactional = false,
}: {
  children: ReactNode;
  className: string;
  smoothScroll?: boolean;
  transactional?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [motionEnabled, setMotionEnabled] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = transactional
      ? []
      : (root.current?.querySelectorAll<HTMLElement>(
          "[data-reveal], main > section:not(:first-of-type)",
        ) ?? []);
    let observer: IntersectionObserver | undefined;

    const updateMotion = () => {
      observer?.disconnect();
      setMotionEnabled(!preference.matches);
      elements.forEach((element) => element.removeAttribute("data-reveal-state"));

      if (preference.matches || !("IntersectionObserver" in window)) return;

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.setAttribute("data-reveal-state", "visible");
            observer?.unobserve(entry.target);
          });
        },
        { threshold: 0.05 },
      );

      elements.forEach((element) => {
        if (element.getBoundingClientRect().top < window.innerHeight) return;
        element.setAttribute("data-reveal-state", "pending");
        observer?.observe(element);
      });
    };

    updateMotion();
    preference.addEventListener("change", updateMotion);
    return () => {
      observer?.disconnect();
      preference.removeEventListener("change", updateMotion);
    };
  }, [transactional]);

  return (
    <div
      ref={root}
      className={`storefront-motion ${className}`}
      data-transactional={transactional || undefined}
    >
      {smoothScroll && motionEnabled && <ReactLenis root options={{ anchors: true }} />}
      {children}
    </div>
  );
}
