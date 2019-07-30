let DEBUG_MODE;
let BACKGROUND_PAGE;
let WINDOW_ID;

let HIDDEN_ANCHOR;

let CURRENT_ACTIVE_NODE;

let TREE;
let CACHE;
let START_TIME;

async function wait(dur) {
	return new Promise(function (res) {
		setTimeout(res, dur);
	});
}

function setScrollPosition(focusId) {
	let height = document.body.scrollHeight;
	let viewport = document.documentElement.clientHeight;

	if (height <= viewport) return;

	let delta = 0;

	function showRect(rect) {
		if (rect.top < delta) {
			delta += rect.top - delta;
		} else if (rect.bottom > viewport + delta) {
			delta += rect.bottom - (viewport + delta);
		}
	}

	let focusTab = tabs.get(focusId);
	if (focusTab != null) {
		showRect(focusTab.node.getBoundingClientRect());
	}

	showRect(tabs.get(CACHE.getActive(WINDOW_ID).id).node.getBoundingClientRect());

	if (delta != 0) {
		document.documentElement.scrollTop += delta;
	}
}

function updateAttention(tab, tabObj) {

}

function updateDiscarded(tab, tabObj) {
	setNodeClass(tabObj.node, 'discarded', tab.discarded);
}

async function updateContextualIdentity(tab, tabObj) {
	if (tab.cookieStoreId == null || tab.cookieStoreId == 'firefox-default') {
		tabObj.context.style.backgroundColor = '';
	}
	else {
		let context = await browser.contextualIdentities.get(tab.cookieStoreId);
		if (tabObj!= null) {
			tabObj.context.style.backgroundColor = context.colorCode;
		}
	}
}

function updateTitle(tab, tabObj) {
	tabObj.title.innerHTML = '';
	let title = DEBUG_MODE ? `[${tab.id}] ${tab.title}` : tab.title;
	tabObj.title.appendChild(document.createTextNode(title));
}

function updateMute(tab, tabObj) {
	setNodeClass(tabObj.badgeMute, 'hidden', tab.mutedInfo == null || tab.mutedInfo.muted == false);
}

function updateFaviconUrl(tab, tabObj) {
	if (tab.status == `loading`) return;
	const chrome = /^chrome:\/\/(.*)/;

	if (chrome.test(tab.favIconUrl)) {
		tabObj.favicon.setAttribute(`src`,
			`../icons/chrome/${chrome.exec(tab.favIconUrl)[1]}`);
	}
	else if (tab.favIconUrl != null) {
		tabObj.favicon.setAttribute(`src`, tab.favIconUrl);
	} else {
		tabObj.favicon.setAttribute(`src`, `./alpha.png`);
	}
}

function updatePinned(tab, tabObj) {
	setNodeClass(tabObj.node, 'pinned', tab.pinned);
}

function updateStatus(tab, tabObj) {
	if (tab.status == `loading`) {
		if (!tabObj.favicon.classList.contains('throbber')) {
			setNodeClass(tabObj.favicon, 'throbber', true);
			tabObj.favicon.setAttribute(`src`, `./throbber.svg`);
			let delta = Date.now() - START_TIME;
			tabObj.favicon.style = `animation-delay: -${delta}ms`;
		}
	} else {
		setNodeClass(tabObj.favicon, 'throbber', false);
		tabObj.favicon.style = null;
		updateFaviconUrl(tab, tabObj);
	}
}

const update_functions = {
	attention: updateAttention
	, discarded: updateDiscarded
	, title: updateTitle
	, hidden: updateHidden
	, favIconUrl: updateFaviconUrl
	, mutedInfo: updateMute
	, pinned: updatePinned
	, status: updateStatus
}

function onUpdated(tab, info) {
	let tabObj = tabs.get(tab.id);
	if (tabObj == null && info.hidden === undefined) return;

	for (let key in info) {
		let fn = update_functions[key];
		if (fn == null) continue;
		fn(tab, tabObj);
	}
}

function fold(id) {
	let tabObj = tabs.get(id);
	if (tabObj == null) return;

	let release;

	function recurse(node) {
		node.childNodes.forEach(child => {
			let tab = CACHE.get(child.id);
			if (!tab.hidden) release.push(child.id);
			recurse(child);
		});
	}

	let node = TREE.get(id);
	if (node.childNodes.length == 0) return;
	release = [];
	recurse(node);
	tabs.releaseDirty(release);

	CACHE.setValue(id, 'fold', true);
	tabObj.badgeFold.innerHTML = '';
	tabObj.badgeFold.appendChild(document.createTextNode(release.length));
	setNodeClass(tabObj.badgeFold, 'hidden', false);
	Selected.requireUpdate();
}

