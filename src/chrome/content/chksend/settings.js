var gCASSet = null;

function onLoad() {
	gCASSet = new CASSetting();
	gCASSet.init();
}

//class CASSetting
function CASSetting()
{
	this.accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"].
							getService(Components.interfaces.nsIMsgAccountManager);
	this.elementIDs = [
		"CSUseDefault",
		"CSConfirm",
		"CSConfirmWOErr",
		"CSBlankCheckTo",
		"CSBlankCheckCc",
		"CSBlankCheckBcc",
		"CSBlankCheckReply",
		"CSBlankCheckNews",
		"CSBlankCheckFollow",
		"CSAttach",
		"CSAttachPopup",
		"CSAttachWords",
		"CSIgnoreQuote",
		"CSCheckSubject",
		"CSCheckBody",
		//"CSCheckSubjectOnly",
		"CSRegExp",
		"CSCaseSens",
		"CSCheckFileExt",
		"CSCheckAttachSize",
		"CSWord",
		"CSWordPopup",
		"CSCheckWords",
		"CSRegExpWord",
		"CSCaseSensWord",
		"CSIgnoreQuoteWord",
		"CSCheckSubjectWord",
		"CSCheckBodyWord",
		//"CSCheckSubjectOnlyWord",
		"CSCheckAddrWithWord",
		"CSShowAddrAny",
		"CSCheckAddressBySender",
		"CSCheckAddress",
		"CSSearchCriPopup",
		"CSAbPopup",
		"CSSearchDomain",
		"CSCheckTo",
		"CSCheckCc",
		"CSCheckBcc",
		"CSCheckReply",
		"CSCheckNews",
		"CSCheckFollow",
		"CSSenderMatchLevel",
		"CSAddrBookMatchLevel",
		"CSRecipNameMode",
		"CSRecipNameAlert",
		"CSRecipReplaceEvent"
	];

	try {
    	this.sAccountManagerDataSource = Components.classes["@mozilla.org/rdf/datasource;1?name=msgaccountmanager"].getService(Components.interfaces.nsIRDFDataSource);
    	this.sRDF = Components.classes['@mozilla.org/rdf/rdf-service;1'].getService(Components.interfaces.nsIRDFService);
    	this.sNameProperty = this.sRDF.GetResource("http://home.netscape.com/NC-rdf#Name?sort=true");
  	} catch(e) {
		dump("failed to get RDF\n");
  	}
}

CASSetting.prototype.init = function() {
	this.initAbMenulistPopup(document.getElementById("CSAbPopup"));
	var popup = document.getElementById("idListPopup");
	this.clearIdentityListPopup(popup);
	this.fillIdentityListPopup(popup);
	this.setInitialIdentity();
	this.applyPrefsToPanes();

	this.switchNoteForAttachQuery();
	this.switchNoteForWordQuery();
}

CASSetting.prototype.savePrefs = function() {
	var prefix = this.prefixForCurrentIdentitySettings();
	var length = this.elementIDs.length;
	for( var i = 0; i < length; i++ ) {
		var elementID = this.elementIDs[i];
		var element = document.getElementById(elementID);
		if (!element) break;
		var prefStr = prefix ? prefix+element.getAttribute("prefstring") : element.getAttribute("prefstring");
		var eltType = element.localName;
		if (eltType == "radiogroup")
		  nsPreferences.setIntPref(prefStr, parseInt(element.value));
		else if (eltType == "checkbox")
		  nsPreferences.setBoolPref(prefStr, element.checked);
		else if (eltType == "textbox")
		  nsPreferences.setUnicharPref(prefStr, element.value);
		else if (eltType == "menulist" && element.getAttribute("preftype") == "string") {
			nsPreferences.setUnicharPref(prefStr, element.value);
		}
		else if (eltType == "menulist")
		  nsPreferences.setIntPref(prefStr, element.selectedIndex);
		else if (eltType == "label")
		  nsPreferences.setUnicharPref(prefStr, element.getAttribute("skey"));
	}

	return true;
}

CASSetting.prototype.cancelPrefs = function()
{
	return true;
}

