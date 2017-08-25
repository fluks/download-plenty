'use strict';

/** */
const UNKNOWN = '?';
/** */
const g_tableData = [];
/** */
const g_directions = { download: 1, mime: 1, url: 1, bytes: 1, };

/**
 * @param url {String}
 * @return {String}
 */
const getFilenameFromURL = (url) => {
    const a = document.createElement('a');
    a.setAttribute('href', url);
    const path = a.pathname ? a.pathname.split('/').pop() : '';
    if (path)
        return path;
    const search = a.search;
    if (search)
        return search;
    return '';
};

/**
 * @param bytes {Integer}
 * @return {String}
 */
const bytesToHuman = (bytes) => {
    if (isNaN(bytes))
        return UNKNOWN;
    const map = [
        { unit: '',   size: 1 << 10, },
        { unit: 'kB', size: 1 << 20, },
        { unit: 'MB', size: 1 << 30, },
        { unit: 'GB', size: 1 << 40, },
        { unit: 'TB', size: 1 << 50, },
    ];
    let i = 0;
    for (; i < map.length; i++) {
        if (bytes < map[i].size)
            return (bytes / (map[i].size >> 10)).toFixed(map[i].unit ? 1 : 0) + map[i].unit;
    }
    return (bytes / (map[i - 1].size >> 10)).toFixed(1) + 'PB';
};

/**
 * @param data {Object}
 * @param i {Integer}
 * @return {HTMLElement}
 */
const createTableRow = (data, i) => {
    const downloadRow =
        '<td class="download-column center"><input class="download-select" type="checkbox"/></td>' +
        '<td class="mime-column"><span class="mime-text"></span></td>' +
        '<td class="url-column"><span class="url-text"></span></td>' +
        '<td class="bytes-column"><span class="bytes-text"></span></td>';
    const tr = document.createElement('tr');
    tr.innerHTML = downloadRow;

    const dlCheckbox = tr.getElementsByClassName('download-select')[0];
    dlCheckbox.checked = data.download;
    dlCheckbox.addEventListener('change', (e) => {
        console.log(g_tableData[i].url);
        g_tableData[i].download = !g_tableData[i].download;
    });
    tr.getElementsByClassName('mime-text')[0].textContent = data.mime;
    tr.getElementsByClassName('url-text')[0].textContent = data.url;
    tr.getElementsByClassName('bytes-text')[0].textContent = bytesToHuman(data.bytes);

    return tr;
};

let g_dataRowIndex = 0;
/**
 * Forms table's data and rows from the content script's response.
 * @param msg {Object} Response from content script.
 * status {Integer} HTTP status code
 * url {String} Link's URL
 * mime {String} MIME Type of link
 * bytes {String} Link's content length.
 * @param tbody {HTMLElement} Table's element where the rows are appended.
 */
const fillDownloads = (msg, tbody) => {
    if (msg.status === 200) {
        /*const url = getFilenameFromURL(msg.url);*/
        const dataRow = {
            download: false,
            mime: msg.mime ? msg.mime.split(';', 1)[0] : '?',
            url: msg.url,
            bytes: parseInt(msg.bytes),
        };
        g_tableData.push(dataRow);

        const tr = createTableRow(dataRow, g_dataRowIndex++);
        tbody.appendChild(tr);
    }
};

/**
 * Remove all el's children.
 * @param el {HTMLElement}
 */
const removeAllChildren = (el) => {
    while (el.hasChildNodes())
        el.removeChild(el.lastChild);
};

/**
 * @param a {Boolean}
 * @param a {Boolean}
 * @return {Integer}
 */
const compareDownload = (a, b) => {
    if (a)
        return 1;
    if (b)
        return -1;
    return 0;
};

/**
 * @param a {String}
 * @param a {String}
 * @return {Integer}
 */
const compareMime = (a, b) => {
    if (a === UNKNOWN)
        return 1;
    if (b === UNKNOWN)
        return -1;
    return a.localeCompare(b);
};

/**
 * @param a {String}
 * @param a {String}
 * @return {Integer}
 */
const compareUrl = (a, b) => {
    if (!a)
        return 1;
    if (!b)
        return -1;
    return a.localeCompare(b);
};

/**
 * @param a {Integer}
 * @param a {Integer}
 * @return {Integer}
 */
const compareBytes = (a, b) => {
    if (isNaN(a))
        return 1;
    if (isNaN(b))
        return -1;
    if (a > b)
        return -1;
    if (a <= b)
        return 1;
};

/**
 * @param e {EventTarget} Button's click event.
 */
const sortTable = (e) => {
    const match = e.target.className.match(/^(\w+)-header$/);
    if (match) {
        const tbody = document.querySelector('tbody');
        removeAllChildren(tbody)

        const column = match[1];
        let i = 0;
        g_tableData.sort((a, b) => {
            let result = 0;
            switch (column) {
                case 'download':
                    result = compareDownload(a.download, b.download);
                    break;
                case 'mime':
                    result = compareMime(a.mime, b.mime);
                    break;
                case 'url':
                    result = compareUrl(a.url, b.url);
                    break;
                case 'bytes':
                    result = compareBytes(a.bytes, b.bytes);
                    break;
                default:
                    result = 0;
            }
            return g_directions[column] * result;
        }).forEach(d => {
            const tr = createTableRow(d, i++);
            tbody.appendChild(tr);
        });

        g_directions[column] *= -1;
    }
};

/**
 * Notify content script to grab all the links in the web page and create the
 * downloads table.
 */
const getDownloads = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const port = chrome.tabs.connect(tabs[0].id, { name: 'getDownloads' });
        const tbody = document.querySelector('tbody');
        port.onMessage.addListener((msg) => fillDownloads(msg, tbody));
        port.postMessage({ start: true });
    });

};

document.addEventListener('DOMContentLoaded', getDownloads);
document.querySelectorAll('button[class*="-header"]').forEach(el => {
    addEventListener('click', sortTable);
});