function unfold(id) {
	let tabObj = tabs.get(id);
	if (tabObj == null) return;

	CACHE.setValue(id, 'fold', false);
	setNodeClass(tabObj.badgeFold, 'hidden', true);
	displaySubtree(id);
}

function findVisibleParent(id) {
	let node = TREE.get(id);
	do {
		node = node.parent;
	} while (node.id != -1 && CACHE.get(node.id).hidden);

	return node.id;
}

function inFoldedTree(tabId) {
	let node = TREE.get(tabId);

	while (node.parentId != -1) {
		node = node.parent;

		if (CACHE.get(node.id).hidden == false
			&& CACHE.getValue(node.id, 'fold') == true) {
			return {
				result: true,
				id: node.id
			};
		}
	}

	return {
		result: false
	};
}

function unfoldAncestors(id) {
	let node = TREE.get(id);
	let lastFoldedId;

	while (node.parentId != -1) {
		node = node.parent;
		if (CACHE.getValue(node.id, 'fold') == true) {
			CACHE.setValue(node.id, 'fold', false);
			let tab = CACHE.get(node.id);
			if (!tab.hidden) {
				tabs.addElement(tab);
				lastFoldedId = node.id;
			}
		}
	}

	if (lastFoldedId != null) {
		unfold(lastFoldedId);
		return true;
	}

	return false;
}

function insertChild(id, parentId, container = null) {
	let index = CACHE.get(id).index;
	let childContainer = tabs.get(parentId).childContainer;

	if (container == null) container = tabs.get(id).container;

	if (container.parentNode == childContainer) {
		HIDDEN_ANCHOR.appendChild(container);
	}

	let insertAt = -1;
	let array = childContainer.children;
	let a = 0;
	let b = array.length - 1;

	while (a <= b) {
		let k = Math.floor((a + b) / 2);

		let childId = Number(array[k].getAttribute('tabId'));

		if (CACHE.get(childId).index <= index) {
			a = k + 1;
		} else {
			insertAt = k;
			b = k - 1;
		}
	}

	try {
		setAsNthChild(container, childContainer, insertAt);
	} catch(e) {
		console.log(e);
		location.reload();
	}
}

function displaySubtree(id) {
	let root = TREE.get(id);
	function recurse(node, frag) {
		let tab = CACHE.get(node.id);

		if (tab != null && !tab.hidden){
			frag.appendChild( tabs.addElement(tab).container );

			if (CACHE.getValue(tab.id, 'fold') == true) {
				fold(tab.id);
				return;
			}

			if (node.childNodes.length == 0) return;

			frag = document.createDocumentFragment();
		}

		node.childNodes.forEach(child => {
			recurse(child, frag);
		});

		let tabObj = tabs.get(node.id);
		if (tabObj != null) tabObj.childContainer.appendChild(frag);
	}

	let frag = document.createDocumentFragment();
	recurse(root, frag);

	if (id != -1) {
		let parentId = findVisibleParent(id);
		insertChild(id, parentId, frag);
	}

	Selected.requireUpdate();
}

function updateHidden(tab, tabObj) {
	let foldedParent = inFoldedTree(tab.id);
	if (foldedParent.result) {
		// todo
		fold(foldedParent.id);
		return;
	}

	if (tab.hidden) {
		tabs.releaseDirty(tab.id);
	}

	displaySubtree(tab.id);
	setScrollPosition(tab.id);
}

function onActivated(tabId) {
	unfoldAncestors(tabId);

	let newActiveNode = tabs.get(tabId);
	newActiveNode = newActiveNode.node;

	if (CURRENT_ACTIVE_NODE != null)
	setNodeClass(CURRENT_ACTIVE_NODE, 'active', false);

	CURRENT_ACTIVE_NODE = newActiveNode;
	setNodeClass(CURRENT_ACTIVE_NODE, 'active', true);

	setScrollPosition(tabId);
}

function onMoved(id, info) {
	let tab = CACHE.get(id);
	let nextIndex = info.fromIndex < info.toIndex ? info.fromIndex : info.fromIndex + 1;
	let nextTab = CACHE.getIndexed(WINDOW_ID, nextIndex)

	if (nextTab != null) {
		displaySubtree(nextTab.id);
	}

	if (tab.hidden) return;
	if (CACHE.getActive(WINDOW_ID).id == id && unfoldAncestors(id)) {
		return;
	} else {
		let foldedParent = inFoldedTree(id);
		if (foldedParent.result) {
			// todo increment number
			fold(foldedParent.id);
			return;
		}
	}

	displaySubtree(tab.id);
	setScrollPosition(id);
}

function onRemoved(tab, info, values) {
	let tabObj = tabs.get(tab.id);
	tabs.delete(tab.id);
	Selected.requireUpdate();

	if (tab.hidden || values.fold != true || tabObj == null) return;

	let next = CACHE.getIndexed(info.oldWindowId || tab.windowId, info.oldIndex || tab.index);
	if (next != null) {
		displaySubtree(next.id);
	}
}

