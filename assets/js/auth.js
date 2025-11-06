import {
  auth,
  db
} from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  doc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const resetForm = document.getElementById('resetForm');
const errorAlert = document.getElementById('authError');
const successAlert = document.getElementById('authSuccess');
const rememberMe = document.getElementById('rememberMe');

const showAlert = (type, message) => {
  const target = type === 'error' ? errorAlert : successAlert;
  const other = type === 'error' ? successAlert : errorAlert;
  other.classList.add('d-none');
  other.textContent = '';
  target.textContent = message;
  target.classList.remove('d-none');
};

const clearAlerts = () => {
  [errorAlert, successAlert].forEach((alert) => {
    if (alert) {
      alert.classList.add('d-none');
      alert.textContent = '';
    }
  });
};

const setActiveTabFromHash = () => {
  const hash = window.location.hash.replace('#', '');
  const target = hash || 'login';
  const tabTrigger = document.querySelector(`[data-bs-target="#${target}"]`);
  if (tabTrigger) {
    const tab = new bootstrap.Tab(tabTrigger);
    tab.show();
  }
};

const toggleFormValidation = (form) => {
  if (!form) return false;
  const isValid = form.checkValidity();
  form.classList.add('was-validated');
  return isValid;
};

const buildChurchProfile = (user, { churchName, fullName }) => ({
  churchName,
  fullName,
  email: user.email,
  createdAt: serverTimestamp(),
  preferences: {
    currency: 'GHS',
    theme: 'light',
    conversions: {
      GHS: 1,
      USD: 0.082,
      GBP: 0.064,
      EUR: 0.076
    }
  },
  roles: {
    managerEmail: user.email,
    subManagerEmail: user.email,
    lastUpdated: serverTimestamp()
  }
});

const withPersistence = async () => {
  try {
    await setPersistence(auth, rememberMe?.checked ? browserLocalPersistence : browserSessionPersistence);
  } catch (error) {
    console.warn('GraceTrack: Could not set persistence', error);
  }
};

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlerts();
    if (!toggleFormValidation(loginForm)) return;

    const email = loginForm.loginEmail.value.trim();
    const password = loginForm.loginPassword.value.trim();

    try {
      await withPersistence();
      await signInWithEmailAndPassword(auth, email, password);
      showAlert('success', 'Login successful. Redirecting...');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 600);
    } catch (error) {
      showAlert('error', mapAuthError(error));
    }
  });
}

if (signupForm) {
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlerts();
    if (!toggleFormValidation(signupForm)) return;

    const password = signupForm.signupPassword.value.trim();
    const confirmPassword = signupForm.signupPasswordConfirm.value.trim();

    if (password !== confirmPassword) {
      showAlert('error', 'Passwords do not match.');
      return;
    }

    const fullName = signupForm.signupName.value.trim();
    const churchName = signupForm.churchName.value.trim();
    const email = signupForm.signupEmail.value.trim();

    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(user, { displayName: fullName });
      await setDoc(doc(db, 'churches', user.uid), buildChurchProfile(user, { fullName, churchName }));
      showAlert('success', 'Account created successfully. Redirecting to dashboard...');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 700);
    } catch (error) {
      showAlert('error', mapAuthError(error));
    }
  });
}

if (resetForm) {
  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlerts();
    if (!toggleFormValidation(resetForm)) return;

    const email = resetForm.resetEmail.value.trim();

    try {
      await sendPasswordResetEmail(auth, email);
      showAlert('success', 'Password reset email sent. Check your inbox.');
    } catch (error) {
      showAlert('error', mapAuthError(error));
    }
  });
}

document.querySelectorAll('[data-switch]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const target = event.currentTarget.getAttribute('data-switch');
    const tabTrigger = document.querySelector(`[data-bs-target="#${target}"]`);
    if (tabTrigger) {
      const tab = new bootstrap.Tab(tabTrigger);
      tab.show();
    }
  });
});

window.addEventListener('hashchange', setActiveTabFromHash);
setActiveTabFromHash();

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (window.location.pathname.endsWith('auth.html')) {
      window.location.href = 'dashboard.html';
    }
  }
});

function mapAuthError(error) {
  const { code, message } = error || {};
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address.';
    case 'auth/invalid-email':
      return 'Please provide a valid email address.';
    case 'auth/operation-not-allowed':
      return 'Email/password accounts are not enabled in Firebase.';
    case 'auth/weak-password':
      return 'Your password is too weak. Use at least 8 characters.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again later.';
    default:
      return message || 'Something went wrong. Please try again later.';
  }
}
