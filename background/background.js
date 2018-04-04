'use strict';

let
    /* sync or local for Android. */
    g_storageArea,
    g_os;

/**
 * Find out platform (mainly whether we're on Android or not) and set
 * g_storageArea and g_os global variables.
 */
const getPlatform = async () => {
    const platform = await browser.runtime.getPlatformInfo();
    g_os = platform.os;
    switch (platform.os) {
        case 'android':
            g_storageArea = 'local';
            break;
        default:
            g_storageArea = 'sync';
    }
};

/**
 * Set default options on install and update.
 * @param details {Object}
 */
const setOptions = async (details) => {
    const localOptions = {
        storageArea: g_storageArea,
        os: g_os,
    };
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
        browser.storage[g_storageArea].set(defaultOptions);
        // New options.
        browser.storage.local.set(localOptions);
    }
    // Add new options here also.
    else if (details.reason === 'update') {
        browser.storage.local.set(localOptions);
    }
};

/**
 * Send progress of downloads to downloads page. Stop this progress sender
 * when there are no active downloads.
 * @param port {}
 * @param progressInterval {Number} Progress interval's id.
 * @param startTimeInterval {Date} Start time of the first download in a
 * session.
 */
const sendProgress = (port, progressInterval, startTimeInterval) => {
    chrome.downloads.search({ startedAfter: startTimeInterval },
            (downloads) => {

        let inProgressDls = 0;
        downloads.forEach(dl => {
            if (dl.state === 'in_progress') {
                port.postMessage({
                    state: dl.state,
                    url: dl.url,
                    bytesReceived: dl.bytesReceived,
                    timeLeft: dl.estimatedEndTime,
                });
                inProgressDls++;
            }
            else if (dl.state === 'complete') {
                port.postMessage({
                    state: dl.state,
                    url: dl.url,
                    bytesReceived: dl.bytesReceived,
                    timeLeft: dl.estimatedEndTime,
                });
            }
        });

        if (!inProgressDls)
            clearInterval(progressInterval);
    });
};

/**
 * Start download and progress of downloads.
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
                const startTime = Date.now();
                progressInterval = setInterval(() =>
                    sendProgress(port, progressInterval, startTime), 250);
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
 * @param tab {tabs.Tab} Active tab when browser action was clicked.
 */
const openDownloadsTab = async (tab) => {
    try {
        await browser.tabs.executeScript(tab.id, {
            file: 'content_scripts/content_script.js',
        });

        const url = 'download_popup/popup.html?' +
            `orig_tab_id=${tab.id}&orig_url=${tab.url}`;
        const dlTab = await browser.tabs.create({
            url: chrome.runtime.getURL(url),
            index: tab.index + 1,
        });
        if (g_os !== 'android')
            browser.browserAction.disable(dlTab.id);
    } catch(err) {
        console.error(err);
    }
};

getPlatform();
chrome.runtime.onInstalled.addListener(setOptions);
chrome.runtime.onConnect.addListener(download);
browser.browserAction.onClicked.addListener(openDownloadsTab);
