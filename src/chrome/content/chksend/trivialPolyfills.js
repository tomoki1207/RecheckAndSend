var nsPreferences = {
  copyUnicharPref: function (key, defVal) {
    if (!this.getService().prefHasUserValue(key))
      return defVal;
    return this.getService().getComplexValue(key, Components.interfaces.nsISupportsString).data;
  },

  getBoolPref: function (key, defVal) {
    if (!this.getService().prefHasUserValue(key))
      return defVal;
    return this.getService().getBoolPref(key);
  },

  getIntPref: function (key, defVal) {
    if (!this.getService().prefHasUserValue(key))
      return defVal;
    return this.getService().getIntPref(key);
  },

  setUnicharPref: function (key, value) {
    var str = Components.classes["@mozilla.org/supports-string;1"]
      .createInstance(Components.interfaces.nsISupportsString);
    str.data = value;
    this.getService().setComplexValue(key,
      Components.interfaces.nsISupportsString, str);
  },

  setBoolPref: function (key, value) {
    return this.getService().setBoolPref(key, value);
  },

  setIntPref: function (key, value) {
    return this.getService().setIntPref(key, value);
  },

  getService: function () {
    return Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  }
}
var gPromptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);