let i18nSidebarContextMenuReloadTab;
let i18nSidebarContextMenuReloadTabPlural;
let i18nSidebarContextMenuMuteTab;
let i18nSidebarContextMenuMuteTabPlural;
let i18nSidebarContextMenuPinTab;
let i18nSidebarContextMenuPinTabPlural;
let i18nSidebarContextMenuDuplicateTab;
let i18nSidebarContextMenuDuplicateTabPlural;
let i18nSidebarContextMenuSelectAllTabs;
let i18nSidebarContextMenuClearSelection;
let i18nSidebarContextMenuBookmarkTab;
let i18nSidebarContextMenuBookmarkTabPlural;
let i18nSidebarContextMenuMoveTab;
let i18nSidebarContextMenuMoveTabPlural;
let i18nSidebarContextMenuUnloadTab;
let i18nSidebarContextMenuUnloadTabPlural;
let i18nSidebarContextMenuCloseTab;
let i18nSidebarContextMenuCloseTabPlural;
let i18nSidebarContextMenuMoveToStart;
let i18nSidebarContextMenuMoveToEnd;
let i18nSidebarContextMenuMoveToNewWindow;

function getLocalizedStrings() {
	let lang = browser.i18n.getUILanguage();

	i18nSidebarContextMenuReloadTab = browser.i18n.getMessage("sidebarContextMenuReloadTab");
	i18nSidebarContextMenuReloadTabPlural = browser.i18n.getMessage("sidebarContextMenuReloadTabPlural");

	i18nSidebarContextMenuMuteTab = browser.i18n.getMessage("sidebarContextMenuMuteTab");
	i18nSidebarContextMenuMuteTabPlural = browser.i18n.getMessage("sidebarContextMenuMuteTabPlural");

	i18nSidebarContextMenuPinTab = browser.i18n.getMessage("sidebarContextMenuPinTab");
	i18nSidebarContextMenuPinTabPlural = browser.i18n.getMessage("sidebarContextMenuPinTabPlural");

	i18nSidebarContextMenuDuplicateTab = browser.i18n.getMessage("sidebarContextMenuDuplicateTab");
	i18nSidebarContextMenuDuplicateTabPlural = browser.i18n.getMessage("sidebarContextMenuDuplicateTabPlural");

	i18nSidebarContextMenuSelectAllTabs = browser.i18n.getMessage("sidebarContextMenuSelectAllTabs");
	i18nSidebarContextMenuClearSelection = browser.i18n.getMessage("sidebarContextMenuClearSelection");

	i18nSidebarContextMenuBookmarkTab = browser.i18n.getMessage("sidebarContextMenuBookmarkTab");
	i18nSidebarContextMenuBookmarkTabPlural = browser.i18n.getMessage("sidebarContextMenuBookmarkTabPlural");

	i18nSidebarContextMenuMoveTab = browser.i18n.getMessage("sidebarContextMenuMoveTab");
	i18nSidebarContextMenuMoveTabPlural = browser.i18n.getMessage("sidebarContextMenuMoveTabPlural");

	i18nSidebarContextMenuUnloadTab = browser.i18n.getMessage("sidebarContextMenuUnloadTab");
	i18nSidebarContextMenuUnloadTabPlural = browser.i18n.getMessage("sidebarContextMenuUnloadTabPlural");

	i18nSidebarContextMenuCloseTab = browser.i18n.getMessage("sidebarContextMenuCloseTab");
	i18nSidebarContextMenuCloseTabPlural = browser.i18n.getMessage("sidebarContextMenuCloseTabPlural");

	i18nSidebarContextMenuMoveToStart = browser.i18n.getMessage("sidebarContextMenuMoveToStart");
	i18nSidebarContextMenuMoveToEnd = browser.i18n.getMessage("sidebarContextMenuMoveToEnd");
	i18nSidebarContextMenuMoveToNewWindow = browser.i18n.getMessage("sidebarContextMenuMoveToNewWindow");
}