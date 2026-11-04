import { defineMermaidSetup } from "@slidev/types";

/**
 * Light HEBMU Mermaid defaults — 4-step purple→grey hierarchy via :::hebmu* classes.
 * No flowchart spacing/curve locks; course decks override via %%{init}%% / scale / classes.
 *
 *   hebmuRoot  — dark primary (#4e136c), white text
 *   hebmuPill  — soft purple (#8f55ad), white text
 *   hebmuNote  — very light purple (#ebe7ef), primary text
 *   hebmuMuted — chrome grey (#f2f2f2), muted text
 */
const fontFamily =
  '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", "Hiragino Sans GB", Arial, system-ui, sans-serif';

const primary = "#4e136c"; /* --hebmu-primary */
const primaryLight = "#621887"; /* --hebmu-primary-light */
const purpleSoft = "#8f55ad"; /* --hebmu-purple-soft */
const purpleWash = "#ebe7ef"; /* --hebmu-row-a */
const chromeGrey = "#f2f2f2"; /* --hebmu-header-bg */
const textMuted = "#666666"; /* --hebmu-text-muted */
const pageBg = "#ffffff"; /* --hebmu-bg */

export default defineMermaidSetup(() => ({
  startOnLoad: false,
  theme: "base",
  look: "classic",
  securityLevel: "loose",
  htmlLabels: true,
  fontFamily,
  themeVariables: {
    background: pageBg,
    primaryColor: purpleSoft,
    primaryTextColor: "#ffffff",
    primaryBorderColor: purpleSoft,
    secondaryColor: purpleWash,
    tertiaryColor: chromeGrey,
    lineColor: purpleSoft,
    textColor: primary,
    fontFamily,
    fontSize: "17px",
    nodeBorder: purpleSoft,
    nodeTextColor: "#ffffff",
    mainBkg: purpleSoft,
    clusterBkg: "#f8f5fb",
    clusterBorder: primaryLight,
    titleColor: primary,
    arrowheadColor: purpleSoft,
    edgeLabelBackground: pageBg,
  },
  flowchart: {
    htmlLabels: true,
    useMaxWidth: true,
  },
  themeCSS: `
    svg {
      overflow: visible;
    }

    .node rect,
    .node polygon {
      rx: 12px;
      ry: 12px;
    }

    .node .label,
    .nodeLabel,
    .node .label span,
    .label text {
      color: #ffffff;
      fill: #ffffff;
      font-size: 17px;
      font-weight: 600;
      line-height: 1.2;
    }

    .flowchart-link,
    .edgePath .path {
      stroke: ${purpleSoft};
      stroke-width: 2px;
      fill: none;
    }

    .marker {
      fill: ${purpleSoft};
      stroke: ${purpleSoft};
    }

    /* 1 · Root — darkest brand */
    .node.hebmuRoot rect,
    .node.hebmuRoot circle,
    .node.hebmuRoot ellipse,
    .node.hebmuRoot polygon,
    .node.hebmuRoot path {
      fill: ${primary} !important;
      stroke: ${primary} !important;
    }

    .node.hebmuRoot .label,
    .node.hebmuRoot .nodeLabel,
    .node.hebmuRoot .label span {
      color: #ffffff !important;
      fill: #ffffff !important;
      font-size: 20px;
      font-weight: 700;
    }

    /* 2 · Pill — lighter purple */
    .node.hebmuPill rect,
    .node.hebmuPill circle,
    .node.hebmuPill ellipse,
    .node.hebmuPill polygon,
    .node.hebmuPill path {
      fill: ${purpleSoft} !important;
      stroke: ${purpleSoft} !important;
    }

    .node.hebmuPill .label,
    .node.hebmuPill .nodeLabel,
    .node.hebmuPill .label span {
      color: #ffffff !important;
      fill: #ffffff !important;
      font-size: 17px;
      font-weight: 600;
    }

    /* 3 · Note — very light purple panel */
    .node.hebmuNote rect,
    .node.hebmuNote circle,
    .node.hebmuNote ellipse,
    .node.hebmuNote polygon,
    .node.hebmuNote path {
      fill: ${purpleWash} !important;
      stroke: ${primaryLight} !important;
      filter: none;
    }

    .node.hebmuNote .label,
    .node.hebmuNote .nodeLabel,
    .node.hebmuNote .label span {
      color: ${primary} !important;
      fill: ${primary} !important;
      font-size: 15px;
      font-weight: 500;
      text-align: left;
    }

    /* 4 · Muted — chrome grey (header-bg) */
    .node.hebmuMuted rect,
    .node.hebmuMuted circle,
    .node.hebmuMuted ellipse,
    .node.hebmuMuted polygon,
    .node.hebmuMuted path {
      fill: ${chromeGrey} !important;
      stroke: #d0d0d0 !important;
      filter: none;
    }

    .node.hebmuMuted .label,
    .node.hebmuMuted .nodeLabel,
    .node.hebmuMuted .label span {
      color: ${textMuted} !important;
      fill: ${textMuted} !important;
      font-size: 14px;
      font-weight: 400;
    }

    .edgeLabel,
    .edgeLabel p,
    .labelBkg {
      color: ${primary} !important;
      background-color: rgba(255, 255, 255, 0.9) !important;
    }
  `,
}));
