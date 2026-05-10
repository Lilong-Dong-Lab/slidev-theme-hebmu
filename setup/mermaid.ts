import { defineMermaidSetup } from "@slidev/types";

const fontFamily =
  '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", "Hiragino Sans GB", Arial, system-ui, sans-serif';

export default defineMermaidSetup(() => ({
  startOnLoad: false,
  theme: "base",
  look: "classic",
  securityLevel: "loose",
  htmlLabels: true,
  fontFamily,
  themeVariables: {
    background: "#ffffff",
    primaryColor: "#4e136c",
    primaryTextColor: "#ffffff",
    primaryBorderColor: "#4e136c",
    lineColor: "#5a5a5a",
    textColor: "#4e136c",
    fontFamily,
    fontSize: "18px",
    fontWeight: "700",
    nodeBorder: "#4e136c",
    nodeTextColor: "#ffffff",
    mainBkg: "#4e136c",
    clusterBkg: "#f8f5fb",
    clusterBorder: "#621887",
    titleColor: "#4e136c",
    arrowheadColor: "#5a5a5a",
    edgeLabelBackground: "#ffffff",
    strokeWidth: "2.4",
  },
  flowchart: {
    diagramPadding: 10,
    htmlLabels: true,
    nodeSpacing: 48,
    rankSpacing: 58,
    curve: "step",
    useMaxWidth: true,
    wrappingWidth: 180,
  },
  themeCSS: `
    svg {
      overflow: visible;
    }

    .node rect,
    .node circle,
    .node ellipse,
    .node polygon,
    .node path {
      fill: #4e136c;
      stroke: #4e136c;
      stroke-width: 0;
      filter: drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.18));
    }

    .node rect {
      rx: 10px;
      ry: 10px;
    }

    .node .label,
    .nodeLabel,
    .node .label span,
    .label text {
      color: #ffffff;
      fill: #ffffff;
      font-weight: 700;
      line-height: 1.18;
    }

    .flowchart-link,
    .edgePath .path {
      stroke: #5a5a5a;
      stroke-width: 2.4px;
      fill: none;
    }

    .marker {
      fill: #5a5a5a;
      stroke: #5a5a5a;
    }

    .node.hebmuRoot rect,
    .node.hebmuRoot circle,
    .node.hebmuRoot ellipse,
    .node.hebmuRoot polygon,
    .node.hebmuRoot path {
      fill: #4e136c;
      stroke: #4e136c;
    }

    .node.hebmuRoot .label,
    .node.hebmuRoot .nodeLabel,
    .node.hebmuRoot .label span {
      font-size: 21px;
      font-weight: 700;
    }

    .node.hebmuPill rect,
    .node.hebmuPill circle,
    .node.hebmuPill ellipse,
    .node.hebmuPill polygon,
    .node.hebmuPill path {
      fill: #4e136c;
      stroke: #4e136c;
    }

    .node.hebmuNote rect,
    .node.hebmuNote circle,
    .node.hebmuNote ellipse,
    .node.hebmuNote polygon,
    .node.hebmuNote path {
      fill: transparent;
      stroke: transparent;
      filter: none;
    }

    .node.hebmuNote .label,
    .node.hebmuNote .nodeLabel,
    .node.hebmuNote .label span {
      color: #666666;
      fill: #666666;
      font-weight: 700;
      text-align: left;
    }
  `,
}));
