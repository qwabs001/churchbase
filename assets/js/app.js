import { auth, db } from './firebase-config.js';
import {
  onAuthStateChanged,
  signOut,
  deleteUser
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const DEFAULT_THEME = {
  primary: '#00393a',
  accent: '#c4ef17'
};

const CURRENCY_SEQUENCE = ['GHS', 'USD', 'EUR', 'GBP'];
const MAX_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB

const state = {
  user: null,
  church: null,
  members: [],
  attendance: [],
  finance: [],
  groups: [],
  approvals: [],
  notifications: [],
  charts: {
    attendance: null,
    finance: null
  },
  currency: {
    code: 'GHS',
    symbol: '₵',
    rates: { GHS: 1, USD: 0.082, GBP: 0.064, EUR: 0.076 }
  },
  theme: { ...DEFAULT_THEME }
};

const elements = {
  sidebarUserName: document.getElementById('sidebarUserName'),
  accountName: document.getElementById('accountName'),
  accountEmail: document.getElementById('accountEmail'),
  accountInitials: document.getElementById('accountInitials'),
  currencyChip: document.getElementById('currencyChip'),
  currencyToggle: document.getElementById('currencyToggle'),
  currencyToggleLabel: document.getElementById('currencyToggleLabel'),
  notificationCount: document.getElementById('notificationCount'),
  notificationsList: document.getElementById('notificationsList'),
  automationFeed: document.getElementById('automationFeed'),
  memberFilter: document.getElementById('memberFilter'),
  membersTableBody: document.querySelector('#membersTable tbody'),
  attendanceTableBody: document.querySelector('#attendanceTable tbody'),
  financeTableBody: document.querySelector('#financeTable tbody'),
  groupsTableBody: document.querySelector('#groupsTable tbody'),
  memberPhotoFile: document.getElementById('memberPhotoFile'),
  memberPhotoPreview: document.getElementById('memberPhotoPreview'),
  memberPhotoUrl: document.getElementById('memberPhoto'),
  attendanceSummary: document.getElementById('attendanceSummary'),
  financeSummary: document.getElementById('financeSummary'),
  statMembers: document.getElementById('statMembers'),
  statAttendance: document.getElementById('statAttendance'),
  statFinance: document.getElementById('statFinance'),
  statApprovals: document.getElementById('statApprovals'),
  financeWeekTotal: document.getElementById('financeWeekTotal'),
  financeMonthTotal: document.getElementById('financeMonthTotal'),
  financeYellowCard: document.getElementById('financeYellowCard'),
  settingsCurrency: document.getElementById('settingsCurrency'),
  settingsTheme: document.getElementById('settingsTheme'),
  primaryColorPicker: document.getElementById('primaryColorPicker'),
  primaryColorPreview: document.getElementById('primaryColorPreview'),
  accentColorPreview: document.getElementById('accentColorPreview'),
  resetThemeBtn: document.getElementById('resetThemeBtn'),
  managerEmail: document.getElementById('managerEmail'),
  subManagerEmail: document.getElementById('subManagerEmail')
};

const convertAmount = (amount = 0) => {
  const rate = state.currency.rates?.[state.currency.code] ?? 1;
  return amount * rate;
};

const formatCurrency = (amount = 0) => {
  const converted = convertAmount(amount);
  return `${state.currency.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getNextCurrency = (current) => {
  const index = CURRENCY_SEQUENCE.indexOf(current);
  return CURRENCY_SEQUENCE[(index + 1) % CURRENCY_SEQUENCE.length];
};

const updateCurrencyToggleLabel = () => {
  if (!elements.currencyToggleLabel) return;
  const next = getNextCurrency(state.currency.code);
  elements.currencyToggleLabel.textContent = `Next: ${next}`;
};

const updateCurrencyChip = () => {
  if (elements.currencyChip) {
    elements.currencyChip.textContent = `Currency: ${state.currency.symbol} (${state.currency.code})`;
  }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const themeStorageKey = () => (state.user ? `gracetrack:dashboard:theme:${state.user.uid}` : 'gracetrack:dashboard:theme');

const loadThemeFromStorage = () => {
  try {
    const stored = localStorage.getItem(themeStorageKey());
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('GraceTrack: unable to read theme from storage', error);
    return null;
  }
};

const storeThemeToStorage = (theme) => {
  try {
    localStorage.setItem(themeStorageKey(), JSON.stringify(theme));
  } catch (error) {
    console.warn('GraceTrack: unable to persist theme', error);
  }
};

const hexToRgb = (hex = '') => {
  const normalized = hex.replace('#', '').trim();
  if (![3, 6].includes(normalized.length)) return [0, 57, 58];
  const expanded = normalized.length === 3 ? normalized.split('').map((ch) => ch + ch).join('') : normalized;
  const int = Number.parseInt(expanded, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
};

const hexToHsl = (hex = '') => {
  const [r, g, b] = hexToRgb(hex).map((value) => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s, l };
};

const hslToHex = (h, s, l) => {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  const hue = (((h % 360) + 360) % 360) / 360;

  let r;
  let g;
  let b;

  if (sat === 0) {
    r = g = b = light;
  } else {
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    r = hue2rgb(p, q, hue + 1 / 3);
    g = hue2rgb(p, q, hue);
    b = hue2rgb(p, q, hue - 1 / 3);
  }

  const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const shadeColor = (hex, percent = 0) => {
  const [r, g, b] = hexToRgb(hex);
  const amount = clamp(percent, -100, 100) / 100;
  const target = amount < 0 ? 0 : 255;
  const absAmount = Math.abs(amount);
  const compute = (channel) => Math.round((target - channel) * absAmount + channel);
  return `#${compute(r).toString(16).padStart(2, '0')}${compute(g).toString(16).padStart(2, '0')}${compute(b).toString(16).padStart(2, '0')}`;
};

const withAlpha = (hex, alpha = 1) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};

const generateAccentColor = (primary) => {
  if (!primary) return DEFAULT_THEME.accent;
  if (primary.toLowerCase() === DEFAULT_THEME.primary.toLowerCase()) {
    return DEFAULT_THEME.accent;
  }
  const { h, s } = hexToHsl(primary);
  const accentHue = (h + 252) % 360;
  const accentSaturation = clamp(s * 0.75 + 0.25, 0, 1);
  const accentLightness = 0.62;
  return hslToHex(accentHue, accentSaturation, accentLightness);
};

const isColorDark = (hex = '') => {
  const [r, g, b] = hexToRgb(hex);
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  return brightness < 150;
};

const updateThemeControls = (theme = state.theme) => {
  if (!elements.primaryColorPicker) return;
  const resolved = {
    ...DEFAULT_THEME,
    ...theme
  };
  elements.primaryColorPicker.value = resolved.primary;
  if (elements.primaryColorPreview) {
    elements.primaryColorPreview.textContent = resolved.primary.toUpperCase();
    elements.primaryColorPreview.style.backgroundColor = resolved.primary;
    elements.primaryColorPreview.style.color = isColorDark(resolved.primary) ? '#ffffff' : '#001f21';
  }
  if (elements.accentColorPreview) {
    elements.accentColorPreview.style.backgroundColor = resolved.accent;
    elements.accentColorPreview.title = `Accent ${resolved.accent.toUpperCase()}`;
  }
};

