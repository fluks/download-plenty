'use strict';

const
    saveButton = document.querySelector('#save-button'),
    saveNotification = document.querySelector('#save-notification'),
    mimeFilters = document.querySelectorAll('#mime-types > option');

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
 * Save settings.
 * @param e {EventTarget}
 */
const saveSettings = (e) => {
    e.preventDefault();

    const options = { mimeFilters: {} };
    mimeFilters.forEach(option => {
        options.mimeFilters[option.value] = option.selected;
    });

    chrome.storage[Common.localOpts.storageArea].set(options);
};

    saveNotification.style.visibility = 'visible';
    setTimeout(() => {
        saveNotification.style.visibility = 'hidden';
    }, 2000);
};

document.addEventListener('DOMContentLoaded', loadSettings);
saveButton.addEventListener('click', saveSettings);
document.addEventListener('localized', Common.setLangAndDir);
