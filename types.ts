import { ResourceType, Cost, MajorCard, Action, HarvestConversion, HarvestSubPhase, TempMode, GameState, LogEntry, FarmLayout, Allocation } from './types';

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
  specialBake?: { in: number; out: number; limit?: number };
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

export interface HarvestConversion {
  grain: number;
  veg: number;
  vegRaw: number; // New: Eat raw (1 food)
  vegCook: number; // New: Cook (2-3 food)
  sheep: number;
  boar: number;
  cow: number;
  reed: number;
  wood: number;
  clay: number;
}

export type HarvestSubPhase = 'field' | 'feed' | 'breed' | null;

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
  newborns: { // Tracks newly bred animals that cannot be cooked this round
    sheep: number;
    boar: number;
    cow: number;
  };
  newbornCount: number; // Tracks new workers born this round (feed cost 1 instead of 2)
  farm: number[]; // 0:Empty, 1:Room, 2:Field, 5:Stable
  farmCounts: number[];
  farmContent: (ResourceType | null)[];
  fences: Set<string>; // "idx-side" e.g., "0-t", "5-l"
  stablesCount: number;
  houseType: 'wood' | 'clay' | 'stone';
  majors: MajorCard[];
  begging: number;
  tempMode: TempMode | null;
  harvestTemp: HarvestConversion | null; 
  conversionTemp?: HarvestConversion | null; // For anytime conversion
  overflowTemp?: any;
  pendingBreeding: { sheep: number, boar: number, cow: number } | null;
  assignedAnimals: { [key: number]: ResourceType[] };
  workshopsUsed: { reed: boolean; wood: boolean; clay: boolean }; // Track usage in feed phase
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
  selectedMajorId?: string;
  subAction?: 'sow' | 'bake' | 'both' | 'plow' | 'upgrade'; // Added upgrade for Fireplace
  bakeTargets?: { [majorId: string]: number }; // Tracks grain assigned to specific baking majors
}

export interface GameState {
  round: number;
  startPlayer: number;
  nextStartPlayer: number;
  turnIdx: number;
  occupied: { [key: string]: number }; // actionId -> playerId
  baseActions: Action[]; // Dynamic state of base actions
  roundCards: Action[];
  deck: Action[];
  majors: MajorCard[];
  harvestPhase: boolean;
  harvestSubPhase: HarvestSubPhase;
  harvestState: { queue: number[]; currentIdx: number } | null;
  pendingAction: { pIdx: number; timer: any; snapshot: string; flags: any } | null;
  overflowQueue: any[];
  gameOver: boolean;
  futureResources: { [roundIdx: number]: ResourceType[] }; // roundIdx 0-13 (Round 1-14)
  turnPhase: 'action' | 'overflow';
  overflowPlayer: number | null;
  wellRewards: { [round: number]: number[] }; // round -> playerIds to award food
  overflowSnapshot: string | null; // For Undo during overflow management
  feedSnapshot: string | null; // For Undo during feed phase
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