const refreshChartPalettes = () => {
  const { primary, accent } = state.theme;
  if (state.charts.attendance) {
    const presentDataset = state.charts.attendance.data.datasets[0];
    const expectedDataset = state.charts.attendance.data.datasets[1];
    presentDataset.borderColor = primary;
    presentDataset.backgroundColor = withAlpha(primary, 0.25);
    expectedDataset.borderColor = accent;
    expectedDataset.backgroundColor = withAlpha(accent, 0.25);
    state.charts.attendance.update('none');
  }
  if (state.charts.finance) {
    const palette = [
      primary,
      shadeColor(primary, -12),
      accent,
      shadeColor(accent, -18),
      '#2a9895',
      '#8f8f8f'
    ];
    state.charts.finance.data.datasets[0].backgroundColor = palette;
    state.charts.finance.update('none');
  }
};

const applyColorTheme = (theme = DEFAULT_THEME) => {
  const resolvedPrimary = theme.primary || DEFAULT_THEME.primary;
  const resolvedAccent = theme.accent || generateAccentColor(resolvedPrimary);
  const resolved = { primary: resolvedPrimary, accent: resolvedAccent };
  state.theme = resolved;
  const root = document.documentElement;
  const primaryShade = shadeColor(resolved.primary, -18);
  const accentShade = shadeColor(resolved.accent, -20);
  const [pr, pg, pb] = hexToRgb(resolved.primary);
  const [ar, ag, ab] = hexToRgb(resolved.accent);
  root.style.setProperty('--primary-navy', resolved.primary);
  root.style.setProperty('--primary-navy-900', primaryShade);
  root.style.setProperty('--primary-navy-rgb', `${pr}, ${pg}, ${pb}`);
  root.style.setProperty('--gold', resolved.accent);
  root.style.setProperty('--gold-dark', accentShade);
  root.style.setProperty('--gold-rgb', `${ar}, ${ag}, ${ab}`);
  refreshChartPalettes();
  if (state.church) {
    state.church.preferences = {
      ...(state.church.preferences || {}),
      primaryColor: resolved.primary,
      accentColor: resolved.accent
    };
  }
};

const hydrateTheme = (preferences = {}) => {
  const stored = loadThemeFromStorage();
  const preferredPrimary = stored?.primary || preferences.primaryColor || DEFAULT_THEME.primary;
  const preferredAccent = stored?.accent || preferences.accentColor;
  const resolvedAccent = preferredAccent || generateAccentColor(preferredPrimary);
  const resolved = { primary: preferredPrimary, accent: resolvedAccent };
  applyColorTheme(resolved);
  updateThemeControls(resolved);
  if (!stored) {
    storeThemeToStorage(resolved);
  }
};

const getAvatarFallback = (name = 'Member') => `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name || 'Member')}`;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });

const setMemberPhotoPreviewSrc = (src, name = 'Member') => {
  if (!elements.memberPhotoPreview) return;
  elements.memberPhotoPreview.src = src || getAvatarFallback(name);
  elements.memberPhotoPreview.alt = name ? `${name} profile photo` : 'Profile photo preview';
};

const clearMemberPhotoUpload = (name = '') => {
  if (elements.memberPhotoFile) {
    elements.memberPhotoFile.value = '';
  }
  if (elements.memberPhotoPreview) {
    delete elements.memberPhotoPreview.dataset.upload;
    const urlSource = elements.memberPhotoUrl?.value?.trim()
      ? elements.memberPhotoUrl.value.trim()
      : null;
    setMemberPhotoPreviewSrc(urlSource, name || elements.memberPhotoUrl?.value?.trim() || 'Member');
  }
};

const resetMemberPhotoFields = () => {
  if (elements.memberPhotoUrl) {
    elements.memberPhotoUrl.value = '';
  }
  clearMemberPhotoUpload('Member');
};

const handleMemberPhotoFileChange = async (event) => {
  const file = event.target.files?.[0];
  const memberName = document.getElementById('memberName')?.value.trim() || 'Member';

  if (!file) {
    if (elements.memberPhotoPreview?.dataset) {
      delete elements.memberPhotoPreview.dataset.upload;
    }
    setMemberPhotoPreviewSrc(elements.memberPhotoUrl?.value.trim() || null, memberName);
    return;
  }

  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file.', 'danger');
    event.target.value = '';
    clearMemberPhotoUpload(memberName);
    return;
  }

  if (file.size > MAX_PHOTO_SIZE) {
    showToast('Image must be smaller than 2MB.', 'danger');
    event.target.value = '';
    clearMemberPhotoUpload(memberName);
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    if (elements.memberPhotoPreview) {
      elements.memberPhotoPreview.dataset.upload = dataUrl;
      setMemberPhotoPreviewSrc(dataUrl, memberName);
    }
  } catch (error) {
    console.error('GraceTrack: unable to read photo file', error);
    showToast('Could not read the selected photo. Please try again.', 'danger');
    event.target.value = '';
    clearMemberPhotoUpload(memberName);
  }
};

const handleMemberPhotoUrlInput = (event) => {
  const url = event.target.value.trim();
  const memberName = document.getElementById('memberName')?.value.trim() || 'Member';
  if (elements.memberPhotoPreview?.dataset?.upload) {
    return;
  }
  if (url) {
    setMemberPhotoPreviewSrc(url, memberName);
  } else {
    setMemberPhotoPreviewSrc(null, memberName);
  }
};

const updateThemePalette = async (primary, { persist = false } = {}) => {
  if (!primary) return state.theme;
  const accent = generateAccentColor(primary);
  const theme = { primary, accent };
  applyColorTheme(theme);
  updateThemeControls(theme);
  storeThemeToStorage(theme);
  if (persist) {
    await savePreferences({ primaryColor: theme.primary, accentColor: theme.accent });
  }
  return theme;
};

const previewPrimaryColor = (event) => {
  const color = event?.target?.value;
  updateThemePalette(color, { persist: false });
};

const persistPrimaryColor = async (event) => {
  const color = event?.target?.value;
  await updateThemePalette(color, { persist: true });
  showToast('Theme palette updated.');
};

const resetThemePalette = async () => {
  await updateThemePalette(DEFAULT_THEME.primary, { persist: true });
  showToast('Theme colors reset.', 'info');
};

const cycleCurrency = async () => {
  const nextCurrency = getNextCurrency(state.currency.code);
  state.currency.code = nextCurrency;
  state.currency.symbol = resolveCurrencySymbol(nextCurrency);
  if (state.church) {
    state.church.preferences = {
      ...(state.church.preferences || {}),
      currency: nextCurrency
    };
  }
  updateCurrencyChip();
  if (elements.settingsCurrency) {
    elements.settingsCurrency.value = nextCurrency;
  }
  updateCurrencyToggleLabel();
  updateStats();
  renderFinance();
  renderFinanceSummary();
  updateFinanceChart();
  refreshAutomationFeed();
  await savePreferences({ currency: nextCurrency });
  showToast(`Currency set to ${nextCurrency}.`);
};

