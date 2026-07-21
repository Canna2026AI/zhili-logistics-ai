const RUN_ID = "zhili-ds-v1";
const PAGE_PREFIX = "Zhili / ";

const C = {
  white: "#FFFFFF",
  page: "#F8FAFC",
  graphite950: "#111827",
  graphite900: "#1F2937",
  graphite800: "#273449",
  graphite700: "#374151",
  graphite600: "#4B5563",
  graphite500: "#6B7280",
  graphite400: "#9CA3AF",
  graphite300: "#D1D5DB",
  graphite200: "#E5E7EB",
  graphite100: "#F3F4F6",
  teal900: "#134E4A",
  teal800: "#115E59",
  teal700: "#0F766E",
  teal600: "#0D9488",
  teal500: "#14B8A6",
  teal100: "#CCFBF1",
  teal50: "#F0FDFA",
  blue600: "#2563EB",
  green600: "#16A34A",
  amber600: "#D97706",
  red600: "#DC2626"
};

function rgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255
  };
}

function paint(hex, opacity = 1) {
  return [{ type: "SOLID", color: rgb(hex), opacity }];
}

let fonts;

async function loadFonts() {
  const available = await figma.listAvailableFontsAsync();
  function pick(style) {
    return (
      available.find(
        (font) => font.fontName.family === "Noto Sans SC" && font.fontName.style === style
      )?.fontName ||
      available.find(
        (font) => font.fontName.family === "Inter" && font.fontName.style === style
      )?.fontName ||
      available.find((font) => font.fontName.family === "Inter")?.fontName
    );
  }
  fonts = {
    regular: pick("Regular"),
    medium: pick("Medium"),
    semibold: pick("SemiBold") || pick("Medium"),
    bold: pick("Bold") || pick("SemiBold") || pick("Medium")
  };
  for (const font of Object.values(fonts)) await figma.loadFontAsync(font);
}

function frame(name, width, height, fill = C.white, radius = 0) {
  const node = figma.createFrame();
  node.name = name;
  node.resize(width, height);
  node.fills = paint(fill);
  node.cornerRadius = radius;
  node.clipsContent = true;
  node.setPluginData("zhili-run-id", RUN_ID);
  return node;
}

function rect(parent, name, x, y, width, height, fill, radius = 0, stroke = null) {
  const node = figma.createRectangle();
  node.name = name;
  node.x = x;
  node.y = y;
  node.resize(width, height);
  node.fills = paint(fill);
  node.cornerRadius = radius;
  if (stroke) {
    node.strokes = paint(stroke);
    node.strokeWeight = 1;
  }
  parent.appendChild(node);
  return node;
}

async function text(parent, value, x, y, width, size = 14, weight = "regular", color = C.graphite950) {
  const node = figma.createText();
  node.name = `Text/${value.slice(0, 28)}`;
  node.fontName = fonts[weight] || fonts.regular;
  node.fontSize = size;
  node.lineHeight = { unit: "PIXELS", value: Math.round(size * 1.55) };
  node.fills = paint(color);
  node.characters = value;
  node.x = x;
  node.y = y;
  node.resize(width, Math.max(24, size * 2));
  node.textAutoResize = "HEIGHT";
  parent.appendChild(node);
  return node;
}

async function label(parent, value, x, y, color = C.graphite500) {
  return text(parent, value, x, y, 260, 12, "regular", color);
}

async function button(parent, name, labelValue, x, y, width = 112, kind = "primary") {
  const fills = {
    primary: C.teal700,
    secondary: C.white,
    danger: C.red600,
    disabled: C.graphite100
  };
  const node = frame(name, width, 32, fills[kind] || fills.primary, 4);
  node.x = x;
  node.y = y;
  if (kind === "secondary") node.strokes = paint(C.graphite300);
  parent.appendChild(node);
  await text(
    node,
    labelValue,
    12,
    5,
    width - 24,
    13,
    "medium",
    kind === "secondary" || kind === "disabled" ? C.graphite700 : C.white
  );
  return node;
}

async function getPage(name) {
  let page = figma.root.children.find((item) => item.type === "PAGE" && item.name === name);
  if (!page) {
    page = figma.createPage();
    page.name = name;
  }
  await page.loadAsync();
  for (const child of [...page.children]) {
    if (child.getPluginData("zhili-run-id") === RUN_ID) child.remove();
  }
  return page;
}

async function createVariables() {
  const specs = [
    ["Primitives", "COLOR", Object.entries(C)],
    [
      "Semantic Color",
      "COLOR",
      [
        ["bg/page", C.page],
        ["bg/surface", C.white],
        ["bg/nav", C.graphite900],
        ["text/primary", C.graphite950],
        ["text/secondary", C.graphite600],
        ["text/muted", C.graphite500],
        ["border/default", C.graphite200],
        ["action/primary", C.teal700],
        ["focus/ring", C.teal500],
        ["state/success", C.green600],
        ["state/warning", C.amber600],
        ["state/error", C.red600]
      ]
    ],
    [
      "Spacing & Sizing",
      "FLOAT",
      [
        ...[2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64].map((value) => [`space/${value}`, value]),
        ["control/compact", 28],
        ["control/default", 32],
        ["control/large", 40],
        ["table/row-compact", 32],
        ["table/row-comfortable", 40],
        ["nav/expanded", 224],
        ["nav/collapsed", 56],
        ["topbar", 48],
        ["workspace-tabs", 36],
        ["drawer/default", 480],
        ["drawer/complex", 640]
      ]
    ],
    [
      "Typography",
      "FLOAT",
      [
        ["display", 30],
        ["h1", 24],
        ["h2", 20],
        ["h3", 18],
        ["body", 14],
        ["control", 13],
        ["caption", 12],
        ["data-numeric", 13]
      ]
    ]
  ];

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  for (const [collectionName, type, entries] of specs) {
    const fullName = `Zhili / ${collectionName}`;
    let collection = collections.find((item) => item.name === fullName);
    if (!collection) collection = figma.variables.createVariableCollection(fullName);
    const modeId = collection.defaultModeId;
    for (const [name, value] of entries) {
      let variable = variables.find(
        (item) => item.variableCollectionId === collection.id && item.name === name
      );
      if (!variable) variable = figma.variables.createVariable(name, collection, type);
      variable.setValueForMode(modeId, type === "COLOR" ? rgb(value) : value);
      try {
        variable.setVariableCodeSyntax("WEB", `--zhili-${name.replaceAll("/", "-")}`);
      } catch (_) {}
    }
  }
}

