let CONFIG;

function createRadioMenu(title, callback, multiline, options, selected) {
	let elems = [];
	let children = [];

	options.forEach(v => {
		let elem = new_element(`input`, {
			value: v.value,
			type: `radio`
		});

		if (selected != null && v.value == selected) { elem.checked = true; }

		elems.push(elem);
		elem.addEventListener(`click`, _ => {
			elems.forEach(e => {
				e.checked = false;
			});
			elem.checked = true;
			callback(v.value);
		});

		let label = new_element(`label`, {}, [document.createTextNode(v.name)]);
		if (multiline) {
			children.push(new_element(`div`, {}, [elem, label]));
		} else {
			children.push(elem);
			children.push(label);
		}
	});


	children.unshift(document.createTextNode(title));

	return new_element(`div`, {}, children);
}

function createCheckbox(title, callback, value) {
	let checkbox = new_element(`input`, { type: `checkbox` });
	let label = new_element(`label`, {}, [document.createTextNode(title)]);

	checkbox.checked = value;
	checkbox.addEventListener(`click`, _ => callback(checkbox.checked));

	return new_element(`div`, {}, [checkbox, label]);
}

function updateSetting(k, v) {
	CONFIG[k] = v;
	browser.storage.local.set(CONFIG).then(_ => {
		browser.runtime.sendMessage({ recipient: -1, type: MSG_TYPE.ConfigUpdate });
	});
}

function createButton(value, callback) {
	let ret = new_element(`input`, { type: `button`, value });
	ret.addEventListener(`click`, callback);
	return ret;
}

async function init() {
	CONFIG = await browser.storage.local.get();

	let theme = createRadioMenu(browser.i18n.getMessage("optionsTheme"), v => {
		updateSetting(`theme`, v);
	}, true, [
		{name: browser.i18n.getMessage("optionsThemeDark"), value: ThemeOption.Dark},
		{name: browser.i18n.getMessage("optionsThemeLight"), value: ThemeOption.Light},
		{name: browser.i18n.getMessage("optionsThemeClassic"), value: ThemeOption.Classic},
		{name: browser.i18n.getMessage("optionsThemeNone"), value: ThemeOption.None}
	], CONFIG.theme);

	document.body.appendChild(theme);

	let openPos = createRadioMenu(browser.i18n.getMessage("optionsChildTabOpenPosition"), v => {
		updateSetting(`descendantOpenPosition`, v);
	}, true, [
		{name: browser.i18n.getMessage("optionsChildTabOpenPositionDefault"), value: DescendantOpenPosition.Default},
		{name: browser.i18n.getMessage("optionsChildTabOpenPositionFirst"), value: DescendantOpenPosition.First},
		{name: browser.i18n.getMessage("optionsChildTabOpenPositionLast"), value: DescendantOpenPosition.Last}
	], CONFIG.descendantOpenPosition);

	document.body.appendChild(openPos);

	let stayInTree = createCheckbox(browser.i18n.getMessage("optionsStayInTreeOnTabClose"),
		v => updateSetting(`stayInTreeOnTabClose`, v),
		CONFIG.stayInTreeOnTabClose
	);

	document.body.appendChild(stayInTree);

	let tabCloseButton = createCheckbox(browser.i18n.getMessage("showSidebarTabCloseButton"),
		v => updateSetting(`showTabCloseButton`, v),
		CONFIG.showTabCloseButton
	);

	document.body.appendChild(tabCloseButton)

	let debugModeToggle = createCheckbox(browser.i18n.getMessage("optionsDebugMode"), v => {
		browser.storage.local.set({
			debug_mode: v
		}).then(_ => browser.runtime.reload());
	}, CONFIG.debug_mode);

	document.body.appendChild(debugModeToggle);

	let clearDataButton = createButton(browser.i18n.getMessage("optionsClearTreeData"), v => {
		if (window.confirm(browser.i18n.getMessage("optionsClearTreeDataConfirmationPopup")))
			browser.runtime.sendMessage({ recipient: -1, type: MSG_TYPE.ClearData });
	})

	document.body.appendChild(clearDataButton);
}

document.addEventListener('DOMContentLoaded', init, false);