CASSetting.prototype.applyPrefsToPanes = function(prefPrefix)
{
	var prefix = prefPrefix ? prefPrefix : this.prefixForCurrentIdentitySettings();
	var length = this.elementIDs.length;
	for( var i = 0; i < length; i++ ) {
		var elementID = this.elementIDs[i];
		var element = document.getElementById(elementID);
		if (!element) break;
		var prefStr = prefix ? prefix+element.getAttribute("prefstring") : element.getAttribute("prefstring")
		var eltType = element.localName;
		if (eltType == "radiogroup") {
			var index = nsPreferences.getIntPref(prefStr, null);
			if (index == null) {
				index = parseInt(element.getAttribute("defaultpref"));
				nsPreferences.setIntPref(prefStr, index);
			}
			element.selectedItem = element.childNodes[index];
		} else if (eltType == "checkbox") {
			var checked = nsPreferences.getBoolPref(prefStr, null);
			if (checked == null) {
				if (elementID == "CSUseDefault" && !prefix) {
					checked = false;
				} else {
					checked = ( element.getAttribute("defaultpref") == "true" );
				}
				nsPreferences.setBoolPref(prefStr, checked);
			}
			element.checked = checked;
		} else if (eltType == "textbox") {
			var str = nsPreferences.copyUnicharPref(prefStr, null);
			if (str != null) element.setAttribute("value", str);
			else {
				element.setAttribute("value", element.getAttribute("defaultpref") );
				nsPreferences.setUnicharPref(prefStr, element.getAttribute("defaultpref") );
			}
		} else if (eltType == "menulist" && element.getAttribute("preftype") == "string") {
			var str = nsPreferences.copyUnicharPref(prefStr, null);
			if (str != null) {
				element.value = str;
			} else {
				var defVal = element.getAttribute("defaultpref");
				if (defVal) element.value = defVal;
				else element.selectedIndex = 1;
			}
		} else if (eltType == "menulist") {
			var index = nsPreferences.getIntPref(prefStr, null);
			if (index == null) {
				index = parseInt(element.getAttribute("defaultpref"));
				nsPreferences.setIntPref(prefStr, index);
			}
			element.selectedIndex = index;
		}
		this.setOptionDisabled(element);
	}
}

CASSetting.prototype.switchNoteForAttachQuery = function()
{
	var checked = document.getElementById("CSRegExp").checked;
	var note = document.getElementById("CSAttachNotice");
	note.collapsed = checked;
}

CASSetting.prototype.switchNoteForWordQuery = function()
{
	var checked = document.getElementById("CSRegExpWord").checked;
	var note = document.getElementById("CSWordNotice");
	note.collapsed = checked;
}

CASSetting.prototype.setOptionDisabled = function(target)
{
	switch (target.id) {
	  case "CSConfirm":
			if (target.checked)
		  	document.getElementById("CSConfirmWOErr").removeAttribute("disabled");
			else
		  	document.getElementById("CSConfirmWOErr").setAttribute("disabled", "true");
			break;
	  case "CSAttach":
			if (target.checked) {
				document.getElementById("CASSet:Attach").removeAttribute("disabled");
			} else {
				document.getElementById("CASSet:Attach").setAttribute("disabled", "true");
			}
			break;
	  case "CSWord":
			if (target.checked) {
				document.getElementById("CASSet:Word").removeAttribute("disabled");
			} else {
				document.getElementById("CASSet:Word").setAttribute("disabled", "true");
			}
			break;
	  case "CSShowAddrAny":
			var recElem = document.getElementById("CSCheckAddress");
			var sendElem = document.getElementById("CSCheckAddressBySender");
			if (target.checked) {
				sendElem.setAttribute("disabled", "true");
				document.getElementById("CASSet:Addr_Sender").setAttribute("disabled", "true");
				recElem.setAttribute("disabled", "true");
				document.getElementById("CSAbLaterLabel").setAttribute("disabled", "true");
				document.getElementById("CASSet:Addr_AB").setAttribute("disabled", "true");
			} else {
				sendElem.removeAttribute("disabled");
				document.getElementById("CASSet:Addr_Sender").removeAttribute("disabled");
				recElem.removeAttribute("disabled");
				document.getElementById("CSAbLaterLabel").removeAttribute("disabled");
				document.getElementById("CASSet:Addr_AB").removeAttribute("disabled");
				this.setOptionDisabled(sendElem);
				this.setOptionDisabled(recElem);
			}
			break;
	  case "CSCheckAddressBySender":
	    if (target.checked) {
				document.getElementById("CASSet:Addr_Sender").removeAttribute("disabled");
			} else {
				document.getElementById("CASSet:Addr_Sender").setAttribute("disabled", "true");
			}
			break;
	  case "CSCheckAddress":
			if (target.checked) {
				document.getElementById("CASSet:Addr_AB").removeAttribute("disabled");
			} else {
				document.getElementById("CASSet:Addr_AB").setAttribute("disabled", "true");
			}

			if (document.getElementById("CSCheckAddress").disabled) {
				document.getElementById("CSAbLaterLabel").setAttribute("disabled", "true");
			} else {
				document.getElementById("CSAbLaterLabel").removeAttribute("disabled");
			}
			break;
		case "CSRecipNameMode":
		/*
			if (target.value != 2) {
				document.getElementById("CSRecipNameAlert").removeAttribute("disabled");
				document.getElementById("CSRecipReplaceEvent").removeAttribute("disabled");
			} else {
				document.getElementById("CSRecipNameAlert").setAttribute("disabled", "true");
				document.getElementById("CSRecipReplaceEvent").setAttribute("disabled", "true");
			}
			*/
	  default:
			break;
	}
}

