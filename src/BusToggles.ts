import {
  VoiceMeeter,
  OutParam,
  VoiceMeeterType,
  InterfaceType,
  OutParamData,
  VoiceMeeterLoginError,
  StripParamName,
} from "ts-easy-voicemeeter-remote";

interface BusToggle {
  Strip: number;
  Busses: BusOptions[];
}

interface BusOptions {
  LightState: boolean;
  Bus: StripParamName;
}

export function parseToggleButtons(rawText: string): BusToggle[] {
  const textOptions = rawText.split(";");

  const busToggles: BusToggle[] = [];
  for (const line of textOptions) {
    console.log(line);
    const parts = line.split(":");
    if (parts.length != 2) {
      continue;
    }

    const stripInfo = parts[0].match(/^strip(\d)/i);

    if (!stripInfo) {
      continue;
    }
    const stripNumber = parseInt(stripInfo[1]);

    const busses = parts[1].split(",");

    const bo: BusOptions[] = [];
    for (let bus of busses) {
      let lightState = true;
      if (/^!/.test(bus)) {
        lightState = false;
        bus = bus.substring(1);
      }

      bo.push({
        LightState: lightState,
        Bus: bus as StripParamName,
      });
    }

    const bt: BusToggle = {
      Strip: stripNumber,
      Busses: bo,
    };

    busToggles.push(bt);
  }

  console.log(busToggles);

  return busToggles;
}