const setDashboardTheme = (theme) => {
  document.body.classList.toggle('dark-mode', theme === 'dark');
  const toggleLabel = document.querySelector('#modeToggle span');
  if (toggleLabel) {
    toggleLabel.textContent = theme === 'dark' ? 'Dark' : 'Light';
  }
};

const initialiseNavigation = () => {
  const navLinks = document.querySelectorAll('#dashboardNav .nav-link');
  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const target = link.getAttribute('data-section');
      navLinks.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.dashboard-section').forEach((section) => {
        section.classList.toggle('d-none', section.getAttribute('data-section') !== target);
      });
    });
  });
};

const subscribeToCollections = async () => {
  const churchRef = doc(db, 'churches', state.user.uid);

  onSnapshot(churchRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    state.church = { id: snapshot.id, ...data };
    state.currency.code = data?.preferences?.currency ?? 'GHS';
    state.currency.rates = data?.preferences?.conversions ?? state.currency.rates;
    state.currency.symbol = resolveCurrencySymbol(state.currency.code);
    hydrateTheme(data?.preferences || {});
    refreshProfileUI();
    setDashboardTheme(data?.preferences?.theme ?? 'light');
  });

  attachCollectionListener(churchRef, 'members', 'fullName', (items) => {
    state.members = items;
    renderMembers();
    updateStats();
    rebuildMemberFilter();
  });

  attachCollectionListener(churchRef, 'attendance', 'eventDate', (items) => {
    state.attendance = items;
    renderAttendance();
    updateStats();
    updateAttendanceChart();
    renderAttendanceSummary();
    refreshAutomationFeed();
  }, 'desc');

  attachCollectionListener(churchRef, 'finance', 'date', (items) => {
    state.finance = items;
    renderFinance();
    updateStats();
    updateFinanceChart();
    renderFinanceSummary();
    refreshAutomationFeed();
  }, 'desc');

  attachCollectionListener(churchRef, 'groups', 'name', (items) => {
    state.groups = items;
    renderGroups();
  });

  attachCollectionListener(churchRef, 'editRequests', 'createdAt', (items) => {
    state.approvals = items;
    updateStats();
    renderNotifications();
  }, 'desc');

  attachCollectionListener(churchRef, 'notifications', 'createdAt', (items) => {
    state.notifications = items;
    renderNotifications();
  }, 'desc');
};

const attachCollectionListener = (churchRef, key, orderField, callback, direction = 'asc') => {
  const ref = collection(churchRef, key);
  const q = orderField ? query(ref, orderBy(orderField, direction)) : ref;
  onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    callback(data);
  });
};

const resolveCurrencySymbol = (code) => {
  switch (code) {
    case 'USD':
      return '$';
    case 'GBP':
      return '£';
    case 'EUR':
      return '€';
    default:
      return '₵';
  }
};

const refreshProfileUI = () => {
  if (!state.user) return;
  const displayName = state.user.displayName || state.church?.fullName || 'GraceTrack User';
  const email = state.user.email;
  elements.sidebarUserName.textContent = displayName;
  elements.accountName.textContent = displayName;
  elements.accountEmail.textContent = email;
  elements.accountInitials.textContent = deriveInitials(displayName);
  updateCurrencyChip();
  updateCurrencyToggleLabel();
  if (elements.settingsCurrency) {
    elements.settingsCurrency.value = state.currency.code;
  }
  if (elements.settingsTheme && state.church?.preferences?.theme) {
    elements.settingsTheme.value = state.church.preferences.theme;
  }
  updateThemeControls(state.theme);
  if (elements.managerEmail && state.church?.roles) {
    elements.managerEmail.value = state.church.roles.managerEmail || '';
    elements.subManagerEmail.value = state.church.roles.subManagerEmail || '';
  }
};

const deriveInitials = (name) => {
  if (!name) return 'GT';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
};

const renderMembers = () => {
  if (!elements.membersTableBody) return;
  const search = document.getElementById('memberSearch')?.value.toLowerCase() ?? '';
  const filter = elements.memberFilter?.value.toLowerCase() ?? '';
  const filtered = state.members.filter((member) => {
    const matchesSearch = !search || member.fullName?.toLowerCase().includes(search) || member.ministry?.toLowerCase().includes(search);
    const matchesFilter = !filter || member.ministry?.toLowerCase() === filter;
    return matchesSearch && matchesFilter;
  });

  elements.membersTableBody.innerHTML = filtered
    .map((member) => {
      const statusClass = mapLockStatusClass(member.lockStatus);
      return `
        <tr data-id="${member.id}">
          <td>
            <div class="d-flex align-items-center gap-3">
                <img src="${member.photoUrl || getAvatarFallback(member.fullName)}" alt="avatar" class="rounded-circle" width="44" height="44"/>
              <div>
                <span class="fw-semibold d-block">${member.fullName || 'Unnamed member'}</span>
                <small class="text-muted">${member.gender || ''} ${member.age ? `· ${member.age}` : ''}</small>
              </div>
            </div>
          </td>
          <td>${member.ministry || '-'}</td>
          <td>${member.role || '-'}</td>
          <td>
            <div class="d-flex flex-column">
              <span>${member.phone || '-'}</span>
              <small class="text-muted">${member.address || ''}</small>
            </div>
          </td>
          <td><span class="status-chip ${statusClass}">${formatLockStatus(member.lockStatus)}</span></td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-secondary" data-action="view">View</button>
              <button class="btn btn-sm btn-outline-primary" data-action="edit">Request Edit</button>
              <button class="btn btn-sm btn-outline-danger" data-action="delete">Request Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
};

const renderAttendance = () => {
  if (!elements.attendanceTableBody) return;
  elements.attendanceTableBody.innerHTML = state.attendance
    .map((record) => {
      const statusClass = mapLockStatusClass(record.lockStatus);
      const percent = computeAttendanceRate(record);
      return `
        <tr data-id="${record.id}">
          <td>${record.eventName || 'Event'}</td>
          <td>${formatDate(record.eventDate)}</td>
          <td>${record.present || 0}</td>
          <td>${percent}%</td>
          <td><span class="status-chip ${statusClass}">${formatLockStatus(record.lockStatus)}</span></td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" data-action="edit">Request Edit</button>
              <button class="btn btn-sm btn-outline-danger" data-action="delete">Request Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
};

const renderFinance = () => {
  if (!elements.financeTableBody) return;
  elements.financeTableBody.innerHTML = state.finance
    .map((item) => {
      const statusClass = mapLockStatusClass(item.lockStatus);
      return `
        <tr data-id="${item.id}">
          <td>${formatDate(item.date)}</td>
          <td>${item.category || '-'}</td>
          <td>${item.notes || '-'}</td>
          <td>${formatCurrency(item.amountGHS || 0)}</td>
          <td><span class="status-chip ${statusClass}">${formatLockStatus(item.lockStatus)}</span></td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" data-action="edit">Request Edit</button>
              <button class="btn btn-sm btn-outline-danger" data-action="delete">Request Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
};

const renderGroups = () => {
  if (!elements.groupsTableBody) return;
  elements.groupsTableBody.innerHTML = state.groups
    .map((group) => {
      const statusClass = mapLockStatusClass(group.lockStatus);
      return `
        <tr data-id="${group.id}">
          <td>${group.name || '-'}</td>
          <td>${group.leader || '-'}</td>
          <td>${group.members || 0}</td>
          <td>${formatDate(group.nextEventDate)}</td>
          <td><span class="status-chip ${statusClass}">${formatLockStatus(group.lockStatus)}</span></td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" data-action="edit">Request Edit</button>
              <button class="btn btn-sm btn-outline-danger" data-action="delete">Request Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
};

const renderNotifications = () => {
  if (!elements.notificationsList) return;
  const pendingApprovals = state.approvals.filter((req) => req.status === 'pending');
  elements.notificationCount.textContent = pendingApprovals.length + state.notifications.length;

  const approvalsHTML = pendingApprovals
    .map((req) => (
      `<a href="#" class="list-group-item list-group-item-action" data-request-id="${req.id}">
        <div class="d-flex w-100 justify-content-between">
          <h6 class="mb-1">${capitalize(req.action)} request · ${req.entity}</h6>
          <small>${timeAgo(req.createdAt?.toDate())}</small>
        </div>
        <p class="mb-1">${req.requestedByName || req.requestedBy} requested ${req.action} on ${req.entityName || req.recordId}.</p>
        <small class="text-muted">Approvals: ${req.approvals?.length || 0}/2</small>
      </a>`
    ))
    .join('');

  const notificationsHTML = state.notifications
    .map((note) => (
      `<div class="list-group-item">
        <div class="d-flex w-100 justify-content-between">
          <h6 class="mb-1">${note.title || 'Notification'}</h6>
          <small>${timeAgo(note.createdAt?.toDate())}</small>
        </div>
        <p class="mb-1">${note.message || ''}</p>
      </div>`
    ))
    .join('');

  elements.notificationsList.innerHTML = approvalsHTML + notificationsHTML;

  elements.notificationsList.querySelectorAll('[data-request-id]').forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const id = item.getAttribute('data-request-id');
      const request = state.approvals.find((r) => r.id === id);
      if (request) {
        openApprovalModal(request);
      }
    });
  });
};

