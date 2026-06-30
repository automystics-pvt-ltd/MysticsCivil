import {
  LayoutDashboard,
  ListTodo,
  Calendar,
  Calculator,
  GitBranch,
  TrendingUp,
  FileText,
  Camera,
  FolderOpen,
  AlertCircle,
  Banknote,
  ShoppingCart,
  HardHat,
  MapPin,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type ProjectTab = {
  value: string;
  label: string;
  icon: LucideIcon;
  /** Module key that gates this tab (null = always visible). */
  moduleKey: string | null;
};

export const PROJECT_TABS: ProjectTab[] = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, moduleKey: "dashboard" },
  { value: "site-location", label: "Site Location", icon: MapPin, moduleKey: null },
  { value: "wbs", label: "WBS", icon: ListTodo, moduleKey: "wbs" },
  { value: "milestones", label: "Milestones", icon: Calendar, moduleKey: "milestones" },
  { value: "estimation", label: "Estimation", icon: Calculator, moduleKey: "estimation" },
  { value: "variation-orders", label: "VOs", icon: GitBranch, moduleKey: "variation_orders" },
  { value: "boq-actual", label: "BOQ vs Actual", icon: TrendingUp, moduleKey: "boq" },
  { value: "dprs", label: "DPRs", icon: FileText, moduleKey: "dprs" },
  { value: "photos", label: "Photos", icon: Camera, moduleKey: "photos" },
  { value: "documents", label: "Documents", icon: FolderOpen, moduleKey: "documents" },
  { value: "issues", label: "Issues", icon: AlertCircle, moduleKey: "quality" },
  { value: "financial", label: "Financial", icon: Banknote, moduleKey: "financial" },
  { value: "supply-chain", label: "Supply Chain", icon: ShoppingCart, moduleKey: "supply_chain" },
  { value: "workforce", label: "Workforce & EHS", icon: HardHat, moduleKey: "workforce" },
  { value: "settings", label: "Settings", icon: Settings, moduleKey: null },
];

export const VALID_PROJECT_TABS = PROJECT_TABS.map((t) => t.value);
