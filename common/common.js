'use strict';

class Common {
    static localOpts;

    /*** Get local options (platform info).
     * @async
     */
    static async getLocalOptions() {
        this.localOpts = await browser.storage.local.get(null);
    }

    /** Set html tag's lang and dir attributes corresponding to current language.
     */
    static setLangAndDir() {
        document.documentElement.setAttribute('lang', document.webL10n.getLanguage());
        document.documentElement.setAttribute('dir', document.webL10n.getDirection());
    }
}