function onCreated(tab) {
	let o = tabs.new(tab);
	if (tab.hidden) return;
	let id = tab.id;
	if (!unfoldAncestors(id)) {
		displaySubtree(id);
	}

	Selected.requireUpdate();
	setScrollPosition(tab.id);
}

// todo move to separate file
const SIGNALS = {
	dragDrop: 0,
	selectAll: 1,
	deselectAll: 2
};

function signal(param) {
	switch(param.type) {
	case SIGNALS.dragDrop:
		document.getElementById('dragIndicator').style.display = 'none';
		break;
	case SIGNALS.selectAll:
		CACHE.forEach(tab => {
			unfold(tab.id);
			Selected.add(tab.id);
		}, WINDOW_ID, tab => !tab.hidden);
		break;
	case SIGNALS.deselectAll:
		Selected.clear();
		break;
	}
}

// Relying on this to speed up a large number of changes wouldn't be
// necessary if updateVisibleSubtree could be made more efficient
// perhaps by having tabs in a flat structure instead of hierarchial
// this would also trivialize virtualizing the sidebar
async function refresh() {
	for (let k in tabs.inner()) {
		let id = Number(k);
		if (id != -1) tabs.delete(id);
	}

	displaySubtree(-1);

	onActivated(CACHE.getActive(WINDOW_ID).id);
}

async function createTree(cache, tree) {
	CACHE = cache;
	TREE = tree;
	await refresh();
}

async function init() {
	let anchor = document.getElementById('anchor');
	DRAG_INDICATOR = document.getElementById('dragIndicator');
	HIDDEN_ANCHOR = document.createDocumentFragment();
	WINDOW_ID = (await browser.windows.getCurrent()).id;

	START_TIME = Date.now();

	let config = await browser.storage.local.get();
	DEBUG_MODE = config.debug_mode || false;

	// Create a dummy node so we don't have to treat root level tabs in
	// a special way.
	let fakeTab = {
		id: -1
	};
	let rootTab = tabs.new(fakeTab);

	rootTab.node.remove();
	rootTab.container.remove();
	rootTab.childContainer.remove();
	rootTab.childContainer = anchor;

	document.addEventListener('drop', (event) => {
		onDrop(event, -1);
	}, false);

	document.addEventListener('dragenter', (event) => {
		onDragEnter(event, anchor);
	}, false);

	document.addEventListener('dragover', (event) => {
		event.preventDefault();
		let scroll = document.documentElement.scrollTop;
		DRAG_INDICATOR.style.display = 'initial';
		DRAG_INDICATOR.style.left = '0px';
		DRAG_INDICATOR.style.top = `${TAR_RECT.bottom -1 + scroll}px`;
		DRAG_INDICATOR.style.height = `0px`;
		DROP_PARENTING = false;
		DROP_BEFORE = true;
	}, false);

	document.addEventListener('dragend', onDragEnd, false);

	Selected.init(function () {
		let ret = {};
		let array = tabs.inner();

		for (let i in array) {
			let tabObj = array[i];
			if (i != -1 && tabObj != null)
			ret[array[i].id] = tabObj.node;
		}
		return ret;
	});

	document.addEventListener('contextmenu', async function (event) {
		let container = event.target.closest('.container')
		let tabId;

		if (container == null)
			tabId = CACHE.getActive(WINDOW_ID).id;
		else {
			tabId = Number(container.getAttribute('tabId'));
		}

		BACKGROUND_PAGE.menuUpdate(tabId).then(_ => {
			browser.menus.overrideContext({
				context: 'tab'
				, tabId
			});
		});
	});

	document.addEventListener('mousedown', async function (event) {
		if (event.button != 0 || !event.ctrlKey) return;
		event.stopPropagation();
		Selected.start(event);
	});

	document.addEventListener('mouseup', async function (event) {
		if (event.button == 0 && Selected.active()) {
			event.stopPropagation();
			Selected.stop();
		}
	});

	while (BACKGROUND_PAGE == null) {
		BACKGROUND_PAGE = await browser.extension.getViews()[0];
	}

	while (BACKGROUND_PAGE.registerSidebar == null) {
		await wait(50);
	}

	BACKGROUND_PAGE.registerSidebar({
		createTree
		, updateChildPositions: displaySubtree
		, refresh
		, signal
		, getSelection: () => {
			let ret = Selected.get();
			Selected.clear();
			return ret;
		}
		, onCreated
		, onRemoved
		, onUpdated
		, onActivated
		, onMoved
	}, WINDOW_ID);
}

document.addEventListener('DOMContentLoaded', init, false);
