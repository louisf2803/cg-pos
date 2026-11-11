'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Info,
  Lock,
  Monitor,
  Settings,
  SlidersHorizontal,
  Smartphone,
  X,
} from 'lucide-react';
import {
  DASHBOARD_ACCESS_MODULES,
  PERMISSION_ACTION_KEYS,
  PERMISSION_ACTION_LABEL,
  POS_ACCESS_MODULES,
  availableDefaultPages,
  buildDefaultDashboardPerms,
  buildDefaultPosPerms,
  buildSubFeatureActionSet,
  isBuiltInRole,
  migrateRoleDefinition,
  sanitizeDefaultPages,
  subFeatureKey,
  validateRoleName,
  type AccessModuleDef,
  type ActionPermissionSet,
  type DashboardAccessLevel,
  type FeaturePermissionDef,
  type PermissionActionKey,
  type PosAccessLevel,
  type Role,
  type RoleDefinition,
} from '@cgpos/shared';

type WizardStep = 1 | 2 | 3 | 4;

const STEP_META: { step: WizardStep; title: string; short: string }[] = [
  { step: 1, title: 'Informasi Hak Akses', short: 'Informasi' },
  { step: 2, title: 'Hak Akses Dashboard', short: 'Dashboard' },
  { step: 3, title: 'Hak Akses POS', short: 'POS' },
  { step: 4, title: 'Pengaturan Lainnya', short: 'Lainnya' },
];

const BASE_ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'cashier', label: 'Kasir' },
  { value: 'manager', label: 'Manajer Outlet' },
  { value: 'owner', label: 'Pemilik Bisnis' },
];

type DetailModalTarget = {
  area: 'dashboard' | 'pos';
  moduleDef: AccessModuleDef;
  featureDef: FeaturePermissionDef;
  readOnly: boolean;
};

type Props = {
  initialRole: RoleDefinition;
  isNew: boolean;
  allRoles: RoleDefinition[];
  dashboardModuleIds: string[];
  onSave: (updated: RoleDefinition) => void;
  onClose: () => void;
};

function countActiveActions(
  feature: FeaturePermissionDef,
  permsMap: Record<string, ActionPermissionSet>,
): { activeSubs: number; totalSubs: number; badges: string[] } {
  let activeSubs = 0;
  const activeActionSet = new Set<PermissionActionKey>();
  for (const sub of feature.subFeatures) {
    const key = subFeatureKey(feature.id, sub.id);
    const cur = permsMap[key];
    let subHasAny = false;
    if (cur) {
      for (const act of sub.supportedActions) {
        if (cur[act] === true) {
          subHasAny = true;
          activeActionSet.add(act);
        }
      }
    }
    if (subHasAny) activeSubs += 1;
  }
  const badges = PERMISSION_ACTION_KEYS.filter((a) => activeActionSet.has(a)).map(
    (a) => PERMISSION_ACTION_LABEL[a],
  );
  return { activeSubs, totalSubs: feature.subFeatures.length, badges };
}

function deriveLegacyDashboardPerms(
  draft: RoleDefinition,
  dashboardModuleIds: string[],
): Record<string, DashboardAccessLevel> {
  const next: Record<string, DashboardAccessLevel> = { ...draft.dashboardPerms };
  for (const id of dashboardModuleIds) {
    if (!next[id]) next[id] = 'none';
  }
  const modEnabled = draft.dashboardModuleEnabled ?? {};
  const featEnabled = draft.dashboardFeatureEnabled ?? {};
  const subPerms = draft.dashboardSubFeaturePerms ?? {};

  for (const mod of DASHBOARD_ACCESS_MODULES) {
    if (!modEnabled[mod.id]) {
      next[mod.id] = 'none';
      continue;
    }
    let hasWrite = false;
    let hasRead = false;
    for (const feat of mod.features) {
      if (!featEnabled[feat.id]) continue;
      hasRead = true;
      for (const sub of feat.subFeatures) {
        const key = subFeatureKey(feat.id, sub.id);
        const set = subPerms[key];
        if (set?.buat === true || set?.ubah === true || set?.hapus === true || set?.void === true) {
          hasWrite = true;
        }
        if (set?.lihat === true) {
          hasRead = true;
        }
      }
    }
    next[mod.id] = hasWrite ? 'write' : hasRead ? 'read' : 'none';
  }
  return next;
}

function hasSubAction(
  permsMap: Record<string, ActionPermissionSet>,
  featureId: string,
  subId: string,
  action: PermissionActionKey,
): boolean {
  return permsMap[subFeatureKey(featureId, subId)]?.[action] === true;
}

function deriveLegacyPosPerms(draft: RoleDefinition): Record<string, PosAccessLevel> {
  if (!draft.posAppEnabled) {
    return {
      allow_void: 'deny',
      allow_refund: 'deny',
      allow_discount: 'deny',
      allow_price_override: 'deny',
      allow_cash_drawer_open: 'deny',
      allow_close_shift: 'deny',
      allow_view_shift_report: 'deny',
    };
  }

  const p = draft.posSubFeaturePerms ?? {};
  const featEnabled = draft.posFeatureEnabled ?? {};

  const allowVoid =
    Boolean(draft.canAuthorizeVoid) ||
    hasSubAction(p, 'pos-riwayat', 'pos-void-refund', 'void');
  const allowRefund =
    Boolean(draft.canAuthorizeRefund) ||
    hasSubAction(p, 'pos-riwayat', 'pos-void-refund', 'buat');
  const allowDiscount = hasSubAction(p, 'pos-transaksi', 'pos-diskon', 'ubah');
  const allowDrawer = hasSubAction(p, 'pos-transaksi', 'pos-laci', 'buat');
  const allowLap = Boolean(featEnabled['pos-lap-harian']);

  return {
    ...draft.posPerms,
    allow_void: allowVoid ? 'allow' : 'approve',
    allow_refund: allowRefund ? 'allow' : 'approve',
    allow_discount: allowDiscount ? 'allow' : 'approve',
    allow_price_override: allowDiscount ? 'allow' : 'approve',
    allow_cash_drawer_open: allowDrawer ? 'allow' : 'deny',
    allow_close_shift: Boolean(featEnabled['pos-transaksi']) ? 'allow' : 'deny',
    allow_view_shift_report: allowLap ? 'allow' : 'deny',
  };
}

