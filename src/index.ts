import { ButtonType } from "midi-mixer-plugin";
import {
  OutParam,
  VoiceMeeterType,
  VoiceMeeterLoginError,
  StripParamName,
} from "ts-easy-voicemeeter-remote";
import { parseToggleButtons } from "./BusToggles";
import {
  strip,
  bus,
  buttons,
  eButton,
  eAssignment,
  busCount,
  setMeterCount,
  settings,
  initSettings,
  vm,
  stripLimiters,
} from "./context";
import { init_strips } from "./strips";
import { clampBar, convertGainToVolume, convertLimitToVolume, convertVolumeToGain } from "./utils";

let selectedBus: number | null = null;

let vmUpdateInterval: NodeJS.Timeout = {} as NodeJS.Timeout;
let retryTime = 5000;

function init_buttons(strips: OutParam[]) {
  const toggleButtons = parseToggleButtons(settings.busToggles);

  for (const tb of toggleButtons) {
    const tempStrip = strips[tb.Strip];
    for (const b of tb.Buses) {
      const tempButton = new eButton(
        `Strip${tb.Strip} -> ${b.LightState ? "" : "!"}${b.Bus}`,
        {
          name: `Strip${tb.Strip} -> ${b.LightState ? "" : "!"}${b.Bus}`,
          active: tempStrip[b.Bus] == b.LightState,
        }
      );

      tempButton.on("pressed", () => {
        tempButton.active = !tempButton.active;
        vm.setStripParameter(
          b.Bus,
          tb.Strip,
          tempButton.active == b.LightState
        );
      });

      tempButton.update = (data) => {
        tempButton.active = data.strips[tb.Strip][b.Bus] == b.LightState;
      };
      buttons.push(tempButton);
    }
  }

  const restartButton = new ButtonType("RestartVoicemeeter", {
    name: "Restart VoiceMeeter",
    active: true,
  });

  restartButton.on("pressed", () => {
    try {
      vm.sendRawParameterScript("Command.Restart=1");
    } catch (error: any) {
      $MM.showNotification(error);
      log.error(error);
      console.log(error);
      return;
    }
    $MM.showNotification("Restarted VoiceMeeter audio engine");
  });
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
        const oldSelectedBus = selectedBus;
        if (bus[i].assigned) {
          selectedBus = i;
        } else {
          selectedBus = null;
        }
        if (oldSelectedBus !== null && oldSelectedBus != i) {
          vm.setBusParameter("Sel", oldSelectedBus, false);
        }
        vm.setBusParameter("Sel", i, bus[i].assigned);
      });
    }

    // No current use for run button on buses
    // bus[i].on("runPressed", () => {
    //   bus[i].running = !bus[i].running;
    // });

    clearInterval(bus[i].meterInterval);
    bus[i].meterInterval = setInterval(() => {
      const rawlevel = vm.getLevelByID(3, i);
      const averagelevel = ((rawlevel?.r ?? 0) + (rawlevel?.l ?? 0)) / 2;
      const meterlevel = averagelevel / 60;
      const clampedVal = clampBar(meterlevel);
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
      bus[i.id].updated = false;
    });

    if (!anySelected) {
      selectedBus = null;
    }

    data.strips.forEach((i) => {
      if (strip[i.id].customAssignUpdate !== undefined) {
        strip[i.id].customAssignUpdate?.(i);
      } else {
        // No default update for assign
      }

      if (strip[i.id].customMuteUpdate !== undefined) {
        strip[i.id].customMuteUpdate?.(i);
      } else {
        strip[i.id].muted = i.mute;
      }

      if (strip[i.id].customRunUpdate !== undefined) {
        strip[i.id].customRunUpdate?.(i);
      } else {
        strip[i.id].running = i.solo;
      }

      if (!strip[i.id].updated) {
        if (selectedBus !== null) {
          strip[i.id].volume = convertGainToVolume(
            i[`GainLayer[${selectedBus}]` as StripParamName]
          );
        } else {
          const vol = convertGainToVolume(i.gain);
          if (vol != strip[i.id].volume) {
            strip[i.id].volume = vol;
          }
        }
      }
      strip[i.id].updated = false;

      if (settings.stripLimitGroups) {
        if (!stripLimiters[i.id].updated) {
          if (i.Limit !== null) {
            const limit = convertLimitToVolume(i.Limit);
            stripLimiters[i.id].volume = limit;
          } else {
            stripLimiters[i.id].volume = 1.0;
          }
        }
        stripLimiters[i.id].updated = false;
      }
    });

    // include button updates here somehow
    buttons.forEach((b) => {
      b.update(data);
    });
  });
}

function retryConnection() {
  console.log(
    `Could not find running instance of voicemeeter, retrying in ${retryTime / 1000
    }s`
  );
  $MM.setSettingsStatus(
    "vmstatus",
    `Failed to connect to VoiceMeeter. Retrying in ${retryTime / 1000}s`
  );
  setTimeout(() => {
    initVoicemeeterPlugin();
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

    const vminfo = vm.getVoiceMeeterInfo();
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
      }, 50);
    });
  } catch (err) {
    console.log(err);
    if (err instanceof VoiceMeeterLoginError && err.returnValue == 1) {
      retryConnection();
      return;
    }
    $MM.setSettingsStatus(
      "vmstatus",
      "Failed to initialize. Likely could not find voicemeeter installation."
    );
    $MM.showNotification("Voicemeeter Plugin failed to initialize.");
    log.error(err);
    return;
  }

  $MM.setSettingsStatus("vmstatus", "Connected");
}

async function initVM() {
  if (!vm.isInitialized && !vm.isConnected) {
    console.log("Attempting connection");
    await vm
      .init()
      .catch((error: any) => {
        $MM.setSettingsStatus(
          "vmstatus",
          "Failed to initialize. Likely could not find voicemeeter installation."
        );
        $MM.showNotification("VoiceMeeter Plugin failed to initialize.");
        log.error(error);
        console.log(error);
      })
      .then(() => {
        $MM.setSettingsStatus("vmstatus", "Initialized");

        connectVM();
      });
  } else if (vm.isInitialized && !vm.isConnected) {
    console.log("already initialized");
    connectVM();
  }
}

$MM.onClose(async () => {
  if (vm.isInitialized && vm.isConnected) {
    vm.logout();
  }
});

export async function initVoicemeeterPlugin(): Promise<void> {
  try {
    initSettings();
    await initVM();
  } catch (error) {
    log.error(error);
    $MM.setSettingsStatus(
      "vmstatus",
      "Unexpected error in Voicemeeter plugin initialization"
    );
    $MM.showNotification(
      "Unexpected error in Voicemeeter plugin initialization"
    );
  }
}

$MM.onSettingsButtonPress("runbutton", initVoicemeeterPlugin);

initVoicemeeterPlugin();
