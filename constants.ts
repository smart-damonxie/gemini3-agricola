

import { Action, Card } from "./types";

export const LIMIT_FENCES = 15;
export const LIMIT_STABLES = 4;
export const MAX_ROUNDS = 14;
export const HARVEST_ROUNDS = [4, 7, 9, 11, 13, 14];

export const SCORING_TIERS: { [key: string]: number[] } = {
  fields: [-1, -1, 1, 2, 3, 4],
  pastures: [-1, 1, 2, 3, 4],
  grain: [-1, 1, 1, 1, 2, 2, 3, 3, 4],
  veg: [-1, 1, 2, 3, 4],
  sheep: [-1, 1, 1, 1, 2, 2, 3, 3, 4],
  boar: [-1, 1, 1, 2, 2, 3, 3, 4],
  // 0=-1, 1=1, 2-3=2, 4-5=3, 6+=4
  cow: [-1, 1, 2, 2, 3, 3, 4],
};

export const DB_MAJORS: Card[] = [
  { id: 'm1', name: '🔥火炉(2砖)', type: 'major', cost: { clay: 2 }, score: 1, desc: '烤面包(2食), 变食:羊2/猪2/牛3/菜2', bakeRate: 2, cook: { sheep: 2, boar: 2, cow: 3, veg: 2 } },
  { id: 'm2', name: '🔥火炉(3砖)', type: 'major', cost: { clay: 3 }, score: 1, desc: '同上', bakeRate: 2, cook: { sheep: 2, boar: 2, cow: 3, veg: 2 } },
  { id: 'm3', name: '🍲壁炉(4砖)', type: 'major', cost: { clay: 4 }, score: 1, desc: '烤面包(3食), 变食:羊2/猪3/牛4/菜3', bakeRate: 3, cook: { sheep: 2, boar: 3, cow: 4, veg: 3 } },
  { id: 'm4', name: '🍲壁炉(5砖)', type: 'major', cost: { clay: 5 }, score: 1, desc: '同上(羊2/猪3/牛4/菜3)', bakeRate: 3, cook: { sheep: 2, boar: 3, cow: 4, veg: 3 } },
  { id: 'm5', name: '💧水井', type: 'major', cost: { stone: 3, wood: 1 }, score: 4, desc: '接下来5轮各放1食物，翻开时获得', special: 'well' },
  { id: 'm6', name: '🧺编筐工坊', type: 'major', cost: { reed: 2, stone: 2 }, score: 2, desc: '喂养:1苇->3食. 终局加分:2/4/5苇->1/2/3分', special: 'bonus', bonusType: 'reed', convert: { reed: 1, food: 3 } },
  { id: 'm7', name: '🪑家具工坊', type: 'major', cost: { wood: 2, stone: 2 }, score: 2, desc: '喂养:1木->2食. 终局加分:3/5/7木->1/2/3分', special: 'bonus', bonusType: 'wood', convert: { wood: 1, food: 2 } },
  { id: 'm8', name: '🧱陶艺工坊', type: 'major', cost: { clay: 2, stone: 2 }, score: 2, desc: '喂养:1砖->2食. 终局加分:3/5/7砖->1/2/3分', special: 'bonus', bonusType: 'clay', convert: { clay: 1, food: 2 } },
  { id: 'm9', name: '🪨石造烤炉', type: 'major', cost: { stone: 3, clay: 1 }, score: 3, desc: '高效烤面包(Max 2: 1麦->4食)', specialBake: { in: 1, out: 4, limit: 2 } },
  { id: 'm10', name: '🏺砖造烤炉', type: 'major', cost: { clay: 3, stone: 1 }, score: 2, desc: '高效烤面包(Max 1: 1麦->5食)', specialBake: { in: 1, out: 5, limit: 1 } },
];

export const DB_OCCUPATIONS: Card[] = [
    { id: 'o_caiguren', name: '采菇人', type: 'occupation', cost: { food: 1 }, score: 0, desc: '拿木头积累格后: 可选择将1木变2食(放回木头)' },
    { id: 'o_cangkukanshouyuan', name: '仓库看守员', type: 'occupation', cost: { food: 1 }, score: 0, desc: '拿资源市场: 可额外选择+1砖或+1麦' },
    { id: 'o_chaihuoshiqugong', name: '柴火拾取工', type: 'occupation', cost: { food: 1 }, score: 0, desc: '犁/播/麦: +1木' },
    { id: 'o_chuiniudawang', name: '吹牛大王', type: 'occupation', cost: { food: 1 }, score: 0, desc: '终局: 5/6/7/8/9/10张卡 -> 2/3/4/5/7/9分', effect: { type: 'end_game' } },
    { id: 'o_daoshi', name: '导师', type: 'occupation', cost: { food: 1 }, score: 0, desc: '打出后: 每张后续职业+1分', effect: { type: 'end_game' } },
    { id: 'o_diannong', name: '佃农', type: 'occupation', cost: { food: 1 }, score: 0, desc: '临时工: 可建房/翻修 (模拟: +1木+1砖)' },
    { id: 'o_dizhixuejia', name: '地质学家', type: 'occupation', cost: { food: 1 }, score: 0, desc: '森林3/芦苇/粘土坑: +1砖' },
    { id: 'o_dongwujiaoyiyuan', name: '动物交易员', type: 'occupation', cost: { food: 1 }, score: 0, desc: '拿羊/猪/牛积累: 1食买1只' },
    { id: 'o_famugong', name: '伐木工', type: 'occupation', cost: { food: 1 }, score: 0, desc: '拿木头积累: +1木', effect: { type: 'passive_res', trigger: 'wood', amount: 1 } },
    { id: 'o_fangwuguanjia', name: '房屋管家', type: 'occupation', cost: { food: 1 }, score: 0, desc: '即时: 剩轮数送木. 终局: 最多房3分', effect: { type: 'immediate' } },
];

