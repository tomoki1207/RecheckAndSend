var gCASMain = null;

var CASStateListener = {
  NotifyComposeFieldsReady: function() {
		if (!gCASMain) gCASMain = new CheckAndSend();
		gCASMain.preConfirm();
  },

  NotifyComposeBodyReady: function() {},
  
  ComposeProcessDone: function(aResult) {
  },

  SaveInFolderDone: function(folderURI) {	
  }
};

var CASSetupper = {
	initCAS: function() {
		if (gMsgCompose) gMsgCompose.RegisterStateListener(CASStateListener);
		document.getElementById("msgcomposeWindow").addEventListener("compose-window-reopen", CASSetupper.initCAS, false);
	},
	
	finalizeCAS: function() {
		if (gCASMain) {
			gCASMain.finalize();
			gCASMain = null;
		}
	}
}
window.addEventListener("load", CASSetupper.initCAS, false);
//document.getElementById("msgcomposeWindow").addEventListener("compose-window-reopen", CASSetupper.initCAS, false);
window.addEventListener("close", CASSetupper.finalizeCAS, false);

//Override original functions
var SendMessageOrg = SendMessage;
var SendMessage = function()
{
	if (!gCASMain) gCASMain = new CheckAndSend();
	if (!gCASMain.confirmSend()) return;
	SendMessageOrg.apply(this, arguments);
}
var SendMessageWithCheckOrg = SendMessageWithCheck;
var SendMessageWithCheck = function() //Ctrl-Enter
{
	if (!gCASMain) gCASMain = new CheckAndSend();
	if (!gCASMain.confirmSend()) return;
	SendMessageWithCheckOrg.apply(this, arguments);
}

var SendMessageLaterOrg = SendMessageLater;
var SendMessageLater = function()
{
	if (!gCASMain) gCASMain = new CheckAndSend();
	if (!gCASMain.confirmSend()) return;
	SendMessageLaterOrg.apply(this, arguments);
}


//Class CheckAndSend
function CheckAndSend()
{
	this.highlighter = new CASHighlighter();
	this.showCASMessage = false;
	this.note = document.getElementById("CASNotification");
	var me = this;
	this.clearAllHighlightsWrapper = function(event) {
		me.clearAllHighlights(event);
	}
	this.note.addEventListener("DOMNodeRemoved", this.clearAllHighlightsWrapper, true);
	this.prefWrapper = null;
	this.addrChecker = null;
	this.localeBundle = document.getElementById("CSBundle");
	this.sComposeMsgsBundle = document.getElementById("bundle_composeMsgs");
}

CheckAndSend.prototype.finalize = function()
{
	try {
		this.note.removeEventListener("DOMNodeRemoved", this.clearAllHighlightsWrapper, true);
		this.note.removeAllNotifications(true);
	} catch(e) { //not TB2
	}
	
	this.clearAllHighlights(null);	
}

CheckAndSend.prototype.clearAllHighlights = function(event)
{
	var addrPrefix = "addressCol2#";
	var cnt=1;
	var addrCol = null;
	while (addrCol = document.getElementById(addrPrefix + cnt)) {
		document.getElementById(addrPrefix + cnt++).setAttribute("cas_highlighted","none");
	}
	this.highlighter.removeHighlighting(null);
}

CheckAndSend.prototype.preConfirm = function()
{
	var identity = document.getElementById("msgIdentity").value;
	this.prefWrapper = new CASPrefWrapper(identity);
	var recipReplaceEvent = this.prefWrapper.getIntPref("chksend.recip_replace_event",1);
	if (recipReplaceEvent == 0 || recipReplaceEvent == 2) {
		this.addrChecker = new CASRecipientsChecker(this.prefWrapper);
		this.addrChecker.checkRecipientName();
	}
}

CheckAndSend.prototype.confirmSend = function()
{
	var identity = document.getElementById("msgIdentity").value;
	this.prefWrapper = new CASPrefWrapper(identity);
	
	var useNote = true; //true only for TB2
	try {
		this.note.removeAllNotifications(true);
	} catch(e) {
		useNote = false;
	}
	
	this.clearAllHighlights(null);
	this.showCASMessage = false;
	
	//check attachments
	if (this.prefWrapper.getBoolPref("chksend.check_attach", false) && !this.checkAttachments()) {
		if (useNote) this.showCASNotification();
		return false;
	}

	//check attachments extensions
	var ngExts = this.prefWrapper.copyUnicharPref("chksend.ng_extensions", "");
	if (ngExts && !this.checkAttachmentsExts(ngExts.split("|"))) {
		return false;
	}
	
	var limit = parseInt(this.prefWrapper.copyUnicharPref("chksend.attach_size_limit", "0"));
	if (limit > 0 && !this.checkAttachmentsSumSize(limit)) {
		return false;
	}
	
	//check words
	if (this.prefWrapper.getBoolPref("chksend.check_word", false) && !this.checkWords()) {
		if (useNote) this.showCASNotification();
		return false;
	}
	
	this.highlighter.removeHighlighting(null);

	this.addrChecker = new CASRecipientsChecker(this.prefWrapper);
	var recipReplaceEvent = this.prefWrapper.getIntPref("chksend.recip_replace_event",1);
	if (recipReplaceEvent == 1 || recipReplaceEvent == 2) {
		if (!this.addrChecker.checkRecipientName()) {
			return false;
		}
	}
	
	if (!this.addrChecker.checkRecipientType()) {
		//if (useNote) this.showCASNotification();
		return false;
	}
	this.showCASMessage = this.addrChecker.showCASMessage;
	
	//check recipients
	if (this.showCASMessage || !this.prefWrapper.getBoolPref("chksend.check_addrbook_with_word",false)){
		var bySender = this.prefWrapper.getBoolPref("chksend.check_address_by_sender", false);
		var byAddrBook = this.prefWrapper.getBoolPref("chksend.check_address", false);
		if (!this.addrChecker.checkAddress(bySender, byAddrBook)) {
			if (useNote) this.showCASNotification();
			return false;
		}
		this.showCASMessage = this.addrChecker.showCASMessage;
	}
	
	var ret = true;
	if (this.prefWrapper.getBoolPref("chksend.confirm_always",true)) {
		if (!this.prefWrapper.getBoolPref("chksend.confirm_always_woerr",false)) { //always confirm
			ret = this.confirmSendFinal();
		} else if (!this.showCASMessage) { //no error was found
			ret = this.confirmSendFinal();
		} else { //don't need send confirmation
			ret = true;
		}
	}

	return ret;
}

