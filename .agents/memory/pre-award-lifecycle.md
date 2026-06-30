---
name: Pre-Award lifecycle module
description: Six-table pre-award pipeline added to KattidaCore; URL-param linking pattern between pages
---

## Tables (all in lib/db/src/schema/ocms.ts, appended after _zUserRole)
- leadsTable → tracks opportunities (stage: prospect→qualified→proposal→negotiation→won/lost)
- customersTable → client registry, linked from leads via leadId
- preEstimationsTable → preliminary cost estimate, linked from customers/leads, approval gate (draft→under_review→approved/rejected)
- quotationsTable → formal offer, linked from preEstimation/customer/lead, sends/accepts/rejects
- tendersTable → bid management (upcoming→in_progress→submitted→under_evaluation→won/lost), LOA fields
- statusHistoryTable → universal audit trail (entityType + entityId + fromStatus + toStatus)

## Route files (artifacts/api-server/src/routes/)
leads.ts, tenders.ts, customers.ts, pre-estimations.ts, quotations.ts, status-history.ts
All use `getAccessCtx(req)` from `../lib/access` for org scoping — NEVER req.user?.organisationId.
All write to statusHistoryTable on status transitions.

## Frontend pages (artifacts/web/src/pages/)
leads.tsx, customers.tsx, pre-estimations.tsx, quotations.tsx, tenders.tsx, analytics.tsx

## URL-param linking pattern (deep-link between pages)
Each page reads `useSearch()` on load and auto-opens the create dialog if fromX param is present:
- Lead → Customer: `/customers?fromLead=<id>&name=…&contact=…&email=…&phone=…`
- Lead → Tender: `/tenders?fromLead=<id>&title=…&estValue=…&workType=…&location=…`
- Customer → Pre-Estimation: `/pre-estimations?fromCustomer=<id>&customerName=…`
- Pre-Estimation → Quotation: `/quotations?fromPreEstimation=<id>&title=…&value=…&customerId=…`
- Quotation → Tender: `/tenders?fromQuotation=<id>&title=…&estValue=…`
- Tender → Project: `/projects/new?fromTender=<id>&name=…&contractValue=…&location=…&loaRef=…`

After save, the source record is back-patched (e.g. leads.customerId, leads.convertedToProjectId) to link them.

## Sidebar group
"pre-award" group added between "operations" and "commercial" in layout.tsx.
Icons: Target (leads), Users2 (customers), FileSearch (pre-estimations), FileText (quotations), Briefcase (tenders).
Analytics added to the "operations" group with BarChart2 icon.

## LifecycleJourney component
artifacts/web/src/components/lifecycle-journey.tsx — visual funnel showing which steps are complete.
Pass chain={lead, customer, preEstimation, quotation, tender, project} and currentKey to highlight active step.
