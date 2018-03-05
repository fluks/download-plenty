/**
 * @file Browser action script. When the browser action popup is opened, it
 * notifies the content script to find all the links and some information about
 * them and send that back to the popup. The information is then rendered onto
 * the popup page. The files to be downloaded are choosed and sent to the
 * background, which downloads the files and sends progress back to the popup.
 */

'use strict';

/** A constant for unknown mime type and content length. */
const UNKNOWN = '?';
/** The data in the table. Array of Objects. */
const g_tableData = [];
/** The direction of the table columns, ascending or descending. Keys :
 * download, mime, url, bytes, all Integers. */
const g_directions = { download: 1, mime: 1, url: 1, bytes: 1, };
/** */
const SELECT_DOWNLOAD = 0,
    UNSELECT_DOWNLOAD = 1;

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
 * @param [addUnit=false] {Boolean}
 * @param [toUnit=''] {String}
 * @return {String}
 */
const bytesToHuman = (bytes, addUnit=false, toUnit='') => {
    if (isNaN(bytes))
        return UNKNOWN;

    const map = [
        { unit: 'B',  size: Math.pow(2, 10), },
        { unit: 'KB', size: Math.pow(2, 20), },
        { unit: 'MB', size: Math.pow(2, 30), },
        { unit: 'GB', size: Math.pow(2, 40), },
        { unit: 'TB', size: Math.pow(2, 50), },
        { unit: 'PB', size: Math.pow(2, 60), },
    ];

    if (toUnit) {
        const unit = map.find(e => e.unit === toUnit);
        if (!unit)
            return UNKNOWN;
        bytes /= (unit.size / 1024);
        bytes = bytes.toFixed(unit.unit === 'B' ? 0 : 1);
        if (addUnit)
            bytes += unit.unit;
    }
    else {
        let i = 0;
        for (; i < map.length && bytes > map[i].size; i++)
            bytes /= 1024;
        bytes = bytes.toFixed(map[i].unit === 'B' ? 0 : 1);
        if (addUnit)
            bytes += map[i].unit;
    }

    return bytes;
};

/**
 * @param bytes {Integer}
 * @return {String}
 */
const goodUnitForBytes = (bytes) => {
    if (isNaN(bytes))
        return '';
    else if (bytes < Math.pow(2, 10))
        return 'B';
    else if (bytes < Math.pow(2, 20))
        return 'KB';
    else if (bytes < Math.pow(2, 30))
        return 'MB';
    else if (bytes < Math.pow(2, 40))
        return 'GB';
    else if (bytes < Math.pow(2, 50))
        return 'TB';
    return 'PB';
};

/**
 * @param elem {HTMLElement}
 */
const changeData = (elem) => {
    elem.dispatchEvent(new Event('change'));
};

/**
 * @param row {}
 * @param change {Integer}
 */
const selectRow = (row, change) => {
    const dlCheckbox = row.tr.querySelector('.download-select');

    if (change === SELECT_DOWNLOAD && !dlCheckbox.checked) {
        // XXX Checking or unchecking the checkbox doesn't change the backing
        // data, the event needs to be fired to change it. Figure out a way
        // to do this in a more elegant manner. Or just add a function.
        changeData(dlCheckbox);
        dlCheckbox.checked = true;
    }
    else if (change === UNSELECT_DOWNLOAD && dlCheckbox.checked) {
        changeData(dlCheckbox);
        dlCheckbox.checked = false;
    }
};

/**
 * @param mime {String}
 * @param select {Boolean}
 */
const selectAllSameMimes = (mime, select) => {
    g_tableData.forEach(row => {
        if (row.mime === mime)
            selectRow(row, select);
    });
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
    // XXX Can this be a circular reference, leak or something?
    g_tableData[i].tr = tr;

    const dlCheckbox = tr.getElementsByClassName('download-select')[0];
    dlCheckbox.checked = data.download;
    dlCheckbox.addEventListener('change', (e) => {
        g_tableData[i].download = !g_tableData[i].download;
    });

    const mime = tr.getElementsByClassName('mime-text')[0];
    mime.textContent = data.mime;
    mime.addEventListener('click', (e) => {
        const select = g_tableData[i].download ? UNSELECT_DOWNLOAD : SELECT_DOWNLOAD;
        selectAllSameMimes(g_tableData[i].mime, select);
    });

    tr.getElementsByClassName('url-text')[0].textContent = data.url;
    const toUnit = goodUnitForBytes(data.bytes);
    tr.getElementsByClassName('bytes-text')[0].textContent =
        bytesToHuman(data.bytes, true, toUnit);

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
            mime: msg.mime ? msg.mime.split(';', 1)[0] : UNKNOWN,
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
        removeAllChildren(tbody);

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

/**
 * @param e {}
 */
const selectRowsByURLRegex = (e) => {
    const pattern = e.target.value;

    if (pattern.length === 0) {
        g_tableData.forEach(row => selectRow(row, UNSELECT_DOWNLOAD));
        return;
    }

    const regex = new RegExp(pattern, 'i');
    g_tableData.forEach(row => {
        selectRow(row, regex.test(row.url) ? SELECT_DOWNLOAD : UNSELECT_DOWNLOAD);
    });
};

/**
 * @param msg {Object}
 */
const updateDownloads = (msg) => {
    const data = g_tableData.find(dl => dl.url === msg.url);
    if (!data)
        return;

    const bytesElem = data.tr.querySelector('.bytes-text');
    const bytesUnit = goodUnitForBytes(data.bytes);
    if (msg.state === 'in_progress') {
        bytesElem.textContent =
            bytesToHuman(msg.bytesReceived, false, bytesUnit) + '/' +
                bytesToHuman(data.bytes, true, bytesUnit);
    }
    else if (msg.state === 'complete') {
        bytesElem.textContent =
            bytesToHuman(data.bytes, false, bytesUnit) + '/' +
                bytesToHuman(data.bytes, true, bytesUnit);
    }
};

/**
 * @param e {EventTarget}
 */
const startDownload = (e) => {
    const port = chrome.runtime.connect({ name: 'download' });
    port.onMessage.addListener((msg) => updateDownloads(msg));

    g_tableData
        .filter(dl => dl.download)
        .forEach(dl => {
            port.postMessage({
                start: true,
                url: dl.url,
            });
        });
};

document.addEventListener('DOMContentLoaded', getDownloads);
document.querySelectorAll('button[class*="-header"]').forEach(el => {
    addEventListener('click', sortTable);
});
document.querySelector('#select-rows-by-url').addEventListener('input',
    selectRowsByURLRegex);
document.querySelector('#download-button').addEventListener('click', startDownload);
