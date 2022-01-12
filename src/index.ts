import { Assignment, ButtonType } from "midi-mixer-plugin";
import {voicemeeter, outParam, VoicemeeterType} from "ts-easy-voicemeeter-remote";
let vm = new voicemeeter();
let settings: Settings;
let strip: eAssignment[] = [];
let bus: eAssignment[] = [];
let stripCount = 0
let busCount = 0;
let vmUpdateInterval: NodeJS.Timeout = {} as NodeJS.Timeout;

interface Settings {
  maxdb: number;
}

class eAssignment extends Assignment {
  meterInterval: NodeJS.Timeout = {} as NodeJS.Timeout
}

enum nmType {
  // 3 input, 2 output
  voicemeeter = 1,
  // 5 input, 5 output
  banana,
  // 8 input, 8 output
  potato
}

interface paramData {
  inputs: input[]
  outputs: output[]
}
interface input {
  id: number
  name: string
  gain: number
  solo: boolean
  mute: boolean
}
interface output {
  id: number
  name: string
  gain: number
  mute: boolean
  mono: boolean
}

/**
 * Convert 0.0-1.0 to voicemeeter gain of -60 to 12
 */ 
function convertVolumeToGain(level: number) {
  return (level * (60 + settings.maxdb)) - 60;
  // Default values:
  // return (level * 72) - 60;
}

/**
 * Convert -60-12 voicemeeter gain to 0.0-1.0
 */ 
function convertGainToVolume(level: number) {
  return (level + 60) / (60 + settings.maxdb);
  // Default values:
  // return (level + 60) / 72;
}

/**
 * Clamp between 0 and 1 for midi mixer volume/peak levels
 * @param value
 */
function clampBar(value:number) {
  return Math.min(Math.max(0, value), 1);
}

/**
 * Set the amount of assignable items according to which version of voicemeeter was detected
 * 
 * @param version Detected version of voicemeeter
 */
const setMeterCount = (version: VoicemeeterType) => {
  log.info(`Detected ${nmType[version]}`)
  switch (version) {
    case VoicemeeterType.voicemeeter:
      stripCount = 3;
      busCount = 2;
      break;
    case VoicemeeterType.voicemeeterBanana:
      stripCount = 5;
      busCount = 5;
      break;
    case VoicemeeterType.voicemeeterPotato:
      stripCount = 8;
      busCount = 8;
      break;
    default:
      stripCount = 0;
      busCount = 0;
  }
}

const init_strips = (strips: outParam[]) => {
  for(let i = 0; i<stripCount; i++) {
    strip[i] = new eAssignment(`Strip ${i}`, {
      name: `Strip ${i}: ${strips[i].name}`
    });

    strip[i].assigned = true;

    strip[i].on("volumeChanged", (level: number) => {
      strip[i].volume = level;
      vm.setStripParameter("gain",i, convertVolumeToGain(level));
    });
    
    strip[i].on("mutePressed", () => {
      strip[i].muted = !strip[i].muted;
      vm.setStripParameter("mute", i, strip[i].muted)
    });
    
    strip[i].on("assignPressed", () => {
      strip[i].assigned = !strip[i].assigned;
    });
    
    strip[i].on("runPressed", () => {
      strip[i].running = !strip[i].running;
      vm.setStripParameter("solo", i, strip[i].muted)
    });

    clearInterval(strip[i].meterInterval);
    strip[i].meterInterval = setInterval(() => {
      let rawlevel = vm.getLevelByID(2, i);
      let averagelevel = ((rawlevel?.r ?? 0) + (rawlevel?.l ?? 0))/2;
      let meterlevel = (averagelevel) / 60;
      strip[i].meter = clampBar(meterlevel);
    }, strip[i].throttle);
  }
}

const init_buses = (buses: outParam[]) => {
  for(let i = 0; i<busCount; i++) {
    bus[i] = new eAssignment(`Bus ${i}`, {
      name: `Bus ${i}: ${buses[i].name}`
    });

    bus[i].on("volumeChanged", (level: number) => {
      bus[i].volume = level;
      vm.setBusParameter("gain", i, convertVolumeToGain(level));
    });
    
    bus[i].on("mutePressed", () => {
      bus[i].muted = !bus[i].muted;
      vm.setBusParameter("mute",i, bus[i].muted);
    });
    
    bus[i].on("assignPressed", () => {
      bus[i].assigned = !bus[i].assigned;
    });

    bus[i].on("runPressed", () => {
      bus[i].running = !bus[i].running;
    });

    clearInterval(bus[i].meterInterval);
    bus[i].meterInterval = setInterval(() => {
      let rawlevel = vm.getLevelByID(3, i);
      let averagelevel = ((rawlevel?.r ?? 0) + (rawlevel?.l ?? 0))/2;
      let meterlevel = (averagelevel) / 60;
      bus[i].meter = clampBar(meterlevel);
    }, bus[i].throttle);
  }
}

const update_all = () => {
  vm.getAllParameter().then((data) => {
    data.strips.forEach((i) => {
      strip[i.id].muted = i.mute;
      strip[i.id].running = i.solo;
      strip[i.id].volume = convertGainToVolume(i.gain);
    })
    data.buses.forEach((i) => {
      bus[i.id].muted = i.mute;
      bus[i.id].volume = convertGainToVolume(i.gain);
    })
  })
}

const connectVM = async () => {
  $MM.setSettingsStatus("vmstatus", "Connecting");

  vm.login();
  
  let vminfo = vm.getVoicemeeterInfo();
  vm.updateDeviceList();
  console.log(vm.inputDevices);
  console.log(vm.outputDevices);
  setMeterCount(vminfo.type);

  await vm.getAllParameter().then((data) => {


    let a = data.strips;
    init_strips(data.strips);
    init_buses(data.buses);
    update_all();
  
    clearInterval(vmUpdateInterval);
    vmUpdateInterval = setInterval(() => {
      if (vm.isParametersDirty()) {
        update_all();
      }
    }, 50)
  })

  $MM.setSettingsStatus("vmstatus", "Connected");
}

const initVM = async () => {
  if (!vm.isInitialised && !vm.isConnected) {
    console.log("Attempting connection");
    await vm.init()
    .catch((error: any) => {
      $MM.setSettingsStatus("vmstatus", "Failed to initialize. Likely could not find voicemeeter installation.");
      $MM.showNotification("Voicemeeter Plugin failed to initialize.");
      log.error(error);
    })
    .then(() => {
      $MM.setSettingsStatus("vmstatus", "Initialized");

      connectVM().catch((error: any) => {
        $MM.setSettingsStatus("vmstatus", "Failed to connect. Could not find running instance of Voicemeeter. Reactivate the plugin to try again.");
        $MM.showNotification("Voicemeeter Plugin failed to connect.");
        log.error(error);
      })
    })
  }
  else if (vm.isInitialised && !vm.isConnected) {
    vm.isInitialised = false;
    initVM();
  }
}

$MM.onClose(async () => {
  if (vm.isInitialised && vm.isConnected) {
    vm.logout();
  }
})

async function initSettings() {
  let config: Record<string,any> = await $MM.getSettings();
  // "fallback" plugin setting doesn't seem to work
  settings = {
    maxdb: Number(config["maxdb"]) || 12,
  }
}

const init = async () => {
  try {
    initSettings();
    await initVM();
  }
  catch (error) {
    log.error(error);
    $MM.setSettingsStatus("vmstatus","Unexpected error in Voicemeeter plugin initialization");
    $MM.showNotification("Unexpected error in Voicemeeter plugin initialization");
  }
}

init();