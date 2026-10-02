import type { BoardTile } from "./domain/board";
import type { ChanceCardId, PlayerId } from "./domain/game";
import type { Language } from "./settings/preferences";

type Messages = {
  readonly players: Record<PlayerId, string>;
  readonly worldAria: string;
  readonly hud: {
    readonly balancesAria: string;
    readonly enterFirstPerson: string;
    readonly recentDiceAria: string;
    readonly roll: string;
    readonly buy: string;
    readonly buyWithPrice: (price: number) => string;
    readonly skip: string;
    readonly pointerPurchase: (price: number) => string;
    readonly pointerRoll: string;
    readonly pointerIdle: string;
  };
  readonly settings: {
    readonly title: string;
    readonly close: string;
    readonly closeAria: string;
    readonly sound: string;
    readonly soundHelp: string;
    readonly sensitivity: string;
    readonly sensitivityHelp: string;
    readonly sensitivityAria: string;
    readonly low: string;
    readonly standard: string;
    readonly high: string;
    readonly language: string;
    readonly languageHelp: string;
    readonly languageAria: string;
    readonly note: string;
  };
  readonly status: {
    readonly initial: string;
    readonly rolling: string;
    readonly insufficientFunds: string;
    readonly purchased: (propertyName: string) => string;
    readonly skipped: (propertyName: string) => string;
    readonly botActing: string;
    readonly yourTurn: string;
    readonly botPurchased: (propertyName: string) => string;
    readonly botSkipped: (propertyName: string) => string;
    readonly soundEnabled: string;
    readonly soundDisabled: string;
    readonly sensitivityUpdated: string;
    readonly winner: (playerName: string) => string;
    readonly gameOver: string;
    readonly rollPropertyAvailable: (actor: string, steps: number) => string;
    readonly rollRent: (actor: string, steps: number, amount: number) => string;
    readonly rollTax: (actor: string, steps: number, amount: number) => string;
    readonly rollChance: (actor: string, steps: number, message: string) => string;
    readonly rollOwned: (actor: string, steps: number) => string;
    readonly rollStart: (actor: string, steps: number) => string;
  };
  readonly feedback: {
    readonly yourTurnKicker: string;
    readonly rivalTurnKicker: string;
    readonly yourTurnTitle: string;
    readonly rivalTurnTitle: string;
    readonly diceActor: (actor: string) => string;
    readonly diceAnnouncement: (
      actor: string,
      left: number,
      right: number,
      total: number,
    ) => string;
    readonly passedStart: string;
    readonly moved: (actor: string, steps: number) => string;
    readonly propertyAvailable: (propertyName: string) => string;
    readonly salePrice: (price: number) => string;
    readonly propertyOwned: (propertyName: string) => string;
    readonly ownProperty: string;
    readonly rentPaid: (amount: number) => string;
    readonly landedOn: (propertyName: string) => string;
    readonly feePaid: (amount: number) => string;
    readonly fundsGain: (amount: number) => string;
    readonly fundsLoss: (amount: number) => string;
    readonly backToStart: string;
    readonly continueNextTurn: string;
    readonly moveCompleted: (actor: string) => string;
    readonly propertyAcquiredKicker: string;
    readonly bought: (actor: string, propertyName: string) => string;
    readonly dealPrice: (price: number) => string;
    readonly propertyKicker: string;
    readonly skipped: (actor: string, propertyName: string) => string;
    readonly propertyUnowned: string;
    readonly victoryKicker: string;
    readonly gameOverKicker: string;
    readonly humanWonTitle: string;
    readonly botWonTitle: string;
    readonly humanWonDetail: string;
    readonly botWonDetail: string;
    readonly gameOverDetail: string;
    readonly restart: string;
  };
  readonly board: {
    readonly startDetail: string;
    readonly chanceDetail: string;
    readonly propertyDetail: (price: number, rent: number) => string;
  };
  readonly chanceCards: Record<ChanceCardId, string>;
};

