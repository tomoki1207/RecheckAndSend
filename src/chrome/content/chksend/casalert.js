var gAlert = null;

function onLoad()
{
	var arguments = window.arguments[0];
	document.title = arguments.title;
	var desc = document.getElementById("CASAlertDesc");
	var text = document.createTextNode(arguments.desc);
	desc.appendChild(text);
	gAlert = new CASAlert(arguments);
	//moveToAlertPosition();
}

function CASAlert(arg)
{
	this.arg = arg;
	this.richlist = arg.richlist;
	if (this.richlist) {
		this.list = document.getElementById("CASAlertListRich");
		this.list.removeAttribute("collapsed");
		document.getElementById("CASAlertList").setAttribute("collapsed",true);
	} else {
		this.list = document.getElementById("CASAlertList");
		this.list.removeAttribute("collapsed");
		document.getElementById("CASAlertListRich").setAttribute("collapsed",true);
	}
	//this.doubleline = arg.doubleline;
	this.initList(arg.items);
	if (!arg.selbutton) {
		document.getElementById("CASButtonSelAll").setAttribute("collapsed",true);
		document.getElementById("CASButtonClrSel").setAttribute("collapsed",true);
	} else {
		document.getElementById("CASButtonSelAll").removeAttribute("collapsed");
		document.getElementById("CASButtonClrSel").removeAttribute("collapsed");
	}
}

CASAlert.prototype.onOK = function()
{
	var items;
	if (this.arg.checkbox) {
		items = this.getChecked(this.arg.getSelected);
	} else {
		items = this.getSelected(this.arg.getSelected);
	}
	this.arg.okCallback(items);
	this.arg.isOK = true;
	/*
	if (!this.arg.getSelected) this.list.invertSelection();
	this.arg.okCallback(this.list.selectedItems);
	this.arg.isOK = true;
	*/
}

CASAlert.prototype.onCancel = function()
{
	this.arg.isOK = false;
}


CASAlert.prototype.initList = function(items)
{
	if (!this.richlist) {
		this.list.setAttribute("seltype", this.arg.seltype);
		this.list.setAttribute("rows", this.arg.rows.toString());
	}

	var length = items.length;
	for (var i=0; i<length; i++){
		var item = items[i];
		var listitem;
		if (this.richlist) { //richlistbox
			listitem = document.createElement("richlistitem");
			listitem.appendChild(item.label);

			if (item.value){
				listitem.value = item.value;
			}
			this.list.appendChild(listitem);			
			if (item.checked) {
				var checkitem = document.getElementById(item.checkitem);
				checkitem.setAttribute("checked", "true");
				listitem.setAttribute("checkitem", item.checkitem);
			}
		} else { //listbox
			if (item.value){
				listitem = this.list.appendItem(item.label, item.value);
			} else {
				listitem = this.list.appendItem(item.label);
			}
			if (this.arg.checkbox) {
				listitem.setAttribute("type", "checkbox");
				if (item.checked)
					listitem.setAttribute("checked", "true");
			}
			listitem.setAttribute("crop", "end");
		}
		if (item.tip) {
			listitem.setAttribute("tooltiptext", item.tip);
		}
	}
}

CASAlert.prototype.checkAll = function(check)
{
	var cnt = this.list.getRowCount();
	for (var i=0; i<cnt; i++) {
		var item = this.richlist
							 ? document.getElementById(this.list.getItemAtIndex(i).getAttribute("checkitem"))
							 : this.list.getItemAtIndex(i);
		if (check) item.setAttribute("checked", "true");
		else item.removeAttribute("checked");
	}
	//this.list.selectAll();
}

CASAlert.prototype.clearSelection = function()
{
	this.list.clearSelection();
}

CASAlert.prototype.selectAll = function()
{
	if (!this.richlist) this.list.selectAll();
}

CASAlert.prototype.getChecked = function(checked)
{
	var ret = new Array();
	var cnt = this.list.getRowCount();
	for (var i=0; i<cnt; i++) {
		var item = this.list.getItemAtIndex(i);
		var checkitem = this.richlist
							 ? document.getElementById(item.getAttribute("checkitem"))
							 : item;
		var isChecked = checkitem.getAttribute("checked") == "true";
		if (isChecked == checked) ret.push(item);
	}
	
	return ret;
}

CASAlert.prototype.getSelected = function(selected)
{
	if (selected) {
		if (this.richlist) {
			return this.list.selectedItem;
		} else {
			return this.list.selectedItems;
		}
	}
	
	//get unselected items
	var ret = new Array();
	var cnt = this.list.getRowCount();
	for (var i=0; i<cnt; i++) {
		var item = this.list.getItemAtIndex(i);
		var isSelected = item.getAttribute("selected") == "true";
		if (!isSelected) ret.push(item);
	}

	return ret;
}