async function createStyles() {
  const textSpecs = [
    ["Display", 30, 40, "bold"],
    ["H1", 24, 34, "bold"],
    ["H2", 20, 30, "semibold"],
    ["H3", 18, 28, "semibold"],
    ["Body", 14, 22, "regular"],
    ["Body Strong", 14, 22, "semibold"],
    ["Control", 13, 20, "medium"],
    ["Caption", 12, 18, "regular"]
  ];
  const localText = await figma.getLocalTextStylesAsync();
  for (const [name, size, line, weight] of textSpecs) {
    let style = localText.find((item) => item.name === `Zhili / ${name}`);
    if (!style) style = figma.createTextStyle();
    style.name = `Zhili / ${name}`;
    style.fontName = fonts[weight];
    style.fontSize = size;
    style.lineHeight = { unit: "PIXELS", value: line };
  }
  const effects = [
    ["Popover", { r: 17 / 255, g: 24 / 255, b: 39 / 255, a: 0.12 }, { x: 0, y: 8 }],
    ["Drawer", { r: 17 / 255, g: 24 / 255, b: 39 / 255, a: 0.1 }, { x: -8, y: 0 }]
  ];
  const localEffects = await figma.getLocalEffectStylesAsync();
  for (const [name, color, offset] of effects) {
    let style = localEffects.find((item) => item.name === `Zhili / ${name}`);
    if (!style) style = figma.createEffectStyle();
    style.name = `Zhili / ${name}`;
    style.effects = [
      { type: "DROP_SHADOW", color, offset, radius: 24, spread: 0, visible: true, blendMode: "NORMAL" }
    ];
  }
}

async function createCover(page) {
  const cover = frame("Cover/UI0", 1440, 900, C.graphite900, 0);
  page.appendChild(cover);
  await text(cover, "智立科技物流AI系统", 72, 92, 760, 42, "bold", C.white);
  await text(cover, "UI Foundation v1 · 清晰协作青", 76, 160, 760, 24, "medium", C.teal100);
  await text(
    cover,
    "五端设计系统 · 100 项功能追踪 · 10 条端到端流程 · Contract-first",
    76,
    220,
    920,
    16,
    "regular",
    C.graphite200
  );
  const facts = [
    ["视觉", "Graphite #1F2937 · Teal #0F766E · 真白工作区"],
    ["终端", "运营端 · 客户门户 · PDA · SaaS 平台 · 官网"],
    ["基准", "S2505120004 · 123.50 kg · CNY 5,320.00"],
    ["约束", "单一主命令 · 右侧 Drawer · 无装饰性渐变"]
  ];
  for (let index = 0; index < facts.length; index++) {
    const [title, body] = facts[index];
    const card = frame(`Cover/${title}`, 590, 112, C.graphite800, 8);
    card.x = 76 + (index % 2) * 620;
    card.y = 340 + Math.floor(index / 2) * 140;
    cover.appendChild(card);
    await text(card, title, 20, 16, 120, 14, "semibold", C.teal100);
    await text(card, body, 20, 48, 540, 15, "regular", C.white);
  }
  await label(cover, `Run ID ${RUN_ID} · 2026-07-22`, 76, 824, C.graphite300);
}

async function createFoundations(page) {
  const root = frame("Foundations", 1440, 1200, C.page, 0);
  page.appendChild(root);
  await text(root, "Foundations", 40, 32, 500, 28, "bold");
  await label(root, "颜色、间距、密度、字体与跨终端布局基线", 40, 78);
  const colors = Object.entries(C);
  for (let i = 0; i < colors.length; i++) {
    const [name, value] = colors[i];
    const x = 40 + (i % 6) * 220;
    const y = 132 + Math.floor(i / 6) * 116;
    rect(root, `Swatch/${name}`, x, y, 188, 64, value, 6, C.graphite200);
    await text(root, name, x, y + 70, 110, 12, "medium");
    await text(root, value, x + 106, y + 70, 82, 12, "regular", C.graphite500);
  }
  const y = 600;
  await text(root, "Density & layout", 40, y, 300, 20, "semibold");
  const metrics = [
    "Topbar 48 / Workspace tabs 36",
    "Sidebar 224 expanded / 56 collapsed",
    "Control 28 compact / 32 default / 40 large",
    "Table row 32 compact / 40 comfortable",
    "Drawer 480 quick / 640 complex",
    "Desktop min 1180 / baseline 1440×900 / PDA 390×844"
  ];
  for (let i = 0; i < metrics.length; i++) {
    const card = frame(`Metric/${i + 1}`, 420, 68, C.white, 6);
    card.x = 40 + (i % 3) * 450;
    card.y = y + 52 + Math.floor(i / 3) * 92;
    card.strokes = paint(C.graphite200);
    root.appendChild(card);
    await text(card, metrics[i], 16, 16, 388, 13, "medium");
  }
  await text(root, "Typography", 40, 868, 300, 20, "semibold");
  const typeSamples = [
    ["Display 30/40", 30, "bold"],
    ["H1 24/34", 24, "bold"],
    ["H2 20/30", 20, "semibold"],
    ["Body 14/22", 14, "regular"],
    ["Control 13/20", 13, "medium"],
    ["Data 123.50 kg · CNY 5,320.00", 13, "medium"]
  ];
  for (let i = 0; i < typeSamples.length; i++) {
    await text(root, typeSamples[i][0], 40 + (i % 2) * 640, 920 + Math.floor(i / 2) * 70, 580, typeSamples[i][1], typeSamples[i][2]);
  }
}