const ZH_MESSAGES: Messages = {
  players: { human: "你", bot: "城市玩家" },
  worldAria: "3D 大富翁棋盘",
  hud: {
    balancesAria: "玩家资金",
    enterFirstPerson: "点击画面进入第一人称",
    recentDiceAria: "最近一次骰子",
    roll: "掷骰子",
    buy: "购买",
    buyWithPrice: (price) => `购买 · ${price}`,
    skip: "跳过",
    pointerPurchase: (price) => `B 购买 ¥${price} · N 跳过 · M 声音 · Esc 退出`,
    pointerRoll: "Space 掷骰 · M 声音 · Esc 退出",
    pointerIdle: "M 声音 · Esc 退出",
  },
  settings: {
    title: "设置",
    close: "关闭",
    closeAria: "关闭设置",
    sound: "声音",
    soundHelp: "游戏音效",
    sensitivity: "鼠标灵敏度",
    sensitivityHelp: "第一人称环视",
    sensitivityAria: "第一人称鼠标灵敏度",
    low: "低",
    standard: "标准",
    high: "高",
    language: "语言",
    languageHelp: "界面与棋盘文字",
    languageAria: "游戏语言",
    note: "设置会保存在当前浏览器。",
  },
  status: {
    initial: "你的回合，掷骰开始。",
    rolling: "正在掷骰…",
    insufficientFunds: "资金不足，无法购买这块地产。",
    purchased: (propertyName) => `已购买「${propertyName}」。`,
    skipped: (propertyName) => `已跳过「${propertyName}」。`,
    botActing: "城市玩家正在行动…",
    yourTurn: "轮到你了。",
    botPurchased: (propertyName) => `城市玩家购买了「${propertyName}」。`,
    botSkipped: (propertyName) => `城市玩家跳过了「${propertyName}」。`,
    soundEnabled: "声音已开启。",
    soundDisabled: "声音已关闭。",
    sensitivityUpdated: "鼠标灵敏度已更新。",
    winner: (playerName) => `${playerName}获胜。`,
    gameOver: "游戏结束。",
    rollPropertyAvailable: (actor, steps) => `${actor}移动 ${steps} 格，这块地产可以购买。`,
    rollRent: (actor, steps, amount) => `${actor}移动 ${steps} 格，支付租金 ${amount}。`,
    rollTax: (actor, steps, amount) => `${actor}移动 ${steps} 格，支付费用 ${amount}。`,
    rollChance: (actor, steps, message) => `${actor}移动 ${steps} 格：${message}`,
    rollOwned: (actor, steps) => `${actor}移动 ${steps} 格，回到自己的地产。`,
    rollStart: (actor, steps) => `${actor}移动 ${steps} 格，回到起点。`,
  },
  feedback: {
    yourTurnKicker: "YOUR TURN",
    rivalTurnKicker: "RIVAL TURN",
    yourTurnTitle: "轮到你了",
    rivalTurnTitle: "城市玩家行动",
    diceActor: (actor) => `${actor}掷骰`,
    diceAnnouncement: (actor, left, right, total) =>
      `${actor}掷出 ${left} 加 ${right}，共 ${total}`,
    passedStart: "经过起点 +¥200 · ",
    moved: (actor, steps) => `${actor}移动 ${steps} 格`,
    propertyAvailable: (propertyName) => `「${propertyName}」待售`,
    salePrice: (price) => `售价 ¥${price}`,
    propertyOwned: (propertyName) => `回到「${propertyName}」`,
    ownProperty: "这是自己的地产",
    rentPaid: (amount) => `支付租金 -¥${amount}`,
    landedOn: (propertyName) => `停在「${propertyName}」`,
    feePaid: (amount) => `支付费用 -¥${amount}`,
    fundsGain: (amount) => `资金 +¥${amount}`,
    fundsLoss: (amount) => `资金 -¥${amount}`,
    backToStart: "回到中央起点",
    continueNextTurn: "继续下一回合",
    moveCompleted: (actor) => `${actor}完成移动`,
    propertyAcquiredKicker: "PROPERTY ACQUIRED",
    bought: (actor, propertyName) => `${actor}买下「${propertyName}」`,
    dealPrice: (price) => `成交价 ¥${price}`,
    propertyKicker: "PROPERTY",
    skipped: (actor, propertyName) => `${actor}跳过「${propertyName}」`,
    propertyUnowned: "地产保持无主状态",
    victoryKicker: "VICTORY",
    gameOverKicker: "GAME OVER",
    humanWonTitle: "你赢了",
    botWonTitle: "城市玩家获胜",
    humanWonDetail: "对手已经破产。",
    botWonDetail: "你的资金已经跌破 0。",
    gameOverDetail: "本局已经结束。",
    restart: "再来一局",
  },
  board: {
    startDetail: "+200 / 圈",
    chanceDetail: "随机事件",
    propertyDetail: (price, rent) => `售价 ${price} · 租金 ${rent}`,
  },
  chanceCards: {
    "innovation-bonus": "城市创新奖金 +120",
    "maintenance-cost": "临时维修支出 -90",
    "community-event": "社区活动收益 +60",
    "traffic-fine": "交通违章罚款 -50",
  },
};

