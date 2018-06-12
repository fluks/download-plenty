'use strict';

/**
 * Set html tag's lang and dir attributes corresponding to current language.
 */
const common_setLangAndDir = () => {
    document.documentElement.setAttribute('lang', document.webL10n.getLanguage());
    document.documentElement.setAttribute('dir', document.webL10n.getDirection());
};