async function componentSpecimen(page, name, x, y, width, height, build) {
  const section = frame(`Specimen/${name}`, width, height, C.white, 8);
  section.x = x;
  section.y = y;
  section.strokes = paint(C.graphite200);
  page.appendChild(section);
  await text(section, name, 20, 16, width - 40, 16, "semibold");
  await build(section);
  return section;
}

async function createComponents(page) {
  const root = frame("Components", 1800, 1800, C.page, 0);
  page.appendChild(root);
  await text(root, "Components & states", 40, 28, 600, 28, "bold");
  await label(root, "每个业务页面只允许一个当前状态的实心主命令", 40, 74);

  await componentSpecimen(root, "Button", 40, 120, 820, 190, async (box) => {
    const variants = [
      ["Default", "primary"],
      ["Hover", "primary"],
      ["Focus", "primary"],
      ["Loading", "primary"],
      ["Disabled", "disabled"],
      ["Danger", "danger"]
    ];
    for (let i = 0; i < variants.length; i++) {
      const [state, kind] = variants[i];
      const component = figma.createComponent();
      component.name = `Button/Primary/${state}`;
      component.resize(112, 32);
      component.x = 20 + (i % 3) * 250;
      component.y = 58 + Math.floor(i / 3) * 62;
      component.fills = paint(kind === "primary" ? C.teal700 : kind === "danger" ? C.red600 : C.graphite100);
      component.cornerRadius = 4;
      box.appendChild(component);
      await text(component, state === "Loading" ? "处理中…" : state === "Danger" ? "确认删除" : "提交预报", 12, 5, 88, 13, "medium", kind === "disabled" ? C.graphite500 : C.white);
      await label(box, state, component.x + 126, component.y + 4);
    }
  });

  await componentSpecimen(root, "Inputs", 900, 120, 820, 190, async (box) => {
    const states = ["Default", "Focus", "Error", "Masked"];
    for (let i = 0; i < states.length; i++) {
      const component = figma.createComponent();
      component.name = `Input/${states[i]}`;
      component.resize(340, 56);
      component.x = 20 + (i % 2) * 390;
      component.y = 54 + Math.floor(i / 2) * 68;
      component.fills = paint(C.white);
      component.strokes = paint(states[i] === "Error" ? C.red600 : states[i] === "Focus" ? C.teal500 : C.graphite300);
      component.cornerRadius = 4;
      box.appendChild(component);
      await label(component, "运单号", 12, 5);
      await text(component, states[i] === "Masked" ? "S2505••••04" : "S2505120004", 12, 24, 300, 13, "regular");
    }
  });

  const componentNames = [
    "StatusTag", "Tabs", "DataTable", "FilterBar", "Dialog", "Drawer", "Toast", "ScanFeedback", "QuoteBreakdown", "AIActionPanel", "StateCounter", "MoneyAllocation"
  ];
  for (let i = 0; i < componentNames.length; i++) {
    const x = 40 + (i % 3) * 560;
    const y = 350 + Math.floor(i / 3) * 310;
    await componentSpecimen(root, componentNames[i], x, y, 520, 270, async (box) => {
      const component = figma.createComponent();
      component.name = `${componentNames[i]}/Default`;
      component.resize(480, 178);
      component.x = 20;
      component.y = 58;
      component.fills = paint(C.white);
      component.strokes = paint(C.graphite200);
      component.cornerRadius = componentNames[i] === "Drawer" ? 6 : 4;
      box.appendChild(component);
      await text(component, componentNames[i], 16, 14, 320, 14, "semibold");
      await label(component, "Default · Loading · Empty · Failed · Forbidden · Stale · Partial", 16, 44);
      rect(component, "State/Active", 16, 82, 130, 30, C.teal50, 4, C.teal500);
      await text(component, componentNames[i] === "ScanFeedback" ? "本地保存成功" : "S2505120004", 26, 86, 260, 12, "medium", C.teal700);
      await label(component, "requestId · version 7 · asOf 2026-07-22", 16, 128);
    });
  }
}

