/* ============================================================
   INVOICE BRANDING & TERMS — edit here only.
   Only confirmed details are listed; add the rest when confirmed.
============================================================ */
export const BRAND = {
  name: "TECHNO X LAPTOPS",
  tagline: "Laptop & Smart Devices",
  logo: "/technox-logo-invoice.png",
  phones: ["0328-4350505", "0322-4350505", "0303-4350505"],
  website: "https://technox.pk",
  websiteLabel: "technox.pk",
  address: "Siddique Trade Center, Lahore",
  /* every platform uses the same name; shown as a small badge + the name */
  socialName: "Techno X Laptops",
  social: [
    { label: "Facebook", short: "f", color: "#1877F2" },
    { label: "Instagram", short: "IG", color: "#E1306C" },
    { label: "TikTok", short: "TT", color: "#111111" },
    { label: "YouTube", short: "YT", color: "#FF0000" },
  ],
  thankYou: "Thank you for choosing Techno X Laptops. We appreciate your trust.",
};

/* Laptop warranty shown on every product line */
export const WARRANTY_DAYS = 100;
export const DEFAULT_ITEM_WARRANTY = `${WARRANTY_DAYS} Days`;

export const WARRANTY_TERMS: { title: string; text: string }[] = [
  { title: "Laptop Warranty", text: "100 days warranty, subject to applicable terms and conditions." },
  { title: "Battery Warranty", text: "1 hour battery time warranty, subject to the approved battery warranty policy." },
  { title: "Physical Damage", text: "Physical damage, broken screens, cracked bodies and damage caused by accidents or misuse are not covered." },
  { title: "Liquid Damage", text: "Liquid or water damage is not covered." },
  { title: "Burn / Dead Damage", text: "Burnt components, dead laptop, or damage from electrical misuse, short circuits or external power incidents are not covered." },
  { title: "Unauthorized Repair", text: "Unauthorized repair, tampering or modifications may void the warranty." },
  { title: "Warranty Verification", text: "Claims are verified using this invoice, the warranty sticker and the product serial number." },
  { title: "Exchange Policy", text: "7-day exchange policy, subject to Techno X exchange terms." },
];

/* 03XX / +92 / 92 -> 923XXXXXXXXX for wa.me links (null if not a valid PK mobile) */
export function waNumber(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (/^03\d{9}$/.test(d)) return "92" + d.slice(1);
  if (/^923\d{9}$/.test(d)) return d;
  if (/^3\d{9}$/.test(d)) return "92" + d;
  return null;
}
