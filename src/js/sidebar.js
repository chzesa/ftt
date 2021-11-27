let DEBUG_MODE;
let WINDOW_ID;
let CURRENT_ACTIVE_NODE;

let USE_API = false;
let QUEUE;

let SESSIONS_VALUES;

let TABS = {};
let DISPLAYED = {};
let FOLDED_SIZE = {};
const INDENT_SIZE = 15
let CACHE = []

function wait(dur) {
	return new Promise(function (res) {
		setTimeout(res, dur);
	});
}

function getValue(id, key) {
	let values = SESSIONS_VALUES[id];
	if (values == undefined) return undefined;
	return values[key];
}

function setValue(tabId, key, value) {
	browser.runtime.sendMessage({
		recipient: -1,
		type: MSG_TYPE.SessionsValueUpdated,
		tabId, key, value
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

	let focusTab = TABS[focusId];
	if (focusTab != null) {
		showRect(focusTab.node.getBoundingClientRect());
	}

	showRect(CURRENT_ACTIVE_NODE.node.getBoundingClientRect());

	if (delta != 0) {
		document.documentElement.scrollTop += delta;
	}
}

function tabNew(tab) {
	let obj = TABS[tab.id];
	if (obj != null) {
		return obj;
	}

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

	let muteIcon = new_element('img', {
		class: 'mute-icon-container'
	});

	let badgeMute = new_element('div', {
		class: 'mute badge hidden'
	}, [muteIcon])

	badgeMute.addEventListener('mousedown', async (event) => {
		event.stopPropagation();
		let t = CACHE[obj.id];
		let newStatus = false;
		if (t.mutedInfo != null) newStatus = !t.mutedInfo.muted;
		else if (t.audible) newStatus = true;
		browser.tabs.update(obj.id, {muted: newStatus});
	}, false);

	badgeMute.addEventListener('mouseup', (event) => event.stopPropagation(), false);

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
	obj.muteIcon = muteIcon;
	obj.attention = attention;
	obj.context = context;

	obj.id = tab.id;
	obj.container.setAttribute('tabId', tab.id);
	TABS[tab.id] = obj;
	DISPLAYED[tab.id] = !tab.hidden;
	FOLDED_SIZE[tab.id] = 0

	setNodeClass(obj.badgeFold, 'hidden', true);
	setNodeClass(obj.node, 'selection', false); // todo

	updateAttention(tab, obj);
	updateTitle(tab, obj);
	updateDiscarded(tab, obj);
	updateAudible(tab, obj);
	updateContextualIdentity(tab, obj);

	// favicon handled via updateStatus
	setNodeClass(obj.node, 'pinned', tab.pinned);
	updateStatus(tab, obj);

	if (tab.hidden)
		tabHide(tab.id)

	if (tab.id !== -1 && getValue(tab.id, 'fold'))
		onFold(tab.id)

	return obj;
}

function promoteFirstChild(id) {
	let obj = TABS[id];
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
}

function tabClose(id) {
	promoteFirstChild(id)
	let obj = TABS[id];
	obj.container.remove()
}

function tabShow(id) {
	DISPLAYED[id] = true
	let tabObj = TABS[id];
	tabObj.node.classList.remove('hidden')
	tabObj.childContainer.style.paddingLeft = `${INDENT_SIZE}px`
	setNodeClass(tabObj.childContainer, 'hidden', getValue(id, 'fold'))
	updateFoldCounter(id)
}

function tabHide(id) {
	DISPLAYED[id] = false
	let tabObj = TABS[id];
	tabObj.node.classList.add('hidden')
	tabObj.childContainer.style.paddingLeft = 0

	tabObj.childContainer.classList.remove('hidden')
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

function updateAudible(tab, tabObj) {
	let icon = tab.mutedInfo == null || !tab.mutedInfo.muted
		? './icons/tab-audio-playing.svg'
		: './icons/tab-audio-muted.svg';

	if (!tab.audible && (tab.mutedInfo == null || !tab.mutedInfo.muted))
		setNodeClass(tabObj.badgeMute, 'hidden', true);
	else if (tab.audible) {
		tabObj.muteIcon.src = icon;
		setNodeClass(tabObj.badgeMute, 'hidden', false);
	}
	else if (tab.mutedInfo != null)
	{
		if (!tab.mutedInfo.muted) {
			setNodeClass(tabObj.badgeMute, 'hidden', true);
		} else
		{
			tabObj.muteIcon.src = icon;
			setNodeClass(tabObj.badgeMute, 'hidden', false);
		}
	}
}

function updateFaviconUrl(tab, tabObj) {
	if (tab.status == `loading`) return;
	const chrome = /^chrome:\/\/(.*)/;

	let src;
	if (tab.favIconUrl == null) {
		if (tab.pinned) {
			src = './icons/defaultFavicon.svg';
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
		setNodeClass(tabObj.favicon, `hidden`, false);
		tabObj.favicon.setAttribute(`src`, `./icons/hourglass.svg`);
	}
	else
		updateFaviconUrl(tab, tabObj);
}

const update_functions = {
	attention: updateAttention
	, audible: updateAudible
	, discarded: updateDiscarded
	, title: updateTitle
	, hidden: updateHidden
	, favIconUrl: updateFaviconUrl
	, mutedInfo: updateAudible
	, pinned: updatePinned
	, status: updateStatus
}

function onUpdated(tab, info) {
	let tabObj = TABS[tab.id];

	for (let key in info) {
		let fn = update_functions[key];
		if (fn == null) continue;
		fn(tab, tabObj);
	}
}

function isPinned(id) {
	return TABS[id].node.classList.contains('pinned')
}

function updateFoldCounter(id) {
	if (!getValue(id, 'fold'))
		return

	let tabObj = TABS[id];
	let count = 0;

	function recurse(node) {
		node = TABS[getId(node)]
		for (let i = 0; i < node.childContainer.children.length; i++) {
			let child = node.childContainer.children[i]
			if (DISPLAYED[getId(child)])
				count++
			recurse(child)
		}
	}

	recurse(tabObj.container);

	tabObj.badgeFold.innerHTML = '';
	tabObj.badgeFold.appendChild(document.createTextNode(count));
	FOLDED_SIZE[id] = count;
	setNodeClass(tabObj.badgeFold, 'hidden', count == 0);
}

function incrementFoldCounter(id, by = 1) {
	let tabObj = TABS[id];
	FOLDED_SIZE[id] += by;

	tabObj.badgeFold.innerHTML = '';
	tabObj.badgeFold.appendChild(document.createTextNode(FOLDED_SIZE[id]));
	setNodeClass(tabObj.badgeFold, 'hidden', FOLDED_SIZE[id] == 0);
}

function fold(id) {
	if (id != -1 && !getValue(id, 'fold'))
		setValue(id, 'fold', true);
}

function onFold(id) {
	let tabObj = TABS[id];
	setNodeClass(tabObj.childContainer, 'hidden', true)
	updateFoldCounter(id)
	Selected.requireUpdate();
}

function unfold(id) {
	if (getValue(id, 'fold'))
		setValue(id, 'fold', false);
}

function onUnfold(id) {
	let tabObj = TABS[id];
	setNodeClass(tabObj.badgeFold, 'hidden', true);
	setNodeClass(tabObj.childContainer, 'hidden', false)

	Selected.requireUpdate();
}

function findVisibleParent(id) {
	let node = TABS[id].container

	do {
		node = node.parentNode.parentNode;
		id = getId(node)
	} while (id != -1 && !DISPLAYED[id]);

	return id;
}

function inFoldedTree(id) {
	let node = TABS[id].container;

	while (getId(node) != -1) {
		node = node.parentNode.parentNode;
		id = getId(node)
		if (DISPLAYED[id] && getValue(id, 'fold')) {
			return {
				result: true,
				id
			};
		}
	}

	return {
		result: false
	};
}

function unfoldAncestors(id) {
	let node = TABS[id].container;

	while (getId(node) != -1) {
		node = node.parentNode.parentNode;
		id = getId(node)
		unfold(id)
	}
}

function getId(htmlNode) {
	return Number(htmlNode.getAttribute('tabId'))
}

function updateHidden(tab, tabObj) {
	let foldedParent = inFoldedTree(tab.id);
	if (foldedParent.result) {
		incrementFoldCounter(foldedParent.id, tab.hidden ? -1 : 1);
	}

	if (tab.hidden) {
		tabHide(tab.id);
	} else {
		tabShow(tab.id)
		setScrollPosition(tab.id);
	}
	Selected.requireUpdate();
}

function onActivated(id) {
	unfoldAncestors(id);
	if (CURRENT_ACTIVE_NODE != null)
	setNodeClass(CURRENT_ACTIVE_NODE.node, 'active', false);

	CURRENT_ACTIVE_NODE = TABS[id];
	setNodeClass(CURRENT_ACTIVE_NODE.node, 'active', true);
	setScrollPosition(id);
}

function onMoved(tab, parentId, indexInParent) {
	let id = tab.id

	if (!tab.hidden) {
		let foldedParent = inFoldedTree(id);
		if (foldedParent.result)
			incrementFoldCounter(foldedParent.id, -1);
	}
	promoteFirstChild(id)
	let frag = document.createDocumentFragment()
	frag.appendChild(TABS[id].container)
	setAsNthChild(frag, TABS[parentId].childContainer, indexInParent)

	if (tab.active)
		unfoldAncestors(id)

	if (!tab.hidden) {
		let foldedParent = inFoldedTree(id);
		if (foldedParent.result)
			incrementFoldCounter(foldedParent.id);

		setScrollPosition(id);
	}
}

function onRemoved(tab, info, values) {
	tabClose(tab.id);
	Selected.requireUpdate();
}

function onCreated(tab, parentId, indexInParent) {
	let obj = tabNew(tab);
	setAsNthChild(obj.container, TABS[parentId].childContainer, indexInParent)
	let id = tab.id;

	unfoldAncestors(id)
	Selected.requireUpdate();

	if (!tab.hidden)
		setScrollPosition(id);
}

function broadcast(signal) {
	browser.runtime.sendMessage({recipient: -1, type: MSG_TYPE.Signal, signal});
}

function signal(param) {
	switch(param.type) {
	case SIGNAL_TYPE.dragDrop:
		document.getElementById('dropIndicator').style.display = 'none';
		break;
	case SIGNAL_TYPE.selectAll:
		CACHE.forEach(tab => {
			if (tab.hidden)
				return
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

let THROTTLE = Date.now()
let THROTTLE_COUNT = 0

function throttle() {
	if (THROTTLE == 0)
		return true

	let now = Date.now()
	if (THROTTLE == now)
		THROTTLE_COUNT++
	else
		THROTTLE_COUNT = 0

	THROTTLE = now

	if (THROTTLE_COUNT > 20) {
		THROTTLE = 0
		browser.runtime.sendMessage({
			type: MSG_TYPE.Refresh,
			recipient: -1,
			windowId: WINDOW_ID
		});
		return true
	}

	return false
}

function refresh(data) {
	SESSIONS_VALUES = data.values;
	THROTTLE = Date.now()
	THROTTLE_COUNT = 0

	if (TABS[-1])
		TABS[-1].container.remove()

	TABS = {};
	DISPLAYED = {};
	FOLDED_SIZE = {};
	CACHE = []

	// Create a dummy node so we don't have to treat root level tabs in
	// a special way.
	let rootTab = tabNew({
		id: -1
	});
	rootTab.childContainer.style.paddingLeft = 0
	rootTab.node.remove();
	document.body.appendChild(rootTab.container)

	let activeId
	data.tabs.forEach(({tab, parentId, indexInParent}) => {
		CACHE[tab.id] = tab
		let obj = tabNew(tab);
		if (tab.active)
			activeId = tab.id
		setAsNthChild(obj.container, TABS[parentId].childContainer, indexInParent)
	})

	data.tabs.forEach(({tab}) => updateFoldCounter(tab.id))
	onActivated(activeId)
	Selected.requireUpdate();
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
			if (throttle()) break;
			onActivated(msg.tabId);
			break;

		case MSG_TYPE.OnCreated:
			if (throttle()) break;
			CACHE[msg.tab.id] = msg.tab
			onCreated(msg.tab, msg.parentId, msg.indexInParent);
			break;

		case MSG_TYPE.OnMoved:
			if (throttle()) break;
			CACHE[msg.tab.id] = msg.tab
			onMoved(msg.tab, msg.parentId, msg.indexInParent);
			break;

		case MSG_TYPE.OnRemoved:
			if (throttle()) break;
			CACHE[msg.tab.id] = msg.tab
			onRemoved(msg.tab, msg.info, msg.values);
			break;

		case MSG_TYPE.OnUpdated:
			if (throttle()) break;
			CACHE[msg.tab.id] = msg.tab
			onUpdated(msg.tab, msg.info);
			break;

		case MSG_TYPE.Refresh:
			refresh(msg.data)
			break;

		case MSG_TYPE.Signal:
			signal(msg.signal);
			break;

		case MSG_TYPE.SessionsValueUpdated:
			if (TABS[msg.tabId] === undefined)
				return

			if (msg.key != 'fold')
				return

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
			console.log(`Unrecognized msg`, msg);
			break;
	}

	resolve()
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

	DROP_INDICATOR = document.getElementById('dropIndicator');
	let currentWindow = await browser.windows.getCurrent();

	let params = new URLSearchParams(window.location.search);
	WINDOW_ID = params.get(`windowId`) || currentWindow.id;

	document.addEventListener('drop', (event) => {
		onDrop(event, -1);
	}, false);

	document.addEventListener('dragenter', (event) => {
		onDragEnter(event, anchor);
	}, false);

	document.addEventListener('dragover', (event) => {
		event.preventDefault();
		let scroll = document.documentElement.scrollTop;
		DROP_INDICATOR.style.display = 'initial';
		DROP_INDICATOR.style.left = '0px';
		DROP_INDICATOR.style.top = `${TAR_RECT.bottom -1 + scroll}px`;
		DROP_INDICATOR.style.height = `0px`;
		DROP_PARENTING = false;
		DROP_BEFORE = true;
	}, false);

	document.addEventListener('dragend', onDragEnd, false);

	Selected.init(function () {
		let ret = {};

		for (let k in TABS) {
			let tabObj = TABS[k];
			if (k != -1 && DISPLAYED[k])
				ret[Number(k)] = tabObj.node;
		}
		return ret;
	});

	document.addEventListener('contextmenu', async function (event) {
		let container = event.target.closest('.container')
		let tabId;

		if (container == null)
			tabId = getId(CURRENT_ACTIVE_NODE);
		else {
			tabId = Number(container.getAttribute('tabId'));
		}

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

	QUEUE = newSyncQueue({enabled: false});

	browser.runtime.onMessage.addListener((msg, sender, sendResponse) =>
		new Promise((res, rej) => QUEUE.do(sbInternalMessageHandler, msg, sender, res, rej)));

	let msg = await browser.runtime.sendMessage({
		type: MSG_TYPE.Register,
		recipient: -1,
		windowId: WINDOW_ID
	});

	refresh(msg)
	QUEUE.enable();
}

document.addEventListener('DOMContentLoaded', init, false);
