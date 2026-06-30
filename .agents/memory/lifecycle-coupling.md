---
name: Lifecycle coupling pattern
description: How Lead→Customer→PreEst→Quotation→Tender→Project pages link to each other via URL params, and the tender→project backlink pattern.
---

## The rule
Each stage page auto-opens its "create" dialog pre-filled from the previous stage using URL search params. After creation, the new record patches back a foreign key into the originating record.

## URL param conventions (frontend → target page)
- Lead → Customer: `/customers?fromLead=<id>&name=<>&contact=<>&email=<>&phone=<>`
- Customer → Pre-Estimation: `/pre-estimations?fromCustomer=<id>&customerName=<>`
- Pre-Estimation → Quotation: `/quotations?fromPreEstimation=<id>&title=<>&value=<>&customerId=<>`
- Quotation → Tender: `/tenders?fromQuotation=<id>&...`
- Tender → Project: `/projects/new?fromTender=<id>&name=<>&clientName=<>&contractValue=<>&location=<>&loaRef=<>`

## Back-link patch after creation
- When Customer created from Lead: PATCH `/api/leads/:id` with `{ customerId: newCustomer.id, stage: "won" }`
- When Tender created from Quotation: PATCH `/api/quotations/:id` with `{ convertedToTenderId: newTender.id, status: "accepted" }`
- When Project created from Tender: PATCH `/api/tenders/:id` with `{ convertedToProjectId: newProject.id, status: "won" }`

## project-new.tsx fromTender prefill implementation
- `useSearch()` from wouter reads `?fromTender=...` params
- `form.defaultValues` pre-populated from URL params directly (so the form renders pre-filled on mount)
- `useEffect` with a ref guard auto-selects `orgs[0]` as organisationId when orgs load
- Blue info banner shown when `fromTenderId` is present
- In `onSubmit` → `createProject.mutate` `onSuccess`, fires `fetch PATCH /api/tenders/:id { convertedToProjectId, status: "won" }` (fire-and-forget with `.catch(() => {})`)

**Why:** This gives the user a zero-friction promotion path from any stage to the next, while keeping the data model clean via FK back-links.

**How to apply:** Every new stage added to the pipeline should follow this exact pattern — URL params prefill, auto-open dialog, post-save back-patch.