CASSetting.prototype.verifyTextBoxForNum = function(target)
{
	var num = parseInt(target.value);
	if (isNaN(num) || num < 0) target.value = "0";
	else target.value = num.toString();
}

CASSetting.prototype.fillIdentityListPopup = function(popup)
{
  var accounts = this.queryISupportsArray(this.accountManager.accounts, Components.interfaces.nsIMsgAccount);
  var me = this;
  var sortFunc = function(a, b) {
	return me.compareAccountSortOrder(a, b);
  }
  accounts.sort(sortFunc);

  for (var i in accounts) {
    var server = accounts[i].incomingServer;
    if (!server)
       continue;
    var identites = this.queryISupportsArray(accounts[i].identities, Components.interfaces.nsIMsgIdentity);
    for (var j in identites) {
      var identity = identites[j];
      var item = document.createElement("menuitem");
      item.className = "identity-popup-item";
      item.setAttribute("label", identity.identityName);
      item.setAttribute("value", identity.key);
      item.setAttribute("accountkey", accounts[i].key);
      item.setAttribute("accountname", " - " + server.prettyName);
      popup.appendChild(item);
    }
  }
}

CASSetting.prototype.clearIdentityListPopup = function(popup)
{
  if (popup) {
  	var children = popup.childNodes;
  	var num = children.length;
  	for (var i=num-1; i>0; i--) {
		popup.removeChild(children[i]);
  	}
  }
}

CASSetting.prototype.queryISupportsArray = function(supportsArray, iid) {
    var result = new Array;
    for (var i=0; i<supportsArray.length; i++) {
      result[i] = supportsArray.queryElementAt(i, iid);
    }
    return result;
}

CASSetting.prototype.compareAccountSortOrder = function(account1, account2)
{
  var sortValue1, sortValue2;
  try {
    var res1 = this.sRDF.GetResource(account1.incomingServer.serverURI);
    sortValue1 = this.sAccountManagerDataSource.GetTarget(res1, this.sNameProperty, true).QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
  }
  catch (ex) {
    dump("XXX ex ");
    if (account1 && account1.incomingServer && account1.incomingServer.serverURI)
      dump(account1.incomingServer.serverURI + ",");
    dump(ex + "\n");
    sortValue1 = "";
  }

  try {
    var res2 = this.sRDF.GetResource(account2.incomingServer.serverURI);
    sortValue2 = this.sAccountManagerDataSource.GetTarget(res2, this.sNameProperty, true).QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
  }
  catch (ex) {
    dump("XXX ex ");
    if (account2 && account2.incomingServer && account2.incomingServer.serverURI)
      dump(account2.incomingServer.serverURI + ",");
    dump(ex + "\n");
    sortValue2 = "";
  }

  if (sortValue1 < sortValue2)
    return -1;
  else if (sortValue1 > sortValue2)
    return 1;
  else
    return 0;
}

CASSetting.prototype.setInitialIdentity = function()
{
	var identityList = document.getElementById("idList");
	identityList.value = "default";
	this.onChangeId(identityList);
}

CASSetting.prototype.prefixForCurrentIdentitySettings = function()
{
	var id = document.getElementById("idList").getAttribute("value");
	if (!id || id == "default") return null;
	else return "mail.identity." + id + ".";
}

CASSetting.prototype.onChangeId = function(target)
{
	var id = target.selectedItem;
	if (!id) return;
	target.setAttribute("accountname", id.getAttribute("accountname"));
	target.setAttribute("accountkey", id.getAttribute("accountkey"));

	if (id.getAttribute("value") == "default") {
		document.getElementById("CSUseDefault").removeAttribute("checked");
		document.getElementById("CSUseDefault").setAttribute("disabled", "true");
	} else {
		document.getElementById("CSUseDefault").removeAttribute("disabled");
	}

	this.initPanesForId();
}

CASSetting.prototype.onPopupshowingForId = function()
{
	this.savePrefs();
}

CASSetting.prototype.initPanesForId = function(skipPrefsLoad)
{
	if (!skipPrefsLoad) this.applyPrefsToPanes();

	var useDefault = document.getElementById("CSUseDefault").getAttribute("checked") == "true";
	if (useDefault) {
		document.getElementById("CSPanes").setAttribute("collapsed", "true");
		document.getElementById("CSMsgForId").removeAttribute("collapsed");
	} else {
		document.getElementById("CSPanes").removeAttribute("collapsed");
		document.getElementById("CSMsgForId").setAttribute("collapsed", "true");
	}
}

CASSetting.prototype.initAbMenulistPopup = function(menulist)
{
	var abManager = Components.classes["@mozilla.org/abmanager;1"].
								getService(Components.interfaces.nsIAbManager);
	var enumerator = abManager.directories;
	if (enumerator) {
		while (enumerator.hasMoreElements()) {
			var addrbook = enumerator.getNext().QueryInterface(Components.interfaces.nsIAbDirectory);
			menulist.appendItem(addrbook.dirName, addrbook.URI);
		}
	}
}