CheckAndSend.prototype.checkAttachments = function()
{
	var buttonPressed;
	var title = this.localeBundle.getString("chksend.attach_title");
	var termList = this.prefWrapper.copyUnicharPref("chksend.attach_words","");
	var regexp = this.prefWrapper.getBoolPref("chksend.regexp",false);
	var caseSensitive = this.prefWrapper.getBoolPref("chksend.case_sensitive",false);
	var ignoreQuote = this.prefWrapper.getBoolPref("chksend.ignore_quote",true);
	var checkSubject = this.prefWrapper.getBoolPref("chksend.check_subject",true);
	var subjectOnly = !this.prefWrapper.getBoolPref("chksend.check_body",true);
	//var subjectOnly = this.prefWrapper.getBoolPref("chksend.check_subject_only",false);
	var negate = this.prefWrapper.copyUnicharPref("chksend.check_attach_appear","appear") != "appear";

	if (!this.hasAttachments()) {
		var hitWords = this.highlighter.highlightMessage(
			termList, checkSubject, ignoreQuote, true, regexp, caseSensitive, subjectOnly, negate);
		if (!negate) {
			var message = this.localeBundle.getString("chksend.attach_alert");
			if (!this.showAlertForWords(hitWords, title, message)) return false;
		} else if (regexp) {
			if (hitWords.length != 0) {
				//hitWords.push(termList);
				var message = this.localeBundle.getString("chksend.attach_alert_neg");
				if (!this.showAlertForWords(hitWords, title, message)) return false;
			}
		} else {
			//this.highlighter.removeHighlighting(null);
			var message = this.localeBundle.getString("chksend.attach_alert_neg");
			if (!this.showAlertForWords(hitWords, title, message)) return false;
		}
	}
	
	return true;
}

CheckAndSend.prototype.checkAttachmentsExts = function(exts)
{
	var listbox = document.getElementById("attachmentBucket");
 	var extsNum = exts.length;
 	for (var i=0; i<extsNum; i++) {
 		var ext = exts[i].replace(/\s/g,"");
 		ext = ext.replace(/^\*/,"");
 		ext = ext.replace(/^\./,"");
 		ext = ext.replace(/\./g,"\.");
 		exts[i] = new RegExp(ext+"$","");
 	}
 	var ngAttachments = new Array();
 	var attachNum = 0;
 	if (listbox) attachNum = listbox.getRowCount();
 	for (var i=0; i<attachNum; i++) {
 		var item = listbox.getItemAtIndex(i);
 		var name = item.label;
 		for (var j=0; j<extsNum; j++) {
	 		if (exts[j].test(name)) {
	 			ngAttachments.push(item.label);
	 			break;
	 		}
 		}

 		//var ext = item.label.split(".").pop();
 		//if (exts.indexOf(ext) >= 0) ngAttachments.push(item.label);
 	}
 	if (ngAttachments.length > 0) {
 		var title = this.localeBundle.getString("chksend.attach_ext_title");
 		var message = this.localeBundle.getString("chksend.attach_ext_alert");
 		return this.showAlertForWords(ngAttachments, title, message);
 	}
	return true;
}

CheckAndSend.prototype.checkAttachmentsSumSize = function(limit)
{
	var bucket = document.getElementById('attachmentBucket');
	var rowCount = bucket.getRowCount();
	var sumSize = 0;
  for (var i = 0; i < rowCount; i++) {
    var attachment = bucket.getItemAtIndex(i).attachment;
    if (attachment) {
    	var url = attachment.url;
    	var ios = Components.classes["@mozilla.org/network/io-service;1"]
                    .getService(Components.interfaces.nsIIOService);
			var fileHandler = ios.getProtocolHandler("file")
                     .QueryInterface(Components.interfaces.nsIFileProtocolHandler);
			var file = fileHandler.getFileFromURLSpec(url);
	  	sumSize += file.fileSize;
    }
  }
  sumSize = parseInt(sumSize / 1024); //KB order
  if (sumSize > limit) return this.showAlertForAttachmentsSize(sumSize);
  else return true;
}

