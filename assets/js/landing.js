const STORAGE_KEY = 'gracetrack:landing:theme';
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const toggleButton = document.getElementById('landingModeToggle');
const toggleIcon = toggleButton?.querySelector('i');
const toggleLabel = toggleButton?.querySelector('.toggle-label');

const getSavedTheme = () => localStorage.getItem(STORAGE_KEY) || (prefersDark ? 'dark' : 'light');

const applyLandingTheme = (mode) => {
  const theme = mode === 'dark' ? 'dark' : 'light';
  document.body.classList.toggle('dark-mode', theme === 'dark');
  if (toggleIcon) {
    toggleIcon.classList.remove('fa-moon', 'fa-sun');
    toggleIcon.classList.add(theme === 'dark' ? 'fa-sun' : 'fa-moon');
  }
  if (toggleLabel) {
    toggleLabel.textContent = theme === 'dark' ? 'Light' : 'Dark';
  }
  toggleButton?.setAttribute('aria-pressed', theme === 'dark');
  localStorage.setItem(STORAGE_KEY, theme);
};

const toggleTheme = () => {
  const isDark = document.body.classList.contains('dark-mode');
  applyLandingTheme(isDark ? 'light' : 'dark');
};

const initialiseScrollReveal = () => {
  const elements = document.querySelectorAll('.feature-card, .module-card, .hero-section .badge, .hero-section h1, .hero-section p, .hero-section .btn');
  elements.forEach((el) => el.classList.add('reveal-on-scroll'));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  elements.forEach((el) => observer.observe(el));
};

const initSmoothAnchors = () => {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const targetId = anchor.getAttribute('href')?.substring(1);
      const target = targetId ? document.getElementById(targetId) : null;
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.innerWidth < 992) {
          const collapse = bootstrap.Collapse.getInstance('#navbarNav');
          collapse?.hide();
        }
      }
    });
  });
};

const initLandingPage = () => {
  if (!document.body.classList.contains('landing-page')) {
    return;
  }

  applyLandingTheme(getSavedTheme());

  toggleButton?.addEventListener('click', toggleTheme);

  initialiseScrollReveal();
  initSmoothAnchors();
};

document.addEventListener('DOMContentLoaded', initLandingPage);
