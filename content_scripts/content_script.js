/**
 * @file A content script. Finds all the links in the web page, makes a HTTP
 * HEAD request for all the links to get the mime types and content lengths of
 * files. Then sends all the information back to the browser action.
 */

'use strict';

(function() {
    if (loaded)
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

/**
 * @param port {}
 */
const getDownloads = (port) => {
    if (port.name !== 'getDownloads')
        return;

    port.onMessage.addListener(msg => {
        if (msg.start) {
            const map = {
                a: 'href',
                img: 'src',
            };
            const tags = Object.keys(map);
            const elems = document.querySelectorAll(tags.join(','));
            elems.forEach(e => {
                const attr = map[e.nodeName.toLowerCase()];
                if (!attr)
                    return;
                const url = e[attr];
                if (url)
                    head(url, port);
            });
        }
    });
};

chrome.runtime.onConnect.addListener(getDownloads);

    var loaded = true;
})();
