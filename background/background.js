'use strict';

importScripts('/common/browser-polyfill.js');
importScripts('/common/common.js');

/** Find out platform (mainly whether we're on Android or not).
 * @async
 * @return [Object] Operating system and local or sync storageArea.
 * TODO Use local storage area always?
 */
const getPlatform = async () => {
    const platform = await browser.runtime.getPlatformInfo();
    switch (platform.os) {
        case 'android':
            return { os: platform.os, storageArea: 'local', };
        default:
            return { os: platform.os, storageArea: 'sync', };
    }
};

/**
 * Set default options on install and update.
 * @param details {Object}
 * @async
 */
const setOptions = async (details) => {
    const localOptions = await getPlatform();
    browser.storage.local.set(localOptions);

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
        browser.storage[localOptions.storageArea].set(defaultOptions);
        // New options.
    }
    // Add new options here also.
    else if (details.reason === 'update') {
    }
};

/**
 * Send progress of downloads to downloads page. Stop this progress sender
 * when there are no active downloads.
 * @param port {runtime.Port}
 * @param intervalId {Number} Progress interval's id.
 * @param startTime {Number} Start time of the first download in a
 * session.
 * @param ids {String[]} Ids of files which are being downloaded.
 */
const sendProgress = (port, intervalId, startTime, ids) => {
    chrome.downloads.search({ startedAfter: new Date(startTime).toISOString(), },
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
 * @async
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
 * @async
 * @param port {runtime.Port}
 */
const download = async (port) => {
    if (port.name !== 'download')
        return;

    // TODO
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
                // TODO
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
 * @async
 * @param tab {tabs.Tab} Active tab when browser action was clicked.
 */
const openDownloadsTab = async (tab) => {
    if (tab.url.match(/^chrome-extension:\/\/.+\/download_popup\/popup\.html\?/))
        return;

    try {
        await browser.scripting.executeScript({
            target: { tabId: tab.id, },
            files: [ 'content_scripts/content_script.js', ],
        });

        const url = 'download_popup/popup.html?' +
            `orig_tab_id=${tab.id}&orig_url=${tab.url}`;
        const dlTab = await browser.tabs.create({
            url: chrome.runtime.getURL(url),
            index: tab.index + 1,
        });
        await Common.getLocalOptions();
        if (Common.localOpts.os !== 'android')
            browser.action.disable(dlTab.id);
    } catch(err) {
        console.error(err);
    }
};

/** Send HEAD HTTP queries to links to get filesize and mime type and send them
 * to download_popup.js.
 * @async
 * @param url {String}
 * @param port {Port} Port to send messages to download_popup.js.
 */
const request = async (url, port) => {
    try {
        const result = {
            url: url,
            // TODO Is this used anywhere?
            status: 0,
            bytes: 0,
            mime: '?',
        };

        const response = await fetch(url, { method: 'HEAD', });
        if (!response.ok) {
            console.log(`Response status: ${response.status}, at ${url}`);
            port.postMessage(result);
            return;
        }

        result.status = response.status;
        result.bytes = response.headers.get('content-length') || 0;
        result.mime = response.headers.get('content-type') || '?';

        port.postMessage(result);
    }
    // Usually error that the resource can't be downloaded, i.e. ipv6 but only ipv4 is supported.
    catch (err) {
        console.error(`Error fetching: ${err}, at ${url}`);
    }
};

/** Listen for connect from content_script.js to get headers from downloadable links
 * and sent those to download_popup.js.
 * @param port {Port}
 */
const getHeaders = (port) => {
    if (port.name !== 'getHeaders')
        return;

    const popupPort = chrome.runtime.connect({ name: 'sendHeaders', });
    // TODO
    port.onMessage.addListener((msg) => {
        if (msg.url) {
            request(msg.url, popupPort);
        }
    });
};

chrome.runtime.onInstalled.addListener(setOptions);
chrome.runtime.onConnect.addListener(getHeaders);
chrome.runtime.onConnect.addListener(download);
browser.action.onClicked.addListener(openDownloadsTab);