const updateStats = () => {
  if (elements.statMembers) {
    elements.statMembers.textContent = state.members.length;
  }
  if (elements.statAttendance) {
    const rate = calculateOverallAttendance();
    elements.statAttendance.textContent = `${rate}%`;
  }
  if (elements.statFinance) {
    const total = sumFinanceForCurrentMonth();
    elements.statFinance.textContent = formatCurrency(total);
  }
  if (elements.statApprovals) {
    const pending = state.approvals.filter((req) => req.status === 'pending').length;
    elements.statApprovals.textContent = pending;
  }
  if (elements.financeWeekTotal) {
    elements.financeWeekTotal.textContent = formatCurrency(sumFinanceForRange(7));
  }
  if (elements.financeMonthTotal) {
    elements.financeMonthTotal.textContent = formatCurrency(sumFinanceForCurrentMonth());
  }
  if (elements.financeYellowCard) {
    elements.financeYellowCard.textContent = formatCurrency(sumFinanceByCategoryAndDay('Yellow Card', 'Sunday'));
  }
};

const rebuildMemberFilter = () => {
  if (!elements.memberFilter) return;
  const ministries = [...new Set(state.members.map((member) => member.ministry).filter(Boolean))];
  elements.memberFilter.innerHTML = `<option value="">Filter by ministry</option>${ministries.map((m) => `<option value="${m}">${m}</option>`).join('')}`;
};

const updateAttendanceChart = () => {
  const ctx = document.getElementById('attendanceChart');
  if (!ctx) return;
  const dataPoints = state.attendance.slice(-12);
  const labels = dataPoints.map((r) => formatDate(r.eventDate));
  const values = dataPoints.map((r) => r.present || 0);
  const expected = dataPoints.map((r) => r.expected || 0);

  if (state.charts.attendance) {
    state.charts.attendance.data.labels = labels;
    state.charts.attendance.data.datasets[0].data = values;
    state.charts.attendance.data.datasets[1].data = expected;
    state.charts.attendance.update();
    return;
  }

  const { primary, accent } = state.theme;

  state.charts.attendance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Present',
          data: values,
          borderColor: primary,
          backgroundColor: withAlpha(primary, 0.25),
          tension: 0.4,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Expected',
          data: expected,
          borderColor: accent,
          backgroundColor: withAlpha(accent, 0.25),
          tension: 0.4,
          fill: true,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
};

const updateFinanceChart = () => {
  const ctx = document.getElementById('financeChart');
  if (!ctx) return;
  const categories = ['First Offering', 'Second Offering', 'Tithe', 'Seed Offering', 'Yellow Card', 'Other'];
  const values = categories.map((category) => sumFinanceByCategory(category));

  if (state.charts.finance) {
    state.charts.finance.data.datasets[0].data = values.map((value) => convertAmount(value));
    state.charts.finance.update();
    return;
  }

  const palette = [
    state.theme.primary,
    shadeColor(state.theme.primary, -12),
    state.theme.accent,
    shadeColor(state.theme.accent, -18),
    '#2a9895',
    '#8f8f8f'
  ];

  state.charts.finance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [
        {
          data: values.map((value) => convertAmount(value)),
          backgroundColor: palette,
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
};

const renderAttendanceSummary = () => {
  if (!elements.attendanceSummary) return;
  const totalEvents = state.attendance.length;
  const avgPresent = average(state.attendance.map((r) => r.present || 0));
  const avgRate = calculateOverallAttendance();
  elements.attendanceSummary.innerHTML = `
    <div class="d-flex flex-column gap-2">
      <div><strong>Total events:</strong> ${totalEvents}</div>
      <div><strong>Average attendance:</strong> ${avgPresent.toFixed(1)}</div>
      <div><strong>Average rate:</strong> ${avgRate}%</div>
    </div>
  `;
};

const renderFinanceSummary = () => {
  if (!elements.financeSummary) return;
  const monthTotal = sumFinanceForCurrentMonth();
  const topCategory = determineTopFinanceCategory();
  elements.financeSummary.innerHTML = `
    <div class="d-flex flex-column gap-2">
      <div><strong>This month:</strong> ${formatCurrency(monthTotal)}</div>
      <div><strong>Largest category:</strong> ${topCategory.category} (${formatCurrency(topCategory.amount)})</div>
      <div><strong>Average per service:</strong> ${formatCurrency(average(state.finance.map((f) => f.amountGHS || 0)))}</div>
    </div>
  `;
};

const refreshAutomationFeed = () => {
  if (!elements.automationFeed) return;
  const feed = [];
  const monthTotal = sumFinanceForCurrentMonth();
  if (monthTotal > 0) {
    feed.push({
      title: 'Finance update',
      body: `Giving for ${formatMonth(new Date())} totals ${formatCurrency(monthTotal)}.`,
      timestamp: new Date()
    });
  }
  const attendanceTrend = compareAttendanceTrend();
  if (attendanceTrend) {
    feed.push(attendanceTrend);
  }
  const pendingApprovals = state.approvals.filter((req) => req.status === 'pending').length;
  feed.push({
    title: 'Approval center',
    body: `${pendingApprovals} edit requests awaiting review.`,
    timestamp: new Date()
  });

  elements.automationFeed.innerHTML = feed
    .map((item) => `
      <div class="list-group-item">
        <div class="d-flex justify-content-between">
          <h6 class="mb-1">${item.title}</h6>
          <small>${timeAgo(item.timestamp)}</small>
        </div>
        <p class="mb-0">${item.body}</p>
      </div>
    `)
    .join('');
};

const mapLockStatusClass = (status) => {
  switch (status) {
    case 'pending':
      return 'status-pending';
    case 'approved':
      return 'status-approved';
    default:
      return 'status-locked';
  }
};

const formatLockStatus = (status) => {
  switch (status) {
    case 'pending':
      return 'Pending Approval';
    case 'approved':
      return 'Approved';
    default:
      return 'Locked';
  }
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : value?.toDate?.() || new Date(value);
  if (!date || Number.isNaN(date)) return '-';
  return date.toLocaleDateString();
};

const timeAgo = (date) => {
  if (!date) return 'moments ago';
  const now = new Date();
  const diff = Math.max(0, now - date);
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return 'moments ago';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
};

const average = (arr = []) => {
  if (!arr.length) return 0;
  const total = arr.reduce((sum, value) => sum + (Number(value) || 0), 0);
  return total / arr.length;
};

const sumFinanceForRange = (days = 7) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return state.finance.reduce((sum, entry) => {
    const entryDate = entry.date?.toDate?.() || (entry.date ? new Date(entry.date) : null);
    if (entryDate && entryDate >= cutoff) {
      return sum + (entry.amountGHS || 0);
    }
    return sum;
  }, 0);
};

const sumFinanceForCurrentMonth = () => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return state.finance.reduce((sum, entry) => {
    const entryDate = entry.date?.toDate?.() || (entry.date ? new Date(entry.date) : null);
    if (entryDate && entryDate.getMonth() === month && entryDate.getFullYear() === year) {
      return sum + (entry.amountGHS || 0);
    }
    return sum;
  }, 0);
};

