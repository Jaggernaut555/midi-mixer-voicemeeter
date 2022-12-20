import { Assignment, ButtonType } from "midi-mixer-plugin";
import { VoiceMeeter, OutParam, VoiceMeeterType, InterfaceType, OutParamData, VoiceMeeterLoginError, StripParamName } from "ts-easy-voicemeeter-remote";
const vm = new VoiceMeeter();
let settings: Settings;
let strip: eAssignment[] = [];
let bus: eAssignment[] = [];
let buttons: eButton[] = [];
let selectedBus: number | null = null;
let stripCount = 0
let busCount = 0;
let vmUpdateInterval: NodeJS.Timeout = {} as NodeJS.Timeout;
let retryTime = 5000;

interface Settings {
  maxdb: number;
  mindb: number;
}

class eAssignment extends Assignment {
  meterInterval: NodeJS.Timeout = {} as NodeJS.Timeout;
  updated: boolean = false;
}

// buttons will need to define how they are updated
class eButton extends ButtonType {
  public update = (data: OutParamData): void => { }
}

/**
 * Convert 0.0-1.0 to voicemeeter gain of -60 to 12
 */
function convertVolumeToGain(level: number) {
  return (level * (settings.maxdb - settings.mindb)) + settings.mindb;
  // Default values:
  // return (level * 72) - 60;
  // 72 = total range from max to minimum values
  // -60 = minimum value
}

/**
 * Convert -60-12 voicemeeter gain to 0.0-1.0
 */
function convertGainToVolume(level: number) {
  return (level - settings.mindb) / (settings.maxdb - settings.mindb);
  // Default values:
  // return (level + 60) / 72;
}

/**
 * Clamp between 0 and 1 for midi mixer volume/peak levels
 * @param value
 */
function clampBar(value: number) {
  return Math.min(Math.max(0, value), 1);
}

/**
 * Set the amount of assignable items according to which version of voicemeeter was detected
 * 
 * @param version Detected version of voicemeeter
 */

