import axios from 'axios';
import { api } from '@/lib/api';
import { getRefreshToken, setTokens, setUser } from '@/lib/auth-store';
import { ensureDotLottieLoaded } from '@/scripts/dotlottie-loader';

const SIGNUP_FIELD_MAP: Record<string, string> = {
  organizationName: 'businessName',
  phoneNumber: 'phone',
  firstName: 'name',
  lastName: 'name',
  branchCount: 'branches',
  leadSource: 'heardAbout',
  email: 'email',
  password: 'password',
  confirmPassword: 'confirmPassword',
  businessType: 'businessType',
  businessLocation: 'businessLocation',
};

const SIGNIN_FIELD_MAP: Record<string, string> = {
  email: 'signinEmail',
  password: 'signinPassword',
};

function dashboardUrl(): string {
  const u = (import.meta.env.PUBLIC_DASHBOARD_URL as string | undefined)?.trim();
  return u || 'http://localhost:5174';
}

function hubHandoffCallbackUrl(code: string): string {
  const base = dashboardUrl().replace(/\/$/, '');
  return `${base}/auth/callback?code=${encodeURIComponent(code)}`;
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const t = full.trim();
  const i = t.indexOf(' ');
  if (i === -1) return { firstName: t, lastName: '' };
  return { firstName: t.slice(0, i).trim(), lastName: t.slice(i + 1).trim() };
}

function extractAuthPayload(data: unknown): {
  accessToken?: string;
  refreshToken?: string;
  user?: Record<string, unknown>;
} {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  let accessToken = (d.accessToken ?? d.access_token) as string | undefined;
  let refreshToken = (d.refreshToken ?? d.refresh_token) as string | undefined;
  const user = (d.user ?? d.profile) as Record<string, unknown> | undefined;
  if (!accessToken && d.tokens && typeof d.tokens === 'object') {
    const t = d.tokens as Record<string, unknown>;
    accessToken = t.accessToken as string | undefined;
    refreshToken = t.refreshToken as string | undefined;
  }
  return { accessToken, refreshToken, user };
}

function applyAuthFromResponse(data: unknown): void {
  const { accessToken, refreshToken, user } = extractAuthPayload(data);
  if (accessToken) setTokens(accessToken, refreshToken ?? null);
  if (user) setUser(user);
}

function getResponsePayload(err: unknown): Record<string, unknown> | null {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      return d as Record<string, unknown>;
    }
  }
  return null;
}

function firstStringMessage(payload: Record<string, unknown>): string | null {
  const m = payload.message;
  if (typeof m === 'string' && m.trim()) return m.trim();
  if (Array.isArray(m) && m.length) {
    return m.map((x) => String(x)).join(' ');
  }
  const e = payload.error;
  if (typeof e === 'string' && e.trim()) return e.trim();
  return null;
}

function applyFieldErrorsFromPayload(
  payload: Record<string, unknown>,
  setError: (key: string, msg: string) => void,
  fieldMap: Record<string, string>
): boolean {
  let applied = false;
  const errors = payload.errors;
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    for (const [key, val] of Object.entries(errors as Record<string, unknown>)) {
      const uiKey = fieldMap[key] ?? key;
      const msg = Array.isArray(val) ? val.map(String).join(' ') : String(val);
      if (msg) {
        setError(uiKey, msg);
        applied = true;
      }
    }
  }
  return applied;
}

function handleApiError(
  err: unknown,
  setError: (key: string, msg: string) => void,
  setInline: (s: string) => void,
  fieldMap: Record<string, string>,
  fallback: string
): void {
  const payload = getResponsePayload(err);
  if (!payload) {
    setInline(fallback);
    return;
  }
  if (applyFieldErrorsFromPayload(payload, setError, fieldMap)) {
    const extra = firstStringMessage(payload);
    if (extra) setInline(extra);
    return;
  }
  const msg = firstStringMessage(payload);
  setInline(msg || fallback);
}