async function addDesktopShell(screen, title, activeDomain, options = {}) {
  rect(screen, "AppShell/Sidebar", 0, 0, 224, 900, C.graphite900);
  rect(screen, "AppShell/Topbar", 224, 0, 1216, 48, C.white, 0, C.graphite200);
  rect(screen, "AppShell/WorkspaceTabs", 224, 48, 1216, 36, C.white, 0, C.graphite200);
  await text(screen, "智立科技物流AI系统", 20, 14, 188, 16, "semibold", C.white);
  const nav = ["运营工作台", "主数据", "渠道报价", "订单运单", "仓库", "订舱/提单", "尾程", "轨迹客服", "财务", "报表", "自动化集成", "系统"];
  for (let i = 0; i < nav.length; i++) {
    if (nav[i] === activeDomain) rect(screen, `Nav/${nav[i]}/Selected`, 10, 62 + i * 54, 204, 38, C.teal700, 4);
    await text(screen, nav[i], 28, 69 + i * 54, 176, 13, "medium", C.white);
  }
  await text(screen, "智立科技（深圳）有限公司⌄", 246, 13, 300, 13, "medium");
  rect(screen, "GlobalSearch", 826, 8, 360, 32, C.white, 4, C.graphite300);
  await label(screen, "搜索运单 / 主运单号 / 客户 / 目的地", 844, 15);
  await text(screen, "帮助  通知  张伟", 1210, 13, 190, 13, "medium");
  await text(screen, "工作台", 246, 56, 100, 13, "regular");
  await text(screen, title, 350, 56, 360, 13, "medium", C.teal700);
  if (options.banner) {
    rect(screen, "Banner/Impersonation", 224, 84, 1216, 42, C.amber600, 0);
    await text(screen, options.banner, 246, 93, 950, 13, "semibold", C.white);
  }
}

async function addCounters(screen, y) {
  const values = [["全部", "1,248"], ["待收货", "156"], ["待分货", "86"], ["运输中", "238"], ["已签收", "1,123"]];
  for (let i = 0; i < values.length; i++) {
    const x = 244 + i * 188;
    rect(screen, `Counter/${values[i][0]}`, x, y, 172, 70, C.white, 6, C.graphite200);
    await label(screen, values[i][0], x + 14, y + 10);
    await text(screen, values[i][1], x + 14, y + 32, 130, 22, "semibold");
  }
}

async function addTable(screen, y, rows, drawer = true) {
  const width = drawer ? 720 : 1120;
  rect(screen, "DataTable", 244, y, width, 540, C.white, 6, C.graphite200);
  const headers = ["运单号", "状态", "运输方式", "目的地", "重量(kg)", "更新时间"];
  for (let i = 0; i < headers.length; i++) await text(screen, headers[i], 264 + i * 112, y + 18, 104, 12, "medium", C.graphite600);
  for (let r = 0; r < rows.length; r++) {
    if (r % 2 === 1) rect(screen, `Row/${r}/Hover`, 252, y + 54 + r * 48, width - 16, 44, C.page, 0);
    const cols = rows[r];
    for (let i = 0; i < cols.length; i++) await text(screen, cols[i], 264 + i * 112, y + 67 + r * 48, 104, 12, i === 0 ? "medium" : "regular", i === 0 ? C.teal700 : C.graphite700);
  }
  if (drawer) {
    rect(screen, "Drawer/Detail", 984, y, 432, 540, C.white, 6, C.graphite200);
    await text(screen, "运单详情", 1008, y + 18, 250, 18, "semibold");
    await text(screen, "S2505120004", 1008, y + 60, 220, 20, "semibold", C.graphite950);
    await label(screen, "已收货，待分货 · version 7", 1008, y + 94, C.teal700);
    const detail = ["客户  深圳鑫源贸易有限公司", "路线  CN-SZX → US-LAX", "预报重量  122.00 kg", "实收重量  123.50 kg", "计费重量  123.50 kg", "体积  0.48 m³", "账单  CNY 5,320.00"];
    for (let i = 0; i < detail.length; i++) await text(screen, detail[i], 1008, y + 138 + i * 38, 360, 13, "regular");
    await button(screen, "Action/Primary", "查看轨迹", 1008, y + 474, 116, "primary");
    await button(screen, "Action/Secondary", "更多操作", 1138, y + 474, 116, "secondary");
  }
}

