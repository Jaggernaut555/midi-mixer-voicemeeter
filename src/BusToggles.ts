import { StripParamName } from "ts-easy-voicemeeter-remote";

interface BusToggle {
  Strip: number;
  Buses: BusOptions[];
}

interface BusOptions {
  LightState: boolean;
  Bus: StripParamName;
}

export function parseToggleButtons(rawText: string): BusToggle[] {
  const textOptions = rawText.split(";");

  const busToggles: BusToggle[] = [];
  for (const line of textOptions) {
    const parts = line.split(":");
    if (parts.length != 2) {
      continue;
    }

    const stripInfo = parts[0].match(/^strip(\d)/i);

    if (!stripInfo) {
      continue;
    }
    const stripNumber = parseInt(stripInfo[1]);

    const buses = parts[1].split(",");

    const bo: BusOptions[] = [];
    for (let bus of buses) {
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
      Buses: bo,
    };

    busToggles.push(bt);
  }

  return busToggles;
}
