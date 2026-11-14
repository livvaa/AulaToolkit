## Release Highlights

- **Music rhythm and GIFs on the keys (S75 Pro):** the keys can follow whatever is playing on the PC, with the same 12 colour schemes as the official driver, or play a picture or GIF from your library. Needs the USB cable.
- **Lights off with the monitor:** the S75 Pro's keys and side bar turn off when the display goes to sleep and come back when it wakes up.
- **New battery statistics:** the old numbers could be way off (my mouse showed 179 % a day). Estimates now go by when the level actually changes and come with a range. The SC900 Pro's two batteries are tracked separately, and there's a reminder at 80 % while charging.
- **Bluetooth:** devices on Bluetooth now show up as connected, with the battery level Windows reports.

## Release Notes

### **New Features**
- Added **music rhythm** on the keys, or a keyboard effect of your choice while music or video plays (Lighting tab).
- Added **animations on the keys** from a picture or GIF in your library (Lighting tab).
- Added an option to turn off the keyboard lighting while the display is off (Configuration tab, on by default).
- Added a **picture library** to the Screen tab. Drag the preview to choose the visible part.
- Added **Ctrl + Alt + Shift + A** to restart AULA Toolkit when something gets stuck. Can be turned off in Settings → General.
- Added a **battery care** reminder at 80 % while charging, as a Windows notification and on the on-screen display.
- Added tracking for the SC900 Pro's **swappable batteries** (Performance tab). Each battery keeps its own stats.
- Added Bluetooth connection status and battery level for the S75 Pro and SC900 Pro.

### **Improvements**
- Reworked the battery card: level, time per 1 % in use, daily drain, time left, full charge time, health and cycles. Figures show up with a range once there is enough data.
- On the USB cable the keyboard now shows an estimated level, then 99+.
- Long GIFs are fitted to the screen's 141 frames without changing their speed.
- Screen uploads show their progress, also on the on-screen display.
- The keyboard clock is synced every time the keyboard connects.
- "Disable official AULA software" now keeps the official apps from starting at all. Windows asks once for administrator approval, and uninstalling AULA Toolkit gives them back.
- The live keyboard view pauses while the official AULA driver is running, so its lighting doesn't end up in your profile.
- The warning about running AULA software moved to the bottom of the window.

### **Bug Fixes**
- Fixed an issue where the official driver's Music Rhythm was read as a knob change and overwrote the profile's effect.
- Fixed devices not reconnecting after switching between the USB cable and the receiver.
- Fixed the log filling up with errors while a device was being unplugged.

### **Localization**
- New strings in all 10 languages.
- Added a Russian README (machine translated, corrections welcome).

## Download

| File | |
|---|---|
| `AULA-Toolkit-Setup-*.exe` | Installer with automatic updates (recommended) |
| `AULA-Toolkit-*-portable.exe` | Portable, no installation, no automatic updates |

## Known Issues

- Windows SmartScreen may show a warning because the app is not code-signed. Choose **More info → Run anyway**.
- Music rhythm and animations on the keys need the USB cable. On the 2.4 GHz receiver the music setting uses a keyboard effect instead.
- Over Bluetooth only the connection and battery level are shown, settings can't be changed there (same as the official software).
- The AULA F75 and SC900 versions other than the Pro have not been tested on hardware yet.
- Close the official AULA software while using AULA Toolkit.

Problems or ideas? [Open an issue](https://github.com/livvaa/AulaToolkit/issues) or join the [Discord server](https://discord.gg/u9FbaJGtCe).