async function createOpsScreen(name, title, activeDomain, mode) {
  const screen = frame(name, 1440, 900, C.page, 0);
  await addDesktopShell(screen, title, activeDomain);
  await addCounters(screen, 104);
  if (mode === "quote") {
    rect(screen, "Order/Form", 244, 198, 700, 646, C.white, 6, C.graphite200);
    await text(screen, "新建运单与报价说明", 268, 216, 520, 20, "semibold");
    const fields = ["客户  深圳鑫源贸易有限公司", "始发地  CN-SZX", "目的地  US-LAX", "运输方式  海运整箱", "毛重  122.00 kg", "尺寸  100 × 80 × 60 cm", "体积重  80.00 kg"];
    for (let i = 0; i < fields.length; i++) {
      rect(screen, `Field/${i}`, 268, 264 + i * 62, 640, 42, C.white, 4, C.graphite300);
      await text(screen, fields[i], 282, 274 + i * 62, 600, 13, "regular");
    }
    rect(screen, "Quote/Breakdown", 964, 198, 452, 646, C.white, 6, C.graphite200);
    await text(screen, "报价与限制", 988, 216, 300, 20, "semibold");
    const quote = ["COSCO 海运整箱（海运）", "基本运费  CNY 4,680.00", "燃油附加费  CNY 514.80", "偏远附加费  CNY 80.00", "操作费  CNY 45.20", "预计总价  CNY 5,320.00"];
    for (let i = 0; i < quote.length; i++) await text(screen, quote[i], 988, 272 + i * 52, 390, i === 5 ? 18 : 13, i === 5 ? "semibold" : "regular", i === 5 ? C.teal700 : C.graphite700);
    await button(screen, "Action/Cancel", "取消", 430, 812, 92, "secondary");
    await button(screen, "Action/Save", "保存草稿", 536, 812, 112, "secondary");
    await button(screen, "Action/Primary", "提交预报", 662, 812, 124, "primary");
    await button(screen, "Action/More", "更多操作", 800, 812, 112, "secondary");
  } else if (mode === "warehouse") {
    rect(screen, "Receive/Workbench", 244, 198, 700, 646, C.white, 6, C.graphite200);
    await text(screen, "收货扫描", 268, 216, 300, 20, "semibold");
    rect(screen, "BarcodeInput", 268, 260, 640, 54, C.white, 4, C.teal700);
    await text(screen, "请扫描运单条码 / 输入运单号后回车", 284, 274, 580, 14, "regular", C.graphite500);
    await text(screen, "S2505120004", 268, 342, 300, 24, "semibold", C.teal700);
    const measures = ["预报 122.00 kg", "实收 123.50 kg", "差异 +1.50 kg / +1.23%", "尺寸 100×80×60 cm", "材积 80.00 kg", "计费 123.50 kg"];
    for (let i = 0; i < measures.length; i++) {
      rect(screen, `Measure/${i}`, 268 + (i % 3) * 208, 398 + Math.floor(i / 3) * 76, 192, 58, C.page, 4, C.graphite200);
      await text(screen, measures[i], 280 + (i % 3) * 208, 414 + Math.floor(i / 3) * 76, 170, 13, "medium", i === 2 ? C.amber600 : C.graphite700);
    }
    await text(screen, "包裹照片 3/3 · 称重设备已连接 · 库位 A-01-15", 268, 568, 620, 13, "regular");
    await button(screen, "Action/Primary", "确认收货", 652, 792, 124, "primary");
    await button(screen, "Action/Exception", "登记异常", 790, 792, 124, "secondary");
    rect(screen, "Routing", 964, 198, 452, 646, C.white, 6, C.graphite200);
    await text(screen, "分货与渠道", 988, 216, 300, 20, "semibold");
    await text(screen, "计价基于计费重量 123.50 kg", 988, 258, 350, 13, "medium", C.teal700);
    await text(screen, "限制校验  禁运品 ✓  目的港 ✓  HS 编码 ✓", 988, 314, 390, 13, "regular");
    await text(screen, "COSCO SHIPPING AQUARIUS 08SW", 988, 372, 390, 14, "semibold");
    await text(screen, "USD 320.00 · 预计 2025-05-28 到港", 988, 406, 390, 13, "regular");
    await text(screen, "实际体积重 80.00 kg（480,000 cm³ ÷ 6000）", 988, 480, 390, 13, "regular");
  } else if (mode === "finance") {
    const rows = [
      ["运费", "CNY 4,680.00", "已审核", "S2505120004", "张伟", "2025-05-12"],
      ["燃油附加", "CNY 514.80", "已审核", "S2505120004", "系统", "2025-05-12"],
      ["偏远附加", "CNY 80.00", "已审核", "S2505120004", "系统", "2025-05-12"],
      ["操作费", "CNY 45.20", "已审核", "S2505120004", "张伟", "2025-05-12"]
    ];
    await addTable(screen, 198, rows, true);
  } else {
    const rows = [
      ["S2505120001", "转运中", "海运整箱", "美国/洛杉矶", "12,340.50", "10:21"],
      ["S2505120002", "待收货", "空运", "德国/法兰克福", "320.00", "09:48"],
      ["S2505120003", "待分货", "海运拼箱", "英国/伦敦", "1,250.30", "09:30"],
      ["S2505120004", "已收货", "海运整箱", "美国/洛杉矶", "123.50", "08:16"],
      ["S2505120005", "待转运", "铁路", "俄罗斯/莫斯科", "6,500.00", "07:55"]
    ];
    await addTable(screen, 198, rows, true);
  }
  return screen;
}

async function createCustomerScreen() {
  const screen = frame("Screen/CUS-HOME/Default", 1440, 900, C.page, 0);
  rect(screen, "Customer/Sidebar", 0, 0, 224, 900, C.graphite900);
  rect(screen, "Customer/Topbar", 224, 0, 1216, 48, C.white, 0, C.graphite200);
  await text(screen, "智立科技物流AI系统", 20, 14, 188, 16, "semibold", C.white);
  const nav = ["工作台", "新建运单", "批量导入", "查价", "我的运单", "轨迹查询", "账单与付款", "问题工单", "地址簿", "API"];
  for (let i = 0; i < nav.length; i++) {
    if (i === 0) rect(screen, "Nav/Selected", 10, 62, 204, 38, C.teal700, 4);
    await text(screen, nav[i], 30, 68 + i * 58, 170, 14, "medium", C.white);
  }
  await text(screen, "深圳鑫源贸易有限公司 · 张伟", 1110, 14, 290, 13, "medium");
  await text(screen, "下午好，张伟 👋", 244, 76, 500, 24, "bold");
  const stats = [["待预报", "128"], ["待收货", "86"], ["运输中", "238"], ["问题件", "17"], ["已签收", "1,123"]];
  for (let i = 0; i < stats.length; i++) {
    rect(screen, `CustomerStat/${i}`, 244 + i * 178, 132, 164, 96, C.white, 6, C.graphite200);
    await label(screen, stats[i][0], 260 + i * 178, 148);
    await text(screen, stats[i][1], 260 + i * 178, 176, 120, 24, "semibold");
  }
  const rows = [["S2505120004", "已收货，待分货", "海运整箱", "美国/洛杉矶", "123.50", "08:16"]];
  await addTable(screen, 252, rows, false);
  rect(screen, "Finance/Summary", 1110, 132, 306, 360, C.white, 6, C.graphite200);
  await text(screen, "预存款与未分配收款", 1130, 152, 250, 16, "semibold");
  await text(screen, "CNY 128,560.00", 1130, 194, 250, 24, "semibold");
  await text(screen, "对账单 ST202605-0008", 1130, 260, 250, 14, "semibold");
  await text(screen, "总额 CNY 5,320.00", 1130, 300, 250, 13, "regular");
  await text(screen, "已分配 CNY 3,000.00", 1130, 336, 250, 13, "regular");
  await text(screen, "待支付 CNY 2,320.00", 1130, 372, 250, 13, "semibold", C.red600);
  return screen;
}

