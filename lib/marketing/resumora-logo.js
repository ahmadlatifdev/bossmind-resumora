/**
 * @deprecated Import ResumoraLogo from @/components/brand/ResumoraLogo instead.
 * Constants re-exported for legacy imports — src is always the locked brand authority path.
 */
const {
  BRAND_LOGO_SRC,
  BRAND_LOGO_ALT,
  BRAND_LOGO_VARIANTS,
} = require("./brand-asset-authority");

const RESUMORA_LOGO_SRC = BRAND_LOGO_SRC;
const RESUMORA_LOGO_ALT = BRAND_LOGO_ALT;

const RESUMORA_LOGO_SIDEBAR = {
  src: BRAND_LOGO_SRC,
  ...BRAND_LOGO_VARIANTS.sidebar,
};

const RESUMORA_LOGO_TOPBAR = {
  src: BRAND_LOGO_SRC,
  ...BRAND_LOGO_VARIANTS.topbar,
};

module.exports = {
  RESUMORA_LOGO_SRC,
  RESUMORA_LOGO_ALT,
  RESUMORA_LOGO_SIDEBAR,
  RESUMORA_LOGO_TOPBAR,
};
