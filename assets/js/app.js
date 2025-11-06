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
    finance: null,
    attendanceDetail: null,
    reportsAttendance: null,
    reportsFinance: null
  },
  currency: {
    code: 'GHS',
    symbol: '₵',
    rates: { GHS: 1, USD: 0.082, GBP: 0.064, EUR: 0.076 }
  },
  ui: {
    financeCategory: '',
    financeSearch: '',
    financeStatus: '',
    accent: 'blue',
    reports: {
      start: null,
      end: null,
      event: ''
    }
  }
};

const elements = {
  sidebarUserName: document.getElementById('sidebarUserName'),
  topbarName: document.getElementById('topbarName'),
  topbarEmail: document.getElementById('topbarEmail'),
  topbarInitials: document.getElementById('topbarInitials'),
  accountName: document.getElementById('accountName'),
  accountEmail: document.getElementById('accountEmail'),
  accountInitials: document.getElementById('accountInitials'),
  currencyChip: document.getElementById('currencyChip'),
  headerCurrencySelect: document.getElementById('headerCurrencySelect'),
  notificationCount: document.getElementById('notificationCount'),
  notificationsList: document.getElementById('notificationsList'),
  automationFeed: document.getElementById('automationFeed'),
  memberFilter: document.getElementById('memberFilter'),
  memberStatusFilter: document.getElementById('memberStatusFilter'),
  memberActivityFeed: document.getElementById('memberActivityFeed'),
  upcomingEventsFeed: document.getElementById('upcomingEventsFeed'),
  membersTableBody: document.querySelector('#membersTable tbody'),
  attendanceTableBody: document.querySelector('#attendanceTable tbody'),
  financeTableBody: document.querySelector('#financeTable tbody'),
  groupsTableBody: document.querySelector('#groupsTable tbody'),
  attendanceSummary: document.getElementById('attendanceSummary'),
  attendanceSummaryReports: document.getElementById('attendanceSummaryReports'),
  financeSummaryReports: document.getElementById('financeSummaryReports'),
  statMembers: document.getElementById('statMembers'),
  statAttendance: document.getElementById('statAttendance'),
  statFinance: document.getElementById('statFinance'),
  statApprovals: document.getElementById('statApprovals'),
  financeWeekTotal: document.getElementById('financeWeekTotal'),
  financeMonthTotal: document.getElementById('financeMonthTotal'),
  financeYellowCard: document.getElementById('financeYellowCard'),
  financeTabs: document.getElementById('financeTabs'),
  financeSearch: document.getElementById('financeSearch'),
  financeStatusFilter: document.getElementById('financeStatusFilter'),
  financeSelectAll: document.getElementById('financeSelectAll'),
  financeDeleteRows: document.getElementById('financeDeleteRows'),
  financeAutoTotal: document.getElementById('financeAutoTotal'),
  settingsCurrency: document.getElementById('settingsCurrency'),
  settingsTheme: document.getElementById('settingsTheme'),
  colorPalette: document.getElementById('colorPalette'),
  resetPreferences: document.getElementById('resetPreferences'),
  sidebarThemeToggle: document.getElementById('sidebarThemeToggle'),
  managerEmail: document.getElementById('managerEmail'),
  subManagerEmail: document.getElementById('subManagerEmail'),
  reportsStartDate: document.getElementById('reportsStartDate'),
  reportsEndDate: document.getElementById('reportsEndDate'),
  reportsEventFilter: document.getElementById('reportsEventFilter'),
  reportsAttendanceChart: document.getElementById('reportsAttendanceChart'),
  reportsFinanceChart: document.getElementById('reportsFinanceChart'),
  attendanceDetailChart: document.getElementById('attendanceDetailChart')
};

