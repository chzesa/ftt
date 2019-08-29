let SIDEBAR_MENU_PATTERN;
const SUBMENU_TAB_MOVE = [];
const SUBMENU_TAB_MOVE_MAP = {};
const SUBMENU_REOPEN_CONTAINER = [];
let SIDEBAR_CONTEXT_IS_PLURAL = false;

function menuUpdate(tabId, plural = false) {
	let tab = CACHE.get(tabId);

	if (SIDEBAR_CONTEXT_IS_PLURAL != plural) {
		if (plural) updateMenuItemsPlural();
		else updateMenuItemsSingular();
		SIDEBAR_CONTEXT_IS_PLURAL = plural;
	}

	return updateMoveToWindowSubmenu(tab.windowId);
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
async function updateMoveToWindowSubmenu(excludeWindowId) {
	let count = 0;

	CACHE.forEachWindow(windowId => {
		if (windowId == excludeWindowId) return;
		let menuIndex = count++
		let info = SUBMENU_TAB_MOVE[menuIndex];

		let numTabs = CACHE.debug().windows[windowId].length;
		let activeInWindow = CACHE.getActive(windowId);

		let title = numTabs > 1
			? browser.i18n.getMessage("sidebarContextMenuMoveToExistingWindowPlural", [windowId, numTabs, activeInWindow.title])
			: browser.i18n.getMessage("sidebarContextMenuMoveToExistingWindow", [windowId, activeInWindow.title]);

		if (info == null) {
			info = menuCreateInfo(`moveToWindow${menuIndex}`, title,menuActionMoveToWindow, 'move');
			SUBMENU_TAB_MOVE.push(info);
			browser.menus.create(info);
		} else {
			browser.menus.update(info.id, {
				title,
				visible: true
			});
		}

		SUBMENU_TAB_MOVE_MAP[info.id] = windowId;
	});

	for (let i = count; i < SUBMENU_TAB_MOVE.length; i++) {
		browser.menus.update(SUBMENU_TAB_MOVE[i].id, {
			visible: false
		});
	}
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

	let windowId = SUBMENU_TAB_MOVE_MAP[info.menuItemId];

	storeArrayRelationData(tab.windowId, ids);

	browser.tabs.move(ids, {
		windowId,
		index: -1
	});
}

async function createSidebarContext() {
	SIDEBAR_MENU_PATTERN = browser.runtime.getURL('sidebar.html');

	// todo move to separate file
	const SIGNALS = {
		dragDrop: 0,
		selectAll: 1,
		deselectAll: 2
	};

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
		sidebar(tab.windowId, 'signal', {type: SIGNALS.selectAll});
	}));

	browser.menus.create(menuCreateInfo('deselect', i18nSidebarContextMenuClearSelection, (info, tab) => {
		sidebar(tab.windowId, 'signal', {type: SIGNALS.deselectAll});
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

	// browser.menus.create(menuCreateInfo('reopen', 'Reopen in Container', (info, tab) => {

	// }));

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