'use strict';

const g_mimeFilters = document.querySelectorAll('#mime-types > option');

/**
 * @async
 */
const loadSettings = async () => {
    // Need to be called first.
    await Common.getLocalOptions();

    const options = await browser.storage[Common.localOpts.storageArea].get(null);
    if (!options)
        return;

    g_mimeFilters.forEach(o => {
        o.selected = options.mimeFilters[o.value];
    });
};

/**
 */
const saveSettings = () => {
    const mimeFilters = {};
    g_mimeFilters.forEach(o => {
        mimeFilters[o.value] = o.selected;
    });

    browser.storage[Common.localOpts.storageArea].set({ mimeFilters: mimeFilters, });
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
