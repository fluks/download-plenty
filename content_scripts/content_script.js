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

/**
 * @param that {}
 * @param url {String}
 */
const onLoad = (that, url, port) => {
    port.postMessage({
        url: url,
        status: that.status,
        bytes: that.getResponseHeader('Content-Length'),
        mime: that.getResponseHeader('Content-Type'),
    });
};

/**
 * @param that {}
 * @param url {String}
 */
const onError = (that, url) => {
    console.log(`status: ${that.status}\nurl: ${url}`);
};

/**
 * @param url {String}
 * @param port {}
 */
const head = (url, port) => {
    const req = new XMLHttpRequest();
    req.addEventListener('load', function() {
        onLoad(this, url, port);
    });
    req.addEventListener('error', function() {
        onError(this, url);
    });
    req.open('HEAD', url);
    req.send();
};

// Get all the downloadable elements immediately.
const map = {
    a: 'href',
    img: 'src',
};
const tags = Object.keys(map);
const elems = document.querySelectorAll(tags.join(','));

/**
 * @param port {}
 */
const getDownloads = (port) => {
    if (port.name !== 'getDownloads')
        return;

    port.onMessage.addListener(msg => {
        if (msg.start) {
            elems.forEach(e => {
                const attr = map[e.nodeName.toLowerCase()];
                if (!attr)
                    return;
                const url = e[attr];
                if (url && !url.startsWith('data:'))
                    head(url, port);
            });
        }
    });
};

chrome.runtime.onConnect.addListener(getDownloads);

})();
var alreadyLoaded = true;
