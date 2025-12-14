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
    { id: 'o_chaihuoshiqugong', name: '柴火拾取工', type: 'occupation', cost: { food: 1 }, score: 0, desc: '犁/播/麦: 回合结束时获得1木头(限1次)' },
    { id: 'o_chuiniudawang', name: '吹牛大王', type: 'occupation', cost: { food: 1 }, score: 0, desc: '终局: 5/6/7/8/9/10张卡 -> 2/3/4/5/7/9分', effect: { type: 'end_game' } },
    { id: 'o_daoshi', name: '导师', type: 'occupation', cost: { food: 1 }, score: 0, desc: '打出后: 每张后续职业+1分', effect: { type: 'end_game' } },
    { id: 'o_diannong', name: '佃农', type: 'occupation', cost: { food: 1 }, score: 0, desc: '临时工: 可建房/翻修 (模拟: +1木+1砖)' },
    { id: 'o_dizhixuejia', name: '地质学家', type: 'occupation', cost: { food: 1 }, score: 0, desc: '森林3/芦苇/粘土坑: +1砖' },
    { id: 'o_dongwujiaoyiyuan', name: '动物交易员', type: 'occupation', cost: { food: 1 }, score: 0, desc: '拿羊/猪/牛积累: 1食买1只' },
    { id: 'o_famugong', name: '伐木工', type: 'occupation', cost: { food: 1 }, score: 0, desc: '拿木头积累: +1木', effect: { type: 'passive_res', trigger: 'wood', amount: 1 } },
    { id: 'o_fangwuguanjia', name: '房屋管家', type: 'occupation', cost: { food: 1 }, score: 0, desc: '即时: 剩1/3/6/9轮获1/2/3/4木. 终局: 最多房3分', effect: { type: 'immediate' } },
    
    // New cards
    { id: 'o_gemaigong', name: '格麦工', type: 'occupation', cost: { food: 1 }, score: 0, desc: '即时+1麦. 收获时每块麦田多收1麦', effect: { type: 'immediate', bonus: 'grain', amount: 1 } },
    { id: 'o_gengzhongbangshou', name: '耕种帮手', type: 'occupation', cost: { food: 1 }, score: 0, desc: '使用临时工行动时, 能额外犁一块田' },
    { id: 'o_guwen', name: '顾问', type: 'occupation', cost: { food: 1 }, score: 0, desc: '打出时: 1/2/3/4人局获得2麦/3砖/2苇/2羊', effect: { type: 'immediate', bonus: 'sheep', amount: 2 } },
    { id: 'o_jianzhufuyuanshi', name: '建筑复原师', type: 'occupation', cost: { food: 1 }, score: 0, desc: '翻修时, 可跳过砖屋, 直接将木屋翻修成石屋' },
    { id: 'o_jijiegong', name: '季节工', type: 'occupation', cost: { food: 1 }, score: 0, desc: '临时工: +1麦. 第6回合起改为+1菜或+1麦' },
    { id: 'o_mafu', name: '马夫', type: 'occupation', cost: { food: 1 }, score: 0, desc: '即时+1木. 住石屋后每回合可花1木建1马厩', effect: { type: 'immediate', bonus: 'wood', amount: 1 } },
    { id: 'o_majiujianzaoshi', name: '马厩建造师', type: 'occupation', cost: { food: 1 }, score: 0, desc: '终局: 农场上每个未被栅栏围住的马厩+1分', effect: { type: 'end_game' } },
    { id: 'o_maopifanggong', name: '毛皮纺工', type: 'occupation', cost: { food: 1 }, score: 0, desc: '每当你扩建至少1间砖屋或将砖屋翻修成石屋时, 获得3食物' },
    { id: 'o_mengyouzhe', name: '梦游者', type: 'occupation', cost: { food: 1 }, score: 0, desc: '随时: 将1羊换成1猪或1菜或1石' },
    { id: 'o_moshushi', name: '魔术师', type: 'occupation', cost: { food: 1 }, score: 0, desc: '卖艺: 额外获得1木和1麦' },
];