const sumFinanceByCategory = (category) => {
  return state.finance.reduce((sum, entry) => {
    if (entry.category === category) {
      return sum + (entry.amountGHS || 0);
    }
    return sum;
  }, 0);
};

const sumFinanceByCategoryAndDay = (category, day) => {
  return state.finance.reduce((sum, entry) => {
    const entryDate = entry.date?.toDate?.() || (entry.date ? new Date(entry.date) : null);
    if (entry.category === category && entryDate && entryDate.toLocaleDateString('en-US', { weekday: 'long' }) === day) {
      return sum + (entry.amountGHS || 0);
    }
    return sum;
  }, 0);
};

const determineTopFinanceCategory = () => {
  const categories = ['First Offering', 'Second Offering', 'Tithe', 'Seed Offering', 'Yellow Card', 'Other'];
  const totals = categories.map((category) => ({ category, amount: sumFinanceByCategory(category) }));
  totals.sort((a, b) => b.amount - a.amount);
  return totals[0] || { category: 'N/A', amount: 0 };
};

const computeAttendanceRate = (record) => {
  if (!record.present || !record.expected) {
    return record.present ? 100 : 0;
  }
  return Math.round((record.present / record.expected) * 100);
};

const calculateOverallAttendance = () => {
  if (!state.attendance.length) return 0;
  const rates = state.attendance.map((record) => computeAttendanceRate(record));
  return Math.min(100, Math.round(average(rates)));
};

const formatMonth = (date) => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const compareAttendanceTrend = () => {
  if (state.attendance.length < 8) return null;
  const recent = state.attendance.slice(-4).map((r) => computeAttendanceRate(r));
  const previous = state.attendance.slice(-8, -4).map((r) => computeAttendanceRate(r));
  const diff = Math.round(average(recent) - average(previous));
  const body = diff >= 0
    ? `Attendance is up ${diff}% compared to the previous four weeks.`
    : `Attendance has dipped ${Math.abs(diff)}% compared to the previous four weeks.`;
  return { title: 'Attendance trend', body, timestamp: new Date() };
};

const openApprovalModal = (request) => {
  const modalElement = document.getElementById('approvalModal');
  if (!modalElement) return;
  modalElement.dataset.requestId = request.id;
  const approvalsList = request.approvals?.map((approval) => `<li>${approval.email} · ${timeAgo(approval.timestamp?.toDate?.() || new Date())}</li>`).join('') || '<li>No approvals yet</li>';
  document.getElementById('approvalDetails').innerHTML = `
    <div class="mb-3">
      <strong>Entity:</strong> ${capitalize(request.entity)}<br/>
      <strong>Action:</strong> ${capitalize(request.action)}<br/>
      <strong>Requested by:</strong> ${request.requestedByName || request.requestedBy}<br/>
      <strong>Status:</strong> ${formatLockStatus(request.status)}
    </div>
    <div class="mb-3">
      <strong>New Data:</strong>
      <pre class="bg-light rounded p-3">${JSON.stringify(request.payload, null, 2)}</pre>
    </div>
    <div>
      <strong>Approvals (${request.approvals?.length || 0}/2)</strong>
      <ul>${approvalsList}</ul>
    </div>
  `;
  const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
  modal.show();
};

const createEditRequest = async ({ entity, action, recordId, payload }) => {
  const churchRef = doc(db, 'churches', state.user.uid);
  const requestsRef = collection(churchRef, 'editRequests');
  const request = {
    entity,
    entityName: payload?.fullName || payload?.eventName || payload?.name || payload?.category || recordId,
    action,
    recordId,
    payload,
    status: 'pending',
    requestedBy: state.user.email,
    requestedByName: state.user.displayName || state.church?.fullName,
    approvals: [],
    createdAt: serverTimestamp()
  };
  await addDoc(requestsRef, request);
  await addNotification(`${capitalize(action)} request`, `${state.user.email} submitted a ${action} request for ${request.entityName}.`);
  if (recordId && action !== 'create') {
    try {
      await updateDoc(doc(churchRef, entity, recordId), { lockStatus: 'pending' });
    } catch (error) {
      console.warn('GraceTrack: unable to flag record as pending', error);
    }
  }
};

const approveRequest = async (request, approve = true) => {
  const churchRef = doc(db, 'churches', state.user.uid);
  const requestRef = doc(churchRef, 'editRequests', request.id);
  const approvals = request.approvals || [];

  if (!isAuthorizedApprover()) {
    showToast('Only assigned manager or sub-manager can approve.', 'danger');
    return;
  }

  if (approvals.some((approval) => approval.email === state.user.email)) {
    showToast('You have already responded to this request.', 'warning');
    return;
  }

  if (!approve) {
    await updateDoc(requestRef, {
      status: 'rejected',
      resolvedAt: serverTimestamp(),
      approvals: [...approvals, { email: state.user.email, timestamp: serverTimestamp(), decision: 'rejected' }]
    });
    await updateDoc(doc(churchRef, request.entity, request.recordId), { lockStatus: 'locked' });
    await addNotification('Request rejected', `${state.user.email} rejected ${request.entityName} ${request.action} request.`);
    showToast('Request rejected. Record remains locked.', 'info');
    return;
  }

  approvals.push({ email: state.user.email, timestamp: serverTimestamp(), decision: 'approved' });

  const targetRoles = [state.church?.roles?.managerEmail, state.church?.roles?.subManagerEmail].filter(Boolean);
  const uniqueApprovals = approvals.filter((approval, index, arr) => index === arr.findIndex((a) => a.email === approval.email));

  await updateDoc(requestRef, { approvals: uniqueApprovals });

  const hasTwoApprovals = targetRoles.every((roleEmail) => uniqueApprovals.some((approval) => approval.email === roleEmail));

  if (hasTwoApprovals) {
    await applyApprovedChange(request);
    await updateDoc(requestRef, { status: 'approved', resolvedAt: serverTimestamp() });
    await addNotification('Request approved', `${request.entityName} ${request.action} request approved.`);
    showToast('Change approved and applied.', 'success');
  } else {
    showToast('Approval recorded. Awaiting final confirmation.', 'info');
  }
};

