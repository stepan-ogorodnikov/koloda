/* Applies last-used scheme/theme before CSS paint. Keep in sync with ui-preferences-cache.ts */
(function () {
  var KEY = "koloda-ui-prefs";
  var SURFACE = {
    "atom-one-light": "#fafafa",
    "atom-one-dark": "#282c34",
    "github-light": "#ffffff",
    "github-dark": "#0d1117",
  };

  try {
    var prefs = {};
    try {
      prefs = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {}

    var scheme = prefs.scheme || "system";
    var lightTheme = prefs.lightTheme || "github-light";
    var darkTheme = prefs.darkTheme || "github-dark";
    var motion = prefs.motion || "system";

    var isDark = scheme === "dark" || (scheme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    var root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(isDark ? "dark" : "light");
    root.dataset.lightTheme = lightTheme;
    root.dataset.darkTheme = darkTheme;
    root.style.colorScheme = isDark ? "dark" : "light";

    var themeId = isDark ? darkTheme : lightTheme;
    var surface = SURFACE[themeId] || (isDark ? "#0d1117" : "#ffffff");
    root.style.backgroundColor = surface;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var motionOn = reduceMotion ? motion === "on" : motion !== "off";
    root.classList.toggle("motion", motionOn);
  } catch {}
})();