function setMeterCount(version: VoiceMeeterType) {
  log.info(`Detected ${VoiceMeeterType[version]}`)
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

function init_buttons(strips: OutParam[]) {
  // a hardcode for aux on potato
  let aux = strips[6];
  console.log(aux);
  let b = new eButton("Aux-A1",{
    name: "Aux-A1",
    active: !aux.A1
  });

  // outParam is currently allowing strip.An
  // Maybe just generate the A/B values based on application type
  // strips.forEach((strip) => {
  // })
  // generate solo/mono buttons
  // are comp/gate/etc only available depending on application type?

  b.on("pressed", () => {
    b.active = !b.active;
    // The library doesn't have good type supporting for these options
    // first 0 is InterfaceType.strip (1 is bus)
    vm.setStripParameter("A1", 6, !b.active);
    // These functions aren't generated. Would need to fork the repo but it's probably fine to just use _setParameter
    // voicemeeter.setStripA1(6, b.active);
  });

  // define when to update the button based on fresh params
  b.update = (data) => {
    b.active = !(data.strips[6].A1);
  }
  buttons.push(b);

  let restartButton = new ButtonType("RestartVoicemeeter", {
    name: "Restart VoiceMeeter",
    active: true
  });

  restartButton.on("pressed", () => {
    try {
      vm.sendRawParameterScript("Command.Restart=1");
    }
    catch (error: any) {
      $MM.showNotification(error);
      log.error(error);
      console.log(error);
      return;
    }
    $MM.showNotification("Restarted VoiceMeeter audio engine");
  })
}

function init_strips(strips: OutParam[]) {
  for (let i = 0; i < stripCount; i++) {
    strip[i] = new eAssignment(`Strip ${i}`, {
      name: `Strip ${i}: ${strips[i].name}`,
      throttle: 100,
    });

    strip[i].assigned = true;

    strip[i].on("volumeChanged", (level: number) => {
      strip[i].updated = true;
      strip[i].volume = level;
      vm.setStripParameter("gain", i, convertVolumeToGain(level));
    });

    strip[i].on("mutePressed", () => {
      strip[i].muted = !strip[i].muted;
      vm.setStripParameter("mute", i, strip[i].muted)
    });

    // No current need for the assign button on strips
    // strip[i].on("assignPressed", () => {
    //   strip[i].assigned = !strip[i].assigned;
    // });

    strip[i].on("runPressed", () => {
      strip[i].running = !strip[i].running;
      vm.setStripParameter("solo", i, strip[i].running)
    });

    clearInterval(strip[i].meterInterval);
    strip[i].meterInterval = setInterval(() => {
      let rawlevel = vm.getLevelByID(2, i);
      let averagelevel = ((rawlevel?.r ?? 0) + (rawlevel?.l ?? 0)) / 2;
      let meterlevel = (averagelevel) / 60;
      let clampedVal = clampBar(meterlevel);
      if (clampedVal !== 0) {
        strip[i].meter = clampedVal;
      }
    }, strip[i].throttle);
  }
}

function init_buses(buses: OutParam[]) {
  for (let i = 0; i < busCount; i++) {
    bus[i] = new eAssignment(`Bus ${i}`, {
      name: `Bus ${i}: ${buses[i].name}`,
      throttle: 100,
    });

    bus[i].on("volumeChanged", (level: number) => {
      bus[i].updated = true;
      bus[i].volume = level;
      vm.setBusParameter("gain", i, convertVolumeToGain(level));
    });

    bus[i].on("mutePressed", () => {
      bus[i].muted = !bus[i].muted;
      vm.setBusParameter("mute", i, bus[i].muted);
    });

    // The "Select" feature only works on voicemeeter potato
    if (vm.getVoiceMeeterInfo().type == VoiceMeeterType.voiceMeeterPotato) {
      bus[i].on("assignPressed", () => {
        bus[i].assigned = !bus[i].assigned;
        // It's possible through the SDK to select multiple bus at a time, but not through the voicemeeter UI
        // I'd rather avoid the behaviour
        let oldSelectedBus = selectedBus;
        if (bus[i].assigned) {
          selectedBus = i;
        }
        else {
          selectedBus = null;
        }
        if (oldSelectedBus !== null && oldSelectedBus != i) {
          vm.setBusParameter("Sel", oldSelectedBus, false);
        }
        vm.setBusParameter("Sel", i, bus[i].assigned);
      });
    }

    // No current use for run button on busses
    // bus[i].on("runPressed", () => {
    //   bus[i].running = !bus[i].running;
    // });

    clearInterval(bus[i].meterInterval);
    bus[i].meterInterval = setInterval(() => {
      let rawlevel = vm.getLevelByID(3, i);
      let averagelevel = ((rawlevel?.r ?? 0) + (rawlevel?.l ?? 0)) / 2;
      let meterlevel = (averagelevel) / 60;
      let clampedVal = clampBar(meterlevel);
      if (clampedVal !== 0) {
        bus[i].meter = clampedVal;
      }
    }, bus[i].throttle);
  }
}

function update_all() {
  vm.getAllParameters().then((data) => {
    let anySelected = false;
    data.buses.forEach((i) => {
      bus[i.id].muted = i.mute;
      if (!bus[i.id].updated) {
        bus[i.id].volume = convertGainToVolume(i.gain);
      }
      bus[i.id].assigned = i.Sel;
      if (i.Sel) {
        selectedBus = i.id;
        anySelected = true;
      }
      bus[i.id].updated = false
    });

    if (!anySelected) {
      selectedBus = null;
    }

    data.strips.forEach((i) => {
      strip[i.id].muted = i.mute;
      strip[i.id].running = i.solo;
      if (!strip[i.id].updated) {
        if (selectedBus !== null) {
          strip[i.id].volume = convertGainToVolume(i[`GainLayer[${selectedBus}]` as StripParamName]);
        }
        else {
          let vol = convertGainToVolume(i.gain);
          if (vol != strip[i.id].volume) {
            strip[i.id].volume = vol;
          }
        }
      }
      strip[i.id].updated = false
    });

    // include button updates here somehow
    buttons.forEach(b => {
      b.update(data);
    })
  });
}

function retryConnection() {
  console.log(`Could not find running instance of voicemeeter, retrying in ${retryTime / 1000}s`);
  $MM.setSettingsStatus("vmstatus", `Failed to connect to VoiceMeeter. Retrying in ${retryTime / 1000}s`)
  setTimeout(() => {
    init();
  }, retryTime);
  retryTime = retryTime * 2;
  return;
}

async function connectVM() {
  $MM.setSettingsStatus("vmstatus", "Connecting");

  try {
    if (!vm.isLoggedIn) {
      vm.login();
    }

    if (!vm.testConnection()) {
      retryConnection();
      return;
    }

    let vminfo = vm.getVoiceMeeterInfo();
    vm.updateDeviceList();
    console.log(vm.inputDevices);
    console.log(vm.outputDevices);
    setMeterCount(vminfo.type);

    await vm.getAllParameters().then((data) => {
      init_strips(data.strips);
      init_buses(data.buses);
      init_buttons(data.strips);
      update_all();

      clearInterval(vmUpdateInterval);
      vmUpdateInterval = setInterval(() => {
        if (vm.isParametersDirty()) {
          update_all();
        }
      }, 50)
    })
  }
  catch (err) {
    console.log(err);
    if (err instanceof VoiceMeeterLoginError && err.returnValue == 1) {
      retryConnection();
      return;
    }
    $MM.setSettingsStatus("vmstatus", "Failed to initialize. Likely could not find voicemeeter installation.");
    $MM.showNotification("Voicemeeter Plugin failed to initialize.");
    log.error(err);
    return;
  }

  $MM.setSettingsStatus("vmstatus", "Connected");
}

async function initVM() {
  if (!vm.isInitialized && !vm.isConnected) {
    console.log("Attempting connection");
    await vm.init()
      .catch((error: any) => {
        $MM.setSettingsStatus("vmstatus", "Failed to initialize. Likely could not find voicemeeter installation.");
        $MM.showNotification("VoiceMeeter Plugin failed to initialize.");
        log.error(error);
        console.log(error);
      })
      .then(() => {
        $MM.setSettingsStatus("vmstatus", "Initialized");

        connectVM();
      })
  }
  else if (vm.isInitialized && !vm.isConnected) {
    console.log("already initialized");
    connectVM();
  }
}

$MM.onClose(async () => {
  if (vm.isInitialized && vm.isConnected) {
    vm.logout();
  }
})

async function initSettings() {
  let config: Record<string, any> = await $MM.getSettings();
  // "fallback" plugin setting doesn't seem to work
  settings = {
    maxdb: isNaN(parseFloat(config["maxdb"])) ? 12 : parseFloat(config["maxdb"]),
    mindb: isNaN(parseFloat(config["mindb"])) ? -60 : parseFloat(config["mindb"]),
  }
}

async function init() {
  try {
    initSettings();
    await initVM();
  }
  catch (error) {
    log.error(error);
    $MM.setSettingsStatus("vmstatus", "Unexpected error in Voicemeeter plugin initialization");
    $MM.showNotification("Unexpected error in Voicemeeter plugin initialization");
  }
}

$MM.onSettingsButtonPress("runbutton", init);

init();