export const DB_MINORS: Card[] = [
    { id: 'n1', name: '木柴 (Firewood)', type: 'minor', cost: {}, score: 0, desc: '立即获得1木头', effect: { type: 'immediate', bonus: 'wood', amount: 1 } },
    { id: 'n2', name: '简易灶台 (Hearth)', type: 'minor', cost: { clay: 1 }, score: 1, desc: '如同壁炉: 变食羊2/猪2/牛3/菜2', cook: { sheep: 2, boar: 2, cow: 3, veg: 2 } },
    { id: 'n3', name: '私人林地 (Private Forest)', type: 'minor', cost: { food: 2 }, score: 0, desc: '每轮开始时(收获或普通)，获得1木头', effect: { type: 'round_start', bonus: 'wood', amount: 1 } },
    { id: 'n4', name: '木筏 (Raft)', type: 'minor', cost: { wood: 2 }, score: 0, desc: '每当你拿"芦苇"时，额外获得1食物', effect: { type: 'passive_action', trigger: 'reed', bonus: 'food', amount: 1 } },
];

export const BASE_ACTIONS: Action[] = [
  { id: 'act_forest_3', name: '🌲 森林 (3木)', acc: 3, cur: 3, type: 'res', res: 'wood' },
  { id: 'act_forest_2', name: '🌳 树林 (2木)', acc: 2, cur: 2, type: 'res', res: 'wood' },
  { id: 'act_forest_1', name: '🌱 林地 (1木)', acc: 1, cur: 1, type: 'res', res: 'wood' },
  { id: 'act_clay_pit', name: '🧱 粘土坑 (1砖)', acc: 1, cur: 1, type: 'res', res: 'clay' },
  { id: 'act_hollow', name: '🧱 泥坑 (2砖)', acc: 2, cur: 2, type: 'res', res: 'clay' },
  { id: 'act_reed1', name: '🎋 芦苇岸 (1苇)', acc: 1, cur: 1, type: 'res', res: 'reed' },
  { id: 'act_fish', name: '🐟 钓鱼 (1食)', acc: 1, cur: 1, type: 'res', res: 'food' },
  { id: 'act_travel', name: '🎭 卖艺 (1食)', acc: 1, cur: 1, type: 'res', res: 'food' },
  { id: 'act_labor', name: '👷 临时工 (2食)', type: 'res', res: 'food', amount: 2 },
  { id: 'act_occupation1', name: '📚 职业训练1', type: 'special', mode: 'play_occupation', desc: '1食物->打出1职业' },
  { id: 'act_occupation2', name: '📚 职业训练2', type: 'special', mode: 'play_occupation', desc: '前2张1食，之后2食' },
  { id: 'act_grain', name: '🌾 小麦种子', type: 'res', res: 'grain', amount: 1 },
  { id: 'act_meeting', name: '👥 聚会场所', type: 'special', mode: 'meeting', desc: '起始玩家 (可选:打次发)' },
  { id: 'act_market', name: '🛒 资源市场', type: 'res_combo', desc: '1苇+1石+1食' },
  { id: 'act_plow', name: '🚜 犁地', type: 'special', mode: 'plow' },
  { id: 'act_build', name: '🏠 建房/马厩', type: 'special', mode: 'build_menu', desc: '自由建造房间/马厩' },
];

export const ROUND_CARDS_POOL: Action[] = [
  { id: 'r_sheep', name: '🐑 牧羊 (1羊)', acc: 1, cur: 1, type: 'res', res: 'sheep', stage: 1 },
  { id: 'r_sow', name: '🌱 播种/烤面包', type: 'special', mode: 'sow', stage: 1 },
  { id: 'r_fences', name: '🚧 栅栏', type: 'special', mode: 'fence', stage: 1 },
  { id: 'r_major', name: '🏗️ 发展卡', type: 'special', mode: 'major', stage: 1 },
  { id: 'r_stone', name: '🪨 西部采石 (1石)', acc: 1, cur: 1, type: 'res', res: 'stone', stage: 2 },
  { id: 'r_reno', name: '🔨 翻修+发展卡', type: 'special', mode: 'reno_major', stage: 2 },
  { id: 'r_grow', name: '👶 生儿育女', type: 'special', mode: 'grow', stage: 2, desc: '需空房 > 人口' },
  { id: 'r_boar', name: '🐗 野猪 (1猪)', acc: 1, cur: 1, type: 'res', res: 'boar', stage: 3 },
  { id: 'r_veg', name: '🥕 蔬菜', type: 'res', res: 'veg', amount: 1, stage: 3 },
  { id: 'r_cow', name: '🐮 牛 (1牛)', acc: 1, cur: 1, type: 'res', res: 'cow', stage: 4 },
  { id: 'r_stone2', name: '🪨 东部采石 (1石)', acc: 1, cur: 1, type: 'res', res: 'stone', stage: 4 },
  { id: 'r_plow_sow', name: '🚜 犁地+播种', type: 'special', mode: 'plow_sow', stage: 5 },
  { id: 'r_grow2', name: '👶 求子心切', type: 'special', mode: 'grow_force', stage: 5 },
  { id: 'r_reno_fence', name: '🔨 翻修+栅栏', type: 'special', mode: 'reno_fence', stage: 6 },
];