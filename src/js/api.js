const SIGNAL_TYPE = {
	dragDrop: 0
	, selectAll: 1
	, deselectAll: 2
	, configUpdate: 3
};

const MSG_TYPE = {
	Register: 0
	, DropMoving: 1
	, DropParenting: 2
	, GetSelection: 3
	, SetSelectionSource: 4
	, OnActivated: 5
	, OnCreated: 6
	, OnMoved: 7
	, OnRemoved: 8
	, OnUpdated: 9
	, UpdateSidebarContextMenu: 10
	, Signal: 11
	, GetSelectionSource: 12
	, SessionsValueUpdated: 13
	, ConfigUpdate: 14
	, ClearData: 15
	, Refresh: 16
	, OnParentChanged: 17
};

const DescendantOpenPosition = {
	Default: 0
	, First: 1
	, Last: 2
};

const ThemeOption = {
	Light: 0
	, Dark: 1
	, None: 2
	, Classic: 3
}