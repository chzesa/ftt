let SIDEBAR_MENU_PATTERN;
let SIDEBAR_CONTEXT_IS_PLURAL = false;
const DYNAMIC_MAP = {};
let SUBMENU_MOVE_WINDOW;
let SUBMENU_REOPEN_CONTAINER;

function dynamicSubmenu(menuPrefix, parentId, iteratorFn, filterFn, titleFn, iconFn, mapFn, onclick) {
	let array = [];
	let state = [];
	let ret = { array, state }

	ret.update = param => {
		let count = 0;
		let changed = false;

		let a = iteratorFn(param);

		a.forEach(v => {
			if (!filterFn(v, param)) { return; }
			let title = titleFn(v, param);
			let icons = iconFn(v, param);

			let menuIndex = count++;
			let info = array[menuIndex];

			if (info == null) {
				info = {
					id: `${menuPrefix}${menuIndex}`
					, title
					, contexts: ['tab']
					, onclick
					, parentId
				};

				if (icons["16"] != null) { info.icons = icons; }

				array.push(info);
				browser.menus.create(info);
				state[menuIndex] = { visible: true, title, icons };
				changed = true;
			} else {
				if (!state[menuIndex].visible
					|| state[menuIndex].title != title
					|| state[menuIndex].icons["16"] != icons["16"]
					|| state[menuIndex].icons["32"] != icons["32"]) {
					changed = true;

					state[menuIndex].visible = true;
					state[menuIndex].title = title;
					state[menuIndex].icons = icons;

					let updateInfo = {
						title,
						visible: true
					};

					if (icons["16"] != null) { updateInfo.icons = icons; }

					browser.menus.update(info.id, updateInfo);
				}
			}

			DYNAMIC_MAP[info.id] = mapFn(v, param);
		});

		for (let i = count; i < array.length; i++) {
			if (state[i].visible) {
				changed = true;
				state[i].visible = false;
				browser.menus.update(array[i].id, {
					visible: false
				});
			}
		}

		return changed;
	}

	return ret;
}
function menuUpdate(tabId, plural = false) {
	let tab = CACHE.get(tabId);
	let changed = false;
	if (SIDEBAR_CONTEXT_IS_PLURAL != plural) {
		if (plural) updateMenuItemsPlural();
		else updateMenuItemsSingular();
		SIDEBAR_CONTEXT_IS_PLURAL = plural;
		changed = true;
	}

	changed = SUBMENU_MOVE_WINDOW.update(tab) || changed;
	changed = SUBMENU_REOPEN_CONTAINER.update(tab) || changed;

	if ( changed ) { browser.menus.refresh(); }
}

function updateMenuItemsPlural() {
	browser.menus.update('reload', { title: i18nSidebarContextMenuReloadTabPlural });
	browser.menus.update('mute', { title: i18nSidebarContextMenuMuteTabPlural });
	browser.menus.update('pin', { title: i18nSidebarContextMenuPinTabPlural });
	browser.menus.update('duplicate', { title: i18nSidebarContextMenuDuplicateTabPlural });
	browser.menus.update('bookmark', { title: i18nSidebarContextMenuBookmarkTabPlural });
	browser.menus.update('move', { title: i18nSidebarContextMenuMoveTabPlural });
	browser.menus.update('unload', { title: i18nSidebarContextMenuUnloadTabPlural });
	browser.menus.update('close', { title: i18nSidebarContextMenuCloseTabPlural });
}

function updateMenuItemsSingular() {
	browser.menus.update('reload', { title: i18nSidebarContextMenuReloadTab });
	browser.menus.update('mute', { title: i18nSidebarContextMenuMuteTab });
	browser.menus.update('pin', { title: i18nSidebarContextMenuPinTab });
	browser.menus.update('duplicate', { title: i18nSidebarContextMenuDuplicateTab });
	browser.menus.update('bookmark', { title: i18nSidebarContextMenuBookmarkTab });
	browser.menus.update('move', { title: i18nSidebarContextMenuMoveTab });
	browser.menus.update('unload', { title: i18nSidebarContextMenuUnloadTab });
	browser.menus.update('close', { title: i18nSidebarContextMenuCloseTab });
}

async function menuGetSelection(tab) {
	let sb = SIDEBARS[tab.windowId];
	let selection;
	if (sb != null) {
		try {
			selection = await getSelectionFromSourceWindow(tab.windowId);
			selection.sort((idA, idB) =>
				CACHE.get(idA).index - CACHE.get(idB).index
			);
		} catch(e) {
			console.log(e);
		}
	}

	if (selection == null || selection.length == 0) {
		selection = [tab.id];
	}

	return selection;
}

