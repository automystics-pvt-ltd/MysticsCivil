import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const typesIndex = resolve(__dirname, "../../api-zod/src/generated/types/index.ts");

let content = readFileSync(typesIndex, "utf8");

// Remove type entries that conflict with top-level zod schema const exports in api.ts.
// orval generates both a zod const (value) AND a TS type for each request body/param,
// and re-exporting both with `export *` causes TS2308 for any that share the same name.
// The zod schema in api.ts already covers both validation and type inference; the type
// alias in generated/types/ is redundant for these purposes.
//
// Pattern: for every Body/Params/QueryParams const in api.ts there is a matching type
// file. We keep these in api.ts (zod schemas); they are NOT re-exported from types/.
// Only add entries here when the codegen creates a collision (build fails with TS2308).
const conflicting = [
  "export * from './importBoqItemsXlsxBody';",
  "export * from './generateAbstractBoqItemsBody';",
  // Phase 3 — Financial Core
  "export * from './advanceContractorBillBody';",
  "export * from './createClientInvoiceBody';",
  "export * from './createContractorBillBody';",
  "export * from './createLedgerAccountBody';",
  "export * from './createLedgerEntryBody';",
  "export * from './releaseContractorPaymentBody';",
  "export * from './updateClientInvoiceBody';",
  "export * from './updateContractorBillBody';",
  // Phase 4 — Supply Chain
  "export * from './awardRfqBody';",
  "export * from './createGrnBody';",
  "export * from './createInventoryItemBody';",
  "export * from './createMaterialIndentBody';",
  "export * from './createMaterialTestBody';",
  "export * from './createPurchaseOrderBody';",
  "export * from './createRateContractBody';",
  "export * from './createRfqBody';",
  "export * from './createStockIssueBody';",
  "export * from './createStoreBody';",
  "export * from './createVendorBody';",
  "export * from './createWastageLogBody';",
  "export * from './getReconciliationParams';",
  "export * from './listGrnsParams';",
  "export * from './listInventoryItemsParams';",
  "export * from './listMaterialIndentsParams';",
  "export * from './listMaterialTestsParams';",
  "export * from './listPurchaseOrdersParams';",
  "export * from './queryMaterialIndentBody';",
  "export * from './updateInventoryItemBody';",
  "export * from './updateMaterialTestBody';",
  "export * from './updatePurchaseOrderBody';",
  "export * from './updateVendorBody';",
  "export * from './addGrnItemBody';",
  "export * from './addIndentItemBody';",
  "export * from './addPoItemBody';",
  "export * from './addRfqItemBody';",
  "export * from './addRfqResponseBody';",
  "export * from './addRfqVendorBody';",
  "export * from './addToAvlBody';",
  "export * from './addVendorDocumentBody';",
  "export * from './approveMaterialIndentBody';",
  // Phase 5 — Workforce, Quality & Safety
  "export * from './createInspectionRequestBody';",
  "export * from './createItpBody';",
  "export * from './createJsaEntryBody';",
  "export * from './createLabourContractorBillBody';",
  "export * from './createNcrBody';",
  "export * from './createPayrollPeriodBody';",
  "export * from './createPpeIssueBody';",
  "export * from './createQualityTestBody';",
  "export * from './createSafetyPermitBody';",
  "export * from './listAttendanceParams';",
  "export * from './listQualityTestsParams';",
  "export * from './listWorkersParams';",
  "export * from './recordAttendanceBody';",
  "export * from './recordInspectionResultBody';",
  "export * from './updateLabourContractorBillBody';",
  "export * from './updateWorkerBody';",
  "export * from './addNcrActionBody';",
  "export * from './bulkRecordAttendanceBody';",
  "export * from './createHiraEntryBody';",
  "export * from './createIncidentBody';",
  // Reverse geocode: schema name collides with operation response const in api.ts
  "export * from './reverseGeocodeResponse';",
  // Modules + project access
  "export * from './updateOrganisationModulesBody';",
  "export * from './updateProjectModulesBody';",
  "export * from './grantProjectAccessBody';",
  // Task 3 — Tenant onboarding & invitation flow
  "export * from './acceptInvitationRequest';",
  "export * from './acceptInvitationResponse';",
  "export * from './acceptInvitationResponseOrganisation';",
  "export * from './acceptInvitationResponseUser';",
  "export * from './orgInvitation';",
  "export * from './orgInvitationInput';",
  "export * from './orgInvitationStatus';",
  "export * from './orgMember';",
  "export * from './orgMemberRoleUpdate';",
  "export * from './registerTenantRequest';",
  "export * from './registerTenantResponse';",
  "export * from './registerTenantResponseOrganisation';",
  "export * from './registerTenantResponseUser';",
  "export * from './successEnvelope';",
];

for (const line of conflicting) {
  content = content.replace(line + "\n", "").replace(line, "");
}

writeFileSync(typesIndex, content);
console.log("patch-generated: removed conflicting body type re-exports from types/index.ts");