async function createPdaScreen() {
  const canvas = frame("Screen/PDA-RECEIVE/OFFLINE-CONFLICT", 860, 900, C.page, 0);
  const left = frame("PDA/Receive/Offline", 390, 844, C.white, 16);
  left.x = 20;
  left.y = 20;
  canvas.appendChild(left);
  rect(left, "PDA/Header", 0, 0, 390, 72, C.graphite900);
  await text(left, "智立科技物流AI系统", 92, 18, 230, 16, "semibold", C.white);
  await text(left, "扫码收货", 136, 86, 180, 20, "semibold");
  rect(left, "PDA/Scan", 16, 126, 358, 82, C.white, 8, C.teal700);
  await text(left, "点击扫描运单号 / 条码", 76, 152, 250, 14, "medium");
  await text(left, "S2505120004", 18, 228, 220, 18, "semibold", C.teal700);
  const data = ["预报重量 122.00 kg", "实收重量 123.50 kg", "体积 0.48 m³", "尺寸 100×80×60 cm", "本地保存成功 · 待同步 183/200", "媒体上传 2/3"];
  for (let i = 0; i < data.length; i++) await text(left, data[i], 18, 272 + i * 58, 350, 14, i === 4 ? "semibold" : "regular", i === 4 ? C.green600 : C.graphite700);
  await button(left, "PDA/Primary", "确认收货", 18, 678, 172, "primary");
  await button(left, "PDA/Exception", "登记异常", 202, 678, 172, "secondary");
  rect(left, "PDA/BottomNav", 0, 760, 390, 84, C.white, 0, C.graphite200);
  await text(left, "任务        扫描        离线 183        我的", 30, 786, 340, 13, "medium");

  const right = frame("PDA/Queue/Conflict", 390, 844, C.white, 16);
  right.x = 450;
  right.y = 20;
  canvas.appendChild(right);
  rect(right, "PDA/Header", 0, 0, 390, 72, C.graphite900);
  await text(right, "离线队列 · version 7", 96, 18, 240, 16, "semibold", C.white);
  rect(right, "Warning/Queue", 16, 88, 358, 58, "#FFF7ED", 6, C.amber600);
  await text(right, "待同步队列接近上限（183/200）", 28, 102, 320, 13, "semibold", C.amber600);
  rect(right, "Warning/Session", 16, 156, 358, 58, "#EFF6FF", 6, C.blue600);
  await text(right, "登录已过期 · 本地数据安全", 28, 170, 300, 13, "semibold", C.blue600);
  const queue = ["#1842  S2505120004  待同步", "#1841  S2505120002  冲突", "#1840  S2505120001  待同步", "#1839  S2505120000  失败"];
  for (let i = 0; i < queue.length; i++) {
    rect(right, `Queue/${i}`, 16, 232 + i * 68, 358, 56, C.white, 6, C.graphite200);
    await text(right, queue[i], 28, 247 + i * 68, 330, 13, "medium", i === 1 ? C.amber600 : C.graphite700);
  }
  rect(right, "Conflict/Drawer", 0, 512, 390, 248, C.white, 8, C.graphite300);
  await text(right, "数据冲突详情 · #1841", 20, 530, 330, 16, "semibold");
  await text(right, "本地：123.50 kg / 0.48 m³\n服务器：122.00 kg / 0.48 m³\n设备 PDA-SZX-03", 20, 570, 340, 13, "regular");
  await button(right, "Conflict/KeepServer", "保留服务器", 18, 674, 108, "secondary");
  await button(right, "Conflict/Reapply", "重新应用", 138, 674, 108, "primary");
  await button(right, "Conflict/Manual", "提交人工", 258, 674, 108, "secondary");
  return canvas;
}

async function createPlatformScreen() {
  const screen = frame("Screen/PLT-TENANTS/IMPERSONATION", 1440, 900, C.page, 0);
  await addDesktopShell(screen, "租户控制台", "系统", { banner: "正在代入：深圳鑫源贸易有限公司 · 原因：售后排查 · 剩余 24:36 · 立即退出" });
  await text(screen, "租户与模块授权", 244, 154, 500, 24, "bold");
  await button(screen, "Tenant/Create", "创建租户", 1266, 148, 124, "primary");
  const rows = [
    ["深圳鑫源贸易有限公司", "运行中", "订单/仓库/尾程/结算", "78%", "健康", "2026-07-22"],
    ["华东跨境供应链", "运行中", "订单/仓库/支付", "42%", "健康", "2026-07-22"],
    ["北美尾程伙伴", "已停用", "尾程/POD", "0%", "暂停", "2026-07-21"]
  ];
  await addTable(screen, 206, rows, true);
  return screen;
}

