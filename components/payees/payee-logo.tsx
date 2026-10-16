import { PAYEE_LOGOS } from "@/lib/payees/logos";

const channel = (value: number): number => {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};

const isExtreme = (hex: string): boolean => {
  const red = channel(Number.parseInt(hex.slice(0, 2), 16));
  const green = channel(Number.parseInt(hex.slice(2, 4), 16));
  const blue = channel(Number.parseInt(hex.slice(4, 6), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance < 0.08 || luminance > 0.92;
};

type PayeeLogoProps = {
  slug: string;
  className?: string;
};

export const PayeeLogo = ({ slug, className = "h-4 w-4" }: PayeeLogoProps) => {
  const logo = PAYEE_LOGOS[slug];
  if (!logo) return null;
  const fill = isExtreme(logo.hex) ? "currentColor" : `#${logo.hex}`;
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-hidden="true">
      <path fill={fill} d={logo.path} />
    </svg>
  );
};
