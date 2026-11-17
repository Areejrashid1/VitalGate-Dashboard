// Applied before the stylesheets paint, so a dark-theme user never sees a white flash.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem("vg_prefs") || "{}");
    var t = p.theme || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches && !localStorage.getItem("vg_prefs") ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "light");
  } catch (e) { document.documentElement.setAttribute("data-theme", "light"); }
})();
