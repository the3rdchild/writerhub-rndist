import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '@/features/settings/settings-context'
export function ThemeScript() {
	const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(SETTINGS_STORAGE_KEY)});
    var theme = stored ? (JSON.parse(stored).theme || ${JSON.stringify(DEFAULT_SETTINGS.theme)}) : ${JSON.stringify(DEFAULT_SETTINGS.theme)};
    if (theme === 'system') {
      theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add(${JSON.stringify(DEFAULT_SETTINGS.theme)});
  }
})();`.trim()

	return <script dangerouslySetInnerHTML={{ __html: script }} />
}
