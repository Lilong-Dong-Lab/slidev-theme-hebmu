---
theme: ./
title: slidev-theme-hebmu 主题演示
info: |
  slidev-theme-hebmu Demo Deck
  河北医科大学 · 河北医科大学教学主题
layout: cover
coverAuthor: '河北医科大学'
coverDate: '2026'
courseName: '课程名称'
courseNameEn: 'Course Name'
sessionNumber: 1
drawings:
  persist: false
transition: slide-left
mdc: true
colorSchema: both
fonts:
  sans: 'PingFang SC'
  mono: 'Fira Code'
themeConfig:
  paginationX: 'r'
  paginationY: 'b'
  paginationPagesDisabled: [1, 17]
defaults:
  layout: default
htmlAttrs:
  lang: zh-CN
exportFilename: slidev-theme-hebmu-demo
---

# slidev-theme-hebmu
## 河北医科大学教学主题演示

主题功能与布局展示

---
layout: table-of-contents
---

# 目录 Table of Contents

---
layout: section
sectionNumber: 1
sectionTitle: 基础布局
sectionTitleEn: Basic Layouts
---

---
layout: default
---

# 默认布局 Default Layout

正文内容使用中文排版，演示 CJK 字体渲染效果。

- 第一项：蛋白质-蛋白质相互作用 (PPI)
- 第二项：基因共表达网络 (Gene Co-expression Network)
- 第三项：代谢网络 (Metabolic Network)

> 无标度网络 (Scale-free Network) 是生物分子网络的核心特征。

---
layout: default
---

# 表格示例 Table Example

| 数据库 Database | 类型 Type | 物种 Species | URL |
|---|---|---|---|
| STRING | PPI | 多物种 | https://string-db.org |
| BioGRID | PPI | 多物种 | https://thebiogrid.org |
| KEGG | 代谢通路 | 多物种 | https://kegg.jp |
| Reactome | 信号通路 | 多物种 | https://reactome.org |

---
layout: center
---

# 居中强调 Centered Layout

**网络生物学 (Network Biology)** 研究生物系统中分子之间的相互作用关系

---
layout: two-col
---

# 双栏布局 Two-Column Layout

::left::

**有向网络 (Directed)**
- 边有方向性
- A → B ≠ B → A
- 例：信号传导网络

::right::

**无向网络 (Undirected)**
- 边无方向性
- A — B = B — A
- 例：蛋白质相互作用网络

---
layout: section
sectionNumber: 2
sectionTitle: 特殊布局
sectionTitleEn: Special Layouts
---

---
layout: quote
quoteAuthor: 'Barabási & Albert'
quoteSource: 'Science, 1999'
---

> **无标度网络 (Scale-free Network)**: 网络中节点的度分布服从幂律分布 P(k) ~ k^(-γ)，少数枢纽节点 (hub) 拥有大量连接。

---
layout: figure
figureUrl: https://via.placeholder.com/800x450
figureCaption: '蛋白质相互作用网络示例 (PPI Network Example)'
---

---
layout: figure-side
figureUrl: https://via.placeholder.com/400x350
figureCaption: 'STRING 数据库界面'
figureX: r
---

## STRING 数据库

- 已知和预测的PPI
- 多种证据来源
  - 实验验证
  - 数据库注释
  - 文本挖掘
- 可信度评分系统

---
layout: default
---

# Mermaid 图示 Mermaid Diagrams

```mermaid
graph LR
    A[基因表达数据] --> B[WGCNA分析]
    B --> C[模块识别]
    C --> D[Hub基因]
    D --> E[功能富集]
    style A fill:#ede0f5,stroke:#621887
    style B fill:#ede0f5,stroke:#621887
    style C fill:#ede0f5,stroke:#621887
    style D fill:#ede0f5,stroke:#621887
    style E fill:#ede0f5,stroke:#621887
```

---
layout: default
---

# 代码示例 Code Example

**Python (Bioinformatics)**:

```python
import networkx as nx

# 构建PPI网络
G = nx.read_edgelist("ppi_network.txt")
print(f"节点数: {G.number_of_nodes()}")
print(f"边数: {G.number_of_edges()}")
print(f"平均度: {sum(dict(G.degree()).values()) / G.number_of_nodes():.2f}")
```

**R (DESeq2)**:

```r
library(DESeq2)
dds <- DESeqDataSetFromMatrix(countData, colData, design = ~ condition)
dds <- DESeq(dds)
res <- results(dds, alpha = 0.05)
```

---
layout: intro
courseTitle: '生物信息学'
sessionNumber: 18
---

## 本节内容概览

- 蛋白质相互作用网络基础
- PPI 数据库与工具
- 网络拓扑分析方法
- Cytoscape 实操演示

---
layout: default
---

# 脚注示例 Footnotes

蛋白质相互作用网络是理解细胞功能的重要工具。

<Footnotes :separator="true">
  <Footnote :number="1">Barabási AL, et al. Network biology: understanding the cell's functional organization. Nat Rev Genet. 2004.</Footnote>
  <Footnote :number="2">Szklarczyk D, et al. STRING v11: protein-protein interaction networks. Nucleic Acids Res. 2019.</Footnote>
</Footnotes>

---
layout: break
breakMinutes: 10
---

---
layout: end
endMessage: '谢谢！'
endMessageEn: 'Thank You!'
---