function setSubmitLoading(
  form: HTMLFormElement,
  loading: boolean,
  idleLabel: string,
  loadingLabel: string
): void {
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!btn) return;
  btn.disabled = loading;
  btn.setAttribute('aria-busy', loading ? 'true' : 'false');
  if (loading) {
    if (!btn.dataset.tpIdleLabel) btn.dataset.tpIdleLabel = btn.textContent?.trim() || idleLabel;
    btn.textContent = loadingLabel;
  } else {
    btn.textContent = btn.dataset.tpIdleLabel || idleLabel;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showSuccessThenRedirect(
  step1: HTMLElement,
  step2: HTMLElement,
  signin: HTMLElement,
  provisioning: HTMLElement,
  successBox: HTMLElement,
  messageEl: HTMLElement,
  message: string,
  redirectMs: number,
  redirectUrl?: string
): void {
  step1.classList.add('hidden');
  step2.classList.add('hidden');
  signin.classList.add('hidden');
  provisioning.classList.add('hidden');
  provisioning.classList.remove('is-visible');
  provisioning.setAttribute('aria-busy', 'false');
  messageEl.textContent = message;
  successBox.classList.remove('hidden');
  window.setTimeout(() => {
    window.location.assign(redirectUrl ?? dashboardUrl());
  }, redirectMs);
}

export function initAuthModal(): void {
  const overlay = document.getElementById('tp-modal-overlay');
  const step1 = document.getElementById('tp-signup-step1') as HTMLFormElement | null;
  const step2 = document.getElementById('tp-signup-step2') as HTMLFormElement | null;
  const signin = document.getElementById('tp-signin-form') as HTMLFormElement | null;
  const successBox = document.getElementById('tp-modal-success');
  const provisioning = document.getElementById('tp-signup-provisioning');
  const provisioningMessage = document.getElementById('tp-provisioning-message');
  const provisioningLottie = document.getElementById('tp-provisioning-lottie');
  const provisioningFallback = document.getElementById('tp-provisioning-fallback');
  const modalToolbar = document.getElementById('tp-modal-toolbar');
  const modalPanel = document.getElementById('tp-modal');
  const title = document.getElementById('tp-modal-title');
  const subtitle = document.getElementById('tp-modal-subtitle');
  const inlineStatus = document.getElementById('tp-inline-status');
  const successMessage = document.getElementById('tp-success-message');

  if (
    !overlay ||
    !step1 ||
    !step2 ||
    !signin ||
    !successBox ||
    !provisioning ||
    !provisioningMessage ||
    !title ||
    !inlineStatus ||
    !successMessage
  ) {
    return;
  }

  const ui = {
    overlay,
    step1,
    step2,
    signin,
    successBox,
    provisioning,
    provisioningMessage,
    provisioningLottie,
    provisioningFallback,
    modalToolbar,
    modalPanel,
    title,
    subtitle,
    inlineStatus,
    successMessage,
  };

  let modalLocked = false;
  let savedTitle = '';
  let savedSubtitle = '';

  function setModalLocked(locked: boolean): void {
    modalLocked = locked;
    ui.overlay.dataset.tpLocked = locked ? 'true' : 'false';
    if (ui.modalPanel) {
      ui.modalPanel.setAttribute('aria-busy', locked ? 'true' : 'false');
    }
    ui.overlay.querySelectorAll<HTMLButtonElement>(
      '[data-tp-close], [data-tp-back-to-step1], [data-tp-close-step1], [data-tp-close-signin], [data-tp-mode]'
    ).forEach((btn) => {
      btn.disabled = locked;
      btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
    });
  }

  async function showProvisioning(businessName: string): Promise<void> {
    savedTitle = ui.title.textContent || '';
    savedSubtitle = ui.subtitle?.textContent || '';

    ui.title.textContent = 'Creating your organization';
    if (ui.subtitle) {
      ui.subtitle.textContent = 'Hang tight while we set everything up for you.';
      ui.subtitle.classList.remove('hidden');
    }

    ui.step1.classList.add('hidden');
    ui.step2.classList.add('hidden');
    ui.signin.classList.add('hidden');
    ui.successBox.classList.add('hidden');
    ui.modalToolbar?.classList.add('hidden');
    ui.inlineStatus.textContent = '';

    ui.provisioningMessage.innerHTML = `Setting up <strong>${escapeHtml(businessName)}</strong>. This usually takes a few seconds.`;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      ui.provisioningLottie?.classList.add('hidden');
      ui.provisioningFallback?.classList.remove('hidden');
    } else {
      await ensureDotLottieLoaded();
      ui.provisioningLottie?.classList.remove('hidden');
      ui.provisioningFallback?.classList.add('hidden');
    }

    ui.provisioning.classList.remove('hidden');
    ui.provisioning.setAttribute('aria-busy', 'true');
    ui.provisioning.classList.remove('is-visible');
    requestAnimationFrame(() => {
      ui.provisioning.classList.add('is-visible');
    });

    setModalLocked(true);
  }

  function hideProvisioning(restoreStep2 = true): void {
    ui.provisioning.classList.add('hidden');
    ui.provisioning.classList.remove('is-visible');
    ui.provisioning.setAttribute('aria-busy', 'false');
    ui.modalToolbar?.classList.remove('hidden');
    setModalLocked(false);

    if (restoreStep2) {
      ui.title.textContent = savedTitle || 'Start for free';
      if (ui.subtitle) {
        ui.subtitle.textContent =
          savedSubtitle ||
          'Two steps. Takes less than a minute. Then your organization will be created.';
        ui.subtitle.classList.remove('hidden');
      }
      ui.step2.classList.remove('hidden');
    }
  }

  function resetProvisioningState(): void {
    ui.provisioning.classList.add('hidden');
    ui.provisioning.classList.remove('is-visible');
    ui.provisioning.setAttribute('aria-busy', 'false');
    ui.modalToolbar?.classList.remove('hidden');
    setModalLocked(false);
    savedTitle = '';
    savedSubtitle = '';
  }

  let signupState: {
    name: string;
    email: string;
    password: string;
    phone: string;
  } = { name: '', email: '', password: '', phone: '' };

  function setMode(mode: 'signup' | 'signin'): void {
    resetProvisioningState();
    ui.successBox.classList.add('hidden');
    if (mode === 'signup') {
      ui.title.textContent = 'Start for free';
      if (ui.subtitle) {
        ui.subtitle.textContent =
          'Two steps. Takes less than a minute. Then your organization will be created.';
        ui.subtitle.classList.remove('hidden');
      }
      ui.step1.classList.remove('hidden');
      ui.step2.classList.add('hidden');
      ui.signin.classList.add('hidden');
      signupState = { name: '', email: '', password: '', phone: '' };
      ui.inlineStatus.textContent = '';
      syncModeButtons(mode);
    } else {
      ui.title.textContent = 'Sign in';
      if (ui.subtitle) {
        ui.subtitle.textContent = '';
        ui.subtitle.classList.add('hidden');
      }
      ui.step1.classList.add('hidden');
      ui.step2.classList.add('hidden');
      ui.signin.classList.remove('hidden');
      ui.inlineStatus.textContent = '';
      syncModeButtons(mode);
    }
    clearAllErrors();
  }

  function syncModeButtons(mode: 'signup' | 'signin'): void {
    const modeButtons = ui.overlay.querySelectorAll('[data-tp-mode]');
    modeButtons.forEach((b) => {
      const el = b as HTMLButtonElement;
      const pressed = el.getAttribute('data-tp-mode') === mode;
      el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      el.className = pressed
        ? 'rounded-full bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 ring-1 ring-brand-100/80'
        : 'rounded-full border border-surface-200/80 bg-white/70 px-4 py-2 text-sm font-medium transition-all text-surface-900';
    });
  }

  function open(mode: 'signup' | 'signin'): void {
    ui.overlay.classList.remove('hidden');
    ui.overlay.setAttribute('aria-hidden', 'false');
    ui.overlay.scrollTop = 0;
    const panel = document.getElementById('tp-modal');
    if (panel) panel.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    setMode(mode);
    const firstInput = ui.overlay.querySelector('input,select,button');
    if (firstInput instanceof HTMLElement) firstInput.focus();
  }

  function close(): void {
    if (modalLocked) return;
    ui.overlay.classList.add('hidden');
    ui.overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    ui.inlineStatus.textContent = '';
    ui.successBox.classList.add('hidden');
    resetProvisioningState();
    clearAllErrors();
  }

  function clearAllErrors(): void {
    ui.overlay.querySelectorAll('[data-err-for]').forEach((el) => {
      (el as HTMLElement).textContent = '';
    });
  }

  function setError(key: string, message: string): void {
    const el = ui.overlay.querySelector(`[data-err-for="${key}"]`);
    if (el) (el as HTMLElement).textContent = message;
  }

  function isValidEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
  }

  function isValidPhone(v: string): boolean {
    const raw = String(v || '').trim();
    if (raw.length < 7) return false;
    if (!/^[0-9+()\s-]+$/.test(raw)) return false;
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }

  ui.overlay.addEventListener('click', (e) => {
    if (modalLocked) return;
    const t = e.target as HTMLElement;
    if (t.closest?.('[data-tp-close]')) close();
    if (e.target === ui.overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ui.overlay.classList.contains('hidden') && !modalLocked) close();
  });

  document.addEventListener('click', (e) => {
    const opener = (e.target as HTMLElement).closest?.('[data-tp-open]');
    if (!opener) return;
    const mode = (opener.getAttribute('data-tp-open') || 'signup') as 'signup' | 'signin';
    e.preventDefault();
    open(mode);
  });

  ui.overlay.querySelector('[data-tp-close-step1]')?.addEventListener('click', close);
  ui.overlay.querySelector('[data-tp-close-signin]')?.addEventListener('click', close);
  ui.overlay.querySelector('[data-tp-close-success]')?.addEventListener('click', close);

  ui.overlay.querySelector('[data-tp-back-to-step1]')?.addEventListener('click', () => {
    clearAllErrors();
    ui.step1.classList.remove('hidden');
    ui.step2.classList.add('hidden');
  });

  ui.step1.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAllErrors();
    ui.inlineStatus.textContent = '';

    const form = e.target as HTMLFormElement;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;
    const phone = (form.elements.namedItem('phone') as HTMLInputElement).value.trim();

    let ok = true;
    if (!name || name.length < 2) {
      setError('name', 'Please enter your full name.');
      ok = false;
    }
    if (!isValidEmail(email)) {
      setError('email', 'Please enter a valid email.');
      ok = false;
    }
    if (!password || password.length < 8) {
      setError('password', 'Password must be at least 8 characters.');
      ok = false;
    }
    if (confirmPassword !== password) {
      setError('confirmPassword', 'Passwords do not match.');
      ok = false;
    }
    if (!isValidPhone(phone)) {
      setError('phone', 'Please enter a valid phone number.');
      ok = false;
    }
    if (!ok) return;

    signupState = { name, email, password, phone };
    ui.step1.classList.add('hidden');
    ui.step2.classList.remove('hidden');
    const first = ui.step2.querySelector('input,select');
    if (first instanceof HTMLElement) first.focus();
  });

  ui.step2.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();
    ui.inlineStatus.textContent = '';

    const form = e.target as HTMLFormElement;
    const businessName = (form.elements.namedItem('businessName') as HTMLInputElement).value.trim();
    const businessType = (form.elements.namedItem('businessType') as HTMLSelectElement).value;
    const businessLocation = (
      form.elements.namedItem('businessLocation') as HTMLInputElement
    ).value.trim();
    const branches = (form.elements.namedItem('branches') as HTMLInputElement).value;
    const heardAbout = (form.elements.namedItem('heardAbout') as HTMLSelectElement).value;

    let ok = true;
    if (!businessName) {
      setError('businessName', 'Business name is required.');
      ok = false;
    }
    if (!businessType) {
      setError('businessType', 'Please choose a business type.');
      ok = false;
    }
    if (!businessLocation) {
      setError('businessLocation', 'Business location is required.');
      ok = false;
    }
    const branchesNum = Number(branches);
    if (!Number.isFinite(branchesNum) || branchesNum < 1 || branchesNum > 999) {
      setError('branches', 'Branches must be between 1 and 999.');
      ok = false;
    }
    if (!heardAbout) {
      setError('heardAbout', 'Please select how you heard about us.');
      ok = false;
    }
    if (!ok) return;

    const { firstName, lastName } = splitFullName(signupState.name);
    const body = {
      email: signupState.email,
      password: signupState.password,
      organizationName: businessName,
      firstName,
      lastName,
      phoneNumber: signupState.phone,
      businessType,
      businessLocation,
      leadSource: heardAbout,
      branchCount: branchesNum,
    };

    try {
      await showProvisioning(businessName);
      const { data } = await api.post('/auth/signup', body);
      applyAuthFromResponse(data);
      const refreshToken =
        extractAuthPayload(data).refreshToken ?? getRefreshToken() ?? undefined;
      if (!refreshToken) {
        hideProvisioning();
        ui.inlineStatus.textContent =
          'Account created, but we could not start your dashboard session. Please sign in.';
        return;
      }
      try {
        const { data: handoff } = await api.post<{ code?: string }>('/auth/handoff', {
          refreshToken,
        });
        const code =
          handoff && typeof handoff === 'object' && typeof handoff.code === 'string'
            ? handoff.code.trim()
            : '';
        if (!code) {
          hideProvisioning();
          ui.inlineStatus.textContent =
            'Could not connect to your dashboard. Please try signing in.';
          return;
        }
        ui.inlineStatus.textContent = '';
        setModalLocked(false);
        ui.title.textContent = 'Welcome to NutaSolutions';
        if (ui.subtitle) {
          ui.subtitle.textContent = '';
          ui.subtitle.classList.add('hidden');
        }
        showSuccessThenRedirect(
          ui.step1,
          ui.step2,
          ui.signin,
          ui.provisioning,
          ui.successBox,
          ui.successMessage,
          'Your account is ready. Taking you to the dashboard…',
          1800,
          hubHandoffCallbackUrl(code)
        );
      } catch (handoffErr) {
        hideProvisioning();
        handleApiError(
          handoffErr,
          () => {},
          (s) => {
            ui.inlineStatus.textContent = s;
          },
          {},
          'Could not open your dashboard. Please try signing in.'
        );
      }
    } catch (err) {
      hideProvisioning();
      handleApiError(
        err,
        setError,
        (s) => {
          ui.inlineStatus.textContent = s;
        },
        SIGNUP_FIELD_MAP,
        'Signup failed. Please try again.'
      );
    }
  });

  ui.signin.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();
    ui.inlineStatus.textContent = '';

    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;

    let ok = true;
    if (!isValidEmail(email)) {
      setError('signinEmail', 'Please enter a valid email.');
      ok = false;
    }
    if (!password) {
      setError('signinPassword', 'Please enter your password.');
      ok = false;
    }
    if (!ok) return;

    setSubmitLoading(form, true, 'Sign in', 'Signing in…');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      applyAuthFromResponse(data);
      ui.inlineStatus.textContent = '';
      showSuccessThenRedirect(
        ui.step1,
        ui.step2,
        ui.signin,
        ui.provisioning,
        ui.successBox,
        ui.successMessage,
        'Welcome back. Redirecting to your dashboard…',
        1400
      );
    } catch (err) {
      handleApiError(
        err,
        setError,
        (s) => {
          ui.inlineStatus.textContent = s;
        },
        SIGNIN_FIELD_MAP,
        'Sign in failed. Please check your details.'
      );
    } finally {
      setSubmitLoading(form, false, 'Sign in', 'Signing in…');
    }
  });

  ui.overlay.querySelectorAll('[data-tp-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn.getAttribute('data-tp-mode') || 'signup') as 'signup' | 'signin';
      setMode(mode);
    });
  });
}
