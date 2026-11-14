// Applies the saved light/dark choice before the page paints (no flash). Without a choice the system setting is used.
try { const t = localStorage.getItem('affilyatics-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (_) {}
