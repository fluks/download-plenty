/**
 * @file A content script. Finds all the links in the web page, makes a HTTP
 * HEAD request for all the links to get the mime types and content lengths of
 * files. Then sends all the information back to the browser action.
 */

(function() {
'use strict';
// A hack to prevent executing the content script more than once on the same
// page. I.e. open downloads page, close it, then open it again on the same
// page.
if (alreadyLoaded)
    return;

// Get all the downloadable elements immediately.
const g_map = {
    a: 'href',
    img: 'src',
    source: 'src',
    video: 'src',
    audio: 'src',
    track: 'src',
};
const g_tags = Object.keys(g_map);
const g_elems = document.querySelectorAll(g_tags.join(','));

/**
 * @param port {}
 */
const getDownloads = (port) => {
    if (port.name !== 'getDownloads')
        return;

    const bgPort = chrome.runtime.connect({ name: 'getHeaders', });
    port.onMessage.addListener(msg => {
        if (msg.start) {
            const seenUrls = {};
            g_elems.forEach(e => {
                const attr = g_map[e.nodeName.toLowerCase()];
                if (!attr)
                    return;
                const url = e[attr];
                if (url && !seenUrls[url] && !url.startsWith('data:')) {
                    seenUrls[url] = true
                    bgPort.postMessage({ url: url, });
                }
            });
        }
    });
};

chrome.runtime.onConnect.addListener(getDownloads);

})();
var alreadyLoaded = true;
