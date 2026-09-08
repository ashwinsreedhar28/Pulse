import { r as reactExports, j as jsxRuntimeExports, a as reactDomExports, c as client, R as React } from "./styles-BC_bYzDl.js";
function useCategories() {
  const [categories, setCategories] = reactExports.useState([]);
  const [feedCounts, setFeedCounts] = reactExports.useState({});
  const [unreadCounts, setUnreadCounts] = reactExports.useState({});
  const [recentCounts, setRecentCounts] = reactExports.useState({});
  const [bookmarkCount, setBookmarkCount] = reactExports.useState(0);
  const load = async () => {
    const since = Date.now() - 24 * 60 * 60 * 1e3;
    const [cats, fc, uc, rc, bm] = await Promise.all([
      window.api.categories.list(),
      window.api.feeds.countsByCategory(),
      window.api.articles.unreadCountsByCategory(),
      window.api.articles.recentCountsByCategory(since),
      window.api.articles.countBookmarked()
    ]);
    setCategories(cats);
    setFeedCounts(fc);
    setUnreadCounts(uc);
    setRecentCounts(rc);
    setBookmarkCount(bm);
  };
  reactExports.useEffect(() => {
    void load();
  }, []);
  return { categories, feedCounts, unreadCounts, recentCounts, bookmarkCount, refresh: load };
}
function useArticles(opts) {
  const [articles, setArticles] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const load = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      setArticles(await window.api.articles.list(opts));
    } finally {
      setLoading(false);
    }
  }, [opts.domain, opts.categoryId, opts.unreadOnly, opts.bookmarkedOnly, opts.limit]);
  reactExports.useEffect(() => {
    void load();
  }, [load]);
  reactExports.useEffect(() => {
    const unsubscribe = window.api.feeds.onPolled(() => {
      void load();
    });
    return unsubscribe;
  }, [load]);
  const patchArticle = reactExports.useCallback((id, patch) => {
    setArticles((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a));
  }, []);
  return { articles, loading, refresh: load, patchArticle };
}
const tickerReference = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    sector: "Semiconductors",
    industry: "Fabless AI / GPU",
    aliases: [
      "Nvidia",
      "GeForce",
      "CUDA"
    ]
  },
  {
    symbol: "AMD",
    name: "Advanced Micro Devices",
    sector: "Semiconductors",
    industry: "Fabless CPU / GPU",
    aliases: [
      "Ryzen",
      "EPYC",
      "Radeon",
      "Xilinx",
      "Pensando"
    ]
  },
  {
    symbol: "AVGO",
    name: "Broadcom Inc.",
    sector: "Semiconductors",
    industry: "Fabless / Networking",
    aliases: [
      "Broadcom",
      "VMware"
    ]
  },
  {
    symbol: "QCOM",
    name: "Qualcomm",
    sector: "Semiconductors",
    industry: "Fabless / Mobile",
    aliases: [
      "Snapdragon"
    ]
  },
  {
    symbol: "MRVL",
    name: "Marvell Technology",
    sector: "Semiconductors",
    industry: "Fabless / Networking"
  },
  {
    symbol: "ARM",
    name: "Arm Holdings",
    sector: "Semiconductors",
    industry: "IP / Architecture",
    aliases: [
      "ARM Cortex",
      "Arm Neoverse"
    ]
  },
  {
    symbol: "AMBA",
    name: "Ambarella",
    sector: "Semiconductors",
    industry: "Fabless / Vision SoC"
  },
  {
    symbol: "LSCC",
    name: "Lattice Semiconductor",
    sector: "Semiconductors",
    industry: "Fabless / FPGA"
  },
  {
    symbol: "ALGM",
    name: "Allegro MicroSystems",
    sector: "Semiconductors",
    industry: "Fabless / Sensors"
  },
  {
    symbol: "INTC",
    name: "Intel Corporation",
    sector: "Semiconductors",
    industry: "IDM",
    aliases: [
      "Intel",
      "Intel Foundry",
      "Mobileye"
    ]
  },
  {
    symbol: "TXN",
    name: "Texas Instruments",
    sector: "Semiconductors",
    industry: "IDM / Analog"
  },
  {
    symbol: "ADI",
    name: "Analog Devices",
    sector: "Semiconductors",
    industry: "IDM / Analog",
    aliases: [
      "Maxim Integrated"
    ]
  },
  {
    symbol: "ON",
    name: "onsemi",
    sector: "Semiconductors",
    industry: "IDM / Power",
    aliases: [
      "On Semiconductor"
    ]
  },
  {
    symbol: "MU",
    name: "Micron Technology",
    sector: "Semiconductors",
    industry: "IDM / Memory"
  },
  {
    symbol: "STM",
    name: "STMicroelectronics",
    sector: "Semiconductors",
    industry: "IDM / Europe"
  },
  {
    symbol: "NXPI",
    name: "NXP Semiconductors",
    sector: "Semiconductors",
    industry: "IDM / Automotive"
  },
  {
    symbol: "MCHP",
    name: "Microchip Technology",
    sector: "Semiconductors",
    industry: "IDM / Microcontrollers"
  },
  {
    symbol: "WOLF",
    name: "Wolfspeed",
    sector: "Semiconductors",
    industry: "IDM / Silicon Carbide"
  },
  {
    symbol: "TSM",
    name: "Taiwan Semiconductor Manufacturing",
    sector: "Semiconductors",
    industry: "Foundry",
    aliases: [
      "TSMC"
    ]
  },
  {
    symbol: "GFS",
    name: "GlobalFoundries",
    sector: "Semiconductors",
    industry: "Foundry"
  },
  {
    symbol: "UMC",
    name: "United Microelectronics",
    sector: "Semiconductors",
    industry: "Foundry"
  },
  {
    symbol: "TSEM",
    name: "Tower Semiconductor",
    sector: "Semiconductors",
    industry: "Foundry / Specialty"
  },
  {
    symbol: "ASML",
    name: "ASML Holding",
    sector: "Semiconductors",
    industry: "Equipment / Lithography"
  },
  {
    symbol: "AMAT",
    name: "Applied Materials",
    sector: "Semiconductors",
    industry: "Equipment"
  },
  {
    symbol: "LRCX",
    name: "Lam Research",
    sector: "Semiconductors",
    industry: "Equipment / Etch"
  },
  {
    symbol: "KLAC",
    name: "KLA Corporation",
    sector: "Semiconductors",
    industry: "Equipment / Metrology"
  },
  {
    symbol: "TER",
    name: "Teradyne",
    sector: "Semiconductors",
    industry: "Test Equipment"
  },
  {
    symbol: "ONTO",
    name: "Onto Innovation",
    sector: "Semiconductors",
    industry: "Equipment / Metrology"
  },
  {
    symbol: "ACMR",
    name: "ACM Research",
    sector: "Semiconductors",
    industry: "Equipment / Cleaning"
  },
  {
    symbol: "AEHR",
    name: "Aehr Test Systems",
    sector: "Semiconductors",
    industry: "Test Equipment"
  },
  {
    symbol: "UCTT",
    name: "Ultra Clean Holdings",
    sector: "Semiconductors",
    industry: "Equipment Subsystems"
  },
  {
    symbol: "ACLS",
    name: "Axcelis Technologies",
    sector: "Semiconductors",
    industry: "Equipment / Implant"
  },
  {
    symbol: "COHR",
    name: "Coherent Corp.",
    sector: "Semiconductors",
    industry: "Photonics / Lasers",
    aliases: [
      "II-VI"
    ]
  },
  {
    symbol: "FORM",
    name: "FormFactor",
    sector: "Semiconductors",
    industry: "Test / Probe Cards"
  },
  {
    symbol: "SNPS",
    name: "Synopsys",
    sector: "Semiconductors",
    industry: "EDA"
  },
  {
    symbol: "CDNS",
    name: "Cadence Design Systems",
    sector: "Semiconductors",
    industry: "EDA"
  },
  {
    symbol: "AMKR",
    name: "Amkor Technology",
    sector: "Semiconductors",
    industry: "Packaging / Test (OSAT)"
  },
  {
    symbol: "ASX",
    name: "ASE Technology Holding",
    sector: "Semiconductors",
    industry: "Packaging / Test (OSAT)"
  },
  {
    symbol: "ENTG",
    name: "Entegris",
    sector: "Semiconductors",
    industry: "Materials / Chemistry"
  },
  {
    symbol: "MKSI",
    name: "MKS Instruments",
    sector: "Semiconductors",
    industry: "Equipment Subsystems"
  },
  {
    symbol: "LIN",
    name: "Linde plc",
    sector: "Materials",
    industry: "Industrial Gases"
  },
  {
    symbol: "APD",
    name: "Air Products and Chemicals",
    sector: "Materials",
    industry: "Industrial Gases"
  },
  {
    symbol: "AIQUY",
    name: "Air Liquide",
    sector: "Materials",
    industry: "Industrial Gases"
  },
  {
    symbol: "HOCPY",
    name: "Hoya Corporation",
    sector: "Semiconductors",
    industry: "Photomask / Optics",
    aliases: [
      "Hoya"
    ]
  },
  {
    symbol: "LMT",
    name: "Lockheed Martin",
    sector: "Defense",
    industry: "Prime Contractor",
    aliases: [
      "Skunk Works"
    ]
  },
  {
    symbol: "NOC",
    name: "Northrop Grumman",
    sector: "Defense",
    industry: "Prime Contractor",
    aliases: [
      "B-21",
      "Sentinel"
    ]
  },
  {
    symbol: "RTX",
    name: "RTX Corporation",
    sector: "Defense",
    industry: "Prime Contractor / Engines",
    aliases: [
      "Raytheon",
      "Pratt & Whitney",
      "Collins Aerospace"
    ]
  },
  {
    symbol: "GD",
    name: "General Dynamics",
    sector: "Defense",
    industry: "Prime Contractor"
  },
  {
    symbol: "BA",
    name: "Boeing",
    sector: "Aerospace",
    industry: "Aerospace / Defense"
  },
  {
    symbol: "LHX",
    name: "L3Harris Technologies",
    sector: "Defense",
    industry: "C4ISR"
  },
  {
    symbol: "HII",
    name: "Huntington Ingalls Industries",
    sector: "Defense",
    industry: "Shipbuilding"
  },
  {
    symbol: "KTOS",
    name: "Kratos Defense & Security",
    sector: "Defense",
    industry: "Unmanned / Propulsion"
  },
  {
    symbol: "MRCY",
    name: "Mercury Systems",
    sector: "Defense",
    industry: "Mission Computing"
  },
  {
    symbol: "TDG",
    name: "TransDigm Group",
    sector: "Aerospace",
    industry: "Components"
  },
  {
    symbol: "MP",
    name: "MP Materials",
    sector: "Mining",
    industry: "Rare Earths"
  },
  {
    symbol: "LAC",
    name: "Lithium Americas",
    sector: "Mining",
    industry: "Lithium"
  },
  {
    symbol: "ALB",
    name: "Albemarle",
    sector: "Mining",
    industry: "Lithium"
  },
  {
    symbol: "SQM",
    name: "Sociedad Química y Minera",
    sector: "Mining",
    industry: "Lithium"
  },
  {
    symbol: "FCX",
    name: "Freeport-McMoRan",
    sector: "Mining",
    industry: "Copper"
  },
  {
    symbol: "SCCO",
    name: "Southern Copper",
    sector: "Mining",
    industry: "Copper"
  },
  {
    symbol: "RIO",
    name: "Rio Tinto",
    sector: "Mining",
    industry: "Diversified"
  },
  {
    symbol: "BHP",
    name: "BHP Group",
    sector: "Mining",
    industry: "Diversified"
  },
  {
    symbol: "VALE",
    name: "Vale S.A.",
    sector: "Mining",
    industry: "Iron Ore / Nickel"
  },
  {
    symbol: "NEM",
    name: "Newmont",
    sector: "Mining",
    industry: "Gold"
  },
  {
    symbol: "USAR",
    name: "USA Rare Earth",
    sector: "Mining",
    industry: "Rare Earths"
  },
  {
    symbol: "APH",
    name: "Amphenol",
    sector: "Electronic Components",
    industry: "Connectors / Interconnect"
  },
  {
    symbol: "CLS",
    name: "Celestica",
    sector: "Electronic Manufacturing",
    industry: "EMS / ODM (AI networking)"
  },
  {
    symbol: "CRWV",
    name: "CoreWeave",
    sector: "Cloud Infrastructure",
    industry: "GPU Cloud / AI Hyperscaler"
  },
  {
    symbol: "GLW",
    name: "Corning",
    sector: "Materials",
    industry: "Specialty Glass / Optical"
  },
  {
    symbol: "CRDO",
    name: "Credo Technology Group",
    sector: "Semiconductors",
    industry: "Fabless / Connectivity (SerDes, AEC)"
  },
  {
    symbol: "LITE",
    name: "Lumentum",
    sector: "Semiconductors",
    industry: "Photonics / Lasers"
  },
  {
    symbol: "MPWR",
    name: "Monolithic Power Systems",
    sector: "Semiconductors",
    industry: "Fabless / Power ICs"
  },
  {
    symbol: "RKLB",
    name: "Rocket Lab Corporation",
    sector: "Aerospace",
    industry: "Launch / Satellites",
    aliases: [
      "Rocket Lab"
    ]
  },
  {
    symbol: "SNDK",
    name: "Sandisk Corporation",
    sector: "Semiconductors",
    industry: "IDM / NAND Flash",
    aliases: [
      "SanDisk"
    ]
  },
  {
    symbol: "VRT",
    name: "Vertiv",
    sector: "Industrials",
    industry: "Data Center Infrastructure / Power & Cooling"
  }
];
const locationReference = [
  {
    displayName: "Taiwan",
    type: "country",
    keywords: [
      "Taiwan",
      "Taiwanese",
      "Taipei",
      "ROC",
      "Republic of China"
    ]
  },
  {
    displayName: "China",
    type: "country",
    keywords: [
      "China",
      "Chinese",
      "Beijing",
      "PRC",
      "People's Republic"
    ]
  },
  {
    displayName: "South Korea",
    type: "country",
    keywords: [
      "South Korea",
      "Korean",
      "Seoul",
      "ROK"
    ]
  },
  {
    displayName: "Japan",
    type: "country",
    keywords: [
      "Japan",
      "Japanese",
      "Tokyo"
    ]
  },
  {
    displayName: "Netherlands",
    type: "country",
    keywords: [
      "Netherlands",
      "Dutch",
      "Amsterdam",
      "The Hague",
      "Veldhoven"
    ]
  },
  {
    displayName: "Germany",
    type: "country",
    keywords: [
      "Germany",
      "German",
      "Berlin",
      "Dresden"
    ]
  },
  {
    displayName: "Israel",
    type: "country",
    keywords: [
      "Israel",
      "Israeli",
      "Tel Aviv",
      "Jerusalem"
    ]
  },
  {
    displayName: "Russia",
    type: "country",
    keywords: [
      "Russia",
      "Russian",
      "Moscow",
      "Kremlin"
    ]
  },
  {
    displayName: "Ukraine",
    type: "country",
    keywords: [
      "Ukraine",
      "Ukrainian",
      "Kyiv",
      "Zelensky"
    ]
  },
  {
    displayName: "India",
    type: "country",
    keywords: [
      "India",
      "Indian",
      "New Delhi",
      "Modi"
    ]
  },
  {
    displayName: "Iran",
    type: "country",
    keywords: [
      "Iran",
      "Iranian",
      "Tehran",
      "Persian"
    ]
  },
  {
    displayName: "North Korea",
    type: "country",
    keywords: [
      "North Korea",
      "DPRK",
      "Pyongyang",
      "Kim Jong"
    ]
  },
  {
    displayName: "United Kingdom",
    type: "country",
    keywords: [
      "United Kingdom",
      "UK",
      "Britain",
      "British",
      "London"
    ]
  },
  {
    displayName: "Saudi Arabia",
    type: "country",
    keywords: [
      "Saudi Arabia",
      "Saudi",
      "Riyadh"
    ]
  },
  {
    displayName: "Australia",
    type: "country",
    keywords: [
      "Australia",
      "Australian",
      "Canberra",
      "Sydney"
    ]
  },
  {
    displayName: "Singapore",
    type: "country",
    keywords: [
      "Singapore",
      "Singaporean"
    ]
  },
  {
    displayName: "Malaysia",
    type: "country",
    keywords: [
      "Malaysia",
      "Malaysian",
      "Penang",
      "Kuala Lumpur"
    ]
  },
  {
    displayName: "Vietnam",
    type: "country",
    keywords: [
      "Vietnam",
      "Vietnamese",
      "Hanoi",
      "Ho Chi Minh"
    ]
  },
  {
    displayName: "Philippines",
    type: "country",
    keywords: [
      "Philippines",
      "Filipino",
      "Manila"
    ]
  },
  {
    displayName: "Brazil",
    type: "country",
    keywords: [
      "Brazil",
      "Brazilian",
      "Brasilia"
    ]
  },
  {
    displayName: "Mexico",
    type: "country",
    keywords: [
      "Mexico",
      "Mexican",
      "Mexico City"
    ]
  },
  {
    displayName: "Canada",
    type: "country",
    keywords: [
      "Canada",
      "Canadian",
      "Ottawa"
    ]
  },
  {
    displayName: "Poland",
    type: "country",
    keywords: [
      "Poland",
      "Polish",
      "Warsaw"
    ]
  },
  {
    displayName: "Chile",
    type: "country",
    keywords: [
      "Chile",
      "Chilean",
      "Santiago",
      "Atacama"
    ]
  },
  {
    displayName: "Congo",
    type: "country",
    keywords: [
      "Congo",
      "Congolese",
      "DRC",
      "Kinshasa"
    ]
  },
  {
    displayName: "European Union",
    type: "region",
    keywords: [
      "European Union",
      "EU",
      "Brussels",
      "European Commission",
      "Eurozone"
    ]
  },
  {
    displayName: "Middle East",
    type: "region",
    keywords: [
      "Middle East",
      "Mideast",
      "Gulf states",
      "Persian Gulf"
    ]
  },
  {
    displayName: "Southeast Asia",
    type: "region",
    keywords: [
      "Southeast Asia",
      "ASEAN",
      "SEA"
    ]
  },
  {
    displayName: "Taiwan Strait",
    type: "region",
    keywords: [
      "Taiwan Strait",
      "cross-strait",
      "Strait of Taiwan"
    ]
  },
  {
    displayName: "South China Sea",
    type: "region",
    keywords: [
      "South China Sea",
      "SCS",
      "Spratly",
      "Paracel"
    ]
  },
  {
    displayName: "Arctic",
    type: "region",
    keywords: [
      "Arctic",
      "North Pole",
      "Arctic Circle",
      "Arctic Ocean"
    ]
  },
  {
    displayName: "Sub-Saharan Africa",
    type: "region",
    keywords: [
      "Sub-Saharan Africa",
      "Sub-Saharan",
      "West Africa",
      "East Africa"
    ]
  },
  {
    displayName: "Central Asia",
    type: "region",
    keywords: [
      "Central Asia",
      "Kazakhstan",
      "Uzbekistan",
      "Turkmenistan"
    ]
  },
  {
    displayName: "Indo-Pacific",
    type: "region",
    keywords: [
      "Indo-Pacific",
      "AUKUS",
      "Quad"
    ]
  },
  {
    displayName: "California",
    type: "state",
    keywords: [
      "California",
      "Calif",
      "Sacramento",
      "Silicon Valley",
      "Bay Area",
      "San Francisco",
      "San Jose",
      "Los Angeles"
    ]
  },
  {
    displayName: "Texas",
    type: "state",
    keywords: [
      "Texas",
      "Austin",
      "Dallas",
      "Houston",
      "San Antonio"
    ]
  },
  {
    displayName: "Arizona",
    type: "state",
    keywords: [
      "Arizona",
      "Phoenix",
      "Chandler"
    ]
  },
  {
    displayName: "New York",
    type: "state",
    keywords: [
      "New York",
      "Albany",
      "NYC",
      "Wall Street",
      "Manhattan"
    ]
  },
  {
    displayName: "Indiana",
    type: "state",
    keywords: [
      "Indiana",
      "Indianapolis",
      "Hoosier",
      "Lafayette",
      "West Lafayette",
      "Purdue"
    ]
  },
  {
    displayName: "Ohio",
    type: "state",
    keywords: [
      "Ohio",
      "Columbus",
      "New Albany"
    ]
  },
  {
    displayName: "Oregon",
    type: "state",
    keywords: [
      "Oregon",
      "Hillsboro",
      "Portland"
    ]
  },
  {
    displayName: "Virginia",
    type: "state",
    keywords: [
      "Virginia",
      "Arlington",
      "Pentagon",
      "Fairfax",
      "Manassas"
    ]
  },
  {
    displayName: "Idaho",
    type: "state",
    keywords: [
      "Idaho",
      "Boise"
    ]
  },
  {
    displayName: "New Mexico",
    type: "state",
    keywords: [
      "New Mexico",
      "Albuquerque",
      "Los Alamos",
      "Sandia"
    ]
  },
  {
    displayName: "Florida",
    type: "state",
    keywords: [
      "Florida",
      "Cape Canaveral",
      "Kennedy Space Center",
      "Miami",
      "Tampa"
    ]
  },
  {
    displayName: "Washington DC",
    type: "city",
    keywords: [
      "Washington DC",
      "Washington D.C.",
      "Capitol Hill",
      "White House",
      "Congress"
    ]
  },
  {
    displayName: "Hsinchu",
    type: "city",
    keywords: [
      "Hsinchu",
      "Hsinchu Science Park"
    ]
  },
  {
    displayName: "Kaohsiung",
    type: "city",
    keywords: [
      "Kaohsiung"
    ]
  },
  {
    displayName: "Dresden",
    type: "city",
    keywords: [
      "Dresden",
      "Silicon Saxony"
    ]
  },
  {
    displayName: "Eindhoven",
    type: "city",
    keywords: [
      "Eindhoven",
      "Veldhoven",
      "Brainport"
    ]
  },
  {
    displayName: "Mountain Pass",
    type: "city",
    keywords: [
      "Mountain Pass",
      "Mountain Pass mine"
    ]
  }
];
const DAY_MS$1 = 24 * 60 * 60 * 1e3;
const SOURCE_META = {
  news_cooccurrence: {
    label: "News",
    tone: "bg-sky-500/15 text-sky-200 ring-sky-500/40"
  },
  sec_10k_concentration: {
    label: "10-K",
    tone: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40"
  }
};
function sourceChip(source) {
  const parts = source.split(",").map((s) => s.trim()).filter(Boolean);
  const chips = parts.map((p) => {
    const meta = SOURCE_META[p];
    return meta ? { label: meta.label, tone: meta.tone } : { label: p, tone: "bg-zinc-700/50 text-zinc-300 ring-zinc-600/50" };
  });
  if (parts.length > 1) {
    chips.unshift({
      label: "Consensus",
      tone: "bg-amber-500/15 text-amber-200 ring-amber-500/40"
    });
  }
  return chips;
}
function relationshipTone(rel) {
  switch (rel) {
    case "supplier":
      return "bg-indigo-500/15 text-indigo-200 ring-indigo-500/40";
    case "competitor":
      return "bg-orange-500/15 text-orange-200 ring-orange-500/40";
    case "partner":
      return "bg-sky-500/15 text-sky-200 ring-sky-500/40";
    case "customer":
      return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40";
    default:
      return "bg-zinc-700/50 text-zinc-300 ring-zinc-600/50";
  }
}
function formatDate(ms) {
  return new Date(ms).toLocaleString(void 0, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
function GraphUpdatesTab() {
  const [overrides, setOverrides] = reactExports.useState([]);
  const [nodeOverrides, setNodeOverrides] = reactExports.useState([]);
  const [candidates, setCandidates] = reactExports.useState([]);
  const [counts, setCounts] = reactExports.useState({
    accepted: 0,
    rejected: 0
  });
  const [sweeping, setSweeping] = reactExports.useState(false);
  const [lastSummary, setLastSummary] = reactExports.useState(null);
  const [tenKScanning, setTenKScanning] = reactExports.useState(false);
  const [lastTenKSummary, setLastTenKSummary] = reactExports.useState(null);
  const [regenProgress, setRegenProgress] = reactExports.useState(null);
  const [scopeCounts, setScopeCounts] = reactExports.useState(null);
  const reload = reactExports.useCallback(async () => {
    const [overrideRows, nodeRows, auditRows, weekCounts] = await Promise.all([
      window.api.graph.listOverrides(),
      window.api.graph.listNodeOverrides(),
      window.api.graph.listCandidates({ limit: 40 }),
      window.api.graph.countSince(Date.now() - 7 * DAY_MS$1)
    ]);
    setOverrides(overrideRows);
    setNodeOverrides(nodeRows);
    setCandidates(auditRows);
    setCounts(weekCounts);
  }, []);
  reactExports.useEffect(() => {
    void reload();
  }, [reload]);
  reactExports.useEffect(() => {
    return window.api.graph.onUpdated(() => {
      void reload();
    });
  }, [reload]);
  reactExports.useEffect(() => {
    void window.api.stocks.getRegenerateAllProgress().then((p) => {
      if (p.total > 0) setRegenProgress(p);
    });
    void window.api.stocks.getChainScopeCounts().then(setScopeCounts).catch(() => setScopeCounts(null));
    return window.api.stocks.onRegenerateAllProgress((p) => setRegenProgress(p));
  }, []);
  const onRunSweep = async () => {
    setSweeping(true);
    try {
      const summary = await window.api.graph.runSweep();
      setLastSummary(summary);
      await reload();
    } finally {
      setSweeping(false);
    }
  };
  const onRunTenKScan = async () => {
    setTenKScanning(true);
    try {
      const summary = await window.api.graph.runTenKScan();
      setLastTenKSummary(summary);
      await reload();
    } finally {
      setTenKScanning(false);
    }
  };
  const onRegenerateAll = async () => {
    if (regenProgress?.running) return;
    await window.api.stocks.regenerateAllChains();
  };
  const onRegenerateUniverse = async () => {
    if (regenProgress?.running) return;
    const missing = scopeCounts?.graphMissing ?? 0;
    const total = scopeCounts?.graph ?? 0;
    const hours = Math.round(total * 93 / 3600);
    const ok = window.confirm(
      `Generate value chains for the full graph universe?

${total} symbols in scope — ${missing} have no chain at all.

At the measured ~93s per chain this is roughly ${hours} hours and one Sonnet call plus a few Haiku web searches per symbol. Estimated API cost is $0.15-0.40 per chain.

Claude-only, so no Ollama chains get mixed in. Resumable: quitting is safe, and clicking again skips completed chains and retries the failures. Keep the Mac awake for the duration.`
    );
    if (!ok) return;
    await window.api.stocks.regenerateAllChains("graph");
  };
  const onUndo = async (fromSymbol, toSymbol, relationship) => {
    const candidate = candidates.find(
      (c) => c.kind === "edge" && c.status === "accepted" && c.fromSymbol === fromSymbol && c.toSymbol === toSymbol
    );
    await window.api.graph.undoOverride(
      fromSymbol,
      toSymbol,
      relationship,
      candidate?.id ?? null
    );
    await reload();
  };
  const onUndoNode = async (symbol) => {
    const candidate = candidates.find(
      (c) => c.kind === "node" && c.status === "accepted" && c.symbol === symbol
    );
    await window.api.graph.undoNodeOverride(symbol, candidate?.id ?? null);
    await reload();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400 mb-2", children: "Automated graph growth" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-400 leading-snug max-w-2xl", children: "A weekly sweep scans articles for ticker pairs that co-occur, asks the local Ollama judge whether the pair is a genuine supplier / customer / competitor / partner relationship, and auto-commits high-confidence edges onto the value-chain graph. The log below shows every decision; Undo removes an accepted edge and blocks it from being re-proposed." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-edge bg-surface-0 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 text-[11.5px] text-zinc-300 tabular-nums", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-emerald-300 font-semibold", children: counts.accepted }),
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: "accepted · last 7d" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-300 font-semibold", children: counts.rejected }),
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: "rejected · last 7d" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-200 font-semibold", children: overrides.length }),
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: "active overlays" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onRunSweep,
              disabled: sweeping,
              title: "Analyze ticker pairs that co-occur in recent articles and auto-commit high-confidence edges.",
              className: `text-[10.5px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors ${sweeping ? "bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait" : "bg-sky-500/15 text-sky-200 ring-sky-500/40 hover:bg-sky-500/25"}`,
              children: sweeping ? "Sweeping…" : "News sweep"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onRunTenKScan,
              disabled: tenKScanning,
              title: "Extract customer disclosures from every watchlist ticker's latest 10-K.",
              className: `text-[10.5px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors ${tenKScanning ? "bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait" : "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40 hover:bg-emerald-500/25"}`,
              children: tenKScanning ? "Scanning…" : "10-K scan"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onRegenerateAll,
              disabled: regenProgress?.running ?? false,
              title: "Generate a fresh value chain for every watchlist ticker plus every ticker with an existing chain. Sequential — 30-60s per ticker. Costs a few cents per ticker when Claude is configured.",
              className: `text-[10.5px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors ${regenProgress?.running ? "bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait" : "bg-violet-500/15 text-violet-200 ring-violet-500/40 hover:bg-violet-500/25"}`,
              children: regenProgress?.running ? `Generating ${regenProgress.completed + 1}/${regenProgress.total}…` : `Regenerate watchlist${scopeCounts ? ` (${scopeCounts.watchlist})` : ""}`
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onRegenerateUniverse,
              disabled: regenProgress?.running ?? false,
              title: "Generate a value chain for every sector-classified symbol, not just the watchlist. This is what fills the market graph out to its full universe. Multi-hour, resumable, one Claude call per symbol.",
              className: `text-[10.5px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors ${regenProgress?.running ? "bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait" : "bg-amber-500/15 text-amber-200 ring-amber-500/40 hover:bg-amber-500/25"}`,
              children: `Full universe${scopeCounts ? ` (${scopeCounts.graph})` : ""}`
            }
          )
        ] })
      ] }),
      scopeCounts && scopeCounts.graphMissing > 0 && !regenProgress?.running && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 text-[11px] text-amber-200/70", children: [
        scopeCounts.existing,
        " symbols have a value chain.",
        " ",
        scopeCounts.graphMissing,
        " more carry a sector assignment but no chain, so they are absent from the market graph — “Full universe” generates those."
      ] }),
      regenProgress && regenProgress.total > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-[11px] text-zinc-500", children: regenProgress.running ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        "Regenerating ",
        regenProgress.currentSymbol ?? "…",
        " ·",
        " ",
        regenProgress.completed,
        "/",
        regenProgress.total,
        " complete"
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        "Last regenerate-all — ",
        regenProgress.succeeded,
        " succeeded ·",
        " ",
        regenProgress.failed,
        " failed · ",
        regenProgress.total,
        " total"
      ] }) }),
      lastSummary && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 text-[11px] text-zinc-500", children: [
        "Last news sweep — ",
        lastSummary.proposed,
        " proposed · ",
        lastSummary.accepted,
        " ",
        "accepted · ",
        lastSummary.rejected,
        " rejected · ",
        lastSummary.skipped,
        " skipped",
        lastSummary.proposed === 0 && lastSummary.skipped === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-zinc-600 italic mt-0.5", children: "No ticker pairs co-occurred in recent articles — either the feed poller hasn't caught up yet or all co-occurring pairs were judged within the 30-day cooldown." })
      ] }),
      lastTenKSummary && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] text-zinc-500", children: [
        "Last 10-K scan — ",
        lastTenKSummary.processed,
        " processed ·",
        " ",
        lastTenKSummary.accepted,
        " accepted · ",
        lastTenKSummary.rejected,
        " rejected ·",
        " ",
        lastTenKSummary.skipped,
        " skipped",
        lastTenKSummary.processed === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-zinc-600 italic mt-0.5", children: lastTenKSummary.skipped > 0 ? "Every watchlist 10-K is already processed or has no annual filing on record yet." : "No watchlist tickers with 10-K filings ingested yet — the SEC filings scheduler needs a minute after boot." })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2", children: [
        "Active overlay edges (",
        overrides.length,
        ")"
      ] }),
      overrides.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-500", children: "No edges auto-accepted yet. The first sweep runs ~5 minutes after the app starts; weekly after that." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1.5", children: overrides.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "li",
        {
          className: "flex items-start gap-3 rounded-lg border border-edge/60 bg-surface-0 px-3 py-2",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-0.5 rounded ring-1 ring-inset ${relationshipTone(
                  o.relationship
                )}`,
                children: o.relationship
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[12px] text-zinc-200 font-semibold tabular-nums", children: [
                o.fromSymbol,
                " → ",
                o.toSymbol
              ] }),
              o.note && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-400 leading-snug mt-0.5", children: o.note }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 flex-wrap mt-1", children: [
                sourceChip(o.source).map((chip, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: `text-[9px] font-semibold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ring-1 ring-inset ${chip.tone}`,
                    children: chip.label
                  },
                  `${o.fromSymbol}-${o.toSymbol}-src-${i}`
                )),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-600 tabular-nums ml-1", children: [
                  formatDate(o.acceptedAt),
                  o.weight !== null && ` · confidence ${o.weight.toFixed(2)}`
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => onUndo(o.fromSymbol, o.toSymbol, o.relationship),
                className: "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-red-500/15 text-red-200 ring-1 ring-inset ring-red-500/40 hover:bg-red-500/25",
                title: "Remove this edge from the overlay. It won't be re-proposed.",
                children: "Undo"
              }
            )
          ]
        },
        `${o.fromSymbol}-${o.toSymbol}-${o.relationship}`
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2", children: [
        "Auto-discovered nodes (",
        nodeOverrides.length,
        ")"
      ] }),
      nodeOverrides.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-500", children: "No nodes discovered yet. When a 10-K names a customer whose ticker isn't in the base graph, it'll appear here as a new tile." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1.5", children: nodeOverrides.map((n) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "li",
        {
          className: "flex items-start gap-3 rounded-lg border border-edge/60 bg-surface-0 px-3 py-2",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[11px] font-bold tracking-[0.06em] text-zinc-100 min-w-[56px]", children: n.symbol }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[12px] text-zinc-200", children: [
                n.name ?? n.symbol,
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-500", children: [
                  " · ",
                  n.stage
                ] }),
                n.sector && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-500", children: [
                  " · ",
                  n.sector
                ] })
              ] }),
              n.blurb && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-400 leading-snug mt-0.5", children: n.blurb }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 flex-wrap mt-1", children: [
                sourceChip(n.source).map((chip, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: `text-[9px] font-semibold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ring-1 ring-inset ${chip.tone}`,
                    children: chip.label
                  },
                  `${n.symbol}-src-${i}`
                )),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600 tabular-nums ml-1", children: formatDate(n.acceptedAt) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => onUndoNode(n.symbol),
                className: "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-red-500/15 text-red-200 ring-1 ring-inset ring-red-500/40 hover:bg-red-500/25",
                title: "Remove this node from the graph. Edges pointing at it will be hidden.",
                children: "Undo"
              }
            )
          ]
        },
        n.symbol
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2", children: "Recent audit log" }),
      candidates.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-500", children: "No decisions logged yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1", children: candidates.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(CandidateRow, { candidate: c }, c.id)) })
    ] })
  ] });
}
function CandidateRow({ candidate }) {
  const [open, setOpen] = reactExports.useState(false);
  const payload = candidate.payload;
  const nodePayload = candidate.payload;
  const statusTone = {
    accepted: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40",
    rejected: "bg-zinc-700/50 text-zinc-400 ring-zinc-600/50",
    pending: "bg-amber-500/15 text-amber-200 ring-amber-500/40"
  };
  const isNode = candidate.kind === "node";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "rounded-lg border border-edge/40 bg-surface-0/60", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => setOpen((v) => !v),
        className: "w-full flex items-start gap-3 px-3 py-2 text-left hover:bg-surface-2/30 rounded-lg",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: `shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.16em] px-2 py-0.5 rounded ring-1 ring-inset ${statusTone[candidate.status]}`,
              children: candidate.status
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11.5px] text-zinc-200 tabular-nums", children: isNode ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-300 text-[9.5px] uppercase tracking-[0.18em] mr-1", children: "Node" }),
              candidate.symbol ?? "—",
              nodePayload?.stage && nodePayload.stage !== "unclear" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-500", children: [
                " · ",
                nodePayload.stage
              ] })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              candidate.fromSymbol ?? "—",
              " → ",
              candidate.toSymbol ?? "—",
              payload?.relationship && payload.relationship !== "unclear" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-500", children: [
                " · ",
                payload.relationship
              ] })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 flex-wrap mt-1", children: [
              sourceChip(candidate.source).map((chip, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `text-[9px] font-semibold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded ring-1 ring-inset ${chip.tone}`,
                  children: chip.label
                },
                `${candidate.id}-src-${i}`
              )),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 tabular-nums ml-1", children: [
                formatDate(candidate.createdAt),
                " · confidence",
                " ",
                candidate.confidence.toFixed(2)
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[10px] text-zinc-500", children: open ? "▾" : "▸" })
        ]
      }
    ),
    open && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-3 pb-3 pt-1 space-y-2 text-[11px] leading-snug", children: [
      isNode && nodePayload?.blurb && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.2em] text-zinc-500", children: "Proposed blurb" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-zinc-300", children: [
          nodePayload.name ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-400", children: [
            nodePayload.name,
            " · "
          ] }) : null,
          nodePayload.blurb
        ] })
      ] }),
      !isNode && payload?.note && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.2em] text-zinc-500", children: "Proposed note" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-zinc-300", children: payload.note })
      ] }),
      candidate.reviewNote && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.2em] text-zinc-500", children: "Judge rationale" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-zinc-400 italic", children: candidate.reviewNote })
      ] }),
      candidate.evidence.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-1", children: [
          "Evidence (",
          candidate.evidence.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-0.5", children: candidate.evidence.slice(0, 5).map((e, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: e.url ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "a",
          {
            href: e.url,
            target: "_blank",
            rel: "noreferrer",
            className: "text-zinc-300 hover:text-zinc-100 underline decoration-dotted underline-offset-2",
            children: e.title
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300", children: e.title }) }, i)) })
      ] })
    ] })
  ] });
}
const REFERENCE_TICKERS = tickerReference;
const REFERENCE_LOCATIONS = locationReference;
function Settings({
  onClose,
  onDataChanged,
  initialTab
}) {
  const [tab, setTab] = reactExports.useState(initialTab ?? "categories");
  const [categories, setCategories] = reactExports.useState([]);
  const [feeds, setFeeds] = reactExports.useState([]);
  const [tickers, setTickers] = reactExports.useState([]);
  const [geo, setGeo] = reactExports.useState([]);
  const reloadAll = reactExports.useCallback(async () => {
    const [cats, fs, ts, gs] = await Promise.all([
      window.api.categories.list(),
      window.api.feeds.list(),
      window.api.tickers.list(),
      window.api.geo.list()
    ]);
    setCategories(cats);
    setFeeds(fs);
    setTickers(ts);
    setGeo(gs);
    onDataChanged();
  }, [onDataChanged]);
  reactExports.useEffect(() => {
    void reloadAll();
  }, [reloadAll]);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return reactDomExports.createPortal(
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "fixed inset-0 z-[100] flex items-start justify-center bg-black/[0.88] pt-12 pb-8 px-6",
        style: { isolation: "isolate" },
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-1 border border-edge rounded-lg shadow-2xl w-full max-w-3xl max-h-[calc(100vh-80px)] flex flex-col overflow-hidden", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "h-11 shrink-0 flex items-center gap-3 px-4 border-b border-edge", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs tracking-[0.2em] uppercase text-zinc-400 font-medium", children: "Settings" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1 ml-4", children: ["categories", "feeds", "tickers", "locations", "teams", "graph", "preferences"].map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setTab(t),
                className: `px-2.5 py-1 text-[11px] uppercase tracking-wider rounded ${tab === t ? "bg-surface-3 text-zinc-100" : "text-zinc-500 hover:text-zinc-300 hover:bg-surface-2"}`,
                children: t
              },
              t
            )) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: onClose,
                className: "ml-auto text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-100",
                children: "Close"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-h-0 overflow-y-auto", children: [
            tab === "categories" && /* @__PURE__ */ jsxRuntimeExports.jsx(
              CategoriesTab,
              {
                categories,
                feedCounts: countBy(feeds, "categoryId"),
                reload: reloadAll
              }
            ),
            tab === "feeds" && /* @__PURE__ */ jsxRuntimeExports.jsx(FeedsTab, { feeds, categories, reload: reloadAll }),
            tab === "tickers" && /* @__PURE__ */ jsxRuntimeExports.jsx(TickersTab, { tickers, reload: reloadAll }),
            tab === "locations" && /* @__PURE__ */ jsxRuntimeExports.jsx(LocationsTab, { geo, reload: reloadAll }),
            tab === "teams" && /* @__PURE__ */ jsxRuntimeExports.jsx(TeamsTab, {}),
            tab === "graph" && /* @__PURE__ */ jsxRuntimeExports.jsx(GraphUpdatesTab, {}),
            tab === "preferences" && /* @__PURE__ */ jsxRuntimeExports.jsx(PreferencesTab, {})
          ] })
        ] })
      }
    ),
    document.body
  );
}
function countBy(items, key) {
  const acc = {};
  for (const f of items) {
    const k = String(f[key]);
    acc[k] = (acc[k] ?? 0) + 1;
  }
  return acc;
}
function CategoriesTab({
  categories,
  feedCounts,
  reload
}) {
  const [newName, setNewName] = reactExports.useState("");
  const [newDomain, setNewDomain] = reactExports.useState("finance");
  const [busy, setBusy] = reactExports.useState(false);
  const add = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await window.api.categories.create(name, newDomain);
      setNewName("");
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const byDomain = (d) => categories.filter((c) => c.domain === d);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2", children: "Add category" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            value: newName,
            onChange: (e) => setNewName(e.target.value),
            onKeyDown: (e) => e.key === "Enter" && add(),
            placeholder: "Category name",
            className: "flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: newDomain,
            onChange: (e) => setNewDomain(e.target.value),
            className: "px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "finance", children: "Finance" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "general", children: "News" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: add,
            disabled: busy || !newName.trim(),
            className: "px-3 py-1.5 text-[11px] uppercase tracking-wider bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40",
            children: "Add"
          }
        )
      ] })
    ] }),
    ["finance", "general"].map((domain) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: `text-[10px] uppercase tracking-[0.18em] mb-2 ${domain === "finance" ? "text-amber-400" : "text-blue-400"}`,
          children: domain === "finance" ? "Finance" : "News"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "border border-edge rounded divide-y divide-edge", children: [
        byDomain(domain).map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          CategoryRow,
          {
            category: c,
            feedCount: feedCounts[String(c.id)] ?? 0,
            reload
          },
          c.id
        )),
        byDomain(domain).length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("li", { className: "px-3 py-4 text-sm text-zinc-500 text-center", children: "No categories" })
      ] })
    ] }, domain))
  ] });
}
function CategoryRow({
  category,
  feedCount,
  reload
}) {
  const [editing, setEditing] = reactExports.useState(false);
  const [name, setName] = reactExports.useState(category.name);
  reactExports.useEffect(() => setName(category.name), [category.name]);
  const saveRename = async () => {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === category.name) {
      setName(category.name);
      return;
    }
    await window.api.categories.rename(category.id, trimmed);
    await reload();
  };
  const toggleNotif = async () => {
    await window.api.categories.setNotifications(category.id, !category.notificationsEnabled);
    await reload();
  };
  const flipDomain = async () => {
    const next = category.domain === "finance" ? "general" : "finance";
    await window.api.categories.setDomain(category.id, next);
    await reload();
  };
  const remove = async () => {
    if (feedCount > 0) {
      const ok = window.confirm(
        `Delete "${category.name}"? This will also remove ${feedCount} feed${feedCount === 1 ? "" : "s"} and their articles.`
      );
      if (!ok) return;
    }
    await window.api.categories.delete(category.id);
    await reload();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center gap-2 px-3 py-2", children: [
    editing ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        value: name,
        autoFocus: true,
        onChange: (e) => setName(e.target.value),
        onBlur: saveRename,
        onKeyDown: (e) => {
          if (e.key === "Enter") void saveRename();
          if (e.key === "Escape") {
            setName(category.name);
            setEditing(false);
          }
        },
        className: "flex-1 px-2 py-1 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent"
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => setEditing(true),
        className: "flex-1 text-left text-sm text-zinc-100 hover:text-accent truncate",
        title: "Click to rename",
        children: category.name
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 tabular-nums shrink-0", children: [
      feedCount,
      " feeds"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: toggleNotif,
        title: category.notificationsEnabled ? "Notifications on" : "Notifications off",
        className: `text-[11px] px-2 py-0.5 rounded transition-colors shrink-0 ${category.notificationsEnabled ? "text-accent bg-accent/10 hover:bg-accent/20" : "text-zinc-500 bg-surface-2 hover:text-zinc-300"}`,
        children: category.notificationsEnabled ? "🔔" : "🔕"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: flipDomain,
        className: "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded text-zinc-400 bg-surface-2 hover:text-zinc-100 shrink-0",
        title: "Move to other domain",
        children: [
          "→",
          category.domain === "finance" ? "News" : "Fin"
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: remove,
        className: "text-[11px] text-zinc-500 hover:text-red-400 px-1 shrink-0",
        title: "Delete category",
        children: "✕"
      }
    )
  ] });
}
function FeedsTab({
  feeds,
  categories,
  reload
}) {
  const [url, setUrl] = reactExports.useState("");
  const [title, setTitle] = reactExports.useState("");
  const [categoryId, setCategoryId] = reactExports.useState(
    categories[0]?.id ?? ""
  );
  const [probing, setProbing] = reactExports.useState(false);
  const [adding, setAdding] = reactExports.useState(false);
  const [probeError, setProbeError] = reactExports.useState(null);
  const [filterCategoryId, setFilterCategoryId] = reactExports.useState("all");
  reactExports.useEffect(() => {
    if (categoryId === "" && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);
  const probe = async () => {
    const u = url.trim();
    if (!u || probing) return;
    setProbing(true);
    setProbeError(null);
    try {
      const res = await window.api.feeds.probe(u);
      if (res.status === "ok" && res.title) {
        setTitle(res.title);
      } else {
        setProbeError(res.error ?? "Could not read feed");
      }
    } finally {
      setProbing(false);
    }
  };
  const add = async () => {
    const u = url.trim();
    const t = title.trim();
    if (!u || !t || categoryId === "" || adding) return;
    setAdding(true);
    try {
      await window.api.feeds.create({ title: t, url: u, categoryId: Number(categoryId) });
      setUrl("");
      setTitle("");
      setProbeError(null);
      await reload();
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };
  const visibleFeeds = filterCategoryId === "all" ? feeds : feeds.filter((f) => f.categoryId === filterCategoryId);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2", children: "Add feed" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: url,
              onChange: (e) => setUrl(e.target.value),
              onBlur: () => url.trim() && !title && void probe(),
              placeholder: "Feed URL (RSS / Atom)",
              className: "flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: probe,
              disabled: probing || !url.trim(),
              className: "px-3 py-1.5 text-[11px] uppercase tracking-wider bg-surface-2 text-zinc-300 rounded hover:bg-surface-3 disabled:opacity-40",
              children: probing ? "Probing…" : "Probe"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: title,
              onChange: (e) => setTitle(e.target.value),
              placeholder: "Feed title (auto-fills from probe)",
              className: "flex-1 px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: categoryId,
              onChange: (e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value)),
              className: "px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent",
              children: categories.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: c.id, children: [
                c.domain === "finance" ? "Fin" : "News",
                " · ",
                c.name
              ] }, c.id))
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: add,
              disabled: adding || !url.trim() || !title.trim() || categoryId === "",
              className: "px-3 py-1.5 text-[11px] uppercase tracking-wider bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40",
              children: "Add"
            }
          )
        ] }),
        probeError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-red-400", children: probeError })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: "Feeds" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: filterCategoryId,
            onChange: (e) => setFilterCategoryId(e.target.value === "all" ? "all" : Number(e.target.value)),
            className: "ml-auto px-2 py-1 text-[11px] bg-surface-2 border border-edge rounded text-zinc-300 focus:outline-none focus:border-accent",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "all", children: "All categories" }),
              categories.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: c.id, children: c.name }, c.id))
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-zinc-500 tabular-nums", children: visibleFeeds.length })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "border border-edge rounded divide-y divide-edge", children: [
        visibleFeeds.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(FeedRow, { feed: f, categories, reload }, f.id)),
        visibleFeeds.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("li", { className: "px-3 py-4 text-sm text-zinc-500 text-center", children: "No feeds" })
      ] })
    ] })
  ] });
}
function FeedRow({
  feed,
  categories,
  reload
}) {
  const [editing, setEditing] = reactExports.useState(false);
  const [title, setTitle] = reactExports.useState(feed.title);
  reactExports.useEffect(() => setTitle(feed.title), [feed.title]);
  const saveRename = async () => {
    setEditing(false);
    const t = title.trim();
    if (!t || t === feed.title) {
      setTitle(feed.title);
      return;
    }
    await window.api.feeds.rename(feed.id, t);
    await reload();
  };
  const toggleEnabled = async () => {
    await window.api.feeds.setEnabled(feed.id, !feed.isEnabled);
    await reload();
  };
  const changeCategory = async (catId) => {
    if (catId === feed.categoryId) return;
    await window.api.feeds.setCategory(feed.id, catId);
    await reload();
  };
  const remove = async () => {
    const ok = window.confirm(`Delete feed "${feed.title}" and its articles?`);
    if (!ok) return;
    await window.api.feeds.delete(feed.id);
    await reload();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: `flex items-center gap-2 px-3 py-2 ${feed.isEnabled ? "" : "opacity-50"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
      editing ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          value: title,
          autoFocus: true,
          onChange: (e) => setTitle(e.target.value),
          onBlur: saveRename,
          onKeyDown: (e) => {
            if (e.key === "Enter") void saveRename();
            if (e.key === "Escape") {
              setTitle(feed.title);
              setEditing(false);
            }
          },
          className: "w-full px-2 py-1 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent"
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setEditing(true),
          className: "block w-full text-left text-sm text-zinc-100 hover:text-accent truncate",
          title: "Click to rename",
          children: feed.title
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 truncate", children: feed.url })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "select",
      {
        value: feed.categoryId,
        onChange: (e) => void changeCategory(Number(e.target.value)),
        className: "px-2 py-1 text-[11px] bg-surface-2 border border-edge rounded text-zinc-300 focus:outline-none focus:border-accent shrink-0",
        children: categories.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: c.id, children: [
          c.domain === "finance" ? "Fin" : "News",
          " · ",
          c.name
        ] }, c.id))
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: toggleEnabled,
        title: feed.isEnabled ? "Enabled" : "Disabled",
        className: `text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${feed.isEnabled ? "text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20" : "text-zinc-500 bg-surface-2 hover:text-zinc-300"}`,
        children: feed.isEnabled ? "On" : "Off"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: remove,
        className: "text-[11px] text-zinc-500 hover:text-red-400 px-1 shrink-0",
        title: "Delete feed",
        children: "✕"
      }
    )
  ] });
}
function TickersTab({
  tickers,
  reload
}) {
  const [query, setQuery] = reactExports.useState("");
  const [symbol, setSymbol] = reactExports.useState("");
  const [name, setName] = reactExports.useState("");
  const [sector, setSector] = reactExports.useState("");
  const [industry, setIndustry] = reactExports.useState("");
  const [adding, setAdding] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const existing = reactExports.useMemo(() => new Set(tickers.map((t) => t.symbol)), [tickers]);
  const matches = reactExports.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const t of REFERENCE_TICKERS) {
      if (existing.has(t.symbol)) continue;
      const hay = `${t.symbol} ${t.name} ${(t.aliases ?? []).join(" ")} ${t.sector ?? ""} ${t.industry ?? ""}`.toLowerCase();
      if (hay.includes(q)) out.push(t);
      if (out.length >= 8) break;
    }
    return out;
  }, [query, existing]);
  const pickReference = (ref) => {
    setSymbol(ref.symbol);
    setName(ref.name);
    setSector(ref.sector ?? "");
    setIndustry(ref.industry ?? "");
    setQuery("");
    setError(null);
  };
  const clearForm = () => {
    setSymbol("");
    setName("");
    setSector("");
    setIndustry("");
    setError(null);
  };
  const add = async () => {
    const sym = symbol.trim().toUpperCase();
    const nm = name.trim();
    if (!sym || !nm || adding) return;
    if (existing.has(sym)) {
      setError(`${sym} is already in the watchlist.`);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await window.api.tickers.create({
        symbol: sym,
        companyName: nm,
        sector: sector.trim() || null,
        industry: industry.trim() || null
      });
      clearForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };
  const remove = async (t) => {
    const ok = window.confirm(`Remove ${t.symbol} (${t.companyName}) from the watchlist?`);
    if (!ok) return;
    await window.api.tickers.delete(t.id);
    await reload();
  };
  const watchlist = reactExports.useMemo(() => tickers.filter((t) => t.isActive), [tickers]);
  const grouped = reactExports.useMemo(() => {
    const by = {};
    for (const t of watchlist) {
      const key = t.sector ?? "Uncategorized";
      (by[key] ??= []).push(t);
    }
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  }, [watchlist]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2", children: "Add ticker" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: query,
              onChange: (e) => setQuery(e.target.value),
              placeholder: "Search by symbol, company, or brand (NVDA, TSMC, EUV…)",
              className: "w-full px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            }
          ),
          matches.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "absolute z-10 left-0 right-0 top-full mt-1 bg-surface-1 border border-edge rounded shadow-lg max-h-72 overflow-y-auto", children: matches.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => pickReference(m),
              className: "w-full text-left px-3 py-2 hover:bg-surface-2 flex items-baseline gap-2",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] font-semibold text-zinc-100 tabular-nums w-16 shrink-0", children: m.symbol }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-zinc-300 truncate", children: m.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-[10px] uppercase tracking-wider text-zinc-500 shrink-0", children: m.industry ?? m.sector ?? "" })
              ]
            }
          ) }, m.symbol)) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[120px_1fr] gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: symbol,
              onChange: (e) => setSymbol(e.target.value.toUpperCase()),
              placeholder: "Symbol",
              className: "px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent tabular-nums uppercase"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: name,
              onChange: (e) => setName(e.target.value),
              placeholder: "Company name",
              className: "px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: sector,
              onChange: (e) => setSector(e.target.value),
              placeholder: "Sector (optional)",
              className: "px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: industry,
              onChange: (e) => setIndustry(e.target.value),
              placeholder: "Industry (optional)",
              className: "px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: add,
              disabled: adding || !symbol.trim() || !name.trim(),
              className: "px-3 py-1.5 text-[11px] uppercase tracking-wider bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40",
              children: adding ? "Adding…" : "Add"
            }
          ),
          (symbol || name || sector || industry) && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: clearForm,
              className: "text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300",
              children: "Clear"
            }
          ),
          error && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-red-400 ml-auto", children: error })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: "Watchlist" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-[11px] text-zinc-500 tabular-nums", children: watchlist.length })
      ] }),
      watchlist.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border border-edge rounded px-3 py-6 text-sm text-zinc-500 text-center", children: "No tickers yet. Search above to add one." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: grouped.map(([sectorLabel, rows]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1 px-1", children: sectorLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "border border-edge rounded divide-y divide-edge", children: rows.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center gap-3 px-3 py-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] font-semibold text-zinc-100 tabular-nums w-16 shrink-0", children: t.symbol }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-100 truncate", children: t.companyName }),
            t.industry && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 truncate", children: t.industry })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => void remove(t),
              className: "text-[11px] text-zinc-500 hover:text-red-400 px-1 shrink-0",
              title: "Remove ticker",
              children: "✕"
            }
          )
        ] }, t.id)) })
      ] }, sectorLabel)) })
    ] })
  ] });
}
const GEO_TYPES = ["city", "state", "country", "region"];
function autoKeywords(name) {
  const base = name.trim();
  if (!base) return [];
  return [base];
}
function LocationsTab({
  geo,
  reload
}) {
  const [query, setQuery] = reactExports.useState("");
  const [displayName, setDisplayName] = reactExports.useState("");
  const [type, setType] = reactExports.useState("country");
  const [keywordsText, setKeywordsText] = reactExports.useState("");
  const [adding, setAdding] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const existing = reactExports.useMemo(
    () => new Set(geo.map((g) => g.displayName.toLowerCase())),
    [geo]
  );
  const matches = reactExports.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const loc of REFERENCE_LOCATIONS) {
      if (existing.has(loc.displayName.toLowerCase())) continue;
      const hay = `${loc.displayName} ${loc.keywords.join(" ")} ${loc.type}`.toLowerCase();
      if (hay.includes(q)) out.push(loc);
      if (out.length >= 8) break;
    }
    return out;
  }, [query, existing]);
  const pickReference = (ref) => {
    setDisplayName(ref.displayName);
    setType(ref.type);
    setKeywordsText(ref.keywords.join(", "));
    setQuery("");
    setError(null);
  };
  const clearForm = () => {
    setDisplayName("");
    setType("country");
    setKeywordsText("");
    setError(null);
  };
  const add = async () => {
    const name = displayName.trim();
    if (!name || adding) return;
    if (existing.has(name.toLowerCase())) {
      setError(`"${name}" is already in your locations.`);
      return;
    }
    const keywords = keywordsText.split(",").map((k) => k.trim()).filter(Boolean);
    const finalKeywords = keywords.length > 0 ? keywords : autoKeywords(name);
    setAdding(true);
    setError(null);
    try {
      await window.api.geo.create({
        displayName: name,
        type,
        keywords: finalKeywords
      });
      clearForm();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };
  const remove = async (g) => {
    const ok = window.confirm(`Remove "${g.displayName}" from your locations?`);
    if (!ok) return;
    await window.api.geo.delete(g.id);
    await reload();
  };
  const grouped = reactExports.useMemo(() => {
    const by = {
      city: [],
      state: [],
      country: [],
      region: []
    };
    for (const g of geo) by[g.type].push(g);
    return GEO_TYPES.filter((t) => by[t].length > 0).map((t) => [t, by[t]]);
  }, [geo]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2", children: "Add location" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: query,
              onChange: (e) => setQuery(e.target.value),
              placeholder: "Search countries, regions, states, cities (Taiwan, EU, Indiana…)",
              className: "w-full px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            }
          ),
          matches.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "absolute z-10 left-0 right-0 top-full mt-1 bg-surface-1 border border-edge rounded shadow-lg max-h-72 overflow-y-auto", children: matches.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => pickReference(m),
              className: "w-full text-left px-3 py-2 hover:bg-surface-2 flex items-baseline gap-2",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-wider text-zinc-500 w-14 shrink-0", children: m.type }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-zinc-100 truncate", children: m.displayName }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-[10px] text-zinc-500 truncate max-w-[40%]", children: m.keywords.slice(1, 4).join(", ") })
              ]
            }
          ) }, m.displayName)) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[1fr_140px] gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: displayName,
              onChange: (e) => setDisplayName(e.target.value),
              placeholder: "Display name (e.g., Taiwan)",
              className: "px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: type,
              onChange: (e) => setType(e.target.value),
              className: "px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent capitalize",
              children: GEO_TYPES.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: t, children: t }, t))
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            value: keywordsText,
            onChange: (e) => setKeywordsText(e.target.value),
            placeholder: "Matching keywords, comma-separated (Taiwan, Taiwanese, Taipei, ROC)",
            className: "w-full px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: add,
              disabled: adding || !displayName.trim(),
              className: "px-3 py-1.5 text-[11px] uppercase tracking-wider bg-accent/20 text-accent rounded hover:bg-accent/30 disabled:opacity-40",
              children: adding ? "Adding…" : "Add"
            }
          ),
          (displayName || keywordsText) && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: clearForm,
              className: "text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300",
              children: "Clear"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 ml-2", children: "Leave keywords blank to use the display name alone." }),
          error && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-red-400 ml-auto", children: error })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: "Locations" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-[11px] text-zinc-500 tabular-nums", children: geo.length })
      ] }),
      geo.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border border-edge rounded px-3 py-6 text-sm text-zinc-500 text-center", children: "No locations yet. Search above to add one." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: grouped.map(([groupType, rows]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1 px-1", children: [
          groupType,
          "s"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "border border-edge rounded divide-y divide-edge", children: rows.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsx(LocationRow, { geo: g, reload, onRemove: () => void remove(g) }, g.id)) })
      ] }, groupType)) })
    ] })
  ] });
}
function LocationRow({
  geo,
  reload,
  onRemove
}) {
  const [editing, setEditing] = reactExports.useState(false);
  const [text, setText] = reactExports.useState(geo.keywords.join(", "));
  reactExports.useEffect(() => setText(geo.keywords.join(", ")), [geo.keywords]);
  const save = async () => {
    setEditing(false);
    const next = text.split(",").map((k) => k.trim()).filter(Boolean);
    const same = next.length === geo.keywords.length && next.every((k, i) => k === geo.keywords[i]);
    if (same) return;
    const fallback = next.length > 0 ? next : [geo.displayName];
    await window.api.geo.updateKeywords(geo.id, fallback);
    await reload();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-3 px-3 py-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-100 truncate", children: geo.displayName }),
      editing ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          value: text,
          autoFocus: true,
          onChange: (e) => setText(e.target.value),
          onBlur: save,
          onKeyDown: (e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") {
              setText(geo.keywords.join(", "));
              setEditing(false);
            }
          },
          className: "mt-1 w-full px-2 py-1 text-[11px] bg-surface-2 border border-edge rounded text-zinc-100 focus:outline-none focus:border-accent"
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setEditing(true),
          className: "block w-full text-left text-[11px] text-zinc-500 hover:text-accent truncate",
          title: "Click to edit keywords",
          children: geo.keywords.join(", ") || "(no keywords)"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onRemove,
        className: "text-[11px] text-zinc-500 hover:text-red-400 px-1 shrink-0 mt-0.5",
        title: "Remove location",
        children: "✕"
      }
    )
  ] });
}
const CORE_PREF_KEYS = [
  "pollIntervalMin",
  "digestIntervalMin",
  "quietHoursEnabled",
  "quietHoursStart",
  "quietHoursEnd",
  "density",
  "theme",
  "favoriteTeamAlertsEnabled",
  "launchAtLogin",
  "notificationDailyCap",
  "notifyArticlesEnabled",
  "notifyStocksEnabled",
  "notifySportsEnabled",
  "notifyFilingsEnabled",
  "notifyMacroEnabled",
  "stockDailyMovePct",
  "stockGapOpenPct"
];
const REELS_PREF_KEYS = [
  "ttsEngine",
  "ttsVoice",
  "mediaPipelineEnabled"
];
const AI_PREF_KEYS = [
  "aiProvider",
  "anthropicApiKey",
  "fredApiKey",
  "semanticScholarApiKey"
];
function PreferencesTab() {
  const [prefs, setPrefs] = reactExports.useState(null);
  const [draft, setDraft] = reactExports.useState(null);
  const [coreStatus, setCoreStatus] = reactExports.useState(null);
  const [reelsStatus, setReelsStatus] = reactExports.useState(null);
  const [aiStatus, setAiStatus] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void window.api.prefs.get().then((p) => {
      setPrefs(p);
      setDraft(p);
    });
  }, []);
  const patch = (key, value) => {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
    setCoreStatus(null);
    setReelsStatus(null);
  };
  const diffKeys = (scope) => {
    if (!prefs || !draft) return [];
    return scope.filter((k) => prefs[k] !== draft[k]);
  };
  const applyScope = async (scope, setStatus) => {
    if (!draft) return;
    const changed = diffKeys(scope);
    if (changed.length === 0) return;
    setStatus("applying");
    try {
      for (const k of changed) {
        await window.api.prefs.set(k, draft[k]);
      }
      await window.api.prefs.apply();
      const fresh = await window.api.prefs.get();
      setPrefs(fresh);
      setDraft(fresh);
      setStatus("applied");
    } catch {
      setStatus("failed");
    }
  };
  const resetScope = (scope) => {
    setDraft((prev) => {
      if (!prev || !prefs) return prev;
      const next = { ...prev };
      for (const k of scope) {
        next[k] = prefs[k];
      }
      return next;
    });
    setCoreStatus(null);
    setReelsStatus(null);
  };
  if (!prefs || !draft) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6 text-sm text-zinc-500", children: "Loading…" });
  const coreDirty = diffKeys(CORE_PREF_KEYS).length;
  const reelsDirty = diffKeys(REELS_PREF_KEYS).length;
  const aiDirty = diffKeys(AI_PREF_KEYS).length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 space-y-8 max-w-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(PrefSection, { title: "Polling", children: /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Feed poll interval (minutes)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      NumberInput,
      {
        value: draft.pollIntervalMin,
        min: 1,
        max: 60,
        onChange: (v) => patch("pollIntervalMin", v)
      }
    ) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(PrefSection, { title: "Notifications", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Digest interval (minutes)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        NumberInput,
        {
          value: draft.digestIntervalMin,
          min: 5,
          max: 120,
          onChange: (v) => patch("digestIntervalMin", v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Daily cap (across all categories)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        NumberInput,
        {
          value: draft.notificationDailyCap,
          min: 0,
          max: 50,
          onChange: (v) => patch("notificationDailyCap", v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: "Total OS notifications per rolling 24h. 0 disables notifications entirely. Default 5 keeps signal high; bump up if you want to be more in-the-loop." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Articles (breaking news, digests)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ToggleSwitch,
        {
          checked: draft.notifyArticlesEnabled,
          onChange: (v) => patch("notifyArticlesEnabled", v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Stocks (price moves, analyst alerts)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ToggleSwitch,
        {
          checked: draft.notifyStocksEnabled,
          onChange: (v) => patch("notifyStocksEnabled", v)
        }
      ) }),
      draft.notifyStocksEnabled && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Daily move threshold (±%)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          NumberInput,
          {
            value: draft.stockDailyMovePct,
            min: 0.5,
            max: 30,
            onChange: (v) => patch("stockDailyMovePct", v)
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Gap-at-open threshold (±%)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          NumberInput,
          {
            value: draft.stockGapOpenPct,
            min: 0.5,
            max: 20,
            onChange: (v) => patch("stockGapOpenPct", v)
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: "Daily move covers regular session AND pre/after-hours (separate alerts per session). 52-week-high/low touches and gap-at-open also fire when their thresholds are met." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Sports (HRs, goals, NBA milestones)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ToggleSwitch,
        {
          checked: draft.notifySportsEnabled,
          onChange: (v) => patch("notifySportsEnabled", v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "SEC filings (8-K, Form 4 large insider)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ToggleSwitch,
        {
          checked: draft.notifyFilingsEnabled,
          onChange: (v) => patch("notifyFilingsEnabled", v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Macro (VIX spikes, rate moves)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ToggleSwitch,
        {
          checked: draft.notifyMacroEnabled,
          onChange: (v) => patch("notifyMacroEnabled", v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Quiet hours", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ToggleSwitch,
        {
          checked: draft.quietHoursEnabled,
          onChange: (v) => patch("quietHoursEnabled", v)
        }
      ) }),
      draft.quietHoursEnabled && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 pl-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TimeInput, { value: draft.quietHoursStart, onChange: (v) => patch("quietHoursStart", v) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500 text-xs", children: "to" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TimeInput, { value: draft.quietHoursEnd, onChange: (v) => patch("quietHoursEnd", v) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: "Quiet hours suppress non-urgent notifications. Urgent alerts (game scores, breaking news, big intraday moves) still come through." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(PrefSection, { title: "Display", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Density", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "select",
        {
          value: draft.density,
          onChange: (e) => patch("density", e.target.value),
          className: "bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "comfortable", children: "Comfortable" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "compact", children: "Compact" })
          ]
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pt-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-wider text-zinc-500 mb-2", children: "Theme" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ThemePicker, { value: draft.theme, onChange: (t) => patch("theme", t) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(PrefSection, { title: "Sports alerts", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Favorite team alerts", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ToggleSwitch,
        {
          checked: draft.favoriteTeamAlertsEnabled,
          onChange: (v) => patch("favoriteTeamAlertsEnabled", v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: "Notifies you when a favorite team's game starts and when it finishes. Manage teams in the Teams tab; quiet hours still apply." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(PrefSection, { title: "System", children: /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Launch at login", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ToggleSwitch,
      {
        checked: draft.launchAtLogin,
        onChange: (v) => patch("launchAtLogin", v)
      }
    ) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ApplyBar,
      {
        label: "Preferences",
        dirtyCount: coreDirty,
        status: coreStatus,
        onApply: () => void applyScope(CORE_PREF_KEYS, setCoreStatus),
        onReset: () => resetScope(CORE_PREF_KEYS)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(PrefSection, { title: "AI provider", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1 mb-2", children: "Chooses the model that generates company value chains and sector classifications. Claude (Anthropic API, your key) produces substantially better chains than local Ollama but costs ~$0.02 per generation. Local Ollama stays free and private." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Provider", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "select",
        {
          value: draft.aiProvider,
          onChange: (e) => patch("aiProvider", e.target.value),
          className: "bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "auto", children: "Auto (Claude if key is set, else Ollama)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "claude", children: "Claude (requires API key)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ollama", children: "Ollama only (local, free)" })
          ]
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Anthropic API key", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "password",
          value: draft.anthropicApiKey,
          onChange: (e) => patch("anthropicApiKey", e.target.value),
          placeholder: "sk-ant-...",
          autoComplete: "off",
          spellCheck: false,
          className: "w-[320px] bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent font-mono"
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: [
        "Key is stored locally in pulse.db and never transmitted anywhere except the Anthropic API. Revokable any time at console.anthropic.com.",
        " ",
        draft.anthropicApiKey && !draft.anthropicApiKey.startsWith("sk-ant-") && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-300", children: "⚠ Anthropic keys typically start with “sk-ant-” — double-check what you pasted." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "FRED API key", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "password",
          value: draft.fredApiKey,
          onChange: (e) => patch("fredApiKey", e.target.value),
          placeholder: "32-char hex",
          autoComplete: "off",
          spellCheck: false,
          className: "w-[320px] bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent font-mono"
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: "Free key powers the Macro Panel (rates, inflation, labor, volatility series from Federal Reserve Economic Data). Sign up at fredaccount.stlouisfed.org → My Account → API Keys. No charges ever; ~120 requests/min limit, well under our 9-series daily refresh." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Semantic Scholar key", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "password",
          value: draft.semanticScholarApiKey,
          onChange: (e) => patch("semanticScholarApiKey", e.target.value),
          placeholder: "s2k-...",
          autoComplete: "off",
          spellCheck: false,
          className: "w-[320px] bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent font-mono"
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: [
        "Free key powers the Research tab’s Semantic Scholar searches with a dedicated 1 RPS lane. Without it, requests share an anonymous pool that 429s during peak hours. Request one at semanticscholar.org/product/api#api-key-form — usually approved within a day. No charges.",
        draft.semanticScholarApiKey && !draft.semanticScholarApiKey.startsWith("s2k-") && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-amber-300", children: [
          " ",
          "⚠ Semantic Scholar keys typically start with “s2k-” — double-check what you pasted."
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ApplyBar,
      {
        label: "AI provider",
        dirtyCount: aiDirty,
        status: aiStatus,
        onApply: () => void applyScope(AI_PREF_KEYS, setAiStatus),
        onReset: () => resetScope(AI_PREF_KEYS)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarPrefSection, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ReelsPrefSection,
      {
        engine: draft.ttsEngine,
        voice: draft.ttsVoice,
        mediaPipelineEnabled: draft.mediaPipelineEnabled,
        committedMediaPipelineEnabled: prefs.mediaPipelineEnabled,
        dirtyCount: reelsDirty,
        status: reelsStatus,
        onPatch: (k, v) => patch(k, v),
        onApply: () => void applyScope(REELS_PREF_KEYS, setReelsStatus),
        onReset: () => resetScope(REELS_PREF_KEYS)
      }
    )
  ] });
}
function ApplyBar({
  label,
  dirtyCount,
  status,
  onApply,
  onReset
}) {
  const hasChanges = dirtyCount > 0;
  const applying = status === "applying";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3 rounded-md border border-edge bg-surface-1 px-4 py-2.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-[0.18em] text-zinc-500", children: hasChanges ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-amber-300/90", children: [
      dirtyCount,
      " unsaved ",
      dirtyCount === 1 ? "change" : "changes"
    ] }) : status === "applied" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-teal-300", children: [
      label,
      " saved"
    ] }) : status === "failed" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-rose-300", children: "Save failed — try again" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
      label,
      " · no changes"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onReset,
          disabled: !hasChanges || applying,
          className: "px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em] bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge hover:bg-surface-3 disabled:opacity-40",
          children: "Reset"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onApply,
          disabled: !hasChanges || applying,
          className: "px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em] bg-teal-500/25 text-teal-100 ring-1 ring-inset ring-teal-500/50 hover:bg-teal-500/35 disabled:opacity-40",
          children: applying ? "Applying…" : "Apply"
        }
      )
    ] })
  ] });
}
const EVENT_KINDS = [
  {
    id: "earnings",
    label: "Earnings",
    description: "Upcoming earnings dates for tickers in your watchlist."
  },
  {
    id: "dividends",
    label: "Ex-dividend dates",
    description: "Next ex-dividend date for tickers in your watchlist."
  },
  {
    id: "stockSplits",
    label: "Stock splits",
    description: "Upcoming splits for tickers in your watchlist."
  },
  {
    id: "ipos",
    label: "IPOs",
    description: "Upcoming IPOs listing on US exchanges (market-wide)."
  },
  {
    id: "fedMeetings",
    label: "Fed meetings",
    description: "FOMC rate decisions and Fed policy events."
  },
  {
    id: "econReleases",
    label: "Economic releases",
    description: "CPI, NFP, GDP, retail sales, jobless claims, PCE, and similar macro data."
  },
  {
    id: "games",
    label: "Favorite team games",
    description: "Scheduled games for teams you follow in Sports."
  },
  {
    id: "launches",
    label: "Space launches",
    description: "Upcoming rocket launches from Launch Library 2."
  },
  {
    id: "worldEvents",
    label: "World events",
    description: "Significant world events from the last few days, curated from Wikipedia’s Current Events Portal."
  }
];
function CalendarPrefSection() {
  const [config, setConfig] = reactExports.useState(null);
  const [draft, setDraft] = reactExports.useState(null);
  const [applyStatus, setApplyStatus] = reactExports.useState(null);
  const [ioStatus, setIoStatus] = reactExports.useState(null);
  const [busy, setBusy] = reactExports.useState(false);
  reactExports.useEffect(() => {
    void window.api.config.get().then((c) => {
      setConfig(c);
      setDraft(c);
    });
  }, []);
  const patchWindow = (v) => {
    setDraft(
      (prev) => prev ? { ...prev, calendar: { ...prev.calendar, windowDays: v } } : prev
    );
    setApplyStatus(null);
  };
  const patchKind = (id, enabled) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          eventKinds: {
            ...prev.calendar.eventKinds,
            [id]: { enabled }
          }
        }
      };
    });
    setApplyStatus(null);
  };
  const dirtyCount = (() => {
    if (!config || !draft) return 0;
    let n = 0;
    if (config.calendar.windowDays !== draft.calendar.windowDays) n++;
    for (const k of Object.keys(draft.calendar.eventKinds)) {
      if (draft.calendar.eventKinds[k].enabled !== config.calendar.eventKinds[k].enabled) n++;
    }
    return n;
  })();
  const doApply = async () => {
    if (!draft || dirtyCount === 0) return;
    setApplyStatus("applying");
    try {
      const patch = {
        calendar: {}
      };
      if (config && config.calendar.windowDays !== draft.calendar.windowDays) {
        patch.calendar.windowDays = draft.calendar.windowDays;
      }
      const kindPatch = {};
      if (config) {
        for (const k of Object.keys(draft.calendar.eventKinds)) {
          if (draft.calendar.eventKinds[k].enabled !== config.calendar.eventKinds[k].enabled) {
            kindPatch[k] = { enabled: draft.calendar.eventKinds[k].enabled };
          }
        }
      }
      if (Object.keys(kindPatch).length > 0) patch.calendar.eventKinds = kindPatch;
      const next = await window.api.config.update(patch);
      setConfig(next);
      setDraft(next);
      setApplyStatus("applied");
    } catch {
      setApplyStatus("failed");
    }
  };
  const doReset = () => {
    if (!config) return;
    setDraft(config);
    setApplyStatus(null);
  };
  const doExport = async () => {
    if (busy) return;
    setBusy(true);
    setIoStatus(null);
    try {
      const result = await window.api.config.export();
      if (result.ok) setIoStatus(`Exported to ${result.path}`);
      else if (!result.canceled) setIoStatus(`Export failed: ${result.error ?? "unknown"}`);
    } finally {
      setBusy(false);
    }
  };
  const doImport = async () => {
    if (busy) return;
    setBusy(true);
    setIoStatus(null);
    try {
      const result = await window.api.config.import();
      if (result.ok) {
        setConfig(result.config);
        setDraft(result.config);
        setApplyStatus(null);
        setIoStatus("Imported preferences applied.");
      } else if (!result.canceled) {
        setIoStatus(`Import failed: ${result.error ?? "unknown"}`);
      }
    } finally {
      setBusy(false);
    }
  };
  if (!config || !draft)
    return /* @__PURE__ */ jsxRuntimeExports.jsx(PrefSection, { title: "Calendar", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-zinc-500", children: "Loading…" }) });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(PrefSection, { title: "Calendar", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Window (days)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        NumberInput,
        {
          value: draft.calendar.windowDays,
          min: 1,
          max: 30,
          onChange: (v) => patchWindow(v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pt-1 space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-wider text-zinc-500", children: "Event kinds" }),
        EVENT_KINDS.map((kind) => {
          const enabled = draft.calendar.eventKinds[kind.id]?.enabled ?? false;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4 py-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-200", children: kind.label }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed", children: kind.description })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ToggleSwitch, { checked: enabled, onChange: (v) => patchKind(kind.id, v) })
          ] }, kind.id);
        })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pt-3 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: doExport,
            disabled: busy,
            className: "px-3 py-1.5 rounded-md bg-surface-2 border border-edge text-[11px] font-medium text-zinc-200 hover:bg-surface-3 disabled:opacity-50",
            children: "Export preferences…"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: doImport,
            disabled: busy,
            className: "px-3 py-1.5 rounded-md bg-surface-2 border border-edge text-[11px] font-medium text-zinc-200 hover:bg-surface-3 disabled:opacity-50",
            children: "Import preferences…"
          }
        )
      ] }),
      ioStatus && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-400 pt-1 break-all", children: ioStatus }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] text-zinc-500 leading-relaxed pt-1", children: [
        "Saved as ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-zinc-400", children: "pulse-preferences.json" }),
        " in your app data folder."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ApplyBar,
      {
        label: "Calendar",
        dirtyCount,
        status: applyStatus,
        onApply: () => void doApply(),
        onReset: doReset
      }
    )
  ] });
}
function ReelsPrefSection({
  engine,
  voice,
  mediaPipelineEnabled,
  committedMediaPipelineEnabled,
  dirtyCount,
  status,
  onPatch,
  onApply,
  onReset
}) {
  const [kokoro, setKokoro] = reactExports.useState({ state: "idle" });
  const [voices, setVoices] = reactExports.useState([]);
  const [rebuilding, setRebuilding] = reactExports.useState(false);
  const [rebuildMsg, setRebuildMsg] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void window.api.reels.getKokoroStatus().then(setKokoro);
    void window.api.reels.listKokoroVoices().then(setVoices);
    const unsub = window.api.reels.onKokoroStatus(setKokoro);
    return unsub;
  }, []);
  const rebuild = async () => {
    setRebuilding(true);
    setRebuildMsg("Rebuilding flash audio…");
    try {
      const n = await window.api.reels.rebuildAudio();
      setRebuildMsg(n > 0 ? `Rebuilt ${n} flashes.` : "Nothing to rebuild.");
    } catch (err) {
      setRebuildMsg(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  };
  const statusLabel = kokoroStatusLabel(kokoro);
  const statusTone = kokoroStatusTone(kokoro);
  const pipelineRestartRequired = mediaPipelineEnabled !== committedMediaPipelineEnabled;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(PrefSection, { title: "Reels & narration pipeline", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Enable reels + audio narration", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ToggleSwitch,
        {
          checked: mediaPipelineEnabled,
          onChange: (v) => onPatch("mediaPipelineEnabled", v)
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: "Turn off to save battery on laptops — Kokoro, Piper, video generation, and ffmpeg workers will not launch at startup. New reels won't be generated until you turn it back on." }),
      pipelineRestartRequired && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-amber-300 leading-relaxed pl-1", children: "Restart Pulse after applying for this change to take effect." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(PrefSection, { title: "Flash narration", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "TTS engine", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "select",
        {
          value: engine,
          onChange: (e) => onPatch("ttsEngine", e.target.value),
          className: "bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "kokoro", children: "Kokoro-82M (neural, best)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "piper", children: "Piper (neural, fallback)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "say", children: "macOS say (system)" })
          ]
        }
      ) }),
      engine === "kokoro" && /* @__PURE__ */ jsxRuntimeExports.jsx(PrefRow, { label: "Voice", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "select",
        {
          value: voice,
          onChange: (e) => onPatch("ttsVoice", e.target.value),
          disabled: voices.length === 0,
          className: "bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent disabled:opacity-50 max-w-[260px]",
          children: voices.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: voice }) : voices.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: v.id, children: v.label }, v.id))
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pl-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[11px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `h-1.5 w-1.5 rounded-full ${statusTone}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500 uppercase tracking-wider", children: "Kokoro:" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300", children: statusLabel })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => void rebuild(),
            disabled: rebuilding,
            className: "px-3 py-1 text-[11px] uppercase tracking-wider rounded border border-edge bg-surface-2 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 disabled:opacity-50",
            children: rebuilding ? "Rebuilding…" : "Rebuild all audio"
          }
        )
      ] }),
      rebuildMsg && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 pl-1", children: rebuildMsg }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-relaxed pl-1", children: "Kokoro is the primary TTS. Piper and macOS say are automatic fallbacks when Kokoro is unavailable. Changing voice applies to new flashes — use Rebuild to re-synthesize existing ones." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ApplyBar,
      {
        label: "Flash narration",
        dirtyCount,
        status,
        onApply,
        onReset
      }
    )
  ] });
}
function kokoroStatusLabel(s) {
  switch (s.state) {
    case "idle":
      return "idle";
    case "unsupported":
      return `unavailable (${s.reason})`;
    case "checking-python":
      return "checking python…";
    case "creating-venv":
      return "creating venv…";
    case "installing-deps":
      return "installing dependencies…";
    case "starting-worker":
      return "starting worker…";
    case "loading-model":
      return "loading model…";
    case "ready":
      return "ready";
    case "failed":
      return `failed (${s.reason})`;
  }
}
function kokoroStatusTone(s) {
  if (s.state === "ready") return "bg-emerald-400";
  if (s.state === "failed" || s.state === "unsupported") return "bg-rose-500";
  if (s.state === "idle") return "bg-zinc-500";
  return "bg-amber-400 animate-pulse";
}
function TeamsTab() {
  const [leagues, setLeagues] = reactExports.useState([]);
  const [selectedLeagueId, setSelectedLeagueId] = reactExports.useState(null);
  const [teamsByLeague, setTeamsByLeague] = reactExports.useState({});
  const [loadingTeams, setLoadingTeams] = reactExports.useState(false);
  const [favorites, setFavorites] = reactExports.useState([]);
  const [query, setQuery] = reactExports.useState("");
  reactExports.useEffect(() => {
    void window.api.sports.listLeagues().then((ls) => {
      setLeagues(ls);
      if (ls.length > 0) setSelectedLeagueId((prev) => prev ?? ls[0].id);
    });
    void window.api.favoriteTeams.list().then(setFavorites);
  }, []);
  reactExports.useEffect(() => {
    if (!selectedLeagueId) return;
    if (teamsByLeague[selectedLeagueId]) return;
    setLoadingTeams(true);
    void window.api.sports.listTeams(selectedLeagueId).then((teams2) => setTeamsByLeague((prev) => ({ ...prev, [selectedLeagueId]: teams2 }))).finally(() => setLoadingTeams(false));
  }, [selectedLeagueId, teamsByLeague]);
  const reloadFavorites = async () => {
    setFavorites(await window.api.favoriteTeams.list());
  };
  const favoriteIds = reactExports.useMemo(() => {
    const byLeague = {};
    for (const f of favorites) {
      const set = byLeague[f.leagueId] ?? (byLeague[f.leagueId] = /* @__PURE__ */ new Set());
      set.add(f.teamId);
    }
    return byLeague;
  }, [favorites]);
  const selectedLeague = leagues.find((l) => l.id === selectedLeagueId);
  const teams = selectedLeagueId ? teamsByLeague[selectedLeagueId] ?? [] : [];
  const filteredTeams = reactExports.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) => [t.displayName, t.name, t.location, t.abbreviation, t.shortName].filter(Boolean).some((s) => s.toLowerCase().includes(q))
    );
  }, [teams, query]);
  const addFavorite = async (team) => {
    if (!selectedLeagueId) return;
    await window.api.favoriteTeams.add({
      leagueId: selectedLeagueId,
      teamId: team.id,
      teamName: team.displayName,
      abbreviation: team.abbreviation,
      logoURL: team.logoURL
    });
    await reloadFavorites();
  };
  const removeFavorite = async (id) => {
    await window.api.favoriteTeams.delete(id);
    await reloadFavorites();
  };
  const toggleAlerts = async (fav) => {
    await window.api.favoriteTeams.setAlerts(fav.id, !fav.alertsEnabled);
    await reloadFavorites();
  };
  const groupedFavorites = reactExports.useMemo(() => {
    const byLeague = /* @__PURE__ */ new Map();
    for (const f of favorites) {
      const arr = byLeague.get(f.leagueId) ?? [];
      arr.push(f);
      byLeague.set(f.leagueId, arr);
    }
    return byLeague;
  }, [favorites]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2", children: "Your favorite teams" }),
      favorites.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-500 px-3 py-4 border border-dashed border-edge rounded", children: "No favorites yet. Pick a league and add teams below." }),
      favorites.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "border border-edge rounded divide-y divide-edge", children: [...groupedFavorites.entries()].map(([lid, favs]) => {
        const league = leagues.find((l) => l.id === lid);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "px-3 py-2.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-orange-400/90 mb-2", children: league?.shortName ?? lid.toUpperCase() }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1.5", children: favs.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "li",
            {
              className: "flex items-center gap-3 px-2 py-1.5 rounded bg-surface-2/60",
              children: [
                f.logoURL && /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: f.logoURL, alt: "", className: "w-5 h-5 object-contain" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-100 truncate", children: f.teamName }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: f.abbreviation })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500 mr-1", children: [
                  "Alerts",
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    ToggleSwitch,
                    {
                      checked: f.alertsEnabled,
                      onChange: () => void toggleAlerts(f)
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => void removeFavorite(f.id),
                    className: "text-[10px] uppercase tracking-wider text-zinc-500 hover:text-red-300 px-2 py-1",
                    children: "Remove"
                  }
                )
              ]
            },
            f.id
          )) })
        ] }, lid);
      }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2", children: "Add a team" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5 mb-3", children: leagues.map((l) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => {
            setSelectedLeagueId(l.id);
            setQuery("");
          },
          className: `px-2.5 py-1 text-[11px] uppercase tracking-wider rounded ${selectedLeagueId === l.id ? "bg-accent/20 text-accent" : "bg-surface-2 text-zinc-400 hover:text-zinc-200"}`,
          children: l.shortName
        },
        l.id
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          placeholder: `Search ${selectedLeague?.shortName ?? ""} teams…`,
          className: "w-full px-3 py-1.5 text-sm bg-surface-2 border border-edge rounded text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-accent mb-3"
        }
      ),
      loadingTeams && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-500 px-3 py-3", children: "Loading teams…" }),
      !loadingTeams && filteredTeams.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-500 px-3 py-3", children: "No teams match." }),
      !loadingTeams && filteredTeams.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "border border-edge rounded divide-y divide-edge max-h-80 overflow-y-auto", children: filteredTeams.map((t) => {
        const isFav = favoriteIds[selectedLeagueId ?? ""]?.has(t.id) ?? false;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "li",
          {
            className: "flex items-center gap-3 px-3 py-2 hover:bg-surface-2/40",
            children: [
              t.logoURL && /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: t.logoURL, alt: "", className: "w-6 h-6 object-contain" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-100 truncate", children: t.displayName }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: [
                  t.abbreviation,
                  t.location && t.location !== t.displayName && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                    " · ",
                    t.location
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  disabled: isFav,
                  onClick: () => void addFavorite(t),
                  className: `px-2.5 py-1 text-[11px] uppercase tracking-wider rounded ${isFav ? "bg-surface-2 text-zinc-500 cursor-not-allowed" : "bg-accent/20 text-accent hover:bg-accent/30"}`,
                  children: isFav ? "Added" : "Add"
                }
              )
            ]
          },
          t.id
        );
      }) })
    ] })
  ] });
}
function PrefSection({ title, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[10px] font-semibold tracking-[0.18em] uppercase text-zinc-400 mb-3", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children })
  ] });
}
const THEME_OPTIONS = [
  { value: "system", label: "System", hint: "Follow macOS", swatches: ["#1a1a1a", "#ffffff", "#3b82f6"] },
  { value: "default", label: "Default", hint: "Pulse dark", swatches: ["#0a0b0d", "#171a1f", "#f59e0b"] },
  { value: "light", label: "Light", hint: "Daylight", swatches: ["#ffffff", "#eef0f3", "#2563eb"] },
  { value: "fiesta", label: "Fiesta", hint: "Red heat", swatches: ["#14060a", "#300e12", "#ef4444"] },
  { value: "zazu", label: "Zazu", hint: "Jungle", swatches: ["#06140e", "#0e2c1e", "#22c55e"] },
  { value: "ocean", label: "Ocean", hint: "Deep blue", swatches: ["#050e1c", "#0a1e36", "#38bdf8"] },
  { value: "casino", label: "Casino", hint: "Black & gold", swatches: ["#06060422", "#18140a", "#eab308"] }
];
function ThemePicker({
  value,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-2 sm:grid-cols-4", children: THEME_OPTIONS.map((opt) => {
    const active = value === opt.value;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => onChange(opt.value),
        className: `flex flex-col items-start gap-2 p-2.5 rounded-md border text-left transition-colors ${active ? "border-accent bg-surface-2" : "border-edge bg-surface-1 hover:bg-surface-2"}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1 w-full", children: opt.swatches.map((c, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "flex-1 h-8 rounded-sm border border-black/20",
              style: { backgroundColor: c }
            },
            i
          )) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-[12px] font-medium ${active ? "text-zinc-100" : "text-zinc-200"}`, children: opt.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-wider text-zinc-500", children: opt.hint })
          ] })
        ]
      },
      opt.value
    );
  }) });
}
function PrefRow({ label, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-zinc-300", children: label }),
    children
  ] });
}
function NumberInput({
  value,
  min,
  max,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "number",
      value,
      min,
      max,
      onChange: (e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
      },
      className: "w-16 bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 text-right outline-none focus:border-accent tabular-nums"
    }
  );
}
function TimeInput({
  value,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "input",
    {
      type: "time",
      value,
      onChange: (e) => onChange(e.target.value),
      className: "bg-surface-2 border border-edge rounded px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-accent"
    }
  );
}
function ToggleSwitch({
  checked,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick: () => onChange(!checked),
      className: `relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-accent" : "bg-surface-3"}`,
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: `inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`
        }
      )
    }
  );
}
function Discovery({ onClose }) {
  const [suggestions, setSuggestions] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [running, setRunning] = reactExports.useState(null);
  const reload = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.discovery.list();
      setSuggestions(data);
      void window.api.discovery.markAllViewed();
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    void reload();
  }, [reload]);
  const run = async (mode) => {
    if (running) return;
    setRunning(mode);
    try {
      if (mode === "daily") await window.api.discovery.runDaily();
      else if (mode === "weekly") await window.api.discovery.runWeekly();
      else await window.api.discovery.runPortfolioGaps();
      await reload();
    } finally {
      setRunning(null);
    }
  };
  const handleDelete = async (id) => {
    await window.api.discovery.delete(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  };
  const daily = suggestions.filter((s) => s.mode === "daily");
  const weekly = suggestions.filter((s) => s.mode === "weekly");
  const gaps = suggestions.filter((s) => s.mode === "portfolio-gaps");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden",
      "data-lookup-context": "Stock discovery page — emerging and adjacent publicly traded companies in the user's semiconductor value chain, defense/aerospace, and mining portfolio. Ambiguous terms are almost always companies or tickers, not people or places.",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "h-11 shrink-0 flex items-center gap-3 px-4 border-b border-edge bg-surface-1/60", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onClose,
              className: "text-[11px] text-zinc-400 hover:text-zinc-100",
              title: "Back",
              children: "← Back"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] uppercase tracking-widest text-zinc-300", children: "Stock Discovery" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RunButton, { label: "Daily Scan", running: running === "daily", onClick: () => run("daily"), disabled: running !== null }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(RunButton, { label: "Weekly AI", running: running === "weekly", onClick: () => run("weekly"), disabled: running !== null }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(RunButton, { label: "Portfolio Gaps", running: running === "portfolio-gaps", onClick: () => run("portfolio-gaps"), disabled: running !== null })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto px-6 py-6 space-y-8", children: [
          loading && suggestions.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-zinc-500", children: "Loading suggestions…" }),
          !loading && suggestions.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center py-16", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs uppercase tracking-[0.25em] text-zinc-600 mb-3", children: "No suggestions yet" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-zinc-500 max-w-sm mx-auto", children: 'Click "Daily Scan" for keyword-based picks, or "Weekly AI" / "Portfolio Gaps" for Ollama-powered analysis.' })
          ] }),
          daily.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(SuggestionGroup, { title: "Daily Drip", accent: "text-blue-400", items: daily, onDelete: handleDelete }),
          weekly.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(SuggestionGroup, { title: "Weekly Curated", accent: "text-amber-400", items: weekly, onDelete: handleDelete }),
          gaps.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(SuggestionGroup, { title: "Portfolio Gaps", accent: "text-emerald-400", items: gaps, onDelete: handleDelete })
        ] })
      ]
    }
  );
}
function RunButton({
  label,
  running,
  onClick,
  disabled
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick,
      disabled,
      className: "no-drag text-[10px] uppercase tracking-wider px-2 py-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 disabled:text-zinc-600 disabled:hover:bg-transparent",
      children: running ? "Running…" : label
    }
  );
}
function SuggestionGroup({
  title,
  accent,
  items,
  onDelete
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: `text-[10px] font-semibold tracking-[0.18em] uppercase ${accent} mb-3`, children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: items.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SuggestionCard, { suggestion: s, onDelete: () => onDelete(s.id) }, s.id)) })
  ] });
}
function SuggestionCard({
  suggestion: s,
  onDelete
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-1 border border-edge rounded-lg px-4 py-3 flex items-start gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-zinc-100 tracking-wide", children: s.ticker }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-zinc-400", children: s.companyName }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600 ml-auto shrink-0", children: formatAge(s.createdAt) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-300 leading-relaxed", children: s.reason })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onDelete,
        title: "Dismiss",
        className: "shrink-0 text-zinc-600 hover:text-zinc-300 text-[11px] mt-0.5",
        children: "×"
      }
    )
  ] });
}
function formatAge(ts) {
  const diff = Date.now() - ts;
  const hr = 60 * 60 * 1e3;
  const day = 24 * hr;
  if (diff < hr) return "just now";
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}
const WELCOME_TURN = {
  id: 0,
  role: "assistant",
  text: "Ask me anything. I can find new feeds, search articles in your feed, answer general questions, or tell you about your settings."
};
function initialTurns() {
  return [WELCOME_TURN];
}
function deriveChatTitle(turns) {
  const firstUser = turns.find((t) => t.role === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.text.trim().replace(/\s+/g, " ");
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}
function maxTurnId(turns) {
  return turns.reduce((max, t) => t.id > max ? t.id : max, 0);
}
function guessDomain(category, known) {
  const match = known.find((c) => c.name.toLowerCase() === category.trim().toLowerCase());
  if (match) return match.domain;
  const lc = category.toLowerCase();
  const financeHints = ["semi", "chip", "finance", "stock", "market", "econ", "defense", "mining"];
  return financeHints.some((h) => lc.includes(h)) ? "finance" : "general";
}
function buildFeedCards(payload, categories) {
  return payload.candidates.map((c) => ({
    ...c,
    probeStatus: "verifying",
    resolvedTitle: c.title,
    description: null,
    homepageURL: null,
    probeError: null,
    added: c.alreadySubscribed,
    adding: false,
    chosenCategory: c.category || "General",
    chosenDomain: guessDomain(c.category || "General", categories)
  }));
}
function Hyperintelligence({
  onClose,
  onFeedsChanged,
  onOpenURL,
  onOpenArticle,
  onOpenSettings
}) {
  const [turns, setTurns] = reactExports.useState(initialTurns);
  const [input, setInput] = reactExports.useState("");
  const [busy, setBusy] = reactExports.useState(false);
  const [categories, setCategories] = reactExports.useState([]);
  const [chatList, setChatList] = reactExports.useState([]);
  const [currentChatId, setCurrentChatId] = reactExports.useState(null);
  const nextIdRef = reactExports.useRef(1);
  const scrollRef = reactExports.useRef(null);
  const saveTimerRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    void window.api.categories.list().then(setCategories);
    void window.api.hyperChats.list().then(setChatList);
  }, []);
  reactExports.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);
  reactExports.useEffect(() => {
    const hasUserTurn = turns.some((t) => t.role === "user");
    if (!hasUserTurn) return;
    const hasContent = turns.some(
      (t) => (t.cards?.length ?? 0) > 0 || (t.feedCards?.length ?? 0) > 0 || !!t.response
    );
    if (!hasContent && currentChatId == null) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        const id = await window.api.hyperChats.save({
          id: currentChatId,
          title: deriveChatTitle(turns),
          turns
        });
        if (currentChatId == null) setCurrentChatId(id);
        const list = await window.api.hyperChats.list();
        setChatList(list);
      })();
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [turns, currentChatId]);
  const nextId = () => nextIdRef.current++;
  const newChat = reactExports.useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setTurns(initialTurns());
    setCurrentChatId(null);
    nextIdRef.current = 1;
    setInput("");
    setBusy(false);
  }, []);
  const loadChat = reactExports.useCallback(
    async (id) => {
      if (id === currentChatId) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const chat = await window.api.hyperChats.get(id);
      if (!chat) return;
      const loaded = chat.turns ?? [];
      const restored = loaded.length > 0 ? loaded : initialTurns();
      setTurns(restored);
      setCurrentChatId(id);
      nextIdRef.current = maxTurnId(restored) + 1;
      setInput("");
      setBusy(false);
    },
    [currentChatId]
  );
  const updateFeedCard = reactExports.useCallback(
    (turnId, url, patch) => {
      setTurns(
        (prev) => prev.map((t) => {
          if (t.id !== turnId) return t;
          if (t.feedCards) {
            return {
              ...t,
              feedCards: t.feedCards.map((c) => c.url === url ? { ...c, ...patch } : c)
            };
          }
          if (t.cards) {
            return {
              ...t,
              cards: t.cards.map((c) => c.url === url ? { ...c, ...patch } : c)
            };
          }
          return t;
        })
      );
    },
    []
  );
  const probeFeedCards = reactExports.useCallback(
    (turnId, cards) => {
      for (const card of cards) {
        void (async () => {
          try {
            const probe = await window.api.feedFinder.probe(card.url);
            if (probe.status === "ok") {
              updateFeedCard(turnId, card.url, {
                probeStatus: "verified",
                resolvedTitle: probe.title?.trim() || card.title,
                description: probe.description ?? null,
                homepageURL: probe.homepageURL ?? null
              });
            } else {
              updateFeedCard(turnId, card.url, {
                probeStatus: "dead",
                probeError: probe.error ?? "Unreachable"
              });
            }
          } catch {
            updateFeedCard(turnId, card.url, {
              probeStatus: "dead",
              probeError: "Probe failed"
            });
          }
        })();
      }
    },
    [updateFeedCard]
  );
  const submit = reactExports.useCallback(async () => {
    const trimmed = input.trim();
    if (trimmed.length === 0 || busy) return;
    const userTurn = { id: nextId(), role: "user", text: trimmed };
    setTurns((prev) => [...prev, userTurn]);
    setInput("");
    setBusy(true);
    const assistantTurnId = nextId();
    try {
      const result = await window.api.hyper.ask(trimmed);
      let feedCards;
      if (result.kind === "feeds") {
        feedCards = buildFeedCards(result.payload, categories);
      }
      setTurns((prev) => [
        ...prev,
        {
          id: assistantTurnId,
          role: "assistant",
          text: result.reply,
          response: result,
          feedCards,
          // Mirror status for older renderers / back-compat parsing.
          status: result.kind === "feeds" ? result.payload.status : void 0,
          // Settings proposals start pending — the user clicks APPLY/Cancel
          // on the card and we advance this state so the buttons lock in.
          proposalState: result.kind === "settings-proposal" ? "pending" : void 0
        }
      ]);
      setBusy(false);
      if (feedCards && feedCards.length > 0) {
        probeFeedCards(assistantTurnId, feedCards);
      }
    } catch {
      setTurns((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: "Something went wrong. Try again." }
      ]);
      setBusy(false);
    }
  }, [input, busy, categories, probeFeedCards]);
  const addOne = async (turnId, card) => {
    if (card.added || card.adding) return;
    updateFeedCard(turnId, card.url, { adding: true });
    try {
      await window.api.feedFinder.add({
        title: card.resolvedTitle || card.title,
        url: card.url,
        categoryName: card.chosenCategory,
        domain: card.chosenDomain
      });
      updateFeedCard(turnId, card.url, { added: true, adding: false });
      setCategories(await window.api.categories.list());
      onFeedsChanged();
    } catch {
      updateFeedCard(turnId, card.url, { adding: false });
    }
  };
  const applyProposal = async (turnId, proposal) => {
    setTurns(
      (prev) => prev.map((t) => t.id === turnId ? { ...t, proposalState: "pending" } : t)
    );
    try {
      await window.api.hyper.applySettings(proposal.change);
      setTurns(
        (prev) => prev.map((t) => t.id === turnId ? { ...t, proposalState: "applied" } : t)
      );
    } catch {
      setTurns(
        (prev) => prev.map((t) => t.id === turnId ? { ...t, proposalState: "failed" } : t)
      );
    }
  };
  const cancelProposal = (turnId) => {
    setTurns(
      (prev) => prev.map((t) => t.id === turnId ? { ...t, proposalState: "cancelled" } : t)
    );
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "h-11 shrink-0 flex items-center gap-3 px-4 border-b border-edge bg-surface-1/60", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onClose,
          className: "text-[11px] text-zinc-400 hover:text-zinc-100",
          title: "Back",
          children: "← Back"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] uppercase tracking-widest text-zinc-300", children: "Hyperintelligence" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: currentChatId ?? "",
            onChange: (e) => {
              const v = e.target.value;
              if (v) void loadChat(Number(v));
            },
            className: "text-[11px] bg-surface-2 rounded px-2 py-1 text-zinc-300 ring-1 ring-inset ring-edge outline-none max-w-[220px]",
            title: "Recent chats",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", disabled: true, children: chatList.length === 0 ? "No past chats" : "Recent chats…" }),
              chatList.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: c.id, children: c.title }, c.id))
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: newChat,
            className: "text-[11px] font-semibold uppercase tracking-[0.16em] px-2.5 py-1 rounded bg-teal-500/15 text-teal-200 ring-1 ring-inset ring-teal-500/30 hover:bg-teal-500/25",
            title: "Start a new chat",
            children: "+ New"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: scrollRef, className: "flex-1 min-h-0 overflow-y-auto px-6 py-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-[760px] mx-auto space-y-4", children: [
      turns.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        TurnView,
        {
          turn: t,
          categories,
          onChangeFeedCard: (url, patch) => updateFeedCard(t.id, url, patch),
          onAddFeed: (c) => void addOne(t.id, c),
          onOpenURL,
          onOpenArticle,
          onOpenSettings,
          onApplyProposal: (p) => void applyProposal(t.id, p),
          onCancelProposal: () => cancelProposal(t.id)
        },
        t.id
      )),
      busy && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" }),
        "Thinking…"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shrink-0 border-t border-edge bg-surface-1/60 px-6 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-[760px] mx-auto flex items-end gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          value: input,
          onChange: (e) => setInput(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          },
          rows: 1,
          placeholder: "Find feeds, search your articles, ask a question, or check a setting…",
          className: "flex-1 resize-none bg-surface-2 rounded-md px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 outline-none ring-1 ring-inset ring-edge focus:ring-teal-500/40"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => void submit(),
          disabled: busy || input.trim().length === 0,
          className: "px-3 py-2 rounded-md text-[11px] font-semibold uppercase tracking-[0.16em] bg-teal-500/20 text-teal-200 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/30 disabled:opacity-40",
          children: "Ask"
        }
      )
    ] }) })
  ] });
}
function TurnView({
  turn,
  categories,
  onChangeFeedCard,
  onAddFeed,
  onOpenURL,
  onOpenArticle,
  onOpenSettings,
  onApplyProposal,
  onCancelProposal
}) {
  if (turn.role === "user") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl rounded-br-sm px-4 py-2 bg-teal-500/15 text-teal-100 text-[13px] max-w-[85%]", children: turn.text }) });
  }
  const feedCards = turn.feedCards ?? turn.cards;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    turn.text && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] leading-[1.6] text-zinc-200", children: turn.text }),
    feedCards && feedCards.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: feedCards.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      CandidateCard,
      {
        card: c,
        categories,
        onChange: (patch) => onChangeFeedCard(c.url, patch),
        onAdd: () => onAddFeed(c),
        onOpenURL
      },
      c.url
    )) }),
    turn.response?.kind === "articles" && turn.response.payload.articles.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: turn.response.payload.articles.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(ArticleHitCard, { article: a, onOpen: () => onOpenArticle(a.id) }, a.id)) }),
    turn.response?.kind === "qa" && turn.response.payload.source !== "none" && /* @__PURE__ */ jsxRuntimeExports.jsx(QAAnswerCard, { qa: turn.response.payload, onOpenURL }),
    turn.response?.kind === "settings" && turn.response.payload.status === "ok" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: turn.response.payload.snapshots.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingsSnapshotCard,
      {
        snapshot: s,
        onOpen: () => onOpenSettings(s.descriptor.tab)
      },
      s.descriptor.key
    )) }),
    turn.response?.kind === "settings-proposal" && /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingsProposalCard,
      {
        proposal: turn.response.payload,
        state: turn.proposalState ?? "pending",
        onApply: () => {
          if (turn.response?.kind !== "settings-proposal") return;
          onApplyProposal(turn.response.payload);
        },
        onCancel: onCancelProposal,
        onOpenSettings: () => {
          if (turn.response?.kind !== "settings-proposal") return;
          onOpenSettings(turn.response.payload.descriptor.tab);
        }
      }
    ),
    turn.response?.kind === "settings-rejection" && /* @__PURE__ */ jsxRuntimeExports.jsx(
      SettingsRejectionCard,
      {
        rejection: turn.response.payload,
        onOpenSettings: () => {
          if (turn.response?.kind !== "settings-rejection") return;
          onOpenSettings(turn.response.payload.descriptor.tab);
        }
      }
    )
  ] });
}
function ArticleHitCard({
  article,
  onOpen
}) {
  const date = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString(void 0, {
    month: "short",
    day: "numeric"
  }) : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick: onOpen,
      className: "w-full text-left rounded-lg border border-edge bg-surface-1 hover:bg-surface-2 px-4 py-3 transition-colors",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: article.feedTitle }),
          date && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: "·" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums", children: date })
          ] }),
          article.isBookmarked && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-300/80", children: "• bookmarked" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] font-semibold text-zinc-100 leading-snug", children: article.title }),
        article.summary && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[12px] text-zinc-400 line-clamp-2", children: article.summary })
      ]
    }
  );
}
function QAAnswerCard({
  qa,
  onOpenURL
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-edge bg-surface-1 px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13.5px] leading-[1.7] text-zinc-100 whitespace-pre-wrap", children: qa.answer }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: qa.source === "wikipedia" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Wikipedia" }),
      qa.sourceURL && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: "·" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => qa.sourceURL && onOpenURL(qa.sourceURL, qa.sourceTitle ?? "Wikipedia"),
            className: "text-teal-300 hover:text-teal-200",
            children: [
              "Open ",
              qa.sourceTitle ?? "article"
            ]
          }
        )
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: qa.provider === "claude" ? "Claude" : "Local AI" }),
      !qa.confident && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: "·" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-300/80", children: "low confidence" })
      ] })
    ] }) })
  ] });
}
function SettingsSnapshotCard({
  snapshot,
  onOpen
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-edge bg-surface-1 px-4 py-3 flex items-center gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-0.5", children: snapshot.descriptor.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] font-semibold text-zinc-100", children: snapshot.value }),
      snapshot.note && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 mt-1", children: snapshot.note })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: onOpen,
        className: "shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] px-3 py-1 rounded-full bg-teal-500/20 text-teal-200 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/30",
        children: "Open Settings"
      }
    )
  ] });
}
function SettingsProposalCard({
  proposal,
  state,
  onApply,
  onCancel,
  onOpenSettings
}) {
  const locked = state !== "pending";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-edge bg-surface-1 px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2", children: proposal.descriptor.label }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-[13px] text-zinc-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded bg-surface-2 text-zinc-300 text-[12px]", children: proposal.currentValueDisplay }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: "→" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded bg-teal-500/15 text-teal-100 text-[12px] font-semibold ring-1 ring-inset ring-teal-500/40", children: proposal.proposedValueDisplay })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center gap-2", children: [
      state === "pending" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onApply,
            className: "px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em] bg-teal-500/25 text-teal-100 ring-1 ring-inset ring-teal-500/50 hover:bg-teal-500/35",
            children: "Apply"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onCancel,
            className: "px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.16em] bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge hover:bg-surface-3",
            children: "Cancel"
          }
        )
      ] }),
      state === "applied" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] uppercase tracking-[0.16em] text-teal-300", children: "Applied" }),
      state === "cancelled" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] uppercase tracking-[0.16em] text-zinc-500", children: "Cancelled" }),
      state === "failed" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] uppercase tracking-[0.16em] text-rose-300", children: "Apply failed — try in Settings" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onOpenSettings,
          className: "text-[11px] uppercase tracking-[0.16em] text-zinc-400 hover:text-zinc-200",
          disabled: locked && state !== "failed",
          children: locked && state !== "failed" ? "" : "Open Settings"
        }
      )
    ] })
  ] });
}
function SettingsRejectionCard({
  rejection,
  onOpenSettings
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-amber-300/80 mb-1", children: rejection.descriptor.label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-zinc-200", children: rejection.reason }),
    rejection.allowedValues.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: rejection.allowedValues.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: "px-2 py-0.5 rounded bg-surface-2 text-zinc-300 text-[11px]",
        children: v
      },
      v
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: onOpenSettings,
        className: "text-[11px] uppercase tracking-[0.16em] text-teal-300 hover:text-teal-200",
        children: "Open Settings"
      }
    ) })
  ] });
}
function ProbeBadge({ status }) {
  if (status === "verifying") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-zinc-500", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1 w-1 rounded-full bg-teal-400 animate-pulse" }),
      "verifying"
    ] });
  }
  if (status === "verified") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-emerald-300", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1 w-1 rounded-full bg-emerald-400" }),
      "live"
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-red-300/80", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1 w-1 rounded-full bg-red-400" }),
    "unreachable"
  ] });
}
function CandidateCard({
  card,
  categories,
  onChange,
  onAdd,
  onOpenURL
}) {
  const dimmed = card.probeStatus === "dead";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `rounded-lg border px-4 py-3 ${dimmed ? "border-edge/60 bg-surface-1/60 opacity-80" : "border-edge bg-surface-1"}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] font-semibold text-zinc-100 truncate", children: card.resolvedTitle || card.title }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(ProbeBadge, { status: card.probeStatus }),
              card.alreadySubscribed && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.18em] text-zinc-500", children: "already subscribed" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => onOpenURL(
                  card.homepageURL ?? card.url,
                  card.resolvedTitle || card.title,
                  card.description ?? null
                ),
                className: "text-[11px] text-zinc-500 hover:text-zinc-300 truncate block max-w-full text-left",
                children: card.url
              }
            ),
            card.reason && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1.5 text-[12px] text-zinc-400", children: card.reason }),
            card.description && card.probeStatus === "verified" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[11px] text-zinc-500 line-clamp-2", children: card.description }),
            card.probeStatus === "dead" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[11px] text-red-400/80", children: card.probeError || "Feed appears unreachable." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shrink-0 flex flex-col items-end gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  value: card.chosenCategory,
                  onChange: (e) => onChange({ chosenCategory: e.target.value }),
                  list: "hyper-category-suggestions",
                  className: "w-[140px] text-[11px] bg-surface-2 rounded px-2 py-1 text-zinc-200 outline-none ring-1 ring-inset ring-edge",
                  placeholder: "Category",
                  disabled: card.added
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "select",
                {
                  value: card.chosenDomain,
                  onChange: (e) => onChange({ chosenDomain: e.target.value }),
                  className: "text-[10px] bg-surface-2 rounded px-1.5 py-1 text-zinc-300 ring-1 ring-inset ring-edge",
                  disabled: card.added,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "finance", children: "Finance" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "general", children: "News" })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: onAdd,
                disabled: card.added || card.adding,
                className: `text-[11px] font-semibold uppercase tracking-[0.16em] px-3 py-1 rounded-full ${card.added ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30" : dimmed ? "bg-surface-2 text-zinc-400 ring-1 ring-inset ring-edge hover:bg-surface-2/80" : "bg-teal-500/20 text-teal-200 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/30 disabled:opacity-50"}`,
                title: dimmed ? "Add anyway — feed may come back online" : "Add feed",
                children: card.added ? "Added" : card.adding ? "Adding…" : dimmed ? "Add anyway" : "Add"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("datalist", { id: "hyper-category-suggestions", children: categories.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: c.name }, c.id)) })
      ]
    }
  );
}
function Reels({
  onClose,
  onOpenArticle
}) {
  const [reels, setReels] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [activeIdx, setActiveIdx] = reactExports.useState(0);
  const [filter, setFilter] = reactExports.useState("all");
  const [muted, setMuted] = reactExports.useState(false);
  const [kokoro, setKokoro] = reactExports.useState({ state: "idle" });
  const [piper, setPiper] = reactExports.useState({ state: "idle" });
  const [video, setVideo] = reactExports.useState({ state: "idle" });
  const [refilling, setRefilling] = reactExports.useState(false);
  const reload = reactExports.useCallback(async () => {
    const data = await window.api.reels.list(50);
    setReels(data);
    setLoading(false);
  }, []);
  const refill = reactExports.useCallback(async () => {
    if (refilling) return;
    setRefilling(true);
    try {
      await window.api.reels.generate();
    } finally {
      setRefilling(false);
    }
  }, [refilling]);
  reactExports.useEffect(() => {
    void reload();
    const unsub = window.api.reels.onUpdated(() => void reload());
    return unsub;
  }, [reload]);
  reactExports.useEffect(() => {
    void window.api.reels.getKokoroStatus().then(setKokoro);
    void window.api.reels.getPiperStatus().then(setPiper);
    void window.api.reels.getVideoGenStatus().then(setVideo);
    const unKokoro = window.api.reels.onKokoroStatus(setKokoro);
    const unPiper = window.api.reels.onPiperStatus(setPiper);
    const unVideo = window.api.reels.onVideoGenStatus(setVideo);
    return () => {
      unKokoro();
      unPiper();
      unVideo();
    };
  }, []);
  const filtered = reactExports.useMemo(() => {
    if (filter === "all") return reels;
    if (filter === "finance") return reels.filter((r) => r.domain === "finance");
    if (filter === "news") return reels.filter((r) => r.domain === "general");
    return reels.filter((r) => {
      const body = `${r.articleTitle} ${r.script}`.toLowerCase();
      return /breaking|urgent|alert|emergency/.test(body);
    });
  }, [reels, filter]);
  reactExports.useEffect(() => {
    setActiveIdx(0);
  }, [filter]);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown" || e.key === "j") {
        setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "m" || e.key === "M") {
        setMuted((m) => !m);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, filtered.length]);
  const remove = async (id) => {
    await window.api.reels.delete(id);
    setActiveIdx((i) => Math.max(0, Math.min(i, filtered.length - 2)));
    await reload();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "h-full bg-black flex flex-col min-h-0 relative", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "absolute top-0 left-0 right-0 z-30 px-6 pt-5 pb-3 flex items-center gap-4 bg-gradient-to-b from-black/85 to-transparent", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "svg",
          {
            viewBox: "0 0 24 24",
            "aria-hidden": true,
            className: "w-5 h-5 text-yellow-300 shrink-0",
            fill: "currentColor",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M13 2 4 14h6l-1 8 9-12h-6l1-8z" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-yellow-300/90", children: "News flash" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[22px] leading-none font-bold text-zinc-50 tracking-tight", children: "Flash" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(FilterTabs, { value: filter, onChange: setFilter }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-2 text-[11px] shrink-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setMuted((m) => !m),
            className: "h-7 w-7 grid place-items-center rounded-full border border-edge/80 bg-black/60 text-zinc-300 hover:text-white transition-colors",
            "aria-label": muted ? "Unmute" : "Mute",
            title: muted ? "Unmute (M)" : "Mute (M)",
            children: muted ? "🔇" : "🔊"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(StatusPill, { label: "Voice", status: voiceLabel(kokoro, piper), tone: voiceTone(kokoro, piper) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(StatusPill, { label: "Video", status: videoLabel(video), tone: videoTone(video) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => void refill(),
            disabled: refilling,
            title: "Generate flashes for any recent top articles without one",
            className: "px-3 py-1.5 rounded-full border border-yellow-300/30 bg-yellow-300/10 text-yellow-200 hover:bg-yellow-300/20 transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-wait",
            children: refilling ? "Refilling…" : "Refill"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onClose,
            className: "px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 transition-colors uppercase tracking-wider",
            children: "Close"
          }
        )
      ] })
    ] }),
    loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 grid place-items-center text-zinc-500 text-[12px]", children: "Loading…" }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      EmptyState,
      {
        kokoro,
        piper,
        video,
        filterEmpty: reels.length > 0 && filtered.length === 0 ? filter : null
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      ReelStack,
      {
        reels: filtered,
        activeIdx,
        onActiveChange: setActiveIdx,
        onDelete: remove,
        onOpenArticle,
        muted
      }
    )
  ] });
}
function FilterTabs({
  value,
  onChange
}) {
  const tabs = [
    { id: "all", label: "All" },
    { id: "finance", label: "Finance" },
    { id: "news", label: "News" },
    { id: "urgent", label: "Urgent" }
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-0.5 p-0.5 rounded-full border border-white/10 bg-black/70 backdrop-blur-sm text-[10px] uppercase tracking-[0.18em]", children: tabs.map((tab) => {
    const active = tab.id === value;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => onChange(tab.id),
        className: `px-2.5 py-1 rounded-full transition-colors ${active ? "bg-yellow-300/20 text-yellow-100 ring-1 ring-inset ring-yellow-300/30" : "text-zinc-400 hover:text-zinc-100"}`,
        children: tab.label
      },
      tab.id
    );
  }) });
}
function StatusPill({
  label,
  status,
  tone
}) {
  const dot = {
    ready: "bg-emerald-400",
    working: "bg-amber-400 animate-pulse",
    idle: "bg-zinc-500",
    error: "bg-rose-500"
  }[tone];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-edge/80 bg-black/40 text-[10px] uppercase tracking-[0.18em] text-zinc-400", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `h-1.5 w-1.5 rounded-full ${dot}` }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300", children: status })
  ] });
}
function voiceLabel(k, p) {
  if (k.state === "ready") return "kokoro";
  if (k.state === "installing-deps") return "kokoro install";
  if (k.state === "loading-model") return "kokoro load";
  if (k.state === "creating-venv") return "kokoro venv";
  if (k.state === "checking-python" || k.state === "starting-worker") return "kokoro setup";
  if (p.state === "ready") return "piper";
  if (p.state === "downloading") return `piper ${p.pct}%`;
  if (p.state === "extracting" || p.state === "checking") return "piper setup";
  return "say";
}
function voiceTone(k, p) {
  if (k.state === "ready") return "ready";
  if (k.state === "installing-deps" || k.state === "loading-model" || k.state === "creating-venv" || k.state === "checking-python" || k.state === "starting-worker")
    return "working";
  if (p.state === "ready") return "ready";
  if (p.state === "downloading" || p.state === "extracting" || p.state === "checking")
    return "working";
  if ((k.state === "failed" || k.state === "unsupported") && (p.state === "failed" || p.state === "unsupported"))
    return "error";
  return "idle";
}
function videoLabel(s) {
  switch (s.state) {
    case "idle":
      return "waiting";
    case "checking-python":
      return "python…";
    case "creating-venv":
      return "venv…";
    case "installing-deps":
      return "installing";
    case "downloading-model":
      return s.pct != null ? `model ${s.pct}%` : "model…";
    case "starting-worker":
      return "starting";
    case "loading-model":
      return "loading";
    case "ready":
      return "ready";
    case "failed":
      return "offline";
    case "unsupported":
      return "n/a";
  }
}
function videoTone(s) {
  if (s.state === "ready") return "ready";
  if (s.state === "failed" || s.state === "unsupported") return "error";
  if (s.state === "idle") return "idle";
  return "working";
}
function EmptyState({
  kokoro,
  piper,
  video,
  filterEmpty
}) {
  if (filterEmpty) {
    const label = filterEmpty === "urgent" ? "urgent" : filterEmpty;
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 grid place-items-center px-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-sm text-center space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[32px]", children: "∅" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-[16px] font-semibold text-zinc-100", children: [
        "No ",
        label,
        " flashes"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-500 leading-relaxed", children: "Nothing matches this filter right now. Switch to All, or check back after the next feed poll." })
    ] }) });
  }
  const setupWorking = kokoro.state !== "ready" && kokoro.state !== "failed" && kokoro.state !== "unsupported" && kokoro.state !== "idle";
  const videoWorking = video.state !== "ready" && video.state !== "failed" && video.state !== "unsupported";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 grid place-items-center px-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-sm text-center space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[40px]", children: "◉" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[18px] font-semibold text-zinc-100", children: "Preparing flashes" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[13px] text-zinc-400 leading-relaxed", children: "Pulse generates short AI-narrated flashes from your highest-urgency articles. Setup runs in the background the first time — new flashes appear here as soon as the next poll cycle finds fresh stories." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] text-zinc-500 leading-relaxed space-y-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        "Voice engine: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300", children: voiceLabel(kokoro, piper) }),
        setupWorking ? " (installing once)" : ""
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        "Video engine: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300", children: videoLabel(video) }),
        videoWorking ? " (installing once)" : ""
      ] })
    ] })
  ] }) });
}
function ReelStack({
  reels,
  activeIdx,
  onActiveChange,
  onDelete,
  onOpenArticle,
  muted
}) {
  const lockRef = reactExports.useRef(false);
  const accumRef = reactExports.useRef(0);
  const advance = reactExports.useCallback(
    (delta) => {
      if (lockRef.current) return;
      const next = Math.max(0, Math.min(reels.length - 1, activeIdx + delta));
      if (next === activeIdx) return;
      lockRef.current = true;
      accumRef.current = 0;
      onActiveChange(next);
      setTimeout(() => {
        lockRef.current = false;
      }, 620);
    },
    [activeIdx, reels.length, onActiveChange]
  );
  const onWheel = (e) => {
    if (lockRef.current) {
      accumRef.current = 0;
      return;
    }
    accumRef.current += e.deltaY;
    const THRESHOLD = 60;
    if (accumRef.current > THRESHOLD) advance(1);
    else if (accumRef.current < -THRESHOLD) advance(-1);
  };
  const touchStartRef = reactExports.useRef(null);
  const onTouchStart = (e) => {
    touchStartRef.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientY ?? start;
    const dy = start - end;
    if (Math.abs(dy) < 40) return;
    advance(dy > 0 ? 1 : -1);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      onWheel,
      onTouchStart,
      onTouchEnd,
      className: "flex-1 min-h-0 relative overflow-hidden",
      style: { isolation: "isolate" },
      children: [
        reels.map((reel, i) => {
          const offset = i - activeIdx;
          if (Math.abs(offset) > 1) return null;
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "absolute inset-0 transition-transform duration-[600ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]",
              style: {
                transform: `translateY(${offset * 100}%)`,
                zIndex: 100 - Math.abs(offset)
              },
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                ReelPanel,
                {
                  reel,
                  active: i === activeIdx,
                  total: reels.length,
                  index: i,
                  muted,
                  onNext: () => advance(1),
                  onDelete: () => onDelete(reel.id),
                  onOpenArticle: () => onOpenArticle(reel.articleId)
                }
              )
            },
            reel.id
          );
        }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(StackDots, { total: reels.length, activeIdx, onSelect: onActiveChange })
      ]
    }
  );
}
function StackDots({
  total,
  activeIdx,
  onSelect
}) {
  if (total <= 1) return null;
  const maxVisible = 8;
  const indices = total <= maxVisible ? Array.from({ length: total }, (_, i) => i) : (() => {
    const half = Math.floor(maxVisible / 2);
    const start = Math.max(0, Math.min(total - maxVisible, activeIdx - half));
    return Array.from({ length: maxVisible }, (_, i) => start + i);
  })();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5", children: indices.map((i) => {
    const active = i === activeIdx;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => onSelect(i),
        className: `rounded-full transition-all ${active ? "h-4 w-1.5 bg-white/90" : "h-1.5 w-1.5 bg-white/30 hover:bg-white/60"}`,
        "aria-label": `Flash ${i + 1}`
      },
      i
    );
  }) });
}
function ReelPanel({
  reel,
  active,
  total,
  index,
  muted,
  onNext,
  onDelete,
  onOpenArticle
}) {
  const audioRef = reactExports.useRef(null);
  const [playing, setPlaying] = reactExports.useState(false);
  const [progress, setProgress] = reactExports.useState(0);
  const [duration, setDuration] = reactExports.useState(0);
  const [beatIdx, setBeatIdx] = reactExports.useState(0);
  const [audioError, setAudioError] = reactExports.useState(null);
  const healAttemptedRef = reactExports.useRef(false);
  const audioSrc = reactExports.useMemo(
    () => `reel://audio/${encodeURIComponent(reel.audioFile)}`,
    [reel.audioFile]
  );
  reactExports.useEffect(() => {
    healAttemptedRef.current = false;
  }, [reel.audioFile]);
  reactExports.useEffect(() => {
    const el = audioRef.current;
    if (el) el.muted = muted;
  }, [muted]);
  reactExports.useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (active) {
      el.load();
      el.currentTime = 0;
      setProgress(0);
      setBeatIdx(0);
      setAudioError(null);
      void el.play().then(() => setPlaying(true)).catch((err) => {
        setPlaying(false);
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAudioError(err instanceof Error ? err.message : "Tap to play");
      });
    } else {
      el.pause();
      setPlaying(false);
    }
  }, [active, reel.audioFile]);
  reactExports.useEffect(() => {
    if (!active) return;
    const el = audioRef.current;
    if (!el) return;
    let raf = 0;
    let last = 0;
    const tick = () => {
      if (!el.paused && !el.ended) {
        const now = performance.now();
        if (now - last >= 80) {
          last = now;
          setProgress(el.currentTime);
          const dur = el.duration || duration;
          if (reel.beats.length > 0 && dur > 0) {
            const ratio = Math.min(0.999, el.currentTime / dur);
            const idx = Math.floor(ratio * reel.beats.length);
            setBeatIdx((prev) => prev === idx ? prev : idx);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, duration, reel.beats.length]);
  reactExports.useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      onNext();
    };
    const onErr = () => {
      const code = el.error?.code;
      const map = {
        1: "Aborted",
        2: "Network error loading audio",
        3: "Decoding error",
        4: "Audio source not supported or not found"
      };
      setAudioError(map[code ?? 0] ?? "Audio unavailable");
      setPlaying(false);
      if ((code === 3 || code === 4) && !healAttemptedRef.current) {
        healAttemptedRef.current = true;
        setAudioError("Repairing audio…");
        void window.api.reels.rebuildOne(reel.id).then((ok) => {
          if (!ok) setAudioError("Audio unavailable — retry later");
        });
      }
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onErr);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onErr);
    };
  }, [reel.id, onNext]);
  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      setAudioError(null);
      void el.play().then(() => setPlaying(true)).catch((err) => {
        setAudioError(err instanceof Error ? err.message : "Playback failed");
      });
    } else {
      el.pause();
      setPlaying(false);
    }
  };
  const cleanBeats = reactExports.useMemo(() => cleanBeatList(reel.beats, reel.articleTitle), [
    reel.beats,
    reel.articleTitle
  ]);
  const numBeats = Math.max(1, cleanBeats.length);
  const activeBeat = cleanBeats.length > 0 ? cleanBeats[Math.min(cleanBeats.length - 1, beatIdx)] : reel.articleTitle;
  const pct = duration > 0 ? progress / duration * 100 : 0;
  const accent = reel.domain === "finance" ? "#f59e0b" : "#60a5fa";
  const accentSecondary = reel.domain === "finance" ? "#ef4444" : "#a78bfa";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "absolute inset-0 overflow-hidden bg-black",
      style: { contain: "paint" },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          SceneStack,
          {
            imageURL: reel.articleImageURL,
            keyframes: reel.keyframes,
            videoClips: reel.videoClips,
            active,
            beatIdx,
            totalBeats: numBeats,
            accent,
            accentSecondary
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 pointer-events-none scanlines-overlay opacity-[0.08]" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-black/60 pointer-events-none" }),
        active && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 grain-overlay pointer-events-none" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-20 left-6 z-20 flex items-center gap-2 pointer-events-none", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative flex h-2 w-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "relative inline-flex rounded-full h-2 w-2 bg-rose-500" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold tracking-[0.32em] uppercase text-white/90", children: "Live briefing" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-32 left-6 z-20 pointer-events-none flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-[0.2em] text-white",
              style: { background: accent },
              children: reel.domain === "finance" ? "Markets" : "World"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-[0.22em] text-white/75", children: reel.feedTitle })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute top-3 right-6 left-6 flex gap-1.5 z-20 pointer-events-none", children: Array.from({ length: numBeats }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "h-[3px] flex-1 rounded-full bg-white/15 overflow-hidden",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "h-full bg-white/85 transition-[width] duration-150 ease-linear",
                style: {
                  width: i < beatIdx ? "100%" : i === beatIdx ? `${Math.max(0, Math.min(100, (pct / 100 * numBeats - i) * 100))}%` : "0%"
                }
              }
            )
          },
          i
        )) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: togglePlay,
            className: "absolute inset-0 z-10 cursor-pointer focus:outline-none",
            "aria-label": playing ? "Pause" : "Play",
            children: !playing && active && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center h-16 w-16 rounded-full bg-white/20 backdrop-blur text-white text-[26px]", children: "▶" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute left-6 right-6 bottom-32 z-20 pointer-events-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "text-[28px] md:text-[34px] leading-[1.08] font-extrabold text-white tracking-tight animate-beat",
            style: { textShadow: "0 2px 18px rgba(0,0,0,0.65)" },
            children: activeBeat
          },
          `${reel.id}-${beatIdx}`
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute left-0 right-0 bottom-16 z-20 pointer-events-none overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative border-y border-white/10 bg-black/60 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 py-1.5 pl-6 pr-6 text-[11px] text-white/80 whitespace-nowrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "px-2 py-px rounded-sm font-bold uppercase tracking-wider text-white text-[10px]",
              style: { background: accent },
              children: reel.domain === "finance" ? "Markets" : "World"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold truncate", children: reel.articleTitle })
        ] }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute left-6 right-6 bottom-5 z-20 flex items-end justify-between gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-w-0 flex-1 space-y-0.5 pointer-events-none", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/70", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: "h-1.5 w-1.5 rounded-full",
                style: { background: accent }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: reel.feedTitle }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "opacity-50", children: "·" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: relTime(reel.publishedAt) })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: onOpenArticle,
                className: "px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] tracking-wide",
                children: "Read source"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: onDelete,
                className: "px-3 py-1.5 rounded-full text-white/60 hover:text-white/90 text-[11px]",
                children: "Dismiss"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-20 right-6 z-20 text-[10px] uppercase tracking-[0.2em] text-white/50 tabular-nums pointer-events-none", children: [
          index + 1,
          " / ",
          total
        ] }),
        audioError && active && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute bottom-44 left-6 right-6 z-30 text-center text-[11px] text-rose-300/90 bg-rose-950/60 border border-rose-500/30 rounded-md px-3 py-1.5", children: audioError }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("audio", { ref: audioRef, src: audioSrc, preload: "auto" })
      ]
    }
  );
}
function SceneStack({
  imageURL,
  keyframes,
  videoClips,
  active,
  beatIdx,
  totalBeats,
  accent,
  accentSecondary
}) {
  const scenes = reactExports.useMemo(
    () => Array.from({ length: totalBeats }, (_, i) => pickSceneVariant(i)),
    [totalBeats]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0", children: scenes.map((variant, i) => {
    const clip = videoClips[i];
    const keyframe = keyframes[i];
    const videoSrc = clip ? `reel://image/${encodeURIComponent(clip)}` : null;
    const sceneImage = keyframe ? `reel://image/${encodeURIComponent(keyframe)}` : imageURL;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "absolute inset-0 transition-opacity duration-700 ease-out",
        style: { opacity: i === beatIdx ? 1 : 0 },
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          Scene,
          {
            variant,
            imageURL: sceneImage,
            videoURL: videoSrc,
            active: active && i === beatIdx,
            accent,
            accentSecondary
          }
        )
      },
      i
    );
  }) });
}
function pickSceneVariant(beatIdx) {
  const rotation = [
    "establish",
    "push-in",
    "pan-right",
    "rack-focus",
    "crop-detail",
    "split-tone"
  ];
  return rotation[beatIdx % rotation.length];
}
function Scene({
  variant,
  imageURL,
  videoURL,
  active,
  accent,
  accentSecondary
}) {
  const classes = active ? variantClasses[variant] : variantClasses[variant].replace(/animate-[\w-]+/g, "");
  const filter = variantFilters[variant];
  const bgImage = imageURL ? `url("${imageURL.replace(/"/g, '\\"')}")` : void 0;
  const videoRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoURL) return;
    if (active) {
      v.currentTime = 0;
      void v.play().catch(() => void 0);
    } else {
      v.pause();
    }
  }, [active, videoURL]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute inset-0 overflow-hidden", children: [
    videoURL ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "video",
      {
        ref: videoRef,
        src: videoURL,
        className: `absolute inset-0 w-full h-full object-cover ${classes}`,
        style: { filter },
        muted: true,
        playsInline: true,
        loop: true,
        preload: "auto"
      }
    ) : imageURL ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: `absolute inset-0 bg-cover bg-center ${classes}`,
        style: { backgroundImage: bgImage, filter }
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: `absolute inset-0 ${classes}`,
        style: {
          background: `radial-gradient(ellipse at 30% 20%, ${accent}88, transparent 55%), radial-gradient(ellipse at 70% 80%, ${accentSecondary}55, transparent 55%), #0a0b0d`,
          filter
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "absolute inset-0 mix-blend-overlay opacity-50 pointer-events-none",
        style: {
          background: `linear-gradient(${variantGradientAngle[variant]}deg, ${accent}33 0%, transparent 35%, transparent 65%, ${accentSecondary}33 100%)`
        }
      }
    ),
    variant === "crop-detail" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 pointer-events-none vignette-heavy" })
  ] });
}
const variantClasses = {
  establish: "animate-scene-establish",
  "push-in": "animate-scene-push",
  "pan-right": "animate-scene-pan",
  "rack-focus": "animate-scene-rack",
  "crop-detail": "animate-scene-crop",
  "split-tone": "animate-scene-split"
};
const variantFilters = {
  establish: "saturate(1.05) contrast(1.05) brightness(0.9)",
  "push-in": "saturate(1.15) contrast(1.08)",
  "pan-right": "saturate(1.1) contrast(1.02) hue-rotate(-4deg)",
  "rack-focus": "saturate(0.95) contrast(1.1) brightness(0.85)",
  "crop-detail": "saturate(1.2) contrast(1.15) brightness(0.95)",
  "split-tone": "saturate(1.3) contrast(1.1) hue-rotate(6deg)"
};
const variantGradientAngle = {
  establish: 135,
  "push-in": 180,
  "pan-right": 90,
  "rack-focus": 45,
  "crop-detail": 160,
  "split-tone": 210
};
function relTime(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 6e4);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}
const ABBREVS = /* @__PURE__ */ new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "sr",
  "jr",
  "inc",
  "corp",
  "co",
  "ltd",
  "llc",
  "sen",
  "rep",
  "gov",
  "gen",
  "lt",
  "col",
  "capt",
  "sgt",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "no",
  "pp",
  "u.s",
  "u.k"
]);
function endsWithFragment(s) {
  const trimmed = s.trim();
  if (!trimmed.endsWith(".")) return false;
  const tokens = trimmed.split(/\s+/);
  const last = tokens[tokens.length - 1].replace(/[.,;:]+$/, "").toLowerCase();
  if (last.length === 1) return true;
  if (ABBREVS.has(last)) return true;
  return false;
}
function truncateAtWord(s, maxChars) {
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace < maxChars * 0.6) return cut.replace(/[,;:—-]\s*$/, "") + "…";
  return cut.slice(0, lastSpace).replace(/[,;:—-]\s*$/, "") + "…";
}
const PROMO_RE = /[^.!?]*\b(?:subscribe|subscription|subscriber[- ]only|become a (?:member|subscriber)|sign up (?:for|to)|sign (?:in|up) to|create (?:an|a free) account|log in to (?:read|continue)|unlimited (?:access|digital)|continue reading|read (?:the full|more) (?:story|article) (?:at|on|in|with|here)|this (?:article|story|content|blog) is (?:for|available to|exclusive to|reserved for|now closed)|enjoy(?:ing)? (?:this|our) (?:article|coverage|story|newsletter)|get (?:our|the|unlimited) (?:newsletter|digital|daily|weekly|breaking news (?:email|app))|join (?:our|the) (?:newsletter|mailing list)|follow us on|download (?:our|the) app|support (?:our|independent|quality) journalism|donate (?:today|now)|paywall|free (?:trial|app)|limited[- ]time offer|already a (?:subscriber|member)|this blog is now closed)\b[^.!?]*[.!?]?/gi;
function scrubBeatPromo(text) {
  if (!text) return "";
  return text.replace(PROMO_RE, " ").replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
}
function polishBeat(raw) {
  let t = scrubBeatPromo(raw).replace(/\s+/g, " ").replace(/^[\s,;:—-]+/, "").replace(/[\s,;:—-]+$/, "").trim();
  if (t.length > 0 && /[a-z]/.test(t[0])) {
    t = t[0].toUpperCase() + t.slice(1);
  }
  return t;
}
function cleanBeatList(beats, fallbackTitle) {
  const cleanFallback = scrubBeatPromo(fallbackTitle) || fallbackTitle;
  if (!beats || beats.length === 0) return [cleanFallback];
  const merged = [];
  for (let i = 0; i < beats.length; i++) {
    const current = beats[i];
    if (merged.length > 0 && endsWithFragment(merged[merged.length - 1])) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${current}`.trim();
    } else {
      merged.push(current);
    }
  }
  const polished = merged.map((b) => polishBeat(b)).filter((b) => b.length > 0).map((b) => truncateAtWord(b, 72));
  const anyOk = polished.some((b) => b.length >= 10 && !endsWithFragment(b));
  if (!anyOk) return [cleanFallback];
  return polished;
}
const STORAGE_PREFIX = "pulse:collapsed:";
const LEGACY_KEYS = {
  calendar: "pulse:calendarCollapsed"
};
function readInitial(key, fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === "true") return true;
    if (raw === "false") return false;
    const legacyKey = LEGACY_KEYS[key];
    if (legacyKey) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy === "true" || legacy === "false") {
        try {
          localStorage.setItem(STORAGE_PREFIX + key, legacy);
          localStorage.removeItem(legacyKey);
        } catch {
        }
        return legacy === "true";
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}
function useCollapsedSection(key, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = reactExports.useState(
    () => readInitial(key, defaultCollapsed)
  );
  reactExports.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, collapsed ? "true" : "false");
    } catch {
    }
  }, [key, collapsed]);
  const toggle = reactExports.useCallback(
    (next) => {
      setCollapsed((prev) => typeof next === "function" ? next(prev) : next);
    },
    []
  );
  return [collapsed, toggle];
}
function CollapseChevron({
  open,
  className = ""
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "svg",
    {
      className: `w-3 h-3 transition-transform ${open ? "rotate-180" : ""} ${className}`,
      viewBox: "0 0 12 12",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 4.5l3 3 3-3" })
    }
  );
}
const FINANCE_KINDS = /* @__PURE__ */ new Set([
  "earnings",
  "dividend",
  "ipo",
  "stockSplit",
  "fedMeeting",
  "econRelease"
]);
const NEWS_KINDS = /* @__PURE__ */ new Set([
  "launch",
  "fedMeeting",
  "econRelease",
  "ipo",
  "worldEvent"
]);
function CalendarStrip({
  filter,
  onOpenStock,
  onOpenGame,
  onOpenURL,
  onOpenIpoBrief
}) {
  const [data, setData] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [collapsed, setCollapsed] = useCollapsedSection("calendar", true);
  reactExports.useEffect(() => {
    let alive = true;
    void window.api.calendar.get().then((res) => {
      if (!alive) return;
      setData(res);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  const filteredEvents = reactExports.useMemo(() => {
    if (!data) return [];
    if (filter === "finance") return data.events.filter((e) => FINANCE_KINDS.has(e.kind));
    if (filter === "news") return data.events.filter((e) => NEWS_KINDS.has(e.kind));
    return data.events;
  }, [data, filter]);
  const groups = reactExports.useMemo(() => groupByDay(filteredEvents), [filteredEvents]);
  if (loading) return null;
  if (!data || filteredEvents.length === 0) return null;
  const now = Date.now();
  const rangeLabel = formatRangeLabel(data.from, data.to, now);
  const label = filter === "finance" ? "Market Calendar" : filter === "news" ? "News Calendar" : "On the Radar";
  const total = filteredEvents.length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-edge/60 bg-surface-1/40 px-6 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setCollapsed((c) => !c),
        "aria-expanded": !collapsed,
        className: "w-full flex items-center gap-3 text-left group",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 group-hover:text-zinc-200 transition-colors", children: label }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] tabular-nums text-zinc-500", children: [
            total,
            " ",
            total === 1 ? "item" : "items"
          ] }),
          collapsed ? /* @__PURE__ */ jsxRuntimeExports.jsx(SummaryStrip, { groups, onOpenDay: () => setCollapsed(false) }) : (
            // Divider only renders in the expanded state. When collapsed,
            // SummaryStrip already fills the row — keeping the divider here
            // would force the pills to share flex space with it, clipping
            // the trailing days behind the range label.
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/60 mx-1" })
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] tabular-nums text-zinc-500 shrink-0", children: rangeLabel }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CollapseChevron, { open: !collapsed, className: "text-zinc-500" })
        ]
      }
    ),
    !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 pt-2", children: groups.map((group) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-shrink-0 flex flex-col gap-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-2 px-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: `text-[10px] font-semibold uppercase tracking-[0.18em] ${group.isPast ? "text-zinc-500" : "text-zinc-300"}`,
            children: group.weekday
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: group.monthDay })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1.5", children: group.events.map((ev) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        EventPill,
        {
          event: ev,
          onOpenStock,
          onOpenGame,
          onOpenURL,
          onOpenIpoBrief
        },
        ev.id
      )) })
    ] }, group.key)) })
  ] });
}
function SummaryStrip({
  groups,
  onOpenDay
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 overflow-x-auto flex-1 min-w-0 scrollbar-none", children: groups.slice(0, 8).map((group) => {
    const kindsInDay = Array.from(new Set(group.events.map((e) => e.kind))).slice(0, 4);
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "span",
      {
        onClick: (e) => {
          e.stopPropagation();
          onOpenDay();
        },
        className: `inline-flex items-center gap-2 flex-shrink-0 px-2.5 py-1.5 rounded-full border text-[11px] cursor-pointer transition-colors ${group.isPast ? "border-edge/40 bg-surface-2/40 hover:bg-surface-2/70 text-zinc-500" : "border-edge/60 bg-surface-2 hover:bg-surface-3 text-zinc-300"}`,
        title: `${group.weekday} ${group.monthDay} · ${group.events.length} ${group.events.length === 1 ? "event" : "events"}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold uppercase tracking-[0.14em]", children: group.dayTag }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center gap-1", children: kindsInDay.map((k) => /* @__PURE__ */ jsxRuntimeExports.jsx(MiniIcon, { kind: k }, k)) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums text-zinc-500", children: group.events.length })
        ]
      },
      group.key
    );
  }) });
}
function MiniIcon({ kind }) {
  const styles = KIND_STYLES[kind];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      className: `inline-flex items-center justify-center w-5 h-5 rounded-full ${styles.bg} ring-1 ring-inset ${styles.border}`,
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(KindIcon, { kind, className: `w-3 h-3 ${styles.icon}` })
    }
  );
}
const KIND_STYLES = {
  earnings: {
    border: "border-emerald-400/20",
    bg: "bg-emerald-500/5",
    hover: "hover:bg-emerald-500/10",
    icon: "text-emerald-300"
  },
  dividend: {
    border: "border-emerald-400/20",
    bg: "bg-emerald-500/5",
    hover: "hover:bg-emerald-500/10",
    icon: "text-emerald-300"
  },
  ipo: {
    border: "border-violet-400/20",
    bg: "bg-violet-500/5",
    hover: "hover:bg-violet-500/10",
    icon: "text-violet-300"
  },
  stockSplit: {
    border: "border-cyan-400/20",
    bg: "bg-cyan-500/5",
    hover: "hover:bg-cyan-500/10",
    icon: "text-cyan-300"
  },
  fedMeeting: {
    border: "border-amber-400/20",
    bg: "bg-amber-500/5",
    hover: "hover:bg-amber-500/10",
    icon: "text-amber-300"
  },
  econRelease: {
    border: "border-rose-400/20",
    bg: "bg-rose-500/5",
    hover: "hover:bg-rose-500/10",
    icon: "text-rose-300"
  },
  game: {
    border: "border-orange-400/20",
    bg: "bg-orange-500/5",
    hover: "hover:bg-orange-500/10",
    icon: "text-orange-300"
  },
  launch: {
    border: "border-sky-400/20",
    bg: "bg-sky-500/5",
    hover: "hover:bg-sky-500/10",
    icon: "text-sky-300"
  },
  worldEvent: {
    border: "border-slate-400/20",
    bg: "bg-slate-500/10",
    hover: "hover:bg-slate-500/20",
    icon: "text-slate-200"
  }
};
function isClickable(event) {
  if (event.kind === "earnings" || event.kind === "dividend" || event.kind === "stockSplit") {
    return !!event.meta.symbol;
  }
  if (event.kind === "game") return !!(event.meta.leagueId && event.meta.gameId);
  if (event.kind === "ipo") return !!(event.meta.symbol || event.subtitle);
  if (event.kind === "launch" || event.kind === "fedMeeting" || event.kind === "econRelease" || event.kind === "worldEvent") {
    return !!event.meta.url;
  }
  return false;
}
function EventPill({
  event,
  onOpenStock,
  onOpenGame,
  onOpenURL,
  onOpenIpoBrief
}) {
  const time = formatTime(event.date, event.kind);
  const clickable = isClickable(event);
  const handleClick = () => {
    if ((event.kind === "earnings" || event.kind === "dividend" || event.kind === "stockSplit") && event.meta.symbol) {
      onOpenStock(event.meta.symbol);
    } else if (event.kind === "game" && event.meta.leagueId && event.meta.gameId) {
      onOpenGame(event.meta.leagueId, event.meta.gameId);
    } else if (event.kind === "ipo") {
      onOpenIpoBrief(event.meta.symbol ?? "", event.subtitle ?? "");
    } else if (event.meta.url) {
      onOpenURL(event.meta.url, event.title, event.subtitle);
    }
  };
  const styles = KIND_STYLES[event.kind];
  const widthCls = event.kind === "worldEvent" ? "min-w-[220px] max-w-[320px]" : "min-w-[160px] max-w-[240px]";
  const base = `flex items-start gap-2 ${widthCls} rounded-md px-2.5 py-1.5 text-left transition-colors border`;
  const klass = `${base} ${styles.border} ${styles.bg} ${clickable ? styles.hover : ""}`;
  const content = /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-shrink-0 pt-[2px]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      KindIcon,
      {
        kind: event.kind,
        leagueId: event.meta.leagueId,
        className: `w-3.5 h-3.5 ${styles.icon}`
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: `text-[11px] font-semibold text-zinc-100 ${event.kind === "worldEvent" ? "line-clamp-2 leading-[1.25]" : "truncate"}`,
          children: [
            event.title,
            event.kind === "earnings" && event.meta.isEstimate && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-[9px] font-normal text-zinc-500 normal-case tracking-normal", children: "est." })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-[10px] text-zinc-400 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums whitespace-nowrap flex-shrink-0", children: time }),
        event.subtitle && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600 flex-shrink-0", children: "·" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: event.subtitle })
        ] })
      ] })
    ] })
  ] });
  if (clickable) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: handleClick, className: klass, children: content });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: klass, children: content });
}
function sportFor(leagueId) {
  if (!leagueId) return "basketball";
  if (leagueId === "nfl") return "football";
  if (leagueId === "mlb") return "baseball";
  if (leagueId === "nhl") return "hockey";
  if (leagueId === "nba") return "basketball";
  return "soccer";
}
function KindIcon({
  kind,
  leagueId,
  className
}) {
  const cls = `flex-shrink-0 ${className ?? `w-3.5 h-3.5 ${KIND_STYLES[kind].icon}`}`;
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  if (kind === "earnings") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 17l6-6 4 4 8-8", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M14 7h7v7", strokeLinecap: "round", strokeLinejoin: "round" })
    ] });
  }
  if (kind === "dividend") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 3v18", strokeLinecap: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "path",
        {
          d: "M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      )
    ] });
  }
  if (kind === "ipo") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 19V5", strokeLinecap: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M6 11l6-6 6 6", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "19", r: "1.5" })
    ] });
  }
  if (kind === "stockSplit") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 3v6", strokeLinecap: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 9l-5 6v6", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 9l5 6v6", strokeLinecap: "round", strokeLinejoin: "round" })
    ] });
  }
  if (kind === "fedMeeting") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 10l9-6 9 6", strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M5 10v8M9 10v8M15 10v8M19 10v8", strokeLinecap: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 20h18", strokeLinecap: "round" })
    ] });
  }
  if (kind === "econRelease") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: cls, ...common, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M4 20V10M10 20V4M16 20v-8M22 20H2", strokeLinecap: "round" }) });
  }
  if (kind === "worldEvent") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "9" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 12h18", strokeLinecap: "round" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "path",
        {
          d: "M12 3c3 3 4.5 6 4.5 9s-1.5 6-4.5 9c-3-3-4.5-6-4.5-9s1.5-6 4.5-9z",
          strokeLinecap: "round"
        }
      )
    ] });
  }
  if (kind === "game") {
    const sport = sportFor(leagueId);
    if (sport === "football") {
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("ellipse", { cx: "12", cy: "12", rx: "9", ry: "5", transform: "rotate(-24 12 12)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M10 12h4M11 10.5v3M13 10.5v3", strokeLinecap: "round" })
      ] });
    }
    if (sport === "baseball") {
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "9" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "path",
          {
            d: "M5.5 6C8 8.5 8 15.5 5.5 18M18.5 6C16 8.5 16 15.5 18.5 18",
            strokeLinecap: "round"
          }
        )
      ] });
    }
    if (sport === "hockey") {
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("ellipse", { cx: "12", cy: "13", rx: "9", ry: "3" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3 13v3M21 13v3", strokeLinecap: "round" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ellipse", { cx: "12", cy: "16", rx: "9", ry: "3" })
      ] });
    }
    if (sport === "soccer") {
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "9" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("polygon", { points: "12,8 15,10.4 13.9,14 10.1,14 9,10.4" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 3v5M21 12h-6M3 12h6M15 19.5L13.9 14M9 19.5l1.1-5.5", strokeLinecap: "round" })
      ] });
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "9" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M3.5 12h17M12 3.5v17M5.5 5.5c4.5 3 9 3 13 0M5.5 18.5c4.5-3 9-3 13 0" })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { className: cls, ...common, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        d: "M12 2c3 3 5 6.5 5 10v6l-3-2h-4l-3 2v-6c0-3.5 2-7 5-10z",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "10", r: "1.5" })
  ] });
}
function groupByDay(events) {
  const byKey = /* @__PURE__ */ new Map();
  const now = /* @__PURE__ */ new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${tomorrow.getMonth()}-${tomorrow.getDate()}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  for (const ev of events) {
    const d = new Date(ev.date);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byKey.has(key)) {
      const weekday = d.toLocaleDateString(void 0, { weekday: "short" }).toUpperCase();
      const dayTag = key === todayKey ? "TODAY" : key === tomorrowKey ? "TMRW" : key === yesterdayKey ? "YDAY" : weekday;
      byKey.set(key, {
        key,
        weekday,
        monthDay: d.toLocaleDateString(void 0, { month: "short", day: "numeric" }),
        dayTag,
        isPast: d.getTime() < now.getTime() && key !== todayKey,
        events: []
      });
    }
    byKey.get(key).events.push(ev);
  }
  return Array.from(byKey.values()).sort((a, b) => a.events[0].date - b.events[0].date);
}
function formatTime(unixMs, kind) {
  if (kind === "worldEvent") return "All day";
  const d = new Date(unixMs);
  if (d.getHours() === 0 && d.getMinutes() === 0) return "All day";
  return d.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
}
function formatRangeLabel(from, to, now) {
  const MS = 864e5;
  const pastDays = Math.max(0, Math.round((now - from) / MS));
  const nextDays = Math.max(1, Math.round((to - now) / MS));
  if (pastDays > 0) return `Past ${pastDays}d · Next ${nextDays}d`;
  return `Next ${nextDays} ${nextDays === 1 ? "day" : "days"}`;
}
function isPdfUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (/\.pdf$/i.test(u.pathname)) return true;
    if (/(^|\/)pdf\//i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}
function ExternalReader({
  url,
  title,
  subtitle,
  onClose,
  initialReader,
  onLinkClick
}) {
  const webviewRef = reactExports.useRef(null);
  const autoFellBackRef = reactExports.useRef(false);
  const [loading, setLoading] = reactExports.useState(true);
  const [mode, setMode] = reactExports.useState("reader");
  const [reader, setReader] = reactExports.useState(initialReader ?? null);
  const [readerLoading, setReaderLoading] = reactExports.useState(false);
  const hasURL = typeof url === "string" && url.length > 0;
  const isPdf = isPdfUrl(url);
  reactExports.useEffect(() => {
    setMode(isPdf ? "web" : "reader");
    setReader(initialReader ?? null);
    setReaderLoading(false);
    autoFellBackRef.current = false;
  }, [url, initialReader, isPdf]);
  reactExports.useEffect(() => {
    if (!hasURL) return;
    if (mode === "reader" && !reader && !readerLoading) {
      void (async () => {
        setReaderLoading(true);
        try {
          const result = await window.api.reader.extract(url);
          setReader(result);
          if (result.status === "error" && !autoFellBackRef.current) {
            autoFellBackRef.current = true;
            setMode("web");
          }
        } finally {
          setReaderLoading(false);
        }
      })();
    }
  }, [url, hasURL, mode, reader, readerLoading]);
  reactExports.useEffect(() => {
    if (mode !== "web") return;
    setLoading(true);
    const el = webviewRef.current;
    if (!el) return;
    const onStart = () => setLoading(true);
    const onStop = () => setLoading(false);
    el.addEventListener("did-start-loading", onStart);
    el.addEventListener("did-stop-loading", onStop);
    return () => {
      el.removeEventListener("did-start-loading", onStart);
      el.removeEventListener("did-stop-loading", onStop);
    };
  }, [url, mode]);
  const loadReader = reactExports.useCallback(async () => {
    if (!hasURL) return;
    setReaderLoading(true);
    try {
      const result = await window.api.reader.extract(url);
      setReader(result);
    } finally {
      setReaderLoading(false);
    }
  }, [url, hasURL]);
  const reload = () => {
    if (mode === "web") {
      const el = webviewRef.current;
      el?.reload?.();
    } else if (hasURL) {
      setReader(null);
      void loadReader();
    }
  };
  const toggleMode = () => {
    const next = mode === "web" ? "reader" : "web";
    setMode(next);
    if (next === "reader" && !reader && !readerLoading) void loadReader();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "h-12 shrink-0 flex items-center gap-3 px-4 border-b border-edge bg-surface-1/60 backdrop-blur", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onClose,
          className: "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-zinc-300 hover:text-zinc-50 hover:bg-surface-2 transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-base leading-none", children: "←" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "uppercase tracking-[0.18em]", children: "Back" })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-px h-5 bg-edge" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] uppercase tracking-[0.18em] text-zinc-300 truncate", children: title }),
        subtitle && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700 text-[10px]", children: "·" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 truncate", children: subtitle })
        ] }),
        (mode === "web" && loading || mode === "reader" && readerLoading) && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 ml-1", children: "loading…" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ml-auto flex items-center gap-1", children: hasURL && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        isPdf ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "h-7 px-2 flex items-center rounded text-[10px] uppercase tracking-[0.18em] bg-surface-2 text-zinc-300",
            title: "PDF document — rendered via the embedded viewer",
            children: "PDF"
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: toggleMode,
            title: "Toggle reader mode",
            className: `no-drag h-7 px-2 flex items-center justify-center rounded text-[10px] uppercase tracking-[0.18em] transition-colors ${mode === "reader" ? "bg-surface-2 text-zinc-100" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"}`,
            children: mode === "reader" ? "Web" : "Reader"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: reload,
            title: "Reload",
            "aria-label": "Reload",
            className: "no-drag h-7 w-7 flex items-center justify-center rounded text-sm text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 transition-colors",
            children: "↻"
          }
        )
      ] }) })
    ] }),
    mode === "web" && hasURL ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "webview",
      {
        ref: (el) => {
          webviewRef.current = el;
        },
        src: url,
        partition: "persist:webview",
        style: { display: "flex", width: "100%", height: "100%" }
      }
    ) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      ExternalReaderBody,
      {
        url,
        reader,
        onRetry: loadReader,
        canRetry: hasURL,
        onLinkClick
      }
    )
  ] });
}
function ExternalReaderBody({
  url,
  reader,
  onRetry,
  canRetry,
  onLinkClick
}) {
  if (!reader) {
    const msg = canRetry ? "Extracting readable content…" : "Assembling brief…";
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 flex items-center justify-center text-sm text-zinc-500", children: msg });
  }
  if (reader.status === "error") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 flex items-center justify-center text-center px-8", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs uppercase tracking-[0.25em] text-zinc-600 mb-3", children: "Reader unavailable" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-500 max-w-sm mb-4", children: reader.error ?? "Could not extract readable content from this page." }),
      canRetry && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onRetry,
          className: "text-[11px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100",
          children: "Retry"
        }
      )
    ] }) });
  }
  const host = (() => {
    if (!url) return "";
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 overflow-y-auto bg-surface-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "select-text max-w-[720px] mx-auto px-8 py-12", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: reader.siteName ?? host }) }),
    reader.title && /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[30px] font-bold text-zinc-50 leading-[1.2] tracking-tight mb-3", children: reader.title }),
    reader.byline && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-400 mb-8", children: reader.byline }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "reader-content text-[15.5px] leading-[1.75] text-zinc-200",
        onClick: (e) => {
          const anchor = e.target.closest("a");
          if (!anchor) return;
          const href = anchor.getAttribute("href") ?? "";
          if (!href.startsWith("http")) return;
          e.preventDefault();
          if (onLinkClick) {
            onLinkClick(href, anchor.textContent?.trim() || href);
          }
        },
        dangerouslySetInnerHTML: { __html: reader.contentHTML ?? "" }
      }
    )
  ] }) });
}
function FindBar({ webview, onClose }) {
  const [query, setQuery] = reactExports.useState("");
  const [matchInfo, setMatchInfo] = reactExports.useState({
    matches: 0,
    activeMatchOrdinal: 0
  });
  const inputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  reactExports.useEffect(() => {
    if (webview) return;
    return window.api.find.onResult((payload) => {
      if (payload.finalUpdate) {
        setMatchInfo({
          matches: payload.matches,
          activeMatchOrdinal: payload.activeMatchOrdinal
        });
      }
    });
  }, [webview]);
  reactExports.useEffect(() => {
    if (!webview) return;
    const onFoundInPage = (e) => {
      const detail = e.result;
      if (!detail) return;
      setMatchInfo({
        matches: detail.matches,
        activeMatchOrdinal: detail.activeMatchOrdinal
      });
    };
    webview.addEventListener("found-in-page", onFoundInPage);
    return () => {
      webview.removeEventListener("found-in-page", onFoundInPage);
    };
  }, [webview]);
  reactExports.useEffect(() => {
    return () => {
      if (webview) {
        const wv = webview;
        wv.stopFindInPage?.("clearSelection");
      } else {
        void window.api.find.stop();
      }
    };
  }, [webview]);
  const runSearch = (text, opts) => {
    const forward = opts?.forward ?? true;
    const findNext = opts?.findNext ?? false;
    if (!text.trim()) {
      setMatchInfo({ matches: 0, activeMatchOrdinal: 0 });
      if (webview) {
        const wv = webview;
        wv.stopFindInPage?.("clearSelection");
      } else {
        void window.api.find.stop();
      }
      return;
    }
    if (webview) {
      const wv = webview;
      wv.findInPage?.(text, { forward, findNext });
    } else {
      void window.api.find.start(text, { forward, findNext });
    }
  };
  reactExports.useEffect(() => {
    runSearch(query, { forward: true, findNext: false });
  }, [query, webview]);
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch(query, { forward: !e.shiftKey, findNext: true });
    }
  };
  const counter = query.trim().length === 0 ? "" : matchInfo.matches === 0 ? "0 matches" : `${matchInfo.activeMatchOrdinal} of ${matchInfo.matches}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed top-12 right-4 z-[200] flex items-center gap-2 px-3 py-2 rounded-md bg-surface-1/95 backdrop-blur ring-1 ring-edge shadow-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        ref: inputRef,
        type: "text",
        value: query,
        onChange: (e) => setQuery(e.target.value),
        onKeyDown,
        placeholder: "Find on page…",
        className: "bg-transparent outline-none text-[13px] text-zinc-100 placeholder-zinc-500 w-56"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] tabular-nums text-zinc-500 min-w-[60px] text-right", children: counter }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: () => runSearch(query, { forward: false, findNext: true }),
        title: "Previous (Shift+Enter)",
        className: "h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
        children: "↑"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: () => runSearch(query, { forward: true, findNext: true }),
        title: "Next (Enter)",
        className: "h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
        children: "↓"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: onClose,
        title: "Close (Esc)",
        className: "h-6 w-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
        children: "×"
      }
    )
  ] });
}
const TOPIC_PALETTE = [
  { stroke: "#7dd3fc", fill: "#0c4a6e", text: "#bae6fd" },
  // sky
  { stroke: "#86efac", fill: "#14532d", text: "#bbf7d0" },
  // emerald
  { stroke: "#fcd34d", fill: "#78350f", text: "#fde68a" },
  // amber
  { stroke: "#f0abfc", fill: "#581c87", text: "#f5d0fe" },
  // fuchsia
  { stroke: "#fda4af", fill: "#881337", text: "#fecdd3" },
  // rose
  { stroke: "#a5b4fc", fill: "#312e81", text: "#c7d2fe" },
  // indigo
  { stroke: "#fdba74", fill: "#7c2d12", text: "#fed7aa" },
  // orange
  { stroke: "#5eead4", fill: "#134e4a", text: "#99f6e4" }
  // teal
];
const NEUTRAL_NODE = { stroke: "#71717a", fill: "#27272a", text: "#a1a1aa" };
function colorForTopic(topicId) {
  return TOPIC_PALETTE[topicId % TOPIC_PALETTE.length];
}
function runForceLayout(papers, edges2, width, height) {
  const REPULSION = 4500;
  const ATTRACTION = 0.045;
  const DAMPING = 0.85;
  const ITERATIONS = 180;
  const PADDING = 50;
  const center = { x: width / 2, y: height / 2 };
  const nodes2 = papers.map((p, i) => {
    const angle = i / papers.length * Math.PI * 2;
    const r = Math.min(width, height) * 0.25;
    return {
      id: p.paperId,
      paper: p,
      x: center.x + Math.cos(angle) * r + (Math.random() - 0.5) * 30,
      y: center.y + Math.sin(angle) * r + (Math.random() - 0.5) * 30,
      vx: 0,
      vy: 0
    };
  });
  const byId = new Map(nodes2.map((n) => [n.id, n]));
  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < nodes2.length; i++) {
      const a = nodes2[i];
      for (let j = i + 1; j < nodes2.length; j++) {
        const b = nodes2[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const ux = dx / dist;
        const uy = dy / dist;
        a.vx += ux * force;
        a.vy += uy * force;
        b.vx -= ux * force;
        b.vy -= uy * force;
      }
    }
    for (const e of edges2) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      a.vx += dx * ATTRACTION;
      a.vy += dy * ATTRACTION;
      b.vx -= dx * ATTRACTION;
      b.vy -= dy * ATTRACTION;
    }
    for (const n of nodes2) {
      n.vx += (center.x - n.x) * 5e-3;
      n.vy += (center.y - n.y) * 5e-3;
    }
    for (const n of nodes2) {
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x = Math.max(PADDING, Math.min(width - PADDING, n.x));
      n.y = Math.max(PADDING, Math.min(height - PADDING, n.y));
    }
  }
  return nodes2;
}
function truncateTitle(title, max = 38) {
  if (title.length <= max) return title;
  return title.slice(0, max - 1).trimEnd() + "…";
}
function ResearchMap({
  bookmarks,
  edges: edges2,
  topicLinks,
  selectedId,
  onSelect
}) {
  const VIEW_W = 1400;
  const VIEW_H = 900;
  const containerRef = reactExports.useRef(null);
  const [hoveredId, setHoveredId] = reactExports.useState(null);
  const topicIdByBookmark = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const link of topicLinks) {
      if (!m.has(link.bookmarkPaperId)) {
        m.set(link.bookmarkPaperId, link.topicId);
      }
    }
    return m;
  }, [topicLinks]);
  const positions = reactExports.useMemo(() => {
    return runForceLayout(
      bookmarks.map((b) => b.paper),
      edges2,
      VIEW_W,
      VIEW_H
    );
  }, [bookmarks, edges2]);
  const positionById = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const n of positions) m.set(n.id, n);
    return m;
  }, [positions]);
  const drawableEdges = reactExports.useMemo(
    () => edges2.filter((e) => positionById.has(e.from) && positionById.has(e.to)),
    [edges2, positionById]
  );
  const focusId = hoveredId ?? selectedId;
  const highlighted = reactExports.useMemo(() => {
    if (!focusId) return null;
    const set = /* @__PURE__ */ new Set([focusId]);
    for (const e of drawableEdges) {
      if (e.from === focusId) set.add(e.to);
      if (e.to === focusId) set.add(e.from);
    }
    return set;
  }, [focusId, drawableEdges]);
  if (bookmarks.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-xl border border-edge/60 px-6 py-12 text-center text-[12px] text-zinc-500", children: "No bookmarks yet — bookmark a few papers and the map will draw their citation web." });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-edge bg-surface-1 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-2 border-b border-edge flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300", children: "Research Map" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500", children: [
        bookmarks.length,
        " papers · ",
        drawableEdges.length,
        " foundational links"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-[10px] text-zinc-600", children: "Hover a node to highlight its citation web. Click to open detail." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: containerRef, className: "relative", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "svg",
      {
        viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
        className: "w-full h-auto block",
        style: { aspectRatio: `${VIEW_W} / ${VIEW_H}` },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("defs", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "marker",
              {
                id: "researchmap-arrow",
                viewBox: "0 0 10 10",
                refX: "9",
                refY: "5",
                markerWidth: "6",
                markerHeight: "6",
                orient: "auto-start-reverse",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#fcd34d" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "marker",
              {
                id: "researchmap-arrow-dim",
                viewBox: "0 0 10 10",
                refX: "9",
                refY: "5",
                markerWidth: "5",
                markerHeight: "5",
                orient: "auto-start-reverse",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#3f3f46" })
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("g", { children: drawableEdges.map((e, i) => {
            const a = positionById.get(e.from);
            const b = positionById.get(e.to);
            const isHighlighted = highlighted !== null && (e.from === focusId || e.to === focusId);
            const dim = highlighted !== null && !isHighlighted;
            const stroke = dim ? "#3f3f46" : isHighlighted ? "#fcd34d" : "#52525b";
            const opacity = dim ? 0.3 : 1;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const NODE_R = 8;
            const x2 = b.x - dx / dist * (NODE_R + 4);
            const y2 = b.y - dy / dist * (NODE_R + 4);
            return /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: a.x,
                y1: a.y,
                x2,
                y2,
                stroke,
                strokeWidth: isHighlighted ? 2 : 1,
                opacity,
                markerEnd: dim ? "url(#researchmap-arrow-dim)" : "url(#researchmap-arrow)"
              },
              `${e.from}-${e.to}-${i}`
            );
          }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("g", { children: positions.map((n) => {
            const topicId = topicIdByBookmark.get(n.id) ?? null;
            const color = topicId !== null ? colorForTopic(topicId) : NEUTRAL_NODE;
            const isFocused = n.id === focusId;
            const isSelected = n.id === selectedId;
            const dim = highlighted !== null && !highlighted.has(n.id);
            const opacity = dim ? 0.25 : 1;
            const r = isSelected ? 11 : isFocused ? 10 : 8;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "g",
              {
                transform: `translate(${n.x} ${n.y})`,
                opacity,
                style: { cursor: "pointer" },
                onMouseEnter: () => setHoveredId(n.id),
                onMouseLeave: () => setHoveredId(null),
                onClick: () => onSelect(n.paper),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "circle",
                    {
                      r,
                      fill: color.fill,
                      stroke: color.stroke,
                      strokeWidth: isSelected ? 2.5 : isFocused ? 2 : 1.4
                    }
                  ),
                  (isFocused || isSelected) && // Show full title on focus; dim during normal browse
                  // to keep the map readable.
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "text",
                    {
                      x: 0,
                      y: r + 14,
                      textAnchor: "middle",
                      fontSize: 11,
                      fill: color.text,
                      style: { pointerEvents: "none" },
                      children: truncateTitle(n.paper.title, 50)
                    }
                  ),
                  !isFocused && !isSelected && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "text",
                    {
                      x: 0,
                      y: r + 12,
                      textAnchor: "middle",
                      fontSize: 9.5,
                      fill: color.text,
                      style: { pointerEvents: "none" },
                      opacity: 0.7,
                      children: truncateTitle(n.paper.title, 30)
                    }
                  )
                ]
              },
              n.id
            );
          }) })
        ]
      }
    ) })
  ] });
}
const R_MIN$1 = 7;
const R_MAX$1 = 26;
const LAYER_GAP = 110;
const NODE_GAP = 300;
const LABEL_PX = 11;
const LABEL_MAX_CHARS = 34;
function generationColor(g) {
  if (g === 0) return "250,204,21";
  if (g < 0) return g === -1 ? "56,189,248" : "99,132,190";
  return g === 1 ? "74,222,128" : "134,180,120";
}
function generationLabel(g) {
  if (g === 0) return "this paper";
  if (g === -1) return "builds on";
  if (g < -1) return `${-g} hops back`;
  if (g === 1) return "cited by";
  return `${g} hops forward`;
}
function ResearchGraph({
  focusPaperId,
  onFocusPaper,
  onOpenURL,
  onSelectPaper
}) {
  const [data, setData] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(false);
  const [expanding, setExpanding] = reactExports.useState(false);
  const [hops, setHops] = reactExports.useState(2);
  const [selected, setSelected] = reactExports.useState(null);
  const [picker, setPicker] = reactExports.useState([]);
  const canvasRef = reactExports.useRef(null);
  const camRef = reactExports.useRef({ x: 0, y: 0, zoom: 1 });
  const hoverRef = reactExports.useRef(null);
  const placedRef = reactExports.useRef([]);
  const dragRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(null);
  const autoExpandedRef = reactExports.useRef(null);
  const [dragging, setDragging] = reactExports.useState(false);
  const load = reactExports.useCallback(async () => {
    if (!focusPaperId) {
      try {
        const g = await window.api.research.graph();
        setPicker(g.hubs.slice(0, 12));
      } catch {
        setPicker([]);
      }
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const payload = await window.api.research.neighborhood(focusPaperId, hops);
      setData(payload);
    } catch (err) {
      console.warn("[research-graph] neighborhood failed:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [focusPaperId, hops]);
  reactExports.useEffect(() => {
    void load();
  }, [load]);
  const expand = reactExports.useCallback(async () => {
    if (!focusPaperId) return;
    setExpanding(true);
    try {
      await window.api.research.expandFromPaper(focusPaperId);
      await load();
    } catch (err) {
      console.warn("[research-graph] expand failed:", err);
    } finally {
      setExpanding(false);
    }
  }, [focusPaperId, load]);
  reactExports.useEffect(() => {
    if (!focusPaperId || !data || expanding) return;
    if (!data.needsExpansion) return;
    if (autoExpandedRef.current === focusPaperId) return;
    autoExpandedRef.current = focusPaperId;
    void expand();
  }, [focusPaperId, data, expanding, expand]);
  const layout = reactExports.useMemo(() => {
    if (!data || data.nodes.length === 0) return [];
    const byGen = /* @__PURE__ */ new Map();
    for (const n of data.nodes) {
      const arr = byGen.get(n.generation);
      if (arr) arr.push(n);
      else byGen.set(n.generation, [n]);
    }
    const cites = data.nodes.map((n) => n.citationCount);
    const maxCite = Math.max(10, ...cites);
    const out = [];
    for (const [gen, group] of byGen) {
      group.sort(
        (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.citationCount - b.citationCount
      );
      const width = (group.length - 1) * NODE_GAP;
      group.forEach((n, i) => {
        out.push({
          node: n,
          x: -width / 2 + i * NODE_GAP,
          y: -gen * LAYER_GAP,
          r: R_MIN$1 + Math.log10(Math.max(n.citationCount, 1)) / Math.log10(maxCite) * (R_MAX$1 - R_MIN$1)
        });
      });
    }
    return out;
  }, [data]);
  const positions = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const p of layout) m.set(p.node.paperId, p);
    return m;
  }, [layout]);
  const fitToView = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || layout.length === 0) return false;
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return false;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of layout) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const pad = 90;
    const spanY = Math.max(maxY - minY, 1);
    const zoom = Math.max(
      0.7,
      Math.min(1.3, (canvas.clientHeight - pad) / spanY)
    );
    camRef.current = {
      x: 0,
      y: -((minY + maxY) / 2) * zoom,
      zoom
    };
    return true;
  }, [layout]);
  const draw = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#07080c";
      ctx.fillRect(0, 0, w, h);
      const { x: camX, y: camY, zoom } = camRef.current;
      const ox = w / 2 + camX;
      const oy = h / 2 + camY;
      const sx = (p) => ox + p.x * zoom;
      const sy = (p) => oy + p.y * zoom;
      const gens = [...new Set(layout.map((p) => p.node.generation))].sort((a, b) => b - a);
      ctx.font = "10px ui-sans-serif, system-ui";
      for (const g of gens) {
        const y = oy + -g * LAYER_GAP * zoom;
        ctx.strokeStyle = g === 0 ? "rgba(250,204,21,0.16)" : "rgba(255,255,255,0.045)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = g === 0 ? "rgba(250,204,21,0.75)" : "rgba(148,163,184,0.5)";
        ctx.textAlign = "left";
        ctx.fillText(generationLabel(g), 10, y - 6);
      }
      const hover = hoverRef.current;
      const neighbours = /* @__PURE__ */ new Set();
      if (hover) {
        neighbours.add(hover);
        for (const e of data?.edges ?? []) {
          if (e.from === hover) neighbours.add(e.to);
          if (e.to === hover) neighbours.add(e.from);
        }
      }
      const focusId = data?.focusPaperId;
      const edges2 = data?.edges ?? [];
      const drawArrow = (x1, y1, x2, y2, color, size) => {
        const dx = 2 * (x2 - x1);
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const tipX = mx + ux * size * 0.5;
        const tipY = my + uy * size * 0.5;
        const nx = -uy;
        const ny = ux;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - ux * size + nx * size * 0.55, tipY - uy * size + ny * size * 0.55);
        ctx.lineTo(tipX - ux * size - nx * size * 0.55, tipY - uy * size - ny * size * 0.55);
        ctx.closePath();
        ctx.fill();
      };
      const tier = (e) => {
        if (hover) return neighbours.has(e.from) && neighbours.has(e.to) ? 2 : 0;
        if (e.from === focusId || e.to === focusId) return 2;
        return 1;
      };
      const ordered = [...edges2].sort((x, y) => tier(x) - tier(y));
      for (const e of ordered) {
        const a = positions.get(e.from);
        const bNode = positions.get(e.to);
        if (!a || !bNode) continue;
        const t = tier(e);
        if (hover && t === 0) continue;
        const influential = e.relationship === "influential";
        const rgb = influential ? "251,191,36" : "125,155,205";
        const alpha = t === 2 ? 0.9 : 0.13;
        const width = t === 2 ? influential ? 2.2 : 1.6 : 0.8;
        const x1 = sx(a);
        const y1 = sy(a);
        const x2 = sx(bNode);
        const y2 = sy(bNode);
        const cx1 = x1;
        const cy1 = (y1 + y2) / 2;
        ctx.strokeStyle = `rgba(${rgb},${alpha})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(cx1, cy1, x2, cy1, x2, y2);
        ctx.stroke();
        if (t === 2) {
          drawArrow(x1, y1, x2, y2, `rgba(${rgb},${alpha})`, influential ? 9 : 7.5);
        }
      }
      placedRef.current = layout;
      const labelBoxes = [];
      const circleOrder = [...layout].sort((a, b) => a.r - b.r);
      const labelOrder = [...layout].map((p, i) => ({ p, i })).sort((a, b) => {
        const score = (q) => (q.node.generation === 0 ? 1e9 : 0) + (hover === q.node.paperId ? 1e8 : 0) + q.r;
        return score(b.p) - score(a.p);
      });
      for (const p of circleOrder) {
        const dim = hover ? !neighbours.has(p.node.paperId) : false;
        const alpha = dim ? 0.12 : 1;
        const rgb = generationColor(p.node.generation);
        const x = sx(p);
        const y = sy(p);
        const r = Math.max(p.r * zoom, 2);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
        glow.addColorStop(0, `rgba(${rgb},${0.4 * alpha})`);
        glow.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (p.node.bookmarked && !dim) {
          ctx.strokeStyle = "rgba(250,204,21,0.9)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(x, y, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (selected?.paperId === p.node.paperId) {
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      for (const { p, i: idx } of labelOrder) {
        const dim = hover ? !neighbours.has(p.node.paperId) : false;
        const x = sx(p);
        const y = sy(p);
        const r = Math.max(p.r * zoom, 2);
        if (!dim) {
          const isFocus = p.node.generation === 0;
          const isHovered = hover === p.node.paperId;
          const title = p.node.title.length > LABEL_MAX_CHARS ? p.node.title.slice(0, LABEL_MAX_CHARS - 1) + "…" : p.node.title;
          ctx.font = `${isFocus ? 600 : 400} ${LABEL_PX}px ui-sans-serif, system-ui`;
          const tw = ctx.measureText(title).width;
          const below = idx % 2 === 0;
          const ly = below ? y + r + 15 : y - r - 8;
          const box = { x1: x - tw / 2 - 5, y1: ly - LABEL_PX, x2: x + tw / 2 + 5, y2: ly + 5 };
          const clash = labelBoxes.some(
            (o) => !(box.x2 < o.x1 || box.x1 > o.x2 || box.y2 < o.y1 || box.y1 > o.y2)
          );
          if (!clash || isFocus || isHovered) {
            labelBoxes.push(box);
            ctx.textAlign = "center";
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = "rgba(7,8,12,0.95)";
            ctx.strokeText(title, x, ly);
            ctx.fillStyle = isFocus ? "rgba(253,230,138,0.98)" : "rgba(226,232,240,0.94)";
            ctx.fillText(title, x, ly);
            if (p.node.year) {
              ctx.font = `10px ui-sans-serif, system-ui`;
              ctx.lineWidth = 3;
              ctx.strokeStyle = "rgba(7,8,12,0.95)";
              const yy = below ? ly + 13 : ly - 13;
              ctx.strokeText(String(p.node.year), x, yy);
              ctx.fillStyle = "rgba(148,163,184,0.85)";
              ctx.fillText(String(p.node.year), x, yy);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[research-graph] draw failed:", err);
    }
  }, [layout, positions, data, selected]);
  const drawRef = reactExports.useRef(draw);
  reactExports.useEffect(() => {
    drawRef.current = draw;
  }, [draw]);
  const drawNow = reactExports.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    drawRef.current();
  }, []);
  const requestDraw = reactExports.useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current();
    });
  }, []);
  reactExports.useEffect(() => {
    drawNow();
  }, [draw, drawNow]);
  const fittedRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    fittedRef.current = fitToView();
    drawNow();
  }, [fitToView, drawNow]);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      if (!fittedRef.current) fittedRef.current = fitToView();
      drawNow();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [drawNow, fitToView]);
  reactExports.useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );
  const pick = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const { x: camX, y: camY, zoom } = camRef.current;
    const ox = canvas.clientWidth / 2 + camX;
    const oy = canvas.clientHeight / 2 + camY;
    let best = null;
    let bestD = Infinity;
    for (const p of placedRef.current) {
      const d = Math.hypot(ox + p.x * zoom - px, oy + p.y * zoom - py);
      if (d <= Math.max(p.r * zoom + 6, 9) && d < bestD) {
        bestD = d;
        best = p.node;
      }
    }
    return best;
  };
  if (!focusPaperId) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-4 p-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md text-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-zinc-100", children: "Pick a paper" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] text-zinc-500", children: "This view shows one paper's lineage — what it builds on, and what built on it. Choose a starting point, or hit “Build graph” on any paper in Discover." })
      ] }),
      picker.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-2xl space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: "Most connected in your graph" }),
        picker.map((h) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => onFocusPaper(h.paperId),
            className: "flex w-full items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left hover:border-zinc-700",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate text-[12px] text-zinc-200", children: h.title }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "shrink-0 text-[10px] text-zinc-500", children: [
                h.degree,
                " links"
              ] })
            ]
          },
          h.paperId
        ))
      ] })
    ] });
  }
  const focusNode = data?.nodes.find((n) => n.generation === 0) ?? null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onFocusPaper(""),
          className: "rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:bg-surface-2 hover:text-zinc-100",
          children: "← Change paper"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-[12px] font-medium text-zinc-100", title: focusNode?.title, children: focusNode?.title ?? focusPaperId }),
        focusNode && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "truncate text-[10px] text-zinc-500", children: [
          focusNode.authors.slice(0, 3).join(", "),
          focusNode.year ? ` · ${focusNode.year}` : "",
          focusNode.venue ? ` · ${focusNode.venue}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1 text-xs text-zinc-400", children: [
        "Hops",
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: hops,
            onChange: (e) => setHops(Number(e.target.value)),
            className: "rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 1, children: "1" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 2, children: "2" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 3, children: "3" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => void expand(),
          disabled: expanding,
          className: "rounded bg-sky-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25 disabled:opacity-50",
          children: expanding ? "Fetching…" : "Fetch more"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => {
            fittedRef.current = fitToView();
            drawNow();
          },
          className: "rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800",
          children: "fit"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-zinc-500", children: [
        data?.nodes.length ?? 0,
        " papers · ",
        data?.edges.length ?? 0,
        " citations"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative min-h-0 flex-1", children: [
      loading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-400", children: "Loading lineage…" }),
      !loading && data && data.nodes.length <= 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-8 text-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "max-w-sm text-sm text-zinc-400", children: expanding ? "Fetching this paper's references and citations from Semantic Scholar…" : "No citations found for this paper." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => void expand(),
            disabled: expanding,
            className: "rounded bg-sky-500/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25 disabled:opacity-50",
            children: expanding ? "Fetching…" : "Fetch its references and citations"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "canvas",
        {
          ref: canvasRef,
          className: "absolute inset-0 h-full w-full",
          style: { cursor: dragging ? "grabbing" : "grab", display: "block" },
          onPointerDown: (e) => {
            const { x, y } = camRef.current;
            dragRef.current = { x: e.clientX, y: e.clientY, camX: x, camY: y };
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          },
          onPointerMove: (e) => {
            const d = dragRef.current;
            if (d) {
              camRef.current.x = d.camX + (e.clientX - d.x);
              camRef.current.y = d.camY + (e.clientY - d.y);
              requestDraw();
              return;
            }
            const hit = pick(e.clientX, e.clientY);
            const next = hit?.paperId ?? null;
            if (next !== hoverRef.current) {
              hoverRef.current = next;
              requestDraw();
            }
          },
          onPointerUp: (e) => {
            const d = dragRef.current;
            dragRef.current = null;
            setDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) {
              setSelected(pick(e.clientX, e.clientY));
            }
            requestDraw();
          },
          onPointerLeave: () => {
            if (hoverRef.current !== null) {
              hoverRef.current = null;
              requestDraw();
            }
          },
          onWheel: (e) => {
            camRef.current.zoom = Math.max(
              0.25,
              Math.min(4, camRef.current.zoom * (e.deltaY > 0 ? 1 / 1.12 : 1.12))
            );
            requestDraw();
          }
        }
      ),
      selected && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-4 top-4 max-h-[85%] w-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 shadow-xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold leading-snug text-zinc-100", children: selected.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setSelected(null),
              className: "shrink-0 text-zinc-500 hover:text-zinc-300",
              "aria-label": "Close",
              children: "✕"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] text-zinc-400", children: [
          selected.authors.slice(0, 3).join(", "),
          selected.authors.length > 3 ? " et al." : "",
          selected.year ? ` · ${selected.year}` : ""
        ] }),
        selected.venue && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500", children: selected.venue }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-wrap gap-1.5 text-[10px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "rounded px-1.5 py-0.5 ring-1",
              style: {
                color: `rgb(${generationColor(selected.generation)})`,
                borderColor: "transparent",
                boxShadow: `inset 0 0 0 1px rgba(${generationColor(selected.generation)},0.4)`
              },
              children: generationLabel(selected.generation)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded px-1.5 py-0.5 text-zinc-300 ring-1 ring-zinc-700", children: [
            selected.citationCount.toLocaleString(),
            " cites"
          ] }),
          selected.influentialCitationCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-500/25", children: [
            selected.influentialCitationCount,
            " influential"
          ] })
        ] }),
        selected.abstract && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-h-32 overflow-y-auto text-[11px] leading-snug text-zinc-400", children: selected.abstract }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex flex-col gap-1.5", children: [
          selected.paperId !== focusPaperId && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => {
                setSelected(null);
                onFocusPaper(selected.paperId);
              },
              className: "w-full rounded bg-violet-500/15 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25",
              children: "Centre on this paper"
            }
          ),
          onSelectPaper && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => onSelectPaper({
                paperId: selected.paperId,
                title: selected.title,
                abstract: selected.abstract,
                year: selected.year,
                authors: selected.authors,
                venue: selected.venue,
                citationCount: selected.citationCount,
                influentialCitationCount: selected.influentialCitationCount,
                url: selected.url,
                pdfUrl: selected.pdfUrl,
                arxivId: null,
                doi: null
              }),
              className: "w-full rounded bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700",
              children: "Open details"
            }
          ),
          selected.pdfUrl && onOpenURL && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => onOpenURL(selected.pdfUrl, selected.title, selected.venue),
              className: "w-full rounded bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700",
              children: "Open PDF"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block h-2 w-2 rounded-full bg-sky-400" }),
        " builds on (older)"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block h-2 w-2 rounded-full bg-amber-300" }),
        " this paper"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block h-2 w-2 rounded-full bg-emerald-400" }),
        " cited by (newer)"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto", children: "drag to pan · scroll to zoom · click a paper" })
    ] })
  ] });
}
function relativeAge$1(ms) {
  if (ms === null) return "not fetched yet";
  const hours = (Date.now() - ms) / 36e5;
  if (hours < 1) return "updated just now";
  if (hours < 24) return `updated ${Math.round(hours)}h ago`;
  return `updated ${Math.round(hours / 24)}d ago`;
}
function ResearchDiscover({
  onSelectPaper,
  onBuildGraph,
  onSearch
}) {
  const [sections, setSections] = reactExports.useState(null);
  const [refreshing, setRefreshing] = reactExports.useState(false);
  const [mode, setMode] = reactExports.useState("trending");
  const load = reactExports.useCallback(async () => {
    try {
      setSections(await window.api.research.discover(mode));
    } catch (err) {
      console.warn("[discover] load failed:", err);
      setSections([]);
    }
  }, [mode]);
  reactExports.useEffect(() => {
    void load();
  }, [load]);
  reactExports.useEffect(() => {
    if (sections === null) return;
    if (sections.some((s) => s.papers.length > 0)) return;
    if (refreshing) return;
    setRefreshing(true);
    void window.api.research.refreshDiscover(false, mode).then(() => load()).catch((err) => console.warn("[discover] initial refresh failed:", err)).finally(() => setRefreshing(false));
  }, [mode, sections === null ? null : sections.some((s) => s.papers.length > 0)]);
  if (sections === null) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-sm text-zinc-400", children: "Loading…" });
  }
  const empty = sections.every((s) => s.papers.length === 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-baseline justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[13px] font-semibold text-zinc-100", children: "What's moving in research" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-[11px] text-zinc-500", children: mode === "newest" ? "Fresh arXiv preprints by submission date — this is the frontier, before peer review and before citations exist." : "Recent work ranked by citations per year. Open one to read it, or build a citation graph outward from it." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex shrink-0 items-center gap-1 rounded-full bg-surface-1 p-0.5 ring-1 ring-edge/60", children: ["trending", "newest"].map((m) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => {
            setMode(m);
            setSections(null);
          },
          title: m === "newest" ? "arXiv preprints by submission date — often days old" : "Recent work ranked by citations per year",
          className: "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] " + (mode === m ? "bg-violet-500/20 text-violet-200" : "text-zinc-500 hover:text-zinc-200"),
          children: m === "newest" ? "Newest" : "Trending"
        },
        m
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => {
            setRefreshing(true);
            void window.api.research.refreshDiscover(true, mode).then(() => load()).finally(() => setRefreshing(false));
          },
          disabled: refreshing,
          className: "shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400 ring-1 ring-inset ring-zinc-700 hover:bg-surface-2 hover:text-zinc-100 disabled:opacity-50",
          children: refreshing ? "Refreshing…" : "Refresh"
        }
      )
    ] }),
    empty && refreshing && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded border border-zinc-800 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-400", children: [
      "Fetching recent work across ",
      sections.length,
      " fields…",
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[10px] text-zinc-500", children: "Paced against Semantic Scholar's rate limit, so this takes a moment the first time. It's cached afterwards." })
    ] }),
    empty && !refreshing && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded border border-zinc-800 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-400", children: "Nothing cached yet. Hit Refresh, or search for a topic directly." }),
    sections.filter((s) => s.papers.length > 0).map((section) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-baseline justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300", children: section.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: relativeAge$1(section.fetchedAt) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => onSearch(section.label),
              className: "text-[10px] text-zinc-500 hover:text-zinc-200",
              children: "search this field →"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4", children: section.papers.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "article",
        {
          className: "group flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 hover:border-zinc-700",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => onSelectPaper(p),
                className: "text-left text-[12px] font-medium leading-snug text-zinc-100 hover:text-violet-200",
                title: p.title,
                children: p.title
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[10px] text-zinc-500", children: [
              p.authors.slice(0, 2).join(", "),
              p.authors.length > 2 ? " et al." : "",
              p.publicationDate ? ` · ${p.publicationDate}` : p.year ? ` · ${p.year}` : ""
            ] }),
            p.venue && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-[10px] text-zinc-600", title: p.venue, children: p.venue }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1.5 flex items-center gap-1.5 text-[10px]", children: [
              (p.citationCount > 0 || mode === "trending") && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded px-1 py-0.5 text-zinc-400 ring-1 ring-zinc-800", children: [
                p.citationCount.toLocaleString(),
                " cites"
              ] }),
              p.influentialCitationCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded bg-amber-500/10 px-1 py-0.5 text-amber-300/90 ring-1 ring-amber-500/20", children: [
                p.influentialCitationCount,
                " infl."
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => onBuildGraph(p),
                className: "mt-2 rounded bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300/90 opacity-0 ring-1 ring-inset ring-sky-500/25 transition-opacity hover:bg-sky-500/20 group-hover:opacity-100",
                children: "Build graph"
              }
            )
          ]
        },
        p.paperId
      )) })
    ] }, section.fieldId))
  ] });
}
const BAND_STYLES = {
  upstream: {
    header: "text-amber-300/90",
    column: "bg-amber-500/[0.04]",
    accent: "border-amber-500/30"
  },
  focal: {
    header: "text-zinc-100",
    column: "bg-zinc-100/[0.06]",
    accent: "border-zinc-300/50"
  },
  downstream: {
    header: "text-sky-300/90",
    column: "bg-sky-500/[0.04]",
    accent: "border-sky-500/30"
  }
};
function PaperValueChainDiagram({
  chain,
  selectedPaperId,
  onSelectPaper
}) {
  const nodesByStage = /* @__PURE__ */ new Map();
  for (const stage of chain.stages) nodesByStage.set(stage.id, []);
  for (const node of chain.nodes) {
    const list = nodesByStage.get(node.stage);
    if (list) list.push(node);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full overflow-x-auto pb-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "flex gap-2 min-w-max",
      style: { minWidth: chain.stages.length * 218 },
      children: chain.stages.map((stage) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        PaperValueChainColumn,
        {
          stage,
          nodes: nodesByStage.get(stage.id) ?? [],
          selectedPaperId,
          onSelectPaper
        },
        stage.id
      ))
    }
  ) });
}
function PaperValueChainColumn({
  stage,
  nodes: nodes2,
  selectedPaperId,
  onSelectPaper
}) {
  const styles = BAND_STYLES[stage.band];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `flex flex-col gap-2 px-2 py-2 rounded-md ${styles.column} w-[210px] shrink-0`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `text-[10px] uppercase tracking-[0.18em] font-semibold ${styles.header}`, children: [
          stage.label,
          nodes2.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1.5 text-zinc-500 tabular-nums", children: nodes2.length })
        ] }),
        nodes2.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-600 italic px-1 py-1", children: stage.id === "downstream-replications" ? "— Phase 3D —" : "No papers" }) : nodes2.map((node) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          PaperValueChainNodeCard,
          {
            node,
            selected: node.paperId === selectedPaperId,
            accentClass: styles.accent,
            onClick: () => onSelectPaper(node.paperId)
          },
          node.paperId
        ))
      ]
    }
  );
}
function PaperValueChainNodeCard({
  node,
  selected,
  accentClass,
  onClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick,
      className: `text-left w-full rounded border px-2 py-1.5 transition-colors ${selected ? `bg-zinc-100/10 ${accentClass}` : "bg-zinc-900/60 border-zinc-800 hover:bg-zinc-900/90 hover:border-zinc-700"}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] tabular-nums text-zinc-500 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: node.authorYearLabel }),
          node.influentialCitationCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-amber-400/80", children: [
            "★ ",
            node.influentialCitationCount
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-200 leading-snug line-clamp-2 mt-0.5", children: node.title }),
        node.kind === "unverified" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9px] uppercase tracking-wider text-zinc-500 mt-1", children: "unverified" })
      ]
    }
  );
}
function PaperValueChainCard({
  paper,
  onOpenPaperById,
  onOpenPdf
}) {
  const [view, setView] = reactExports.useState({ kind: "idle" });
  const [citationsCollapsed, setCitationsCollapsed] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let cancelled = false;
    void window.api.research.getPaperChain(paper.paperId).then((chain2) => {
      if (cancelled) return;
      if (chain2) {
        const activeNodes = chain2.nodes.length - 1;
        setView(
          activeNodes > 0 ? { kind: "ready", chain: chain2, lastResult: null } : { kind: "empty", chain: chain2, lastResult: null }
        );
      } else {
        setView({ kind: "idle" });
      }
    }).catch(() => {
      if (!cancelled) setView({ kind: "idle" });
    });
    return () => {
      cancelled = true;
    };
  }, [paper.paperId]);
  const onRegenerate = reactExports.useCallback(async () => {
    setView({ kind: "loading" });
    try {
      const result = await window.api.research.regeneratePaperChain(paper.paperId);
      if (!result.ok || !result.chain) {
        setView({ kind: "error", reason: result.reason });
        return;
      }
      const activeNodes = result.chain.nodes.length - 1;
      setView(
        activeNodes > 0 ? { kind: "ready", chain: result.chain, lastResult: result } : { kind: "empty", chain: result.chain, lastResult: result }
      );
    } catch {
      setView({ kind: "error", reason: "empty" });
    }
  }, [paper.paperId]);
  const chain = view.kind === "ready" || view.kind === "empty" ? view.chain : null;
  const lastResult = view.kind === "ready" || view.kind === "empty" ? view.lastResult : null;
  const nodesById = reactExports.useMemo(() => {
    if (!chain) return /* @__PURE__ */ new Map();
    return new Map(chain.nodes.map((n) => [n.paperId, n]));
  }, [chain]);
  const focalNode = chain ? nodesById.get(chain.focusPaperId) ?? null : null;
  const focalPdfUrl = focalNode?.pdfUrl ?? paper.pdfUrl ?? null;
  const focalTitle = focalNode?.title ?? paper.title;
  const focalSubtitle = paper.venue ?? null;
  const openFocalAtPage = reactExports.useCallback(
    (pageOffset) => {
      if (!onOpenPdf || !focalPdfUrl) {
        console.warn(
          "[paper-chain-card] focal click ignored:",
          !onOpenPdf ? "no onOpenPdf prop" : "no focal pdfUrl resolvable"
        );
        return;
      }
      onOpenPdf({
        url: focalPdfUrl,
        title: focalTitle,
        subtitle: focalSubtitle,
        pageOffset
      });
    },
    [onOpenPdf, focalPdfUrl, focalTitle, focalSubtitle]
  );
  const openCounterpartAtPage = reactExports.useCallback(
    (counterpartPaperId, pageOffset) => {
      const node = nodesById.get(counterpartPaperId);
      if (!onOpenPdf || !node?.pdfUrl) {
        console.warn(
          "[paper-chain-card] counterpart click ignored:",
          !onOpenPdf ? "no onOpenPdf prop" : `no pdfUrl for ${counterpartPaperId}`
        );
        return;
      }
      onOpenPdf({
        url: node.pdfUrl,
        title: node.title,
        subtitle: node.authorYearLabel,
        pageOffset
      });
    },
    [onOpenPdf, nodesById]
  );
  const citationRows = reactExports.useMemo(() => {
    if (!chain) return [];
    return collectCitationRows(chain, nodesById);
  }, [chain, nodesById]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 mt-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between mb-2 gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold flex items-center gap-2 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0", children: "Value chain" }),
        chain && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-600 tabular-nums normal-case tracking-normal shrink-0", children: [
          chain.s2CallsUsed,
          " S2 call",
          chain.s2CallsUsed === 1 ? "" : "s"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(EnrichmentBadge, { result: lastResult, chain })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onRegenerate,
          disabled: view.kind === "loading",
          className: "text-[11px] text-zinc-400 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-progress shrink-0",
          children: view.kind === "idle" ? "Generate" : "Regenerate"
        }
      )
    ] }),
    view.kind === "idle" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[12px] text-zinc-500 italic px-1 py-2", children: [
      "Click ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300", children: "Generate" }),
      " to build a citation lineage for this paper. Pulls Semantic Scholar, then reads the paper's intro with Haiku if the PDF is open access."
    ] }),
    view.kind === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-400 italic px-1 py-3", children: "Building chain… (S2 lookups → focal PDF read → Haiku enrichment → bilateral check)" }),
    view.kind === "error" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-red-300/80 px-1 py-2", children: view.reason === "rate_limited" ? "Semantic Scholar rate-limited. Try again in ~30s, or add an API key in Settings → AI." : view.reason === "focal_not_found" ? `Couldn't find this paper in Semantic Scholar (paperId: ${paper.paperId}).` : "Generation failed. Try again." }),
    view.kind === "empty" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-500 italic px-1 py-2", children: "This paper doesn't have enough references or citations on Semantic Scholar to populate any stage besides Focal." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        PaperValueChainDiagram,
        {
          chain: view.chain,
          selectedPaperId: paper.paperId,
          onSelectPaper: onOpenPaperById
        }
      )
    ] }),
    view.kind === "ready" && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PaperValueChainDiagram,
      {
        chain: view.chain,
        selectedPaperId: paper.paperId,
        onSelectPaper: onOpenPaperById
      }
    ),
    citationRows.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CitationsPanel,
      {
        rows: citationRows,
        collapsed: citationsCollapsed,
        onToggle: () => setCitationsCollapsed((c) => !c),
        onOpenFocalAtPage: openFocalAtPage,
        onOpenCounterpartAtPage: openCounterpartAtPage
      }
    )
  ] });
}
function EnrichmentBadge({
  result,
  chain
}) {
  let badge = result?.enrichmentBadge ?? null;
  if (!badge && chain) {
    const hasPaperPdf = chain.edges.some(
      (e) => e.citations.some((c) => c.kind === "paper-pdf")
    );
    if (hasPaperPdf) badge = "cache";
  }
  if (!badge) return null;
  if (badge === "metadata-only") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        title: "Focal paper PDF wasn't open-access or couldn't be parsed; chain is S2-only.",
        className: "text-[9px] uppercase tracking-[0.16em] text-zinc-500 normal-case px-1.5 py-0.5 rounded-full ring-1 ring-inset ring-zinc-700",
        children: "metadata only"
      }
    );
  }
  if (badge === "enriched") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        title: "Focal paper intro was read by Haiku; some edges carry quoted-sentence citations.",
        className: "text-[9px] uppercase tracking-[0.16em] text-emerald-300 normal-case px-1.5 py-0.5 rounded-full bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30",
        children: "enriched"
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      title: "Loaded from enrichment cache; no Haiku call this round.",
      className: "text-[9px] uppercase tracking-[0.16em] text-sky-300 normal-case px-1.5 py-0.5 rounded-full bg-sky-500/10 ring-1 ring-inset ring-sky-500/30",
      children: "cached"
    }
  );
}
function collectCitationRows(chain, nodesById) {
  const rows = [];
  for (const edge of chain.edges) {
    if (edge.from !== chain.focusPaperId) continue;
    const focalPaperPdf = edge.citations.find(
      (c) => c.kind === "paper-pdf"
    );
    if (!focalPaperPdf) continue;
    const bilateral = edge.citations.find((c) => c.kind === "bilateral") ?? null;
    rows.push({
      edge,
      focalPaperPdf,
      bilateral,
      targetNode: nodesById.get(edge.to) ?? null,
      counterpartPaperId: edge.to
    });
  }
  rows.sort((a, b) => a.focalPaperPdf.pageOffset - b.focalPaperPdf.pageOffset);
  return rows;
}
function CitationsPanel({
  rows,
  collapsed,
  onToggle,
  onOpenFocalAtPage,
  onOpenCounterpartAtPage
}) {
  const bilateralCount = rows.filter((r) => r.bilateral).length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-3 pt-3 border-t border-zinc-800/80", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: onToggle,
        className: "w-full flex items-center justify-between gap-3 mb-2 group",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] uppercase tracking-[0.22em] text-emerald-300/90 font-semibold flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Citations" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500 normal-case tracking-normal tabular-nums", children: rows.length }),
            bilateralCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "span",
              {
                className: "text-[9px] uppercase tracking-[0.16em] text-violet-300 normal-case px-1.5 py-0.5 rounded-full bg-violet-500/10 ring-1 ring-inset ring-violet-500/30",
                title: `${bilateralCount} edge${bilateralCount === 1 ? "" : "s"} reinforced by bilateral check`,
                children: [
                  bilateralCount,
                  " bilateral"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 group-hover:text-zinc-300", children: collapsed ? "▸ show" : "▾ hide" })
        ]
      }
    ),
    !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: rows.map((row, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      CitationRowView,
      {
        row,
        onOpenFocalAtPage,
        onOpenCounterpartAtPage
      },
      `${row.edge.from}-${row.edge.to}-${i}`
    )) })
  ] });
}
function CitationRowView({
  row,
  onOpenFocalAtPage,
  onOpenCounterpartAtPage
}) {
  const { focalPaperPdf, bilateral, targetNode, counterpartPaperId } = row;
  const counterpartCitation = bilateral?.counterpartCitation ?? null;
  const counterpartHasPdf = !!targetNode?.pdfUrl;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "li",
    {
      className: `rounded border px-3 py-2 ${bilateral ? "border-violet-500/20 bg-violet-500/[0.04]" : "border-emerald-500/15 bg-emerald-500/[0.03]"}`,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1 shrink-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => onOpenFocalAtPage(focalPaperPdf.pageOffset),
              className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 tabular-nums",
              title: "Open focal paper PDF at this page",
              children: [
                "p.",
                focalPaperPdf.pageOffset
              ]
            }
          ),
          bilateral && (counterpartCitation ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              disabled: !counterpartHasPdf,
              onClick: () => onOpenCounterpartAtPage(
                counterpartPaperId,
                counterpartCitation.pageOffset
              ),
              className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed tabular-nums",
              title: counterpartHasPdf ? "Open counterpart paper PDF at this page" : "Counterpart PDF not available",
              children: [
                "p.",
                counterpartCitation.pageOffset
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 ring-1 ring-inset ring-zinc-700 tabular-nums text-center",
              title: "Mutual cite confirmed via Semantic Scholar — counterpart's reference list contains this paper. No PDF read.",
              children: "S2"
            }
          ))
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[11px] text-zinc-300 truncate flex items-baseline gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-emerald-300/80", children: relationshipLabel(row.edge.relationship) }),
            targetNode ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: "→" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-100 truncate", children: targetNode.authorYearLabel }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-500 truncate", children: [
                " · ",
                targetNode.title
              ] })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: counterpartPaperId })
          ] }),
          bilateral && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-0.5 text-[10px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-violet-300 uppercase tracking-[0.16em] font-semibold", children: bilateralReasonLabel(bilateral.matchReason) }),
            bilateral.trigger && bilateral.matchReason !== "framing-alignment" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-500", children: [
              " ",
              "— trigger:",
              " ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300", children: bilateral.trigger })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("blockquote", { className: "mt-1 text-[11px] text-zinc-400 italic leading-snug border-l border-emerald-500/30 pl-2", children: [
            '"',
            focalPaperPdf.quotedSentence,
            '"'
          ] }),
          counterpartCitation && /* @__PURE__ */ jsxRuntimeExports.jsxs("blockquote", { className: "mt-1 text-[11px] text-zinc-400 italic leading-snug border-l border-violet-500/30 pl-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "not-italic text-[9px] uppercase tracking-[0.18em] text-violet-400/70 mr-1", children: "counterpart" }),
            '"',
            counterpartCitation.quotedSentence,
            '"'
          ] })
        ] })
      ] })
    }
  );
}
function relationshipLabel(rel) {
  switch (rel) {
    case "builds-on":
      return "builds on";
    case "uses-method":
      return "uses method of";
    case "extends":
      return "extends";
    case "contrasts":
      return "contrasts with";
    case "replicates":
      return "replicates";
    case "refutes":
      return "refutes";
  }
}
function bilateralReasonLabel(reason) {
  switch (reason) {
    case "mutual-cite":
      return "Mutual cite";
    case "forward-reference":
      return "Forward reference";
    case "framing-alignment":
      return "Framing alignment";
  }
}
function ResearchPage({ onClose, onOpenURL }) {
  const [view, setView] = reactExports.useState({
    kind: "idle",
    query: "",
    brief: null,
    papers: [],
    topicId: null
  });
  const [topics, setTopics] = reactExports.useState([]);
  const [draft, setDraft] = reactExports.useState("");
  const [selectedPaper, setSelectedPaper] = reactExports.useState(null);
  const [bookmarkedIds, setBookmarkedIds] = reactExports.useState(/* @__PURE__ */ new Set());
  const [pdfReader, setPdfReader] = reactExports.useState(null);
  const [recentSearches, setRecentSearches] = reactExports.useState([]);
  const [chainPaper, setChainPaper] = reactExports.useState(null);
  const inputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    let cancelled = false;
    void window.api.research.listBookmarks().then((rows) => {
      if (cancelled) return;
      setBookmarkedIds(new Set(rows.map((r) => r.paperId)));
    }).catch(() => {
    });
    void window.api.research.listRecent(10).then((rows) => {
      if (cancelled) return;
      setRecentSearches(rows);
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const reloadRecent = reactExports.useCallback(async () => {
    try {
      const rows = await window.api.research.listRecent(10);
      setRecentSearches(rows);
    } catch (err) {
      console.warn("[research] listRecent failed:", err);
    }
  }, []);
  const removeRecent = reactExports.useCallback(
    async (query) => {
      setRecentSearches((prev) => prev.filter((r) => r.query !== query));
      try {
        await window.api.research.clearRecent(query);
      } catch (err) {
        console.warn("[research] clearRecent failed:", err);
        void reloadRecent();
      }
    },
    [reloadRecent]
  );
  const toggleBookmark = reactExports.useCallback(
    async (paper) => {
      const isBookmarked = bookmarkedIds.has(paper.paperId);
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (isBookmarked) next.delete(paper.paperId);
        else next.add(paper.paperId);
        return next;
      });
      try {
        if (isBookmarked) {
          await window.api.research.unbookmark(paper.paperId);
        } else {
          await window.api.research.bookmark(paper);
        }
      } catch (err) {
        console.warn("[research] bookmark toggle failed:", err);
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          if (isBookmarked) next.add(paper.paperId);
          else next.delete(paper.paperId);
          return next;
        });
      }
    },
    [bookmarkedIds]
  );
  const [bridges, setBridges] = reactExports.useState([]);
  const [bookmarksMode, setBookmarksMode] = reactExports.useState("list");
  const [graphOpen, setGraphOpen] = reactExports.useState(false);
  const [graphFocus, setGraphFocus] = reactExports.useState(null);
  const [bookmarksFull, setBookmarksFull] = reactExports.useState([]);
  const [foundationalEdges, setFoundationalEdges] = reactExports.useState([]);
  const [bookmarkTopicLinks, setBookmarkTopicLinks] = reactExports.useState([]);
  const reloadMapData = reactExports.useCallback(async () => {
    try {
      const [bms, edges2, links] = await Promise.all([
        window.api.research.listBookmarks(),
        window.api.research.listBookmarkFoundationalEdges(),
        window.api.research.listAllBookmarkTopicLinks()
      ]);
      setBookmarksFull(bms);
      setFoundationalEdges(edges2);
      setBookmarkTopicLinks(links);
    } catch (err) {
      console.warn("[research] reloadMapData failed:", err);
    }
  }, []);
  const reloadBridges = reactExports.useCallback(async () => {
    try {
      const list = await window.api.research.listBridgePapers();
      setBridges(list);
    } catch (err) {
      console.warn("[research] listBridgePapers failed:", err);
      setBridges([]);
    }
  }, []);
  const openBookmarks = reactExports.useCallback(async () => {
    try {
      const rows = await window.api.research.listBookmarks();
      setView({
        kind: "bookmarks",
        query: "",
        brief: null,
        papers: rows.map((r) => r.paper),
        topicId: null
      });
      setBookmarkedIds(new Set(rows.map((r) => r.paperId)));
      setSelectedPaper(null);
      setDraft("");
      void reloadBridges();
      void reloadMapData();
    } catch (err) {
      console.warn("[research] listBookmarks failed:", err);
    }
  }, [reloadBridges, reloadMapData]);
  const [topicBookmarks, setTopicBookmarks] = reactExports.useState([]);
  const [tagsRevision, setTagsRevision] = reactExports.useState(0);
  const onTagsChanged = reactExports.useCallback(() => {
    setTagsRevision((r) => r + 1);
    if (view.kind === "topic" && view.topicId !== null) {
      const tid = view.topicId;
      void window.api.research.listBookmarksForTopic(tid).then(setTopicBookmarks).catch(() => {
      });
    }
  }, [view]);
  reactExports.useEffect(() => {
    if (view.kind !== "bookmarks") return;
    void reloadBridges();
    void reloadMapData();
  }, [bookmarkedIds, tagsRevision, view.kind]);
  const reloadTopics = reactExports.useCallback(async () => {
    const list = await window.api.research.listTopics();
    setTopics(list);
  }, []);
  const viewRef = reactExports.useRef(view);
  reactExports.useEffect(() => {
    viewRef.current = view;
  }, [view]);
  reactExports.useEffect(() => {
    void reloadTopics();
    const unsub = window.api.research.onTopicUpdated((topicId) => {
      void reloadTopics();
      if (viewRef.current.topicId !== topicId) return;
      void window.api.research.getBrief(topicId).then((row) => {
        if (!row) {
          setView((prev) => prev.topicId === topicId ? { ...prev, kind: "topic" } : prev);
          return;
        }
        setView(
          (prev) => prev.topicId === topicId ? { ...prev, kind: "topic", brief: row.payload } : prev
        );
      }).catch((err) => {
        console.warn("[research] getBrief after topic update failed:", err);
        setView((prev) => prev.topicId === topicId ? { ...prev, kind: "topic" } : prev);
      });
    });
    return unsub;
  }, [reloadTopics]);
  reactExports.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const runSearch = reactExports.useCallback(async (query) => {
    const q = query.trim();
    if (!q) return;
    setView({ kind: "loading", query: q, brief: null, papers: [], topicId: null });
    setSelectedPaper(null);
    void window.api.research.recordRecent(q).then(() => reloadRecent()).catch(() => {
    });
    try {
      const papers = await window.api.research.searchPapersOnly(q);
      setView({ kind: "results", query: q, brief: null, papers, topicId: null });
      if (papers.length === 0) return;
      const brief = await window.api.research.synthesize(q, papers);
      setView((prev) => prev.query === q && prev.kind === "results" ? { ...prev, brief } : prev);
    } catch (err) {
      console.warn("[research] search failed:", err);
      setView({ kind: "idle", query: q, brief: null, papers: [], topicId: null });
    }
  }, []);
  const onSubmit = (e) => {
    e.preventDefault();
    void runSearch(draft);
  };
  const saveCurrentQuery = async () => {
    if (!view.query) return;
    if (topics.some((t) => t.query.toLowerCase() === view.query.toLowerCase())) return;
    const topic = await window.api.research.createTopic({ query: view.query });
    await reloadTopics();
    setView((prev) => ({ ...prev, kind: "topic", topicId: topic.id }));
  };
  const openTopic = async (topic) => {
    setView({
      kind: "loading",
      query: topic.query,
      brief: null,
      papers: [],
      topicId: topic.id
    });
    setDraft(topic.query);
    setSelectedPaper(null);
    void window.api.research.listBookmarksForTopic(topic.id).then(setTopicBookmarks).catch(() => setTopicBookmarks([]));
    const row = await window.api.research.getBrief(topic.id);
    if (row) {
      const papers = await window.api.research.hydratePapers(row.paperIds);
      setView({
        kind: "topic",
        query: topic.query,
        brief: row.payload,
        papers,
        topicId: topic.id
      });
    } else {
      await window.api.research.refreshTopic(topic.id);
      const result = await window.api.research.search(topic.query);
      setView({
        kind: "topic",
        query: topic.query,
        brief: result.brief,
        papers: result.papers,
        topicId: topic.id
      });
    }
  };
  const deleteTopic = async (id) => {
    await window.api.research.deleteTopic(id);
    await reloadTopics();
    if (view.topicId === id) {
      setView({ kind: "idle", query: "", brief: null, papers: [], topicId: null });
      setDraft("");
    }
  };
  const refreshCurrent = async () => {
    if (view.topicId !== null) {
      const topicId = view.topicId;
      setView((prev) => ({ ...prev, kind: "loading" }));
      try {
        await window.api.research.refreshTopic(topicId);
      } catch (err) {
        console.warn("[research] refreshTopic failed:", err);
        setView((prev) => prev.topicId === topicId ? { ...prev, kind: "topic" } : prev);
      }
    } else {
      await runSearch(view.query);
    }
  };
  const querySaved = reactExports.useMemo(
    () => view.query && topics.some((t) => t.query.toLowerCase() === view.query.toLowerCase()),
    [topics, view.query]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-6 pt-6 pb-4 flex items-end justify-between gap-6 flex-wrap border-b border-edge", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-400/90 mb-1.5", children: "Academic synthesis · Semantic Scholar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[28px] leading-none font-bold text-zinc-50 tracking-tight", children: "Research" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit, className: "mt-4 flex items-center gap-2 max-w-[640px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: inputRef,
              type: "text",
              value: draft,
              onChange: (e) => setDraft(e.target.value),
              placeholder: "e.g. transformer attention mechanisms, RDMA networking, GPU scheduling…",
              className: "flex-1 bg-surface-1 ring-1 ring-inset ring-edge rounded-md px-3 py-2 text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-violet-500/40"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "submit",
              disabled: !draft.trim() || view.kind === "loading",
              className: "px-4 py-2 rounded-md bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 text-[11px] font-semibold uppercase tracking-[0.18em] hover:bg-violet-500/25 disabled:opacity-50",
              children: view.kind === "loading" ? "Synthesizing…" : "Search"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setGraphOpen((v) => !v),
          className: "px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] " + (graphOpen ? "bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-500/40" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"),
          children: "Graph"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onClose,
          className: "px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
          children: "Close"
        }
      )
    ] }),
    graphOpen ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      ResearchGraph,
      {
        focusPaperId: graphFocus,
        onFocusPaper: (id) => setGraphFocus(id || null),
        onSelectPaper: setSelectedPaper,
        onOpenURL: (url, title, subtitle) => onOpenURL(url, title, subtitle ?? null)
      }
    ) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-h-0 flex overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0 overflow-y-auto px-6 py-5", children: [
        chainPaper && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mb-5 rounded-lg border border-violet-500/30 bg-violet-500/[0.04] p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-baseline justify-between mb-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.22em] text-violet-300 font-semibold", children: "Paper value chain" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-zinc-100 mt-0.5 truncate", title: chainPaper.title, children: chainPaper.title })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => setChainPaper(null),
                className: "text-[11px] text-zinc-400 hover:text-zinc-100 shrink-0",
                children: "Close ×"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            PaperValueChainCard,
            {
              paper: chainPaper,
              onOpenPaperById: (paperId) => {
                const found = view.papers.find((p) => p.paperId === paperId);
                if (found) setSelectedPaper(found);
              },
              onOpenPdf: (input) => {
                setPdfReader(input);
              }
            }
          )
        ] }),
        (topics.length > 0 || bookmarkedIds.size > 0 || recentSearches.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsx(
          SavedTopicsStrip,
          {
            topics,
            activeId: view.topicId,
            onOpen: openTopic,
            onDelete: deleteTopic,
            bookmarksCount: bookmarkedIds.size,
            isBookmarksActive: view.kind === "bookmarks",
            onOpenBookmarks: openBookmarks,
            recentSearches,
            activeQuery: view.kind === "results" ? view.query : null,
            onRunRecent: (q) => {
              setDraft(q);
              void runSearch(q);
            },
            onRemoveRecent: (q) => void removeRecent(q)
          }
        ),
        view.kind === "idle" && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ResearchDiscover,
          {
            onSelectPaper: setSelectedPaper,
            onSearch: (q) => {
              setDraft(q);
              void runSearch(q);
            },
            onBuildGraph: (p) => {
              setGraphFocus(p.paperId);
              setGraphOpen(true);
            }
          }
        ),
        view.kind === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-12 text-center text-[12px] text-zinc-500", children: "Searching Semantic Scholar…" }),
        view.kind === "results" && !view.brief && view.papers.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400", children: [
          "Synthesizing brief across ",
          view.papers.length,
          " papers… (~20-40s)"
        ] }),
        view.brief && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ResearchBriefCard,
          {
            brief: view.brief,
            query: view.query,
            isTopic: view.kind === "topic",
            querySaved: !!querySaved,
            onSaveTopic: saveCurrentQuery,
            onRefresh: refreshCurrent,
            onOpenPaperById: (paperId) => {
              const found = view.papers.find((p) => p.paperId === paperId);
              if (found) setSelectedPaper(found);
            }
          }
        ),
        view.kind === "topic" && topicBookmarks.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          PaperList,
          {
            papers: topicBookmarks.map((b) => b.paper),
            onSelect: (p) => setSelectedPaper(p),
            selectedId: selectedPaper?.paperId ?? null,
            onOpenURL,
            onOpenPdfInline: (url, title, subtitle) => setPdfReader({ url, title, subtitle }),
            bookmarkedIds,
            onToggleBookmark: (p) => void toggleBookmark(p),
            onOpenChain: (p) => setChainPaper(p),
            title: "Your tagged bookmarks"
          }
        ),
        view.kind === "bookmarks" && view.papers.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-12 text-center text-[12px] text-zinc-500", children: "No bookmarked papers yet. Hit ☆ on a paper card to save it." }),
        view.kind === "bookmarks" && view.papers.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 mb-4 flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mr-1", children: "View" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setBookmarksMode("list"),
              className: `text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full transition-colors ${bookmarksMode === "list" ? "bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/40" : "text-zinc-400 ring-1 ring-inset ring-edge hover:text-zinc-100"}`,
              children: "List"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setBookmarksMode("map"),
              className: `text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full transition-colors ${bookmarksMode === "map" ? "bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/40" : "text-zinc-400 ring-1 ring-inset ring-edge hover:text-zinc-100"}`,
              children: "Map"
            }
          )
        ] }),
        view.kind === "bookmarks" && bookmarksMode === "map" && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ResearchMap,
          {
            bookmarks: bookmarksFull,
            edges: foundationalEdges,
            topicLinks: bookmarkTopicLinks,
            selectedId: selectedPaper?.paperId ?? null,
            onSelect: (p) => setSelectedPaper(p)
          }
        ),
        (view.kind !== "bookmarks" || bookmarksMode === "list") && view.kind === "bookmarks" && bridges.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          BridgePapersSection,
          {
            bridges,
            bookmarkedIds,
            onToggleBookmark: (p) => void toggleBookmark(p),
            onSelect: (p) => setSelectedPaper(p),
            onOpenURL,
            onOpenPdfInline: (url, title, subtitle) => setPdfReader({ url, title, subtitle })
          }
        ),
        (view.kind !== "bookmarks" || bookmarksMode === "list") && view.papers.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          PaperList,
          {
            papers: view.papers,
            onSelect: (p) => setSelectedPaper(p),
            selectedId: selectedPaper?.paperId ?? null,
            onOpenURL,
            onOpenPdfInline: (url, title, subtitle) => setPdfReader({ url, title, subtitle }),
            bookmarkedIds,
            onToggleBookmark: (p) => void toggleBookmark(p),
            onOpenChain: (p) => setChainPaper(p),
            title: view.kind === "bookmarks" ? "Bookmarks" : "Papers"
          }
        )
      ] }),
      pdfReader ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        PdfReaderPane,
        {
          state: pdfReader,
          onClose: () => setPdfReader(null)
        }
      ) : selectedPaper && /* @__PURE__ */ jsxRuntimeExports.jsx(
        PaperDetailPanel,
        {
          paper: selectedPaper,
          onClose: () => setSelectedPaper(null),
          onOpenURL,
          onOpenPdfInline: (url, title, subtitle) => setPdfReader({ url, title, subtitle }),
          onSelectPaper: setSelectedPaper,
          isBookmarked: bookmarkedIds.has(selectedPaper.paperId),
          onToggleBookmark: () => void toggleBookmark(selectedPaper),
          availableTopics: topics,
          tagsRevision,
          onTagsChanged
        }
      )
    ] })
  ] });
}
function PdfReaderPane({
  state,
  onClose
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "w-[640px] xl:w-[760px] shrink-0 border-l border-edge bg-surface-1 flex flex-col min-h-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-4 py-2.5 border-b border-edge flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300", children: "PDF · in-window" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-w-0 flex-1 truncate text-[12px] text-zinc-300", title: state.title, children: state.title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onClose,
          className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-100 px-2 py-0.5 shrink-0",
          children: "Close ×"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "webview",
      {
        src: state.pageOffset ? `${state.url}#page=${state.pageOffset}` : state.url,
        className: "flex-1 min-h-0",
        partition: "persist:pdfreader",
        style: { width: "100%", height: "100%", display: "flex" }
      }
    )
  ] });
}
function SavedTopicsStrip({
  topics,
  activeId,
  onOpen,
  onDelete,
  bookmarksCount,
  isBookmarksActive,
  onOpenBookmarks,
  recentSearches,
  activeQuery,
  onRunRecent,
  onRemoveRecent
}) {
  const topicQueries = new Set(topics.map((t) => t.query.toLowerCase()));
  const filteredRecent = recentSearches.filter(
    (r) => !topicQueries.has(r.query.toLowerCase())
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-5 space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2", children: "Saved" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1.5", children: [
        bookmarksCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: onOpenBookmarks,
            title: "Browse your bookmarked papers",
            className: `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${isBookmarksActive ? "border-sky-400/60 bg-sky-500/15 text-sky-200" : "border-edge bg-surface-1 text-zinc-300 hover:border-sky-500/40 hover:text-sky-300"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "★ Bookmarks" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums opacity-70", children: bookmarksCount })
            ]
          }
        ),
        topics.map((t) => {
          const active = t.id === activeId;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: `group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${active ? "border-violet-400/50 bg-violet-500/10 text-violet-200" : "border-edge bg-surface-1 text-zinc-300 hover:border-zinc-500"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onOpen(t), className: "text-left", children: t.label || t.query }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => onDelete(t.id),
                    title: "Remove topic",
                    className: "opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity",
                    children: "×"
                  }
                )
              ]
            },
            t.id
          );
        })
      ] })
    ] }),
    filteredRecent.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2", children: "Recent" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: filteredRecent.map((r) => {
        const active = activeQuery !== null && r.query.toLowerCase() === activeQuery.toLowerCase();
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: `group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${active ? "border-zinc-400/60 bg-zinc-500/15 text-zinc-100" : "border-edge/70 bg-surface-1/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => onRunRecent(r.query),
                  className: "text-left",
                  title: `Searched ${r.searchCount}× — click to re-run`,
                  children: r.query
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => onRemoveRecent(r.query),
                  title: "Remove from recents",
                  className: "opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity",
                  children: "×"
                }
              )
            ]
          },
          r.query
        );
      }) })
    ] })
  ] });
}
const SECTION_TONE$1 = {
  findings: { glyph: "◆", tone: "text-violet-300", tint: "border-violet-500/30" },
  trends: { glyph: "↗", tone: "text-sky-300", tint: "border-sky-500/30" },
  methods: { glyph: "⚙", tone: "text-emerald-300", tint: "border-emerald-500/30" },
  datasets: { glyph: "◧", tone: "text-amber-300", tint: "border-amber-500/30" },
  "open-questions": { glyph: "?", tone: "text-rose-300", tint: "border-rose-500/30" },
  notable: { glyph: "★", tone: "text-fuchsia-300", tint: "border-fuchsia-500/30" }
};
function sectionStyle$1(kind) {
  return SECTION_TONE$1[kind] ?? { glyph: "·", tone: "text-zinc-300", tint: "border-zinc-600/40" };
}
function ResearchBriefCard({
  brief,
  query,
  isTopic,
  querySaved,
  onSaveTopic,
  onRefresh,
  onOpenPaperById
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-950/30 via-surface-1 to-surface-1 px-5 py-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-300", children: "◆ Synthesis" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: "·" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 truncate", children: [
            '"',
            query,
            '"'
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: "·" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500", children: [
            brief.inputs.papersFiltered,
            " of ",
            brief.inputs.papersConsidered,
            " papers"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[15px] font-semibold text-zinc-50 leading-snug max-w-[820px]", children: brief.headline })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 shrink-0", children: [
        !isTopic && !querySaved && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onSaveTopic,
            title: "Save this query as a topic — Pulse refreshes the brief weekly",
            className: "text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25",
            children: "＋ Save topic"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onRefresh,
            title: "Re-synthesize from a fresh paper search",
            className: "text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
            children: "↻ Refresh"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: brief.sections.map((section, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      BriefSection,
      {
        section,
        onOpenPaperById
      },
      `${section.kind}-${i}`
    )) })
  ] });
}
function BriefSection({
  section,
  onOpenPaperById
}) {
  const style = sectionStyle$1(section.kind);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: `pl-3 border-l ${style.tint}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[12px] leading-none ${style.tone}`, children: style.glyph }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "h3",
        {
          className: `text-[10px] font-semibold uppercase tracking-[0.24em] ${style.tone}`,
          children: section.title
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1.5", children: section.bullets.map((b, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(BriefBullet, { bullet: b, onOpenPaperById }, i)) })
  ] });
}
function BriefBullet({
  bullet,
  onOpenPaperById
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2 leading-relaxed", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600 select-none mt-[2px]", children: "·" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12.5px] text-zinc-200", children: bullet.text }),
      bullet.citations.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 flex flex-wrap gap-1", children: bullet.citations.map((c, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onOpenPaperById(c.paperId),
          title: `Open ${c.label}`,
          className: "shrink-0 inline-flex items-center px-1.5 py-[1px] rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200 text-[9.5px] font-semibold uppercase tracking-[0.16em] hover:bg-violet-500/20 transition-colors",
          children: c.label
        },
        i
      )) })
    ] })
  ] });
}
function PaperList({
  papers,
  onSelect,
  selectedId,
  onOpenURL,
  onOpenPdfInline,
  bookmarkedIds,
  onToggleBookmark,
  onOpenChain,
  title = "Papers"
}) {
  const [collapsed, setCollapsed] = useCollapsedSection("researchPapers", false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setCollapsed((c) => !c),
        className: "w-full flex items-center gap-3 mb-3 group",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 group-hover:text-zinc-200", children: title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: papers.length }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CollapseChevron, { open: !collapsed })
        ]
      }
    ),
    !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: papers.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      PaperCard,
      {
        paper: p,
        selected: p.paperId === selectedId,
        onSelect: () => onSelect(p),
        onOpenURL,
        onOpenPdfInline,
        isBookmarked: bookmarkedIds.has(p.paperId),
        onToggleBookmark: () => onToggleBookmark(p),
        onOpenChain: onOpenChain ? () => onOpenChain(p) : void 0
      },
      p.paperId
    )) })
  ] });
}
function BridgePapersSection({
  bridges,
  bookmarkedIds,
  onToggleBookmark,
  onSelect,
  onOpenURL,
  onOpenPdfInline
}) {
  const [collapsed, setCollapsed] = useCollapsedSection("researchBridges", false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-2 mb-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setCollapsed((c) => !c),
        className: "w-full flex items-center gap-3 mb-3 group",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] leading-none text-amber-300", children: "▲" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300 group-hover:text-amber-200", children: "Suggested" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 normal-case tracking-normal", children: "papers cited as foundational by 2+ of your bookmarks" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-amber-500/20" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-amber-300/80", children: bridges.length }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CollapseChevron, { open: !collapsed })
        ]
      }
    ),
    !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: bridges.map((b) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "rounded-lg border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => onSelect(b.paper), className: "w-full text-left min-w-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "span",
              {
                className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-200 ring-1 ring-inset ring-amber-500/30 shrink-0 tabular-nums",
                title: `Cited as foundational by ${b.citedByBookmarkCount} of your bookmarks`,
                children: [
                  b.citedByBookmarkCount,
                  "× foundational"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-zinc-100 leading-snug", children: b.paper.title }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] text-zinc-500 truncate", children: [
                b.paper.authors.slice(0, 3).join(", "),
                b.paper.authors.length > 3 && " et al.",
                b.paper.year && ` · ${b.paper.year}`,
                b.paper.venue && ` · ${b.paper.venue}`
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1.5 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                  b.paper.citationCount.toLocaleString(),
                  " citations"
                ] }),
                b.paper.influentialCitationCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-violet-300", children: [
                  b.paper.influentialCitationCount,
                  " influential"
                ] })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onToggleBookmark(b.paper);
                },
                title: bookmarkedIds.has(b.paper.paperId) ? "Remove bookmark" : "Add to bookmarks",
                className: `text-[11px] leading-none px-2 py-0.5 rounded-full transition-colors ${bookmarkedIds.has(b.paper.paperId) ? "bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/30" : "text-zinc-400 hover:text-sky-300 hover:bg-sky-500/10 ring-1 ring-inset ring-edge"}`,
                children: bookmarkedIds.has(b.paper.paperId) ? "★ Bookmarked" : "☆ Bookmark"
              }
            ),
            b.paper.pdfUrl && onOpenPdfInline && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onOpenPdfInline(b.paper.pdfUrl, b.paper.title, b.paper.venue);
                },
                className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25",
                children: "PDF"
              }
            ),
            b.paper.url && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onOpenURL(b.paper.url, b.paper.title, b.paper.venue);
                },
                className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
                children: "Source ↗"
              }
            )
          ] })
        ]
      },
      b.paper.paperId
    )) })
  ] });
}
function PaperCard({
  paper,
  selected,
  onSelect,
  onOpenURL,
  onOpenPdfInline,
  isBookmarked,
  onToggleBookmark,
  onOpenChain
}) {
  const authorLine = paper.authors.length === 0 ? "—" : paper.authors.length <= 3 ? paper.authors.join(", ") : `${paper.authors.slice(0, 3).join(", ")} et al.`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `rounded-lg border bg-surface-1 px-4 py-3 transition-colors ${selected ? "border-violet-500/50 bg-violet-500/5" : "border-edge/70 hover:border-edge"}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: onSelect, className: "w-full text-left min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-zinc-100 leading-snug", children: paper.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] text-zinc-500 truncate", children: [
            authorLine,
            paper.year && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              " · ",
              paper.year
            ] }),
            paper.venue && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              " · ",
              paper.venue
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1.5 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              paper.citationCount.toLocaleString(),
              " citations"
            ] }),
            paper.influentialCitationCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-violet-300", children: [
              paper.influentialCitationCount,
              " influential"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: (e) => {
                e.stopPropagation();
                onToggleBookmark();
              },
              title: isBookmarked ? "Remove bookmark" : "Bookmark this paper",
              "aria-label": isBookmarked ? "Remove bookmark" : "Bookmark",
              className: `text-[11px] leading-none px-2 py-0.5 rounded-full transition-colors ${isBookmarked ? "bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/30" : "text-zinc-500 hover:text-sky-300 hover:bg-sky-500/10"}`,
              children: isBookmarked ? "★" : "☆"
            }
          ),
          (paper.pdfUrl || paper.url) && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: (e) => {
                e.stopPropagation();
                if (paper.pdfUrl && onOpenPdfInline) {
                  onOpenPdfInline(paper.pdfUrl, paper.title, paper.venue);
                } else if (paper.pdfUrl) {
                  onOpenURL(paper.pdfUrl, paper.title, paper.venue);
                } else if (paper.url) {
                  onOpenURL(paper.url, paper.title, paper.venue);
                }
              },
              className: paper.pdfUrl ? "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25" : "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
              children: paper.pdfUrl ? "Read PDF" : "Source ↗"
            }
          ),
          onOpenChain && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: (e) => {
                e.stopPropagation();
                onOpenChain();
              },
              title: "Generate a citation lineage chain for this paper",
              className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25",
              children: "Chain"
            }
          )
        ] })
      ]
    }
  );
}
function PaperDetailPanel({
  paper,
  onClose,
  onOpenURL,
  onOpenPdfInline,
  onSelectPaper,
  isBookmarked,
  onToggleBookmark,
  availableTopics,
  tagsRevision,
  onTagsChanged
}) {
  const [citing, setCiting] = reactExports.useState(null);
  const [refs, setRefs] = reactExports.useState(null);
  const [foundational, setFoundational] = reactExports.useState(null);
  const [foundationalFor, setFoundationalFor] = reactExports.useState(null);
  const [taggedTopics, setTaggedTopics] = reactExports.useState([]);
  const [tagMenuOpen, setTagMenuOpen] = reactExports.useState(false);
  const [similar, setSimilar] = reactExports.useState(null);
  const [tickerLinks, setTickerLinks] = reactExports.useState(null);
  const [linking, setLinking] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let cancelled = false;
    setCiting(null);
    setRefs(null);
    setFoundational(null);
    setFoundationalFor(null);
    void window.api.research.listCiting(paper.paperId).then((list) => {
      if (!cancelled) setCiting(list);
    });
    void window.api.research.listReferences(paper.paperId).then((list) => {
      if (!cancelled) setRefs(list);
    });
    void window.api.research.getFoundational(paper.paperId).then((list) => {
      if (!cancelled) setFoundational(list);
    });
    void window.api.research.getFoundationalFor(paper.paperId).then((list) => {
      if (!cancelled) setFoundationalFor(list);
    });
    setSimilar(null);
    void window.api.research.similar(paper.paperId, 6).then((list) => {
      if (!cancelled) setSimilar(list);
    }).catch(() => {
      if (!cancelled) setSimilar([]);
    });
    setTickerLinks(null);
    void window.api.research.linksForPaper(paper.paperId).then((list) => {
      if (!cancelled) setTickerLinks(list);
    }).catch(() => {
      if (!cancelled) setTickerLinks([]);
    });
    return () => {
      cancelled = true;
    };
  }, [paper.paperId]);
  reactExports.useEffect(() => {
    let cancelled = false;
    if (!isBookmarked) {
      setTaggedTopics([]);
      return;
    }
    void window.api.research.listTopicsForBookmark(paper.paperId).then((list) => {
      if (!cancelled) setTaggedTopics(list);
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [paper.paperId, isBookmarked, tagsRevision]);
  const handleTag = async (topicId) => {
    const topic = availableTopics.find((t) => t.id === topicId);
    if (!topic) return;
    setTaggedTopics((prev) => prev.some((t) => t.id === topicId) ? prev : [...prev, topic]);
    setTagMenuOpen(false);
    try {
      await window.api.research.tagBookmark(paper.paperId, topicId);
      onTagsChanged();
    } catch (err) {
      console.warn("[research] tagBookmark failed:", err);
      setTaggedTopics((prev) => prev.filter((t) => t.id !== topicId));
    }
  };
  const handleUntag = async (topicId) => {
    const removed = taggedTopics.find((t) => t.id === topicId);
    setTaggedTopics((prev) => prev.filter((t) => t.id !== topicId));
    try {
      await window.api.research.untagBookmark(paper.paperId, topicId);
      onTagsChanged();
    } catch (err) {
      console.warn("[research] untagBookmark failed:", err);
      if (removed) {
        setTaggedTopics((prev) => [...prev, removed]);
      }
    }
  };
  const taggedIds = new Set(taggedTopics.map((t) => t.id));
  const untaggedTopics = availableTopics.filter((t) => !taggedIds.has(t.id));
  const authorLine = paper.authors.length === 0 ? "—" : paper.authors.length <= 4 ? paper.authors.join(", ") : `${paper.authors.slice(0, 4).join(", ")} et al.`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "w-[400px] shrink-0 border-l border-edge bg-surface-1 flex flex-col min-h-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-4 py-3 border-b border-edge flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: "Paper detail" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onClose,
          className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-100 px-2 py-0.5",
          children: "Close ×"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[14px] font-semibold text-zinc-50 leading-snug", children: paper.title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[11px] text-zinc-400", children: authorLine }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-0.5 text-[11px] text-zinc-500", children: [
          paper.year ?? "—",
          paper.venue && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            " · ",
            paper.venue
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            paper.citationCount.toLocaleString(),
            " citations"
          ] }),
          paper.influentialCitationCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-violet-300", children: [
            paper.influentialCitationCount,
            " influential"
          ] })
        ] }),
        paper.abstract && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[12.5px] leading-relaxed text-zinc-300", children: paper.abstract }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center gap-2 flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onToggleBookmark,
              className: `text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full transition-colors ${isBookmarked ? "bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/30" : "text-zinc-400 ring-1 ring-inset ring-edge hover:text-sky-300 hover:ring-sky-500/40"}`,
              children: isBookmarked ? "★ Bookmarked" : "☆ Bookmark"
            }
          ),
          paper.pdfUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => onOpenPdfInline(paper.pdfUrl, paper.title, paper.venue),
              className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25",
              children: "Read PDF here"
            }
          ),
          paper.pdfUrl && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => onOpenURL(paper.pdfUrl, paper.title, paper.venue),
              className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
              title: "Open in the full-screen reader",
              children: "Open external ↗"
            }
          ),
          paper.url && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => onOpenURL(paper.url, paper.title, paper.venue),
              className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
              children: "View source ↗"
            }
          )
        ] }),
        isBookmarked && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-start flex-wrap gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mt-1 mr-1 shrink-0", children: "Topics" }),
          taggedTopics.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border border-violet-400/40 bg-violet-500/10 text-violet-200",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t.label || t.query }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => void handleUntag(t.id),
                    title: "Remove tag",
                    className: "opacity-50 group-hover:opacity-100 hover:text-rose-300 transition-opacity",
                    children: "×"
                  }
                )
              ]
            },
            t.id
          )),
          untaggedTopics.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setTagMenuOpen((o) => !o),
                className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full text-zinc-400 ring-1 ring-inset ring-edge hover:text-violet-300 hover:ring-violet-500/40",
                children: "+ Tag"
              }
            ),
            tagMenuOpen && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute z-20 mt-1 left-0 min-w-[200px] max-h-[260px] overflow-y-auto rounded-md border border-edge bg-surface-2 shadow-xl py-1", children: untaggedTopics.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => void handleTag(t.id),
                className: "w-full text-left px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-violet-500/10 hover:text-violet-200",
                children: t.label || t.query
              },
              t.id
            )) })
          ] }),
          availableTopics.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600 italic", children: "Save a topic to tag bookmarks with it" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        LineageList,
        {
          title: "Built on",
          subtitle: "Foundational papers this work explicitly builds on (S2 isInfluential + intent in background/methodology/extension)",
          papers: foundational,
          onSelectPaper,
          accent: "amber",
          glyph: "▲"
        }
      ),
      foundationalFor && foundationalFor.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
        LineageList,
        {
          title: "Foundational for",
          subtitle: "Bookmarks that name this paper as foundational",
          papers: foundationalFor,
          onSelectPaper,
          accent: "amber",
          glyph: "▲"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        LineageList,
        {
          title: "Cited by",
          subtitle: "Top influential papers that cite this work",
          papers: citing,
          onSelectPaper
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        LineageList,
        {
          title: "References",
          subtitle: "Top-cited papers this work references (full bibliography)",
          papers: refs,
          onSelectPaper
        }
      ),
      similar && similar.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-[11px] font-semibold uppercase tracking-wider text-sky-300", children: "Semantically similar" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-[10px] text-zinc-500", children: "Nearest SPECTER2 neighbours in your library — related work, not citations" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-1.5 space-y-1", children: similar.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center gap-2 text-[11px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "shrink-0 tabular-nums text-zinc-500", children: [
            (s.score * 100).toFixed(0),
            "%"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate text-zinc-300", children: s.paperId })
        ] }, s.paperId)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-[11px] font-semibold uppercase tracking-wider text-emerald-300", children: "Related companies" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: async () => {
                setLinking(true);
                try {
                  const links = await window.api.research.linkTickers({
                    paperId: paper.paperId,
                    title: paper.title,
                    abstract: paper.abstract
                  });
                  setTickerLinks(links);
                } catch (err) {
                  console.warn("[research] linkTickers failed:", err);
                } finally {
                  setLinking(false);
                }
              },
              disabled: linking,
              className: "rounded px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/10 disabled:opacity-50",
              children: linking ? "Linking…" : tickerLinks && tickerLinks.length > 0 ? "Regenerate" : "Find"
            }
          )
        ] }),
        tickerLinks && tickerLinks.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-1.5 space-y-1", children: tickerLinks.map((l) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "text-[11px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-zinc-200", children: l.symbol }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1 tabular-nums text-zinc-500", children: [
            (l.confidence * 100).toFixed(0),
            "%"
          ] }),
          l.rationale && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1 text-zinc-400", children: [
            "— ",
            l.rationale
          ] })
        ] }, l.symbol)) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-[10px] text-zinc-500", children: tickerLinks === null ? "Loading…" : "No links yet — Find asks Claude which tracked companies this bears on." })
      ] })
    ] })
  ] });
}
function LineageList({
  title,
  subtitle,
  papers,
  onSelectPaper,
  accent,
  glyph
}) {
  const titleTone = accent === "amber" ? "text-amber-300" : "text-zinc-400";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
      glyph && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[12px] leading-none ${titleTone}`, children: glyph }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "h4",
        {
          className: `text-[10px] font-semibold uppercase tracking-[0.22em] ${titleTone}`,
          children: title
        }
      ),
      papers !== null && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-600", children: papers.length })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-zinc-600 mb-2", children: subtitle }),
    papers === null ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500", children: "Loading…" }) : papers.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500", children: "No data" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1.5", children: papers.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => onSelectPaper(p),
        className: "w-full text-left rounded px-2 py-1.5 hover:bg-surface-2 transition-colors",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-200 leading-snug truncate", children: p.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-zinc-500 truncate", children: [
            p.authors.slice(0, 2).join(", "),
            p.authors.length > 2 && " et al.",
            p.year && ` · ${p.year}`,
            p.influentialCitationCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-violet-400", children: [
              " · ",
              p.influentialCitationCount,
              " influential"
            ] })
          ] })
        ]
      }
    ) }, p.paperId)) })
  ] });
}
const stages = [
  {
    id: "raw-materials",
    label: "Raw Materials & Specialty Chemicals"
  },
  {
    id: "equipment-ip",
    label: "Semi Equipment, EDA & IP"
  },
  {
    id: "foundry-memory",
    label: "Foundries & Memory Manufacturing"
  },
  {
    id: "fabless",
    label: "Fabless Chip Design"
  },
  {
    id: "components",
    label: "Networking, Optical & Storage Hardware"
  },
  {
    id: "infrastructure",
    label: "Data Center Power & Infrastructure"
  },
  {
    id: "systems",
    label: "OEMs, Servers & Consumer Devices"
  },
  {
    id: "cloud-software",
    label: "Cloud Platforms & Software"
  },
  {
    id: "end-markets",
    label: "Automotive, EVs & End Markets"
  }
];
const nodes = [
  {
    symbol: "MP",
    stage: "raw-materials",
    sector: "auto",
    name: "MP Materials",
    blurb: "Operates the Mountain Pass rare earth mine in California and is building U.S. rare earth magnet production for EV motors and defense."
  },
  {
    symbol: "ALB",
    stage: "raw-materials",
    sector: "auto",
    name: "Albemarle",
    blurb: "Global producer of lithium hydroxide and carbonate for battery cathodes, plus catalysts and bromine chemicals."
  },
  {
    symbol: "SQM",
    stage: "raw-materials",
    sector: "auto",
    name: "Sociedad Quimica y Minera",
    blurb: "Chilean miner producing lithium from Salar de Atacama brine, along with iodine and specialty fertilizers."
  },
  {
    symbol: "LAC",
    stage: "raw-materials",
    sector: "auto",
    name: "Lithium Americas",
    blurb: "Developing the Thacker Pass lithium project in Nevada, one of the largest known U.S. lithium resources."
  },
  {
    symbol: "FCX",
    stage: "raw-materials",
    sector: "auto",
    name: "Freeport-McMoRan",
    blurb: "One of the world's largest copper producers, with major operations at Grasberg and across the Americas."
  },
  {
    symbol: "LIN",
    stage: "raw-materials",
    sector: "semi",
    name: "Linde",
    blurb: "World's largest industrial gas supplier, providing high-purity atmospheric and specialty gases to semiconductor fabs and industry."
  },
  {
    symbol: "APD",
    stage: "raw-materials",
    sector: "semi",
    name: "Air Products",
    blurb: "Supplies atmospheric, process, and specialty gases to semiconductor, energy, and industrial customers via long-term on-site contracts."
  },
  {
    symbol: "ENTG",
    stage: "raw-materials",
    sector: "semi",
    name: "Entegris",
    blurb: "Provides ultra-pure materials, filtration, and chemical delivery systems specific to advanced semiconductor manufacturing."
  },
  {
    symbol: "DD",
    stage: "raw-materials",
    sector: "semi",
    name: "DuPont",
    blurb: "Produces photoresists, advanced packaging materials, and electronic chemistries for the semiconductor industry."
  },
  {
    symbol: "CE",
    stage: "raw-materials",
    sector: "semi",
    name: "Celanese",
    blurb: "Manufactures engineered polymers and acetyl products used in semiconductor packaging and industrial applications."
  },
  {
    symbol: "ASML",
    stage: "equipment-ip",
    sector: "semi",
    name: "ASML Holding",
    blurb: "Dutch equipment maker and sole global producer of extreme ultraviolet (EUV) lithography systems used for leading-edge chips."
  },
  {
    symbol: "AMAT",
    stage: "equipment-ip",
    sector: "semi",
    name: "Applied Materials",
    blurb: "Largest supplier of wafer fabrication equipment, including deposition, ion implant, CMP, and process control systems."
  },
  {
    symbol: "LRCX",
    stage: "equipment-ip",
    sector: "semi",
    name: "Lam Research",
    blurb: "Leader in plasma etch and atomic layer deposition systems, particularly dominant in 3D NAND memory manufacturing."
  },
  {
    symbol: "KLAC",
    stage: "equipment-ip",
    sector: "semi",
    name: "KLA Corporation",
    blurb: "Provides wafer inspection, reticle inspection, and metrology systems used to detect defects in chip production."
  },
  {
    symbol: "ONTO",
    stage: "equipment-ip",
    sector: "semi",
    name: "Onto Innovation",
    blurb: "Supplies optical metrology, inspection, and lithography software for semiconductor and advanced packaging lines."
  },
  {
    symbol: "UCTT",
    stage: "equipment-ip",
    sector: "semi",
    name: "Ultra Clean Holdings",
    blurb: "Supplies critical subsystems, gas delivery, and fluid handling modules to wafer fabrication equipment makers."
  },
  {
    symbol: "ACLS",
    stage: "equipment-ip",
    sector: "semi",
    name: "Axcelis Technologies",
    blurb: "Specializes in ion implantation systems, including high-energy implanters used for silicon carbide power devices."
  },
  {
    symbol: "TER",
    stage: "equipment-ip",
    sector: "semi",
    name: "Teradyne",
    blurb: "Provides automatic test equipment for semiconductors and industrial collaborative robots (Universal Robots)."
  },
  {
    symbol: "COHR",
    stage: "equipment-ip",
    sector: "semi",
    name: "Coherent Corp.",
    blurb: "Produces lasers, optical components, and photonic subsystems used in semiconductor tools, telecom, and industrial lasers."
  },
  {
    symbol: "CDNS",
    stage: "equipment-ip",
    sector: "semi",
    name: "Cadence Design Systems",
    blurb: "Electronic design automation software and silicon IP used by fabless and IDM companies to design chips."
  },
  {
    symbol: "SNPS",
    stage: "equipment-ip",
    sector: "semi",
    name: "Synopsys",
    blurb: "Provides EDA tools, verification, silicon IP, and software integrity solutions for semiconductor design."
  },
  {
    symbol: "ARM",
    stage: "equipment-ip",
    sector: "semi",
    name: "Arm Holdings",
    blurb: "Licenses CPU and GPU architectures used in nearly every smartphone and in a growing share of server and edge chips."
  },
  {
    symbol: "TSM",
    stage: "foundry-memory",
    sector: "semi",
    name: "Taiwan Semiconductor Manufacturing",
    blurb: "World's largest dedicated semiconductor foundry, manufacturing chips at leading-edge nodes for fabless designers."
  },
  {
    symbol: "INTC",
    stage: "foundry-memory",
    sector: "semi",
    name: "Intel",
    blurb: "Designs and manufactures x86 CPUs and is building third-party foundry services through Intel Foundry."
  },
  {
    symbol: "GFS",
    stage: "foundry-memory",
    sector: "semi",
    name: "GlobalFoundries",
    blurb: "Specialty foundry focused on RF, analog, and mature-node manufacturing for automotive, IoT, and communications."
  },
  {
    symbol: "UMC",
    stage: "foundry-memory",
    sector: "semi",
    name: "United Microelectronics",
    blurb: "Taiwanese foundry focused on mature and specialty process nodes for analog, RF, and embedded applications."
  },
  {
    symbol: "MU",
    stage: "foundry-memory",
    sector: "semi",
    name: "Micron Technology",
    blurb: "Manufactures DRAM, NAND flash, and high-bandwidth memory (HBM) for PCs, mobile, automotive, and AI data centers."
  },
  {
    symbol: "WDC",
    stage: "foundry-memory",
    sector: "semi",
    name: "Western Digital",
    blurb: "Produces hard drives and, via a joint venture with Kioxia, NAND flash for consumer and enterprise applications."
  },
  {
    symbol: "STX",
    stage: "foundry-memory",
    sector: "semi",
    name: "Seagate Technology",
    blurb: "Manufactures hard-disk drives with a focus on high-capacity nearline HDDs for cloud and enterprise data centers."
  },
  {
    symbol: "WOLF",
    stage: "foundry-memory",
    sector: "semi",
    name: "Wolfspeed",
    blurb: "Produces silicon carbide substrates and power devices used in EV powertrains and grid infrastructure."
  },
  {
    symbol: "NVDA",
    stage: "fabless",
    sector: "semi",
    name: "Nvidia",
    blurb: "Designs GPUs, AI accelerators, and networking silicon including the H100, H200, and Blackwell data-center platforms."
  },
  {
    symbol: "AMD",
    stage: "fabless",
    sector: "semi",
    name: "Advanced Micro Devices",
    blurb: "Fabless designer of x86 CPUs (EPYC, Ryzen), GPUs (Radeon), and Instinct MI-series AI accelerators."
  },
  {
    symbol: "AVGO",
    stage: "fabless",
    sector: "semi",
    name: "Broadcom",
    blurb: "Designs networking, wireless, and storage silicon, runs a leading custom ASIC business, and owns VMware."
  },
  {
    symbol: "QCOM",
    stage: "fabless",
    sector: "semi",
    name: "Qualcomm",
    blurb: "Designs Snapdragon mobile and PC SoCs, cellular modems, and automotive chips; operates a large IP licensing business."
  },
  {
    symbol: "MRVL",
    stage: "fabless",
    sector: "semi",
    name: "Marvell Technology",
    blurb: "Fabless designer of custom cloud silicon, networking chips, electro-optics, and storage controllers."
  },
  {
    symbol: "MCHP",
    stage: "fabless",
    sector: "semi",
    name: "Microchip Technology",
    blurb: "Produces microcontrollers, analog ICs, and FPGAs for industrial, automotive, and consumer applications."
  },
  {
    symbol: "ADI",
    stage: "fabless",
    sector: "semi",
    name: "Analog Devices",
    blurb: "Designs and manufactures analog, mixed-signal, and DSP chips with strength in industrial, comms, and automotive."
  },
  {
    symbol: "TXN",
    stage: "fabless",
    sector: "semi",
    name: "Texas Instruments",
    blurb: "Produces analog and embedded processing chips and operates its own fabs, focused on industrial and automotive markets."
  },
  {
    symbol: "ON",
    stage: "fabless",
    sector: "semi",
    name: "onsemi",
    blurb: "Designs silicon carbide power devices and image sensors with heavy automotive and EV exposure."
  },
  {
    symbol: "NXPI",
    stage: "fabless",
    sector: "semi",
    name: "NXP Semiconductors",
    blurb: "Supplies automotive processors, secure connectivity, and industrial chips, with leadership in auto MCUs and radar."
  },
  {
    symbol: "MPWR",
    stage: "fabless",
    sector: "semi",
    name: "Monolithic Power Systems",
    blurb: "Designs integrated power management ICs with significant exposure to AI data center GPU boards."
  },
  {
    symbol: "LSCC",
    stage: "fabless",
    sector: "semi",
    name: "Lattice Semiconductor",
    blurb: "Designs low-power programmable logic devices (FPGAs) for communications, industrial, and computing."
  },
  {
    symbol: "QRVO",
    stage: "fabless",
    sector: "semi",
    name: "Qorvo",
    blurb: "Designs RF front-end modules for mobile phones, infrastructure, and defense applications."
  },
  {
    symbol: "SWKS",
    stage: "fabless",
    sector: "semi",
    name: "Skyworks Solutions",
    blurb: "Designs RF front-end solutions with heavy revenue concentration in Apple's iPhone."
  },
  {
    symbol: "CRDO",
    stage: "fabless",
    sector: "semi",
    name: "Credo Technology",
    blurb: "Provides active electrical cables, retimers, and optical DSPs for high-speed data center and AI networking."
  },
  {
    symbol: "AMBA",
    stage: "fabless",
    sector: "semi",
    name: "Ambarella",
    blurb: "Designs low-power computer vision SoCs for security cameras, automotive ADAS, and robotics."
  },
  {
    symbol: "STM",
    stage: "fabless",
    sector: "semi",
    name: "STMicroelectronics",
    blurb: "European IDM with strength in microcontrollers, image sensors, and silicon carbide power electronics for automotive."
  },
  {
    symbol: "MBLY",
    stage: "fabless",
    sector: "semi",
    name: "Mobileye",
    blurb: "Designs EyeQ SoCs and software for advanced driver-assistance and autonomous driving; majority owned by Intel."
  },
  {
    symbol: "ANET",
    stage: "components",
    sector: "hardware",
    name: "Arista Networks",
    blurb: "Provides high-speed Ethernet switching platforms used in cloud and AI data center fabrics."
  },
  {
    symbol: "CSCO",
    stage: "components",
    sector: "hardware",
    name: "Cisco Systems",
    blurb: "Supplies networking, security, and collaboration hardware and software for enterprises and service providers."
  },
  {
    symbol: "JNPR",
    stage: "components",
    sector: "hardware",
    name: "Juniper Networks",
    blurb: "Makes routing, switching, and AI-driven networking products; being acquired by HPE."
  },
  {
    symbol: "LITE",
    stage: "components",
    sector: "hardware",
    name: "Lumentum",
    blurb: "Produces lasers, optical transceivers, and 3D sensing components for datacom, telecom, and consumer markets."
  },
  {
    symbol: "CIEN",
    stage: "components",
    sector: "hardware",
    name: "Ciena",
    blurb: "Supplies WaveLogic optical transport and metro networking systems used by service providers and hyperscalers."
  },
  {
    symbol: "FN",
    stage: "components",
    sector: "hardware",
    name: "Fabrinet",
    blurb: "Contract manufacturer specializing in complex optical, electro-mechanical, and automotive sub-assemblies."
  },
  {
    symbol: "PSTG",
    stage: "components",
    sector: "hardware",
    name: "Pure Storage",
    blurb: "Provides all-flash storage arrays and subscription-based data platforms for enterprise and hyperscale customers."
  },
  {
    symbol: "NTAP",
    stage: "components",
    sector: "hardware",
    name: "NetApp",
    blurb: "Provides hybrid cloud data services and storage systems; co-developed Azure NetApp Files with Microsoft."
  },
  {
    symbol: "FLEX",
    stage: "components",
    sector: "hardware",
    name: "Flex Ltd.",
    blurb: "Global contract manufacturer across automotive, healthcare, industrial, and cloud/data-center customers."
  },
  {
    symbol: "VRT",
    stage: "infrastructure",
    sector: "energy",
    name: "Vertiv Holdings",
    blurb: "Supplies power distribution, UPS, thermal management, and liquid cooling for hyperscale and AI data centers."
  },
  {
    symbol: "ETN",
    stage: "infrastructure",
    sector: "energy",
    name: "Eaton Corporation",
    blurb: "Makes electrical distribution, UPS, switchgear, and power management products for utilities, data centers, and industry."
  },
  {
    symbol: "EMR",
    stage: "infrastructure",
    sector: "energy",
    name: "Emerson Electric",
    blurb: "Supplies automation software, measurement instruments, and discrete and process controls for industrial customers."
  },
  {
    symbol: "PH",
    stage: "infrastructure",
    sector: "energy",
    name: "Parker Hannifin",
    blurb: "Provides motion and control technologies including fluid connectors used in liquid-cooled data center equipment."
  },
  {
    symbol: "JCI",
    stage: "infrastructure",
    sector: "energy",
    name: "Johnson Controls",
    blurb: "Supplies HVAC, chillers, fire safety, and building automation used extensively in data center cooling."
  },
  {
    symbol: "NEE",
    stage: "infrastructure",
    sector: "energy",
    name: "NextEra Energy",
    blurb: "Largest U.S. utility by market cap with dominant positions in wind, solar, and the regulated Florida utility business."
  },
  {
    symbol: "VST",
    stage: "infrastructure",
    sector: "energy",
    name: "Vistra Corp.",
    blurb: "Independent power producer with nuclear, gas, and renewable generation assets selling into merchant power markets."
  },
  {
    symbol: "CEG",
    stage: "infrastructure",
    sector: "energy",
    name: "Constellation Energy",
    blurb: "Largest U.S. nuclear power operator; restarting Three Mile Island Unit 1 under a long-term deal with Microsoft."
  },
  {
    symbol: "TLN",
    stage: "infrastructure",
    sector: "energy",
    name: "Talen Energy",
    blurb: "Operates the Susquehanna nuclear plant and other generation assets with a direct-to-data-center power deal with AWS."
  },
  {
    symbol: "GEV",
    stage: "infrastructure",
    sector: "energy",
    name: "GE Vernova",
    blurb: "Supplies gas turbines, grid equipment, wind turbines, and nuclear services to utilities and power customers."
  },
  {
    symbol: "AAPL",
    stage: "systems",
    sector: "hardware",
    name: "Apple",
    blurb: "Designs iPhone, Mac, iPad, Watch, and services; self-designs Apple Silicon used across its product lines."
  },
  {
    symbol: "DELL",
    stage: "systems",
    sector: "hardware",
    name: "Dell Technologies",
    blurb: "Manufactures PowerEdge servers, PowerStore storage, and PCs; major integration partner for Nvidia AI systems."
  },
  {
    symbol: "HPQ",
    stage: "systems",
    sector: "hardware",
    name: "HP Inc.",
    blurb: "Manufactures consumer and commercial PCs, workstations, and printing products."
  },
  {
    symbol: "HPE",
    stage: "systems",
    sector: "hardware",
    name: "Hewlett Packard Enterprise",
    blurb: "Makes ProLiant servers, Cray supercomputers, and networking gear; acquiring Juniper Networks."
  },
  {
    symbol: "SMCI",
    stage: "systems",
    sector: "hardware",
    name: "Super Micro Computer",
    blurb: "Designs high-density servers optimized for AI workloads, with deep Nvidia HGX and MGX reference-platform partnerships."
  },
  {
    symbol: "MSFT",
    stage: "cloud-software",
    sector: "cloud",
    name: "Microsoft",
    blurb: "Operates Azure cloud, Windows, and Office and partners closely with OpenAI for frontier AI services."
  },
  {
    symbol: "GOOGL",
    stage: "cloud-software",
    sector: "cloud",
    name: "Alphabet",
    blurb: "Runs Search, YouTube, Android, and Google Cloud, and designs custom TPU AI accelerators."
  },
  {
    symbol: "AMZN",
    stage: "cloud-software",
    sector: "cloud",
    name: "Amazon",
    blurb: "Operates AWS cloud, global e-commerce, Prime Video, and designs Graviton, Trainium, and Inferentia silicon."
  },
  {
    symbol: "META",
    stage: "cloud-software",
    sector: "cloud",
    name: "Meta Platforms",
    blurb: "Operates Facebook, Instagram, and WhatsApp; investing heavily in AI infrastructure and custom MTIA silicon."
  },
  {
    symbol: "ORCL",
    stage: "cloud-software",
    sector: "cloud",
    name: "Oracle",
    blurb: "Provides enterprise databases, applications, and Oracle Cloud Infrastructure with rapidly growing AI GPU capacity."
  },
  {
    symbol: "CRM",
    stage: "cloud-software",
    sector: "cloud",
    name: "Salesforce",
    blurb: "Provides cloud-based customer relationship management, marketing, analytics, and service platforms."
  },
  {
    symbol: "NOW",
    stage: "cloud-software",
    sector: "cloud",
    name: "ServiceNow",
    blurb: "Enterprise platform for IT service management, workflow automation, and AI-driven operations."
  },
  {
    symbol: "SNOW",
    stage: "cloud-software",
    sector: "cloud",
    name: "Snowflake",
    blurb: "Cloud data warehouse and AI data platform running across major hyperscalers."
  },
  {
    symbol: "DDOG",
    stage: "cloud-software",
    sector: "cloud",
    name: "Datadog",
    blurb: "SaaS monitoring, observability, and security platform for cloud-native infrastructure."
  },
  {
    symbol: "PLTR",
    stage: "cloud-software",
    sector: "cloud",
    name: "Palantir Technologies",
    blurb: "Data integration and analytics platforms (Foundry, Gotham) used in government and commercial operations."
  },
  {
    symbol: "ADBE",
    stage: "cloud-software",
    sector: "cloud",
    name: "Adobe",
    blurb: "Creative Cloud, Document Cloud, and Experience Cloud software for creators, marketers, and enterprises."
  },
  {
    symbol: "CRWD",
    stage: "cloud-software",
    sector: "cloud",
    name: "CrowdStrike",
    blurb: "Cloud-delivered endpoint security and threat intelligence via the Falcon platform."
  },
  {
    symbol: "NET",
    stage: "cloud-software",
    sector: "cloud",
    name: "Cloudflare",
    blurb: "Operates a global edge network providing CDN, DDoS protection, Zero Trust security, and developer platform services."
  },
  {
    symbol: "SHOP",
    stage: "cloud-software",
    sector: "cloud",
    name: "Shopify",
    blurb: "E-commerce platform providing merchants with storefronts, payments, and logistics software."
  },
  {
    symbol: "NFLX",
    stage: "cloud-software",
    sector: "cloud",
    name: "Netflix",
    blurb: "Global subscription video streaming service and original content producer."
  },
  {
    symbol: "IBM",
    stage: "cloud-software",
    sector: "cloud",
    name: "IBM",
    blurb: "Provides hybrid cloud services, Red Hat software, consulting, mainframes, and the watsonx AI platform."
  },
  {
    symbol: "TSLA",
    stage: "end-markets",
    sector: "auto",
    name: "Tesla",
    blurb: "Designs and manufactures EVs, battery storage, and solar products; develops in-house FSD silicon and Dojo AI training."
  },
  {
    symbol: "F",
    stage: "end-markets",
    sector: "auto",
    name: "Ford Motor Company",
    blurb: "U.S. automaker producing trucks and SUVs, including Mustang Mach-E and F-150 Lightning EV programs."
  },
  {
    symbol: "GM",
    stage: "end-markets",
    sector: "auto",
    name: "General Motors",
    blurb: "U.S. automaker building Ultium-platform EVs across Chevrolet, GMC, Cadillac, and Buick brands."
  },
  {
    symbol: "RIVN",
    stage: "end-markets",
    sector: "auto",
    name: "Rivian",
    blurb: "U.S. EV maker producing R1T, R1S, and commercial delivery vans, with a joint venture with Volkswagen."
  },
  {
    symbol: "LCID",
    stage: "end-markets",
    sector: "auto",
    name: "Lucid Group",
    blurb: "Luxury EV maker producing the Air sedan and Gravity SUV; majority owned by Saudi Arabia's PIF."
  },
  {
    symbol: "STLA",
    stage: "end-markets",
    sector: "auto",
    name: "Stellantis",
    blurb: "Multinational automaker formed from the PSA-FCA merger, owning Jeep, Ram, Chrysler, Fiat, Peugeot, and others."
  },
  {
    symbol: "TM",
    stage: "end-markets",
    sector: "auto",
    name: "Toyota Motor",
    blurb: "World's largest automaker by volume, with a broad hybrid, EV, and hydrogen fuel cell vehicle portfolio."
  },
  {
    symbol: "NIO",
    stage: "end-markets",
    sector: "auto",
    name: "NIO",
    blurb: "Chinese premium EV maker known for battery-swap infrastructure and the ET, ES, and EC vehicle series."
  },
  {
    symbol: "XPEV",
    stage: "end-markets",
    sector: "auto",
    name: "XPeng",
    blurb: "Chinese EV maker focused on advanced driver assistance and urban autonomy in the XNGP platform."
  },
  {
    symbol: "LI",
    stage: "end-markets",
    sector: "auto",
    name: "Li Auto",
    blurb: "Chinese maker of extended-range electric SUVs including the L-series and the MEGA MPV."
  },
  {
    symbol: "HMC",
    stage: "end-markets",
    sector: "auto",
    name: "Honda Motor",
    blurb: "Japanese automaker producing cars, motorcycles, and power equipment, with EV partnerships with GM and Sony."
  }
];
const edges = [
  {
    from: "LIN",
    to: "TSM",
    note: "Neon, argon, and other ultra-high-purity industrial gases supplied under long-term contracts to TSMC wafer fabs."
  },
  {
    from: "LIN",
    to: "INTC",
    note: "High-purity specialty and bulk gases for Intel fabs in Arizona, Oregon, New Mexico, and Ireland."
  },
  {
    from: "LIN",
    to: "MU",
    note: "Electronic gases used in DRAM and NAND manufacturing across Micron's global fab footprint."
  },
  {
    from: "APD",
    to: "TSM",
    note: "On-site atmospheric and electronic gas generation for TSMC's Taiwan, Arizona, and Japan fabs."
  },
  {
    from: "APD",
    to: "INTC",
    note: "On-site industrial and electronic gas supply to Intel's U.S. and international manufacturing facilities."
  },
  {
    from: "APD",
    to: "MU",
    note: "Electronic gases for Micron's DRAM and NAND fabs, including helium and nitrogen trifluoride."
  },
  {
    from: "ENTG",
    to: "TSM",
    note: "Ultra-pure chemicals, filtration, and gas delivery subsystems used across TSMC's leading-edge nodes."
  },
  {
    from: "ENTG",
    to: "INTC",
    note: "Advanced materials, filters, and liquid chemistries for Intel's logic manufacturing."
  },
  {
    from: "ENTG",
    to: "MU",
    note: "Process chemistries and filtration for Micron's DRAM and 3D NAND fabs."
  },
  {
    from: "ENTG",
    to: "GFS",
    note: "Specialty materials handling and filtration systems for GlobalFoundries' specialty nodes."
  },
  {
    from: "DD",
    to: "TSM",
    note: "Photoresists, advanced packaging materials, and electronic chemistries supplied into TSMC."
  },
  {
    from: "DD",
    to: "INTC",
    note: "Specialty materials including CMP slurries and lithography chemistries for Intel manufacturing."
  },
  {
    from: "CE",
    to: "INTC",
    note: "Engineered polymers and acetyl derivatives used in semiconductor packaging and fab consumables."
  },
  {
    from: "ALB",
    to: "TSLA",
    note: "Lithium hydroxide for high-nickel NCA/NCM cathodes used in Tesla's long-range vehicles and battery storage."
  },
  {
    from: "ALB",
    to: "GM",
    note: "Lithium hydroxide under a multi-year supply agreement for GM's Ultium battery packs."
  },
  {
    from: "SQM",
    to: "TSLA",
    note: "Battery-grade lithium carbonate and hydroxide sourced from Chilean Salar de Atacama brine operations."
  },
  {
    from: "LAC",
    to: "GM",
    note: "Thacker Pass lithium carbonate under GM's $650M offtake and equity investment in the project."
  },
  {
    from: "MP",
    to: "GM",
    note: "Domestic NdFeB rare earth magnets for EV traction motors under a U.S.-sourced supply agreement."
  },
  {
    from: "MP",
    to: "F",
    note: "NdPr metal and sintered magnet supply supporting Ford EV motor production."
  },
  {
    from: "FCX",
    to: "TSLA",
    note: "Copper cathode used in EV wiring harnesses, battery busbars, and Supercharger infrastructure."
  },
  {
    from: "FCX",
    to: "GEV",
    note: "Copper for grid transformers, generators, and high-voltage transmission equipment."
  },
  {
    from: "ASML",
    to: "TSM",
    note: "EUV lithography systems used across TSMC's 7nm, 5nm, 3nm, and 2nm nodes; ASML is the sole global supplier of EUV."
  },
  {
    from: "ASML",
    to: "INTC",
    note: "EUV and High-NA EUV scanners used for Intel's 18A and 14A leading-edge processes."
  },
  {
    from: "ASML",
    to: "MU",
    note: "EUV systems for Micron's leading-edge DRAM plus DUV immersion scanners across memory nodes."
  },
  {
    from: "ASML",
    to: "GFS",
    note: "DUV immersion lithography for GlobalFoundries' specialty and mature nodes."
  },
  {
    from: "ASML",
    to: "UMC",
    note: "DUV lithography scanners for UMC's 28nm and 22nm processes."
  },
  {
    from: "AMAT",
    to: "TSM",
    note: "Deposition, epitaxy, ion implant, and CMP systems across TSMC's leading-edge and mature nodes."
  },
  {
    from: "AMAT",
    to: "INTC",
    note: "Deposition, implant, and materials engineering systems for Intel's logic and foundry manufacturing."
  },
  {
    from: "AMAT",
    to: "MU",
    note: "Deposition and etch equipment used across Micron's 3D NAND and DRAM production."
  },
  {
    from: "AMAT",
    to: "GFS",
    note: "Process equipment spanning CVD, PVD, and CMP for GlobalFoundries' specialty platforms."
  },
  {
    from: "LRCX",
    to: "TSM",
    note: "Plasma etch and atomic layer deposition systems for TSMC's advanced logic nodes."
  },
  {
    from: "LRCX",
    to: "MU",
    note: "High-aspect-ratio plasma etch dominant in 3D NAND channel etch; Lam is the leader in memory etch."
  },
  {
    from: "LRCX",
    to: "INTC",
    note: "Etch and deposition tools used broadly across Intel's fabs."
  },
  {
    from: "LRCX",
    to: "GFS",
    note: "Etch and deposition equipment for GlobalFoundries' mature and specialty processes."
  },
  {
    from: "KLAC",
    to: "TSM",
    note: "Wafer inspection, reticle inspection, and process control; KLA dominates leading-edge defect detection."
  },
  {
    from: "KLAC",
    to: "INTC",
    note: "Process control and metrology systems deployed across Intel manufacturing."
  },
  {
    from: "KLAC",
    to: "MU",
    note: "Inspection and metrology equipment for DRAM and NAND manufacturing lines."
  },
  {
    from: "ONTO",
    to: "TSM",
    note: "Optical metrology and advanced packaging inspection used in TSMC's CoWoS assembly flows."
  },
  {
    from: "ONTO",
    to: "INTC",
    note: "Metrology and inspection systems for Intel logic and packaging lines."
  },
  {
    from: "ACLS",
    to: "TSM",
    note: "Purion ion implantation systems for logic and specialty process steps."
  },
  {
    from: "ACLS",
    to: "WOLF",
    note: "High-energy ion implanters used in Wolfspeed's silicon carbide power device manufacturing."
  },
  {
    from: "TER",
    to: "TSM",
    note: "Automatic test equipment used at TSMC wafer sort and assembly sites."
  },
  {
    from: "TER",
    to: "NVDA",
    note: "System-level test platforms used to qualify Nvidia AI accelerator packages; Nvidia is a major Teradyne customer."
  },
  {
    from: "TER",
    to: "AAPL",
    note: "Chip test equipment used in qualification of Apple's A-series and M-series silicon."
  },
  {
    from: "COHR",
    to: "ASML",
    note: "Photonic subsystems and lasers used inside ASML lithography tools."
  },
  {
    from: "UCTT",
    to: "AMAT",
    note: "Precision-machined gas panels, chambers, and subsystems integrated into Applied's process tools."
  },
  {
    from: "UCTT",
    to: "LRCX",
    note: "Fluid delivery and chamber subsystems for Lam's etch and deposition platforms."
  },
  {
    from: "CDNS",
    to: "NVDA",
    note: "EDA software, verification, and custom IP used in designing Nvidia's GPU and networking silicon."
  },
  {
    from: "CDNS",
    to: "AMD",
    note: "EDA platforms underpinning AMD's EPYC, Ryzen, and Instinct chiplet designs."
  },
  {
    from: "CDNS",
    to: "TSM",
    note: "Foundry-certified design flows, PDKs, and IP qualified on TSMC's leading-edge nodes."
  },
  {
    from: "CDNS",
    to: "QCOM",
    note: "EDA tools and IP used in Snapdragon SoC design."
  },
  {
    from: "CDNS",
    to: "AVGO",
    note: "EDA and silicon IP used across Broadcom's custom ASIC business."
  },
  {
    from: "SNPS",
    to: "NVDA",
    note: "EDA tools and IP supporting GPU and SoC implementation and sign-off."
  },
  {
    from: "SNPS",
    to: "INTC",
    note: "EDA flows and verification tools used across Intel's design and foundry organizations."
  },
  {
    from: "SNPS",
    to: "TSM",
    note: "Reference flows, IP, and sign-off tools qualified on TSMC process nodes."
  },
  {
    from: "SNPS",
    to: "AMD",
    note: "EDA platforms for AMD's chiplet-based CPU and GPU designs."
  },
  {
    from: "SNPS",
    to: "AVGO",
    note: "EDA and IP for custom ASIC development at Broadcom."
  },
  {
    from: "ARM",
    to: "AAPL",
    note: "CPU architecture license underlying Apple's A-series iPhone and M-series Mac silicon."
  },
  {
    from: "ARM",
    to: "QCOM",
    note: "Cortex CPU cores and instruction-set licenses used in Snapdragon mobile and PC processors."
  },
  {
    from: "ARM",
    to: "NVDA",
    note: "Neoverse cores used in Grace CPUs and Grace Hopper superchips."
  },
  {
    from: "ARM",
    to: "AMZN",
    note: "Neoverse V-series cores powering AWS Graviton server processors."
  },
  {
    from: "ARM",
    to: "MRVL",
    note: "Cortex and Neoverse IP used in Marvell's custom data-center silicon."
  },
  {
    from: "ARM",
    to: "MBLY",
    note: "CPU cores used in Mobileye's EyeQ ADAS system-on-chips."
  },
  {
    from: "TSM",
    to: "NVDA",
    note: "Leading-edge wafer fabrication of Hopper (4N) and Blackwell (4NP/3nm) accelerators; Nvidia is TSMC's top HPC customer."
  },
  {
    from: "TSM",
    to: "AAPL",
    note: "3nm fabrication of A-series iPhone and M-series Mac SoCs; Apple is TSMC's single largest customer."
  },
  {
    from: "TSM",
    to: "AMD",
    note: "5nm/4nm/3nm manufacturing of EPYC CPUs, Ryzen, and Instinct MI300 chiplets."
  },
  {
    from: "TSM",
    to: "AVGO",
    note: "Wafer fabrication for Broadcom's custom ASICs, including Google TPU and Meta MTIA silicon."
  },
  {
    from: "TSM",
    to: "QCOM",
    note: "Manufacturing of flagship Snapdragon 8-series mobile and PC SoCs on 3nm and 4nm nodes."
  },
  {
    from: "TSM",
    to: "MRVL",
    note: "Advanced-node fabrication for Marvell's custom cloud silicon and optical DSPs."
  },
  {
    from: "TSM",
    to: "MBLY",
    note: "Manufacturing of EyeQ6 and next-generation ADAS SoCs."
  },
  {
    from: "TSM",
    to: "MPWR",
    note: "Wafer fabrication for Monolithic Power's advanced power management ICs."
  },
  {
    from: "TSM",
    to: "AMBA",
    note: "Fabrication of CV-series vision processors on advanced 5nm-class nodes."
  },
  {
    from: "TSM",
    to: "STM",
    note: "Long-term partnership for advanced digital and RF manufacturing, including on 18nm FD-SOI."
  },
  {
    from: "TSM",
    to: "TSLA",
    note: "Fabrication of Tesla's HW4 and next-generation FSD inference chips."
  },
  {
    from: "GFS",
    to: "QCOM",
    note: "Manufacturing of RF front-end components on GlobalFoundries' SOI and RFSOI processes."
  },
  {
    from: "GFS",
    to: "AVGO",
    note: "Specialty silicon and RF production for Broadcom connectivity products."
  },
  {
    from: "GFS",
    to: "NXPI",
    note: "22FDX fabrication for NXP automotive radar and microcontroller products."
  },
  {
    from: "UMC",
    to: "MCHP",
    note: "Mature-node fabrication for microcontrollers and analog products."
  },
  {
    from: "UMC",
    to: "NXPI",
    note: "Specialty process manufacturing for automotive and IoT chips."
  },
  {
    from: "INTC",
    to: "MBLY",
    note: "Fabrication of EyeQ ADAS chips at Intel fabs; Mobileye was originally spun out of Intel."
  },
  {
    from: "INTC",
    to: "DELL",
    note: "Xeon server CPUs and Core PC processors supplied across Dell's commercial and consumer lines."
  },
  {
    from: "INTC",
    to: "HPE",
    note: "Xeon Scalable CPUs powering HPE ProLiant servers and Cray systems."
  },
  {
    from: "INTC",
    to: "HPQ",
    note: "Core and Core Ultra CPUs used across HP's consumer and commercial PC lines."
  },
  {
    from: "INTC",
    to: "MSFT",
    note: "Xeon CPUs for Azure compute fleets; Microsoft is also an announced Intel 18A foundry customer."
  },
  {
    from: "WOLF",
    to: "TSLA",
    note: "Silicon carbide wafers supplied under multi-year agreement for Tesla's power electronics roadmap."
  },
  {
    from: "WOLF",
    to: "ON",
    note: "SiC substrate supply into onsemi for downstream SiC device manufacturing."
  },
  {
    from: "WOLF",
    to: "STM",
    note: "SiC substrate supply for STMicro's power module production."
  },
  {
    from: "MU",
    to: "NVDA",
    note: "HBM3e memory stacks integrated into Nvidia's H200 and Blackwell (B200/GB200) AI accelerators."
  },
  {
    from: "MU",
    to: "AMD",
    note: "HBM3e memory used in AMD's Instinct MI300X and MI325X accelerators."
  },
  {
    from: "MU",
    to: "AAPL",
    note: "LPDDR mobile DRAM and NAND flash for iPhone, iPad, and Mac products."
  },
  {
    from: "MU",
    to: "DELL",
    note: "DDR5 server memory and data-center SSDs for PowerEdge platforms."
  },
  {
    from: "MU",
    to: "HPE",
    note: "Server-class DRAM and SSDs for HPE ProLiant and Cray systems."
  },
  {
    from: "WDC",
    to: "AAPL",
    note: "NAND flash for iPhone and iPad via the Western Digital/Kioxia joint venture fabs."
  },
  {
    from: "WDC",
    to: "DELL",
    note: "Enterprise SSDs for Dell PowerEdge servers and storage arrays."
  },
  {
    from: "WDC",
    to: "MSFT",
    note: "Nearline HDDs and enterprise SSDs deployed in Azure data centers."
  },
  {
    from: "STX",
    to: "DELL",
    note: "High-capacity nearline HDDs for Dell storage systems."
  },
  {
    from: "STX",
    to: "MSFT",
    note: "Mozaic 3+ HAMR HDDs for Azure bulk and archive storage tiers."
  },
  {
    from: "STX",
    to: "AMZN",
    note: "High-capacity HDDs underpinning AWS S3 object storage infrastructure."
  },
  {
    from: "NVDA",
    to: "MSFT",
    note: "H100, H200, and Blackwell GPUs deployed across Azure AI infrastructure; Microsoft is Nvidia's largest data-center customer."
  },
  {
    from: "NVDA",
    to: "META",
    note: "Hundreds of thousands of H100 and Blackwell GPUs for Llama training and AI research infrastructure."
  },
  {
    from: "NVDA",
    to: "GOOGL",
    note: "Hopper and Blackwell GPUs offered on Google Cloud alongside Google's in-house TPUs."
  },
  {
    from: "NVDA",
    to: "AMZN",
    note: "GPUs deployed across AWS EC2 P5 and P6 instances for AI training and inference."
  },
  {
    from: "NVDA",
    to: "ORCL",
    note: "Large GPU clusters powering Oracle Cloud Infrastructure's AI offerings."
  },
  {
    from: "NVDA",
    to: "TSLA",
    note: "H100 GPUs used in Tesla's training clusters for FSD neural network development."
  },
  {
    from: "NVDA",
    to: "DELL",
    note: "HGX and MGX GPU baseboards integrated into Dell PowerEdge XE AI servers."
  },
  {
    from: "NVDA",
    to: "HPE",
    note: "GPU systems integrated into HPE Cray AI and ProLiant platforms."
  },
  {
    from: "NVDA",
    to: "SMCI",
    note: "GPU baseboards used across Supermicro's AI server portfolio; Supermicro is a top Nvidia HGX partner."
  },
  {
    from: "AMD",
    to: "MSFT",
    note: "EPYC CPUs and MI300X/MI325X accelerators deployed in Azure data centers."
  },
  {
    from: "AMD",
    to: "META",
    note: "EPYC CPUs and MI300X GPUs used across Meta's AI and recommendation infrastructure."
  },
  {
    from: "AMD",
    to: "AMZN",
    note: "EPYC CPUs powering AWS EC2 C7a and M7a general-purpose instances."
  },
  {
    from: "AMD",
    to: "GOOGL",
    note: "EPYC CPUs used for Google Cloud compute instances."
  },
  {
    from: "AMD",
    to: "DELL",
    note: "EPYC CPUs and Instinct GPUs integrated into PowerEdge server lines."
  },
  {
    from: "AMD",
    to: "HPE",
    note: "EPYC CPUs in ProLiant servers and Cray supercomputers including Frontier and El Capitan."
  },
  {
    from: "AMD",
    to: "SMCI",
    note: "EPYC CPUs and Instinct GPU systems across Supermicro server platforms."
  },
  {
    from: "AVGO",
    to: "GOOGL",
    note: "Co-designs and supplies Google's TPU v4/v5/v6 AI accelerator ASICs; the largest ASIC customer relationship."
  },
  {
    from: "AVGO",
    to: "META",
    note: "Design and supply partner on Meta's MTIA inference ASICs for ranking and recommendation workloads."
  },
  {
    from: "AVGO",
    to: "AAPL",
    note: "Wireless connectivity (Wi-Fi/Bluetooth) components and FBAR RF filters for iPhone."
  },
  {
    from: "AVGO",
    to: "ANET",
    note: "Tomahawk and Jericho switch silicon powering Arista's cloud and AI networking platforms."
  },
  {
    from: "AVGO",
    to: "CSCO",
    note: "Networking silicon used in portions of Cisco's switching portfolio alongside Cisco Silicon One."
  },
  {
    from: "MRVL",
    to: "AMZN",
    note: "Custom silicon and optical DSPs supporting AWS Trainium and Inferentia platforms."
  },
  {
    from: "MRVL",
    to: "MSFT",
    note: "Custom data-center silicon and electro-optics for Azure networking fabrics."
  },
  {
    from: "MRVL",
    to: "CSCO",
    note: "Networking and electro-optics components for Cisco's data center platforms."
  },
  {
    from: "QCOM",
    to: "AAPL",
    note: "5G baseband modems for iPhone under supply agreement extended through 2026 while Apple develops its in-house modem."
  },
  {
    from: "SWKS",
    to: "AAPL",
    note: "RF front-end modules for cellular connectivity in iPhone; Apple has historically been Skyworks' largest customer."
  },
  {
    from: "QRVO",
    to: "AAPL",
    note: "RF front-end components for iPhone; Apple historically drives a large share of Qorvo's revenue."
  },
  {
    from: "ADI",
    to: "AAPL",
    note: "Analog, power, audio codec, and touch-controller ICs used across iPhone and Mac lines."
  },
  {
    from: "ADI",
    to: "TSLA",
    note: "Battery management, isolation, and signal-chain analog used across Tesla vehicle platforms."
  },
  {
    from: "TXN",
    to: "F",
    note: "Analog, microcontrollers, and power ICs across Ford's ICE and EV vehicle electronics."
  },
  {
    from: "TXN",
    to: "GM",
    note: "Analog and embedded processing chips across GM vehicles including Ultium EV electronics."
  },
  {
    from: "TXN",
    to: "TSLA",
    note: "Analog signal-chain and power management ICs used throughout Tesla vehicles."
  },
  {
    from: "NXPI",
    to: "TSLA",
    note: "Automotive processors, radar, and secure gateway chips used across Tesla vehicles."
  },
  {
    from: "NXPI",
    to: "F",
    note: "i.MX application processors, S32 auto MCUs, and radar ICs for Ford vehicles."
  },
  {
    from: "NXPI",
    to: "GM",
    note: "S32 domain processors and radar ICs for GM platforms including Ultium EVs."
  },
  {
    from: "NXPI",
    to: "STLA",
    note: "Automotive MCUs and gateway processors across Stellantis vehicle programs."
  },
  {
    from: "ON",
    to: "TSLA",
    note: "Silicon carbide MOSFETs used in Tesla's drive inverters starting with the Model 3 and Model Y platforms."
  },
  {
    from: "ON",
    to: "F",
    note: "Image sensors for driver-assistance cameras and SiC modules for the Mustang Mach-E inverter."
  },
  {
    from: "ON",
    to: "GM",
    note: "SiC power modules under a multi-year supply agreement for Ultium EV drive units."
  },
  {
    from: "STM",
    to: "TSLA",
    note: "Silicon carbide power modules co-developed for Tesla's drive inverter since Model 3."
  },
  {
    from: "STM",
    to: "AAPL",
    note: "Time-of-flight and imaging sensors used in iPhone for Face ID and lidar depth sensing."
  },
  {
    from: "MPWR",
    to: "NVDA",
    note: "Power management ICs and voltage regulators integrated onto Nvidia AI GPU boards."
  },
  {
    from: "MCHP",
    to: "F",
    note: "Microcontrollers, connectivity, and analog ICs used across Ford automotive electronics."
  },
  {
    from: "MCHP",
    to: "TSLA",
    note: "Microcontrollers and connectivity ICs used in Tesla vehicle electronics."
  },
  {
    from: "CRDO",
    to: "MSFT",
    note: "Active electrical cables, retimers, and optical DSPs deployed in Azure AI networking fabrics."
  },
  {
    from: "CRDO",
    to: "META",
    note: "AEC cables and retimers supporting Meta's AI data center connectivity."
  },
  {
    from: "MBLY",
    to: "F",
    note: "EyeQ SoCs and driver-assistance software used in Ford ADAS programs."
  },
  {
    from: "MBLY",
    to: "GM",
    note: "EyeQ chips underpinning GM's Super Cruise and next-generation ADAS systems."
  },
  {
    from: "MBLY",
    to: "STLA",
    note: "EyeQ-based SuperVision ADAS platform deployed across Stellantis brands."
  },
  {
    from: "MBLY",
    to: "HMC",
    note: "EyeQ-based Honda Sensing 360 ADAS platform."
  },
  {
    from: "AMBA",
    to: "F",
    note: "Computer vision SoCs used in driver monitoring and ADAS cameras."
  },
  {
    from: "ANET",
    to: "META",
    note: "400G and 800G data center switches for Meta's AI training and inference fabrics; Meta is Arista's largest customer."
  },
  {
    from: "ANET",
    to: "MSFT",
    note: "High-speed Ethernet switching for Azure cloud and AI networking fabrics."
  },
  {
    from: "ANET",
    to: "GOOGL",
    note: "Selected data center networking gear deployed at Google Cloud."
  },
  {
    from: "CSCO",
    to: "ORCL",
    note: "Enterprise networking and security equipment for Oracle Cloud and on-premise deployments."
  },
  {
    from: "JNPR",
    to: "AMZN",
    note: "MX and PTX routing platforms used in AWS backbone and regional networking."
  },
  {
    from: "LITE",
    to: "ANET",
    note: "400G/800G optical transceivers for Arista's AI networking platforms."
  },
  {
    from: "LITE",
    to: "CSCO",
    note: "Datacom transceivers and laser components for Cisco switching and routing."
  },
  {
    from: "CIEN",
    to: "MSFT",
    note: "WaveLogic optical transport systems for Azure long-haul and metro backbone."
  },
  {
    from: "CIEN",
    to: "AMZN",
    note: "Coherent optical transport gear used across the AWS global backbone."
  },
  {
    from: "FN",
    to: "CIEN",
    note: "Contract manufacture of Ciena's optical line systems and coherent transceivers."
  },
  {
    from: "FN",
    to: "LITE",
    note: "Contract manufacture of Lumentum's datacom transceivers and laser sub-assemblies."
  },
  {
    from: "FN",
    to: "NVDA",
    note: "High-volume optical module and NVLink assembly manufacturing for Nvidia AI systems."
  },
  {
    from: "PSTG",
    to: "META",
    note: "All-flash storage arrays deployed across Meta's AI research clusters under a multi-hundred-million-dollar design win."
  },
  {
    from: "NTAP",
    to: "MSFT",
    note: "Azure NetApp Files service delivered jointly as a first-party Azure offering."
  },
  {
    from: "FLEX",
    to: "F",
    note: "Contract manufacturing of automotive electronics and connected-car modules for Ford."
  },
  {
    from: "FLEX",
    to: "JNPR",
    note: "Contract manufacturing of Juniper networking hardware."
  },
  {
    from: "VRT",
    to: "MSFT",
    note: "Liquid cooling, UPS, and power distribution for Azure AI data center deployments."
  },
  {
    from: "VRT",
    to: "META",
    note: "Thermal management and power infrastructure for Meta's AI data centers."
  },
  {
    from: "VRT",
    to: "AMZN",
    note: "UPS, switchgear, and rack PDUs for AWS hyperscale facilities."
  },
  {
    from: "VRT",
    to: "GOOGL",
    note: "Data center power and cooling infrastructure across Google Cloud sites."
  },
  {
    from: "ETN",
    to: "MSFT",
    note: "Medium-voltage switchgear, busways, and UPS systems for Azure data center build-outs."
  },
  {
    from: "ETN",
    to: "AMZN",
    note: "Electrical distribution equipment for AWS data center expansion."
  },
  {
    from: "ETN",
    to: "GOOGL",
    note: "Power management and UPS systems for Google Cloud facilities."
  },
  {
    from: "EMR",
    to: "MSFT",
    note: "Precision cooling, environmental controls, and data-center sensors across Azure sites."
  },
  {
    from: "JCI",
    to: "AMZN",
    note: "HVAC, chillers, and building controls used across AWS data centers."
  },
  {
    from: "JCI",
    to: "META",
    note: "Data center cooling systems and building automation across Meta campuses."
  },
  {
    from: "PH",
    to: "VRT",
    note: "Engineered quick-disconnect fluid connectors and thermal components used in Vertiv liquid-cooling systems."
  },
  {
    from: "CEG",
    to: "MSFT",
    note: "20-year power purchase agreement restarting Three Mile Island Unit 1 nuclear plant to supply Microsoft AI data centers."
  },
  {
    from: "VST",
    to: "AMZN",
    note: "Nuclear and natural gas generation supplying power to Amazon hyperscale loads."
  },
  {
    from: "TLN",
    to: "AMZN",
    note: "Susquehanna nuclear plant supplies power directly to an adjacent AWS data center campus under a behind-the-meter deal."
  },
  {
    from: "NEE",
    to: "GOOGL",
    note: "Renewables and firm-power PPAs supporting Google's data center operations."
  },
  {
    from: "GEV",
    to: "CEG",
    note: "Nuclear services, steam turbines, and grid equipment supporting Constellation's generation fleet."
  },
  {
    from: "GEV",
    to: "NEE",
    note: "Gas turbines, wind turbines, and grid equipment for NextEra's generation and transmission assets."
  },
  {
    from: "GEV",
    to: "VST",
    note: "Heavy-duty gas turbines and aftermarket services for Vistra's generation fleet."
  },
  {
    from: "DELL",
    to: "MSFT",
    note: "PowerEdge AI servers and storage integrated into Azure deployments and Azure Stack edge platforms."
  },
  {
    from: "HPE",
    to: "ORCL",
    note: "Server and networking hardware supporting Oracle enterprise and cloud workloads."
  },
  {
    from: "SMCI",
    to: "MSFT",
    note: "AI-optimized GPU server systems supplied into Azure's expansion of AI capacity."
  },
  {
    from: "SMCI",
    to: "META",
    note: "HGX and MGX GPU server systems deployed across Meta's AI training clusters."
  },
  {
    from: "GOOGL",
    to: "F",
    note: "Google Cloud and Android Automotive/Built-in under multi-year partnership powering Ford's in-vehicle infotainment and connected services."
  },
  {
    from: "MSFT",
    to: "TM",
    note: "Azure cloud services and connected vehicle platform underpinning Toyota's global data operations."
  },
  {
    from: "MSFT",
    to: "GM",
    note: "Azure infrastructure for GM's connected vehicle, manufacturing, and (historically) Cruise autonomy workloads."
  },
  {
    from: "AMZN",
    to: "STLA",
    note: "AWS designated as preferred cloud partner with deep co-development across Stellantis digital platforms."
  },
  {
    from: "AMZN",
    to: "F",
    note: "AWS underpinning Ford's connected services, FordPass, and manufacturing data platforms."
  },
  {
    from: "AMZN",
    to: "SNOW",
    note: "AWS is Snowflake's largest infrastructure provider; Snowflake's Data Cloud runs primarily on AWS regions."
  },
  {
    from: "AMZN",
    to: "NFLX",
    note: "AWS provides the compute, storage, and encoding infrastructure underpinning Netflix's global streaming service."
  },
  {
    from: "AMZN",
    to: "DDOG",
    note: "AWS is Datadog's largest infrastructure partner and a major strategic go-to-market alliance."
  },
  {
    from: "MSFT",
    to: "CRWD",
    note: "Azure co-sell alliance and infrastructure for CrowdStrike's Falcon platform delivery."
  },
  {
    from: "GOOGL",
    to: "SHOP",
    note: "Google Cloud provides compute and AI infrastructure supporting Shopify's merchant platform."
  },
  {
    from: "PLTR",
    to: "STLA",
    note: "Palantir Foundry deployed across Stellantis for manufacturing, quality, and supply-chain optimization."
  }
];
const competitors = [
  [
    "NVDA",
    "AMD"
  ],
  [
    "AMD",
    "INTC"
  ],
  [
    "NVDA",
    "INTC"
  ],
  [
    "TSM",
    "INTC"
  ],
  [
    "TSM",
    "GFS"
  ],
  [
    "TSM",
    "UMC"
  ],
  [
    "GFS",
    "UMC"
  ],
  [
    "INTC",
    "GFS"
  ],
  [
    "MU",
    "WDC"
  ],
  [
    "WDC",
    "STX"
  ],
  [
    "AMAT",
    "LRCX"
  ],
  [
    "KLAC",
    "ONTO"
  ],
  [
    "CDNS",
    "SNPS"
  ],
  [
    "ANET",
    "CSCO"
  ],
  [
    "ANET",
    "JNPR"
  ],
  [
    "CSCO",
    "JNPR"
  ],
  [
    "LITE",
    "CIEN"
  ],
  [
    "MSFT",
    "AMZN"
  ],
  [
    "MSFT",
    "GOOGL"
  ],
  [
    "GOOGL",
    "AMZN"
  ],
  [
    "CRM",
    "MSFT"
  ],
  [
    "NOW",
    "CRM"
  ],
  [
    "PSTG",
    "NTAP"
  ],
  [
    "TSLA",
    "GM"
  ],
  [
    "TSLA",
    "F"
  ],
  [
    "TSLA",
    "RIVN"
  ],
  [
    "TSLA",
    "LCID"
  ],
  [
    "RIVN",
    "LCID"
  ],
  [
    "F",
    "GM"
  ],
  [
    "F",
    "STLA"
  ],
  [
    "GM",
    "STLA"
  ],
  [
    "NIO",
    "XPEV"
  ],
  [
    "XPEV",
    "LI"
  ],
  [
    "TM",
    "F"
  ],
  [
    "TM",
    "HMC"
  ],
  [
    "LIN",
    "APD"
  ],
  [
    "ALB",
    "SQM"
  ],
  [
    "ALB",
    "LAC"
  ],
  [
    "SQM",
    "LAC"
  ],
  [
    "ADI",
    "TXN"
  ],
  [
    "ON",
    "STM"
  ],
  [
    "NXPI",
    "STM"
  ],
  [
    "NXPI",
    "ON"
  ],
  [
    "QCOM",
    "AVGO"
  ],
  [
    "SWKS",
    "QRVO"
  ],
  [
    "SWKS",
    "AVGO"
  ],
  [
    "QRVO",
    "AVGO"
  ],
  [
    "VRT",
    "ETN"
  ],
  [
    "CEG",
    "VST"
  ],
  [
    "CEG",
    "TLN"
  ],
  [
    "VST",
    "TLN"
  ],
  [
    "HPE",
    "DELL"
  ],
  [
    "DELL",
    "SMCI"
  ],
  [
    "HPE",
    "SMCI"
  ],
  [
    "AAPL",
    "GOOGL"
  ],
  [
    "HPQ",
    "DELL"
  ],
  [
    "META",
    "GOOGL"
  ]
];
const graph = {
  stages,
  nodes,
  edges,
  competitors
};
const sectors = [
  {
    id: "technology",
    name: "Information Technology",
    description: "Semiconductors, hardware, cloud/software, and IT services."
  },
  {
    id: "tech-semi",
    parentId: "technology",
    shortId: "semi",
    name: "Semiconductors",
    description: "From wafer materials and fab equipment through design, manufacture, and packaging of silicon.",
    legacyIds: [
      "semi"
    ],
    stages: [
      {
        id: "semi.specialty-materials",
        name: "Specialty Materials & Gases"
      },
      {
        id: "semi.equipment",
        name: "Wafer Fab Equipment"
      },
      {
        id: "semi.eda-ip",
        name: "EDA & IP Licensing"
      },
      {
        id: "semi.foundry",
        name: "Foundries & IDMs"
      },
      {
        id: "semi.memory",
        name: "Memory"
      },
      {
        id: "semi.fabless-logic",
        name: "Fabless Logic",
        legacyIds: [
          "fabless"
        ]
      },
      {
        id: "semi.analog-power",
        name: "Analog & Power",
        legacyIds: [
          "power-sic"
        ]
      },
      {
        id: "semi.atp",
        name: "Assembly, Test & Packaging"
      }
    ]
  },
  {
    id: "tech-hardware",
    parentId: "technology",
    shortId: "hw",
    name: "Technology Hardware",
    description: "Physical IT gear: components, storage, networking, devices, and contract manufacturing.",
    legacyIds: [
      "hardware"
    ],
    stages: [
      {
        id: "hw.components",
        name: "Components & Subassemblies",
        legacyIds: [
          "components"
        ]
      },
      {
        id: "hw.storage",
        name: "Storage Systems",
        legacyIds: [
          "storage"
        ]
      },
      {
        id: "hw.networking-equipment",
        name: "Networking Equipment"
      },
      {
        id: "hw.oems",
        name: "Server & PC OEMs",
        legacyIds: [
          "oems"
        ]
      },
      {
        id: "hw.consumer-devices",
        name: "Consumer Devices",
        legacyIds: [
          "consumer-devices"
        ]
      },
      {
        id: "hw.contract-mfg",
        name: "Contract Manufacturing",
        legacyIds: [
          "contract-mfg"
        ]
      }
    ]
  },
  {
    id: "tech-cloud",
    parentId: "technology",
    shortId: "cloud",
    name: "Cloud & Software",
    description: "Hyperscale and specialty cloud, SaaS platforms and apps, security, data/AI, and edge/CDN.",
    legacyIds: [
      "cloud"
    ],
    stages: [
      {
        id: "cloud.hyperscalers",
        name: "Hyperscale Cloud",
        legacyIds: [
          "hyperscalers"
        ]
      },
      {
        id: "cloud.ai-infra",
        name: "AI Infrastructure & Neoclouds"
      },
      {
        id: "cloud.saas-platform",
        name: "Platform SaaS",
        legacyIds: [
          "saas-platform"
        ]
      },
      {
        id: "cloud.saas-app",
        name: "Application SaaS",
        legacyIds: [
          "saas-app"
        ]
      },
      {
        id: "cloud.security",
        name: "Security",
        legacyIds: [
          "security-obs"
        ]
      },
      {
        id: "cloud.data-ai",
        name: "Data & Observability Platforms",
        legacyIds: [
          "data-ai"
        ]
      },
      {
        id: "cloud.edge-cdn",
        name: "Edge, CDN & Connectivity",
        legacyIds: [
          "edge-cdn"
        ]
      }
    ]
  },
  {
    id: "tech-services",
    parentId: "technology",
    shortId: "itsvc",
    name: "IT Services",
    description: "Consulting, systems integration, and managed IT services sold to enterprise buyers.",
    stages: [
      {
        id: "itsvc.consulting",
        name: "Strategy & Consulting",
        legacyIds: [
          "consulting-advisory"
        ]
      },
      {
        id: "itsvc.systems-integration",
        name: "Systems Integration",
        legacyIds: [
          "systems-integration"
        ]
      },
      {
        id: "itsvc.managed-services",
        name: "Managed Services & BPO",
        legacyIds: [
          "managed-services"
        ]
      },
      {
        id: "itsvc.customers",
        name: "Enterprise Customers",
        legacyIds: [
          "enterprise-clients"
        ]
      }
    ]
  },
  {
    id: "communication-services",
    name: "Communication Services",
    description: "Telecom carriers, media and entertainment, interactive/internet platforms."
  },
  {
    id: "comms-telecom",
    parentId: "communication-services",
    shortId: "telecom",
    name: "Telecommunications",
    description: "Wireless and wireline carriers with their equipment and wholesale-infrastructure suppliers.",
    stages: [
      {
        id: "telecom.network-equipment",
        name: "Network Equipment",
        legacyIds: [
          "network-equipment"
        ]
      },
      {
        id: "telecom.tower-fiber",
        name: "Towers & Fiber Backbone"
      },
      {
        id: "telecom.carriers",
        name: "Wireless & Wireline Carriers",
        legacyIds: [
          "carriers"
        ]
      },
      {
        id: "telecom.resellers-mvno",
        name: "Resellers & MVNOs",
        legacyIds: [
          "resellers-retail"
        ]
      },
      {
        id: "telecom.end-users",
        name: "Subscribers & Enterprise",
        legacyIds: [
          "end-users"
        ]
      }
    ]
  },
  {
    id: "comms-media",
    parentId: "communication-services",
    shortId: "media",
    name: "Media & Entertainment",
    description: "Content creation, studios and production, and the distribution channels (streaming, theatrical) that reach audiences.",
    stages: [
      {
        id: "media.content-creation",
        name: "Content Creation & IP",
        legacyIds: [
          "content-creation"
        ]
      },
      {
        id: "media.production-studios",
        name: "Production & Studios",
        legacyIds: [
          "production-studios"
        ]
      },
      {
        id: "media.distribution-streaming",
        name: "Distribution & Streaming",
        legacyIds: [
          "distribution-streaming"
        ]
      },
      {
        id: "media.theaters-exhibitors",
        name: "Theaters & Exhibitors"
      },
      {
        id: "media.advertisers",
        name: "Advertisers"
      },
      {
        id: "media.audiences",
        name: "Audiences",
        legacyIds: [
          "audiences"
        ]
      }
    ]
  },
  {
    id: "comms-interactive",
    parentId: "communication-services",
    shortId: "interactive",
    name: "Interactive Media & Services",
    description: "Consumer internet platforms funded largely by advertising: search, social, video, gaming, matching. Kept distinct from tech-cloud because the value chain runs creators -> platform -> advertisers -> users, not enterprise-SaaS.",
    stages: [
      {
        id: "interactive.infrastructure",
        name: "Infrastructure & Hosting",
        legacyIds: [
          "infrastructure"
        ]
      },
      {
        id: "interactive.platforms",
        name: "Consumer Platforms",
        legacyIds: [
          "platforms"
        ]
      },
      {
        id: "interactive.creators",
        name: "Creators & Influencers"
      },
      {
        id: "interactive.advertisers",
        name: "Advertisers",
        legacyIds: [
          "advertisers"
        ]
      },
      {
        id: "interactive.users",
        name: "End Users",
        legacyIds: [
          "users"
        ]
      }
    ]
  },
  {
    id: "consumer-discretionary",
    name: "Consumer Discretionary",
    description: "Autos, retail/e-commerce, hotels & leisure, apparel & luxury, and restaurants."
  },
  {
    id: "autos",
    parentId: "consumer-discretionary",
    shortId: "autos",
    name: "Automobiles & Mobility",
    description: "Full auto value chain from battery raw materials through OEMs to dealers, aftermarket, and charging/fueling networks.",
    legacyIds: [
      "auto"
    ],
    stages: [
      {
        id: "autos.battery-raw",
        name: "Battery Raw Materials",
        legacyIds: [
          "battery-raw"
        ]
      },
      {
        id: "autos.battery-cells",
        name: "Battery Cells & Packs",
        legacyIds: [
          "battery-cells"
        ]
      },
      {
        id: "autos.semi",
        name: "Auto Semiconductors",
        legacyIds: [
          "auto-silicon"
        ]
      },
      {
        id: "autos.tier1",
        name: "Tier 1 Suppliers",
        legacyIds: [
          "tier1"
        ]
      },
      {
        id: "autos.oem",
        name: "Vehicle OEMs",
        legacyIds: [
          "oem"
        ]
      },
      {
        id: "autos.dealers",
        name: "Dealer Networks"
      },
      {
        id: "autos.aftermarket",
        name: "Aftermarket Parts & Service"
      },
      {
        id: "autos.charging-fuel",
        name: "Charging & Fueling Networks",
        legacyIds: [
          "charging"
        ]
      }
    ]
  },
  {
    id: "retail-ecom",
    parentId: "consumer-discretionary",
    shortId: "retail",
    name: "Retail & E-commerce",
    description: "Goods retailing across physical stores, marketplaces, and direct-to-consumer, including home improvement and warehouse clubs.",
    stages: [
      {
        id: "retail.sourcing",
        name: "Global Sourcing & Suppliers",
        legacyIds: [
          "sourcing-suppliers"
        ]
      },
      {
        id: "retail.private-label-mfg",
        name: "Private-Label Manufacturing",
        legacyIds: [
          "private-label-manufacturing"
        ]
      },
      {
        id: "retail.brands-wholesale",
        name: "Branded Goods & Wholesale"
      },
      {
        id: "retail.fulfillment",
        name: "Fulfillment & Last-Mile Logistics",
        legacyIds: [
          "fulfillment-logistics"
        ]
      },
      {
        id: "retail.marketplace",
        name: "Online Marketplaces & Storefronts",
        legacyIds: [
          "marketplace-storefront"
        ]
      },
      {
        id: "retail.physical-stores",
        name: "Physical Retail Stores"
      },
      {
        id: "retail.consumer",
        name: "Consumers"
      }
    ]
  },
  {
    id: "hotels-leisure",
    parentId: "consumer-discretionary",
    shortId: "leisure",
    name: "Hotels, Restaurants & Leisure",
    description: "Lodging, gaming, cruise, and destination operators, their real-estate holders, franchise/brand layers, and the OTA/loyalty distribution systems.",
    stages: [
      {
        id: "leisure.real-estate",
        name: "Hotel & Gaming Real Estate",
        legacyIds: [
          "real-estate"
        ]
      },
      {
        id: "leisure.operators",
        name: "Operators (Hotels, Casinos, Cruise)",
        legacyIds: [
          "operations"
        ]
      },
      {
        id: "leisure.brands-franchising",
        name: "Brand Owners & Franchisors"
      },
      {
        id: "leisure.distribution-ota",
        name: "OTAs & Distribution",
        legacyIds: [
          "distribution-loyalty"
        ]
      },
      {
        id: "leisure.loyalty-data",
        name: "Loyalty & Rewards Programs"
      },
      {
        id: "leisure.travelers",
        name: "Travelers",
        legacyIds: [
          "travelers"
        ]
      }
    ]
  },
  {
    id: "apparel-luxury",
    parentId: "consumer-discretionary",
    shortId: "apparel",
    name: "Apparel, Footwear & Luxury",
    description: "Branded apparel, footwear, and luxury goods from raw materials through design, contract manufacturing, retail, resale, and the consumer.",
    stages: [
      {
        id: "apparel.raw-materials",
        name: "Raw Materials & Textiles"
      },
      {
        id: "apparel.design-brand",
        name: "Design & Brand",
        legacyIds: [
          "design-brand"
        ]
      },
      {
        id: "apparel.manufacturing",
        name: "Contract Manufacturing"
      },
      {
        id: "apparel.retail-distribution",
        name: "Retail & Distribution",
        legacyIds: [
          "retail-distribution"
        ]
      },
      {
        id: "apparel.resale",
        name: "Resale & Secondary Market"
      },
      {
        id: "apparel.consumer",
        name: "Consumers"
      }
    ]
  },
  {
    id: "restaurants",
    parentId: "consumer-discretionary",
    shortId: "rest",
    name: "Restaurants & Food Service",
    description: "Quick-service, fast-casual, casual-dining, and coffee concepts plus the food-distribution and ordering-tech layers that serve them. Split out from food-bev because the capital structure (franchise royalties, unit economics) and value chain are distinct.",
    stages: [
      {
        id: "rest.ingredients-suppliers",
        name: "Ingredients & Food Suppliers"
      },
      {
        id: "rest.distribution",
        name: "Food Distribution"
      },
      {
        id: "rest.franchisors",
        name: "Franchisors & Brand Owners"
      },
      {
        id: "rest.operators",
        name: "Restaurant Operators"
      },
      {
        id: "rest.tech-ordering",
        name: "Restaurant Tech & Delivery"
      },
      {
        id: "rest.consumer",
        name: "Consumers"
      }
    ]
  },
  {
    id: "consumer-staples",
    name: "Consumer Staples",
    description: "Everyday goods: packaged food and beverages, household and personal care, food retail, and tobacco."
  },
  {
    id: "food-bev",
    parentId: "consumer-staples",
    shortId: "foodbev",
    name: "Packaged Food & Beverages",
    description: "Ingredient commodities, packaged-food processors, beverage makers, and the distribution/retail layers that reach consumers.",
    stages: [
      {
        id: "foodbev.ingredients",
        name: "Ingredients & Commodities",
        legacyIds: [
          "ingredients-commodities"
        ]
      },
      {
        id: "foodbev.processing",
        name: "Processing & Packaged Foods",
        legacyIds: [
          "processing-bottling"
        ]
      },
      {
        id: "foodbev.beverages",
        name: "Beverages"
      },
      {
        id: "foodbev.distribution",
        name: "Distribution"
      },
      {
        id: "foodbev.retail-foodservice",
        name: "Retail & Food Service",
        legacyIds: [
          "retail-foodservice"
        ]
      },
      {
        id: "foodbev.consumer",
        name: "Consumers"
      }
    ]
  },
  {
    id: "household-personal",
    parentId: "consumer-staples",
    shortId: "hpc",
    name: "Household & Personal Care",
    description: "Cleaning, paper, beauty, and personal-care brands and their supply chain.",
    stages: [
      {
        id: "hpc.raw-materials",
        name: "Raw Materials"
      },
      {
        id: "hpc.manufacturing-brand",
        name: "Manufacturing & Brands",
        legacyIds: [
          "manufacturing-brand"
        ]
      },
      {
        id: "hpc.distribution",
        name: "Distribution"
      },
      {
        id: "hpc.retail",
        name: "Retail"
      },
      {
        id: "hpc.consumer",
        name: "Consumers"
      }
    ]
  },
  {
    id: "food-retail",
    parentId: "consumer-staples",
    shortId: "foodretail",
    name: "Food & Staples Retailing",
    description: "Supermarkets, discount grocers, and club stores.",
    stages: [
      {
        id: "foodretail.sourcing",
        name: "Farm & Producer Sourcing",
        legacyIds: [
          "sourcing"
        ]
      },
      {
        id: "foodretail.distribution-centers",
        name: "Distribution Centers",
        legacyIds: [
          "distribution-centers"
        ]
      },
      {
        id: "foodretail.stores",
        name: "Grocery & Club Stores",
        legacyIds: [
          "stores"
        ]
      },
      {
        id: "foodretail.consumer",
        name: "Consumers"
      }
    ]
  },
  {
    id: "tobacco",
    parentId: "consumer-staples",
    shortId: "tobacco",
    name: "Tobacco & Reduced-Risk Products",
    description: "Combustible tobacco, smokeless, and reduced-risk categories (vapor, heated tobacco, nicotine pouches). Broken out because regulation, distribution, and capital returns don't map onto generic HPC.",
    stages: [
      {
        id: "tobacco.leaf-suppliers",
        name: "Leaf Growers & Suppliers"
      },
      {
        id: "tobacco.manufacturers",
        name: "Manufacturers"
      },
      {
        id: "tobacco.reduced-risk",
        name: "Reduced-Risk Products"
      },
      {
        id: "tobacco.distribution-retail",
        name: "Distribution & Retail"
      },
      {
        id: "tobacco.consumer",
        name: "Consumers"
      }
    ]
  },
  {
    id: "energy",
    name: "Energy",
    description: "Hydrocarbon value chain (upstream/midstream/refining/services) plus renewable-energy equipment and projects."
  },
  {
    id: "energy-upstream",
    parentId: "energy",
    shortId: "upstream",
    name: "Oil & Gas Upstream",
    description: "Exploration and production of crude oil, natural gas, and NGLs.",
    stages: [
      {
        id: "upstream.leases-acreage",
        name: "Leases & Acreage"
      },
      {
        id: "upstream.exploration",
        name: "Exploration & Appraisal",
        legacyIds: [
          "exploration"
        ]
      },
      {
        id: "upstream.drilling-completion",
        name: "Drilling & Completion",
        legacyIds: [
          "drilling-production"
        ]
      },
      {
        id: "upstream.production",
        name: "Production"
      },
      {
        id: "upstream.gathering-sales",
        name: "Gathering & Sales",
        legacyIds: [
          "reserves-transport"
        ]
      }
    ]
  },
  {
    id: "energy-midstream",
    parentId: "energy",
    shortId: "midstream",
    name: "Oil & Gas Midstream",
    description: "Gathering, processing, transportation, storage, and export terminals for hydrocarbons.",
    stages: [
      {
        id: "midstream.gathering-processing",
        name: "Gathering & Processing",
        legacyIds: [
          "gathering-processing"
        ]
      },
      {
        id: "midstream.pipelines-storage",
        name: "Pipelines & Storage",
        legacyIds: [
          "pipelines-storage"
        ]
      },
      {
        id: "midstream.terminals-export",
        name: "Terminals & LNG Export",
        legacyIds: [
          "terminals-export"
        ]
      },
      {
        id: "midstream.marketing-trading",
        name: "Marketing & Trading"
      }
    ]
  },
  {
    id: "energy-refining",
    parentId: "energy",
    shortId: "refining",
    name: "Refining & Marketing",
    description: "Crude refining, petrochemical integration, fuel wholesale and retail.",
    stages: [
      {
        id: "refining.crude-input",
        name: "Crude Input",
        legacyIds: [
          "crude-input"
        ]
      },
      {
        id: "refining.refining-process",
        name: "Refining",
        legacyIds: [
          "refining"
        ]
      },
      {
        id: "refining.petrochemicals",
        name: "Petrochemical Integration"
      },
      {
        id: "refining.marketing-wholesale",
        name: "Marketing & Wholesale",
        legacyIds: [
          "marketing-distribution"
        ]
      },
      {
        id: "refining.retail-fuel",
        name: "Retail Fueling"
      },
      {
        id: "refining.end-consumers",
        name: "End Fuel Consumers",
        legacyIds: [
          "end-fuel-consumers"
        ]
      }
    ]
  },
  {
    id: "energy-services",
    parentId: "energy",
    shortId: "ofs",
    name: "Oilfield Services & Equipment",
    description: "Services, rigs, and equipment sold to upstream operators.",
    stages: [
      {
        id: "ofs.equipment-manufacturing",
        name: "Equipment Manufacturing",
        legacyIds: [
          "equipment-manufacturing"
        ]
      },
      {
        id: "ofs.drilling-contractors",
        name: "Drilling Contractors",
        legacyIds: [
          "drilling-contractors"
        ]
      },
      {
        id: "ofs.well-services",
        name: "Well Services & Completions",
        legacyIds: [
          "oilfield-services"
        ]
      },
      {
        id: "ofs.subsea-offshore",
        name: "Subsea & Offshore"
      },
      {
        id: "ofs.operator-customers",
        name: "Operator Customers",
        legacyIds: [
          "operator-customers"
        ]
      }
    ]
  },
  {
    id: "energy-renewables",
    parentId: "energy",
    shortId: "renewables",
    name: "Renewables & Clean Energy",
    description: "Equipment makers and installers across solar, wind, storage, and hydrogen/fuel-cell. Regulated and independent renewable operators live in util-indep-power; this sub-sector covers what's upstream of them plus residential installers. Added because FSLR, ENPH, PLUG, BE and similar had no natural home in v2.",
    stages: [
      {
        id: "renewables.solar-equipment",
        name: "Solar Panels & Inverters"
      },
      {
        id: "renewables.wind-equipment",
        name: "Wind Turbines & Components"
      },
      {
        id: "renewables.storage-batteries",
        name: "Grid-Scale Storage"
      },
      {
        id: "renewables.hydrogen-fuelcell",
        name: "Hydrogen & Fuel Cells"
      },
      {
        id: "renewables.installers",
        name: "Installers & Distributors"
      },
      {
        id: "renewables.project-developers",
        name: "Project Developers & EPC"
      },
      {
        id: "renewables.offtakers",
        name: "PPA Offtakers"
      }
    ]
  },
  {
    id: "financials",
    name: "Financials",
    description: "Banks, payments, insurance, capital markets, alternative asset managers, exchanges, and crypto-native financials."
  },
  {
    id: "fin-banks",
    parentId: "financials",
    shortId: "banks",
    name: "Banks",
    description: "Deposit-funded lenders from community banks to money-center universals.",
    stages: [
      {
        id: "banks.deposits",
        name: "Deposits & Core Banking",
        legacyIds: [
          "deposits"
        ]
      },
      {
        id: "banks.retail-lending",
        name: "Retail Lending",
        legacyIds: [
          "retail-lending"
        ]
      },
      {
        id: "banks.commercial-lending",
        name: "Commercial Lending",
        legacyIds: [
          "commercial-lending"
        ]
      },
      {
        id: "banks.capital-markets",
        name: "Capital-Markets Activities",
        legacyIds: [
          "capital-markets-activities"
        ]
      },
      {
        id: "banks.wealth-management",
        name: "Wealth Management",
        legacyIds: [
          "wealth-management"
        ]
      }
    ]
  },
  {
    id: "fin-payments",
    parentId: "financials",
    shortId: "payments",
    name: "Payments",
    description: "Card issuers, networks, acquirers, processors, gateways, and merchants.",
    stages: [
      {
        id: "payments.issuing",
        name: "Card Issuing",
        legacyIds: [
          "issuing"
        ]
      },
      {
        id: "payments.network",
        name: "Payment Networks",
        legacyIds: [
          "network"
        ]
      },
      {
        id: "payments.acquiring-processing",
        name: "Acquiring & Processing",
        legacyIds: [
          "acquiring-processing"
        ]
      },
      {
        id: "payments.gateway-orchestration",
        name: "Gateways & Orchestration"
      },
      {
        id: "payments.merchants",
        name: "Merchants",
        legacyIds: [
          "merchants"
        ]
      },
      {
        id: "payments.consumer",
        name: "Consumers"
      }
    ]
  },
  {
    id: "fin-insurance",
    parentId: "financials",
    shortId: "ins",
    name: "Insurance",
    description: "P&C and life underwriters, reinsurance, brokers, claims services, and insurance asset managers.",
    stages: [
      {
        id: "ins.underwriting-pc",
        name: "P&C Underwriters",
        legacyIds: [
          "underwriting"
        ]
      },
      {
        id: "ins.underwriting-life",
        name: "Life & Annuity Underwriters"
      },
      {
        id: "ins.reinsurance",
        name: "Reinsurers",
        legacyIds: [
          "reinsurance"
        ]
      },
      {
        id: "ins.distribution-brokers",
        name: "Brokers & Distribution",
        legacyIds: [
          "distribution-brokers"
        ]
      },
      {
        id: "ins.services",
        name: "Claims & Services",
        legacyIds: [
          "claims-services"
        ]
      },
      {
        id: "ins.asset-management",
        name: "Insurance Asset Management"
      }
    ]
  },
  {
    id: "fin-capital-markets",
    parentId: "financials",
    shortId: "cm",
    name: "Capital Markets",
    description: "Investment banks, broker-dealers, traditional asset managers, wealth advisory, and market data. Exchanges are now split into fin-exchanges.",
    stages: [
      {
        id: "cm.investment-banking",
        name: "Investment Banking",
        legacyIds: [
          "investment-banking"
        ]
      },
      {
        id: "cm.sales-trading",
        name: "Sales & Trading",
        legacyIds: [
          "sales-trading"
        ]
      },
      {
        id: "cm.asset-management",
        name: "Traditional Asset Management",
        legacyIds: [
          "asset-management"
        ]
      },
      {
        id: "cm.wealth-advisory",
        name: "Wealth Advisory & Brokerage",
        legacyIds: [
          "wealth-advisory"
        ]
      },
      {
        id: "cm.market-data-analytics",
        name: "Market Data & Analytics",
        legacyIds: [
          "market-data"
        ]
      }
    ]
  },
  {
    id: "fin-alternatives",
    parentId: "financials",
    shortId: "alts",
    name: "Alternative Asset Managers",
    description: "Private equity, private credit, real assets, and hedge-fund platforms (APO, BX, KKR, ARES, OWL, CG, BAM, TPG, HLNE). Replaces fin-diversified, whose 'stages' were really business lines not value-chain positions.",
    legacyIds: [
      "fin-diversified"
    ],
    stages: [
      {
        id: "alts.lp-fundraising",
        name: "LP Capital Raising"
      },
      {
        id: "alts.gp-managers",
        name: "GP Asset Managers"
      },
      {
        id: "alts.portfolio-companies",
        name: "Portfolio Companies"
      },
      {
        id: "alts.permanent-capital",
        name: "Permanent-Capital Vehicles"
      },
      {
        id: "alts.secondary-exits",
        name: "Secondaries & Exits"
      }
    ]
  },
  {
    id: "fin-exchanges",
    parentId: "financials",
    shortId: "exch",
    name: "Exchanges & Trading Infrastructure",
    description: "Listing venues, trading platforms, clearinghouses, and the exchange-owned market-data layer (CME, ICE, NDAQ, CBOE, MKTX, VIRT). Split from fin-capital-markets because the value chain is listing -> trading -> clearing -> data, not intermediation.",
    stages: [
      {
        id: "exch.listings",
        name: "Issuer Listings"
      },
      {
        id: "exch.trading-venues",
        name: "Trading Venues & ECNs"
      },
      {
        id: "exch.clearing-settlement",
        name: "Clearing & Settlement"
      },
      {
        id: "exch.market-data",
        name: "Exchange Market Data"
      },
      {
        id: "exch.participants",
        name: "Members & Participants"
      }
    ]
  },
  {
    id: "fin-crypto",
    parentId: "financials",
    shortId: "crypto",
    name: "Crypto-Native Financials",
    description: "Publicly-traded crypto miners, exchanges/brokers, custody and infrastructure, treasury holders, and stablecoin/asset issuers (COIN, MARA, RIOT, CLSK, CORZ, IREN, MSTR, GLXY, CRCL). Worth its own leaf because revenue drivers (BTC price, hashrate, trading velocity) don't map to banks, exchanges, or payments cleanly.",
    stages: [
      {
        id: "crypto.mining",
        name: "Mining"
      },
      {
        id: "crypto.exchanges-brokers",
        name: "Exchanges & Brokers"
      },
      {
        id: "crypto.custody-infra",
        name: "Custody & Infrastructure"
      },
      {
        id: "crypto.asset-issuers",
        name: "Stablecoin & Asset Issuers"
      },
      {
        id: "crypto.treasury-holders",
        name: "Treasury Holders"
      },
      {
        id: "crypto.end-users",
        name: "End Users"
      }
    ]
  },
  {
    id: "healthcare",
    name: "Health Care",
    description: "Pharma, biotech, devices, managed care, healthcare services, and life-science tools."
  },
  {
    id: "hc-pharma",
    parentId: "healthcare",
    shortId: "pharma",
    name: "Pharmaceuticals",
    description: "Large-cap, diversified pharma: discovery, trials, manufacturing, distribution, and payer/prescriber channels.",
    stages: [
      {
        id: "pharma.discovery",
        name: "Discovery & Research",
        legacyIds: [
          "discovery-research"
        ]
      },
      {
        id: "pharma.clinical-trials",
        name: "Clinical Trials",
        legacyIds: [
          "clinical-trials"
        ]
      },
      {
        id: "pharma.manufacturing",
        name: "Manufacturing"
      },
      {
        id: "pharma.distribution",
        name: "Distribution"
      },
      {
        id: "pharma.payers-pbms",
        name: "Payers & PBMs"
      },
      {
        id: "pharma.prescribers",
        name: "Prescribers & Providers",
        legacyIds: [
          "prescribers-payers"
        ]
      }
    ]
  },
  {
    id: "hc-biotech",
    parentId: "healthcare",
    shortId: "biotech",
    name: "Biotechnology",
    description: "Single-asset-risk biotech distinct from diversified pharma. Platform technologies (mRNA, gene therapy, antibody engineering) called out as a dedicated stage.",
    stages: [
      {
        id: "biotech.discovery",
        name: "Discovery & Target ID"
      },
      {
        id: "biotech.preclinical",
        name: "Preclinical"
      },
      {
        id: "biotech.platform-technology",
        name: "Platform Technology"
      },
      {
        id: "biotech.clinical-development",
        name: "Clinical Development",
        legacyIds: [
          "clinical-development"
        ]
      },
      {
        id: "biotech.manufacturing",
        name: "Manufacturing & Scale-up"
      },
      {
        id: "biotech.commercialization",
        name: "Commercialization",
        legacyIds: [
          "commercialization"
        ]
      }
    ]
  },
  {
    id: "hc-devices",
    parentId: "healthcare",
    shortId: "meddev",
    name: "Medical Devices & Supplies",
    description: "Durable medical equipment, disposables, diagnostics hardware, and implantables.",
    stages: [
      {
        id: "meddev.research-development",
        name: "R&D",
        legacyIds: [
          "research-development"
        ]
      },
      {
        id: "meddev.components",
        name: "Components & Subassemblies"
      },
      {
        id: "meddev.manufacturing",
        name: "Manufacturing"
      },
      {
        id: "meddev.distribution",
        name: "Distribution"
      },
      {
        id: "meddev.providers",
        name: "Providers & Hospitals",
        legacyIds: [
          "providers"
        ]
      }
    ]
  },
  {
    id: "hc-insurance",
    parentId: "healthcare",
    shortId: "hcins",
    name: "Managed Care & Health Insurance",
    description: "Health insurers, PBMs, and benefits administrators.",
    stages: [
      {
        id: "hcins.carriers",
        name: "Managed Care Carriers"
      },
      {
        id: "hcins.pbms",
        name: "PBMs",
        legacyIds: [
          "pbms"
        ]
      },
      {
        id: "hcins.benefits-admin",
        name: "Benefits Administration",
        legacyIds: [
          "benefits-administration"
        ]
      },
      {
        id: "hcins.providers-consumers",
        name: "Providers & Members",
        legacyIds: [
          "providers-consumers"
        ]
      }
    ]
  },
  {
    id: "hc-services",
    parentId: "healthcare",
    shortId: "hcsvc",
    name: "Healthcare Services",
    description: "Hospitals, outpatient clinics, diagnostics labs, retail pharmacy, and digital-care platforms.",
    stages: [
      {
        id: "hcsvc.hospitals-systems",
        name: "Hospital Systems",
        legacyIds: [
          "hospitals-systems"
        ]
      },
      {
        id: "hcsvc.outpatient-clinics",
        name: "Outpatient & Ambulatory",
        legacyIds: [
          "outpatient-clinics"
        ]
      },
      {
        id: "hcsvc.diagnostics-labs",
        name: "Diagnostics & Labs",
        legacyIds: [
          "diagnostics-labs"
        ]
      },
      {
        id: "hcsvc.retail-pharmacy",
        name: "Retail Pharmacy",
        legacyIds: [
          "retail-pharmacy"
        ]
      },
      {
        id: "hcsvc.care-mgmt-digital",
        name: "Care Management & Digital Health"
      }
    ]
  },
  {
    id: "hc-tools",
    parentId: "healthcare",
    shortId: "lifesci",
    name: "Life Science Tools & CROs",
    description: "Instruments, reagents, bioprocessing, and contract research services sold into pharma, biotech, and academia.",
    stages: [
      {
        id: "lifesci.instruments",
        name: "Instruments",
        legacyIds: [
          "instruments"
        ]
      },
      {
        id: "lifesci.reagents-consumables",
        name: "Reagents & Consumables",
        legacyIds: [
          "reagents-consumables"
        ]
      },
      {
        id: "lifesci.bioprocessing",
        name: "Bioprocessing"
      },
      {
        id: "lifesci.cros-services",
        name: "CROs & Lab Services",
        legacyIds: [
          "services"
        ]
      },
      {
        id: "lifesci.research-labs",
        name: "Research Labs & Institutions",
        legacyIds: [
          "research-labs"
        ]
      }
    ]
  },
  {
    id: "industrials",
    name: "Industrials",
    description: "Aerospace & defense, machinery, transportation, construction/E&C, electrical infrastructure, instruments, and commercial services."
  },
  {
    id: "ind-aerospace-defense",
    parentId: "industrials",
    shortId: "ad",
    name: "Aerospace & Defense",
    description: "Legacy primes and new-space/defense-tech entrants plus the tiered supplier base and MRO layer.",
    stages: [
      {
        id: "ad.research-development",
        name: "R&D"
      },
      {
        id: "ad.primes",
        name: "Legacy Primes",
        legacyIds: [
          "primes"
        ]
      },
      {
        id: "ad.new-space-defense-tech",
        name: "New-Space & Defense Tech"
      },
      {
        id: "ad.tier-1-suppliers",
        name: "Tier 1 Suppliers",
        legacyIds: [
          "tier-1-suppliers"
        ]
      },
      {
        id: "ad.tier-2-suppliers",
        name: "Tier 2 Suppliers",
        legacyIds: [
          "tier-2-suppliers"
        ]
      },
      {
        id: "ad.mro-services",
        name: "MRO & Aftermarket"
      },
      {
        id: "ad.customers-mil-commercial",
        name: "Military & Commercial Customers",
        legacyIds: [
          "customers-military-commercial"
        ]
      }
    ]
  },
  {
    id: "ind-machinery",
    parentId: "industrials",
    shortId: "mach",
    name: "Industrial Machinery",
    description: "General industrial, agriculture, and construction-equipment OEMs and their components, distribution, and rental channels.",
    stages: [
      {
        id: "mach.components",
        name: "Components"
      },
      {
        id: "mach.oems",
        name: "Machinery OEMs"
      },
      {
        id: "mach.distribution",
        name: "Distribution"
      },
      {
        id: "mach.rental",
        name: "Equipment Rental"
      },
      {
        id: "mach.end-users",
        name: "End Users"
      }
    ]
  },
  {
    id: "ind-transportation",
    parentId: "industrials",
    shortId: "trans",
    name: "Transportation & Logistics",
    description: "Rail, trucking/LTL, air freight/parcel, ocean shipping, passenger airlines, and logistics platforms. Broken down finer than v2 because the drivers differ substantially by mode.",
    stages: [
      {
        id: "trans.equipment-assets",
        name: "Equipment & Assets",
        legacyIds: [
          "equipment-assets"
        ]
      },
      {
        id: "trans.freight-rail",
        name: "Freight Rail"
      },
      {
        id: "trans.trucking-ltl",
        name: "Trucking & LTL"
      },
      {
        id: "trans.air-parcel",
        name: "Air Freight & Parcel"
      },
      {
        id: "trans.ocean-shipping",
        name: "Ocean Shipping"
      },
      {
        id: "trans.passenger-airlines",
        name: "Passenger Airlines"
      },
      {
        id: "trans.logistics-tech",
        name: "Logistics Platforms & Tech",
        legacyIds: [
          "logistics-platforms",
          "operators-carriers"
        ]
      },
      {
        id: "trans.shippers-customers",
        name: "Shippers & Customers",
        legacyIds: [
          "shippers-customers"
        ]
      }
    ]
  },
  {
    id: "ind-construction",
    parentId: "industrials",
    shortId: "const",
    name: "Construction & Engineering",
    description: "E&C firms, general contractors, and specialty trade contractors. Construction materials live in mat-construction; electrical contractors appear under ind-electrical.",
    stages: [
      {
        id: "const.engineering-design",
        name: "Engineering & Design",
        legacyIds: [
          "engineering-design"
        ]
      },
      {
        id: "const.materials-suppliers",
        name: "Materials Suppliers",
        legacyIds: [
          "materials-suppliers"
        ]
      },
      {
        id: "const.construction-equipment",
        name: "Construction Equipment"
      },
      {
        id: "const.builders-contractors",
        name: "Builders & Contractors",
        legacyIds: [
          "builders-contractors"
        ]
      },
      {
        id: "const.specialty-trades",
        name: "Specialty Trades"
      },
      {
        id: "const.end-customers",
        name: "End Customers",
        legacyIds: [
          "end-customers"
        ]
      }
    ]
  },
  {
    id: "ind-electrical",
    parentId: "industrials",
    shortId: "indelec",
    name: "Electrical Infrastructure & Automation",
    description: "Renamed from ind-infra. Captures the electrification + data-center build-out value chain: power-gen equipment, T&D gear, automation/controls, data-center power and cooling, and electrical EPC. Distinct from util-electric (regulated operators) because these are the SUPPLIERS to those operators and to hyperscalers.",
    legacyIds: [
      "ind-infra",
      "energy"
    ],
    stages: [
      {
        id: "indelec.power-gen-equipment",
        name: "Power Generation Equipment",
        legacyIds: [
          "power-gen"
        ]
      },
      {
        id: "indelec.t-and-d-equipment",
        name: "T&D Equipment",
        legacyIds: [
          "grid-equipment"
        ]
      },
      {
        id: "indelec.automation-controls",
        name: "Automation & Controls"
      },
      {
        id: "indelec.dc-power",
        name: "Data Center Power",
        legacyIds: [
          "dc-power"
        ]
      },
      {
        id: "indelec.dc-cooling",
        name: "Data Center Cooling",
        legacyIds: [
          "dc-cooling"
        ]
      },
      {
        id: "indelec.e-and-c-contractors",
        name: "Electrical EPC & Contractors"
      },
      {
        id: "indelec.customers",
        name: "Utilities, Hyperscalers & Factories"
      }
    ]
  },
  {
    id: "ind-instruments",
    parentId: "industrials",
    shortId: "instr",
    name: "Industrial Technology & Instruments",
    description: "Test & measurement, process and analytical instruments, and industrial/engineering software. New leaf to handle AME, KEYS, FTV, MKSI, TRMB, and the instrument side of ROP - diversified industrial-tech companies whose value chain (components -> instruments -> software analytics) doesn't match ind-machinery.",
    stages: [
      {
        id: "instr.components-sensors",
        name: "Components & Sensors"
      },
      {
        id: "instr.test-measurement",
        name: "Test & Measurement Platforms"
      },
      {
        id: "instr.process-analytical",
        name: "Process & Analytical Instruments"
      },
      {
        id: "instr.industrial-software",
        name: "Industrial & Operational Software"
      },
      {
        id: "instr.distribution",
        name: "Distribution"
      },
      {
        id: "instr.end-markets",
        name: "End Markets"
      }
    ]
  },
  {
    id: "ind-commercial-services",
    parentId: "industrials",
    shortId: "bizsvc",
    name: "Commercial & Environmental Services",
    description: "Waste management, staffing/HR, uniforms and office supplies, testing/inspection, and pest/facilities services. WM, RSG, CTAS, RHI, ROL had no home in v2.",
    stages: [
      {
        id: "bizsvc.waste-environmental",
        name: "Waste & Environmental Services"
      },
      {
        id: "bizsvc.staffing-hr",
        name: "Staffing & HR Services"
      },
      {
        id: "bizsvc.uniforms-supplies",
        name: "Uniforms & Office Supplies"
      },
      {
        id: "bizsvc.testing-inspection",
        name: "Testing & Inspection"
      },
      {
        id: "bizsvc.pest-facilities",
        name: "Pest & Facilities Services"
      },
      {
        id: "bizsvc.customers",
        name: "Commercial Customers"
      }
    ]
  },
  {
    id: "materials",
    name: "Materials",
    description: "Chemicals and specialty materials, metals & mining, packaging, and construction materials."
  },
  {
    id: "mat-chemicals",
    parentId: "materials",
    shortId: "chem",
    name: "Chemicals & Specialty Materials",
    description: "Basic chemicals and industrial gases, specialty chemicals, advanced materials (GLW-class specialty glass, composites), agricultural inputs, and coatings/paints.",
    stages: [
      {
        id: "chem.feedstock",
        name: "Feedstock",
        legacyIds: [
          "feedstock"
        ]
      },
      {
        id: "chem.basic-chemicals",
        name: "Basic Chemicals & Industrial Gases",
        legacyIds: [
          "basic-chemicals"
        ]
      },
      {
        id: "chem.specialty-chemicals",
        name: "Specialty Chemicals",
        legacyIds: [
          "specialty-chemicals"
        ]
      },
      {
        id: "chem.advanced-materials",
        name: "Advanced Materials"
      },
      {
        id: "chem.ag-inputs",
        name: "Agricultural Inputs"
      },
      {
        id: "chem.coatings-paints",
        name: "Coatings & Paints"
      },
      {
        id: "chem.downstream-customers",
        name: "Downstream Customers",
        legacyIds: [
          "downstream-customers"
        ]
      }
    ]
  },
  {
    id: "mat-metals-mining",
    parentId: "materials",
    shortId: "metals",
    name: "Metals & Mining",
    description: "Exploration, mining, smelting, coal, and metals fabrication.",
    stages: [
      {
        id: "metals.exploration",
        name: "Exploration"
      },
      {
        id: "metals.mining-extraction",
        name: "Mining & Extraction",
        legacyIds: [
          "mining-extraction"
        ]
      },
      {
        id: "metals.smelting-refining",
        name: "Smelting & Refining",
        legacyIds: [
          "smelting-refining"
        ]
      },
      {
        id: "metals.coal",
        name: "Coal Mining"
      },
      {
        id: "metals.fabrication",
        name: "Fabrication",
        legacyIds: [
          "fabrication-customers"
        ]
      },
      {
        id: "metals.downstream-customers",
        name: "Downstream Customers"
      }
    ]
  },
  {
    id: "mat-packaging",
    parentId: "materials",
    shortId: "pkg",
    name: "Packaging",
    description: "Paper, metal, glass, and flexible plastic packaging.",
    stages: [
      {
        id: "pkg.raw-materials",
        name: "Raw Materials"
      },
      {
        id: "pkg.paper-board",
        name: "Paper & Paperboard"
      },
      {
        id: "pkg.metal-glass",
        name: "Metal & Glass"
      },
      {
        id: "pkg.plastic-flexible",
        name: "Plastic & Flexible",
        legacyIds: [
          "converters-manufacturers"
        ]
      },
      {
        id: "pkg.brand-owners",
        name: "Brand Owners",
        legacyIds: [
          "brand-owners"
        ]
      },
      {
        id: "pkg.retail-consumer",
        name: "Retail & Consumer",
        legacyIds: [
          "retail-consumer"
        ]
      }
    ]
  },
  {
    id: "mat-construction",
    parentId: "materials",
    shortId: "bldg",
    name: "Construction Materials",
    description: "Aggregates, cement, building products manufacturing, and distribution into builders and retail.",
    stages: [
      {
        id: "bldg.raw-materials",
        name: "Raw Materials"
      },
      {
        id: "bldg.aggregates-cement",
        name: "Aggregates & Cement"
      },
      {
        id: "bldg.manufacturing",
        name: "Building Products Manufacturing"
      },
      {
        id: "bldg.distribution",
        name: "Distribution"
      },
      {
        id: "bldg.builders-end-use",
        name: "Builders & End Use",
        legacyIds: [
          "builders-end-use"
        ]
      }
    ]
  },
  {
    id: "real-estate",
    name: "Real Estate",
    description: "REITs split by property type, homebuilders, real-estate services and proptech, and mortgage finance."
  },
  {
    id: "re-residential",
    parentId: "real-estate",
    shortId: "resi",
    name: "Residential REITs",
    description: "Apartment, single-family rental, manufactured home, and student housing REITs (AVB, EQR, ESS, UDR, CPT, INVH, AMH, SUI).",
    stages: [
      {
        id: "resi.land-sites",
        name: "Land & Site Acquisition"
      },
      {
        id: "resi.development",
        name: "Development"
      },
      {
        id: "resi.property-operations",
        name: "Property Operations"
      },
      {
        id: "resi.tenants",
        name: "Tenants"
      },
      {
        id: "resi.capital-markets",
        name: "REIT Capital Markets"
      }
    ]
  },
  {
    id: "re-office",
    parentId: "real-estate",
    shortId: "office",
    name: "Office REITs",
    description: "Office and lab/office REITs (BXP, VNO, SLG, CUZ, DEI, ARE lab office).",
    stages: [
      {
        id: "office.land-development",
        name: "Land & Development"
      },
      {
        id: "office.property-operations",
        name: "Office Property Operations"
      },
      {
        id: "office.tenants",
        name: "Corporate Tenants"
      },
      {
        id: "office.capital-markets",
        name: "Capital Markets"
      }
    ]
  },
  {
    id: "re-retail-property",
    parentId: "real-estate",
    shortId: "retailprop",
    name: "Retail-Property REITs",
    description: "Malls, shopping centers, and net-lease retail REITs (SPG, KIM, REG, FRT, O, WPC, ADC, NNN).",
    stages: [
      {
        id: "retailprop.land-development",
        name: "Land & Development"
      },
      {
        id: "retailprop.property-operations",
        name: "Retail Property Operations"
      },
      {
        id: "retailprop.tenants-retailers",
        name: "Retailer Tenants"
      },
      {
        id: "retailprop.capital-markets",
        name: "Capital Markets"
      }
    ]
  },
  {
    id: "re-industrial-logistics",
    parentId: "real-estate",
    shortId: "indlog",
    name: "Industrial & Logistics REITs",
    description: "Warehouse and logistics REITs (PLD, EGP, REXR, FR, TRNO, STAG).",
    stages: [
      {
        id: "indlog.land-development",
        name: "Industrial Land & Development"
      },
      {
        id: "indlog.property-operations",
        name: "Industrial Property Operations"
      },
      {
        id: "indlog.tenants-logistics",
        name: "Logistics Tenants"
      },
      {
        id: "indlog.capital-markets",
        name: "Capital Markets"
      }
    ]
  },
  {
    id: "re-infrastructure",
    parentId: "real-estate",
    shortId: "reinfra",
    name: "Infrastructure REITs",
    description: "Data-center, cell-tower, and fiber REITs (EQIX, DLR, AMT, CCI, SBAC, UNIT). Distinct from re-specialty because the AI/cloud and 5G secular stories are large enough to warrant their own leaf.",
    stages: [
      {
        id: "reinfra.data-center",
        name: "Data-Center REITs"
      },
      {
        id: "reinfra.towers",
        name: "Cell Towers"
      },
      {
        id: "reinfra.fiber",
        name: "Fiber Networks"
      },
      {
        id: "reinfra.tenants-hyperscale",
        name: "Hyperscaler & Carrier Tenants"
      },
      {
        id: "reinfra.capital-markets",
        name: "Capital Markets"
      }
    ]
  },
  {
    id: "re-specialty",
    parentId: "real-estate",
    shortId: "respec",
    name: "Specialty REITs",
    description: "Self-storage, healthcare property, lodging, timber/farmland, and gaming REITs. Also the default landing spot for re-reits tickers during migration - flag them for re-classification.",
    legacyIds: [
      "re-reits"
    ],
    stages: [
      {
        id: "respec.self-storage",
        name: "Self-Storage",
        legacyIds: [
          "property-management"
        ]
      },
      {
        id: "respec.healthcare-property",
        name: "Healthcare Property"
      },
      {
        id: "respec.lodging-hotels",
        name: "Lodging & Hotel REITs"
      },
      {
        id: "respec.timber-farmland",
        name: "Timber & Farmland"
      },
      {
        id: "respec.gaming",
        name: "Gaming REITs"
      }
    ]
  },
  {
    id: "re-homebuilders",
    parentId: "real-estate",
    shortId: "homebld",
    name: "Homebuilders",
    description: "For-sale single-family and multi-family builders (DHI, LEN, PHM, TOL, KBH, NVR, MTH, TMHC, LGIH).",
    legacyIds: [
      "re-dev"
    ],
    stages: [
      {
        id: "homebld.land-acquisition",
        name: "Land Acquisition",
        legacyIds: [
          "land-acquisition"
        ]
      },
      {
        id: "homebld.entitlements-sites",
        name: "Entitlements & Site Development"
      },
      {
        id: "homebld.construction",
        name: "Construction",
        legacyIds: [
          "construction"
        ]
      },
      {
        id: "homebld.sales-marketing",
        name: "Sales & Marketing",
        legacyIds: [
          "sales-leasing"
        ]
      },
      {
        id: "homebld.buyers",
        name: "Buyers"
      }
    ]
  },
  {
    id: "re-services",
    parentId: "real-estate",
    shortId: "resvc",
    name: "Real-Estate Services & PropTech",
    description: "Commercial and residential brokerage, property management, title/escrow, and proptech marketplaces (CBRE, JLL, RMAX, COMP, Z, RDFN, CSGP, OPEN, FAF, FNF).",
    stages: [
      {
        id: "resvc.brokerage-commercial",
        name: "Commercial Brokerage"
      },
      {
        id: "resvc.brokerage-residential",
        name: "Residential Brokerage"
      },
      {
        id: "resvc.property-management",
        name: "Property Management"
      },
      {
        id: "resvc.proptech",
        name: "PropTech & Marketplaces"
      },
      {
        id: "resvc.title-escrow",
        name: "Title & Escrow"
      }
    ]
  },
  {
    id: "re-mortgage",
    parentId: "real-estate",
    shortId: "mort",
    name: "Mortgage Finance",
    description: "Mortgage originators, servicers, mortgage REITs (agency and commercial), and MBS markets (RKT, UWMC, PFSI, COOP, AGNC, NLY, STWD, BXMT, ABR).",
    stages: [
      {
        id: "mort.originators",
        name: "Mortgage Originators"
      },
      {
        id: "mort.servicers",
        name: "Mortgage Servicers"
      },
      {
        id: "mort.mreits",
        name: "Mortgage REITs"
      },
      {
        id: "mort.mbs-markets",
        name: "MBS Markets"
      },
      {
        id: "mort.borrowers",
        name: "Borrowers"
      }
    ]
  },
  {
    id: "utilities",
    name: "Utilities",
    description: "Regulated electric, gas, and water utilities plus merchant and renewable independent power producers."
  },
  {
    id: "util-electric",
    parentId: "utilities",
    shortId: "utilelec",
    name: "Electric Utilities",
    description: "Regulated electric utilities with integrated or separated generation, transmission, and distribution (DUK, SO, NEE-FPL, AEP, D, XEL, ETR, PPL).",
    stages: [
      {
        id: "utilelec.generation",
        name: "Generation",
        legacyIds: [
          "generation"
        ]
      },
      {
        id: "utilelec.transmission",
        name: "Transmission",
        legacyIds: [
          "transmission"
        ]
      },
      {
        id: "utilelec.distribution",
        name: "Distribution"
      },
      {
        id: "utilelec.retail-customers",
        name: "Retail Customers",
        legacyIds: [
          "retail-customers"
        ]
      }
    ]
  },
  {
    id: "util-gas",
    parentId: "utilities",
    shortId: "utilgas",
    name: "Gas Utilities",
    description: "Local gas distribution companies (ATO, NJR, NI, NFG, SWX, SR).",
    stages: [
      {
        id: "utilgas.supply",
        name: "Supply",
        legacyIds: [
          "supply"
        ]
      },
      {
        id: "utilgas.pipeline-transport",
        name: "Pipeline Transport",
        legacyIds: [
          "pipeline-transport"
        ]
      },
      {
        id: "utilgas.distribution",
        name: "Local Distribution"
      },
      {
        id: "utilgas.end-users",
        name: "End Users"
      }
    ]
  },
  {
    id: "util-water",
    parentId: "utilities",
    shortId: "water",
    name: "Water Utilities",
    description: "Regulated water and wastewater utilities (AWK, WTRG, CWT, AWR, SJW, YORW).",
    stages: [
      {
        id: "water.source-treatment",
        name: "Source & Treatment",
        legacyIds: [
          "source-treatment"
        ]
      },
      {
        id: "water.distribution",
        name: "Distribution"
      },
      {
        id: "water.customers",
        name: "Customers",
        legacyIds: [
          "customers"
        ]
      }
    ]
  },
  {
    id: "util-indep-power",
    parentId: "utilities",
    shortId: "ipp",
    name: "Independent Power Producers",
    description: "Merchant and renewable IPPs selling into wholesale power markets (NRG, VST, CEG nuclear, TLN, BEP, AES, NEP, AY). Renewable equipment makers live in energy-renewables.",
    stages: [
      {
        id: "ipp.equipment-suppliers",
        name: "Equipment Suppliers",
        legacyIds: [
          "equipment-suppliers"
        ]
      },
      {
        id: "ipp.merchant-generators",
        name: "Merchant Generators",
        legacyIds: [
          "power-generators"
        ]
      },
      {
        id: "ipp.renewable-operators",
        name: "Renewable Operators"
      },
      {
        id: "ipp.grid-offtakers",
        name: "Grid Offtakers & PPA Buyers",
        legacyIds: [
          "grid-offtakers"
        ]
      }
    ]
  }
];
const sectorCatalogRaw = {
  sectors
};
function resolveDisplayQuote(quote) {
  const state = quote.marketState;
  if (state === "post" && quote.postMarketPrice !== null) {
    return {
      price: quote.postMarketPrice,
      change: quote.postMarketChange,
      changePct: quote.postMarketChangePct,
      session: "post",
      sessionBadge: "AH"
    };
  }
  if (state === "pre" && quote.preMarketPrice !== null) {
    return {
      price: quote.preMarketPrice,
      change: quote.preMarketChange,
      changePct: quote.preMarketChangePct,
      session: "pre",
      sessionBadge: "PRE"
    };
  }
  return {
    price: quote.price,
    change: quote.change,
    changePct: quote.changePct,
    session: state === "closed" ? "closed" : "regular",
    sessionBadge: null
  };
}
const CHAIN$3 = graph;
const COMPETITOR_MAP$1 = (() => {
  const m = /* @__PURE__ */ new Map();
  for (const pair of CHAIN$3.competitors ?? []) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    if (!m.has(a)) m.set(a, /* @__PURE__ */ new Set());
    if (!m.has(b)) m.set(b, /* @__PURE__ */ new Set());
    m.get(a).add(b);
    m.get(b).add(a);
  }
  return m;
})();
function humanizeStageId$1(id) {
  return id.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
const NODE_W = 180;
const NODE_H = 52;
const V_GAP = 18;
const COL_GAP = 340;
const ARROW_STAGGER_SPREAD = 40;
const TONE$2 = {
  supplier: {
    stroke: "rgb(129, 140, 248)",
    dashed: false,
    label: "Suppliers",
    tipBg: "rgba(79, 70, 229, 0.22)",
    tipRing: "rgba(129, 140, 248, 0.55)",
    tipText: "rgb(224, 231, 255)"
  },
  customer: {
    stroke: "rgb(52, 211, 153)",
    dashed: false,
    label: "Customers",
    tipBg: "rgba(16, 185, 129, 0.2)",
    tipRing: "rgba(52, 211, 153, 0.55)",
    tipText: "rgb(209, 250, 229)"
  },
  competitor: {
    stroke: "rgb(251, 146, 60)",
    dashed: true,
    label: "Competitors",
    tipBg: "rgba(249, 115, 22, 0.2)",
    tipRing: "rgba(251, 146, 60, 0.55)",
    tipText: "rgb(254, 215, 170)"
  }
};
function ValueChainDiagram({
  initialSymbol,
  tickers,
  quotes,
  onClose,
  onOpenTicker,
  onActivateTicker,
  onOpenURL
}) {
  const [focusSet, setFocusSet] = reactExports.useState(() => /* @__PURE__ */ new Set([initialSymbol]));
  const [primarySymbol, setPrimarySymbol] = reactExports.useState(initialSymbol);
  const [overrides, setOverrides] = reactExports.useState(/* @__PURE__ */ new Map());
  const [edgeOverrides, setEdgeOverrides] = reactExports.useState([]);
  const [nodeOverrides, setNodeOverrides] = reactExports.useState([]);
  reactExports.useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.api.graph.listOverrides(),
      window.api.graph.listNodeOverrides()
    ]).then(([edges22, nodes22]) => {
      if (cancelled) return;
      setEdgeOverrides(edges22);
      setNodeOverrides(nodes22);
    }).catch((err) => {
      console.warn("[valueChainDiagram] overrides fetch failed", err);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  reactExports.useEffect(() => {
    return window.api.graph.onUpdated(() => {
      Promise.all([
        window.api.graph.listOverrides(),
        window.api.graph.listNodeOverrides()
      ]).then(([edges22, nodes22]) => {
        setEdgeOverrides(edges22);
        setNodeOverrides(nodes22);
      }).catch(() => {
      });
    });
  }, []);
  const mergedEdges = reactExports.useMemo(() => {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const o of edgeOverrides) {
      const cites = o.citations && o.citations.length > 0 ? o.citations : o.citation ? [o.citation] : [];
      if (o.relationship === "supplier" || o.relationship === "partner") {
        const key = `${o.fromSymbol.toUpperCase()}→${o.toSymbol.toUpperCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          from: o.fromSymbol.toUpperCase(),
          to: o.toSymbol.toUpperCase(),
          note: o.note ?? void 0,
          weight: o.weight,
          source: o.source,
          citations: cites
        });
      } else if (o.relationship === "customer") {
        const key = `${o.toSymbol.toUpperCase()}→${o.fromSymbol.toUpperCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          from: o.toSymbol.toUpperCase(),
          to: o.fromSymbol.toUpperCase(),
          note: o.note ?? void 0,
          weight: o.weight,
          source: o.source,
          citations: cites
        });
      }
    }
    for (const e of CHAIN$3.edges) {
      const key = `${e.from}→${e.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...e, weight: null, source: null, citations: [] });
    }
    return out;
  }, [edgeOverrides]);
  const mergedCompetitorMap = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const [k, v] of COMPETITOR_MAP$1) {
      m.set(k, new Set(v));
    }
    for (const o of edgeOverrides) {
      if (o.relationship !== "competitor") continue;
      const a = o.fromSymbol.toUpperCase();
      const b = o.toSymbol.toUpperCase();
      if (!m.has(a)) m.set(a, /* @__PURE__ */ new Set());
      if (!m.has(b)) m.set(b, /* @__PURE__ */ new Set());
      m.get(a).add(b);
      m.get(b).add(a);
    }
    return m;
  }, [edgeOverrides]);
  const quoteBySymbol = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const q of quotes) m.set(q.symbol.toUpperCase(), q);
    return m;
  }, [quotes]);
  const tickerBySymbol = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const t of tickers) m.set(t.symbol.toUpperCase(), t);
    return m;
  }, [tickers]);
  const nodeBySymbol = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const n of CHAIN$3.nodes) m.set(n.symbol, n);
    for (const o of nodeOverrides) {
      const sym = o.symbol.toUpperCase();
      if (m.has(sym)) continue;
      m.set(sym, {
        symbol: sym,
        stage: o.stage,
        sector: o.sector ?? "other",
        name: o.name ?? void 0,
        blurb: o.blurb ?? void 0
      });
    }
    return m;
  }, [nodeOverrides]);
  const activeStages = reactExports.useMemo(() => {
    const seen = new Set(CHAIN$3.stages.map((s) => s.id));
    const out = [...CHAIN$3.stages];
    for (const o of nodeOverrides) {
      if (!o.stage || seen.has(o.stage)) continue;
      seen.add(o.stage);
      out.push({ id: o.stage, label: humanizeStageId$1(o.stage) });
    }
    return out;
  }, [nodeOverrides]);
  const stageLabelById = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const s of activeStages) m.set(s.id, s.label);
    return m;
  }, [activeStages]);
  const stageIdx = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    activeStages.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [activeStages]);
  const { nodes: nodes2, edges: edges2, bounds, competitorsByFocus } = reactExports.useMemo(() => {
    const focusSyms = Array.from(focusSet);
    const focusNodes = focusSyms.map((s) => nodeBySymbol.get(s)).filter((n) => Boolean(n));
    if (focusNodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        bounds: { minX: -400, minY: -300, maxX: 400, maxY: 300 },
        competitorsByFocus: []
      };
    }
    const competitorUnion = /* @__PURE__ */ new Set();
    for (const f of focusNodes) {
      const rivals = mergedCompetitorMap.get(f.symbol) ?? /* @__PURE__ */ new Set();
      for (const r of rivals) if (!focusSet.has(r)) competitorUnion.add(r);
    }
    const blockedFromSideColumns = /* @__PURE__ */ new Set([...focusSet, ...competitorUnion]);
    const supplierUnion = /* @__PURE__ */ new Map();
    const customerUnion = /* @__PURE__ */ new Map();
    const columnOf = /* @__PURE__ */ new Map();
    const focusToFocus = [];
    for (const e of mergedEdges) {
      const fromIsFocus = focusSet.has(e.from);
      const toIsFocus = focusSet.has(e.to);
      if (!fromIsFocus && !toIsFocus) continue;
      const edgeCites = e.citations && e.citations.length > 0 ? e.citations : e.citation ? [e.citation] : [];
      if (fromIsFocus && toIsFocus) {
        focusToFocus.push({
          fromSym: e.from,
          toSym: e.to,
          note: e.note ?? null,
          citations: edgeCites
        });
        continue;
      }
      const otherSym = fromIsFocus ? e.to : e.from;
      if (blockedFromSideColumns.has(otherSym)) continue;
      const otherNode = nodeBySymbol.get(otherSym);
      if (!otherNode) continue;
      const intended = toIsFocus ? "supplier" : "customer";
      const existing = columnOf.get(otherSym);
      if (existing && existing !== intended) continue;
      columnOf.set(otherSym, intended);
      const focusSym = fromIsFocus ? e.from : e.to;
      if (intended === "supplier") {
        let entry = supplierUnion.get(otherSym);
        if (!entry) {
          entry = {
            node: otherNode,
            notesByFocus: /* @__PURE__ */ new Map(),
            weightByFocus: /* @__PURE__ */ new Map(),
            sourceByFocus: /* @__PURE__ */ new Map(),
            citationsByFocus: /* @__PURE__ */ new Map()
          };
          supplierUnion.set(otherSym, entry);
        }
        entry.notesByFocus.set(focusSym, e.note ?? null);
        entry.weightByFocus.set(focusSym, e.weight ?? null);
        entry.sourceByFocus.set(focusSym, e.source ?? null);
        entry.citationsByFocus.set(focusSym, edgeCites);
      } else {
        let entry = customerUnion.get(otherSym);
        if (!entry) {
          entry = {
            node: otherNode,
            notesByFocus: /* @__PURE__ */ new Map(),
            weightByFocus: /* @__PURE__ */ new Map(),
            sourceByFocus: /* @__PURE__ */ new Map(),
            citationsByFocus: /* @__PURE__ */ new Map()
          };
          customerUnion.set(otherSym, entry);
        }
        entry.notesByFocus.set(focusSym, e.note ?? null);
        entry.weightByFocus.set(focusSym, e.weight ?? null);
        entry.sourceByFocus.set(focusSym, e.source ?? null);
        entry.citationsByFocus.set(focusSym, edgeCites);
      }
    }
    const byStageThenSym = (a, b) => {
      const sa = stageIdx.get(a.stage) ?? 999;
      const sb = stageIdx.get(b.stage) ?? 999;
      if (sa !== sb) return sa - sb;
      return a.symbol.localeCompare(b.symbol);
    };
    const focusesSorted = [...focusNodes].sort(byStageThenSym);
    const fCount = focusesSorted.length;
    const fTotalH = fCount * NODE_H + (fCount > 1 ? (fCount - 1) * V_GAP : 0);
    let fY = -fTotalH / 2 + NODE_H / 2;
    const focusLaid = focusesSorted.map((n) => {
      const laid = toLaidOutNode(
        n,
        0,
        fY,
        "focus",
        n.symbol === primarySymbol,
        stageLabelById,
        tickerBySymbol,
        quoteBySymbol
      );
      fY += NODE_H + V_GAP;
      return laid;
    });
    const layoutColumn = (entries, x, role) => {
      const sorted = [...entries].sort((a, b) => byStageThenSym(a.node, b.node));
      const n = sorted.length;
      const totalH = n * NODE_H + (n > 1 ? (n - 1) * V_GAP : 0);
      let y = -totalH / 2 + NODE_H / 2;
      const out = [];
      for (const item of sorted) {
        out.push(
          toLaidOutNode(
            item.node,
            x,
            y,
            role,
            false,
            stageLabelById,
            tickerBySymbol,
            quoteBySymbol
          )
        );
        y += NODE_H + V_GAP;
      }
      return out;
    };
    const supplierLaid = layoutColumn(Array.from(supplierUnion.values()), -COL_GAP, "supplier");
    const customerLaid = layoutColumn(Array.from(customerUnion.values()), COL_GAP, "customer");
    const competitorsByFocus2 = focusLaid.map(
      (f) => {
        const rivals = mergedCompetitorMap.get(f.symbol) ?? /* @__PURE__ */ new Set();
        const list = [];
        for (const r of rivals) {
          if (focusSet.has(r)) continue;
          const n = nodeBySymbol.get(r);
          if (n) list.push(n);
        }
        list.sort((a, b) => a.symbol.localeCompare(b.symbol));
        return { focusSymbol: f.symbol, competitors: list };
      }
    );
    const allNodes = [...focusLaid, ...supplierLaid, ...customerLaid];
    const autoXs = allNodes.map((n) => n.x);
    const autoYs = allNodes.map((n) => n.y);
    const minX = Math.min(...autoXs) - NODE_W / 2 - 60;
    const maxX = Math.max(...autoXs) + NODE_W / 2 + 60;
    const minY = Math.min(...autoYs) - NODE_H / 2 - 60;
    const maxY = Math.max(...autoYs) + NODE_H / 2 + 60;
    for (const n of allNodes) {
      const o = overrides.get(n.symbol);
      if (o) {
        n.x = o.x;
        n.y = o.y;
      }
    }
    const laidBySymbol = /* @__PURE__ */ new Map();
    for (const n of allNodes) laidBySymbol.set(n.symbol, n);
    const staggerOffsets = (count) => {
      if (count === 0) return [];
      if (count === 1) return [0];
      const spread = Math.min(ARROW_STAGGER_SPREAD, NODE_H - 10);
      const step = spread / (count - 1);
      return Array.from({ length: count }, (_, i) => -spread / 2 + i * step);
    };
    const laidEdges = [];
    for (const focus of focusLaid) {
      const focusSym = focus.symbol;
      const supOfFocus = [];
      for (const entry of supplierUnion.values()) {
        if (entry.notesByFocus.has(focusSym)) {
          const laid = laidBySymbol.get(entry.node.symbol);
          if (laid)
            supOfFocus.push({
              laid,
              note: entry.notesByFocus.get(focusSym) ?? null,
              weight: entry.weightByFocus.get(focusSym) ?? null,
              source: entry.sourceByFocus.get(focusSym) ?? null,
              citations: entry.citationsByFocus.get(focusSym) ?? []
            });
        }
      }
      supOfFocus.sort((a, b) => a.laid.y - b.laid.y);
      const supOffsets = staggerOffsets(supOfFocus.length);
      supOfFocus.forEach((item, i) => {
        laidEdges.push({
          id: `sup-${focusSym}-${item.laid.symbol}`,
          fromX: item.laid.x + NODE_W / 2,
          fromY: item.laid.y,
          toX: focus.x - NODE_W / 2,
          toY: focus.y + supOffsets[i],
          note: item.note,
          tone: "supplier",
          weight: item.weight,
          source: item.source,
          citations: item.citations
        });
      });
      const custOfFocus = [];
      for (const entry of customerUnion.values()) {
        if (entry.notesByFocus.has(focusSym)) {
          const laid = laidBySymbol.get(entry.node.symbol);
          if (laid)
            custOfFocus.push({
              laid,
              note: entry.notesByFocus.get(focusSym) ?? null,
              weight: entry.weightByFocus.get(focusSym) ?? null,
              source: entry.sourceByFocus.get(focusSym) ?? null,
              citations: entry.citationsByFocus.get(focusSym) ?? []
            });
        }
      }
      custOfFocus.sort((a, b) => a.laid.y - b.laid.y);
      const custOffsets = staggerOffsets(custOfFocus.length);
      custOfFocus.forEach((item, i) => {
        laidEdges.push({
          id: `cust-${focusSym}-${item.laid.symbol}`,
          fromX: focus.x + NODE_W / 2,
          fromY: focus.y + custOffsets[i],
          toX: item.laid.x - NODE_W / 2,
          toY: item.laid.y,
          note: item.note,
          tone: "customer",
          weight: item.weight,
          source: item.source,
          citations: item.citations
        });
      });
    }
    for (const ff of focusToFocus) {
      const from = laidBySymbol.get(ff.fromSym);
      const to = laidBySymbol.get(ff.toSym);
      if (!from || !to) continue;
      const tone = primarySymbol === ff.fromSym ? "customer" : primarySymbol === ff.toSym ? "supplier" : "supplier";
      laidEdges.push({
        id: `ff-${ff.fromSym}-${ff.toSym}`,
        fromX: from.x + NODE_W / 2,
        fromY: from.y,
        toX: to.x - NODE_W / 2,
        toY: to.y,
        note: ff.note,
        tone,
        weight: null,
        source: null,
        citations: ff.citations
      });
    }
    return {
      nodes: allNodes,
      edges: laidEdges,
      bounds: { minX, minY, maxX, maxY },
      competitorsByFocus: competitorsByFocus2
    };
  }, [
    focusSet,
    primarySymbol,
    overrides,
    nodeBySymbol,
    stageLabelById,
    stageIdx,
    quoteBySymbol,
    tickerBySymbol,
    mergedEdges,
    mergedCompetitorMap
  ]);
  const svgRef = reactExports.useRef(null);
  const [view, setView] = reactExports.useState({ x: -600, y: -400, w: 1600, h: 900 });
  const viewRef = reactExports.useRef(view);
  viewRef.current = view;
  const [dragging, setDragging] = reactExports.useState(null);
  const draggingRef = reactExports.useRef(dragging);
  draggingRef.current = dragging;
  const [hoveredEdgeId, setHoveredEdgeId] = reactExports.useState(null);
  const [hoverTip, setHoverTip] = reactExports.useState(null);
  const [pinned, setPinned] = reactExports.useState([]);
  const pinnedIdRef = reactExports.useRef(0);
  const clientToSvg = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const v = viewRef.current;
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;
    return { x: v.x + px * v.w, y: v.y + py * v.h };
  };
  const svgToClient = (svgX, svgY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const v = view;
    const px = (svgX - v.x) / v.w;
    const py = (svgY - v.y) / v.h;
    return { x: rect.left + px * rect.width, y: rect.top + py * rect.height };
  };
  const fitView = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const aspect = rect.width / rect.height;
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    let w = contentW * 1.15;
    let h = contentH * 1.15;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    setView({ x: cx - w / 2, y: cy - h / 2, w, h });
  };
  reactExports.useEffect(() => {
    fitView();
  }, [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  reactExports.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const ptX = v.x + px * v.w;
      const ptY = v.y + py * v.h;
      const factor = e.deltaY < 0 ? 0.88 : 1.14;
      const newW = Math.max(500, Math.min(v.w * factor, 7e3));
      const newH = newW * (v.h / v.w);
      setView({
        x: ptX - px * newW,
        y: ptY - py * newH,
        w: newW,
        h: newH
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);
  reactExports.useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const svg = svgRef.current;
      const d = draggingRef.current;
      if (!svg || !d) return;
      const rect = svg.getBoundingClientRect();
      const v = viewRef.current;
      const dx = (e.clientX - d.startClientX) / rect.width * v.w;
      const dy = (e.clientY - d.startClientY) / rect.height * v.h;
      const moved = d.moved || Math.abs(e.clientX - d.startClientX) > 2 || Math.abs(e.clientY - d.startClientY) > 2;
      if (moved !== d.moved) draggingRef.current = { ...d, moved };
      setView({ ...v, x: d.startViewX - dx, y: d.startViewY - dy });
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);
  const onSvgMouseDown = (e) => {
    const target = e.target;
    if (target.closest("[data-node]") || target.closest("[data-edge]")) return;
    setDragging({
      startClientX: e.clientX,
      startClientY: e.clientY,
      startViewX: view.x,
      startViewY: view.y,
      moved: false
    });
  };
  const handleNodeClick = (symbol) => {
    if (focusSet.has(symbol)) {
      if (symbol !== primarySymbol) setPrimarySymbol(symbol);
      return;
    }
    setFocusSet((prev) => {
      const next = new Set(prev);
      next.add(symbol);
      return next;
    });
  };
  const handleNodeClickRef = reactExports.useRef(handleNodeClick);
  handleNodeClickRef.current = handleNodeClick;
  const nodeDragRef = reactExports.useRef(null);
  const [isNodeDragging, setIsNodeDragging] = reactExports.useState(false);
  const handleNodeMouseDown = (e, n) => {
    e.stopPropagation();
    nodeDragRef.current = {
      symbol: n.symbol,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: n.x,
      startY: n.y,
      moved: false
    };
    setIsNodeDragging(true);
  };
  reactExports.useEffect(() => {
    if (!isNodeDragging) return;
    const onMove = (e) => {
      const d = nodeDragRef.current;
      const svg = svgRef.current;
      if (!d || !svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const v = viewRef.current;
      const dxSvg = (e.clientX - d.startClientX) / rect.width * v.w;
      const dySvg = (e.clientY - d.startClientY) / rect.height * v.h;
      const moved = d.moved || Math.abs(e.clientX - d.startClientX) > 2 || Math.abs(e.clientY - d.startClientY) > 2;
      if (moved !== d.moved) nodeDragRef.current = { ...d, moved };
      if (moved) {
        setOverrides((prev) => {
          const next = new Map(prev);
          next.set(d.symbol, { x: d.startX + dxSvg, y: d.startY + dySvg });
          return next;
        });
      }
    };
    const onUp = () => {
      const d = nodeDragRef.current;
      if (d && !d.moved) handleNodeClickRef.current(d.symbol);
      nodeDragRef.current = null;
      setIsNodeDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isNodeDragging]);
  const handleClearAdditions = () => {
    setFocusSet(/* @__PURE__ */ new Set([initialSymbol]));
    setPrimarySymbol(initialSymbol);
    setPinned([]);
    setOverrides(/* @__PURE__ */ new Map());
  };
  const handleEdgeClick = (edge, clientX, clientY) => {
    if (!edge.note) return;
    const pt = clientToSvg(clientX, clientY);
    if (!pt) return;
    setPinned((prev) => [
      ...prev,
      {
        id: ++pinnedIdRef.current,
        note: edge.note,
        svgX: pt.x,
        svgY: pt.y,
        tone: edge.tone,
        citations: edge.citations
      }
    ]);
  };
  const primaryNode = nodes2.find((n) => n.role === "focus" && n.isPrimary) ?? null;
  const primaryTicker = primaryNode ? tickerBySymbol.get(primaryNode.symbol.toUpperCase()) : null;
  const addedCount = focusSet.size - 1;
  const edgePath = (e) => {
    const dx = e.toX - e.fromX;
    const c1x = e.fromX + dx * 0.45;
    const c2x = e.fromX + dx * 0.55;
    return `M ${e.fromX} ${e.fromY} C ${c1x} ${e.fromY}, ${c2x} ${e.toY}, ${e.toX} ${e.toY}`;
  };
  const edgeStrokeWidth = (e, isHovered) => {
    if (isHovered) return 2.8;
    if (e.weight === null) return 1.6;
    const base = 0.8 + e.weight * 1.2;
    const consensus = (e.source ?? "").includes(",");
    return base + (consensus ? 0.4 : 0);
  };
  const edgeStrokeOpacity = (e, isHovered) => {
    if (isHovered) return 1;
    if (e.weight === null) return 0.7;
    const base = 0.4 + e.weight * 0.45;
    const consensus = (e.source ?? "").includes(",");
    return Math.min(1, base + (consensus ? 0.1 : 0));
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "no-drag fixed inset-0 z-50 bg-surface-0 flex flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "shrink-0 pl-24 pr-6 py-4 flex items-center gap-4 border-b border-edge/40", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90", children: "Value chain diagram" }),
      primaryNode && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: "·" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-2 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[15px] font-bold tracking-[0.04em] text-zinc-50 shrink-0", children: primaryNode.symbol }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] text-zinc-400 truncate", children: primaryNode.companyName }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full bg-zinc-800/70 text-zinc-300 shrink-0", children: primaryNode.stageLabel }),
          addedCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 shrink-0", children: [
            "+",
            addedCount,
            " added"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: fitView,
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 hover:text-zinc-100",
            children: "Reset view"
          }
        ),
        addedCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: handleClearAdditions,
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 hover:text-zinc-100",
            title: `Clear ${addedCount} added focus${addedCount === 1 ? "" : "es"}`,
            children: "Clear added"
          }
        ),
        overrides.size > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setOverrides(/* @__PURE__ */ new Map()),
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 hover:text-zinc-100",
            title: `Reset ${overrides.size} dragged node${overrides.size === 1 ? "" : "s"} to computed positions`,
            children: "Restore layout"
          }
        ),
        pinned.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setPinned([]),
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 hover:text-zinc-100",
            title: "Dismiss all pinned notes",
            children: "Clear notes"
          }
        ),
        primaryTicker && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => onOpenTicker(primaryTicker.id),
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25",
            children: "Open detail →"
          }
        ),
        primaryTicker && !primaryTicker.isActive && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => onActivateTicker(primaryTicker.id),
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25",
            children: "+ Watchlist"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onClose,
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
            title: "Close (Esc)",
            children: "Close ✕"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shrink-0 px-6 py-2 flex items-center gap-5 border-b border-edge/30 text-[10px] uppercase tracking-[0.22em] text-zinc-500", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LegendSwatch, { tone: "supplier" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(LegendSwatch, { tone: "customer" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-zinc-600 normal-case tracking-normal text-[11px]", children: "Click node to add focus · Drag node to reposition · Click arrow to pin note · Drag empty to pan · Scroll to zoom" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      CompetitorsStrip,
      {
        groups: competitorsByFocus,
        quoteBySymbol,
        tickerBySymbol,
        onPick: handleNodeClick
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 relative overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "svg",
        {
          ref: svgRef,
          className: "absolute inset-0 w-full h-full",
          style: { cursor: dragging ? "grabbing" : "grab", userSelect: "none" },
          viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
          preserveAspectRatio: "xMidYMid meet",
          onMouseDown: onSvgMouseDown,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("defs", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "marker",
                {
                  id: "arrow-supplier",
                  viewBox: "0 0 10 10",
                  refX: "9",
                  refY: "5",
                  markerWidth: "6",
                  markerHeight: "6",
                  orient: "auto-start-reverse",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: TONE$2.supplier.stroke })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "marker",
                {
                  id: "arrow-customer",
                  viewBox: "0 0 10 10",
                  refX: "9",
                  refY: "5",
                  markerWidth: "6",
                  markerHeight: "6",
                  orient: "auto-start-reverse",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: TONE$2.customer.stroke })
                }
              )
            ] }),
            edges2.map((e) => {
              const tone = TONE$2[e.tone];
              const isHovered = hoveredEdgeId === e.id;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { "data-edge": e.id, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: edgePath(e),
                    stroke: "transparent",
                    strokeWidth: 16,
                    fill: "none",
                    style: { cursor: e.note ? "pointer" : "default" },
                    onMouseEnter: (ev) => {
                      setHoveredEdgeId(e.id);
                      if (e.note) {
                        const pt = clientToSvg(ev.clientX, ev.clientY);
                        if (pt)
                          setHoverTip({
                            note: e.note,
                            svgX: pt.x,
                            svgY: pt.y,
                            tone: e.tone,
                            citations: e.citations
                          });
                      }
                    },
                    onMouseMove: (ev) => {
                      if (e.note && hoveredEdgeId === e.id) {
                        const pt = clientToSvg(ev.clientX, ev.clientY);
                        if (pt)
                          setHoverTip({
                            note: e.note,
                            svgX: pt.x,
                            svgY: pt.y,
                            tone: e.tone,
                            citations: e.citations
                          });
                      }
                    },
                    onMouseLeave: () => {
                      setHoveredEdgeId(null);
                      setHoverTip(null);
                    },
                    onClick: (ev) => {
                      ev.stopPropagation();
                      handleEdgeClick(e, ev.clientX, ev.clientY);
                    }
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "path",
                  {
                    d: edgePath(e),
                    stroke: tone.stroke,
                    strokeWidth: edgeStrokeWidth(e, isHovered),
                    strokeDasharray: tone.dashed ? "7 5" : void 0,
                    strokeOpacity: edgeStrokeOpacity(e, isHovered),
                    fill: "none",
                    markerEnd: e.tone === "competitor" ? void 0 : `url(#arrow-${e.tone})`,
                    pointerEvents: "none"
                  }
                )
              ] }, e.id);
            }),
            nodes2.map((n) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              NodeBox,
              {
                n,
                dragging: isNodeDragging,
                onMouseDown: (e) => handleNodeMouseDown(e, n)
              },
              n.symbol
            ))
          ]
        }
      ),
      hoverTip && (() => {
        const pt = svgToClient(hoverTip.svgX, hoverTip.svgY);
        if (!pt) return null;
        const t = TONE$2[hoverTip.tone];
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "pointer-events-none fixed z-[60] px-3 py-2 rounded-md backdrop-blur text-[11.5px] leading-snug max-w-[320px] shadow-lg",
            style: {
              left: pt.x + 14,
              top: pt.y + 14,
              backgroundColor: t.tipBg,
              boxShadow: `inset 0 0 0 1px ${t.tipRing}, 0 4px 16px rgba(0,0,0,0.35)`,
              color: t.tipText
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: hoverTip.note }),
              hoverTip.citations.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1.5 text-[10px] opacity-80 flex flex-col gap-0.5", children: hoverTip.citations.map((c, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(DiagramCitationLabel, { citation: c }, i)) })
            ]
          }
        );
      })(),
      pinned.map((p) => {
        const pt = svgToClient(p.svgX, p.svgY);
        if (!pt) return null;
        const t = TONE$2[p.tone];
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "fixed z-[61] px-3 py-2 pr-7 rounded-md backdrop-blur text-[11.5px] leading-snug max-w-[320px] shadow-lg",
            style: {
              left: pt.x + 14,
              top: pt.y + 14,
              backgroundColor: t.tipBg,
              boxShadow: `inset 0 0 0 1px ${t.tipRing}, 0 4px 16px rgba(0,0,0,0.35)`,
              color: t.tipText
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: p.note }),
              p.citations.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1.5 flex flex-col gap-1", children: p.citations.map((c, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(DiagramCitationButton, { citation: c, onOpen: onOpenURL }, i)) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setPinned((prev) => prev.filter((x) => x.id !== p.id)),
                  className: "absolute top-1 right-1.5 text-zinc-400 hover:text-zinc-100 text-[14px] leading-none",
                  title: "Dismiss",
                  children: "×"
                }
              )
            ]
          },
          p.id
        );
      })
    ] })
  ] });
}
function toLaidOutNode(n, x, y, role, isPrimary, stageLabelById, tickerBySymbol, quoteBySymbol) {
  const sym = n.symbol.toUpperCase();
  return {
    symbol: n.symbol,
    x,
    y,
    stage: n.stage,
    stageLabel: stageLabelById.get(n.stage) ?? n.stage,
    companyName: tickerBySymbol.get(sym)?.companyName ?? n.name ?? n.symbol,
    quote: quoteBySymbol.get(sym),
    hasTickerRow: tickerBySymbol.has(sym),
    role,
    isPrimary
  };
}
function CompetitorsStrip({
  groups,
  quoteBySymbol,
  tickerBySymbol,
  onPick
}) {
  const withAny = groups.filter((g) => g.competitors.length > 0);
  if (withAny.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shrink-0 px-6 py-2.5 border-b border-edge/30 bg-surface-1/40 max-h-[28vh] overflow-y-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1.5", children: withAny.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 shrink-0 pt-[3px] w-[120px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90", children: g.focusSymbol }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: "competitors" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: g.competitors.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      CompetitorChip,
      {
        node: c,
        quote: quoteBySymbol.get(c.symbol.toUpperCase()),
        ticker: tickerBySymbol.get(c.symbol.toUpperCase()),
        onClick: () => onPick(c.symbol)
      },
      c.symbol
    )) })
  ] }, g.focusSymbol)) }) });
}
function CompetitorChip({
  node,
  quote,
  ticker,
  onClick
}) {
  const rq = quote ? resolveDisplayQuote(quote) : null;
  const change = rq?.change ?? 0;
  const displayPrice = rq?.price ?? null;
  const priceColor = change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-zinc-400";
  const companyName = ticker?.companyName ?? node.name ?? node.symbol;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick,
      title: `Add ${companyName} to focus set`,
      className: "group flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2/70 ring-1 ring-inset ring-orange-500/30 hover:bg-surface-2 hover:ring-orange-400/60 transition-colors",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10.5px] font-semibold tracking-[0.12em] text-zinc-100", children: node.symbol }),
        rq?.sessionBadge && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px] font-semibold uppercase tracking-[0.1em] px-1 py-0 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40", children: rq.sessionBadge }),
        displayPrice != null && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `tabular-nums text-[10.5px] font-semibold ${priceColor}`, children: displayPrice.toFixed(2) })
      ]
    }
  );
}
function LegendSwatch({ tone }) {
  const t = TONE$2[tone];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: 28, height: 8, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "line",
      {
        x1: 2,
        y1: 4,
        x2: 26,
        y2: 4,
        stroke: t.stroke,
        strokeWidth: 2,
        strokeDasharray: t.dashed ? "5 3" : void 0
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: t.label })
  ] });
}
function NodeBox({
  n,
  dragging,
  onMouseDown
}) {
  const isFocus = n.role === "focus";
  const width = NODE_W;
  const height = NODE_H;
  const x = n.x - width / 2;
  const y = n.y - height / 2;
  let fill = "rgb(24, 24, 27)";
  let stroke = "rgba(82, 82, 91, 0.6)";
  let symbolColor = "rgb(228, 228, 231)";
  let strokeWidth = 1;
  if (isFocus) {
    if (n.isPrimary) {
      fill = "rgba(16, 185, 129, 0.16)";
      stroke = "rgb(52, 211, 153)";
      symbolColor = "rgb(250, 250, 250)";
      strokeWidth = 2;
    } else {
      fill = "rgba(16, 185, 129, 0.08)";
      stroke = "rgba(52, 211, 153, 0.7)";
      symbolColor = "rgb(209, 250, 229)";
      strokeWidth = 1.5;
    }
  } else if (n.role === "supplier") {
    fill = "rgba(99, 102, 241, 0.10)";
    stroke = "rgba(129, 140, 248, 0.55)";
    symbolColor = "rgb(224, 231, 255)";
  } else if (n.role === "customer") {
    fill = "rgba(16, 185, 129, 0.10)";
    stroke = "rgba(52, 211, 153, 0.55)";
    symbolColor = "rgb(209, 250, 229)";
  } else if (n.role === "competitor") {
    fill = "rgba(249, 115, 22, 0.10)";
    stroke = "rgba(251, 146, 60, 0.65)";
    symbolColor = "rgb(254, 215, 170)";
  }
  const rq = n.quote ? resolveDisplayQuote(n.quote) : null;
  const change = rq?.changePct ?? null;
  const displayPrice = rq?.price ?? null;
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const changeColor = up ? "rgb(52, 211, 153)" : down ? "rgb(248, 113, 113)" : "rgb(113, 113, 122)";
  const hasPrice = n.hasTickerRow && displayPrice != null;
  const maxChars = hasPrice ? 18 : 26;
  const displayName = n.companyName.length > maxChars ? n.companyName.slice(0, maxChars - 1) + "…" : n.companyName;
  const cursor = dragging ? "grabbing" : "grab";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "g",
    {
      "data-node": n.symbol,
      transform: `translate(${x}, ${y})`,
      onMouseDown,
      style: { cursor },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "rect",
          {
            width,
            height,
            rx: 8,
            ry: 8,
            fill,
            stroke,
            strokeWidth
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "text",
          {
            x: 11,
            y: 20,
            fontSize: 13,
            fontWeight: 700,
            fill: symbolColor,
            style: { fontFamily: "inherit", letterSpacing: "0.04em" },
            children: n.symbol
          }
        ),
        n.hasTickerRow && change !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "text",
          {
            x: width - 11,
            y: 20,
            fontSize: 11,
            fontWeight: 600,
            fill: changeColor,
            textAnchor: "end",
            style: { fontFamily: "inherit", fontVariantNumeric: "tabular-nums" },
            children: [
              change >= 0 ? "+" : "",
              change.toFixed(1),
              "%"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "text",
          {
            x: 11,
            y: 39,
            fontSize: 10,
            fill: "rgb(161, 161, 170)",
            style: { fontFamily: "inherit" },
            children: displayName
          }
        ),
        hasPrice && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "text",
          {
            x: width - 11,
            y: 39,
            fontSize: 10,
            fill: "rgb(161, 161, 170)",
            textAnchor: "end",
            style: { fontFamily: "inherit", fontVariantNumeric: "tabular-nums" },
            children: [
              "$",
              displayPrice.toFixed(2)
            ]
          }
        )
      ]
    }
  );
}
function formatCitationLabel(citation) {
  if (citation.kind === "filing") {
    const dateStr = new Date(citation.filedAt).toISOString().slice(0, 10);
    return {
      label: `${citation.formType} · ${dateStr}`,
      fullText: `${citation.formType} filed ${dateStr} · ${citation.accession}`
    };
  }
  if (citation.kind === "article") {
    const dateStr = citation.publishedAt ? new Date(citation.publishedAt).toISOString().slice(0, 10) : "";
    const sourceStr = citation.feedTitle ?? "News";
    return {
      label: `${sourceStr}${dateStr ? ` · ${dateStr}` : ""}`,
      fullText: `${citation.title}${dateStr ? ` (${dateStr})` : ""}`
    };
  }
  if (citation.attribution) {
    return {
      label: citation.attribution,
      fullText: `${citation.attribution} (model training knowledge)`
    };
  }
  return {
    label: "Model knowledge",
    fullText: "From the model’s training knowledge — no document supplied"
  };
}
function DiagramCitationLabel({
  citation
}) {
  const { label } = formatCitationLabel(citation);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
    "↳ ",
    label
  ] });
}
function DiagramCitationButton({
  citation,
  onOpen
}) {
  const { label, fullText } = formatCitationLabel(citation);
  if (citation.kind === "filing" && onOpen) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => onOpen(
          citation.url,
          `${citation.formType} (${new Date(citation.filedAt).toISOString().slice(0, 10)})`,
          citation.accession
        ),
        className: "text-[10.5px] underline decoration-dotted underline-offset-2 hover:opacity-100 opacity-90 cursor-pointer",
        title: `${fullText} — click to open SEC filing`,
        children: [
          "↳ ",
          label
        ]
      }
    );
  }
  if (citation.kind === "article" && citation.url && onOpen) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => onOpen(
          citation.url,
          citation.title,
          citation.feedTitle ? `${citation.feedTitle}${citation.publishedAt ? ` · ${new Date(citation.publishedAt).toISOString().slice(0, 10)}` : ""}` : null
        ),
        className: "text-[10.5px] underline decoration-dotted underline-offset-2 hover:opacity-100 opacity-90 cursor-pointer",
        title: `${fullText} — click to open article`,
        children: [
          "↳ ",
          label
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10.5px] opacity-80", title: fullText, children: [
    "↳ ",
    label
  ] });
}
function CollapsibleSection({
  title,
  meta,
  defaultOpen = true,
  children,
  tone,
  gradient,
  backdrop,
  backdropStyle
}) {
  const [open, setOpen] = reactExports.useState(defaultOpen);
  const borderClass = tone === "dashed" ? "border-dashed border-edge/70" : "border-edge";
  const bgClass = gradient ? "bg-gradient-to-br from-surface-1 to-surface-0" : "bg-surface-1";
  const hasBackdrop = !!(backdrop || backdropStyle);
  const clipClass = gradient || hasBackdrop ? "relative overflow-hidden" : "";
  const needsStackingContext = gradient || hasBackdrop;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: `mt-6 rounded-2xl border ${borderClass} ${bgClass} p-5 ${clipClass}`, children: [
    hasBackdrop && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "pointer-events-none absolute inset-0 rounded-2xl",
        style: backdropStyle,
        "aria-hidden": true,
        children: backdrop
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => setOpen((v) => !v),
        className: `${needsStackingContext ? "relative" : ""} w-full flex items-center gap-3 mb-0 -mx-1 px-1 py-0.5 rounded hover:bg-surface-2/40 transition-colors`,
        "aria-expanded": open,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: `shrink-0 text-[10px] leading-none text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`,
              "aria-hidden": true,
              children: "▶"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" }),
          meta && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-[0.22em] text-zinc-500", children: meta })
        ]
      }
    ),
    open && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `${needsStackingContext ? "relative" : ""} mt-3`, children })
  ] });
}
const CHAIN$2 = graph;
const SOURCE_BADGE = {
  filings: {
    label: "10-K",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    title: "Cited in an SEC filing (10-K / 10-Q / 8-K)"
  },
  news: {
    label: "News",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    title: "Cited in a recent news article"
  },
  model: {
    label: "Model",
    className: "border-violet-500/40 bg-violet-500/10 text-violet-200",
    title: "From the model’s training knowledge — not grounded in any supplied filing or article"
  }
};
function formatCiteDate$1(ms) {
  if (!ms || !Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
}
function SourceBadge({
  source,
  citation,
  onOpen
}) {
  const derivedSource = citation ? citation.kind === "filing" ? "filings" : citation.kind === "article" ? "news" : "model" : source ?? null;
  if (!derivedSource) return null;
  const meta = SOURCE_BADGE[derivedSource];
  if (!meta) return null;
  let label = meta.label;
  let title = meta.title;
  let openArgs = null;
  if (citation?.kind === "filing") {
    const dateStr = formatCiteDate$1(citation.filedAt);
    label = dateStr ? `${citation.formType} · ${dateStr}` : citation.formType;
    title = `${citation.formType} filed ${dateStr} · ${citation.accession} — click to open SEC filing`;
    openArgs = {
      url: citation.url,
      title: `${citation.formType} (${dateStr})`,
      subtitle: citation.accession
    };
  } else if (citation?.kind === "article" && citation.url) {
    const dateStr = formatCiteDate$1(citation.publishedAt);
    const sourceStr = citation.feedTitle ?? "News";
    label = dateStr ? `${sourceStr} · ${dateStr}` : sourceStr;
    title = `${citation.title}${dateStr ? ` (${dateStr})` : ""} — click to open`;
    openArgs = {
      url: citation.url,
      title: citation.title,
      subtitle: dateStr ? `${citation.feedTitle ?? "Article"} · ${dateStr}` : citation.feedTitle ?? null
    };
  } else if (citation?.kind === "model" && citation.attribution) {
    label = citation.attribution;
    title = `${citation.attribution} — from the model's training knowledge (no live link)`;
  }
  const baseClasses = `inline-flex items-start gap-1 px-2 py-[3px] rounded-md border text-[10.5px] font-semibold uppercase tracking-[0.12em] max-w-full whitespace-normal break-words leading-[1.35] ${meta.className}`;
  if (openArgs && onOpen) {
    const args = openArgs;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: (e) => {
          e.stopPropagation();
          onOpen(args.url, args.title, args.subtitle);
        },
        className: `${baseClasses} cursor-pointer hover:brightness-125 hover:underline underline-offset-2 text-left`,
        title,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 min-w-0", children: label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", className: "shrink-0 text-[9px] opacity-80 mt-[1px]", children: "↗" })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: baseClasses, title, children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 min-w-0", children: label }) });
}
const TONE$1 = {
  customer: {
    label: "Customers",
    glyph: "→",
    accent: "text-emerald-300",
    chipBorder: "border-emerald-400/50",
    chipBg: "bg-emerald-500/10",
    chipText: "text-emerald-100",
    chipRing: "ring-emerald-500/30",
    chipHoverBg: "hover:bg-emerald-500/25",
    headerAccent: "text-emerald-400",
    rail: "bg-emerald-500/60",
    glowRgba: "rgba(16, 185, 129, 0.16)",
    shadowRgba: "rgba(16, 185, 129, 0.55)",
    glowOrigin: "100% 0%"
  },
  supplier: {
    label: "Suppliers",
    glyph: "→",
    accent: "text-indigo-300",
    chipBorder: "border-indigo-400/50",
    chipBg: "bg-indigo-500/10",
    chipText: "text-indigo-100",
    chipRing: "ring-indigo-500/30",
    chipHoverBg: "hover:bg-indigo-500/25",
    headerAccent: "text-indigo-400",
    rail: "bg-indigo-500/60",
    glowRgba: "rgba(99, 102, 241, 0.14)",
    shadowRgba: "rgba(99, 102, 241, 0.5)",
    glowOrigin: "0% 100%"
  },
  competitor: {
    label: "Competitors",
    glyph: "⇌",
    accent: "text-orange-300",
    chipBorder: "border-orange-400/50",
    chipBg: "bg-orange-500/10",
    chipText: "text-orange-100",
    chipRing: "ring-orange-500/30",
    chipHoverBg: "hover:bg-orange-500/25",
    headerAccent: "text-orange-400",
    rail: "bg-orange-500/60",
    glowRgba: "rgba(249, 115, 22, 0.13)",
    shadowRgba: "rgba(249, 115, 22, 0.5)",
    glowOrigin: "50% 0%"
  },
  // Strategic alliances — joint ventures, integration partnerships,
  // co-development. Symmetric (no direction) like competitors but
  // semantically distinct. Sky/cyan reads as "alliance/connection" and
  // doesn't collide with the indigo-blue of suppliers.
  partner: {
    label: "Partners",
    glyph: "↔",
    accent: "text-sky-300",
    chipBorder: "border-sky-400/50",
    chipBg: "bg-sky-500/10",
    chipText: "text-sky-100",
    chipRing: "ring-sky-500/30",
    chipHoverBg: "hover:bg-sky-500/25",
    headerAccent: "text-sky-400",
    rail: "bg-sky-500/60",
    glowRgba: "rgba(14, 165, 233, 0.13)",
    shadowRgba: "rgba(14, 165, 233, 0.5)",
    glowOrigin: "0% 50%"
  }
};
function categoryGlow(present) {
  const boxShadow = present.map((cat) => `0 0 40px -18px ${TONE$1[cat].shadowRgba}`).join(", ");
  const glowBackground = present.map(
    (cat) => `radial-gradient(ellipse 70% 70% at ${TONE$1[cat].glowOrigin}, ${TONE$1[cat].glowRgba}, transparent 65%)`
  ).join(", ");
  return { boxShadow, glowBackground };
}
function useStageGroups(items) {
  return reactExports.useMemo(() => {
    const byStage = /* @__PURE__ */ new Map();
    for (const item of items) {
      if (!item.stage) continue;
      if (!byStage.has(item.stage)) byStage.set(item.stage, []);
      byStage.get(item.stage).push(item);
    }
    const curatedIds = CHAIN$2.stages.map((s) => s.id);
    const curatedSet = new Set(curatedIds);
    const sortSym = (xs) => [...xs].sort((a, b) => a.symbol.localeCompare(b.symbol));
    const labelFor = (id) => {
      const first = byStage.get(id)?.[0];
      if (first?.stageLabel && first.stageLabel !== "—") return first.stageLabel;
      return CHAIN$2.stages.find((s) => s.id === id)?.label ?? id;
    };
    const out = [];
    for (const id of curatedIds) {
      if (!byStage.has(id)) continue;
      out.push({ stage: id, label: labelFor(id), items: sortSym(byStage.get(id)) });
    }
    for (const [id, bucket] of byStage) {
      if (curatedSet.has(id)) continue;
      out.push({ stage: id, label: labelFor(id), items: sortSym(bucket) });
    }
    return out;
  }, [items]);
}
function TransactionCluster({
  category,
  items,
  onPick,
  onHover,
  onLeave,
  onContextMenu,
  correctedSymbols,
  onOpenCitation
}) {
  const tone = TONE$1[category];
  const groups = useStageGroups(items);
  if (items.length === 0) return null;
  const interactive = Boolean(onPick || onHover || onLeave);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative pl-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `absolute left-0 top-1 bottom-1 w-[2px] rounded-full ${tone.rail}` }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[13px] leading-none ${tone.headerAccent}`, children: tone.glyph }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: `text-[10px] font-semibold uppercase tracking-[0.24em] ${tone.accent}`,
          children: tone.label
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] tabular-nums text-zinc-600", children: [
        "· ",
        items.length
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: groups.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9px] uppercase tracking-[0.22em] text-zinc-500 mb-1.5", children: g.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1.5", children: g.items.map((item) => {
        const chipClasses = `inline-flex items-center justify-center shrink-0 px-2 py-[3px] rounded-md border text-[11px] font-bold tabular-nums tracking-[0.04em] min-w-[58px] ${tone.chipBorder} ${tone.chipBg} ${tone.chipText} ring-1 ring-inset ${tone.chipRing}`;
        const unverifiedChipClasses = `inline-flex items-center justify-center shrink-0 px-2 py-[3px] rounded-md border border-dashed text-[10px] font-semibold tabular-nums tracking-[0.04em] min-w-[58px] max-w-[120px] truncate border-zinc-600 bg-zinc-800/40 text-zinc-400 opacity-80`;
        const isUnverified = Boolean(item.unverified);
        const nameTone = isUnverified ? "text-zinc-400 italic" : "text-zinc-200";
        const isCorrected = Boolean(
          correctedSymbols && correctedSymbols.has(item.symbol.toUpperCase())
        );
        const handleContextMenu = onContextMenu ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(item.symbol, e.clientX, e.clientY);
        } : void 0;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2.5", children: [
          isUnverified ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: unverifiedChipClasses,
              title: "Unverified — no public ticker",
              onContextMenu: handleContextMenu,
              children: item.symbol
            }
          ) : interactive ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => onPick?.(item.symbol),
              onMouseEnter: () => onHover?.(item.symbol),
              onMouseLeave: () => onLeave?.(),
              onContextMenu: handleContextMenu,
              className: `${chipClasses} ${tone.chipHoverBg} transition-colors ${isCorrected ? "ring-2 ring-amber-400/50" : ""}`,
              title: isCorrected ? "You corrected this entry — right-click to manage" : onContextMenu ? "Right-click to correct this entry" : void 0,
              children: item.symbol
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: chipClasses, onContextMenu: handleContextMenu, children: item.symbol }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1 pt-[1px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-[12px] leading-snug truncate ${nameTone}`, children: item.companyName }),
              item.crossSectorLabel && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "span",
                {
                  className: "shrink-0 inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200 text-[9px] font-semibold uppercase tracking-[0.18em]",
                  title: `Cross-sector: ${item.crossSectorLabel}`,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px]", children: "↗" }),
                    item.crossSectorLabel
                  ]
                }
              )
            ] }),
            item.note && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] leading-snug text-zinc-400 mt-0.5", children: item.note }),
            (() => {
              const cites = item.citations && item.citations.length > 0 ? item.citations : item.citation ? [item.citation] : [];
              if (cites.length === 0) return null;
              return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 flex flex-col gap-1", children: cites.map((c, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                SourceBadge,
                {
                  source: item.source,
                  citation: c,
                  onOpen: onOpenCitation
                },
                i
              )) });
            })()
          ] })
        ] }, item.symbol);
      }) })
    ] }, g.stage)) })
  ] });
}
function formatMoneyCompact(value, currency = "$") {
  if (value === null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${currency}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${currency}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${currency}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${currency}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${currency}${abs.toFixed(0)}`;
}
function formatPctValue(ratio, decimals = 0) {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  return `${(ratio * 100).toFixed(decimals)}%`;
}
function formatPctDelta(ratio, decimals = 1) {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  const pct = ratio * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}
function formatEpsDelta(actual, estimate) {
  if (actual === null || estimate === null) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(estimate)) return null;
  const delta = actual - estimate;
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(delta).toFixed(2)}`;
}
function fcfMarginTone(margin) {
  if (margin === null) return { color: "text-zinc-500", dot: "bg-zinc-600", label: "—" };
  if (margin >= 0.25) return { color: "text-emerald-300", dot: "bg-emerald-300", label: "elite" };
  if (margin >= 0.1) return { color: "text-emerald-400", dot: "bg-emerald-400", label: "healthy" };
  if (margin > 0) return { color: "text-amber-400", dot: "bg-amber-400", label: "thin" };
  return { color: "text-red-400", dot: "bg-red-400", label: "burn" };
}
const DAY_MS = 864e5;
const REPORT_ECHO_WINDOW = { minDaysAfterEnd: 14, maxDaysAfterEnd: 45 };
function pulsePhase(badge, now = Date.now()) {
  if (!badge) return "none";
  if (typeof badge.nextDate === "number" && Number.isFinite(badge.nextDate)) {
    const deltaDays = (badge.nextDate - now) / DAY_MS;
    if (deltaDays < 0) {
      return deltaDays > -1 ? "imminent" : "none";
    }
    if (deltaDays <= 2) return "imminent";
    if (deltaDays <= 7) return "warning";
    if (deltaDays <= 14) return "ambient";
  }
  if (typeof badge.lastReportEnd === "number" && Number.isFinite(badge.lastReportEnd)) {
    const daysAfterEnd = (now - badge.lastReportEnd) / DAY_MS;
    if (daysAfterEnd >= REPORT_ECHO_WINDOW.minDaysAfterEnd && daysAfterEnd <= REPORT_ECHO_WINDOW.maxDaysAfterEnd) {
      return "reported";
    }
  }
  return "none";
}
function pulseClass(phase) {
  switch (phase) {
    case "ambient":
      return "earnings-pulse-ambient";
    case "warning":
      return "earnings-pulse-warning";
    case "imminent":
      return "earnings-pulse-imminent";
    case "reported":
      return "earnings-pulse-reported";
    default:
      return null;
  }
}
function countdownLabel(badge, now = Date.now()) {
  if (!badge) return null;
  if (typeof badge.nextDate === "number" && Number.isFinite(badge.nextDate)) {
    const deltaMs = badge.nextDate - now;
    const deltaHours = deltaMs / 36e5;
    const deltaDays = deltaMs / DAY_MS;
    const estSuffix = badge.isEstimate ? " (est)" : "";
    if (deltaHours < -24) ;
    else if (deltaHours < 0) {
      return `Reports today${estSuffix}`;
    } else if (deltaHours < 6) {
      return `Reports today${estSuffix}`;
    } else if (deltaDays < 1.5) {
      return `Reports tomorrow${estSuffix}`;
    } else if (deltaDays <= 14) {
      return `Reports in ${Math.round(deltaDays)} days${estSuffix}`;
    }
    return `Reports in ${Math.round(deltaDays)} days${estSuffix}`;
  }
  if (typeof badge.lastReportEnd === "number" && Number.isFinite(badge.lastReportEnd)) {
    const daysAfterEnd = (now - badge.lastReportEnd) / DAY_MS;
    if (daysAfterEnd >= REPORT_ECHO_WINDOW.minDaysAfterEnd && daysAfterEnd <= REPORT_ECHO_WINDOW.maxDaysAfterEnd) {
      const weeks = Math.round(daysAfterEnd / 7);
      return `Reported ~${weeks}w ago`;
    }
  }
  return null;
}
const VARIANTS = {
  tile: { width: 60, height: 14, gap: 1 },
  strip: { width: 140, height: 22, gap: 1.5 },
  // Full-width card on the stock detail page: bigger target with room for
  // each quarter to read as its own bar.
  card: { width: 360, height: 64, gap: 3 }
};
function FcfSparkline({
  financials,
  variant = "tile"
}) {
  if (!financials || financials.quarters.length === 0) return null;
  const quarters = [...financials.quarters].reverse();
  const firstValid = quarters.findIndex((q) => q.freeCashFlow !== null);
  if (firstValid === -1) return null;
  const bars = quarters.slice(firstValid);
  if (bars.length === 0) return null;
  const { width, height, gap } = VARIANTS[variant];
  const barWidth = Math.max(1, (width - gap * (bars.length - 1)) / bars.length);
  const maxAbs = bars.reduce((acc, q) => {
    if (q.freeCashFlow === null) return acc;
    return Math.max(acc, Math.abs(q.freeCashFlow));
  }, 0);
  if (maxAbs === 0) return null;
  const baseline = height / 2;
  const usableHeight = height / 2;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "svg",
    {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
      "aria-hidden": "true",
      className: "shrink-0",
      children: bars.map((q, i) => {
        const x = i * (barWidth + gap);
        if (q.freeCashFlow === null) {
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            "rect",
            {
              x,
              y: baseline - 0.5,
              width: barWidth,
              height: 1,
              fill: "rgb(82 82 91)",
              opacity: 0.5
            },
            i
          );
        }
        const ratio = q.freeCashFlow / maxAbs;
        const barHeight = Math.max(1, Math.abs(ratio) * usableHeight);
        const y = q.freeCashFlow >= 0 ? baseline - barHeight : baseline;
        const fill = q.freeCashFlow >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "rect",
          {
            x,
            y,
            width: barWidth,
            height: barHeight,
            fill,
            opacity: variant === "tile" ? 0.85 : 0.95
          },
          i
        );
      })
    }
  );
}
const IN_LINE_THRESHOLD = 0.01;
function classify(q) {
  if (q.surprisePct !== null && Number.isFinite(q.surprisePct)) {
    if (Math.abs(q.surprisePct) <= IN_LINE_THRESHOLD) return "inline";
    return q.surprisePct > 0 ? "beat" : "miss";
  }
  if (q.epsActual !== null && q.epsEstimate !== null && Number.isFinite(q.epsActual) && Number.isFinite(q.epsEstimate)) {
    const diff = q.epsActual - q.epsEstimate;
    const ref = Math.abs(q.epsEstimate);
    if (ref === 0) return diff === 0 ? "inline" : diff > 0 ? "beat" : "miss";
    const ratio = diff / ref;
    if (Math.abs(ratio) <= IN_LINE_THRESHOLD) return "inline";
    return ratio > 0 ? "beat" : "miss";
  }
  return "unknown";
}
const DOT_CLASS = {
  beat: "bg-emerald-400",
  miss: "bg-red-400",
  inline: "bg-zinc-400",
  unknown: "bg-zinc-700"
};
function EarningsBeatMiss({
  history,
  variant = "strip"
}) {
  if (!history || history.length === 0) return null;
  const ordered = [...history].reverse();
  const mostRecent = history[0];
  const recentDelta = formatEpsDelta(
    mostRecent?.epsActual ?? null,
    mostRecent?.epsEstimate ?? null
  );
  const dotSize = variant === "tile" ? "h-1.5 w-1.5" : "h-2 w-2";
  if (variant === "tile") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "flex items-center gap-0.5",
        title: "Earnings beats (emerald) vs misses (red), oldest → newest",
        children: ordered.map((q) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: `${dotSize} rounded-full ${DOT_CLASS[classify(q)]}`
          },
          q.quarter
        ))
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", title: "EPS beat/miss, oldest → newest", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.18em] text-zinc-500", children: "EPS Δ 4Q" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1", children: ordered.map((q) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: `${dotSize} rounded-full ${DOT_CLASS[classify(q)]}`
      },
      q.quarter
    )) }),
    recentDelta && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: `text-[10px] font-semibold tabular-nums ${classify(mostRecent) === "beat" ? "text-emerald-300" : classify(mostRecent) === "miss" ? "text-red-300" : "text-zinc-400"}`,
        title: `Last EPS: ${mostRecent?.epsActual?.toFixed(2) ?? "—"} vs est ${mostRecent?.epsEstimate?.toFixed(2) ?? "—"}`,
        children: recentDelta
      }
    )
  ] });
}
function rowSortValue(row, key) {
  switch (key) {
    case "symbol":
      return null;
    case "changePct":
      return row.quote ? resolveDisplayQuote(row.quote).changePct : null;
    case "revenueTTM":
      return row.financials?.ttm.revenue ?? null;
    case "revYoY":
      return row.financials?.yoy.revenue ?? null;
    case "fcfMargin":
      return row.financials?.ttm.fcfMargin ?? null;
    case "recentDelta": {
      const q = row.earnings?.history[0];
      if (!q || q.epsActual === null || q.epsEstimate === null) return null;
      return q.epsActual - q.epsEstimate;
    }
    case "ptUpside": {
      const price = row.quote ? resolveDisplayQuote(row.quote).price : null;
      const target = row.estimates?.targetMean ?? null;
      if (price === null || target === null || price <= 0) return null;
      return (target - price) / price;
    }
  }
}
function PeerCompareModal({
  focusSymbol,
  peers,
  tickerBySymbol,
  quoteBySymbol,
  financialsBySymbol,
  earningsBySymbol,
  estimatesBySymbol,
  onClose,
  onOpenTicker,
  onActivateTicker
}) {
  const [sortKey, setSortKey] = reactExports.useState("revenueTTM");
  const [sortDir, setSortDir] = reactExports.useState("desc");
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const rows = reactExports.useMemo(() => {
    const build = (symbol, isFocus) => {
      const sym = symbol.toUpperCase();
      const ticker = tickerBySymbol.get(sym);
      return {
        symbol: sym,
        companyName: ticker?.companyName ?? sym,
        isFocus,
        ticker,
        quote: quoteBySymbol.get(sym),
        financials: financialsBySymbol.get(sym),
        earnings: earningsBySymbol.get(sym),
        estimates: estimatesBySymbol.get(sym)
      };
    };
    const all = [build(focusSymbol, true), ...peers.map((p) => build(p, false))];
    return all;
  }, [
    focusSymbol,
    peers,
    tickerBySymbol,
    quoteBySymbol,
    financialsBySymbol,
    earningsBySymbol,
    estimatesBySymbol
  ]);
  const sortedRows = reactExports.useMemo(() => {
    const focus = rows.filter((r) => r.isFocus);
    const peers2 = rows.filter((r) => !r.isFocus);
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "symbol") {
      peers2.sort((a, b) => a.symbol.localeCompare(b.symbol) * dir);
    } else {
      peers2.sort((a, b) => {
        const av = rowSortValue(a, sortKey);
        const bv = rowSortValue(b, sortKey);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      });
    }
    return [...focus, ...peers2];
  }, [rows, sortKey, sortDir]);
  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "no-drag fixed inset-0 z-50 bg-black/[0.88] flex items-center justify-center p-6",
      onClick: onClose,
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "bg-surface-0 rounded-xl border border-edge shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden",
          onClick: (e) => e.stopPropagation(),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "shrink-0 px-6 py-4 flex items-center gap-4 border-b border-edge/40", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90", children: "Peer compare" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: "·" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-2 min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[15px] font-bold tracking-[0.04em] text-zinc-50 shrink-0", children: focusSymbol }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[12px] text-zinc-400 truncate", children: [
                  "vs ",
                  peers.length,
                  " peer",
                  peers.length === 1 ? "" : "s"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  className: "ml-auto text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
                  title: "Close (Esc)",
                  children: "Close ✕"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-[11.5px] tabular-nums", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 bg-surface-0 z-10", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "text-[9px] uppercase tracking-[0.2em] text-zinc-500 border-b border-edge/40", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  HeaderCell,
                  {
                    label: "Ticker",
                    sortKey: "symbol",
                    currentKey: sortKey,
                    dir: sortDir,
                    onClick: () => toggleSort("symbol"),
                    align: "left"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  HeaderCell,
                  {
                    label: "1D Δ",
                    sortKey: "changePct",
                    currentKey: sortKey,
                    dir: sortDir,
                    onClick: () => toggleSort("changePct")
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  HeaderCell,
                  {
                    label: "Revenue TTM",
                    sortKey: "revenueTTM",
                    currentKey: sortKey,
                    dir: sortDir,
                    onClick: () => toggleSort("revenueTTM")
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  HeaderCell,
                  {
                    label: "Rev YoY",
                    sortKey: "revYoY",
                    currentKey: sortKey,
                    dir: sortDir,
                    onClick: () => toggleSort("revYoY")
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  HeaderCell,
                  {
                    label: "FCF margin",
                    sortKey: "fcfMargin",
                    currentKey: sortKey,
                    dir: sortDir,
                    onClick: () => toggleSort("fcfMargin")
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right font-semibold py-3 px-3", children: "FCF 8Q" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  HeaderCell,
                  {
                    label: "Last EPS Δ",
                    sortKey: "recentDelta",
                    currentKey: sortKey,
                    dir: sortDir,
                    onClick: () => toggleSort("recentDelta")
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right font-semibold py-3 px-3", children: "EPS Δ 4Q" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  HeaderCell,
                  {
                    label: "PT upside",
                    sortKey: "ptUpside",
                    currentKey: sortKey,
                    dir: sortDir,
                    onClick: () => toggleSort("ptUpside")
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-3 px-3" })
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: sortedRows.map((row) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                PeerRow,
                {
                  row,
                  onOpenTicker,
                  onActivateTicker
                },
                row.symbol
              )) })
            ] }) })
          ]
        }
      )
    }
  );
}
function HeaderCell({
  label,
  sortKey,
  currentKey,
  dir,
  onClick,
  align = "right"
}) {
  const active = sortKey === currentKey;
  const arrow = active ? dir === "asc" ? " ▲" : " ▼" : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "th",
    {
      className: `font-semibold py-3 px-3 cursor-pointer select-none hover:text-zinc-300 ${align === "left" ? "text-left" : "text-right"} ${active ? "text-emerald-300" : ""}`,
      onClick,
      children: [
        label,
        arrow
      ]
    }
  );
}
function PeerRow({
  row,
  onOpenTicker,
  onActivateTicker
}) {
  const fin = row.financials;
  const rq = row.quote ? resolveDisplayQuote(row.quote) : null;
  const changePct = rq?.changePct ?? null;
  const change = rq?.change ?? 0;
  const changeColor = change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : "text-zinc-500";
  const revenue = formatMoneyCompact(fin?.ttm.revenue ?? null);
  const revYoY = formatPctDelta(fin?.yoy.revenue ?? null);
  const revYoYColor = fin?.yoy.revenue === null || fin?.yoy.revenue === void 0 ? "text-zinc-500" : fin.yoy.revenue > 0 ? "text-emerald-300" : fin.yoy.revenue < 0 ? "text-red-300" : "text-zinc-300";
  const marginTone = fcfMarginTone(fin?.ttm.fcfMargin ?? null);
  const marginPct = formatPctValue(fin?.ttm.fcfMargin ?? null);
  const recentQuarter = row.earnings?.history[0];
  const recentDeltaLabel = formatEpsDelta(
    recentQuarter?.epsActual ?? null,
    recentQuarter?.epsEstimate ?? null
  );
  const recentDeltaValue = recentQuarter && recentQuarter.epsActual !== null && recentQuarter.epsEstimate !== null ? recentQuarter.epsActual - recentQuarter.epsEstimate : null;
  const recentDeltaColor = recentDeltaValue === null ? "text-zinc-500" : recentDeltaValue > 0 ? "text-emerald-300" : recentDeltaValue < 0 ? "text-red-300" : "text-zinc-300";
  const price = rq?.price ?? null;
  const targetMean = row.estimates?.targetMean ?? null;
  const ptUpside = price !== null && targetMean !== null && price > 0 ? (targetMean - price) / price : null;
  const ptUpsideColor = ptUpside === null ? "text-zinc-500" : ptUpside > 0 ? "text-emerald-300" : ptUpside < 0 ? "text-red-300" : "text-zinc-300";
  const ptUpsideLabel = ptUpside !== null ? `${ptUpside >= 0 ? "+" : ""}${(ptUpside * 100).toFixed(1)}%` : null;
  const rowBg = row.isFocus ? "bg-emerald-500/[0.06] hover:bg-emerald-500/[0.10]" : "hover:bg-surface-1";
  const border = row.isFocus ? "border-b border-emerald-500/20" : "border-b border-edge/20";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: `${rowBg} ${border}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-3 px-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: `text-[12.5px] font-bold tracking-[0.04em] ${row.isFocus ? "text-emerald-200" : row.ticker?.isActive ? "text-zinc-50" : "text-zinc-200"}`,
            children: row.symbol
          }
        ),
        row.isFocus && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40", children: "Focus" }),
        !row.isFocus && row.ticker?.isActive && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30", children: "Held" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-zinc-500 truncate max-w-[260px] mt-0.5", children: row.companyName })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: `py-3 px-3 text-right ${changeColor}`, children: changePct !== null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "—" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-3 text-right text-zinc-200", children: revenue ?? "—" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: `py-3 px-3 text-right ${revYoYColor}`, children: revYoY ?? "—" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: `py-3 px-3 text-right ${marginTone.color}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `h-1 w-1 rounded-full ${marginTone.dot}` }),
      marginPct ?? "—"
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FcfSparkline, { financials: fin, variant: "strip" }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "td",
      {
        className: `py-3 px-3 text-right ${recentDeltaColor}`,
        title: recentQuarter ? `EPS actual ${recentQuarter.epsActual?.toFixed(2) ?? "—"} vs est ${recentQuarter.epsEstimate?.toFixed(2) ?? "—"}` : void 0,
        children: recentDeltaLabel ?? "—"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(EarningsBeatMiss, { history: row.earnings?.history, variant: "tile" }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "td",
      {
        className: `py-3 px-3 text-right ${ptUpsideColor}`,
        title: row.estimates ? `Price target $${targetMean?.toFixed(2) ?? "—"} · ${row.estimates.analystCount ?? 0} analysts` : void 0,
        children: ptUpsideLabel ?? "—"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-3", children: row.ticker ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onOpenTicker(row.ticker.id),
          className: "text-[9px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25",
          title: "Open ticker detail",
          children: "Open"
        }
      ),
      !row.ticker.isActive && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onActivateTicker(row.ticker.id),
          className: "text-[9px] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25",
          title: "Add to watchlist",
          children: "+"
        }
      )
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: "—" }) })
  ] });
}
const CATEGORY_LABEL = {
  supplier: "supplier",
  customer: "customer",
  competitor: "competitor",
  partner: "partner"
};
function buildItems(category, hasExisting) {
  const items = [];
  items.push({
    key: "not-relevant",
    label: "Mark as not relevant",
    hint: "Hide from this chain",
    action: { type: "not-relevant" }
  });
  if (category === "supplier") {
    items.push({
      key: "flip-customer",
      label: "Actually a customer",
      hint: "Flip direction",
      action: { type: "wrong-direction", direction: "customer" }
    });
  } else if (category === "customer") {
    items.push({
      key: "flip-supplier",
      label: "Actually a supplier",
      hint: "Flip direction",
      action: { type: "wrong-direction", direction: "supplier" }
    });
  }
  const reclassOptions = [
    "supplier",
    "customer",
    "competitor",
    "partner"
  ];
  for (const rel of reclassOptions) {
    if (rel === category) continue;
    if (category === "supplier" && rel === "customer") continue;
    if (category === "customer" && rel === "supplier") continue;
    items.push({
      key: `reclass-${rel}`,
      label: `Re-classify as ${rel}`,
      hint: `From ${CATEGORY_LABEL[category]}`,
      action: { type: "wrong-relationship", relationship: rel }
    });
  }
  if (hasExisting) {
    items.push({
      key: "remove",
      label: "Remove correction",
      hint: "Restore Claude’s original",
      destructive: true,
      action: { type: "remove" }
    });
  }
  return items;
}
function ChainCorrectionMenu({
  x,
  y,
  symbol,
  currentCategory,
  hasExistingCorrection,
  onSelect,
  onClose
}) {
  const menuRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const onMouseDown = (e) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const menuWidth = 220;
  const menuHeight = 220;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);
  const items = buildItems(currentCategory, hasExistingCorrection);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      ref: menuRef,
      className: "fixed z-50 min-w-[220px] rounded-md border border-edge/80 bg-surface-1 shadow-2xl py-1 text-[12px] text-zinc-200",
      style: { left, top },
      role: "menu",
      onContextMenu: (e) => e.preventDefault(),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-3 py-1.5 border-b border-edge/60", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9px] uppercase tracking-[0.22em] text-zinc-500", children: "Correct chain" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] font-semibold tabular-nums text-zinc-100 truncate", children: symbol })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "py-1", children: items.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            role: "menuitem",
            onClick: () => {
              onSelect(item.action);
              onClose();
            },
            className: `w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-surface-2 transition-colors ${item.destructive ? "text-red-300" : "text-zinc-200"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: item.label }),
              item.hint && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500", children: item.hint })
            ]
          }
        ) }, item.key)) })
      ]
    }
  );
}
const CHAIN$1 = graph;
const CATALOG = sectorCatalogRaw.sectors;
const SECTOR_ANCESTORS = (() => {
  const parentOf = /* @__PURE__ */ new Map();
  for (const s of CATALOG) parentOf.set(s.id, s.parentId ?? null);
  const out = /* @__PURE__ */ new Map();
  for (const s of CATALOG) {
    const set = /* @__PURE__ */ new Set();
    let cur = s.id;
    const visited = /* @__PURE__ */ new Set();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      set.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
    out.set(s.id, set);
  }
  return out;
})();
const LEGACY_TO_SECTOR_ID = (() => {
  const m = /* @__PURE__ */ new Map();
  for (const entry of CATALOG) {
    for (const legacy of entry.legacyIds ?? []) m.set(legacy, entry.id);
  }
  return m;
})();
const TOP_LEVEL_SECTORS = CATALOG.filter(
  (s) => !s.parentId
).map((s) => ({ id: s.id, name: s.name }));
function humanizeStageId(id) {
  return id.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
const COMPETITOR_MAP = (() => {
  const m = /* @__PURE__ */ new Map();
  for (const pair of CHAIN$1.competitors ?? []) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    if (!m.has(a)) m.set(a, /* @__PURE__ */ new Set());
    if (!m.has(b)) m.set(b, /* @__PURE__ */ new Set());
    m.get(a).add(b);
    m.get(b).add(a);
  }
  return m;
})();
function ValueChain({
  tickers,
  quotes,
  onOpenTicker,
  onActivateTicker,
  externalFocus,
  onExternalFocusHandled,
  onOpenURL
}) {
  const [hoverSymbol, setHoverSymbol] = reactExports.useState(null);
  const [lockedSymbol, setLockedSymbol] = reactExports.useState(null);
  const [sectorId, setSectorId] = reactExports.useState("all");
  const [diagramSymbol, setDiagramSymbol] = reactExports.useState(null);
  const [peerCompareSymbol, setPeerCompareSymbol] = reactExports.useState(null);
  const clearTimer = reactExports.useRef(null);
  const tileRefs = reactExports.useRef(/* @__PURE__ */ new Map());
  const [pendingScroll, setPendingScroll] = reactExports.useState(null);
  const lastAppliedExternalFocus = reactExports.useRef(null);
  const clickTimer = reactExports.useRef(null);
  const CLICK_DELAY_MS = 220;
  const focusSymbol = lockedSymbol ?? hoverSymbol;
  const focusTile = (symbol) => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
    setHoverSymbol(symbol);
  };
  const scheduleClear = () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setHoverSymbol(null), 80);
  };
  reactExports.useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);
  reactExports.useEffect(() => {
    if (!externalFocus) return;
    const upper = externalFocus.toUpperCase();
    if (lastAppliedExternalFocus.current === upper) return;
    lastAppliedExternalFocus.current = upper;
    setLockedSymbol(upper);
    setSectorId("all");
    setPendingScroll(upper);
    onExternalFocusHandled?.();
  }, [externalFocus, onExternalFocusHandled]);
  reactExports.useEffect(() => {
    if (!pendingScroll) return;
    const raf = requestAnimationFrame(() => {
      setTimeout(() => {
        const el = tileRefs.current.get(pendingScroll);
        if (el && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "smooth"
          });
        }
        setPendingScroll(null);
      }, 50);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingScroll]);
  const quoteBySymbol = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const q of quotes) m.set(q.symbol.toUpperCase(), q);
    return m;
  }, [quotes]);
  const [financialsMap, setFinancialsMap] = reactExports.useState(
    () => /* @__PURE__ */ new Map()
  );
  const [earningsMap, setEarningsMap] = reactExports.useState(
    () => /* @__PURE__ */ new Map()
  );
  const [estimatesMap, setEstimatesMap] = reactExports.useState(
    () => /* @__PURE__ */ new Map()
  );
  const [edgeOverrides, setEdgeOverrides] = reactExports.useState([]);
  const [nodeOverrides, setNodeOverrides] = reactExports.useState([]);
  const [generatedChainSymbols, setGeneratedChainSymbols] = reactExports.useState(
    () => /* @__PURE__ */ new Set()
  );
  const [sectorsWithContent, setSectorsWithContent] = reactExports.useState([]);
  const [primaryIndex, setPrimaryIndex] = reactExports.useState({});
  const [recentFilingsMap, setRecentFilingsMap] = reactExports.useState(
    () => /* @__PURE__ */ new Map()
  );
  reactExports.useEffect(() => {
    let cancelled = false;
    const since = Date.now() - 72 * 60 * 60 * 1e3;
    const buildAndFetch = async () => {
      const staticSymbols = CHAIN$1.nodes.map((n) => n.symbol.toUpperCase());
      const watchlistSymbols = tickers.filter((t) => t.isActive).map((t) => t.symbol.toUpperCase());
      let overrideSymbols = [];
      try {
        const overrides = await window.api.graph.listNodeOverrides();
        overrideSymbols = overrides.map((o) => o.symbol.toUpperCase());
      } catch {
      }
      if (cancelled) return;
      const symbols = [
        .../* @__PURE__ */ new Set([...staticSymbols, ...watchlistSymbols, ...overrideSymbols])
      ];
      try {
        const bundle = await window.api.stocks.getValueChainMountBundle(symbols, since);
        if (cancelled) return;
        const fin = /* @__PURE__ */ new Map();
        for (const s of bundle.financials) fin.set(s.symbol.toUpperCase(), s);
        setFinancialsMap(fin);
        const earn = /* @__PURE__ */ new Map();
        for (const b of bundle.earnings) earn.set(b.symbol.toUpperCase(), b);
        setEarningsMap(earn);
        const est = /* @__PURE__ */ new Map();
        for (const r of bundle.estimates) est.set(r.symbol.toUpperCase(), r);
        setEstimatesMap(est);
        setEdgeOverrides(bundle.edgeOverrides);
        setNodeOverrides(bundle.nodeOverrides);
        setGeneratedChainSymbols(
          new Set(bundle.generatedChainSymbols.map((s) => s.toUpperCase()))
        );
        setSectorsWithContent(bundle.sectorsWithContent);
        setPrimaryIndex(bundle.primaryIndex);
        const filings = /* @__PURE__ */ new Map();
        for (const sym of Object.keys(bundle.recentFilings)) {
          filings.set(sym.toUpperCase(), bundle.recentFilings[sym]);
        }
        setRecentFilingsMap(filings);
      } catch (err) {
        console.warn("[valueChain] mount bundle fetch failed", err);
      }
    };
    void buildAndFetch();
    return () => {
      cancelled = true;
    };
  }, []);
  reactExports.useEffect(() => {
    return window.api.stocks.onFinancialsUpdated((symbol) => {
      const sym = symbol.toUpperCase();
      window.api.stocks.getFinancials(sym).then((snapshot) => {
        setFinancialsMap((prev) => {
          const next = new Map(prev);
          next.set(sym, snapshot);
          return next;
        });
      }).catch(() => {
      });
    });
  }, []);
  reactExports.useEffect(() => {
    return window.api.stocks.onEarningsUpdated((symbol) => {
      const sym = symbol.toUpperCase();
      window.api.stocks.getEarnings(sym).then((badge) => {
        setEarningsMap((prev) => {
          const next = new Map(prev);
          next.set(sym, badge);
          return next;
        });
      }).catch(() => {
      });
    });
  }, []);
  reactExports.useEffect(() => {
    return window.api.stocks.onEstimatesUpdated((symbol) => {
      const sym = symbol.toUpperCase();
      window.api.stocks.getEstimates(sym).then((row) => {
        if (!row) return;
        setEstimatesMap((prev) => {
          const next = new Map(prev);
          next.set(sym, row);
          return next;
        });
      }).catch(() => {
      });
    });
  }, []);
  reactExports.useEffect(() => {
    return window.api.graph.onUpdated(() => {
      Promise.all([
        window.api.graph.listOverrides(),
        window.api.graph.listNodeOverrides(),
        window.api.sectors.listWithContent(),
        window.api.sectors.primaryIndex()
      ]).then(([edges2, nodes2, withContent, idx]) => {
        setEdgeOverrides(edges2);
        setNodeOverrides(nodes2);
        setSectorsWithContent(withContent);
        setPrimaryIndex(idx);
      }).catch(() => {
      });
    });
  }, []);
  reactExports.useEffect(() => {
    return window.api.stocks.onCompanyChainUpdated((symbol) => {
      setGeneratedChainSymbols((prev) => {
        const sym = symbol.toUpperCase();
        if (prev.has(sym)) return prev;
        const next = new Set(prev);
        next.add(sym);
        return next;
      });
    });
  }, []);
  reactExports.useEffect(() => {
    if (nodeOverrides.length === 0) return;
    const have = financialsMap;
    const haveEarn = earningsMap;
    const haveEst = estimatesMap;
    const missing = /* @__PURE__ */ new Set();
    for (const o of nodeOverrides) {
      const sym = o.symbol.toUpperCase();
      if (!have.has(sym) || !haveEarn.has(sym) || !haveEst.has(sym)) {
        missing.add(sym);
      }
    }
    if (missing.size === 0) return;
    const symbols = [...missing];
    let cancelled = false;
    void Promise.all([
      window.api.stocks.getFinancialsBatch(symbols).catch(() => []),
      window.api.stocks.getEarningsBatch(symbols).catch(() => []),
      window.api.stocks.getEstimatesBatch(symbols).catch(() => [])
    ]).then(([fins, earns, ests]) => {
      if (cancelled) return;
      if (fins.length > 0) {
        setFinancialsMap((prev) => {
          const next = new Map(prev);
          for (const f of fins) next.set(f.symbol.toUpperCase(), f);
          return next;
        });
      }
      if (earns.length > 0) {
        setEarningsMap((prev) => {
          const next = new Map(prev);
          for (const b of earns) next.set(b.symbol.toUpperCase(), b);
          return next;
        });
      }
      if (ests.length > 0) {
        setEstimatesMap((prev) => {
          const next = new Map(prev);
          for (const r of ests) next.set(r.symbol.toUpperCase(), r);
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [nodeOverrides]);
  reactExports.useEffect(() => {
    return window.api.sec.onUpdated((symbol) => {
      const sym = symbol.toUpperCase();
      const since = Date.now() - 72 * 60 * 60 * 1e3;
      window.api.sec.getFilings(sym, 10, true).then((filings) => {
        const recent = filings.filter((f) => f.filedAt >= since);
        setRecentFilingsMap((prev) => {
          const next = new Map(prev);
          if (recent.length === 0) next.delete(sym);
          else next.set(sym, recent);
          return next;
        });
      }).catch(() => {
      });
    });
  }, []);
  const [focusOptions, setFocusOptions] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (!focusSymbol) {
      setFocusOptions(null);
      return;
    }
    let cancelled = false;
    window.api.stocks.getOptionsSnapshot(focusSymbol).then((snap) => {
      if (!cancelled) setFocusOptions(snap);
    }).catch(() => {
      if (!cancelled) setFocusOptions(null);
    });
    return () => {
      cancelled = true;
    };
  }, [focusSymbol]);
  const tickerBySymbol = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const t of tickers) m.set(t.symbol.toUpperCase(), t);
    return m;
  }, [tickers]);
  const mergedNodes = reactExports.useMemo(() => {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const o of nodeOverrides) {
      const sym = o.symbol.toUpperCase();
      seen.add(sym);
      out.push({
        symbol: sym,
        stage: o.stage,
        sector: o.sector ?? "other",
        name: o.name ?? void 0,
        blurb: o.blurb ?? void 0
      });
    }
    for (const n of CHAIN$1.nodes) {
      const sym = n.symbol.toUpperCase();
      if (seen.has(sym)) continue;
      out.push(n);
    }
    return out;
  }, [nodeOverrides]);
  const resolvedPrimarySector = reactExports.useMemo(() => {
    const nodeOverrideBySym = new Map(nodeOverrides.map((o) => [o.symbol.toUpperCase(), o]));
    const out = /* @__PURE__ */ new Map();
    for (const node of mergedNodes) {
      const sym = node.symbol.toUpperCase();
      const fromIndex = primaryIndex[sym];
      if (fromIndex) {
        out.set(sym, fromIndex);
        continue;
      }
      const ov = nodeOverrideBySym.get(sym);
      if (ov?.sectorId) {
        out.set(sym, ov.sectorId);
        continue;
      }
      const legacy = LEGACY_TO_SECTOR_ID.get(node.sector);
      if (legacy) out.set(sym, legacy);
    }
    return out;
  }, [mergedNodes, nodeOverrides, primaryIndex]);
  const visibleSymbols = reactExports.useMemo(() => {
    const s = /* @__PURE__ */ new Set();
    for (const node of mergedNodes) {
      if (sectorId === "all") {
        s.add(node.symbol);
        continue;
      }
      const primary = resolvedPrimarySector.get(node.symbol.toUpperCase());
      if (!primary) continue;
      const ancestors = SECTOR_ANCESTORS.get(primary);
      if (ancestors?.has(sectorId)) s.add(node.symbol);
    }
    return s;
  }, [sectorId, mergedNodes, resolvedPrimarySector]);
  const activeStages = reactExports.useMemo(() => {
    if (sectorId === "all") {
      const known = new Set(CHAIN$1.stages.map((s) => s.id));
      const extras = [];
      for (const node of mergedNodes) {
        if (!node.stage || known.has(node.stage)) continue;
        known.add(node.stage);
        extras.push({ id: node.stage, label: humanizeStageId(node.stage) });
      }
      return [...CHAIN$1.stages, ...extras];
    }
    const catalogEntry = CATALOG.find((c) => c.id === sectorId);
    if (catalogEntry?.stages && catalogEntry.stages.length > 0) {
      return catalogEntry.stages.map((s) => ({ id: s.id, label: s.name }));
    }
    const seen = /* @__PURE__ */ new Set();
    const ordered = [];
    for (const node of mergedNodes) {
      if (!visibleSymbols.has(node.symbol)) continue;
      if (seen.has(node.stage)) continue;
      seen.add(node.stage);
      ordered.push({
        id: node.stage,
        label: humanizeStageId(node.stage)
      });
    }
    return ordered;
  }, [sectorId, mergedNodes, visibleSymbols]);
  const stageGroups = reactExports.useMemo(() => {
    const bucket = /* @__PURE__ */ new Map();
    for (const stage of activeStages) bucket.set(stage.id, []);
    const strayNodes = [];
    for (const node of mergedNodes) {
      if (!visibleSymbols.has(node.symbol)) continue;
      const target = bucket.get(node.stage);
      if (target) target.push(node);
      else strayNodes.push(node);
    }
    const groups = activeStages.map((s) => ({ stage: s, nodes: bucket.get(s.id) ?? [] })).filter((g) => g.nodes.length > 0);
    if (strayNodes.length > 0) {
      groups.push({
        stage: { id: "__cross_sector", label: "Cross-sector participants" },
        nodes: strayNodes
      });
    }
    return groups;
  }, [visibleSymbols, mergedNodes, activeStages]);
  const mergedDirectionalEdges = reactExports.useMemo(() => {
    const out = [];
    for (const o of edgeOverrides) {
      const cites = o.citations && o.citations.length > 0 ? o.citations : o.citation ? [o.citation] : [];
      const inferredSource = cites[0] ? cites[0].kind === "filing" ? "filings" : cites[0].kind === "article" ? "news" : "model" : null;
      if (o.relationship === "supplier") {
        const from = o.fromSymbol.toUpperCase();
        const to = o.toSymbol.toUpperCase();
        out.push({
          from,
          to,
          note: o.note ?? void 0,
          citations: cites,
          source: inferredSource
        });
      } else if (o.relationship === "customer") {
        const from = o.toSymbol.toUpperCase();
        const to = o.fromSymbol.toUpperCase();
        out.push({
          from,
          to,
          note: o.note ?? void 0,
          citations: cites,
          source: inferredSource
        });
      }
    }
    const overrideKeys = new Set(out.map((e) => `${e.from}→${e.to}`));
    for (const e of CHAIN$1.edges) {
      const fromUpper = e.from.toUpperCase();
      const toUpper = e.to.toUpperCase();
      if (generatedChainSymbols.has(fromUpper) || generatedChainSymbols.has(toUpper)) {
        continue;
      }
      const key = `${fromUpper}→${toUpper}`;
      if (overrideKeys.has(key)) continue;
      out.push({ ...e, from: fromUpper, to: toUpper });
    }
    const seen = /* @__PURE__ */ new Set();
    const deduped = [];
    for (const edge of out) {
      const key = `${edge.from}→${edge.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(edge);
    }
    return deduped;
  }, [edgeOverrides, generatedChainSymbols]);
  const mergedCompetitorMap = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const [k, v] of COMPETITOR_MAP) {
      if (generatedChainSymbols.has(k)) continue;
      const filtered = /* @__PURE__ */ new Set();
      for (const peer of v) {
        if (generatedChainSymbols.has(peer)) continue;
        filtered.add(peer);
      }
      if (filtered.size > 0) m.set(k, filtered);
    }
    for (const o of edgeOverrides) {
      if (o.relationship !== "competitor") continue;
      const a = o.fromSymbol.toUpperCase();
      const b = o.toSymbol.toUpperCase();
      if (!m.has(a)) m.set(a, /* @__PURE__ */ new Set());
      if (!m.has(b)) m.set(b, /* @__PURE__ */ new Set());
      m.get(a).add(b);
      m.get(b).add(a);
    }
    return m;
  }, [edgeOverrides, generatedChainSymbols]);
  const mergedPartnerMap = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const o of edgeOverrides) {
      if (o.relationship !== "partner") continue;
      const a = o.fromSymbol.toUpperCase();
      const b = o.toSymbol.toUpperCase();
      if (!m.has(a)) m.set(a, /* @__PURE__ */ new Set());
      if (!m.has(b)) m.set(b, /* @__PURE__ */ new Set());
      m.get(a).add(b);
      m.get(b).add(a);
    }
    return m;
  }, [edgeOverrides]);
  const { outgoing, incoming } = reactExports.useMemo(() => {
    const out = /* @__PURE__ */ new Map();
    const inc = /* @__PURE__ */ new Map();
    for (const e of mergedDirectionalEdges) {
      if (!visibleSymbols.has(e.from) || !visibleSymbols.has(e.to)) continue;
      if (!out.has(e.from)) out.set(e.from, []);
      out.get(e.from).push(e);
      if (!inc.has(e.to)) inc.set(e.to, []);
      inc.get(e.to).push(e);
    }
    return { outgoing: out, incoming: inc };
  }, [visibleSymbols, mergedDirectionalEdges]);
  const related = reactExports.useMemo(() => {
    if (!focusSymbol) return null;
    const m = /* @__PURE__ */ new Map();
    m.set(focusSymbol, "focus");
    for (const e of outgoing.get(focusSymbol) ?? []) {
      if (e.to !== focusSymbol) m.set(e.to, "customer");
    }
    for (const e of incoming.get(focusSymbol) ?? []) {
      if (e.from === focusSymbol) continue;
      const prev = m.get(e.from);
      m.set(e.from, prev === "customer" ? "both" : "supplier");
    }
    for (const peer of mergedCompetitorMap.get(focusSymbol) ?? []) {
      if (!visibleSymbols.has(peer)) continue;
      m.set(peer, "competitor");
    }
    for (const peer of mergedPartnerMap.get(focusSymbol) ?? []) {
      if (!visibleSymbols.has(peer)) continue;
      if (m.get(peer) === "competitor") continue;
      m.set(peer, "partner");
    }
    return m;
  }, [
    focusSymbol,
    outgoing,
    incoming,
    visibleSymbols,
    mergedCompetitorMap,
    mergedPartnerMap
  ]);
  const focusCompetitors = reactExports.useMemo(() => {
    if (!focusSymbol) return [];
    const peers = mergedCompetitorMap.get(focusSymbol);
    if (!peers) return [];
    return [...peers].filter((s) => visibleSymbols.has(s)).sort();
  }, [focusSymbol, visibleSymbols, mergedCompetitorMap]);
  const focusPartners = reactExports.useMemo(() => {
    if (!focusSymbol) return [];
    const peers = mergedPartnerMap.get(focusSymbol);
    if (!peers) return [];
    return [...peers].filter((s) => visibleSymbols.has(s)).sort();
  }, [focusSymbol, visibleSymbols, mergedPartnerMap]);
  const [focusChain, setFocusChain] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (!focusSymbol) {
      setFocusChain(null);
      return;
    }
    let cancelled = false;
    const sym = focusSymbol.toUpperCase();
    window.api.stocks.getCompanyChain(sym).then((row) => {
      if (cancelled) return;
      setFocusChain(row?.status === "ready" ? row.graph : null);
    }).catch(() => {
      if (!cancelled) setFocusChain(null);
    });
    return () => {
      cancelled = true;
    };
  }, [focusSymbol]);
  reactExports.useEffect(() => {
    return window.api.stocks.onCompanyChainUpdated((sym) => {
      if (!focusSymbol) return;
      if (sym.toUpperCase() !== focusSymbol.toUpperCase()) return;
      window.api.stocks.getCompanyChain(focusSymbol).then((row) => setFocusChain(row?.status === "ready" ? row.graph : null)).catch(() => {
      });
    });
  }, [focusSymbol]);
  const [focusCorrections, setFocusCorrections] = reactExports.useState([]);
  reactExports.useEffect(() => {
    if (!focusSymbol) {
      setFocusCorrections([]);
      return;
    }
    let cancelled = false;
    window.api.chainCorrections.list(focusSymbol).then((rows) => {
      if (!cancelled) setFocusCorrections(rows);
    }).catch(() => {
      if (!cancelled) setFocusCorrections([]);
    });
    return () => {
      cancelled = true;
    };
  }, [focusSymbol]);
  reactExports.useEffect(() => {
    return window.api.chainCorrections.onUpdated((sym) => {
      if (!focusSymbol) return;
      if (sym.toUpperCase() !== focusSymbol.toUpperCase()) return;
      window.api.chainCorrections.list(focusSymbol).then((rows) => setFocusCorrections(rows)).catch(() => {
      });
    });
  }, [focusSymbol]);
  const correctedSymbolSet = reactExports.useMemo(() => {
    const s = /* @__PURE__ */ new Set();
    for (const c of focusCorrections) s.add(c.subjectKey.toUpperCase());
    return s;
  }, [focusCorrections]);
  const hiddenCorrections = reactExports.useMemo(
    () => focusCorrections.filter((c) => c.correctionType === "not-relevant"),
    [focusCorrections]
  );
  const [correctionMenu, setCorrectionMenu] = reactExports.useState(null);
  const openCorrectionMenu = (symbol, category, x, y) => {
    setCorrectionMenu({ symbol, category, x, y });
  };
  const closeCorrectionMenu = () => setCorrectionMenu(null);
  const refetchCorrections = async (sym) => {
    try {
      const fresh = await window.api.chainCorrections.list(sym);
      setFocusCorrections(fresh);
    } catch {
    }
  };
  const handleCorrectionSelect = async (action) => {
    if (!correctionMenu || !focusSymbol) return;
    const { symbol } = correctionMenu;
    try {
      if (action.type === "remove") {
        const targets = focusCorrections.filter(
          (c) => c.subjectKey.toUpperCase() === symbol.toUpperCase()
        );
        const results = await Promise.allSettled(
          targets.map(
            (c) => window.api.chainCorrections.delete({
              focusSymbol,
              subjectType: c.subjectType,
              subjectKey: c.subjectKey,
              correctionType: c.correctionType
            })
          )
        );
        for (const r of results) {
          if (r.status === "rejected") {
            console.warn("[chainCorrection] partial remove failure:", r.reason);
          }
        }
      } else {
        await window.api.chainCorrections.upsert({
          focusSymbol,
          subjectType: "counterparty",
          subjectKey: symbol,
          correctionType: action.type,
          correctedValue: action.type === "wrong-direction" ? { direction: action.direction } : action.type === "wrong-relationship" ? { relationship: action.relationship } : null
        });
      }
    } catch (err) {
      console.warn("[chainCorrection] failed to apply:", err);
    } finally {
      await refetchCorrections(focusSymbol);
    }
  };
  const restoreHidden = async (subjectKey) => {
    if (!focusSymbol) return;
    try {
      await window.api.chainCorrections.delete({
        focusSymbol,
        subjectType: "counterparty",
        subjectKey,
        correctionType: "not-relevant"
      });
    } catch (err) {
      console.warn("[chainCorrection] restore failed:", err);
    } finally {
      await refetchCorrections(focusSymbol);
    }
  };
  const openDetail = (symbol) => {
    const t = tickerBySymbol.get(symbol.toUpperCase());
    if (t) onOpenTicker(t.id);
  };
  const activateTicker = (symbol) => {
    const t = tickerBySymbol.get(symbol.toUpperCase());
    if (t && !t.isActive) onActivateTicker(t.id);
  };
  const toggleLock = (symbol) => {
    setLockedSymbol((prev) => prev === symbol ? null : symbol);
    setHoverSymbol(symbol);
  };
  const handleTileClick = (symbol, hasTickerRow) => {
    if (clickTimer.current !== null) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      if (hasTickerRow) openDetail(symbol);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      toggleLock(symbol);
    }, CLICK_DELAY_MS);
  };
  const focusEdgesOut = focusSymbol ? outgoing.get(focusSymbol) ?? [] : [];
  const focusEdgesIn = focusSymbol ? incoming.get(focusSymbol) ?? [] : [];
  const focusTicker = focusSymbol ? tickerBySymbol.get(focusSymbol.toUpperCase()) : null;
  const focusHeldLabel = focusTicker?.isActive ? "in watchlist" : focusTicker ? "tracked" : "not in watchlist";
  const nodeBySymbol = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const n of mergedNodes) m.set(n.symbol.toUpperCase(), n);
    return m;
  }, [mergedNodes]);
  const stageLabelById = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const s of CHAIN$1.stages) m.set(s.id, s.label);
    for (const s of activeStages) m.set(s.id, s.label);
    return m;
  }, [activeStages]);
  const focusNode = focusSymbol ? nodeBySymbol.get(focusSymbol) : null;
  const focusStageLabel = focusNode ? stageLabelById.get(focusNode.stage) ?? focusNode.stage : "";
  const focusCompanyName = focusTicker?.companyName ?? focusSymbol ?? "";
  const focusBlurb = focusNode?.blurb ?? "";
  const focusTopLevel = reactExports.useMemo(() => {
    if (!focusSymbol) return null;
    const primary = resolvedPrimarySector.get(focusSymbol.toUpperCase());
    if (!primary) return null;
    const ancestors = SECTOR_ANCESTORS.get(primary);
    if (!ancestors) return null;
    for (const id of ancestors) {
      const entry = CATALOG.find((c) => c.id === id);
      if (entry && !entry.parentId) return entry.id;
    }
    return null;
  }, [focusSymbol, resolvedPrimarySector]);
  const topLevelNameById = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const top of TOP_LEVEL_SECTORS) m.set(top.id, top.name);
    return m;
  }, []);
  const buildCounterparty = (sym, note, citations, source) => {
    const n = nodeBySymbol.get(sym);
    const stage = n?.stage ?? "";
    let crossSectorLabel = null;
    if (focusTopLevel) {
      const primary = resolvedPrimarySector.get(sym.toUpperCase());
      if (primary) {
        const ancestors = SECTOR_ANCESTORS.get(primary);
        const top = ancestors ? [...ancestors].find((id) => {
          const entry = CATALOG.find((c) => c.id === id);
          return entry && !entry.parentId;
        }) : void 0;
        if (top && top !== focusTopLevel) {
          crossSectorLabel = topLevelNameById.get(top) ?? null;
        }
      }
    }
    return {
      symbol: sym,
      stage,
      stageLabel: stage ? stageLabelById.get(stage) ?? stage : "—",
      companyName: tickerBySymbol.get(sym.toUpperCase())?.companyName ?? n?.name ?? sym,
      note,
      crossSectorLabel,
      citations: citations && citations.length > 0 ? citations : void 0,
      source: source ?? null
    };
  };
  const customerItems = reactExports.useMemo(
    () => focusEdgesOut.map(
      (e) => buildCounterparty(e.to, e.note ?? null, e.citations, e.source ?? null)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusEdgesOut, nodeBySymbol, stageLabelById, tickerBySymbol]
  );
  const supplierItems = reactExports.useMemo(
    () => focusEdgesIn.map(
      (e) => buildCounterparty(e.from, e.note ?? null, e.citations, e.source ?? null)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusEdgesIn, nodeBySymbol, stageLabelById, tickerBySymbol]
  );
  const competitorItems = reactExports.useMemo(
    () => focusCompetitors.map((sym) => buildCounterparty(sym, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusCompetitors, nodeBySymbol, stageLabelById, tickerBySymbol]
  );
  const partnerItems = reactExports.useMemo(
    () => focusPartners.map((sym) => buildCounterparty(sym, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusPartners, nodeBySymbol, stageLabelById, tickerBySymbol]
  );
  const unverifiedExtras = reactExports.useMemo(() => {
    const empty = {
      suppliers: [],
      customers: [],
      competitors: [],
      partners: []
    };
    if (!focusSymbol || !focusChain) return empty;
    const focus = focusSymbol.toUpperCase();
    const unverifiedSymbols = /* @__PURE__ */ new Map();
    for (const n of focusChain.nodes) {
      if (n.kind !== "unverified") continue;
      unverifiedSymbols.set(n.symbol.toUpperCase(), {
        name: n.name,
        stage: n.stage
      });
    }
    if (unverifiedSymbols.size === 0) return empty;
    const make = (symbol, note, citations, source) => {
      const meta = unverifiedSymbols.get(symbol);
      const stage = meta?.stage ?? "";
      return {
        symbol,
        stage,
        stageLabel: stage ? stageLabelById.get(stage) ?? stage : "—",
        companyName: meta?.name ?? symbol,
        note,
        unverified: true,
        citations: citations && citations.length > 0 ? citations : void 0,
        source
      };
    };
    const out = {
      suppliers: [],
      customers: [],
      competitors: [],
      partners: []
    };
    const seen = /* @__PURE__ */ new Set();
    const push = (bucket, sym, note, citations, source) => {
      const k = `${bucket}:${sym}`;
      if (seen.has(k)) return;
      seen.add(k);
      out[bucket].push(make(sym, note, citations, source));
    };
    for (const e of focusChain.edges) {
      const from = e.from.toUpperCase();
      const to = e.to.toUpperCase();
      if (from !== focus && to !== focus) continue;
      const counter = from === focus ? to : from;
      if (!unverifiedSymbols.has(counter)) continue;
      const rel = e.relationship;
      const cites = e.citations && e.citations.length > 0 ? e.citations : e.citation ? [e.citation] : void 0;
      const src = e.source ?? null;
      if (rel === "competitor") {
        push("competitors", counter, e.note ?? null, cites, src);
        continue;
      }
      if (rel === "partner") {
        push("partners", counter, e.note ?? null, cites, src);
        continue;
      }
      if (rel === "supplier") {
        push(from === focus ? "customers" : "suppliers", counter, e.note ?? null, cites, src);
      } else if (rel === "customer") {
        push(from === focus ? "suppliers" : "customers", counter, e.note ?? null, cites, src);
      }
    }
    return out;
  }, [focusSymbol, focusChain, stageLabelById]);
  const {
    combinedCustomers,
    combinedSuppliers,
    combinedCompetitors,
    combinedPartners
  } = reactExports.useMemo(() => {
    const rawCustomers = [...customerItems, ...unverifiedExtras.customers];
    const rawSuppliers = [...supplierItems, ...unverifiedExtras.suppliers];
    const rawCompetitors = [...competitorItems, ...unverifiedExtras.competitors];
    const rawPartners = [...partnerItems, ...unverifiedExtras.partners];
    if (focusCorrections.length === 0) {
      return {
        combinedCustomers: rawCustomers,
        combinedSuppliers: rawSuppliers,
        combinedCompetitors: rawCompetitors,
        combinedPartners: rawPartners
      };
    }
    const dropped = /* @__PURE__ */ new Set();
    const moveTo = /* @__PURE__ */ new Map();
    for (const c of focusCorrections) {
      if (c.subjectType !== "counterparty") continue;
      const key = c.subjectKey.toUpperCase();
      if (c.correctionType === "not-relevant") {
        dropped.add(key);
      } else if (c.correctionType === "wrong-direction" && c.correctedValue?.direction) {
        moveTo.set(key, c.correctedValue.direction);
      } else if (c.correctionType === "wrong-relationship" && c.correctedValue?.relationship) {
        moveTo.set(key, c.correctedValue.relationship);
      }
    }
    const filterAndExtract = (arr) => {
      const kept = [];
      const moved = [];
      for (const item of arr) {
        const k = item.symbol.toUpperCase();
        if (dropped.has(k)) continue;
        if (moveTo.has(k)) {
          moved.push(item);
          continue;
        }
        kept.push(item);
      }
      return { kept, moved };
    };
    const sup = filterAndExtract(rawSuppliers);
    const cus = filterAndExtract(rawCustomers);
    const com = filterAndExtract(rawCompetitors);
    const par = filterAndExtract(rawPartners);
    const reinsertBuckets = {
      supplier: sup.kept,
      customer: cus.kept,
      competitor: com.kept,
      partner: par.kept
    };
    const seen = {
      supplier: new Set(sup.kept.map((x) => x.symbol.toUpperCase())),
      customer: new Set(cus.kept.map((x) => x.symbol.toUpperCase())),
      competitor: new Set(com.kept.map((x) => x.symbol.toUpperCase())),
      partner: new Set(par.kept.map((x) => x.symbol.toUpperCase()))
    };
    for (const item of [...sup.moved, ...cus.moved, ...com.moved, ...par.moved]) {
      const target = moveTo.get(item.symbol.toUpperCase());
      if (!target) continue;
      if (seen[target].has(item.symbol.toUpperCase())) continue;
      seen[target].add(item.symbol.toUpperCase());
      reinsertBuckets[target].push(item);
    }
    return {
      combinedCustomers: reinsertBuckets.customer,
      combinedSuppliers: reinsertBuckets.supplier,
      combinedCompetitors: reinsertBuckets.competitor,
      combinedPartners: reinsertBuckets.partner
    };
  }, [
    customerItems,
    supplierItems,
    competitorItems,
    partnerItems,
    unverifiedExtras.customers,
    unverifiedExtras.suppliers,
    unverifiedExtras.competitors,
    unverifiedExtras.partners,
    focusCorrections
  ]);
  const presentCategories = [];
  if (combinedSuppliers.length > 0) presentCategories.push("supplier");
  if (combinedCompetitors.length > 0) presentCategories.push("competitor");
  if (combinedCustomers.length > 0) presentCategories.push("customer");
  if (combinedPartners.length > 0) presentCategories.push("partner");
  const { boxShadow: focusBoxShadow, glowBackground: focusGlow } = categoryGlow(presentCategories);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 pt-2 pb-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4 mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90 mb-1.5", children: "Value chain" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-400 max-w-[560px] leading-relaxed", children: "Hover to preview, click to pin the panel, double-click any ticker to open its detail view." })
      ] }),
      lockedSymbol && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => {
            setLockedSymbol(null);
            setHoverSymbol(null);
          },
          className: "px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
          children: [
            "Unpin · ",
            lockedSymbol
          ]
        }
      )
    ] }),
    (() => {
      const withCount = new Map(sectorsWithContent.map((s) => [s.id, s]));
      let currentTopLevelId = null;
      if (sectorId !== "all") {
        const ancestors = SECTOR_ANCESTORS.get(sectorId);
        if (ancestors) {
          for (const id of ancestors) {
            const entry = CATALOG.find((c) => c.id === id);
            if (entry && !entry.parentId) {
              currentTopLevelId = entry.id;
              break;
            }
          }
        }
      }
      const subSectors = currentTopLevelId ? CATALOG.filter(
        (entry) => entry.parentId === currentTopLevelId && (withCount.get(entry.id)?.tickerCount ?? 0) > 0
      ) : [];
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 mb-2 rounded-full bg-surface-1 ring-1 ring-edge/60 p-0.5 w-fit flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            SectorTab,
            {
              label: "All",
              active: sectorId === "all",
              onClick: () => {
                setSectorId("all");
                setHoverSymbol(null);
                setLockedSymbol(null);
              }
            }
          ),
          TOP_LEVEL_SECTORS.filter(
            (top) => (withCount.get(top.id)?.descendantTickerCount ?? 0) > 0
          ).map((top) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            SectorTab,
            {
              label: top.name,
              active: sectorId === top.id || currentTopLevelId === top.id && sectorId !== "all",
              onClick: () => {
                setSectorId(top.id);
                setHoverSymbol(null);
                setLockedSymbol(null);
              }
            },
            top.id
          ))
        ] }),
        subSectors.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 mb-4 ml-3 flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.2em] text-zinc-600 mr-1", children: "↳" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            SubSectorChip,
            {
              label: `All of ${TOP_LEVEL_SECTORS.find((t) => t.id === currentTopLevelId)?.name ?? ""}`,
              active: sectorId === currentTopLevelId,
              onClick: () => {
                if (!currentTopLevelId) return;
                setSectorId(currentTopLevelId);
                setHoverSymbol(null);
                setLockedSymbol(null);
              }
            }
          ),
          subSectors.map((sub) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            SubSectorChip,
            {
              label: sub.name,
              active: sectorId === sub.id,
              onClick: () => {
                setSectorId(sub.id);
                setHoverSymbol(null);
                setLockedSymbol(null);
              }
            },
            sub.id
          ))
        ] })
      ] });
    })(),
    /* @__PURE__ */ jsxRuntimeExports.jsx("aside", { className: "sticky top-0 z-20 -mx-6 px-6 pt-1 pb-3 mb-4 bg-surface-0 border-b border-edge/40", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "rounded-xl border border-edge bg-gradient-to-br from-surface-1 to-surface-0 h-[240px] overflow-hidden flex flex-col relative",
        style: focusSymbol && presentCategories.length > 0 ? { boxShadow: focusBoxShadow } : void 0,
        children: [
          focusSymbol && presentCategories.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "pointer-events-none absolute inset-0",
              style: { backgroundImage: focusGlow }
            }
          ),
          focusSymbol ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "relative px-4 pt-3 pb-3 border-b border-edge/40", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-2 mb-1.5 flex-wrap", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[15px] font-bold tracking-[0.04em] text-zinc-50", children: focusSymbol }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] text-zinc-400 truncate", children: focusCompanyName }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full bg-zinc-800/70 text-zinc-300", children: focusStageLabel }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: `text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full ${focusTicker?.isActive ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30" : focusTicker ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30" : "bg-zinc-800/50 text-zinc-500"}`,
                    children: focusHeldLabel
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(FocusEarningsPill, { earnings: earningsMap.get(focusSymbol) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-auto text-[10px] uppercase tracking-[0.2em] text-zinc-500 shrink-0", children: [
                  focusEdgesOut.length + focusEdgesIn.length,
                  " links"
                ] }),
                lockedSymbol === focusSymbol && focusTicker && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => openDetail(focusSymbol),
                      className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25",
                      children: "Open detail →"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => setDiagramSymbol(focusSymbol),
                      className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-200 ring-1 ring-inset ring-purple-500/40 hover:bg-purple-500/25",
                      children: "View diagram"
                    }
                  ),
                  focusCompetitors.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => setPeerCompareSymbol(focusSymbol),
                      className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-200 ring-1 ring-inset ring-orange-500/40 hover:bg-orange-500/25",
                      title: `Compare ${focusSymbol} against ${focusCompetitors.length} competitor${focusCompetitors.length === 1 ? "" : "s"}`,
                      children: "Compare peers"
                    }
                  ),
                  focusTicker.isActive ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "span",
                    {
                      className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40",
                      title: "In your watchlist",
                      children: "✓ Watchlist"
                    }
                  ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => activateTicker(focusSymbol),
                      className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25",
                      children: "+ Watchlist"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11.5px] text-zinc-400 leading-snug line-clamp-2", children: focusBlurb || /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600", children: "No description available." }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                FocusCashflowStrip,
                {
                  financials: financialsMap.get(focusSymbol),
                  earnings: earningsMap.get(focusSymbol)
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                FocusAnalystStrip,
                {
                  estimates: estimatesMap.get(focusSymbol),
                  currentPrice: (() => {
                    const q = quoteBySymbol.get(focusSymbol);
                    return q ? resolveDisplayQuote(q).price : null;
                  })()
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                FocusOptionsStrip,
                {
                  options: focusOptions,
                  earnings: earningsMap.get(focusSymbol)
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative flex-1 px-4 py-3 overflow-y-auto", children: (() => {
              const trioCount = [
                combinedSuppliers.length > 0,
                combinedCompetitors.length > 0,
                combinedCustomers.length > 0
              ].filter(Boolean).length;
              const gridCols = trioCount === 3 ? "md:grid-cols-3" : trioCount === 2 ? "md:grid-cols-2" : "";
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `grid grid-cols-1 gap-4 ${gridCols}`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TransactionCluster,
                    {
                      category: "supplier",
                      items: combinedSuppliers,
                      onPick: toggleLock,
                      onHover: focusTile,
                      onLeave: scheduleClear,
                      onContextMenu: (sym, x, y) => openCorrectionMenu(sym, "supplier", x, y),
                      correctedSymbols: correctedSymbolSet,
                      onOpenCitation: onOpenURL
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TransactionCluster,
                    {
                      category: "competitor",
                      items: combinedCompetitors,
                      onPick: toggleLock,
                      onHover: focusTile,
                      onLeave: scheduleClear,
                      onContextMenu: (sym, x, y) => openCorrectionMenu(sym, "competitor", x, y),
                      correctedSymbols: correctedSymbolSet,
                      onOpenCitation: onOpenURL
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TransactionCluster,
                    {
                      category: "customer",
                      items: combinedCustomers,
                      onPick: toggleLock,
                      onHover: focusTile,
                      onLeave: scheduleClear,
                      onContextMenu: (sym, x, y) => openCorrectionMenu(sym, "customer", x, y),
                      correctedSymbols: correctedSymbolSet,
                      onOpenCitation: onOpenURL
                    }
                  )
                ] }),
                combinedPartners.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 pt-4 border-t border-edge/30", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  TransactionCluster,
                  {
                    category: "partner",
                    items: combinedPartners,
                    onPick: toggleLock,
                    onHover: focusTile,
                    onLeave: scheduleClear,
                    onContextMenu: (sym, x, y) => openCorrectionMenu(sym, "partner", x, y),
                    correctedSymbols: correctedSymbolSet,
                    onOpenCitation: onOpenURL
                  }
                ) })
              ] });
            })() }),
            hiddenCorrections.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-2 border-t border-edge/40 bg-surface-1/40", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-400", children: "Hidden by you" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-600", children: [
                  "· ",
                  hiddenCorrections.length
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: hiddenCorrections.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => void restoreHidden(c.subjectKey),
                  title: `Restore ${c.subjectKey} to the chain`,
                  className: "inline-flex items-center gap-1 px-2 py-[3px] rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 text-amber-200 text-[10.5px] tabular-nums hover:bg-amber-500/15 transition-colors",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: c.subjectKey }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400/70", children: "×" })
                  ]
                },
                c.subjectKey
              )) })
            ] })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex items-center justify-center text-[11px] uppercase tracking-[0.2em] text-zinc-600", children: "Hover or click a ticker to see its connections" })
        ]
      }
    ) }),
    stageGroups.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-xl border border-dashed border-edge/60 px-6 py-10 text-center text-[12px] text-zinc-500", children: "No nodes in this sector." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: stageGroups.map(({ stage, nodes: nodes2 }, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500 shrink-0 whitespace-nowrap", children: [
          String(idx + 1).padStart(2, "0"),
          " · ",
          stage.label
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/60" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-600", children: nodes2.length })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: nodes2.map((n) => {
        const t = tickerBySymbol.get(n.symbol.toUpperCase());
        const q = quoteBySymbol.get(n.symbol.toUpperCase());
        const fin = financialsMap.get(n.symbol.toUpperCase());
        const earnings = earningsMap.get(n.symbol.toUpperCase());
        const recentFilings = recentFilingsMap.get(n.symbol.toUpperCase());
        const hasTickerRow = !!t;
        const inWatchlist = !!t && t.isActive;
        const role = related?.get(n.symbol) ?? null;
        const dim = related ? role === null : false;
        const isFocus = focusSymbol === n.symbol;
        const isLocked = lockedSymbol === n.symbol;
        const upperSym = n.symbol.toUpperCase();
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            ref: (el) => {
              if (el) tileRefs.current.set(upperSym, el);
              else tileRefs.current.delete(upperSym);
            },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              ValueChainTile,
              {
                symbol: n.symbol,
                companyName: t?.companyName ?? n.name ?? n.symbol,
                quote: q,
                financials: fin,
                earnings,
                recentFilings,
                hasTickerRow,
                inWatchlist,
                focus: isFocus,
                locked: isLocked,
                role: isFocus ? null : role,
                dim,
                onHover: () => focusTile(n.symbol),
                onLeave: scheduleClear,
                onClick: () => handleTileClick(n.symbol, hasTickerRow)
              }
            )
          },
          n.symbol
        );
      }) })
    ] }, stage.id)) }),
    diagramSymbol && /* @__PURE__ */ jsxRuntimeExports.jsx(
      ValueChainDiagram,
      {
        initialSymbol: diagramSymbol,
        tickers,
        quotes,
        onClose: () => setDiagramSymbol(null),
        onOpenTicker: (id) => {
          setDiagramSymbol(null);
          onOpenTicker(id);
        },
        onActivateTicker,
        onOpenURL
      }
    ),
    peerCompareSymbol && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PeerCompareModal,
      {
        focusSymbol: peerCompareSymbol,
        peers: [...mergedCompetitorMap.get(peerCompareSymbol) ?? []].sort(),
        tickerBySymbol,
        quoteBySymbol,
        financialsBySymbol: financialsMap,
        earningsBySymbol: earningsMap,
        estimatesBySymbol: estimatesMap,
        onClose: () => setPeerCompareSymbol(null),
        onOpenTicker: (id) => {
          setPeerCompareSymbol(null);
          onOpenTicker(id);
        },
        onActivateTicker
      }
    ),
    correctionMenu && /* @__PURE__ */ jsxRuntimeExports.jsx(
      ChainCorrectionMenu,
      {
        x: correctionMenu.x,
        y: correctionMenu.y,
        symbol: correctionMenu.symbol,
        currentCategory: correctionMenu.category,
        hasExistingCorrection: correctedSymbolSet.has(
          correctionMenu.symbol.toUpperCase()
        ),
        onSelect: (action) => void handleCorrectionSelect(action),
        onClose: closeCorrectionMenu
      }
    )
  ] });
}
function SectorTab({
  label,
  active,
  onClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick,
      className: `px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${active ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/40" : "text-zinc-400 hover:text-zinc-200"}`,
      children: label
    }
  );
}
function SubSectorChip({
  label,
  active,
  onClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick,
      className: `px-2.5 py-[3px] rounded-full text-[9px] font-semibold uppercase tracking-[0.18em] transition-colors ring-1 ring-inset ${active ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30" : "bg-surface-1 text-zinc-500 ring-edge/60 hover:text-zinc-300"}`,
      children: label
    }
  );
}
function ValueChainTile({
  symbol,
  companyName,
  quote,
  financials,
  earnings,
  recentFilings,
  hasTickerRow,
  inWatchlist,
  focus,
  locked,
  role,
  dim,
  onHover,
  onLeave,
  onClick
}) {
  const rq = quote ? resolveDisplayQuote(quote) : null;
  const change = rq?.change ?? null;
  const changePct = rq?.changePct ?? null;
  const displayPrice = rq?.price ?? null;
  const sessionBadge = rq?.sessionBadge ?? null;
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const color = up ? "text-emerald-400" : down ? "text-red-400" : "text-zinc-500";
  const symbolColor = inWatchlist ? "text-zinc-50" : hasTickerRow ? "text-zinc-200" : "text-zinc-400";
  const base = "group relative rounded-lg border px-3 py-2 min-w-[120px] text-left transition-colors duration-100";
  let tone;
  if (locked) {
    tone = "border-emerald-300 bg-emerald-500/20 shadow-[0_0_0_2px_rgba(16,185,129,0.65)]";
  } else if (focus) {
    tone = "border-emerald-400 bg-emerald-500/15 shadow-[0_0_0_2px_rgba(16,185,129,0.45)]";
  } else if (role === "customer") {
    tone = "border-emerald-400/80 bg-emerald-500/[0.08] shadow-[0_0_0_1px_rgba(16,185,129,0.35)]";
  } else if (role === "supplier") {
    tone = "border-indigo-400/80 bg-indigo-500/[0.08] shadow-[0_0_0_1px_rgba(99,102,241,0.35)]";
  } else if (role === "both") {
    tone = "border-emerald-400/70 bg-indigo-500/[0.06] shadow-[0_0_0_1px_rgba(99,102,241,0.35)]";
  } else if (role === "competitor") {
    tone = "border-orange-400/80 bg-orange-500/[0.08] shadow-[0_0_0_1px_rgba(249,115,22,0.35)]";
  } else if (role === "partner") {
    tone = "border-sky-400/80 bg-sky-500/[0.08] shadow-[0_0_0_1px_rgba(14,165,233,0.35)]";
  } else if (inWatchlist) {
    tone = "border-edge/70 bg-surface-1 hover:border-edge";
  } else if (hasTickerRow) {
    tone = "border-edge/50 bg-surface-0 hover:border-edge/80";
  } else {
    tone = "border-dashed border-edge/50 bg-surface-0 hover:border-edge/70";
  }
  const opacity = dim ? "opacity-40" : "";
  const pulse = dim ? null : pulseClass(pulsePhase(earnings));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      onMouseEnter: onHover,
      onMouseLeave: onLeave,
      onFocus: onHover,
      onBlur: onLeave,
      onClick,
      className: `${base} ${tone} ${opacity} ${pulse ?? ""} cursor-pointer`,
      title: companyName,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[13px] font-bold tracking-[0.04em] ${symbolColor}`, children: symbol }),
            sessionBadge && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[8.5px] font-semibold uppercase tracking-[0.1em] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40", children: sessionBadge }),
            recentFilings && recentFilings.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(FilingBadge, { filings: recentFilings })
          ] }),
          hasTickerRow ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[10px] font-semibold tabular-nums ${color}`, children: changePct !== null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%` : "—" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.18em] text-zinc-600", children: "ext" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 flex items-baseline justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 truncate max-w-[140px]", children: companyName }),
          hasTickerRow && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: `text-[11px] tabular-nums shrink-0 ${inWatchlist ? "text-zinc-300" : "text-zinc-500"}`,
              children: displayPrice !== null ? displayPrice.toFixed(2) : "—"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TileCashflowRow, { financials })
      ]
    }
  );
}
function FocusEarningsPill({
  earnings
}) {
  const label = countdownLabel(earnings);
  if (!label) return null;
  const phase = pulsePhase(earnings);
  const tone = phase === "imminent" ? "bg-amber-400/20 text-amber-200 ring-1 ring-inset ring-amber-400/50" : phase === "warning" ? "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/35" : phase === "ambient" ? "bg-amber-600/10 text-amber-300/80 ring-1 ring-inset ring-amber-600/25" : phase === "reported" ? "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30" : "bg-zinc-800/60 text-zinc-400";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[9px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full ${tone}`, children: label });
}
function FocusCashflowStrip({
  financials,
  earnings
}) {
  const hasFinancials = !!financials;
  const hasHistory = !!earnings && earnings.history.length > 0;
  if (!hasFinancials && !hasHistory) return null;
  const revenue = formatMoneyCompact(financials?.ttm.revenue ?? null);
  const fcf = formatMoneyCompact(financials?.ttm.freeCashFlow ?? null);
  const margin = formatPctValue(financials?.ttm.fcfMargin ?? null);
  const qoq = formatPctDelta(financials?.qoq.revenue ?? null);
  const yoy = formatPctDelta(financials?.yoy.revenue ?? null);
  const marginTone = fcfMarginTone(financials?.ttm.fcfMargin ?? null);
  const qoqTone = deltaTone$1(financials?.qoq.revenue ?? null);
  const yoyTone = deltaTone$1(financials?.yoy.revenue ?? null);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] tabular-nums", children: [
    hasFinancials && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "Revenue TTM", value: revenue, valueClass: "text-zinc-200" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "FCF TTM", value: fcf, valueClass: "text-zinc-200" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        KPI,
        {
          label: "FCF margin",
          value: margin,
          valueClass: marginTone.color,
          dotClass: marginTone.dot
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "Rev QoQ", value: qoq, valueClass: qoqTone }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "Rev YoY", value: yoy, valueClass: yoyTone })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-3", children: [
      hasHistory && /* @__PURE__ */ jsxRuntimeExports.jsx(EarningsBeatMiss, { history: earnings.history, variant: "strip" }),
      hasFinancials && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "flex items-center gap-1.5",
          title: "Quarterly FCF (oldest → newest, up to 8 quarters)",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.18em] text-zinc-500", children: "QTR FCF" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(FcfSparkline, { financials, variant: "strip" })
          ]
        }
      )
    ] })
  ] });
}
function FilingBadge({ filings }) {
  const title = filings.slice(0, 6).map((f) => {
    const d = new Date(f.filedAt).toISOString().slice(0, 10);
    return `${d} · ${f.formType}${f.items ? ` (${f.items})` : ""}`;
  }).join("\n");
  const label = filings.length > 1 ? `${filings.length}` : null;
  const has8K = filings.some((f) => f.formType.startsWith("8-K"));
  const tone = has8K ? "bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-500/40" : "bg-zinc-700/60 text-zinc-300 ring-1 ring-inset ring-zinc-600/60";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "span",
    {
      className: `shrink-0 inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] px-1 py-0.5 rounded ${tone}`,
      title: `Filed in last 72h
${title}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": true, children: "§" }),
        label
      ]
    }
  );
}
function deltaTone$1(ratio) {
  if (ratio === null) return "text-zinc-500";
  if (ratio > 0) return "text-emerald-300";
  if (ratio < 0) return "text-red-300";
  return "text-zinc-300";
}
function FocusAnalystStrip({
  estimates,
  currentPrice
}) {
  if (!estimates) return null;
  const nextQ = estimates.nextQuarter?.avg ?? null;
  const targetMean = estimates.targetMean;
  const upside = targetMean !== null && currentPrice !== null && currentPrice > 0 ? (targetMean - currentPrice) / currentPrice : null;
  const netUpgrades = estimates.upgradesLast30d - estimates.downgradesLast30d;
  const recLabel = recommendationLabel(estimates.recommendationKey, estimates.recommendationMean);
  const hasAny = nextQ !== null || targetMean !== null || estimates.analystCount !== null || netUpgrades !== 0 || recLabel !== null;
  if (!hasAny) return null;
  const upsideTone = deltaTone$1(upside);
  const upgradeTone = netUpgrades > 0 ? "text-emerald-300" : netUpgrades < 0 ? "text-red-300" : "text-zinc-400";
  const targetLabel = targetMean !== null ? `$${targetMean.toFixed(2)}${upside !== null ? ` (${upside >= 0 ? "+" : ""}${(upside * 100).toFixed(1)}%)` : ""}` : null;
  const nextQLabel = nextQ !== null ? `$${nextQ.toFixed(2)}` : null;
  const coverage = estimates.analystCount !== null ? `${estimates.analystCount} analyst${estimates.analystCount === 1 ? "" : "s"}` : null;
  const upgradeLabel = netUpgrades !== 0 ? `${netUpgrades > 0 ? "+" : ""}${netUpgrades} 30d` : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] tabular-nums", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "Next Q est", value: nextQLabel, valueClass: "text-zinc-200" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      KPI,
      {
        label: "Price target",
        value: targetLabel,
        valueClass: upside === null ? "text-zinc-200" : upsideTone
      }
    ),
    coverage && /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "Coverage", value: coverage, valueClass: "text-zinc-400" }),
    recLabel && /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "Consensus", value: recLabel.label, valueClass: recLabel.color }),
    upgradeLabel && /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "Revisions", value: upgradeLabel, valueClass: upgradeTone })
  ] });
}
function recommendationLabel(key, mean) {
  if (mean !== null && Number.isFinite(mean)) {
    if (mean < 1.5) return { label: "Strong buy", color: "text-emerald-300" };
    if (mean < 2.5) return { label: "Buy", color: "text-emerald-400" };
    if (mean < 3.5) return { label: "Hold", color: "text-zinc-300" };
    if (mean < 4.5) return { label: "Sell", color: "text-red-400" };
    return { label: "Strong sell", color: "text-red-300" };
  }
  if (key && key !== "none") {
    const pretty = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { label: pretty, color: "text-zinc-300" };
  }
  return null;
}
function FocusOptionsStrip({
  options,
  earnings
}) {
  if (!options) return null;
  const iv = options.impliedVol;
  const ivLabel = iv !== null ? `${(iv * 100).toFixed(0)}%` : null;
  const moveUsd = options.expectedMoveUsd;
  const movePct = options.expectedMovePct;
  const moveLabel = moveUsd !== null ? `±$${moveUsd.toFixed(2)}${movePct !== null ? ` (${(movePct * 100).toFixed(1)}%)` : ""}` : null;
  const ratio = options.putCallOiRatio;
  const ratioLabel2 = ratio !== null && Number.isFinite(ratio) ? ratio >= 1 ? `${ratio.toFixed(2)}× puts` : `${(1 / ratio).toFixed(2)}× calls` : null;
  const ratioColor = ratio === null ? "text-zinc-400" : ratio > 1.2 ? "text-red-300" : ratio < 0.8 ? "text-emerald-300" : "text-zinc-300";
  const coversEarnings = earnings?.nextDate !== void 0 && earnings?.nextDate !== null && earnings.nextDate <= options.expiryDate;
  const expiryLabel = options.daysToExpiry > 0 ? `${options.daysToExpiry}d expiry` : "expires today";
  if (!ivLabel && !moveLabel && !ratioLabel2) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] tabular-nums",
      title: `Nearest expiry ${new Date(options.expiryDate).toLocaleDateString()} · ATM strike $${options.atmStrike?.toFixed(2) ?? "—"}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500", children: [
          "Options · ",
          expiryLabel,
          coversEarnings && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-amber-300", children: "(covers earnings)" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "IV", value: ivLabel, valueClass: "text-zinc-200" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          KPI,
          {
            label: "Expected move",
            value: moveLabel,
            valueClass: coversEarnings ? "text-amber-200" : "text-zinc-200"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(KPI, { label: "Put/call OI", value: ratioLabel2, valueClass: ratioColor })
      ]
    }
  );
}
function KPI({
  label,
  value,
  valueClass,
  dotClass
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.18em] text-zinc-500", children: label }),
    dotClass && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `h-1 w-1 rounded-full ${dotClass}` }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `font-semibold ${valueClass}`, children: value ?? "—" })
  ] });
}
function TileCashflowRow({
  financials
}) {
  if (!financials) return null;
  const revenue = formatMoneyCompact(financials.ttm.revenue);
  const marginPct = formatPctValue(financials.ttm.fcfMargin);
  const tone = fcfMarginTone(financials.ttm.fcfMargin);
  if (!revenue && !marginPct && financials.quarters.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 flex items-center justify-between gap-2 text-[9.5px] tabular-nums", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500 truncate max-w-[120px]", title: "TTM revenue", children: revenue ?? "—" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "span",
        {
          className: `inline-flex items-center gap-1 shrink-0 ${tone.color}`,
          title: `FCF margin · ${tone.label}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `h-1 w-1 rounded-full ${tone.dot}` }),
            marginPct ?? "—"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 flex justify-end", title: "Quarterly FCF (oldest → newest)", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FcfSparkline, { financials, variant: "tile" }) })
  ] });
}
const DEFAULTS = {
  repulsion: 0.035,
  attraction: 0.05,
  damping: 0.87,
  iterations: 260,
  groupGravity: 0.06,
  groupSpread: 8
};
function layoutGroupCentres(groups, betweenCounts, spread) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pts = groups.map((g, i) => {
    const y = groups.length === 1 ? 0 : 1 - i / (groups.length - 1) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    return { g, x: Math.cos(theta) * r, y, z: Math.sin(theta) * r, vx: 0, vy: 0, vz: 0 };
  });
  const byId = new Map(pts.map((p) => [p.g, p]));
  const maxCount = Math.max(1, ...betweenCounts.values());
  for (let iter = 0; iter < 200; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.01;
        const d = Math.sqrt(d2);
        const f = 0.9 / d2;
        a.vx += dx / d * f;
        a.vy += dy / d * f;
        a.vz += dz / d * f;
        b.vx -= dx / d * f;
        b.vy -= dy / d * f;
        b.vz -= dz / d * f;
      }
    }
    for (const [key, count] of betweenCounts) {
      const sep = key.indexOf("\0");
      const a = byId.get(key.slice(0, sep));
      const b = byId.get(key.slice(sep + 1));
      if (!a || !b) continue;
      const w = count / maxCount * 0.08;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      a.vx += dx * w;
      a.vy += dy * w;
      a.vz += dz * w;
      b.vx -= dx * w;
      b.vy -= dy * w;
      b.vz -= dz * w;
    }
    for (const p of pts) {
      p.vx += -p.x * 0.02;
      p.vy += -p.y * 0.02;
      p.vz += -p.z * 0.02;
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;
      p.vx *= 0.85;
      p.vy *= 0.85;
      p.vz *= 0.85;
    }
  }
  let maxR = 0;
  for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
  const k = maxR > 0 ? spread / maxR : 1;
  const out = /* @__PURE__ */ new Map();
  for (const p of pts) out.set(p.g, { x: p.x * k, y: p.y * k, z: p.z * k });
  return out;
}
function runClusteredLayout3D(ids, edges2, groupOf, opts = {}) {
  if (ids.length === 0) return [];
  const repulsion = opts.repulsion ?? DEFAULTS.repulsion;
  const attraction = opts.attraction ?? DEFAULTS.attraction;
  const damping = opts.damping ?? DEFAULTS.damping;
  const iterations = opts.iterations ?? DEFAULTS.iterations;
  const groupGravity = opts.groupGravity ?? DEFAULTS.groupGravity;
  const groupSpread = opts.groupSpread ?? DEFAULTS.groupSpread;
  const group = /* @__PURE__ */ new Map();
  for (const id of ids) group.set(id, groupOf(id));
  const groupNames = [...new Set(group.values())].sort();
  const between = /* @__PURE__ */ new Map();
  for (const e of edges2) {
    const ga = group.get(e.from);
    const gb = group.get(e.to);
    if (!ga || !gb || ga === gb) continue;
    const key = ga < gb ? ga + "\0" + gb : gb + "\0" + ga;
    between.set(key, (between.get(key) ?? 0) + 1);
  }
  const centres = layoutGroupCentres(groupNames, between, groupSpread);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const nodes2 = ids.map((id, i) => {
    const g = group.get(id);
    const c = centres.get(g) ?? { x: 0, y: 0, z: 0 };
    const t = golden * i;
    return {
      id,
      g,
      x: c.x + Math.cos(t) * 0.25 + (Math.random() - 0.5) * 0.1,
      y: c.y + Math.sin(t) * 0.25 + (Math.random() - 0.5) * 0.1,
      z: c.z + Math.cos(t * 1.7) * 0.25 + (Math.random() - 0.5) * 0.1,
      vx: 0,
      vy: 0,
      vz: 0
    };
  });
  const byId = new Map(nodes2.map((n) => [n.id, n]));
  const buckets = /* @__PURE__ */ new Map();
  for (const n of nodes2) {
    const arr = buckets.get(n.g);
    if (arr) arr.push(n);
    else buckets.set(n.g, [n]);
  }
  for (let iter = 0; iter < iterations; iter++) {
    for (const bucket of buckets.values()) {
      for (let i = 0; i < bucket.length; i++) {
        const a = bucket[i];
        for (let j = i + 1; j < bucket.length; j++) {
          const b = bucket[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dz = a.z - b.z;
          const d2 = dx * dx + dy * dy + dz * dz + 1e-3;
          const d = Math.sqrt(d2);
          const f = repulsion / d2;
          a.vx += dx / d * f;
          a.vy += dy / d * f;
          a.vz += dz / d * f;
          b.vx -= dx / d * f;
          b.vy -= dy / d * f;
          b.vz -= dz / d * f;
        }
      }
    }
    for (const e of edges2) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const w = a.g === b.g ? attraction : attraction * 0.25;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      a.vx += dx * w;
      a.vy += dy * w;
      a.vz += dz * w;
      b.vx -= dx * w;
      b.vy -= dy * w;
      b.vz -= dz * w;
    }
    for (const n of nodes2) {
      const c = centres.get(n.g) ?? { x: 0, y: 0, z: 0 };
      n.vx += (c.x - n.x) * groupGravity;
      n.vy += (c.y - n.y) * groupGravity;
      n.vz += (c.z - n.z) * groupGravity;
      n.x += n.vx;
      n.y += n.vy;
      n.z += n.vz;
      n.vx *= damping;
      n.vy *= damping;
      n.vz *= damping;
    }
  }
  const radii = nodes2.map((n) => Math.hypot(n.x, n.y, n.z)).sort((a, b) => a - b);
  const cut = radii[Math.floor((radii.length - 1) * 0.95)] || 1;
  const scale = 1 / cut;
  return nodes2.map((n) => ({ id: n.id, x: n.x * scale, y: n.y * scale, z: n.z * scale }));
}
const R_MIN = 2.5;
const R_MAX = 15;
const FOV = 3.2;
const SIZE_LABELS = {
  marketCap: "Market cap",
  news: "News volume",
  degree: "Connections",
  uniform: "Uniform"
};
const EDGE_COLOR = {
  supplier: "56,189,248",
  customer: "56,189,248",
  competitor: "251,113,133",
  partner: "192,132,252"
};
const EDGE_FALLBACK = "100,116,139";
const SECTOR_PALETTE = [
  "56,189,248",
  "74,222,128",
  "251,191,36",
  "232,121,249",
  "251,113,133",
  "129,140,248",
  "251,146,60",
  "45,212,191",
  "167,139,250",
  "163,230,53",
  "34,211,238",
  "244,114,182"
];
const NEUTRAL_RGB = "113,113,122";
function MarketGraph({ quotes, onSelectSymbol }) {
  const [data, setData] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [sizeBy, setSizeBy] = reactExports.useState("degree");
  const [sectorFilter, setSectorFilter] = reactExports.useState("all");
  const [showCoMentions, setShowCoMentions] = reactExports.useState(false);
  const [showEdges, setShowEdges] = reactExports.useState(true);
  const [autoOrbit, setAutoOrbit] = reactExports.useState(false);
  const [query, setQuery] = reactExports.useState("");
  const [selected, setSelected] = reactExports.useState(null);
  const canvasRef = reactExports.useRef(null);
  const camRef = reactExports.useRef({ yaw: 0.5, pitch: -0.25, zoom: 1 });
  const hoverRef = reactExports.useRef(null);
  const projectedRef = reactExports.useRef([]);
  const dragRef = reactExports.useRef(null);
  const rafRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.api.graph.getMarketGraph().then((p) => {
      if (!cancelled) {
        setData(p);
        setError(null);
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const quoteBySymbol = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const q of quotes ?? []) m.set(q.symbol.toUpperCase(), q);
    return m;
  }, [quotes]);
  const sectorOptions = reactExports.useMemo(() => {
    if (!data) return [];
    const counts = /* @__PURE__ */ new Map();
    for (const n of data.nodes) {
      if (!n.topSectorId) continue;
      const prev = counts.get(n.topSectorId);
      counts.set(n.topSectorId, {
        count: (prev?.count ?? 0) + 1,
        name: prev?.name ?? n.topSectorName ?? n.topSectorId
      });
    }
    return [...counts.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count);
  }, [data]);
  const sectorRgb = reactExports.useMemo(() => {
    const order = sectorOptions.map((s) => s.id).sort();
    return (id) => {
      if (!id) return NEUTRAL_RGB;
      const i = order.indexOf(id);
      return i === -1 ? NEUTRAL_RGB : SECTOR_PALETTE[i % SECTOR_PALETTE.length];
    };
  }, [sectorOptions]);
  const visible = reactExports.useMemo(() => {
    if (!data) return { nodes: [], edges: [], coMentions: [] };
    const nodes2 = sectorFilter === "all" ? data.nodes : data.nodes.filter((n) => n.topSectorId === sectorFilter);
    const keep = new Set(nodes2.map((n) => n.symbol));
    return {
      nodes: nodes2,
      edges: data.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
      coMentions: data.coMentions.filter((c) => keep.has(c.from) && keep.has(c.to))
    };
  }, [data, sectorFilter]);
  const degree = reactExports.useMemo(() => {
    const d = /* @__PURE__ */ new Map();
    for (const e of visible.edges) {
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [visible.edges]);
  const capCoverage = reactExports.useMemo(() => {
    if (visible.nodes.length === 0) return 0;
    return visible.nodes.filter((n) => (n.marketCap ?? 0) > 0).length / visible.nodes.length;
  }, [visible.nodes]);
  const effectiveSizeBy = sizeBy === "marketCap" && capCoverage < 0.25 ? "degree" : sizeBy;
  const magnitude = reactExports.useMemo(() => {
    const raw = /* @__PURE__ */ new Map();
    for (const n of visible.nodes) {
      const v = effectiveSizeBy === "marketCap" ? Math.log10(Math.max(n.marketCap ?? 0, 1)) : effectiveSizeBy === "news" ? Math.sqrt(n.newsCount) : effectiveSizeBy === "degree" ? Math.sqrt(degree.get(n.symbol) ?? 0) : 1;
      raw.set(n.symbol, v);
    }
    const nums = [...raw.values()];
    const lo = nums.length ? Math.min(...nums) : 0;
    const hi = nums.length ? Math.max(...nums) : 1;
    const span = hi - lo || 1;
    const out = /* @__PURE__ */ new Map();
    for (const [k, v] of raw) out.set(k, effectiveSizeBy === "uniform" ? 0.5 : (v - lo) / span);
    return out;
  }, [visible.nodes, effectiveSizeBy, degree]);
  const layout = reactExports.useMemo(() => {
    const ids = visible.nodes.map((n) => n.symbol);
    const sectorById = new Map(visible.nodes.map((n) => [n.symbol, n.topSectorId ?? "unknown"]));
    const edges2 = visible.edges.map((e) => ({ from: e.from, to: e.to }));
    const pos = runClusteredLayout3D(ids, edges2, (id) => sectorById.get(id) ?? "unknown");
    return new Map(pos.map((p) => [p.id, p]));
  }, [visible.nodes, visible.edges]);
  const matches = reactExports.useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return null;
    return new Set(
      visible.nodes.filter((n) => n.symbol.includes(q) || (n.name ?? "").toUpperCase().includes(q)).map((n) => n.symbol)
    );
  }, [query, visible.nodes]);
  const adjacency = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const e of visible.edges) {
      if (!m.has(e.from)) m.set(e.from, /* @__PURE__ */ new Set());
      if (!m.has(e.to)) m.set(e.to, /* @__PURE__ */ new Set());
      m.get(e.from).add(e.to);
      m.get(e.to).add(e.from);
    }
    return m;
  }, [visible.edges]);
  const draw = reactExports.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75);
    bg.addColorStop(0, "#0d1018");
    bg.addColorStop(1, "#05060a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const { yaw, pitch, zoom } = camRef.current;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cxp = w / 2;
    const cyp = h / 2;
    const baseScale = Math.min(w, h) * 0.42 * zoom;
    const project = (p) => {
      const x1 = p.x * cy + p.z * sy;
      const z1 = -p.x * sy + p.z * cy;
      const y2 = p.y * cp - z1 * sp;
      const z2 = p.y * sp + z1 * cp;
      const k = FOV / (FOV + z2);
      return { sx: cxp + x1 * k * baseScale, sy: cyp + y2 * k * baseScale, depth: -z2, k };
    };
    const proj = /* @__PURE__ */ new Map();
    for (const n of visible.nodes) {
      const p = layout.get(n.symbol);
      if (p) proj.set(n.symbol, project(p));
    }
    const hover = hoverRef.current;
    const focusSet = hover ? /* @__PURE__ */ new Set([hover, ...adjacency.get(hover) ?? []]) : null;
    if (showEdges) {
      ctx.lineCap = "round";
      for (const e of visible.edges) {
        const a = proj.get(e.from);
        const b = proj.get(e.to);
        if (!a || !b) continue;
        const focused = focusSet ? focusSet.has(e.from) && focusSet.has(e.to) : null;
        if (focused === false) continue;
        const rgb = EDGE_COLOR[e.relationship] ?? EDGE_FALLBACK;
        const depthA = (a.k + b.k) / 2;
        const alpha = focused ? 0.85 : 0.05 + depthA * 0.1;
        ctx.strokeStyle = `rgba(${rgb},${alpha})`;
        ctx.lineWidth = focused ? 1.5 : 0.35 + (e.weight ?? 0.5) * 0.5;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
    }
    if (showCoMentions) {
      for (const c of visible.coMentions) {
        const a = proj.get(c.from);
        const b = proj.get(c.to);
        if (!a || !b) continue;
        if (focusSet && !(focusSet.has(c.from) && focusSet.has(c.to))) continue;
        ctx.strokeStyle = `rgba(251,191,36,${focusSet ? 0.5 : 0.1})`;
        ctx.lineWidth = Math.min(0.5 + c.count / 18, 2.2);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }
    }
    const items = [];
    for (const n of visible.nodes) {
      const p = proj.get(n.symbol);
      if (!p) continue;
      const m = magnitude.get(n.symbol) ?? 0;
      items.push({
        node: n,
        sx: p.sx,
        sy: p.sy,
        depth: p.depth,
        // Perspective scaling on the radius is what makes near stars read as
        // near rather than merely brighter.
        r: (R_MIN + m * (R_MAX - R_MIN)) * p.k * zoom,
        rgb: sectorRgb(n.topSectorId)
      });
    }
    items.sort((a, b) => a.depth - b.depth);
    projectedRef.current = items;
    for (const it of items) {
      const dimmed = focusSet && !focusSet.has(it.node.symbol) || matches && !matches.has(it.node.symbol);
      const isSelected = selected?.symbol === it.node.symbol;
      const alpha = dimmed ? 0.08 : 1;
      const glowR = Math.max(it.r * 3.2, 6);
      const g = ctx.createRadialGradient(it.sx, it.sy, 0, it.sx, it.sy, glowR);
      g.addColorStop(0, `rgba(${it.rgb},${0.55 * alpha})`);
      g.addColorStop(0.35, `rgba(${it.rgb},${0.16 * alpha})`);
      g.addColorStop(1, `rgba(${it.rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(it.sx, it.sy, glowR, 0, Math.PI * 2);
      ctx.fill();
      const core = ctx.createRadialGradient(
        it.sx - it.r * 0.3,
        it.sy - it.r * 0.3,
        it.r * 0.1,
        it.sx,
        it.sy,
        Math.max(it.r, 0.6)
      );
      core.addColorStop(0, `rgba(255,255,255,${0.95 * alpha})`);
      core.addColorStop(0.4, `rgba(${it.rgb},${alpha})`);
      core.addColorStop(1, `rgba(${it.rgb},${0.65 * alpha})`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(it.sx, it.sy, Math.max(it.r, 0.6), 0, Math.PI * 2);
      ctx.fill();
      const pct = quoteBySymbol.get(it.node.symbol)?.changePct ?? null;
      if (pct !== null && !dimmed && it.r > 2) {
        ctx.strokeStyle = pct >= 0 ? "rgba(52,211,153,0.9)" : "rgba(248,113,113,0.9)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(it.sx, it.sy, it.r + 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (isSelected) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(it.sx, it.sy, it.r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      const labelled = !dimmed && (it.r > 6 || hover === it.node.symbol || isSelected || (matches?.has(it.node.symbol) ?? false));
      if (labelled) {
        ctx.font = `${Math.max(9, Math.min(13, it.r * 0.9))}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(5,6,10,0.9)";
        ctx.strokeText(it.node.symbol, it.sx, it.sy + it.r + 11);
        ctx.fillStyle = "rgba(228,228,231,0.95)";
        ctx.fillText(it.node.symbol, it.sx, it.sy + it.r + 11);
      }
    }
  }, [
    visible,
    layout,
    magnitude,
    sectorRgb,
    quoteBySymbol,
    matches,
    adjacency,
    showEdges,
    showCoMentions,
    selected
  ]);
  const drawRef = reactExports.useRef(draw);
  reactExports.useEffect(() => {
    drawRef.current = draw;
  }, [draw]);
  const drawNow = reactExports.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    drawRef.current();
  }, []);
  const requestDraw = reactExports.useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current();
    });
  }, []);
  reactExports.useEffect(() => {
    drawNow();
  }, [draw, drawNow]);
  reactExports.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => drawNow());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [drawNow]);
  reactExports.useEffect(() => {
    if (!autoOrbit) return;
    let alive = true;
    let handle = 0;
    const step = () => {
      if (!alive) return;
      camRef.current.yaw += 22e-4;
      draw();
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => {
      alive = false;
      cancelAnimationFrame(handle);
    };
  }, [autoOrbit, draw]);
  reactExports.useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );
  const pick = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestD = Infinity;
    for (let i = projectedRef.current.length - 1; i >= 0; i--) {
      const it = projectedRef.current[i];
      const d = Math.hypot(it.sx - x, it.sy - y);
      if (d <= Math.max(it.r + 5, 7) && d < bestD) {
        bestD = d;
        best = it.node;
      }
    }
    return best;
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-sm text-zinc-400", children: "Building market graph…" });
  if (error)
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-8 text-sm text-rose-400", children: [
      "Couldn't load graph: ",
      error
    ] });
  if (!data || data.nodes.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-sm text-zinc-400", children: "No graph yet. Generate a few company value chains and their edges will appear here." });
  }
  const palette = sectorOptions.map((s) => ({ ...s, rgb: sectorRgb(s.id) }));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          placeholder: "Find ticker…",
          className: "w-36 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-zinc-800 focus:ring-sky-700"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1 text-xs text-zinc-400", children: [
        "Size",
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: sizeBy,
            onChange: (e) => setSizeBy(e.target.value),
            className: "rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800",
            children: Object.keys(SIZE_LABELS).map((k) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: k, children: SIZE_LABELS[k] }, k))
          }
        )
      ] }),
      sizeBy === "marketCap" && effectiveSizeBy !== "marketCap" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-amber-400/80", children: "using connections — market caps not cached yet" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1 text-xs text-zinc-400", children: [
        "Sector",
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: sectorFilter,
            onChange: (e) => setSectorFilter(e.target.value),
            className: "max-w-[13rem] rounded bg-zinc-900 px-1 py-1 text-xs text-zinc-200 ring-1 ring-zinc-800",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: "all", children: [
                "All (",
                data.nodes.length,
                ")"
              ] }),
              sectorOptions.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: s.id, children: [
                s.name,
                " (",
                s.count,
                ")"
              ] }, s.id))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1 text-xs text-zinc-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            checked: showEdges,
            onChange: (e) => setShowEdges(e.target.checked)
          }
        ),
        "Links"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1 text-xs text-zinc-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            checked: showCoMentions,
            onChange: (e) => setShowCoMentions(e.target.checked)
          }
        ),
        "Co-mentions"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1 text-xs text-zinc-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            checked: autoOrbit,
            onChange: (e) => setAutoOrbit(e.target.checked)
          }
        ),
        "Orbit"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => {
            camRef.current = { yaw: 0.5, pitch: -0.25, zoom: 1 };
            drawNow();
          },
          className: "rounded bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800",
          children: "reset view"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-auto text-xs text-zinc-500", children: [
        visible.nodes.length,
        " nodes · ",
        visible.edges.length,
        " links"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative min-h-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "canvas",
        {
          ref: canvasRef,
          className: "absolute inset-0 h-full w-full",
          style: { cursor: dragRef.current ? "grabbing" : "grab", display: "block" },
          onPointerDown: (e) => {
            const { yaw, pitch } = camRef.current;
            dragRef.current = { x: e.clientX, y: e.clientY, yaw, pitch };
            e.currentTarget.setPointerCapture(e.pointerId);
          },
          onPointerMove: (e) => {
            const d = dragRef.current;
            if (d) {
              camRef.current.yaw = d.yaw + (e.clientX - d.x) * 6e-3;
              camRef.current.pitch = Math.max(
                -Math.PI / 2 + 0.05,
                Math.min(Math.PI / 2 - 0.05, d.pitch + (e.clientY - d.y) * 6e-3)
              );
              requestDraw();
              return;
            }
            const hit = pick(e.clientX, e.clientY);
            const next = hit?.symbol ?? null;
            if (next !== hoverRef.current) {
              hoverRef.current = next;
              requestDraw();
            }
          },
          onPointerUp: (e) => {
            const d = dragRef.current;
            dragRef.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) {
              setSelected(pick(e.clientX, e.clientY));
            }
            requestDraw();
          },
          onPointerLeave: () => {
            if (hoverRef.current !== null) {
              hoverRef.current = null;
              requestDraw();
            }
          },
          onWheel: (e) => {
            camRef.current.zoom = Math.max(
              0.35,
              Math.min(6, camRef.current.zoom * (e.deltaY > 0 ? 1 / 1.12 : 1.12))
            );
            requestDraw();
          }
        }
      ),
      selected && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute right-4 top-4 w-64 rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 shadow-xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold text-zinc-100", children: selected.symbol }),
            selected.name && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-zinc-400", children: selected.name })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setSelected(null),
              className: "text-zinc-500 hover:text-zinc-300",
              "aria-label": "Close",
              children: "✕"
            }
          )
        ] }),
        selected.topSectorName && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] text-zinc-300 ring-1 ring-zinc-700", children: selected.topSectorName }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("dl", { className: "mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "text-zinc-500", children: "Links" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-zinc-300", children: degree.get(selected.symbol) ?? 0 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "text-zinc-500", children: "Articles" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("dd", { className: "text-zinc-300", children: selected.newsCount }),
          selected.marketCap ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "text-zinc-500", children: "Market cap" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("dd", { className: "text-zinc-300", children: [
              "$",
              (selected.marketCap / 1e9).toFixed(1),
              "B"
            ] })
          ] }) : null,
          (() => {
            const q = quoteBySymbol.get(selected.symbol);
            if (!q || q.price === null) return null;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("dt", { className: "text-zinc-500", children: "Price" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "dd",
                {
                  className: (q.changePct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
                  children: [
                    "$",
                    q.price.toFixed(2),
                    q.changePct !== null ? ` (${q.changePct.toFixed(2)}%)` : ""
                  ]
                }
              )
            ] });
          })()
        ] }),
        selected.blurb && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[11px] leading-snug text-zinc-400", children: selected.blurb }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => onSelectSymbol?.(selected.symbol),
            disabled: !onSelectSymbol,
            className: "mt-3 w-full rounded bg-emerald-500/15 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40",
            children: [
              "Open ",
              selected.symbol
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-3 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500", children: [
      palette.slice(0, 8).map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "inline-block h-2 w-2 rounded-full",
            style: { background: `rgb(${s.rgb})` }
          }
        ),
        s.name
      ] }, s.id)),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto", children: "drag to rotate · scroll to zoom · click a star" })
    ] })
  ] });
}
const CHAIN = graph;
function UnifiedValueChainCard({
  symbol,
  companyName,
  tickers,
  onOpenTicker,
  onOpenCitation
}) {
  const upper = symbol.toUpperCase();
  const [row, setRow] = reactExports.useState(void 0);
  const [overrides, setOverrides] = reactExports.useState([]);
  const [nodeOverrides, setNodeOverrides] = reactExports.useState([]);
  const [working, setWorking] = reactExports.useState(false);
  const reload = reactExports.useCallback(() => {
    return window.api.stocks.getCompanyChain(upper).then((r) => setRow(r)).catch(() => setRow(null));
  }, [upper]);
  const reloadOverrides = reactExports.useCallback(() => {
    return window.api.graph.listOverrides().then((list) => {
      setOverrides(list.filter((o) => {
        const from = o.fromSymbol.toUpperCase();
        const to = o.toSymbol.toUpperCase();
        return from === upper || to === upper;
      }));
    }).catch(() => setOverrides([]));
  }, [upper]);
  const reloadNodeOverrides = reactExports.useCallback(() => {
    return window.api.graph.listNodeOverrides().then(setNodeOverrides).catch(() => setNodeOverrides([]));
  }, []);
  reactExports.useEffect(() => {
    setRow(void 0);
    void reload();
    void reloadOverrides();
    void reloadNodeOverrides();
  }, [reload, reloadOverrides, reloadNodeOverrides]);
  reactExports.useEffect(() => {
    return window.api.stocks.onCompanyChainUpdated((updated) => {
      if (updated.toUpperCase() !== upper) return;
      void reload();
    });
  }, [reload, upper]);
  reactExports.useEffect(() => {
    return window.api.graph.onUpdated(() => {
      void reloadOverrides();
      void reloadNodeOverrides();
    });
  }, [reloadOverrides, reloadNodeOverrides]);
  const onGenerate = async (force = false) => {
    setWorking(true);
    try {
      await window.api.stocks.generateCompanyChain(upper, companyName, force);
      await reload();
    } finally {
      setWorking(false);
    }
  };
  const prepared = reactExports.useMemo(() => {
    if (row?.graph && row.graph.edges.length > 0) {
      return prepareFromGenerated(row, tickers, overrides, nodeOverrides);
    }
    return prepareFromCurated(upper, tickers);
  }, [row, tickers, upper, overrides, nodeOverrides]);
  if (row === void 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsibleSection, { title: "Value chain", meta: "Checking…", defaultOpen: true, gradient: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-500", children: "Checking for a cached value chain…" }) });
  }
  if (!prepared) {
    const coldStatus = row?.status ?? null;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      CollapsibleSection,
      {
        title: "Value chain",
        meta: "Industry subgraph, on demand",
        defaultOpen: true,
        gradient: true,
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          ColdState,
          {
            status: coldStatus,
            working: working || coldStatus === "pending",
            sourceContext: row?.sourceContext ?? null,
            onGenerate: () => onGenerate(false)
          }
        )
      }
    );
  }
  const presentCategories = [];
  if (prepared.customers.length > 0) presentCategories.push("customer");
  if (prepared.suppliers.length > 0) presentCategories.push("supplier");
  if (prepared.competitors.length > 0) presentCategories.push("competitor");
  if (prepared.partners.length > 0) presentCategories.push("partner");
  const { boxShadow, glowBackground } = categoryGlow(presentCategories);
  const trioCount = [
    prepared.suppliers.length > 0,
    prepared.competitors.length > 0,
    prepared.customers.length > 0
  ].filter(Boolean).length;
  const gridColsClass = trioCount === 3 ? "md:grid-cols-3" : trioCount === 2 ? "md:grid-cols-2" : "";
  const linkCount = prepared.customers.length + prepared.suppliers.length + prepared.competitors.length + prepared.partners.length;
  const sourceLabel = prepared.source === "claude" ? "Claude" : prepared.source === "ollama" ? "Ollama" : "Curated";
  const meta = /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full bg-surface-2 text-zinc-300 ring-1 ring-inset ring-edge/80 normal-case tracking-[0.22em]", children: prepared.focusStageLabel }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "tabular-nums text-zinc-500", children: [
      linkCount,
      " links"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: `text-[9px] font-semibold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full ring-1 ring-inset ${prepared.source === "curated" ? "bg-sky-500/10 text-sky-300 ring-sky-500/30" : "bg-violet-500/10 text-violet-300 ring-violet-500/30"}`,
        title: prepared.source === "curated" ? "From the hand-curated supply-chain graph" : `Generated by ${sourceLabel}${prepared.sourceContext ? " · " + prepared.sourceContext : ""}`,
        children: sourceLabel
      }
    )
  ] });
  const buttonLabel = working ? prepared.source === "curated" ? "Generating…" : "Regenerating…" : prepared.source === "curated" ? "Generate" : "Regenerate";
  const buttonTitle = prepared.source === "curated" ? "Generate a Claude-grounded chain for this ticker. Takes 30–60s and replaces the curated baseline." : "Re-run the value-chain generator with fresh context. Takes 30–60s.";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    CollapsibleSection,
    {
      title: "Value chain",
      meta,
      defaultOpen: true,
      gradient: true,
      backdropStyle: { backgroundImage: glowBackground, boxShadow },
      children: [
        prepared.blurb && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12.5px] leading-snug text-zinc-300 mb-4 max-w-[720px]", children: prepared.blurb }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => void onGenerate(true),
              disabled: working,
              className: `text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full ring-1 ring-inset ${working ? "bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait" : "bg-zinc-800/70 text-zinc-300 ring-zinc-700 hover:bg-zinc-700"}`,
              title: buttonTitle,
              children: buttonLabel
            }
          ),
          prepared.generatedAt && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500", children: [
            "Generated ",
            new Date(prepared.generatedAt).toLocaleDateString()
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `grid grid-cols-1 gap-6 items-start ${gridColsClass}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            TransactionCluster,
            {
              category: "supplier",
              items: prepared.suppliers,
              onPick: onOpenTicker,
              onOpenCitation
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            TransactionCluster,
            {
              category: "competitor",
              items: prepared.competitors,
              onPick: onOpenTicker,
              onOpenCitation
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            TransactionCluster,
            {
              category: "customer",
              items: prepared.customers,
              onPick: onOpenTicker,
              onOpenCitation
            }
          )
        ] }),
        prepared.partners.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6 pt-6 border-t border-edge/30", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          TransactionCluster,
          {
            category: "partner",
            items: prepared.partners,
            onPick: onOpenTicker,
            onOpenCitation
          }
        ) })
      ]
    }
  );
}
function prepareFromCurated(upper, tickers) {
  const stageLabelById = /* @__PURE__ */ new Map();
  for (const s of CHAIN.stages) stageLabelById.set(s.id, s.label);
  const nodeBySymbol = /* @__PURE__ */ new Map();
  for (const n of CHAIN.nodes) nodeBySymbol.set(n.symbol, n);
  const nameBySymbol = /* @__PURE__ */ new Map();
  for (const t of tickers) nameBySymbol.set(t.symbol.toUpperCase(), t.companyName);
  const node = nodeBySymbol.get(upper) ?? null;
  if (!node) return null;
  const toCounterparty = (sym, note) => {
    const n = nodeBySymbol.get(sym);
    const stage = n?.stage ?? "";
    return {
      symbol: sym,
      stage,
      stageLabel: stage ? stageLabelById.get(stage) ?? stage : "—",
      companyName: nameBySymbol.get(sym) ?? n?.name ?? sym,
      note
    };
  };
  const customers = [];
  const suppliers = [];
  for (const e of CHAIN.edges) {
    if (e.from === upper) customers.push(toCounterparty(e.to, e.note ?? null));
    if (e.to === upper) suppliers.push(toCounterparty(e.from, e.note ?? null));
  }
  const competitorSet = /* @__PURE__ */ new Set();
  for (const pair of CHAIN.competitors ?? []) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    if (a === upper) competitorSet.add(b);
    else if (b === upper) competitorSet.add(a);
  }
  const competitors2 = [...competitorSet].map((s) => toCounterparty(s, null));
  if (customers.length === 0 && suppliers.length === 0 && competitors2.length === 0) {
    return null;
  }
  return {
    source: "curated",
    focusStageLabel: stageLabelById.get(node.stage) ?? node.stage,
    blurb: node.blurb ?? null,
    suppliers,
    customers,
    competitors: competitors2,
    // Static supplyChainGraph.json carries no partner edges — only
    // customer/supplier directional + competitor pairs. Partners only
    // exist on generated chains (handled in prepareFromGenerated below).
    partners: [],
    sourceContext: null,
    generatedAt: null
  };
}
function prepareFromGenerated(row, tickers, crossChainOverrides, nodeOverrides, upper) {
  const graph2 = row.graph;
  if (!graph2) return null;
  const focus = graph2.focus.toUpperCase();
  const stageLabelById = /* @__PURE__ */ new Map();
  for (const s of graph2.stages) stageLabelById.set(s.id, s.label);
  for (const s of CHAIN.stages) {
    if (!stageLabelById.has(s.id)) stageLabelById.set(s.id, s.label);
  }
  const nodeBySymbol = /* @__PURE__ */ new Map();
  for (const sn of CHAIN.nodes) {
    nodeBySymbol.set(sn.symbol.toUpperCase(), {
      stage: sn.stage,
      name: sn.name ?? null,
      blurb: sn.blurb ?? null
    });
  }
  for (const o of nodeOverrides) {
    nodeBySymbol.set(o.symbol.toUpperCase(), {
      stage: o.stage,
      name: o.name,
      blurb: o.blurb
    });
  }
  for (const n of graph2.nodes) {
    nodeBySymbol.set(n.symbol.toUpperCase(), {
      stage: n.stage,
      name: n.name,
      blurb: n.blurb ?? null
    });
  }
  const nameBySymbol = /* @__PURE__ */ new Map();
  for (const t of tickers) nameBySymbol.set(t.symbol.toUpperCase(), t.companyName);
  const focusNode = nodeBySymbol.get(focus);
  if (!focusNode) return null;
  const toCounterparty = (sym, note, source2, citations) => {
    const n = nodeBySymbol.get(sym);
    const stage = n?.stage ?? "";
    return {
      symbol: sym,
      stage,
      stageLabel: stage ? stageLabelById.get(stage) ?? humanize(stage) : "—",
      companyName: nameBySymbol.get(sym) ?? n?.name ?? sym,
      note,
      source: source2,
      citations
    };
  };
  const suppliers = [];
  const customers = [];
  const competitors2 = [];
  const partners = [];
  const seenSuppliers = /* @__PURE__ */ new Set();
  const seenCustomers = /* @__PURE__ */ new Set();
  const seenCompetitors = /* @__PURE__ */ new Set();
  const seenPartners = /* @__PURE__ */ new Set();
  for (const e of graph2.edges) {
    const from = e.from.toUpperCase();
    const to = e.to.toUpperCase();
    const rel = e.relationship;
    const note = e.note ?? null;
    const source2 = e.source ?? null;
    const citations = e.citations && e.citations.length > 0 ? e.citations : e.citation ? [e.citation] : [];
    if (rel === "competitor") {
      if (from === focus && !seenCompetitors.has(to)) {
        competitors2.push(toCounterparty(to, note, source2, citations));
        seenCompetitors.add(to);
      } else if (to === focus && !seenCompetitors.has(from)) {
        competitors2.push(toCounterparty(from, note, source2, citations));
        seenCompetitors.add(from);
      }
      continue;
    }
    if (rel === "supplier") {
      if (to === focus && !seenSuppliers.has(from)) {
        suppliers.push(toCounterparty(from, note, source2, citations));
        seenSuppliers.add(from);
      } else if (from === focus && !seenCustomers.has(to)) {
        customers.push(toCounterparty(to, note, source2, citations));
        seenCustomers.add(to);
      }
      continue;
    }
    if (rel === "customer") {
      if (from === focus && !seenSuppliers.has(to)) {
        suppliers.push(toCounterparty(to, note, source2, citations));
        seenSuppliers.add(to);
      } else if (to === focus && !seenCustomers.has(from)) {
        customers.push(toCounterparty(from, note, source2, citations));
        seenCustomers.add(from);
      }
      continue;
    }
    if (rel === "partner") {
      const counter = from === focus ? to : from;
      if (counter && counter !== focus && !seenPartners.has(counter)) {
        partners.push(toCounterparty(counter, note, source2, citations));
        seenPartners.add(counter);
      }
    }
  }
  for (const o of crossChainOverrides) {
    const sources = (o.source ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (sources.includes(`chain_gen_${focus}`)) continue;
    const from = o.fromSymbol.toUpperCase();
    const to = o.toSymbol.toUpperCase();
    if (from !== focus && to !== focus) continue;
    const counterparty = from === focus ? to : from;
    if (counterparty === focus) continue;
    const note = o.note ?? null;
    const cites = o.citations && o.citations.length > 0 ? o.citations : o.citation ? [o.citation] : [];
    const inferredSource = cites[0] ? cites[0].kind === "filing" ? "filings" : cites[0].kind === "article" ? "news" : "model" : null;
    if (o.relationship === "competitor") {
      if (seenCompetitors.has(counterparty)) continue;
      competitors2.push(toCounterparty(counterparty, note, inferredSource, cites));
      seenCompetitors.add(counterparty);
      continue;
    }
    if (o.relationship === "supplier") {
      const role = to === focus ? "supplier" : "customer";
      if (role === "supplier") {
        if (seenSuppliers.has(counterparty)) continue;
        suppliers.push(toCounterparty(counterparty, note, inferredSource, cites));
        seenSuppliers.add(counterparty);
      } else {
        if (seenCustomers.has(counterparty)) continue;
        customers.push(toCounterparty(counterparty, note, inferredSource, cites));
        seenCustomers.add(counterparty);
      }
      continue;
    }
    if (o.relationship === "customer") {
      const role = from === focus ? "supplier" : "customer";
      if (role === "supplier") {
        if (seenSuppliers.has(counterparty)) continue;
        suppliers.push(toCounterparty(counterparty, note, inferredSource, cites));
        seenSuppliers.add(counterparty);
      } else {
        if (seenCustomers.has(counterparty)) continue;
        customers.push(toCounterparty(counterparty, note, inferredSource, cites));
        seenCustomers.add(counterparty);
      }
      continue;
    }
    if (o.relationship === "partner") {
      if (seenPartners.has(counterparty)) continue;
      partners.push(toCounterparty(counterparty, note, inferredSource, cites));
      seenPartners.add(counterparty);
    }
  }
  if (suppliers.length === 0 && customers.length === 0 && competitors2.length === 0 && partners.length === 0) {
    return null;
  }
  const sourceContext = row.sourceContext ?? "";
  const source = /ollama/i.test(sourceContext) ? "ollama" : "claude";
  return {
    source,
    focusStageLabel: stageLabelById.get(focusNode.stage) ?? humanize(focusNode.stage),
    blurb: focusNode.blurb ?? null,
    suppliers,
    customers,
    competitors: competitors2,
    partners,
    sourceContext: sourceContext || null,
    generatedAt: row.generatedAt ?? null
  };
}
function humanize(stageId) {
  return stageId.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function ColdState({
  status,
  working,
  sourceContext,
  onGenerate
}) {
  const label = status === "offline" || status === "error" ? "Previous attempt didn’t return a usable chain. Retry — it’ll regenerate with fresh context." : "Generate an AI-authored value chain for this ticker.";
  const hint = status === "pending" ? "Generation in progress — hang tight." : "Pulls the company profile, latest 10-K Item 1, and recent news, then asks the configured AI to structure an industry-appropriate subgraph. First run takes 30–60 s.";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12.5px] text-zinc-300 leading-snug", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 leading-snug max-w-2xl", children: hint }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: onGenerate,
        disabled: working,
        className: `text-[10.5px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ring-1 ring-inset transition-colors ${working ? "bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait" : "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40 hover:bg-emerald-500/25"}`,
        children: working ? "Generating…" : "Generate value chain"
      }
    ),
    sourceContext && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-zinc-600", children: [
      "Last context: ",
      sourceContext
    ] })
  ] });
}
const SECTION_TONE = {
  headlines: { glyph: "◆", tone: "text-emerald-300", tint: "border-emerald-500/30" },
  earnings: { glyph: "$", tone: "text-amber-300", tint: "border-amber-500/30" },
  filings: { glyph: "§", tone: "text-sky-300", tint: "border-sky-500/30" },
  iv: { glyph: "σ", tone: "text-violet-300", tint: "border-violet-500/30" }
};
function sectionStyle(kind) {
  return SECTION_TONE[kind] ?? { glyph: "·", tone: "text-zinc-300", tint: "border-zinc-600/40" };
}
function relativeAge(generatedAt) {
  const diffMin = Math.round((Date.now() - generatedAt) / 6e4);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
function formatCiteDate(ms) {
  if (!ms || !Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
}
function CitationChip({
  citation,
  article,
  quote,
  onOpenArticle,
  onOpenSymbol
}) {
  const handleClick = () => {
    if (citation.type === "article") {
      const id = Number(citation.ref);
      if (Number.isFinite(id)) onOpenArticle(id);
    } else if (citation.type === "symbol") {
      onOpenSymbol(citation.ref);
    } else if (citation.type === "filing" && citation.url) {
      window.open(citation.url, "_blank", "noopener");
    }
  };
  if (citation.type === "symbol") {
    const change = quote?.change ?? null;
    const tone = change === null || change === 0 ? "border-zinc-600/60 bg-zinc-800/60 text-zinc-300 hover:border-zinc-400" : change > 0 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:brightness-125" : "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:brightness-125";
    const pctStr = quote?.changePct !== null && quote?.changePct !== void 0 ? ` ${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%` : "";
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: handleClick,
        title: `Open ${citation.ref} detail${pctStr ? ` ·${pctStr}` : ""}`,
        className: `shrink-0 inline-flex items-center gap-1 px-1.5 py-[1px] rounded-md border text-[9.5px] font-semibold uppercase tracking-[0.16em] transition cursor-pointer ${tone}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: citation.label ?? citation.ref }),
          pctStr && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-bold", children: pctStr.trim() })
        ]
      }
    );
  }
  if (citation.type === "article") {
    const dateStr = article ? formatCiteDate(article.publishedAt) : "";
    const sourceStr = article?.feedTitle ?? citation.label ?? "News";
    const label = dateStr ? `${sourceStr} · ${dateStr}` : sourceStr;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: handleClick,
        title: article ? `${article.title}${dateStr ? ` (${dateStr})` : ""} — click to open` : `Open article #${citation.ref}`,
        className: "shrink-0 inline-flex items-start gap-1 px-2 py-[3px] rounded-md border text-[10.5px] font-semibold uppercase tracking-[0.12em] max-w-full whitespace-normal break-words leading-[1.35] border-sky-500/40 bg-sky-500/10 text-sky-200 cursor-pointer hover:brightness-125 hover:underline underline-offset-2 text-left transition",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 min-w-0", children: label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", className: "shrink-0 text-[9px] opacity-80 mt-[1px]", children: "↗" })
        ]
      }
    );
  }
  const filingHasUrl = !!citation.url;
  const filingLabel = citation.label ?? "10-K";
  if (filingHasUrl) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: handleClick,
        title: citation.url ?? `Filing ${citation.ref}`,
        className: "shrink-0 inline-flex items-start gap-1 px-2 py-[3px] rounded-md border text-[10.5px] font-semibold uppercase tracking-[0.12em] max-w-full whitespace-normal break-words leading-[1.35] border-emerald-500/40 bg-emerald-500/10 text-emerald-200 cursor-pointer hover:brightness-125 hover:underline underline-offset-2 text-left transition",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 min-w-0", children: filingLabel }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { "aria-hidden": "true", className: "shrink-0 text-[9px] opacity-80 mt-[1px]", children: "↗" })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      title: `Filing ${citation.ref}`,
      className: "shrink-0 inline-flex items-center px-2 py-[3px] rounded-md border text-[10.5px] font-semibold uppercase tracking-[0.12em] border-emerald-500/40 bg-emerald-500/10 text-emerald-200/70",
      children: filingLabel
    }
  );
}
function Bullet({
  bullet,
  articleByRef,
  quoteBySymbol,
  onOpenArticle,
  onOpenSymbol
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2.5 leading-relaxed", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600 select-none mt-[2px]", children: "·" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-zinc-200", children: bullet.text }),
      bullet.citations && bullet.citations.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 flex flex-wrap gap-1", children: bullet.citations.map((c, i) => {
        const article = c.type === "article" ? articleByRef.get(Number(c.ref)) ?? null : null;
        const quote = c.type === "symbol" ? quoteBySymbol.get(c.ref.toUpperCase()) ?? null : null;
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          CitationChip,
          {
            citation: c,
            article,
            quote,
            onOpenArticle,
            onOpenSymbol
          },
          `${c.type}-${c.ref}-${i}`
        );
      }) })
    ] })
  ] });
}
function Section({
  section,
  articleByRef,
  quoteBySymbol,
  onOpenArticle,
  onOpenSymbol
}) {
  const style = sectionStyle(section.kind);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: `pl-3 border-l ${style.tint}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[12px] leading-none ${style.tone}`, children: style.glyph }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: `text-[10px] font-semibold uppercase tracking-[0.24em] ${style.tone}`, children: section.title })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: section.bullets.map((b, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      Bullet,
      {
        bullet: b,
        articleByRef,
        quoteBySymbol,
        onOpenArticle,
        onOpenSymbol
      },
      i
    )) })
  ] });
}
function MorningBrief({ onOpenArticle, onOpenSymbol }) {
  const [row, setRow] = reactExports.useState(void 0);
  const [refreshing, setRefreshing] = reactExports.useState(false);
  const [collapsed, setCollapsed] = useCollapsedSection("morningBrief", false);
  const [quotes, setQuotes] = reactExports.useState([]);
  const [articleCache, setArticleCache] = reactExports.useState(() => /* @__PURE__ */ new Map());
  reactExports.useEffect(() => {
    let cancelled = false;
    void window.api.stocks.getQuotes().then((q) => {
      if (!cancelled) setQuotes(q);
    });
    const unsub = window.api.stocks.onUpdated((q) => {
      if (!cancelled) setQuotes(q);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  const autoCollapsedForRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!row || row.generatedAt === 0) return;
    if (autoCollapsedForRef.current === row.generatedAt) return;
    autoCollapsedForRef.current = row.generatedAt;
    const ageMs = Date.now() - row.generatedAt;
    if (ageMs > 6 * 60 * 60 * 1e3) setCollapsed(true);
  }, [row, setCollapsed]);
  reactExports.useEffect(() => {
    let cancelled = false;
    void window.api.brief.getCurrent().then((r) => {
      if (!cancelled) setRow(r);
    }).catch(() => {
      if (!cancelled) setRow(null);
    });
    const unsub = window.api.brief.onUpdated(() => {
      void window.api.brief.getCurrent().then((r) => {
        if (!cancelled) setRow(r);
      }).catch(() => {
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  reactExports.useEffect(() => {
    if (!row) return;
    const ids = /* @__PURE__ */ new Set();
    for (const section of row.payload.sections) {
      for (const bullet of section.bullets) {
        for (const c of bullet.citations ?? []) {
          if (c.type !== "article") continue;
          const id = Number(c.ref);
          if (!Number.isFinite(id)) continue;
          if (articleCache.has(id)) continue;
          ids.add(id);
        }
      }
    }
    if (ids.size === 0) return;
    let cancelled = false;
    void Promise.all(
      [...ids].map(
        (id) => window.api.articles.getById(id).then((row2) => ({ id, row: row2 }))
      )
    ).then((results) => {
      if (cancelled) return;
      setArticleCache((prev) => {
        const next = new Map(prev);
        for (const { id, row: row2 } of results) {
          if (row2) next.set(id, row2);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [row]);
  const quoteBySymbol = reactExports.useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    for (const q of quotes) m.set(q.symbol.toUpperCase(), q);
    return m;
  }, [quotes]);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await window.api.brief.refresh();
      setTimeout(() => setRefreshing(false), 3e4);
    } catch {
      setRefreshing(false);
    }
  };
  if (row === void 0) return null;
  if (row === null) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-6 mt-3 mb-1 rounded-xl border border-edge/60 bg-surface-1/60 px-4 py-3 text-[12px] text-zinc-400", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-emerald-400", children: "◆" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold uppercase tracking-[0.22em] text-[10px]", children: "Morning Brief" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600", children: "·" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Generating your first watchlist digest. Comes online a few minutes after launch." })
    ] }) });
  }
  const { payload, generatedAt } = row;
  const totalBullets = payload.sections.reduce((acc, s) => acc + s.bullets.length, 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 mt-3 mb-2 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-surface-1 to-surface-1 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-4 pt-3 pb-2 flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-400", children: "◆ Morning Brief" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: "·" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500", children: relativeAge(generatedAt) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: "·" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 tabular-nums", children: [
            payload.inputs.watchlistSize,
            " tickers · ",
            totalBullets,
            " bullets"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[14.5px] font-semibold text-zinc-50 leading-snug max-w-[820px]", children: payload.headline })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 shrink-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleRefresh,
            disabled: refreshing,
            title: "Regenerate the brief now (uses one Claude call)",
            className: `text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full ring-1 ring-inset ${refreshing ? "bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait" : "bg-zinc-800/70 text-zinc-300 ring-zinc-700 hover:bg-zinc-700"}`,
            children: refreshing ? "Refreshing…" : "Refresh"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setCollapsed((c) => !c),
            title: collapsed ? "Expand" : "Collapse",
            "aria-expanded": !collapsed,
            className: "flex items-center text-zinc-500 hover:text-zinc-300 px-1.5 py-1",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(CollapseChevron, { open: !collapsed })
          }
        )
      ] })
    ] }),
    !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pb-4 pt-1 space-y-4", children: payload.sections.map((s, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      Section,
      {
        section: s,
        articleByRef: articleCache,
        quoteBySymbol,
        onOpenArticle,
        onOpenSymbol
      },
      `${s.kind}-${i}`
    )) })
  ] });
}
const GROUP_ORDER = ["rates", "inflation", "labor", "volatility"];
const GROUP_LABEL = {
  rates: "Rates",
  inflation: "Inflation",
  labor: "Labor",
  volatility: "Volatility"
};
const GROUP_DOT = {
  rates: "bg-sky-400",
  inflation: "bg-amber-400",
  labor: "bg-emerald-400",
  volatility: "bg-violet-400"
};
function formatLatest(value, format) {
  if (value === null || !Number.isFinite(value)) return "—";
  switch (format) {
    case "percent":
      return `${value.toFixed(2)}%`;
    case "percent-change-yoy":
      return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
    case "index":
      return value.toFixed(2);
    case "count-thousands":
      return `${(value / 1e3).toFixed(0)}K`;
  }
}
function formatDelta(delta, format) {
  if (delta === null || !Number.isFinite(delta)) return "";
  const sign = delta >= 0 ? "+" : "";
  switch (format) {
    case "percent":
    case "percent-change-yoy":
      return `${sign}${delta.toFixed(2)}pp`;
    case "index":
      return `${sign}${delta.toFixed(2)}`;
    case "count-thousands":
      return `${sign}${(delta / 1e3).toFixed(1)}K`;
  }
}
function deltaTone(delta, preferredDirection) {
  if (delta === null || delta === 0) return "text-zinc-500";
  if (preferredDirection === "either") return "text-zinc-400";
  const isGood = preferredDirection === "lower" && delta < 0 || preferredDirection === "higher" && delta > 0;
  return isGood ? "text-emerald-400" : "text-red-400";
}
function Sparkline({ points }) {
  const real = points.filter((p) => p.value !== null);
  if (real.length < 2) return null;
  const width = 130;
  const height = 32;
  const values = real.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (real.length - 1);
  const points2 = real.map((p, i) => ({
    x: i * stepX,
    y: height - (p.value - min) / range * height
  }));
  const path = points2.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `M${points2[0].x.toFixed(1)} ${height} ` + points2.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + ` L${points2[points2.length - 1].x.toFixed(1)} ${height} Z`;
  const lastTwo = values.slice(-2);
  const isUp = lastTwo[1] > lastTwo[0];
  const stroke = isUp ? "rgba(74,222,128,0.85)" : "rgba(248,113,113,0.85)";
  const fill = isUp ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: areaPath, fill }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: path, fill: "none", stroke, strokeWidth: 1.4, strokeLinejoin: "round" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "circle",
      {
        cx: width,
        cy: points2[points2.length - 1].y,
        r: 2,
        fill: isUp ? "rgb(74,222,128)" : "rgb(248,113,113)"
      }
    )
  ] });
}
function Tile({ snap }) {
  const value = formatLatest(snap.latestValue, snap.format);
  const delta = formatDelta(snap.delta, snap.format);
  const tone = deltaTone(snap.delta, snap.preferredDirection);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "flex flex-col px-3.5 py-2.5 rounded-lg border border-edge/60 bg-surface-1/70 hover:bg-surface-1 transition-colors w-[260px] flex-shrink-0",
      title: snap.units ? `${snap.label} · ${snap.units}${snap.latestDate ? ` · as of ${snap.latestDate}` : ""}` : snap.label,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 mb-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: `shrink-0 w-1.5 h-1.5 rounded-full ${GROUP_DOT[snap.group]}`,
              "aria-hidden": "true"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9.5px] font-semibold uppercase tracking-[0.18em] text-zinc-400 whitespace-nowrap", children: snap.label })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[20px] font-semibold tabular-nums text-zinc-100 leading-none", children: value }),
            delta && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[10.5px] tabular-nums mt-1 ${tone}`, children: delta })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "shrink-0 self-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Sparkline, { points: snap.series }) })
        ] })
      ]
    }
  );
}
function MacroPanel() {
  const [snapshot, setSnapshot] = reactExports.useState(null);
  const [refreshing, setRefreshing] = reactExports.useState(false);
  const [collapsed, setCollapsed] = useCollapsedSection("macroPanel", false);
  reactExports.useEffect(() => {
    let cancelled = false;
    void window.api.fred.getSnapshot().then((s) => {
      if (!cancelled) setSnapshot(s);
    }).catch(() => {
      if (!cancelled) setSnapshot([]);
    });
    const unsub = window.api.fred.onUpdated(() => {
      void window.api.fred.getSnapshot().then((s) => {
        if (!cancelled) setSnapshot(s);
      }).catch(() => {
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);
  const orderedTiles = reactExports.useMemo(() => {
    if (!snapshot) return [];
    const out = [];
    for (const g of GROUP_ORDER) {
      for (const s of snapshot) if (s.group === g) out.push(s);
    }
    return out;
  }, [snapshot]);
  if (!snapshot) return null;
  const hasAnyData = snapshot.some((s) => s.latestValue !== null);
  if (!hasAnyData) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-6 mt-3 rounded-xl border border-edge/60 bg-surface-1/60 px-4 py-3 text-[12px] text-zinc-400", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400", children: "σ" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold uppercase tracking-[0.22em] text-[10px]", children: "Macro Panel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600", children: "·" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Add a free FRED API key in Settings to enable rates, inflation, and labor indicators." })
    ] }) });
  }
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await window.api.fred.refresh();
      setTimeout(() => setRefreshing(false), 3e4);
    } catch {
      setRefreshing(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 mt-3 mb-2 rounded-xl border border-edge/60 bg-surface-1/40", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-4 pt-3 pb-2 flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 flex-wrap", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300", children: "σ Macro Panel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: "·" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500", children: "via FRED" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-600", children: "·" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2.5", children: GROUP_ORDER.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: `w-1.5 h-1.5 rounded-full ${GROUP_DOT[g]}`,
              "aria-hidden": "true"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] uppercase tracking-[0.18em] text-zinc-500", children: GROUP_LABEL[g] })
        ] }, g)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 shrink-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleRefresh,
            disabled: refreshing,
            title: "Refresh now (auto-refreshes every 6h)",
            className: `text-[9.5px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full ring-1 ring-inset ${refreshing ? "bg-zinc-800 text-zinc-500 ring-zinc-700 cursor-wait" : "bg-zinc-800/70 text-zinc-300 ring-zinc-700 hover:bg-zinc-700"}`,
            children: refreshing ? "Refreshing…" : "Refresh"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setCollapsed((c) => !c),
            title: collapsed ? "Expand panel" : "Collapse panel",
            "aria-expanded": !collapsed,
            className: "flex items-center text-zinc-500 hover:text-zinc-300 px-1.5 py-1",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(CollapseChevron, { open: !collapsed })
          }
        )
      ] })
    ] }),
    !collapsed && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pb-3 pt-1 flex flex-wrap gap-2", children: orderedTiles.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(Tile, { snap: s }, s.id)) })
  ] });
}
const FORM_BUCKET = {
  "8-K": { tone: "bg-sky-500/15 text-sky-200 ring-sky-500/40", label: "8-K" },
  "8-K/A": { tone: "bg-sky-500/15 text-sky-200 ring-sky-500/40", label: "8-K/A" },
  "10-Q": { tone: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40", label: "10-Q" },
  "10-Q/A": { tone: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40", label: "10-Q/A" },
  "10-K": { tone: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40", label: "10-K" },
  "10-K/A": { tone: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40", label: "10-K/A" },
  "DEF 14A": { tone: "bg-indigo-500/15 text-indigo-200 ring-indigo-500/40", label: "Proxy" },
  DEFA14A: { tone: "bg-indigo-500/15 text-indigo-200 ring-indigo-500/40", label: "Proxy+" },
  "4": { tone: "bg-amber-500/15 text-amber-200 ring-amber-500/40", label: "Form 4" },
  "SC 13D": { tone: "bg-orange-500/15 text-orange-200 ring-orange-500/40", label: "13D" },
  "SC 13D/A": { tone: "bg-orange-500/15 text-orange-200 ring-orange-500/40", label: "13D/A" },
  "SC 13G": { tone: "bg-orange-500/15 text-orange-200 ring-orange-500/40", label: "13G" },
  "SC 13G/A": { tone: "bg-orange-500/15 text-orange-200 ring-orange-500/40", label: "13G/A" },
  "S-1": { tone: "bg-purple-500/15 text-purple-200 ring-purple-500/40", label: "S-1" },
  "S-1/A": { tone: "bg-purple-500/15 text-purple-200 ring-purple-500/40", label: "S-1/A" },
  "424B5": { tone: "bg-purple-500/15 text-purple-200 ring-purple-500/40", label: "Pricing" },
  "424B2": { tone: "bg-purple-500/15 text-purple-200 ring-purple-500/40", label: "Pricing" },
  "F-1": { tone: "bg-purple-500/15 text-purple-200 ring-purple-500/40", label: "F-1" }
};
function bucketFor(formType) {
  return FORM_BUCKET[formType] ?? {
    tone: "bg-zinc-700/50 text-zinc-300 ring-zinc-600/50",
    label: formType
  };
}
function formatFiledDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
}
const ITEM_LABEL = {
  "1.01": "Material agreement",
  "1.02": "Terminated agreement",
  "2.01": "Acquisition / disposition",
  "2.02": "Results of operations",
  "2.03": "New material obligation",
  "2.05": "Restructuring costs",
  "2.06": "Material impairments",
  "3.01": "Listing transfer / notice",
  "3.02": "Unregistered securities",
  "4.01": "Auditor change",
  "4.02": "Financial restatement",
  "5.01": "Change in control",
  "5.02": "Leadership change",
  "5.03": "Bylaw amendment",
  "5.07": "Shareholder vote",
  "7.01": "Reg FD disclosure",
  "8.01": "Other events",
  "9.01": "Financial exhibits"
};
function describeItems(items) {
  if (!items) return null;
  const labels = items.split(",").map((s) => s.trim()).filter(Boolean).map((code) => ITEM_LABEL[code] ?? code);
  if (labels.length === 0) return null;
  return [...new Set(labels)].join(" · ");
}
function isEarningsRelease$1(filing) {
  if (!filing.formType.startsWith("8-K")) return false;
  if (!filing.items) return false;
  return filing.items.split(",").some((code) => code.trim() === "2.02");
}
function SecFilingsSection({ symbol }) {
  const [filings, setFilings] = reactExports.useState(null);
  const [summaries, setSummaries] = reactExports.useState(() => /* @__PURE__ */ new Map());
  const [refreshing, setRefreshing] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.api.sec.getFilings(symbol, 25, true),
      window.api.sec.getReleaseSummariesForSymbol(symbol, 25)
    ]).then(([rows, releases]) => {
      if (cancelled) return;
      setFilings(rows);
      const m = /* @__PURE__ */ new Map();
      for (const r of releases) m.set(r.accessionNumber, r);
      setSummaries(m);
      if (rows.length === 0) {
        setRefreshing(true);
        window.api.sec.refreshFilings(symbol).then(() => window.api.sec.getFilings(symbol, 25, true)).then((rows2) => {
          if (!cancelled) setFilings(rows2);
        }).catch(() => {
        }).finally(() => {
          if (!cancelled) setRefreshing(false);
        });
      }
    }).catch(() => {
      if (!cancelled) setFilings([]);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  reactExports.useEffect(() => {
    return window.api.sec.onUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return;
      window.api.sec.getFilings(symbol, 25, true).then(setFilings).catch(() => {
      });
    });
  }, [symbol]);
  reactExports.useEffect(() => {
    return window.api.sec.onReleaseSummaryUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return;
      window.api.sec.getReleaseSummariesForSymbol(symbol, 25).then((releases) => {
        const m = /* @__PURE__ */ new Map();
        for (const r of releases) m.set(r.accessionNumber, r);
        setSummaries(m);
      }).catch(() => {
      });
    });
  }, [symbol]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(CollapsibleSection, { title: "SEC filings", meta: "via EDGAR", defaultOpen: true, children: [
    filings === null && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-500", children: "Loading filings…" }),
    filings !== null && filings.length === 0 && !refreshing && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-500", children: "No filings on record for this symbol yet. The scheduler will pick it up on the next sweep." }),
    filings !== null && filings.length === 0 && refreshing && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-500", children: "Fetching filings from EDGAR…" }),
    filings !== null && filings.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1.5", children: filings.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      FilingRow,
      {
        filing: f,
        summary: summaries.get(f.accessionNumber) ?? null,
        symbol
      },
      `${f.symbol}-${f.accessionNumber}`
    )) })
  ] });
}
function FilingRow({
  filing,
  summary,
  symbol
}) {
  const bucket = bucketFor(filing.formType);
  const itemsLabel = describeItems(filing.items);
  const desc = filing.primaryDocDescription?.trim() || null;
  const title = desc && desc !== "Primary Document" ? desc : null;
  const earnings = isEarningsRelease$1(filing);
  const [expanded, setExpanded] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "py-1.5 border-b border-edge/30 last:border-b-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: `shrink-0 inline-block text-[10px] font-semibold uppercase tracking-[0.15em] px-2 py-0.5 rounded ring-1 ring-inset ${bucket.tone} min-w-[52px] text-center`,
          children: bucket.label
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[12.5px] text-zinc-200 leading-snug", children: [
          title ?? filing.formType,
          itemsLabel && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-400", children: [
            " · ",
            itemsLabel
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10.5px] text-zinc-500 tabular-nums", children: [
          formatFiledDate(filing.filedAt),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: " · " }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono", children: filing.accessionNumber })
        ] })
      ] }),
      earnings && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setExpanded((v) => !v),
          className: "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/25",
          title: expanded ? "Collapse AI summary" : "Open AI summary + transcript links",
          children: expanded ? "Hide" : "AI summary ▾"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: filing.primaryDocUrl,
          target: "_blank",
          rel: "noreferrer",
          className: "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25",
          title: "Open filing at SEC.gov",
          children: "Open"
        }
      )
    ] }),
    earnings && expanded && /* @__PURE__ */ jsxRuntimeExports.jsx(
      EarningsReleasePanel,
      {
        symbol,
        accessionNumber: filing.accessionNumber,
        filedAt: filing.filedAt,
        summary
      }
    )
  ] });
}
function EarningsReleasePanel({
  symbol,
  accessionNumber,
  filedAt,
  summary
}) {
  const [working, setWorking] = reactExports.useState(false);
  const [localSummary, setLocalSummary] = reactExports.useState(summary);
  reactExports.useEffect(() => {
    setLocalSummary(summary);
  }, [summary]);
  const canGenerate = !localSummary || localSummary.status === "offline" || localSummary.status === "error" || localSummary.status === "ready" && !localSummary.summary;
  const onGenerate = () => {
    setWorking(true);
    window.api.sec.summarizeRelease(symbol, accessionNumber).then((row) => {
      setLocalSummary(row);
    }).catch(() => {
    }).finally(() => {
      setWorking(false);
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 ml-[64px] rounded-xl border border-edge/60 bg-surface-0 p-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      SummaryBody,
      {
        summary: localSummary,
        canGenerate,
        working: working || localSummary?.status === "pending",
        onGenerate
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TranscriptLinks$1, { symbol, filedAt })
  ] });
}
function SummaryBody({
  summary,
  canGenerate,
  working,
  onGenerate
}) {
  if (working) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11.5px] text-zinc-400 italic", children: "Summarizing release via local Ollama… (this takes ~15-30 seconds the first time)" });
  }
  if (!summary || !summary.summary) {
    const offlineLabel = summary?.status === "offline" ? "Ollama was offline when we tried. Retry?" : summary?.status === "error" ? "Summary failed previously (usually a non-HTML exhibit). Retry anyway?" : "Generate an AI summary of this earnings release?";
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11.5px] text-zinc-400", children: offlineLabel }),
      canGenerate && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onGenerate,
          className: "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/25",
          children: "Generate summary"
        }
      )
    ] });
  }
  const s = summary.summary;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1", children: "Overview" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12.5px] text-zinc-200 leading-snug", children: s.overview })
    ] }),
    s.keyNumbers.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1.5", children: "Key numbers" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2", children: s.keyNumbers.map((kn, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500",
            title: kn.label,
            children: kn.label
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[12px] font-semibold tabular-nums text-zinc-100 leading-snug break-words", children: kn.value })
      ] }, i)) })
    ] }),
    s.guidance.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1", children: "Guidance" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "text-[11.5px] text-zinc-300 leading-snug list-disc ml-4 space-y-0.5", children: s.guidance.map((g, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: g }, i)) })
    ] }),
    s.quotes.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1", children: "Quotes" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: s.quotes.map((q, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "blockquote",
        {
          className: "text-[11.5px] text-zinc-300 italic border-l-2 border-sky-500/40 pl-2.5",
          children: q
        },
        i
      )) })
    ] }),
    summary.generatedAt && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[9.5px] text-zinc-600 pt-1 border-t border-edge/30", children: [
      "Generated by local Ollama · ",
      new Date(summary.generatedAt).toLocaleString(),
      " ·",
      " ",
      summary.rawTextLength?.toLocaleString() ?? "?",
      " chars extracted from filing"
    ] })
  ] });
}
function TranscriptLinks$1({ symbol, filedAt }) {
  const year = new Date(filedAt).getFullYear();
  const quarter = Math.floor(new Date(filedAt).getMonth() / 3) + 1;
  const sa = `https://seekingalpha.com/symbol/${encodeURIComponent(symbol)}/earnings/transcripts`;
  const yahoo = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
  const foolSearch = `https://www.google.com/search?q=${encodeURIComponent(
    `${symbol} Q${quarter} ${year} earnings call transcript site:fool.com`
  )}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 pt-3 border-t border-edge/30", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1.5", children: "Call transcripts & replays" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TranscriptChip, { label: "Seeking Alpha", href: sa }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TranscriptChip, { label: "Motley Fool", href: foolSearch }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(TranscriptChip, { label: "Yahoo Finance", href: yahoo })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 text-[10px] text-zinc-600 leading-snug", children: "The AI summary above reflects the company's own press release (Item 2.02 exhibit). For the live Q&A session, these external sources carry full transcripts — Pulse doesn't mirror them locally." })
  ] });
}
function TranscriptChip({ label, href }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "a",
    {
      href,
      target: "_blank",
      rel: "noreferrer",
      className: "text-[10px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full bg-zinc-800/70 text-zinc-300 ring-1 ring-inset ring-zinc-600/60 hover:bg-zinc-700 hover:text-zinc-100",
      children: [
        label,
        " ↗"
      ]
    }
  );
}
function formatPct(ratio, digits = 1) {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}
function formatMoney(value, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(digits)}`;
}
function formatOi(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}
function ratioLabel(ratio) {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return ratio >= 1 ? `${ratio.toFixed(2)}× puts` : `${(1 / ratio).toFixed(2)}× calls`;
}
function ivTone(iv) {
  if (iv === null) return { color: "text-zinc-400", label: "—" };
  const pct = iv * 100;
  if (pct >= 80) return { color: "text-red-300", label: "hot" };
  if (pct >= 50) return { color: "text-amber-300", label: "elevated" };
  if (pct >= 25) return { color: "text-zinc-200", label: "normal" };
  return { color: "text-emerald-300", label: "quiet" };
}
function ratioTone(ratio) {
  if (ratio === null) return "text-zinc-400";
  if (ratio > 1.2) return "text-red-300";
  if (ratio < 0.8) return "text-emerald-300";
  return "text-zinc-300";
}
function OptionsSnapshotSection({ symbol }) {
  const [snap, setSnap] = reactExports.useState(void 0);
  reactExports.useEffect(() => {
    let cancelled = false;
    window.api.stocks.getOptionsSnapshot(symbol).then((s) => {
      if (!cancelled) setSnap(s);
    }).catch(() => {
      if (!cancelled) setSnap(null);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  if (snap === null) return null;
  if (snap === void 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsibleSection, { title: "Options signal", meta: "via Yahoo", defaultOpen: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-500", children: "Loading options data…" }) });
  }
  const expiryStr = new Date(snap.expiryDate).toLocaleDateString(void 0, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const iv = ivTone(snap.impliedVol);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    CollapsibleSection,
    {
      title: "Options signal",
      meta: `${expiryStr} · ${snap.daysToExpiry}d`,
      defaultOpen: true,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Stat$1,
            {
              label: "Implied vol",
              value: formatPct(snap.impliedVol, 0),
              tone: iv.color,
              sub: iv.label
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Stat$1,
            {
              label: "Expected move",
              value: formatMoney(snap.expectedMoveUsd),
              sub: snap.expectedMovePct !== null ? `±${formatPct(snap.expectedMovePct, 1)}` : void 0,
              tone: "text-zinc-100"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Stat$1,
            {
              label: "Put/call OI",
              value: ratioLabel(snap.putCallOiRatio),
              tone: ratioTone(snap.putCallOiRatio),
              sub: snap.totalCallOi !== null && snap.totalPutOi !== null ? `${formatOi(snap.totalCallOi)} C · ${formatOi(snap.totalPutOi)} P` : void 0
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Stat$1,
            {
              label: "ATM strike",
              value: snap.atmStrike !== null ? formatMoney(snap.atmStrike) : "—",
              tone: "text-zinc-100",
              sub: snap.underlyingPrice !== null ? `underlying ${formatMoney(snap.underlyingPrice)}` : void 0
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 text-[10.5px] text-zinc-500 leading-snug", children: [
          "Expected move = ATM straddle mid price — the market's implied absolute move in",
          " ",
          symbol,
          " through ",
          expiryStr,
          ". IV is the mean of the ATM call + put implied volatilities."
        ] })
      ]
    }
  );
}
function Stat$1({
  label,
  value,
  sub,
  tone
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-[18px] font-semibold tabular-nums ${tone}`, children: value }),
    sub && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10.5px] text-zinc-500 tabular-nums mt-0.5", children: sub })
  ] });
}
function EarningsReleaseSection({ symbol }) {
  const [latest, setLatest] = reactExports.useState(void 0);
  const [working, setWorking] = reactExports.useState(false);
  const load = () => Promise.all([
    window.api.sec.getFilings(symbol, 25, true),
    window.api.sec.getReleaseSummariesForSymbol(symbol, 25)
  ]).then(([filings, summaries]) => {
    const latestEarnings = filings.find(isEarningsRelease);
    if (!latestEarnings) {
      setLatest(null);
      return;
    }
    const summary = summaries.find((s) => s.accessionNumber === latestEarnings.accessionNumber) ?? null;
    setLatest({ filing: latestEarnings, summary });
  });
  reactExports.useEffect(() => {
    let cancelled = false;
    setLatest(void 0);
    load().catch(() => {
      if (!cancelled) setLatest(null);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  reactExports.useEffect(() => {
    return window.api.sec.onReleaseSummaryUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return;
      void load();
    });
  }, [symbol]);
  reactExports.useEffect(() => {
    return window.api.sec.onUpdated((updatedSymbol) => {
      if (updatedSymbol.toUpperCase() !== symbol.toUpperCase()) return;
      void load();
    });
  }, [symbol]);
  if (latest === void 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsibleSection, { title: "Earnings release", meta: "latest 8-K Item 2.02", defaultOpen: true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-500", children: "Looking for the latest earnings release…" }) });
  }
  if (latest === null) return null;
  const handleGenerate = () => {
    setWorking(true);
    window.api.sec.summarizeRelease(symbol, latest.filing.accessionNumber).then((row) => {
      if (row) setLatest({ filing: latest.filing, summary: row });
    }).catch(() => {
    }).finally(() => {
      setWorking(false);
    });
  };
  const filedStr = new Date(latest.filing.filedAt).toLocaleDateString(void 0, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const canGenerate = !latest.summary || latest.summary.status === "offline" || latest.summary.status === "error" || latest.summary.status === "ready" && !latest.summary.summary;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    CollapsibleSection,
    {
      title: "Earnings release",
      meta: `${filedStr} · 8-K`,
      defaultOpen: true,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          EarningsSummaryCard,
          {
            summary: latest.summary,
            canGenerate,
            working: working || latest.summary?.status === "pending",
            onGenerate: handleGenerate
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(TranscriptLinks, { symbol, filedAt: latest.filing.filedAt }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 pt-3 border-t border-edge/30 flex items-center justify-between gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-600", children: [
            "Accession ",
            latest.filing.accessionNumber
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "a",
            {
              href: latest.filing.primaryDocUrl,
              target: "_blank",
              rel: "noreferrer",
              className: "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25",
              children: "Open full filing ↗"
            }
          )
        ] })
      ]
    }
  );
}
function isEarningsRelease(filing) {
  if (!filing.formType.startsWith("8-K")) return false;
  if (!filing.items) return false;
  return filing.items.split(",").some((code) => code.trim() === "2.02");
}
function EarningsSummaryCard({
  summary,
  canGenerate,
  working,
  onGenerate
}) {
  if (working) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11.5px] text-zinc-400 italic", children: "Summarizing the earnings release via local Ollama… (~15-30 seconds the first time)" });
  }
  if (!summary || !summary.summary) {
    const offlineLabel = summary?.status === "offline" ? "Ollama was offline when we last tried. Retry?" : summary?.status === "error" ? "Summary failed previously (usually a non-HTML exhibit). Retry anyway?" : "Generate an AI summary of the latest earnings release?";
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11.5px] text-zinc-400", children: offlineLabel }),
      canGenerate && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onGenerate,
          className: "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-500/40 hover:bg-sky-500/25",
          children: "Generate summary"
        }
      )
    ] });
  }
  const s = summary.summary;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1", children: "Overview" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[13px] text-zinc-100 leading-relaxed", children: s.overview })
    ] }),
    s.keyNumbers.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1.5", children: "Key numbers" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2", children: s.keyNumbers.map((kn, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500",
            title: kn.label,
            children: kn.label
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] font-semibold tabular-nums text-zinc-100 leading-snug break-words", children: kn.value })
      ] }, i)) })
    ] }),
    s.guidance.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1", children: "Guidance" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "text-[12px] text-zinc-300 leading-snug list-disc ml-4 space-y-0.5", children: s.guidance.map((g, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: g }, i)) })
    ] }),
    s.quotes.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1", children: "Quotes" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: s.quotes.map((q, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "blockquote",
        {
          className: "text-[12px] text-zinc-300 italic border-l-2 border-sky-500/40 pl-2.5",
          children: q
        },
        i
      )) })
    ] }),
    summary.generatedAt && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[9.5px] text-zinc-600 pt-1", children: [
      "Generated by local Ollama · ",
      new Date(summary.generatedAt).toLocaleString(),
      " ·",
      " ",
      summary.rawTextLength?.toLocaleString() ?? "?",
      " chars extracted from filing"
    ] })
  ] });
}
function TranscriptLinks({ symbol, filedAt }) {
  const year = new Date(filedAt).getFullYear();
  const quarter = Math.floor(new Date(filedAt).getMonth() / 3) + 1;
  const sa = `https://seekingalpha.com/symbol/${encodeURIComponent(symbol)}/earnings/transcripts`;
  const yahoo = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
  const foolSearch = `https://www.google.com/search?q=${encodeURIComponent(
    `${symbol} Q${quarter} ${year} earnings call transcript site:fool.com`
  )}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 pt-3 border-t border-edge/30", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-1.5", children: "Call transcripts & replays" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Chip, { label: "Seeking Alpha", href: sa }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Chip, { label: "Motley Fool", href: foolSearch }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Chip, { label: "Yahoo Finance", href: yahoo })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 text-[10px] text-zinc-600 leading-snug", children: "The summary above is built from the company's 8-K press release (Item 2.02 exhibit). For the live Q&A, these external sources carry the full transcript — Pulse doesn't mirror them locally." })
  ] });
}
function Chip({ label, href }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "a",
    {
      href,
      target: "_blank",
      rel: "noreferrer",
      className: "text-[10px] font-semibold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full bg-zinc-800/70 text-zinc-300 ring-1 ring-inset ring-zinc-600/60 hover:bg-zinc-700 hover:text-zinc-100",
      children: [
        label,
        " ↗"
      ]
    }
  );
}
const TONE = {
  "ticker-direct": {
    label: "Watchlist",
    chipBorder: "border-emerald-400/50",
    chipBg: "bg-emerald-500/10",
    chipText: "text-emerald-100",
    dot: "bg-emerald-400"
  },
  "ticker-indirect": {
    label: "Value chain",
    chipBorder: "border-indigo-400/50",
    chipBg: "bg-indigo-500/10",
    chipText: "text-indigo-100",
    dot: "bg-indigo-400"
  },
  team: {
    label: "Team",
    chipBorder: "border-amber-400/50",
    chipBg: "bg-amber-500/10",
    chipText: "text-amber-100",
    dot: "bg-amber-400"
  },
  athlete: {
    label: "Athlete",
    chipBorder: "border-rose-400/50",
    chipBg: "bg-rose-500/10",
    chipText: "text-rose-100",
    dot: "bg-rose-400"
  },
  geo: {
    label: "Location",
    chipBorder: "border-sky-400/50",
    chipBg: "bg-sky-500/10",
    chipText: "text-sky-100",
    dot: "bg-sky-400"
  }
};
function WhyThisMatters({
  articleId,
  title,
  summary,
  body
}) {
  const [state, setState] = reactExports.useState(null);
  const [error, setError] = reactExports.useState(null);
  const reqRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    setState(null);
    setError(null);
  }, [articleId]);
  reactExports.useEffect(() => {
    const reqId = ++reqRef.current;
    let cancelled = false;
    window.api.relevance.get({ articleId, title, summary, body }).then((res) => {
      if (cancelled || reqRef.current !== reqId) return;
      setState(res);
    }).catch((err) => {
      if (cancelled || reqRef.current !== reqId) return;
      setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancelled = true;
    };
  }, [articleId, title, summary, body]);
  reactExports.useEffect(() => {
    const off = window.api.relevance.onUpdated((payload) => {
      if (payload.articleId !== articleId) return;
      setState(payload);
    });
    return off;
  }, [articleId]);
  const visibleMatches = reactExports.useMemo(
    () => (state?.matches ?? []).slice(0, 4),
    [state]
  );
  if (error) return null;
  if (!state) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(WhyThisMattersSkeleton, {});
  }
  if (state.status === "no_matches" || visibleMatches.length === 0) return null;
  const prose = state.summary;
  const showPending = state.status === "pending" && !prose;
  const showOffline = state.status === "offline" && !prose;
  const showError = state.status === "error" && !prose;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "aside",
    {
      "data-lookup-context": "Pulse personalization card",
      className: "mb-10 rounded-xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 via-zinc-900/50 to-violet-500/10 px-5 py-4 shadow-[0_1px_30px_-12px_rgba(129,140,248,0.35)]",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-indigo-300" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-[0.22em] text-indigo-200/80", children: "Why this matters to you" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5 mb-3", children: visibleMatches.map((m, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(MatchChip, { match: m }, `${m.kind}:${m.label}:${i}`)) }),
        prose ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[13.5px] leading-[1.6] text-zinc-200", children: prose }) : showPending ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[12px] text-zinc-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-block h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Pulse is connecting this to your world…" })
        ] }) : showOffline ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-500", children: "Ollama is offline — showing the matches only. Start Ollama to get the personalized brief on your next reopen." }) : showError ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-500", children: "The brief couldn’t be generated this time. Try reopening the article." }) : null
      ]
    }
  );
}
function MatchChip({ match }) {
  const tone = TONE[match.kind];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "span",
    {
      className: `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${tone.chipBorder} ${tone.chipBg} ${tone.chipText}`,
      title: match.detail,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `h-1.5 w-1.5 rounded-full ${tone.dot}` }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: match.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] opacity-70", children: [
          "· ",
          match.detail
        ] })
      ]
    }
  );
}
function WhyThisMattersSkeleton() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "mb-10 rounded-xl border border-zinc-800/60 bg-zinc-900/20 px-5 py-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-2 w-28 rounded bg-zinc-800/70 animate-pulse mb-3" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-1.5 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-5 w-20 rounded-full bg-zinc-800/60 animate-pulse" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-5 w-28 rounded-full bg-zinc-800/60 animate-pulse" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-2 w-3/4 rounded bg-zinc-800/50 animate-pulse" })
  ] });
}
const DEBOUNCE_MS = 220;
function TickerSearchBox({
  onOpenDetail,
  onAddToWatchlist,
  autoFocus = false
}) {
  const [query, setQuery] = reactExports.useState("");
  const [results, setResults] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(false);
  const [selectedIdx, setSelectedIdx] = reactExports.useState(0);
  const [preview, setPreview] = reactExports.useState(null);
  const inputRef = reactExports.useRef(null);
  const debounceRef = reactExports.useRef(null);
  const reqIdRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  reactExports.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      window.api.stocks.searchTickers(q, 10).then((rows) => {
        if (reqIdRef.current !== reqId) return;
        setResults(rows);
        setSelectedIdx(0);
      }).catch(() => {
        if (reqIdRef.current !== reqId) return;
        setResults([]);
      }).finally(() => {
        if (reqIdRef.current === reqId) setLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);
  const onKey = (e) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[selectedIdx];
      if (picked) {
        setPreview(picked);
        setResults([]);
        setQuery(picked.symbol);
      }
    } else if (e.key === "Escape") {
      setResults([]);
      setQuery("");
      setPreview(null);
    }
  };
  const pick = (r) => {
    setPreview(r);
    setResults([]);
    setQuery(r.symbol);
  };
  const clear = () => {
    setQuery("");
    setResults([]);
    setPreview(null);
    inputRef.current?.focus();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          ref: inputRef,
          type: "text",
          value: query,
          onChange: (e) => {
            setQuery(e.target.value);
            if (preview && e.target.value !== preview.symbol) setPreview(null);
          },
          onKeyDown: onKey,
          placeholder: "Search any US ticker — e.g. KO, PLTR, COST, ASML…",
          className: "w-full bg-surface-0 border border-edge rounded-lg px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-edge focus:ring-1 focus:ring-emerald-500/40"
        }
      ),
      query.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: clear,
          className: "absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 hover:text-zinc-300",
          title: "Clear (Esc)",
          children: "Clear"
        }
      ),
      results.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "absolute z-20 left-0 right-0 mt-1 rounded-lg border border-edge bg-surface-1 shadow-xl overflow-hidden", children: [
        loading && /* @__PURE__ */ jsxRuntimeExports.jsx("li", { className: "px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500", children: "Searching…" }),
        results.map((r, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => pick(r),
            onMouseEnter: () => setSelectedIdx(i),
            className: `w-full text-left flex items-start gap-3 px-3 py-2 transition-colors ${i === selectedIdx ? "bg-surface-2/80" : "bg-transparent hover:bg-surface-2/50"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[12px] font-bold tracking-[0.06em] text-zinc-50 min-w-[60px]", children: r.symbol }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-200 truncate", children: r.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-zinc-500 truncate", children: [r.exchangeDisplay ?? r.exchange, r.sector, r.industry].filter(Boolean).join(" · ") })
              ] }),
              r.quoteType && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-zinc-800/70 text-zinc-400", children: r.quoteType })
            ]
          }
        ) }, `${r.symbol}-${i}`))
      ] })
    ] }),
    loading && results.length === 0 && query.length >= 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-[0.18em] text-zinc-600", children: "Searching…" }),
    !loading && results.length === 0 && query.length >= 2 && !preview && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11.5px] text-zinc-500 italic", children: "No matches. Yahoo search only covers US-listed symbols." }),
    preview && /* @__PURE__ */ jsxRuntimeExports.jsx(PreviewCard, { result: preview, onOpenDetail, onAddToWatchlist })
  ] });
}
function PreviewCard({
  result,
  onOpenDetail,
  onAddToWatchlist
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-edge bg-surface-0 p-4 flex items-start gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-2 mb-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[16px] font-bold tracking-[0.04em] text-zinc-50", children: result.symbol }),
        result.quoteType && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-semibold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded bg-zinc-800/70 text-zinc-400", children: result.quoteType }),
        result.exchangeDisplay && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500", children: result.exchangeDisplay })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13px] text-zinc-200 mb-1 leading-snug", children: result.name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500", children: [result.sector, result.industry].filter(Boolean).join(" · ") || "No sector/industry on file from Yahoo." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1.5 shrink-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onOpenDetail(result),
          className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25",
          children: "Open detail"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onAddToWatchlist(result),
          className: "text-[10px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25",
          children: "+ Watchlist"
        }
      )
    ] })
  ] });
}
const EVENT_LIFETIME_MS = 2500;
function useScoreEvent(game) {
  const [event, setEvent] = reactExports.useState(null);
  const prev = reactExports.useRef(null);
  const clearRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const home = game.home.score;
    const away = game.away.score;
    const prior = prev.current;
    prev.current = { home, away };
    if (!prior) return;
    if (game.status !== "in_progress") return;
    const homeDelta = (home ?? 0) - (prior.home ?? 0);
    const awayDelta = (away ?? 0) - (prior.away ?? 0);
    let fired = null;
    if (homeDelta > 0) {
      fired = { key: `h-${Date.now()}`, side: "home", delta: homeDelta, at: Date.now() };
    } else if (awayDelta > 0) {
      fired = { key: `a-${Date.now()}`, side: "away", delta: awayDelta, at: Date.now() };
    }
    if (fired) {
      setEvent(fired);
      if (clearRef.current) clearTimeout(clearRef.current);
      clearRef.current = setTimeout(() => setEvent(null), EVENT_LIFETIME_MS);
    }
  }, [game.home.score, game.away.score, game.status]);
  reactExports.useEffect(() => {
    return () => {
      if (clearRef.current) clearTimeout(clearRef.current);
    };
  }, []);
  return event;
}
function useAdaptiveInterval(options) {
  const [visible, setVisible] = reactExports.useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState !== "hidden";
  });
  reactExports.useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  if (!visible) return options.hiddenMs;
  return options.anyLive ? options.liveMs : options.idleMs;
}
const SPORT_BY_LEAGUE_ID = {
  nfl: "American Football",
  nba: "Basketball",
  mlb: "Baseball",
  nhl: "Hockey",
  ucl: "Soccer",
  epl: "Soccer",
  laliga: "Soccer",
  seriea: "Soccer",
  mls: "Soccer"
};
function sportForLeagueId(leagueId) {
  return SPORT_BY_LEAGUE_ID[leagueId] ?? "";
}
const SPORT_VISUALS = {
  Basketball: {
    emoji: "🏀",
    accent: "bg-orange-500/25 ring-orange-400/50 text-orange-100",
    label: (d) => `+${d}`
  },
  "American Football": {
    emoji: "🏈",
    accent: "bg-amber-500/25 ring-amber-400/50 text-amber-100",
    label: (d) => d >= 6 ? "TD" : d === 3 ? "FG" : `+${d}`
  },
  Baseball: {
    emoji: "⚾",
    accent: "bg-red-500/25 ring-red-400/50 text-red-100",
    label: (d) => d === 1 ? "RUN" : `+${d}`,
    hero: true
  },
  Hockey: {
    emoji: "🚨",
    accent: "bg-red-500/30 ring-red-400/60 text-red-50",
    label: () => "GOAL",
    hero: true
  },
  Soccer: {
    emoji: "⚽",
    accent: "bg-emerald-500/25 ring-emerald-400/50 text-emerald-50",
    label: () => "GOAL",
    hero: true
  }
};
function visualFor(sport) {
  return SPORT_VISUALS[sport] ?? {
    emoji: "✨",
    accent: "bg-accent/25 ring-accent/50 text-accent",
    label: (d) => `+${d}`
  };
}
const SIZE_CLASSES = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-[12px] px-2 py-0.5 gap-1.5",
  lg: "text-[16px] px-3 py-1 gap-2"
};
function ScoreFlourish({
  event,
  sport,
  size = "sm",
  teamColor
}) {
  if (!event) return null;
  const visual = visualFor(sport);
  const label = visual.label(event.delta);
  const heroBurst = visual.hero && size !== "sm";
  const tint = teamColor ? teamTintStyle(teamColor) : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "span",
    {
      "aria-hidden": true,
      style: tint ?? void 0,
      className: `score-flourish pointer-events-none inline-flex items-center font-bold uppercase tracking-[0.18em] rounded-full ring-1 ring-inset ${tint ? "" : visual.accent} ${SIZE_CLASSES[size]} ${heroBurst ? "score-flourish-hero" : ""}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "score-flourish-emoji leading-none", children: visual.emoji }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "leading-none tabular-nums", children: label })
      ]
    },
    event.key
  );
}
function teamTintStyle(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const text = luminance < 0.55 ? "#ffffff" : "#0a0a0a";
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
    boxShadow: `inset 0 0 0 1px rgba(${r}, ${g}, ${b}, 0.9)`,
    color: text
  };
}
function hexToRgb(hex) {
  const t = hex.replace(/^#/, "");
  if (t.length === 3) {
    const r = parseInt(t[0] + t[0], 16);
    const g = parseInt(t[1] + t[1], 16);
    const b = parseInt(t[2] + t[2], 16);
    return Number.isNaN(r + g + b) ? null : { r, g, b };
  }
  if (t.length === 6 || t.length === 8) {
    const r = parseInt(t.slice(0, 2), 16);
    const g = parseInt(t.slice(2, 4), 16);
    const b = parseInt(t.slice(4, 6), 16);
    return Number.isNaN(r + g + b) ? null : { r, g, b };
  }
  return null;
}
function App() {
  const [filter, setFilter] = reactExports.useState("all");
  const [selectedCategoryId, setSelectedCategoryId] = reactExports.useState(null);
  const [bookmarksOnly, setBookmarksOnly] = reactExports.useState(false);
  const [selectedId, setSelectedId] = reactExports.useState(null);
  const { categories, recentCounts, bookmarkCount, refresh: refreshCategories } = useCategories();
  const articlesOpts = reactExports.useMemo(
    () => ({
      domain: bookmarksOnly ? void 0 : selectedCategoryId !== null ? void 0 : filter === "all" ? void 0 : filter === "finance" ? "finance" : "general",
      categoryId: bookmarksOnly ? void 0 : selectedCategoryId ?? void 0,
      bookmarkedOnly: bookmarksOnly || void 0,
      limit: 200
    }),
    [filter, selectedCategoryId, bookmarksOnly]
  );
  const handleFilterChange = reactExports.useCallback((f) => {
    setFilter(f);
    setSelectedCategoryId(null);
    setBookmarksOnly(false);
  }, []);
  const handleCategorySelect = reactExports.useCallback((id) => {
    setSelectedCategoryId(id);
    setBookmarksOnly(false);
  }, []);
  const handleShowBookmarks = reactExports.useCallback(() => {
    setBookmarksOnly(true);
    setSelectedCategoryId(null);
  }, []);
  const { articles, loading, refresh, patchArticle } = useArticles(articlesOpts);
  const [fallbackArticle, setFallbackArticle] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (selectedId === null) {
      setFallbackArticle(null);
      return;
    }
    if (articles.find((a) => a.id === selectedId)) {
      setFallbackArticle(null);
      return;
    }
    let cancelled = false;
    void window.api.articles.getById(selectedId).then((row) => {
      if (cancelled) return;
      setFallbackArticle(row);
    }).catch((err) => {
      console.warn("[ui] articles.getById failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, articles]);
  const selected = articles.find((a) => a.id === selectedId) ?? (fallbackArticle && fallbackArticle.id === selectedId ? fallbackArticle : null);
  const handleSelect = reactExports.useCallback(
    (id) => {
      setSelectedId(id);
      const a = articles.find((x) => x.id === id);
      if (a && !a.isRead) {
        patchArticle(id, { isRead: true });
        void window.api.articles.markRead(id, true).then(() => refreshCategories());
      }
    },
    [articles, patchArticle, refreshCategories]
  );
  const handleToggleBookmark = reactExports.useCallback(
    (article) => {
      const next = !article.isBookmarked;
      patchArticle(article.id, { isBookmarked: next });
      void window.api.articles.setBookmarked(article.id, next).then(() => refreshCategories());
    },
    [patchArticle, refreshCategories]
  );
  const handleRefresh = async () => {
    await window.api.feeds.refreshAll();
    await Promise.all([refresh(), refreshCategories()]);
  };
  const [discoveryOpen, setDiscoveryOpen] = reactExports.useState(false);
  const [discoveryCount, setDiscoveryCount] = reactExports.useState(0);
  const [hyperOpen, setHyperOpen] = reactExports.useState(false);
  const [reelsOpen, setReelsOpen] = reactExports.useState(false);
  const [reelsCount, setReelsCount] = reactExports.useState(0);
  const [videoReady, setVideoReady] = reactExports.useState(false);
  const [flashPending, setFlashPending] = reactExports.useState(
    null
  );
  const handleMakeFlash = reactExports.useCallback(
    async (articleId, title) => {
      setFlashPending({ articleId, title });
      try {
        return await window.api.reels.generateForArticle(articleId);
      } catch {
        return { ok: false, reason: "generation-failed" };
      } finally {
        setFlashPending((cur) => cur?.articleId === articleId ? null : cur);
      }
    },
    []
  );
  const [stocksOpen, setStocksOpen] = reactExports.useState(false);
  const [sportsOpen, setSportsOpen] = reactExports.useState(false);
  const [researchOpen, setResearchOpen] = reactExports.useState(false);
  const [pendingStockSymbol, setPendingStockSymbol] = reactExports.useState(null);
  const [pendingGame, setPendingGame] = reactExports.useState(null);
  const [density, setDensity] = reactExports.useState("comfortable");
  const [settingsOpen, setSettingsOpen] = reactExports.useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = reactExports.useState(void 0);
  const [externalView, setExternalView] = reactExports.useState(null);
  const [findOpen, setFindOpen] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      } else if (e.key === "Escape" && findOpen) {
        setFindOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [findOpen]);
  const handleOpenURL = reactExports.useCallback(
    (url, title, subtitle) => {
      if (!url || !url.startsWith("http")) return;
      setExternalView({ url, title, subtitle: subtitle ?? null });
    },
    []
  );
  const handleOpenIpoBrief = reactExports.useCallback(
    (symbol, companyName) => {
      const title = symbol ? `${symbol} IPO brief` : `${companyName || "IPO"} brief`;
      setExternalView({
        url: null,
        title,
        subtitle: companyName || null,
        initialReader: null
      });
      void window.api.ipo.getBrief({ symbol, companyName }).then((brief) => {
        setExternalView(
          (prev) => prev && prev.title === title ? { ...prev, initialReader: brief } : prev
        );
      }).catch((err) => {
        console.warn("[ipo] brief failed:", err);
        setExternalView(
          (prev) => prev && prev.title === title ? {
            ...prev,
            initialReader: {
              status: "error",
              error: "Could not assemble an IPO brief from the public sources."
            }
          } : prev
        );
      });
    },
    []
  );
  const handleTickerOpenStock = reactExports.useCallback((symbol) => {
    setPendingStockSymbol(symbol);
    setStocksOpen(true);
    setSportsOpen(false);
    setDiscoveryOpen(false);
    setHyperOpen(false);
    setReelsOpen(false);
    setResearchOpen(false);
    setSelectedId(null);
    setExternalView(null);
  }, []);
  const handleTickerOpenArticle = reactExports.useCallback(
    (id) => {
      setStocksOpen(false);
      setSportsOpen(false);
      setDiscoveryOpen(false);
      setHyperOpen(false);
      setReelsOpen(false);
      setResearchOpen(false);
      setBookmarksOnly(false);
      setSelectedCategoryId(null);
      setFilter("all");
      setSelectedId(id);
      setExternalView(null);
      void window.api.articles.markRead(id, true).then(() => {
        void refresh();
        void refreshCategories();
      });
    },
    [refresh, refreshCategories]
  );
  const handleTickerOpenGame = reactExports.useCallback((game) => {
    setPendingGame(game);
    setSportsOpen(true);
    setStocksOpen(false);
    setDiscoveryOpen(false);
    setHyperOpen(false);
    setReelsOpen(false);
    setResearchOpen(false);
    setSelectedId(null);
    setExternalView(null);
  }, []);
  const handleCalendarOpenGame = reactExports.useCallback(
    (leagueId, gameId) => {
      void window.api.sports.listGames(leagueId).then((games) => {
        const match = games.find((g) => g.id === gameId);
        if (match) handleTickerOpenGame(match);
      });
    },
    [handleTickerOpenGame]
  );
  const handleSettingsChange = reactExports.useCallback(() => {
    void refresh();
    void refreshCategories();
  }, [refresh, refreshCategories]);
  const refreshDiscoveryCount = reactExports.useCallback(async () => {
    setDiscoveryCount(await window.api.discovery.countUnviewed());
  }, []);
  reactExports.useEffect(() => {
    void refreshDiscoveryCount();
  }, [refreshDiscoveryCount]);
  const rendererReadyFiredRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    if (rendererReadyFiredRef.current) return;
    if (loading) return;
    rendererReadyFiredRef.current = true;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void window.api.app.rendererReady();
      });
    });
    return () => cancelAnimationFrame(raf1);
  }, [loading]);
  reactExports.useEffect(() => {
    const fallback = setTimeout(() => {
      if (rendererReadyFiredRef.current) return;
      rendererReadyFiredRef.current = true;
      void window.api.app.rendererReady();
    }, 2e3);
    return () => clearTimeout(fallback);
  }, []);
  reactExports.useEffect(() => {
    const sync = () => {
      const inactive = document.hidden || !document.hasFocus();
      document.body.classList.toggle("pulse-hidden", inactive);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);
  const refreshReelsCount = reactExports.useCallback(async () => {
    setReelsCount(await window.api.reels.count());
  }, []);
  reactExports.useEffect(() => {
    void refreshReelsCount();
    const unsub = window.api.reels.onUpdated(() => void refreshReelsCount());
    return unsub;
  }, [refreshReelsCount]);
  reactExports.useEffect(() => {
    void window.api.reels.getVideoGenStatus().then((s) => setVideoReady(s.state === "ready"));
    const unsub = window.api.reels.onVideoGenStatus((s) => setVideoReady(s.state === "ready"));
    return unsub;
  }, []);
  reactExports.useEffect(() => {
    void window.api.prefs.get().then((p) => setDensity(p.density));
    const unsub = window.api.prefs.onDensityChange(setDensity);
    return unsub;
  }, []);
  const [mediaPipelineEnabled, setMediaPipelineEnabled] = reactExports.useState(false);
  reactExports.useEffect(() => {
    void window.api.prefs.get().then((p) => setMediaPipelineEnabled(p.mediaPipelineEnabled));
  }, []);
  reactExports.useEffect(() => {
    const applyTheme = (t) => {
      document.documentElement.setAttribute("data-theme", t);
    };
    void window.api.prefs.getResolvedTheme().then(applyTheme);
    const unsub = window.api.prefs.onThemeChange(applyTheme);
    return unsub;
  }, []);
  reactExports.useEffect(() => {
    const unsub = window.api.articles.onOpen((articleId) => {
      setBookmarksOnly(false);
      setSelectedCategoryId(null);
      setFilter("all");
      setStocksOpen(false);
      setSportsOpen(false);
      setDiscoveryOpen(false);
      setHyperOpen(false);
      setReelsOpen(false);
      setResearchOpen(false);
      setSelectedId(articleId);
      void window.api.articles.markRead(articleId, true).then(() => {
        void refresh();
        void refreshCategories();
      });
    });
    return unsub;
  }, [refresh, refreshCategories]);
  reactExports.useEffect(() => {
    const unsub = window.api.stocks.onOpenSymbol((symbol) => {
      handleTickerOpenStock(symbol);
    });
    return unsub;
  }, [handleTickerOpenStock]);
  reactExports.useEffect(() => {
    const unsub = window.api.sports.onOpenGame((payload) => {
      handleCalendarOpenGame(payload.leagueId, payload.eventId);
    });
    return unsub;
  }, [handleCalendarOpenGame]);
  reactExports.useEffect(() => {
    const unsub = window.api.app.onNavigate((route) => {
      if (route === "stocks") {
        setStocksOpen(true);
      } else if (route === "sports") {
        setSportsOpen(true);
      } else {
        setStocksOpen(false);
        setSportsOpen(false);
        setDiscoveryOpen(false);
        setHyperOpen(false);
        setReelsOpen(false);
        setResearchOpen(false);
        setSelectedId(null);
        setExternalView(null);
      }
    });
    return unsub;
  }, []);
  const viewHeading = bookmarksOnly ? { eyebrow: "Library", title: "Bookmarks", eyebrowClass: "text-accent/90" } : selectedCategoryId !== null ? {
    eyebrow: categories.find((c) => c.id === selectedCategoryId)?.domain === "finance" ? "Finance" : "News",
    title: categories.find((c) => c.id === selectedCategoryId)?.name ?? "Feed",
    eyebrowClass: categories.find((c) => c.id === selectedCategoryId)?.domain === "finance" ? "text-yellow-400" : "text-accent/90"
  } : filter === "finance" ? { eyebrow: "Portfolio intelligence", title: "Finance", eyebrowClass: "text-yellow-400" } : filter === "news" ? { eyebrow: "World & local", title: "News", eyebrowClass: "text-accent/90" } : { eyebrow: "Your dashboard", title: "Top Stories", eyebrowClass: "text-red-500" };
  const activeCategory = selectedCategoryId !== null ? categories.find((c) => c.id === selectedCategoryId) : null;
  const calendarFilter = bookmarksOnly ? "all" : activeCategory ? activeCategory.domain === "finance" ? "finance" : "news" : filter;
  const viewKey = externalView ? `ext:${externalView.url ?? externalView.title}` : settingsOpen ? "settings" : stocksOpen ? "stocks" : sportsOpen ? "sports" : discoveryOpen ? "discovery" : hyperOpen ? "hyper" : reelsOpen ? "reels" : selected ? `article:${selected.id}` : bookmarksOnly ? "bookmarks" : selectedCategoryId !== null ? `cat:${selectedCategoryId}` : `filter:${filter}`;
  const feedLookupContext = reactExports.useMemo(() => {
    if (bookmarksOnly) {
      return "Bookmarked news articles across finance (semiconductor value chain, defense, mining) and general news (US geopolitics, space, world events).";
    }
    if (activeCategory) {
      return activeCategory.domain === "finance" ? `Finance news feed, category "${activeCategory.name}" — semiconductor value chain (fabless, foundries, equipment, EDA, packaging), defense/aerospace, mining. Ambiguous terms are usually companies, products, or executives.` : `General news feed, category "${activeCategory.name}" — US politics and geopolitics, space exploration, local/regional news, and world events. Ambiguous terms are usually people, places, or policy.`;
    }
    if (filter === "finance") {
      return "Finance news feed — semiconductor value chain (fabless, foundries, equipment, EDA, packaging), defense/aerospace, mining. Ambiguous terms are usually public companies, products, or executives.";
    }
    if (filter === "news") {
      return "General news feed — US politics and geopolitics, space exploration, local/regional news, and world events. Ambiguous terms are usually people, places, or policy.";
    }
    return "Mixed news dashboard covering finance (semiconductors, defense, mining) and general news (US geopolitics, space, world events).";
  }, [bookmarksOnly, activeCategory, filter]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: `h-full w-full flex flex-col bg-surface-0 text-zinc-100 ${density === "compact" ? "density-compact" : ""}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TitleBar, { onRefresh: handleRefresh, onOpenSettings: () => setSettingsOpen(true) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          TickerStrip,
          {
            onOpenStock: handleTickerOpenStock,
            onOpenArticle: handleTickerOpenArticle,
            onOpenGame: handleTickerOpenGame
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          TopNav,
          {
            filter,
            onFilterChange: (f) => {
              handleFilterChange(f);
              setStocksOpen(false);
              setSportsOpen(false);
              setDiscoveryOpen(false);
              setHyperOpen(false);
              setReelsOpen(false);
              setResearchOpen(false);
            },
            categories,
            recentCounts,
            selectedCategoryId,
            onSelectCategory: (id) => {
              handleCategorySelect(id);
              setStocksOpen(false);
              setSportsOpen(false);
              setDiscoveryOpen(false);
              setHyperOpen(false);
              setReelsOpen(false);
              setResearchOpen(false);
            },
            bookmarksActive: bookmarksOnly,
            bookmarkCount,
            onShowBookmarks: () => {
              handleShowBookmarks();
              setStocksOpen(false);
              setSportsOpen(false);
              setDiscoveryOpen(false);
              setHyperOpen(false);
              setReelsOpen(false);
              setResearchOpen(false);
            },
            reelsCount,
            reelsActive: reelsOpen,
            reelsAvailable: mediaPipelineEnabled && (videoReady || reelsCount > 0),
            onShowReels: () => {
              setReelsOpen(true);
              setStocksOpen(false);
              setSportsOpen(false);
              setDiscoveryOpen(false);
              setHyperOpen(false);
              setResearchOpen(false);
              setBookmarksOnly(false);
              setSelectedId(null);
            },
            discoveryCount,
            discoveryActive: discoveryOpen,
            onShowDiscovery: () => {
              setDiscoveryOpen(true);
              setHyperOpen(false);
              setStocksOpen(false);
              setSportsOpen(false);
              setReelsOpen(false);
              setResearchOpen(false);
              setBookmarksOnly(false);
              setSelectedId(null);
            },
            hyperActive: hyperOpen,
            onShowHyper: () => {
              setHyperOpen(true);
              setDiscoveryOpen(false);
              setStocksOpen(false);
              setSportsOpen(false);
              setReelsOpen(false);
              setResearchOpen(false);
              setBookmarksOnly(false);
              setSelectedId(null);
            },
            stocksActive: stocksOpen,
            onShowStocks: () => {
              setStocksOpen(true);
              setSportsOpen(false);
              setDiscoveryOpen(false);
              setHyperOpen(false);
              setReelsOpen(false);
              setResearchOpen(false);
              setBookmarksOnly(false);
              setSelectedId(null);
            },
            sportsActive: sportsOpen,
            onShowSports: () => {
              setSportsOpen(true);
              setStocksOpen(false);
              setDiscoveryOpen(false);
              setHyperOpen(false);
              setReelsOpen(false);
              setResearchOpen(false);
              setBookmarksOnly(false);
              setSelectedId(null);
            },
            researchActive: researchOpen,
            onShowResearch: () => {
              setResearchOpen(true);
              setSportsOpen(false);
              setStocksOpen(false);
              setDiscoveryOpen(false);
              setHyperOpen(false);
              setReelsOpen(false);
              setBookmarksOnly(false);
              setSelectedId(null);
            },
            flashPending: mediaPipelineEnabled ? flashPending : null
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "flex-1 min-h-0 overflow-hidden relative", children: externalView ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          ExternalReader,
          {
            url: externalView.url,
            title: externalView.title,
            subtitle: externalView.subtitle,
            initialReader: externalView.initialReader,
            onClose: () => setExternalView(null),
            onLinkClick: handleOpenURL
          }
        ) : stocksOpen ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          StocksPage,
          {
            onClose: () => {
              setStocksOpen(false);
              setPendingStockSymbol(null);
            },
            initialTickerSymbol: pendingStockSymbol,
            onOpenURL: handleOpenURL,
            onOpenArticle: handleTickerOpenArticle,
            onOpenIpoBrief: handleOpenIpoBrief
          }
        ) : sportsOpen ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          SportsPage,
          {
            onClose: () => {
              setSportsOpen(false);
              setPendingGame(null);
            },
            initialGame: pendingGame,
            onOpenURL: handleOpenURL
          }
        ) : researchOpen ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          ResearchPage,
          {
            onClose: () => setResearchOpen(false),
            onOpenURL: handleOpenURL
          }
        ) : discoveryOpen ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          Discovery,
          {
            onClose: () => {
              setDiscoveryOpen(false);
              setHyperOpen(false);
              void refreshDiscoveryCount();
            }
          }
        ) : hyperOpen ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          Hyperintelligence,
          {
            onClose: () => setHyperOpen(false),
            onFeedsChanged: () => {
              void refresh();
              void refreshCategories();
            },
            onOpenURL: handleOpenURL,
            onOpenArticle: handleTickerOpenArticle,
            onOpenSettings: (tab) => {
              setSettingsInitialTab(tab);
              setSettingsOpen(true);
            }
          }
        ) : reelsOpen ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          Reels,
          {
            onClose: () => {
              setReelsOpen(false);
              void refreshReelsCount();
            },
            onOpenArticle: handleTickerOpenArticle
          }
        ) : selected ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          ArticleReader,
          {
            article: selected,
            onBack: () => setSelectedId(null),
            onToggleBookmark: handleToggleBookmark,
            onMakeFlash: mediaPipelineEnabled ? handleMakeFlash : void 0,
            flashPendingForThis: mediaPipelineEnabled ? flashPending?.articleId === selected.id : false
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          FeedView,
          {
            heading: viewHeading,
            lookupContext: feedLookupContext,
            articles,
            loading,
            onSelect: handleSelect,
            onOpenAnyArticle: handleTickerOpenArticle,
            onRefresh: handleRefresh,
            calendarFilter,
            onOpenStock: handleTickerOpenStock,
            onOpenGame: handleCalendarOpenGame,
            onOpenURL: handleOpenURL,
            onOpenIpoBrief: handleOpenIpoBrief
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SmartLookupLayer, { viewKey, onOpenURL: handleOpenURL }),
        settingsOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
          Settings,
          {
            onClose: () => {
              setSettingsOpen(false);
              setSettingsInitialTab(void 0);
            },
            onDataChanged: handleSettingsChange,
            initialTab: settingsInitialTab
          }
        ),
        findOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
          FindBar,
          {
            webview: document.querySelector("webview"),
            onClose: () => setFindOpen(false)
          }
        )
      ]
    }
  );
}
function TitleBar({
  onRefresh,
  onOpenSettings
}) {
  const [busy, setBusy] = reactExports.useState(false);
  const [aiStatus, setAiStatus] = reactExports.useState("offline");
  reactExports.useEffect(() => {
    void window.api.app.getOllamaStatus().then(setAiStatus);
    const unsub = window.api.app.onOllamaStatusChange(setAiStatus);
    return unsub;
  }, []);
  const click = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "drag h-11 flex items-center justify-between px-4 border-b border-edge bg-surface-1/80 backdrop-blur", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-16" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-2 h-2 rounded-full bg-accent" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] tracking-[0.28em] uppercase text-zinc-200 font-semibold", children: "Pulse" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "span",
        {
          title: aiStatus === "online" ? "AI scoring online" : "AI scoring offline — run Ollama to enable",
          className: `no-drag flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] ${aiStatus === "online" ? "text-emerald-400" : "text-zinc-500"}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `inline-block w-1.5 h-1.5 rounded-full ${aiStatus === "online" ? "bg-emerald-400" : "bg-zinc-600"}`
              }
            ),
            "AI"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: click,
          disabled: busy,
          className: "no-drag text-[11px] text-zinc-400 hover:text-zinc-100 disabled:text-zinc-600",
          children: busy ? "Refreshing…" : "Refresh"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onOpenSettings,
          className: "no-drag w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-surface-2",
          title: "Settings",
          children: "⚙"
        }
      )
    ] })
  ] });
}
const TICKER_MODES = ["markets", "stories", "sports"];
const TICKER_MODE_STYLES = {
  markets: {
    label: "Markets",
    bgTint: "bg-emerald-500/10 hover:bg-emerald-500/20",
    dot: "bg-emerald-400",
    text: "text-emerald-300"
  },
  stories: {
    label: "Top Stories",
    bgTint: "bg-accent/10 hover:bg-accent/20",
    dot: "bg-accent",
    text: "text-accent"
  },
  sports: {
    label: "Sports",
    bgTint: "bg-orange-500/10 hover:bg-orange-500/20",
    dot: "bg-orange-400",
    text: "text-orange-300"
  }
};
function TickerStrip({
  onOpenStock,
  onOpenArticle,
  onOpenGame
}) {
  const [mode, setMode] = reactExports.useState("markets");
  const style = TICKER_MODE_STYLES[mode];
  const cycle = () => {
    setMode((m) => TICKER_MODES[(TICKER_MODES.indexOf(m) + 1) % TICKER_MODES.length]);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ticker-strip h-9 shrink-0 border-b border-edge bg-surface-1/40 overflow-hidden flex items-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: cycle,
        title: "Click to cycle: Markets → Top Stories → Sports",
        className: `no-drag shrink-0 flex items-center gap-2 px-4 h-full border-r border-edge transition-colors ${style.bgTint}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `w-2 h-2 rounded-full ${style.dot}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[10px] font-bold uppercase tracking-[0.24em] ${style.text}`, children: style.label })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ticker-viewport flex-1 overflow-hidden", children: mode === "markets" ? /* @__PURE__ */ jsxRuntimeExports.jsx(MarketsReel, { onOpenStock }) : mode === "stories" ? /* @__PURE__ */ jsxRuntimeExports.jsx(StoriesReel, { onOpenArticle }) : /* @__PURE__ */ jsxRuntimeExports.jsx(SportsReel, { onOpenGame }) })
  ] });
}
function useTickerAutoScroll(viewportRef, trackRef, pixelsPerSecond = 28) {
  reactExports.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let rafId = 0;
    let last = performance.now();
    let pointerOver = false;
    const onEnter = () => {
      pointerOver = true;
    };
    const onLeave = () => {
      pointerOver = false;
    };
    viewport.addEventListener("pointerenter", onEnter);
    viewport.addEventListener("pointerleave", onLeave);
    const tick = (now) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const v = viewportRef.current;
      const t = trackRef.current;
      const occluded = document.body.classList.contains("pulse-hidden");
      if (v && t && !pointerOver && !occluded) {
        const halfWidth = t.scrollWidth / 2;
        if (halfWidth > 0) {
          let next = v.scrollLeft + pixelsPerSecond * dt / 1e3;
          if (next >= halfWidth) next -= halfWidth;
          v.scrollLeft = next;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      viewport.removeEventListener("pointerenter", onEnter);
      viewport.removeEventListener("pointerleave", onLeave);
    };
  }, [viewportRef, trackRef, pixelsPerSecond]);
}
function MarketsReel({ onOpenStock }) {
  const [quotes, setQuotes] = reactExports.useState([]);
  const [tickers, setTickers] = reactExports.useState([]);
  reactExports.useEffect(() => {
    void window.api.stocks.getQuotes().then(setQuotes).catch((err) => {
      console.warn("[ui] stocks.getQuotes failed:", err);
    });
    const unsub = window.api.stocks.onUpdated(setQuotes);
    void window.api.tickers.list().then(setTickers).catch((err) => {
      console.warn("[ui] tickers.list failed:", err);
    });
    return unsub;
  }, []);
  const sectorGroups = reactExports.useMemo(() => {
    const bySymbol = new Map(tickers.map((t) => [t.symbol, t]));
    const sectorOrder = [];
    const buckets = /* @__PURE__ */ new Map();
    for (const q of quotes) {
      if (q.price === null) continue;
      const sector = bySymbol.get(q.symbol)?.sector?.trim() || "Other";
      if (!buckets.has(sector)) {
        buckets.set(sector, []);
        sectorOrder.push(sector);
      }
      buckets.get(sector).push(q);
    }
    return sectorOrder.map((s) => ({ sector: s, quotes: buckets.get(s) }));
  }, [quotes, tickers]);
  const doubled = reactExports.useMemo(() => {
    const cells = [];
    for (const g of sectorGroups) {
      cells.push({ kind: "header", sector: g.sector, key: `mh-${g.sector}` });
      g.quotes.forEach((q, i) => {
        if (i > 0) cells.push({ kind: "sep", key: `msep-${g.sector}-${q.symbol}` });
        cells.push({ kind: "quote", quote: q, key: `mq-${g.sector}-${q.symbol}` });
      });
    }
    return [...cells, ...cells.map((c) => ({ ...c, key: `${c.key}-x` }))];
  }, [sectorGroups]);
  const viewportRef = reactExports.useRef(null);
  const trackRef = reactExports.useRef(null);
  useTickerAutoScroll(viewportRef, trackRef);
  if (sectorGroups.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsx(ReelPlaceholder, { text: "Awaiting quotes\\u2026" });
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: viewportRef,
      className: "h-full overflow-x-auto overflow-y-hidden scrollbar-none",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          ref: trackRef,
          className: "flex items-center gap-4 whitespace-nowrap pl-8",
          children: doubled.map((cell) => {
            if (cell.kind === "header") {
              return /* @__PURE__ */ jsxRuntimeExports.jsx(SectorHeaderChip, { sector: cell.sector }, cell.key);
            }
            if (cell.kind === "sep") {
              return /* @__PURE__ */ jsxRuntimeExports.jsx(TickerDivider, {}, cell.key);
            }
            return /* @__PURE__ */ jsxRuntimeExports.jsx(
              StockTickerItem,
              {
                quote: cell.quote,
                onOpen: () => onOpenStock(cell.quote.symbol)
              },
              cell.key
            );
          })
        }
      )
    }
  );
}
function SectorHeaderChip({ sector }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] font-bold text-emerald-300", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-3 w-px bg-emerald-400/50" }),
    sector,
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600 font-normal", children: "—" })
  ] });
}
function StoriesReel({
  onOpenArticle
}) {
  const [articles, setArticles] = reactExports.useState([]);
  reactExports.useEffect(() => {
    let cancelled = false;
    let intervalId = null;
    const load = async () => {
      try {
        const a = await window.api.articles.list({ limit: 25 });
        if (!cancelled) setArticles(a);
      } catch {
        if (!cancelled) setArticles([]);
      }
    };
    const startInterval = () => {
      if (intervalId) return;
      intervalId = setInterval(() => void load(), 12e4);
    };
    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        void load();
        startInterval();
      }
    };
    void load();
    if (!document.hidden) startInterval();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  const viewportRef = reactExports.useRef(null);
  const trackRef = reactExports.useRef(null);
  useTickerAutoScroll(viewportRef, trackRef);
  if (articles.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsx(ReelPlaceholder, { text: "Fetching headlines…" });
  const items = [...articles, ...articles];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: viewportRef,
      className: "h-full overflow-x-auto overflow-y-hidden scrollbar-none",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          ref: trackRef,
          className: "flex items-center gap-4 whitespace-nowrap pl-8",
          children: items.flatMap((a, i) => {
            const key = `s-${a.id}-${i}`;
            return [
              /* @__PURE__ */ jsxRuntimeExports.jsx(StoryTickerItem, { article: a, onOpen: () => onOpenArticle(a.id) }, key),
              /* @__PURE__ */ jsxRuntimeExports.jsx(TickerDivider, {}, `${key}-d`)
            ];
          })
        }
      )
    }
  );
}
function StoryTickerItem({
  article,
  onOpen
}) {
  const tier = urgencyTier(article.urgencyScore);
  const badgeColor = tier === "urgent" ? "text-red-300" : tier === "medium" ? "text-amber-300" : "text-sky-400";
  const label = tier === "urgent" ? "URGENT" : tier === "medium" ? "WATCH" : article.feedTitle.toUpperCase();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick: onOpen,
      title: article.title,
      className: "flex items-center gap-2 text-[11px] hover:bg-surface-2/80 rounded px-2 py-0.5 -mx-2 transition-colors",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `font-bold uppercase tracking-[0.16em] shrink-0 ${badgeColor}`, children: label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-200 truncate max-w-[420px]", children: article.title })
      ]
    }
  );
}
function SportsReel({ onOpenGame }) {
  const [groups, setGroups] = reactExports.useState([]);
  const [warmed, setWarmed] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let cancelled = false;
    void window.api.sports.getReelGroups().then((snap) => {
      if (cancelled) return;
      setGroups(snap.groups);
      setWarmed(snap.warmed);
    });
    const off = window.api.sports.onReelUpdated((snap) => {
      setGroups(snap.groups);
      setWarmed(snap.warmed);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);
  const sportById = reactExports.useMemo(() => {
    const m = {};
    for (const g of groups) for (const game of g.games) m[game.id] = g.league.sport;
    return m;
  }, [groups]);
  if (!warmed && groups.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsx(ReelPlaceholder, { text: "Warming up scoreboard…" });
  if (groups.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsx(ReelPlaceholder, { text: "No games to show right now" });
  const cells = [];
  for (const g of groups) {
    cells.push({ kind: "header", league: g.league, key: `h-${g.league.id}` });
    g.games.forEach((game, i) => {
      if (i > 0) cells.push({ kind: "sep", key: `s-${g.league.id}-${i}` });
      cells.push({ kind: "game", game, key: `g-${game.id}` });
    });
  }
  const doubled = [...cells, ...cells.map((c) => ({ ...c, key: `${c.key}-x` }))];
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    SportsReelView,
    {
      doubled,
      sportById,
      onOpenGame
    }
  );
}
function SportsReelView({
  doubled,
  sportById,
  onOpenGame
}) {
  const viewportRef = reactExports.useRef(null);
  const trackRef = reactExports.useRef(null);
  useTickerAutoScroll(viewportRef, trackRef);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: viewportRef,
      className: "h-full overflow-x-auto overflow-y-hidden scrollbar-none",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          ref: trackRef,
          className: "flex items-center gap-5 whitespace-nowrap pl-8",
          children: doubled.map((cell) => {
            if (cell.kind === "header") {
              return /* @__PURE__ */ jsxRuntimeExports.jsx(LeagueHeaderChip, { league: cell.league }, cell.key);
            }
            if (cell.kind === "sep") {
              return /* @__PURE__ */ jsxRuntimeExports.jsx(TickerDivider, {}, cell.key);
            }
            return /* @__PURE__ */ jsxRuntimeExports.jsx(
              GameTickerItem,
              {
                game: cell.game,
                sport: sportById[cell.game.id] ?? "",
                onOpen: () => onOpenGame(cell.game)
              },
              cell.key
            );
          })
        }
      )
    }
  );
}
function LeagueHeaderChip({ league }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] font-bold text-orange-300", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-3 w-px bg-orange-400/50" }),
    league.shortName,
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600 font-normal", children: "—" })
  ] });
}
function formatLiveShortLabel(game) {
  const short = (game.statusShort ?? "").trim();
  const detail = (game.statusDetail ?? "").trim();
  const clock = (game.displayClock ?? "").trim();
  const period = game.period;
  if (game.leagueId === "mlb") {
    const src = short && !/^0:00$/.test(short) ? short : detail;
    if (src) {
      const m = /^(top|bot|bottom|mid|middle|end)\s+(\d+)/i.exec(src);
      if (m) {
        const phase = m[1].toLowerCase();
        const inning = m[2];
        if (phase === "top") return `↑ ${inning}`;
        if (phase === "bot" || phase === "bottom") return `↓ ${inning}`;
        if (phase === "mid" || phase === "middle") return `MID ${inning}`;
        if (phase === "end") return `END ${inning}`;
      }
      return src.toUpperCase();
    }
    if (period !== null) return `INN ${period}`;
    return "LIVE";
  }
  const prefixByLeague = {
    nba: "Q",
    nfl: "Q",
    nhl: "P"
  };
  const prefix = prefixByLeague[game.leagueId];
  if (prefix && period !== null) {
    if (clock) return `${prefix}${period} ${clock}`;
    return `${prefix}${period}`;
  }
  if (clock && clock !== "0:00") return clock;
  if (short && short !== "0:00") return short;
  return "LIVE";
}
function GameTickerItem({
  game,
  sport,
  onOpen
}) {
  const isLive = game.status === "in_progress";
  const isFinal = game.status === "final";
  const isUpcoming = game.status === "scheduled";
  const timeLabel = isLive ? formatLiveShortLabel(game) : isFinal ? "FINAL" : isUpcoming ? new Date(game.date).toLocaleTimeString(void 0, {
    hour: "numeric",
    minute: "2-digit"
  }) : game.statusShort || game.status.toUpperCase();
  const statusColor = isLive ? "text-red-300" : isFinal ? "text-zinc-500" : "text-zinc-400";
  const scoreEvent = useScoreEvent(game);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick: onOpen,
      title: `${game.away.shortName} @ ${game.home.shortName}`,
      className: "flex items-center gap-2 text-[11px] hover:bg-surface-2/80 rounded px-2 py-0.5 -mx-2 transition-colors shrink-0",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `font-bold uppercase tracking-[0.16em] tabular-nums shrink-0 min-w-[52px] ${statusColor}`, children: timeLabel }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative font-semibold tracking-[0.08em] text-zinc-100", children: [
          game.away.abbreviation,
          game.away.score !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 tabular-nums", children: game.away.score }) : null,
          scoreEvent?.side === "away" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute -top-3 right-0 translate-x-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            ScoreFlourish,
            {
              event: scoreEvent,
              sport,
              size: "sm",
              teamColor: game.away.color ?? game.away.altColor
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600", children: "@" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative font-semibold tracking-[0.08em] text-zinc-100", children: [
          game.home.abbreviation,
          game.home.score !== null ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 tabular-nums", children: game.home.score }) : null,
          scoreEvent?.side === "home" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute -top-3 right-0 translate-x-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            ScoreFlourish,
            {
              event: scoreEvent,
              sport,
              size: "sm",
              teamColor: game.home.color ?? game.home.altColor
            }
          ) })
        ] })
      ]
    }
  );
}
function ReelPlaceholder({ text }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pl-6 text-[11px] uppercase tracking-[0.18em] text-zinc-600", children: text });
}
function TickerDivider() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      "aria-hidden": true,
      style: {
        display: "inline-block",
        width: 2,
        height: 18,
        backgroundColor: "rgba(161, 161, 170, 0.55)",
        borderRadius: 1,
        flexShrink: 0
      }
    }
  );
}
function StockTickerItem({
  quote,
  onOpen
}) {
  const rq = resolveDisplayQuote(quote);
  const up = (rq.change ?? 0) > 0;
  const down = (rq.change ?? 0) < 0;
  const color = up ? "text-emerald-400" : down ? "text-red-400" : "text-zinc-400";
  const arrow = up ? "▲" : down ? "▼" : "·";
  const pct = rq.changePct !== null ? `${rq.changePct >= 0 ? "+" : ""}${rq.changePct.toFixed(2)}%` : "—";
  const price = rq.price !== null ? rq.price.toFixed(2) : "—";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick: onOpen,
      title: rq.sessionBadge ? `${quote.symbol} · ${rq.sessionBadge} ${price} (${pct})` : `Open ${quote.symbol}`,
      className: `flex items-center gap-2 text-[11px] hover:bg-surface-2/80 rounded px-2 py-0.5 -mx-2 transition-colors shrink-0 ${rq.sessionBadge ? "min-w-[175px]" : "min-w-[130px]"}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold tracking-[0.14em] text-zinc-100", children: quote.symbol }),
        rq.sessionBadge && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-semibold uppercase tracking-[0.18em] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40", children: rq.sessionBadge }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums text-zinc-300", children: price }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `tabular-nums font-semibold ${color} whitespace-nowrap`, children: [
          arrow,
          " ",
          pct
        ] })
      ]
    }
  );
}
const FeedSource = reactExports.memo(function FeedSource2({ article }) {
  const fallback = /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      className: `w-4 h-4 rounded-sm shrink-0 flex items-center justify-center text-[9px] font-bold ${article.domain === "finance" ? "bg-amber-400/15 text-amber-300" : "bg-blue-400/15 text-blue-300"}`,
      children: article.feedTitle.charAt(0).toUpperCase()
    }
  );
  if (!article.feedIconURL) return fallback;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "img",
    {
      src: article.feedIconURL,
      alt: "",
      className: "w-4 h-4 rounded-sm shrink-0 object-cover bg-surface-2",
      onError: (e) => {
        e.currentTarget.style.display = "none";
      }
    }
  );
});
function BoltIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "svg",
    {
      viewBox: "0 0 24 24",
      "aria-hidden": true,
      className: "w-3 h-3 text-yellow-300",
      fill: "currentColor",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M13 2 4 14h6l-1 8 9-12h-6l1-8z" })
    }
  );
}
function FlashToolbarIcon({
  state
}) {
  const color = state === "added" || state === "exists" ? "text-yellow-300" : state === "failed" ? "text-red-400" : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "svg",
    {
      viewBox: "0 0 24 24",
      "aria-hidden": true,
      className: `w-3.5 h-3.5 ${color} ${state === "pending" ? "animate-pulse" : ""}`,
      fill: "currentColor",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M13 2 4 14h6l-1 8 9-12h-6l1-8z" })
    }
  );
}
function BookmarkStarIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "svg",
    {
      viewBox: "0 0 24 24",
      "aria-hidden": true,
      className: "w-3 h-3 text-purple-300",
      fill: "currentColor",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "m12 17.3-5.87 3.46 1.58-6.65L2.6 9.72l6.81-.55L12 3l2.59 6.17 6.81.55-5.11 4.39 1.58 6.65z" })
    }
  );
}
function HyperSparkIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "svg",
    {
      viewBox: "0 0 24 24",
      "aria-hidden": true,
      className: "w-3 h-3 text-teal-300",
      fill: "currentColor",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 2 13.6 8.4 20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2zm6 12 .9 2.9L22 18l-3.1.9L18 22l-.9-3.1L14 18l3.1-1.1L18 14z" })
    }
  );
}
function DiscoveryDiamondIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "svg",
    {
      viewBox: "0 0 24 24",
      "aria-hidden": true,
      className: "w-3 h-3 text-sky-400",
      fill: "currentColor",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M12 2 2 12l10 10 10-10L12 2zm0 3.2L18.8 12 12 18.8 5.2 12 12 5.2z" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "2.2" })
      ]
    }
  );
}
function TopNav({
  filter,
  onFilterChange,
  categories,
  recentCounts,
  selectedCategoryId,
  onSelectCategory,
  bookmarksActive,
  bookmarkCount,
  onShowBookmarks,
  reelsCount,
  reelsActive,
  reelsAvailable,
  onShowReels,
  discoveryCount,
  discoveryActive,
  onShowDiscovery,
  hyperActive,
  onShowHyper,
  stocksActive,
  onShowStocks,
  sportsActive,
  onShowSports,
  researchActive,
  onShowResearch,
  flashPending
}) {
  const primaryActive = !bookmarksActive && selectedCategoryId === null && !discoveryActive && !hyperActive && !stocksActive && !sportsActive && !researchActive && !reelsActive;
  const visibleCategories = categories.filter((c) => {
    if (filter === "finance") return c.domain === "finance";
    if (filter === "news") return c.domain === "general";
    return true;
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("nav", { className: "border-b border-edge bg-surface-1/50 backdrop-blur", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 px-6 pt-3", children: [
      ["all", "finance", "news"].map((key) => {
        const active = primaryActive && filter === key;
        const label = key === "all" ? "Top Stories" : key === "finance" ? "Finance" : "News";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => onFilterChange(key),
            className: `relative px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`,
            children: [
              label,
              active && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `absolute left-2 right-2 -bottom-px h-[2px] rounded-full ${key === "all" ? "bg-red-500" : key === "finance" ? "bg-yellow-400" : "bg-accent"}`
                }
              )
            ]
          },
          key
        );
      }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onShowStocks,
          className: `relative px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${stocksActive ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`,
          children: [
            "Stocks",
            stocksActive && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute left-2 right-2 -bottom-px h-[2px] bg-emerald-400 rounded-full" })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onShowSports,
          className: `relative px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${sportsActive ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`,
          children: [
            "Sports",
            sportsActive && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute left-2 right-2 -bottom-px h-[2px] bg-orange-400 rounded-full" })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onShowResearch,
          className: `relative px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors ${researchActive ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`,
          children: [
            "Research",
            researchActive && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute left-2 right-2 -bottom-px h-[2px] bg-violet-400 rounded-full" })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-px h-5 bg-edge mx-2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onShowBookmarks,
          className: `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${bookmarksActive ? "bg-purple-500/15 text-purple-300 ring-1 ring-inset ring-purple-400/30" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(BookmarkStarIcon, {}),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Bookmarks" }),
            bookmarkCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums text-[10px] text-zinc-500", children: bookmarkCount })
          ]
        }
      ),
      reelsAvailable && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onShowReels,
          className: `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${reelsActive ? "bg-yellow-300/15 text-yellow-200 ring-1 ring-inset ring-yellow-300/30" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(BoltIcon, {}),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Flash" }),
            reelsCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums text-[10px] text-zinc-500", children: reelsCount })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onShowDiscovery,
          className: `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${discoveryActive ? "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/30" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(DiscoveryDiamondIcon, {}),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Discovery" }),
            discoveryCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums text-[10px] px-1.5 py-px rounded-full bg-sky-500 text-white", children: discoveryCount })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: onShowHyper,
          className: `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${hyperActive ? "bg-teal-500/15 text-teal-200 ring-1 ring-inset ring-teal-400/30" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"}`,
          title: "Find feeds by asking the local AI",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(HyperSparkIcon, {}),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Hyperintelligence" })
          ]
        }
      ),
      flashPending && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] bg-yellow-300/10 text-yellow-200 ring-1 ring-inset ring-yellow-300/25",
          title: flashPending.title,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative flex h-2 w-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-60 animate-ping" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "relative inline-flex h-2 w-2 rounded-full bg-yellow-300" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Generating Flash" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "max-w-[340px] truncate text-zinc-400", children: flashPending.title })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1.5 px-6 py-2.5 overflow-x-auto scrollbar-none", children: visibleCategories.map((c) => {
      const active = selectedCategoryId === c.id;
      const count = recentCounts[c.id] ?? 0;
      const accent = c.domain === "finance" ? "amber" : "blue";
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => onSelectCategory(c.id),
          title: `${c.name} — ${count} new in the last 24h`,
          className: `shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors ${active ? accent === "amber" ? "bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/30" : "bg-blue-400/15 text-blue-200 ring-1 ring-inset ring-blue-400/30" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `w-1 h-1 rounded-full ${accent === "amber" ? "bg-amber-400" : "bg-blue-400"}`
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "whitespace-nowrap", children: c.name }),
            count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums text-[10px] text-zinc-500", children: count })
          ]
        },
        c.id
      );
    }) })
  ] });
}
function FeedView({
  heading,
  lookupContext,
  articles,
  loading,
  onSelect,
  onOpenAnyArticle,
  onRefresh,
  calendarFilter,
  onOpenStock,
  onOpenGame,
  onOpenURL,
  onOpenIpoBrief
}) {
  const dateGroups = reactExports.useMemo(() => groupArticlesByDate(articles), [articles]);
  const [selectedDateKey, setSelectedDateKey] = reactExports.useState(null);
  reactExports.useEffect(() => {
    if (dateGroups.length === 0) {
      setSelectedDateKey(null);
      return;
    }
    if (selectedDateKey && dateGroups.some((g) => g.key === selectedDateKey)) return;
    const today = dateKey(/* @__PURE__ */ new Date());
    if (dateGroups.some((g) => g.key === today)) {
      setSelectedDateKey(today);
      return;
    }
    setSelectedDateKey(dateGroups[dateGroups.length - 1].key);
  }, [dateGroups, selectedDateKey]);
  if (loading && articles.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsx(FeedSkeleton, { heading });
  if (articles.length === 0) return /* @__PURE__ */ jsxRuntimeExports.jsx(FeedEmpty, { heading, onRefresh });
  const currentGroup = dateGroups.find((g) => g.key === selectedDateKey) ?? dateGroups[dateGroups.length - 1];
  const dateArticles = currentGroup?.articles ?? [];
  const hero = dateArticles.find((a) => (a.urgencyScore ?? 0) >= 4) ?? dateArticles[0];
  const rest = hero ? diversifyBySource(dateArticles.filter((a) => a.id !== hero.id)) : [];
  const urgentCount = articles.filter((a) => (a.urgencyScore ?? 0) >= 4).length;
  const unreadCount = articles.filter((a) => !a.isRead).length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full overflow-y-auto", "data-lookup-context": lookupContext, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(FeedHeader, { heading, totalCount: articles.length, urgentCount, unreadCount }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(MacroPanel, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(MorningBrief, { onOpenArticle: onOpenAnyArticle, onOpenSymbol: onOpenStock }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      CalendarStrip,
      {
        filter: calendarFilter,
        onOpenStock,
        onOpenGame,
        onOpenURL,
        onOpenIpoBrief
      }
    ),
    dateGroups.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx(
      ArticleDateRail,
      {
        groups: dateGroups,
        selectedKey: currentGroup?.key ?? null,
        onSelect: setSelectedDateKey
      }
    ),
    hero && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 pt-4 pb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(HeroCard, { article: hero, onSelect }) }),
    rest.length > 0 && currentGroup && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "px-6 pt-2 pb-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: dateLongLabel(currentGroup.key) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: dateArticles.length })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr", children: rest.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(FeedCard, { article: a, onSelect }, a.id)) })
    ] })
  ] });
}
function FeedHeader({
  heading,
  totalCount,
  urgentCount,
  unreadCount
}) {
  const now = /* @__PURE__ */ new Date();
  const dateStr = now.toLocaleDateString(void 0, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "px-6 pt-6 pb-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end justify-between gap-6 flex-wrap", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: `text-[10px] font-semibold uppercase tracking-[0.28em] mb-1.5 ${heading.eyebrowClass}`,
          children: heading.eyebrow
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[28px] leading-none font-bold text-zinc-50 tracking-tight", children: heading.title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500", children: dateStr })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-5 text-[11px] uppercase tracking-wider", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Stories", value: totalCount }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Unread", value: unreadCount, tone: "accent" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Urgent", value: urgentCount, tone: urgentCount > 0 ? "urgent" : "muted" })
    ] })
  ] }) });
}
function Stat({
  label,
  value,
  tone = "muted"
}) {
  const color = tone === "urgent" ? "text-red-400" : tone === "accent" ? "text-accent" : "text-zinc-300";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-end", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-lg font-semibold tabular-nums leading-none ${color}`, children: value }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-zinc-500 tracking-[0.2em] mt-1", children: label })
  ] });
}
function StocksViewTab({
  label,
  active,
  onClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick,
      className: `px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${active ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/40" : "text-zinc-400 hover:text-zinc-200"}`,
      children: label
    }
  );
}
function diversifyBySource(articles, { maxPerSource = 6, minGap = 2 } = {}) {
  if (articles.length <= 1) return articles;
  const counts = /* @__PURE__ */ new Map();
  const capped = [];
  for (const a of articles) {
    const n = counts.get(a.feedId) ?? 0;
    if (n >= maxPerSource) continue;
    counts.set(a.feedId, n + 1);
    capped.push(a);
  }
  const out = [];
  const remaining = [...capped];
  while (remaining.length > 0) {
    const recentIds = new Set(out.slice(-minGap).map((a) => a.feedId));
    let pickIdx = remaining.findIndex((a) => !recentIds.has(a.feedId));
    if (pickIdx === -1) pickIdx = 0;
    out.push(remaining.splice(pickIdx, 1)[0]);
  }
  return out;
}
function groupArticlesByDate(articles) {
  const map = /* @__PURE__ */ new Map();
  for (const a of articles) {
    if (!a.publishedAt) continue;
    const d = new Date(a.publishedAt);
    const key = dateKey(d);
    let group = map.get(key);
    if (!group) {
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      group = { key, ts: midnight, articles: [] };
      map.set(key, group);
    }
    group.articles.push(a);
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
}
function ArticleDateRail({
  groups,
  selectedKey,
  onSelect
}) {
  const railRef = reactExports.useRef(null);
  const todayKey = dateKey(/* @__PURE__ */ new Date());
  reactExports.useEffect(() => {
    if (!railRef.current || !selectedKey) return;
    const el = railRef.current.querySelector(`[data-article-date="${selectedKey}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedKey]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: railRef,
      className: "px-6 py-3 flex items-stretch gap-1.5 overflow-x-auto scrollbar-none border-b border-edge",
      children: groups.map((g) => {
        const active = g.key === selectedKey;
        const isToday = g.key === todayKey;
        const unread = g.articles.filter((a) => !a.isRead).length;
        const urgent = g.articles.filter((a) => (a.urgencyScore ?? 0) >= 4).length;
        const { primary, sub } = dateShortLabel(g.key, todayKey);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            "data-article-date": g.key,
            onClick: () => onSelect(g.key),
            className: `shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg text-center transition-colors min-w-[68px] ${active ? "bg-accent/15 ring-1 ring-inset ring-accent/40 text-zinc-50" : isToday ? "text-zinc-200 hover:bg-surface-2 ring-1 ring-inset ring-edge" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 ring-1 ring-inset ring-transparent"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold tracking-[0.04em] leading-none", children: primary }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-[0.16em] tabular-nums text-zinc-500 leading-none", children: sub }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex items-center gap-1 mt-0.5 text-[10px] tabular-nums", children: urgent > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative flex w-1.5 h-1.5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute inset-0 rounded-full opacity-60 animate-ping bg-red-400" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "relative w-1.5 h-1.5 rounded-full bg-red-400" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-red-300", children: [
                  urgent,
                  " urgent"
                ] })
              ] }) : unread > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-accent", children: [
                unread,
                " new"
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: g.articles.length }) })
            ]
          },
          g.key
        );
      })
    }
  );
}
function CoverageDateRail({
  groups
}) {
  const scrollTo = (key) => {
    const el = document.getElementById(`coverage-${key}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "sticky top-0 z-10 -mx-1 px-1 py-2 flex items-stretch gap-1.5 overflow-x-auto scrollbar-none bg-surface-0/95 backdrop-blur-sm border-b border-edge/60",
      children: groups.slice().reverse().map((g) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => scrollTo(g.key),
          className: "shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-[0.04em] text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 ring-1 ring-inset ring-transparent hover:ring-edge transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: g.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: g.count })
          ]
        },
        g.key
      ))
    }
  );
}
const URGENCY_STYLES = {
  urgent: {
    bar: "bg-red-500",
    glow: "shadow-[0_0_24px_rgba(239,68,68,0.35)]",
    badge: "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30",
    label: "Urgent"
  },
  medium: {
    bar: "bg-amber-400",
    glow: "",
    badge: "bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/25",
    label: "Watch"
  },
  low: {
    bar: "",
    glow: "",
    badge: "",
    label: ""
  }
};
function urgencyTier(score) {
  if (score !== null && score >= 4) return "urgent";
  if (score !== null && score >= 2) return "medium";
  return "low";
}
const UrgencyBadge = reactExports.memo(function UrgencyBadge2({
  article,
  size = "sm"
}) {
  const tier = urgencyTier(article.urgencyScore);
  if (tier === "low") return null;
  const styles = URGENCY_STYLES[tier];
  const paddings = size === "md" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      title: article.urgencyReason ?? "",
      className: `font-semibold uppercase tracking-[0.16em] rounded ${paddings} ${styles.badge}`,
      children: styles.label
    }
  );
});
const HeroCard = reactExports.memo(function HeroCard2({
  article,
  onSelect
}) {
  const tier = urgencyTier(article.urgencyScore);
  const styles = URGENCY_STYLES[tier];
  const domainAccent = article.domain === "finance" ? "text-amber-400" : "text-blue-400";
  const hasImage = Boolean(article.imageURL);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      onClick: () => onSelect(article.id),
      className: "hero-aurora group card-lift relative w-full text-left rounded-2xl overflow-hidden border border-edge bg-gradient-to-br from-surface-1 via-surface-1 to-surface-2 hover:from-surface-2 hover:via-surface-2 hover:to-surface-3 hover:shadow-[0_14px_40px_rgba(0,0,0,0.4)]",
      children: [
        tier !== "low" && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            "aria-hidden": true,
            className: `absolute left-0 top-0 bottom-0 w-1 ${styles.bar} ${styles.glow} z-10`
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "aria-hidden": true, className: "absolute inset-0 pointer-events-none opacity-[0.08] bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.6),_transparent_60%)]" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: `relative ${hasImage ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-7 md:p-9 order-2 lg:order-1 flex flex-col", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-5 flex-wrap", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-accent/90", children: "Leading now" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: "/" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(FeedSource, { article }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[11px] font-bold uppercase tracking-[0.18em] ${domainAccent}`, children: article.feedTitle }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(UrgencyBadge, { article, size: "md" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-[11px] uppercase tracking-[0.18em] text-zinc-500", children: formatRelativeTime(article.publishedAt) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[clamp(22px,3vw,34px)] font-bold leading-[1.15] tracking-tight text-zinc-50 mb-3 max-w-4xl group-hover:text-white", children: article.title }),
                article.summary && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[15px] leading-relaxed text-zinc-400 line-clamp-3 max-w-3xl", children: article.summary }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-zinc-400 group-hover:text-zinc-200 transition-colors", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Read article" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "transition-transform group-hover:translate-x-1", children: "→" }),
                  article.isBookmarked && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-amber-400 normal-case tracking-normal", children: "★ Saved" })
                ] })
              ] }),
              hasImage && /* @__PURE__ */ jsxRuntimeExports.jsx(HeroImage, { src: article.imageURL })
            ]
          }
        )
      ]
    }
  );
});
function HeroImage({ src }) {
  const [failed, setFailed] = reactExports.useState(false);
  if (failed) return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden lg:block" });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "order-1 lg:order-2 relative min-h-[200px] lg:min-h-[320px] bg-surface-2 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src,
        alt: "",
        loading: "lazy",
        onError: () => setFailed(true),
        className: "absolute inset-0 w-full h-full object-cover"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        "aria-hidden": true,
        className: "absolute inset-0 bg-gradient-to-r from-surface-1/90 via-surface-1/30 to-transparent lg:from-surface-1 lg:via-surface-1/60 lg:to-transparent"
      }
    )
  ] });
}
const FeedCard = reactExports.memo(function FeedCard2({
  article,
  onSelect,
  featured = false
}) {
  const tier = urgencyTier(article.urgencyScore);
  const styles = URGENCY_STYLES[tier];
  const domainAccent = article.domain === "finance" ? "text-amber-400" : "text-blue-400";
  const showImage = featured && Boolean(article.imageURL);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      onClick: () => onSelect(article.id),
      className: `group card-lift relative text-left rounded-xl border bg-surface-1 hover:bg-surface-2 overflow-hidden h-full flex ${showImage ? "flex-row" : "flex-col"} ${tier === "urgent" ? "border-red-500/30 hover:border-red-500/50 hover:shadow-[0_8px_24px_rgba(239,68,68,0.15)]" : "border-edge/70 hover:border-edge hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"}`,
      children: [
        tier !== "low" && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            "aria-hidden": true,
            className: `absolute left-0 top-0 bottom-0 w-[3px] ${styles.bar} ${styles.glow} z-10`
          }
        ),
        showImage && /* @__PURE__ */ jsxRuntimeExports.jsx(FeedCardImage, { src: article.imageURL }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 pl-6 flex-1 flex flex-col min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col min-h-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-3 flex-wrap", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FeedSource, { article }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[10px] font-bold uppercase tracking-[0.16em] truncate ${domainAccent}`, children: article.feedTitle }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(UrgencyBadge, { article }),
              article.isBookmarked && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-amber-400 text-xs shrink-0", children: "★" })
            ] }),
            article.summary ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "h3",
                {
                  className: `${featured ? "text-[20px]" : "text-[15px]"} font-semibold leading-snug mb-2 line-clamp-3 tracking-tight ${article.isRead ? "text-zinc-400" : "text-zinc-50 group-hover:text-white"}`,
                  children: article.title
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "p",
                {
                  className: `${featured ? "text-[13.5px] line-clamp-3" : "text-[12.5px] line-clamp-2"} leading-relaxed text-zinc-500`,
                  children: article.summary
                }
              )
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
              "h3",
              {
                className: `flex-1 flex items-center ${featured ? "text-[28px]" : "text-[22px]"} font-semibold leading-[1.15] tracking-tight line-clamp-6 ${article.isRead ? "text-zinc-400" : "text-zinc-50 group-hover:text-white"}`,
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block", children: article.title })
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 pt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500 border-t border-edge/40", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatRelativeTime(article.publishedAt) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-auto flex items-center gap-1.5", children: [
              !article.isRead && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-accent" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "transition-transform group-hover:translate-x-0.5", children: "→" })
            ] })
          ] })
        ] })
      ]
    }
  );
});
function FeedCardImage({ src }) {
  const [failed, setFailed] = reactExports.useState(false);
  if (failed) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative shrink-0 w-[38%] min-w-[180px] bg-surface-2 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src,
        alt: "",
        loading: "lazy",
        onError: () => setFailed(true),
        className: "absolute inset-0 w-full h-full object-cover"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        "aria-hidden": true,
        className: "absolute inset-y-0 right-0 w-16 bg-gradient-to-r from-transparent to-surface-1/80"
      }
    )
  ] });
}
function FeedSkeleton({
  heading
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full overflow-y-auto", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-6 pt-6 pb-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: `text-[10px] font-semibold uppercase tracking-[0.28em] mb-1.5 ${heading.eyebrowClass}`,
          children: heading.eyebrow
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[28px] leading-none font-bold text-zinc-50 tracking-tight", children: heading.title })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 pb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl border border-edge bg-surface-1 p-9 h-48 animate-pulse" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4", children: Array.from({ length: 6 }).map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "rounded-xl border border-edge/70 bg-surface-1 p-5 h-48 animate-pulse"
      },
      i
    )) })
  ] });
}
function FeedEmpty({
  heading,
  onRefresh
}) {
  const [busy, setBusy] = reactExports.useState(false);
  const click = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full overflow-y-auto flex flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-6 pt-6 pb-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: `text-[10px] font-semibold uppercase tracking-[0.28em] mb-1.5 ${heading.eyebrowClass}`,
          children: heading.eyebrow
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[28px] leading-none font-bold text-zinc-50 tracking-tight", children: heading.title })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex items-center justify-center p-8", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center max-w-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto mb-5 w-14 h-14 rounded-full border border-edge flex items-center justify-center text-zinc-500 text-xl", children: "◦" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs uppercase tracking-[0.28em] text-zinc-500 mb-2", children: "Nothing in this view" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-400 leading-relaxed mb-5", children: "Either there are no matching stories yet, or the next poll hasn't run. Pull the latest batch from your feeds below." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: click,
          disabled: busy,
          className: "px-4 py-2 rounded-full bg-accent text-white text-[11px] font-semibold uppercase tracking-[0.18em] hover:bg-accent/90 disabled:opacity-50",
          children: busy ? "Refreshing…" : "Refresh feeds"
        }
      )
    ] }) })
  ] });
}
function ArticleReader({
  article,
  onBack,
  onToggleBookmark,
  onMakeFlash,
  flashPendingForThis
}) {
  const webviewRef = reactExports.useRef(null);
  const autoFellBackRef = reactExports.useRef(false);
  const [loading, setLoading] = reactExports.useState(true);
  const [mode, setMode] = reactExports.useState("reader");
  const [reader, setReader] = reactExports.useState(null);
  const [readerLoading, setReaderLoading] = reactExports.useState(false);
  const [flashState, setFlashState] = reactExports.useState("idle");
  reactExports.useEffect(() => {
    setMode("reader");
    setReader(null);
    setReaderLoading(false);
    autoFellBackRef.current = false;
    setFlashState("idle");
  }, [article.id]);
  const makeFlash = reactExports.useCallback(async () => {
    if (!onMakeFlash) return;
    if (flashState === "pending" || flashState === "added" || flashState === "exists") return;
    setFlashState("pending");
    const res = await onMakeFlash(article.id, article.title);
    if (res.ok) setFlashState("added");
    else if (res.reason === "already-exists") setFlashState("exists");
    else setFlashState("failed");
  }, [article.id, article.title, flashState, onMakeFlash]);
  reactExports.useEffect(() => {
    if (flashPendingForThis && flashState === "idle") setFlashState("pending");
  }, [flashPendingForThis, flashState]);
  reactExports.useEffect(() => {
    if (mode === "reader" && !reader && !readerLoading) {
      void (async () => {
        setReaderLoading(true);
        try {
          const result = await window.api.reader.extract(article.url);
          setReader(result);
          if (result.status === "error" && !autoFellBackRef.current) {
            autoFellBackRef.current = true;
            setMode("web");
          }
        } finally {
          setReaderLoading(false);
        }
      })();
    }
  }, [article.id, mode, reader, readerLoading]);
  reactExports.useEffect(() => {
    if (mode !== "web") return;
    setLoading(true);
    const el = webviewRef.current;
    if (!el) return;
    const onStart = () => setLoading(true);
    const onStop = () => setLoading(false);
    el.addEventListener("did-start-loading", onStart);
    el.addEventListener("did-stop-loading", onStop);
    return () => {
      el.removeEventListener("did-start-loading", onStart);
      el.removeEventListener("did-stop-loading", onStop);
    };
  }, [article.id, mode]);
  const loadReader = reactExports.useCallback(async () => {
    setReaderLoading(true);
    try {
      const result = await window.api.reader.extract(article.url);
      setReader(result);
    } finally {
      setReaderLoading(false);
    }
  }, [article.url]);
  const reload = () => {
    if (mode === "web") {
      const el = webviewRef.current;
      el?.reload?.();
    } else {
      setReader(null);
      void loadReader();
    }
  };
  const openExternal = () => {
    if (article.url.startsWith("http")) {
      window.open(article.url, "_blank", "noreferrer");
    }
  };
  const toggleMode = () => {
    const next = mode === "web" ? "reader" : "web";
    setMode(next);
    if (next === "reader" && !reader && !readerLoading) void loadReader();
  };
  const readerLookupContext = `${article.domain === "finance" ? "Finance" : "General news"} article "${article.title}" from ${article.feedTitle}. Use surrounding sentences to pick the intended sense of any ambiguous term.`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden",
      "data-lookup-context": readerLookupContext,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "h-12 shrink-0 flex items-center gap-3 px-4 border-b border-edge bg-surface-1/60 backdrop-blur", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: onBack,
              className: "flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-zinc-300 hover:text-zinc-50 hover:bg-surface-2 transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-base leading-none", children: "←" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "uppercase tracking-[0.18em]", children: "Feed" })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-px h-5 bg-edge" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `inline-block w-1.5 h-1.5 rounded-full shrink-0 ${article.domain === "finance" ? "bg-amber-400" : "bg-blue-400"}`
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] uppercase tracking-[0.18em] text-zinc-300 truncate", children: article.feedTitle }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700 text-[10px]", children: "·" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 shrink-0", children: formatRelativeTime(article.publishedAt) }),
            (mode === "web" && loading || mode === "reader" && readerLoading) && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 ml-1", children: "loading…" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: toggleMode,
                title: "Toggle reader mode",
                className: `no-drag h-7 px-2 flex items-center justify-center rounded text-[10px] uppercase tracking-[0.18em] transition-colors ${mode === "reader" ? "bg-surface-2 text-zinc-100" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"}`,
                children: mode === "reader" ? "Web" : "Reader"
              }
            ),
            onMakeFlash && /* @__PURE__ */ jsxRuntimeExports.jsx(
              ToolbarButton,
              {
                label: flashState === "added" ? "Added to Flash" : flashState === "exists" ? "Already a Flash" : flashState === "pending" ? "Generating Flash…" : flashState === "failed" ? "Flash failed — click to retry" : "Make Flash",
                active: flashState === "added" || flashState === "exists",
                onClick: () => void makeFlash(),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(FlashToolbarIcon, { state: flashState })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ToolbarButton,
              {
                label: article.isBookmarked ? "Bookmarked" : "Bookmark",
                active: article.isBookmarked,
                onClick: () => onToggleBookmark(article),
                children: article.isBookmarked ? "★" : "☆"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ToolbarButton, { label: "Reload", onClick: reload, children: "↻" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ToolbarButton, { label: "Open in system browser", onClick: openExternal, children: "↗" })
          ] })
        ] }),
        mode === "web" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 bg-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "webview",
          {
            ref: (el) => {
              webviewRef.current = el;
            },
            src: article.url,
            partition: "persist:webview",
            style: { display: "flex", width: "100%", height: "100%" }
          }
        ) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          ReaderView,
          {
            article,
            reader,
            loading: readerLoading,
            onRetry: loadReader
          }
        )
      ]
    }
  );
}
function ReaderView({
  article,
  reader,
  loading,
  onRetry
}) {
  const readerBodyText = reactExports.useMemo(() => {
    const html = reader?.contentHTML;
    if (!html) return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    return text.slice(0, 4e3);
  }, [reader?.contentHTML]);
  if (loading && !reader) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 flex items-center justify-center text-sm text-zinc-500", children: "Extracting readable content…" });
  }
  if (!reader || reader.status === "error") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 flex items-center justify-center text-center px-8", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs uppercase tracking-[0.25em] text-zinc-600 mb-3", children: "Reader unavailable" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-500 max-w-sm mb-4", children: reader?.error ?? "Could not extract readable content from this page." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onRetry,
          className: "text-[11px] uppercase tracking-wider text-zinc-300 hover:text-zinc-100",
          children: "Retry"
        }
      )
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 overflow-y-auto bg-surface-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("article", { className: "select-text max-w-[720px] mx-auto px-8 py-12", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: reader.siteName ?? article.feedTitle }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: "·" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatRelativeTime(article.publishedAt) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[30px] font-bold text-zinc-50 leading-[1.2] tracking-tight mb-3", children: reader.title ?? article.title }),
    reader.byline && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-zinc-400 mb-8", children: reader.byline }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      WhyThisMatters,
      {
        articleId: article.id,
        title: article.title,
        summary: article.summary,
        body: readerBodyText
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "reader-content text-[15.5px] leading-[1.75] text-zinc-200",
        dangerouslySetInnerHTML: { __html: reader.contentHTML ?? "" }
      }
    )
  ] }) });
}
function SmartLookupLayer({
  viewKey,
  onOpenURL
}) {
  const [lookup, setLookup] = reactExports.useState({ kind: "idle" });
  const [docks, setDocks] = reactExports.useState([]);
  const dockIdRef = reactExports.useRef(0);
  reactExports.useEffect(() => {
    setDocks([]);
    setLookup({ kind: "idle" });
  }, [viewKey]);
  reactExports.useEffect(() => {
    const isEditable = (el) => {
      if (!el) return false;
      return Boolean(
        el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], webview')
      );
    };
    const handleMouseUp = (e) => {
      const target = e.target;
      if (target && target.closest("[data-lookup-ui]")) return;
      if (isEditable(target)) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (text.length === 0 || text.length > 120 || !/[A-Za-z0-9]/.test(text)) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const node = range.startContainer;
      const paragraphText = (node.nodeType === Node.TEXT_NODE ? node.parentElement?.textContent : node.textContent) ?? "";
      const anchor = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      const hintEl = anchor?.closest("[data-lookup-context]");
      const hint = hintEl?.dataset.lookupContext?.trim() ?? "";
      const mergedContext = hint ? `[Page context: ${hint}]
${paragraphText}`.slice(0, 500) : paragraphText.slice(0, 500);
      setLookup({ kind: "prompt", term: text, context: mergedContext, rect });
    };
    const handleDown = (e) => {
      const target = e.target;
      if (target && target.closest("[data-lookup-ui]")) return;
      setLookup((prev) => prev.kind === "idle" ? prev : { kind: "idle" });
    };
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleDown, true);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleDown, true);
    };
  }, []);
  const runLookup = reactExports.useCallback(async () => {
    if (lookup.kind !== "prompt") return;
    const { term, context, rect } = lookup;
    const id = ++dockIdRef.current;
    setDocks((prev) => [...prev, { id, minimized: false, kind: "loading", term, rect }]);
    setLookup({ kind: "idle" });
    try {
      const res = await window.api.reader.smartLookup(term, context);
      setDocks(
        (prev) => prev.map(
          (d) => d.id === id ? res ? { id, minimized: d.minimized, kind: "result", term, rect, result: res } : {
            id,
            minimized: d.minimized,
            kind: "error",
            term,
            rect,
            message: "No definition found."
          } : d
        )
      );
    } catch {
      setDocks(
        (prev) => prev.map(
          (d) => d.id === id ? { id, minimized: d.minimized, kind: "error", term, rect, message: "Lookup failed." } : d
        )
      );
    }
  }, [lookup]);
  const toggleDockMinimize = reactExports.useCallback((id) => {
    setDocks((prev) => prev.map((d) => d.id === id ? { ...d, minimized: !d.minimized } : d));
  }, []);
  const closeDock = reactExports.useCallback((id) => {
    setDocks((prev) => prev.filter((d) => d.id !== id));
  }, []);
  const dockLayout = reactExports.useMemo(() => computeDockLayout(docks), [docks]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    lookup.kind === "prompt" && /* @__PURE__ */ jsxRuntimeExports.jsx(SmartLookupChip, { state: lookup, onConfirm: () => void runLookup() }),
    docks.map((dock) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      SmartLookupDock,
      {
        dock,
        top: dockLayout.get(dock.id) ?? 80,
        onToggleMinimize: () => toggleDockMinimize(dock.id),
        onClose: () => closeDock(dock.id),
        onOpenURL
      },
      dock.id
    ))
  ] });
}
function SmartLookupChip({
  state,
  onConfirm
}) {
  const rect = state.rect;
  const chipWidth = 220;
  const gap = 8;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - chipWidth / 2, 12),
    vpW - chipWidth - 12
  );
  const aboveTop = rect.top - 36 - gap;
  const top = aboveTop >= 12 ? aboveTop : Math.min(rect.bottom + gap, vpH - 48);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-lookup-ui": true,
      className: "fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-zinc-900 border border-edge shadow-lg shadow-black/60",
      style: { top, left, width: chipWidth },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onConfirm,
            className: "text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300 hover:text-amber-200 px-1",
            children: "Look up"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-zinc-500 flex-1 truncate", children: [
          '"',
          state.term,
          '"'
        ] })
      ]
    }
  );
}
function computeDockLayout(docks) {
  const minTop = 80;
  const gap = 8;
  const bottomPad = 16;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 900;
  const sorted = [...docks].sort((a, b) => a.rect.top - b.rect.top);
  const positions = /* @__PURE__ */ new Map();
  let cursor = minTop;
  for (const d of sorted) {
    const height = d.minimized ? 40 : d.kind === "result" ? 260 : 90;
    const raw = Math.max(d.rect.top - 8, minTop);
    let top = Math.max(raw, cursor);
    const maxTop = viewportH - height - bottomPad;
    if (top > maxTop) top = Math.max(minTop, maxTop);
    positions.set(d.id, top);
    cursor = top + height + gap;
  }
  return positions;
}
function SmartLookupDock({
  dock,
  top,
  onToggleMinimize,
  onClose,
  onOpenURL
}) {
  const { minimized } = dock;
  const title = dock.kind === "result" && dock.result.title ? dock.result.title : dock.term;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      "data-lookup-ui": true,
      className: `fixed right-6 z-40 rounded-lg bg-zinc-900/95 backdrop-blur border border-edge shadow-xl shadow-black/60 overflow-hidden transition-[width] ${minimized ? "w-[220px]" : "w-[300px]"}`,
      style: { top },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-edge", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300", children: "Lookup" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "text-[11px] text-zinc-300 truncate flex-1",
              title,
              children: title
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onToggleMinimize,
              className: "text-zinc-500 hover:text-zinc-200 text-sm leading-none px-1",
              "aria-label": minimized ? "Expand" : "Minimize",
              title: minimized ? "Expand" : "Minimize",
              children: minimized ? "+" : "–"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onClose,
              className: "text-zinc-500 hover:text-zinc-200 text-sm leading-none px-1",
              "aria-label": "Close",
              title: "Close",
              children: "×"
            }
          )
        ] }),
        !minimized && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-3 py-3 text-[12.5px] leading-[1.55] text-zinc-200 max-h-[320px] overflow-y-auto", children: [
          dock.kind === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: "Looking up…" }),
          dock.kind === "error" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-400", children: dock.message }),
          dock.kind === "result" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
            dock.result.thumbnailURL && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: dock.result.thumbnailURL,
                alt: "",
                className: "w-full h-28 rounded object-contain bg-surface-2"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "whitespace-pre-wrap break-words", children: dock.result.summary }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: dock.result.source === "wikipedia" ? "Wikipedia" : "Local AI" }),
              dock.result.sourceURL && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-700", children: "·" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      const url = dock.result.sourceURL;
                      if (!url) return;
                      onOpenURL(
                        url,
                        dock.result.title ?? dock.term,
                        dock.result.source === "wikipedia" ? "Wikipedia" : null
                      );
                    },
                    className: "text-amber-300 hover:text-amber-200 normal-case tracking-normal",
                    children: "Open article ↗"
                  }
                )
              ] })
            ] })
          ] })
        ] })
      ]
    }
  );
}
function ToolbarButton({
  children,
  label,
  active,
  onClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "button",
    {
      onClick,
      title: label,
      "aria-label": label,
      className: `no-drag h-7 w-7 flex items-center justify-center rounded text-sm transition-colors ${active ? "text-amber-400 bg-surface-2" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2"}`,
      children
    }
  );
}
function StocksPage({
  onClose,
  initialTickerSymbol,
  onOpenURL,
  onOpenArticle,
  onOpenIpoBrief
}) {
  const [quotes, setQuotes] = reactExports.useState([]);
  const [tickers, setTickers] = reactExports.useState([]);
  const [busy, setBusy] = reactExports.useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = reactExports.useState(null);
  const [selectedTickerId, setSelectedTickerId] = reactExports.useState(null);
  const [view, setView] = reactExports.useState("holdings");
  const [chainFocus, setChainFocus] = reactExports.useState(null);
  const lastResolvedInitialSymbol = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!initialTickerSymbol || tickers.length === 0) return;
    if (lastResolvedInitialSymbol.current === initialTickerSymbol) return;
    lastResolvedInitialSymbol.current = initialTickerSymbol;
    const match = tickers.find(
      (t) => t.symbol.toUpperCase() === initialTickerSymbol.toUpperCase()
    );
    if (match) setSelectedTickerId(match.id);
  }, [initialTickerSymbol, tickers]);
  reactExports.useEffect(() => {
    void window.api.tickers.list().then(setTickers).catch((err) => console.warn("[ui] tickers.list failed:", err));
    void window.api.stocks.getQuotes().then((q) => {
      setQuotes(q);
      if (q.length > 0) setLastUpdatedAt(Date.now());
    }).catch((err) => console.warn("[ui] stocks.getQuotes failed:", err));
    const unsub = window.api.stocks.onUpdated((q) => {
      setQuotes(q);
      setLastUpdatedAt(Date.now());
    });
    return unsub;
  }, []);
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const q = await window.api.stocks.refresh();
      setQuotes(q);
      setLastUpdatedAt(Date.now());
    } finally {
      setBusy(false);
    }
  };
  const bySymbol = reactExports.useMemo(
    () => new Map(quotes.map((q) => [q.symbol.toUpperCase(), q])),
    [quotes]
  );
  const { sectorOrder, grouped } = reactExports.useMemo(() => {
    const order = [];
    const buckets = {};
    for (const t of tickers) {
      if (!t.isActive) continue;
      const sector = t.sector?.trim() || "Other";
      if (!(sector in buckets)) {
        buckets[sector] = [];
        order.push(sector);
      }
      buckets[sector].push(t);
    }
    return { sectorOrder: order, grouped: buckets };
  }, [tickers]);
  const gainers = quotes.filter((q) => (q.change ?? 0) > 0).length;
  const losers = quotes.filter((q) => (q.change ?? 0) < 0).length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden",
      "data-lookup-context": "Stock portfolio page — US equity tickers and company names, mostly semiconductor value chain (fabless AI designers, foundries, equipment, EDA, packaging), defense/aerospace, and mining. Ambiguous terms are almost always publicly traded companies, not homonymous people or places.",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-6 pt-6 pb-5 flex items-end justify-between gap-6 flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-400/90 mb-1.5", children: "Live markets via stooq.com" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[28px] leading-none font-bold text-zinc-50 tracking-tight", children: "Stocks" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500", children: lastUpdatedAt ? `Updated ${formatRelativeTime(lastUpdatedAt)}` : "Awaiting first quote" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-5 text-[11px] uppercase tracking-wider", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 rounded-full bg-surface-1 ring-1 ring-edge/60 p-0.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(StocksViewTab, { label: "Holdings", active: view === "holdings", onClick: () => setView("holdings") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(StocksViewTab, { label: "Value Chain", active: view === "chain", onClick: () => setView("chain") }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(StocksViewTab, { label: "Graph", active: view === "graph", onClick: () => setView("graph") })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Holdings", value: tickers.filter((t) => t.isActive).length }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Gainers", value: gainers, tone: "accent" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Losers", value: losers, tone: losers > 0 ? "urgent" : "muted" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: refresh,
                disabled: busy,
                className: "px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 text-[10px] font-semibold uppercase tracking-[0.18em] hover:bg-emerald-500/25 disabled:opacity-50",
                children: busy ? "Refreshing…" : "Refresh"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: onClose,
                className: "px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
                children: "Close"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-h-0 overflow-y-auto", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            CalendarStrip,
            {
              filter: "finance",
              onOpenStock: (symbol) => {
                const match = tickers.find(
                  (t) => t.symbol.toUpperCase() === symbol.toUpperCase()
                );
                if (match) setSelectedTickerId(match.id);
              },
              onOpenGame: () => {
              },
              onOpenURL,
              onOpenIpoBrief
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(MacroPanel, {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 pt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsibleSection, { title: "Explore tickers", meta: "Yahoo search · any US symbol", defaultOpen: false, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            TickerSearchBox,
            {
              onOpenDetail: async (r) => {
                const t = await window.api.tickers.ensurePassive({
                  symbol: r.symbol,
                  companyName: r.name,
                  sector: r.sector ?? null,
                  industry: r.industry ?? null
                });
                const updated = await window.api.tickers.list();
                setTickers(updated);
                if (view === "chain") {
                  setChainFocus(r.symbol.toUpperCase());
                } else {
                  setSelectedTickerId(t.id);
                }
              },
              onAddToWatchlist: async (r) => {
                const t = await window.api.tickers.create({
                  symbol: r.symbol,
                  companyName: r.name,
                  sector: r.sector ?? null,
                  industry: r.industry ?? null
                });
                const updated = await window.api.tickers.list();
                setTickers(updated);
                if (view === "chain") {
                  setChainFocus(r.symbol.toUpperCase());
                } else {
                  setSelectedTickerId(t.id);
                }
              }
            }
          ) }) }),
          view === "graph" ? (
            // Whole-universe relationship graph. Quotes are passed for the
            // live change tint only — MarketGraph never lays out from them,
            // so a 60s tick recolours without re-running the simulation.
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              MarketGraph,
              {
                quotes,
                onSelectSymbol: (symbol) => {
                  const t = tickers.find((x) => x.symbol === symbol);
                  if (t) setSelectedTickerId(t.id);
                }
              }
            )
          ) : view === "chain" ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            ValueChain,
            {
              tickers,
              quotes,
              onOpenTicker: (id) => setSelectedTickerId(id),
              onActivateTicker: async (id) => {
                await window.api.tickers.activate(id);
                const updated = await window.api.tickers.list();
                setTickers(updated);
              },
              externalFocus: chainFocus,
              onExternalFocusHandled: () => {
              },
              onOpenURL
            }
          ) : tickers.filter((t) => t.isActive).length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-20 text-center text-sm text-zinc-500", children: "No active tickers in your watchlist. Add some from Settings → Tickers." }) : sectorOrder.map((sector) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "px-6 pt-2 pb-6", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: sector }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: grouped[sector].length })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr", children: grouped[sector].map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              StockCard,
              {
                ticker: t,
                quote: bySymbol.get(t.symbol.toUpperCase()),
                onOpen: () => setSelectedTickerId(t.id)
              },
              t.id
            )) })
          ] }, sector))
        ] }),
        selectedTickerId !== null && (() => {
          const t = tickers.find((x) => x.id === selectedTickerId);
          if (!t) return null;
          return /* @__PURE__ */ jsxRuntimeExports.jsx(
            StockDetail,
            {
              ticker: t,
              tickers,
              quote: bySymbol.get(t.symbol.toUpperCase()),
              onClose: () => {
                setChainFocus(t.symbol);
                setSelectedTickerId(null);
              },
              onOpenArticle,
              onOpenURL,
              onActivate: async () => {
                await window.api.tickers.activate(t.id);
                const updated = await window.api.tickers.list();
                setTickers(updated);
              },
              onOpenTicker: (id) => setSelectedTickerId(id)
            }
          );
        })()
      ]
    }
  );
}
function StockCard({
  ticker,
  quote,
  onOpen
}) {
  const rq = quote ? resolveDisplayQuote(quote) : null;
  const price = rq?.price ?? null;
  const change = rq?.change ?? null;
  const changePct = rq?.changePct ?? null;
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const tone = up ? "emerald" : down ? "red" : "zinc";
  const color = tone === "emerald" ? "text-emerald-400" : tone === "red" ? "text-red-400" : "text-zinc-400";
  const ring = tone === "emerald" ? "border-emerald-500/30 hover:border-emerald-500/50 hover:shadow-[0_8px_24px_rgba(16,185,129,0.15)]" : tone === "red" ? "border-red-500/30 hover:border-red-500/50 hover:shadow-[0_8px_24px_rgba(239,68,68,0.15)]" : "border-edge/70 hover:border-edge hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      onClick: onOpen,
      className: `card-lift relative rounded-xl border bg-surface-1 hover:bg-surface-2 p-5 flex flex-col min-w-0 h-full text-left transition-colors ${ring}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3 mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 mb-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[18px] font-bold tracking-[0.06em] text-zinc-50 leading-none", children: ticker.symbol }),
              rq?.sessionBadge && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-semibold uppercase tracking-[0.18em] px-1 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40", children: rq.sessionBadge })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-400 truncate", children: ticker.companyName })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `text-[11px] font-semibold uppercase tracking-[0.18em] ${color} shrink-0`, children: [
            up ? "▲" : down ? "▼" : "·",
            " ",
            changePct !== null ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "—"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-3 mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[26px] font-bold tabular-nums leading-none text-zinc-50", children: price !== null ? price.toFixed(2) : "—" }),
          change !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `text-[12px] tabular-nums font-semibold pb-1 ${color}`, children: [
            change >= 0 ? "+" : "",
            change.toFixed(2)
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-auto grid grid-cols-3 gap-2 pt-3 border-t border-edge/40 text-[10px] uppercase tracking-[0.14em] text-zinc-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(StockStat, { label: "Open", value: quote?.open }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(StockStat, { label: "High", value: quote?.high }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(StockStat, { label: "Low", value: quote?.low })
        ] }),
        quote?.time && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-[9px] uppercase tracking-[0.22em] text-zinc-600 tabular-nums", children: quote.time })
      ]
    }
  );
}
function StockStat({ label, value }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-0.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300 tabular-nums text-[12px] normal-case tracking-normal", children: value !== null && value !== void 0 ? value.toFixed(2) : "—" })
  ] });
}
function FundamentalCell({ label, value }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1 min-w-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[15px] font-semibold tabular-nums text-zinc-100 truncate", children: value })
  ] });
}
function FinancialsDetailSection({
  financials
}) {
  const ttm = financials?.ttm;
  const yoyRev = financials?.yoy?.revenue ?? null;
  const margin = ttm?.fcfMargin ?? null;
  const marginStyling = fcfMarginTone(margin);
  const yoyTone = yoyRev === null ? "text-zinc-300" : yoyRev > 0 ? "text-emerald-300" : yoyRev < 0 ? "text-red-300" : "text-zinc-300";
  const isAnnual = financials?.cadence === "annual";
  const sectionMeta = isAnnual ? "Last 4 years" : "Last 8 quarters";
  const sparklineLabel = isAnnual ? "Free cash flow · last 4 fiscal years" : "Free cash flow · last 8 quarters";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(CollapsibleSection, { title: "Financial performance", meta: sectionMeta, defaultOpen: true, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 items-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        FinancialsCell,
        {
          label: isAnnual ? "Revenue (FY)" : "Revenue TTM",
          value: formatMoneyCompact(ttm?.revenue ?? null) ?? "—",
          tone: "text-zinc-100"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        FinancialsCell,
        {
          label: "Revenue YoY",
          value: formatPctDelta(yoyRev) ?? "—",
          tone: yoyTone
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        FinancialsCell,
        {
          label: isAnnual ? "FCF (FY)" : "FCF TTM",
          value: formatMoneyCompact(ttm?.freeCashFlow ?? null) ?? "—",
          tone: "text-zinc-100"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        FinancialsCell,
        {
          label: "FCF margin",
          value: formatPctValue(margin) ?? "—",
          tone: marginStyling.color
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mb-2", children: sparklineLabel }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(FcfSparkline, { financials: financials ?? void 0, variant: "card" })
    ] })
  ] });
}
function FinancialsCell({
  label,
  value,
  tone
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1 min-w-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[17px] font-semibold tabular-nums truncate ${tone}`, children: value })
  ] });
}
function currencySymbol(code) {
  if (!code) return "";
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  if (code === "GBP") return "£";
  if (code === "JPY") return "¥";
  return `${code} `;
}
function formatPE(v) {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}
function formatEps(v, currency) {
  if (v === null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}${currencySymbol(currency)}${Math.abs(v).toFixed(2)}`;
}
function formatYield(v) {
  if (v === null || !Number.isFinite(v) || v === 0) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function formatMarketCap(v, currency) {
  if (v === null || !Number.isFinite(v)) return "—";
  const prefix = currencySymbol(currency);
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${prefix}${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${prefix}${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${prefix}${(v / 1e6).toFixed(2)}M`;
  return `${prefix}${v.toFixed(0)}`;
}
function format52wRange(low, high, currency) {
  if (low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high)) return "—";
  const prefix = currencySymbol(currency);
  return `${prefix}${low.toFixed(2)} – ${prefix}${high.toFixed(2)}`;
}
const STOCK_RANGE_ORDER = ["1D", "5D", "1W", "1M", "3M", "1Y", "5Y", "MAX"];
function parseBriefSummary(summary) {
  const text = summary.trim();
  const firstMatch = text.match(/(^|[\s\n])1[.)]\s+/);
  if (!firstMatch || firstMatch.index === void 0) {
    return { intro: null, items: [text] };
  }
  const listStart = firstMatch.index + (firstMatch[1] ? firstMatch[1].length : 0);
  const intro = text.slice(0, listStart).trim();
  const rest = text.slice(listStart);
  const pieces = rest.split(/(?:^|\n|\s)(?=\d+[.)]\s+)/).map((p) => p.trim()).filter(Boolean);
  const items = [];
  for (const p of pieces) {
    const m = p.match(/^\d+[.)]\s+([\s\S]+)$/);
    if (m) items.push(m[1].trim());
  }
  if (items.length < 2) {
    return { intro: null, items: [text] };
  }
  return { intro: intro.length > 0 ? intro : null, items };
}
function BriefSummary({ summary }) {
  const { intro, items } = parseBriefSummary(summary);
  if (items.length < 2) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[14px] leading-relaxed text-zinc-200", children: items[0] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    intro && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[14px] leading-relaxed text-zinc-200", children: intro }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "space-y-2", children: items.map((item, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "li",
      {
        className: "flex gap-3 text-[14px] leading-relaxed text-zinc-200",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "shrink-0 text-[11px] font-semibold tabular-nums text-zinc-500 w-5 pt-[3px]", children: [
            idx + 1,
            "."
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1", children: item })
        ]
      },
      idx
    )) })
  ] });
}
function StockDetail({
  ticker,
  tickers,
  quote,
  onClose,
  onOpenArticle,
  onActivate,
  onOpenTicker,
  onOpenURL
}) {
  const [history, setHistory] = reactExports.useState([]);
  const [loadingHistory, setLoadingHistory] = reactExports.useState(true);
  const [range, setRange] = reactExports.useState("1D");
  const [articles, setArticles] = reactExports.useState([]);
  const [loadingArticles, setLoadingArticles] = reactExports.useState(true);
  const [summary, setSummary] = reactExports.useState(null);
  const [summaryCount, setSummaryCount] = reactExports.useState(0);
  const [summaryState, setSummaryState] = reactExports.useState("loading");
  const [fundamentals, setFundamentals] = reactExports.useState(null);
  const [financials, setFinancials] = reactExports.useState(null);
  const [profile, setProfile] = reactExports.useState(null);
  const [profileLoading, setProfileLoading] = reactExports.useState(false);
  const [diagramSymbol, setDiagramSymbol] = reactExports.useState(null);
  reactExports.useEffect(() => {
    let cancelled = false;
    void window.api.stocks.getFundamentals(ticker.symbol).then((f) => {
      if (!cancelled) setFundamentals(f);
    }).catch((err) => console.warn("[ui] stocks.getFundamentals failed:", err));
    return () => {
      cancelled = true;
    };
  }, [ticker.symbol]);
  reactExports.useEffect(() => {
    let cancelled = false;
    setFinancials(null);
    void window.api.stocks.getFinancials(ticker.symbol).then((snap) => {
      if (!cancelled) setFinancials(snap);
    }).catch(() => {
    });
    const unsub = window.api.stocks.onFinancialsUpdated((sym) => {
      if (sym.toUpperCase() !== ticker.symbol.toUpperCase()) return;
      void window.api.stocks.getFinancials(ticker.symbol).then((snap) => {
        if (!cancelled) setFinancials(snap);
      }).catch(() => {
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [ticker.symbol]);
  reactExports.useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setProfileLoading(true);
    void window.api.stocks.ensureCompanyProfile(ticker.symbol, ticker.companyName).then((p) => {
      if (!cancelled) {
        setProfile(p);
        setProfileLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setProfileLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ticker.symbol, ticker.companyName]);
  reactExports.useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);
    void window.api.stocks.getHistory(ticker.symbol, range).then((rows) => {
      if (cancelled) return;
      setHistory(rows);
      setLoadingHistory(false);
    }).catch((err) => {
      if (!cancelled) setLoadingHistory(false);
      console.warn("[ui] stocks.getHistory failed:", err);
    });
    return () => {
      cancelled = true;
    };
  }, [ticker.symbol, range]);
  reactExports.useEffect(() => {
    setLoadingArticles(true);
    void window.api.articles.listForTicker(ticker.id).then(setArticles).finally(() => setLoadingArticles(false));
  }, [ticker.id]);
  reactExports.useEffect(() => {
    let cancelled = false;
    const load = () => {
      void window.api.tickers.summarize(ticker.id).then((res) => {
        if (cancelled) return;
        if (!res) {
          setSummaryState("loading");
          return;
        }
        setSummaryCount(res.articleCount);
        if (res.generatedAt === null) {
          setSummary(null);
          setSummaryState("loading");
          return;
        }
        if (res.articleCount === 0) {
          setSummary(null);
          setSummaryState("empty");
          return;
        }
        if (res.summary) {
          setSummary(res.summary);
          setSummaryState("ready");
          return;
        }
        setSummary(null);
        if (res.relevantCount === 0) {
          setSummaryState("no-material");
        } else {
          setSummaryState("offline");
        }
      });
    };
    setSummaryState("loading");
    setSummary(null);
    setSummaryCount(0);
    load();
    const unsub = window.api.tickers.onSummaryUpdated((id) => {
      if (id === ticker.id) load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [ticker.id]);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const points = appendLiveQuote(history, range, quote);
  const rangeBounds = computeRangeDelta(points, range);
  const currency = "$";
  const down = (rangeBounds.delta ?? 0) < 0;
  const up = (rangeBounds.delta ?? 0) > 0;
  const deltaColor = up ? "text-emerald-400" : down ? "text-red-400" : "text-zinc-400";
  const chartColor = up ? "#34d399" : down ? "#f87171" : "#a1a1aa";
  const grouped = groupArticlesByDay(articles);
  const stockLookupContext = `Stock detail for ${ticker.symbol} (${ticker.companyName}${ticker.sector ? `, ${ticker.sector}` : ""}) — ambiguous terms are usually related companies, products, executives, suppliers, customers, or competitors in the same industry.`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "absolute inset-0 z-30 bg-surface-0 flex flex-col overflow-hidden",
      "data-lookup-context": stockLookupContext,
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose();
      },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 overflow-y-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-[1180px] mx-auto px-6 py-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-start justify-between gap-4 mb-6 flex-wrap", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 flex-wrap", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[28px] font-bold tracking-[0.06em] text-zinc-50 leading-none", children: ticker.symbol }),
                ticker.sector && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500", children: ticker.sector })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-[14px] text-zinc-300", children: ticker.companyName }),
              profile ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 max-w-[640px] text-[13px] leading-snug text-zinc-400", children: profile.description }) : profileLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 text-[11px] uppercase tracking-[0.22em] text-zinc-600", children: "Generating company profile…" }) : null
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-right", children: (() => {
                if (!quote)
                  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[26px] font-bold tabular-nums leading-none text-zinc-50", children: "—" });
                const rq = resolveDisplayQuote(quote);
                const deltaColor2 = (rq.change ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";
                const sessionSuffix = rq.session === "post" ? "after hours" : rq.session === "pre" ? "pre-market" : rq.session === "closed" ? "at close" : "today";
                return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline justify-end gap-2", children: [
                    rq.sessionBadge && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-semibold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40", children: rq.sessionBadge }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[26px] font-bold tabular-nums leading-none text-zinc-50", children: rq.price !== null ? `${currency}${rq.price.toFixed(2)}` : "—" })
                  ] }),
                  rq.changePct !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `text-[12px] font-semibold tabular-nums mt-1 ${deltaColor2}`, children: [
                    (rq.change ?? 0) >= 0 ? "+" : "",
                    rq.change !== null ? rq.change.toFixed(2) : "—",
                    " (",
                    (rq.changePct ?? 0) >= 0 ? "+" : "",
                    rq.changePct.toFixed(2),
                    "%) ",
                    sessionSuffix
                  ] }),
                  rq.sessionBadge && quote.price !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] tabular-nums text-zinc-500 mt-0.5", children: [
                    "Reg close ",
                    currency,
                    quote.price.toFixed(2)
                  ] })
                ] });
              })() }),
              ticker.isActive ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: "ml-2 px-3 h-9 flex items-center rounded-full bg-emerald-500/15 text-emerald-200 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-emerald-500/40",
                  title: "This ticker is in your watchlist — news and briefs are ingested.",
                  children: "✓ Watchlist"
                }
              ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onActivate,
                  className: "ml-2 px-3 h-9 rounded-full bg-indigo-500/15 text-indigo-200 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25 transition-colors",
                  children: "+ Watchlist"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setDiagramSymbol(ticker.symbol),
                  title: "Open zoomable subgraph diagram",
                  className: "ml-2 px-3 h-9 rounded-full bg-purple-500/15 text-purple-200 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-purple-500/40 hover:bg-purple-500/25 transition-colors",
                  children: "Diagram"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  className: "ml-2 h-9 w-9 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 transition-colors text-xl",
                  "aria-label": "Close",
                  children: "×"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl border border-edge bg-surface-1 overflow-hidden", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 pt-5 flex items-end justify-between gap-4 flex-wrap", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500 mb-1.5", children: [
                  range,
                  " change"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[32px] font-bold tabular-nums leading-none ${deltaColor}`, children: rangeBounds.delta !== null ? `${rangeBounds.delta >= 0 ? "+" : "−"}${currency}${Math.abs(rangeBounds.delta).toFixed(2)}` : "—" }),
                  rangeBounds.deltaPct !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `text-[14px] font-semibold tabular-nums ${deltaColor}`, children: [
                    rangeBounds.deltaPct >= 0 ? "+" : "",
                    rangeBounds.deltaPct.toFixed(2),
                    "%"
                  ] })
                ] }),
                rangeBounds.from && rangeBounds.to && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500", children: [
                  rangeBounds.from,
                  " → ",
                  rangeBounds.to
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1", children: STOCK_RANGE_ORDER.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setRange(r),
                  className: `px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-[0.08em] transition-colors ${range === r ? "bg-surface-3 text-zinc-50 ring-1 ring-inset ring-edge" : "text-zinc-500 hover:text-zinc-200 hover:bg-surface-2"}`,
                  children: r
                },
                r
              )) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-3 pb-3 pt-4", children: loadingHistory ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-64 flex items-center justify-center text-[11px] uppercase tracking-[0.22em] text-zinc-600", children: "Loading history…" }) : points.length < 2 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-64 flex items-center justify-center text-[11px] uppercase tracking-[0.22em] text-zinc-600", children: "Not enough data for this range" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(StockChart, { points, color: chartColor }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-5 pb-3 flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-[0.22em] text-zinc-500", children: "via Yahoo Finance" }) })
          ] }),
          fundamentals && /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsibleSection, { title: "Key stats", meta: "via Yahoo Finance", defaultOpen: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-5 gap-y-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(FundamentalCell, { label: "P/E", value: formatPE(fundamentals.peRatio) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(FundamentalCell, { label: "Fwd P/E", value: formatPE(fundamentals.forwardPE) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(FundamentalCell, { label: "EPS", value: formatEps(fundamentals.eps, fundamentals.currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(FundamentalCell, { label: "Market cap", value: formatMarketCap(fundamentals.marketCap, fundamentals.currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(FundamentalCell, { label: "Div yield", value: formatYield(fundamentals.dividendYield) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(FundamentalCell, { label: "52W range", value: format52wRange(fundamentals.weekLow52, fundamentals.weekHigh52, fundamentals.currency) })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(FinancialsDetailSection, { financials }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            UnifiedValueChainCard,
            {
              symbol: ticker.symbol,
              companyName: ticker.companyName ?? ticker.symbol,
              tickers,
              onOpenCitation: onOpenURL,
              onOpenTicker: async (sym) => {
                const existing = tickers.find(
                  (t2) => t2.symbol.toUpperCase() === sym.toUpperCase()
                );
                if (existing) {
                  onOpenTicker(existing.id);
                  return;
                }
                const t = await window.api.tickers.ensurePassive({
                  symbol: sym,
                  companyName: sym
                });
                onOpenTicker(t.id);
              }
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(EarningsReleaseSection, { symbol: ticker.symbol }),
          ticker.isActive && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            CollapsibleSection,
            {
              title: "Today's brief",
              meta: summaryCount > 0 ? `${summaryCount} ${summaryCount === 1 ? "article" : "articles"}` : void 0,
              defaultOpen: true,
              children: [
                summaryState === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] uppercase tracking-[0.22em] text-zinc-600", children: "Summarizing…" }),
                summaryState === "empty" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[13px] text-zinc-500", children: [
                  "No news today for ",
                  ticker.symbol,
                  "."
                ] }),
                summaryState === "no-material" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[13px] text-zinc-500", children: [
                  "No material news today for ",
                  ticker.symbol,
                  ". ",
                  summaryCount,
                  " ",
                  summaryCount === 1 ? "article" : "articles",
                  " surfaced but none were substantively about the company (see below)."
                ] }),
                summaryState === "offline" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[13px] text-zinc-500", children: [
                  "AI summary unavailable — Ollama is offline. ",
                  summaryCount,
                  " ",
                  summaryCount === 1 ? "article" : "articles",
                  " in the last 24h (see below)."
                ] }),
                summaryState === "ready" && summary && /* @__PURE__ */ jsxRuntimeExports.jsx(BriefSummary, { summary })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(SecFilingsSection, { symbol: ticker.symbol }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(OptionsSnapshotSection, { symbol: ticker.symbol }),
          !ticker.isActive ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            CollapsibleSection,
            {
              title: "News coverage",
              meta: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-indigo-300", children: "tracked · not in watchlist" }),
              defaultOpen: true,
              tone: "dashed",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[13px] text-zinc-400 leading-snug", children: [
                  ticker.symbol,
                  " is tracked for quotes and value-chain context, but no news feeds are ingested until it's added to your watchlist."
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: onActivate,
                    className: "mt-4 px-3 h-9 rounded-full bg-indigo-500/15 text-indigo-200 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ring-indigo-500/40 hover:bg-indigo-500/25 transition-colors",
                    children: [
                      "+ Add ",
                      ticker.symbol,
                      " to watchlist"
                    ]
                  }
                )
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx(CollapsibleSection, { title: "Latest coverage", meta: String(articles.length), defaultOpen: true, children: loadingArticles ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] uppercase tracking-[0.22em] text-zinc-600 py-10 text-center", children: "Searching feeds…" }) : articles.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-zinc-500 py-10 text-center", children: [
            "No recent articles mention ",
            ticker.symbol,
            ". Check back after the next poll."
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
            grouped.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx(
              CoverageDateRail,
              {
                groups: grouped.map((g) => ({
                  key: g.key,
                  label: g.label,
                  count: g.items.length
                }))
              }
            ),
            grouped.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { id: `coverage-${g.key}`, className: "scroll-mt-20", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500", children: g.label }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/50" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-600", children: g.items.length })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "divide-y divide-edge/40 rounded-lg border border-edge/60 bg-surface-1 overflow-hidden", children: g.items.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => onOpenArticle(a.id),
                  className: "w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(FeedSource, { article: a }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-0.5 flex-wrap", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "span",
                          {
                            className: `text-[10px] font-bold uppercase tracking-[0.16em] truncate ${a.domain === "finance" ? "text-amber-400" : "text-blue-400"}`,
                            children: a.feedTitle
                          }
                        ),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(UrgencyBadge, { article: a }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-[10px] uppercase tracking-[0.18em] text-zinc-500 shrink-0", children: formatRelativeTime(a.publishedAt) })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13.5px] leading-snug text-zinc-100 font-medium line-clamp-2", children: a.title }),
                      a.summary && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] leading-snug text-zinc-500 mt-1 line-clamp-2", children: a.summary })
                    ] })
                  ]
                }
              ) }, a.id)) })
            ] }, g.key))
          ] }) })
        ] }) }),
        diagramSymbol && /* @__PURE__ */ jsxRuntimeExports.jsx(
          ValueChainDiagram,
          {
            initialSymbol: diagramSymbol,
            tickers,
            quotes: quote ? [quote] : [],
            onClose: () => setDiagramSymbol(null),
            onOpenTicker: (id) => {
              setDiagramSymbol(null);
              onOpenTicker(id);
            },
            onActivateTicker: (id) => {
              void window.api.tickers.activate(id);
            },
            onOpenURL
          }
        )
      ]
    }
  );
}
function appendLiveQuote(history, range, quote) {
  if (history.length === 0) return [];
  const price = quote ? resolveDisplayQuote(quote).price : null;
  if (price === null || price === void 0) return history;
  const last = history[history.length - 1];
  const isIntraday = range === "1D" || range === "5D" || range === "1W";
  const sameDay = new Date(last.t).toDateString() === (/* @__PURE__ */ new Date()).toDateString();
  if (isIntraday && sameDay) {
    return [...history, { t: Date.now(), v: price }];
  }
  if (sameDay) {
    return [...history.slice(0, -1), { t: Date.now(), v: price }];
  }
  return [...history, { t: Date.now(), v: price }];
}
function computeRangeDelta(points, range) {
  if (points.length < 2) return { delta: null, deltaPct: null, from: null, to: null };
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.v - first.v;
  const deltaPct = first.v !== 0 ? delta / first.v * 100 : null;
  const intraday = range === "1D";
  return {
    delta,
    deltaPct,
    from: formatPointLabel(first.t, intraday),
    to: formatPointLabel(last.t, intraday)
  };
}
function formatPointLabel(ts, intraday) {
  const d = new Date(ts);
  if (intraday) {
    return d.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
}
function StockChart({
  points,
  color
}) {
  const svgRef = reactExports.useRef(null);
  const [hoverIdx, setHoverIdx] = reactExports.useState(null);
  const width = 1100;
  const height = 260;
  const padX = 12;
  const padY = 18;
  const { coords, linePath, areaPath, xStep } = reactExports.useMemo(() => {
    if (points.length === 0) {
      return { coords: [], linePath: "", areaPath: "", xStep: 0 };
    }
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of points) {
      if (p.v < minV) minV = p.v;
      if (p.v > maxV) maxV = p.v;
    }
    const range = maxV - minV || 1;
    const step = (width - padX * 2) / Math.max(points.length - 1, 1);
    const cs = points.map((p, i) => ({
      x: padX + i * step,
      y: padY + (1 - (p.v - minV) / range) * (height - padY * 2)
    }));
    const line = cs.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
    const area = `${line} L${cs[cs.length - 1].x.toFixed(2)},${height - padY} L${cs[0].x.toFixed(2)},${height - padY} Z`;
    return { coords: cs, linePath: line, areaPath: area, xStep: step };
  }, [points]);
  const gradId = reactExports.useMemo(() => `chart-grad-${Math.round(Math.random() * 1e6)}`, []);
  const handleMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width * width;
    const rawIdx = Math.round((relX - padX) / xStep);
    const idx = Math.max(0, Math.min(points.length - 1, rawIdx));
    setHoverIdx(idx);
  };
  const handleLeave = () => setHoverIdx(null);
  const activePoint = hoverIdx !== null ? points[hoverIdx] : null;
  const activeCoord = hoverIdx !== null ? coords[hoverIdx] : null;
  const dateIsIntraday = activePoint ? new Date(activePoint.t).toDateString() === (/* @__PURE__ */ new Date()).toDateString() && points.length > 0 && points[points.length - 1].t - points[0].t < 3 * 24 * 60 * 60 * 1e3 : false;
  const dateLabel = activePoint ? new Date(activePoint.t).toLocaleString(void 0, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...dateIsIntraday ? { hour: "numeric", minute: "2-digit" } : {}
  }) : "";
  const priceLabel = activePoint ? `$${activePoint.v.toFixed(2)}` : "";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "svg",
    {
      ref: svgRef,
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: "none",
      className: "w-full h-64 cursor-crosshair",
      role: "img",
      onMouseMove: handleMove,
      onMouseLeave: handleLeave,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: color, stopOpacity: "0.35" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: color, stopOpacity: "0" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("line", { x1: padX, y1: padY, x2: width - padX, y2: padY, stroke: "#27272a", strokeWidth: "1", strokeDasharray: "2 4" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "line",
          {
            x1: padX,
            y1: height / 2,
            x2: width - padX,
            y2: height / 2,
            stroke: "#27272a",
            strokeWidth: "1",
            strokeDasharray: "2 4"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "line",
          {
            x1: padX,
            y1: height - padY,
            x2: width - padX,
            y2: height - padY,
            stroke: "#27272a",
            strokeWidth: "1",
            strokeDasharray: "2 4"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: areaPath, fill: `url(#${gradId})` }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "path",
          {
            d: linePath,
            fill: "none",
            stroke: color,
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "circle",
          {
            cx: coords[coords.length - 1].x,
            cy: coords[coords.length - 1].y,
            r: "3.5",
            fill: color
          }
        ),
        activeCoord && activePoint && /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { pointerEvents: "none", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "line",
            {
              x1: activeCoord.x,
              y1: padY,
              x2: activeCoord.x,
              y2: height - padY,
              stroke: "#71717a",
              strokeWidth: "1",
              strokeDasharray: "3 3"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: activeCoord.x, cy: activeCoord.y, r: "4", fill: color }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "circle",
            {
              cx: activeCoord.x,
              cy: activeCoord.y,
              r: "6",
              fill: "none",
              stroke: color,
              strokeOpacity: "0.35",
              strokeWidth: "2"
            }
          ),
          (() => {
            const labelW = Math.max(90, dateLabel.length * 6.5);
            const labelH = 18;
            const lx = Math.min(
              Math.max(activeCoord.x - labelW / 2, padX),
              width - padX - labelW
            );
            return /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "rect",
                {
                  x: lx,
                  y: 2,
                  width: labelW,
                  height: labelH,
                  rx: 3,
                  fill: "#18181b",
                  stroke: "#3f3f46",
                  strokeWidth: "1"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "text",
                {
                  x: lx + labelW / 2,
                  y: 15,
                  textAnchor: "middle",
                  fontSize: "11",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fill: "#d4d4d8",
                  children: dateLabel
                }
              )
            ] });
          })(),
          (() => {
            const labelW = 62;
            const labelH = 18;
            const flipRight = activeCoord.x + 10 + labelW > width - padX;
            const lx = flipRight ? activeCoord.x - 10 - labelW : activeCoord.x + 10;
            const ly = Math.min(
              Math.max(activeCoord.y - labelH / 2, padY),
              height - padY - labelH
            );
            return /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "rect",
                {
                  x: lx,
                  y: ly,
                  width: labelW,
                  height: labelH,
                  rx: 3,
                  fill: color,
                  fillOpacity: "0.18",
                  stroke: color,
                  strokeWidth: "1"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "text",
                {
                  x: lx + labelW / 2,
                  y: ly + 13,
                  textAnchor: "middle",
                  fontSize: "11",
                  fontWeight: "600",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fill: "#fafafa",
                  children: priceLabel
                }
              )
            ] });
          })()
        ] })
      ]
    }
  );
}
function groupArticlesByDay(articles) {
  const now = /* @__PURE__ */ new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const bucketByKey = /* @__PURE__ */ new Map();
  for (const a of articles) {
    const ts = a.publishedAt ?? 0;
    let key;
    let label;
    if (ts >= startOfDay) {
      key = "today";
      label = "Today";
    } else if (ts >= startOfDay - 864e5) {
      key = "yesterday";
      label = "Yesterday";
    } else if (ts > 0) {
      const d = new Date(ts);
      key = d.toISOString().slice(0, 10);
      label = d.toLocaleDateString(void 0, { weekday: "long", month: "short", day: "numeric" });
    } else {
      key = "older";
      label = "Undated";
    }
    const bucket = bucketByKey.get(key) ?? { key, label, items: [] };
    bucket.items.push(a);
    bucketByKey.set(key, bucket);
  }
  const groups = Array.from(bucketByKey.values()).map((g) => ({
    ...g,
    items: [...g.items].sort((a, b) => {
      const ua = a.urgencyScore ?? 0;
      const ub = b.urgencyScore ?? 0;
      if (ub !== ua) return ub - ua;
      return (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
    })
  }));
  const nowMs = Date.now();
  const bucketTs = (k) => {
    if (k === "today") return nowMs;
    if (k === "yesterday") return nowMs - 864e5;
    if (k === "older") return -Infinity;
    return Date.parse(k) || 0;
  };
  groups.sort((a, b) => bucketTs(b.key) - bucketTs(a.key));
  return groups;
}
function formatRelativeTime(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = 6e4;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}
function SportsPage({
  onClose,
  initialGame,
  onOpenURL
}) {
  const [leagues, setLeagues] = reactExports.useState([]);
  const [activeLeagueId, setActiveLeagueId] = reactExports.useState(null);
  const [games, setGames] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(false);
  const [selectedGame, setSelectedGame] = reactExports.useState(null);
  const [selectedDateKey, setSelectedDateKey] = reactExports.useState(null);
  const [favoriteTeams, setFavoriteTeams] = reactExports.useState([]);
  const [leagueLeaders, setLeagueLeaders] = reactExports.useState([]);
  const [playoffLeaders, setPlayoffLeaders] = reactExports.useState([]);
  const [teamLeaders, setTeamLeaders] = reactExports.useState([]);
  const [leadersLoading, setLeadersLoading] = reactExports.useState(false);
  const [teamLeadersLoading, setTeamLeadersLoading] = reactExports.useState(false);
  const [scope, setScope] = reactExports.useState("recent");
  const [seasonLabel, setSeasonLabel] = reactExports.useState(null);
  const [favoriteAthletes, setFavoriteAthletes] = reactExports.useState([]);
  const [ncaaConferences, setNcaaConferences] = reactExports.useState([]);
  const [activeConferenceId, setActiveConferenceId] = reactExports.useState(null);
  const isNcaaLeague = activeLeagueId === "ncaaf" || activeLeagueId === "ncaam";
  reactExports.useEffect(() => {
    void window.api.favoriteAthletes.list().then(setFavoriteAthletes);
  }, []);
  const favoriteAthleteByKey = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    for (const fav of favoriteAthletes) map.set(`${fav.leagueId}:${fav.athleteId}`, fav);
    return map;
  }, [favoriteAthletes]);
  const toggleFavoriteAthlete = async (leagueId, leader) => {
    if (!leader.athleteId) return;
    const key = `${leagueId}:${leader.athleteId}`;
    const existing = favoriteAthleteByKey.get(key);
    if (existing) {
      await window.api.favoriteAthletes.delete(existing.id);
    } else {
      await window.api.favoriteAthletes.add({
        leagueId,
        athleteId: leader.athleteId,
        athleteName: leader.athleteName,
        teamId: leader.teamId,
        teamAbbreviation: leader.teamAbbreviation,
        headshotURL: leader.headshotURL
      });
    }
    const fresh = await window.api.favoriteAthletes.list();
    setFavoriteAthletes(fresh);
  };
  reactExports.useEffect(() => {
    void window.api.favoriteTeams.list().then(setFavoriteTeams);
  }, []);
  const favoriteForLeague = reactExports.useMemo(
    () => favoriteTeams.find((f) => f.leagueId === activeLeagueId) ?? null,
    [favoriteTeams, activeLeagueId]
  );
  const activeLeagueObj = leagues.find((l) => l.id === activeLeagueId) ?? null;
  const isPlayoffs = activeLeagueObj?.inPlayoffs ?? false;
  reactExports.useEffect(() => {
    if (!activeLeagueId) return;
    let cancelled = false;
    setLeagueLeaders([]);
    setPlayoffLeaders([]);
    setLeadersLoading(true);
    const tasks = [
      window.api.sports.listLeagueLeaders(activeLeagueId, "regular").then((data) => {
        if (!cancelled) setLeagueLeaders(data);
      }).catch(() => {
        if (!cancelled) setLeagueLeaders([]);
      })
    ];
    if (isPlayoffs) {
      tasks.push(
        window.api.sports.listLeagueLeaders(activeLeagueId, "postseason").then((data) => {
          if (!cancelled) setPlayoffLeaders(data);
        }).catch(() => {
          if (!cancelled) setPlayoffLeaders([]);
        })
      );
    }
    void Promise.all(tasks).finally(() => {
      if (!cancelled) setLeadersLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeLeagueId, isPlayoffs]);
  reactExports.useEffect(() => {
    if (!activeLeagueId || !favoriteForLeague) {
      setTeamLeaders([]);
      return;
    }
    let cancelled = false;
    setTeamLeaders([]);
    setTeamLeadersLoading(true);
    void window.api.sports.listTeamLeaders(activeLeagueId, favoriteForLeague.teamId).then((data) => {
      if (!cancelled) setTeamLeaders(data);
    }).catch(() => {
      if (!cancelled) setTeamLeaders([]);
    }).finally(() => {
      if (!cancelled) setTeamLeadersLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeLeagueId, favoriteForLeague]);
  reactExports.useEffect(() => {
    void window.api.sports.listLeagues().then((ls) => {
      setLeagues(ls);
      if (ls.length > 0) {
        if (initialGame?.leagueId) {
          setActiveLeagueId(initialGame.leagueId);
          return;
        }
        const PRIORITY = [
          "nfl",
          "nba",
          "ncaaf",
          "mlb",
          "ucl",
          "epl",
          "seriea",
          "laliga",
          "ncaam",
          "mls",
          "nhl"
        ];
        const firstActive = PRIORITY.map((id) => ls.find((l) => l.id === id)).find(
          (l) => l && l.inSeason
        );
        setActiveLeagueId(firstActive?.id ?? ls[0].id);
      }
    });
  }, [initialGame]);
  reactExports.useEffect(() => {
    if (!initialGame) return;
    setSelectedGame(initialGame);
    setSelectedDateKey(dateKey(new Date(initialGame.date)));
  }, [initialGame]);
  const anyLive = games.some((g) => g.status === "in_progress");
  const recentInterval = useAdaptiveInterval({
    anyLive,
    liveMs: 8e3,
    idleMs: 3e4,
    hiddenMs: null
  });
  reactExports.useEffect(() => {
    setGames([]);
    setSeasonLabel(null);
    setLoading(true);
    if (!isNcaaLeague) setActiveConferenceId(null);
  }, [activeLeagueId, scope, isNcaaLeague]);
  reactExports.useEffect(() => {
    if (!isNcaaLeague || !activeLeagueId) {
      setNcaaConferences([]);
      return;
    }
    let cancelled = false;
    void window.api.sports.listNcaaConferences(activeLeagueId).then((cs) => {
      if (!cancelled) setNcaaConferences(cs);
    });
    return () => {
      cancelled = true;
    };
  }, [activeLeagueId, isNcaaLeague]);
  reactExports.useEffect(() => {
    if (!activeLeagueId) return;
    let cancelled = false;
    const pull = async () => {
      if (scope === "season") {
        const res = await window.api.sports.listSeasonGames(activeLeagueId);
        if (cancelled) return;
        setGames(res.games);
        setSeasonLabel(res.range?.label ?? null);
      } else {
        const g = await window.api.sports.listGames(activeLeagueId, activeConferenceId);
        if (cancelled) return;
        setGames(g);
      }
      setLoading(false);
    };
    void pull();
    if (scope !== "recent" || recentInterval === null) {
      return () => {
        cancelled = true;
      };
    }
    const t = setInterval(() => void pull(), recentInterval);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [activeLeagueId, scope, recentInterval, activeConferenceId]);
  const dateGroups = reactExports.useMemo(() => groupGamesByDate(games), [games]);
  reactExports.useEffect(() => {
    if (dateGroups.length === 0) {
      setSelectedDateKey(null);
      return;
    }
    if (selectedDateKey && dateGroups.some((g) => g.key === selectedDateKey)) return;
    const today = dateKey(/* @__PURE__ */ new Date());
    const hasLiveToday = dateGroups.some(
      (g) => g.key === today && g.games.some((x) => x.status === "in_progress")
    );
    if (hasLiveToday) {
      setSelectedDateKey(today);
      return;
    }
    const liveGroup = dateGroups.find((g) => g.games.some((x) => x.status === "in_progress"));
    if (liveGroup) {
      setSelectedDateKey(liveGroup.key);
      return;
    }
    if (dateGroups.some((g) => g.key === today)) {
      setSelectedDateKey(today);
      return;
    }
    const upcoming = dateGroups.find((g) => g.key > today);
    setSelectedDateKey((upcoming ?? dateGroups[dateGroups.length - 1]).key);
  }, [dateGroups, selectedDateKey]);
  const refresh = async () => {
    if (!activeLeagueId) return;
    setLoading(true);
    try {
      if (scope === "season") {
        const res = await window.api.sports.listSeasonGames(activeLeagueId);
        setGames(res.games);
        setSeasonLabel(res.range?.label ?? null);
      } else {
        const g = await window.api.sports.listGames(activeLeagueId, activeConferenceId);
        setGames(g);
      }
    } finally {
      setLoading(false);
    }
  };
  const liveCount = games.filter((g) => g.status === "in_progress").length;
  const selectedGroup = dateGroups.find((g) => g.key === selectedDateKey) ?? null;
  const sortedGames = selectedGroup ? sortGamesForDate(selectedGroup.games) : [];
  const activeLeague = leagues.find((l) => l.id === activeLeagueId) ?? null;
  const lookupContext = activeLeague ? `${activeLeague.name} ${activeLeague.sport} league — page lists teams, players, coaches, and games.` : "Professional sports league page — teams, players, coaches, and games.";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "section",
    {
      className: "h-full bg-surface-0 flex flex-col min-w-0 min-h-0 overflow-hidden",
      "data-lookup-context": lookupContext,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-6 pt-6 pb-4 flex items-end justify-between gap-6 flex-wrap", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400/90 mb-1.5", children: "Live scores via ESPN" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[28px] leading-none font-bold text-zinc-50 tracking-tight", children: "Sports" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500", children: [
              games.length,
              " games ·",
              " ",
              scope === "season" ? seasonLabel ? `${seasonLabel} season` : "Full season" : "±21 day window"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-5 text-[11px] uppercase tracking-wider", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Live", value: liveCount, tone: liveCount > 0 ? "urgent" : "muted" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Stat, { label: "Days", value: dateGroups.length, tone: "accent" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center rounded-full bg-surface-2 p-0.5 ring-1 ring-inset ring-edge", children: ["recent", "season"].map((s) => {
              const active = scope === s;
              return /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setScope(s),
                  className: `px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${active ? "bg-orange-500/20 text-orange-200" : "text-zinc-400 hover:text-zinc-100"}`,
                  children: s === "recent" ? "Recent" : "Season"
                },
                s
              );
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: refresh,
                disabled: loading,
                className: "px-3 py-1.5 rounded-full bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-500/30 text-[10px] font-semibold uppercase tracking-[0.18em] hover:bg-orange-500/25 disabled:opacity-50",
                children: loading ? "Loading…" : "Refresh"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: onClose,
                className: "px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
                children: "Close"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 pb-3 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-edge", children: leagues.map((l) => {
          const active = l.id === activeLeagueId;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setActiveLeagueId(l.id),
              className: `shrink-0 px-3 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors relative inline-flex items-center gap-1.5 ${active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: l.shortName }),
                l.inPlayoffs && // Compact orange dot + pill so the indicator scales
                // with the tab strip; full "Playoffs" word would
                // crowd the row at small widths.
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "span",
                  {
                    title: "Playoffs in progress",
                    className: "inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full bg-orange-500/15 ring-1 ring-inset ring-orange-500/40 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-orange-300",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-1 h-1 rounded-full bg-orange-400 animate-pulse" }),
                      "Playoffs"
                    ]
                  }
                ),
                active && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute left-2 right-2 -bottom-px h-[2px] bg-orange-400 rounded-full" })
              ]
            },
            l.id
          );
        }) }),
        isNcaaLeague && scope === "recent" && ncaaConferences.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-2 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-edge bg-surface-1/40", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setActiveConferenceId(null),
              className: `shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${activeConferenceId === null ? "bg-orange-500/20 text-orange-200" : "text-zinc-500 hover:text-zinc-100 hover:bg-surface-2"}`,
              children: "All"
            }
          ),
          ncaaConferences.map((c) => {
            const active = c.id === activeConferenceId;
            return /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setActiveConferenceId(c.id),
                title: c.name,
                className: `shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${active ? "bg-orange-500/20 text-orange-200" : "text-zinc-500 hover:text-zinc-100 hover:bg-surface-2"}`,
                children: c.shortName
              },
              c.id
            );
          })
        ] }),
        dateGroups.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          DateRail,
          {
            groups: dateGroups,
            selectedKey: selectedDateKey,
            onSelect: (k) => setSelectedDateKey(k)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 overflow-y-auto", children: loading && games.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-20 text-center text-sm text-zinc-500", children: "Loading scoreboard…" }) : games.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-20 text-center text-sm text-zinc-500", children: scope === "season" ? "No games found for this season." : "No games scheduled in the current window." }) : !selectedGroup ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-20 text-center text-sm text-zinc-500", children: "Select a date above." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "px-6 pt-4 pb-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: dateLongLabel(selectedGroup.key) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: sortedGames.length })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-fr", children: sortedGames.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            GameCard,
            {
              game: g,
              sport: activeLeague?.sport ?? "",
              onOpen: () => setSelectedGame(g)
            },
            g.id
          )) }),
          isPlayoffs ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              LeagueLeadersSection,
              {
                leagueShort: activeLeagueObj?.shortName ?? "",
                categories: playoffLeaders,
                loading: leadersLoading,
                leagueId: activeLeagueId,
                segment: "playoffs",
                segmentTone: "orange",
                isFavorite: (id) => favoriteAthleteByKey.has(`${activeLeagueId}:${id}`),
                onToggleFavorite: (leader) => activeLeagueId && void toggleFavoriteAthlete(activeLeagueId, leader)
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              LeagueLeadersSection,
              {
                leagueShort: activeLeagueObj?.shortName ?? "",
                categories: leagueLeaders,
                loading: leadersLoading,
                leagueId: activeLeagueId,
                segment: "regular",
                segmentTone: "sky",
                isFavorite: (id) => favoriteAthleteByKey.has(`${activeLeagueId}:${id}`),
                onToggleFavorite: (leader) => activeLeagueId && void toggleFavoriteAthlete(activeLeagueId, leader)
              }
            )
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
            LeagueLeadersSection,
            {
              leagueShort: activeLeagueObj?.shortName ?? "",
              categories: leagueLeaders,
              loading: leadersLoading,
              leagueId: activeLeagueId,
              isFavorite: (id) => favoriteAthleteByKey.has(`${activeLeagueId}:${id}`),
              onToggleFavorite: (leader) => activeLeagueId && void toggleFavoriteAthlete(activeLeagueId, leader)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            TeamLeadersSection,
            {
              favorite: favoriteForLeague,
              categories: teamLeaders,
              loading: teamLeadersLoading,
              leagueId: activeLeagueId,
              isFavorite: (id) => favoriteAthleteByKey.has(`${activeLeagueId}:${id}`),
              onToggleFavorite: (leader) => activeLeagueId && void toggleFavoriteAthlete(activeLeagueId, leader)
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            SavedPlayersSection,
            {
              leagueId: activeLeagueId,
              athletes: favoriteAthletes.filter((a) => a.leagueId === activeLeagueId),
              onRemove: async (id) => {
                await window.api.favoriteAthletes.delete(id);
                const fresh = await window.api.favoriteAthletes.list();
                setFavoriteAthletes(fresh);
              }
            }
          )
        ] }) }),
        selectedGame && /* @__PURE__ */ jsxRuntimeExports.jsx(
          GameDetailOverlay,
          {
            game: selectedGame,
            onClose: () => setSelectedGame(null),
            onOpenURL
          }
        )
      ]
    }
  );
}
function LeagueLeadersSection({
  leagueShort,
  leagueId,
  categories,
  loading,
  isFavorite,
  onToggleFavorite,
  // When non-null, prepends a label tag (e.g. "Playoffs",
  // "Regular Season") to the heading and uses a separate
  // collapse-state key so each segment remembers its own toggle.
  segment,
  segmentTone
}) {
  const collapseKey = `leagueLeaders:${leagueId ?? "unknown"}:${segment ?? "all"}`;
  const defaultCollapsed = segment === "regular";
  const [collapsed, setCollapsed] = useCollapsedSection(collapseKey, defaultCollapsed);
  if (!loading && categories.length === 0) return null;
  const tint = segmentTone ?? "orange";
  const baseTitle = leagueShort ? `${leagueShort} Statistical Leaders` : "Statistical Leaders";
  const title = segment === "playoffs" ? `${baseTitle} — Playoffs` : segment === "regular" ? `${baseTitle} — Regular Season` : baseTitle;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-10", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setCollapsed((c) => !c),
        className: "w-full flex items-center gap-3 mb-3 group",
        children: [
          segment === "playoffs" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-500/10 ring-1 ring-inset ring-orange-500/30 text-[9px] font-semibold uppercase tracking-[0.18em] text-orange-300", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-orange-400" }),
            "Playoffs"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 group-hover:text-zinc-200 transition-colors", children: title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: categories.length }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(CollapseChevron, { open: !collapsed })
        ]
      }
    ),
    !collapsed && (loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8 text-center text-[12px] text-zinc-500", children: "Loading leaders…" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3", children: categories.map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      LeaderCategoryCard,
      {
        category: cat,
        tint,
        isFavorite,
        onToggleFavorite
      },
      cat.key
    )) }))
  ] });
}
function TeamLeadersSection({
  favorite,
  categories,
  loading,
  isFavorite,
  onToggleFavorite
}) {
  if (!favorite) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-10", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: "Favorite Team Leaders" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-6 text-center text-[12px] text-zinc-500", children: "Add a favorite team for this league in Settings → Sports to see per-player leaders." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-10 pb-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        favorite.logoURL && /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: favorite.logoURL, alt: "", className: "w-5 h-5 rounded-full" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-300", children: [
          favorite.teamName,
          " Leaders"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: categories.length })
    ] }),
    loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8 text-center text-[12px] text-zinc-500", children: "Loading team leaders…" }) : categories.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-6 text-center text-[12px] text-zinc-500", children: "ESPN did not return per-player leaders for this team." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3", children: categories.map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      LeaderCategoryCard,
      {
        category: cat,
        tint: "sky",
        isFavorite,
        onToggleFavorite
      },
      cat.key
    )) })
  ] });
}
function SavedPlayersSection({
  leagueId,
  athletes,
  onRemove
}) {
  if (!leagueId || athletes.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-10 pb-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300", children: "Saved players" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-px flex-1 bg-edge/80" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: athletes.length })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2", children: athletes.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "flex items-center gap-2 px-3 py-2 rounded-md bg-surface-1/60 border border-edge",
        children: [
          a.headshotURL ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: a.headshotURL,
              alt: "",
              className: "w-8 h-8 rounded-full object-cover bg-surface-2"
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-8 h-8 rounded-full bg-surface-2" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[12px] text-zinc-100 truncate", children: a.athleteName }),
            a.teamAbbreviation && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-zinc-500 tabular-nums", children: a.teamAbbreviation })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => void onRemove(a.id),
              className: "text-zinc-500 hover:text-red-300 text-[11px] font-semibold uppercase tracking-[0.18em]",
              "aria-label": "Remove saved player",
              children: "×"
            }
          )
        ]
      },
      a.id
    )) })
  ] });
}
function LeaderCategoryCard({
  category,
  tint,
  isFavorite,
  onToggleFavorite
}) {
  const accent = tint === "orange" ? "text-orange-300" : "text-sky-300";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-edge bg-surface-1/60 px-4 py-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: `text-[10px] font-semibold uppercase tracking-[0.18em] ${accent} mb-2`,
        children: category.name
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "space-y-1.5", children: category.leaders.map((ldr, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      LeaderRow,
      {
        rank: i + 1,
        leader: ldr,
        favorited: isFavorite ? Boolean(ldr.athleteId) && isFavorite(ldr.athleteId) : false,
        onToggleFavorite
      },
      `${ldr.athleteId || ldr.athleteName}-${i}`
    )) })
  ] });
}
function LeaderRow({
  rank,
  leader,
  favorited,
  onToggleFavorite
}) {
  const canFavorite = Boolean(leader.athleteId) && Boolean(onToggleFavorite);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "group flex items-center gap-2 text-[12px]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-4 tabular-nums text-[10px] text-zinc-500", children: rank }),
    leader.headshotURL ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src: leader.headshotURL,
        alt: "",
        className: "w-6 h-6 rounded-full object-cover bg-surface-2"
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-6 h-6 rounded-full bg-surface-2" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 min-w-0 truncate text-zinc-200", children: leader.athleteName }),
    leader.teamAbbreviation && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] tabular-nums text-zinc-500", children: leader.teamAbbreviation }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tabular-nums font-semibold text-zinc-100", children: leader.value }),
    canFavorite && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => onToggleFavorite?.(leader),
        className: `text-[12px] leading-none transition-opacity ${favorited ? "text-amber-300 opacity-100" : "text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-amber-300"}`,
        "aria-label": favorited ? "Unsave player" : "Save player",
        title: favorited ? "Unsave player" : "Save player",
        children: favorited ? "★" : "☆"
      }
    )
  ] });
}
function dateKey(d) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function groupGamesByDate(games) {
  const map = /* @__PURE__ */ new Map();
  for (const g of games) {
    if (!g.date) continue;
    const d = new Date(g.date);
    const key = dateKey(d);
    let group = map.get(key);
    if (!group) {
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      group = { key, ts: midnight, games: [] };
      map.set(key, group);
    }
    group.games.push(g);
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
}
function sortGamesForDate(games) {
  const order = {
    in_progress: 0,
    scheduled: 1,
    postponed: 2,
    final: 3,
    canceled: 4
  };
  return [...games].sort((a, b) => {
    const ord = order[a.status] - order[b.status];
    if (ord !== 0) return ord;
    return a.date - b.date;
  });
}
function dateShortLabel(key, todayKey) {
  if (key === todayKey) {
    const d2 = parseDateKey(key);
    return { primary: "Today", sub: d2.toLocaleDateString(void 0, { month: "short", day: "numeric" }) };
  }
  const d = parseDateKey(key);
  const todayD = parseDateKey(todayKey);
  const diffDays = Math.round((d.getTime() - todayD.getTime()) / 864e5);
  if (diffDays === 1) return { primary: "Tomorrow", sub: d.toLocaleDateString(void 0, { month: "short", day: "numeric" }) };
  if (diffDays === -1) return { primary: "Yesterday", sub: d.toLocaleDateString(void 0, { month: "short", day: "numeric" }) };
  return {
    primary: d.toLocaleDateString(void 0, { weekday: "short" }),
    sub: d.toLocaleDateString(void 0, { month: "short", day: "numeric" })
  };
}
function dateLongLabel(key) {
  const d = parseDateKey(key);
  const today = dateKey(/* @__PURE__ */ new Date());
  if (key === today) return `Today · ${d.toLocaleDateString(void 0, { weekday: "long", month: "long", day: "numeric" })}`;
  return d.toLocaleDateString(void 0, { weekday: "long", month: "long", day: "numeric" });
}
function parseDateKey(key) {
  const [y, m, d] = key.split("-").map((s) => parseInt(s, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function DateRail({
  groups,
  selectedKey,
  onSelect
}) {
  const railRef = reactExports.useRef(null);
  const todayKey = dateKey(/* @__PURE__ */ new Date());
  reactExports.useEffect(() => {
    if (!railRef.current || !selectedKey) return;
    const el = railRef.current.querySelector(`[data-date-key="${selectedKey}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedKey]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      ref: railRef,
      className: "px-6 py-3 flex items-stretch gap-1.5 overflow-x-auto scrollbar-none border-b border-edge",
      children: groups.map((g) => {
        const active = g.key === selectedKey;
        const isToday = g.key === todayKey;
        const liveCount = g.games.filter((x) => x.status === "in_progress").length;
        const { primary, sub } = dateShortLabel(g.key, todayKey);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            "data-date-key": g.key,
            onClick: () => onSelect(g.key),
            className: `shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg text-center transition-colors min-w-[68px] ${active ? "bg-orange-500/15 ring-1 ring-inset ring-orange-500/40 text-zinc-50" : isToday ? "text-zinc-200 hover:bg-surface-2 ring-1 ring-inset ring-edge" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 ring-1 ring-inset ring-transparent"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold tracking-[0.04em] leading-none", children: primary }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase tracking-[0.16em] tabular-nums text-zinc-500 leading-none", children: sub }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex items-center gap-1 mt-0.5 text-[10px] tabular-nums", children: liveCount > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative flex w-1.5 h-1.5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute inset-0 rounded-full opacity-60 animate-ping bg-red-400" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "relative w-1.5 h-1.5 rounded-full bg-red-400" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-red-300", children: [
                  liveCount,
                  " live"
                ] })
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: g.games.length }) })
            ]
          },
          g.key
        );
      })
    }
  );
}
function GameCard({
  game,
  sport,
  onOpen
}) {
  const isLive = game.status === "in_progress";
  const isFinal = game.status === "final";
  const ring = isLive ? "border-red-500/40 hover:border-red-500/60 hover:shadow-[0_8px_24px_rgba(239,68,68,0.15)]" : isFinal ? "border-edge/70 hover:border-edge" : "border-edge/70 hover:border-edge";
  const scoreEvent = useScoreEvent(game);
  const showScore = !game.status.startsWith("sched") && game.status !== "postponed";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      onClick: onOpen,
      className: `card-lift relative rounded-xl border bg-surface-1 hover:bg-surface-2 p-5 flex flex-col min-w-0 h-full text-left transition-colors ${ring}`,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2 mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GameStatusBadge, { game }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: `text-[10px] uppercase tracking-[0.18em] tabular-nums ${isLive ? "text-red-300 font-semibold" : "text-zinc-500"}`,
              children: formatGameTime(game)
            }
          )
        ] }),
        game.series && // Playoff series header. Shows the round title (e.g. "Western
        // Conference Finals" or "World Series") plus a compact win
        // count if ESPN populated the per-team series wins. Tied at
        // 0-0 means the series just started; we still want the title
        // visible so the context is clear.
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 px-2 py-1.5 rounded-md bg-orange-500/8 ring-1 ring-inset ring-orange-500/25 flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9.5px] font-semibold uppercase tracking-[0.18em] text-orange-300 truncate", children: game.series.title ?? game.series.summary ?? "Playoff Series" }),
          (game.series.homeWins > 0 || game.series.awayWins > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10.5px] font-semibold tabular-nums text-orange-200 shrink-0", children: [
            game.away.abbreviation,
            " ",
            game.series.awayWins,
            " ·",
            " ",
            game.series.homeWins,
            " ",
            game.home.abbreviation
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          GameTeamRow,
          {
            team: game.away,
            winner: game.away.winner === true,
            showScore,
            flourish: scoreEvent?.side === "away" ? scoreEvent : null,
            sport
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "my-2 h-px bg-edge/50" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          GameTeamRow,
          {
            team: game.home,
            winner: game.home.winner === true,
            showScore,
            flourish: scoreEvent?.side === "home" ? scoreEvent : null,
            sport
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 pt-3 border-t border-edge/40 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: game.venue ?? "—" }),
          game.broadcasts.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-400 truncate text-right", children: game.broadcasts[0] })
        ] })
      ]
    }
  );
}
function GameStatusBadge({ game }) {
  if (game.status === "in_progress") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 ring-1 ring-inset ring-red-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "relative flex w-1.5 h-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute inset-0 rounded-full opacity-60 animate-ping bg-red-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "relative w-1.5 h-1.5 rounded-full bg-red-400" })
      ] }),
      "Live · ",
      game.statusShort || `Q${game.period ?? ""}`
    ] });
  }
  if (game.status === "final") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full bg-zinc-500/15 ring-1 ring-inset ring-zinc-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300", children: "Final" });
  }
  if (game.status === "postponed") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full bg-amber-500/15 ring-1 ring-inset ring-amber-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300", children: "Postponed" });
  }
  if (game.status === "canceled") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full bg-zinc-500/10 ring-1 ring-inset ring-zinc-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400", children: "Canceled" });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full bg-blue-500/10 ring-1 ring-inset ring-blue-500/30 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-300", children: "Scheduled" });
}
function GameTeamRow({
  team,
  winner,
  showScore,
  flourish,
  sport
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-3 ${winner ? "text-zinc-50" : "text-zinc-300"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TeamLogo, { logoURL: team.logoURL, abbreviation: team.abbreviation }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-[14px] truncate ${winner ? "font-bold" : "font-semibold"}`, children: team.shortName }),
      team.record && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-0.5 truncate", children: team.record })
    ] }),
    showScore && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `relative text-[20px] tabular-nums leading-none shrink-0 ${winner ? "font-bold text-zinc-50" : "font-semibold"}`, children: [
      team.score ?? "—",
      flourish && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute -top-5 right-0 translate-x-2 pointer-events-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ScoreFlourish,
        {
          event: flourish,
          sport: sport ?? "",
          size: "md",
          teamColor: team.color ?? team.altColor
        }
      ) })
    ] })
  ] });
}
function TeamLogo({
  logoURL,
  abbreviation
}) {
  if (logoURL) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src: logoURL,
        alt: "",
        className: "w-7 h-7 shrink-0 object-contain",
        onError: (e) => {
          e.currentTarget.style.display = "none";
        }
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-7 h-7 shrink-0 rounded bg-surface-2 flex items-center justify-center text-[10px] font-bold text-zinc-300", children: abbreviation.slice(0, 3) });
}
function formatGameTime(game) {
  if (!game.date) return "";
  const d = new Date(game.date);
  const now = /* @__PURE__ */ new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const date = d.toLocaleDateString(void 0, { month: "short", day: "numeric" });
  return `${date} · ${time}`;
}
function GameDetailOverlay({
  game,
  onClose,
  onOpenURL
}) {
  const [detail, setDetail] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [showHighlights, setShowHighlights] = reactExports.useState(false);
  const isLive = (detail?.status ?? game.status) === "in_progress";
  const detailInterval = useAdaptiveInterval({
    anyLive: isLive,
    liveMs: 5e3,
    idleMs: 6e4,
    hiddenMs: null
  });
  reactExports.useEffect(() => {
    setDetail(null);
    setLoading(true);
  }, [game.id]);
  reactExports.useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const d = await window.api.sports.getGameDetail(
        game.leagueId,
        game.leaguePath,
        game.id
      );
      if (cancelled) return;
      if (d) setDetail(d);
      setLoading(false);
    };
    void pull();
    if (!isLive || detailInterval === null) {
      return () => {
        cancelled = true;
      };
    }
    const t = setInterval(() => void pull(), detailInterval);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [game.leagueId, game.leaguePath, game.id, isLive, detailInterval]);
  reactExports.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  reactExports.useEffect(() => {
    setShowHighlights(false);
  }, [game.id]);
  const displayGame = detail ?? game;
  const isPast = game.status === "final";
  const sport = sportForLeagueId(game.leagueId);
  const scoreEvent = useScoreEvent(displayGame);
  const highlightQuery = detail?.highlightSearchQuery ?? `${game.away.name} vs ${game.home.name} highlights`;
  const searchURL = `https://www.youtube.com/results?search_query=${encodeURIComponent(highlightQuery)}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute inset-0 z-30 bg-surface-0 flex flex-col min-h-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "px-6 pt-5 pb-4 border-b border-edge flex items-start justify-between gap-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400/90 mb-1.5", children: [
          LeagueName(game.leagueId),
          " · ",
          formatGameTime(game)
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ScoreBlock,
            {
              team: displayGame.away,
              status: displayGame.status,
              flourish: scoreEvent?.side === "away" ? scoreEvent : null,
              sport
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[14px] font-semibold uppercase tracking-[0.2em] text-zinc-500", children: "@" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ScoreBlock,
            {
              team: displayGame.home,
              status: displayGame.status,
              flourish: scoreEvent?.side === "home" ? scoreEvent : null,
              sport
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: displayGame.status === "in_progress" ? "text-red-300 font-semibold" : void 0,
              children: displayGame.statusDetail || displayGame.statusShort || "—"
            }
          ),
          displayGame.venue && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            " · ",
            displayGame.venue
          ] }),
          displayGame.broadcasts.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            " · ",
            displayGame.broadcasts.join(", ")
          ] })
        ] }),
        displayGame.series && // Mirror the game-card series header on the detail page so
        // the round + series score stays visible while the user
        // scrolls through stats. Larger and slightly more prominent
        // here since the detail page has the room.
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 inline-flex items-center gap-3 px-3 py-1.5 rounded-md bg-orange-500/10 ring-1 ring-inset ring-orange-500/30", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-300", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" }),
            displayGame.series.title ?? displayGame.series.summary ?? "Playoff Series"
          ] }),
          (displayGame.series.homeWins > 0 || displayGame.series.awayWins > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[12px] font-semibold tabular-nums text-orange-100", children: [
            displayGame.away.abbreviation,
            " ",
            displayGame.series.awayWins,
            " ·",
            " ",
            displayGame.series.homeWins,
            " ",
            displayGame.home.abbreviation
          ] }),
          displayGame.series.summary && displayGame.series.summary !== displayGame.series.title && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10.5px] text-orange-200/80 normal-case tracking-normal", children: displayGame.series.summary })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
        isPast && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setShowHighlights((v) => !v),
            className: "px-3 py-1.5 rounded-full bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-500/30 text-[10px] font-semibold uppercase tracking-[0.18em] hover:bg-red-500/25",
            children: showHighlights ? "Hide highlights" : "▶ Highlights"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onClose,
            className: "px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.18em]",
            children: "Close"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-h-0 overflow-y-auto", children: [
      showHighlights && isPast && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 pt-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3 mb-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: "YouTube highlights" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "rounded-xl border border-edge bg-black overflow-hidden",
            style: { height: 480 },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "webview",
              {
                src: searchURL,
                partition: "persist:youtube",
                style: { display: "flex", width: "100%", height: "100%" }
              },
              `search-${searchURL}`
            )
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: [
          "Query: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-300 normal-case tracking-normal", children: highlightQuery })
        ] })
      ] }),
      loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-12 text-sm text-zinc-500", children: "Loading game details…" }) : detail ? /* @__PURE__ */ jsxRuntimeExports.jsx(GameDetailBody, { detail, onOpenURL }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-12 text-sm text-zinc-500", children: "No additional detail is available for this game yet." })
    ] })
  ] });
}
function ScoreBlock({
  team,
  status,
  flourish,
  sport
}) {
  const showScore = status !== "scheduled" && status !== "postponed" && status !== "canceled";
  const winner = team.winner === true;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 min-w-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TeamLogo, { logoURL: team.logoURL, abbreviation: team.abbreviation }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-[18px] truncate ${winner ? "font-bold text-zinc-50" : "font-semibold text-zinc-200"}`, children: team.shortName }),
      team.record && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 truncate", children: team.record })
    ] }),
    showScore && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `relative text-[28px] tabular-nums leading-none ${winner ? "font-bold text-zinc-50" : "font-semibold text-zinc-300"}`, children: [
      team.score ?? "—",
      flourish && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute -top-7 right-0 translate-x-2 pointer-events-none", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        ScoreFlourish,
        {
          event: flourish,
          sport: sport ?? "",
          size: "lg",
          teamColor: team.color ?? team.altColor
        }
      ) })
    ] })
  ] });
}
function LeagueName(leagueId) {
  switch (leagueId) {
    case "nfl":
      return "NFL";
    case "nba":
      return "NBA";
    case "mlb":
      return "MLB";
    case "nhl":
      return "NHL";
    case "ucl":
      return "UEFA Champions League";
    case "epl":
      return "Premier League";
    case "laliga":
      return "La Liga";
    case "seriea":
      return "Serie A";
    case "cricket":
      return "Cricket";
    default:
      return leagueId.toUpperCase();
  }
}
function GameDetailBody({
  detail,
  onOpenURL
}) {
  const homeLeaders = detail.leaders.filter((l) => l.team === "home");
  const awayLeaders = detail.leaders.filter((l) => l.team === "away");
  const isMlb = detail.leagueId === "mlb";
  const isNba = detail.leagueId === "nba";
  const homePlayers = detail.playerStats?.find((p) => p.team === "home");
  const awayPlayers = detail.playerStats?.find((p) => p.team === "away");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
    isMlb && detail.linescore && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-edge bg-surface-1 p-5 lg:col-span-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4", children: "Line score" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(LinescoreTable, { detail })
    ] }),
    isMlb && (awayPlayers || homePlayers) && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-edge bg-surface-1 p-5 lg:col-span-2 space-y-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: "Batting & pitching" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        MlbPlayerStats,
        {
          awayLabel: detail.away.shortName,
          homeLabel: detail.home.shortName,
          awayPlayers,
          homePlayers
        }
      )
    ] }),
    isNba && (awayPlayers || homePlayers) && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-edge bg-surface-1 p-5 lg:col-span-2 space-y-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: "Player stats" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        NbaPlayerStats,
        {
          awayLabel: detail.away.shortName,
          homeLabel: detail.home.shortName,
          awayPlayers,
          homePlayers
        }
      )
    ] }),
    detail.stats.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-edge bg-surface-1 p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4", children: "Team stats" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1", children: (() => {
        const half = Math.ceil(detail.stats.length / 2);
        const left = detail.stats.slice(0, half);
        const right = detail.stats.slice(half);
        const renderColumn = (items, key) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1.5 text-[12px]",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-right text-[9.5px] uppercase tracking-[0.18em] text-zinc-500", children: detail.away.abbreviation }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] uppercase tracking-[0.18em] text-zinc-500 text-center", children: "Stat" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[9.5px] uppercase tracking-[0.18em] text-zinc-500", children: detail.home.abbreviation }),
              items.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(FragmentRow, { stat: s }, s.label))
            ]
          },
          key
        );
        return [renderColumn(left, "left"), renderColumn(right, "right")];
      })() })
    ] }),
    (awayLeaders.length > 0 || homeLeaders.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-edge bg-surface-1 p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4", children: "Leaders" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-6 text-[12px]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LeaderColumn, { label: detail.away.shortName, leaders: awayLeaders }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(LeaderColumn, { label: detail.home.shortName, leaders: homeLeaders })
      ] })
    ] }),
    detail.headlines.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-xl border border-edge bg-surface-1 p-5 lg:col-span-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4", children: "Headlines" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: detail.headlines.map((h, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
        h.link ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onOpenURL(h.link ?? "", h.title, h.description ?? null),
            className: "text-[13px] text-zinc-200 hover:text-zinc-50 text-left",
            children: h.title
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[13px] text-zinc-200", children: h.title }),
        h.description && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] text-zinc-500 mt-0.5", children: h.description })
      ] }, i)) })
    ] })
  ] });
}
function FragmentRow({ stat }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-right tabular-nums text-zinc-200", children: stat.away }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: stat.label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "tabular-nums text-zinc-200", children: stat.home })
  ] });
}
function leaderInitials(athlete) {
  const tokens = athlete.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0].charAt(0).toUpperCase();
  return (tokens[0].charAt(0) + tokens[tokens.length - 1].charAt(0)).toUpperCase();
}
function LeaderHeadshot({
  url,
  teamLogoURL,
  athlete
}) {
  const initialStage = url ? "player" : teamLogoURL ? "team" : "initials";
  const [stage, setStage] = reactExports.useState(initialStage);
  reactExports.useEffect(() => {
    setStage(url ? "player" : teamLogoURL ? "team" : "initials");
  }, [url, teamLogoURL]);
  if (stage === "player" && url) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src: url,
        alt: athlete,
        loading: "lazy",
        onError: () => setStage(teamLogoURL ? "team" : "initials"),
        className: "w-16 h-16 rounded-full object-cover bg-surface-2 ring-1 ring-edge shrink-0"
      }
    );
  }
  if (stage === "team" && teamLogoURL) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src: teamLogoURL,
        alt: `${athlete} (team crest)`,
        loading: "lazy",
        onError: () => setStage("initials"),
        className: "w-16 h-16 rounded-full object-contain bg-surface-2 ring-1 ring-edge shrink-0 p-1.5"
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-16 h-16 rounded-full bg-surface-2 ring-1 ring-edge text-[16px] font-semibold tracking-wide text-zinc-300 flex items-center justify-center shrink-0", children: leaderInitials(athlete) });
}
function LeaderColumn({
  label,
  leaders
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-3", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "space-y-3", children: [
      leaders.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("li", { className: "text-[11px] text-zinc-500", children: "—" }),
      leaders.map((l, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "li",
        {
          className: "grid grid-cols-[64px_1fr_auto] items-center gap-3",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              LeaderHeadshot,
              {
                url: l.headshotURL,
                teamLogoURL: l.teamLogoURL,
                athlete: l.athlete
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500 leading-tight mb-1", children: l.category }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[13.5px] text-zinc-100 leading-tight truncate", children: l.athlete || "—" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[20px] font-semibold tabular-nums text-zinc-100", children: l.value })
          ]
        },
        i
      ))
    ] })
  ] });
}
function LinescoreTable({ detail }) {
  const ls = detail.linescore;
  const cols = Math.max(ls.columns, 9);
  const pad = (xs) => {
    const out = xs.slice();
    while (out.length < cols) out.push(null);
    return out;
  };
  const awayInnings = pad(ls.away.innings);
  const homeInnings = pad(ls.home.innings);
  const inningCells = Array.from({ length: cols }, (_, i) => i + 1);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-[12px] tabular-nums", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "text-[10px] uppercase tracking-[0.18em] text-zinc-500", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left font-medium py-1.5 pr-4", children: "Team" }),
      inningCells.map((i) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-2 font-medium text-center", children: i }, i)),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "pl-4 pr-2 font-semibold text-center text-zinc-300", children: "R" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-2 font-semibold text-center text-zinc-300", children: "H" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-2 font-semibold text-center text-zinc-300", children: "E" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { className: "divide-y divide-edge/60", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        LinescoreRow,
        {
          label: detail.away.abbreviation,
          innings: awayInnings,
          totals: ls.away
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        LinescoreRow,
        {
          label: detail.home.abbreviation,
          innings: homeInnings,
          totals: ls.home
        }
      )
    ] })
  ] }) });
}
function LinescoreRow({
  label,
  innings,
  totals
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-1.5 pr-4 font-semibold tracking-[0.12em] uppercase text-[11px] text-zinc-200", children: label }),
    innings.map((v, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 text-center text-zinc-300", children: v === null ? "—" : v }, i)),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "pl-4 pr-2 text-center font-semibold text-zinc-100", children: totals.runs ?? "—" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 text-center text-zinc-200", children: totals.hits ?? "—" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 text-center text-zinc-200", children: totals.errors ?? "—" })
  ] });
}
function MlbPlayerStats({
  awayLabel,
  homeLabel,
  awayPlayers,
  homePlayers
}) {
  const categories = ["batting", "pitching"];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-5", children: categories.map((cat) => {
    const awayGroup = awayPlayers?.groups.find((g) => matchesCategory(g.category, cat));
    const homeGroup = homePlayers?.groups.find((g) => matchesCategory(g.category, cat));
    if (!awayGroup && !homeGroup) return null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400", children: cat }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-2 gap-4", children: [
        awayGroup && /* @__PURE__ */ jsxRuntimeExports.jsx(PlayerStatTable, { teamLabel: awayLabel, group: awayGroup }),
        homeGroup && /* @__PURE__ */ jsxRuntimeExports.jsx(PlayerStatTable, { teamLabel: homeLabel, group: homeGroup })
      ] })
    ] }, cat);
  }) });
}
function matchesCategory(category, target) {
  return category.toLowerCase().includes(target);
}
function NbaPlayerStats({
  awayLabel,
  homeLabel,
  awayPlayers,
  homePlayers
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-2 gap-4", children: [
    awayPlayers && /* @__PURE__ */ jsxRuntimeExports.jsx(NbaTeamTable, { teamLabel: awayLabel, team: awayPlayers }),
    homePlayers && /* @__PURE__ */ jsxRuntimeExports.jsx(NbaTeamTable, { teamLabel: homeLabel, team: homePlayers })
  ] });
}
function NbaTeamTable({
  teamLabel,
  team
}) {
  const group = team.groups[0];
  if (!group) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", {});
  const starters = group.players.filter((p) => p.isStarter);
  const bench = group.players.filter((p) => !p.isStarter);
  const ordered = [...starters, ...bench];
  const merged = { labels: group.labels, players: ordered, totals: group.totals };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(PlayerStatTable, { teamLabel, group: merged });
}
function PlayerStatTable({
  teamLabel,
  group
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-edge/70 bg-surface-2/40 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400 border-b border-edge/70", children: teamLabel }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-[11px] tabular-nums", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "text-[10px] uppercase tracking-[0.14em] text-zinc-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left font-medium px-3 py-1.5", children: "Player" }),
        group.labels.map((l, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-2 py-1.5 text-right font-medium", children: l }, i))
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { className: "divide-y divide-edge/40", children: [
        group.players.map((p, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-3 py-1 text-left text-zinc-200", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: p.athlete }),
            p.position && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1.5 text-[10px] text-zinc-500 uppercase tracking-[0.12em]", children: p.position })
          ] }),
          p.stats.map((s, j) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 py-1 text-right text-zinc-300", children: s || "—" }, j))
        ] }, i)),
        group.totals && /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "bg-surface-1/40", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1 text-left text-[10px] uppercase tracking-[0.14em] text-zinc-400", children: "Totals" }),
          group.totals.map((s, j) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 py-1 text-right text-zinc-200 font-semibold", children: s || "—" }, j))
        ] })
      ] })
    ] }) })
  ] });
}
class ErrorBoundary extends reactExports.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(
      `[ErrorBoundary${this.props.scope ? " " + this.props.scope : ""}]`,
      error,
      info.componentStack
    );
  }
  reset = () => {
    this.setState({ error: null });
  };
  reload = () => {
    window.location.reload();
  };
  render() {
    if (this.state.error === null) return this.props.children;
    const isTopLevel = !this.props.scope;
    const heading = isTopLevel ? "Pulse hit an error" : `Something went wrong in ${this.props.scope}`;
    const detail = this.state.error.message || String(this.state.error);
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: isTopLevel ? "min-h-screen flex flex-col items-center justify-center bg-surface-0 px-8 text-center" : "flex flex-col items-center justify-center px-6 py-12 text-center text-zinc-300",
        role: "alert",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[11px] font-semibold uppercase tracking-[0.28em] text-red-400/90 mb-3", children: "Render error" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[18px] font-bold text-zinc-100 mb-2", children: heading }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[12px] text-zinc-400 max-w-[480px] mb-5 leading-relaxed", children: detail }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            !isTopLevel && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: this.reset,
                className: "text-[11px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-zinc-800/70 text-zinc-200 ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700",
                children: "Try again"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: this.reload,
                className: "text-[11px] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-200 ring-1 ring-inset ring-emerald-500/40 hover:bg-emerald-500/25",
                children: "Reload Pulse"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-600 mt-6 max-w-[480px]", children: "Details are in the dev console (Cmd+Opt+I)." })
        ]
      }
    );
  }
}
client.createRoot(document.getElementById("root")).render(
  /* @__PURE__ */ jsxRuntimeExports.jsx(React.StrictMode, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ErrorBoundary, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(App, {}) }) })
);
