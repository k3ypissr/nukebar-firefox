/* K3ypissr NukeBar - small glues for the standalone tools the v2.9
   toolbar expected from other add-ons. */
var nukeBarTools = {
  _prefs: null,

  prefBranch: function () {
    if (!this._prefs) {
      this._prefs = Components.classes['@mozilla.org/preferences-service;1']
        .getService(Components.interfaces.nsIPrefBranch);
    }
    return this._prefs;
  },

  javascriptEnabled: function () {
    try {
      return this.prefBranch().getBoolPref('javascript.enabled');
    } catch (e) {
      return true;
    }
  },

  // Toggles the browser-wide javascript.enabled pref and repaints the button.
  toggleJavaScript: function (button) {
    var branch = this.prefBranch();
    var next;
    try {
      next = !branch.getBoolPref('javascript.enabled');
      branch.setBoolPref('javascript.enabled', next);
    } catch (e) {
      next = this.javascriptEnabled();
    }
    var target = button || document.getElementById('jsoff-statusbar');
    if (target) {
      target.image = next
        ? 'chrome://hackbar/skin/on-16.png'
        : 'chrome://hackbar/skin/off-16.png';
      target.tooltiptext = 'JavaScript is ' + (next ? 'on' : 'off') + ' - click to toggle';
    }
  }
};
