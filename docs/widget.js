/* ChatLive minimal embeddable widget (MVP)
 * Usage:
 *   <script src="./widget.js"></script>
 *   <script>
 *     ChatLiveWidget.init({
 *       siteKey: 'pk_demo_change_me',
 *       embedUrl: 'http://localhost:5173/visitor/embed',
 *       // origin: 'http://localhost:4173' // optional override
 *     })
 *   </script>
 */

(function () {
  "use strict";

  // Capture the widget script origin at load time so later init() calls (e.g. SPA) can
  // still fire the install beacon even if no data-* script tag is present.
  var SCRIPT_ORIGIN = (function () {
    try {
      var cs = document.currentScript;
      if (cs && cs.src) {
        return new URL(String(cs.src), window.location && window.location.href ? window.location.href : undefined).origin;
      }
    } catch (e) {
      // ignore
    }
    return "";
  })();

  function getWidgetScriptOrigin() {
    // Try multiple strategies; some host pages load the widget in ways where
    // document.currentScript is unavailable or does not expose a stable src.
    try {
      if (SCRIPT_ORIGIN) return String(SCRIPT_ORIGIN);
    } catch (e0) {
      // ignore
    }

    // Prefer deriving from the production config script tag (<script data-chatlive-site-key ... src="...">)
    try {
      var el = typeof findConfigScript === "function" ? findConfigScript() : null;
      var src = el && el.src ? String(el.src) : "";
      if (src) {
        return new URL(String(src), window.location && window.location.href ? window.location.href : undefined).origin;
      }
    } catch (e1) {
      // ignore
    }

    // Last resort: scan <script> tags.
    try {
      var list = document && document.getElementsByTagName ? document.getElementsByTagName("script") : null;
      if (list && list.length) {
        for (var i = 0; i < list.length; i++) {
          var s = list[i];
          if (!s) continue;
          var hasKey = false;
          try {
            hasKey = !!(s.dataset && s.dataset.chatliveSiteKey);
          } catch (e2) {
            hasKey = false;
          }
          var src2 = "";
          try {
            src2 = s.src ? String(s.src) : "";
          } catch (e3) {
            src2 = "";
          }
          if (!src2) continue;
          if (hasKey || src2.indexOf("widget.js") >= 0) {
            try {
              return new URL(String(src2), window.location && window.location.href ? window.location.href : undefined).origin;
            } catch (e4) {
              // ignore
            }
          }
        }
      }
    } catch (e5) {
      // ignore
    }

    return "";
  }

  function getBootstrapApiOrigin(seedConfig) {
    // Preferred: widget script origin (backend hosts the widget asset).
    var base = "";
    try {
      base = getWidgetScriptOrigin() || "";
    } catch (e0) {
      base = "";
    }
    if (base) return base;

    // Fallback: embedUrl origin (useful when widget JS is bundled/inline).
    try {
      var u = safeParseUrl(String(seedConfig && seedConfig.embedUrl ? seedConfig.embedUrl : ""));
      return u && u.origin ? String(u.origin) : "";
    } catch (e1) {
      return "";
    }
  }

  var DEFAULTS = {
    siteKey: "",
    embedUrl: "",
    origin: null,
    // visitor_id persistence hints (optional): forwarded to iframe as query params.
    // - cookieDomain: e.g. ".example.com" (cross-subdomain)
    // - cookieSameSite: "Lax" | "Strict" | "None"
    cookieDomain: null,
    cookieSameSite: null,
    position: "bottom-right",
    // Try to stay above most host overlays.
    zIndex: 2147483647,
    launcherText: "Chat",
    // Launcher style:
    // - "bubble": circle launcher (LiveChat-like bubble)
    // - "bar": pill launcher with label
    launcherStyle: "bubble",
    // Theme mode hint (currently used by admin preview pages; visitor UI may choose to read it later)
    themeMode: "light",
    colorSettingsMode: "theme",
    colorOverridesJson: null,
    width: 380,
    height: 560,
    // Product default: fixed-size popup like LiveChat. Auto-height can be enabled explicitly.
    autoHeight: false,
    // Auto-height strategy:
    // - "fixed" (default): fixed panel height (LiveChat-like). Ignore iframe height reports.
    // - "grow-only": accept height increases from iframe but ignore decreases (prevents "shrink to one line")
    // - "dynamic": allow both grow and shrink
    autoHeightMode: "fixed",
    minHeight: 320,
    maxHeightRatio: 0.85,
    // Responsive behavior
    mobileBreakpoint: 640,
    mobileFullscreen: true,
    themeColor: null,
    offsetX: 20,
    offsetY: 20,
    debug: false,

    // When enabled (site widget_config), host launcher can swap to agent avatar once assigned.
    showAgentPhoto: false,

    // Optional postMessage origin allowlist. If set, widget accepts messages from these origins.
    // Otherwise it defaults to the embedUrl origin.
    allowedOrigins: null,
  };

  var PM_CHANNEL = "chatlive.widget";
  var PM_VERSION = 1;

  var MSG = {
    HOST_INIT: "HOST_INIT",
    HOST_SET_OPEN: "HOST_SET_OPEN",
    HOST_SET_THEME: "HOST_SET_THEME",
    HOST_VISIBILITY: "HOST_VISIBILITY",
    HOST_PAGEVIEW: "HOST_PAGEVIEW",

    WIDGET_READY: "WIDGET_READY",
    WIDGET_HEIGHT: "WIDGET_HEIGHT",
    WIDGET_UNREAD: "WIDGET_UNREAD",
    WIDGET_THEME: "WIDGET_THEME",
    WIDGET_AGENT: "WIDGET_AGENT",
    WIDGET_IMAGE_PREVIEW: "WIDGET_IMAGE_PREVIEW",
    WIDGET_REQUEST_OPEN: "WIDGET_REQUEST_OPEN",
    WIDGET_REQUEST_CLOSE: "WIDGET_REQUEST_CLOSE",
  };

  var state = {
    initialized: false,
    open: false,
    isMobile: false,
    root: null,
    iframe: null,
    button: null,
    buttonLabel: null,
    badge: null,
    buttonIcon: null,
    config: null,
    iframeOrigin: "",
    iframeReady: false,
    panelHeight: null,
    unread: 0,
    agentAvatarUrl: null,
    _defaultIconHtml: null,
    _imagePreviewEl: null,
    _imagePreviewImg: null,
    _imagePreviewKeyHandler: null,
    _imagePreviewIgnoreUntil: 0,
    pmQueue: [],
    outsideBound: false,
    prefetchDone: false,
    prefetchInFlight: false,
    prefetchUserConfig: null,
    prefetchTimeoutId: null,
    prefetchFallbackRendered: false,
    prefetchIgnoreLatePatch: false,
    _keepAliveTimer: null,
    _autoHeightTimer: null,
    _autoHeightPending: null,
    _debugMarker: null,
    _debugMarker2: null,
    listeners: {
      ready: [],
      unread: [],
    },
    handlers: {
      docClick: null,
      onMessage: null,
      onResize: null,
      onVvChange: null,
      onHostVis: null,
      onPageChange: null,
      onPopState: null,
      onHashChange: null,
      origPushState: null,
      origReplaceState: null,
    },
  };

  function getPageInfo() {
    try {
      return {
        url: String(window.location && window.location.href ? window.location.href : ""),
        title: String(document && document.title ? document.title : ""),
        referrer: String(document && document.referrer ? document.referrer : ""),
      };
    } catch (e) {
      return { url: "", title: "", referrer: "" };
    }
  }

  function isAllowedOrigin(origin) {
    try {
      var cfg = state.config;
      if (!cfg) return false;
      var list = cfg.allowedOrigins;
      if (Array.isArray(list) && list.length) {
        for (var i = 0; i < list.length; i++) {
          if (String(list[i] || "") === String(origin || "")) return true;
        }
        return false;
      }
      // Default: strict embedUrl origin.
      return !state.iframeOrigin || String(origin || "") === String(state.iframeOrigin);
    } catch (e) {
      return false;
    }
  }

  function getMountContainer() {
    // Prefer <html> to avoid host pages that apply transforms to <body> or app roots,
    // which breaks position:fixed descendants (they become relative to the transformed ancestor).
    return document.documentElement || document.body || null;
  }

  function isConnected(el) {
    if (!el) return false;
    try {
      if (typeof el.isConnected === "boolean") return el.isConnected;
    } catch (e) {
      // ignore
    }
    try {
      return !!(document.documentElement && document.documentElement.contains(el));
    } catch (e2) {
      return false;
    }
  }

  function safeRect(el) {
    try {
      if (!el || typeof el.getBoundingClientRect !== "function") return null;
      var r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    } catch (e) {
      return null;
    }
  }

  function safeComputed(el) {
    try {
      if (!el || typeof window.getComputedStyle !== "function") return null;
      var cs = window.getComputedStyle(el);
      if (!cs) return null;
      return {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        zIndex: cs.zIndex,
        transform: cs.transform,
        pointerEvents: cs.pointerEvents,
        right: cs.right,
        left: cs.left,
        bottom: cs.bottom,
        top: cs.top,
      };
    } catch (e) {
      return null;
    }
  }

  function safeElementInfo(el) {
    try {
      if (!el) return null;
      var id = "";
      try {
        id = el.id ? "#" + String(el.id) : "";
      } catch (e0) {
        id = "";
      }
      var cls = "";
      try {
        cls = el.className ? "." + String(el.className).trim().split(/\s+/).slice(0, 4).join(".") : "";
      } catch (e1) {
        cls = "";
      }
      return String(el.tagName || "").toLowerCase() + id + cls;
    } catch (e) {
      return null;
    }
  }

  function diagnoseVisibility() {
    try {
      if (!state.config || !state.config.debug) return;
      if (!state.root || !state.button) return;

      var rr = safeRect(state.root);
      var br = safeRect(state.button);
      var centerX = br ? br.x + br.w / 2 : rr ? rr.x + rr.w / 2 : null;
      var centerY = br ? br.y + br.h / 2 : rr ? rr.y + rr.h / 2 : null;

      var topEl = null;
      if (centerX !== null && centerY !== null && typeof document.elementFromPoint === "function") {
        try {
          topEl = document.elementFromPoint(centerX, centerY);
        } catch (e2) {
          topEl = null;
        }
      }

      console.info("[ChatLiveWidget] diagnose", {
        mounted: isConnected(state.root),
        rootRect: rr,
        buttonRect: br,
        rootStyle: safeComputed(state.root),
        buttonStyle: safeComputed(state.button),
        topAtButtonCenter: safeElementInfo(topEl),
        buttonContainsTop: !!(topEl && state.button && state.button.contains(topEl)),
      });
    } catch (e) {
      // ignore
    }
  }

  function ensureMounted() {
    if (!state.root) return;
    if (isConnected(state.root)) return;
    var container = getMountContainer();
    if (!container) return;
    try {
      container.appendChild(state.root);
    } catch (e) {
      // ignore
    }
  }

  function startKeepAlive() {
    if (state._keepAliveTimer) return;
    // Only run when debug is enabled to avoid unnecessary work.
    if (!state.config || !state.config.debug) return;
    state._keepAliveTimer = setInterval(function () {
      try {
        ensureMounted();
        // Re-apply critical inline styles if some host script mutates them.
        if (state.root && state.config) {
          var css = layoutStyles(state.config);
          ensureCssText(state.root, css.root);
          if (state.button) ensureCssText(state.button, css.button);
        }

        diagnoseVisibility();
      } catch (e) {
        // ignore
      }
    }, 2000);
  }

  function merge(dst, src) {
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      // Do not clobber defaults with undefined (autoInitFromScriptTag passes many undefineds).
      if (src[k] === undefined) continue;
      dst[k] = src[k];
    }
    return dst;
  }

  function ensureCssText(el, cssText) {
    if (!el) return;
    el.style.cssText = cssText;
  }

  function clamp(n, min, max) {
    if (!Number.isFinite(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function safeParseUrl(url) {
    try {
      return new URL(url);
    } catch (e) {
      return null;
    }
  }

  function isPreviewEmbedUrl(embedUrl) {
    try {
      var u = safeParseUrl(embedUrl);
      if (!u) return false;
      return u.searchParams && u.searchParams.get("chatlive_preview") === "1";
    } catch (e) {
      return false;
    }
  }

  function mapBootstrapToWidgetConfig(widgetConfig) {
    try {
      if (!widgetConfig || typeof widgetConfig !== "object") return null;
      var ws = widgetConfig;
      var out = {};
      // NOTE: The backend returns snake_case fields (WidgetConfigDto). This mapper converts them
      // to the widget's camelCase config shape.

      // Cookie / identity hints (forwarded to iframe as query params)
      if (typeof ws.cookie_domain === "string" && ws.cookie_domain) out.cookieDomain = ws.cookie_domain;
      if (typeof ws.cookie_samesite === "string" && ws.cookie_samesite) out.cookieSameSite = ws.cookie_samesite;

      // Launcher + visuals
      if (typeof ws.launcher_style === "string" && ws.launcher_style) out.launcherStyle = ws.launcher_style;
      if (typeof ws.theme_color === "string" && ws.theme_color) out.themeColor = ws.theme_color;
      if (typeof ws.theme_mode === "string" && ws.theme_mode) out.themeMode = ws.theme_mode;
      if (typeof ws.color_settings_mode === "string" && ws.color_settings_mode) out.colorSettingsMode = ws.color_settings_mode;
      if (typeof ws.color_overrides_json === "string" && ws.color_overrides_json) out.colorOverridesJson = ws.color_overrides_json;
      if (typeof ws.launcher_text === "string" && ws.launcher_text) out.launcherText = ws.launcher_text;
      if (typeof ws.position === "string" && ws.position) out.position = ws.position;
      if (typeof ws.z_index === "number") out.zIndex = ws.z_index;
      if (typeof ws.offset_x === "number") out.offsetX = ws.offset_x;
      if (typeof ws.offset_y === "number") out.offsetY = ws.offset_y;

      // Panel geometry
      if (typeof ws.width === "number") out.width = ws.width;
      if (typeof ws.height === "number") out.height = ws.height;
      if (typeof ws.auto_height === "boolean") out.autoHeight = ws.auto_height;
      if (typeof ws.auto_height_mode === "string" && ws.auto_height_mode) out.autoHeightMode = ws.auto_height_mode;
      if (typeof ws.min_height === "number") out.minHeight = ws.min_height;
      if (typeof ws.max_height_ratio === "number") out.maxHeightRatio = ws.max_height_ratio;

      // Responsive behavior
      if (typeof ws.mobile_breakpoint === "number") out.mobileBreakpoint = ws.mobile_breakpoint;
      if (typeof ws.mobile_fullscreen === "boolean") out.mobileFullscreen = ws.mobile_fullscreen;

      // Diagnostics
      if (typeof ws.debug === "boolean") out.debug = ws.debug;

      // Launcher avatar option
      if (typeof ws.show_agent_photo === "boolean") out.showAgentPhoto = ws.show_agent_photo;

      return out;
    } catch (e) {
      return null;
    }
  }

  function prefetchBootstrapConfig(siteKey, origin, baseOverride) {
    return new Promise(function (resolve) {
      try {
        // Use the widget script origin as the API origin.
        var base = String(baseOverride || "") || getWidgetScriptOrigin() || "";
        if (!base) {
          resolve(null);
          return;
        }

        // Prefetch is best-effort. If we can't determine a stable origin (e.g. srcdoc),
        // skip to avoid triggering avoidable 400s from strict request validation.
        if (!origin) {
          resolve(null);
          return;
        }

        // Cache-bust to avoid any intermediate caching (even though it's POST).
        var url =
          base +
          "/api/v1/public/widget/bootstrap?site_key=" +
          encodeURIComponent(String(siteKey || "")) +
          "&_ts=" +
          String(Date.now());

        if (typeof fetch !== "function") {
          resolve(null);
          return;
        }

        fetch(url, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ site_key: String(siteKey || ""), origin: String(origin || "") }),
        })
          .then(function (r) {
            if (!r || !r.ok) return null;
            return r.json();
          })
          .then(function (data) {
            try {
              // Backend response may be either:
              // 1) { widget_config: {...} }
              // 2) { ok: true, data: { widget_config: {...} } }
              // Keep this tolerant to avoid breaking the prefetch gate.
              var wc = null;
              if (data && data.widget_config) {
                wc = data.widget_config;
              } else if (data && data.data && data.data.widget_config) {
                wc = data.data.widget_config;
              } else if (data && data.data && data.data.widgetConfig) {
                wc = data.data.widgetConfig;
              } else if (data && data.widgetConfig) {
                wc = data.widgetConfig;
              }
              resolve(mapBootstrapToWidgetConfig(wc));
            } catch (e0) {
              resolve(null);
            }
          })
          .catch(function () {
            resolve(null);
          });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function isValidEnvelope(data) {
    if (!data || typeof data !== "object") return false;
    if (data.channel !== PM_CHANNEL) return false;
    if (data.version !== PM_VERSION) return false;
    if (!data.type || typeof data.type !== "string") return false;
    return true;
  }

  function postToIframe(type, payload) {
    var iframe = state.iframe;
    if (!iframe || !iframe.contentWindow) return;
    // Do not broadcast with "*"; queue until READY establishes the correct origin.
    if (!state.iframeReady || !state.iframeOrigin) {
      state.pmQueue.push({ type: type, payload: payload || null, ts: Date.now() });
      return;
    }
    var targetOrigin = state.iframeOrigin;
    try {
      iframe.contentWindow.postMessage(
        {
          channel: PM_CHANNEL,
          version: PM_VERSION,
          type: type,
          payload: payload || null,
          ts: Date.now(),
        },
        targetOrigin,
      );
    } catch (e) {
      // ignore
    }
  }

  function getHostVisibilityPayload() {
    var vs = null;
    var visible = true;
    var focused = true;
    try {
      vs = document && document.visibilityState ? String(document.visibilityState) : null;
      visible = !vs || vs === "visible";
    } catch (e0) {
      // ignore
    }
    try {
      focused = document && typeof document.hasFocus === "function" ? !!document.hasFocus() : true;
    } catch (e1) {
      // ignore
    }
    return { visibilityState: vs, visible: !!visible, focused: !!focused };
  }

  function postHostVisibility() {
    postToIframe(MSG.HOST_VISIBILITY, getHostVisibilityPayload());
  }

  function flushPmQueue() {
    try {
      if (!state.iframeReady || !state.iframeOrigin) return;
      if (!state.pmQueue || !state.pmQueue.length) return;
      var q = state.pmQueue.slice(0);
      state.pmQueue.length = 0;
      for (var i = 0; i < q.length; i++) {
        postToIframe(q[i].type, q[i].payload);
      }
    } catch (e) {
      // ignore
    }
  }

  function getVisualViewport() {
    try {
      return window.visualViewport || null;
    } catch (e) {
      return null;
    }
  }

  function isZoomedPreview() {
    try {
      // 1) visualViewport.scale is commonly != 1 under emulation/zoom.
      var vv = getVisualViewport();
      if (vv) {
        var s = Number(vv.scale);
        if (Number.isFinite(s) && Math.abs(s - 1) > 0.01) return true;
      }
    } catch (e0) {
      // ignore
    }

    try {
      // 2) Chrome DevTools device toolbar zoom can surface as a fractional devicePixelRatio.
      // Real iOS devices are typically integers (2/3). Desktop zoom/DPI scaling often becomes fractional.
      var dpr = Number(window.devicePixelRatio);
      if (Number.isFinite(dpr) && Math.abs(dpr - Math.round(dpr)) > 0.01) return true;
    } catch (e1) {
      // ignore
    }

    return false;
  }

  function fmtPx(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0px";
    // Keep sub-pixel precision for zoom/emulation modes.
    return x.toFixed(3) + "px";
  }

  function applyVisualViewportOverlay() {
    try {
      if (!state.root || !state.isMobile || !state.open) return;
      var vv = getVisualViewport();
      if (!vv) return;

      // Avoid forcing overlay geometry in emulation zoom modes; it can break hit-testing.
      if (isZoomedPreview()) return;

      // Align the fullscreen overlay to the *visual* viewport (keyboard/address bar/pinch-zoom).
      // This reduces hit-testing offsets where the UI looks shifted.
      // Override existing inline !important declarations from ensureCssText.
      state.root.style.setProperty("left", fmtPx(vv.offsetLeft), "important");
      state.root.style.setProperty("top", fmtPx(vv.offsetTop), "important");
      state.root.style.setProperty("right", "auto", "important");
      state.root.style.setProperty("bottom", "auto", "important");
      state.root.style.setProperty("width", fmtPx(vv.width), "important");
      state.root.style.setProperty("height", fmtPx(vv.height), "important");
    } catch (e) {
      // ignore
    }
  }

  function computeOrigin(config) {
    if (config.origin) return config.origin;
    try {
      // file:// => origin is "null"; let caller override.
      if (window.location && window.location.origin && window.location.origin !== "null") {
        return window.location.origin;
      }
    } catch (e) {
      // ignore
    }

    // Admin preview environments sometimes run inside about:srcdoc iframes where
    // window.location.origin becomes "null". Best-effort derive from referrer.
    try {
      var ref = String(document && document.referrer ? document.referrer : "");
      if (ref) {
        var u = safeParseUrl(ref);
        if (u && u.origin && u.origin !== "null") return u.origin;
      }
    } catch (e2) {
      // ignore
    }
    return "";
  }

  function buildEmbedSrc(config) {
    if (!config.embedUrl) throw new Error("missing_embed_url");
    if (!config.siteKey) throw new Error("missing_site_key");

    var origin = computeOrigin(config);
    var qs = "site_key=" + encodeURIComponent(config.siteKey);
    if (origin) qs += "&origin=" + encodeURIComponent(origin);

    if (config.cookieDomain) qs += "&cookie_domain=" + encodeURIComponent(String(config.cookieDomain));
    var ss = normalizeSameSite(config.cookieSameSite);
    if (ss) qs += "&cookie_samesite=" + encodeURIComponent(ss);

    // Keep query clean if embedUrl already has '?' (allow future extensions)
    return config.embedUrl + (config.embedUrl.indexOf("?") >= 0 ? "&" : "?") + qs;
  }

  function layoutStyles(config) {
    var launcherStyle = String((config && config.launcherStyle) || "bubble").trim().toLowerCase();
    var isBar = launcherStyle === "bar";
    var base = {
      root:
        // Be resilient against host page CSS overrides (including aggressive !important rules).
        "position:fixed!important;" +
        // Keep the root as a zero-sized anchor in the corner.
        "width:0!important;height:0!important;" +
        "display:block!important;" +
        "visibility:visible!important;" +
        "opacity:1!important;" +
        // Avoid pointer-events:none on the root to reduce edge-case hit-testing bugs under
        // certain zoom/emulation modes. Children explicitly manage pointer-events.
        "pointer-events:auto!important;" +
        "z-index:" +
        String(config.zIndex) +
        "!important;" +
        "font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji','Segoe UI Emoji'!important;" +
        "box-sizing:border-box!important;" +
        "transform:none!important;" +
        "writing-mode:horizontal-tb!important;" +
        "direction:ltr!important;" +
        "text-rendering:auto!important;" +
        "-webkit-text-size-adjust:100%!important;",
      button:
        // Avoid `all:unset` which can reset important UA properties in surprising ways.
        "appearance:none!important;-webkit-appearance:none!important;" +
        "border:0!important;padding:0!important;margin:0!important;" +
        // High-contrast launcher default (can be overridden by themeColor / overrides)
        "background:#FF5A1F!important;color:#fff!important;" +
        "cursor:pointer;" +
        "position:fixed!important;" +
        "display:flex!important;align-items:center!important;justify-content:center!important;gap:" +
        (isBar ? "10px" : "0px") +
        ";" +
        (isBar
          ? "height:56px!important;width:auto!important;min-width:120px!important;padding:0 18px!important;border-radius:16px!important;"
          : "width:56px!important;height:56px!important;min-width:56px!important;padding:0!important;border-radius:999px!important;") +
        // Material-ish shadow
        "box-shadow: 0 10px 25px rgba(0,0,0,0.22);" +
        "font-size:14px!important;font-weight:600!important;" +
        "user-select:none!important;" +
        "visibility:visible!important;opacity:1!important;" +
        "pointer-events:auto!important;" +
        "transform:none!important;" +
        "transition: box-shadow 140ms ease, transform 140ms ease, filter 140ms ease;" +
        "touch-action:manipulation;" +
        "-webkit-tap-highlight-color: transparent;",
      badge:
        "position:absolute!important;" +
        "top:-6px!important;right:-6px!important;" +
        "min-width:18px!important;height:18px!important;" +
        "padding:0 6px!important;" +
        "border-radius:999px!important;" +
        "background:#ef4444!important;color:#fff!important;" +
        "display:none;" +
        "align-items:center!important;justify-content:center!important;" +
        "font-size:12px!important;font-weight:700!important;" +
        "line-height:18px!important;" +
        "box-shadow: 0 6px 14px rgba(0,0,0,0.18);" +
        "pointer-events:none;",
      panel:
        "position:fixed!important;" +
        "border-radius:14px!important;" +
        // Avoid overflow clipping which can trigger compositing/hit-testing quirks under some emulation modes.
        "overflow:visible!important;" +
        "box-shadow: 0 20px 45px rgba(0,0,0,0.25)!important;" +
        "background:#fff!important;" +
        "transform:none!important;" +
        "touch-action:manipulation;" +
        "width:" +
        String(config.width) +
        "px!important;height:" +
        String(config.height) +
        "px!important;" +
        "min-width:260px!important;" +
        "min-height:" +
        String(config.minHeight) +
        "px!important;" +
        "visibility:visible!important;opacity:1!important;" +
        "pointer-events:auto!important;" +
        // Give the panel its own stacking context.
        "isolation:isolate!important;" +
        // Avoid transform-based animations: can cause hit-testing offsets under
        // some zoom/emulation modes, especially with cross-origin iframes.
        "transition: opacity 120ms ease;",
      iframe: "width:100%!important;height:100%!important;border:0!important;display:block!important;",
    };

    // Positioning
    var right = "right:" + String(config.offsetX) + "px!important;";
    var left = "left:" + String(config.offsetX) + "px!important;";
    var bottom = "bottom:" + String(config.offsetY) + "px!important;";
    var panelBottom = "bottom:" + String((Number(config.offsetY) || 20) + 72) + "px!important;";

    if (config.position === "bottom-left") {
      base.root += left + bottom;
      base.button += left + bottom;
      base.panel += left + panelBottom;
    } else {
      base.root += right + bottom;
      base.button += right + bottom;
      base.panel += right + panelBottom;
    }

    return base;
  }

  function applyLauncherVisual() {
    try {
      if (!state.button || !state.buttonLabel) return;
      var cfg = state.config || DEFAULTS;
      var style = String(cfg.launcherStyle || "bubble").trim().toLowerCase();
      var isBar = style === "bar";

      var icon = null;
      try {
        icon = state.buttonIcon || state.button.querySelector("[data-chatlive-button-icon='1']");
      } catch (e0) {
        icon = null;
      }

      var wantsAgentAvatar = !!(!state.open && cfg && cfg.showAgentPhoto && state.agentAvatarUrl);
      if (icon) {
        if (wantsAgentAvatar) {
          // Replace default SVG with agent avatar image.
          try {
            var url = String(state.agentAvatarUrl || "");
            // Basic scheme allowlist to avoid weird URLs.
            var ok = false;
            try {
              ok = url.indexOf("https://") === 0 || url.indexOf("http://") === 0;
            } catch (e01) {
              ok = false;
            }
            if (!ok || !url) {
              if (state._defaultIconHtml) {
                icon.innerHTML = state._defaultIconHtml;
                icon.style.width = "24px";
                icon.style.height = "24px";
                icon.style.lineHeight = "24px";
              }
            } else {
              // Make avatar more prominent than the default 24px icon.
              icon.style.width = "42px";
              icon.style.height = "42px";
              icon.style.lineHeight = "42px";
              icon.innerHTML = "";
              var img = document.createElement("img");
              img.alt = "";
              img.src = url;
              img.style.width = "42px";
              img.style.height = "42px";
              img.style.borderRadius = "999px";
              img.style.objectFit = "cover";
              img.style.display = "block";
              img.setAttribute("aria-hidden", "true");
              icon.appendChild(img);
            }
          } catch (e02) {
            // ignore
          }
        } else {
          // Restore default SVG if we previously swapped.
          try {
            if (state._defaultIconHtml && icon.innerHTML !== state._defaultIconHtml) {
              icon.innerHTML = state._defaultIconHtml;
              icon.style.width = "24px";
              icon.style.height = "24px";
              icon.style.lineHeight = "24px";
            }
          } catch (e03) {
            // ignore
          }
        }
      }

      if (state.open) {
        // When open, show a close glyph and hide icon.
        state.buttonLabel.textContent = "×";
        state.buttonLabel.style.display = "inline-block";
        if (icon) icon.style.display = "none";
        try {
          state.button.style.gap = "0px";
        } catch (e1) {
          // ignore
        }
        return;
      }

      if (isBar) {
        state.buttonLabel.textContent = cfg.launcherText || "Chat";
        state.buttonLabel.style.display = "inline-block";
        if (icon) icon.style.display = "inline-flex";
        try {
          state.button.style.gap = "10px";
        } catch (e2) {
          // ignore
        }
      } else {
        // Bubble: icon-only (LiveChat-like)
        state.buttonLabel.textContent = "";
        state.buttonLabel.style.display = "none";
        if (icon) icon.style.display = "inline-flex";
        try {
          state.button.style.gap = "0px";
        } catch (e3) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function normalizeHexColor(s) {
    try {
      var t = String(s || "").trim();
      if (!t) return "";
      var v = t.charAt(0) === "#" ? t : "#" + t;
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return "";
      return v.toUpperCase();
    } catch (e) {
      return "";
    }
  }

  function parseColorOverrides(json) {
    try {
      if (!json) return {};
      var raw = JSON.parse(String(json));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      var out = {};
      for (var k in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
        var key = String(k || "").trim();
        if (!key) continue;
        var val = normalizeHexColor(raw[k]);
        if (!val) continue;
        out[key] = val;
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function applyLauncherTheme() {
    try {
      if (!state.button || !state.config) return;

      var overrides = parseColorOverrides(state.config.colorOverridesJson);
      var bg = overrides.minimized_bubble || normalizeHexColor(state.config.themeColor) || "";
      // Default to a high-contrast orange launcher if not configured.
      if (!bg) bg = "#FF5A1F";
      var fg = overrides.minimized_icon || "#FFFFFF";

      state.button.style.background = String(bg);
      state.button.style.color = String(fg);
    } catch (e) {
      // ignore
    }
  }

  function setThemeColor(color) {
    state.config.themeColor = color || null;
    applyLauncherTheme();
  }

  function setLauncherStyle(style) {
    try {
      if (!state.config || !state.button) return;
      var next = String(style || "").trim().toLowerCase();
      if (next !== "bar" && next !== "bubble") return;
      if (String(state.config.launcherStyle || "").trim().toLowerCase() === next) return;

      state.config.launcherStyle = next;
      // Re-apply button layout CSS for the new style.
      var css = layoutStyles(state.config);
      ensureCssText(state.button, css.button);
      // Restore configured theme overrides after cssText overwrite.
      applyLauncherTheme();
      applyLauncherVisual();
    } catch (e) {
      // ignore
    }
  }

  function setPlacement(next) {
    try {
      if (!state.config) return;
      if (!next || typeof next !== "object") return;

      var changed = false;

      if (typeof next.position === "string" && next.position) {
        var p = String(next.position).trim();
        if (p && state.config.position !== p) {
          state.config.position = p;
          changed = true;
        }
      }

      if (typeof next.zIndex === "number" && Number.isFinite(next.zIndex)) {
        if (state.config.zIndex !== next.zIndex) {
          state.config.zIndex = next.zIndex;
          changed = true;
        }
      }

      if (typeof next.offsetX === "number" && Number.isFinite(next.offsetX)) {
        if (state.config.offsetX !== next.offsetX) {
          state.config.offsetX = next.offsetX;
          changed = true;
        }
      }

      if (typeof next.offsetY === "number" && Number.isFinite(next.offsetY)) {
        if (state.config.offsetY !== next.offsetY) {
          state.config.offsetY = next.offsetY;
          changed = true;
        }
      }

      if (!changed) return;

      // Re-apply layout to move launcher/panel without a full reload.
      if (state.root && state.button && state.iframe) {
        applyResponsiveLayout();
      }
    } catch (e) {
      // ignore
    }
  }

  function setUnread(n) {
    state.unread = Number.isFinite(n) ? n : 0;
    if (!state.badge) return;
    if (!state.unread || state.open) {
      state.badge.style.display = "none";
      state.badge.textContent = "";
    } else {
      var text = state.unread > 99 ? "99+" : String(state.unread);
      state.badge.textContent = text;
      state.badge.style.display = "flex";
    }

    var list = state.listeners.unread || [];
    for (var i = 0; i < list.length; i++) {
      try {
        list[i]({ unread: state.unread });
      } catch (e) {
        // ignore
      }
    }
  }

  function computeMaxHeightPx(config) {
    var ratio = Number(config.maxHeightRatio);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) ratio = 0.85;
    var viewport = window.innerHeight || 800;

    // Leave space for button (56) + gap (~16) + page offsetY.
    var hardMax = Math.floor(viewport * ratio);
    var byBottom = Math.max(200, viewport - (Number(config.offsetY) || 20) - 72);
    return Math.min(hardMax, byBottom);
  }

  function computeIsMobile(config) {
    try {
      var bp = Number(config && config.mobileBreakpoint);
      if (!Number.isFinite(bp) || bp <= 0) bp = 640;
      // Primary: viewport width
      var w = window.innerWidth || 1024;
      if (w <= bp) return true;

      // Fallback: coarse pointer / touch devices (covers pages missing <meta name="viewport">).
      try {
        if (typeof window.matchMedia === "function") {
          if (window.matchMedia("(pointer: coarse)").matches) return true;
          if (window.matchMedia("(hover: none)").matches) return true;
        }
      } catch (e2) {
        // ignore
      }

      try {
        var mtp = Number(navigator && (navigator.maxTouchPoints || 0));
        if (mtp > 0) return true;
      } catch (e3) {
        // ignore
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  function applyResponsiveLayout() {
    if (!state.config || !state.root || !state.button || !state.iframe) return;

    // Fullscreen overlay is great on real mobile, but DevTools zoom/emulation can break hit-testing.
    // In that case, fall back to the desktop-style fixed panel (still responsive enough for 430px width).
    state.isMobile = !!(state.config.mobileFullscreen && computeIsMobile(state.config) && !isZoomedPreview());

    var css = layoutStyles(state.config);
    // Default (desktop / closed state) layout
    ensureCssText(state.root, css.root);
    ensureCssText(state.button, css.button);
    if (state.badge) ensureCssText(state.badge, css.badge);

    // Restore theme color after resetting cssText.
    setThemeColor(state.config.themeColor || null);

    var panel = state.iframe.parentElement;
    if (!panel) return;

    // Mobile fullscreen only when open; keep launcher unobtrusive when closed.
    if (state.isMobile && state.open) {
      // Some mobile browsers/frameworks have hit-testing bugs when a fixed child lives under
      // a zero-sized fixed root. Use a fullscreen root overlay with absolute children.
      ensureCssText(
        state.root,
        "position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;" +
          "width:auto!important;height:auto!important;" +
          "display:block!important;visibility:visible!important;opacity:1!important;" +
          "pointer-events:auto!important;" +
          "transform:none!important;" +
          "z-index:" +
          String(state.config.zIndex) +
          "!important;" +
          "box-sizing:border-box!important;" +
          "-webkit-text-size-adjust:100%!important;",
      );

      // Sync with visual viewport if supported.
      applyVisualViewportOverlay();

      // Fullscreen panel
      var panelCss =
        css.panel +
        "position:absolute!important;left:0!important;right:0!important;top:0!important;bottom:0!important;" +
        "width:auto!important;height:auto!important;min-width:100%!important;min-height:100%!important;" +
        "border-radius:0!important;overflow:hidden!important;";
      ensureCssText(panel, panelCss);

      // Hide the host launcher button while open on mobile fullscreen.
      // The embedded visitor UI already has its own close/minimize controls.
      ensureCssText(state.button, css.button + "display:none!important;pointer-events:none!important;");
      setThemeColor(state.config.themeColor || null);
    } else {
      ensureCssText(panel, css.panel);
    }

    // Re-apply open/close state (visibility/opacity/pointer-events + button label).
    applyOpenState();
  }

  function setPanelHeightPx(heightPx) {
    var iframe = state.iframe;
    if (!iframe) return;
    var panel = iframe.parentElement;
    if (!panel) return;

    // Fullscreen panel on mobile should not be auto-resized by iframe measurements.
    if (state.isMobile && state.config && state.config.mobileFullscreen) return;

    var cfg = state.config || DEFAULTS;
    var minH = Number(cfg.minHeight);
    if (!Number.isFinite(minH) || minH < 160) minH = 320;
    var maxH = computeMaxHeightPx(cfg);
    var next = clamp(Number(heightPx), minH, maxH);

    state.panelHeight = next;
    panel.style.height = String(next) + "px";
  }

  function setOpen(open) {
    state.open = !!open;

    // Re-apply layout because mobile fullscreen needs different button positioning when open.
    if (state.config && state.config.mobileFullscreen) {
      applyResponsiveLayout();
      return;
    }

    applyOpenState();
  }

  function applyOpenState() {
    if (!state.iframe) return;

    var panel = state.iframe.parentElement;
    if (!panel) return;

    if (state.open) {
      applyVisualViewportOverlay();
      // Intentionally do NOT bind a document-level outside-click handler.
      // Requirement: clicking outside the chat window should NOT close/collapse it.
      panel.style.visibility = "visible";
      panel.style.opacity = "1";
      panel.style.pointerEvents = "auto";
      applyLauncherVisual();
      // Hide badge while open (widget should also reset unread).
      if (state.badge) state.badge.style.display = "none";
      postToIframe(MSG.HOST_SET_OPEN, { open: true });
      postHostVisibility();
    } else {
      // If older versions had outsideBound=true, make best-effort to unbind.
      // (Keeps behavior consistent even across hot reload / multiple init calls.)
      if (state.handlers && state.handlers.docClick && state.outsideBound) {
        try {
          document.removeEventListener("pointerdown", state.handlers.docClick, true);
        } catch (e00) {
          // ignore
        }
      }
      state.outsideBound = false;
      panel.style.opacity = "0";
      panel.style.visibility = "hidden";
      panel.style.pointerEvents = "none";
      applyLauncherVisual();
      postToIframe(MSG.HOST_SET_OPEN, { open: false });
      postHostVisibility();
      // Re-show badge if needed.
      if (state.unread && state.badge) state.badge.style.display = "flex";
    }
  }

  function onMessage(ev) {
    if (!state.iframe || !state.iframe.contentWindow) return;
    if (ev.source !== state.iframe.contentWindow) return;
    if (!isAllowedOrigin(ev.origin)) return;

    var data = ev.data;
    if (!isValidEnvelope(data)) return;

    var payload = data.payload || null;

    if (data.type === MSG.WIDGET_READY) {
      state.iframeReady = true;
      // On READY, send init config/state.
      postToIframe(MSG.HOST_INIT, {
        open: !!state.open,
        themeColor: state.config.themeColor || null,
        themeMode: state.config.themeMode || "light",
        colorSettingsMode: state.config.colorSettingsMode || "theme",
        colorOverridesJson: state.config.colorOverridesJson || null,
        launcherStyle: state.config.launcherStyle || "bubble",
        autoHeight: !!state.config.autoHeight,
        page: getPageInfo(),
      });
      postHostVisibility();
      // Also send an explicit page_view event (so iframe can enqueue tracking uniformly).
      postToIframe(MSG.HOST_PAGEVIEW, getPageInfo());
      flushPmQueue();
      var list = state.listeners.ready || [];
      for (var i = 0; i < list.length; i++) {
        try {
          list[i]({ ready: true });
        } catch (e) {
          // ignore
        }
      }
      return;
    }

    if (data.type === MSG.WIDGET_HEIGHT) {
      if (!state.config.autoHeight) return;
      if (!payload || typeof payload.height !== "number") return;

      // Fixed mode: never resize panel from iframe measurements.
      if (state.config.autoHeightMode === "fixed") return;

      // Never let iframe measurements shrink the panel by default.
      if (state.config.autoHeightMode !== "dynamic") {
        if (state.panelHeight && payload.height < state.panelHeight) return;
      }

      // Buffer multiple height updates during first-load/layout to avoid visible
      // "panel slowly grows upward" effect. Apply only once per short window.
      var h = payload.height;
      state._autoHeightPending = Math.max(Number(state._autoHeightPending) || 0, Number(h) || 0);
      if (state._autoHeightTimer) return;
      state._autoHeightTimer = setTimeout(function () {
        try {
          var next = Number(state._autoHeightPending) || 0;
          state._autoHeightPending = null;
          state._autoHeightTimer = null;
          if (next > 0) setPanelHeightPx(next);
        } catch (e) {
          state._autoHeightPending = null;
          state._autoHeightTimer = null;
        }
      }, 120);
      return;
    }

    if (data.type === MSG.WIDGET_UNREAD) {
      if (!payload || typeof payload.unread !== "number") return;
      setUnread(payload.unread);
      return;
    }

    if (data.type === MSG.WIDGET_AGENT) {
      if (!payload || typeof payload !== "object") return;
      try {
        if (typeof payload.enabled === "boolean" && state.config) {
          state.config.showAgentPhoto = payload.enabled;
        }
      } catch (e00) {
        // ignore
      }
      var nextUrl = null;
      try {
        // payload: { avatar_url: string|null }
        if (typeof payload.avatar_url === "string") nextUrl = payload.avatar_url;
        else if (payload.avatar_url === null) nextUrl = null;
      } catch (e0) {
        nextUrl = null;
      }
      state.agentAvatarUrl = nextUrl && String(nextUrl || "").trim() ? String(nextUrl || "").trim() : null;
      applyLauncherVisual();
      return;
    }

    if (data.type === MSG.WIDGET_IMAGE_PREVIEW) {
      if (!payload || typeof payload !== "object") return;
      var url = "";
      try {
        url = typeof payload.url === "string" ? String(payload.url || "").trim() : "";
      } catch (e00) {
        url = "";
      }
      if (!url) return;
      openImagePreview(url);
      return;
    }

    if (data.type === MSG.WIDGET_THEME) {
      if (!payload || typeof payload !== "object") return;
      if (typeof payload.themeColor === "string") {
        setThemeColor(payload.themeColor);
      } else if (payload.themeColor === null) {
        setThemeColor(null);
      }
      if (typeof payload.launcherStyle === "string") {
        setLauncherStyle(payload.launcherStyle);
      }

      // Placement sync (no snippet re-paste required): position / offsets / z-index.
      setPlacement(payload);
      return;
    }

    if (data.type === MSG.WIDGET_REQUEST_OPEN) {
      setOpen(true);
      return;
    }

    if (data.type === MSG.WIDGET_REQUEST_CLOSE) {
      setOpen(false);
      return;
    }
  }

  function isSafeHttpUrl(raw) {
    try {
      var u = new URL(String(raw || ""), window.location.href);
      return u && (u.protocol === "http:" || u.protocol === "https:");
    } catch (e) {
      return false;
    }
  }

  function ensureImagePreviewElements() {
    if (state._imagePreviewEl && state._imagePreviewImg) return;

    var overlay = document.createElement("div");
    overlay.setAttribute("data-chatlive", "image-preview");
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0,0,0,.72)";
    overlay.style.zIndex = String((state.config && state.config.zIndex) || 2147483647);
    overlay.style.padding = "14px";
    overlay.style.boxSizing = "border-box";

    var img = document.createElement("img");
    img.alt = "";
    img.style.display = "block";
    img.style.maxWidth = "min(96vw, 1200px)";
    img.style.maxHeight = "90vh";
    img.style.width = "auto";
    img.style.height = "auto";
    img.style.objectFit = "contain";
    img.style.borderRadius = "12px";
    img.style.background = "transparent";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.style.position = "fixed";
    closeBtn.style.right = "18px";
    closeBtn.style.top = "18px";
    closeBtn.style.width = "44px";
    closeBtn.style.height = "44px";
    closeBtn.style.borderRadius = "999px";
    closeBtn.style.border = "1px solid rgba(255,255,255,.28)";
    closeBtn.style.background = "rgba(0,0,0,.35)";
    closeBtn.style.color = "#fff";
    closeBtn.style.fontSize = "28px";
    closeBtn.style.lineHeight = "40px";
    closeBtn.style.cursor = "pointer";

    function onOverlayClick(e) {
      try {
        // Prevent the same click that triggered openImagePreview() from instantly
        // closing the overlay (common on mobile, and can happen on desktop due to timing).
        if (Date.now() < (Number(state._imagePreviewIgnoreUntil) || 0)) return;
      } catch (e0) {
        // ignore
      }
      if (e && e.target === overlay) closeImagePreview();
    }

    closeBtn.addEventListener("click", function () {
      closeImagePreview();
    });
    overlay.addEventListener("click", onOverlayClick);
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);

    state._imagePreviewEl = overlay;
    state._imagePreviewImg = img;

    state._imagePreviewKeyHandler = function (e) {
      try {
        if (!e) return;
        if (e.key === "Escape") closeImagePreview();
      } catch (e0) {
        // ignore
      }
    };

    try {
      document.body.appendChild(overlay);
    } catch (e) {
      // ignore
    }
  }

  function openImagePreview(url) {
    if (!isSafeHttpUrl(url)) return;
    ensureImagePreviewElements();
    if (!state._imagePreviewEl || !state._imagePreviewImg) return;

    try {
      // Ignore immediate click events right after opening.
      state._imagePreviewIgnoreUntil = Date.now() + 450;
      state._imagePreviewImg.src = String(url || "");
      state._imagePreviewEl.style.display = "flex";
      if (state._imagePreviewKeyHandler) window.addEventListener("keydown", state._imagePreviewKeyHandler);
    } catch (e) {
      // ignore
    }
  }

  function closeImagePreview() {
    try {
      if (state._imagePreviewKeyHandler) window.removeEventListener("keydown", state._imagePreviewKeyHandler);
    } catch (e0) {
      // ignore
    }
    try {
      if (state._imagePreviewEl) state._imagePreviewEl.style.display = "none";
      if (state._imagePreviewImg) state._imagePreviewImg.src = "";
    } catch (e) {
      // ignore
    }
  }

  function init(userConfig) {
    if (state.initialized) {
      var nextCfg = merge(merge({}, state.config || DEFAULTS), userConfig || {});

      // If embed target changes, do a full rebuild.
      try {
        var prevEmbed = String((state.config && state.config.embedUrl) || "");
        var prevSite = String((state.config && state.config.siteKey) || "");
        var nextEmbed = String(nextCfg.embedUrl || "");
        var nextSite = String(nextCfg.siteKey || "");
        if (prevEmbed !== nextEmbed || prevSite !== nextSite) {
          destroy();
          init(nextCfg);
          return;
        }
      } catch (e0) {
        // ignore
      }

      state.config = nextCfg;
      try {
        var embedUrlObj2 = safeParseUrl(state.config.embedUrl);
        state.iframeOrigin = embedUrlObj2 ? embedUrlObj2.origin : "";
      } catch (e1) {
        state.iframeOrigin = "";
      }

      // Update UI.
      applyResponsiveLayout();
      applyLauncherVisual();
      if (!state.config.autoHeight) setPanelHeightPx(state.config.height);
      postToIframe(MSG.HOST_INIT, {
        open: !!state.open,
        themeColor: state.config.themeColor || null,
        themeMode: state.config.themeMode || "light",
        colorSettingsMode: state.config.colorSettingsMode || "theme",
        colorOverridesJson: state.config.colorOverridesJson || null,
        launcherStyle: state.config.launcherStyle || "bubble",
        autoHeight: !!state.config.autoHeight,
        page: getPageInfo(),
      });
      return;
    }

    // First-load prefetch: try to fetch server-side widget_config before rendering,
    // so the launcher doesn't flash defaults and then switch after iframe bootstraps.
    if (!state.prefetchDone && !state.prefetchInFlight) {
      try {
        var seed = merge(merge({}, DEFAULTS), userConfig || {});
        // Prefer pulling server-side widget_config first so the launcher doesn't flash defaults.
        // This is used in both production and admin preview; preview can still override by
        // calling init() again (e.g. via postMessage from the admin UI).
        var apiBase = getBootstrapApiOrigin(seed) || "";
        var canPrefetch = !!seed.siteKey && !!apiBase && typeof fetch === "function";
        if (!canPrefetch) {
          state.prefetchDone = true;
        } else {
          state.prefetchInFlight = true;
          state.prefetchUserConfig = userConfig || {};

          // Timeout: block rendering briefly to avoid flashing old snippet styles.
          // If it times out, we render once using the snippet config and then ignore late patches
          // to avoid "old -> new" switching.
          try {
            state.prefetchTimeoutId = setTimeout(function () {
              try {
                state.prefetchDone = true;
                state.prefetchInFlight = false;
                state.prefetchTimeoutId = null;
                state.prefetchFallbackRendered = true;
                state.prefetchIgnoreLatePatch = true;
                init(state.prefetchUserConfig || {});
              } catch (e0) {
                // ignore
              }
            }, 10000);
          } catch (e1) {
            state.prefetchTimeoutId = null;
          }

          prefetchBootstrapConfig(seed.siteKey, computeOrigin(seed), apiBase)
            .then(function (patch) {
              // If we already rendered a fallback due to timeout, don't apply late patches
              // to avoid a visible style switch.
              if (state.prefetchIgnoreLatePatch && state.prefetchFallbackRendered) {
                state.prefetchDone = true;
                state.prefetchInFlight = false;
                return;
              }
              try {
                if (state.prefetchTimeoutId) {
                  clearTimeout(state.prefetchTimeoutId);
                  state.prefetchTimeoutId = null;
                }
              } catch (e2) {
                state.prefetchTimeoutId = null;
              }

              state.prefetchDone = true;
              state.prefetchInFlight = false;
              if (patch && typeof patch === "object") {
                state.prefetchUserConfig = merge(merge({}, state.prefetchUserConfig || {}), patch);
              }
              init(state.prefetchUserConfig || {});
            })
            .catch(function () {
              if (state.prefetchIgnoreLatePatch && state.prefetchFallbackRendered) {
                state.prefetchDone = true;
                state.prefetchInFlight = false;
                return;
              }
              try {
                if (state.prefetchTimeoutId) {
                  clearTimeout(state.prefetchTimeoutId);
                  state.prefetchTimeoutId = null;
                }
              } catch (e3) {
                state.prefetchTimeoutId = null;
              }
              state.prefetchDone = true;
              state.prefetchInFlight = false;
              init(state.prefetchUserConfig || {});
            });

          return;
        }
      } catch (e4) {
        state.prefetchDone = true;
        state.prefetchInFlight = false;
      }
    }

    if (state.prefetchInFlight) {
      // If someone calls init() while prefetching, merge their config so it isn't lost.
      state.prefetchUserConfig = merge(merge({}, state.prefetchUserConfig || {}), userConfig || {});
      return;
    }

    var config = merge(merge({}, DEFAULTS), userConfig || {});
    state.config = config;

    var src = buildEmbedSrc(config);
    var css = layoutStyles(config);

    var embedUrlObj = safeParseUrl(config.embedUrl);
    state.iframeOrigin = embedUrlObj ? embedUrlObj.origin : "";
    state.iframeReady = false;

    var root = document.createElement("div");
    root.id = "chatlive-widget-root";
    root.setAttribute("data-chatlive-widget", "1");
    ensureCssText(root, css.root);

    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Open chat");
    ensureCssText(button, css.button);
    if (config.themeColor) {
      button.style.background = String(config.themeColor);
    }
    // Apply final launcher theme (supports advanced overrides and icon color)
    try {
      state.config = config;
      state.button = button;
      applyLauncherTheme();
    } catch (e) {
      // ignore
    }

    // Button icon (centered, minimal noise)
    var buttonIcon = document.createElement("span");
    buttonIcon.setAttribute("data-chatlive-button-icon", "1");
    buttonIcon.setAttribute("aria-hidden", "true");
    ensureCssText(
      buttonIcon,
      "display:inline-flex;align-items:center;justify-content:center;" +
        "width:24px;height:24px;" +
        "line-height:24px;" +
        "color:inherit;" +
        "pointer-events:none;",
    );
    buttonIcon.innerHTML =
      "<svg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>" +
      "<path d='M21 12c0 4.418-4.03 8-9 8-1.015 0-2-.145-2.93-.414L3 21l1.62-4.12A7.42 7.42 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z' stroke='currentColor' stroke-width='2' stroke-linejoin='round'/>" +
      "<path d='M8 12h.01M12 12h.01M16 12h.01' stroke='currentColor' stroke-width='3' stroke-linecap='round'/>" +
      "</svg>";
    var defaultIconHtml = buttonIcon.innerHTML;
    button.appendChild(buttonIcon);

    // Button label (do not use button.textContent later; it would clear the badge node)
    var buttonLabel = document.createElement("span");
    buttonLabel.setAttribute("data-chatlive-button-label", "1");
    buttonLabel.textContent = config.launcherText || "Chat";
    ensureCssText(buttonLabel, "display:inline-block;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;");
    button.appendChild(buttonLabel);

    // Badge
    var badge = document.createElement("span");
    badge.setAttribute("aria-hidden", "true");
    ensureCssText(badge, css.badge);
    button.appendChild(badge);

    var panel = document.createElement("div");
    ensureCssText(panel, css.panel);

    if (config.debug) {
      try {
        panel.setAttribute("data-chatlive-panel", "1");
      } catch (e) {
        // ignore
      }
    }

    var iframe = document.createElement("iframe");
    iframe.title = "ChatLive";
    iframe.src = src;
    // Avoid lazy iframes; under some emulation/zoom modes it can increase timing/layout quirks.
    iframe.loading = "eager";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    // Enable features used by the embedded visitor UI.
    // Without `display-capture`, Chrome will block getDisplayMedia() inside the iframe.
    // (Shows as: Permissions policy violation: display-capture is not allowed in this document.)
    try {
      iframe.allow = "display-capture; fullscreen; clipboard-read; clipboard-write";
    } catch (e0) {
      // ignore
    }
    ensureCssText(iframe, css.iframe);

    // Keep state theme in sync (button style handled above before state.button is assigned).
    state.config.themeColor = config.themeColor || null;

    panel.appendChild(iframe);
    root.appendChild(panel);
    root.appendChild(button);

    button.addEventListener("click", function () {
      setOpen(!state.open);
    });

    // Click outside closes
    state.handlers.docClick = function (e) {
      // Disabled: clicking outside should NOT close/collapse the chat window.
      return;
    };

    // Use pointerdown for better mobile behavior; bind only while open.
    // (Bound/unbound inside applyOpenState)

    state.handlers.onMessage = onMessage;
    window.addEventListener("message", state.handlers.onMessage);

    // Page tracking: send page view on SPA navigations.
    state.handlers.onPageChange = function (reason) {
      try {
        var info = getPageInfo();
        if (!info || !info.url) return;
        postToIframe(MSG.HOST_PAGEVIEW, {
          url: info.url,
          title: info.title,
          referrer: info.referrer,
          reason: reason || "",
        });
      } catch (e) {
        // ignore
      }
    };

    state.handlers.onPopState = function () {
      if (state.handlers.onPageChange) state.handlers.onPageChange("popstate");
    };
    state.handlers.onHashChange = function () {
      if (state.handlers.onPageChange) state.handlers.onPageChange("hashchange");
    };
    try {
      window.addEventListener("popstate", state.handlers.onPopState);
      window.addEventListener("hashchange", state.handlers.onHashChange);
    } catch (e) {
      // ignore
    }

    try {
      if (window.history && typeof window.history.pushState === "function") {
        state.handlers.origPushState = window.history.pushState;
        window.history.pushState = function () {
          state.handlers.origPushState.apply(window.history, arguments);
          if (state.handlers.onPageChange) state.handlers.onPageChange("pushState");
        };
      }
      if (window.history && typeof window.history.replaceState === "function") {
        state.handlers.origReplaceState = window.history.replaceState;
        window.history.replaceState = function () {
          state.handlers.origReplaceState.apply(window.history, arguments);
          if (state.handlers.onPageChange) state.handlers.onPageChange("replaceState");
        };
      }
    } catch (e) {
      // ignore
    }

    // Forward host tab visibility/focus changes to iframe so it can decide read receipts reliably.
    state.handlers.onHostVis = function () {
      postHostVisibility();
    };
    try {
      document.addEventListener("visibilitychange", state.handlers.onHostVis);
      window.addEventListener("focus", state.handlers.onHostVis);
      window.addEventListener("blur", state.handlers.onHostVis);
    } catch (e) {
      // ignore
    }

    state.handlers.onResize = function () {
      if (!state.config) return;
      applyResponsiveLayout();
      if (!state.config.autoHeight) return;
      // Re-clamp current height when viewport changes.
      if (state.panelHeight) setPanelHeightPx(state.panelHeight);
    };
    window.addEventListener("resize", state.handlers.onResize);

    // Keep fullscreen overlay aligned with the visual viewport.
    state.handlers.onVvChange = function () {
      applyVisualViewportOverlay();
    };
    try {
      var vv = getVisualViewport();
      if (vv) {
        vv.addEventListener("resize", state.handlers.onVvChange);
        vv.addEventListener("scroll", state.handlers.onVvChange);
      }
    } catch (e) {
      // ignore
    }

    state.root = root;
    state.iframe = iframe;
    state.button = button;
    state.buttonIcon = buttonIcon;
    state.buttonLabel = buttonLabel;
    state._defaultIconHtml = defaultIconHtml;
    // Apply initial label/icon state.
    applyLauncherVisual();
    state.badge = badge;

    // Initialize height baseline so autoHeight (grow-only) doesn't shrink the panel unexpectedly.
    state.panelHeight = null;
    setPanelHeightPx(config.height);

    // Apply responsive layout (mobile fullscreen vs desktop popup).
    applyResponsiveLayout();

    var container = getMountContainer();
    if (container) {
      container.appendChild(root);
    }

    if (config.debug) {
      try {
        // Visual hint + console breadcrumbs for hard-to-debug host pages.
        root.style.outline = "2px solid rgba(37,99,235,.55)";
        // A tiny marker that should be visible even when the button is offscreen.
        var marker = document.createElement("div");
        marker.setAttribute("data-chatlive-marker", "1");
        marker.style.cssText =
          "all:initial;position:absolute!important;right:0!important;bottom:0!important;" +
          "width:10px!important;height:10px!important;background:rgba(239,68,68,.85)!important;" +
          "border:1px solid rgba(255,255,255,.9)!important;box-sizing:border-box!important;" +
          "pointer-events:none!important;";
        root.appendChild(marker);
        state._debugMarker = marker;

        // A top-left marker helps detect global overlays/clipping.
        var marker2 = document.createElement("div");
        marker2.setAttribute("data-chatlive-marker2", "1");
        marker2.style.cssText =
          "all:initial;position:fixed!important;left:0!important;top:0!important;" +
          "z-index:" +
          String(config.zIndex) +
          "!important;" +
          "width:10px!important;height:10px!important;background:rgba(34,197,94,.85)!important;" +
          "border:1px solid rgba(255,255,255,.9)!important;box-sizing:border-box!important;" +
          "pointer-events:none!important;";
        // Append to <html> to survive some body re-mount patterns.
        (document.documentElement || root).appendChild(marker2);
        state._debugMarker2 = marker2;

        console.info("[ChatLiveWidget] init ok", {
          siteKey: config.siteKey,
          embedUrl: config.embedUrl,
          iframeOrigin: state.iframeOrigin,
          mounted: isConnected(root),
          rootRect: safeRect(root),
          buttonRect: safeRect(button),
        });

        diagnoseVisibility();
      } catch (e) {
        // ignore
      }
    }
    state.initialized = true;

    startKeepAlive();

    // Fire a best-effort install beacon for "installation verification".
    fireInstallBeacon(config);

    // Start closed by default
    setOpen(false);
  }

  function fireInstallBeacon(config) {
    try {
      // Retry a few times to survive transient blocks (e.g., adblock / CSP / network).
      if (!state.installBeaconAttempts) state.installBeaconAttempts = 0;
      if (state.installBeaconAttempts >= 3) return;
      state.installBeaconAttempts++;

      if (!config || !config.siteKey) return;

      var base = "";

      // Prefer deriving from the config script tag if present.
      var el = findConfigScript();
      var src = el && el.src ? String(el.src) : "";
      if (src) {
        try {
          base = new URL(src, window.location && window.location.href ? window.location.href : undefined).origin;
        } catch (e) {
          base = "";
        }
      }

      // Fallback: use the script origin captured at load time (covers SPA init() patterns).
      if (!base && SCRIPT_ORIGIN) base = SCRIPT_ORIGIN;
      if (!base) return;

      var origin = computeOrigin(config);
      var pageUrl = "";
      try {
        pageUrl = String(window.location && window.location.href ? window.location.href : "");
      } catch (e) {
        pageUrl = "";
      }

      var qs = "site_key=" + encodeURIComponent(config.siteKey);
      if (origin) qs += "&origin=" + encodeURIComponent(origin);
      if (pageUrl) qs += "&page=" + encodeURIComponent(pageUrl.slice(0, 900));
      qs += "&ts=" + String(Date.now());

      // Try a non-.gif endpoint first to avoid common adblock rules.
      // 1) sendBeacon (POST) if available
      // 2) fetch (GET, no-cors) as a fallback
      var urlPing = base + "/chatlive/ping?" + qs;
      try {
        if (navigator && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon(urlPing, "");
        }
      } catch (e) {
        // ignore
      }
      try {
        if (typeof fetch === "function") {
          fetch(urlPing, { method: "GET", mode: "no-cors", credentials: "omit", keepalive: true, cache: "no-store" }).catch(function () {});
        }
      } catch (e) {
        // ignore
      }

      // Fallback to the 1x1 gif pixel.
      var urlGif = base + "/chatlive/ping.gif?" + qs;
      var img = new Image(1, 1);
      img.referrerPolicy = "no-referrer";
      img.src = urlGif;

      // Keep a reference to avoid aggressive GC canceling the request.
      state._installBeaconImg = img;

      if (state.installBeaconAttempts < 3) {
        var delay = state.installBeaconAttempts === 1 ? 3000 : 15000;
        setTimeout(function () {
          fireInstallBeacon(config);
        }, delay);
      }
    } catch (e) {
      // ignore
    }
  }

  function destroy() {
    if (!state.initialized) return;
    try {
      if (state._keepAliveTimer) clearInterval(state._keepAliveTimer);
    } catch (e0) {
      // ignore
    }

    try {
      if (state._autoHeightTimer) clearTimeout(state._autoHeightTimer);
    } catch (e0a) {
      // ignore
    }
    state._autoHeightTimer = null;
    state._autoHeightPending = null;

    try {
      if (state._debugMarker && state._debugMarker.parentElement) state._debugMarker.parentElement.removeChild(state._debugMarker);
    } catch (e00) {
      // ignore
    }

    try {
      if (state._debugMarker2 && state._debugMarker2.parentElement) state._debugMarker2.parentElement.removeChild(state._debugMarker2);
    } catch (e01) {
      // ignore
    }

    try {
      if (state._imagePreviewKeyHandler) window.removeEventListener("keydown", state._imagePreviewKeyHandler);
    } catch (e01a) {
      // ignore
    }
    try {
      if (state._imagePreviewEl && state._imagePreviewEl.parentElement) state._imagePreviewEl.parentElement.removeChild(state._imagePreviewEl);
    } catch (e01b) {
      // ignore
    }
    try {
      if (state.root && state.root.parentElement) state.root.parentElement.removeChild(state.root);
    } catch (e) {
      // ignore
    }

    try {
      if (state.handlers.docClick && state.outsideBound) document.removeEventListener("pointerdown", state.handlers.docClick, true);
    } catch (e) {
      // ignore
    }
    state.outsideBound = false;
    try {
      if (state.handlers.onMessage) window.removeEventListener("message", state.handlers.onMessage);

      try {
        if (state.handlers.onPopState) window.removeEventListener("popstate", state.handlers.onPopState);
        if (state.handlers.onHashChange) window.removeEventListener("hashchange", state.handlers.onHashChange);
      } catch (e) {
        // ignore
      }

      try {
        if (state.handlers.origPushState && window.history) window.history.pushState = state.handlers.origPushState;
        if (state.handlers.origReplaceState && window.history) window.history.replaceState = state.handlers.origReplaceState;
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // ignore
    }

    try {
      if (state.handlers.onHostVis) {
        document.removeEventListener("visibilitychange", state.handlers.onHostVis);
        window.removeEventListener("focus", state.handlers.onHostVis);
        window.removeEventListener("blur", state.handlers.onHostVis);
      }
    } catch (e) {
      // ignore
    }
    try {
      if (state.handlers.onResize) window.removeEventListener("resize", state.handlers.onResize);
    } catch (e) {
      // ignore
    }

    try {
      if (state.handlers.onVvChange) {
        var vv = getVisualViewport();
        if (vv) {
          vv.removeEventListener("resize", state.handlers.onVvChange);
          vv.removeEventListener("scroll", state.handlers.onVvChange);
        }
      }
    } catch (e) {
      // ignore
    }

    state.initialized = false;
    state.open = false;
    state.root = null;
    state.iframe = null;
    state.button = null;
    state.badge = null;
    state.buttonLabel = null;
    state.config = null;
    state.iframeOrigin = "";
    state.iframeReady = false;
    state.panelHeight = null;
    state.unread = 0;
    state._keepAliveTimer = null;
    state._autoHeightTimer = null;
    state._autoHeightPending = null;
    state.pmQueue = [];
    state._debugMarker = null;
    state._debugMarker2 = null;
    state._imagePreviewEl = null;
    state._imagePreviewImg = null;
    state._imagePreviewKeyHandler = null;
    state.handlers.docClick = null;
    state.handlers.onMessage = null;
    state.handlers.onResize = null;
    state.handlers.onVvChange = null;
  }

  function open() {
    if (!state.initialized) return;
    setOpen(true);
  }

  function close() {
    if (!state.initialized) return;
    setOpen(false);
  }

  function toggle() {
    if (!state.initialized) return;
    setOpen(!state.open);
  }

  function setTheme(themeColor) {
    if (!state.initialized) return;
    setThemeColor(themeColor);
    postToIframe(MSG.HOST_SET_THEME, { themeColor: state.config.themeColor || null });
  }

  function onReady(cb) {
    if (typeof cb !== "function") return;
    state.listeners.ready.push(cb);
  }

  function onUnread(cb) {
    if (typeof cb !== "function") return;
    state.listeners.unread.push(cb);
  }

  var api = {
    init: init,
    destroy: destroy,
    open: open,
    close: close,
    toggle: toggle,
    setTheme: setTheme,
    onReady: onReady,
    onUnread: onUnread,
  };

  function replayQueuedCall(item) {
    if (!item) return;
    // Expected formats:
    //   ["init", { ... }]
    //   { method: "init", args: [ ... ] }
    try {
      if (Array.isArray(item) && item.length) {
        var m = String(item[0] || "");
        var fn = api[m];
        if (typeof fn === "function") fn.apply(null, item.slice(1));
        return;
      }
      if (item && typeof item === "object" && item.method) {
        var m2 = String(item.method || "");
        var fn2 = api[m2];
        var args2 = Array.isArray(item.args) ? item.args : [];
        if (typeof fn2 === "function") fn2.apply(null, args2);
      }
    } catch (e) {
      // ignore
    }
  }

  // Support loader-queue style: window.ChatLiveWidget = window.ChatLiveWidget || []
  // and later: ChatLiveWidget.push(["init", {...}]).
  var pre = null;
  try {
    pre = window.ChatLiveWidget;
  } catch (e) {
    pre = null;
  }
  window.ChatLiveWidget = api;
  api.push = function (item) {
    replayQueuedCall(item);
  };
  if (Array.isArray(pre)) {
    for (var i = 0; i < pre.length; i++) replayQueuedCall(pre[i]);
  }

  function parseNumber(v, fallback) {
    if (v === undefined || v === null || v === "") return fallback;
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function parseBool(v, fallback) {
    if (v === undefined || v === null || v === "") return fallback;
    var s = String(v).toLowerCase().trim();
    if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
    if (s === "0" || s === "false" || s === "no" || s === "off") return false;
    return fallback;
  }

  function normalizeSameSite(v) {
    if (v === undefined || v === null || v === "") return null;
    var s = String(v).trim().toLowerCase();
    if (s === "none") return "None";
    if (s === "strict") return "Strict";
    if (s === "lax") return "Lax";
    return null;
  }

  function findConfigScript() {
    try {
      var cs = document.currentScript;
      if (cs && cs.dataset && cs.dataset.chatliveSiteKey) return cs;
    } catch (e) {
      // ignore
    }

    var list = document.querySelectorAll("script[data-chatlive-site-key]");
    if (list && list.length) return list[list.length - 1];
    return null;
  }

  function autoInitFromScriptTag() {
    var el = findConfigScript();
    if (!el || !el.dataset) return;

    var siteKey = el.dataset.chatliveSiteKey || "";
    var embedUrl = el.dataset.chatliveEmbedUrl || "";
    if (!siteKey || !embedUrl) return;

    var cfg = {
      siteKey: siteKey,
      embedUrl: embedUrl,
      origin: el.dataset.chatliveOrigin || null,
      cookieDomain: el.dataset.chatliveCookieDomain || undefined,
      cookieSameSite: normalizeSameSite(el.dataset.chatliveCookieSamesite) || undefined,
      position: el.dataset.chatlivePosition || undefined,
      zIndex: parseNumber(el.dataset.chatliveZIndex, undefined),
      launcherText: el.dataset.chatliveLauncherText || undefined,
      launcherStyle: el.dataset.chatliveLauncherStyle || undefined,
      themeMode: el.dataset.chatliveThemeMode || undefined,
      colorSettingsMode: el.dataset.chatliveColorSettingsMode || undefined,
      colorOverridesJson: el.dataset.chatliveColorOverridesJson || undefined,
      width: parseNumber(el.dataset.chatliveWidth, undefined),
      height: parseNumber(el.dataset.chatliveHeight, undefined),
      autoHeight: parseBool(el.dataset.chatliveAutoHeight, undefined),
      autoHeightMode: el.dataset.chatliveAutoHeightMode || undefined,
      minHeight: parseNumber(el.dataset.chatliveMinHeight, undefined),
      maxHeightRatio: parseNumber(el.dataset.chatliveMaxHeightRatio, undefined),
      mobileBreakpoint: parseNumber(el.dataset.chatliveMobileBreakpoint, undefined),
      mobileFullscreen: parseBool(el.dataset.chatliveMobileFullscreen, undefined),
      themeColor: el.dataset.chatliveThemeColor || undefined,
      offsetX: parseNumber(el.dataset.chatliveOffsetX, undefined),
      offsetY: parseNumber(el.dataset.chatliveOffsetY, undefined),
      debug: parseBool(el.dataset.chatliveDebug, undefined),
    };

    init(cfg);
  }

  // Production-style snippet: a single <script ...data-chatlive-*> auto-inits.
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", autoInitFromScriptTag);
    } else {
      autoInitFromScriptTag();
    }
  }
})();
