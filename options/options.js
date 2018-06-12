'use strict';

const
    saveButton = document.querySelector('#save-button'),
    saveNotification = document.querySelector('#save-notification'),
    mimeFilters = document.querySelectorAll('#mime-types > option');
let g_localOpts;

/**
 * Get local options (platform info). Sets g_localOpts global variable.
 */
const getLocalOptions = async () => {
    g_localOpts = await browser.storage.local.get(null);
};

/**
 * Load settings.
 * @param e {EventTarget}
 */
const loadSettings = async (e) => {
    // Need to be called first.
    await getLocalOptions();

    const options = await browser.storage[g_localOpts.storageArea].get(null);
    if (!options)
        return;

    mimeFilters.forEach(option => {
        option.selected = options.mimeFilters[option.value];
    });
};

/**
 * Save settings.
 * @param e {EventTarget}
 */
const saveSettings = (e) => {
    e.preventDefault();

    const options = { mimeFilters: {} };
    mimeFilters.forEach(option => {
        options.mimeFilters[option.value] = option.selected;
    });

    chrome.storage[g_localOpts.storageArea].set(options);

    saveNotification.style.visibility = 'visible';
    setTimeout(() => {
        saveNotification.style.visibility = 'hidden';
    }, 2000);
};

document.addEventListener('DOMContentLoaded', loadSettings);
document.addEventListener('localized', common_setLangAndDir);
saveButton.addEventListener('click', saveSettings);