export function RoleWizardModal({
  initialRole,
  isNew,
  allRoles,
  dashboardModuleIds,
  onSave,
  onClose,
}: Props) {
  const wizardRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const builtIn = isBuiltInRole(initialRole);

  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<RoleDefinition>(() => {
    const migrated = migrateRoleDefinition(initialRole, dashboardModuleIds);
    return {
      ...migrated,
      dashboardModuleEnabled: { ...(migrated.dashboardModuleEnabled ?? {}) },
      dashboardFeatureEnabled: { ...(migrated.dashboardFeatureEnabled ?? {}) },
      dashboardSubFeaturePerms: { ...(migrated.dashboardSubFeaturePerms ?? {}) },
      posAppEnabled: Boolean(migrated.posAppEnabled),
      posModuleEnabled: { ...(migrated.posModuleEnabled ?? {}), 'pos-pengaturan': true },
      posFeatureEnabled: { ...(migrated.posFeatureEnabled ?? {}) },
      posSubFeaturePerms: { ...(migrated.posSubFeaturePerms ?? {}) },
      canAuthorizeRefund: Boolean(migrated.canAuthorizeRefund),
      canAuthorizeVoid: Boolean(migrated.canAuthorizeVoid),
      canAuthorizeComplimentary: Boolean(migrated.canAuthorizeComplimentary),
      defaultDashboardPage: migrated.defaultDashboardPage ?? '',
      defaultPosPage: migrated.defaultPosPage ?? '',
    };
  });

  const [activeDashModId, setActiveDashModId] = useState<string>(
    DASHBOARD_ACCESS_MODULES[0]?.id ?? 'penjualan',
  );
  const [activePosModId, setActivePosModId] = useState<string>(
    POS_ACCESS_MODULES[0]?.id ?? 'pos-kasir',
  );
  const [formErr, setFormErr] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<DetailModalTarget | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  useEffect(() => {
    wizardRef.current?.showModal();
  }, []);

  const dashModules = DASHBOARD_ACCESS_MODULES;
  const posModules = POS_ACCESS_MODULES;
  const selectedDashMod =
    dashModules.find((m) => m.id === activeDashModId) ?? dashModules[0];
  const selectedPosMod =
    posModules.find((m) => m.id === activePosModId) ?? posModules[0];

  const dashDefaultPages = useMemo(
    () => availableDefaultPages(draft, 'dashboard'),
    [draft],
  );
  const posDefaultPages = useMemo(
    () => availableDefaultPages(draft, 'pos'),
    [draft],
  );

  const activeDashPageValue = dashDefaultPages.some(
    (p) => p.pageId === draft.defaultDashboardPage,
  )
    ? (draft.defaultDashboardPage ?? '')
    : '';
  const activePosPageValue = posDefaultPages.some(
    (p) => p.pageId === draft.defaultPosPage,
  )
    ? (draft.defaultPosPage ?? '')
    : '';

  const requestClose = () => {
    setConfirmCancelOpen(true);
  };

  const handleConfirmDiscard = () => {
    setConfirmCancelOpen(false);
    setDetailTarget(null);
    onClose();
  };

  const validateStep1 = (): boolean => {
    const err = validateRoleName(
      draft.name,
      allRoles,
      isNew ? undefined : initialRole.id,
    );
    if (err) {
      setFormErr(err);
      setStep(1);
      nameInputRef.current?.focus();
      return false;
    }
    setFormErr(null);
    return true;
  };

  const handleStepClick = (target: WizardStep) => {
    if (target > 1 && !validateStep1()) return;
    setStep(target);
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step < 4) {
      setStep((prev) => (prev + 1) as WizardStep);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setFormErr(null);
      setStep((prev) => (prev - 1) as WizardStep);
    }
  };

  const handleApplyTemplateBase = (templateRole: Role) => {
    setDraft((prev) => {
      const nextDashPerms = buildDefaultDashboardPerms(templateRole, dashboardModuleIds);
      const nextPosPerms = buildDefaultPosPerms(templateRole);
      const seeded = migrateRoleDefinition(
        {
          id: prev.id,
          name: prev.name,
          description: prev.description,
          isBuiltIn: false,
          baseRole: templateRole,
          ownerAppAccess: prev.ownerAppAccess,
          dashboardPerms: nextDashPerms,
          posPerms: nextPosPerms,
        },
        dashboardModuleIds,
      );
      return sanitizeDefaultPages({
        ...prev,
        baseRole: templateRole,
        dashboardPerms: nextDashPerms,
        posPerms: nextPosPerms,
        dashboardModuleEnabled: seeded.dashboardModuleEnabled ?? {},
        dashboardFeatureEnabled: seeded.dashboardFeatureEnabled ?? {},
        dashboardSubFeaturePerms: seeded.dashboardSubFeaturePerms ?? {},
        posAppEnabled: true,
        posModuleEnabled: seeded.posModuleEnabled ?? { 'pos-pengaturan': true },
        posFeatureEnabled: seeded.posFeatureEnabled ?? {},
        posSubFeaturePerms: seeded.posSubFeaturePerms ?? {},
        canAuthorizeRefund: Boolean(seeded.canAuthorizeRefund),
        canAuthorizeVoid: Boolean(seeded.canAuthorizeVoid),
        canAuthorizeComplimentary: Boolean(seeded.canAuthorizeComplimentary),
        defaultDashboardPage: seeded.defaultDashboardPage ?? '',
        defaultPosPage: seeded.defaultPosPage ?? '',
      });
    });
  };

  const toggleModule = (
    area: 'dashboard' | 'pos',
    moduleDef: AccessModuleDef,
    nextVal: boolean,
  ) => {
    if (area === 'pos' && moduleDef.masterLocked) return;

    setDraft((prev) => {
      const prevMod = (area === 'dashboard' ? prev.dashboardModuleEnabled : prev.posModuleEnabled) ?? {};
      const prevFeat = (area === 'dashboard' ? prev.dashboardFeatureEnabled : prev.posFeatureEnabled) ?? {};
      const prevSub = (area === 'dashboard' ? prev.dashboardSubFeaturePerms : prev.posSubFeaturePerms) ?? {};

      const nextModEnabled: Record<string, boolean> = { ...prevMod, [moduleDef.id]: nextVal };
      const nextFeatEnabled: Record<string, boolean> = { ...prevFeat };
      const nextSubPerms: Record<string, ActionPermissionSet> = { ...prevSub };

      for (const feat of moduleDef.features) {
        nextFeatEnabled[feat.id] = nextVal;
        for (const sub of feat.subFeatures) {
          const k = subFeatureKey(feat.id, sub.id);
          if (nextVal) {
            const existing = nextSubPerms[k];
            const hasAny = existing && sub.supportedActions.some((a) => existing[a] === true);
            nextSubPerms[k] = hasAny
              ? {
                  ...existing,
                  lihat: sub.supportedActions.includes('lihat') ? true : existing.lihat,
                }
              : buildSubFeatureActionSet(sub, (a) => a === 'lihat');
          } else {
            nextSubPerms[k] = buildSubFeatureActionSet(sub, false);
          }
        }
      }

      if (area === 'dashboard') {
        return sanitizeDefaultPages({
          ...prev,
          dashboardModuleEnabled: nextModEnabled,
          dashboardFeatureEnabled: nextFeatEnabled,
          dashboardSubFeaturePerms: nextSubPerms,
        });
      }
      return sanitizeDefaultPages({
        ...prev,
        posModuleEnabled: { ...nextModEnabled, 'pos-pengaturan': true },
        posFeatureEnabled: nextFeatEnabled,
        posSubFeaturePerms: nextSubPerms,
      });
    });
  };

  const toggleFeature = (
    area: 'dashboard' | 'pos',
    moduleDef: AccessModuleDef,
    featureDef: FeaturePermissionDef,
    nextVal: boolean,
  ) => {
    if (area === 'pos' && moduleDef.masterLocked) return;

    setDraft((prev) => {
      const prevMod = (area === 'dashboard' ? prev.dashboardModuleEnabled : prev.posModuleEnabled) ?? {};
      const prevFeat = (area === 'dashboard' ? prev.dashboardFeatureEnabled : prev.posFeatureEnabled) ?? {};
      const prevSub = (area === 'dashboard' ? prev.dashboardSubFeaturePerms : prev.posSubFeaturePerms) ?? {};

      const nextFeatEnabled: Record<string, boolean> = { ...prevFeat, [featureDef.id]: nextVal };
      const nextSubPerms: Record<string, ActionPermissionSet> = { ...prevSub };

      for (const sub of featureDef.subFeatures) {
        const k = subFeatureKey(featureDef.id, sub.id);
        if (nextVal) {
          const existing = nextSubPerms[k];
          const hasAny = existing && sub.supportedActions.some((a) => existing[a] === true);
          nextSubPerms[k] = hasAny
            ? {
                ...existing,
                lihat: sub.supportedActions.includes('lihat') ? true : existing.lihat,
              }
            : buildSubFeatureActionSet(sub, (a) => a === 'lihat');
        } else {
          nextSubPerms[k] = buildSubFeatureActionSet(sub, false);
        }
      }

      const anyFeatOnInMod = moduleDef.features.some((f) => Boolean(nextFeatEnabled[f.id]));
      const nextModEnabled: Record<string, boolean> = { ...prevMod, [moduleDef.id]: anyFeatOnInMod };

      if (area === 'dashboard') {
        return sanitizeDefaultPages({
          ...prev,
          dashboardModuleEnabled: nextModEnabled,
          dashboardFeatureEnabled: nextFeatEnabled,
          dashboardSubFeaturePerms: nextSubPerms,
        });
      }
      return sanitizeDefaultPages({
        ...prev,
        posModuleEnabled: { ...nextModEnabled, 'pos-pengaturan': true },
        posFeatureEnabled: nextFeatEnabled,
        posSubFeaturePerms: nextSubPerms,
      });
    });
  };

  const togglePosApp = (nextVal: boolean) => {
    setDraft((prev) =>
      sanitizeDefaultPages({
        ...prev,
        posAppEnabled: nextVal,
        posModuleEnabled: { ...(prev.posModuleEnabled ?? {}), 'pos-pengaturan': true },
      }),
    );
  };

  const handleSaveDetailPerms = (
    target: DetailModalTarget,
    updatedMap: Record<string, ActionPermissionSet>,
  ) => {
    if (target.readOnly) {
      setDetailTarget(null);
      return;
    }

    setDraft((prev) => {
      const area = target.area;
      const prevMod = (area === 'dashboard' ? prev.dashboardModuleEnabled : prev.posModuleEnabled) ?? {};
      const prevFeat = (area === 'dashboard' ? prev.dashboardFeatureEnabled : prev.posFeatureEnabled) ?? {};
      const prevSub = (area === 'dashboard' ? prev.dashboardSubFeaturePerms : prev.posSubFeaturePerms) ?? {};

      const nextSubPerms: Record<string, ActionPermissionSet> = { ...prevSub, ...updatedMap };
      const featHasAny = target.featureDef.subFeatures.some((sub) => {
        const set = nextSubPerms[subFeatureKey(target.featureDef.id, sub.id)];
        return Boolean(set && sub.supportedActions.some((a) => set[a] === true));
      });

      const nextFeatEnabled: Record<string, boolean> = { ...prevFeat, [target.featureDef.id]: featHasAny };
      const modHasAny = target.moduleDef.features.some((f) => Boolean(nextFeatEnabled[f.id]));
      const nextModEnabled: Record<string, boolean> = {
        ...prevMod,
        [target.moduleDef.id]: target.moduleDef.masterLocked ? true : modHasAny,
      };

      if (area === 'dashboard') {
        return sanitizeDefaultPages({
          ...prev,
          dashboardModuleEnabled: nextModEnabled,
          dashboardFeatureEnabled: nextFeatEnabled,
          dashboardSubFeaturePerms: nextSubPerms,
        });
      }
      return sanitizeDefaultPages({
        ...prev,
        posModuleEnabled: { ...nextModEnabled, 'pos-pengaturan': true },
        posFeatureEnabled: nextFeatEnabled,
        posSubFeaturePerms: nextSubPerms,
      });
    });
    setDetailTarget(null);
  };

  const commitSave = () => {
    if (!validateStep1()) return;

    const prepared: RoleDefinition = sanitizeDefaultPages({
      ...draft,
      name: builtIn ? initialRole.name : draft.name.trim(),
      description: draft.description.trim(),
      ownerAppAccess: Boolean(initialRole.ownerAppAccess),
      posModuleEnabled: {
        ...(draft.posModuleEnabled ?? {}),
        'pos-pengaturan': true,
      },
      dashboardPerms: deriveLegacyDashboardPerms(draft, dashboardModuleIds),
      posPerms: deriveLegacyPosPerms(draft),
    });

    onSave(prepared);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step !== 4) {
      handleNext();
      return;
    }
    commitSave();
  };

  const renderModuleFeaturePanel = (
    area: 'dashboard' | 'pos',
    moduleDef: AccessModuleDef,
  ) => {
    const modEnabledMap =
      (area === 'dashboard' ? draft.dashboardModuleEnabled : draft.posModuleEnabled) ?? {};
    const featEnabledMap =
      (area === 'dashboard' ? draft.dashboardFeatureEnabled : draft.posFeatureEnabled) ?? {};
    const subPermsMap =
      (area === 'dashboard' ? draft.dashboardSubFeaturePerms : draft.posSubFeaturePerms) ?? {};

    const modLocked = Boolean(moduleDef.masterLocked);
    const modActive = modLocked ? true : Boolean(modEnabledMap[moduleDef.id]);

    return (
      <div className="grid gap-12 p-16 rounded-xl border border-border bg-surface min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-12 pb-12 border-b border-border min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-8">
              <strong className="text-base text-text break-words">
                Modul {moduleDef.label}
              </strong>
              {modLocked && (
                <span className="cg-badge cg-badge--info inline-flex items-center gap-4">
                  <Lock className="cg-icon cg-icon--sm" aria-hidden />
                  Terkunci Aktif
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-4">
              {modLocked
                ? 'Tab Pengaturan POS selalu aktif dan tidak dapat dimatikan oleh siapa pun.'
                : `Aktifkan modul ini atau atur izin detail per fitur (${moduleDef.features.length} fitur).`}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={modActive}
            disabled={modLocked}
            aria-label={`Aktifkan modul ${area === 'pos' ? 'POS ' : ''}${moduleDef.label}`}
            className="cg-toggle shrink-0"
            data-testid={`${area}-mod-toggle-${moduleDef.id}`}
            onClick={() => toggleModule(area, moduleDef, !modActive)}
          />
        </div>

        <div className="grid gap-8 min-w-0">
          {moduleDef.features.map((feat) => {
            const isFeatOn = modLocked ? true : Boolean(featEnabledMap[feat.id]);
            const summary = countActiveActions(feat, subPermsMap);
            return (
              <div
                key={feat.id}
                className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 p-12 rounded-lg border border-border bg-surface-raised min-w-0"
                data-testid={`${area}-feat-${feat.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-8">
                    <span className="font-semibold text-sm text-text break-words">
                      {feat.label}
                    </span>
                    {isFeatOn ? (
                      <span className="cg-badge cg-badge--success">
                        {summary.badges.length > 0
                          ? summary.badges.join(', ')
                          : `${summary.activeSubs}/${summary.totalSubs} sub-fitur`}
                      </span>
                    ) : (
                      <span className="cg-badge">Nonaktif</span>
                    )}
                  </div>
                  {feat.description && (
                    <p className="text-xs text-text-muted mt-4 break-words">
                      {feat.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-8 shrink-0">
                  <button
                    type="button"
                    className="cg-btn cg-btn--secondary cg-btn--sm"
                    data-testid={`${area}-detail-btn-${feat.id}`}
                    onClick={() =>
                      setDetailTarget({
                        area,
                        moduleDef,
                        featureDef: feat,
                        readOnly: modLocked,
                      })
                    }
                  >
                    <SlidersHorizontal className="cg-icon cg-icon--sm" aria-hidden />
                    Detail Fitur
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isFeatOn}
                    disabled={modLocked}
                    aria-label={`Aktifkan fitur ${feat.label}`}
                    data-testid={`${area}-feat-toggle-${feat.id}`}
                    className="cg-toggle shrink-0"
                    onClick={() => toggleFeature(area, moduleDef, feat, !isFeatOn)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const dashFeatEnabledMap = draft.dashboardFeatureEnabled ?? {};
  const posFeatEnabledMap = draft.posFeatureEnabled ?? {};

  return (
    <>
      <dialog
        ref={wizardRef}
        className="cg-modal"
        style={{
          margin: 'auto',
          width: 'min(840px, calc(100vw - 16px))',
          maxWidth: 'min(840px, calc(100vw - 16px))',
        }}
        aria-labelledby="role-wizard-title"
        onCancel={(e) => {
          e.preventDefault();
          requestClose();
        }}
        onClick={(e) => {
          if (e.target === wizardRef.current) requestClose();
        }}
      >
        <div className="flex items-start justify-between gap-12 min-w-0">
          <div className="min-w-0">
            <h2 id="role-wizard-title" className="cg-modal__title break-words">
              {isNew ? 'Tambah Hak Akses' : `Atur Hak Akses: ${initialRole.name}`}
            </h2>
            <p className="text-xs text-text-muted mt-4 break-words">
              Langkah {step} dari 4 — {STEP_META.find((s) => s.step === step)?.title}
            </p>
          </div>
          <button
            type="button"
            className="cg-btn cg-btn--ghost cg-btn--sm shrink-0"
            aria-label="Tutup wizard hak akses"
            data-testid="wizard-close-x"
            onClick={requestClose}
          >
            <X className="cg-icon cg-icon--sm" aria-hidden />
          </button>
        </div>

        {/* Stepper 4 Langkah */}
        <nav aria-label="Tahapan pengaturan hak akses" className="grid grid-cols-2 tablet:grid-cols-4 gap-8">
          {STEP_META.map((item) => {
            const isCurrent = step === item.step;
            const isDone = step > item.step;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => handleStepClick(item.step)}
                aria-current={isCurrent ? 'step' : undefined}
                data-testid={`wizard-step-${item.step}`}
                className={`flex items-center gap-8 p-8 rounded-lg border text-left transition-colors min-w-0 ${
                  isCurrent
                    ? 'border-accent bg-accent-soft text-accent-strong font-semibold'
                    : isDone
                      ? 'border-border bg-surface-raised text-text hover:bg-surface'
                      : 'border-border bg-surface text-text-muted hover:bg-surface-raised'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-[24px] h-[24px] rounded-pill text-xs font-bold shrink-0 ${
                    isCurrent
                      ? 'bg-accent text-on-accent'
                      : isDone
                        ? 'bg-success-soft text-success-strong'
                        : 'bg-surface-raised border border-border text-text-muted'
                  }`}
                >
                  {isDone ? <Check className="cg-icon cg-icon--sm" aria-hidden /> : item.step}
                </span>
                <span className="text-xs leading-tight break-words min-w-0">
                  <span className="hidden laptop:inline">{item.title}</span>
                  <span className="laptop:hidden">{item.short}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <form onSubmit={handleSubmit} className="grid gap-16 min-w-0">
          {formErr && (
            <div role="alert" className="cg-banner cg-banner--danger">
              <span>{formErr}</span>
            </div>
          )}

          {/* STEP 1: Informasi Hak Akses */}
          {step === 1 && (
            <div className="grid gap-16 min-w-0" data-testid="wizard-panel-1">
              <div className="flex items-center gap-8 text-sm font-semibold text-text">
                <Info className="cg-icon cg-icon--sm text-accent-strong shrink-0" aria-hidden />
                <span>Informasi Dasar Peran</span>
              </div>

              <div className="cg-field">
                <label className="cg-label" htmlFor="wizard-role-name">
                  Nama Hak Akses <span className="text-danger">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="wizard-role-name"
                  type="text"
                  className="cg-input"
                  value={draft.name}
                  disabled={builtIn}
                  placeholder="Contoh: Kasir Senior"
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormErr(null);
                    setDraft((prev) => ({ ...prev, name: val }));
                  }}
                />
                {builtIn ? (
                  <span className="cg-hint">Nama peran bawaan sistem tidak dapat diubah.</span>
                ) : (
                  <span className="cg-hint">
                    Nama akan tampil saat menugaskan hak akses pada profil karyawan.
                  </span>
                )}
              </div>

              <div className="cg-field">
                <label className="cg-label" htmlFor="wizard-role-desc">
                  Deskripsi (opsional)
                </label>
                <input
                  id="wizard-role-desc"
                  type="text"
                  className="cg-input"
                  value={draft.description}
                  placeholder="Ringkasan tanggung jawab peran ini"
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((prev) => ({ ...prev, description: val }));
                  }}
                />
              </div>

              {isNew && (
                <div className="cg-field">
                  <label className="cg-label" htmlFor="wizard-template-select">
                    Templat awal izin (opsional)
                  </label>
                  <select
                    id="wizard-template-select"
                    className="cg-select"
                    defaultValue=""
                    onChange={(e) => {
                      const val = e.target.value as Role | '';
                      if (val) handleApplyTemplateBase(val);
                    }}
                  >
                    <option value="">Mulai kosong (pilih fitur secara manual)</option>
                    {BASE_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Salin dasar izin {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="cg-hint">
                    Memilih templat akan mengisi izin awal, tetapi Anda tetap bebas mengaturnya di langkah berikut.
                  </span>
                </div>
              )}

              <div
                className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 p-16 rounded-xl border border-border bg-surface"
                data-testid="owner-app-access-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-8">
                    <span className="text-sm font-semibold text-text">Akses Aplikasi Owner</span>
                    <span className="cg-badge cg-badge--info inline-flex items-center gap-4">
                      <Lock className="cg-icon cg-icon--sm" aria-hidden />
                      Hanya Owner yang dapat merubah
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-4 break-words">
                    Akses ke ringkasan analitik Aplikasi Owner dikunci hanya untuk akun Owner utama.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(draft.ownerAppAccess)}
                  aria-label="Akses Aplikasi Owner"
                  disabled
                  data-testid="owner-app-access-toggle"
                  className="cg-toggle shrink-0"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Hak Akses Dashboard */}
          {step === 2 && (
            <div className="grid gap-12 min-w-0" data-testid="wizard-panel-2">
              <div className="flex flex-wrap items-center justify-between gap-8">
                <div className="flex items-center gap-8 text-sm font-semibold text-text">
                  <Monitor className="cg-icon cg-icon--sm text-accent-strong shrink-0" aria-hidden />
                  <span>Hak Akses Dashboard Web</span>
                </div>
                <span className="text-xs text-text-muted">
                  Pilih modul lalu atur fitur atau klik Detail Fitur untuk izin Lihat/Buat/Ubah/Hapus/Void.
                </span>
              </div>

              <div
                className="flex flex-wrap gap-8"
                role="tablist"
                aria-label="Modul Dashboard Web"
              >
                {dashModules.map((mod) => {
                  const isActiveTab = selectedDashMod?.id === mod.id;
                  const onCount = mod.features.filter((f) => Boolean(dashFeatEnabledMap[f.id])).length;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      role="tab"
                      aria-selected={isActiveTab}
                      aria-pressed={isActiveTab}
                      data-testid={`dash-tab-${mod.id}`}
                      className="cg-chip"
                      onClick={() => setActiveDashModId(mod.id)}
                    >
                      <span>{mod.label}</span>
                      <span className="text-xs opacity-80">
                        ({onCount}/{mod.features.length})
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedDashMod && renderModuleFeaturePanel('dashboard', selectedDashMod)}
            </div>
          )}

          {/* STEP 3: Hak Akses POS */}
          {step === 3 && (
            <div className="grid gap-12 min-w-0" data-testid="wizard-panel-3">
              <div className="flex items-center gap-8 text-sm font-semibold text-text">
                <Smartphone className="cg-icon cg-icon--sm text-accent-strong shrink-0" aria-hidden />
                <span>Hak Akses Aplikasi POS</span>
              </div>

              <div className="flex flex-col tablet:flex-row tablet:items-center justify-between gap-12 p-16 rounded-xl border border-border bg-surface-raised">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-text">
                    Aktifkan Akses Aplikasi POS
                  </div>
                  <p className="text-xs text-text-muted mt-4 break-words">
                    Izinkan peran ini masuk dan mengoperasikan aplikasi kasir POS di tablet atau desktop.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(draft.posAppEnabled)}
                  aria-label="Aktifkan Akses Aplikasi POS"
                  data-testid="pos-app-master-toggle"
                  className="cg-toggle shrink-0"
                  onClick={() => togglePosApp(!draft.posAppEnabled)}
                />
              </div>

              {!draft.posAppEnabled ? (
                <div className="cg-banner cg-banner--info" data-testid="pos-disabled-notice">
                  <span>
                    Akses Aplikasi POS sedang nonaktif. Aktifkan switch di atas untuk mengatur tab dan fitur POS.
                  </span>
                </div>
              ) : (
                <>
                  <div
                    className="flex flex-wrap gap-8"
                    role="tablist"
                    aria-label="Modul Aplikasi POS"
                  >
                    {posModules.map((mod) => {
                      const isActiveTab = selectedPosMod?.id === mod.id;
                      const onCount = mod.masterLocked
                        ? mod.features.length
                        : mod.features.filter((f) => Boolean(posFeatEnabledMap[f.id])).length;
                      return (
                        <button
                          key={mod.id}
                          type="button"
                          role="tab"
                          aria-selected={isActiveTab}
                          aria-pressed={isActiveTab}
                          data-testid={`pos-tab-${mod.id}`}
                          className="cg-chip"
                          onClick={() => setActivePosModId(mod.id)}
                        >
                          {mod.masterLocked && <Lock className="cg-icon cg-icon--sm" aria-hidden />}
                          <span>{mod.label}</span>
                          <span className="text-xs opacity-80">
                            ({onCount}/{mod.features.length})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedPosMod && renderModuleFeaturePanel('pos', selectedPosMod)}
                </>
              )}
            </div>
          )}

          {/* STEP 4: Pengaturan Lainnya */}
          {step === 4 && (
            <div className="grid gap-16 min-w-0" data-testid="wizard-panel-4">
              <div className="flex items-center gap-8 text-sm font-semibold text-text">
                <Settings className="cg-icon cg-icon--sm text-accent-strong shrink-0" aria-hidden />
                <span>Pengaturan Lainnya</span>
              </div>

              {/* Pengaturan Otorisasi */}
              <div className="grid gap-12 p-16 rounded-xl border border-border bg-surface">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-text">Pengaturan Otorisasi</div>
                  <p className="text-xs text-text-muted mt-4 break-words">
                    Atur otorisasi agar karyawan dengan kustom hak akses ini muncul pada POS bagian &lsquo;Otorisasi Oleh&rsquo;.
                  </p>
                </div>

                <div className="grid gap-8">
                  <div className="flex items-center justify-between gap-12 p-12 rounded-lg border border-border bg-surface-raised">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text">Otorisasi Refund</div>
                      <div className="text-xs text-text-muted">
                        Dapat menyetujui pengembalian dana transaksi di kasir.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(draft.canAuthorizeRefund)}
                      aria-label="Otorisasi Refund"
                      data-testid="auth-refund-toggle"
                      className="cg-toggle shrink-0"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          canAuthorizeRefund: !prev.canAuthorizeRefund,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-12 p-12 rounded-lg border border-border bg-surface-raised">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text">Otorisasi Void</div>
                      <div className="text-xs text-text-muted">
                        Dapat menyetujui pembatalan pesanan atau item yang sudah tercetak.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(draft.canAuthorizeVoid)}
                      aria-label="Otorisasi Void"
                      data-testid="auth-void-toggle"
                      className="cg-toggle shrink-0"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          canAuthorizeVoid: !prev.canAuthorizeVoid,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-12 p-12 rounded-lg border border-border bg-surface-raised">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text">Otorisasi Komplimen</div>
                      <div className="text-xs text-text-muted">
                        Dapat mengotorisasi pemberian item atau pesanan gratis kepada tamu.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(draft.canAuthorizeComplimentary)}
                      aria-label="Otorisasi Komplimen"
                      data-testid="auth-complimentary-toggle"
                      className="cg-toggle shrink-0"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          canAuthorizeComplimentary: !prev.canAuthorizeComplimentary,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Pengaturan Halaman Awal */}
              <div className="grid gap-12 p-16 rounded-xl border border-border bg-surface">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-text">Pengaturan Halaman Awal</div>
                  <p className="text-xs text-text-muted mt-4 break-words">
                    Daftar pilihan hanya menampilkan halaman yang memiliki akses Lihat dari langkah sebelumnya.
                  </p>
                </div>

                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-12">
                  <div className="cg-field">
                    <label className="cg-label" htmlFor="default-dash-page">
                      Pilih Halaman Dashboard
                    </label>
                    <select
                      id="default-dash-page"
                      className="cg-select"
                      disabled={dashDefaultPages.length === 0}
                      value={activeDashPageValue}
                      data-testid="default-dash-page-select"
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((prev) => ({ ...prev, defaultDashboardPage: val }));
                      }}
                    >
                      <option value="">
                        {dashDefaultPages.length === 0
                          ? 'Belum ada halaman Dashboard berizin Lihat'
                          : '-- Pilih halaman awal Dashboard --'}
                      </option>
                      {dashDefaultPages.map((opt) => (
                        <option key={opt.pageId} value={opt.pageId}>
                          {opt.moduleLabel} — {opt.label}
                        </option>
                      ))}
                    </select>
                    {dashDefaultPages.length === 0 && (
                      <span className="cg-hint text-warning-strong" data-testid="default-dash-empty-hint">
                        Aktifkan minimal satu fitur Dashboard dengan izin Lihat untuk membuka pilihan ini.
                      </span>
                    )}
                  </div>

                  <div className="cg-field">
                    <label className="cg-label" htmlFor="default-pos-page">
                      Pilih Halaman POS
                    </label>
                    <select
                      id="default-pos-page"
                      className="cg-select"
                      disabled={posDefaultPages.length === 0}
                      value={activePosPageValue}
                      data-testid="default-pos-page-select"
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((prev) => ({ ...prev, defaultPosPage: val }));
                      }}
                    >
                      <option value="">
                        {posDefaultPages.length === 0
                          ? !draft.posAppEnabled
                            ? 'Aktifkan Akses Aplikasi POS terlebih dahulu'
                            : 'Belum ada halaman POS berizin Lihat'
                          : '-- Pilih halaman awal POS --'}
                      </option>
                      {posDefaultPages.map((opt) => (
                        <option key={opt.pageId} value={opt.pageId}>
                          {opt.moduleLabel} — {opt.label}
                        </option>
                      ))}
                    </select>
                    {posDefaultPages.length === 0 && (
                      <span className="cg-hint text-warning-strong" data-testid="default-pos-empty-hint">
                        {!draft.posAppEnabled
                          ? 'Akses Aplikasi POS masih nonaktif di langkah sebelumnya.'
                          : 'Aktifkan minimal satu fitur POS dengan izin Lihat untuk membuka pilihan ini.'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Wizard */}
          <div className="cg-modal__actions pt-8 border-t border-border">
            {step === 1 ? (
              <button
                type="button"
                className="cg-btn cg-btn--secondary"
                data-testid="wizard-btn-cancel"
                onClick={requestClose}
              >
                Batal
              </button>
            ) : (
              <button
                type="button"
                className="cg-btn cg-btn--secondary"
                data-testid="wizard-btn-back"
                onClick={handleBack}
              >
                Kembali
              </button>
            )}

            {step < 4 ? (
              <button
                key="wizard-btn-next"
                type="button"
                className="cg-btn cg-btn--primary"
                data-testid="wizard-btn-next"
                onClick={handleNext}
              >
                Selanjutnya
              </button>
            ) : (
              <button
                key="wizard-btn-save"
                type="button"
                className="cg-btn cg-btn--primary"
                data-testid="wizard-btn-save"
                onClick={commitSave}
              >
                Simpan
              </button>
            )}
          </div>
        </form>
      </dialog>

      {detailTarget && (
        <FeatureDetailDialog
          target={detailTarget}
          initialSubPerms={
            (detailTarget.area === 'dashboard'
              ? draft.dashboardSubFeaturePerms
              : draft.posSubFeaturePerms) ?? {}
          }
          onSave={(updated) => handleSaveDetailPerms(detailTarget, updated)}
          onClose={() => setDetailTarget(null)}
        />
      )}

      {confirmCancelOpen && (
        <ExitConfirmDialog
          onContinueEdit={() => setConfirmCancelOpen(false)}
          onConfirmDiscard={handleConfirmDiscard}
        />
      )}
    </>
  );
}

function FeatureDetailDialog({
  target,
  initialSubPerms,
  onSave,
  onClose,
}: {
  target: DetailModalTarget;
  initialSubPerms: Record<string, ActionPermissionSet>;
  onSave: (updatedMap: Record<string, ActionPermissionSet>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [localPerms, setLocalPerms] = useState<Record<string, ActionPermissionSet>>(() => {
    const seeded: Record<string, ActionPermissionSet> = {};
    for (const sub of target.featureDef.subFeatures) {
      const key = subFeatureKey(target.featureDef.id, sub.id);
      if (target.readOnly) {
        seeded[key] = buildSubFeatureActionSet(sub, true);
      } else {
        const cur = initialSubPerms[key];
        seeded[key] = cur ? { ...cur } : buildSubFeatureActionSet(sub, false);
      }
    }
    return seeded;
  });

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const toggleAction = (
    subId: string,
    allowedActions: readonly PermissionActionKey[],
    action: PermissionActionKey,
  ) => {
    if (target.readOnly) return;
    const key = subFeatureKey(target.featureDef.id, subId);
    setLocalPerms((prev) => {
      const cur = prev[key] ?? {
        lihat: false,
        buat: false,
        ubah: false,
        hapus: false,
        void: false,
      };
      const nextVal = !(cur[action] === true);
      const nextSet: ActionPermissionSet = { ...cur, [action]: nextVal };

      if (nextVal && action !== 'lihat' && allowedActions.includes('lihat')) {
        nextSet.lihat = true;
      }
      if (!nextVal && action === 'lihat') {
        if (nextSet.buat !== null) nextSet.buat = false;
        if (nextSet.ubah !== null) nextSet.ubah = false;
        if (nextSet.hapus !== null) nextSet.hapus = false;
        if (nextSet.void !== null) nextSet.void = false;
      }
      return { ...prev, [key]: nextSet };
    });
  };

  const applyAll = (mode: 'all' | 'lihat' | 'none') => {
    if (target.readOnly) return;
    const next: Record<string, ActionPermissionSet> = {};
    for (const sub of target.featureDef.subFeatures) {
      const key = subFeatureKey(target.featureDef.id, sub.id);
      if (mode === 'all') {
        next[key] = buildSubFeatureActionSet(sub, true);
      } else if (mode === 'lihat') {
        next[key] = buildSubFeatureActionSet(sub, (a) => a === 'lihat');
      } else {
        next[key] = buildSubFeatureActionSet(sub, false);
      }
    }
    setLocalPerms(next);
  };

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      style={{
        margin: 'auto',
        width: 'min(720px, calc(100vw - 16px))',
        maxWidth: 'min(720px, calc(100vw - 16px))',
      }}
      aria-labelledby="detail-fitur-title"
      data-testid="feature-detail-dialog"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-12 min-w-0">
        <div className="min-w-0">
          <h3 id="detail-fitur-title" className="cg-modal__title break-words">
            Detail Fitur: {target.featureDef.label}
          </h3>
          <p className="text-xs text-text-muted mt-4 break-words">
            Modul {target.moduleDef.label} ({target.area === 'dashboard' ? 'Dashboard' : 'Aplikasi POS'})
          </p>
        </div>
        <button
          type="button"
          className="cg-btn cg-btn--ghost cg-btn--sm shrink-0"
          aria-label="Tutup detail fitur"
          onClick={onClose}
        >
          <X className="cg-icon cg-icon--sm" aria-hidden />
        </button>
      </div>

      {target.readOnly ? (
        <div className="cg-banner cg-banner--info">
          <span>Izin untuk tab Pengaturan POS terkunci aktif secara bawaan.</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-8">
          <button
            type="button"
            className="cg-chip text-xs"
            onClick={() => applyAll('all')}
          >
            Aktifkan semua tersedia
          </button>
          <button
            type="button"
            className="cg-chip text-xs"
            onClick={() => applyAll('lihat')}
          >
            Lihat saja
          </button>
          <button
            type="button"
            className="cg-chip text-xs"
            onClick={() => applyAll('none')}
          >
            Kosongkan semua
          </button>
        </div>
      )}

      <div className="cg-data-wrap min-w-0 rounded-lg border border-border">
        <table className="cg-data w-full" style={{ minWidth: '500px' }}>
          <thead>
            <tr>
              <th>Sub-Fitur</th>
              {PERMISSION_ACTION_KEYS.map((act) => (
                <th key={act} className="text-center whitespace-nowrap">
                  {PERMISSION_ACTION_LABEL[act]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {target.featureDef.subFeatures.map((sub) => {
              const key = subFeatureKey(target.featureDef.id, sub.id);
              const rowSet = localPerms[key];
              return (
                <tr key={sub.id}>
                  <td className="font-medium text-sm text-text">{sub.label}</td>
                  {PERMISSION_ACTION_KEYS.map((act) => {
                    const supported = sub.supportedActions.includes(act);
                    if (!supported) {
                      return (
                        <td key={act} className="text-center text-text-muted">
                          —
                        </td>
                      );
                    }
                    const checked = rowSet?.[act] === true;
                    return (
                      <td key={act} className="text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={target.readOnly}
                          aria-label={`${sub.label} — ${PERMISSION_ACTION_LABEL[act]}`}
                          data-testid={`detail-cb-${sub.id}-${act}`}
                          className="w-[18px] h-[18px] cursor-pointer"
                          onChange={() => toggleAction(sub.id, sub.supportedActions, act)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cg-modal__actions">
        <button type="button" className="cg-btn cg-btn--secondary" onClick={onClose}>
          {target.readOnly ? 'Tutup' : 'Batal'}
        </button>
        {!target.readOnly && (
          <button
            type="button"
            className="cg-btn cg-btn--primary"
            data-testid="detail-save-btn"
            onClick={() => onSave(localPerms)}
          >
            Terapkan Detail
          </button>
        )}
      </div>
    </dialog>
  );
}

function ExitConfirmDialog({
  onContinueEdit,
  onConfirmDiscard,
}: {
  onContinueEdit: () => void;
  onConfirmDiscard: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="cg-modal"
      style={{
        margin: 'auto',
        width: 'min(440px, calc(100vw - 16px))',
        maxWidth: 'min(440px, calc(100vw - 16px))',
      }}
      aria-labelledby="exit-confirm-title"
      data-testid="wizard-exit-confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContinueEdit();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === ref.current) onContinueEdit();
      }}
    >
      <div className="flex items-start gap-12">
        <span className="inline-flex items-center justify-center w-[36px] h-[36px] rounded-pill bg-warning-soft text-warning-strong shrink-0">
          <AlertTriangle className="cg-icon cg-icon--sm" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id="exit-confirm-title" className="cg-modal__title">
            Batalkan Pengaturan Hak Akses?
          </h3>
          <p className="cg-modal__body text-sm mt-8 break-words">
            Membatalkan pengaturan Hak Akses akan menghilangkan perubahan yang telah dibuat dan tidak dapat dibatalkan. Lanjutkan?
          </p>
        </div>
      </div>

      <div className="cg-modal__actions">
        <button
          type="button"
          className="cg-btn cg-btn--secondary"
          data-testid="confirm-exit-batal"
          onClick={onContinueEdit}
        >
          Batal
        </button>
        <button
          type="button"
          className="cg-btn cg-btn--danger"
          data-testid="confirm-exit-lanjutkan"
          onClick={onConfirmDiscard}
        >
          Ya, Lanjutkan
        </button>
      </div>
    </dialog>
  );
}
