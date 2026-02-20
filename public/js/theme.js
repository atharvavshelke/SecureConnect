
// Theme handling logic

const themeKey = 'secureconnect-theme';

function getPreferredTheme() {
    const storedTheme = localStorage.getItem(themeKey);
    if (storedTheme) {
        return storedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        // Optional: Remove attribute if default is dark to keep DOM clean, 
        // but explicit attribute is safer for CSS selectors.
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem(themeKey, theme);
    updateThemeIcon(theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

function updateThemeIcon(theme) {
    const toggleBtn = document.getElementById('themeToggle');
    if (!toggleBtn) return;
    
    // Simple SVG swap or class toggle
    // Sun for light mode, Moon for dark mode
    if (theme === 'light') {
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
        toggleBtn.setAttribute('title', 'Switch to Dark Mode');
        toggleBtn.setAttribute('aria-label', 'Switch to Dark Mode');
    } else {
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
        toggleBtn.setAttribute('title', 'Switch to Light Mode');
        toggleBtn.setAttribute('aria-label', 'Switch to Light Mode');
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = getPreferredTheme();
    setTheme(savedTheme);
});

// Expose to window for inline onclick handlers if necessary
window.toggleTheme = toggleTheme;