CheckAndSend.prototype.checkWords = function()
{
	var buttonPressed;
	var title = this.localeBundle.getString("chksend.word_title");
	var termList = this.prefWrapper.copyUnicharPref("chksend.check_words","");
	var regexp = this.prefWrapper.getBoolPref("chksend.regexp_word",false);
	var caseSensitive = this.prefWrapper.getBoolPref("chksend.case_sensitive_word",false);
	var ignoreQuote = this.prefWrapper.getBoolPref("chksend.ignore_quote_word",true);
	var checkSubject = this.prefWrapper.getBoolPref("chksend.check_subject_word",true);
	var subjectOnly = !this.prefWrapper.getBoolPref("chksend.check_body_word",true);
	//var subjectOnly = this.prefWrapper.getBoolPref("chksend.check_subject_only_word",false);
	var negate = this.prefWrapper.copyUnicharPref("chksend.check_word_appear","appear") != "appear";

	var hitWords = this.highlighter.highlightMessage(
		termList, checkSubject, ignoreQuote, true, regexp, caseSensitive, subjectOnly, negate);

	if (!negate) {
		var message = this.localeBundle.getString("chksend.word_alert");
		if (!this.showAlertForWords(hitWords, title, message)) return false;
	} else if (regexp) { //negate && regexp
		if (hitWords.length != 0) {
			//hitWords.push(termList);
			var message = this.localeBundle.getString("chksend.word_alert_neg");
			if (!this.showAlertForWords(hitWords, title, message)) return false;
		}
	} else { //negate
		//this.highlighter.removeHighlighting(null);
		var message = this.localeBundle.getString("chksend.word_alert_neg");		
		if (!this.showAlertForWords(hitWords, title, message)) return false;
	}
	return true;
}

CheckAndSend.prototype.showAlertForAttachmentsSize = function(size)
{
	this.showCASMessage = true;
	var checkValue = {value:false};
	var title = this.localeBundle.getString("chksend.attach_size_title");
	var message = this.localeBundle.getString("chksend.attach_size_alert");
	message = message.replace("%d", size);
	var buttonPressed = gPromptService.confirmEx(window, 
              title, 
              message,
              (gPromptService.BUTTON_TITLE_OK * gPromptService.BUTTON_POS_0) +
              (gPromptService.BUTTON_TITLE_CANCEL * gPromptService.BUTTON_POS_1),
              null,
              null, null,
              null, checkValue);
	if (buttonPressed != 0) {
		return false;
	}

	return true;
}

CheckAndSend.prototype.showAlertForWords = function(hitWords, title, message)
{
	var length = hitWords.length;
	if (length > 0) {
		this.showCASMessage = true;
		var items = new Array();
		for (var i=0; i<length; i++) {
			items.push({label: hitWords[i], value: null, checked: true});
		}
		var okFunc = function(items){};
		var callback = {isOK: false,
						getSelected: true,
						title: title,
						desc: message,
						items: items,
						rows: 10,
						seltype: "single",
						checkbox: false,
						okCallback: okFunc,
						selbutton: false
						};
		window.openDialog("chrome://chksend/content/casalert.xul", "chksend-casalert", "chrome,modal,dialog,centerscreen", callback);
		return callback.isOK;
	}
	
	return true;
}

CheckAndSend.prototype.confirmSendFinal = function()
{
	var checkValue = {value:false};
	var buttonPressed;
	var buttonPressed = gPromptService.confirmEx(window, 
              this.sComposeMsgsBundle.getString('sendMessageCheckWindowTitle'), 
              this.sComposeMsgsBundle.getString('sendMessageCheckLabel'),
              (gPromptService.BUTTON_TITLE_IS_STRING * gPromptService.BUTTON_POS_0) +
              (gPromptService.BUTTON_TITLE_CANCEL * gPromptService.BUTTON_POS_1),
              this.sComposeMsgsBundle.getString('sendMessageCheckSendButtonLabel'),
              null, null,
              null, checkValue);
	if (buttonPressed != 0) {
		return false;
	}

	return true;
}

CheckAndSend.prototype.showCASNotification = function()
{
	var str = this.localeBundle.getString("chksend.note");
	this.note.appendNotification(str,str,
							"chrome://chksend/skin/question.png",
							this.note.PRIORITY_WARNING_LOW,
							null).hideclose = false;
}

CheckAndSend.prototype.hasAttachments = function()
{
 	var listbox = document.getElementById("attachmentBucket");
 	var num = 0;
 	if (listbox) num = listbox.getRowCount();
	return num > 0;
}

//Class CASRecipientsChecker
function CASRecipientsChecker(prefWrapper)
{
	//this.addrBook = Components.classes["@mozilla.org/addressbook;1"]
  //                		.createInstance(Components.interfaces.nsIAddressBook);
	this.addrBook = Components.classes["@mozilla.org/abmanager;1"]
                          .getService(Components.interfaces.nsIAbManager);
	this.hdrParser = Components.classes["@mozilla.org/messenger/headerparser;1"]
						.getService(Components.interfaces.nsIMsgHeaderParser);
	this.accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"]
						.getService(Components.interfaces.nsIMsgAccountManager);
	  
	this.checkList = null;
	this.addrTypeList = null;
	this.typePrefix = "addressCol1#";
	this.addrPrefix = "addressCol2#";
	this.prefWrapper = prefWrapper;
	this.RDFService = Components.classes["@mozilla.org/rdf/rdf-service;1"].
					getService(Components.interfaces.nsIRDFService);
	this.localeBundle = document.getElementById("CSBundle");
	this.showCASMessage = false;
	this.makeAddrCheckList();
	this.sComposeMsgsBundle = document.getElementById("bundle_composeMsgs");
}

