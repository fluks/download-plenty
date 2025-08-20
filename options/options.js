'use strict';

const g_mimeFilters = document.querySelectorAll('#mime-types > option');

/**
 * @async
 * @param e {EventTarget}
 */
const loadSettings = async (e) => {
    // Need to be called first.
    await Common.getLocalOptions();

    const options = await browser.storage[Common.localOpts.storageArea].get(null);
    if (!options)
        return;

    g_mimeFilters.forEach(option => {
        option.selected = options.g_mimeFilters[option.value];
    });
};

/**
 */
const saveSettings = () => {
    const options = { g_mimeFilters: {} };
    g_mimeFilters.forEach(option => {
        options.g_mimeFilters[option.value] = option.selected;
    });

    chrome.storage[Common.localOpts.storageArea].set(options);
};

/**
 * Set column sizes back to default.
 */
const clearColumnSizes = () => {
    browser.storage[Common.localOpts.storageArea].remove('columnSizes');
};

document.addEventListener('DOMContentLoaded', loadSettings);
document.addEventListener('localized', Common.setLangAndDir);
document.querySelector('#default-column-sizes-button').addEventListener('click', clearColumnSizes);
window.addEventListener('blur', saveSettings);
