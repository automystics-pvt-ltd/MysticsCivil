import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type Lang = "en" | "ta";

const STORAGE_KEY = "ocms.lang";

// ─── Keyed dictionary (used via t("key")) ─────────────────────────────────────
const dict: Record<string, { en: string; ta: string }> = {
  "app.name": { en: "Mystics Civil", ta: "மிஸ்டிக்ஸ் சிவில்" },
  "app.tagline": { en: "Construction Management", ta: "கட்டுமான மேலாண்மை" },
  "nav.dashboard": { en: "Dashboard", ta: "முதன்மை பலகை" },
  "nav.projects": { en: "Projects", ta: "திட்டங்கள்" },
  "nav.dsrRates": { en: "DSR Rates", ta: "DSR விலைகள்" },
  "nav.approvals": { en: "Approvals", ta: "ஒப்புதல்கள்" },
  "nav.reports": { en: "Reports", ta: "அறிக்கைகள்" },
  "nav.admin": { en: "Admin", ta: "நிர்வாகம்" },
  "nav.organisations": { en: "Organisations", ta: "நிறுவனங்கள்" },
  "nav.team": { en: "Team", ta: "குழு" },
  "nav.profile": { en: "Profile", ta: "சுயவிவரம்" },
  "nav.logout": { en: "Log out", ta: "வெளியேறு" },
  "nav.group.overview": { en: "Overview", ta: "மேற்பார்வை" },
  "nav.group.delivery": { en: "Delivery", ta: "செயல்படுத்தல்" },
  "nav.group.library": { en: "Library", ta: "தரவகம்" },
  "nav.group.admin": { en: "Admin", ta: "நிர்வாகம்" },
  "nav.analytics": { en: "Analytics", ta: "பகுப்பாய்வு" },
  "nav.leads": { en: "Leads", ta: "வாய்ப்புகள்" },
  "nav.customers": { en: "Customers", ta: "வாடிக்கையாளர்கள்" },
  "nav.preEstimations": { en: "Pre-Estimations", ta: "முன் மதிப்பீடு" },
  "nav.quotations": { en: "Quotations", ta: "மேற்கோள்கள்" },
  "nav.tenders": { en: "Tenders", ta: "டெண்டர்கள்" },
  "nav.group.preAward": { en: "Pre-Award", ta: "முன் விருது" },
  "nav.group.operations": { en: "Operations", ta: "செயல்பாடுகள்" },
  "nav.group.commercial": { en: "Commercial", ta: "வணிக" },
  "nav.group.people": { en: "People", ta: "மக்கள்" },
  "auth.signIn": { en: "Sign in", ta: "உள்நுழை" },
  "auth.createAccount": { en: "Create account", ta: "கணக்கு உருவாக்கு" },
  "auth.email": { en: "Email", ta: "மின்னஞ்சல்" },
  "auth.password": { en: "Password", ta: "கடவுச்சொல்" },
  "auth.firstName": { en: "First name", ta: "முதல் பெயர்" },
  "auth.lastName": { en: "Last name", ta: "கடைசி பெயர்" },
  "auth.organisationName": { en: "Organisation name", ta: "நிறுவனத்தின் பெயர்" },
  "auth.passwordHint": { en: "Minimum 8 characters.", ta: "குறைந்தபட்சம் 8 எழுத்துக்கள்." },
  "auth.signInFailed": { en: "Sign in failed", ta: "உள்நுழைவு தோல்வி" },
  "auth.registerFailed": { en: "Registration failed", ta: "பதிவு தோல்வி" },
  "auth.tagline": { en: "Construction Operations", ta: "கட்டுமான செயல்பாடு" },
  "auth.notice": { en: "Authorized personnel only. Access is logged and monitored.", ta: "அங்கீகரிக்கப்பட்ட நபர்கள் மட்டுமே. அணுகல் பதிவு செய்யப்படுகிறது." },
  "label.language": { en: "Language", ta: "மொழி" },
  "label.english": { en: "English", ta: "ஆங்கிலம்" },
  "label.tamil": { en: "Tamil", ta: "தமிழ்" },
};