CASRecipientsChecker.prototype.makeAddrCheckList = function()
{
	this.checkList = new Array();
	this.addrTypeList = new Array();
	this.addrTypeList["addr_to"] = 0;
	this.addrTypeList["addr_cc"] = 0;
	this.addrTypeList["addr_bcc"] = 0;
	this.addrTypeList["addr_reply"] = 0;
	this.addrTypeList["addr_newsgroups"] = 0;
	this.addrTypeList["addr_followup"] = 0;
	
	var cnt=1;
	var addrCol =  null;
	while (addrCol = document.getElementById(this.addrPrefix + cnt)) {
		var type = document.getElementById(this.typePrefix + cnt).value;
		var prefString = null;
		switch (type) {
		  case "addr_to":
			prefString = "chksend.check_addrbook_to";
			break;
		  case "addr_cc":
			prefString = "chksend.check_addrbook_cc";
			break;
		  case "addr_bcc":
			prefString = "chksend.check_addrbook_bcc";
			break;
		  case "addr_reply":
			prefString = "chksend.check_addrbook_reply";
			break;
		  case "addr_newsgroups":
			prefString = "chksend.check_addrbook_news";
			break;
		  case "addr_followup":
			prefString = "chksend.check_addrbook_follow";
			break;
		  default:
			prefString = null;
		}
		
		cnt++;
		if (prefString) {
			var addr = addrCol.value;
			if (addr == "") continue;
			//-1: don't need check 0: no error 1: found in address book
			//2: differ from the sender's domain
			var val = this.prefWrapper.getBoolPref(prefString, true) ? 0 : -1;
			var addresses = {};
			var names = {};
			var fullNames = {};
			var count = 0;
			var reformattedAddrs = "";
			try {
				reformattedAddrs = this.hdrParser.reformatUnquotedAddresses(addr);
			} catch(e) {
				reformattedAddrs = addr;
			}
			this.hdrParser.parseHeadersWithArray(addr, addresses, names, fullNames, count);
			//this.hdrParser.parseHeadersWithArray(addr, addresses, names, fullNames);
			for (var i=0; i<addresses.value.length; i++) {
				if (addresses.value[i]) {
					var addrVal = addresses.value[i];
					/*
					 * maillist will be the following format
					 * maillist name <description>
					 * so, maillist is stored in the names object
					 */
					if (names.value[i] && this.addrBook.mailListNameExists(names.value[i])) {
						addrVal = names.value[i];
					}

					this.addrTypeList[type]++;
					this.checkList[addrVal+":"+this.addrPrefix+(cnt-1)] = val;
					//this.checkList[addresses.value[i]+":"+this.addrPrefix+(cnt-1)] = val;
				}
			}
		}
	}
}

CASRecipientsChecker.prototype.checkAddress = function(bySender, byAddrBook)
{
	//clear the highlights
	for (var key in this.checkList) {
		document.getElementById(key.split(":")[1]).setAttribute("cas_highlighted","none");
	}
	this.showCASMessage = false;
	
	var noCheck = this.prefWrapper.getBoolPref("chksend.check_addrbook_any",false);
	if (!noCheck && bySender) {
		this.checkAddressBySenderDomain();
	}
	
	var uri = this.prefWrapper.copyUnicharPref("chksend.check_addrbook","");
	if (!noCheck && byAddrBook && uri != "") {
		if (uri == "all") {
			var rootDir;
			var subDirs;
			try {
				//rootDir = this.RDFService.GetResource("moz-abdirectory://").
				//  QueryInterface(Components.interfaces.nsIAbDirectory);
				rootDir = this.addrBook.getDirectory("moz-abdirectory://");
				subDirs = rootDir.childNodes.
				  QueryInterface(Components.interfaces.nsISimpleEnumerator);
			} catch(e) {
				//could not get address books
				return true;
			}

			while (subDirs.hasMoreElements()) {
				try {
					//var dir = subDirs.getNext().
				  //	QueryInterface(Components.interfaces.nsIAbMDBDirectory);
					//uri = dir.getDirUri();
					var dir = subDirs.getNext().
				  	QueryInterface(Components.interfaces.nsIAbDirectory);
					uri = dir.URI;
					this.checkAddressByAddressBook(uri);
				} catch(e) {
					dump("CAS: Invaild address book\n"+e+"\n");
				}
			}
		} else {
			this.checkAddressByAddressBook(uri);
		}
	}
	
	var inbook = this.prefWrapper.copyUnicharPref("chksend.check_addrbook_inbook","");
	var cri = inbook == "found" ? 1 : 0;
	var foundAddrs = new Array();
	var addedAddrColId = new Array();
	for (var key in this.checkList) {
		var highlightColor = null;
		if (bySender && this.checkList[key] == 2) highlightColor = "blue";
		else if (byAddrBook && this.checkList[key] == cri) highlightColor = "red";
		else if (noCheck && this.checkList[key] == 0) highlightColor ="none";
		
		var addrItem = document.getElementById(key.split(":")[1]);
		addrItem.setAttribute("cas_highlighted", highlightColor);

		if (highlightColor) {
			var addrItem = document.getElementById(key.split(":")[1]);
			var addrColId = key.split(":")[1];
			if (addedAddrColId.indexOf(addrColId) >= 0) continue;
			else addedAddrColId.push(addrColId);
			var rowNo = addrColId.split("#")[1];
			var addrTypeName = 
				document.getElementById(this.typePrefix+rowNo).getAttribute("label");
			foundAddrs.push(
				{label: addrTypeName + " " + addrItem.value, 
				value: addrColId,
				checked: true});
				//type: addrTypeName});
			addrItem.setAttribute("cas_highlighted", highlightColor);
		}
	}

	var title = this.localeBundle.getString("chksend.addr_title");
	var message = this.localeBundle.getString("chksend.addr_alert");
	//var message = "Are you sure you want to send this message to the following recipients? Check addresses you want to send and press OK in order to continue sending.";

	var okFunc = function(items) {
		if (!items) return;
		var length = items.length;
		for (var i=0; i<length; i++) {
			var addrItem = items[i];
			if (addrItem) {
				document.getElementById(addrItem.value).value = "";
			}
		}
	}
	if (foundAddrs.length > 0) {
		this.showCASMessage = true;
		var callback = {isOK: false,
						getSelected: false,
						title: title,
						desc: message,
						items: foundAddrs,
						rows: 10,
						checkbox: true,
						//seltype: "multiple",
						seltype: "single",
						okCallback: okFunc,
						selbutton: true
						};
		window.openDialog("chrome://chksend/content/casalert.xul", "chksend-casalert", "chrome,modal,dialog,centerscreen", callback);
		if (!callback.isOK) return false;
	}
	
	for (var key in this.checkList) {
		document.getElementById(key.split(":")[1]).setAttribute("cas_highlighted","none");
	}
	
	return true;
}

