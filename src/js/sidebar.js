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

let SESSIONS_VALUES;

const TABS = {};
const TAB_POOL = [];
const DISPLAYED = [];

function wait(dur) {
	return new Promise(function (res) {
		setTimeout(res, dur);
	});
}

function getValue(id, key) {
	if (!USE_API) return CACHE.getValue(id, key);

	let values = SESSIONS_VALUES[id];
	if (values == undefined) return undefined;
	return values[key];
}

function setValue(tabId, key, value) {
	if (USE_API) {
		browser.runtime.sendMessage({
			recipient: -1,
			type: MSG_TYPE.SessionsValueUpdated,
			tabId, key, value
		});
	}
	else {
		CACHE.setValue(tabId, key, value);
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

	let focusTab = DISPLAYED[focusId];
	if (focusTab != null) {
		showRect(focusTab.node.getBoundingClientRect());
	}

	showRect(TABS[CACHE.getActive(WINDOW_ID).id].node.getBoundingClientRect());

	if (delta != 0) {
		document.documentElement.scrollTop += delta;
	}
}

function tabNew(tab) {
	let obj = TABS[tab.id];
	if (obj != null) {
		DISPLAYED[tab.id] = obj;
		return obj;
	}

	obj = TAB_POOL.pop();

	if (obj == null) {
		obj = {};

		let nodeTitle = new_element('div', {
			class: 'tabTitle'
		});

		let favicon = new_element('img', {
			class: 'favicon'
		});

		let attention = new_element(`div`, {
			class: `attention`
		});

		let context = new_element('div', {
			class: 'context'
		});

		let badgeFold = new_element('div', {
			class: 'badge fold hidden'
		});

		let badgeMute = new_element('img', {
			class: 'badge mute hidden',
			src: './icons/tab-audio-muted.svg'
		});

		let node = new_element('div', {
			class: 'tab'
			, draggable: 'true'
		}, [context, favicon, badgeFold, attention, nodeTitle, badgeMute]);

		let children = new_element('div', {
			class: 'childContainer'
		});

		let container = new_element('div', {
			class: 'container'
		}, [node, children]);

		let lastMouseUp = 0;

		node.addEventListener('mousedown', (event) => {
			onMouseDown(event, obj.id);
		}, false);

		node.addEventListener('mouseup', (event) => {
			lastMouseUp = onMouseUp(event, obj.id, lastMouseUp);
		}, false);

		node.addEventListener('dragstart', (event) => {
			onDragStart(event, obj.id);
		}, false);

		node.addEventListener('drop', (event) => {
			onDrop(event, obj.id);
		}, false);

		node.addEventListener('dragenter', (event) => {
			onDragEnter(event, node);
		}, false);

		node.addEventListener('dragover', event => {
			onDragOver(event, obj.id);
		}, false);

		node.addEventListener('dragend', onDragEnd, false);

		obj.container = container;
		obj.node = node;
		obj.childContainer = children;

		obj.favicon = favicon;
		obj.title = nodeTitle;
		obj.badgeFold = badgeFold;
		obj.badgeMute = badgeMute;
		obj.attention = attention;
		obj.context = context;
	}

	obj.id = tab.id;
	obj.container.setAttribute('tabId', tab.id);
	TABS[tab.id] = obj;
	DISPLAYED[tab.id] = obj;

	setNodeClass(obj.badgeFold, 'hidden', true);
	setNodeClass(obj.node, 'selection', false); // todo

	updateAttention(tab, obj);
	updateTitle(tab, obj);
	updateDiscarded(tab, obj);
	updateMute(tab, obj);
	updateContextualIdentity(tab, obj);

	// favicon handled via updateStatus
	setNodeClass(obj.node, 'pinned', tab.pinned);
	updateStatus(tab, obj);

	return obj;
}

function tabRelease(id) {
	let obj = TABS[id];
	if (obj == null) return;

	tabHide(id);
	delete TABS[id];
	delete DISPLAYED[id];
	TAB_POOL.push(obj);
}

function tabHide(id) {
	let obj = TABS[id];
	if (obj == null) return;

	let children = obj.childContainer.children;

	if (children.length > 1) {
		let frag = document.createDocumentFragment();
		let heir = children[0];
		frag.appendChild(heir);

		while (children.length > 0) {
			heir.children[1].appendChild(children[0]);
		}

		obj.container.parentNode.insertBefore(frag, obj.container);
	} else if  (children.length == 1) {
		obj.container.parentNode.insertBefore(children[0], obj.container);
	}

	HIDDEN_ANCHOR.appendChild(obj.container);
	DISPLAYED[id] = null;
}

function updateAttention(tab, tabObj) {
	setNodeClass(tabObj.attention, 'hidden', tab.attention !== true);
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
	if (tab.favIconUrl == null) {
		if (tab.pinned) {
			src = './icons/globe.svg';
		} else {
			setNodeClass(tabObj.favicon, `hidden`, true);
			return;
		}
	} else if (chrome.test(tab.favIconUrl)) {
		src = `../icons/chrome/${chrome.exec(tab.favIconUrl)[1]}`;
	} else {
		src = tab.favIconUrl;
	}

	setNodeClass(tabObj.favicon, `hidden`, false);
	tabObj.favicon.setAttribute(`src`, src);
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
			setNodeClass(tabObj.favicon, `hidden`, false);
			setNodeClass(tabObj.favicon, 'throbber', true);
			tabObj.favicon.setAttribute(`src`, `./icons/throbber.svg`);
			let delta = Date.now() - START_TIME;
			tabObj.favicon.style = `animation-delay: -${delta}ms`;
		}
	} else {
		setNodeClass(tabObj.favicon, 'throbber', false);
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
	let tabObj = TABS[tab.id];
	if (tabObj == null && info.hidden === undefined) return;

	for (let key in info) {
		let fn = update_functions[key];
		if (fn == null) continue;
		fn(tab, tabObj);
	}
}

