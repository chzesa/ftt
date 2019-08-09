let DEBUG_MODE;
let BACKGROUND_PAGE;
let WINDOW_ID;
let HIDDEN_ANCHOR;

let CURRENT_ACTIVE_NODE;

let TREE;
let CACHE;
let START_TIME;

let USE_API = false;
let QUEUE;

let FOLDED_STATE;

async function wait(dur) {
	return new Promise(function (res) {
		setTimeout(res, dur);
	});
}

getFoldedState = (id) => USE_API ? FOLDED_STATE[id] : CACHE.getValue(id, 'fold');

function setFoldedState(id, value) {
	if (USE_API) {
		if (FOLDED_STATE[id] == value) return;
		browser.runtime.sendMessage({type: MSG_TYPE.SessionsValueUpdated, tabId: id, key: 'fold', value});
		FOLDED_STATE[id] = value;
	}
	else {
		CACHE.setValue(id, 'fold', value);
	}
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
	if (tab.cookieStoreId == null || tab.cookieStoreId == 'firefox-default' || tab.cookieStoreId == 'firefox-private') {
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
	let src;
	let svg = false;
	if (tab.favIconUrl == null) {
		if (tab.pinned) {
			src = './icons/globe.svg';
			svg = true;
		} else {
			src = ''
		}
	} else if (chrome.test(tab.favIconUrl)) {
		src = `../icons/chrome/${chrome.exec(tab.favIconUrl)[1]}`;
		svg = true;
	} else {
		src = tab.favIconUrl;
	}

	if (svg) {
		setNodeClass(tabObj.favicon, `hidden`, true);
		setNodeClass(tabObj.faviconSvg, `hidden`, false);
		tabObj.faviconSvg.setAttribute(`src`, src);
	} else {
		setNodeClass(tabObj.favicon, `hidden`, false);
		setNodeClass(tabObj.faviconSvg, `hidden`, true);
		tabObj.favicon.style.backgroundImage = `url(${src})`;
	}
}

function updatePinned(tab, tabObj) {
	setNodeClass(tabObj.node, 'pinned', tab.pinned);
	if (tab.favIconUrl == null) {
		updateFaviconUrl(tab, tabObj);
	}
}

function updateStatus(tab, tabObj) {
	if (tab.status == `loading`) {
		if (!tabObj.favicon.classList.contains('throbber')) {
			setNodeClass(tabObj.favicon, `hidden`, true);
			setNodeClass(tabObj.faviconSvg, `hidden`, false);
			setNodeClass(tabObj.faviconSvg, 'throbber', true);
			tabObj.faviconSvg.setAttribute(`src`, `./icons/throbber.svg`);
			let delta = Date.now() - START_TIME;
			tabObj.faviconSvg.style = `animation-delay: -${delta}ms`;
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

	setFoldedState(id, true);
	tabObj.badgeFold.innerHTML = '';
	tabObj.badgeFold.appendChild(document.createTextNode(release.length));
	setNodeClass(tabObj.badgeFold, 'hidden', false);
	Selected.requireUpdate();
}

function unfold(id) {
	let tabObj = tabs.get(id);
	if (tabObj == null) return;
	setFoldedState(id, false);
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

		if (CACHE.get(node.id).hidden == false && getFoldedState(node.id)) {
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
		if (getFoldedState(node.id)) {
			setFoldedState(node.id, false);
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

			if (getFoldedState(tab.id)) {
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

function broadcast(signal) {
	if (USE_API)
		browser.runtime.sendMessage({recipient: -1, type: MSG_TYPE.Signal, signal});
	else
		BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.broadcast, { type: SIGNALS.dragDrop });
}

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
	default:
		console.log(`Unrecognized signal ${param}`);
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

async function createTree(data) {
	CACHE = data.cache;
	TREE = data.tree;
	START_TIME = data.startTime;
	await refresh();
}

function resolveDelta(delta) {
	if (TREE.get(delta.id) == null) TREE.new(delta.id);
	TREE.move(delta.id, delta.index);
	TREE.changeParent(delta.id, delta.parentId);
}

async function sbInternalMessageHandler(msg, sender, resolve, reject) {
	if (msg.recipient !== undefined && msg.recipient != WINDOW_ID) return;
	switch (msg.type) {
		case MSG_TYPE.GetSelection:
			let ret = Selected.get();
			Selected.clear();
			resolve(ret);
			break;

		case MSG_TYPE.OnActivated:
			await CACHE.cacheOnActivated({ tabId: msg.tabId });
			onActivated(msg.tabId);
			break;

		case MSG_TYPE.OnCreated:
			await CACHE.cacheOnCreated(msg.tab);
			msg.deltas.forEach(resolveDelta);
			onCreated(msg.tab);
			break;

		case MSG_TYPE.OnMoved:
			await CACHE.cacheOnMoved(msg.tabId, msg.info);
			msg.deltas.forEach(resolveDelta);
			onMoved(msg.tabId, msg.info);
			break;

		case MSG_TYPE.OnRemoved:
			await CACHE.cacheOnRemoved(msg.tab.id, msg.info);
			TREE.remove(msg.tab.id);
			msg.deltas.forEach(resolveDelta);
			onRemoved(msg.tab, msg.info, msg.values);
			break;

		case MSG_TYPE.OnUpdated:
			await CACHE.cacheOnUpdated(msg.tab.id, msg.info, msg.tab);
			onUpdated(msg.tab, msg.info);
			break;

		case MSG_TYPE.Signal:
			signal(msg.signal);
			break;

		case MSG_TYPE.SessionsValueUpdated:
			if (msg.key != 'fold') break;
			FOLDED_STATE[msg.tabId] = msg.value;
			if (msg.value) fold(msg.id);
			else unfold(msg.id);
			break;

		default:
			console.log(`Unrecognized msg ${msg}`);
			break;
	}
}

async function init() {
	let anchor = document.getElementById('anchor');
	DRAG_INDICATOR = document.getElementById('dragIndicator');
	HIDDEN_ANCHOR = document.createDocumentFragment();
	let currentWindow = await browser.windows.getCurrent();
	WINDOW_ID = currentWindow.id;

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

		if (USE_API) {
			// todo this should be awaited on
			browser.runtime.sendMessage({
				type: MSG_TYPE.UpdateSidebarContextMenu,
				recipient: -1,
				tabId
			});

			browser.menus.overrideContext({
				context: 'tab'
				, tabId
			});
		} else {
			BACKGROUND_PAGE.menuUpdate(tabId).then(_ => {
				browser.menus.overrideContext({
					context: 'tab'
					, tabId
				});
			});
		}
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

	if (currentWindow.incognito) {
		USE_API = true;
		TREE = new TreeStructure();
		QUEUE = newSyncQueue({enabled: false});
		CACHE = newCache();

		QUEUE.do(refresh);

		browser.runtime.onMessage.addListener((msg, sender, sendResponse) =>
			new Promise((res, rej) => QUEUE.do(sbInternalMessageHandler, msg, sender, res, rej)));

		let msg = await browser.runtime.sendMessage({
			type: MSG_TYPE.Register,
			recipient: -1,
			windowId: WINDOW_ID
		});

		START_TIME = msg.startTime;
		FOLDED_STATE = msg.values;
		msg.deltas.forEach(resolveDelta);
		for (let k in msg.tabs) await CACHE.cacheOnCreated(msg.tabs[k]);

		QUEUE.enable();
		return;
	}

	while(true) {
		let pages = await browser.extension.getViews();
		pages.forEach(p => {
			if (p.registerSidebar != null) BACKGROUND_PAGE = p;
		});
		if (BACKGROUND_PAGE != null) break;
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