CASRecipientsChecker.prototype.checkRecipientType = function()
{
	this.showCASMessage = false;
	var blankAddrTypes = new Array();
	var key;
	for (key in this.addrTypeList) {
		if (this.prefWrapper.getBoolPref("chksend.bcheck-"+key, false) 
		    && this.addrTypeList[key] == 0)
    		blankAddrTypes.push(this.localeBundle.getString("chksend."+key));
	}

	if (blankAddrTypes.length > 0) {
		this.showCASMessage = true;
		var alertStr = blankAddrTypes.join(", ");
		var checkValue = {value:false};
		var buttonPressed = gPromptService.confirmEx(window, 
              this.localeBundle.getString('chksend.addr_type_title'), 
              alertStr + " " + this.localeBundle.getString('chksend.addr_type_msg1'),
              (gPromptService.BUTTON_TITLE_IS_STRING * gPromptService.BUTTON_POS_0) +
              (gPromptService.BUTTON_TITLE_CANCEL * gPromptService.BUTTON_POS_1),
              this.sComposeMsgsBundle.getString('sendMessageCheckSendButtonLabel'),
              null, null,
              null, checkValue);
		if (buttonPressed != 0) {
			return false;
		}
	}
	return true;
}

CASRecipientsChecker.prototype.checkAddressBySenderDomain = function()
{
	var senderIdKey = document.getElementById("msgIdentity").getAttribute("value");
	var senderId = this.accountManager.getIdentity(senderIdKey);
	var senderAddr = senderId.email;
	var levelPref = this.prefWrapper.copyUnicharPref("chksend.sender_match_level", "0");
	var senderDomain = senderAddr.split("@")[1];
	for (var key in this.checkList) {
		if (this.checkList[key] != 0) continue;
		var addr = key.split(":")[0];
		var domain = addr.split("@")[1];
//		if (domain != senderDomain) checkList[key] = 2;
		if (!domain) continue;
		if (!this.matchDomains(senderDomain, domain, levelPref)) this.checkList[key] = 2;
	}
}

CASRecipientsChecker.prototype.matchDomains = function(dom1, dom2, levelPref)
{
	if (!dom1 || !dom2) return false;
	
	dom1 = dom1.toLowerCase();
	dom2 = dom2.toLowerCase();
	var level = parseInt(levelPref);
	if (isNaN(level)) level = 0;
	var hiers1 = dom1.split(".");
	var hiers2 = dom2.split(".");
	level = hiers1.length < level ? hiers1.length : level;
	if (level == 0) {
		return dom1 == dom2;
	} else {
		if (hiers2.length < level) return false;
		var cmp1 = hiers1.slice(hiers1.length-level).join(".");
		var cmp2 = hiers2.slice(hiers2.length-level).join(".");
		return cmp1 == cmp2;
	}
}

CASRecipientsChecker.prototype.checkAddressByAddressBook = function(uri)
{
	var addrBookDir;
	try {
		//addrBookDir = this.RDFService.GetResource(uri).
		//  QueryInterface(Components.interfaces.nsIAbMDBDirectory);
		addrBookDir = this.addrBook.getDirectory(uri).
		  QueryInterface(Components.interfaces.nsIAbDirectory);
//		var db = addrBookDir.database;
	} catch(e) {
	}

	for (var key in this.checkList) {
		//already found in another address book or doesn't need to be check
		if (this.checkList[key] != 0) continue;
		
		var addr = key.split(":")[0];
		var found = false;
    if (this.addrBook.mailListNameExists(addr)) { //find mailing list
			addrBookDir = addrBookDir.QueryInterface(Components.interfaces.nsIAbDirectory);
			found = this.searchList(addrBookDir, addr)        	
    } else if (this.prefWrapper.getBoolPref("chksend.check_addrbook_domain", false)) { //find domain
			addrBookDir = addrBookDir.QueryInterface(Components.interfaces.nsIAbDirectory);
			found = this.searchAddressByDomain(addrBookDir, addr.split("@")[1]);
		} else { //find address
			//toLowerCase is not needed because the following function ignores case
			//found = addrBookDir.hasCardForEmailAddress(addr);
			found = addrBookDir.cardForEmailAddress(addr);
		} 
		
		if (found) this.checkList[key] = 1;
	}
}

CASRecipientsChecker.prototype.searchList = function(dir, listName)
{
	var lists = dir.addressLists;
	/*
	for (var i=0; i<lists.Count(); i++) {
		var list = lists.QueryElementAt(i, Components.interfaces.nsIAbDirectory);
		if (listName == list.dirName) return true;
	}
	*/
	var count = lists.length;
	for (var i=0; i<count; i++) {
		//var list = lists.addressLists.queryElementAt(i, Components.interfaces.nsIAbDirectory)
		var list = lists.queryElementAt(i, Components.interfaces.nsIAbDirectory)
		if (listName == list.dirName) return true;
  }
  
	return false;
}

CASRecipientsChecker.prototype.searchAddressByDomain = function(dir, domain)
{
	var found = false;
	var cards = dir.childCards;
	var levelPref = this.prefWrapper.copyUnicharPref("chksend.addrbook_match_level", "0");
  while (cards.hasMoreElements()) {
	  var card = cards.getNext();
	  card.QueryInterface(Components.interfaces.nsIAbCard);
		if (!card.isMailList) {
			var addr = card.getProperty('PrimaryEmail', null);
//			if (domain == addr.split("@")[1]) {
			if (addr && this.matchDomains(domain, addr.split("@")[1], levelPref)) {
				return true;
			}

			addr = card.getProperty('SecondEmail', null);
//			if (domain == addr.split("@")[1]) {
			if (addr && this.matchDomains(domain, addr.split("@")[1], levelPref)) {
				return true;
			}
		}		
  }
  
	return false;
}

