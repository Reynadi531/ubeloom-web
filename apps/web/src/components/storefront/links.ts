// Menu, Cara pesan, and Pickup & delivery have their own frames in the design but no routes yet,
// so they point at the matching sections on the landing page for now.
export const storefrontLinks = [
  { href: "#menu", label: "Menu" },
  { href: "#cara-pesan", label: "Cara pesan" },
  { href: "#pickup-delivery", label: "Pickup & delivery" },
] as const;
