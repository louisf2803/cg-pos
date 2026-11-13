'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import {
  canRoleAccessDashboardPath,
  canRolePerformAction,
  createDefaultRoleDefinitions,
  DASHBOARD_ACCESS_MODULES,
  type ManagedEmployee,
  type PermissionActionKey,
  type RoleDefinition,
} from '@cgpos/shared';
import { useData } from '@/lib/data';

const SIDEBAR_COLLAPSED_KEY = 'cgpos.dashboard.sidebar_collapsed';
const ACTIVE_EMPLOYEE_KEY = 'cgpos.dashboard.active_employee_id';
const DASH_IDS = DASHBOARD_ACCESS_MODULES.map((m) => m.id);
const DEFAULT_OWNER_ROLE = createDefaultRoleDefinitions(DASH_IDS)[0]!;

interface ShellContextType {
  selectedOutlet: string;
  setSelectedOutlet: (id: string) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  lockedFeature: string | null;
  setLockedFeature: (feature: string | null) => void;
  infoModal: { title: string; message: string } | null;
  setInfoModal: (info: { title: string; message: string } | null) => void;
  activeModuleHint: string;
  setActiveModuleHint: (id: string) => void;

  // Izin Granular & Peran Aktif (A142)
  currentRole: RoleDefinition;
  currentEmployee: ManagedEmployee | null;
  allEmployees: ManagedEmployee[];
  allRoles: RoleDefinition[];
  switchEmployee: (employeeId: string | null) => void;
  canAccess: (pathname: string) => boolean;
  canDo: (action: PermissionActionKey, pathname?: string) => boolean;
  reloadRolesAndEmployees: () => Promise<void>;
}

const ShellContext = createContext<ShellContextType | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const data = useData();

  const [selectedOutlet, setSelectedOutlet] = useState<string>('semua');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(false);
  const [lockedFeature, setLockedFeature] = useState<string | null>(null);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);
  const [activeModuleHint, setActiveModuleHint] = useState<string>('penjualan');

  // Izin granular state
  const [allEmployees, setAllEmployees] = useState<ManagedEmployee[]>([]);
  const [allRoles, setAllRoles] = useState<RoleDefinition[]>([]);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === 'true') {
        setSidebarCollapsedState(true);
      }
      const storedEmpId = localStorage.getItem(ACTIVE_EMPLOYEE_KEY);
      if (storedEmpId) {
        setActiveEmployeeId(storedEmpId);
      }
    } catch {
      // Fallback gracefully without storage
    }
  }, []);

  const reloadRolesAndEmployees = useCallback(async () => {
    try {
      const [emps, rls] = await Promise.all([data.listManagedEmployees(), data.listRoles()]);
      setAllEmployees(emps);
      setAllRoles(rls);
    } catch {
      // Abaikan bila data belum siap
    }
  }, [data]);

  useEffect(() => {
    reloadRolesAndEmployees();
  }, [reloadRolesAndEmployees]);

  const currentEmployee = useMemo(() => {
    if (!activeEmployeeId) return null;
    return allEmployees.find((e) => e.id === activeEmployeeId) ?? null;
  }, [activeEmployeeId, allEmployees]);

  const currentRole = useMemo<RoleDefinition>(() => {
    if (!currentEmployee) return DEFAULT_OWNER_ROLE;

    // Bila karyawan memiliki tautan ke peran kustom
    if (currentEmployee.roleId) {
      const custom = allRoles.find((r) => r.id === currentEmployee.roleId);
      if (custom) return custom;
    }

    // Peran bawaan (owner, manager, cashier)
    const defaults = createDefaultRoleDefinitions(DASH_IDS);
    const matched = defaults.find((r) => r.baseRole === currentEmployee.role);
    return matched ?? DEFAULT_OWNER_ROLE;
  }, [currentEmployee, allRoles]);

  const switchEmployee = useCallback((employeeId: string | null) => {
    setActiveEmployeeId(employeeId);
    try {
      if (employeeId) {
        localStorage.setItem(ACTIVE_EMPLOYEE_KEY, employeeId);
      } else {
        localStorage.removeItem(ACTIVE_EMPLOYEE_KEY);
      }
    } catch {
      // Fallback gracefully
    }
  }, []);

  const canAccess = useCallback(
    (pathname: string): boolean => {
      return canRoleAccessDashboardPath(currentRole, pathname);
    },
    [currentRole],
  );

  const canDo = useCallback(
    (action: PermissionActionKey, pathname?: string): boolean => {
      const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
      return canRolePerformAction(currentRole, { pathname: path, action });
    },
    [currentRole],
  );

  const setSidebarCollapsed = (value: boolean | ((prev: boolean) => boolean)) => {
    setSidebarCollapsedState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Fallback gracefully without storage
      }
      return next;
    });
  };

  return (
    <ShellContext.Provider
      value={{
        selectedOutlet,
        setSelectedOutlet,
        mobileNavOpen,
        setMobileNavOpen,
        sidebarCollapsed,
        setSidebarCollapsed,
        lockedFeature,
        setLockedFeature,
        infoModal,
        setInfoModal,
        activeModuleHint,
        setActiveModuleHint,
        currentRole,
        currentEmployee,
        allEmployees,
        allRoles,
        switchEmployee,
        canAccess,
        canDo,
        reloadRolesAndEmployees,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellContextType {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return ctx;
}