function menuCreateInfo(id, title, callback, parentId) {
	let info =  {
		id
		, title
		, contexts: ['tab']
		, viewTypes: ['sidebar']
		, documentUrlPatterns: [SIDEBAR_MENU_PATTERN]
		, onclick: callback
		, parentId
	};

	return info;
}

async function menuActionMoveToWindow(info, tab) {
	let ids = await menuGetSelection(tab);

	let windowId = DYNAMIC_MAP[info.menuItemId];

	storeArrayRelationData(tab.windowId, ids);

	browser.tabs.move(ids, {
		windowId,
		index: -1
	});
}

function reopenInContainer(ids, cookieStoreId) {
	let p = [];
	let count = 0;

	ids.forEach(id => {
		let tab = CACHE.get(id);

		p.push(browser.tabs.create({
			active: tab.active,
			cookieStoreId,
			index: tab.index + 1 + count++,
			openerTabId: tab.openerTabId,
			pinned: tab.pinned,
			url: tab.url,
			windowId: tab.windowId
		}));
	});

	for (let i = 0; i < ids.length; i++) {
		p[i].then(() => browser.tabs.remove(ids[i]))
			.catch(e => console.log(e))
	}
}

async function createSidebarContext() {
	SIDEBAR_MENU_PATTERN = browser.runtime.getURL('sidebar.html');

	SUBMENU_MOVE_WINDOW = await dynamicSubmenu(`moveToWindow`, `move`,
		() => {
			let r = [];
			CACHE.forEachWindow(w => r.push(w));
			return r;
		},
		(windowId, tab) => windowId != tab.windowId,
		(windowId, tab) => {
			let numTabs = CACHE.debug().windows[windowId].length;
			let activeInWindow = CACHE.getActive(windowId);
			return numTabs == 1
				? browser.i18n.getMessage(`sidebarContextMenuMoveToExistingWindow`, [windowId, activeInWindow.title])
				: browser.i18n.getMessage(`sidebarContextMenuMoveToExistingWindowPlural`, [windowId, numTabs, activeInWindow.title]);
		},
		_ => {return {}; },
		(windowId, tab) => windowId,
		menuActionMoveToWindow
	);

	SUBMENU_REOPEN_CONTAINER = await dynamicSubmenu(`reopen`, `reopen`,
		() => {
			let r = [];
			let ret = Object.keys(CI_CACHE).forEach(ci => r.push(ci));
			return r;
		},
		() => true,
		(key, tab) => CI_CACHE[key].name,
		(key, tab) => {
			let ret = {};
			let ci = CI_CACHE[key];
			ret["16"] = ci.iconUrl;
			return ret;
		},
		(key, tab) => CI_CACHE[key].cookieStoreId,
		async (info, tab) => {
			let ids = await menuGetSelection(tab);
			if (ids.length == 0) { return; }

			QUEUE.do(async () => {
				reopenInContainer(ids, DYNAMIC_MAP[info.menuItemId]);
			});
		}
	);

	browser.menus.create(menuCreateInfo('reload', i18nSidebarContextMenuReloadTab, async (info, tab) => {
		(await menuGetSelection(tab)).forEach(id => browser.tabs.reload(id));
	}));

	browser.menus.create(menuCreateInfo('mute', i18nSidebarContextMenuMuteTab, async (info, tab) => {
		(await menuGetSelection(tab)).forEach(id => {
			browser.tabs.get(id).then(tab => {
				browser.tabs.update(id, {
					muted: tab.mutedInfo == null ? true : !tab.mutedInfo.muted
				});
			});
		});
	}));

	browser.menus.create(menuCreateInfo('pin', i18nSidebarContextMenuPinTab, async (info, tab) => {
		let ids = await menuGetSelection(tab);

		QUEUE.do(async () => {
			let pinned = !CACHE.get(ids[0]).pinned;
			let tree = TREE[tab.windowId];

			ids.forEach(id => {
				let node = tree.get(id);
				if (pinned && node != null) {
					let children = node.childNodes.slice(0);
					tree.promoteFirstChild(id);
					children.forEach(child =>
						CACHE.setValue(child.id, 'parentPid', toPid(child.parentId)));
				}

				browser.tabs.update(id, {
					pinned
				});
			});
		});
	}));

	browser.menus.create(menuCreateInfo('duplicate', i18nSidebarContextMenuDuplicateTab, async (info, tab) => {
		(await menuGetSelection(tab)).forEach(id => browser.tabs.duplicate(id));
	}));

	let separator = menuCreateInfo();
	separator.type = 'separator';

	browser.menus.create(separator);

	browser.menus.create(menuCreateInfo('select', i18nSidebarContextMenuSelectAllTabs, (info, tab) => {
		sidebar(tab.windowId, 'signal', {type: SIGNAL_TYPE.selectAll});
	}));

	browser.menus.create(menuCreateInfo('deselect', i18nSidebarContextMenuClearSelection, (info, tab) => {
		sidebar(tab.windowId, 'signal', {type: SIGNAL_TYPE.deselectAll});
	}));

	browser.menus.create(menuCreateInfo('bookmark', i18nSidebarContextMenuBookmarkTab, async (info, tab) => {
		(await menuGetSelection(tab)).forEach(id => {
			browser.tabs.get(id).then(tab => {
				browser.bookmarks.create({
					title: tab.title
					, url: tab.url
				});
			});
		});
	}));

	browser.menus.create(menuCreateInfo('reopen', i18nSidebarContextMenuReopenInContainer, null));

	browser.menus.create(menuCreateInfo('reopenInNewContainer', i18nSidebarContextMenuReopenInNewContainer, async (info, tab) => {
		const colors = ['blue', 'turquoise', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'toolbar'];
		const icons = ['fingerprint', 'briefcase', 'dollar', 'cart', 'circle', 'gift', 'vacation', 'food', 'fruit', 'pet', 'tree', 'chill', 'fence'];

		let ids = await menuGetSelection(tab);
		if (ids.length == 0) { return; }

		QUEUE.do(async () => {
			let ci = await browser.contextualIdentities.create({
				name: `New Container`,
				color: colors[Math.floor(Math.random() * colors.length)],
				icon: icons[Math.floor(Math.random() * icons.length)]
			});

			reopenInContainer(ids, ci.cookieStoreId);
		});
	}, 'reopen'));

	let reopenSeparator = menuCreateInfo(null, null, null, 'reopen');
	reopenSeparator.type = 'separator';
	browser.menus.create(reopenSeparator);

	browser.menus.create(menuCreateInfo('move', i18nSidebarContextMenuMoveTab, null));

	browser.menus.create(menuCreateInfo('moveToStart', i18nSidebarContextMenuMoveToStart, async (info, tab) => {
		let index = 0;
		let windowId = tab.windowId;

		if (!tab.pinned) {
			while(true) {
				if (CACHE.getIndexed(windowId, index).pinned == false ) {
					break;
				}

				index++;
			}
		}

		let ids = await menuGetSelection(tab);
		storeArrayRelationData(windowId, ids);

		browser.tabs.move(ids, {
			index,
			windowId
		});
	}, 'move'));

	browser.menus.create(menuCreateInfo('moveToEnd', i18nSidebarContextMenuMoveToEnd, async (info, tab) => {
		let windowId = tab.windowId;
		let ids = await menuGetSelection(tab);
		storeArrayRelationData(windowId, ids);

		browser.tabs.move(ids, {
			index: -1,
			windowId,
		});
	}, 'move'));

	browser.menus.create(menuCreateInfo('moveToNewWindow', i18nSidebarContextMenuMoveToNewWindow, async (info, tab) => {
		let ids = await menuGetSelection(tab);
		storeArrayRelationData(tab.windowId, ids);
		let tabId = ids.shift();

		browser.windows.create({
			tabId
		}).then(window => {
			bug1394477Workaround(ids, window.id, 1);
		});
	}, 'move'));

	let moveSeparator = menuCreateInfo(null, null, null, 'move');
	moveSeparator.type = 'separator';
	browser.menus.create(moveSeparator);

	// browser.menus.create(menuCreateInfo('send', 'Send Tab to Device', (info, tab) => {

	// }));

	browser.menus.create(separator);

	browser.menus.create(menuCreateInfo('unload', i18nSidebarContextMenuUnloadTab, async (info, tab) => {
		browser.tabs.discard(await menuGetSelection(tab));
	}));

	browser.menus.create(menuCreateInfo('close', i18nSidebarContextMenuCloseTab, async (info, tab) => {
		let selection = (await menuGetSelection(tab)).reverse();
		let activeId = CACHE.getActive(tab.windowId).id;
		let activeTabIndex = selection.indexOf(activeId);

		if (activeTabIndex != -1) {
			selection.splice(activeTabIndex, 1);
			selection.push(activeId);
		}

		browser.tabs.remove(selection);
	}));
}