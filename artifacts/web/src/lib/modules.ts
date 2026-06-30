export const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  approvals: "Approvals",
  projects: "Projects",
  dprs: "DPRs",
  milestones: "Milestones",
  wbs: "WBS",
  workforce: "Workforce & EHS",
  supply_chain: "Supply Chain",
  estimation: "Estimation",
  boq: "BOQ vs Actual",
  financial: "Financial",
  variation_orders: "Variation Orders",
  dsr_rates: "DSR Rates",
  quality: "Quality",
  safety: "Safety",
  photos: "Photos",
  documents: "Documents",
};

export function getEffectiveModules(
  orgEnabled: string[] | null | undefined,
  projOverride: string[] | null | undefined,
): Set<string> | null {
  const org = orgEnabled == null ? null : new Set(orgEnabled);
  const proj = projOverride == null ? null : new Set(projOverride);
  if (org === null && proj === null) return null; // all enabled
  if (org === null) return proj!;
  if (proj === null) return org;
  return new Set([...org].filter((k) => proj.has(k)));
}

export function moduleEnabled(
  effective: Set<string> | null,
  key: string | null | undefined,
): boolean {
  if (!key) return true;
  if (effective === null) return true;
  return effective.has(key);
}