CASRecipientsChecker.prototype.checkRecipientName = function()
{
	var mode = this.prefWrapper.getIntPref("chksend.recip_name_mode", 2);
	if (mode !=0 && mode != 1) return true;

  var booksEnum = Components.classes["@mozilla.org/abmanager;1"].
                        getService(Components.interfaces.nsIAbManager).
                        directories;
	var books = new Array();
  while (booksEnum.hasMoreElements()) {
  	var ab = booksEnum.getNext()
                 .QueryInterface(Components.interfaces.nsIAbDirectory);
		var uri = ab.URI;
 	  if (uri.indexOf("history.mab") >= 0) continue;
 	  books.push(ab);
  }

	var cnt = 1;
	var addrCol = null;
	var addrList = new Array();
	while (addrCol = document.getElementById(this.addrPrefix + cnt)) {
		var addrType = document.getElementById(this.typePrefix + cnt);
		cnt++;
		var addr = addrCol.value;
		if (addr == "") continue;
		var correctedAddrs = null;
		if (mode == 0) correctedAddrs = this.correctRecipientNames(addr, books);
		else if (mode == 1) correctedAddrs = this.removeRecipientNames(addr);
		if (correctedAddrs) {
			var data = {
				type: addrType,
				col: addrCol,
				pre: addr,
				post: correctedAddrs
			};
			addrList.push(data);
		}
	}

	//no confirmation is required
	if (!this.prefWrapper.getBoolPref("chksend.recip_name_alert",true)) {
		for (var i=0; i<addrList.length; i++) {
			var data = addrList[i];
			if (data.pre != data.post) {
				data.col.value = data.post;
			}
		}
		return true;
	}
	
	//confirm
	var candidates = new Array();
//	var replace = false;
	for (var i=0; i<addrList.length; i++) {
		var data = addrList[i];
		if (data.pre != data.post) {
//			replace = true;
			//data.col.value = data.post;
			var listitem = document.createElement("vbox");
			var line1 = document.createElement("checkbox");
			line1.setAttribute("label", data.type.label + " " + data.pre);
			line1.setAttribute("crop", "end");
			line1.setAttribute("id", "checkitem"+i);
			var line2 = document.createElement("hbox");
			var spc2 = document.createElement("spacer");
			spc2.style.width = "2em";
			line2.appendChild(spc2);
			var text2 = document.createElement("label");
			text2.setAttribute("value", "=> " + data.post);
			text2.setAttribute("crop", "end");
			line2.appendChild(text2);
			listitem.appendChild(line1);			
			listitem.appendChild(line2);
			candidates.push(
					{label: listitem,
					//tip: data.type.label + " " + data.pre + "  =>  " + data.post, 
					value: data.col.getAttribute("id")+","+data.post,
					checkitem: "checkitem" + i,
					checked: true}
			);
		}
	}
	

	var title = this.localeBundle.getString("chksend.recname_title");
	var message = this.localeBundle.getString("chksend.recname_alert");
	//var message = "Recipient names will be replaced as followings. Check recipients you want to replace.";
	//var title = "Recipient Name Correction";

	var okFunc = function(items) {
		if (!items) return true;
		var length = items.length;
		for (var i=0; i<length; i++) {
			var addrItem = items[i];
			if (addrItem) {
				var colId = addrItem.value.split(",")[0];
				var val = addrItem.value.replace(colId+",", "");
				document.getElementById(colId).value = val;
			}
		}
	}

	if (candidates.length > 0) {
//	if (replace) {
		this.showCASMessage = true;
		var callback = {isOK: false,
						getSelected: true,
						title: title,
						desc: message,
						items: candidates,
						rows: 5,
						checkbox: true,
						seltype: "single",
						okCallback: okFunc,
						selbutton: true,
						doubleline: true,
						richlist: true
						};
		//window.openDialog("chrome://chksend/content/casalert.xul", "chksend-casalert", "chrome,modal,dialog,resizable,centerscreen", callback);
			window.openDialog("chrome://chksend/content/casalert.xul", "chksend-casalert", "chrome,modal,dialog,centerscreen", callback);
		if (!callback.isOK) return false;
	}
	
	return true;
}

CASRecipientsChecker.prototype.correctRecipientNames = function(addrs, addrbooks)
{
	var ret = "";
	var addresses = {};
	var names = {};
	var fullNames = {};
	var count = 0;
	var reformattedAddrs = "";
	try {
		reformattedAddrs = this.hdrParser.reformatUnquotedAddresses(addrs);
	} catch(e) {
		reformattedAddrs = addrs;
	}
	this.hdrParser.parseHeadersWithArray(reformattedAddrs, addresses, names, fullNames, count);
	//this.hdrParser.parseHeadersWithArray(addrs, addresses, names, fullNames);
	for (var i=0; i<addresses.value.length; i++) {
		var card = null;
		var addr = addresses.value[i];
		if (this.addrBook.mailListNameExists(addr)) break;
		for (var j=0; j<addrbooks.length; j++) {
	    var ab = addrbooks[j];
	    try {
	    	card = ab.cardForEmailAddress(addr);
	    } catch(e) {
	    	dump(e+"\n");
	    }
      if (card != null) break;
		}
		
		if (ret) ret += ", ";
		if (card) {
			var name = card.displayName;
			//ret += this.hdrParser.makeFullAddressWString(name, addr);
			ret += this.hdrParser.makeFullAddress(name, addr);
		} else if (fullNames[i]){
			ret += fullNames[i];
		} else {
			ret += addr;
		}
	}
	return ret;
}

