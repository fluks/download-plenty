'use strict';

const mimeFilters = document.querySelectorAll('#mime-types > option');

/**
 * Load settings.
 * @param e {EventTarget}
 */
const loadSettings = async (e) => {
    // Need to be called first.
    await Common.getLocalOptions();

    const options = await browser.storage[Common.localOpts.storageArea].get(null);
    if (!options)
        return;

    mimeFilters.forEach(option => {
        option.selected = options.mimeFilters[option.value];
    });
};

/**
 */
const saveSettings = () => {
    const options = { mimeFilters: {} };
    mimeFilters.forEach(option => {
        options.mimeFilters[option.value] = option.selected;
    });

    chrome.storage[Common.localOpts.storageArea].set(options);
};

/**
 */
const clearColumnSizes = () => {
    browser.storage[Common.localOpts.storageArea].remove('columnSizes');
};

document.addEventListener('DOMContentLoaded', loadSettings);
document.addEventListener('localized', Common.setLangAndDir);
document.querySelector('#default-column-sizes-button').addEventListener('click', clearColumnSizes);
window.addEventListener('blur', saveSettings);
