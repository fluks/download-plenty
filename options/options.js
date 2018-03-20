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
    const options = await browser.storage.sync.get(null);
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

    chrome.storage.sync.set(options);

    saveNotification.style.visibility = 'visible';
    setTimeout(() => {
        saveNotification.style.visibility = 'hidden';
    }, 2000);
};

document.addEventListener('DOMContentLoaded', loadSettings);
saveButton.addEventListener('click', saveSettings);
