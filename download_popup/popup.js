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
let g_localOpts;

/**
 * Get local options (platform info). Sets g_localOpts global variable.
 */
const getLocalOptions = async () => {
    g_localOpts = await browser.storage.local.get(null);
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
        { unit: 'KiB', size: Math.pow(2, 20), },
        { unit: 'MiB', size: Math.pow(2, 30), },
        { unit: 'GiB', size: Math.pow(2, 40), },
        { unit: 'TiB', size: Math.pow(2, 50), },
        { unit: 'PiB', size: Math.pow(2, 60), },
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
        return 'KiB';
    else if (bytes < Math.pow(2, 30))
        return 'MiB';
    else if (bytes < Math.pow(2, 40))
        return 'GiB';
    else if (bytes < Math.pow(2, 50))
        return 'TiB';
    return 'PiB';
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
 * Make data cells for a table row. Use sanitizer, because insertAdjacentHTML
 * is used and even now user input is not used, maybe it will be later on.
 * @return {String} Data cells for a table row.
 */
const sanitizeDownloadRow = () => {
    if (typeof this.downloadRow === 'undefined') {
        const downloadRow = DOMPurify.sanitize(
            // Without table and tr tags, tds are discarded.
            '<table><tr>' +
            '<td class="download-column center"><label><input class="download-select" type="checkbox"/></label></td>' +
            '<td class="mime-column"><span class="mime-text"></span></td>' +
            '<td class="url-column"><span class="url-text"></span></td>' +
            '<td class="bytes-column"><span class="bytes-text"></span></td>' +
            '<td class="time-left-column"><span class="time-left-text"></span></td>' +
            '<td class="controls-column"><button type="submit" class="play-pause-button pause"></button><button type="submit" class="cancel-button"></button></td>' +
            // Without table and tr tags, tds are discarded.
            '</tr></table>');
        // Remove table, tbody and tr tags.
        this.downloadRow = downloadRow.match(/(<td.*td>)/)[1];
    }

    return this.downloadRow;
};

/**
 * A listener for a download checkbox. Set download property in table data for
 * changed download and enable download, clipboard and file buttons if any file
 * is selected to be downloaded or if none is selected, disable these buttons.
 * @param e {EventTarget}
 * @param i {Number} Index of the table data that was selected/deselected
 * for download.
 */
const selectDownloadListener = (e, i) => {
    g_tableData[i].download = !g_tableData[i].download;

    const downloadSelected = g_tableData.some(d => d.download);
    document.querySelector('#download-button').disabled = !downloadSelected;
    document.querySelector('#clipboard-button').disabled = !downloadSelected;
    document.querySelector('#file-button').disabled = !downloadSelected;

    document.querySelector('#number-files-span').textContent = g_tableData
        .filter(d => d.download)
        .reduce((acc) => acc + 1, 0);
    const bytes = g_tableData
        .filter(d => d.download && !isNaN(d.bytes))
        .reduce((acc, val) => acc + val.bytes, 0);
    document.querySelector('#total-size-span').textContent =
        bytesToHuman(bytes, true, goodUnitForBytes(bytes));
};

/**
 * Set download's id as null to signify it's not active.
 * @function markDownloadAsNotActive
 * @param tr {HTMLTableRowElement}
 */
const markDownloadAsNotActive = (tr) => {
    tr.setAttribute('data-id', null);
};

/**
 * Get the download id from a download row if it has one.
 * @function getDownloadId
 * @param tr {HTMLTableRowElement}
 * @return {Integer|NaN} Download id or NaN if download isn't active.
 */
const getDownloadId = (tr) => {
    return parseInt(tr.getAttribute('data-id'), 10);
};

/**
 * @function resumeOrPauseDownload
 * @param e {MouseEvent}
 * @param tr {HTMLTableRowElement}
 */
const resumeOrPauseDownload = (e, tr) => {
    const id = getDownloadId(tr);
    if (!id)
        return;
    let newClass = 'pause',
        command = 'resume';
    const button = e.target;
    if (button.classList.contains('pause')) {
        command = 'pause';
        newClass = 'play';
    }

    const msg = { id: id, };
    msg[command] = true;
    const port = chrome.runtime.connect({ name: 'download' });
    port.postMessage(msg);
    button.classList.remove('play', 'pause');
    button.classList.add(newClass);
};

/**
 * @function cancelDownload
 * @param tr {HTMLTableRowElement}
 * @param playPauseButton {HTMLButtonElement}
 * @param bytes {Integer}
 * @param toUnit {String}
 */
const cancelDownload = (tr, playPauseButton, bytes, toUnit) => {
    const id = getDownloadId(tr);
    if (!id)
        return;
    const port = chrome.runtime.connect({ name: 'download' });
    port.postMessage({ cancel: true, id: id, });

    tr.getElementsByClassName('bytes-text')[0].textContent =
        bytesToHuman(bytes, true, toUnit);
    tr.getElementsByClassName('bytes-column')[0].style.background = 'unset';
    tr.getElementsByClassName('time-left-text')[0].textContent = '';
    playPauseButton.classList.remove('play');
    playPauseButton.classList.add('pause');
    markDownloadAsNotActive(tr);
};

/**
 * @param data {Object}
 * @param i {Integer}
 * @return {HTMLElement}
 */
const createTableRow = (data, i) => {
    const tr = document.createElement('tr');
    tr.insertAdjacentHTML('afterbegin', sanitizeDownloadRow());
    // XXX Can this be a circular reference, leak or something?
    g_tableData[i].tr = tr;

    const dlCheckbox = tr.getElementsByClassName('download-select')[0];
    dlCheckbox.checked = data.download;
    dlCheckbox.addEventListener('change', (e) => selectDownloadListener(e, i));

    const mime = tr.getElementsByClassName('mime-text')[0];
    mime.textContent = data.mime;
    mime.addEventListener('click', (e) => {
        const select = g_tableData[i].download ? UNSELECT_DOWNLOAD : SELECT_DOWNLOAD;
        selectAllSameMimes(g_tableData[i].mime, select);
    });

    const urlText = tr.getElementsByClassName('url-text')[0];
    urlText.textContent = data.url;
    urlText.setAttribute('title', data.url);
    const toUnit = goodUnitForBytes(data.bytes);
    tr.getElementsByClassName('bytes-text')[0].textContent =
        bytesToHuman(data.bytes, true, toUnit);

    const playPauseButton = tr.getElementsByClassName('play-pause-button')[0];
    playPauseButton.addEventListener('click', (e) => resumeOrPauseDownload(e, tr));

    const cancelButton = tr.getElementsByClassName('cancel-button')[0];
    cancelButton.addEventListener('click', () =>
        cancelDownload(tr, playPauseButton, data.bytes, toUnit));

    return tr;
};

/**
 * Check if MIME type isn't shown.
 * @param mime {String} MIME type of the downloadable element.
 * @param mimeFilters {Object} MIME types which should be shown.
 * @return {Boolean} Return true if this type of donwloadable element
 * shouldn't be shown. If mime is null or undefined, return false.
 */
const isMimeFiltered = (mime, mimeFilters) => {
    const mimeStart = mime.split('/', 1)[0];
    return mimeFilters[mimeStart] === false;
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
 * @param mimeFilters {Object} MIME types which should be shown.
 */
const fillDownloads = (msg, tbody, mimeFilters) => {
    if (msg.status === 200 && !isMimeFiltered(msg.mime, mimeFilters)) {
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
                    result = compareDownload(b.download, a.download);
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
 * Hide options button on Android, otherwise set its click handler.
 * Also call getLocalOptions to get platform info. TODO Refactor this, place
 * it somewhere else.
 */
const handleOptionsButton = async () => {
    // Need to be called first.
    await getLocalOptions();

    const optionsButton = document.querySelector('#open-options-button');
    if (g_localOpts.os === 'android') {
        optionsButton.style.visibility = 'hidden';
    }
    else {
        optionsButton.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });
    }
};

/**
 * Notify content script to grab all the links in the web page and create the
 * downloads table.
 */
const getDownloads = async () => {
    // TODO Place this somewehere else. Now it's here only because of order of
    // execution. Have only one DOMContentLoaded handler?
    await handleOptionsButton();

    const url = new URL(location.href);
    document.querySelector('title').textContent += ' - ' + url.searchParams.get('orig_url');
    const originalTabId = parseInt(url.searchParams.get('orig_tab_id'));

    const port = browser.tabs.connect(originalTabId, { name: 'getDownloads' });
    const tbody = document.querySelector('tbody');
    const options = await browser.storage[g_localOpts.storageArea].get('mimeFilters');
    port.onMessage.addListener((msg) => fillDownloads(msg, tbody, options.mimeFilters));
    port.postMessage({ start: true });
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
 * Add zero before a number if the number is 0 <= number < 10.
 * @param number {Integer}
 * @return {String} The number itself if number < 0 or number >= 10, otherwise
 * zero added before the number.
 */
const addZeroIfSingleDigit = (number) => {
    return (number < 10 && number >= 0) ? `0${number}` : number.toString();
};

/**
 * Get time left for a download.
 * @param estimatedEndTime {String} Estimated end time in ISO 8601 format.
 * @return {String} Time left for a download in human form (hours, minutes
 * and seconds). If we're past estimatedEndTime or if estimatedEndTime is
 * invalid, return empty string.
 */
const humanTimeDiff = (estimatedEndTime) => {
    let diff = new Date(estimatedEndTime) - Date.now();
    if (isNaN(diff) || diff <= 0)
        return '';

    diff /= 1000;

    const secs = Math.floor(diff % 60);
    diff = Math.floor(diff / 60);
    const mins = Math.floor(diff % 60);
    diff = Math.floor(diff / 60);
    const hours = Math.floor(diff);

    return [ hours, mins, secs ]
        .map(t => addZeroIfSingleDigit(t))
        .join(':');
};

/**
 * Update UI about progress of all the downloads.
 * @param msg {Object[]} Array of objects of downloads. Keys are url, state,
 * bytesReceived and timeLeft.
 */
const updateDownloads = (msg) => {
    if (!msg.hasOwnProperty('progress'))
        return;

    msg.progress.forEach(dl => {
        const data = g_tableData.find(d => d.url === dl.url);
        if (!data)
            return;

        const id = getDownloadId(data.tr);
        // Download not started or download canceled and started again with different id.
        // And state is checked because otherwise after cancelling, id will be set to
        // integer and play-resume button can still be pressed.
        if ((!id || id !== dl.id) && dl.state !== 'interrupted')
            data.tr.setAttribute('data-id', dl.id);
        const timeLeftElem = data.tr.querySelector('.time-left-text');
        const bytesElem = data.tr.querySelector('.bytes-text');
        const bytesUnit = goodUnitForBytes(data.bytes);
        const bytesCol = data.tr.querySelector('.bytes-column');
        const progressRGB = 'rgba(73, 251, 73, ';

        if (dl.state === 'in_progress') {
            bytesElem.textContent =
                bytesToHuman(dl.bytesReceived, false, bytesUnit) + '/' +
                bytesToHuman(data.bytes, true, bytesUnit);
            const percentFinished = (dl.bytesReceived / data.bytes) * 100;
            bytesCol.style.background =
                `linear-gradient(to right, ${progressRGB}0.3) ${percentFinished}%,` +
                `white ${percentFinished}%)`;

            timeLeftElem.textContent = humanTimeDiff(dl.timeLeft);
        }
        else if (dl.state === 'complete') {
            bytesElem.textContent =
                bytesToHuman(data.bytes, false, bytesUnit) + '/' +
                bytesToHuman(data.bytes, true, bytesUnit);
            bytesCol.style.background =
                `linear-gradient(to right, ${progressRGB}0.7) 100%, white 100%)`;

            timeLeftElem.textContent = '';
            markDownloadAsNotActive(data.tr);
        }
    });
};

/**
 * @param e {EventTarget}
 */
const startDownload = (e) => {
    const port = chrome.runtime.connect({ name: 'download' });
    port.onMessage.addListener((msg) => updateDownloads(msg));
    port.onMessage.addListener((msg) => {
        if (msg.hasOwnProperty('downloadsFinished'))
            document.querySelector('#download-button').disabled = false;
    });

    const urls = g_tableData
        .filter(dl => dl.download)
        .map(dl => dl.url);
    port.postMessage({
        start: true,
        urls: urls,
    });
    document.querySelector('#download-button').disabled = true;
};

/**
 * @param e {EventTarget}
 */
const copyToClipboard = (e) => {
    e.preventDefault();

    const urls = g_tableData
        .filter(dl => dl.download)
        .map(dl => dl.url)
        .join('\n');
    e.clipboardData.setData('text/plain', urls);
    document.removeEventListener('copy', copyToClipboard);
};

/**
 * @param e {EventTarget}
 */
const saveSelectedURLsToClipboard = (e) => {
    document.addEventListener('copy', copyToClipboard);
    document.execCommand('copy');

    const clipboardMessage = document.querySelector('#clipboard-message-span');
    clipboardMessage.style.visibility = 'visible';
    window.setTimeout(() => {
        clipboardMessage.style.visibility = 'hidden';
    }, 1500);
};

/**
 * @param e {EventTarget}
 */
const saveSelectedURLsToFile = (e) => {
    const urls = g_tableData
        .filter(dl => dl.download)
        .map(dl => dl.url)
        .join('\n');

    const filename = 'urls.txt';
    const file = new File([ urls ], filename,
        { type: 'application/octet-stream' });

    const link = document.querySelector('iframe')
        .contentWindow.document.querySelector('#save-link');
    link.href = URL.createObjectURL(file);
    link.download = filename;
    link.addEventListener('click', function cleanResources() {
        URL.revokeObjectURL(file);
        this.removeEventListener('click', cleanResources);
    });
    link.click();
};

/**
 * Position table corresponding to grid's height.
 */
const positionTable = () => {
    const gridHeight = document.querySelector('#grid').offsetHeight;
    document.querySelector('#table-div').style.paddingTop = gridHeight + 'px';
};

document.addEventListener('DOMContentLoaded', getDownloads);
document.addEventListener('DOMContentLoaded', positionTable);
document.addEventListener('localized', common_setLangAndDir);
document.querySelectorAll('button[class*="-header"]').forEach(el => {
    addEventListener('click', sortTable);
});
document.querySelector('#select-rows-by-url')
    .addEventListener('input', selectRowsByURLRegex);
document.querySelector('#download-button')
    .addEventListener('click', startDownload);
document.querySelector('#clipboard-button')
    .addEventListener('click', saveSelectedURLsToClipboard);
document.querySelector('#file-button')
    .addEventListener('click', saveSelectedURLsToFile);