CASRecipientsChecker.prototype.removeRecipientNames = function(addrs)
{
	var addresses = {};
	var names = {};
	var fullNames = {};
	var count = 0;
	var reformattedAddrs = "";
	try {
		reformattedAddrs = this.hdrParser.reformatUnquotedAddresses(addrs);
	} catch(e) {
		reformattedAddrs = addrs;
	}

	this.hdrParser.parseHeadersWithArray(reformattedAddrs, addresses, names, fullNames, count);
	//this.hdrParser.parseHeadersWithArray(addr, addresses, names, fullNames);
	
	var ret = new Array();
	for (var i=0; i<addresses.value.length; i++) {
		var addr = addresses.value[i];
		var unquotedAddr = addr.replace(/"|'/g,""); //remove " and '
		//if (this.addrBook.mailListNameExists(addr.replace(/"|'/g,""))) addr = addr + " <" + addr + ">";
		if (this.addrBook.mailListNameExists(unquotedAddr)) addr = unquotedAddr + " <" + addr + ">";
		ret.push(addr);
	}
	return ret.join(", ");
}

CASRecipientsChecker.prototype.dumpToJSConsole = function(msg)
{
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage(msg);
}

//Class CASHighlighter
function CASHighlighter()
{
	this.finder = Components.classes["@mozilla.org/embedcomp/rangefind;1"].createInstance().QueryInterface(Components.interfaces.nsIFind);
//	this.persist = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
//                        .createInstance(Components.interfaces.nsIWebBrowserPersist);
	// Colors for highlighting
	this.highlightColors = new Array("yellow", "lightpink", "aquamarine",
								 "darkgoldenrod", "darkseagreen", "lightgreen",
								 "rosybrown", "seagreen", "chocolate", "violet");
	var me = this;
	this.removeHighlightingWrapper = function(event) {
		me.removeHighlighting(event);
	}
	
	this.highlightedMessageText = false;
}

//returns errored words
CASHighlighter.prototype.highlightMessage = function(terms, checkSubject, ignoreQuote, removeExistingHighlighting, regexp, caseSensitive, subjectOnly, negate)
{
	// remove any existing highlighting
	if (removeExistingHighlighting) this.removeHighlighting();
	document.getElementById("content-frame").addEventListener("keypress",this.removeHighlightingWrapper,true);

	var hitWords = new Array();
	var subjectBox = document.getElementById("msgSubject");
	var subjectText = subjectBox.value;
	var termList;
	if (regexp) {
		var re;
		try {
			if (caseSensitive)
			  re = new CASRegExp(terms, "g");
			else
			  re = new CASRegExp(terms, "gi");
			termList = re.toFinderQueries(checkSubject, subjectOnly);
		} catch(e) {
			//illeagal regular expression
			termList = new Array();
		}
		
		if (termList.length == 0) {
			if (negate) termList.push(terms);
			return termList;
		}

	} else {
		termList = terms.split("|");
	}

	//remove duplicate elements by converting to Hash
	var uniqueTermList = new Array();
	for (var i =0; i < termList.length; i++) {
		var key = termList[i];
		if (!caseSensitive) key = key.toLowerCase();
		if (key != "") uniqueTermList[key] = 1;
	}
	var editor = GetCurrentEditor();
	editor.beginTransaction();
	var i=0;
	for (var key in uniqueTermList) {
		var hit = false;
		if (checkSubject) {
			if (!caseSensitive) subjectText = subjectText.toLowerCase();
			hit = subjectText.indexOf(key,0) != -1;
			if (hit && !negate) subjectBox.setAttribute("cas_highlighted", "red");
		}
		
		if (!subjectOnly) {
			hit = this.highlight(key, this.highlightColors[i%10], ignoreQuote, caseSensitive) || hit;
			i++;
		}

		if (hit && !negate) hitWords.push(key);
		else if (!hit && negate) hitWords.push(key);
	}

	editor.endTransaction();
	this.highlightedMessageText = true;
	
	return hitWords;
}

CASHighlighter.prototype.removeHighlighting = function(event)
{
	var subjectBox = document.getElementById("msgSubject").setAttribute("cas_highlighted", "none");
	if (!this.highlightedMessageText)
	  return;

	var msgDocument = window.top.content;
	var doc = msgDocument.document;
	var elem = null;
	var editor = GetCurrentEditor();
	editor.beginTransaction();
	while ((elem = doc.getElementById('composer-highlight-id'))) {
		  var child = null;
		  var docfrag = doc.createDocumentFragment();
		  var next = elem.nextSibling;
		  var parent = elem.parentNode;
		  while((child = elem.firstChild)) {
			  docfrag.appendChild(child);
		  }

		  parent.insertBefore(docfrag, next);
		  parent.removeChild(elem);
	}
	editor.endTransaction();
	this.highlightedMessageText = false;
	document.getElementById("content-frame").removeEventListener("keypress",this.removeHighlightingWrapper,true);

	return;
}

CASHighlighter.prototype.highlight = function(word, color, ignoreQuote, caseSensitive)
{
	var msgDocument = window.top.content;
	var doc = msgDocument.document;
	
	if (!doc)
	  return;

	if (!("body" in doc))
	  return;
	
	var body = doc.body;
	var textContent = body.textContent;

//	var count = body.childNodes.length;
	var sigPos = this.searchSignature(body.childNodes);
	var count = sigPos == -1 ? body.childNodes.length : sigPos;
	var searchRange = doc.createRange();
	var startPt = doc.createRange();
	var endPt = doc.createRange();

	var baseNode = doc.createElement("span");
	baseNode.setAttribute("style", "background-color: " + color + ";");
	baseNode.setAttribute("id", "composer-highlight-id");

	searchRange.setStart(body, 0);
	searchRange.setEnd(body, count);

	startPt.setStart(body, 0);
	startPt.setEnd(body, 0);
	endPt.setStart(body, count);
	endPt.setEnd(body, count);
	
	var ret = this.highlightText(word, baseNode, startPt, endPt, searchRange, ignoreQuote, caseSensitive);
	return ret;
}

CASHighlighter.prototype.searchSignature = function(nodes)
{
	var length = nodes.length-1;
	var i;
	for (var i=length; i>=0; i--) {
		var node = nodes[i];
		//HTML mode
		if (node.hasChildNodes()) {
			if (node.hasAttributes() && node.getAttribute("class") == "moz-signature") {
				return i;
			} else if (this.searchSignature(node.childNodes) != -1) {
				return i;
			}
		}
		
		//Text Mode
		try {
			var nodeText = node.nodeValue;
			if (nodeText && nodeText.match(/^\-\- $/)) {
				return i;
			}
		} catch (e) {
			return -1;
		}
	}
	
	return -1;
}

// search through the message looking for occurrences of word
// and highlighting them.
CASHighlighter.prototype.highlightText = function(word, baseNode, startPt, endPt, searchRange, ignoreQuote, caseSensitive)
{
	var retRange = null;
	var hit = false;

	this.finder.caseSensitive = caseSensitive;
	while((retRange = this.finder.Find(word, searchRange, startPt, endPt))) {
		// Highlight
	  var ignore = ignoreQuote && this.isQuotedText(retRange.startContainer);
		if (!ignore && !hit) hit = true;
		var nodeSurround = baseNode.cloneNode(true);
		var node = this.highlightRange(retRange, nodeSurround);
		startPt = node.ownerDocument.createRange();
		startPt.setStart(node, node.childNodes.length);
		startPt.setEnd(node, node.childNodes.length);
	}

	return hit;
}

CASHighlighter.prototype.highlightRange = function(range, node)
{
	var startContainer = range.startContainer;
	var startOffset = range.startOffset;
	var endOffset = range.endOffset;
	var docfrag = range.extractContents();
	var before = startContainer.splitText(startOffset);
	var parent = before.parentNode;

	node.appendChild(docfrag);
	parent.insertBefore(node, before);
	return node;
}

CASHighlighter.prototype.isQuotedText = function(node)
{
	var parent = node.parentNode;
	if(!parent) return false;
	var localName = parent.localName.toUpperCase();
	//if (parent.localName == "BODY") return false;
	if (localName == "BODY") return false;
	//if (parent.localName == "SPAN" || parent.localName == "BLOCKQUOTE") return true;
	if (localName == "SPAN" || localName == "BLOCKQUOTE") return true;

	return this.isQuotedText(parent);
}

//Class CASRegExp
function CASRegExp(terms, opts, flags)
{
	this.re = new RegExp(terms, opts);
	this.persist = Components.classes['@mozilla.org/embedding/browser/nsWebBrowserPersist;1']
					.createInstance(Components.interfaces.nsIWebBrowserPersist);
	if (flags) {
		this.flags = flags;
	} else {
		/*
	     *  for detail of the flags see
	     *  http://www.mozilla.org/editor/serializers.html
	     *  or
	     *  http://xulplanet.com/references/xpcomref/ifaces/nsIWebBrowserPersist.html
		*/
		this.flags = this.persist.ENCODE_FLAGS_FORMATTED      //2
	  				| this.persist.ENCODE_FLAGS_ENCODE_W3C_ENTITIES   //256
					| this.persist.ENCODE_FLAGS_NOSCRIPT_CONTENT    //2048
					| this.persist.ENCODE_FLAGS_NOFRAMES_CONTENT; //4096
	}

}

CASRegExp.prototype.toFinderQueries = function(checkSubject, subjectOnly)
{
	var subjectBox = document.getElementById("msgSubject");
	var subjectText = subjectBox.value;
	var termList = new Array();
	var editor = GetCurrentEditor();

	textContent = editor.outputToString("text/plain", this.flags);

	var ret = null;
	if (checkSubject && (ret = subjectText.match(this.re)))
	  termList = termList.concat(ret);
	if (!subjectOnly && (ret = textContent.match(this.re)))
	  termList = termList.concat(ret);

	return termList;
}

//class CASPrefWrapper
//get prefs for the specified identity
//return default Default pref if the identity use default
function CASPrefWrapper(identity)
{
	var tempPrefix = "mail.identity."+identity+".";
	var useDefault = nsPreferences.getBoolPref(tempPrefix+"chksend.use_default_pref", true);
	this.prefix = useDefault ? "" : tempPrefix;
}

CASPrefWrapper.prototype.getBoolPref = function(prefStr, defValue)
{
	var pref = nsPreferences.getBoolPref(this.prefix+prefStr, null);
	if (pref == null)
		pref = nsPreferences.getBoolPref(prefStr, defValue);
	return pref;
}

CASPrefWrapper.prototype.copyUnicharPref = function(prefStr, defValue)
{
	var pref = nsPreferences.copyUnicharPref(this.prefix+prefStr, null);
	if (pref == null)
		pref = nsPreferences.copyUnicharPref(prefStr, defValue);
	return pref;
}

CASPrefWrapper.prototype.getIntPref = function(prefStr, defValue)
{
	var pref = nsPreferences.getIntPref(this.prefix+prefStr, null);
	if (pref == null)
		pref = nsPreferences.getIntPref(prefStr, defValue);
	return pref;
}
