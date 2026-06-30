export function n(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const f = parseFloat(String(v));
  return Number.isFinite(f) ? f : 0;
}

export function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const f = parseFloat(String(v));
  return Number.isFinite(f) ? f : null;
}

export function d(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}

export function dReq(v: unknown): string {
  return d(v) ?? new Date().toISOString();
}

export function serializeProject(p: any) {
  return {
    id: p.id,
    organisationId: p.organisationId,
    code: p.code,
    name: p.name,
    clientName: p.clientName ?? null,
    description: p.description ?? null,
    location: p.location ?? null,
    latitude: nOrNull(p.latitude),
    longitude: nOrNull(p.longitude),
    reraNumber: p.reraNumber ?? null,
    contractValue: n(p.contractValue),
    startDate: d(p.startDate),
    targetEndDate: d(p.targetEndDate),
    forecastEndDate: d(p.forecastEndDate),
    status: p.status,
    initiatedById: p.initiatedById ?? null,
    initiatedAt: d(p.initiatedAt),
    approvedById: p.approvedById ?? null,
    approvedAt: d(p.approvedAt),
    completedAt: d(p.completedAt),
    lastTransitionNote: p.lastTransitionNote ?? null,
    plannedPercent: n(p.plannedPercent),
    actualPercent: n(p.actualPercent),
    costToDate: n(p.costToDate),
    budgetToDate: n(p.budgetToDate),
    cpi: n(p.cpi),
    spi: n(p.spi),
    pmId: p.pmId ?? null,
    coverImageUrl: p.coverImageUrl ?? null,
    createdAt: dReq(p.createdAt),
    updatedAt: dReq(p.updatedAt),
  };
}

export function serializeOrg(o: any) {
  return {
    id: o.id,
    name: o.name,
    legalName: o.legalName ?? null,
    gstin: o.gstin ?? null,
    pan: o.pan ?? null,
    address: o.address ?? null,
    city: o.city ?? null,
    state: o.state ?? null,
    pincode: o.pincode ?? null,
    logoUrl: o.logoUrl ?? null,
    onboardingCompletedAt: o.onboardingCompletedAt ? d(o.onboardingCompletedAt) : null,
    createdAt: dReq(o.createdAt),
  };
}

// Public view: omits legal/tax/address details. Non-admin callers receive
// only identity + non-sensitive locality hints (city/state) plus the logo
// (already public-facing branding).
export function serializeOrgPublic(o: any) {
  return {
    id: o.id,
    name: o.name,
    legalName: null,
    gstin: null,
    pan: null,
    address: null,
    city: o.city ?? null,
    state: o.state ?? null,
    pincode: null,
    logoUrl: o.logoUrl ?? null,
    createdAt: dReq(o.createdAt),
  };
}

export function serializeWbs(a: any) {
  return {
    id: a.id,
    projectId: a.projectId,
    parentId: a.parentId ?? null,
    code: a.code,
    name: a.name,
    unit: a.unit ?? null,
    plannedQuantity: n(a.plannedQuantity),
    actualQuantity: n(a.actualQuantity),
    plannedStart: d(a.plannedStart),
    plannedEnd: d(a.plannedEnd),
    actualStart: d(a.actualStart),
    actualEnd: d(a.actualEnd),
    plannedPercent: n(a.plannedPercent),
    actualPercent: n(a.actualPercent),
    plannedCost: n(a.plannedCost),
    actualCost: n(a.actualCost),
    status: a.status,
    weight: n(a.weight),
    sortOrder: a.sortOrder ?? 0,
    createdAt: dReq(a.createdAt),
  };
}

export function serializeMilestone(m: any) {
  return {
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    description: m.description ?? null,
    targetDate: dReq(m.targetDate),
    forecastDate: d(m.forecastDate),
    actualDate: d(m.actualDate),
    status: m.status,
    certificateIssued: !!m.certificateIssued,
    sortOrder: m.sortOrder ?? 0,
    createdAt: dReq(m.createdAt),
  };
}

export function serializeDpr(r: any) {
  return {
    id: r.id,
    projectId: r.projectId,
    reportDate: dReq(r.reportDate),
    weather: r.weather ?? null,
    temperature: nOrNull(r.temperature),
    manpowerCount: r.manpowerCount ?? 0,
    summary: r.summary ?? null,
    status: r.status,
    submittedById: r.submittedById ?? null,
    approvedById: r.approvedById ?? null,
    submittedAt: d(r.submittedAt),
    approvedAt: d(r.approvedAt),
    rejectionReason: r.rejectionReason ?? null,
    createdAt: dReq(r.createdAt),
  };
}

export function serializePhoto(p: any) {
  return {
    id: p.id,
    projectId: p.projectId,
    activityId: p.activityId ?? null,
    dprId: p.dprId ?? null,
    url: p.url,
    caption: p.caption ?? null,
    capturedAt: dReq(p.capturedAt),
    latitude: nOrNull(p.latitude),
    longitude: nOrNull(p.longitude),
    uploadedById: p.uploadedById ?? null,
    tag: p.tag ?? null,
    createdAt: dReq(p.createdAt),
  };
}

export function serializeDoc(x: any) {
  return {
    id: x.id,
    projectId: x.projectId,
    name: x.name,
    category: x.category ?? null,
    url: x.url,
    version: x.version ?? 1,
    uploadedById: x.uploadedById ?? null,
    createdAt: dReq(x.createdAt),
  };
}

export function serializeIssue(i: any) {
  return {
    id: i.id,
    projectId: i.projectId,
    dprId: i.dprId ?? null,
    title: i.title,
    description: i.description ?? null,
    severity: i.severity,
    status: i.status,
    raisedById: i.raisedById ?? null,
    assignedToId: i.assignedToId ?? null,
    raisedAt: dReq(i.raisedAt),
    resolvedAt: d(i.resolvedAt),
  };
}