// ─── Phrase dictionary (used by DOM text-node translator) ─────────────────────
// Keys are English text exactly as it appears on screen (after .trim()).
// Anything not in this map stays in English as a safety fallback.
const phrases: Record<string, string> = {
  // Generic / chrome
  "Dashboard": "முதன்மை பலகை",
  "Projects": "திட்டங்கள்",
  "Project": "திட்டம்",
  "DSR Rates": "DSR விலைகள்",
  "Approvals": "ஒப்புதல்கள்",
  "Organisations": "நிறுவனங்கள்",
  "Organisation": "நிறுவனம்",
  "Profile": "சுயவிவரம்",
  "Log out": "வெளியேறு",
  "Logout": "வெளியேறு",
  "Login": "உள்நுழை",
  "Loading…": "ஏற்றுகிறது…",
  "Loading...": "ஏற்றுகிறது…",
  "Loading": "ஏற்றுகிறது",
  "Sign in": "உள்நுழை",
  "Sign out": "வெளியேறு",
  "Welcome": "வரவேற்கிறோம்",
  "Welcome back": "மீண்டும் வரவேற்கிறோம்",
  "Home": "முகப்பு",
  "Back": "பின்செல்",
  "Next": "அடுத்து",
  "Previous": "முந்தைய",
  "Continue": "தொடரு",
  "More": "மேலும்",
  "Less": "குறைவாக",
  "Show": "காட்டு",
  "Hide": "மறை",
  "Yes": "ஆம்",
  "No": "இல்லை",
  "OK": "சரி",
  "All": "அனைத்தும்",
  "None": "எதுவும் இல்லை",
  "Select": "தேர்வு செய்",
  "Select all": "அனைத்தையும் தேர்வு செய்",
  "Search": "தேடு",
  "Filter": "வடிகட்டி",
  "Filters": "வடிகட்டிகள்",
  "Sort": "வரிசைப்படுத்து",
  "Refresh": "புதுப்பி",
  "Reset": "மீட்டமை",
  "Clear": "அழி",
  "Apply": "பயன்படுத்து",
  "Update": "புதுப்பி",
  "Create": "உருவாக்கு",
  "Add": "சேர்",
  "New": "புதிய",
  "Edit": "திருத்து",
  "Save": "சேமி",
  "Cancel": "ரத்து செய்",
  "Delete": "நீக்கு",
  "Remove": "அகற்று",
  "Submit": "சமர்ப்பி",
  "Approve": "ஒப்புதல் அளி",
  "Reject": "நிராகரி",
  "Close": "மூடு",
  "Open": "திற",
  "View": "பார்",
  "Details": "விவரங்கள்",
  "Export": "ஏற்றுமதி",
  "Download": "பதிவிறக்கம்",
  "Upload": "பதிவேற்று",
  "Print": "அச்சிடு",
  "Settings": "அமைப்புகள்",
  "Help": "உதவி",
  "Actions": "செயல்கள்",
  "Action": "செயல்",
  "Status": "நிலை",
  "Type": "வகை",
  "Date": "தேதி",
  "Time": "நேரம்",
  "From": "தொடக்கம்",
  "To": "முடிவு",
  "Name": "பெயர்",
  "Code": "குறியீடு",
  "Description": "விளக்கம்",
  "Notes": "குறிப்புகள்",
  "Note": "குறிப்பு",
  "Remarks": "கருத்துகள்",
  "Comments": "கருத்துகள்",
  "Reason": "காரணம்",
  "Total": "மொத்தம்",
  "Subtotal": "கூட்டுத்தொகை",
  "Amount": "தொகை",
  "Quantity": "அளவு",
  "Rate": "விலை",
  "Unit": "அலகு",
  "Price": "விலை",
  "Cost": "செலவு",
  "Value": "மதிப்பு",
  "Percent": "சதவீதம்",
  "Percentage": "சதவீதம்",
  "Role": "பங்கு",
  "Email": "மின்னஞ்சல்",
  "Phone": "தொலைபேசி",
  "Address": "முகவரி",
  "City": "நகரம்",
  "State": "மாநிலம்",
  "Country": "நாடு",
  "PIN": "PIN",
  "Created": "உருவாக்கப்பட்டது",
  "Created at": "உருவாக்கிய நேரம்",
  "Updated": "புதுப்பிக்கப்பட்டது",
  "Updated at": "புதுப்பிக்கப்பட்ட நேரம்",

  // Status / lifecycle
  "Pending": "நிலுவையில்",
  "Approved": "அங்கீகரிக்கப்பட்டது",
  "Rejected": "நிராகரிக்கப்பட்டது",
  "Draft": "வரைவு",
  "Active": "செயலில்",
  "Inactive": "செயலற்ற",
  "Closed": "மூடப்பட்டது",
  "Completed": "முடிக்கப்பட்டது",
  "In Progress": "செயல்பாட்டில்",
  "In progress": "செயல்பாட்டில்",
  "Not Started": "தொடங்கவில்லை",
  "Not started": "தொடங்கவில்லை",
  "On Hold": "நிறுத்தப்பட்டது",
  "On hold": "நிறுத்தப்பட்டது",
  "Submitted": "சமர்ப்பிக்கப்பட்டது",
  "Verified": "சரிபார்க்கப்பட்டது",
  "Paid": "செலுத்தப்பட்டது",
  "Unpaid": "செலுத்தப்படாத",
  "Cancelled": "ரத்து செய்யப்பட்டது",
  "Failed": "தோல்வி",
  "Success": "வெற்றி",
  "Error": "பிழை",
  "Warning": "எச்சரிக்கை",
  "Info": "தகவல்",

  // Projects
  "All Projects": "அனைத்து திட்டங்கள்",
  "New Project": "புதிய திட்டம்",
  "Project Name": "திட்டத்தின் பெயர்",
  "Project Code": "திட்ட குறியீடு",
  "Client": "வாடிக்கையாளர்",
  "Client Name": "வாடிக்கையாளர் பெயர்",
  "Location": "இடம்",
  "Start Date": "தொடக்க தேதி",
  "End Date": "முடிவு தேதி",
  "Target End Date": "இலக்கு முடிவு தேதி",
  "Contract Value": "ஒப்பந்த மதிப்பு",
  "Progress": "முன்னேற்றம்",
  "Planned": "திட்டமிடப்பட்டது",
  "Actual": "உண்மை",
  "Forecast": "கணிப்பு",
  "Overview": "மேற்பார்வை",
  "Summary": "சுருக்கம்",

  // Workforce / Quality / Safety
  "Workforce": "தொழிலாளர்",
  "Workforce, Quality & Safety": "தொழிலாளர், தரம் மற்றும் பாதுகாப்பு",
  "Quality": "தரம்",
  "Safety": "பாதுகாப்பு",
  "Workers": "தொழிலாளர்கள்",
  "Worker": "தொழிலாளர்",
  "Worker Name": "தொழிலாளர் பெயர்",
  "Attendance": "வருகை",
  "Mark In": "வரவு பதிவு",
  "Mark Out": "வெளியேற்ற பதிவு",
  "Hours Worked": "வேலை மணி",
  "Overtime": "கூடுதல் நேரம்",
  "Overtime Hours": "கூடுதல் நேர மணி",
  "OT": "OT",
  "Approve OT": "OT ஒப்புதல்",
  "Payroll": "ஊதியம்",
  "Payroll Period": "ஊதிய காலம்",
  "Wage": "கூலி",
  "Wages": "கூலிகள்",
  "Wage Slip": "ஊதிய ரசீது",
  "Daily Rate": "தினசரி விலை",
  "Mandays": "மனிதநாட்கள்",
  "Headcount": "தொழிலாளர் எண்ணிக்கை",
  "Trade": "தொழில்",
  "Skill": "திறன்",
  "Contractor": "ஒப்பந்ததாரர்",
  "Contractors": "ஒப்பந்ததாரர்கள்",
  "Contractor Bills": "ஒப்பந்ததாரர் பில்கள்",
  "Contractor Bill": "ஒப்பந்ததாரர் பில்",
  "Bill": "பில்",
  "Bills": "பில்கள்",
  "Inspections": "ஆய்வுகள்",
  "Inspection": "ஆய்வு",
  "Record Result": "முடிவு பதிவு",
  "Checklist": "சரிபார்ப்பு பட்டியல்",
  "Passed": "தேர்ச்சி",
  "Conditional": "நிபந்தனையுடன்",
  "NCR": "NCR",
  "NCRs": "தர குறைபாடுகள்",
  "Non-Conformance": "தர குறைபாடு",
  "Severity": "தீவிரம்",
  "Critical": "முக்கியமான",
  "Major": "பெரிய",
  "Minor": "சிறிய",
  "Root Cause": "மூல காரணம்",
  "Rework Cost": "மறுவேலை செலவு",
  "CAPA": "CAPA",
  "Add CAPA": "CAPA சேர்",
  "Re-Inspection": "மறு ஆய்வு",
  "Mark Re-Inspection": "மறு ஆய்வு பதிவு",
  "Verify & Close NCR": "சரிபார்த்து மூடு",
  "Verify & Close": "சரிபார்த்து மூடு",
  "Rework": "மறுவேலை",
  "JSA": "JSA",
  "Job Safety Analysis": "வேலை பாதுகாப்பு பகுப்பாய்வு",
  "Activity": "செயல்பாடு",
  "Hazards": "ஆபத்துகள்",
  "Controls": "கட்டுப்பாடுகள்",
  "PPE": "PPE",
  "Workers Present": "ஆஜர் தொழிலாளர்கள்",
  "Steps": "படிகள்",
  "Step": "படி",
  "Material Testing": "பொருள் சோதனை",
  "Test": "சோதனை",
  "Tests": "சோதனைகள்",
  "Sample": "மாதிரி",
  "Result": "முடிவு",
  "Statutory": "சட்டப்படியான",
  "EPF": "EPF",
  "ESI": "ESI",
  "TDS": "TDS",
  "PF": "PF",
  "Incidents": "சம்பவங்கள்",
  "Incident": "சம்பவம்",
  "Permits": "அனுமதிகள்",
  "Permit": "அனுமதி",
  "Toolbox Talks": "பாதுகாப்பு கூட்டங்கள்",
  "Toolbox Talk": "பாதுகாப்பு கூட்டம்",

  // Financial
  "Financial": "நிதி",
  "Client Billing": "வாடிக்கையாளர் பில்",
  "Client Invoice": "வாடிக்கையாளர் விலைப்பட்டியல்",
  "Client Invoices": "வாடிக்கையாளர் விலைப்பட்டியல்கள்",
  "Invoice": "விலைப்பட்டியல்",
  "Invoices": "விலைப்பட்டியல்கள்",
  "Ledger": "பேரேடு",
  "Ledger Account": "பேரேட்டுக் கணக்கு",
  "Ledger Accounts": "பேரேட்டுக் கணக்குகள்",
  "Reports": "அறிக்கைகள்",
  "Report": "அறிக்கை",
  "Analytics": "பகுப்பாய்வு",
  "Deductions": "கழிவுகள்",
  "Deduction": "கழிவு",
  "Retention": "தடுப்பு",
  "Advance": "முன்பணம்",
  "Advances": "முன்பணங்கள்",
  "Payment": "பணம் செலுத்துதல்",
  "Payments": "பணம் செலுத்துதல்கள்",
  "Payment Voucher": "பண செலுத்து சீட்டு",
  "Payment Vouchers": "பண செலுத்து சீட்டுகள்",
  "Voucher": "சீட்டு",
  "Vouchers": "சீட்டுகள்",
  "UTR": "UTR",
  "GST": "GST",
  "GSTIN": "GSTIN",
  "Tax": "வரி",
  "Taxable": "வரிக்குரிய",
  "Tax Amount": "வரி தொகை",
  "Net Amount": "நிகர தொகை",
  "Gross Amount": "மொத்த தொகை",
  "Balance": "மீதம்",
  "Opening Balance": "தொடக்க மீதம்",
  "Closing Balance": "முடிவு மீதம்",
  "Debit": "பற்று",
  "Credit": "வரவு",
  "RA Bill": "RA பில்",
  "RA Bills": "RA பில்கள்",
  "Running Account Bill": "ரன்னிங் கணக்கு பில்",
  "Stage": "கட்டம்",
  "Verified Amount": "சரிபார்க்கப்பட்ட தொகை",
  "Claimed Amount": "கோரப்பட்ட தொகை",
  "Discrepancy": "வேறுபாடு",
  "Discrepancies": "வேறுபாடுகள்",

  // Supply chain
  "Supply Chain": "பொருள் வழங்கல்",
  "Materials": "பொருட்கள்",
  "Material": "பொருள்",
  "Vendor": "விற்பனையாளர்",
  "Vendors": "விற்பனையாளர்கள்",
  "Purchase Order": "கொள்முதல் ஆணை",
  "Purchase Orders": "கொள்முதல் ஆணைகள்",
  "PO": "PO",
  "GRN": "GRN",
  "Goods Receipt Note": "சரக்கு பெறுதல் குறிப்பு",
  "Stock": "சரக்கு",
  "Inventory": "சரக்கு பட்டியல்",
  "Issue": "வழங்கல்",
  "Receipt": "பெறுதல்",
  "Indent": "கோரிக்கை",
  "Indents": "கோரிக்கைகள்",
  "Warehouse": "கிடங்கு",
  "Stores": "சேமிப்பு",

  // Estimation / BOQ / DPR
  "Estimation": "மதிப்பீடு",
  "BOQ": "BOQ",
  "BOQ vs Actual": "மதிப்பீடு vs உண்மை",
  "Bill of Quantities": "அளவு பட்டியல்",
  "Variation": "மாற்றம்",
  "Variation Order": "மாற்ற ஆணை",
  "Variation Orders": "மாற்ற ஆணைகள்",
  "Daily Progress Report": "தினசரி முன்னேற்ற அறிக்கை",
  "DPR": "DPR",
  "DSR": "DSR",
  "Daily Site Report": "தினசரி கள அறிக்கை",

  // Common headings / hints
  "No data": "தரவு இல்லை",
  "No records": "பதிவுகள் இல்லை",
  "No results": "முடிவுகள் இல்லை",
  "No projects": "திட்டங்கள் இல்லை",
  "No workers": "தொழிலாளர்கள் இல்லை",
  "Try again": "மீண்டும் முயலவும்",
  "Required": "கட்டாயம்",
  "Optional": "விருப்பத்தேர்வு",
  "Choose file": "கோப்பை தேர்வு செய்",
  "Drop file here": "இங்கே கோப்பை விடவும்",

  // Auth / onboarding
  "Create account": "கணக்கு உருவாக்கு",
  "First name": "முதல் பெயர்",
  "Last name": "கடைசி பெயர்",
  "Organisation name": "நிறுவனத்தின் பெயர்",
  "Minimum 8 characters.": "குறைந்தபட்சம் 8 எழுத்துக்கள்.",
  "Sign in failed": "உள்நுழைவு தோல்வி",
  "Registration failed": "பதிவு தோல்வி",
  "Please try again": "மீண்டும் முயலவும்",
  "Construction Operations": "கட்டுமான செயல்பாடு",
  "Authorized personnel only. Access is logged and monitored.": "அங்கீகரிக்கப்பட்ட நபர்கள் மட்டுமே. அணுகல் பதிவு செய்யப்படுகிறது.",

  // Nav group headers
  "Delivery": "செயல்படுத்தல்",
  "Library": "தரவகம்",
  "Admin": "நிர்வாகம்",
  "Operations": "செயல்பாடுகள்",
  "Commercial": "வணிக",
  "People": "மக்கள்",

  // Financial KPIs / labels (audit gap fill — phase 3 pages)
  "Total Client Billed": "மொத்த வாடிக்கையாளர் பில்",
  "Total Billed (Contractor)": "மொத்தம் பில் (ஒப்பந்ததாரர்)",
  "Bills Received": "பெறப்பட்ட பில்கள்",
  "Paid This Month": "இந்த மாதம் செலுத்தியது",
  "Under Process": "செயலாக்கத்தில்",
  "Overdue (>30d)": "தாமதம் (>30 நாட்கள்)",
  "TDS YTD": "TDS YTD",
  "Gross Margin": "மொத்த விளிம்பு",
  "Aging Report": "வயது அறிக்கை",
  "Financial Summary": "நிதி சுருக்கம்",
  "Payment Analytics": "பணம் செலுத்தும் பகுப்பாய்வு",
  "TDS Register": "TDS பதிவேடு",
  "GST Register": "GST பதிவேடு",
  "Retention Ledger": "தடுப்பு பேரேடு",
  "Advance Ledger": "முன்பணம் பேரேடு",

  // Supply chain page labels
  "RFQ": "RFQ",
  "RFQs": "RFQs",
  "Vendor Comparison": "விற்பனையாளர் ஒப்பீடு",
  "Award": "வழங்கல்",
  "Three-Way Match": "மூன்று-வழி பொருத்தம்",
  "Reorder Alert": "மறு-கோரிக்கை எச்சரிக்கை",
  "Reorder Alerts": "மறு-கோரிக்கை எச்சரிக்கைகள்",
  "Current Stock": "தற்போதைய சரக்கு",
  "Min Stock": "குறைந்தபட்ச சரக்கு",
  "Stock Issue": "சரக்கு வழங்கல்",
  "Stock Issues": "சரக்கு வழங்கல்கள்",
  "Wastage": "வீண்விரயம்",
  "Wastage Log": "வீண்விரய பதிவு",

  // Workforce page labels
  "ITP": "ITP",
  "ITPs": "ITPs",
  "Inspection Test Plan": "ஆய்வு சோதனை திட்டம்",
  "Inspection Request": "ஆய்வு கோரிக்கை",
  "Inspection Requests": "ஆய்வு கோரிக்கைகள்",
  "Safety Permit": "பாதுகாப்பு அனுமதி",
  "Safety Permits": "பாதுகாப்பு அனுமதிகள்",
  "HIRA": "HIRA",
  "Hazard Register": "ஆபத்து பதிவேடு",
  "Wage Slips": "ஊதிய ரசீதுகள்",
  "Compute Payroll": "ஊதியம் கணக்கிடு",
  "Approve Payroll": "ஊதியம் ஒப்புதல்",
  "Resend Wage Slip": "ஊதிய ரசீது மீண்டும் அனுப்பு",

  // Photo capture (carry-over from prior task)
  "Site Photos": "தள புகைப்படங்கள்",
  "Capture": "எடு",
  "Capture Site Photo": "தள புகைப்படம் எடு",
  "Upload Site Photo": "தள புகைப்படம் பதிவேற்று",
  "Camera": "கேமரா",
  "Save photo": "புகைப்படம் சேமி",
  "Uploading…": "பதிவேற்றுகிறது…",
  "Saving…": "சேமிக்கிறது…",
  "Caption": "தலைப்பு",
  "Tag": "குறிச்சொல்",

  // Financial workflow steps
  "Technical Check": "தொழில்நுட்ப சோதனை",
  "QS Scrutiny": "QS ஆய்வு",
  "PM Certified": "PM சான்றளிக்கப்பட்டது",
  "Auto Deductions": "தானியங்கி கழிவுகள்",
  "GST Invoice": "GST விலைப்பட்டியல்",
  "Finance Approval": "நிதி அனுமதி",
  "Payment Released": "பணம் வழங்கப்பட்டது",
  "Ledger Posting": "பேரேட்டுப் பதிவு",

  // Project dashboard tiles
  "Project Progress": "திட்ட முன்னேற்றம்",
  "Activity Status": "செயல்பாட்டு நிலை",
  "Mini Gantt": "சிறு கான்ட்",
  "Cost Summary": "செலவு சுருக்கம்",
  "Recent Photos": "சமீபத்திய புகைப்படங்கள்",
  "Pending Actions": "நிலுவை செயல்கள்",
  "Next Milestone": "அடுத்த கட்டம்",
  "No upcoming milestones.": "வரவிருக்கும் கட்டங்கள் இல்லை.",
  "No pending actions.": "நிலுவை செயல்கள் இல்லை.",
};

