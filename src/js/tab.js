const tabs = (function () {
	let self = {};
	let tab_pool = [];
	let tabs = {};

	self.inner = function () {
		return tabs;
	}

	let parenting = false;
	let dragIndicator = document.getElementById('dragIndicator');
	let tarRect;
	let blacklist;
	let dropBefore;

	self.addElement = function(tab) {
		let obj = tabs[tab.id];
		if (obj != null) {
			return obj;
		}

		obj = tab_pool.pop();

		if (obj == null) {
			obj = {};

			let nodeTitle = new_element('div', {
				class: 'tabTitle'
			});

			let favicon = new_element('div', {
				class: 'favicon'
			});

			let context = new_element('div', {
				class: 'context'
			});

			let badgeFold = new_element('div', {
				class: 'badge fold hidden'
			});

			let badgeMute = new_element('div', {
				class: 'badge mute hidden'
			});

			let node = new_element('div', {
				class: 'tab'
				, draggable: 'true'
			}, [context, favicon, badgeFold, nodeTitle, badgeMute]);

			let children = new_element('div', {
				class: 'childContainer'
			});

			let container = new_element('div', {
				class: 'container'
			}, [node, children]);

			let lastMouseUp = 0;

			node.addEventListener('mousedown', async function (event) {
				if (event.button == 1) {
					event.stopPropagation();
					event.preventDefault();
					browser.tabs.remove(obj.id);
					return;
				}
				if (event.button != 0 || !event.ctrlKey) return;
				Selected.start(event);
			})

			node.addEventListener('mouseup', async function (event) {
				// if (event.button != 0 || event.ctrlKey) return;
				if (Selected.active()) {
					Selected.stop();
					return;
				}

				event.stopPropagation();

				let tabId = obj.id;
				let time = Date.now();

				if (time - lastMouseUp < 300) {
					lastMouseUp = 0;

					if (CACHE.getValue(tabId, 'fold')) unfold(tabId);
					else fold(tabId);
					return;
				}
				else {
					lastMouseUp = time;
				}

				if (event.button == 0) {
					browser.tabs.update(tabId, {
						active: true
					});
				}
			}, false);

			node.addEventListener('dragstart', function (e) {
				if (event.ctrlKey) return;
				if (dragIndicator == null) dragIndicator = document.getElementById('dragIndicator');
				let tabId = obj.id;
				e.dataTransfer.setData('number', tabId);
				BACKGROUND_PAGE.setSelectionSourceWindow(WINDOW_ID);
				Selected.clear();
				Selected.add(tabId);

				dragIndicator.style.display = 'initial';
			}, false);

			node.addEventListener('drop', async function (e) {
				e.preventDefault();
				dragIndicator.style.display = 'none';
				let thisId = obj.id;

				let selection;
				let sourceWindowId = BACKGROUND_PAGE.getSelectionSourceWindow();
				if (sourceWindowId == WINDOW_ID) {
					selection = Selected.get();
					Selected.clear();
				} else {
					selection = BACKGROUND_PAGE.getSelectionFromSourceWindow();
				}

				if (parenting) {
					if (selection.length > 1) {
						BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.sidebarDropParenting,
							selection, thisId, WINDOW_ID);
					}
					else {
						BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.sidebarDropParenting,
							selection[0], thisId, WINDOW_ID);
					}
				}
				else {
					if (selection.length > 1) {
						BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.sidebarDropMoving,
							selection, thisId, dropBefore, WINDOW_ID);
					}
					else {
						BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.sidebarDropMoving,
							selection[0], thisId, dropBefore, WINDOW_ID);
					}
				}

				BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.broadcast,
					{ type: SIGNALS.dragDrop });
			}, false);

			node.addEventListener('dragenter', function (e) {
				e.preventDefault();
				tarRect = node.getBoundingClientRect();
			}, false);

			node.addEventListener('dragover', function (e) {
				e.preventDefault();
				if (dragIndicator == null) dragIndicator = document.getElementById('dragIndicator');
				dragIndicator.style.display = 'initial';
				dragIndicator.style.left = '0px';
				let scroll = document.documentElement.scrollTop;

				if (e.y < tarRect.top + 7) {
					dragIndicator.style.top = `${tarRect.top - 1 + scroll}px`;
					dragIndicator.style.height = `0px`;
					parenting = false;
					dropBefore = true;
				}
				else if (e.y > tarRect.bottom - 7) {
					dragIndicator.style.top = `${tarRect.bottom -1 + scroll}px`;
					dragIndicator.style.height = `0px`;
					parenting = false;
					dropBefore = false;
				}
				else {
					dragIndicator.style.height = `${tarRect.height}px`;
					dragIndicator.style.top = `${tarRect.top + scroll}px`;
					parenting = true;
				}
			}, false);

			node.addEventListener('dragend', function (e) {
				dragIndicator.style.display = 'none';
				BACKGROUND_PAGE.enqueueTask(BACKGROUND_PAGE.broadcast,
					{ type: SIGNALS.dragDrop });
			}, false);

			obj.container = container;
			obj.node = node;
			obj.childContainer = children;

			obj.favicon = favicon;
			obj.title = nodeTitle;
			obj.badgeFold = badgeFold;
			obj.badgeMute = badgeMute;
			obj.context = context;
		}

		obj.id = tab.id;
		obj.container.setAttribute('tabId', tab.id);
		tabs[tab.id] = obj;

		setNodeClass(obj.badgeFold, 'hidden', true);
		setNodeClass(obj.badgeMute, 'hidden', true);
		setNodeClass(obj.node, 'selection', false); // todo: decouple

		// refresh
		updateTitle(tab, obj);
		updateFaviconUrl(tab, obj);
		updateDiscarded(tab, obj);
		updateMute(tab, obj);
		updateContextualIdentity(tab, obj);
		updatePinned(tab, obj);

		return obj;
	}
	self.get = function (id) {
		return tabs[id];
	}

	self.new = function (tab) {
		return self.addElement(tab);
	}

	self.delete = function (id) {
		releaseElement(id);
	}

	self.release = function (id) {
		releaseElement(id);
	}

	self.releaseDirty = function(ids) {
		function handleRelease(id, frag) {
			let obj = tabs[id];
			if (obj == null) return;
			delete tabs[id];
			frag.appendChild(obj.container);
			tab_pool.push(obj);
		}

		if (Array.isArray(ids)) {
			let frag = document.createDocumentFragment();

			ids.forEach(id => {
				handleRelease(id, frag);
			});

			HIDDEN_ANCHOR.appendChild(frag);
		} else {
			handleRelease(ids, HIDDEN_ANCHOR);
		}
	}

	function releaseElement(id) {
		let obj = tabs[id];
		if (obj == null) return;
		delete tabs[id];

		let children = obj.childContainer.children;
		let newParent;
		if (children.length > 0) {
			newParent = children[0];
			obj.container.parentNode.insertBefore(newParent, obj.container);
		}

		if (children.length > 0) {
			let frag = document.createDocumentFragment();

			while (children.length > 0) {
				frag.appendChild(children[0]);
			}

			newParent.children[1].appendChild(frag);
		}

		HIDDEN_ANCHOR.appendChild(obj.container);
		tab_pool.push(obj);
	}

	return self;
})();