const applyApprovedChange = async (request) => {
  const churchRef = doc(db, 'churches', state.user.uid);
  const targetRef = doc(churchRef, request.entity, request.recordId);
  if (request.action === 'delete') {
    await deleteDoc(targetRef);
    return;
  }

  await updateDoc(targetRef, {
    ...request.payload,
    lockStatus: 'locked',
    updatedBy: state.user.email,
    updatedAt: serverTimestamp()
  });
};

const addNotification = async (title, message) => {
  const churchRef = doc(db, 'churches', state.user.uid);
  const notificationRef = collection(churchRef, 'notifications');
  await addDoc(notificationRef, { title, message, createdAt: serverTimestamp() });
};

const isAuthorizedApprover = () => {
  const { email } = state.user;
  const { managerEmail, subManagerEmail } = state.church?.roles || {};
  return email === managerEmail || email === subManagerEmail;
};

const showToast = (message, type = 'success') => {
  const container = document.getElementById('toastContainer') || createToastContainer();
  const toastElement = document.createElement('div');
  toastElement.className = `toast align-items-center text-bg-${type} border-0`;
  toastElement.setAttribute('role', 'alert');
  toastElement.setAttribute('aria-live', 'assertive');
  toastElement.setAttribute('aria-atomic', 'true');
  toastElement.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  container.appendChild(toastElement);
  const toast = new bootstrap.Toast(toastElement, { delay: 4000 });
  toast.show();
};

const createToastContainer = () => {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'position-fixed bottom-0 end-0 p-3';
  document.body.appendChild(container);
  return container;
};

const registerEventHandlers = () => {
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'auth.html';
  });

  document.getElementById('modeToggle')?.addEventListener('click', async () => {
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setDashboardTheme(nextTheme);
    await savePreferences({ theme: nextTheme });
  });

  elements.primaryColorPicker?.addEventListener('input', previewPrimaryColor);
  elements.primaryColorPicker?.addEventListener('change', persistPrimaryColor);
  elements.resetThemeBtn?.addEventListener('click', resetThemePalette);
  elements.currencyToggle?.addEventListener('click', () => {
    cycleCurrency().catch((error) => {
      console.error('GraceTrack: currency switch failed', error);
      showToast('Unable to switch currency right now.', 'danger');
    });
  });

  document.getElementById('notificationsBtn')?.addEventListener('click', () => {
    const offcanvas = bootstrap.Offcanvas.getOrCreateInstance('#notificationsPanel');
    offcanvas.show();
  });

  elements.memberFilter?.addEventListener('change', renderMembers);
  document.getElementById('memberSearch')?.addEventListener('input', renderMembers);

  elements.memberPhotoFile?.addEventListener('change', handleMemberPhotoFileChange);
  elements.memberPhotoUrl?.addEventListener('input', handleMemberPhotoUrlInput);
  document.getElementById('memberName')?.addEventListener('input', (event) => {
    if (elements.memberPhotoPreview?.dataset?.upload) return;
    if (elements.memberPhotoUrl?.value.trim()) return;
    setMemberPhotoPreviewSrc(null, event.target.value.trim() || 'Member');
  });

  const memberModalElement = document.getElementById('memberModal');
  memberModalElement?.addEventListener('show.bs.modal', () => {
    const memberIdField = document.getElementById('memberId');
    if (!memberIdField?.value) {
      resetMemberPhotoFields();
    }
  });
  memberModalElement?.addEventListener('hidden.bs.modal', () => {
    const memberIdField = document.getElementById('memberId');
    if (memberIdField) {
      memberIdField.value = '';
    }
    resetMemberPhotoFields();
    document.getElementById('memberForm')?.reset();
    document.getElementById('memberModalLabel').textContent = 'Add member';
  });

  document.getElementById('saveMemberBtn')?.addEventListener('click', saveMemberFromModal);
  document.getElementById('saveAttendanceBtn')?.addEventListener('click', saveAttendanceFromModal);
  document.getElementById('saveFinanceBtn')?.addEventListener('click', saveFinanceFromModal);
  document.getElementById('saveGroupBtn')?.addEventListener('click', saveGroupFromModal);

  document.getElementById('exportMembersBtn')?.addEventListener('click', () => exportCollectionToCsv('members'));
  document.getElementById('exportFinanceCsv')?.addEventListener('click', () => exportCollectionToCsv('finance'));

  document.getElementById('generateAttendanceReport')?.addEventListener('click', () => generatePdfReport('attendance'));
  document.getElementById('generateFinanceReport')?.addEventListener('click', () => generatePdfReport('finance'));

  document.getElementById('processImportBtn')?.addEventListener('click', handleCsvImport);

  document.getElementById('settingsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currency = elements.settingsCurrency?.value;
    const theme = elements.settingsTheme?.value;
    state.currency.code = currency;
    state.currency.symbol = resolveCurrencySymbol(currency);
    if (state.church) {
      state.church.preferences = {
        ...(state.church.preferences || {}),
        currency,
        theme
      };
    }
    updateCurrencyToggleLabel();
    updateStats();
    renderFinance();
    renderFinanceSummary();
    updateFinanceChart();
    refreshAutomationFeed();
    updateCurrencyChip();
    await savePreferences({ currency, theme });
    setDashboardTheme(theme);
    showToast('Preferences updated.');
  });

  document.getElementById('rolesForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const managerEmail = elements.managerEmail?.value.trim();
    const subManagerEmail = elements.subManagerEmail?.value.trim();
    if (!managerEmail || !subManagerEmail) {
      showToast('Provide both manager and sub-manager emails.', 'danger');
      return;
    }
    const churchRef = doc(db, 'churches', state.user.uid);
    await updateDoc(churchRef, {
      'roles.managerEmail': managerEmail,
      'roles.subManagerEmail': subManagerEmail,
      'roles.lastUpdated': serverTimestamp()
    });
    showToast('Approval roles updated.');
  });

  document.getElementById('deleteAccountBtn')?.addEventListener('click', handleAccountDeletion);

  document.querySelector('#membersTable')?.addEventListener('click', handleTableAction('members'));
  document.querySelector('#attendanceTable')?.addEventListener('click', handleTableAction('attendance'));
  document.querySelector('#financeTable')?.addEventListener('click', handleTableAction('finance'));
  document.querySelector('#groupsTable')?.addEventListener('click', handleTableAction('groups'));

  document.getElementById('approveApprovalBtn')?.addEventListener('click', () => handleApprovalDecision(true));
  document.getElementById('rejectApprovalBtn')?.addEventListener('click', () => handleApprovalDecision(false));
};