const EN_MESSAGES: Messages = {
  players: { human: "You", bot: "City Player" },
  worldAria: "3D Richman board",
  hud: {
    balancesAria: "Player balances",
    enterFirstPerson: "Click the scene to enter first-person view",
    recentDiceAria: "Latest dice roll",
    roll: "Roll Dice",
    buy: "Buy",
    buyWithPrice: (price) => `Buy · ${price}`,
    skip: "Skip",
    pointerPurchase: (price) => `B Buy ¥${price} · N Skip · M Sound · Esc Exit`,
    pointerRoll: "Space Roll · M Sound · Esc Exit",
    pointerIdle: "M Sound · Esc Exit",
  },
  settings: {
    title: "Settings",
    close: "Close",
    closeAria: "Close settings",
    sound: "Sound",
    soundHelp: "Game sound effects",
    sensitivity: "Mouse Sensitivity",
    sensitivityHelp: "First-person look",
    sensitivityAria: "First-person mouse sensitivity",
    low: "Low",
    standard: "Standard",
    high: "High",
    language: "Language",
    languageHelp: "Interface and board labels",
    languageAria: "Game language",
    note: "Settings are saved in this browser.",
  },
  status: {
    initial: "Your turn. Roll the dice to begin.",
    rolling: "Rolling dice…",
    insufficientFunds: "Not enough cash to buy this property.",
    purchased: (propertyName) => `Purchased “${propertyName}”.`,
    skipped: (propertyName) => `Skipped “${propertyName}”.`,
    botActing: "City Player is taking a turn…",
    yourTurn: "Your turn.",
    botPurchased: (propertyName) => `City Player bought “${propertyName}”.`,
    botSkipped: (propertyName) => `City Player skipped “${propertyName}”.`,
    soundEnabled: "Sound enabled.",
    soundDisabled: "Sound disabled.",
    sensitivityUpdated: "Mouse sensitivity updated.",
    winner: (playerName) => `${playerName} won.`,
    gameOver: "Game over.",
    rollPropertyAvailable: (actor, steps) =>
      `${actor} moved ${steps} spaces. This property is available to buy.`,
    rollRent: (actor, steps, amount) =>
      `${actor} moved ${steps} spaces and paid ¥${amount} rent.`,
    rollTax: (actor, steps, amount) =>
      `${actor} moved ${steps} spaces and paid ¥${amount}.`,
    rollChance: (actor, steps, message) => `${actor} moved ${steps} spaces: ${message}`,
    rollOwned: (actor, steps) => `${actor} moved ${steps} spaces onto an owned property.`,
    rollStart: (actor, steps) => `${actor} moved ${steps} spaces back to Start.`,
  },
  feedback: {
    yourTurnKicker: "YOUR TURN",
    rivalTurnKicker: "RIVAL TURN",
    yourTurnTitle: "Your Turn",
    rivalTurnTitle: "City Player's Turn",
    diceActor: (actor) => `${actor} · Dice Roll`,
    diceAnnouncement: (actor, left, right, total) =>
      `${actor} rolled ${left} plus ${right}, for a total of ${total}`,
    passedStart: "Passed Start +¥200 · ",
    moved: (actor, steps) => `${actor} moved ${steps} spaces`,
    propertyAvailable: (propertyName) => `“${propertyName}” is for sale`,
    salePrice: (price) => `Price ¥${price}`,
    propertyOwned: (propertyName) => `Back to “${propertyName}”`,
    ownProperty: "Owned by this player",
    rentPaid: (amount) => `Rent paid -¥${amount}`,
    landedOn: (propertyName) => `Landed on “${propertyName}”`,
    feePaid: (amount) => `Fee paid -¥${amount}`,
    fundsGain: (amount) => `Cash +¥${amount}`,
    fundsLoss: (amount) => `Cash -¥${amount}`,
    backToStart: "Back to Central Start",
    continueNextTurn: "Continue to the next turn",
    moveCompleted: (actor) => `${actor} finished moving`,
    propertyAcquiredKicker: "PROPERTY ACQUIRED",
    bought: (actor, propertyName) => `${actor} bought “${propertyName}”`,
    dealPrice: (price) => `Price ¥${price}`,
    propertyKicker: "PROPERTY",
    skipped: (actor, propertyName) => `${actor} skipped “${propertyName}”`,
    propertyUnowned: "The property remains unowned",
    victoryKicker: "VICTORY",
    gameOverKicker: "GAME OVER",
    humanWonTitle: "You Win",
    botWonTitle: "City Player Wins",
    humanWonDetail: "Your opponent is bankrupt.",
    botWonDetail: "Your cash dropped below 0.",
    gameOverDetail: "This game has ended.",
    restart: "Play Again",
  },
  board: {
    startDetail: "+200 / lap",
    chanceDetail: "Random event",
    propertyDetail: (price, rent) => `Price ${price} · Rent ${rent}`,
  },
  chanceCards: {
    "innovation-bonus": "City innovation bonus +120",
    "maintenance-cost": "Emergency maintenance -90",
    "community-event": "Community event income +60",
    "traffic-fine": "Traffic fine -50",
  },
};