async function createWebsiteScreen() {
  const screen = frame("Screen/WEB-HOME/Desktop", 1440, 900, C.white, 0);
  rect(screen, "Website/Nav", 0, 0, 1440, 64, C.white, 0, C.graphite200);
  await text(screen, "智立科技物流AI系统", 36, 18, 320, 18, "bold");
  await text(screen, "产品能力     解决方案     安全与部署     开源", 500, 20, 520, 14, "medium");
  await button(screen, "Website/Login", "登录", 1280, 16, 112, "primary");
  rect(screen, "Website/Hero", 0, 64, 1440, 396, C.graphite900);
  await text(screen, "让跨境物流业务、\n仓储与财务在一套系统中闭环", 42, 120, 560, 38, "bold", C.white);
  await text(screen, "订单、仓储、运输、轨迹、应收应付与对账自动衔接，\nAI 提升效率，数据驱动决策。", 42, 250, 560, 16, "regular", C.graphite200);
  await button(screen, "Website/Primary", "进入系统", 42, 332, 126, "primary");
  await button(screen, "Website/Secondary", "查看功能", 184, 332, 126, "secondary");
  const preview = frame("Website/ProductPreview", 720, 320, C.white, 8);
  preview.x = 660;
  preview.y = 96;
  preview.strokes = paint(C.graphite300);
  screen.appendChild(preview);
  rect(preview, "Preview/Sidebar", 0, 0, 120, 320, C.graphite900);
  await text(preview, "运单管理", 22, 46, 90, 13, "medium", C.white);
  await text(preview, "S2505120004", 144, 48, 220, 16, "semibold", C.teal700);
  await text(preview, "123.50 kg · 0.48 m³ · CNY 5,320.00", 144, 82, 460, 13, "regular");
  rect(preview, "Preview/Table", 144, 126, 532, 150, C.page, 4, C.graphite200);
  const capabilities = ["下单", "报价", "仓库", "运输", "尾程与签收（POD）", "结算（对账与收款）"];
  for (let i = 0; i < capabilities.length; i++) {
    rect(screen, `Capability/${i}`, 28 + i * 232, 488, 216, 126, C.white, 6, C.graphite200);
    await text(screen, capabilities[i], 46 + i * 232, 512, 180, 16, "semibold");
    await label(screen, "真实流程 · 权限 · 审计", 46 + i * 232, 552);
  }
  rect(screen, "Website/Security", 28, 640, 1384, 112, C.page, 6, C.graphite200);
  await text(screen, "安全可靠，自主可控", 52, 664, 360, 20, "semibold");
  await text(screen, "私有化部署 · 权限与审计 · 数据加密 · 备份恢复", 52, 706, 720, 14, "regular");
  rect(screen, "Website/CTA", 0, 776, 1440, 72, C.teal700);
  await text(screen, "从现在开始，打造更高效的跨境物流运营体系", 42, 796, 760, 20, "semibold", C.white);
  rect(screen, "Website/Footer", 0, 848, 1440, 52, C.graphite900);
  await text(screen, "AGPL-3.0      © 2026 智立科技。保留所有权利。", 1008, 863, 390, 12, "regular", C.graphite200);
  return screen;
}

const flowDefs = [
  ["F01", "客户下单到仓库收货", "createOrderDraft → validateOrder → createQuote → submitWaybill → receiveScan → confirmReceipt"],
  ["F02", "多渠道查价与保存版本", "createQuote → getQuoteExplanation → acceptQuote"],
  ["F03", "收货差异到恢复分货", "confirmReceipt → createIssue → requestIssueMaterial → resolveIssue → routeWaybill"],
  ["F04", "订舱/提单/装柜到出仓", "createBooking → attachWaybills → createBillOfLading → sealLoadUnit → dispatchLoadUnit"],
  ["F05", "轨迹停滞到问题件关闭", "ingestTrackingEvent → detectTrackingStall → createIssue → notifyCustomer → resolveIssue"],
  ["F06", "应收到收款核销", "generateCharges → reviewCharge → createStatement → ingestWechatPaymentCallback → allocateReceipt"],
  ["F07", "应付导入到利润回查", "createPayableImport → validatePayableImport → commitPayableImport → createDisbursement"],
  ["F08", "权限配置与用户视角验证", "updateRolePolicy → previewEffectivePermissions → startPermissionSimulation → verifyAsSubject"],
  ["F09", "PDA 离线扫描与冲突处理", "clientAction:enqueueOfflineScan → syncDeviceEvents → resolveDeviceConflict"],
  ["F10", "AI Excel 映射到关键写入审批", "createImportJob → proposeAiMapping → applyLowRiskMappings → approveAiAction → commitImport"]
];

