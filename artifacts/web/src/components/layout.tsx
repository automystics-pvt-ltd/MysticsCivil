import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetMyProfile,
  useListProjects,
  useListOrganisations,
  useListApprovals,
  getListApprovalsQueryKey,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT, type Lang } from "@/lib/i18n";
import { PROJECT_TABS } from "@/lib/project-tabs";
import { getEffectiveModules, moduleEnabled } from "@/lib/modules";
import {
  Home,
  Building2,
  ClipboardList,
  FileBarChart,
  BookOpen,
  Users,
  Users2,
  Settings,
  LogOut,
  Search,
  Bell,
  Languages,
  Sun,
  Moon,
  Menu,
  X,
  ChevronsLeft,
  ChevronDown,
  ChevronRight,
  HardHat,
  ShieldCheck,
  FolderTree,
  BarChart2,
  Target,
  FileSearch,
  FileText,
  Briefcase,
} from "lucide-react";

const ALL_ROLES = ["super_admin", "owner", "pm", "site_engineer", "qs", "finance", "contractor", "qc", "store", "hr", "admin"];

type NavItem = { titleKey: string; url: string; icon: any; roles: string[]; moduleKey?: string };
type NavGroup = { key: string; labelKey: string; items: NavItem[] };

function getNavGroups(role: string | undefined, enabledModules: Set<string> | null): NavGroup[] {
  const groups: NavGroup[] = [
    {
      key: "operations",
      labelKey: "nav.group.operations",
      items: [
        { titleKey: "nav.dashboard", url: "/", icon: Home, roles: ALL_ROLES, moduleKey: "dashboard" },
        { titleKey: "nav.approvals", url: "/approvals", icon: ClipboardList, roles: ["super_admin", "admin", "owner", "pm", "qs", "finance"], moduleKey: "approvals" },
        { titleKey: "nav.analytics", url: "/analytics", icon: BarChart2, roles: ["owner", "pm", "qs", "finance", "admin", "super_admin"] },
        { titleKey: "nav.reports", url: "/reports", icon: FileBarChart, roles: ["owner", "pm", "qs", "finance", "admin"] },
      ],
    },
    {
      key: "pre-award",
      labelKey: "nav.group.preAward",
      items: [
        { titleKey: "nav.leads", url: "/leads", icon: Target, roles: ["owner", "pm", "qs", "finance", "admin", "super_admin"] },
        { titleKey: "nav.customers", url: "/customers", icon: Users2, roles: ["owner", "pm", "qs", "finance", "admin", "super_admin"] },
        { titleKey: "nav.preEstimations", url: "/pre-estimations", icon: FileSearch, roles: ["owner", "pm", "qs", "admin", "super_admin"] },
        { titleKey: "nav.quotations", url: "/quotations", icon: FileText, roles: ["owner", "pm", "qs", "finance", "admin", "super_admin"] },
        { titleKey: "nav.tenders", url: "/tenders", icon: Briefcase, roles: ["owner", "pm", "qs", "finance", "admin", "super_admin"] },
      ],
    },
    {
      key: "commercial",
      labelKey: "nav.group.commercial",
      items: [
        { titleKey: "nav.dsrRates", url: "/dsr-rates", icon: BookOpen, roles: ["owner", "pm", "qs", "admin"], moduleKey: "dsr_rates" },
      ],
    },
    {
      key: "admin",
      labelKey: "nav.group.admin",
      items: [
        { titleKey: "nav.admin", url: "/admin", icon: ShieldCheck, roles: ["super_admin", "admin"] },
        { titleKey: "nav.organisations", url: "/organisations", icon: Users, roles: ["super_admin", "admin"] },
        { titleKey: "nav.profile", url: "/profile", icon: Settings, roles: ALL_ROLES },
      ],
    },
  ];
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          (!role || i.roles.includes(role)) &&
          moduleEnabled(enabledModules, i.moduleKey ?? null),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

const COLLAPSED_GROUPS_KEY = "mc.sidebar.collapsedGroups";
function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(collapsed)); } catch {}
  }, [collapsed]);
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  return { collapsed, toggle };
}

