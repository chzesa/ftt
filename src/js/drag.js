let DROP_PARENTING = false;
let DROP_INDICATOR;
let TAR_RECT;
let DROP_BEFORE;

function onMouseDown(event, id) {
	if (event.button == 1) {
		event.stopPropagation();
		event.preventDefault();
		browser.tabs.remove(id);
		return;
	}

	if (event.button != 0 || !event.ctrlKey) return;
	event.stopPropagation();
	Selected.start(event);
}

function onMouseUp(event, id, lastMouseUp) {
	if (Selected.active()) {
		Selected.stop();
		event.stopPropagation();
		return;
	}

	event.stopPropagation();

	let tabId = id;
	let time = Date.now();

	if (time - lastMouseUp < 300) {
		if (getValue(tabId, 'fold')) unfold(tabId);
		else fold(tabId);
		return 0;
	}

	if (event.button == 0) {
		browser.tabs.update(tabId, {
			active: true
		});
	}

	return time;
}
function onDragStart(event, id) {
	if (event.ctrlKey) {
		event.preventDefault();
		return;
	}
	event.stopPropagation();
	let tabId = id;
	event.dataTransfer.setData('number', tabId);
	if (USE_API)
		browser.runtime.sendMessage({recipient: -1, type: MSG_TYPE.SetSelectionSource, windowId: WINDOW_ID});
	else
		BACKGROUND_PAGE.setSelectionSourceWindow(WINDOW_ID);

	Selected.add(tabId);
	DROP_INDICATOR.style.display = 'initial';

	TAR_RECT = TABS[id].node.getBoundingClientRect();
	updateDragIndicator(id, event.x, event.y);
}

async function onDrop(event, tabId) {
	event.preventDefault();
	event.stopPropagation();
	DROP_INDICATOR.style.display = 'none';

	let selection;
	let sourceWindowId;

	if (USE_API)
		sourceWindowId = await browser.runtime.sendMessage({
			recipient: -1, type: MSG_TYPE.GetSelectionSource});
	else
		sourceWindowId = BACKGROUND_PAGE.getSelectionSourceWindow();

	if (sourceWindowId == WINDOW_ID) {
		selection = Selected.get();
		Selected.clear();
	} else {
		if (USE_API)
			selection = await browser.runtime.sendMessage({
				recipient: -1, type: MSG_TYPE.GetSelection});
		else
			selection = await BACKGROUND_PAGE.getSelectionFromSourceWindow();
	}

	if (DROP_PARENTING) {
		if (USE_API)
			browser.runtime.sendMessage({recipient: -1, type: MSG_TYPE.DropParenting,
				selection, tabId, windowId: WINDOW_ID});
		else
			BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.sidebarDropParenting,
				selection, tabId, WINDOW_ID);
	}
	else {
		if (USE_API)
			browser.runtime.sendMessage({recipient: -1, type: MSG_TYPE.DropMoving,
				selection, tabId, windowId: WINDOW_ID, before: DROP_BEFORE});
		else
			BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.sidebarDropMoving,
				selection, tabId, DROP_BEFORE, WINDOW_ID);
	}

	broadcast(SIGNAL_TYPE.dragDrop);
}

function onDragEnter(event, node) {
	event.preventDefault();
	event.stopPropagation();
	TAR_RECT = node.getBoundingClientRect();
}

function onDragOver(event, id) {
	event.stopPropagation();
	event.preventDefault();
	updateDragIndicator(id, event.x, event.y);
}

function onDragEnd(event) {
	event.stopPropagation();
	DROP_INDICATOR.style.display = 'none';
	broadcast(SIGNAL_TYPE.dragDrop);
}

function updateDragIndicator(id, x, y) {
	DROP_INDICATOR.style.display = 'initial';
	DROP_INDICATOR.style.left = '0px';
	let scroll = document.documentElement.scrollTop;

	let tab = CACHE.get(id);
	if (tab.pinned) {
		DROP_INDICATOR.style.height = `${TAR_RECT.height}px`;
		DROP_INDICATOR.style.width = `0px`;
		DROP_INDICATOR.style.top = `${TAR_RECT.top + scroll}px`;
		DROP_PARENTING = false;

		if (x < TAR_RECT.left + 7) {
			DROP_INDICATOR.style.left = `${TAR_RECT.left - 1 + scroll}px`;
			DROP_BEFORE = true;
		} else {
			DROP_INDICATOR.style.left = `${TAR_RECT.right - 1 + scroll}px`;
			DROP_INDICATOR.style.width = `0px`;
			DROP_BEFORE = false;
		}
	} else {
		DROP_INDICATOR.style.width = `100%`;

		if (y < TAR_RECT.top + 7) {
			DROP_INDICATOR.style.top = `${TAR_RECT.top - 1 + scroll}px`;
			DROP_INDICATOR.style.height = `0px`;
			DROP_PARENTING = false;
			DROP_BEFORE = true;
		}
		else if (y > TAR_RECT.bottom - 7) {
			DROP_INDICATOR.style.top = `${TAR_RECT.bottom -1 + scroll}px`;
			DROP_INDICATOR.style.height = `0px`;
			DROP_PARENTING = false;
			DROP_BEFORE = false;
		}
		else {
			DROP_INDICATOR.style.height = `${TAR_RECT.height}px`;
			DROP_INDICATOR.style.top = `${TAR_RECT.top + scroll}px`;
			DROP_PARENTING = true;
		}
	}
}