const formatCurrency = (amount = 0) => {
  const { code, symbol, rates } = state.currency;
  const rate = rates?.[code] ?? 1;
  const converted = amount * rate;
  return `${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const setDashboardTheme = (theme) => {
  document.body.classList.toggle('dark-mode', theme === 'dark');
  document.body.dataset.theme = theme;
  const toggleLabel = document.querySelector('#modeToggle span');
  if (toggleLabel) {
    toggleLabel.textContent = theme === 'dark' ? 'Dark' : 'Light';
  }
  if (elements.sidebarThemeToggle) {
    elements.sidebarThemeToggle.innerHTML = `<i class="fa-solid fa-circle-half-stroke"></i>${theme === 'dark' ? ' Light mode' : ' Dark mode'}`;
  }
};

const applyAccent = (accent = 'blue') => {
  const supported = ['blue', 'gold', 'mint', 'purple'];
  const tone = supported.includes(accent) ? accent : 'blue';
  state.ui.accent = tone;
  document.body.dataset.accent = tone;
  if (elements.colorPalette) {
    elements.colorPalette.querySelectorAll('.palette-swatch').forEach((swatch) => {
      swatch.classList.toggle('active', swatch.getAttribute('data-accent') === tone);
    });
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
    state.ui.accent = data?.preferences?.accent ?? state.ui.accent ?? 'blue';
    refreshProfileUI();
    setDashboardTheme(data?.preferences?.theme ?? 'light');
    applyAccent(state.ui.accent);
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
  if (elements.topbarName) {
    elements.topbarName.textContent = displayName;
  }
  if (elements.topbarEmail) {
    elements.topbarEmail.textContent = email;
  }
  if (elements.topbarInitials) {
    elements.topbarInitials.textContent = deriveInitials(displayName);
  }
  if (elements.currencyChip) {
    elements.currencyChip.textContent = `Currency: ${state.currency.symbol}`;
  }
  if (elements.settingsCurrency) {
    elements.settingsCurrency.value = state.currency.code;
  }
  if (elements.headerCurrencySelect) {
    elements.headerCurrencySelect.value = state.currency.code;
  }
  if (elements.settingsTheme && state.church?.preferences?.theme) {
    elements.settingsTheme.value = state.church.preferences.theme;
  }
  if (elements.managerEmail && state.church?.roles) {
    elements.managerEmail.value = state.church.roles.managerEmail || '';
    elements.subManagerEmail.value = state.church.roles.subManagerEmail || '';
  }
  applyAccent(state.ui.accent);
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
  const ministryFilter = elements.memberFilter?.value.toLowerCase() ?? '';
  const statusFilter = elements.memberStatusFilter?.value.toLowerCase() ?? '';
  const filtered = state.members.filter((member) => {
    const matchesSearch = !search || member.fullName?.toLowerCase().includes(search) || member.ministry?.toLowerCase().includes(search) || member.phone?.toLowerCase().includes(search);
    const matchesMinistry = !ministryFilter || member.ministry?.toLowerCase() === ministryFilter;
    const matchesStatus = !statusFilter || member.lockStatus === statusFilter;
    return matchesSearch && matchesMinistry && matchesStatus;
  });

  elements.membersTableBody.innerHTML = filtered
    .map((member) => {
      const statusClass = mapLockStatusClass(member.lockStatus);
      return `
        <tr data-id="${member.id}">
          <td>
            <div class="d-flex align-items-center gap-3">
              <img src="${member.photoUrl || 'https://api.dicebear.com/8.x/initials/svg?seed=' + encodeURIComponent(member.fullName || 'Member')}" alt="avatar" class="rounded-circle" width="44" height="44"/>
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

  renderMemberActivity();
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

  updateAttendanceDetailChart();
  updateReportsCharts();
};

