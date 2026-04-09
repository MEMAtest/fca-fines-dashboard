import {
  Shield,
  TrendingDown,
  Building2,
  Scale,
  Banknote,
  FileText,
  Settings,
  Megaphone,
  Vault,
  AlertTriangle,
  ShieldCheck,
  Users,
  BookOpen,
  BadgeCheck,
  Eye,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon mapping for breach categories.
 * Maps breach category codes to their visual icons.
 */
export const BREACH_ICONS: Record<string, LucideIcon> = {
  AML: Shield,
  MARKET_ABUSE: TrendingDown,
  GOVERNANCE: Building2,
  CONDUCT: Scale,
  CLIENT_MONEY: Banknote,
  REPORTING: FileText,
  SYSTEMS_CONTROLS: Settings,
  FINANCIAL_PROMOTIONS: Megaphone,
  CLIENT_ASSETS: Vault,
  FINANCIAL_CRIME: AlertTriangle,
  PRUDENTIAL: ShieldCheck,
  CONSUMER_PROTECTION: Users,
  PRINCIPLES: BookOpen,
  AUTHORISATION: BadgeCheck,
  INSIDER_DEALING: Eye,
};

/**
 * Get breach icon with normalization for display labels.
 * Handles both enum format ("MARKET_ABUSE") and display labels ("Market Abuse").
 *
 * @param breachCategory - Category code or display label
 * @returns Lucide icon component
 *
 * @example
 * getBreachIcon('MARKET_ABUSE') // TrendingDown icon
 * getBreachIcon('Market Abuse') // TrendingDown icon (normalized)
 * getBreachIcon('unknown') // Sparkles icon (fallback)
 */
export function getBreachIcon(
  breachCategory: string | undefined,
): LucideIcon {
  if (!breachCategory) return Sparkles;

  // Normalize: uppercase + replace spaces with underscores
  const normalized = breachCategory.toUpperCase().replace(/\s+/g, "_");

  // Try normalized first, then raw, then fallback
  return BREACH_ICONS[normalized] ?? BREACH_ICONS[breachCategory] ?? Sparkles;
}
