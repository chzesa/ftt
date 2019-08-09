const tabs = (function () {
	let self = {};
	let tab_pool = [];
	let tabs = {};

	self.inner = function () {
		return tabs;
	}

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

			let faviconSvg = new_element('img', {
				class: 'favicon'
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
			}, [context, faviconSvg, favicon, badgeFold, nodeTitle, badgeMute]);

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

			node.addEventListener('dragover', (event) => {
				onDragOver(event);
			}, false);

			node.addEventListener('dragend', (event) => {
				onDragEnd(event);
			}, false);

			obj.container = container;
			obj.node = node;
			obj.childContainer = children;

			obj.favicon = favicon;
			obj.faviconSvg = faviconSvg;
			obj.title = nodeTitle;
			obj.badgeFold = badgeFold;
			obj.badgeMute = badgeMute;
			obj.context = context;
		}

		obj.id = tab.id;
		obj.container.setAttribute('tabId', tab.id);
		tabs[tab.id] = obj;

		setNodeClass(obj.badgeFold, 'hidden', true);
		setNodeClass(obj.node, 'selection', false); // todo: decouple

		// refresh
		updateTitle(tab, obj);
		updateDiscarded(tab, obj);
		updateMute(tab, obj);
		updateContextualIdentity(tab, obj);

		// favicon handled in updateStatus
		// updateFaviconUrl(tab, obj);
		// updatePinned(tab, obj);
		setNodeClass(obj.node, 'pinned', tab.pinned);
		updateStatus(tab, obj);

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