const getVisibleFinanceRecords = () => {
  const category = state.ui.financeCategory?.toLowerCase() ?? '';
  const search = state.ui.financeSearch?.toLowerCase() ?? '';
  const status = state.ui.financeStatus ?? '';

  return state.finance.filter((item) => {
    const matchesCategory = !category || (item.category || '').toLowerCase() === category;
    const matchesStatus = !status || item.lockStatus === status;
    const haystack = `${item.contributor || ''} ${(item.notes || '')} ${(item.category || '')}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    return matchesCategory && matchesStatus && matchesSearch;
  });
};

const renderFinance = () => {
  if (!elements.financeTableBody) return;
  const filtered = getVisibleFinanceRecords();

  elements.financeTableBody.innerHTML = filtered
    .map((item) => {
      const statusClass = mapLockStatusClass(item.lockStatus);
      return `
        <tr data-id="${item.id}">
          <td><input class="form-check-input finance-row-select" type="checkbox" data-id="${item.id}" /></td>
          <td>${item.contributor || item.notes || '-'}</td>
          <td>${item.category || '-'}</td>
          <td>${formatCurrency(item.amountGHS || 0)}</td>
          <td>${formatDate(item.date)}</td>
          <td>${formatTime(item.recordedTime)}</td>
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

  if (elements.financeSelectAll) {
    elements.financeSelectAll.checked = false;
  }

  updateReportsCharts();
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

  renderUpcomingEvents();
};

const renderMemberActivity = () => {
  if (!elements.memberActivityFeed) return;
  if (!state.members.length) {
    elements.memberActivityFeed.innerHTML = '<li class="placeholder-text">Invite your team to start capturing member updates.</li>';
    return;
  }
  const recent = [...state.members]
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, 4);
  elements.memberActivityFeed.innerHTML = recent
    .map((member) => {
      const created = member.createdAt?.toDate?.() || null;
      return `
        <li class="d-flex align-items-start gap-3 mb-3">
          <div class="avatar-initials" style="width:36px;height:36px">${deriveInitials(member.fullName || 'GT')}</div>
          <div>
            <strong>${member.fullName || 'Member'}</strong>
            <div class="text-muted small">${member.ministry || 'General'} · ${timeAgo(created)}</div>
          </div>
        </li>
      `;
    })
    .join('');
};

const renderUpcomingEvents = () => {
  if (!elements.upcomingEventsFeed) return;
  if (!state.groups.length) {
    elements.upcomingEventsFeed.innerHTML = '<li class="placeholder-text">Add events to see them appear here.</li>';
    return;
  }
  const upcoming = [...state.groups]
    .filter((group) => group.nextEventDate)
    .sort((a, b) => (a.nextEventDate?.toMillis?.() || new Date(a.nextEventDate || 0)) - (b.nextEventDate?.toMillis?.() || new Date(b.nextEventDate || 0)))
    .slice(0, 4);

  if (!upcoming.length) {
    elements.upcomingEventsFeed.innerHTML = '<li class="placeholder-text">No upcoming events recorded yet.</li>';
    return;
  }

  elements.upcomingEventsFeed.innerHTML = upcoming
    .map((event) => {
      const date = event.nextEventDate?.toDate?.() || (event.nextEventDate ? new Date(event.nextEventDate) : null);
      return `
        <li class="d-flex align-items-start gap-3 mb-3">
          <div class="icon icon-primary" style="width:36px;height:36px"><i class="fa-solid fa-calendar-check"></i></div>
          <div>
            <strong>${event.name || 'Upcoming event'}</strong>
            <div class="text-muted small">${date ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date TBA'} · ${event.status || 'Planned'}</div>
          </div>
        </li>
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

  state.charts.attendance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Present',
          data: values,
          borderColor: '#0f2856',
          backgroundColor: 'rgba(15, 40, 86, 0.2)',
          tension: 0.4,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Expected',
          data: expected,
          borderColor: '#f3c969',
          backgroundColor: 'rgba(243, 201, 105, 0.25)',
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
    state.charts.finance.data.datasets[0].data = values;
    state.charts.finance.update();
    return;
  }

  state.charts.finance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [
        {
          data: values,
          backgroundColor: ['#0f2856', '#17346d', '#f3c969', '#d9a441', '#2a9895', '#8f8f8f'],
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

const updateAttendanceDetailChart = () => {
  if (!elements.attendanceDetailChart) return;
  const records = [...state.attendance].slice(0, 8).reverse();
  const labels = records.map((r) => formatDate(r.eventDate));
  const present = records.map((r) => r.present || 0);
  const expected = records.map((r) => r.expected || 0);

  if (state.charts.attendanceDetail) {
    state.charts.attendanceDetail.data.labels = labels;
    state.charts.attendanceDetail.data.datasets[0].data = present;
    state.charts.attendanceDetail.data.datasets[1].data = expected;
    state.charts.attendanceDetail.update();
    return;
  }

  state.charts.attendanceDetail = new Chart(elements.attendanceDetailChart, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Present',
          data: present,
          borderColor: '#3e63f6',
          backgroundColor: 'rgba(62, 99, 246, 0.12)',
          tension: 0.4,
          fill: true,
          pointRadius: 4
        },
        {
          label: 'Expected',
          data: expected,
          borderColor: '#f6c66a',
          backgroundColor: 'rgba(246, 198, 106, 0.16)',
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

const getReportsFilteredAttendance = () => {
  const { start, end, event } = state.ui.reports;
  return state.attendance.filter((record) => {
    const date = record.eventDate?.toDate?.() || (record.eventDate ? new Date(record.eventDate) : null);
    if (start && date && date < start) return false;
    if (end && date && date > end) return false;
    if (event && record.eventName && record.eventName.toLowerCase() !== event.toLowerCase()) return false;
    return true;
  });
};

const getReportsFilteredFinance = () => {
  const { start, end } = state.ui.reports;
  return state.finance.filter((item) => {
    const date = item.date?.toDate?.() || (item.date ? new Date(item.date) : null);
    if (start && date && date < start) return false;
    if (end && date && date > end) return false;
    return true;
  });
};

const updateReportsCharts = () => {
  const attendanceData = getReportsFilteredAttendance();
  const financeData = getReportsFilteredFinance();

  if (elements.reportsAttendanceChart) {
    const labels = attendanceData.slice().reverse().map((r) => formatDate(r.eventDate));
    const present = attendanceData.slice().reverse().map((r) => r.present || 0);
    const expected = attendanceData.slice().reverse().map((r) => r.expected || 0);

    if (state.charts.reportsAttendance) {
      state.charts.reportsAttendance.data.labels = labels;
      state.charts.reportsAttendance.data.datasets[0].data = present;
      state.charts.reportsAttendance.data.datasets[1].data = expected;
      state.charts.reportsAttendance.update();
    } else {
      state.charts.reportsAttendance = new Chart(elements.reportsAttendanceChart, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Present',
              data: present,
              backgroundColor: 'rgba(62, 99, 246, 0.7)'
            },
            {
              label: 'Expected',
              data: expected,
              backgroundColor: 'rgba(246, 198, 106, 0.7)'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } },
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }
  }

  if (elements.reportsFinanceChart) {
    const categories = ['First Offering', 'Second Offering', 'Tithe', 'Seed Offering', 'Yellow Card', 'Other'];
    const values = categories.map((category) =>
      financeData.reduce((sum, item) => (item.category === category ? sum + (item.amountGHS || 0) : sum), 0)
    );

    if (state.charts.reportsFinance) {
      state.charts.reportsFinance.data.datasets[0].data = values;
      state.charts.reportsFinance.update();
    } else {
      state.charts.reportsFinance = new Chart(elements.reportsFinanceChart, {
        type: 'doughnut',
        data: {
          labels: categories,
          datasets: [
            {
              data: values,
              backgroundColor: ['#3e63f6', '#8365f5', '#f6c66a', '#32c5a3', '#1b39c6', '#7c86a0'],
              borderWidth: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }
  }

  renderReportsSummaries(attendanceData, financeData);
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
  if (!elements.financeSummaryReports) return;
  const monthTotal = sumFinanceForCurrentMonth();
  const topCategory = determineTopFinanceCategory();
  elements.financeSummaryReports.innerHTML = `
    <div class="d-flex flex-column gap-2">
      <div><strong>This month:</strong> ${formatCurrency(monthTotal)}</div>
      <div><strong>Largest category:</strong> ${topCategory.category} (${formatCurrency(topCategory.amount)})</div>
      <div><strong>Average per entry:</strong> ${formatCurrency(average(state.finance.map((f) => f.amountGHS || 0)))}</div>
    </div>
  `;
};

const renderReportsSummaries = (attendanceData, financeData) => {
  if (elements.attendanceSummaryReports) {
    const totalEvents = attendanceData.length;
    const avgPresent = average(attendanceData.map((r) => r.present || 0));
    const avgRate = attendanceData.length ? Math.round(average(attendanceData.map((record) => computeAttendanceRate(record)))) : 0;
    elements.attendanceSummaryReports.innerHTML = `
      <div class="d-flex flex-column gap-2">
        <div><strong>Filtered events:</strong> ${totalEvents}</div>
        <div><strong>Average attendance:</strong> ${avgPresent.toFixed(1)}</div>
        <div><strong>Average rate:</strong> ${avgRate}%</div>
      </div>
    `;
  }

  if (elements.financeSummaryReports) {
    const total = financeData.reduce((sum, item) => sum + (item.amountGHS || 0), 0);
    const avg = financeData.length ? total / financeData.length : 0;
    const topCategory = financeData.length
      ? financeData.reduce((acc, item) => {
          const key = item.category || 'Other';
          acc[key] = (acc[key] || 0) + (item.amountGHS || 0);
          return acc;
        }, {})
      : {};
    const topEntry = Object.entries(topCategory)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)[0] || { category: 'N/A', amount: 0 };

    elements.financeSummaryReports.innerHTML = `
      <div class="d-flex flex-column gap-2">
        <div><strong>Filtered total:</strong> ${formatCurrency(total)}</div>
        <div><strong>Average per entry:</strong> ${formatCurrency(avg)}</div>
        <div><strong>Top category:</strong> ${topEntry.category} (${formatCurrency(topEntry.amount)})</div>
      </div>
    `;
  }
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

const formatTime = (value) => {
  if (!value) return '-';
  if (value instanceof Date) {
    return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (value?.toDate) {
    const date = value.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return value;
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

  elements.sidebarThemeToggle?.addEventListener('click', async () => {
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setDashboardTheme(nextTheme);
    await savePreferences({ theme: nextTheme });
  });

  document.getElementById('notificationsBtn')?.addEventListener('click', () => {
    const offcanvas = bootstrap.Offcanvas.getOrCreateInstance('#notificationsPanel');
    offcanvas.show();
  });

  elements.headerCurrencySelect?.addEventListener('change', async (event) => {
    const value = event.target.value;
    state.currency.code = value;
    state.currency.symbol = resolveCurrencySymbol(value);
    if (elements.settingsCurrency) elements.settingsCurrency.value = value;
    if (elements.currencyChip) elements.currencyChip.textContent = `Currency: ${state.currency.symbol}`;
    updateStats();
    renderFinance();
    await savePreferences({ currency: value });
  });

  elements.memberFilter?.addEventListener('change', renderMembers);
  elements.memberStatusFilter?.addEventListener('change', renderMembers);
  document.getElementById('memberSearch')?.addEventListener('input', renderMembers);

  elements.financeTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('.finance-tab');
    if (!button) return;
    event.preventDefault();
    elements.financeTabs.querySelectorAll('.finance-tab').forEach((tab) => tab.classList.remove('active'));
    button.classList.add('active');
    state.ui.financeCategory = button.getAttribute('data-category')?.toLowerCase() ?? '';
    renderFinance();
  });

  elements.financeSearch?.addEventListener('input', (event) => {
    state.ui.financeSearch = event.target.value;
    renderFinance();
  });

  elements.financeStatusFilter?.addEventListener('change', (event) => {
    state.ui.financeStatus = event.target.value;
    renderFinance();
  });

  elements.financeSelectAll?.addEventListener('change', (event) => {
    const checked = event.target.checked;
    document.querySelectorAll('.finance-row-select').forEach((checkbox) => {
      checkbox.checked = checked;
    });
  });

  elements.financeDeleteRows?.addEventListener('click', handleFinanceBulkDelete);
  elements.financeAutoTotal?.addEventListener('click', handleFinanceAutoTotal);

  elements.colorPalette?.addEventListener('click', async (event) => {
    const swatch = event.target.closest('.palette-swatch');
    if (!swatch) return;
    const accent = swatch.getAttribute('data-accent');
    applyAccent(accent);
    await savePreferences({ accent });
    showToast('Accent updated.');
  });

  elements.resetPreferences?.addEventListener('click', async () => {
    state.currency.code = 'GHS';
    state.currency.symbol = resolveCurrencySymbol('GHS');
    state.ui.financeCategory = '';
    state.ui.financeSearch = '';
    state.ui.financeStatus = '';
    if (elements.headerCurrencySelect) elements.headerCurrencySelect.value = 'GHS';
    if (elements.settingsCurrency) elements.settingsCurrency.value = 'GHS';
    if (elements.settingsTheme) elements.settingsTheme.value = 'light';
    if (elements.financeSearch) elements.financeSearch.value = '';
    if (elements.financeStatusFilter) elements.financeStatusFilter.value = '';
    if (elements.financeSelectAll) elements.financeSelectAll.checked = false;
    if (elements.financeTabs) {
      elements.financeTabs.querySelectorAll('.finance-tab').forEach((tab, index) => {
        tab.classList.toggle('active', index === 0);
      });
    }
    setDashboardTheme('light');
    applyAccent('blue');
    await savePreferences({ currency: 'GHS', theme: 'light', accent: 'blue' });
    updateStats();
    renderFinance();
    showToast('Preferences reset to default.');
  });

  elements.reportsStartDate?.addEventListener('change', (event) => {
    state.ui.reports.start = event.target.value ? new Date(event.target.value) : null;
    updateReportsCharts();
  });

  elements.reportsEndDate?.addEventListener('change', (event) => {
    const value = event.target.value;
    state.ui.reports.end = value ? new Date(`${value}T23:59:59`) : null;
    updateReportsCharts();
  });

  elements.reportsEventFilter?.addEventListener('change', (event) => {
    state.ui.reports.event = event.target.value;
    updateReportsCharts();
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
    await savePreferences({ currency, theme });
    setDashboardTheme(theme);
    state.currency.code = currency;
    state.currency.symbol = resolveCurrencySymbol(currency);
    updateStats();
    renderFinance();
    if (elements.currencyChip) {
      elements.currencyChip.textContent = `Currency: ${state.currency.symbol}`;
    }
    if (elements.headerCurrencySelect) {
      elements.headerCurrencySelect.value = currency;
    }
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

const getSelectedFinanceIds = () => Array.from(document.querySelectorAll('.finance-row-select:checked')).map((input) => input.getAttribute('data-id'));

const handleFinanceBulkDelete = async () => {
  const ids = getSelectedFinanceIds();
  if (!ids.length) {
    showToast('Select at least one finance row.', 'warning');
    return;
  }
  if (!confirm(`Submit deletion requests for ${ids.length} finance record(s)?`)) return;
  for (const id of ids) {
    const record = state.finance.find((item) => item.id === id);
    if (record) {
      await createEditRequest({ entity: 'finance', action: 'delete', recordId: record.id, payload: null });
    }
  }
  showToast('Deletion requests submitted.', 'info');
};

const handleFinanceAutoTotal = () => {
  const ids = getSelectedFinanceIds();
  const source = ids.length ? state.finance.filter((item) => ids.includes(item.id)) : getVisibleFinanceRecords();
  if (!source.length) {
    showToast('No finance records selected.', 'info');
    return;
  }
  const total = source.reduce((sum, item) => sum + (item.amountGHS || 0), 0);
  showToast(`Calculated total: ${formatCurrency(total)}`, 'info');
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
      document.getElementById('financeContributor').value = record.contributor || '';
      document.getElementById('financeDate').value = toInputDate(record.date);
      document.getElementById('financeCategory').value = record.category || '';
      document.getElementById('financeAmount').value = record.amountGHS || '';
      document.getElementById('financeNotes').value = record.notes || '';
      document.getElementById('financeTime').value = record.recordedTime || '';
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
    notes: document.getElementById('memberNotes').value.trim(),
    photoUrl: document.getElementById('memberPhoto').value.trim()
  };

  if (!basePayload.fullName) {
    showToast('Member name is required.', 'danger');
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance('#memberModal');
  modal.hide();

  const payload = {
    ...basePayload,
    contributor: basePayload.contributor || null,
    recordedTime: basePayload.recordedTime || null
  };

  if (id) {
    await createEditRequest({ entity: 'members', action: 'update', recordId: id, payload });
    showToast('Edit request submitted for approval.', 'info');
  } else {
    await addRecord('members', payload);
    showToast('Member added and locked.', 'success');
  }
  document.getElementById('memberForm').reset();
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
    amountGHS: Number.isFinite(amount) ? amount : 0,
    contributor: document.getElementById('financeContributor').value.trim(),
    recordedTime: document.getElementById('financeTime').value
  };

  if (!basePayload.date || !basePayload.category) {
    showToast('Date and category are required.', 'danger');
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance('#financeModal');
  modal.hide();

  const payload = {
    ...basePayload,
    contributor: basePayload.contributor || null,
    recordedTime: basePayload.recordedTime || null
  };

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
  await updateDoc(churchRef, {
    'preferences.currency': updates.currency ?? state.church?.preferences?.currency ?? 'GHS',
    'preferences.theme': updates.theme ?? state.church?.preferences?.theme ?? 'light',
    'preferences.accent': updates.accent ?? state.church?.preferences?.accent ?? 'blue'
  });
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
        contributor: record['Name'] || record.contributor || null,
        recordedTime: record['Time'] || record.time || null,
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

