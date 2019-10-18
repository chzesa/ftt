async function init() {
	let config = await browser.storage.local.get();

	let debug_mode_toggle = document.getElementById('debug_mode');
	debug_mode_toggle.checked = config.debug_mode || false;

	debug_mode_toggle.addEventListener('click', function (event) {
		browser.storage.local.set({
			debug_mode: debug_mode_toggle.checked
		}).then(_ => browser.runtime.reload());
	});
}

document.addEventListener('DOMContentLoaded', init, false);