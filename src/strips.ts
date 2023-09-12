import { OutParam, StripParamName } from "ts-easy-voicemeeter-remote";
import { eAssignment, strip, stripCount, vm, settings } from "./context";
import { clampBar, convertVolumeToGain } from "./utils";

export function init_strips(strips: OutParam[]): void {
  const customAssignOptions = parseCustomStrip(settings.customStripAssign);
  const customMuteOptions = parseCustomStrip(settings.customStripMute);
  const customRunOptions = parseCustomStrip(settings.customStripRun);

  for (let i = 0; i < stripCount; i++) {
    strip[i] = new eAssignment(`Strip ${i}`, {
      name: `Strip ${i}: ${strips[i].name}`,
      throttle: 100,
    });

    strip[i].on("volumeChanged", (level: number) => {
      strip[i].updated = true;
      strip[i].volume = level;
      vm.setStripParameter("gain", i, convertVolumeToGain(level));
    });

    if (customAssignOptions.busToggles.length != 0) {
      // assign state based on whatever the first option is
      // I don't see a good solution for if it should be on or off
      strip[i].assigned = getStripLightState(customAssignOptions, strips[i]);

      strip[i].on("assignPressed", () => {
        strip[i].assigned = !strip[i].assigned;

        for (const toggle of customAssignOptions.busToggles) {
          vm.setStripParameter(
            toggle.Bus,
            i,
            strip[i].assigned == toggle.invertState
          );
        }
      });

      strip[i].customAssignUpdate = (data: OutParam) => {
        strip[i].assigned = getStripLightState(customAssignOptions, data);
      };
    } else {
      strip[i].assigned = true;
      // No current need for the assign button on strips
      // strip[i].on("assignPressed", () => {
      //   strip[i].assigned = !strip[i].assigned;
      // });
    }

    if (customMuteOptions.busToggles.length != 0) {
      strip[i].muted = getStripLightState(customMuteOptions, strips[i]);

      strip[i].on("mutePressed", () => {
        console.log("mute pressed");

        for (const toggle of customMuteOptions.busToggles) {
          vm.setStripParameter(
            toggle.Bus,
            i,
            !strip[i].muted == toggle.invertState
          );
        }
      });

      strip[i].customMuteUpdate = (data: OutParam) => {
        strip[i].muted = getStripLightState(customMuteOptions, data);
      };
    } else {
      strip[i].on("mutePressed", () => {
        strip[i].muted = !strip[i].muted;
        vm.setStripParameter("mute", i, strip[i].muted);
      });
    }

    if (customRunOptions.busToggles.length != 0) {
      strip[i].running = getStripLightState(customRunOptions, strips[i]);

      strip[i].on("runPressed", () => {
        strip[i].running = !strip[i].running;

        for (const toggle of customRunOptions.busToggles) {
          vm.setStripParameter(
            toggle.Bus,
            i,
            strip[i].running == toggle.invertState
          );
        }
      });

      strip[i].customRunUpdate = (data: OutParam) => {
        strip[i].running = getStripLightState(customRunOptions, data);
      };
    } else {
      strip[i].on("runPressed", () => {
        strip[i].running = !strip[i].running;
        vm.setStripParameter("solo", i, strip[i].running);
      });
    }

    clearInterval(strip[i].meterInterval);
    strip[i].meterInterval = setInterval(() => {
      const rawLevel = vm.getLevelByID(2, i);
      const averageLevel = ((rawLevel?.r ?? 0) + (rawLevel?.l ?? 0)) / 2;
      const meterLevel = averageLevel / 60;
      const clampedVal = clampBar(meterLevel);
      if (clampedVal !== 0) {
        strip[i].meter = clampedVal;
      }
    }, strip[i].throttle);
  }
}

interface customStripInfo {
  busToggles: BusOptions[];
}

interface BusOptions {
  invertState: boolean;
  Bus: StripParamName;
}

function getStripLightState(strip: customStripInfo, data: OutParam): boolean {
  let lightState = true;
  for (const info of strip.busToggles) {
    if (data[info.Bus] != info.invertState) {
      lightState = false;
    }
  }

  return lightState;
}

function parseCustomStrip(rawText: string): customStripInfo {
  if (!rawText) {
    return {
      busToggles: [],
    };
  }

  const parts = rawText.split(",");
  const options: BusOptions[] = [];

  for (let part of parts) {
    // TODO: handle more than just "A1"/"!A1" type options
    let lightState = true;
    if (/^!/.test(part)) {
      lightState = false;
      part = part.substring(1);
    }

    options.push({
      invertState: lightState,
      Bus: part as StripParamName,
    });
  }

  console.log(options);

  return {
    busToggles: options,
  };
}
