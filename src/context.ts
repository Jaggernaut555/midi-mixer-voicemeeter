import { Assignment, ButtonType } from "midi-mixer-plugin";
import {
  VoiceMeeter,
  VoiceMeeterType,
  OutParamData,
  OutParam,
} from "ts-easy-voicemeeter-remote";

export const vm = new VoiceMeeter();

export class eAssignment extends Assignment {
  meterInterval: NodeJS.Timeout = {} as NodeJS.Timeout;
  updated = false;
  customAssignUpdate?: (data: OutParam) => void;
  customMuteUpdate?: (data: OutParam) => void;
  customRunUpdate?: (data: OutParam) => void;
}

// buttons will need to define how they are updated
export class eButton extends ButtonType {
  public update = (data: OutParamData): void => {
    // do nothing by default
  };
}

export const strip: eAssignment[] = [];
export const bus: eAssignment[] = [];
export const buttons: eButton[] = [];

export let stripCount = 0;
export let busCount = 0;

/**
 * Set the amount of assignable items according to which version of voicemeeter was detected
 *
 * @param version Detected version of voicemeeter
 */
export function setMeterCount(version: VoiceMeeterType): void {
  log.info(`Detected ${VoiceMeeterType[version]}`);
  switch (version) {
    case VoiceMeeterType.voiceMeeter:
      stripCount = 3;
      busCount = 2;
      break;
    case VoiceMeeterType.voiceMeeterBanana:
      stripCount = 5;
      busCount = 5;
      break;
    case VoiceMeeterType.voiceMeeterPotato:
      stripCount = 8;
      busCount = 8;
      break;
    default:
      stripCount = 0;
      busCount = 0;
  }
}

interface Settings {
  maxdb: number;
  mindb: number;
  busToggles: string;
  customStripAssign: string;
  customStripMute: string;
  customStripRun: string;
}

export let settings: Settings;

export async function initSettings(): Promise<void> {
  const config: Record<string, any> = await $MM.getSettings();
  // "fallback" plugin setting doesn't seem to work
  settings = {
    maxdb: isNaN(parseFloat(config["maxdb"]))
      ? 12
      : parseFloat(config["maxdb"]),
    mindb: isNaN(parseFloat(config["mindb"]))
      ? -60
      : parseFloat(config["mindb"]),
    busToggles: config["BusToggles"],
    customStripAssign: config["customStripAssign"],
    customStripMute: config["customStripMute"],
    customStripRun: config["customStripRun"],
  };
  console.log(settings);
}