function fold(id) {
	let tabObj = DISPLAYED[id];
	if (tabObj == null) { return; }

	let node = TREE.get(id);
	if(node == null || node.childNodes.length == 0) return;
	setValue(id, 'fold', true);
	if (!USE_API) onFold(id);
}

function onFold(id) {
	let tabObj = DISPLAYED[id];
	if (tabObj == null) { return; }
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
	release.forEach(tabHide);

	tabObj.badgeFold.innerHTML = '';
	tabObj.badgeFold.appendChild(document.createTextNode(release.length));
	setNodeClass(tabObj.badgeFold, 'hidden', false);
	Selected.requireUpdate();
}

function unfold(id) {
	let tabObj = DISPLAYED[id];
	if (tabObj == null) { return; }
	setValue(id, 'fold', false);
	if (!USE_API) onUnfold(id);
}

function onUnfold(id) {
	let tabObj = DISPLAYED[id];
	if (tabObj == null) { return; }
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
		if (CACHE.get(node.id).hidden == false && getValue(node.id, 'fold')) {
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
		if (getValue(node.id, 'fold')) {
			setValue(node.id, 'fold', false);
			let tab = CACHE.get(node.id);
			if (!tab.hidden) {
				tabNew(tab);
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
	let childContainer = TABS[parentId].childContainer;

	if (container == null) container = TABS[id].container;

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
			frag.appendChild( tabNew(tab).container );

			if (getValue(tab.id, 'fold')) {
				fold(tab.id);
				return;
			}

			if (node.childNodes.length == 0) return;

			frag = document.createDocumentFragment();
		}

		node.childNodes.forEach(child => {
			recurse(child, frag);
		});

		let tabObj = DISPLAYED[node.id];
		if (tabObj != null) {
			tabObj.childContainer.appendChild(frag);
		}
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
		tabHide(tab.id);
	}

	displaySubtree(tab.id);
	setScrollPosition(tab.id);
}

function onActivated(tabId) {
	unfoldAncestors(tabId);

	let newActiveNode = TABS[tabId];
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
	let tabObj = TABS[tab.id];
	tabRelease(tab.id);
	Selected.requireUpdate();

	if (tab.hidden || values.fold != true || tabObj == null) return;

	let next = CACHE.getIndexed(info.oldWindowId || tab.windowId, info.oldIndex || tab.index);
	if (next != null) {
		displaySubtree(next.id);
	}
}

function onCreated(tab) {
	let o = tabNew(tab);
	if (tab.hidden) return;
	let id = tab.id;
	if (!unfoldAncestors(id)) {
		displaySubtree(id);
	}

	Selected.requireUpdate();
	setScrollPosition(tab.id);
}

function broadcast(signal) {
	if (USE_API)
		browser.runtime.sendMessage({recipient: -1, type: MSG_TYPE.Signal, signal});
	else
		BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.broadcast, { type: SIGNAL_TYPE.dragDrop });
}

function signal(param) {
	switch(param.type) {
	case SIGNAL_TYPE.dragDrop:
		document.getElementById('dragIndicator').style.display = 'none';
		break;
	case SIGNAL_TYPE.selectAll:
		CACHE.forEach(tab => {
			unfold(tab.id);
			Selected.add(tab.id);
		}, WINDOW_ID, tab => !tab.hidden);
		break;
	case SIGNAL_TYPE.deselectAll:
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
	for (let k in TABS) {
		let id = Number(k);
		if (id != -1) tabRelease(id);
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
			if (SESSIONS_VALUES[msg.tabId] == undefined) {
				SESSIONS_VALUES[msg.tabId] = {};
			}

			SESSIONS_VALUES[msg.tabId][msg.key] = msg.value;

			if (msg.value)
				onFold(msg.tabId);
			else
				onUnfold(msg.tabId);
			break;

		default:
			console.log(`Unrecognized msg ${msg}`);
			break;
	}
}

async function init() {
	let config = await browser.storage.local.get();
	DEBUG_MODE = config.debug_mode || false;

	switch(config.theme) {
		case ThemeOption.Light:
			appendCSSFile(`light.css`);
			break;
		case ThemeOption.Dark:
			appendCSSFile(`dark.css`);
			break;
		case ThemeOption.Classic:
			appendCSSFile(`classic.css`);
			break;
		case ThemeOption.None:
			document.styleSheets[0].disabled = true;
			break;
	}

	let anchor = document.getElementById('anchor');
	DRAG_INDICATOR = document.getElementById('dragIndicator');
	HIDDEN_ANCHOR = document.createDocumentFragment();
	let currentWindow = await browser.windows.getCurrent();
	WINDOW_ID = currentWindow.id;

	// Create a dummy node so we don't have to treat root level tabs in
	// a special way.
	let fakeTab = {
		id: -1
	};
	let rootTab = tabNew(fakeTab);

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

		for (let k in TABS) {
			let tabObj = TABS[k];
			if (k != -1 && tabObj != null)
			ret[Number(k)] = tabObj.node;
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
			browser.runtime.sendMessage({
				type: MSG_TYPE.UpdateSidebarContextMenu,
				recipient: -1,
				tabId,
				plural: Selected.count() > 1
			});

			browser.menus.overrideContext({
				context: 'tab'
				, tabId
			});
		} else {
			BACKGROUND_PAGE.menuUpdate(tabId, Selected.count() > 1);
			browser.menus.overrideContext({
				context: 'tab'
				, tabId
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
		SESSIONS_VALUES = msg.values;
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
