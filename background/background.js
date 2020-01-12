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
 * @param port {runtime.Port}
 * @param intervalId {Number} Progress interval's id.
 * @param startTime {Date} Start time of the first download in a
 * session.
 * @param ids {String[]} Ids of files which are being downloaded.
 */
const sendProgress = (port, intervalId, startTime, ids) => {
    chrome.downloads.search({ startedAfter: startTime },
            (downloads) => {

        let finishedDls = 0;
        const progressInfo = [];
        downloads
            .filter(dl => ids.includes(dl.id))
            .forEach(dl => {
                progressInfo.push({
                    url: dl.url,
                    state: dl.state,
                    bytesReceived: dl.bytesReceived,
                    timeLeft: dl.estimatedEndTime,
                    id: dl.id,
                });
                if (!(dl.paused && dl.canResume) &&
                        (dl.state === 'interrupted' || dl.state === 'complete' ||
                        // If download fails for some reason, state doesn't
                        // seem to be 'interrupted', but dl.error is set.
                         dl.error)) {
                    finishedDls++;
                }
        });
        port.postMessage({ progress: progressInfo });

        if (finishedDls >= ids.length) {
            clearInterval(intervalId);
            port.postMessage({ downloadsFinished: true });
            console.log('interval cleared');
        }
    });
};

/**
 * Wait for downloads to start and return ids of the downloads that were
 * succesfully started.
 * @param ids {Promise[]} Ids of started downloads (return values of
 * downloads.download)
 * @return {Promise[]} Ids of downloads that were succesfully started.
 */
const waitForDownloadsToStart = async (ids) => {
    const startedIds = [];
    // forEach didn't work!
    for (let i = 0; i < ids.length; i++) {
        try {
            // Wait for each of the download to start.
            const id = await ids[i];
            startedIds.push(id);
        } catch (err) {
            console.log('error waiting for download to start: ' + err);
        }
    }

    return startedIds;
};

/**
 * Get the filename from the URL.
 * @param url {String} URL of the file to be downloaded.
 * @return {String} The last part of the filepath of the URL or 'download'.
 */
const getFilenameFromURL = (url) => {
    url = new URL(url);
    const paths = url.pathname.split('/');

    return paths.pop() || 'download';
};

/**
 * Add a counter to the filename before the suffix if the file has one.
 * The counter is added because, if files have the same file name, downloads
 * will fail.
 * @param filename {String} The name of the file to be downloaded.
 * @param i {Int} Counter to add to the filename.
 * @return {String} Filename and the counter concatenated.
 */
const addCounter = (filename, i) => {
    return filename.replace(/(\.[^.]*)?$/, `_${i}$1`);
};

/**
 * Start download and progress of downloads.
 * @param port {runtime.Port}
 */
const download = async (port) => {
    if (port.name !== 'download')
        return;

    port.onMessage.addListener(async (msg) => {
        if (msg.start) {
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now#Reduced_time_precision
            // Firefox reduces precision of Date.now to protect against timing
            // attacks. It can be larger than the current one, but this is the
            // maximum default.
            const reducedPrecision = 100;
            const startTime = Date.now() - reducedPrecision;

            const ids = [];
            const files = {};
            msg.urls.forEach((url, i) => {
                try {
                    const downloadOptions = { url: url, };

                    let file = getFilenameFromURL(url);
                    if (files.hasOwnProperty(file)) {
                        file = addCounter(file, files[file]++);
                        downloadOptions.filename = file;
                    }
                    else
                        files[file] = 1

                    const id = browser.downloads.download(downloadOptions);
                    ids.push(id);
                } catch (err) {
                    console.log(err);
                }
            });

            const startedIds = await waitForDownloadsToStart(ids);
            if (startedIds.length > 0) {
                const id = setInterval(() =>
                    sendProgress(port, id, startTime, startedIds), 250);

                // Clear interval if downloads tab is closed. This is here if
                // tab is closed while downloads are active to stop messaging.
                port.onDisconnect.addListener(() => clearInterval(id));
            }
            else {
                port.postMessage({ downloadsFinished: true });
            }
        }
        else if (msg.pause) {
            browser.downloads.pause(msg.id);
        }
        else if (msg.resume) {
            browser.downloads.resume(msg.id);
        }
        else if (msg.cancel) {
            browser.downloads.cancel(msg.id);
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