const handleTableAction = (entity) => (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('tr');
  const recordId = row?.getAttribute('data-id');
  if (!recordId) return;
  const action = button.getAttribute('data-action');
  const record = (state[entity] || []).find((item) => item.id === recordId);
  if (!record) return;

  switch (action) {
    case 'edit':
      populateModalForEntity(entity, record);
      break;
    case 'delete':
      requestDelete(entity, record);
      break;
    default:
      break;
  }
};

const populateModalForEntity = (entity, record) => {
  const modalMap = {
    members: '#memberModal',
    attendance: '#attendanceModal',
    finance: '#financeModal',
    groups: '#groupModal'
  };
  const modalSelector = modalMap[entity];
  const modalElement = document.querySelector(modalSelector);
  if (!modalElement) return;
  modalElement.querySelector('input[type="hidden"]').value = record.id;

  switch (entity) {
    case 'members':
      document.getElementById('memberModalLabel').textContent = 'Request member edit';
      document.getElementById('memberName').value = record.fullName || '';
      document.getElementById('memberGender').value = record.gender || '';
      document.getElementById('memberAge').value = record.age || '';
      document.getElementById('memberPhone').value = record.phone || '';
      document.getElementById('memberAddress').value = record.address || '';
      document.getElementById('memberMinistry').value = record.ministry || '';
      document.getElementById('memberRole').value = record.role || '';
      document.getElementById('memberNotes').value = record.notes || '';
        document.getElementById('memberPhoto').value = record.photoUrl || '';
        if (elements.memberPhotoPreview) {
          if (elements.memberPhotoPreview.dataset) {
            delete elements.memberPhotoPreview.dataset.upload;
          }
          setMemberPhotoPreviewSrc(record.photoUrl || '', record.fullName || 'Member');
        }
        if (elements.memberPhotoFile) {
          elements.memberPhotoFile.value = '';
        }
      break;
    case 'attendance':
      document.getElementById('attendanceModalLabel').textContent = 'Request attendance edit';
      document.getElementById('attendanceEvent').value = record.eventName || '';
      document.getElementById('attendanceDate').value = toInputDate(record.eventDate);
      document.getElementById('attendanceGroup').value = record.group || '';
      document.getElementById('attendancePresent').value = record.present || '';
      document.getElementById('attendanceExpected').value = record.expected || '';
      document.getElementById('attendanceNotes').value = record.notes || '';
      break;
    case 'finance':
      document.getElementById('financeModalLabel').textContent = 'Request finance edit';
      document.getElementById('financeDate').value = toInputDate(record.date);
      document.getElementById('financeCategory').value = record.category || '';
      document.getElementById('financeAmount').value = record.amountGHS || '';
      document.getElementById('financeNotes').value = record.notes || '';
      break;
    case 'groups':
      document.getElementById('groupModalLabel').textContent = 'Request group edit';
      document.getElementById('groupName').value = record.name || '';
      document.getElementById('groupLeader').value = record.leader || '';
      document.getElementById('groupMembers').value = record.members || '';
      document.getElementById('groupNextEvent').value = toInputDate(record.nextEventDate);
      document.getElementById('groupStatus').value = record.status || '';
      document.getElementById('groupOverview').value = record.overview || '';
      break;
    default:
      break;
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
  modal.show();
};

const requestDelete = async (entity, record) => {
  if (!confirm(`Request deletion of ${record.fullName || record.name || record.category || 'this record'}?`)) return;
  await createEditRequest({ entity, action: 'delete', recordId: record.id, payload: null });
  showToast('Deletion request submitted.', 'warning');
};

const saveMemberFromModal = async () => {
  const id = document.getElementById('memberId').value;
  const basePayload = {
    fullName: document.getElementById('memberName').value.trim(),
    gender: document.getElementById('memberGender').value,
    age: Number(document.getElementById('memberAge').value) || null,
    phone: document.getElementById('memberPhone').value.trim(),
    address: document.getElementById('memberAddress').value.trim(),
    ministry: document.getElementById('memberMinistry').value.trim(),
    role: document.getElementById('memberRole').value.trim(),
    notes: document.getElementById('memberNotes').value.trim()
  };

  if (!basePayload.fullName) {
    showToast('Member name is required.', 'danger');
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance('#memberModal');
  modal.hide();

  const uploadDataUrl = elements.memberPhotoPreview?.dataset?.upload;
  const urlSource = elements.memberPhotoUrl?.value.trim();
  const payload = { ...basePayload, photoUrl: uploadDataUrl || urlSource || '' };

  if (id) {
    await createEditRequest({ entity: 'members', action: 'update', recordId: id, payload });
    showToast('Edit request submitted for approval.', 'info');
  } else {
    await addRecord('members', payload);
    showToast('Member added and locked.', 'success');
  }
  document.getElementById('memberForm').reset();
  resetMemberPhotoFields();
  document.getElementById('memberModalLabel').textContent = 'Add member';
};

const saveAttendanceFromModal = async () => {
  const id = document.getElementById('attendanceId').value;
  const basePayload = {
    eventName: document.getElementById('attendanceEvent').value.trim(),
    eventDate: toTimestamp(document.getElementById('attendanceDate').value),
    group: document.getElementById('attendanceGroup').value.trim(),
    present: Number(document.getElementById('attendancePresent').value) || 0,
    expected: Number(document.getElementById('attendanceExpected').value) || 0,
    notes: document.getElementById('attendanceNotes').value.trim()
  };

  if (!basePayload.eventName || !basePayload.eventDate) {
    showToast('Event name and date are required.', 'danger');
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance('#attendanceModal');
  modal.hide();

  const payload = { ...basePayload };

  if (id) {
    await createEditRequest({ entity: 'attendance', action: 'update', recordId: id, payload });
    showToast('Attendance edit request submitted.', 'info');
  } else {
    await addRecord('attendance', payload);
    showToast('Attendance saved and locked.', 'success');
  }
  document.getElementById('attendanceForm').reset();
  document.getElementById('attendanceModalLabel').textContent = 'Record attendance';
};

const saveFinanceFromModal = async () => {
  const id = document.getElementById('financeId').value;
  const amount = Number(document.getElementById('financeAmount').value);
  const basePayload = {
    date: toTimestamp(document.getElementById('financeDate').value),
    category: document.getElementById('financeCategory').value,
    notes: document.getElementById('financeNotes').value.trim(),
    amountGHS: Number.isFinite(amount) ? amount : 0
  };

  if (!basePayload.date || !basePayload.category) {
    showToast('Date and category are required.', 'danger');
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance('#financeModal');
  modal.hide();

  const payload = { ...basePayload };

  if (id) {
    await createEditRequest({ entity: 'finance', action: 'update', recordId: id, payload });
    showToast('Finance edit request submitted.', 'info');
  } else {
    await addRecord('finance', payload);
    showToast('Finance record saved and locked.', 'success');
  }
  document.getElementById('financeForm').reset();
  document.getElementById('financeModalLabel').textContent = 'New finance entry';
};

const saveGroupFromModal = async () => {
  const id = document.getElementById('groupId').value;
  const basePayload = {
    name: document.getElementById('groupName').value.trim(),
    leader: document.getElementById('groupLeader').value.trim(),
    members: Number(document.getElementById('groupMembers').value) || 0,
    nextEventDate: toTimestamp(document.getElementById('groupNextEvent').value),
    status: document.getElementById('groupStatus').value,
    overview: document.getElementById('groupOverview').value.trim()
  };

  if (!basePayload.name) {
    showToast('Group or event name is required.', 'danger');
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance('#groupModal');
  modal.hide();

  const payload = { ...basePayload };

  if (id) {
    await createEditRequest({ entity: 'groups', action: 'update', recordId: id, payload });
    showToast('Group edit request submitted.', 'info');
  } else {
    await addRecord('groups', payload);
    showToast('Group saved and locked.', 'success');
  }
  document.getElementById('groupForm').reset();
  document.getElementById('groupModalLabel').textContent = 'New group or event';
};

const addRecord = async (entity, payload) => {
  const churchRef = doc(db, 'churches', state.user.uid);
  await addDoc(collection(churchRef, entity), {
    ...payload,
    lockStatus: 'locked',
    createdAt: serverTimestamp(),
    createdBy: state.user.email
  });
};

const handleApprovalDecision = (approve) => {
  const modal = document.getElementById('approvalModal');
  const requestId = modal?.dataset.requestId;
  const request = state.approvals.find((r) => r.id === requestId);
  if (!request) return;
  approveRequest(request, approve);
  bootstrap.Modal.getOrCreateInstance(modal).hide();
};

const savePreferences = async (updates = {}) => {
  const churchRef = doc(db, 'churches', state.user.uid);
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'currency') && updates.currency) {
    payload['preferences.currency'] = updates.currency;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'theme') && updates.theme) {
    payload['preferences.theme'] = updates.theme;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'primaryColor') && updates.primaryColor) {
    payload['preferences.primaryColor'] = updates.primaryColor;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'accentColor') && updates.accentColor) {
    payload['preferences.accentColor'] = updates.accentColor;
  }
  if (Object.keys(payload).length) {
    await updateDoc(churchRef, payload);
  }
};