// ─── DOM text-node translator (runtime) ───────────────────────────────────────
const SKIP_TAGS = new Set(["SCRIPT","STYLE","CODE","PRE","TEXTAREA","INPUT","NOSCRIPT"]);
const ORIGINAL = "__ocms_en";

function shouldTranslateText(text: string) {
  const t = text.trim();
  if (!t) return false;
  if (t.length > 200) return false; // skip long blobs / pasted content
  if (/^[\d\s.,:/+\-₹$%()]+$/.test(t)) return false; // pure numbers/currency/symbols
  return phrases[t] !== undefined;
}

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? "";
    const trimmed = text.trim();
    if (!trimmed) return;
    const ta = phrases[trimmed];
    if (!ta) return;
    const el = node as any;
    if (el[ORIGINAL] === undefined) el[ORIGINAL] = text;
    // preserve surrounding whitespace
    const leading = text.match(/^\s*/)?.[0] ?? "";
    const trailing = text.match(/\s*$/)?.[0] ?? "";
    node.nodeValue = leading + ta + trailing;
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName)) return;
    // attribute-level translations (placeholder, title, aria-label)
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (v && phrases[v.trim()] !== undefined) {
        const key = `__ocms_attr_${attr}`;
        if ((el as any)[key] === undefined) (el as any)[key] = v;
        el.setAttribute(attr, phrases[v.trim()]);
      }
    }
    el.childNodes.forEach(translateNode);
  }
}

function revertNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const el = node as any;
    if (el[ORIGINAL] !== undefined) {
      node.nodeValue = el[ORIGINAL];
      el[ORIGINAL] = undefined;
    }
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName)) return;
    for (const attr of ["placeholder", "title", "aria-label"]) {
      const key = `__ocms_attr_${attr}`;
      if ((el as any)[key] !== undefined) {
        el.setAttribute(attr, (el as any)[key]);
        (el as any)[key] = undefined;
      }
    }
    el.childNodes.forEach(revertNode);
  }
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "ta" ? "ta" : "en";
  });
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.setAttribute("lang", lang);

    // Disconnect any previous observer
    observerRef.current?.disconnect();
    observerRef.current = null;

    const root = document.getElementById("root") ?? document.body;

    if (lang === "ta") {
      // Initial pass
      translateNode(root);
      // Watch DOM mutations and translate added nodes / changed text
      const obs = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
            translateNode(m.target);
          } else if (m.type === "childList") {
            m.addedNodes.forEach(translateNode);
          }
        }
      });
      obs.observe(root, { childList: true, subtree: true, characterData: true });
      observerRef.current = obs;
    } else {
      // Revert any translations made earlier this session
      revertNode(root);
    }

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [lang]);

  const t = (key: string, fallback?: string) => {
    const entry = dict[key];
    if (!entry) return fallback ?? key;
    return entry[lang] || entry.en;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang: setLangState, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside <I18nProvider>");
  return ctx;
}
