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

async function init() {
	CONFIG = await browser.storage.local.get();

	let theme = createRadioMenu(`Theme:`, v => {
		updateSetting(`theme`, v);
	}, true, [
		{name: `Dark`, value: ThemeOption.Dark},
		{name: `Light`, value: ThemeOption.Light},
		{name: `Classic`, value: ThemeOption.Classic},
		{name: `None`, value: ThemeOption.None}
	], CONFIG.theme);

	document.body.appendChild(theme);

	let openPos = createRadioMenu(`Child tab open position:`, v => {
		updateSetting(`descendantOpenPosition`, v);
	}, true, [
		{name: `Default`, value: DescendantOpenPosition.Default},
		{name: `First`, value: DescendantOpenPosition.First},
		{name: `Last`, value: DescendantOpenPosition.Last}
	], CONFIG.descendantOpenPosition);

	document.body.appendChild(openPos);

	let stayInTree = createCheckbox(`Stay in tree on closing last child`,
		v => updateSetting(`stayInTreeOnTabClose`, v),
		CONFIG.stayInTreeOnTabClose
	);

	document.body.appendChild(stayInTree);

	let debugModeToggle = createCheckbox(`Debug mode`, v => {
		browser.storage.local.set({
			debug_mode: v
		}).then(_ => browser.runtime.reload());
	}, CONFIG.debug_mode);

	document.body.appendChild(debugModeToggle);
}

document.addEventListener('DOMContentLoaded', init, false);