const handleCsvImport = () => {
  const type = document.getElementById('importType').value;
  const fileInput = document.getElementById('importFile');
  if (!fileInput.files.length) {
    showToast('Select a CSV file to import.', 'danger');
    return;
  }
  Papa.parse(fileInput.files[0], {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
      const records = results.data;
      for (const record of records) {
        await importRecord(type, record);
      }
      showToast(`${records.length} records imported to ${type}.`);
      document.getElementById('importForm').reset();
      bootstrap.Modal.getOrCreateInstance('#importModal').hide();
    },
    error: () => showToast('Failed to parse CSV file.', 'danger')
  });
};

const importRecord = async (type, record) => {
  switch (type) {
    case 'members':
      await addRecord('members', {
        fullName: record['Full Name'] || record.fullName,
        gender: record['Gender'] || record.gender,
        age: Number(record['Age'] || record.age) || null,
        phone: record['Phone'] || record.phone,
        address: record['Address'] || record.address,
        ministry: record['Ministry'] || record.ministry,
        role: record['Role'] || record.role,
        notes: record['Notes'] || record.notes,
        photoUrl: record['Photo URL'] || record.photoUrl,
        createdAt: serverTimestamp()
      });
      break;
    case 'attendance':
      await addRecord('attendance', {
        eventName: record['Event'] || record.eventName,
        eventDate: toTimestamp(record['Date'] || record.eventDate),
        group: record['Group'] || record.group,
        present: Number(record['Present'] || record.present) || 0,
        expected: Number(record['Expected'] || record.expected) || 0,
        notes: record['Notes'] || record.notes,
        createdAt: serverTimestamp()
      });
      break;
    case 'finance':
      await addRecord('finance', {
        date: toTimestamp(record['Date'] || record.date),
        category: record['Category'] || record.category,
        amountGHS: Number(record['Amount'] || record.amount) || 0,
        notes: record['Notes'] || record.notes,
        createdAt: serverTimestamp()
      });
      break;
    default:
      break;
  }
};

const exportCollectionToCsv = (type) => {
  let data = [];
  switch (type) {
    case 'members':
      data = state.members;
      break;
    case 'finance':
      data = state.finance;
      break;
    case 'attendance':
      data = state.attendance;
      break;
    default:
      break;
  }
  if (!data.length) {
    showToast('Nothing to export yet.', 'info');
    return;
  }

  const csv = Papa.unparse(
    data.map((item) => ({
      ...item,
      createdAt: item.createdAt?.toDate?.()?.toISOString?.() || '',
      updatedAt: item.updatedAt?.toDate?.()?.toISOString?.() || ''
    }))
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `gracetrack-${type}-${Date.now()}.csv`);
};

const generatePdfReport = (type) => {
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF();
  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(18);
  docPdf.text(`GraceTrack ${capitalize(type)} Report`, 14, 22);
  docPdf.setFontSize(12);
  docPdf.text(`Generated on: ${new Date().toLocaleString()}`, 14, 32);

  let rows = [];
  if (type === 'attendance') {
    rows = state.attendance.map((item) => [item.eventName, formatDate(item.eventDate), item.present || 0, computeAttendanceRate(item)]);
    docPdf.autoTable({
      startY: 40,
      head: [['Event', 'Date', 'Present', 'Rate %']],
      body: rows
    });
  } else {
    rows = state.finance.map((item) => [formatDate(item.date), item.category, formatCurrency(item.amountGHS || 0)]);
    docPdf.autoTable({
      startY: 40,
      head: [['Date', 'Category', 'Amount']],
      body: rows
    });
  }

  docPdf.save(`gracetrack-${type}-report.pdf`);
};

const handleAccountDeletion = async () => {
  if (!confirm('This will permanently delete your account and data. Continue?')) return;
  try {
    await deleteUser(state.user);
    showToast('Account deleted. Redirecting...', 'info');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);
  } catch (error) {
    if (error.code === 'auth/requires-recent-login') {
      showToast('Please re-authenticate before deleting your account.', 'danger');
    } else {
      showToast(error.message || 'Unable to delete account.', 'danger');
    }
  }
};

const toInputDate = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date) return '';
  return date.toISOString().substring(0, 10);
};

const toTimestamp = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date)) return null;
  return date;
};

const capitalize = (text = '') => text ? text.charAt(0).toUpperCase() + text.slice(1) : '';

const initDashboard = async () => {
  initialiseNavigation();
  registerEventHandlers();
  updateCurrencyToggleLabel();
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'auth.html';
    return;
  }
  state.user = user;
  await initDashboard();
  await subscribeToCollections();
});

// Ensure jsPDF autotable is available
if (window.jspdf && !window.jspdf.jsPDF.API.autoTable) {
  console.warn('jsPDF autoTable plugin is not loaded. PDF exports will be basic.');
}