async function createFlowIndex(page) {
  const root = frame("Flow Index", 1900, 2800, C.page, 0);
  page.appendChild(root);
  await text(root, "Flow Index · 可点击原型", 40, 28, 780, 28, "bold");
  await label(root, "每行：Normal → Failed → Stale/Concurrency → Forbidden → Offline/Danger", 40, 76);
  const states = ["NORMAL", "FAILED", "STALE", "FORBIDDEN", "OFFLINE-DANGER"];
  for (let f = 0; f < flowDefs.length; f++) {
    const [id, title, operations] = flowDefs[f];
    const y = 120 + f * 260;
    await text(root, `${id} · ${title}`, 40, y, 520, 18, "semibold");
    await label(root, operations, 40, y + 34);
    const frames = [];
    for (let s = 0; s < states.length; s++) {
      const stateFrame = frame(`Flow/${id}/${id}-${states[s]}`, 330, 164, C.white, 6);
      stateFrame.x = 40 + s * 360;
      stateFrame.y = y + 70;
      stateFrame.strokes = paint(s === 0 ? C.teal500 : s === 1 ? C.red600 : s === 3 ? C.amber600 : C.graphite300);
      root.appendChild(stateFrame);
      await text(stateFrame, `${id}-${states[s]}`, 16, 14, 298, 14, "semibold", s === 0 ? C.teal700 : C.graphite700);
      await text(stateFrame, s === 0 ? "主命令可执行；来源、版本、权限可见" : s === 1 ? "错误码 + requestId + 原因 + 补救" : s === 2 ? "本地/服务器版本 diff；禁止静默覆盖" : s === 3 ? "缺少 action / data scope / field policy" : "保留输入；离线队列或危险确认", 16, 48, 298, 12, "regular");
      const hotspot = await button(stateFrame, `Prototype/${id}/${states[s]}`, s === states.length - 1 ? "返回正常" : "查看下一状态", 16, 116, 128, "secondary");
      frames.push({ stateFrame, hotspot });
    }
    for (let s = 0; s < frames.length; s++) {
      const destination = frames[(s + 1) % frames.length].stateFrame;
      await frames[s].hotspot.setReactionsAsync([
        {
          trigger: { type: "ON_CLICK" },
          actions: [
            {
              type: "NODE",
              destinationId: destination.id,
              navigation: "NAVIGATE",
              transition: { type: "DISSOLVE", duration: 0.12, easing: { type: "EASE_OUT" } },
              preserveScrollPosition: false
            }
          ]
        }
      ]);
    }
  }
}

async function main() {
  await loadFonts();
  await createVariables();
  await createStyles();

  const pages = {};
  for (const name of ["00 Cover", "01 Foundations", "02 Components", "03 Ops", "04 Customer", "05 PDA", "06 Platform", "07 Website", "08 Flow Index"]) {
    pages[name] = await getPage(`${PAGE_PREFIX}${name}`);
  }

  await createCover(pages["00 Cover"]);
  await createFoundations(pages["01 Foundations"]);
  await createComponents(pages["02 Components"]);

  const opsRoot = frame("Ops Baselines", 6400, 1100, C.page, 0);
  pages["03 Ops"].appendChild(opsRoot);
  const opsScreens = [
    await createOpsScreen("Screen/OPS-WAYBILLS/Default", "运单管理", "订单运单", "list"),
    await createOpsScreen("Screen/OPS-ORDER-QUOTE/Default", "新建运单/报价", "订单运单", "quote"),
    await createOpsScreen("Screen/OPS-RECEIVE/Default", "收货扫描", "仓库", "warehouse"),
    await createOpsScreen("Screen/OPS-CHARGES/Default", "应收费用", "财务", "finance")
  ];
  opsScreens.forEach((screen, index) => {
    screen.x = 40 + index * 1540;
    screen.y = 80;
    opsRoot.appendChild(screen);
  });
  await text(opsRoot, "运营端 1440×900 基准", 40, 24, 520, 24, "bold");

  const customerRoot = frame("Customer Baselines", 1600, 1100, C.page, 0);
  pages["04 Customer"].appendChild(customerRoot);
  const customer = await createCustomerScreen();
  customer.x = 40;
  customer.y = 80;
  customerRoot.appendChild(customer);
  await text(customerRoot, "客户门户 1440×900 基准", 40, 24, 520, 24, "bold");

  const pdaRoot = await createPdaScreen();
  pages["05 PDA"].appendChild(pdaRoot);

  const platformRoot = frame("Platform Baselines", 1600, 1100, C.page, 0);
  pages["06 Platform"].appendChild(platformRoot);
  const platform = await createPlatformScreen();
  platform.x = 40;
  platform.y = 80;
  platformRoot.appendChild(platform);
  await text(platformRoot, "SaaS 平台 1440×900 基准", 40, 24, 520, 24, "bold");

  const webRoot = frame("Website Baselines", 1600, 1100, C.page, 0);
  pages["07 Website"].appendChild(webRoot);
  const website = await createWebsiteScreen();
  website.x = 40;
  website.y = 80;
  webRoot.appendChild(website);
  await text(webRoot, "官网 1440×900 基准", 40, 24, 520, 24, "bold");

  await createFlowIndex(pages["08 Flow Index"]);
  await figma.setCurrentPageAsync(pages["00 Cover"]);
  figma.currentPage.selection = [figma.currentPage.children[0]];
  figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
  figma.notify("智立 UI Foundation 已创建：9 pages · 4 variable collections · components · 8 screens · 10 flows", { timeout: 8000 });
  figma.closePlugin("Zhili UI Foundation completed");
}

main().catch((error) => {
  console.error(error);
  figma.notify(`Zhili UI Foundation 失败：${error.message || error}`, { error: true, timeout: 12000 });
  figma.closePlugin();
});
