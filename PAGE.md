# Voicemeeter

Control Voicemeeter Strips and Buses via midi-mixer. Works with Voicemeeter, Voicemeeter Banana, and Voicemeeter Potato

This allows you to change the Gain, mute, and solo of all Voicemeeter strips and buses.

Solo is set to the "running" button for all strip assignments. The "assign" button is the same as the "sel" button for buses on the Potato version.

## Troubleshooting
If you've previously set up loopMIDI or similar software to pass midi commands through to Voicemeeter check that they are not conflicting with the fader/knob assignments used by the plugin.

This plugin was made with VoiceMeeter Potato version 3.0.2.1 (Banana version 2.0.6.1 and non-named version 1.0.8.1). Lower versions may not work correctly.


Latest releases of this plugin available [on the project's github page](https://github.com/Jaggernaut555/midi-mixer-voicemeeter/releases/latest)

## Advanced Customization

#### Assign/Mute/Run strip customization

The custom strip Assign/Mute/Run settings will change the function of the button to instead toggle one or multiple bus assignments on strips.

example:

Custom Strip Assign:
`A1,!B2`

This will make the assign button on a strip to toggle A1 and B2. The `!` on B2 will invert the toggle. This means pressing the assign button will enable bus A1 and disable bus A2 for the strip. Multiple buses must be separated by a comma (`,`).

The assign button by default is not used by strips so I recommend using that one first for these toggles. To disable a setting delete all text from the custom assignment text box.

#### Custom Bus Toggle Buttons

This will add separate buttons on midi-mixer's button tab for toggling specific strip's bus assignments. These can be used separately from the assign/mute/run customization above.

example:

Custom Bus Toggle Buttons:
`strip0:A1,!B1;strip1:A1`

This will add three buttons. Button 1 will be named `strip0 -> A1` and will toggle bus A1 on only strip 0. Button 2 will be named `strip0 -> !B1` and will toggle bus B1 on strip 0. The `!` will invert the light's on/off state from the enabled/disabled state of the bus assignment. The third button will be named `strip1 -> A1` and will toggle bus A1 on strip 1.

#### Strip Limiter Groups

This adds new groups to assign to faders that will control the Limit setting on individual strips