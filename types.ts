export type ResourceType = 'wood' | 'clay' | 'reed' | 'stone' | 'food' | 'grain' | 'veg' | 'sheep' | 'boar' | 'cow';

export interface Cost {
  wood?: number;
  clay?: number;
  reed?: number;
  stone?: number;
  food?: number;
}

export interface MajorCard {
  id: string;
  name: string;
  cost: Cost;
  score: number;
  type?: 'cook' | 'bake';
  desc: string;
  special?: string;
  bakeRate?: number;
  cook?: { sheep: number; boar: number; cow: number; veg: number };
  bonusType?: ResourceType;
  convert?: { [key: string]: number };
  specialBake?: { in: number; out: number };
}

export interface Action {
  id: string;
  name: string;
  acc?: number;
  cur?: number;
  type: 'res' | 'res_combo' | 'special';
  res?: ResourceType;
  amount?: number;
  mode?: string;
  desc?: string;
  stage?: number;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  type: 'human' | 'ai';
  res: {
    wood: number;
    clay: number;
    reed: number;
    stone: number;
    food: number;
    grain: number;
    veg: number;
    workers: number;
    maxWorkers: number;
  };
  animals: {
    sheep: number;
    boar: number;
    cow: number;
  };
  farm: number[]; // 0:Empty, 1:Room, 2:Field, 5:Stable
  farmCounts: number[];
  farmContent: (ResourceType | null)[];
  fences: Set<string>; // "idx-side" e.g., "0-t", "5-l"
  stablesCount: number;
  houseType: 'wood' | 'clay' | 'stone';
  majors: MajorCard[];
  begging: number;
  tempMode: TempMode | null;
  harvestTemp: any | null; // Complex object for harvest logic
  overflowTemp?: any;
}

export interface TempMode {
  mode: string;
  actId: string;
  existingVertices?: Set<string>;
  initialFenceCount?: number;
  pendingSows?: { [key: number]: ResourceType };
  currentSeed?: ResourceType;
  pending?: { [key: number]: 'room' | 'stable' };
  currentTool?: 'room' | 'stable';
}

export interface GameState {
  round: number;
  startPlayer: number;
  nextStartPlayer: number;
  turnIdx: number;
  occupied: { [key: string]: number }; // actionId -> playerId
  roundCards: Action[];
  deck: Action[];
  majors: MajorCard[];
  harvestPhase: boolean;
  harvestState: { queue: number[]; currentIdx: number } | null;
  pendingAction: { pIdx: number; timer: any; snapshot: string; flags: any } | null;
  overflowQueue: any[];
}

export interface LogEntry {
  id: number;
  msg: string;
  color: string;
}

export interface FarmLayout {
    pastures: { capacity: number; tiles: number[]; assignedType?: string }[];
    singles: { idx: number; type: 'house'|'stable'; capacity: number }[];
}

export interface Allocation {
    distribution: {icon: string; type: string}[][];
    overflow: number;
}