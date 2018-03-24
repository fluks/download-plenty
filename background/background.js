'use strict';

/**
 * Set default options on install an update.
 * @param details {Object}
 */
const setOptions = (details) => {
    if (details.reason === 'install') {
        const defaultOptions = {
            mimeFilters: {
                application: true,
                audio: true,
                font: true,
                image: true,
                message: true,
                model: true,
                multipart: true,
                text: true,
                video: true,
            }
        };
        chrome.storage.sync.set(defaultOptions);
    }
    // Add new default options here also. For future use.
    else if (details.reason === 'update') {
    }
};

/**
 * @param port {}
 * @param progressInterval {}
 */
const sendProgress = (port, progressInterval) => {
    chrome.downloads.search({}, (downloads) => {

        downloads.forEach(dl => {
            if (dl.state === 'in_progress' || dl.state === 'complete') {
                port.postMessage({
                    state: dl.state,
                    url: dl.url,
                    bytesReceived: dl.bytesReceived,
                    timeLeft: dl.estimatedEndTime,
                });
            }
        });
    });
};

/**
 * @param port {}
 */
const download = (port) => {
    if (port.name !== 'download')
        return;

    let progressInterval = null;
    port.onMessage.addListener(msg => {
        if (msg.start) {
            chrome.downloads.download({
                url: msg.url,
            });

            if (!progressInterval) {
                progressInterval = setInterval(() =>
                    sendProgress(port, progressInterval), 250);
            }
        }
        else if (msg.pause) {
        }
        else if (msg.resume) {
        }
        else if (msg.stop) {
        }
    });
};

/**
 * Execute content script and open downloads tab.
 * @param tab {tabs.Tab}
 */
const openDownloadsTab = (tab) => {
    chrome.tabs.executeScript(tab.id, {
        file: 'content_scripts/content_script.js',
    });

    const url = 'download_popup/popup.html?' +
        'orig_tab_id=' + tab.id + '&' +
        'orig_url=' + tab.url;
    chrome.tabs.create({
        url: chrome.runtime.getURL(url),
        index: tab.index + 1,
    });
};

chrome.runtime.onInstalled.addListener(setOptions);
chrome.runtime.onConnect.addListener(download);

chrome.browserAction.onClicked.addListener(openDownloadsTab);