const EN_TILE_NAMES: Readonly<Record<string, string>> = {
  start: "Central Start",
  "harbor-walk": "Harbor Walk",
  "chance-1": "Chance",
  "neon-avenue": "Neon Avenue",
  "city-tax": "City Tax",
  "metro-plaza": "Metro Plaza",
  "skyline-road": "Skyline Road",
  "chance-2": "Chance",
  "river-market": "Riverside Market",
  "service-fee": "Public Service Fee",
  "central-station": "Central Station",
  "chance-3": "Chance",
  "tech-park": "Tech Park",
  lakeside: "Lakeside District",
  "luxury-tax": "City Maintenance Fee",
  "art-district": "Art District",
  "chance-4": "Chance",
  "grand-boulevard": "Grand Boulevard",
  "financial-center": "Financial Center",
  "chance-5": "Chance",
};

export function messages(language: Language): Messages {
  return language === "en" ? EN_MESSAGES : ZH_MESSAGES;
}

export function playerName(language: Language, playerId: PlayerId): string {
  return messages(language).players[playerId];
}

export function tileName(language: Language, tile: BoardTile): string {
  return language === "en" ? (EN_TILE_NAMES[tile.id] ?? tile.name) : tile.name;
}

export function chanceCardText(language: Language, cardId: ChanceCardId): string {
  return messages(language).chanceCards[cardId];
}

export function formatCash(language: Language, value: number): string {
  const sign = value < 0 ? "−" : "";
  const locale = language === "en" ? "en-US" : "zh-CN";
  return `${sign}¥${Math.abs(value).toLocaleString(locale)}`;
}