export const DB_MINORS: Card[] = [
    { 
        id: 'minor_caikuangchui', 
        name: '采矿锤', 
        type: 'minor', 
        cost: { wood: 1 }, 
        score: 0, 
        desc: '打出时立即获得1份食物。每当你翻修房屋时，你可以额外免费建造1间马厩', 
        effect: { type: 'immediate', bonus: 'food', amount: 1 } 
    },
    { 
        id: 'minor_chanzi', 
        name: '铲子', 
        type: 'minor', 
        cost: { wood: 1 }, 
        score: 0, 
        desc: '你可以在任意时刻将生长着不少于2棵作物的田地中的1棵作物移至其他空的田地上' 
    },
    { 
        id: 'minor_daguban', 
        name: '打谷板', 
        type: 'minor', 
        cost: { wood: 1 }, 
        condition: { minOccupations: 2 },
        score: 1, 
        desc: '条件:2职业. 每当你使用犁田/粮食耕种（犁田+播种）行动格时，你可以进行1次“烤面包”行动' 
    },
    { 
        id: 'minor_danongchang', 
        name: '大农场', 
        type: 'minor', 
        cost: {}, 
        condition: { fullFarm: true },
        score: 0, 
        desc: '条件:农场建满. 打出此卡时，距离游戏结束没剩1个完整回合，你便可获得1分+2份食物', 
        effect: { type: 'end_game' } 
    },
    { 
        id: 'minor_daxingwenshi', 
        name: '大型温室', 
        type: 'minor', 
        cost: { wood: 2 }, 
        condition: { minOccupations: 2 },
        score: 0, 
        desc: '条件:2职业. 将当前回合数加4,7,9，在这些回合的行动格上各放一份蔬菜，这些回合开始时，你获得这份蔬菜' 
    },
    { 
        id: 'minor_dumuzhou', 
        name: '独木舟', 
        type: 'minor', 
        cost: { wood: 2 }, 
        condition: { minOccupations: 1 },
        score: 1, 
        desc: '条件:1职业. 每当你使用钓鱼积累行动格时，你额外获得1份食物和1捆芦苇' 
    },
    { 
        id: 'minor_fangche', 
        name: '纺车', 
        type: 'minor', 
        cost: { wood: 3, food: 3 }, 
        score: 0, 
        desc: '此卡可以为1名家庭成员提供居住空间' 
    },
    { 
        id: 'minor_guwuchan', 
        name: '谷物铲', 
        type: 'minor', 
        cost: { wood: 1 }, 
        score: 0, 
        desc: '每当你使用小麦种子行动格时，你额外获得1份小麦' 
    },
    { 
        id: 'minor_hangshiniantu', 
        name: '夯实粘土', 
        type: 'minor', 
        cost: {}, 
        score: 0, 
        desc: '立即获得1块砖头。现在起你可以使用砖头来代替木头建造栅栏', 
        effect: { type: 'immediate', bonus: 'clay', amount: 1 } 
    },
    { 
        id: 'minor_helanfengche', 
        name: '荷兰风车', 
        type: 'minor', 
        cost: { wood: 2, stone: 2 }, 
        score: 2, 
        desc: '每当你在丰收时节之后紧跟着的回合里使用了“烤面包”行动，你额外获得3份食物' 
    },
    
    // NEW CARDS (20)
    { id: 'minor_huashili', name: '滑石犁', type: 'minor', cost: { wood: 2 }, condition: { minOccupations: 1 }, score: 0, desc: '放2田在卡上. 犁田时可用1卡上田额外犁1块. 2职业' },
    { id: 'minor_huotan', name: '货摊', type: 'minor', cost: { grain: 1 }, score: 0, desc: '立即+1菜. 使用后传给下家手牌' },
    { id: 'minor_jiashiqian', name: '夹石钳', type: 'minor', cost: { wood: 1 }, score: 0, desc: '拿石头积累格时+1石头' },
    { id: 'minor_jumuchang', name: '锯木厂', type: 'minor', cost: { stone: 2 }, condition: { maxOccupations: 3 }, score: 2, desc: '发展卡木头花费-1. 条件:<=3职业' },
    { id: 'minor_lunken', name: '轮垦', type: 'minor', cost: { food: 2 }, score: 0, desc: '立即犁1田. 使用后传给下家手牌' },
    { id: 'minor_miniquandi', name: '迷你圈地', type: 'minor', cost: { food: 2 }, score: 0, desc: '立即免费围1格(需相邻). 使用后传给下家手牌' },
    { id: 'minor_mujiangdian', name: '木匠店', type: 'minor', cost: { wood: 1, stone: 1 }, score: 0, desc: '建木屋花费改为2木2苇' },
    { id: 'minor_muyangzhang', name: '牧羊杖', type: 'minor', cost: { wood: 1 }, score: 0, desc: '围出>=4格圈地时, 立即+2羊' },
    { id: 'minor_niantuluji', name: '粘土路基', type: 'minor', cost: { food: 1 }, score: 0, desc: '每2砖补给->+1砖. 使用后传给下家手牌' },
    { id: 'minor_niunaiguan', name: '牛奶罐', type: 'minor', cost: { clay: 1 }, score: 0, desc: '任何人拿牛市场(积累): 你+3食, 其他人+1食' },
    { id: 'minor_shicao', name: '石槽', type: 'minor', cost: { wood: 2 }, score: 0, desc: '终局: 6/7/8/10格圈地 -> 1/2/3/4分', effect: { type: 'end_game' } },
    { id: 'minor_shoutuili', name: '手推犁', type: 'minor', cost: { wood: 1 }, score: 0, desc: '当前回合+5放1田. 该回合开始时犁那块田' },
    { id: 'minor_tangbianxiaowu', name: '塘边小屋', type: 'minor', cost: { wood: 1 }, condition: { exactOccupations: 2 }, score: 1, desc: '后3回合各放1食. 回合开始获得. 条件:2职业' },
    { id: 'minor_taotuyandou', name: '陶土烟斗', type: 'minor', cost: { clay: 1 }, score: 0, desc: '回家阶段: 若本轮获得>=7建筑资源, +2食' },
    { id: 'minor_xiuqijiao', name: '休憩角', type: 'minor', cost: { wood: 1 }, condition: { minGrainFields: 2 }, score: 1, desc: '可使用被占用的生儿育女格. 条件:>=2麦田' },
    { id: 'minor_yangmaotan', name: '羊毛毯', type: 'minor', cost: {}, condition: { minSheep: 5 }, score: 0, desc: '终局: 木/砖/石屋 -> 3/2/0分. 条件:>=5羊', effect: { type: 'end_game' } },
    { id: 'minor_yinshuicao', name: '饮水槽', type: 'minor', cost: { clay: 1 }, score: 0, desc: '每圈地容量+2' },
    { id: 'minor_youchushichang', name: '幼畜市场', type: 'minor', cost: { sheep: 1 }, score: 0, desc: '立即+1牛. 使用后传给下家手牌' },
    { id: 'minor_zawufang', name: '杂物房', type: 'minor', cost: { wood: 1, clay: 1 }, score: 0, desc: '每打出1张发展卡(含此卡) +1食' },
    { id: 'minor_zhukuang', name: '竹筐', type: 'minor', cost: { reed: 1 }, score: 0, desc: '拿木头积累后: 可将2木变3食(木头放回行动格)' }
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
  { id: 'r_sow', name: '🌱 播种/烤面包', type: 'special', mode: 'sow_bake_choice', stage: 1 },
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