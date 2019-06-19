const Selected = (function () {
	let self = {};

	let selectStart = {};
	let pointer = {};
	let lastPointer = {};

	let selectionBox;

	let mouseDown = -1;

	let selectables;
	let selection = {};
	let nextSelection = {};
	let getSelectables = () => [];
	let selectables_need_update = true;

	let update = async function () {
		let x = pointer.x < selectStart.x ? pointer.x : selectStart.x;
		let y = pointer.y < selectStart.y ? pointer.y : selectStart.y;
		let w = Math.abs(pointer.x - selectStart.x);
		let h = Math.abs(pointer.y - selectStart.y);
		updateSelectionVisual(x, y, w, h);
		await updateSelection(x, y, w, h);
	}

	let updateSelection = async function (x, y, w, h) {
		for (let id in selectables) {
			let elem = selectables[id];

			let inSelection = isElementPartInRect(elem, x, y, w, h);

			let outcome = false;

			if (inSelection) outcome = true;

			nextSelection[id] = outcome;
			let previous = selection[id];

			if (outcome || previous) {
				outcome = true;
			}

			if (previous != outcome) {
				setNodeClass(elem, 'selection', outcome);
			}
		}
	}

	let updateSelectionVisual = async function (x, y, w, h) {
		selectionBox.style.left = `${x}px`;
		selectionBox.style.top = `${y + document.documentElement.scrollTop}px`;
		selectionBox.style.width = `${w}px`;
		selectionBox.style.height = `${h}px`;
	}

	let updateSelectionItemVisual = async function () {
		for (let id in selectables) {
			let elem = selectables[id];
			setNodeClass(elem, 'selection', selection[id]);
		}
	}


	let onStartSelect = async function (event) {
		selectStart.x = event.clientX;
		selectStart.y = event.clientY;
		selectionBox.style.left = `${event.clientX}px`;
		selectionBox.style.top = `${event.clientY}px`;
		selectionBox.style.display = 'initial';
	}

	let onEndSelect = async function () {
		selectionBox.style.display = 'none';
		selectionBox.style.width = `$0px`;
		selectionBox.style.height = `$0px`;

		for (let id in nextSelection) {
			let outcome = nextSelection[id];
			let previous = selection[id];

			selection[id] = outcome || previous;
		}

		nextSelection = {};

		// if (multiselect_api_enabled) {
		// 	let sel = self.get();
		// 	let current_win_id = await browser.windows.getCurrent().id;
		// 	let return_to = (await browser.tabs.query({
		// 		active: true
		// 		, windowId: current_win_id
		// 	}))[0];

		// 	for (i in sel) {
		// 		console.log(`shifting ${sel[i]}`);
		// 		if (sel[i] > return_to.id) {
		// 			console.log(`shifting ${sel[i]}`);
		// 			sel[i] = sel[i] - 1;
		// 		}
		// 	}

		// 	browser.tabs.highlight({
		// 		windowId: current_win_id
		// 		, tabs: sel
		// 	}).then(_ => {
		// 		browser.tabs.update(return_to.id, {
		// 			active: true
		// 		});
		// 	});
		// }
	}

	let ensureUpToDate = function () {
		if (selectables_need_update) {
			selectables = getSelectables();
			selectables_need_update = false;
		}
	}

	let endSelect = function () {
		if (mouseDown != -1) {
			clearInterval(mouseDown)
			mouseDown = -1;
			onEndSelect();
		}
	}

	self.get = function () {
		endSelect();
		let r = [];

		for (id in selection) {
			if (selection[id] == true) {
				r.push(Number(id));
			}
		}

		return r;
	}

	self.add = function (id) {
		ensureUpToDate();
		let elem = selectables[id];
		if (elem != null) {
			selection[id] = true;
			setNodeClass(elem, 'selection', true);
		}
	}

	self.remove = function (id) {
		let elem = selectables[id];
		if (elem != null) {
			selection[id] = false;
			setNodeClass(elem, 'selection', false);
		}
	}

	self.removeSelectable = function (id) {
		let elem = selectables[id];
		if (elem != null) {
			delete selection[id];
			delete selectables[id];
			setNodeClass(elem, 'selection', false);
			selectables_need_update = true;
		}
	}

	self.requireUpdate = function () {
		selectables_need_update = true;
	}

	self.print = function () {
		let s = self.get();

		for (let id in s) {
			console.log(id);
		}
	}

	self.clear = function () {
		selection = {};
		updateSelectionItemVisual();

		// if (multiselect_api_enabled) {
		// 	browser.tabs.query({
		// 		currentWindow: true
		// 	}).then(tabs => {
		// 		for (i in tabs) {
		// 			let tab = tabs[i];
		// 			tab.highlighted = false;
		// 		}
		// 	});
		// }
	}

	function whilemousedown() {
		if (lastPointer.x != pointer.x || lastPointer.y != pointer.y) {
			update();
			lastPointer.x = pointer.x;
			lastPointer.y = pointer.y;
		}
	}

	self.start = function (event) {
		if (mouseDown == -1) {
			ensureUpToDate();

			mouseDown = setInterval(whilemousedown, 17);
			onStartSelect(event);
			update();
		}
	}

	self.stop = function () {
		endSelect();
	}

	self.active = function () {
		return mouseDown != -1;
	}

	self.init = function (callback) {
		if (callback != null) {
			getSelectables = callback;
		}

		selectionBox = document.getElementById('selection-box');
		selectables = getSelectables();

		document.onmousemove = function (event) {
			pointer.x = event.clientX;
			pointer.y = event.clientY;
		}

		document.onkeypress = function (event) {
			if (event.key == 'd') {
				event.stopPropagation();
				self.clear();
			}
		}
	}

	return self;
})();