// Generic expanded-set hook (tree nodes)
const EXPANDED_KEY = "mc.sidebar.expandedNodes";
function useExpandedNodes() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(EXPANDED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded)); } catch {}
  }, [expanded]);
  const toggle = (key: string) => setExpanded((c) => ({ ...c, [key]: !c[key] }));
  const setOpen = (key: string, open: boolean) =>
    setExpanded((c) => (c[key] === open ? c : { ...c, [key]: open }));
  return { expanded, toggle, setOpen };
}

function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("mc.theme");
    if (stored) return stored === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("mc.theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function LangSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useT();
  const opts: Lang[] = ["en", "ta"];
  if (compact) {
    return (
      <button
        onClick={() => setLang(lang === "en" ? "ta" : "en")}
        className="h-9 w-9 rounded-xl bg-muted hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground transition"
        title={lang.toUpperCase()}
        data-testid="lang-switcher-compact"
      >
        <Languages className="h-4 w-4" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs bg-muted rounded-full p-1" data-testid="lang-switcher">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => setLang(o)}
          className={`px-2.5 py-1 rounded-full font-bold transition ${lang === o ? "bg-white dark:bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid={`lang-${o}`}
        >
          {o.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Logo({ collapsed, t }: { collapsed: boolean; t: (k: string) => string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 group no-underline text-inherit" data-testid="logo-home">
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-600 text-white shadow-md shadow-violet-500/30 flex-shrink-0">
        <HardHat className="h-5 w-5" />
      </span>
      {!collapsed && (
        <div className="flex flex-col leading-tight overflow-hidden">
          <span className="font-extrabold text-[15px] tracking-tight truncate">{t("app.name")}</span>
          <span className="text-[10px] text-muted-foreground font-semibold truncate">Construction ERP</span>
        </div>
      )}
    </Link>
  );
}

// ─── Projects tree ───────────────────────────────────────────────────────────
function ProjectsTree({
  location,
  onNavigate,
  expanded,
  toggle,
  setOpen,
}: {
  location: string;
  onNavigate?: () => void;
  expanded: Record<string, boolean>;
  toggle: (k: string) => void;
  setOpen: (k: string, open: boolean) => void;
}) {
  const { data: projects } = useListProjects();
  const { data: orgs } = useListOrganisations();
  const orgById = useMemo(() => {
    const m = new Map<string, any>();
    (orgs || []).forEach((o: any) => m.set(o.id, o));
    return m;
  }, [orgs]);

  // Match /projects, /projects/:id and read ?tab=
  const activeMatch = useMemo(() => {
    const m = location.match(/^\/projects\/([^?]+)/);
    return m ? { projectId: m[1] } : null;
  }, [location]);
  const search = useSearch();
  const activeTab = useMemo(() => {
    const t = new URLSearchParams(search).get("tab");
    return t || "dashboard";
  }, [search]);

  // Auto-expand to active project
  useEffect(() => {
    if (!activeMatch || !projects) return;
    const p = projects.find((p: any) => p.id === activeMatch.projectId);
    if (!p) return;
    setOpen("projects-root", true);
    if (p.organisationId) setOpen(`org:${p.organisationId}`, true);
    setOpen(`proj:${p.id}`, true);
  }, [activeMatch?.projectId, projects, setOpen]);

  const rootOpen = expanded["projects-root"] ?? true;
  const isProjectsActive = location === "/projects" || location.startsWith("/projects/") || location.startsWith("/projects?");

  // Group projects by organisation
  const grouped = useMemo(() => {
    if (!projects) return [] as Array<{ orgId: string; orgName: string; projects: any[] }>;
    const orgMap = new Map<string, string>();
    (orgs || []).forEach((o: any) => orgMap.set(o.id, o.name));
    const buckets = new Map<string, any[]>();
    for (const p of projects) {
      const k = p.organisationId || "_none";
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(p);
    }
    return Array.from(buckets.entries())
      .map(([orgId, items]) => ({
        orgId,
        orgName: orgMap.get(orgId) || "Unassigned",
        projects: items.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      }))
      .sort((a, b) => a.orgName.localeCompare(b.orgName));
  }, [projects, orgs]);

  return (
    <div>
      {/* Root: Projects */}
      <div
        data-active={isProjectsActive ? "true" : "false"}
        className={`group relative flex items-center gap-1 rounded-xl pr-1 transition-all ${
          isProjectsActive
            ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30 ring-1 ring-violet-400/40"
            : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }`}
      >
        {isProjectsActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white/90" aria-hidden />
        )}
        <Link
          href="/projects"
          onClick={onNavigate}
          aria-current={isProjectsActive ? "page" : undefined}
          className="flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-semibold no-underline rounded-l-xl"
          data-testid="nav-projects"
        >
          <Building2 className={`h-[18px] w-[18px] flex-shrink-0 ${isProjectsActive ? "text-white" : "text-sidebar-foreground/70"}`} />
          <span className="truncate">Projects</span>
        </Link>
        <button
          type="button"
          onClick={() => toggle("projects-root")}
          className={`h-7 w-7 flex items-center justify-center rounded-lg ${
            isProjectsActive ? "hover:bg-white/15" : "hover:bg-sidebar-accent"
          }`}
          aria-expanded={rootOpen}
          aria-label={rootOpen ? "Collapse projects" : "Expand projects"}
          data-testid="nav-projects-toggle"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${rootOpen ? "rotate-90" : ""}`} />
        </button>
      </div>

      {rootOpen && (
        <ul className="mt-1 ml-2 pl-2 border-l border-sidebar-border/60 space-y-0.5">
          {!projects && (
            <li className="px-2 py-1.5 text-xs text-muted-foreground italic">Loading…</li>
          )}
          {projects && projects.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-muted-foreground italic">No projects yet</li>
          )}
          {grouped.map((g) => {
            const orgKey = `org:${g.orgId}`;
            const orgOpen = expanded[orgKey] ?? true;
            return (
              <li key={g.orgId}>
                <button
                  type="button"
                  onClick={() => toggle(orgKey)}
                  className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] uppercase tracking-wider font-bold text-muted-foreground/80 hover:text-foreground transition"
                  data-testid={`nav-org-${g.orgId}`}
                >
                  <ChevronRight className={`h-3 w-3 transition-transform ${orgOpen ? "rotate-90" : ""}`} />
                  <span className="truncate">{g.orgName}</span>
                  <span className="ml-auto text-[10px] font-bold text-muted-foreground/60">{g.projects.length}</span>
                </button>
                {orgOpen && (
                  <ul className="ml-1.5 pl-2 border-l border-sidebar-border/40 space-y-0.5">
                    {g.projects.map((p: any) => {
                      const projKey = `proj:${p.id}`;
                      const projOpen = expanded[projKey] ?? false;
                      const isProjActive = activeMatch?.projectId === p.id;
                      return (
                        <li key={p.id}>
                          <div
                            className={`group flex items-center gap-1 rounded-lg pr-1 ${
                              isProjActive && !location.includes("tab=")
                                ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
                                : ""
                            }`}
                          >
                            <Link
                              href={`/projects/${p.id}`}
                              onClick={onNavigate}
                              className="flex-1 flex items-center gap-2 px-2 py-1.5 text-[13px] font-medium no-underline rounded-l-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              title={p.name}
                              data-testid={`nav-project-${p.id}`}
                            >
                              <FolderTree className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                              <span className="truncate">{p.name}</span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => toggle(projKey)}
                              className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-sidebar-accent"
                              aria-expanded={projOpen}
                              data-testid={`nav-project-${p.id}-toggle`}
                            >
                              <ChevronRight className={`h-3 w-3 transition-transform ${projOpen ? "rotate-90" : ""}`} />
                            </button>
                          </div>
                          {projOpen && (
                            <ul className="ml-2 pl-2 border-l border-sidebar-border/30 mt-0.5 space-y-0.5">
                              {(() => {
                                const org = orgById.get(p.organisationId);
                                const effective = getEffectiveModules(
                                  org?.enabledModules ?? null,
                                  p.enabledModulesOverride ?? null,
                                );
                                return PROJECT_TABS.filter((tab) =>
                                  moduleEnabled(effective, tab.moduleKey),
                                );
                              })().map((tab) => {
                                const Icon = tab.icon;
                                const isLeafActive =
                                  isProjActive && activeTab === tab.value;
                                return (
                                  <li key={tab.value}>
                                    <Link
                                      href={
                                        tab.value === "dashboard"
                                          ? `/projects/${p.id}`
                                          : `/projects/${p.id}?tab=${tab.value}`
                                      }
                                      onClick={onNavigate}
                                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] no-underline transition ${
                                        isLeafActive
                                          ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold shadow-sm"
                                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                      }`}
                                      data-testid={`nav-project-${p.id}-tab-${tab.value}`}
                                    >
                                      <Icon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
                                      <span className="truncate">{tab.label}</span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Compact Projects entry when sidebar is collapsed (icon only, no tree)
function ProjectsCompact({ location, onNavigate }: { location: string; onNavigate?: () => void }) {
  const isActive =
    location === "/projects" ||
    location.startsWith("/projects/") ||
    location.startsWith("/projects?");
  return (
    <Link
      href="/projects"
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive ? "true" : "false"}
      className={`flex items-center justify-center rounded-xl px-0 py-2.5 transition no-underline ${
        isActive
          ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30 ring-1 ring-violet-400/40"
          : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      }`}
      title="Projects"
      data-testid="nav-projects-compact"
    >
      <Building2 className="h-[18px] w-[18px]" />
    </Link>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({
  groups,
  collapsed,
  onClose,
  t,
  mobile,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onClose?: () => void;
  t: (k: string) => string;
  mobile?: boolean;
}) {
  const [location] = useLocation();
  const { collapsed: collapsedGroups, toggle: toggleGroup } = useCollapsedGroups();
  const { expanded, toggle: toggleNode, setOpen } = useExpandedNodes();
  const isCompact = collapsed && !mobile;

  return (
    <aside
      className={`
        ${mobile ? "fixed inset-y-0 left-0 z-50 w-72" : "sticky top-0 h-screen"}
        ${isCompact ? "w-[78px]" : "w-72"}
        flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200
      `}
      data-testid="sidebar"
    >
      {/* Header */}
      <div className={`flex items-center ${isCompact ? "justify-center" : "justify-between"} px-4 py-5 border-b border-sidebar-border`}>
        <Logo collapsed={isCompact} t={t} />
        {mobile && (
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-sidebar-accent flex items-center justify-center" data-testid="mobile-close">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3 space-y-4">
        {groups.map((group) => {
          const showHeader = !isCompact;
          const isFolded = showHeader && !!collapsedGroups[group.key];
          const hasActiveItem = group.items.some(
            (i) => location === i.url || (i.url !== "/" && location.startsWith(i.url)),
          );
          // Operations group also hosts the Projects tree → treat as having content
          const showProjectsTree = group.key === "operations";
          const projectsActiveInGroup =
            showProjectsTree && (location === "/projects" || location.startsWith("/projects/"));
          const expandedGroup = !isFolded || hasActiveItem || projectsActiveInGroup;

          return (
            <div key={group.key}>
              {showHeader && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-2 mb-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 hover:text-foreground transition group"
                  aria-expanded={expandedGroup}
                  data-testid={`nav-group-${group.key}`}
                >
                  <span>{t(group.labelKey)}</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-200 ${expandedGroup ? "" : "-rotate-90"}`}
                  />
                </button>
              )}
              {expandedGroup && (
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const isActive =
                      item.url === "/"
                        ? location === "/" || location === "" || location.startsWith("/?")
                        : location === item.url || location.startsWith(`${item.url}/`) || location.startsWith(`${item.url}?`);
                    return (
                      <li key={item.titleKey}>
                        <Link
                          href={item.url}
                          onClick={onClose}
                          aria-current={isActive ? "page" : undefined}
                          data-active={isActive ? "true" : "false"}
                          className={`group relative flex items-center gap-3 rounded-xl text-sm font-semibold transition-all no-underline ${
                            isCompact ? "px-0 py-2.5 justify-center" : "px-3 py-2.5"
                          } ${
                            isActive
                              ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30 ring-1 ring-violet-400/40"
                              : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                          title={isCompact ? t(item.titleKey) : undefined}
                          data-testid={`nav-${item.titleKey}`}
                        >
                          {isActive && !isCompact && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white/90" aria-hidden />
                          )}
                          <item.icon className={`h-[18px] w-[18px] flex-shrink-0 ${isActive ? "text-white" : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground"}`} />
                          {!isCompact && <span className="truncate">{t(item.titleKey)}</span>}
                          {isActive && !isCompact && <span className="ml-auto h-2 w-2 rounded-full bg-white/80" />}
                        </Link>
                      </li>
                    );
                  })}

                  {/* Projects tree slot inside Operations */}
                  {showProjectsTree && (
                    <li>
                      {isCompact ? (
                        <ProjectsCompact location={location} onNavigate={onClose} />
                      ) : (
                        <ProjectsTree
                          location={location}
                          onNavigate={onClose}
                          expanded={expanded}
                          toggle={toggleNode}
                          setOpen={setOpen}
                        />
                      )}
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer card */}
      {!isCompact && (
        <div className="m-3 p-4 rounded-2xl bg-gradient-to-br from-violet-500 via-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30">
          <div className="flex items-center gap-2 text-xs font-bold mb-1">
            <ShieldCheck className="h-4 w-4" /> Pro Tip
          </div>
          <p className="text-[11px] leading-snug text-white/90">File DPRs daily to keep CPI and SPI accurate across your portfolio.</p>
        </div>
      )}
    </aside>
  );
}

// ─── Notification Bell ───────────────────────────────────────────────────────
// In-app notifications are surfaced as the pending-approvals inbox for the
// current user. Clicking an item navigates to /approvals where it can be acted on.
const APPROVER_ROLES = new Set(["owner", "pm", "qs", "finance", "admin"]);
function NotificationBell({
  role,
  enabledModules,
}: {
  role?: string;
  enabledModules: Set<string> | null;
}) {
  const [, navigate] = useLocation();
  // Only roles that can act on approvals subscribe — avoids needless polling
  // and a visible "0" badge for users who have nothing to action.
  const canSee =
    !!role && APPROVER_ROLES.has(role) && moduleEnabled(enabledModules, "approvals");
  const { data: approvals = [] } = useListApprovals({
    query: {
      refetchInterval: 60_000,
      staleTime: 30_000,
      enabled: canSee,
      queryKey: getListApprovalsQueryKey(),
    },
  });
  if (!canSee) return null;
  const items = (approvals as any[]) ?? [];
  const count = items.length;
  const overdue = items.filter((a) => (a?.ageDays ?? 0) > 3).length;
  const preview = items.slice(0, 6);

  const go = (href: string) => {
    navigate(href);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-xl bg-muted hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground transition"
          data-testid="btn-notifications"
          aria-label={`Notifications${count ? `, ${count} pending` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center border border-background ${
                overdue > 0 ? "bg-rose-500 text-white" : "bg-violet-600 text-white"
              }`}
              data-testid="notifications-count"
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <div className="text-sm font-semibold">Notifications</div>
            <div className="text-[11px] text-muted-foreground">
              {count === 0
                ? "You're all caught up"
                : `${count} pending${overdue ? ` · ${overdue} overdue` : ""}`}
            </div>
          </div>
          <button
            type="button"
            className="text-[11px] font-semibold text-violet-600 hover:underline"
            onClick={() => go("/approvals")}
            data-testid="notifications-viewall"
          >
            View all
          </button>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {preview.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              No pending approvals.
            </div>
          ) : (
            <ul className="divide-y">
              {preview.map((a: any) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => go("/approvals")}
                    className="w-full text-left px-4 py-3 hover:bg-muted/40 transition flex flex-col gap-1"
                    data-testid={`notification-${a.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                        {a.entityType}
                      </span>
                      {(a.ageDays ?? 0) > 3 && (
                        <span className="text-[10px] font-bold text-rose-600">Overdue</span>
                      )}
                    </div>
                    <div className="text-sm font-medium leading-snug truncate">{a.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {a.projectName} · {a.ageDays}d ago
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Top header ──────────────────────────────────────────────────────────────
function TopHeader({
  onToggleSidebar,
  onOpenMobile,
  collapsed,
  profile,
  onLogout,
  t,
  enabledModules,
}: {
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
  collapsed: boolean;
  profile: any;
  onLogout: () => void;
  t: (k: string) => string;
  enabledModules: Set<string> | null;
}) {
  const { dark, toggle } = useDarkMode();
  const initials = `${profile?.firstName?.[0] ?? ""}${profile?.lastName?.[0] ?? ""}`.toUpperCase() || "U";

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="flex items-center gap-3 px-4 md:px-6 py-3">
        <button
          onClick={onOpenMobile}
          className="md:hidden h-9 w-9 rounded-xl bg-muted hover:bg-muted/70 flex items-center justify-center"
          data-testid="mobile-open"
        >
          <Menu className="h-4 w-4" />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden md:flex h-9 w-9 rounded-xl bg-muted hover:bg-muted/70 items-center justify-center text-muted-foreground hover:text-foreground transition"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          data-testid="sidebar-toggle"
        >
          <ChevronsLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>

        <form role="search" className="flex-1 max-w-xl relative" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="header-search" className="sr-only">Search projects, DPRs and RA bills</label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-foreground/60 pointer-events-none" />
          <input
            id="header-search"
            type="search"
            placeholder="Search projects, DPRs, RA bills…"
            aria-label="Search projects, DPRs and RA bills"
            className="w-full h-10 rounded-full bg-muted border border-transparent focus:border-primary focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/15 pl-11 pr-4 text-[14px] font-medium text-foreground placeholder:text-foreground/50 placeholder:font-medium transition"
            data-testid="header-search"
          />
        </form>

        <div className="flex items-center gap-2">
          <LangSwitcher compact />
          <button
            onClick={toggle}
            className="h-9 w-9 rounded-xl bg-muted hover:bg-muted/70 flex items-center justify-center text-muted-foreground hover:text-foreground transition"
            title={dark ? "Light mode" : "Dark mode"}
            data-testid="theme-toggle"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <NotificationBell role={profile?.role} enabledModules={enabledModules} />

          {profile && (
            <div className="hidden sm:flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-full bg-muted hover:bg-muted/80 transition" data-testid="user-chip">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-400 to-indigo-500 text-white flex items-center justify-center text-[13px] font-extrabold ring-2 ring-background">
                {initials}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-bold text-foreground">{profile.firstName} {profile.lastName}</span>
                <span className="text-[11px] text-muted-foreground capitalize font-semibold">{profile.role}</span>
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            className="h-9 w-9 rounded-xl bg-muted hover:bg-rose-50 dark:hover:bg-rose-950 hover:text-rose-600 flex items-center justify-center text-muted-foreground transition"
            title={t("nav.logout")}
            data-testid="btn-logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────
export function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const { data: profile } = useGetMyProfile();
  const { data: orgs } = useListOrganisations();
  const { t } = useT();
  const myOrg = useMemo(
    () => (orgs ?? []).find((o: any) => o.id === profile?.organisationId),
    [orgs, profile?.organisationId],
  );
  const myOrgModules = useMemo<Set<string> | null>(() => {
    const list = (myOrg as any)?.enabledModules;
    return list == null ? null : new Set(list as string[]);
  }, [myOrg]);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("mc.sidebar.collapsed") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("mc.sidebar.collapsed", collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const groups = getNavGroups(profile?.role, myOrgModules);
  const handleLogout = async () => { await logout(); setLocation("/login"); };

  return (
    <div className="min-h-screen w-full bg-background text-foreground relative overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full bg-violet-300/20 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[420px] w-[420px] rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[320px] w-[320px] rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="flex">
        <div className="hidden md:block">
          <Sidebar groups={groups} collapsed={collapsed} t={t} />
        </div>

        {mobileOpen && (
          <>
            <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
            <Sidebar groups={groups} collapsed={false} mobile onClose={() => setMobileOpen(false)} t={t} />
          </>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <TopHeader
            onToggleSidebar={() => setCollapsed((c) => !c)}
            onOpenMobile={() => setMobileOpen(true)}
            collapsed={collapsed}
            profile={profile}
            onLogout={handleLogout}
            t={t}
            enabledModules={myOrgModules}
          />
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
